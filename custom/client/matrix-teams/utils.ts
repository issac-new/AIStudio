// overlay/custom/client/matrix-teams/utils.ts
// matrix-teams 模块共享 helper（store 与组件公用，单一事实源）。

/** 解包「pinia 代理值 / 测试 mock 的 ref 形态」双形态。
 *  pinia 代理读取时已解包；测试 mock 的是 setup 原始返回（ref 形态 { value }）。
 *  用 'value' in raw 判定 ref 形态并取 .value（含 null）；真实 MatrixClient/字符串无 .value 属性。
 *  注意不能用 ?.value ?? raw：{ value: null } 会被 ?? 判空而回退成包装对象（真值），丢 null 语义。 */
export function unwrapRef<T>(raw: unknown): T | null {
  if (raw !== null && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
    return (raw as { value: unknown }).value as T | null
  }
  return (raw ?? null) as T | null
}
