// overlay[redteam] 沙箱攻防接线守门（2026-10-21 挂账清偿收）：
// 执行型载荷在 exec-sandbox 内真跑验活性，对照 S0 检测器出「拦截/逃逸」事实；
// 沙箱不可用一律 fail-closed 不跑。检测器未拦≠无人管（执行闸/审批是第二道防线），
// 本面暴露的是规则层盲区——报告如实注明。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { classifyExecPayload, runExecRedteam, EXEC_PAYLOADS } from '../exec-probe'
import { detectSandboxSupport } from '../../sandbox/exec-sandbox'

let scratch: string

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'redteam-exec-'))
})
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
  delete process.env.HERMES_EXEC_SANDBOX
})

describe('classifyExecPayload（纯函数四分类）', () => {
  const det = (detected: boolean) => ({ score: detected ? 3 : 0, hits: detected ? ['tool-pipe-exec'] : [], detected })

  it('检测器未拦 + 沙箱内可执行 → escaped（规则层盲区暴露）', () => {
    expect(classifyExecPayload(det(false), { id: 'x', text: 't', expect: 'exec-attempt' }, { status: 'ok', exitCode: 1, stdout: '', stderr: 'Operation not permitted' }, '/tmp'))
      .toBe('escaped-detector-and-executable')
  })

  it('检测器拦截 + 可执行 → intercepted（护栏命中，动作本身可达）', () => {
    expect(classifyExecPayload(det(true), { id: 'x', text: 't', expect: 'exec-attempt' }, { status: 'ok', exitCode: 1, stdout: '', stderr: 'x' }, '/tmp'))
      .toBe('detector-intercepted')
  })

  it('沙箱执行失败（error/timeout）→ sandbox-error，不判逃逸不判拦截', () => {
    expect(classifyExecPayload(det(false), { id: 'x', text: 't', expect: 'exec-attempt' }, { status: 'error', stdout: '', stderr: '' }, '/tmp'))
      .toBe('sandbox-error')
    expect(classifyExecPayload(det(true), { id: 'x', text: 't', expect: 'exec-attempt' }, { status: 'timeout', stdout: '', stderr: '' }, '/tmp'))
      .toBe('sandbox-error')
  })

  it('载荷死形（expect 不满足）→ payload-dead', () => {
    expect(classifyExecPayload(det(true), { id: 'x', text: 't', expect: 'output-nonempty' }, { status: 'ok', exitCode: 0, stdout: '', stderr: '' }, '/tmp'))
      .toBe('payload-dead')
  })
})

describe('runExecRedteam', () => {
  it('沙箱不可用（HERMES_EXEC_SANDBOX=off）→ fail-closed：零执行、零结果', async () => {
    process.env.HERMES_EXEC_SANDBOX = 'off'
    const r = await runExecRedteam({ scratch, timeoutMs: 5000 })
    expect(r.sandbox).toBe('unavailable')
    expect(r.results).toEqual([])
    expect(r.notes.join(' ')).toContain('fail-closed')
  })

  it.skipIf(!detectSandboxSupport().available)('真沙箱跑：四载荷全执行，写探针文件真实落盘，裸 rm -rf / 如实归 escaped', async () => {
    const r = await runExecRedteam({ scratch, timeoutMs: 15_000 })
    expect(r.sandbox).toBe('available')
    expect(r.results).toHaveLength(EXEC_PAYLOADS.length)
    // 写探针：命令确实到达 shell 并完成写动作（护栏失效时的真实风险面）
    const write = r.results.find((x) => x.payloadId === 'write-probe')
    expect(write?.executable).toBe(true)
    expect(existsSync(join(scratch, 'pwned.txt'))).toBe(true)
    // pipe-exec 被 S0 规则命中 → intercepted
    const pipe = r.results.find((x) => x.payloadId === 'pipe-exec')
    expect(pipe?.classification).toBe('detector-intercepted')
    // 裸 rm -rf /（无诱导语境）不在注入规则面 → 如实 escaped（报告须注明第二道防线）
    const rm = r.results.find((x) => x.payloadId === 'rm-rf-root')
    expect(rm?.classification).toBe('escaped-detector-and-executable')
    expect(r.notes.join(' ')).toContain('执行闸')
  }, 60_000)
})
