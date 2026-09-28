// 共享目录并发警告守门（multica §2.5：并发>1 警告/chat 共享警示块/单任务不出块）。
import { describe, it, expect } from 'vitest'
import { workdirAdjacency } from '../workdir-adjacency'

describe('workDir 并发警告（multica 语义）', () => {
  it('同目录两 task→并发警告；chat+task→chat 共享警示块；单任务不出块', () => {
    const w = workdirAdjacency([
      { taskId: 't1', workDir: '/w', kind: 'task', startedAt: 0 },
      { taskId: 't2', workDir: '/w', kind: 'task', startedAt: 1 },
      { taskId: 'c1', workDir: '/w2', kind: 'chat', startedAt: 2 },
      { taskId: 't3', workDir: '/w2', kind: 'task', startedAt: 3 },
      { taskId: 't4', workDir: '/w3', kind: 'task', startedAt: 4 },
    ])
    expect(w).toHaveLength(2)  // /w3 单任务不出块
    expect(w[0]).toMatchObject({ workDir: '/w', concurrent: true, chatShared: false })
    expect(w[0].detail).toContain('写互踩')
    expect(w[1]).toMatchObject({ workDir: '/w2', concurrent: false, chatShared: true })
    expect(workdirAdjacency([])).toEqual([])
  })
})
