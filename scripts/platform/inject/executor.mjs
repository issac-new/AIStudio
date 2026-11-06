// 注入 Executor（P1 注入核心，平台重写 Task 4）。
// 事务化执行 planner 产出的计划项：
//   1. runtime 部署预检先行——partial/failed 即中止，零写入、零 manifest（「部署
//      预检 partial 即中止」）；
//   2. 每补丁 apply 前 journal 备份目标文件（fsync）→ git apply --check 预检 →
//      应用 → 登记实际落盘 addedFiles；
//   3. lane（目标树）独立事务：某补丁失败即回滚该 lane 本次会话已改文件（字节
//      恢复+新增删除），已应用项改记 rolled-back，失败后同 lane 后续一律
//      skipped/blocked-by-failed；他 lane 不受牵连继续（既有树间独立语义）；
//   4. 会话结束 runtime 部署 apply：partial/failed 降级整体 status，绝不 complete；
//   5. manifest 原子写入（预检中止时不写）。
//
// 复用面：目标树 git 操作经 inject.mjs 的 treeGitCtx/applyPatchAtRoot（repo/vendor
// 双模单一事实源）；win32 容差旗标同源。
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'child_process';
import { resolve } from 'node:path';
import { treeGitCtx, applyPatchAtRoot, win32WsFlag } from '../../inject.mjs';
import { applyPlanToManifest, emptyManifest, isV2Manifest, writeManifestAtomic } from './manifest.mjs';
import { openJournal } from './journal.mjs';

const stderrHead = (e, lines = 4) =>
  String(e.stderr || e.message || '').trim().split('\n').slice(0, lines).join('\n  ');

/** git apply --check 预检（不落盘）。失败抛原始 execSync 错误。 */
function checkPatchAtRoot(patchPath, treeRoot) {
  const c = treeGitCtx(treeRoot);
  execSync(`git apply --check --whitespace=nowarn${win32WsFlag()}${c.dirFlag} "${patchPath}"`,
    { cwd: c.gitCwd, stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * 执行一次注入会话。
 * @param plan {{baseline:{upstreamRoot,treeOids}, items:PlanItem[]}} 本次要应用的计划项
 *   （全量重放=完整 plan；增量=tail 项）
 * @param opts {
 *   roots: {'hermes-studio','hermes-agent',zcode} 绝对根,
 *   patchDirs: {hermes, zcode},
 *   stateOut: 状态目录（manifest + journal 落此树）,
 *   baseManifest?: v2 既有 manifest（增量会话的前缀；null=全量）,
 *   applyRuntimeDeploy?: (phase:'precheck'|'apply') => {status:'complete'|'partial'|'failed', detail?},
 *   absentTreeCheck?: (target) => boolean  目标树缺席判定（standalone 语义；缺省=!existsSync(root)）,
 *   log?: (msg) => void,
 * }
 * @returns {manifest, results[], wroteManifest, runtimeDeploy}
 *   预检中止：manifest=null、wroteManifest=false、results 全 skipped/runtime-deploy-precheck:*。
 */
export function runInjection(plan, opts) {
  const log = opts.log ?? (() => {});
  const items = plan?.items ?? [];
  const results = [];
  const runtimeDeploy = {};

  // ── 1. runtime 部署预检：partial/failed 即中止（零写入、零 manifest）──
  if (opts.applyRuntimeDeploy) {
    const pre = opts.applyRuntimeDeploy('precheck');
    runtimeDeploy.precheck = pre.status;
    if (pre.status !== 'complete') {
      log(`[inject] 部署预检未通过（${pre.status}${pre.detail ? `：${pre.detail}` : ''}），注入中止——未应用任何补丁、未写 manifest`);
      for (const item of items) {
        results.push({ name: item.name, target: item.target, status: 'skipped', reason: `runtime-deploy-precheck:${pre.status}` });
      }
      return { manifest: null, results, wroteManifest: false, runtimeDeploy };
    }
  }

  // ── 2. 会话基座：journal 重置 + manifest 起点校验 ──
  const journal = openJournal(opts.stateOut);
  journal.reset();
  let manifest;
  if (opts.baseManifest) {
    if (!isV2Manifest(opts.baseManifest)) {
      throw new Error('runInjection: baseManifest 必须是 v2 manifest（v1 不可增量收养）');
    }
    manifest = { ...opts.baseManifest, patches: [...opts.baseManifest.patches] };
  } else {
    manifest = emptyManifest(plan.baseline);
  }
  const baseCount = manifest.patches.length;
  const absentTreeCheck = opts.absentTreeCheck
    ?? ((target) => !existsSync(opts.roots[target]));
  const laneFailed = {}; // target -> 失败补丁名
  const absentSkipCount = {}; // target -> 次数（standalone 汇总日志用）

  const markLaneRolledBack = (lane, failedName) => {
    for (let i = baseCount; i < manifest.patches.length; i++) {
      if (manifest.patches[i].target === lane && manifest.patches[i].status === 'applied') {
        manifest.patches[i] = { ...manifest.patches[i], status: 'rolled-back', reason: `after:${failedName}` };
      }
    }
  };

  for (const item of items) {
    const lane = item.target;
    // 同 lane 首败后：一律 skipped/blocked-by-failed（不重试、不换 lane 语义）
    if (laneFailed[lane]) {
      manifest = applyPlanToManifest(manifest, item, { status: 'skipped', reason: `blocked-by-failed:${laneFailed[lane]}` });
      results.push({ name: item.name, target: lane, status: 'skipped', reason: `blocked-by-failed:${laneFailed[lane]}` });
      log(`[inject] SKIP (blocked-by-failed:${laneFailed[lane]}): ${item.name}`);
      continue;
    }
    // 目标树缺席：standalone/partial checkout 语义保留（跳过不硬死）
    if (lane !== 'hermes-studio' && absentTreeCheck(lane)) {
      manifest = applyPlanToManifest(manifest, item, { status: 'skipped', reason: 'absent-tree' });
      results.push({ name: item.name, target: lane, status: 'skipped', reason: 'absent-tree' });
      absentSkipCount[lane] = (absentSkipCount[lane] ?? 0) + 1;
      log(`[inject] SKIP (${lane} tree absent, standalone/partial checkout): ${item.name}`);
      continue;
    }
    const root = opts.roots[lane];
    const patchPath = resolve(opts.patchDirs[item.channel], item.name);
    let patchText;
    try {
      patchText = readFileSync(patchPath, 'utf8');
    } catch {
      // 防御分支（planner 对缺失补丁已先行抛错）；同样走 lane 回滚保事务一致
      journal.rollbackLane(root);
      markLaneRolledBack(lane, item.name);
      manifest = applyPlanToManifest(manifest, item, { status: 'failed', reason: 'patch-file-missing' });
      results.push({ name: item.name, target: lane, status: 'failed', reason: 'patch-file-missing' });
      laneFailed[lane] = item.name;
      log(`[inject] FAILED: patch 文件不存在: ${item.name}`);
      continue;
    }
    if (lane === 'hermes-studio' && absentTreeCheck(lane)) {
      // studio 是必需树：缺席即失败（不进入 absent-tree 容错）
      manifest = applyPlanToManifest(manifest, item, { status: 'failed', reason: 'target-tree-missing' });
      results.push({ name: item.name, target: lane, status: 'failed', reason: 'target-tree-missing' });
      laneFailed[lane] = item.name;
      log(`[inject] FAILED: 必需目标树缺席: ${lane}`);
      continue;
    }
    // 备份 → 预检 → 应用 → 登记
    try {
      const point = journal.checkpoint(item.name, root, patchText);
      try {
        checkPatchAtRoot(patchPath, root);
        applyPatchAtRoot(patchPath, root);
      } catch (e) {
        // 本补丁未落盘（git apply 原子）；回滚本 lane 本次会话已改文件
        // （rollbackLane 按绝对根匹配——checkpoint 登记的是绝对根）
        const rb = journal.rollbackLane(root);
        markLaneRolledBack(lane, item.name);
        manifest = applyPlanToManifest(manifest, item, { status: 'failed', reason: stderrHead(e) });
        results.push({ name: item.name, target: lane, status: 'failed', reason: stderrHead(e) });
        laneFailed[lane] = item.name;
        log(`[inject] FAILED to apply patch: ${item.name}（lane ${lane} 已回滚本次会话变更：restore ${rb.restored.length} / remove ${rb.removed.length}）`);
        log(`  ${stderrHead(e)}`);
        continue;
      }
      // 实际落盘的新增文件清单（字节事实，不是声明）
      const addedFiles = (item.addedFiles ?? []).filter((f) => existsSync(resolve(root, f)));
      journal.recordAdded(point, addedFiles);
      journal.commit(point);
      manifest = applyPlanToManifest(manifest, item, { status: 'applied', addedFiles });
      results.push({ name: item.name, target: lane, status: 'applied', reason: null });
      log(`[inject] applied patch: ${item.name} (to ${lane})`);
    } catch (e) {
      // checkpoint 抛错（路径越界等）：视同本补丁失败处理
      manifest = applyPlanToManifest(manifest, item, { status: 'failed', reason: e.message });
      results.push({ name: item.name, target: lane, status: 'failed', reason: e.message });
      laneFailed[lane] = item.name;
      log(`[inject] FAILED (journal): ${item.name}: ${e.message}`);
    }
  }
  for (const [lane, count] of Object.entries(absentSkipCount)) {
    log(`[inject] 共 ${count} 个补丁因 ${lane} 树缺席跳过（standalone/partial checkout 形态；全仓检出无此现象）`);
  }

  // ── 3. runtime 部署 apply：partial/failed 降级整体 status ──
  if (opts.applyRuntimeDeploy) {
    const post = opts.applyRuntimeDeploy('apply');
    runtimeDeploy.apply = post.status;
    manifest = { ...manifest, runtimeDeploy };
    if (post.status === 'failed') {
      manifest = { ...manifest, status: 'failed' };
    } else if (post.status === 'partial' && manifest.status !== 'failed') {
      manifest = { ...manifest, status: 'partial' };
    }
  } else {
    manifest = { ...manifest, runtimeDeploy };
  }

  // ── 4. manifest 原子写 + journal 收尾 ──
  writeManifestAtomic(resolve(opts.stateOut, '.overlay-injected.json'), manifest);
  if (manifest.status !== 'failed') journal.prune();
  return { manifest, results, wroteManifest: true, runtimeDeploy };
}
