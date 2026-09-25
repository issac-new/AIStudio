// overlay/keymap 域：键位可重映射（codex §二轮 C 表 P2 吸收，矩阵 §3.8 codex P2）。
//
// codex 语义（keymap 12 上下文×154 动作可重映射）：键位按**上下文**分组（全局/
// 会话/编辑器/面板…），每上下文的动作→按键可改，冲突检测防一键双绑。
// Ycode 形状：映射表纯函数（默认映射+用户覆盖+冲突检测）。
export interface KeyBinding {
  context: string
  action: string
  key: string
}

export interface KeymapConflict {
  context: string
  key: string
  actions: string[]
}

/** 用户覆盖叠加默认（同 (context,action) 覆盖；冲突检测一键双绑）。 */
export function applyKeymap(
  defaults: readonly KeyBinding[],
  overrides: readonly KeyBinding[],
): { bindings: KeyBinding[]; conflicts: KeymapConflict[] } {
  const byAction = new Map<string, KeyBinding>()
  for (const b of [...defaults, ...overrides]) {
    byAction.set(`${b.context}::${b.action}`, b)  // 后者覆盖（override 语义）
  }
  const bindings = [...byAction.values()]
  // 冲突检测：同 context 同 key 多动作=一键双绑。
  const byKey = new Map<string, string[]>()
  for (const b of bindings) {
    const k = `${b.context}::${b.key}`
    ;(byKey.get(k) ?? byKey.set(k, []).get(k)!).push(b.action)
  }
  const conflicts: KeymapConflict[] = []
  for (const [k, actions] of byKey) {
    if (actions.length > 1) {
      const [context, key] = k.split('::')
      conflicts.push({ context, key, actions })
    }
  }
  return { bindings, conflicts }
}

/** 默认键位（codex 风格最小集：会话/编辑器两上下文）。 */
export function defaultKeymap(): KeyBinding[] {
  return [
    { context: 'session', action: 'submit', key: 'Enter' },
    { context: 'session', action: 'newline', key: 'Shift+Enter' },
    { context: 'session', action: 'interrupt', key: 'Esc' },
    { context: 'editor', action: 'save', key: 'Cmd+S' },
    { context: 'editor', action: 'format', key: 'Shift+Alt+F' },
  ]
}
