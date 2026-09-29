// overlay/custom/client/kanban/handoff.ts
// B10 交接单（routa lane 间 handoff 吸收：4 类请求 × 5 态状态机）。
// 载体=看板任务评论（单一写者纪律不动：走既有 store.addComment → hermes CLI 链）；
// 协议=结构化首行标记，人读友好、机器可折。
//   发起：【交接单】id=hf-xxx type=clarification state=requested\n正文
//   推进：【交接】ref=hf-xxx state=delivered|completed|blocked|failed\n备注
// 折叠语义：同 id 的最新 state 为当前态（评论 append-only，与 kanban 事件流一致）。
// 修正记录（2026-09-29）：v13 调研档原文"5 类交接单"系笔误——routa 源码实证为
// 4 类请求（task.ts:109-121）×5 种状态，本文档与实现以源码为准。

export type HandoffType = 'environment_preparation' | 'runtime_context' | 'clarification' | 'rerun_command'
export type HandoffState = 'requested' | 'delivered' | 'completed' | 'blocked' | 'failed'

export const HANDOFF_TYPES: readonly HandoffType[] = ['environment_preparation', 'runtime_context', 'clarification', 'rerun_command']
export const HANDOFF_STATES: readonly HandoffState[] = ['requested', 'delivered', 'completed', 'blocked', 'failed']

export const HANDOFF_TYPE_LABEL: Record<HandoffType, string> = {
  environment_preparation: '环境准备',
  runtime_context: '运行时上下文',
  clarification: '澄清提问',
  rerun_command: '重跑命令',
}
export const HANDOFF_STATE_LABEL: Record<HandoffState, string> = {
  requested: '已请求',
  delivered: '已交付',
  completed: '已完成',
  blocked: '受阻',
  failed: '失败',
}

export interface HandoffCard {
  id: string
  type: HandoffType
  state: HandoffState
  body: string
  requestedAt: string
  /** 最近一次推进备注（可空） */
  lastNote: string
}

const CREATE_RE = /^【交接单】id=(\S+)\s+type=(\S+)\s+state=requested\s*\n?([\s\S]*)$/
const ADVANCE_RE = /^【交接】ref=(\S+)\s+state=(\S+)\s*\n?([\s\S]*)$/

/** 发起体序列化。 */
export function serializeHandoffCreate(type: HandoffType, body: string, id: string): string {
  return `【交接单】id=${id} type=${type} state=requested\n${body.trim()}`
}

/** 推进体序列化。 */
export function serializeHandoffAdvance(id: string, state: HandoffState, note = ''): string {
  return `【交接】ref=${id} state=${state}${note.trim() ? `\n${note.trim()}` : ''}`
}

/** 从任务评论折叠交接单（同 id 最新态为准；无法解析的评论原样忽略——不吞不炸）。 */
export function buildHandoffCards(comments: readonly { id: number | string; body?: string | null; created_at?: string }[]): HandoffCard[] {
  const cards = new Map<string, HandoffCard>()
  for (const c of comments) {
    const text = (c.body ?? '').trim()
    const create = text.match(CREATE_RE)
    if (create) {
      const [, id, type, body] = create
      if (!HANDOFF_TYPES.includes(type as HandoffType)) continue
      cards.set(id, {
        id,
        type: type as HandoffType,
        state: 'requested',
        body: (body ?? '').trim(),
        requestedAt: c.created_at ?? '',
        lastNote: '',
      })
      continue
    }
    const adv = text.match(ADVANCE_RE)
    if (adv) {
      const [, ref, state, note] = adv
      const card = cards.get(ref)
      if (!card || !HANDOFF_STATES.includes(state as HandoffState)) continue
      card.state = state as HandoffState
      card.lastNote = (note ?? '').trim()
    }
  }
  return [...cards.values()]
}

/** 允许的推进（状态机：requested→delivered→completed；requested→blocked→requested（重新请求=再发起）；任何态→failed 终态外的诚实面）。
 *  routa 五态无显式回边；这里放行 delivered→blocked（交付后发现问题回受阻）与 blocked→delivered（解除）。 */
export function canAdvanceTo(from: HandoffState, to: HandoffState): boolean {
  if (from === to) return false
  if (from === 'completed' || from === 'failed') return false // 终态不回边
  if (from === 'requested') return to === 'delivered' || to === 'blocked' || to === 'failed'
  if (from === 'delivered') return to === 'completed' || to === 'blocked' || to === 'failed'
  if (from === 'blocked') return to === 'delivered' || to === 'failed'
  return false
}

/** 终态判定（终态不再出推进按钮）。 */
export function isTerminalHandoff(state: HandoffState): boolean {
  return state === 'completed' || state === 'failed'
}
