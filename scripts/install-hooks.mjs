// overlay/scripts/install-hooks.mjs
// 安装 git 钩子入口（2026-10-30 HelixHarness 吸收轮）。
//
// 为什么必须由脚本装：`core.hooksPath` 是**本地 git 配置**，不随 clone 复制。
// 仓库虽已把 L2 判定库与提交钩子入库（.swarm-yuan/hooks/），但新克隆里 git 根本不会
// 调用它们——「入库可复现」只解决了文件存在性，没解决钩子是否被启用。
//
// 语义（与 generate-skill.sh 的装配口径一致）：
//   - 未配置 core.hooksPath → 设为 .swarm-yuan/hooks；
//   - 已指向 .swarm-yuan/hooks → 幂等跳过；
//   - 已指向别处 → 不覆盖，只告警并给手工接入提示（尊重用户已有钩子链）。
// 调用点：ensure-injected（predev/pretest/prebuild 都经过它）与 `npm run hooks:install`。
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const overlayRoot = resolve(import.meta.dirname, '..');
const WANT = '.swarm-yuan/hooks';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** @returns {{ changed: boolean, hooksPath: string, note: string }} */
export function installHooks(root = overlayRoot) {
  const hookFile = resolve(root, WANT, 'pre-commit');
  if (!existsSync(hookFile)) {
    return { changed: false, hooksPath: '', note: '未找到 .swarm-yuan/hooks/pre-commit（非生成形态，跳过）' };
  }
  try {
    git(['rev-parse', '--is-inside-work-tree'], root);
  } catch {
    return { changed: false, hooksPath: '', note: '非 git 工作树（跳过）' };
  }
  let current = '';
  try {
    current = git(['config', 'core.hooksPath'], root);
  } catch {
    current = '';
  }
  if (current === WANT) return { changed: false, hooksPath: current, note: 'core.hooksPath 已指向 .swarm-yuan/hooks（幂等）' };
  if (current) {
    return {
      changed: false,
      hooksPath: current,
      note: `已存在自定义 core.hooksPath=${current}，不覆盖；如需 L2 强拦，请在该目录并入 .swarm-yuan/hooks/pre-commit 的调用`,
    };
  }
  git(['config', 'core.hooksPath', WANT], root);
  return { changed: true, hooksPath: WANT, note: `已启用 L2 提交强拦：core.hooksPath=${WANT}` };
}

// 直接执行（node scripts/install-hooks.mjs）时打印结论；被 import 时不打。
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const r = installHooks();
  console.log(`[install-hooks] ${r.note}`);
}
