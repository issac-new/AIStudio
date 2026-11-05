// 统一上游根解析（P1 平台重写 Task 6）：env 显式 > 仓内 vendor > 旧兄弟 upstream。
// 单一事实源——build.mjs/build-dmg.mjs/serve-server.mjs/verify-dist.mjs/inject.mjs 的
// 内联解析副本全部收敛到本模块（四入口此前各自演化，build-dmg 甚至无 vendor 分支：
// 单仓全新克隆下直落 ../upstream 必炸）。
//
// realpath 规范化与 inject.mjs 同理：worktree/软链布局下符号链接路径会让 vite
// root 与输入 html 不一致（emitFile 相对路径逃逸）；路径不存在时回退原样解析，
// 由调用方的存在性守卫输出友好报错（不在模块顶层裸抛）。
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/** realpath（不存在时原样返回——存在性由调用方守卫，不在解析层抛错）。 */
export function realpathOrSelf(p) {
  try { return realpathSync(p); } catch { return p; }
}

/**
 * 解析 overlay 检出与三棵上游树的绝对根。
 * @param explicitOverlayRoot 显式 overlay 根（入口脚本传自身位置；缺省锚定本模块所在仓）
 * @returns {overlayRoot, upstreamRoot, hermesStudioRoot, hermesAgentRoot, zcodeRoot}
 *   - OVERLAY_UPSTREAM_ROOT 显式指定 → realpath(env)（私有上游隔离语义，最高优先）
 *   - <overlayRoot>/vendor/hermes-studio 存在 → 仓内 vendor 钉版基线
 *   - 否则 → <overlayRoot>/../upstream（旧 ncwk 布局回落，realpath 容不存在）
 */
export function resolveUpstreamRoots(explicitOverlayRoot) {
  const overlayRoot = realpathOrSelf(
    explicitOverlayRoot ?? resolve(import.meta.dirname, '..', '..', '..'),
  );
  const envRoot = process.env.OVERLAY_UPSTREAM_ROOT?.trim();
  const vendorRoot = resolve(overlayRoot, 'vendor');
  const upstreamRoot = envRoot
    ? realpathOrSelf(resolve(envRoot))
    : existsSync(resolve(vendorRoot, 'hermes-studio'))
      ? vendorRoot
      : realpathOrSelf(resolve(overlayRoot, '..', 'upstream'));
  return {
    overlayRoot,
    upstreamRoot,
    hermesStudioRoot: resolve(upstreamRoot, 'hermes-studio'),
    hermesAgentRoot: resolve(upstreamRoot, 'hermes-agent'),
    zcodeRoot: resolve(upstreamRoot, 'zcode'),
  };
}
