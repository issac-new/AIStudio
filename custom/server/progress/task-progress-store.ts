/**
 * 引擎会话进度存储（研发进度可感知链·订阅面）。
 *
 * projection 事件流是会话数据的唯一来源（无常驻查询存储）：本模块订阅
 * zcode 投影 runtime 的 session.upserted/removed，维护 sessionId → 最新
 * ProjectionSession 的有界映射，供 task-progress-analytics 按任务关联。
 *
 * 冷启动如实声明：服务重启后本存储为空，需等投影事件再次流入（runtime 对已
 * watch 的 workspace 会重订阅，引擎推送当前快照后即恢复）——不是数据丢失，
 * 是恢复延迟；恢复期间进度端点如实返回「会话面暂缺」，不编造。
 */
import type { ProjectionSession } from '../zcode/session-projection'

const MAX_SESSIONS = 500

interface ProgressRuntimeLike {
  onEvent(cb: (event: { type: string; sessionId?: string; session?: ProjectionSession }) => void): { dispose(): void }
}

let store: Map<string, ProjectionSession> | null = null
let disposers: Array<{ dispose(): void }> = []

/** 测试用：直接注入/清空存储。 */
export function setSessionStoreForTests(sessions: Map<string, ProjectionSession> | null): void {
  store = sessions
}

/** 订阅投影事件流并返回当前存储（幂等：多次调用共享一个存储）。 */
export function getSessionStore(runtime: ProgressRuntimeLike): Map<string, ProjectionSession> {
  if (store) return store
  const map = new Map<string, ProjectionSession>()
  const disposer = runtime.onEvent((event) => {
    if (event.type === 'session.upserted' && event.sessionId && event.session) {
      map.set(event.sessionId, event.session)
      // 有界：按最后活跃淘汰最旧（引擎侧会话数大时防内存无界）。
      if (map.size > MAX_SESSIONS) {
        const oldest = [...map.entries()].sort((a, b) => (a[1].lastActivityAt ?? 0) - (b[1].lastActivityAt ?? 0))[0]
        if (oldest) map.delete(oldest[0])
      }
    } else if (event.type === 'session.removed' && event.sessionId) {
      map.delete(event.sessionId)
    }
  })
  disposers.push(disposer)
  store = map
  return map
}

/** 测试用：解除订阅并清空。 */
export function resetSessionStoreForTests(): void {
  for (const d of disposers) d.dispose()
  disposers = []
  store = null
}
