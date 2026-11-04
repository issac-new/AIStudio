// W4：input_manifest（补丁 750 写侧）→ taskmodel 读侧派生（inputVersions 据实）。
import { describe, expect, it } from 'vitest'
import { deriveTaskModel } from '../taskmodel'
import type { KanbanTaskFastDetail } from '../../services/hermes/kanban-task-fast'

const manifest = {
  bodySha256: 'ab12...cd',
  attachments: [
    { id: 1, filename: 'feedback.csv', size: 2048 },
    { id: 2, filename: 'spec.md', size: 512 },
  ],
}

describe('deriveTaskModel × input_manifest（W4）', () => {
  it('run 带 manifest：inputRefs 派生 body sha256+附件清单，inputVersions=true', () => {
    const m = deriveTaskModel({
      task: { id: 't-9', title: 'x', body: '输入正文' },
      latest_summary: null, parents: [], children: [], comments: [], events: [],
      runs: [{ id: 5, status: 'running', started_at: 1, metadata: { input_manifest: manifest } }],
    } as unknown as KanbanTaskFastDetail)
    expect((m as unknown as Record<string, unknown>).inputVersions).toBeUndefined() // 无顶层字段（防误读）
    expect(m!.available.inputVersions).toBe(true)
    expect(m!.inputRefs[0]).toEqual({ type: 'task-body', id: 't-9:body', sha256: 'ab12...cd' })
    expect(m!.inputRefs[1]).toEqual({ type: 'attachment', id: '1', filename: 'feedback.csv', size: 2048 })
    expect(m!.inputRefs[2]).toEqual({ type: 'attachment', id: '2', filename: 'spec.md', size: 512 })
  })

  it('旧 run 无 manifest：回落 task-body 无 sha，inputVersions=false（如实缺席）', () => {
    const m = deriveTaskModel({
      task: { id: 't-old', title: 'x', body: 'b' },
      latest_summary: null, parents: [], children: [], comments: [], events: [],
      runs: [{ id: 1, status: 'completed', started_at: 1, metadata: null }],
    } as unknown as KanbanTaskFastDetail)
    expect(m!.available.inputVersions).toBe(false)
    expect(m!.inputRefs).toEqual([{ type: 'task-body', id: 't-old:body' }])
  })
})
