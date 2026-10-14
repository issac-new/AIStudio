// overlay/scripts/ts-resolve.mjs —— node 直跑 TS 的扩展名解析钩子（bench:expert 用）。
// 服务端源码保持无后缀 import（ts-node/vitest 兼容）；node 原生 ESM 需要扩展名，
// 本钩子在解析失败时回落补 .ts——仅 CLI 进程注册，服务/测试零影响。
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (err) {
    if (specifier.startsWith('.') || specifier.startsWith('file:')) {
      try {
        return await next(`${specifier}.ts`, context)
      } catch {
        /* 回落也失败 → 抛原错 */
      }
    }
    throw err
  }
}
