// overlay[zcode] R5 吸收 #5：checkpoint/rewind 四恢复选项（claude-code 概念级，自研组合）。
//
// 概念来源：claude-code checkpoint/rewind 四恢复选项（代码+对话/仅对话/仅代码/
// Summarize from here）——专有许可，只搬概念禁拷实现；zcode 底座已有两半原语：
//   - editUserQuery.workspaceMode（'rewind'=先安全恢复该轮文件再切会话分支；
//     'preserve'=仅切会话分支）→ 前两档（command.ts editUserQuery 段注释）
//   - applyFileRewind（workspace-only 文件撤销，不截断聊天历史）→ 第三档
//   - sendText（from 指定轮起 summarize）→ 第四档
// 本层做四档语义的单一事实源组合 + 幂等命令信封（复用 mention-dispatch 的
// uuidV7Like）。许可红线：无任何 claude-code 代码/提示词拷贝，纯概念对齐。
import { uuidV7Like } from './mention-dispatch'

export const CHECKPOINT_RECOVERY_MODES = ['code-and-conversation', 'conversation-only', 'code-only', 'summarize-from-here'] as const
export type CheckpointRecoveryMode = (typeof CHECKPOINT_RECOVERY_MODES)[number]

export interface RecoveryTarget {
  workspacePath: string
  sessionId: string
  /** 目标行（回退点）：zcode conversationRowTarget 契约 {rowId, entityId}。 */
  rowId: number
  entityId: string
  clientId: string
  /** summarize-from-here 档的摘要落点提示（原查询文本，摘要指令引用）。 */
  originalQueryText?: string
}

export interface CommandEnvelopeOut {
  commandId: string
  clientId: string
  sessionId: string
  type: string
  payload: Record<string, unknown>
  issuedAt: number
}

/** 四档 → zcode v4 命令信封（可能两条：summarize 档先切分支再发摘要指令）。 */
export function buildRecoveryEnvelopes(mode: CheckpointRecoveryMode, target: RecoveryTarget, now: number): CommandEnvelopeOut[] {
  const rowTarget = { rowId: target.rowId, entityId: target.entityId }
  const base = { clientId: target.clientId, sessionId: target.sessionId }
  switch (mode) {
    case 'code-and-conversation':
      // rewind：先安全恢复该轮文件，再截断会话分支（双恢复）。
      return [{ commandId: uuidV7Like(), ...base, type: 'editUserQuery', issuedAt: now,
                 payload: { target: rowTarget, newText: target.originalQueryText ?? '', workspaceMode: 'rewind' } }]
    case 'conversation-only':
      // preserve：只切会话分支，工作区不动。
      return [{ commandId: uuidV7Like(), ...base, type: 'editUserQuery', issuedAt: now,
                 payload: { target: rowTarget, newText: target.originalQueryText ?? '', workspaceMode: 'preserve' } }]
    case 'code-only':
      // 文件撤销，不截断聊天历史。
      return [{ commandId: uuidV7Like(), ...base, type: 'applyFileRewind', issuedAt: now,
                 payload: { target: rowTarget } }]
    case 'summarize-from-here':
      // 先 preserve 切分支（保原文重发位），随后一条摘要指令：从该点压缩为交接摘要。
      return [
        { commandId: uuidV7Like(), ...base, type: 'editUserQuery', issuedAt: now,
          payload: { target: rowTarget, newText: target.originalQueryText ?? '', workspaceMode: 'preserve' } },
        { commandId: uuidV7Like(), ...base, type: 'sendText', issuedAt: now + 1,
          payload: { text: `请把该点之后的会话压缩为一段交接摘要：已完成/未完成/下一步/坑点。保留可验证锚点（file:line、命令、路径），不要展开对话原文。`, requestedDelivery: 'startNow' } },
      ]
  }
}

export function isCheckpointRecoveryMode(v: unknown): v is CheckpointRecoveryMode {
  return typeof v === 'string' && (CHECKPOINT_RECOVERY_MODES as readonly string[]).includes(v)
}
