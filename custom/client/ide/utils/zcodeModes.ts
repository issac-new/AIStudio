// overlay/custom/client/ide/utils/zcodeModes.ts
// ZCode 模式目录（composer 面单一事实源的客户端镜像）——2026-10-18 用户指令
// 「重新调研 zcode 源码校正，避免疏漏」：
// 上游锚=upstream/zcode v3.16.1 packages/shared/src/zcode-agent-model-state.ts（3.15.1→3.16.1 零 diff）
// ZCODE_AGENT_MODE_OPTIONS：build/guarded/plan/yolo（edit 为隐藏历史值仅回显）；
// 形态锚=v4/composer/V4ComposerModeControls.tsx：Plan 独立勾选项（planEnabled
// 布尔，与权限档正交）+ 权限三档单选；引擎协议 submissionModeSchema
// （zcode-protocol-v4/submission.ts:4）=build/edit/plan/yolo/guarded。
//
// 本仓消费层（permmodes 七档 + 服务端 session-mode REST）不改词表——UI 层存
// zcode 形态 {mode, planEnabled}，派生七档字符串写旧键（服务端穿线/既有测试
// 零改动），派生规则见 toLegacyMode。
export interface ZcodeModeOption {
  key: 'build' | 'guarded' | 'yolo'
  label: string
  labelEn: string
  description: string
}

export const ZCODE_PERMISSION_MODES: ZcodeModeOption[] = [
  { key: 'build', label: '改动前询问', labelEn: 'Ask before changes', description: '每次文件改动前先询问' },
  { key: 'guarded', label: '自主模式', labelEn: 'Autonomous mode', description: '有风险时才询问' },
  { key: 'yolo', label: '完全访问', labelEn: 'Full access', description: '编辑与执行命令更少确认' },
]

export const ZCODE_PLAN = { label: '计划模式', labelEn: 'Plan mode', description: '先检查代码并给出计划，再动手修改' }

export interface ZcodeModeState {
  mode: 'build' | 'guarded' | 'yolo'
  planEnabled: boolean
}

/** 旧七档（hermes 词表）→ zcode 形态迁移；未知/缺省=build。 */
export function legacyToZcodeMode(legacy: string | null | undefined): ZcodeModeState {
  switch (legacy) {
    case 'readonly':
    case 'plan':
      return { mode: 'build', planEnabled: true }
    case 'acceptEdits':
    case 'default':
      return { mode: 'build', planEnabled: false }
    case 'auto':
    case 'dontAsk':
      return { mode: 'guarded', planEnabled: false }
    case 'bypassPermissions':
      return { mode: 'yolo', planEnabled: false }
    default:
      return { mode: 'build', planEnabled: false }
  }
}

/** zcode 形态 → 旧七档（服务端 session-mode/派发面词表）。plan 优先。 */
export function toLegacyMode(state: ZcodeModeState): string {
  if (state.planEnabled) return 'plan'
  if (state.mode === 'guarded') return 'dontAsk'
  if (state.mode === 'yolo') return 'bypassPermissions'
  return 'default'
}

const ZCODE_KEY = 'ide-zcode-mode:'
const LEGACY_KEY = 'ide-permission-mode:'

export function zcodeModeStorageKey(sessionId: string | null | undefined): string {
  return ZCODE_KEY + (sessionId ?? 'default')
}

export function readZcodeMode(sessionId: string | null | undefined): ZcodeModeState {
  const sid = sessionId ?? 'default'
  try {
    const raw = localStorage.getItem(ZCODE_KEY + sid)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ZcodeModeState>
      const mode = ZCODE_PERMISSION_MODES.some(m => m.key === parsed.mode) ? parsed.mode : 'build'
      return { mode, planEnabled: parsed.planEnabled === true }
    }
  } catch { /* fallthrough 迁移 */ }
  return legacyToZcodeMode(localStorage.getItem(LEGACY_KEY + sid))
}

export function writeZcodeMode(sessionId: string | null | undefined, state: ZcodeModeState): void {
  const sid = sessionId ?? 'default'
  localStorage.setItem(ZCODE_KEY + sid, JSON.stringify(state))
  // 派生七档写旧键：服务端穿线（session-mode REST）与既有消费者零改动。
  localStorage.setItem(LEGACY_KEY + sid, toLegacyMode(state))
}

/** 触发器显示（zh/en），plan 开启时叠加计划标记（zcode plan marker 同义）。 */
export function zcodeModeLabel(state: ZcodeModeState, zh = true): string {
  const mode = ZCODE_PERMISSION_MODES.find(m => m.key === state.mode)
  return zh ? mode?.label ?? state.mode : mode?.labelEn ?? state.mode
}
