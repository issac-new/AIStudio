// overlay/sandbox OS 级执行沙箱决策面守门（2026-10-21 挂账清偿批次 C）。
// 纪律：探测失败/平台不支持 → unavailable，绝不降级裸跑；env 净化；写白名单。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectSandboxSupport, runSandboxed } from '../src/executors/exec-sandbox.js'

let scratch: string

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'exec-sandbox-'))
})
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('detectSandboxSupport', () => {
  it('本机 darwin 探测到 sandbox-exec（真探测，不编造能力）', () => {
    const support = detectSandboxSupport()
    if (process.platform === 'darwin') {
      expect(support).toMatchObject({ backend: 'darwin-sandbox-exec', available: true })
    } else {
      expect(support.available).toBe(false)
    }
  })

  it('探测失败 → unavailable（probe 注入失败路径）', () => {
    const support = detectSandboxSupport({ probe: () => false })
    expect(support.available).toBe(false)
    expect(support.backend).toBe('none')
  })
})

describe('runSandboxed', () => {
  it('ok：命令在沙箱内执行并回收输出', async () => {
    const r = await runSandboxed({ argv: ['/bin/sh', '-c', 'echo sandboxed-ok'], cwd: scratch, timeoutMs: 10_000 })
    expect(r.status).toBe('ok')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('sandboxed-ok')
  }, 20_000)

  it('env 净化：未入白名单的变量不可见（HOME 为空）', async () => {
    const r = await runSandboxed({ argv: ['/bin/sh', '-c', 'echo "[$HOME]"'], cwd: scratch, timeoutMs: 10_000 })
    expect(r.status).toBe('ok')
    expect(r.stdout.trim()).toBe('[]')
  }, 20_000)

  it('写白名单：writableRoots 外的写入被拒绝（非零退出）', async () => {
    const outside = join(tmpdir(), `denied-${Date.now()}.txt`)
    const r = await runSandboxed({ argv: ['/bin/sh', '-c', `touch ${outside} && echo wrote`], cwd: scratch, writableRoots: [scratch], timeoutMs: 10_000 })
    expect(r.status).toBe('ok')
    expect(r.exitCode).not.toBe(0)
  }, 20_000)

  it('写白名单内的目录可写', async () => {
    const r = await runSandboxed({ argv: ['/bin/sh', '-c', 'touch allowed.txt'], cwd: scratch, writableRoots: [scratch], timeoutMs: 10_000 })
    expect(r.status).toBe('ok')
    expect(r.exitCode).toBe(0)
  }, 20_000)

  it('沙箱不可用 → unavailable 且不执行子进程（fail-closed）', async () => {
    const r = await runSandboxed({ argv: ['/bin/sh', '-c', 'echo must-not-run'], cwd: scratch }, { probe: () => false })
    expect(r).toMatchObject({ status: 'unavailable' })
    expect(r.stdout).toBe('')
  })
})
