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
 *  登出清 localStorage 即全清——不引入服务端态）。
 *  值域：原始量（string/number/boolean）+ JSON 复合值（数组/对象）——步二迁键
 *  需要（如 ide_status_slots 是槽位数组）。 */
export function writeSetting<T>(
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
 *  解析失败的脏值按未设处理（不抛——旧版本残留键不该炸读路径）。
 *  类型校验仅对原始量 fallback 强制（存 string 读 number 链=未设）；复合值
 *  fallback（数组/对象）不做形状校验——消费方自校（迁移域本就有自己的
 *  valid 化逻辑，如 IdeStatusBar readSlots 的 SLOT_KEYS 归一）。 */
export function readSetting<T>(
  key: string, fallback: T,
  opts: { workspaceId?: string; sessionId?: string } = {},
): LayeredResult<T> {
  const scoped: Array<SettingsLayer> = []
  if (opts.sessionId) scoped.push('session')
  if (opts.workspaceId) scoped.push('workspace')
  const chain: SettingsLayer[] = [...scoped, 'user']
  const primitive = typeof fallback !== 'object' || fallback === null
  for (const layer of chain) {
    const raw = localStorage.getItem(storageKey(layer, key))
    if (raw === null) continue
    try {
      const parsed = JSON.parse(raw) as T
      if (primitive && typeof parsed !== typeof fallback) continue
      return { value: parsed, layer }
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

/** 遗留裸键一次性收养（步二迁键用）：分层键未设而遗留键在→把遗留原值搬入
 *  user 层并删遗留键。原值语义保真：遗留存储形态已是 JSON（JSON.stringify
 *  产物，如对象/数组/带引号串）直接搬；裸字符串（如 sortMode=alpha 不带
 *  引号）包成 JSON 字符串。不解析校验——消费方读端自有 valid 化，脏值搬入后
 *  走读端容错等效未设。幂等：收养过（任一层已设）即空转。 */
export function adoptLegacySetting(key: string, legacyKey: string): void {
  const layered = ['user', 'workspace', 'session'].some(
    l => localStorage.getItem(storageKey(l, key)) !== null)
  if (layered) return
  const raw = localStorage.getItem(legacyKey)
  if (raw === null) return
  localStorage.setItem(storageKey('user', key), isJsonText(raw) ? raw : JSON.stringify(raw))
  localStorage.removeItem(legacyKey)
}

function isJsonText(text: string): boolean {
  try { JSON.parse(text); return true } catch { return false }
}
