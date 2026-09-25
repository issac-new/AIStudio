// overlay/sessionfork 域：会话 fork（qoder Q12 会话 fork 吸收，矩阵 §3.2 qoder P2）。
//
// qoder 语义（会话 fork——在任意消息处开新分支）：
// - **分叉点**：atIndex（0-based，前缀消息 [0..atIndex] 进新会话）；
// - **谱系**：新会话记 parentSessionId+forkPoint，构成 fork 树；
// - **树投影**：childrenOf/rootOf（追溯到根）。
// 衔接 session-sections（分节）与 session-archive（归档）：本层=fork 语义纯函数。
export interface ForkableSession {
  sessionId: string
  parentSessionId?: string
  forkPoint?: number
  messageCount: number
}

export interface ForkInput {
  source: ForkableSession
  /** 新会话 id（调用方生成）。 */
  newSessionId: string
  /** 分叉点：前缀消息 [0..atIndex] 进新会话。 */
  atIndex: number
  now: number
}

/** fork 校验+新会话构造（qoder 语义）。 */
export function forkSession(input: ForkInput): ForkableSession {
  const { source, newSessionId, atIndex } = input
  if (atIndex < 0 || atIndex >= source.messageCount) {
    throw new RangeError('fork point out of range')
  }
  return {
    sessionId: newSessionId,
    parentSessionId: source.sessionId,
    forkPoint: atIndex,
    messageCount: atIndex + 1, // 前缀 [0..atIndex] 共 atIndex+1 条
  }
}

/** fork 树：直接子会话列表。 */
export function childrenOf(
  sessions: readonly ForkableSession[],
  parentId: string,
): ForkableSession[] {
  return sessions.filter((s) => s.parentSessionId === parentId)
}

/** 谱系追溯：沿 parent 链到根（防环：最多 sessions.length 步）。 */
export function rootOf(
  sessions: readonly ForkableSession[],
  sessionId: string,
): string {
  const byId = new Map(sessions.map((s) => [s.sessionId, s]))
  let cur = byId.get(sessionId)
  for (let i = 0; i < sessions.length && cur?.parentSessionId; i += 1) {
    cur = byId.get(cur.parentSessionId)
  }
  return cur?.sessionId ?? sessionId
}
