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
import { readFileSync, existsSync, copyFileSync, mkdirSync, lstatSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { homedir } from 'node:os';

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
const manifest = JSON.parse(readFileSync(resolve(overlayRoot, 'runtime-manifest.json'), 'utf8'));
const srcCandidates = [...new Set([
  resolve(overlayRoot, manifest.root.replace(/^overlay\//, '')),
  ...(ncwkRoot ? [resolve(ncwkRoot, manifest.root)] : []),
])];
const srcRoot = srcCandidates.find((p) => existsSync(p));
if (!srcRoot) {
  console.error(`[deploy-agent-runtime] fail-fast：manifest.root=${manifest.root} 的源目录均不存在，已试：\n  ${srcCandidates.join('\n  ')}`);
  process.exit(1);
}
const dstRoot = runtimeArg > 0 ? process.argv[runtimeArg + 1] : join(homedir(), manifest.target.replace(/^~/, '').replace(/^\//, ''));

let same = 0, copied = 0, missing = 0, conflict = 0, kept = 0;
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
for (const f of manifest.files) {
  const s = join(srcRoot, f.source);
  const d = join(dstRoot, f.dest);
  if (!existsSync(s)) { console.log(`  ! 源缺失: ${f.source}`); missing++; continue; }
  const sContent = readFileSync(s);
  if (existsSync(d)) {
    const dContent = readFileSync(d);
    if (Buffer.compare(sContent, dContent) === 0) { same++; continue; }
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
  if (apply) {
    mkdirSync(dirname(d), { recursive: true });
    if (existsSync(d)) {
      copyFileSync(d, `${d}.bak.${stamp}`);   // 先备份旧文件再覆盖，可回滚
      pruneBackups(d);                        // 同目标备份只留最近 KEEP_BACKUPS 份（H8）
    }
    copyFileSync(s, d);
    copied++; console.log(`  ✓ 同步 ${f.source}`);
  } else {
    copied++; console.log(`  ~ 待同步 ${f.source}`);
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
console.log(`[deploy-agent-runtime] 清单 ${manifest.files.length} ｜ 相同 ${same} ｜ ${apply ? '已同步' : '待同步'} ${copied} ｜ 源缺失 ${missing} ｜ 保留目标 ${kept} ｜ 差异 ${conflict}`);
if (kept > 0) console.log('提示：保留的差异文件需人工比对；若宿主侧是更新修复，应回灌 runtime/ 模板后重跑。');
if (copied > 0 && apply) console.log('提示：运行时已更新，需重启各 profile gateway 生效。');
process.exit(missing > 0 ? 1 : 0);
