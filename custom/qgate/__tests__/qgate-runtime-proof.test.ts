// 长会话治理 B5：runtime-proof executor——五要素校验、新鲜度、fail-closed。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runRuntimeProofExecutor } from '../src/executors/runtime-proof'
import type { ExecutorSpec } from '../src/core/types'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'qgate-runtime-proof-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const spec = (over: Partial<ExecutorSpec> = {}): ExecutorSpec => ({
  id: 'runtime-proof-miniprogram',
  type: 'runtime-proof',
  proofFile: 'docs/evidence/miniprogram-runtime-proof.json',
  evidenceType: 'artifact.runtime-proof',
  ...over,
} as ExecutorSpec)

const INPUT = () => ({ runId: 'r1', gateId: 'g1', workspace: dir })

function writeProof(record: unknown, file = 'docs/evidence/miniprogram-runtime-proof.json') {
  mkdirSync(join(dir, 'docs/evidence'), { recursive: true })
  writeFileSync(join(dir, file), JSON.stringify(record), 'utf8')
}

const GOOD = {
  tool: 'wechat-devtools',
  projectPath: '/works/csw-cashier-mp',
  appid: 'wx1234567890',
  launchOk: true,
  screenshot: '/out/runtime-proof.png',
  checkedAt: new Date().toISOString(),
}

describe('runtime-proof executor (B5)', () => {
  it('passes a complete, fresh record', () => {
    writeProof(GOOD)
    const ev = runRuntimeProofExecutor(spec(), INPUT())
    expect(ev.result).toBe('pass')
    expect(ev.summary).toContain('wechat-devtools')
  })

  it('missing proofFile declaration → error evidence', () => {
    const ev = runRuntimeProofExecutor(spec({ proofFile: undefined }), INPUT())
    expect(ev.result).toBe('error')
  })

  it('missing record file → fail (无记录=不达标，绝不放行)', () => {
    const ev = runRuntimeProofExecutor(spec(), INPUT())
    expect(ev.result).toBe('fail')
    expect(ev.summary).toContain('缺失')
  })

  it('launchOk !== true → fail; malformed JSON → error', () => {
    writeProof({ ...GOOD, launchOk: false })
    expect(runRuntimeProofExecutor(spec(), INPUT()).result).toBe('fail')
    mkdirSync(join(dir, 'docs/evidence'), { recursive: true })
    writeFileSync(join(dir, 'docs/evidence/bad.json'), '{not valid json', 'utf8')
    expect(runRuntimeProofExecutor(spec({ proofFile: 'docs/evidence/bad.json' }), INPUT()).result).toBe('error')
  })

  it('stale record (over maxAge) → fail with age hint', () => {
    writeProof({ ...GOOD, checkedAt: new Date(Date.now() - 30 * 3600_000).toISOString() })
    const ev = runRuntimeProofExecutor(spec({ proofMaxAgeHours: 24 }), INPUT())
    expect(ev.result).toBe('fail')
    expect(ev.summary).toContain('超龄')
  })

  it('field violations enumerate all missing elements', () => {
    writeProof({ tool: '', launchOk: true })
    const ev = runRuntimeProofExecutor(spec(), INPUT())
    expect(ev.result).toBe('fail')
    expect(ev.summary).toContain('projectPath')
    expect(ev.summary).toContain('screenshot')
  })
})
