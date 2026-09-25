// B1 双树漂移根治：agent 运行时文件同步（manifest 驱动、幂等、默认 dry-run）。
// 用法: node scripts/deploy-agent-runtime.mjs [--apply] [--runtime <dir>]
//   默认 dry-run（只报告差异不写入）；--apply 才真正拷贝。杜绝 A1 类"修复不达运行时"。
//   安装树目标已存在且内容不同时，--apply 先备份旧文件为 <name>.bak.<timestamp> 再覆盖
//   （计入冲突并在输出列出，可回滚；与 aipay-agent-sync.sh 的安装树安全边界对齐）。
// source=manifest.root（overlay/runtime，本检出运行时镜像）→ target=~/.hermes/hermes-agent（运行时安装树）。
import { readFileSync, existsSync, copyFileSync, mkdirSync, lstatSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
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
  try { return JSON.parse(readFileSync(resolve(d, 'package.json'), 'utf8')).name === 'hermes-overlay'; } catch { return false; }
});
if (!overlayRoot) {
  console.error(`[deploy-agent-runtime] fail-fast：从 ${import.meta.dirname} 向上找不到 name=hermes-overlay 的 package.json，无法定 overlay 根`);
  process.exit(1);
}
const ncwkRoot = findUp(overlayRoot, (d) => {
  try { return lstatSync(resolve(d, 'upstream')).isDirectory(); } catch { return false; }
});
const apply = process.argv.includes('--apply');
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

let same = 0, copied = 0, missing = 0, conflict = 0;
const conflicts = [];            // 目标与源不同、覆盖前先备份的清单（P6 可回滚+告警）
const stamp = Date.now();        // 备份时间戳：一次运行共用一个（<name>.bak.<timestamp>）
console.log(`[deploy-agent-runtime] ${apply ? 'APPLY' : 'DRY-RUN'}  ${manifest.root} → ${dstRoot}`);
for (const f of manifest.files) {
  const s = join(srcRoot, f.source);
  const d = join(dstRoot, f.dest);
  if (!existsSync(s)) { console.log(`  ! 源缺失: ${f.source}`); missing++; continue; }
  const sContent = readFileSync(s);
  if (existsSync(d)) {
    const dContent = readFileSync(d);
    if (Buffer.compare(sContent, dContent) === 0) { same++; continue; }
    // 目标已存在且内容不同：安装树可能带着使用者的本地改动，覆盖前先备份（记冲突）
    conflict++;
    conflicts.push(`${f.dest}.bak.${stamp}`);
  }
  if (apply) {
    mkdirSync(dirname(d), { recursive: true });
    if (existsSync(d)) copyFileSync(d, `${d}.bak.${stamp}`);   // 先备份旧文件再覆盖，可回滚
    copyFileSync(s, d);
    copied++; console.log(`  ✓ 同步 ${f.source}`);
  } else {
    copied++; console.log(`  ~ 待同步 ${f.source}`);
  }
}
if (conflicts.length > 0) {
  console.log(`  ! 目标文件与源不同 ${conflicts.length} 个，${apply ? '旧文件已备份' : '--apply 时旧文件将备份'}为 .bak.${stamp}：`);
  for (const c of conflicts) console.log(`      ${c}`);
}
console.log(`[deploy-agent-runtime] 清单 ${manifest.files.length} ｜ 相同 ${same} ｜ ${apply ? '已同步' : '待同步'} ${copied} ｜ 源缺失 ${missing} ｜ 冲突 ${conflict}`);
if (copied > 0 && apply) console.log('提示：运行时已更新，需重启各 profile gateway 生效。');
process.exit(missing > 0 ? 1 : 0);
