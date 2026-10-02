// A4 守门（KG 演化治理 2026-10-02）：板级 KG 快照/列表/回滚/pre-rollback/prune/marker
// 不动语义边界。tmpdir + env 显式覆盖，无真实 bridge 依赖。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kgver-'))
  process.env.SEMANTICA_BOARD_KG_DIR = join(dir, 'kgdir')
  process.env.KG_VERSION_DIR = join(dir, 'versions')
  process.env.GOVERNANCE_BOARD_SYNC_MARKER_DIR = join(dir, 'markers')
})
afterEach(() => {
  for (const k of ['SEMANTICA_BOARD_KG_DIR', 'KG_VERSION_DIR', 'KG_SNAPSHOT_MAX', 'GOVERNANCE_BOARD_SYNC_MARKER_DIR']) {
    delete process.env[k]
  }
  rmSync(dir, { recursive: true, force: true })
})

function writeKg(slug: string, nodes: string[]): void {
  const file = join(process.env.SEMANTICA_BOARD_KG_DIR!, `board-${slug}.json`)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, JSON.stringify({
    nodes: nodes.map((id) => ({ id, type: 'entity', properties: { name: id } })),
    edges: [],
  }))
}
const kgOf = (slug: string) => JSON.parse(readFileSync(join(process.env.SEMANTICA_BOARD_KG_DIR!, `board-${slug}.json`), 'utf8')) as { nodes: Array<{ id: string }> }

describe('snapshotBoardKg / listBoardSnapshots', () => {
  it('快照落盘 + 列表 ts 降序带大小与节点数；KG 缺席返回 null', async () => {
    const ver = await import('../kg-version')
    expect(ver.snapshotBoardKg('b1')).toBeNull()  // 当前 KG 文件缺席
    writeKg('b1', ['a', 'b'])
    const s1 = ver.snapshotBoardKg('b1', 1000)
    writeKg('b1', ['a', 'b', 'c'])
    const s2 = ver.snapshotBoardKg('b1', 2000)
    expect(s1 && s2).toBeTruthy()
    const list = ver.listBoardSnapshots('b1')
    expect(list.map((x) => x.ts)).toEqual([2000, 1000])  // 降序（新→旧）
    expect(list[0].nodes).toBe(3)
    expect(list[1].nodes).toBe(2)
    expect(list[0].bytes).toBeGreaterThan(0)
    expect(list.map((x) => x.file)).toEqual([s2, s1])
  })

  it('prune：KG_SNAPSHOT_MAX 可调，超限裁旧（kg-* 与 pre-rollback-* 各自独立裁）', async () => {
    process.env.KG_SNAPSHOT_MAX = '3'
    const ver = await import('../kg-version')
    writeKg('b1', ['a'])
    for (let i = 1; i <= 5; i++) ver.snapshotBoardKg('b1', i * 1000)
    let files = readdirSync(join(process.env.KG_VERSION_DIR!, 'board-b1')).filter((f) => /^kg-\d+\.json$/.test(f))
    expect(files.sort()).toEqual(['kg-3000.json', 'kg-4000.json', 'kg-5000.json'])  // 保留最新 3 份（readdir 字母序）

    // pre-rollback 同样受上限约束
    for (let i = 1; i <= 4; i++) {
      writeFileSync(join(process.env.KG_VERSION_DIR!, 'board-b1', `pre-rollback-${i * 100}.json`), '{}')
    }
    ver.pruneBoardSnapshots('b1')
    files = readdirSync(join(process.env.KG_VERSION_DIR!, 'board-b1')).filter((f) => /^pre-rollback-/.test(f))
    expect(files).toHaveLength(3)
    expect(files).toContain('pre-rollback-300.json')
  })
})

describe('rollbackBoardKg', () => {
  it('回滚到旧快照：当前先另存 pre-rollback，再覆盖；marker 文件不动（语义边界）', async () => {
    const ver = await import('../kg-version')
    const markerFile = join(process.env.GOVERNANCE_BOARD_SYNC_MARKER_DIR!, 'board-sync-b1.json')
    mkdirSync(process.env.GOVERNANCE_BOARD_SYNC_MARKER_DIR!, { recursive: true })
    writeFileSync(markerFile, '["t1","t2"]')

    writeKg('b1', ['v1'])
    ver.snapshotBoardKg('b1', 1000)
    writeKg('b1', ['v2-a', 'v2-b'])
    ver.snapshotBoardKg('b1', 2000)
    writeKg('b1', ['v3-a', 'v3-b', 'v3-c'])

    const r = ver.rollbackBoardKg('b1', 1000, 3000)
    expect(r.ok).toBe(true)
    expect(r.snapshot).toContain('kg-1000.json')
    expect(r.preRollback).toContain('pre-rollback-3000.json')
    expect(kgOf('b1').nodes.map((n) => n.id)).toEqual(['v1'])            // 回到 v1 状态
    expect(existsSync(r.preRollback as string)).toBe(true)
    expect((JSON.parse(readFileSync(r.preRollback as string, 'utf8')) as { nodes: string[] }).nodes).toHaveLength(3)  // v3 前态可再回滚
    expect(readFileSync(markerFile, 'utf8')).toBe('["t1","t2"]')  // marker 不动：图状态与摄取进度两层

    // 用 pre-rollback 无法经 listBoardSnapshots 看到（列表只收 kg-*），但可直接再回滚：
    const again = ver.rollbackBoardKg('b1', 2000, 4000)
    expect(again.ok).toBe(true)
    expect(kgOf('b1').nodes.map((n) => n.id)).toEqual(['v2-a', 'v2-b'])
  })

  it('快照不存在 / 当前 KG 缺席 → ok:false 附原因', async () => {
    const ver = await import('../kg-version')
    writeKg('b1', ['a'])
    ver.snapshotBoardKg('b1', 1000)
    expect(ver.rollbackBoardKg('b1', 999, 2000).ok).toBe(false)
    writeKg('b2', ['a'])
    ver.snapshotBoardKg('b2', 1000)
    rmSync(join(process.env.SEMANTICA_BOARD_KG_DIR!, 'board-b2.json'))
    const r = ver.rollbackBoardKg('b2', 1000, 2000)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('缺席')
  })
})
