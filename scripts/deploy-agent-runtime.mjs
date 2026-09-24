// B1 双树漂移根治：agent 运行时文件同步（manifest 驱动、幂等、默认 dry-run）。
// 用法: node scripts/deploy-agent-runtime.mjs [--apply] [--runtime <dir>]
//   默认 dry-run（只报告差异不写入）；--apply 才真正拷贝。杜绝 A1 类"修复不达运行时"。
// source=upstream/hermes-agent（工作树镜像）→ target=~/.hermes/hermes-agent（运行时安装树）。
import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { homedir } from 'node:os';

const overlayRoot = resolve(import.meta.dirname, '..');
const ncwkRoot = resolve(overlayRoot, '..');
const apply = process.argv.includes('--apply');
const runtimeArg = process.argv.indexOf('--runtime');
const manifest = JSON.parse(readFileSync(resolve(overlayRoot, 'runtime-manifest.json'), 'utf8'));
const srcRoot = resolve(ncwkRoot, manifest.root);
const dstRoot = runtimeArg > 0 ? process.argv[runtimeArg + 1] : join(homedir(), manifest.target.replace(/^~/, '').replace(/^\//, ''));

let same = 0, copied = 0, missing = 0, conflict = 0;
console.log(`[deploy-agent-runtime] ${apply ? 'APPLY' : 'DRY-RUN'}  ${manifest.root} → ${dstRoot}`);
for (const f of manifest.files) {
  const s = join(srcRoot, f.source);
  const d = join(dstRoot, f.dest);
  if (!existsSync(s)) { console.log(`  ! 源缺失: ${f.source}`); missing++; continue; }
  const sContent = readFileSync(s);
  if (existsSync(d)) {
    const dContent = readFileSync(d);
    if (Buffer.compare(sContent, dContent) === 0) { same++; continue; }
  }
  if (apply) {
    mkdirSync(dirname(d), { recursive: true });
    copyFileSync(s, d);
    copied++; console.log(`  ✓ 同步 ${f.source}`);
  } else {
    copied++; console.log(`  ~ 待同步 ${f.source}`);
  }
}
console.log(`[deploy-agent-runtime] 清单 ${manifest.files.length} ｜ 相同 ${same} ｜ ${apply ? '已同步' : '待同步'} ${copied} ｜ 源缺失 ${missing} ｜ 冲突 ${conflict}`);
if (copied > 0 && apply) console.log('提示：运行时已更新，需重启各 profile gateway 生效。');
process.exit(missing > 0 ? 1 : 0);
