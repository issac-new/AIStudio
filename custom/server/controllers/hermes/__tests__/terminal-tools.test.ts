import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { detectTerminalTools, findBinOnPath } from '../terminal-tools'

function makePathDir(withBins: string[]): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'term-tools-'))
  for (const bin of withBins) writeFileSync(join(dir, bin), '#!/bin/sh\n', { mode: 0o755 })
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('detectTerminalTools', () => {
  it('reports tools in priority order regardless of PATH order', () => {
    const a = makePathDir(['claude'])
    const b = makePathDir(['codex', 'dsh'])
    try {
      const tools = detectTerminalTools({ PATH: `${b.dir}:${a.dir}` }, false)
      expect(tools.map((t) => t.id)).toEqual(['claude-code', 'codex', 'deepseek-harness'])
      expect(tools.map((t) => t.installed)).toEqual([true, true, true])
      expect(tools[0].path).toBe(join(a.dir, 'claude'))
      expect(tools[1].path).toBe(join(b.dir, 'codex'))
    } finally {
      a.cleanup(); b.cleanup()
    }
  })

  it('marks missing tools as not installed with null path', () => {
    const tools = detectTerminalTools({ PATH: '/nonexistent-dir-xyz' }, false)
    expect(tools).toEqual([
      { id: 'claude-code', installed: false, path: null },
      { id: 'codex', installed: false, path: null },
      { id: 'deepseek-harness', installed: false, path: null },
    ])
  })

  it('finds windows bins via PATHEXT extensions', () => {
    const d = makePathDir(['codex.cmd'])
    try {
      const tools = detectTerminalTools(
        { PATH: d.dir, PATHEXT: '.COM;.EXE;.BAT;.CMD' },
        true,
      )
      expect(tools.find((t) => t.id === 'codex')?.installed).toBe(true)
      expect(tools.find((t) => t.id === 'claude-code')?.installed).toBe(false)
    } finally {
      d.cleanup()
    }
  })
})

describe('findBinOnPath', () => {
  it('skips empty PATH segments', () => {
    expect(findBinOnPath('claude', ['', '/nonexistent'], false)).toBeNull()
  })

  it('searches PATH dirs in order and returns first hit', () => {
    const d1 = makePathDir([])
    const d2 = makePathDir(['claude'])
    try {
      expect(findBinOnPath('claude', [d1.dir, d2.dir], false)).toBe(join(d2.dir, 'claude'))
    } finally {
      d1.cleanup(); d2.cleanup()
    }
  })
})
