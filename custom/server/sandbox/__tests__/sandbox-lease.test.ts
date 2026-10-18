// 沙箱租约与清扫（残余项⑥）守门：根内清扫、根外/根目录/符号链接拒绝、无根不清扫。
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetLeaseFileForTests,
  _useLeaseFileForTests,
  listLeases,
  registerLease,
  sandboxRoot,
  sweepExpiredLeases,
} from '../sandbox-lease'

let dir: string
let root: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sandbox-lease-'))
  root = join(dir, 'workspaces')
  mkdirSync(root, { recursive: true })
  process.env.HERMES_SANDBOX_WORKSPACES_ROOT = root
  _useLeaseFileForTests(join(dir, 'leases.json'))
})

afterEach(() => {
  delete process.env.HERMES_SANDBOX_WORKSPACES_ROOT
  _resetLeaseFileForTests()
  rmSync(dir, { recursive: true, force: true })
})

function expiredLease(runId: string, workspace: string): void {
  const res = registerLease({ runId, workspace, now: Date.now() - 120_000, ttlMs: 60_000 })
  expect(res.ok).toBe(true)
}

describe('registerLease', () => {
  it('根内目录可登记；根外/根本身拒绝', () => {
    const inside = join(root, 'run-1')
    mkdirSync(inside)
    expect(registerLease({ runId: 'run-1', workspace: inside }).ok).toBe(true)
    expect(registerLease({ runId: 'run-2', workspace: join(dir, 'outside') })).toMatchObject({ ok: false })
    expect(registerLease({ runId: 'run-3', workspace: root })).toMatchObject({ ok: false })
    expect(listLeases().some((l) => l.runId === 'run-1')).toBe(true)
  })
})

describe('sweepExpiredLeases', () => {
  it('只删过期且根内的 workspace，租约标记 swept', () => {
    const inside = join(root, 'run-1')
    mkdirSync(inside)
    writeFileSync(join(inside, 'a.txt'), 'x')
    expiredLease('run-1', inside)

    const result = sweepExpiredLeases({ now: Date.now() })
    expect(result.root).toBe(root)
    expect(result.swept).toHaveLength(1)
    expect(existsSync(inside)).toBe(false)
    expect(listLeases()[0].sweptAt).toBeTruthy()
  })

  it('未过期不扫；dryRun 不删', () => {
    const inside = join(root, 'run-2')
    mkdirSync(inside)
    registerLease({ runId: 'run-2', workspace: inside, ttlMs: 3_600_000 })
    expect(sweepExpiredLeases({ now: Date.now() }).swept).toHaveLength(0)
    expect(existsSync(inside)).toBe(true)

    const expired = join(root, 'run-3')
    mkdirSync(expired)
    expiredLease('run-3', expired)
    expect(sweepExpiredLeases({ now: Date.now(), dryRun: true }).swept).toHaveLength(1)
    expect(existsSync(expired)).toBe(true)
  })

  it('符号链接不跟随；无根不清扫', () => {
    const outside = join(dir, 'outside-dir')
    mkdirSync(outside)
    writeFileSync(join(outside, 'keep.txt'), 'x')
    const link = join(root, 'run-link')
    symlinkSync(outside, link)
    expiredLease('run-link', link)
    const result = sweepExpiredLeases({ now: Date.now() })
    expect(result.skipped.some((s) => s.reason.includes('符号链接'))).toBe(true)
    expect(existsSync(outside)).toBe(true)

    delete process.env.HERMES_SANDBOX_WORKSPACES_ROOT
    expect(sandboxRoot()).toBeNull()
    const noRoot = sweepExpiredLeases({ now: Date.now() })
    expect(noRoot.root).toBeNull()
    expect(noRoot.swept).toHaveLength(0)
  })
})
