// MCP 配置管理守门（kimi：scope 三选一/timeout 有界/needs-auth 闭环）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { closeAuthLoop, isMcpScope, listNeedsAuth, loadServer, upsertServer } from '../mcp-config'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mcp-'))
  process.env.HERMES_MCP_CONFIG_DIR = dir
})
afterEach(() => {
  delete process.env.HERMES_MCP_CONFIG_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('scope 三选一 + 超时有界', () => {
  it('scope 词表；timeout 归一 [1,600000]；坏值回默认', () => {
    expect(['project', 'global', 'session'].every(isMcpScope)).toBe(true)
    expect(isMcpScope('repo')).toBe(false)
    expect(upsertServer({ name: 's1', scope: 'project', timeoutMs: 999_999 }).timeoutMs).toBe(600_000)
    expect(upsertServer({ name: 's2', scope: 'session', timeoutMs: -5 }).timeoutMs).toBe(30_000)
    expect(loadServer('s1')!.scope).toBe('project')
  })
})

describe('needs-auth action 闭环', () => {
  it('needs-auth→authorized 一次闭环；dismiss 不再提示；待办列表', () => {
    upsertServer({ name: 'm1', scope: 'global', timeoutMs: 1000, authState: 'needs-auth', authAction: '运行 mcp login' })
    upsertServer({ name: 'm2', scope: 'project', timeoutMs: 1000, authState: 'needs-auth' })
    expect(listNeedsAuth().map((c) => c.name).sort()).toEqual(['m1', 'm2'])
    closeAuthLoop('m1', 'authorize')
    closeAuthLoop('m2', 'dismiss')
    expect(listNeedsAuth()).toEqual([])
    expect(loadServer('m1')!.authState).toBe('authorized')
    expect(loadServer('m2')!.authState).toBe('dismissed')
    expect('error' in closeAuthLoop('nope', 'authorize')).toBe(true)
  })
})
