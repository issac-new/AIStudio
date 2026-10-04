// P5 replay-theater 域单测：投影口径（前后缀裁剪/增删账/added-removed）+ 枚举。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildReplayTimeline, projectFile, listTurnSnapshots } from '../replay-theater'
import type { TurnSnapshot } from '../file-history'

const snap = (turnIndex: number, files: TurnSnapshot['files'], at = 1700000000000 + turnIndex): TurnSnapshot => ({ taskId: 's1', turnIndex, at, files })

describe('P5 projectFile 朴素行对照', () => {
  it('改动：公共前后缀裁剪，中段算增删', () => {
    const v = projectFile('a.ts', 'l1\nl2\nl3\nl4', 'l1\nX\nY\nl4')
    expect(v.kind).toBe('changed')
    expect(v.contextBefore).toBe(1)
    expect(v.contextAfter).toBe(1)
    expect(v.beforeExcerpt).toEqual(['l2', 'l3'])
    expect(v.afterExcerpt).toEqual(['X', 'Y'])
    expect(v.addedLines).toBe(2)
    expect(v.deletedLines).toBe(2)
  })
  it('新增/删除文件：单侧缺席如实分型', () => {
    expect(projectFile('n.ts', null, 'a\nb')).toMatchObject({ kind: 'added', addedLines: 2, deletedLines: 0 })
    expect(projectFile('d.ts', 'a\nb', null)).toMatchObject({ kind: 'removed', addedLines: 0, deletedLines: 2 })
  })
  it('内容未变：零增删', () => {
    expect(projectFile('s.ts', 'x\ny', 'x\ny')).toMatchObject({ addedLines: 0, deletedLines: 0 })
  })
})

describe('P5 buildReplayTimeline', () => {
  it('轮序升序；汇总账；空快照=空 steps（如实）', () => {
    const t = buildReplayTimeline('s1', [snap(2, [{ path: 'b', before: null, after: 'x' }]), snap(1, [{ path: 'a', before: 'p', after: 'q' }])])
    expect(t.steps.map((s) => s.turnIndex)).toEqual([1, 2])
    expect(t.steps[0]!.totalAdded + t.steps[0]!.totalDeleted).toBeGreaterThan(0)
    expect(buildReplayTimeline('s1', []).steps).toEqual([])
  })
})

describe('P5 listTurnSnapshots', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'replay-test-'))
    process.env.HERMES_FILE_HISTORY_DIR = dir
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.HERMES_FILE_HISTORY_DIR
  })
  it('按 taskId 枚举（安全转义）+ 排序 + 坏档跳过 + 不串号', () => {
    writeFileSync(join(dir, 's1-t1.json'), JSON.stringify(snap(1, [])))
    writeFileSync(join(dir, 's1-t2.json'), JSON.stringify(snap(2, [])))
    writeFileSync(join(dir, 's1-tbad.json'), '{bad')
    writeFileSync(join(dir, 'other-t1.json'), JSON.stringify(snap(1, [], 1)))
    const list = listTurnSnapshots('s1')
    expect(list.map((s) => s.turnIndex)).toEqual([1, 2])
    expect(listTurnSnapshots('s/1')).toHaveLength(0) // 特殊字符 taskId 落盘即转义，原始名查不到（如实）
  })
})
