// W3 taskmodel 读模型派生：纯函数正反例（缺字段=缺席不猜）。
import { describe, expect, it } from 'vitest'
import { deriveTaskModel } from '../taskmodel'
import type { KanbanTaskFastDetail } from '../../services/hermes/kanban-task-fast'

describe('deriveTaskModel（W3 任务模型 v1）', () => {
  it('完整面：userGoal/workflowVersion/runs/artifacts/conversation 各就位', () => {
    const m = deriveTaskModel({
      task: { id: 't-1', title: '反馈分析', body: '按聚类生成建议\n更多细节', session_id: 'sess-9', workflow_template_id: 'feedback-analysis@1.3' },
      latest_summary: 'done',
      parents: [], children: [], comments: [], events: [],
      runs: [
        { id: 101, status: 'completed', outcome: 'completed', summary: '首轮', started_at: 1, ended_at: 2, metadata: { artifacts: ['runs/r1/report.md'] } },
        { id: 102, status: 'completed', outcome: 'completed', summary: '重试', started_at: 3, ended_at: 4, metadata: { completion_receipt: { artifacts: [{ path: 'evidence/tap.xml', sha256: 'ab' }] } } },
      ],
    } as unknown as KanbanTaskFastDetail)
    expect(m!.schemaVersion).toBe(1)
    expect(m!.userGoal).toContain('反馈分析')
    expect(m!.workflowVersion).toBe('feedback-analysis@1.3')
    expect(m!.runs).toHaveLength(2)
    expect(m!.runs[0].runId).toBe('101')
    expect(m!.artifactRefs).toEqual([
      { kind: 'metadata-artifact', ref: 'runs/r1/report.md' },
      { kind: 'receipt-artifact', ref: 'evidence/tap.xml', sha256: 'ab' },
    ])
    expect(m!.conversation.sessionId).toBe('sess-9')
    expect(m!.available).toEqual({ workflowVersion: true, inputVersions: false, artifacts: true, runs: true })
  })

  it('缺面如实缺席：无 workflow/conversation/artifacts 的 available 全 false', () => {
    const m = deriveTaskModel({
      task: { id: 't-2', title: 'x', body: '' },
      latest_summary: null,
      parents: [], children: [], comments: [], events: [], runs: [],
    } as unknown as KanbanTaskFastDetail)
    expect(m!.workflowVersion).toBeUndefined()
    expect(m!.conversation.sessionId).toBeNull()
    expect(m!.available).toEqual({ workflowVersion: false, inputVersions: false, artifacts: false, runs: false })
    // 空输入面=missing 占位（不假装有输入）
    expect(m!.inputRefs).toEqual([{ type: 'missing', id: 't-2:none' }])
  })

  it('输入引用：task body 即输入面（attachments 快道不含，如实缺席版本）', () => {
    const m = deriveTaskModel({
      task: { id: 't-3', title: 'x', body: '第一段输入' },
      latest_summary: null, parents: [], children: [], comments: [], events: [], runs: [],
    } as unknown as KanbanTaskFastDetail)
    expect(m!.inputRefs[0]).toEqual({ type: 'task-body', id: 't-3:body' })
    expect(m!.available.inputVersions).toBe(false) // attachments 无版本列——声明缺席
  })

  it('非对象/无 id → null（不猜）', () => {
    expect(deriveTaskModel({ task: {} } as never)).toBeNull()
    expect(deriveTaskModel(null as never)).toBeNull()
  })
})
