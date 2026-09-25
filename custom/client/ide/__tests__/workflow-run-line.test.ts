// Workflow run-line 投影守门（P0-5：状态机/节点进度/耗时/产物数）。
import { describe, it, expect } from 'vitest'
import { buildRunLines, type RunEvent } from '../utils/workflow-run-line'

const ev = (type: RunEvent['type'], at: number, over: Partial<RunEvent> = {}): RunEvent => ({ runId: 'r1', type, at, ...over })

describe('run-line 投影（zcode run-lines 语义）', () => {
  it('状态机推进+节点计数+产物累加+耗时', () => {
    const lines = buildRunLines([
      ev('run.started', 0),
      ev('node.done', 100, { nodeId: 'n1', artifactCount: 2 }),
      ev('node.failed', 200, { nodeId: 'n2' }),
      ev('node.done', 300, { nodeId: 'n3', artifactCount: 1 }),
      ev('run.completed', 400),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      runId: 'r1', status: 'completed', nodesDone: 2, nodesFailed: 1,
      artifacts: 3, durationMs: 400,
    })
    expect(lines[0].progressText).toBe('3/3')
  })

  it('多 run 分行；blocked/failed 终态；running 行进度含活跃节点', () => {
    const lines = buildRunLines([
      ev('run.started', 0, { runId: 'r1' }),
      ev('node.done', 10, { runId: 'r1' }),
      ev('run.started', 20, { runId: 'r2' }),
      ev('run.blocked', 30, { runId: 'r2' }),
      ev('run.started', 40, { runId: 'r3' }),
    ])
    expect(lines).toHaveLength(3)
    expect(lines.find((l) => l.runId === 'r1')!.status).toBe('running')
    expect(lines.find((l) => l.runId === 'r1')!.progressText).toBe('1/2')  // 含活跃节点
    expect(lines.find((l) => l.runId === 'r2')!.status).toBe('blocked')
    expect(lines.find((l) => l.runId === 'r3')!.status).toBe('running')
    expect(buildRunLines([])).toEqual([])
  })
})
