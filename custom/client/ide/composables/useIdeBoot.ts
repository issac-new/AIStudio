// overlay/custom/client/ide/composables/useIdeBoot.ts
// IDE 启动编排：会话装载、?session= 落位、未知深链的兼容切换。
//
// 背景（2026-10-18 回归）：IdeShell 的 ?session watcher 与 IdeChatPane 的
// onMounted 各自调 loadSessions；随后 ensureSession 又按 agent 新建会话，
// 把深链目标顶掉。这里把「什么时候 load、什么时候 switch」收成一个入口，
// 会话装载在应用内只跑一次。
import { useChatStore } from '@/stores/hermes/chat'
import { resolveBootSession, type BootSessionResolution } from '../utils/sessionBoot'

// 模块级在途 Promise：IdeShell 与 IdeChatPane 同时调用也只发一次 loadSessions。
let sessionsLoadPromise: Promise<void> | null = null

export function useIdeBoot() {
  const chat = useChatStore()

  async function ensureSessions(): Promise<void> {
    if (chat.sessionsLoaded) return
    if (!sessionsLoadPromise) {
      sessionsLoadPromise = Promise.resolve(chat.loadSessions?.(chat.sessionProfileFilter))
        .then(() => undefined)
        .finally(() => { sessionsLoadPromise = null })
    }
    await sessionsLoadPromise
  }

  /** ?session=：未装载先装载；命中则按 resolveBootSession 落位，未命中保留切换容错。 */
  async function resolveSessionQuery(querySession: unknown): Promise<BootSessionResolution> {
    const id = typeof querySession === 'string' ? querySession.trim() : ''
    if (!id) return { matched: false, switchTo: null }
    await ensureSessions()
    const resolution = resolveBootSession(
      id,
      chat.sessions.map(session => session.id),
      chat.activeSessionId ?? null,
    )
    if (resolution.matched) {
      if (resolution.switchTo) await chat.switchSession?.(resolution.switchTo)
      return resolution
    }
    // 未知会话：仍交给 store 容错切换（旧行为），由 IdeChatPane 决定是否建草稿。
    await chat.switchSession?.(id)
    return resolution
  }

  return { ensureSessions, resolveSessionQuery }
}
