// B1 双树漂移根治：agent 运行时文件同步（manifest 驱动、幂等、默认 dry-run）。
// 用法: node scripts/deploy-agent-runtime.mjs [--apply] [--force] [--runtime <dir>]
//   默认 dry-run（只报告差异不写入）；--apply 才真正拷贝。杜绝 A1 类"修复不达运行时"。
//   安装树目标已存在且内容不同时，默认**保留目标并报告**（不覆盖）——运行时安装树可能带着
//   比模板更新的本地修复（2026-10-28 实录：宿主 kanban guardrail 层被 inject 静默剥离）。
//   确需以模板覆盖时显式加 --force：先备份为 <name>.bak.<timestamp> 再覆盖
//   （计入冲突并在输出列出，可回滚；同目标备份只留最近 3 份、超限删最旧（H8：只增不减
//   会长期堆积）；与 aipay-agent-sync.sh 的安装树安全边界对齐）。
//   模板与宿主不一致时的正解是把宿主已知良好态回灌 runtime/（先例 3edd5e32e），不是强推。
// source=manifest.root（overlay/runtime，本检出运行时镜像）→ target=~/.hermes/hermes-agent（运行时安装树）。
//
// 状态化输出（P1 平台重写 Task 5）：kept/conflict 必须产出 partial 而非成功——
// 末行 `RESULT status=complete|partial|failed` 是机器可读状态面（inject 部署预检/
// 后置同步按退出码消费：0=complete、2=partial、1=failed）。RUNTIME_DEPLOY_MANIFEST
// 可覆盖清单路径（测试隔离面；绝对 manifest.root 直接采用）。
import { readFileSync, existsSync, copyFileSync, mkdirSync, lstatSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join, basename, sep } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { deriveAgentPatchTouchedFiles } from './platform/deploy/patch-touched.mjs';

// 路径解析（Z5）：worktree 检出（.claude/worktrees/<x>）与正常检出（ncwk/overlay）层级
// 不同，固定层数回溯必差一层——旧写法 ncwkRoot=overlayRoot/.. 在 worktree 指向
// .claude/worktrees，manifest.root（overlay/runtime）解析到不存在的路径，清单条条
// "源缺失"、运行时静默不更新（本脚本立意恰是"修复要达运行时"）。改法：overlay 根从
// 脚本自身位置向上认 name=hermes-overlay 的 package.json（worktree 根即 overlay 检出
// 根）；源根优先把 manifest.root 的 overlay/ 首段落到本检出根（worktree 下按 ncwk 根
// 解析会落到共享主树 overlay/runtime，漏掉本检出在途改动），回落 ncwk 根相对解析
// （ncwk 根 real 向上锚定首个含真实 upstream/ 的目录，跳过 .claude/worktrees/upstream
// 这类软链）；都不存在即 fail-fast 明示已试路径。
const findUp = (from, hit) => {
  for (let d = resolve(from); ; d = dirname(d)) {
    if (hit(d)) return d;
    if (dirname(d) === d) return null;
  }
};
const overlayRoot = findUp(import.meta.dirname, (d) => {
  try {
    // AIStudio 单仓整合轮（2026-10-24）：仓名 hermes-overlay → aistudio，双名兼容
    //（升级过渡期旧检出仍是 hermes-overlay）。
    const name = JSON.parse(readFileSync(resolve(d, 'package.json'), 'utf8')).name;
    return name === 'aistudio' || name === 'hermes-overlay';
  } catch { return false; }
});
if (!overlayRoot) {
  console.error(`[deploy-agent-runtime] fail-fast：从 ${import.meta.dirname} 向上找不到 name=aistudio|hermes-overlay 的 package.json，无法定 overlay 根`);
  process.exit(1);
}
const ncwkRoot = findUp(overlayRoot, (d) => {
  try { return lstatSync(resolve(d, 'upstream')).isDirectory(); } catch { return false; }
});
const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');
const runtimeArg = process.argv.indexOf('--runtime');
// 清单路径：RUNTIME_DEPLOY_MANIFEST 覆盖（测试隔离/多 profile 面），缺省仓内正本
const manifestFile = process.env.RUNTIME_DEPLOY_MANIFEST?.trim()
  || resolve(overlayRoot, 'runtime-manifest.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const srcCandidates = [...new Set([
  resolve(overlayRoot, manifest.root.replace(/^overlay\//, '')),
  ...(ncwkRoot ? [resolve(ncwkRoot, manifest.root)] : []),
])];
const srcRoot = srcCandidates.find((p) => existsSync(p));
if (!srcRoot) {
  console.error(`[deploy-agent-runtime] fail-fast：manifest.root=${manifest.root} 的源目录均不存在，已试：\n  ${srcCandidates.join('\n  ')}`);
  process.exit(1);
}
const runtimeEnvTarget = process.env.RUNTIME_DEPLOY_TARGET?.trim();
let dstRoot = runtimeEnvTarget || (runtimeArg > 0 ? process.argv[runtimeArg + 1] : join(homedir(), manifest.target.replace(/^~/, '').replace(/^\//, '')));

// ── worktree 隔离（2026-11-12 设计复盘 P0）：linked worktree 默认写检出内影子目录 ──
// 背景：.claude/worktrees/<x> 里跑 inject/npm test 时，本脚本会把该检出 runtime/ 与
// vendor 注入态同步到 ~/.hermes/hermes-agent——那是所有会话共享的宿主树。并行会话下，
// 一个 worktree 的在途 runtime 改动会静默改掉别的会话正在用的运行时。
// 策略：linked worktree 且未显式指定目标时，默认把写入重定向到检出内
// `.runtime-deploy-shadow/`（不触共享安装树；inject 预检照常以影子为基准，
// 不会 partial 死锁）；确需把本次改动部署到宿主时显式 RUNTIME_DEPLOY_ALLOW_WORKTREE=1；
// 演练/测试可用 --runtime <dir> 或 RUNTIME_DEPLOY_TARGET 指定任意隔离目标。
const _gitDirPair = (root) => {
  const out = (args) => {
    try {
      return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch { return ''; }
  };
  const gd = out(['rev-parse', '--git-dir']);
  const gcd = out(['rev-parse', '--git-common-dir']);
  return { gd, gcd };
};
const _p = _gitDirPair(overlayRoot);
// RUNTIME_DEPLOY_LINKED_WORKTREE=1|0 仅为测试注入面（CI 在普通克隆上跑，无法自然构造
// linked worktree 判定）；生产路径不读该变量。
const _linkedOverride = process.env.RUNTIME_DEPLOY_LINKED_WORKTREE;
const linkedWorktree = _linkedOverride === '1' || _linkedOverride === '0'
  ? _linkedOverride === '1'
  : Boolean(_p.gd && _p.gcd && resolve(overlayRoot, _p.gd) !== resolve(overlayRoot, _p.gcd));
const explicitTarget = Boolean(runtimeEnvTarget) || runtimeArg > 0
  // RUNTIME_DEPLOY_MANIFEST 是既有「测试隔离面」（清单自带 root/target），如测试已把
  // HOME 指向临时目录，这里不再叠加影子重定向；真实宿主路径（默认清单）才走影子。
  || Boolean(process.env.RUNTIME_DEPLOY_MANIFEST?.trim());
const allowHostWrite = process.env.RUNTIME_DEPLOY_ALLOW_WORKTREE === '1';
const shadowMode = linkedWorktree && !explicitTarget && !allowHostWrite;
if (shadowMode) {
  dstRoot = join(overlayRoot, '.runtime-deploy-shadow');
  console.warn('[deploy-agent-runtime] linked worktree：宿主写入已重定向到检出内影子目录 .runtime-deploy-shadow（不触共享安装树）；确需部署到宿主设 RUNTIME_DEPLOY_ALLOW_WORKTREE=1');
}
const dstInsideCheckout = resolve(dstRoot) === resolve(overlayRoot) || resolve(dstRoot).startsWith(resolve(overlayRoot) + sep);
if (process.argv.includes('--explain-worktree')) {
  console.log(JSON.stringify({ overlayRoot, dstRoot, linkedWorktree, shadowMode, dstInsideCheckout, runtimeArgExplicit: runtimeArg > 0, envTargetExplicit: Boolean(runtimeEnvTarget), allowHostWriteEnv: allowHostWrite }));
  process.exit(0);
}

let same = 0, copied = 0, missing = 0, conflict = 0, kept = 0, copyErr = 0;
const conflicts = [];            // 目标与源不同、按 --force 覆盖前先备份的清单（P6 可回滚+告警）
const keptList = [];             // 目标与源不同、默认被保留的目标（需人工比对或回灌模板）
const stamp = Date.now();        // 备份时间戳：一次运行共用一个（<name>.bak.<timestamp>）
const KEEP_BACKUPS = 3;          // 同目标 .bak.<stamp> 备份保留份数（H8：只增不减会长期堆积）
const pruneBackups = (target) => { // 超限删最旧；非数字后缀（人工留档）不动
  const prefix = `${basename(target)}.bak.`;
  const dir = dirname(target);
  const old = readdirSync(dir)
    .filter((n) => n.startsWith(prefix))
    .map((n) => ({ n, t: Number(n.slice(prefix.length)) }))
    .filter((b) => Number.isFinite(b.t))
    .sort((a, b) => a.t - b.t);
  for (const b of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) {
    unlinkSync(join(dir, b.n));
    console.log(`  · 备份超 ${KEEP_BACKUPS} 份，删最旧 ${b.n}`);
  }
};
console.log(`[deploy-agent-runtime] ${apply ? 'APPLY' : 'DRY-RUN'}  ${manifest.root} → ${dstRoot}`);

// 补丁触碰面派生（N-1 根治，spec 2026-11-06-runtime-patch-touched-deploy）：默认清单
// 模式下把 series 里 agent 面补丁触碰的文件（源=vendor/hermes-agent 注入态）并入同步
// ——manifest 只登记补丁新增文件，修改类接线（601/470 等）此前从未自动到达宿主。
// 测试隔离面（RUNTIME_DEPLOY_MANIFEST 覆盖）不启用；manifest 可显式 agentPatchSync:false 关断。
let patchTouchedEntries = [];
const manifestDestSet = new Set(manifest.files.map((f) => f.dest));
if (!process.env.RUNTIME_DEPLOY_MANIFEST && manifest.agentPatchSync !== false) {
  const patchesDir = resolve(overlayRoot, 'patches');
  const agentSrc = resolve(overlayRoot, 'vendor/hermes-agent');
  try {
    const derived = deriveAgentPatchTouchedFiles(patchesDir, readFileSync(join(patchesDir, 'series'), 'utf8'));
    patchTouchedEntries = [...derived.files]
      .filter((f) => !manifestDestSet.has(f))       // manifest 已登记的不重复（新增文件面以 manifest 为准）
      .map((f) => ({ source: join(agentSrc, f), dest: f, _touched: true }));
    console.log(`[deploy-agent-runtime] 补丁触碰面 ${derived.files.size} 文件（agent 补丁 ${derived.agentPatches} 枚；删除态 ${derived.deleted.size} 不同步）`);
  } catch (e) {
    console.warn(`[deploy-agent-runtime] 补丁触碰面派生失败（跳过，不阻断清单同步）：${e.message}`);
  }
}

let touchedMissing = 0;        // 触碰面源缺失（本检出未注入等）：跳过并报告，不算 failed
let touchedConverge = 0;       // 触碰面差异待收口（apply 备份覆盖可自动解决）：不触发 partial
// 降级哨兵（N-1 安全语义）：源树非完整注入态（触碰面有源缺失，如未注入的 worktree/
// CI 检出独立跑 --apply）时，收口方向=pristine 覆盖宿主接线=降级事故——跳过整个触碰面
// 并大声警示。inject 链路内（先注入后部署）源恒为完整注入态，缺失数 0，不受影响。
let touchedEntries = patchTouchedEntries;
if (apply && patchTouchedEntries.length > 0) {
  const absent = patchTouchedEntries.filter((e) => !existsSync(e.source)).length;
  if (absent > 0) {
    console.warn(`[deploy-agent-runtime] ⚠ 源树非完整注入态（触碰面 ${absent}/${patchTouchedEntries.length} 源缺失）——跳过触碰面同步（防 pristine 降级宿主接线）；完整链路=npm run inject`);
    touchedEntries = [];
  }
}
for (const f of [...manifest.files, ...touchedEntries]) {
  const s = typeof f.source === 'string' && f.source.startsWith('/')
    ? f.source                                        // 触碰面条目携带绝对源（vendor 注入态）
    : join(srcRoot, f.source);
  const d = join(dstRoot, f.dest);
  if (!existsSync(s)) {
    if (f._touched) { touchedMissing++; continue; }   // 无注入态真值可同步（如未注入检出）——跳过不计 missing
    console.log(`  ! 源缺失: ${f.source}`); missing++; continue;
  }
  const sContent = readFileSync(s);
  if (existsSync(d)) {
    const dContent = readFileSync(d);
    if (Buffer.compare(sContent, dContent) === 0) { same++; continue; }
    if (f._touched) {
      // 触碰面差异=宿主偏离补丁态（源=vendor 注入态=补丁态权威）——apply 备份后
      // 覆盖收口，dry-run 记待收口。不走 manifest.files 的保留语义（kept）：接线漂移
      // 靠本通道自动收口，保留反而会让 inject 部署预检常态性 partial 中止（预检死锁）。
      touchedConverge++;
      if (!apply) { conflicts.push(`${f.dest}.bak.${stamp}`); continue; }
    } else {
      // 目标已存在且内容不同：安装树可能带着比模板更新的本地修复——
      // 默认保留目标（kept），只有 --force 才备份后覆盖（conflict）。
      conflict++;
      if (!force) {
        kept++;
        keptList.push(f.dest);
        continue;
      }
      conflicts.push(`${f.dest}.bak.${stamp}`);
    }
  }
  if (apply) {
    try {
      mkdirSync(dirname(d), { recursive: true });
      if (existsSync(d)) {
        copyFileSync(d, `${d}.bak.${stamp}`);   // 先备份旧文件再覆盖，可回滚
        pruneBackups(d);                        // 同目标备份只留最近 KEEP_BACKUPS 份（H8）
      }
      copyFileSync(s, d);
      copied++; console.log(`  ✓ 同步 ${f.dest}${f._touched ? '（补丁触碰面收口）' : ''}`);
    } catch (e) {
      // 复制/备份失败=failed（不吞）：运行时同步失败不得报告成功
      copyErr++; console.log(`  ✗ 同步失败 ${f.dest}: ${e.message}`);
    }
  } else {
    copied++; console.log(`  ~ 待同步 ${f.dest}`);
  }
}
if (keptList.length > 0) {
  console.log(`  ! 目标与模板不同 ${keptList.length} 个，已保留目标未覆盖（模板可能落后于宿主；需以模板覆盖请加 --force）：`);
  for (const k of keptList) console.log(`      ${k}`);
}
if (conflicts.length > 0) {
  console.log(`  ! 目标文件与源不同 ${conflicts.length} 个，${apply ? '旧文件已备份' : '--apply 时旧文件将备份'}为 .bak.${stamp}：`);
  for (const c of conflicts) console.log(`      ${c}`);
}
const touchedSeg = touchedEntries.length > 0
  ? `＋补丁触碰 ${touchedEntries.length}`
  : (patchTouchedEntries.length > 0 ? '（触碰面已跳过）' : '');
const touchedMissSeg = touchedMissing > 0 ? `（触碰面跳过 ${touchedMissing}）` : '';
console.log(`[deploy-agent-runtime] 清单 ${manifest.files.length}${touchedSeg} ｜ 相同 ${same} ｜ ${apply ? '已同步' : '待同步'} ${copied} ｜ 源缺失 ${missing}${touchedMissSeg} ｜ 保留目标 ${kept} ｜ 差异 ${conflict} ｜ 触碰待收口 ${touchedConverge} ｜ 同步失败 ${copyErr}`);
if (kept > 0) console.log('提示：保留的差异文件需人工比对；若宿主侧是更新修复，应回灌 runtime/ 模板后重跑。');
if (copied > 0 && apply) console.log('提示：运行时已更新，需重启各 profile gateway 生效。');
// 状态面（P1）：kept/conflict → partial（exit 2）；missing/复制失败 → failed（exit 1）；
// 只有全同或无冲突同步成功才是 complete（exit 0）。末行 RESULT 供 inject 预检/后置消费。
// 触碰面的 touchedMissing/touchedConverge 不参与状态：前者=本检出未注入（无真值），
// 后者=apply 可自动收口（inject 链路内先注入后部署，源恒为新注入态）。
const deployFailed = missing > 0 || copyErr > 0;
const deployPartial = kept > 0 || conflict > 0;
const deployStatus = deployFailed ? 'failed' : deployPartial ? 'partial' : 'complete';
console.log(`RESULT status=${deployStatus}`);
process.exit(deployFailed ? 1 : deployPartial ? 2 : 0);
