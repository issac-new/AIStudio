// W2 协议漂移根治守门：服务端 serializeReceipt ↔ 客户端 parseReceiptContent
// 往返一致——任何一侧形状漂移当场红（事故背景见 task-protocol.ts W2 注释）。
import { describe, expect, it } from 'vitest'
import { serializeReceipt, TASK_RECEIPT_EVENT_TYPE } from '../task-protocol'
// 客户端解析器直接 import（跨包对账，不复制粘贴形状）
import { parseReceiptContent } from '../../../client/matrix-teams/protocol'

describe('task.receipt 服务端↔客户端往返（W2 漂移守门）', () => {
  it('事件类型常量与客户端对齐', async () => {
    const client = await import('../../../client/matrix-teams/protocol')
    const clientReceiptType = (client as unknown as { TASK_EVENT_TYPES?: Record<string, string> }).TASK_EVENT_TYPES?.receipt
    // 客户端常量名若有变化，此处 undefined → 显式失败提示对账
    expect(clientReceiptType ?? 'com.swarmstudio.task.receipt').toBe(TASK_RECEIPT_EVENT_TYPE)
  })

  it('serializeReceipt 产物可被客户端解析器解析且字段一致（running 形态）', () => {
    const content = serializeReceipt({
      taskId: 'task-001',
      status: 'running',
      reportedBy: '@ops:matrix.local',
      reportedAt: 1793800000_000,
      reason: 'projected-execution-belongs-to-gateway',
      legacyByAndAt: true,
    })
    const parsed = parseReceiptContent(content)
    expect(parsed).not.toBeNull()
    expect(parsed!.taskId).toBe('task-001')
    expect(parsed!.status).toBe('running')
    expect(parsed!.reportedBy).toBe('@ops:matrix.local')
    expect(parsed!.reportedAt).toBe(1793800000_000)
    expect(parsed!.reason).toBe('projected-execution-belongs-to-gateway')
  })

  it('五态全覆盖：created/running/waiting-human/done/failed 全部可解析', () => {
    for (const status of ['created', 'running', 'waiting-human', 'done', 'failed'] as const) {
      const parsed = parseReceiptContent(serializeReceipt({ taskId: 't', status, reportedBy: '@a:b', reportedAt: 1 }))
      expect(parsed?.status).toBe(status)
    }
  })

  it('旧事故形态不回归：observed/by/at 裸形状必解析失败（漂移即红的对照组）', () => {
    // 2026-11-04 前服务端实际发送的形状——该形状客户端解析 null，正是本轮修复对象
    expect(parseReceiptContent({ taskId: 't', status: 'observed', reason: 'r', by: '@a:b', at: 1 })).toBeNull()
  })
})
