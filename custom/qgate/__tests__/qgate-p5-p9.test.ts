// P5-P9 单测：豁免（WAIVED）/ Ontology Provider / 语义门 v0 / files executor /
// release-report / MCP server。全部真执行（tmp 目录夹具 + 子进程），无 mock 内核。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { runGate } from '../src/core/run.js'
import { storePaths, saveWaiver, listWaivers, activeWaiverFor } from '../src/core/store.js'
import { parseOntologyConfig, createProvider, MockOntologyProvider } from '../src/ontology/provider.js'
import { runOntologyExecutor } from '../src/executors/ontology.js'
import { runFilesExecutor } from '../src/executors/files.js'
import { buildReleaseReport, renderReleaseReportMd } from '../src/core/report.js'
import { loadProject } from '../src/core/loader.js'
import type { ExecutorSpec, GateSpec } from '../src/core/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const distCli = join(here, '..', 'dist', 'cli.js')
const distMcp = join(here, '..', 'dist', 'mcp-server.js')

const gateSpec = (over: Partial<GateSpec['spec']> = {}): GateSpec => ({
  apiVersion: 'qgate/v1alpha1',
  kind: 'Gate',
  metadata: { id: 't.gate', version: '0.1.0' },
  spec: {
    domain: 'L1',
    claims: ['c1'],
    triggers: ['task_close'],
    executors: [{ id: 'e1', type: 'command', command: ['false'], evidenceType: 'x' }],
    evidence: { required: ['x'] },
    policy: { failure: 'block', inconclusive: 'block' },
    ...over,
  },
})

function tmpProject(): { dir: string; qgateDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'qgate-p5-'))
  const qgateDir = join(dir, '.qgate')
  mkdirSync(qgateDir, { recursive: true })
  return { dir, qgateDir }
}

describe('P5 豁免（Exception → WAIVED）', () => {
  it('有效 waiver 把 FAIL 记为 WAIVED 且保留原始事实；过期/禁豁免不生效', async () => {
    const fx = tmpProject()
    try {
      const spec = gateSpec() // executor ['false'] → FAIL
      const paths = storePaths(fx.qgateDir)

      // 无 waiver → FAIL
      const fail = await runGate({ spec, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir })
      expect(fail.run.verdict).toBe('FAIL')

      // 登记 waiver → WAIVED，conditions 带豁免人与原判定
      saveWaiver(paths, {
        id: 'w1', gateId: 't.gate', reason: 'known flake', approver: 'alice',
        expiresAt: Date.now() + 3_600_000, createdAt: Date.now(), revalidation: 'rerun after infra fix',
      })
      expect(activeWaiverFor(paths, 't.gate')?.id).toBe('w1')
      const waived = await runGate({ spec, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir })
      expect(waived.run.verdict).toBe('WAIVED')
      expect(waived.run.conditions?.join(' ')).toContain('waived by alice')
      expect(waived.run.conditions?.join(' ')).toContain('rerun after infra fix')
      expect(waived.run.failureSummary).toContain('x:fail') // 原始失败事实保留

      // 过期 waiver 无效
      saveWaiver(paths, {
        id: 'w2', gateId: 't.gate', reason: 'stale', approver: 'bob',
        expiresAt: Date.now() - 1_000, createdAt: Date.now() - 2_000,
      })
      expect(activeWaiverFor(paths, 't.gate')?.id).toBe('w1')
      const again = await runGate({ spec, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir })
      expect(again.run.verdict).toBe('WAIVED') // w1 仍有效

      // allowWaiver=false → 拒绝豁免
      const strict = gateSpec({ policy: { failure: 'block', inconclusive: 'block', allowWaiver: false } })
      strict.metadata.id = 't.strict'
      const strictResult = await runGate({ spec: strict, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir })
      expect(strictResult.run.verdict).toBe('FAIL')
      expect(listWaivers(paths).length).toBeGreaterThanOrEqual(2)
    } finally {
      rmSync(fx.dir, { recursive: true, force: true })
    }
  })
})

describe('P6 Ontology Provider', () => {
  it('配置解析：缺省 off / 合法 / 非法', () => {
    expect(parseOntologyConfig(undefined)?.provider).toBe('off')
    const cfg = parseOntologyConfig({ provider: 'fibo', mappings: [{ conceptId: 'fibo-payment', fields: ['payment.amount'] }] })
    expect(cfg?.provider).toBe('fibo')
    expect(cfg?.mappings[0].fields).toEqual(['payment.amount'])
    expect(parseOntologyConfig('bad')).toBeNull()
    expect(parseOntologyConfig({ mappings: 'nope' })).toBeNull()
  })

  it('mock provider 可用；fibo 预处理索引可加载且含 12 概念与歧义对；off → null；未知 provider → null', async () => {
    const mock = new MockOntologyProvider()
    const idx = await mock.load()
    expect(idx?.concepts.length).toBe(3)

    const fibo = createProvider({ provider: 'fibo', mappings: [] }, join(here, '..', 'gate-packs'))
    expect(fibo).not.toBeNull()
    const fiboIdx = await fibo!.load()
    expect(fiboIdx?.concepts.length).toBe(12)
    const capture = fiboIdx?.concepts.find((c) => c.id === 'fibo-capture')
    expect(capture?.distinctFrom).toContain('fibo-settlement')

    expect(createProvider({ provider: 'off', mappings: [] }, '/x')).toBeNull()
    expect(createProvider({ provider: 'nope', mappings: [] }, '/x')).toBeNull()
  })

  it('索引文件缺失 → load 返回 null（不 crash → 门降级 INCONCLUSIVE 的输入）', async () => {
    const broken = createProvider({ provider: 'fibo', mappings: [] }, '/nonexistent-packs-root')
    const idx = await broken!.load()
    expect(idx).toBeNull()
  })
})

describe('P7 Ontology Semantic Gate v0', () => {
  const ontoExecutor = (scan?: string[]): ExecutorSpec => ({
    id: 'ontology.scan', type: 'ontology', evidenceType: 'ontology-finding', ...(scan ? { scan } : {}),
  })

  it('provider off → skipped/present（不 nag 不 crash）', async () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'qgate.yaml'), 'profile: vibe-fast\n')
      const ev = await runOntologyExecutor(ontoExecutor(), { runId: 'r', gateId: 'g', workspace: fx.dir, qgateDir: fx.qgateDir })
      expect(ev.result).toBe('skipped')
      expect(ev.execution).toBe('present')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })

  it('字段级歧义：映射到 Captured 的字段名内嵌 settled → terminology-ambiguity finding（conditional）', async () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'qgate.yaml'), [
        'profile: vibe-fast',
        'ontology:',
        '  provider: fibo',
        '  mappings:',
        '    - conceptId: fibo-capture',
        '      fields: [payment.settledAmount]',
        '',
      ].join('\n'))
      const ev = await runOntologyExecutor(ontoExecutor(), { runId: 'r', gateId: 'g', workspace: fx.dir, qgateDir: fx.qgateDir })
      expect(ev.result).toBe('conditional')
      expect(ev.execution).toBe('exercised')
      expect(ev.summary).toContain('terminology-ambiguity')
      expect(ev.summary).toContain('settled')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })

  it('内容级歧义：同一文档混用 captured/settled → finding；干净文档 → pass', async () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'qgate.yaml'), [
        'profile: vibe-fast',
        'ontology:',
        '  provider: fibo',
        '  mappings:',
        '    - conceptId: fibo-capture',
        '      code: [PaymentService]',
        '',
      ].join('\n'))
      mkdirSync(join(fx.dir, 'docs'), { recursive: true })
      writeFileSync(join(fx.dir, 'docs', 'prd.md'), 'The captured amount and the settled amount must not be confused.\n')
      const ev = await runOntologyExecutor(ontoExecutor(['docs/**/*.md']), { runId: 'r', gateId: 'g', workspace: fx.dir, qgateDir: fx.qgateDir })
      expect(ev.result).toBe('conditional')
      expect(ev.summary).toContain('docs/prd.md')

      writeFileSync(join(fx.dir, 'docs', 'prd.md'), 'Only the captured amount is described here.\n')
      const clean = await runOntologyExecutor(ontoExecutor(['docs/**/*.md']), { runId: 'r2', gateId: 'g', workspace: fx.dir, qgateDir: fx.qgateDir })
      expect(clean.result).toBe('pass')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })

  it('概念错配：映射指向索引外概念 → concept-mismatch', async () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'qgate.yaml'), [
        'profile: vibe-fast',
        'ontology:',
        '  provider: fibo',
        '  mappings:',
        '    - conceptId: not-in-index',
        '      code: [X]',
        '',
      ].join('\n'))
      const ev = await runOntologyExecutor(ontoExecutor(), { runId: 'r', gateId: 'g', workspace: fx.dir, qgateDir: fx.qgateDir })
      expect(ev.result).toBe('conditional')
      expect(ev.summary).toContain('concept-mismatch')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })

  it('语义门端到端：CONDITIONAL 带解除条件（finding 非强阻断，v0.1 §63）', async () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'qgate.yaml'), [
        'profile: vibe-fast',
        'ontology:',
        '  provider: fibo',
        '  mappings:',
        '    - conceptId: fibo-capture',
        '      fields: [payment.settledAmount]',
        '',
      ].join('\n'))
      const spec = gateSpec({
        domain: 'L3',
        executors: [ontoExecutor()],
        evidence: { required: ['ontology-finding'] },
        policy: { failure: 'warn', inconclusive: 'warn' },
      })
      const result = await runGate({ spec, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir })
      expect(result.run.verdict).toBe('CONDITIONAL')
      expect(result.run.conditions?.length).toBeGreaterThan(0)
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})

describe('P9 files executor（present 级证据的诚实语义）', () => {
  it('全存在 → pass/present；缺失 → fail 并点名', () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.dir, 'runbook.md'), '# ops\n')
      const ok = runFilesExecutor(
        { id: 'f', type: 'files', require: ['runbook.md'], evidenceType: 'ops' },
        { runId: 'r', gateId: 'g', workspace: fx.dir },
      )
      expect(ok.result).toBe('pass')
      expect(ok.execution).toBe('present') // 存在 ≠ 跑过
      const missing = runFilesExecutor(
        { id: 'f', type: 'files', require: ['runbook.md', 'docs/rollback*.md'], evidenceType: 'ops' },
        { runId: 'r', gateId: 'g', workspace: fx.dir },
      )
      expect(missing.result).toBe('fail')
      expect(missing.summary).toContain('docs/rollback')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })

  it('单凭 present 证据过不了 PASS：决策层给 not-exercised → INCONCLUSIVE', async () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.dir, 'runbook.md'), '# ops\n')
      const spec = gateSpec({
        domain: 'L5',
        executors: [{ id: 'f', type: 'files', require: ['runbook.md'], evidenceType: 'ops' }],
        evidence: { required: ['ops'] },
        policy: { failure: 'warn', inconclusive: 'warn' },
      })
      const result = await runGate({ spec, trigger: 'release', workspace: fx.dir, qgateDir: fx.qgateDir })
      expect(result.run.verdict).toBe('CONDITIONAL') // warn 降档；block 档会是 INCONCLUSIVE
      expect(result.run.conditions?.join(' ')).toContain('not-exercised')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})

describe('L5.7 release-report', () => {
  it('汇总门判定/claim 覆盖/风险/豁免/未决；md 渲染含关键区块', async () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'qgate.yaml'), 'profile: feature-close\n')
      const loaded = loadProject(fx.dir)
      expect(loaded).not.toBeNull()
      // 无任何 run → 全 INCONCLUSIVE 进 unresolved
      const data = buildReleaseReport(loaded!)
      expect(data.gates.length).toBeGreaterThanOrEqual(1) // builtin engineering 门
      expect(data.unresolved.some((u) => u.includes('INCONCLUSIVE') || u.includes('never') || u.includes(':'))).toBe(true)
      const md = renderReleaseReportMd(data)
      for (const section of ['Gate Summary', 'Claim Coverage', 'Evidence Index', 'Open Risks', 'Exceptions', 'Unresolved']) {
        expect(md).toContain(section)
      }
      // 跑一次 PASS 的门再出报告 → verdict PASS（用单证据类型的简化门，聚焦报告面）
      const spec = loaded!.gates.find((g) => g.metadata.id === 'engineering.basic-check')!
      const simplified: GateSpec = {
        ...spec,
        spec: {
          ...spec.spec,
          executors: [{ id: 'e1', type: 'command', command: ['true'], evidenceType: spec.spec.evidence.required[0] }],
          evidence: { required: [spec.spec.evidence.required[0]] },
        },
      }
      await runGate({ spec: simplified, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir })
      const data2 = buildReleaseReport(loaded!)
      expect(data2.gates.find((g) => g.gateId === 'engineering.basic-check')?.verdict).toBe('PASS')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})

describe.sequential('P8 MCP server（stdio JSON-RPC，真子进程）', () => {
  it('initialize → tools/list(7) → tools/call gate.status', { timeout: 30_000 }, () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'qgate.yaml'), 'profile: vibe-fast\n')
      const send = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL, capabilities: {} } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'gate.status', arguments: { cwd: fx.dir } } },
      ]
      const res = spawnSync('node', [distMcp], {
        input: send.map((m) => JSON.stringify(m)).join('\n') + '\n',
        encoding: 'utf8',
        timeout: 25_000,
      })
      expect(res.status).toBe(0)
      const replies = res.stdout.trim().split('\n').map((l) => JSON.parse(l)) as Array<Record<string, unknown>>
      const init = replies.find((r) => r.id === 1)
      expect((init?.result as Record<string, unknown>)?.serverInfo).toMatchObject({ name: 'qgate' })
      const tools = replies.find((r) => r.id === 2)
      expect(((tools?.result as Record<string, unknown>)?.tools as unknown[]).length).toBe(7)
      const status = replies.find((r) => r.id === 3)
      const statusText = ((status?.result as Record<string, unknown>)?.content as Array<{ text: string }>)[0].text
      const parsed = JSON.parse(statusText)
      expect(parsed.profile).toBe('vibe-fast')
      expect(Array.isArray(parsed.gates)).toBe(true)
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})

const PROTOCOL = '2024-11-05'

describe('CLI 新命令（waive/exceptions/release-report）', () => {
  it('waive 写入并使后续 run WAIVED；release-report 产出 md+json', { timeout: 30_000 }, () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'qgate.yaml'), 'profile: vibe-fast\n')
      const run = (args: string[]) => spawnSync('node', [distCli, ...args], { cwd: fx.dir, encoding: 'utf8', timeout: 20_000 })
      const waive = run(['waive', 'engineering.basic-check', '--reason', 'infra flaky today', '--approver', 'alice', '--hours', '48', '--revalidation', 'rerun tomorrow'])
      expect(waive.status).toBe(0)
      expect(run(['exceptions']).stdout).toContain('ACTIVE')
      const report = run(['release-report'])
      expect(report.status).toBe(1) // 有未决（未跑的门）
      expect(existsSync(join(fx.qgateDir, 'release-report.md'))).toBe(true)
      expect(existsSync(join(fx.qgateDir, 'release-report.json'))).toBe(true)
      const md = readFileSync(join(fx.qgateDir, 'release-report.md'), 'utf8')
      expect(md).toContain('Release Evidence Package')
      expect(md).toContain('infra flaky today')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})
