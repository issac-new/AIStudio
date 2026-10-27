// 批三 D1 守门：LWW-Register 合并协议——(rev,by) 全序比较、旧写拒绝返回现存、
// 新写胜出落盘、同 rev 字典序破平；读取侧字段保真（by/at/rev 不被剥——探查带出的
// 批二真缺陷回归钉）；REST 广播事件（HTTP 投影上 applied:false 如实回显）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listAnnotations, upsertAnnotation } from '../mapnotes-store'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mapnotes-lww-'))
  process.env.MAP_NOTES_DIR = dir
})
afterEach(() => {
  delete process.env.MAP_NOTES_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('mapnotes LWW-Register', () => {
  it('高 rev 胜出落盘；低 rev 旧写被拒返回现存条目（applied:false）', () => {
    const w1 = upsertAnnotation('a1b2c3d4e5', { nodeId: 'n1', note: '第一版', checked: false, by: 'alice', rev: 3 })
    expect(w1.applied).toBe(true)
    // 旧写（rev 更低）到达：拒绝，返回现存
    const stale = upsertAnnotation('a1b2c3d4e5', { nodeId: 'n1', note: '过期写', checked: true, by: 'bob', rev: 1 })
    expect(stale.applied).toBe(false)
    expect(stale.annotation.note).toBe('第一版')
    expect(stale.annotation.by).toBe('alice')
    // 磁盘未变
    expect(listAnnotations('a1b2c3d4e5')[0].note).toBe('第一版')
    // 更高 rev 新写胜出
    const fresh = upsertAnnotation('a1b2c3d4e5', { nodeId: 'n1', note: 'bob 新版', checked: true, by: 'bob', rev: 5 })
    expect(fresh.applied).toBe(true)
    expect(listAnnotations('a1b2c3d4e5')[0].note).toBe('bob 新版')
  })

  it('同 rev 以 by 字典序破平（确定性全序）；读取侧字段保真（by/at/rev 不剥）', () => {
    upsertAnnotation('a1b2c3d4e5', { nodeId: 'n2', note: 'v1', checked: false, by: 'alice', rev: 2, at: 100 })
    const tie = upsertAnnotation('a1b2c3d4e5', { nodeId: 'n2', note: 'v2', checked: true, by: 'zoe', rev: 2, at: 200 })
    expect(tie.applied).toBe(true) // zoe > alice 字典序
    const lost = upsertAnnotation('a1b2c3d4e5', { nodeId: 'n2', note: 'v3', checked: false, by: 'alice', rev: 2, at: 300 })
    expect(lost.applied).toBe(false)
    const row = listAnnotations('a1b2c3d4e5')[0]
    expect(row.by).toBe('zoe')
    expect(row.at).toBe(200)
    expect(row.rev).toBe(2)
    // 坏文件字段缺失条目被过滤（诚实空态），合法字段全保真
    writeFileSync(join(dir, 'f1e2d3c4b5.json'), JSON.stringify({ annotations: [{ nodeId: 'x', note: 'y', checked: true, by: 'z', at: 1, rev: 1 }, { nodeId: 'broken' }] }), 'utf8')
    expect(listAnnotations('f1e2d3c4b5').length).toBe(1)
  })
})
