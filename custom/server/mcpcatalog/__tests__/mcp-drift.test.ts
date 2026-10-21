// AGT 吸收轮 D（2026-10-21）：MCP/插件配置漂移单测——基线/比对/三类差异。
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectMcpDrift, diffDrift, snapshotMcpDrift } from '../mcp-drift'

const root = mkdtempSync(join(tmpdir(), 'mcp-drift-'))

function setup(name: string): { mcpConfigDir: string; hermesHome: string; driftDir: string } {
  const mcpConfigDir = join(root, name, 'mcp-config')
  const hermesHome = join(root, name, 'hermes')
  const driftDir = join(root, name, 'drift')
  mkdirSync(mcpConfigDir, { recursive: true })
  mkdirSync(hermesHome, { recursive: true })
  process.env.HERMES_MCP_DRIFT_DIR = driftDir
  return { mcpConfigDir, hermesHome, driftDir }
}

afterEach(() => {
  delete process.env.HERMES_MCP_DRIFT_DIR
})

describe('diffDrift（纯函数比对）', () => {
  const baseline = [
    { face: 'mcp-server' as const, key: 'a', hash: 'h1', detail: '1B' },
    { face: 'mcp-server' as const, key: 'b', hash: 'h2', detail: '1B' },
  ]
  it('新增/变更/移除三类齐报', () => {
    const current = [
      { face: 'mcp-server' as const, key: 'b', hash: 'changed', detail: '1B' },
      { face: 'mcp-server' as const, key: 'c', hash: 'h3', detail: '1B' },
    ]
    const d = diffDrift(baseline, current)
    expect(d).toEqual([
      { face: 'mcp-server', key: 'a', change: 'removed', detail: '1B' },
      { face: 'mcp-server', key: 'b', change: 'changed', detail: 'h2→changed' },
      { face: 'mcp-server', key: 'c', change: 'added', detail: '1B' },
    ])
  })
  it('无差异 → 空', () => {
    expect(diffDrift(baseline, baseline)).toEqual([])
  })
})

describe('collectMcpDrift（基线闭环）', () => {
  it('无基线=合法空态；落基线后变更三类现形', () => {
    const { mcpConfigDir, hermesHome } = setup('t1')
    writeFileSync(join(mcpConfigDir, 'a.json'), JSON.stringify({ name: 'a', timeoutMs: 30_000 }))
    mkdirSync(join(hermesHome, 'plugins'), { recursive: true })
    writeFileSync(join(hermesHome, 'plugins', 'foo.json'), '{"v":1}')

    // 无基线：不算漂移
    let face = collectMcpDrift({ mcpConfigDir, hermesHome })
    expect(face.ok).toBe(true)
    expect(face.hasBaseline).toBe(false)
    expect(face.drift).toEqual([])

    // 落基线
    const snap = snapshotMcpDrift({ mcpConfigDir, hermesHome })
    expect(snap.ok).toBe(true)
    expect(snap.entries).toBe(2)

    // 变更 a.json + 新增 b.json + 移除插件
    writeFileSync(join(mcpConfigDir, 'a.json'), JSON.stringify({ name: 'a', timeoutMs: 60_000 }))
    writeFileSync(join(mcpConfigDir, 'b.json'), JSON.stringify({ name: 'b' }))
    const { unlinkSync } = require('fs') as typeof import('fs')
    unlinkSync(join(hermesHome, 'plugins', 'foo.json'))

    face = collectMcpDrift({ mcpConfigDir, hermesHome })
    const changes = Object.fromEntries(face.drift.map((d) => [`${d.key}:${d.change}`, true]))
    expect(changes['a:changed']).toBe(true)
    expect(changes['b:added']).toBe(true)
    expect(changes['plugins/foo.json:removed']).toBe(true)
  })
})
