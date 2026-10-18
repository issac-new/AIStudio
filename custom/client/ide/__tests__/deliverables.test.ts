// G4 交付物聚合守门：计划/验证扫描/产物文件/摘要不虚构。
import { describe, it, expect } from 'vitest'
import {
  latestPlanSummary, collectVerification, collectArtifacts, buildDeliverables, deliverableSummaryMarkdown,
  type DeliverableMessageLike,
} from '../utils/deliverables'
import type { RunChangesDigest } from '../api/runs'

const plan = {
  session_id: 's', run_id: 'r', plan_id: 'p', revision: 1, execution_state: 'running' as const,
  created_at: 1, updated_at: 2,
  plan: [
    { id: '1', step: '读代码', status: 'completed' as const },
    { id: '2', step: '写实现', status: 'in_progress' as const },
    { id: '3', step: '跑测试', status: 'pending' as const },
  ],
}

function msg(over: Partial<DeliverableMessageLike>): DeliverableMessageLike {
  return { id: 'm', role: 'assistant', content: '', timestamp: 0, ...over }
}

const changes: RunChangesDigest[] = [
  {
    runId: 'run-2', changeId: 'c2', fileCount: 2, additions: 10, deletions: 1,
    files: [
      { id: 1, changeId: 'c2', path: '/w/report.md', additions: 8, deletions: 0, changeType: 'added' },
      { id: 2, changeId: 'c2', path: '/w/src/a.ts', additions: 2, deletions: 1, changeType: 'modified' },
    ],
  },
  {
    runId: 'run-1', changeId: 'c1', fileCount: 1, additions: 1, deletions: 0,
    files: [{ id: 3, changeId: 'c1', path: '/w/table.xlsx', additions: 1, deletions: 0, changeType: 'added' }],
  },
]

describe('latestPlanSummary', () => {
  it('取最近一次计划，统计完成数与未完成步骤', () => {
    const s = latestPlanSummary([msg({ taskPlan: plan as never }), msg({})])
    expect(s).toMatchObject({ done: 1, total: 3, pct: 33 })
    expect(s?.pending).toEqual(['写实现', '跑测试'])
  })

  it('无计划返回 null；空计划忽略', () => {
    expect(latestPlanSummary([])).toBeNull()
    expect(latestPlanSummary([msg({ taskPlan: { ...plan, plan: [] } as never })])).toBeNull()
  })
})

describe('collectVerification', () => {
  it('命中测试/构建/类型检查命令，新→旧排序，状态映射', () => {
    const rows = collectVerification([
      msg({ id: 'a', role: 'tool', toolName: 'bash', toolArgs: { command: 'npm test' }, toolStatus: 'done', timestamp: 1 }),
      msg({ id: 'b', role: 'tool', toolName: 'bash', toolArgs: { command: 'ls -la' }, toolStatus: 'done', timestamp: 2 }),
      msg({ id: 'c', role: 'tool', toolName: 'exec', toolArgs: { command: 'npm run build' }, toolStatus: 'error', timestamp: 3 }),
      msg({ id: 'd', role: 'tool', toolName: 'bash', toolArgs: { command: 'vue-tsc --noEmit' }, toolStatus: 'running', timestamp: 4 }),
    ])
    expect(rows.map(r => r.id)).toEqual(['d', 'c', 'a'])
    expect(rows.map(r => r.status)).toEqual(['running', 'error', 'done'])
    expect(rows[2].command).toBe('npm test')
  })

  it('非 shell 工具/命中关键词但非测试命令不计；命令超长截断', () => {
    const long = `pytest ${'x'.repeat(300)}`
    const rows = collectVerification([
      msg({ role: 'tool', toolName: 'read', toolArgs: { command: 'npm test' } }),
      msg({ role: 'tool', toolName: 'bash', toolArgs: { command: 'echo hello' } }),
      msg({ role: 'tool', toolName: 'bash', toolArgs: { command: long } }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].command.length).toBe(160)
  })

  it('toolArgs 为字符串/数组也能取命令', () => {
    expect(collectVerification([msg({ role: 'tool', toolName: 'bash', toolArgs: 'go test ./...' })])[0].command).toBe('go test ./...')
    expect(collectVerification([msg({ role: 'tool', toolName: 'bash', toolArgs: ['cargo', 'test'] })])[0].command).toBe('cargo test')
  })
})

describe('collectArtifacts / buildDeliverables / summary', () => {
  it('只收文档/数据/演示/静态资源扩展名，去重', () => {
    const arts = collectArtifacts(changes)
    expect(arts.map(a => a.path)).toEqual(['/w/report.md', '/w/table.xlsx'])
  })

  it('快照组合完整；摘要包含计划/变更/验证/产物且不虚构', () => {
    const snap = buildDeliverables({
      messages: [msg({ taskPlan: plan as never }), msg({ role: 'tool', toolName: 'bash', toolArgs: { command: 'vitest run' }, toolStatus: 'done' })],
      changes,
    })
    expect(snap.plan?.total).toBe(3)
    expect(snap.verification).toHaveLength(1)
    expect(snap.artifacts).toHaveLength(2)
    const md = deliverableSummaryMarkdown(snap)
    expect(md).toContain('计划（1/3，33%）')
    expect(md).toContain('变更（2 轮，3 文件）')
    expect(md).toContain('验证（1 条）')
    expect(md).toContain('产物文件（2）')
    expect(md).not.toContain('已通过')
  })

  it('空数据摘要诚实标注无变更/未捕获命令', () => {
    const md = deliverableSummaryMarkdown(buildDeliverables({ messages: [], changes: [] }))
    expect(md).toContain('本轮无文件变更')
    expect(md).toContain('未捕获到测试/构建命令')
  })
})
