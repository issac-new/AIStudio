// overlay/custom/client/ide/store/btw.ts
// B2 侧问（/btw）客户端单一事实源（cc §六 P2/kimi 同源；域状态机=server btw/btw-sidebar）。
// 真实链：侧问=独立旁路会话（newChat 同 agent/workspace，标题 [btw] 前缀）——
// 主回合不被打断；问=临时切会话发送后切回（复用 sendMessage 全真链）；
// 答=fetchSessionMessagesPage 只读轮询；合并回注=mergeBtwNote 文本复制给人工
// 粘贴（不经 sendMessage 自动注入主会话——旁注语义不改主方向，发不发由人）。
import { reactive } from 'vue'
import { mergeBtwNote, type BtwExchange } from '../../../server/btw/btw-sidebar'

export interface BtwDeps {
  newChat: (opts: Record<string, unknown>) => Promise<unknown>
  switchSession: (id: string) => Promise<unknown>
  sendMessage: (content: string) => Promise<unknown>
  fetchMessages: (sessionId: string) => Promise<Array<{ role?: string; content?: unknown; createdAt?: number }>>
  activeSessionId: () => string | null
  mainTitle: () => string
}

const BTW_MAP_KEY = 'ide_btw_session_map'

function loadMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(BTW_MAP_KEY) ?? '{}') } catch { return {} }
}

const state = reactive<{ exchanges: BtwExchange[]; asking: boolean; error: string }>({ exchanges: [], asking: false, error: '' })

export const btwStateView = state

/** 主会话 → 侧问会话 id 映射（localStorage 持久，换机重问即新会话）。 */
export function btwSessionOf(mainSid: string): string | null {
  return loadMap()[mainSid] ?? null
}

function bindSession(mainSid: string, btwSid: string): void {
  const map = loadMap()
  map[mainSid] = btwSid
  try { localStorage.setItem(BTW_MAP_KEY, JSON.stringify(map)) } catch { /* quota 静默 */ }
}

/** 拉取侧问会话消息 → exchanges 投影（user=问，其后最近 assistant=答；末条问无答=waiting）。 */
export async function refreshBtw(deps: Pick<BtwDeps, 'fetchMessages'>, mainSid: string): Promise<void> {
  const btwSid = btwSessionOf(mainSid)
  if (!btwSid) { state.exchanges = []; return }
  const msgs = await deps.fetchMessages(btwSid)
  const out: BtwExchange[] = []
  for (const m of msgs) {
    const content = typeof m.content === 'string' ? m.content : ''
    if (!content) continue
    if (m.role === 'user') {
      out.push({ exchangeId: `btw-${out.length}`, question: content, answer: null, at: m.createdAt ?? Date.now(), merged: false })
    } else if (m.role === 'assistant' && out.length && !out[out.length - 1]!.answer) {
      out[out.length - 1]!.answer = content
    }
  }
  state.exchanges = out
}

/** 问：确保侧问会话 → 切换→发送→切回主会话（发送用全真 sendMessage 链）。
 *  返回是否发起成功；失败写 state.error（主会话位置尽力恢复）。 */
export async function askBtw(deps: BtwDeps, question: string, chatOpts: Record<string, unknown>): Promise<boolean> {
  const q = question.trim()
  const mainSid = deps.activeSessionId()
  if (!q || !mainSid || state.asking) return false
  state.asking = true
  state.error = ''
  try {
    let btwSid = btwSessionOf(mainSid)
    if (!btwSid) {
      await deps.newChat({ ...chatOpts, title: `[btw] ${deps.mainTitle()}`.slice(0, 60) })
      btwSid = deps.activeSessionId()
      if (!btwSid) throw new Error('侧问会话创建失败')
      bindSession(mainSid, btwSid)
    }
    await deps.switchSession(btwSid)
    await deps.sendMessage(q)
    await deps.switchSession(mainSid)
    await refreshBtw(deps, mainSid)
    return true
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
    try { await deps.switchSession(mainSid) } catch { /* 恢复失败如实留在错误态 */ }
    return false
  } finally {
    state.asking = false
  }
}

/** 旁注文本（域模块 mergeBtwNote 单一事实源）；未答/已合并返回 null。 */
export function btwNoteText(x: BtwExchange): string | null {
  return mergeBtwNote(x)
}

/** 测试/复位用。 */
export function __resetBtwForTest(): void {
  state.exchanges = []
  state.asking = false
  state.error = ''
  localStorage.removeItem(BTW_MAP_KEY)
}
