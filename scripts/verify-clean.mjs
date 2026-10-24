// overlay/scripts/verify-clean.mjs
// 校验:上游基线树状态报告。双模（AIStudio 单仓整合轮,2026-10-24）:
//   - 自持 .git 的外置 upstream/ 树:校验无本地 commit + 工作树状态报告(旧语义)。
//   - 仓内 vendor/<tree> 基线(无 .git):经外仓报告 vendor/ 路径状态;inject 后
//     脏态是预期注入态(与外置树注入态同构),仅报告;基线本身无本地 commit 概念
//     (它就是本仓跟踪的文件)。
//   - element-web:参照实现不入仓(无构建依赖,build/inject 零引用);外置树存在时
//     仍做纯上游检查,不存在则跳过。
// 自包含(不 import config/bootstrap.ts,路径内联)。
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const overlayRoot = resolve(import.meta.dirname, '..');
const vendorRoot = resolve(overlayRoot, 'vendor');
const legacyUpstreamRoot = resolve(overlayRoot, '..', 'upstream');

function git(args, cwd) {
  try {
    return execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (e) {
    return e.stdout?.toString() || '';
  }
}

let ok = true;

function reportTree(label, treeRoot) {
  if (!existsSync(treeRoot)) {
    console.log(`SKIP: ${label} 不存在(可选树)`);
    return;
  }
  if (existsSync(resolve(treeRoot, '.git'))) {
    const commits = git('log --oneline origin/main..HEAD', treeRoot).trim();
    if (commits) {
      console.error(`FAIL: ${label} 有本地 commit:\n${commits}`);
      ok = false;
    } else {
      console.log(`OK: ${label} .git 历史干净(无本地 commit)`);
    }
    const s = git('status --porcelain', treeRoot).trim();
    if (s) console.warn(`WARN: ${label} 工作树有改动(可能是未 clean 的 B 类 patch):\n${s}`);
    else console.log(`OK: ${label} 工作树干净`);
  } else {
    // vendor 模式:经外仓报告(无本地 commit 概念;脏=预期注入态)
    const rel = treeRoot.slice(overlayRoot.length + 1);
    const s = git(`status --porcelain -- "${rel}"`, overlayRoot).trim();
    if (s) console.log(`OK: ${label}(vendor 基线)呈注入态(外仓 ${rel}/ 有改动,预期):\n${s.split('\n').slice(0, 5).join('\n')}${s.split('\n').length > 5 ? '\n  …' : ''}`);
    else console.log(`OK: ${label}(vendor 基线)干净(pristine)`);
  }
}

// 基线树来源:vendor/ 优先(单仓形态),否则外置 upstream/
const base = existsSync(resolve(vendorRoot, 'hermes-studio')) ? vendorRoot : legacyUpstreamRoot;
reportTree('hermes-studio', resolve(base, 'hermes-studio'));
reportTree('hermes-agent', resolve(base, 'hermes-agent'));
reportTree('zcode', resolve(base, 'zcode'));
// element-web:仅外置参照树存在时检查(不入仓)
reportTree('element-web(参照,不入仓)', resolve(legacyUpstreamRoot, 'element-web'));

process.exit(ok ? 0 : 1);
