// overlay/scripts/ensure-injected.mjs
// 幂等确保 upstream 已 inject：dev/build 前置钩子。
//
// P1 平台重写 Task 5 起读 manifest v2 + planIncrement（严格增量：只允许已验证
// 精确前缀后的尾部追加；v1/v1-manifest/last-failed/基线变/根变等一律拒绝并指
// 引 clean 全量重放）。两条假绿路径已删除（P0 审查实锤缺陷）：
//   - 「cockpit 路由存在即放行部分失败」：inject 失败就是失败，exit 1；
//   - 「脏树且无清单 exit 0」：状态不可验证即非零退出，不自动清理也不装作成功。
// v1 manifest：打印一次性迁移指引 exit 3，不自动收养（v1 只有名字数组，无逐项
// 状态，不可证明「已成功」）。
// 差量补套保留（2026-09-22 根治语义）：series 领先 manifest 的尾部增量打印清单
// 后经 inject 主链单一写入路径自动补套（runInjection 事务化应用 + manifest 原子
// 更新），不再裸 git apply + 手工登记。
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import {
  applyPatchAtRoot, treeStatus, treeGitCtx, ensureNodeModulesSymlink,
  buildOverlayPlan, captureTreeOids, overlayRoots, statePaths, patchPaths,
  resolveUpstreamRoots,
} from './inject.mjs';
import { addedFilesFromPatch, missingFiles } from './lib/zcode-patch-manifest.mjs';
import { installHooks } from './install-hooks.mjs';
import { readManifestFile, isV2Manifest, planIncrement, IncrementRefusedError, isAcceptablePartial } from './platform/inject/manifest.mjs';

const overlayRoot = resolve(import.meta.dirname, '..');
// 上游根与 inject.mjs 同源（cognition P0-3 契约）：不内联 vendor 判定。
const _roots = resolveUpstreamRoots(overlayRoot);
// L2 钩子启用（2026-10-30）：core.hooksPath 不随 clone 复制，必须在任一 npm 入口被动补上，
// 否则入库的判定库不会被 git 调用——「文件在」不等于「钩子生效」。
try {
  const hookState = installHooks(overlayRoot);
  if (hookState.changed) console.log(`[ensure-injected] ${hookState.note}`);
} catch (e) {
  console.warn(`[ensure-injected] 钩子安装跳过：${e instanceof Error ? e.message : String(e)}`);
}

const upstream = overlayRoots.hermesStudio;
const zcodeRoot = overlayRoots.zcode;
const manifestPath = statePaths.manifest;
const zcodeSeriesFile = patchPaths.zcodeSeriesFile;

// 脏树=已注入只是整体判断；补丁新增的文件可能被外部删除而树仍是脏的。
// 逐个核对声明的新增文件，缺哪个就按文件粒度从原补丁补放（git apply --include）。
// 2026-10-19 实录：node-backend.js 被删后树仍脏，旧自愈直接 return，CUA 测试长期红。
function healMissingZcodeFiles(series) {
  const zcodePatchDir = resolve(zcodeSeriesFile, '..');
  for (const p of series) {
    const patchPath = resolve(zcodePatchDir, p);
    if (!existsSync(patchPath)) continue;
    let declared;
    try {
      declared = addedFilesFromPatch(readFileSync(patchPath, 'utf8'));
    } catch {
      continue;
    }
    const missing = missingFiles(declared, (rel) => existsSync(resolve(zcodeRoot, rel)));
    if (missing.length === 0) continue;
    console.warn(`[ensure-injected] zcode 补丁 ${p} 声明的 ${missing.length} 个新增文件缺失，按文件补放：`);
    for (const rel of missing) {
      console.warn(`  ${rel}`);
      try {
        applyPatchAtRoot(patchPath, zcodeRoot, ` --include="${rel}"`);
        console.log(`[ensure-injected] restored ${rel}`);
      } catch (e) {
        console.error(`[ensure-injected] FAILED: 补放 ${rel} 失败（${p}）`);
        console.error(`  ${String(e.stderr || e.message).trim().split('\n').slice(0, 4).join('\n  ')}`);
        process.exit(1);
      }
    }
  }
}

// ── zcode patch 漂移自愈（2026-10-03 全功能回归轮 T1 根治）──
// zcode-patches/series 由 inject 打进 upstream/zcode，但旧逻辑只对账 hermes series：
// zcode 树被 reset/re-pull 后补丁静默丢失。判定信号：series 非空且 zcode status 干净
// （干净树=补丁必不在）→ 按 series 重放；树脏则视为已注入，仍核对新增文件齐全。
// zcode 为可选树：目录不存在/非 git 仓时跳过；apply 失败响亮报错并 exit(1)。
function healZcodePatches() {
  if (!existsSync(zcodeRoot) || !existsSync(zcodeSeriesFile)) return;
  let series;
  try {
    series = readFileSync(zcodeSeriesFile, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return;
  }
  if (series.length === 0) return;
  const zcCtx = treeGitCtx(zcodeRoot);
  const zcodeInRepo = (zcCtx.relPrefix && existsSync(resolve(zcCtx.gitCwd, '.git'))) || existsSync(resolve(zcodeRoot, '.git'));
  // 无 git 上下文（源码包解包树=无 .git 且不在任何仓内）＝状态不可判：跳过自愈
  //（补丁是否在位由 inject 当时负责），不猜。
  if (!zcodeInRepo) {
    console.warn('[ensure-injected] zcode 树不可读(非 git 仓且不在仓内 vendor/),跳过 zcode 补丁自愈。');
    return;
  }
  const status = treeStatus(zcodeRoot).trim();
  if (status) {
    // 脏树=已注入态；仍核对新增文件是否齐全（外部删除不会让树变干净）
    healMissingZcodeFiles(series);
    return;
  }
  console.warn(`[ensure-injected] zcode 树干净但 series 有 ${series.length} 条补丁,重放自愈:`);
  const zcodePatchDir = resolve(zcodeSeriesFile, '..');
  for (const p of series) {
    const patchPath = resolve(zcodePatchDir, p);
    if (!existsSync(patchPath)) {
      console.error(`[ensure-injected] FAILED: zcode patch 文件不存在: ${p}`);
      process.exit(1);
    }
    try {
      applyPatchAtRoot(patchPath, zcodeRoot);
      console.log(`[ensure-injected] applied zcode patch: ${p}`);
    } catch (e) {
      console.error(`[ensure-injected] FAILED: zcode patch 补套失败: ${p}`);
      console.error(`  ${String(e.stderr || e.message).trim().split('\n').slice(0, 4).join('\n  ')}`);
      process.exit(1);
    }
  }
}

// zcode 补丁漂移自愈先于主 inject 判定：zcode 是独立树，与 hermes-studio 的 inject
// 标志无关；早退路径同样需要它（2026-10-19：脏树缺文件被早退跳过）。
healZcodePatches();
// node_modules 软链幂等补链（AIStudio 单仓轮）：全新克隆按 README 顺序先 inject 后
// npm install——inject 时 node_modules 尚不存在、软链跳过，装完没人补链则 serve/
// dev 从 custom/server 解析 koa 全崩（/tmp 干净克隆 2026-10-24 实证）。
ensureNodeModulesSymlink();

// ── 主判定：manifest v2 + 严格增量 ──
let manifest = null;
try {
  manifest = readManifestFile(manifestPath);
} catch (e) {
  console.error(`[ensure-injected] ${e.message}`);
  process.exit(1);
}

if (manifest && !isV2Manifest(manifest)) {
  // v1：一次性迁移指引，不自动收养（exit 3——与 0/1/2 区分的专用迁移码）
  console.error('[ensure-injected] 检测到 v1 注入清单（仅补丁名数组，无逐项状态/sha/基线，不可验证）。');
  console.error('[ensure-injected] 迁移指引：npm run clean && npm run inject（clean 按 v1 反放并删除旧清单，inject 重建 manifest v2）。');
  process.exit(3);
}

if (manifest) {
  // v2：失败态清单不得作为成功输入
  if (manifest.status === 'failed' || manifest.patches.some((p) => p.status === 'failed')) {
    console.error('[ensure-injected] 上次注入存在 failed 项（last-failed）——失败清单不可作为成功输入。');
    console.error('[ensure-injected] 请 npm run clean && npm run inject 全量重放。');
    process.exit(1);
  }
  const plan = {
    baseline: { upstreamRoot: overlayRoots.upstream, treeOids: captureTreeOids() },
    items: buildOverlayPlan(),
  };
  let inc;
  try {
    inc = planIncrement(manifest, plan);
  } catch (e) {
    if (e instanceof IncrementRefusedError) {
      console.error(`[ensure-injected] ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
  if (inc.kind === 'noop') {
    if (manifest.status === 'partial' && !isAcceptablePartial(manifest)) {
      console.error('[ensure-injected] 注入态为不可接受的 partial（非缺树跳过或部署未收口），不得视为成功。');
      console.error('[ensure-injected] 请核对 .overlay-injected.json 后 npm run clean && npm run inject 全量重放。');
      process.exit(1);
    }
    console.log(`[ensure-injected] 注入态与 series 前缀精确一致（v2 noop，status=${manifest.status}），无需动作。`);
    process.exit(0);
  }
  // series 领先 manifest（尾部增量）：打印清单并经 inject 主链自动补套——
  // 补套走 runInjection 事务化应用，成功后 manifest 由主链原子更新，不再手工登记。
  console.warn(`[ensure-injected] series 领先 manifest ${inc.items.length} 条,自动补套:`);
  for (const it of inc.items) console.warn(`  ${it.name}（→ ${it.target}）`);
  const r = spawnSync('node', ['scripts/inject.mjs'], { cwd: overlayRoot, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

// manifest 缺席：未注入判定。
const dirty = treeStatus(upstream).trim();
if (dirty) {
  // 脏树且无清单=状态不可验证：不再 exit 0 假绿（P0 审查实锤路径），也不自动
  // 清理（避免丢失工作）——显式失败并给出对症指引。
  console.error('[ensure-injected] upstream 工作树不干净且无注入清单——状态不可验证，不自动处理。');
  console.error('[ensure-injected] 若为残留注入态：npm run clean && npm run inject；若为本地改动：先提交或暂存再重试。');
  console.error(dirty);
  process.exit(1);
}

console.log('[ensure-injected] 未检测到注入清单,执行 inject...');
const r = spawnSync('node', ['scripts/inject.mjs'], { cwd: overlayRoot, stdio: 'inherit' });
// inject 失败即失败：部分成功不再被「cockpit 路由已注入」放行（假绿路径已删除）。
process.exit(r.status ?? 1);
