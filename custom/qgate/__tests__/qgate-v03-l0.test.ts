// v0.3 L0 门族守门：traceability 元门 / task-intent 登记与漂移对账 / register 登记簿核验 / CLI intent。
// 负例先行：链接门未 PASS、登记被篡改、越界变更、裸空登记、逾期决策——都不得 PASS。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseTaskIntent, hasGherkinSkeleton, writeTaskIntent, loadTaskIntent, taskIntentSha256 } from '../src/core/task-intent.js'
import { runScopeExecutor } from '../src/executors/scope.js'
import { runRegisterExecutor } from '../src/executors/register.js'
import { runTraceabilityExecutor } from '../src/executors/traceability.js'
import { runGate } from '../src/core/run.js'
import { parseGateSpec } from '../src/core/parse.js'
import { readFileSync as readYaml } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import type { ExecutorSpec, GateSpec } from '../src/core/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const distCli = join(here, '..', 'dist', 'cli.js')
const packsRoot = join(here, '..', 'gate-packs')

function tmpProject(): { dir: string; qgateDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'qgate-v03l0-'))
  const qgateDir = join(dir, '.qgate')
  mkdirSync(join(qgateDir, 'registers'), { recursive: true })
  writeFileSync(join(qgateDir, 'qgate.yaml'), 'profile: vibe-fast\nclaims: []\n')
  return { dir, qgateDir }
}

const GOOD_INTENT = {
  taskId: 'T-1',
  statement: '给支付加退款接口',
  scope: ['src/**'],
  acceptance: ['When amount > captured Then reject refund'],
  confirmedBy: 'tester',
}

function writeIntent(dir: string, over: Partial<typeof GOOD_INTENT> = {}): string {
  const file = join(dir, '.qgate', 'registers', 'task-intent.json')
  writeTaskIntent(file, { ...GOOD_INTENT, ...over })
  return file
}

describe('task-intent 登记（核心解析与写入纪律）', () => {
  it('parseTaskIntent：合法通过；缺字段/坏 revisions 拒收', () => {
    expect(parseTaskIntent({ ...GOOD_INTENT, confirmedAt: '2026-10-01T00:00:00Z' })).not.toBeNull()
    expect(parseTaskIntent({ ...GOOD_INTENT, scope: [] })).toBeNull()
    expect(parseTaskIntent({ ...GOOD_INTENT, confirmedBy: '' })).toBeNull()
    expect(parseTaskIntent({ ...GOOD_INTENT, confirmedAt: 'x', revisions: [{ at: 'x' }] })).toBeNull()
  })

  it('Gherkin 骨架：When/Then 与中英文；缺 Then 拒绝', () => {
    expect(hasGherkinSkeleton('When x Then y')).toBe(true)
    expect(hasGherkinSkeleton('当 金额为 0 那么 拒绝')).toBe(true)
    expect(hasGherkinSkeleton('Given x When y')).toBe(false)
  })

  it('写入通道：登记→回读→哈希稳定；修订自动留痕；bad-ac 拒绝写盘', () => {
    const fx = tmpProject()
    try {
      const file = writeIntent(fx.dir)
      const first = loadTaskIntent(file)!
      expect(first.taskId).toBe('T-1')
      expect(first.revisions).toBeUndefined()
      writeTaskIntent(file, { ...GOOD_INTENT, statement: '改做退款+撤销' }, { revise: true, reason: '范围扩大' })
      const revised = loadTaskIntent(file)!
      expect(revised.statement).toBe('改做退款+撤销')
      expect(revised.revisions).toHaveLength(1)
      expect(revised.revisions![0].reason).toBe('范围扩大')
      expect(() => writeTaskIntent(file, { ...GOOD_INTENT, acceptance: ['没有骨架'] })).toThrow(/When\/Then/)
      expect(() => writeTaskIntent(file, GOOD_INTENT, { revise: true })).toThrow(/--reason/)
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})

describe('scope executor × taskIntent 漂移对账', () => {
  const intentExec = (ti?: ExecutorSpec['taskIntent']): ExecutorSpec => ({
    id: 'l0.intent', type: 'scope', mode: 'scope',
    ...(ti ? { taskIntent: ti } : {}),
    evidenceType: 'intent-drift-result',
  })
  const TI_FILE = '.qgate/registers/task-intent.json'

  it('交集通过 → pass 点名 taskId', () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'scope.yaml'), 'paths:\n  - "src/**"\n')
      const file = writeIntent(fx.dir)
      const ev = runScopeExecutor(intentExec({ file: TI_FILE, acknowledgedSha256: taskIntentSha256(file)!, require: true }),
        { runId: 'r', gateId: 'g', workspace: fx.dir, changedPaths: ['src/a.ts'] })
      expect(ev.result).toBe('pass')
      expect(ev.summary).toContain('T-1')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })

  it('越出意图范围 → fail outside-task-scope；require 无登记 → fail no-task-intent', () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'scope.yaml'), 'paths:\n  - "src/**"\n  - "docs/**"\n')
      writeIntent(fx.dir)
      // docs/** 在 scope.yaml 内但不在意图 scope 内 → 交集判负
      const out = runScopeExecutor(intentExec({ file: TI_FILE, require: true }),
        { runId: 'r', gateId: 'g', workspace: fx.dir, changedPaths: ['docs/x.md'] })
      expect(out.result).toBe('fail')
      expect(out.summary).toContain('outside-task-scope')
      rmSync(join(fx.qgateDir, 'registers', 'task-intent.json'))
      const none = runScopeExecutor(intentExec({ file: TI_FILE, require: true }),
        { runId: 'r', gateId: 'g', workspace: fx.dir, changedPaths: ['src/a.ts'] })
      expect(none.result).toBe('fail')
      expect(none.summary).toContain('no-task-intent')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })

  it('登记被静默修改 → fail intent-file-modified；显式修订重绑后 → pass', () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'scope.yaml'), 'paths:\n  - "src/**"\n  - "docs/**"\n')
      const file = writeIntent(fx.dir)
      const bound = taskIntentSha256(file)!
      // 篡改：绕过写入通道直接改文件
      writeFileSync(file, JSON.stringify({ ...loadTaskIntent(file)!, scope: ['**/*'] }))
      const tampered = runScopeExecutor(intentExec({ file: TI_FILE, acknowledgedSha256: bound, require: true }),
        { runId: 'r', gateId: 'g', workspace: fx.dir, changedPaths: ['src/a.ts'] })
      expect(tampered.result).toBe('fail')
      expect(tampered.summary).toContain('intent-file-modified')
      // 显式修订并重绑
      writeTaskIntent(file, { ...GOOD_INTENT, scope: ['src/**', 'docs/**'] }, { revise: true, reason: '扩范围' })
      const ok = runScopeExecutor(intentExec({ file: TI_FILE, acknowledgedSha256: taskIntentSha256(file)!, require: true }),
        { runId: 'r', gateId: 'g', workspace: fx.dir, changedPaths: ['src/a.ts', 'docs/x.md'] })
      expect(ok.result).toBe('pass')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })

  it('验收条目缺骨架 → fail 点名；登记畸形 → error（INCONCLUSIVE 方向）', () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'scope.yaml'), 'paths:\n  - "src/**"\n')
      const file = join(fx.qgateDir, 'registers', 'task-intent.json')
      writeFileSync(file, JSON.stringify({ ...GOOD_INTENT, acceptance: ['no skeleton'], confirmedAt: '2026-10-01T00:00:00Z' }))
      const badAc = runScopeExecutor(intentExec({ file: TI_FILE, require: true }),
        { runId: 'r', gateId: 'g', workspace: fx.dir, changedPaths: ['src/a.ts'] })
      expect(badAc.result).toBe('fail')
      expect(badAc.summary).toContain('Gherkin')
      writeFileSync(file, '{broken json')
      const broken = runScopeExecutor(intentExec({ file: TI_FILE, require: true }),
        { runId: 'r', gateId: 'g', workspace: fx.dir, changedPaths: ['src/a.ts'] })
      expect(broken.result).toBe('error')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})

describe('register executor（debt/assumptions/decisions）', () => {
  const regExec = (register: ExecutorSpec['register']): ExecutorSpec => ({
    id: 'reg', type: 'register', register, evidenceType: 'reg-result',
  })
  const writeReg = (fx: { qgateDir: string }, name: string, value: unknown) =>
    writeFileSync(join(fx.qgateDir, 'registers', name), JSON.stringify(value))

  it('debt：open+high 阻断、逾期阻断、空登记须 none:true、正常通过', () => {
    const fx = tmpProject()
    try {
      writeReg(fx, 'debt.json', [{ id: 'D-1', description: 'x', owner: 'a', impact: 'i', repayment: 'r', severity: 'high', status: 'open' }])
      expect(runRegisterExecutor(regExec(['debt']), { runId: 'r', gateId: 'g', workspace: fx.dir }).result).toBe('fail')
      writeReg(fx, 'debt.json', [{ id: 'D-1', description: 'x', owner: 'a', impact: 'i', repayment: 'r', severity: 'low', status: 'open', dueDate: '2020-01-01' }])
      const overdue = runRegisterExecutor(regExec(['debt']), { runId: 'r', gateId: 'g', workspace: fx.dir })
      expect(overdue.result).toBe('fail')
      expect(overdue.summary).toContain('overdue')
      writeReg(fx, 'debt.json', [])
      expect(runRegisterExecutor(regExec(['debt']), { runId: 'r', gateId: 'g', workspace: fx.dir }).result).toBe('error') // 裸空数组
      writeReg(fx, 'debt.json', { none: true })
      const ok = runRegisterExecutor(regExec(['debt']), { runId: 'r', gateId: 'g', workspace: fx.dir })
      expect(ok.result).toBe('pass')
      expect(ok.execution).toBe('exercised')
      rmSync(join(fx.qgateDir, 'registers', 'debt.json'))
      expect(runRegisterExecutor(regExec(['debt']), { runId: 'r', gateId: 'g', workspace: fx.dir }).result).toBe('error')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })

  it('assumptions：未确认 FAIL、引用悬空 ERROR、全确认 PASS', () => {
    const fx = tmpProject()
    try {
      writeReg(fx, 'assumptions.json', [{ id: 'A-1', assumption: 'DB 已迁移', confirmed: false }])
      expect(runRegisterExecutor(regExec(['assumptions']), { runId: 'r', gateId: 'g', workspace: fx.dir }).result).toBe('fail')
      writeReg(fx, 'assumptions.json', [{ id: 'A-1', assumption: 'x', confirmed: true, source: { file: 'docs/missing.md' } }])
      const dangling = runRegisterExecutor(regExec(['assumptions']), { runId: 'r', gateId: 'g', workspace: fx.dir })
      expect(dangling.result).toBe('error')
      expect(dangling.summary).toContain('file not found')
      mkdirSync(join(fx.dir, 'docs'), { recursive: true })
      writeFileSync(join(fx.dir, 'docs', 'prd.md'), '# prd')
      writeReg(fx, 'assumptions.json', [{ id: 'A-1', assumption: 'x', confirmed: true, source: { file: 'docs/prd.md' } }])
      expect(runRegisterExecutor(regExec(['assumptions']), { runId: 'r', gateId: 'g', workspace: fx.dir }).result).toBe('pass')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })

  it('decisions：deferred 逾期 FAIL、缺 revisitBy ERROR、resolved PASS；md 回退 present 级', () => {
    const fx = tmpProject()
    try {
      writeReg(fx, 'decisions.json', [{ id: 'OD-1', decision: 'x', status: 'deferred', revisitBy: '2020-01-01' }])
      const overdue = runRegisterExecutor(regExec(['decisions']), { runId: 'r', gateId: 'g', workspace: fx.dir })
      expect(overdue.result).toBe('fail')
      expect(overdue.summary).toContain('overdue')
      writeReg(fx, 'decisions.json', [{ id: 'OD-1', decision: 'x', status: 'deferred' }])
      expect(runRegisterExecutor(regExec(['decisions']), { runId: 'r', gateId: 'g', workspace: fx.dir }).result).toBe('error')
      writeReg(fx, 'decisions.json', [{ id: 'OD-1', decision: 'x', status: 'resolved' }])
      expect(runRegisterExecutor(regExec(['decisions']), { runId: 'r', gateId: 'g', workspace: fx.dir }).result).toBe('pass')
      // md 回退：JSON 移除、md 在档含标记 → pass 但 present 级
      rmSync(join(fx.qgateDir, 'registers', 'decisions.json'))
      writeFileSync(join(fx.qgateDir, 'registers', 'decisions.md'), '## Decisions\n- decision: 用 SQLite\n  status: accepted\n')
      const md = runRegisterExecutor(regExec(['decisions']), { runId: 'r', gateId: 'g', workspace: fx.dir })
      expect(md.result).toBe('pass')
      expect(md.execution).toBe('present')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})

describe('traceability 元门（RTM）', () => {
  const rtmExec = (): ExecutorSpec => ({ id: 'rtm', type: 'traceability', evidenceType: 'requirement-trace-result' })
  const linkedSpec: GateSpec = {
    apiVersion: 'qgate/v1alpha1', kind: 'Gate',
    metadata: { id: 'test.linked', version: '0.1.0' },
    spec: {
      domain: 'L1', claims: ['c'], triggers: ['task_close'],
      executors: [{ id: 'e', type: 'command', command: [process.execPath, '-e', ''], evidenceType: 'x' }],
      evidence: { required: ['x'] }, policy: { failure: 'block', inconclusive: 'block' },
    },
  }
  const rtmSpec: GateSpec = {
    apiVersion: 'qgate/v1alpha1', kind: 'Gate',
    metadata: { id: 'L0.requirement-trace', version: '0.1.0' },
    spec: {
      domain: 'L0', claims: ['c'], triggers: ['task_close'], meta: true,
      executors: [rtmExec()], evidence: { required: ['requirement-trace-result'] },
      policy: { failure: 'block', inconclusive: 'warn' },
    },
  }
  const writeRtm = (fx: { dir: string; qgateDir: string }, acs: unknown[]) => {
    mkdirSync(join(fx.dir, 'docs'), { recursive: true })
    writeFileSync(join(fx.dir, 'docs', 'PRD.md'), '# PRD')
    writeFileSync(join(fx.qgateDir, 'registers', 'requirements.json'), JSON.stringify({
      requirements: [{ id: 'REQ-1', prdRef: 'docs/PRD.md#r1', acceptanceCriteria: acs }],
    }))
  }

  it('全链通过：codeFile 存在 + 链接门新鲜 PASS → pass', async () => {
    const fx = tmpProject()
    try {
      mkdirSync(join(fx.dir, 'src'), { recursive: true })
      writeFileSync(join(fx.dir, 'src', 'pay.ts'), 'export const x = 1')
      // 项目门声明（让链接门对 traceability 可见）；命令不得含空串 argv（解析器按设计拒收）
      mkdirSync(join(fx.qgateDir, 'gates'), { recursive: true })
      writeFileSync(join(fx.qgateDir, 'gates', 'linked.yaml'), [
        'apiVersion: qgate/v1alpha1', 'kind: Gate',
        'metadata: { id: test.linked, version: 0.1.0 }',
        'spec:', '  domain: L1', '  claims: [c]', '  triggers: [task_close]',
        `  executors: [{ id: e, type: command, command: ["${process.execPath}", "-e", "0"], evidenceType: x }]`,
        '  evidence: { required: [x] }',
        '  policy: { failure: block, inconclusive: block }',
      ].join('\n'))
      writeRtm(fx, [{ id: 'AC-1', codeFiles: ['src/pay.ts'], testGateIds: ['test.linked'] }])
      await runGate({ spec: linkedSpec, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: [] })
      const rtm = await runGate({ spec: rtmSpec, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: [] })
      expect(rtm.run.verdict).toBe('PASS')
      expect(rtm.evidence[0].summary).toContain('1 requirements / 1 ACs fully traced')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })

  it('负例三连：codeFile 缺失 / 链接门非 PASS / 链接门未知 → fail 指名；登记缺失 → error', async () => {
    const fx = tmpProject()
    try {
      writeRtm(fx, [
        { id: 'AC-1', codeFiles: ['src/ghost.ts'], testGateIds: ['test.linked'] },
        { id: 'AC-2', codeFiles: ['docs/PRD.md'], testGateIds: ['test.unknown'] },
      ])
      const direct = runTraceabilityExecutor(rtmExec(), { runId: 'r', gateId: 'g', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: [] })
      expect(direct.result).toBe('fail')
      expect(direct.summary).toContain('src/ghost.ts')
      expect(direct.summary).toContain('test.unknown')
      rmSync(join(fx.qgateDir, 'registers', 'requirements.json'))
      const missing = runTraceabilityExecutor(rtmExec(), { runId: 'r', gateId: 'g', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: [] })
      expect(missing.result).toBe('error')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })

  it('链接门 FAIL 时 RTM 不得 PASS（元门读到真实判定）', async () => {
    const fx = tmpProject()
    try {
      mkdirSync(join(fx.dir, 'src'), { recursive: true })
      writeFileSync(join(fx.dir, 'src', 'pay.ts'), 'export const x = 1')
      mkdirSync(join(fx.qgateDir, 'gates'), { recursive: true })
      writeFileSync(join(fx.qgateDir, 'gates', 'linked.yaml'), 'apiVersion: qgate/v1alpha1\nkind: Gate\nmetadata: { id: test.linked, version: 0.1.0 }\nspec: { domain: L1, claims: [c], triggers: [task_close], executors: [{ id: e, type: command, command: ["sh", "-c", "exit 1"], evidenceType: x }], evidence: { required: [x] }, policy: { failure: block, inconclusive: block } }\n')
      writeRtm(fx, [{ id: 'AC-1', codeFiles: ['src/pay.ts'], testGateIds: ['test.linked'] }])
      const failSpec: GateSpec = { ...linkedSpec, spec: { ...linkedSpec.spec, executors: [{ id: 'e', type: 'command', command: [process.execPath, '-e', 'process.exit(1)'], evidenceType: 'x' }] } }
      await runGate({ spec: failSpec, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: [] })
      const rtm = await runGate({ spec: rtmSpec, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: [] })
      expect(rtm.run.verdict).toBe('FAIL')
      expect(rtm.evidence[0].summary).toContain('verdict=FAIL')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})

describe('门包 YAML 与 profile 裁剪（v0.3 新门接线）', () => {
  it('L0.requirement-trace / L0.intent-drift / L5.technical-debt / L0.registers v0.2 全部通过解析', () => {
    for (const rel of ['l0/gates/requirement-trace.yaml', 'l0/gates/intent-drift.yaml', 'delivery/gates/technical-debt.yaml', 'l0/gates/registers.yaml']) {
      const spec = parseGateSpec(parseYaml(readYaml(join(packsRoot, rel), 'utf8')))
      expect(spec, rel).not.toBeNull()
    }
    const rtm = parseGateSpec(parseYaml(readYaml(join(packsRoot, 'l0/gates/requirement-trace.yaml'), 'utf8')))!
    expect(rtm.spec.meta).toBe(true)
    const intent = parseGateSpec(parseYaml(readYaml(join(packsRoot, 'l0/gates/intent-drift.yaml'), 'utf8')))!
    expect(intent.spec.executors[0].taskIntent?.require).toBe(true)
    const regs = parseGateSpec(parseYaml(readYaml(join(packsRoot, 'l0/gates/registers.yaml'), 'utf8')))!
    expect(regs.spec.executors[0].register).toEqual(['assumptions', 'decisions'])
  })
})

describe('CLI intent（唯一写入通道 + 哈希重绑）', () => {
  it('登记→项目门 acknowledgedSha256 自动重绑→修订留痕', () => {
    const fx = tmpProject()
    try {
      // feature-close 档（vibe-fast 按设计禁用 intent-drift）
      writeFileSync(join(fx.qgateDir, 'qgate.yaml'), 'profile: feature-close\nclaims: []\n')
      mkdirSync(join(fx.qgateDir, 'gates'), { recursive: true })
      writeFileSync(join(fx.qgateDir, 'scope.yaml'), 'paths:\n  - "src/**"\n')
      writeFileSync(join(fx.qgateDir, 'gates', 'intent-drift.yaml'), [
        'apiVersion: qgate/v1alpha1', 'kind: Gate',
        'metadata: { id: L0.intent-drift, version: 0.1.0 }',
        'spec:', '  domain: L0', '  claims: [c]', '  triggers: [task_close]',
        '  executors:',
        '    - id: l0.intent',
        '      type: scope',
        '      mode: scope',
        '      taskIntent:',
        '        file: ".qgate/registers/task-intent.json"',
        '        require: true',
        '      evidenceType: intent-drift-result',
        '  evidence: { required: [intent-drift-result] }',
        '  policy: { failure: block, inconclusive: warn }',
      ].join('\n'))
      const reg = spawnSync('node', [distCli, 'intent', '--task-id', 'T-9', '--statement', '做退款', '--scope', 'src/**', '--acceptance', 'When x Then y', '--confirmed-by', 'tester'], { cwd: fx.dir, encoding: 'utf8', timeout: 30_000 })
      expect(reg.status).toBe(0)
      expect(reg.stdout).toContain('registered task-intent T-9')
      expect(reg.stdout).toContain('re-bound acknowledgedSha256 in: intent-drift.yaml')
      const gateText = readFileSync(join(fx.qgateDir, 'gates', 'intent-drift.yaml'), 'utf8')
      const sha = taskIntentSha256(join(fx.qgateDir, 'registers', 'task-intent.json'))!
      expect(gateText).toContain(sha)
      const rev = spawnSync('node', [distCli, 'intent', '--revise', '--reason', '扩范围', '--scope', 'src/**,docs/**'], { cwd: fx.dir, encoding: 'utf8', timeout: 30_000 })
      expect(rev.status).toBe(0)
      expect(rev.stdout).toContain('revised task-intent T-9')
      const intent = loadTaskIntent(join(fx.qgateDir, 'registers', 'task-intent.json'))!
      expect(intent.scope).toEqual(['src/**', 'docs/**'])
      expect(intent.revisions).toHaveLength(1)
      // 重绑后门能过：变更在交集内
      const run = spawnSync('node', [distCli, 'run', 'L0.intent-drift', '--changed', 'src/a.ts'], { cwd: fx.dir, encoding: 'utf8', timeout: 30_000 })
      expect(run.stdout).toContain('L0.intent-drift: PASS')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })

  it('bad-ac 拒绝登记（写入面 fail-closed）', () => {
    const fx = tmpProject()
    try {
      const bad = spawnSync('node', [distCli, 'intent', '--task-id', 'T-1', '--statement', 'x', '--scope', 'src/**', '--acceptance', '没骨架', '--confirmed-by', 'tester'], { cwd: fx.dir, encoding: 'utf8', timeout: 30_000 })
      expect(bad.status).toBe(2)
      expect(bad.stderr).toContain('When/Then')
      expect(existsSync(join(fx.qgateDir, 'registers', 'task-intent.json'))).toBe(false)
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})
