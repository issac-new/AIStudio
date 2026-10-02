// overlay/custom/client/settings-layers/index.ts
// 设置分层基建（2026-10-02 吸收二期 #13 步一：element-web SettingLevel 三层
// 范式的 studio 化，纯基建零行为变化——无消费方迁移，键仍走各自旧路径）。
//
// 四层语义（宽→严的覆盖链）：default（代码内默认）< user（用户全局）<
// workspace（工作区覆盖）< session（会话内覆盖）。读=沿链取最深已设值；
// 写=写指定层；未设层不落键（不留 tombstone）。
//
// 存储约定：localStorage 键 = `sl:<layer>:<key>`（sl=settings-layers 前缀，
// 与既有裸键隔离——迁移步二逐域搬键时旧键值一次性搬入 user 层后退役）。
// 与 features.ts 的关系：features 是构建期功能开关（S3 族），本层是运行期
// 用户偏好——两类不混（开关决定面存不存在，偏好决定面长什么样）。
export type SettingsLayer = 'default' | 'user' | 'workspace' | 'session'

export const LAYER_CHAIN: readonly SettingsLayer[] = ['session', 'workspace', 'user', 'default']

function storageKey(layer: SettingsLayer, key: string): string {
  return `sl:${layer}:${key}`
}

/** 撤销保护：跨标签页写同键时后写胜（与 multica 按 workspace 记忆/清空语义对齐，
 *  登出清 localStorage 即全清——不引入服务端态）。 */
export function writeSetting<T extends string | number | boolean>(
  layer: SettingsLayer, key: string, value: T | null,
): void {
  if (layer === 'default') {
    throw new Error('default 层不可写（代码内默认，改默认值须改调用方常量）')
  }
  const k = storageKey(layer, key)
  if (value === null) localStorage.removeItem(k)
  else localStorage.setItem(k, JSON.stringify(value))
}

export interface LayeredResult<T> {
  value: T
  /** 命中层（default=全链未设，返回注入的默认） */
  layer: SettingsLayer
}

/** 沿链读取：session → workspace → user；全未设返回 fallback（layer='default'）。
 *  解析失败的脏值按未设处理（不抛——旧版本残留键不该炸读路径）。 */
export function readSetting<T extends string | number | boolean>(
  key: string, fallback: T,
  opts: { workspaceId?: string; sessionId?: string } = {},
): LayeredResult<T> {
  const scoped: Array<SettingsLayer> = []
  if (opts.sessionId) scoped.push('session')
  if (opts.workspaceId) scoped.push('workspace')
  const chain: SettingsLayer[] = [...scoped, 'user']
  for (const layer of chain) {
    const raw = localStorage.getItem(storageKey(layer, key))
    if (raw === null) continue
    try {
      const parsed = JSON.parse(raw) as T
      if (typeof parsed === typeof fallback) return { value: parsed, layer }
    } catch { /* 脏值跳过 */ }
  }
  return { value: fallback, layer: 'default' }
}

/** 全链快照（设置页"重置为默认"用：展示每层现值与命中层） */
export function inspectSetting(key: string): Record<Exclude<SettingsLayer, 'default'>, unknown> {
  const out = { user: undefined, workspace: undefined, session: undefined } as Record<Exclude<SettingsLayer, 'default'>, unknown>
  for (const layer of ['user', 'workspace', 'session'] as const) {
    const raw = localStorage.getItem(storageKey(layer, key))
    if (raw === null) continue
    try { out[layer] = JSON.parse(raw) } catch { out[layer] = raw }
  }
  return out
}

/** 清层（登出/切工作区时的批量语义：层内全清，键前缀精确匹配） */
export function clearLayer(layer: SettingsLayer): void {
  if (layer === 'default') return
  const prefix = `sl:${layer}:`
  const doomed: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(prefix)) doomed.push(k)
  }
  for (const k of doomed) localStorage.removeItem(k)
}
