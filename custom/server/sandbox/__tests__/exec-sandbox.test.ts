// overlay/sandbox OS 级执行沙箱决策面守门（2026-10-21 挂账清偿批次 C）。
// 纪律：探测失败/平台不支持 → unavailable，绝不降级裸跑；env 净化；写白名单。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectSandboxSupport, runSandboxed } from '../exec-sandbox'

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
  // 按本机真实探测分叉（CI 平台差异清偿 2026-11-12）：实现是双后端
  // （darwin sandbox-exec / linux bwrap），CI ubuntu runner 无 bwrap——产品如实
  // unavailable＋不执行子进程（fail-closed 是设计行为，本身就是被测语义）。
  // 不在 runner 装 bubblewrap 硬凑 ok 路径：GH ubuntu runner 的 AppArmor
  // unprivileged-userns 限制下 bwrap 运行态不可保证（装上≠可用，探测只查二进制
  // 会引入假可用新差异面）。两分支都是强断言，不是 skip。
  const sandboxReady = detectSandboxSupport().available

  it(sandboxReady
    ? 'ok：命令在沙箱内执行并回收输出'
    : '沙箱后端缺席：unavailable 且不执行子进程（CI ubuntu 无 bwrap，fail-closed 如实报）', async () => {
    const r = await runSandboxed({ argv: ['/bin/sh', '-c', 'echo sandboxed-ok'], cwd: scratch, timeoutMs: 10_000 })
    if (sandboxReady) {
      expect(r.status).toBe('ok')
      expect(r.exitCode).toBe(0)
      expect(r.stdout).toContain('sandboxed-ok')
    } else {
      expect(r).toMatchObject({ status: 'unavailable' })
      expect(r.stdout).toBe('')
    }
  }, 20_000)

  it(sandboxReady
    ? 'env 净化：未入白名单的变量不可见（HOME 为空）'
    : '沙箱后端缺席：env 净化用例同判 unavailable（不执行即无泄漏面）', async () => {
    const r = await runSandboxed({ argv: ['/bin/sh', '-c', 'echo "[$HOME]"'], cwd: scratch, timeoutMs: 10_000 })
    if (sandboxReady) {
      expect(r.status).toBe('ok')
      expect(r.stdout.trim()).toBe('[]')
    } else {
      expect(r).toMatchObject({ status: 'unavailable' })
    }
  }, 20_000)

  it(sandboxReady
    ? '写白名单：writableRoots 外的写入被拒绝（非零退出）'
    : '沙箱后端缺席：写拒用例同判 unavailable（不执行即无写面）', async () => {
    const outside = join(tmpdir(), `denied-${Date.now()}.txt`)
    const r = await runSandboxed({ argv: ['/bin/sh', '-c', `touch ${outside} && echo wrote`], cwd: scratch, writableRoots: [scratch], timeoutMs: 10_000 })
    if (sandboxReady) {
      expect(r.status).toBe('ok')
      expect(r.exitCode).not.toBe(0)
    } else {
      expect(r).toMatchObject({ status: 'unavailable' })
      expect(existsSync(outside)).toBe(false)
    }
  }, 20_000)

  it(sandboxReady
    ? '写白名单内的目录可写'
    : '沙箱后端缺席：白名单内写用例同判 unavailable（fail-closed 不放行任何写）', async () => {
    const r = await runSandboxed({ argv: ['/bin/sh', '-c', 'touch allowed.txt'], cwd: scratch, writableRoots: [scratch], timeoutMs: 10_000 })
    if (sandboxReady) {
      expect(r.status).toBe('ok')
      expect(r.exitCode).toBe(0)
    } else {
      expect(r).toMatchObject({ status: 'unavailable' })
      expect(existsSync(join(scratch, 'allowed.txt'))).toBe(false)
    }
  }, 20_000)

  it('沙箱不可用 → unavailable 且不执行子进程（fail-closed）', async () => {
    const r = await runSandboxed({ argv: ['/bin/sh', '-c', 'echo must-not-run'], cwd: scratch }, { probe: () => false })
    expect(r).toMatchObject({ status: 'unavailable' })
    expect(r.stdout).toBe('')
  })
})
