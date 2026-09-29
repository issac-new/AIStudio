// overlay/custom/client/cockpit/__tests__/approvals-dedupe.test.ts
// 待裁决去重守门（视觉审计 2026-09-29 第 5 条：t_9e5c6c18 双卡）：
// 同 taskId 只留最新；不同对象互不干扰；无 taskId 回退 title 键。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { dedupePending } from '../api/approvals'
import type { PendingApprovalItem } from '../api/approvals'

const mk = (id: string, taskId: string | undefined, createdAt: number, title = id): PendingApprovalItem =>
  ({ id, kind: 'review', title, detail: '', taskId, createdAt }) as PendingApprovalItem

describe('dedupePending（待裁决同对象去重）', () => {
  it('同一 taskId 双卡只留最新（run2 t_9e5c6c18 实录形态）', () => {
    const out = dedupePending([
      mk('review:a', 't_9e5c6c18', 1000),
      mk('review:b', 't_9e5c6c18', 2000),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('review:b')
  })

  it('不同对象互不干扰；无 taskId 回退 title 键去重', () => {
    const out = dedupePending([
      mk('review:a', 't_1', 1000),
      mk('review:b', 't_2', 1000),
      mk('review:c', undefined, 900, '同名对象'),
      mk('review:d', undefined, 800, '同名对象'),
    ])
    expect(out.map((i) => i.id).sort()).toEqual(['review:a', 'review:b', 'review:c'])
  })
})
