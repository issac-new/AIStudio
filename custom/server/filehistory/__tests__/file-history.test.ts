// 双相快照守门（kimi：before/after 双相/单文件回读/整回合 diff 统计）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadTurnSnapshot, restoreFileBefore, saveTurnSnapshot, turnDiffStats } from '../file-history'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fh-'))
  process.env.HERMES_FILE_HISTORY_DIR = dir
})
afterEach(() => {
  delete process.env.HERMES_FILE_HISTORY_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('回合双相快照（kimi fileHistory）', () => {
  it('存/载；单文件回读 before（改坏兜底）；diff 三态统计', async () => {
    const snap = {
      taskId: 't1', turnIndex: 0, at: 1,
      files: [
        { path: 'a.ts', before: '旧A', after: '新A' },       // modified
        { path: 'b.ts', before: null, after: '新B' },        // added
        { path: 'c.ts', before: '旧C', after: null },        // deleted
      ],
    }
    expect(saveTurnSnapshot(snap).ok).toBe(true)
    expect(loadTurnSnapshot('t1', 0)!.files).toHaveLength(3)
    expect(restoreFileBefore('t1', 0, 'a.ts')).toBe('旧A')
    expect(restoreFileBefore('t1', 0, 'zzz.ts')).toBeNull()
    expect(turnDiffStats(snap)).toEqual({ added: 1, modified: 1, deleted: 1 })
  })

  it('turnIndex 幂等覆盖（重跑回合）；坏文件=null', async () => {
    saveTurnSnapshot({ taskId: 't2', turnIndex: 1, at: 1, files: [{ path: 'x', before: 'v1', after: 'v2' }] })
    saveTurnSnapshot({ taskId: 't2', turnIndex: 1, at: 2, files: [{ path: 'x', before: 'v2', after: 'v3' }] })
    expect(loadTurnSnapshot('t2', 1)!.at).toBe(2)  // 覆盖重落
    expect(loadTurnSnapshot('t2', 99)).toBeNull()
  })
})
