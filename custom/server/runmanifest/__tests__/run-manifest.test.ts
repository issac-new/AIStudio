// 运行清单（P1-3）守门：幂等落盘、查询、提示词指纹、trace 成本窗口。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _useRunManifestDirForTests,
  promptFingerprint,
  queryRunManifests,
  recordRunManifest,
  runCostFromTrace,
  type RunManifest,
} from '../run-manifest'

let dir: string
let traces: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'run-manifest-'))
  traces = join(dir, 'traces')
  mkdirSync(traces, { recursive: true })
  _useRunManifestDirForTests(dir)
  process.env.HERMES_TRACES_DIR = traces
})

afterEach(() => {
  delete process.env.RUN_MANIFEST_DIR
  delete process.env.HERMES_TRACES_DIR
  rmSync(dir, { recursive: true, force: true })
})

const base = {
  sessionId: 's1',
  profileId: 'p1',
  model: 'demo-model',
  provider: 'demo',
}

describe('recordRunManifest / queryRunManifests', () => {
  it('按 runId 幂等，重复记录不新增', () => {
    const t = Date.now() - 5_000
    const a = recordRunManifest({ ...base, runId: 'r1', startedAt: t })
    const b = recordRunManifest({ ...base, runId: 'r1', startedAt: t + 1_000 })
    expect(b.startedAt).toBe(a.startedAt)
    expect(queryRunManifests({ days: 90 }).total).toBe(1)
  })

  it('查询按时间倒序，并按 session/run 过滤', () => {
    recordRunManifest({ ...base, runId: 'r1', startedAt: Date.now() - 2_000 })
    recordRunManifest({ ...base, runId: 'r2', startedAt: Date.now() - 1_000 })
    recordRunManifest({ ...base, sessionId: 's2', runId: 'r3', startedAt: Date.now() })
    const all = queryRunManifests({ days: 1 })
    expect(all.entries.map((e) => e.runId)).toEqual(['r3', 'r2', 'r1'])
    expect(queryRunManifests({ days: 1, sessionId: 's1' }).total).toBe(2)
    expect(queryRunManifests({ days: 1, runId: 'r2' }).entries[0].runId).toBe('r2')
  })

  it('清单带契约版本与提示词指纹；指纹稳定且不暴露正文', () => {
    const hash = promptFingerprint('secret system prompt')
    expect(hash).toHaveLength(16)
    expect(hash).toBe(promptFingerprint('secret system prompt'))
    expect(hash).not.toBe(promptFingerprint('another prompt'))
    const m = recordRunManifest({ ...base, runId: 'r-hash', promptHash: hash })
    expect(m.toolContractVersion).toBeTruthy()
    expect(m.promptHash).toBe(hash)
    expect(JSON.stringify(m)).not.toContain('secret system prompt')
  })
})

describe('runCostFromTrace', () => {
  function manifest(runId: string, startedAt: number): RunManifest {
    return recordRunManifest({ ...base, runId, startedAt })
  }

  it('缺 trace 时如实返回 traceFound=false，不估算', () => {
    const m = manifest('r-missing', Date.now())
    const cost = runCostFromTrace(m)
    expect(cost.traceFound).toBe(false)
    expect(cost.inputTokens).toBe(0)
    expect(cost.costIdleUsd).toBeNull()
  })

  it('只汇总本 run 窗口内的 LLM span，忽略工具 span 与前后 run', () => {
    const t0 = Date.now() - 10_000
    const t1 = t0 + 1_000
    const m = manifest('r-cost', t1)
    // 下一个 run 的起点=本 run 统计上界
    manifest('r-next', t1 + 5_000)
    const lines = [
      { type: 'header', session_id: 's1', started_at: t0 },
      { type: 'chunk', kind: 'llm_span', started_at: t0 + 100, usage: { input_tokens: 99, output_tokens: 99 } },
      { type: 'chunk', kind: 'tool_span', started_at: t1 + 100, tool_name: 'read_file' },
      { type: 'chunk', kind: 'llm_span', started_at: t1 + 200, usage: { input_tokens: 100, output_tokens: 20 } },
      { type: 'chunk', kind: 'llm_span', started_at: t1 + 300, usage: { input_tokens: 50, output_tokens: 5 } },
      { type: 'chunk', kind: 'llm_span', started_at: t1 + 6_000, usage: { input_tokens: 999, output_tokens: 999 } },
    ]
    writeFileSync(join(traces, 's1.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n'), 'utf8')
    const cost = runCostFromTrace(m)
    expect(cost.traceFound).toBe(true)
    expect(cost.inputTokens).toBe(150)
    expect(cost.outputTokens).toBe(25)
    // 价目表未收录 demo-model 时金额为 null；收录时 priced=true。
    if (!cost.priced) expect(cost.costIdleUsd).toBeNull()
  })
})
