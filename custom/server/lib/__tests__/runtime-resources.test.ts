// @vitest-environment node
// Task 7 负例：runtime 资源单一解析器（向上探测 <dir>/runtime/<rel>，拒绝绝对路径与
// .. 逃逸，全 miss 回 null）。实现前本文件随模块缺失先行咬红。
import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { resolveRuntimeResource } from '../runtime-resources'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..')

describe('resolveRuntimeResource', () => {
  it('源码态：从 custom/server 子目录向上命中仓根 runtime/', () => {
    const p = resolveRuntimeResource('pricing/models.yaml', join(repoRoot, 'custom/server/tokens'))
    expect(p).toBe(join(repoRoot, 'runtime', 'pricing', 'models.yaml'))
    const roster = resolveRuntimeResource('roster/squads.yaml', join(repoRoot, 'custom/server/zcode'))
    expect(roster).toBe(join(repoRoot, 'runtime', 'roster', 'squads.yaml'))
  })

  it('bundle 态：dist/server 布局命中同级 runtime/（打包产物 __dirname=dist/server）', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'runtime-res-'))
    try {
      const serverDir = join(tmp, 'app', 'dist', 'server')
      mkdirSync(join(serverDir, 'runtime', 'roster'), { recursive: true })
      writeFileSync(join(serverDir, 'runtime', 'roster', 'squads.yaml'), 'squads: {}\n')
      const p = resolveRuntimeResource('roster/squads.yaml', serverDir)
      expect(p).toBe(join(serverDir, 'runtime', 'roster', 'squads.yaml'))
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('越界 rel 抛错：绝对路径拒绝', () => {
    expect(() => resolveRuntimeResource('/etc/passwd', repoRoot)).toThrow(/绝对路径/)
    expect(() => resolveRuntimeResource(join(tmpdir(), 'x.yaml'), repoRoot)).toThrow(/绝对路径/)
  })

  it('越界 rel 抛错：.. 段拒绝（含首段与中插形态）', () => {
    expect(() => resolveRuntimeResource('../outside.yaml', repoRoot)).toThrow(/越界|\.\./)
    expect(() => resolveRuntimeResource('roster/../../outside.yaml', repoRoot)).toThrow(/越界|\.\./)
    expect(() => resolveRuntimeResource('a/../b.yaml', repoRoot)).toThrow(/越界|\.\./)
  })

  it('全 miss 返回 null（不猜、不抛）', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'runtime-res-miss-'))
    try {
      expect(resolveRuntimeResource('nope/missing.yaml', tmp)).toBeNull()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
