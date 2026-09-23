// QGate 内核单测（Phase 1 验收；vitest 由 overlay 根 npm test 统一收）。
// 覆盖面：解析容错 / 判定引擎 / 对齐表 / glob 与影响分析 / Profile 裁剪 / 存储回读 / 端到端 command 门。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseClaim, parseGateSpec, parseProfile } from '../src/core/parse.js'
import { decide } from '../src/core/decision.js'
import { globMatch, appliesToChanged, selectGates } from '../src/core/impact.js'
import { resolveProfile, effectivePolicy } from '../src/core/profile.js'
import { storePaths, saveRun, loadRun, loadRunEvidence, latestRuns, isFresh } from '../src/core/store.js'
import { VERDICT_TO_DELIVERY, tierOfProfile, supportsPass } from '../src/core/align.js'
import { runGate } from '../src/core/run.js'
import type { Evidence, GateSpec } from '../src/core/types.js'

const gateSpec = (over: Partial<GateSpec['spec']> = {}): GateSpec => ({
  apiVersion: 'qgate/v1alpha1',
  kind: 'Gate',
  metadata: { id: 't.gate', version: '0.1.0' },
  spec: {
    domain: 'L1',
    claims: ['c1'],
    triggers: ['task_close'],
    executors: [{ id: 'e1', type: 'command', command: ['true'], evidenceType: 'x' }],
    evidence: { required: ['x'] },
    policy: { failure: 'block', inconclusive: 'block' },
    ...over,
  },
})

describe('parse 容错（解析器即校验器）', () => {
  it('合法 gate spec 全字段解析', () => {
    const spec = parseGateSpec({
      apiVersion: 'qgate/v1alpha1', kind: 'Gate',
      metadata: { id: 'data.persistence-integrity', version: '0.1.0', description: 'd' },
      spec: {
        domain: 'L2', claims: ['a', 'b'],
        appliesWhen: { changed: { any: ['src/**', '**/*.sql'] } },
        triggers: ['task_close', 'release'],
        executors: [
          { id: 'db', type: 'persistence', scenario: 's.yaml', evidenceType: 'db-after' },
          { id: 'cmd', type: 'command', command: ['npm', 'test'], evidenceType: 't', timeoutMs: 1000, expectExit: 0 },
        ],
        evidence: { required: ['db-after', 't'] },
        policy: { failure: 'block', inconclusive: 'warn', allowWaiver: true, maxAgeHours: 48 },
      },
    })
    expect(spec).not.toBeNull()
    expect(spec!.spec.appliesWhen!.changed.any).toEqual(['src/**', '**/*.sql'])
    expect(spec!.spec.policy.maxAgeHours).toBe(48)
  })

  it('appliesWhen.changed.all 缺省合法（回归：曾误判 null）', () => {
    const spec = parseGateSpec({
      ...gateSpecRaw(),
      spec: { ...gateSpecRaw().spec, appliesWhen: { changed: { any: ['src/**'] } } },
    })
    expect(spec).not.toBeNull()
  })

  it('非法输入一律 null：坏 domain / 空 claims / 坏 policy / 非对象 / 全空 appliesWhen', () => {
    const base = gateSpecRaw()
    expect(parseGateSpec({ ...base, spec: { ...base.spec, domain: 'L9' } })).toBeNull()
    expect(parseGateSpec({ ...base, spec: { ...base.spec, claims: [] } })).toBeNull()
    expect(parseGateSpec({ ...base, spec: { ...base.spec, policy: { failure: 'ignore', inconclusive: 'block' } } })).toBeNull()
    expect(parseGateSpec('not an object')).toBeNull()
    expect(parseGateSpec({ ...base, spec: { ...base.spec, appliesWhen: { changed: {} } } })).toBeNull()
  })

  it('claim：合法/缺 criticality/超长 statement', () => {
    expect(parseClaim({ id: 'C-1', statement: 's', domain: 'L2', criticality: 'high' })).not.toBeNull()
    expect(parseClaim({ id: 'C-1', statement: 's', domain: 'L2' })).toBeNull()
    expect(parseClaim({ id: 'C-1', statement: 'x'.repeat(4001), domain: 'L2', criticality: 'high' })).toBeNull()
  })

  it('profile：合法/坏 tier/enable 非串数组', () => {
    expect(parseProfile({ apiVersion: 'qgate/v1alpha1', kind: 'Profile', metadata: { id: 'p', tier: 'lite' }, spec: { enable: [], disable: [] } })).not.toBeNull()
    expect(parseProfile({ apiVersion: 'qgate/v1alpha1', kind: 'Profile', metadata: { id: 'p', tier: 'fast' }, spec: { enable: [], disable: [] } })).toBeNull()
    expect(parseProfile({ apiVersion: 'qgate/v1alpha1', kind: 'Profile', metadata: { id: 'p' }, spec: { enable: 'all', disable: [] } })).toBeNull()
  })
})

function gateSpecRaw() {
  return {
    apiVersion: 'qgate/v1alpha1', kind: 'Gate',
    metadata: { id: 't.gate', version: '0.1.0' },
    spec: {
      domain: 'L1', claims: ['c1'], triggers: ['task_close'],
      executors: [{ id: 'e1', type: 'command', command: ['true'], evidenceType: 'x' }],
      evidence: { required: ['x'] }, policy: { failure: 'block', inconclusive: 'block' },
    },
  }
}

describe('decision（No Evidence ≠ PASS；仅 exercised 可 PASS）', () => {
  const ev = (over: Partial<Evidence>): Evidence => ({
    id: 'ev1', runId: 'r1', gateId: 't.gate', type: 'x', producer: 'e1',
    result: 'pass', execution: 'exercised', provenance: { startedAt: 1 }, ...over,
  })

  it('exercised pass → PASS', () => {
    expect(decide(gateSpec(), [ev({})]).verdict).toBe('PASS')
  })
  it('缺证据 → INCONCLUSIVE（不是 PASS）', () => {
    expect(decide(gateSpec(), []).verdict).toBe('INCONCLUSIVE')
  })
  it('present/wired 级不算已验证 → INCONCLUSIVE', () => {
    expect(decide(gateSpec(), [ev({ execution: 'present' })]).verdict).toBe('INCONCLUSIVE')
    expect(decide(gateSpec(), [ev({ execution: 'wired' })]).verdict).toBe('INCONCLUSIVE')
  })
  it('executor error → INCONCLUSIVE（framework error 不是 gate fail）', () => {
    expect(decide(gateSpec(), [ev({ result: 'error' })]).verdict).toBe('INCONCLUSIVE')
  })
  it('exercised fail → FAIL；warn 策略降级 CONDITIONAL 且必带解除条件', () => {
    expect(decide(gateSpec(), [ev({ result: 'fail' })]).verdict).toBe('FAIL')
    const warned = decide(gateSpec({ policy: { failure: 'warn', inconclusive: 'block' } }), [ev({ result: 'fail' })])
    expect(warned.verdict).toBe('CONDITIONAL')
    expect(warned.conditions!.length).toBeGreaterThan(0)
  })
  it('conditional 证据 → CONDITIONAL 且带解除条件', () => {
    const d = decide(gateSpec(), [ev({ result: 'conditional' })])
    expect(d.verdict).toBe('CONDITIONAL')
    expect(d.conditions!.length).toBeGreaterThan(0)
  })
})

describe('语义对齐层', () => {
  it('verdict → delivery 三态满射', () => {
    for (const v of ['PASS', 'FAIL', 'CONDITIONAL', 'INCONCLUSIVE', 'WAIVED', 'NOT_APPLICABLE'] as const) {
      expect(['pass', 'conditional', 'reject']).toContain(VERDICT_TO_DELIVERY[v])
    }
    expect(VERDICT_TO_DELIVERY.PASS).toBe('pass')
    expect(VERDICT_TO_DELIVERY.FAIL).toBe('reject')
  })
  it('profile ↔ tier 三档同构', () => {
    expect(tierOfProfile('vibe-fast')).toBe('lite')
    expect(tierOfProfile('feature-close')).toBe('standard')
    expect(tierOfProfile('high-assurance')).toBe('compliance')
    expect(tierOfProfile('unknown')).toBeUndefined()
  })
  it('证据强度：仅 exercised 支撑 PASS', () => {
    expect(supportsPass('exercised')).toBe(true)
    expect(supportsPass('wired')).toBe(false)
    expect(supportsPass('present')).toBe(false)
  })
})

describe('glob 与影响分析', () => {
  it('glob 语义：** 跨目录、* 单段、? 单字符', () => {
    expect(globMatch('src/**', 'src/a/b/c.ts')).toBe(true)
    expect(globMatch('src/**', 'src/x.ts')).toBe(true)
    expect(globMatch('*.ts', 'a.ts')).toBe(true)
    expect(globMatch('*.ts', 'a/b.ts')).toBe(false)
    expect(globMatch('a?c.ts', 'abc.ts')).toBe(true)
    expect(globMatch('a?c.ts', 'abbc.ts')).toBe(false)
    expect(globMatch('**/*.test.ts', 'x/y/z.test.ts')).toBe(true)
  })
  it('appliesToChanged：any/all 语义', () => {
    const aw = { changed: { any: ['src/**'] } }
    expect(appliesToChanged(aw, ['src/a.ts'])).toBe(true)
    expect(appliesToChanged(aw, ['docs/a.md'])).toBe(false)
    expect(appliesToChanged({ changed: { all: ['package.json', 'src/**'] } }, ['package.json', 'src/a.ts'])).toBe(true)
    expect(appliesToChanged({ changed: { all: ['package.json', 'src/**'] } }, ['package.json'])).toBe(false)
    expect(appliesToChanged(undefined, ['anything'])).toBe(true)
  })
  it('selectGates 过滤', () => {
    const g1 = gateSpec({ appliesWhen: { changed: { any: ['src/**'] } } })
    const g2 = gateSpec()
    const picked = selectGates([g1, g2], ['docs/readme.md'])
    expect(picked.map((g) => g.metadata.id)).toEqual(['t.gate'])
  })
})

describe('Profile 裁剪', () => {
  it('disable 后缀通配 + override 生效；未配置时全开', () => {
    const gates = [gateSpec(), gateSpec({ domain: 'L2' })]
    const profile = parseProfile({
      apiVersion: 'qgate/v1alpha1', kind: 'Profile',
      metadata: { id: 'p', tier: 'lite' },
      spec: { enable: [], disable: ['t.*'], overrides: { 't.gate': { policy: { inconclusive: 'warn' } } } },
    })!
    const resolved = resolveProfile(gates, profile, 'p')
    expect(resolved.enabled.get('t.gate')).toBe(false)
    expect(resolved.policyOverrides.get('t.gate')?.inconclusive).toBe('warn')
    expect(effectivePolicy(gates[0], resolved).inconclusive).toBe('warn')
    expect(effectivePolicy(gates[0], resolveProfile(gates, undefined, undefined)).inconclusive).toBe('block')
  })

  it('质量域模式 L2/L2.* 匹配 domain 而非 id（回归：曾按 id 前缀误匹配 local.l2-guard）', () => {
    const l2Gate = gateSpec({ domain: 'L2' })
    l2Gate.metadata.id = 'local.l2-guard'
    const profile = parseProfile({
      apiVersion: 'qgate/v1alpha1', kind: 'Profile',
      metadata: { id: 'vibe-fast', tier: 'lite' },
      spec: { enable: ['engineering.*'], disable: ['L2.*'] },
    })!
    const resolved = resolveProfile([gateSpec(), l2Gate], profile, 'vibe-fast')
    expect(resolved.enabled.get('t.gate')).toBe(true) // L1 门保留
    expect(resolved.enabled.get('local.l2-guard')).toBe(false) // L2 域门被禁（id 不以 L2 开头）
  })
})

describe('存储与新鲜度', () => {
  it('run+evidence 落盘回读；state 索引最新覆盖', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qgate-store-'))
    try {
      const paths = storePaths(join(dir, '.qgate'))
      const run = {
        runId: 'run-1', gateId: 't.gate', gateVersion: '0.1.0', trigger: 'task_close' as const,
        workspace: dir, startedAt: 1000, endedAt: 2000, verdict: 'CONDITIONAL' as const,
        conditions: ['clear x'], evidenceIds: ['ev1'],
      }
      const ev: Evidence = {
        id: 'ev1', runId: 'run-1', gateId: 't.gate', type: 'x', producer: 'e1',
        result: 'pass', execution: 'exercised', provenance: { startedAt: 1000 },
      }
      saveRun(paths, run, [ev])
      expect(loadRun(paths, 'run-1')?.verdict).toBe('CONDITIONAL')
      expect(loadRunEvidence(paths, 'run-1')[0]?.id).toBe('ev1')
      expect(latestRuns(paths)['t.gate']?.runId).toBe('run-1')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('isFresh：同 treeHash 新鲜；同 commit 路径不相交新鲜；超龄陈旧；非 git 时间锚', () => {
    const now = 10 * 3_600_000
    const run = {
      runId: 'r', gateId: 'g', gateVersion: '0', trigger: 'task_close' as const,
      workspace: '/w', startedAt: now - 1000, verdict: 'PASS' as const, evidenceIds: [],
      commit: 'c1', treeHash: 't1',
    }
    const aw = { changed: { any: ['src/**'] } }
    expect(isFresh(run, now, { commit: 'c1', treeHash: 't1', changedPaths: ['src/a.ts'] }, 24)).toBe(true) // 同全状态锚，一票定音
    expect(isFresh(run, now, { commit: 'c1', treeHash: 't2', changedPaths: ['docs/a.md'], appliesWhen: aw }, 24)).toBe(true) // 同 commit 路径不相交
    expect(isFresh(run, now, { commit: 'c1', treeHash: 't2', changedPaths: ['src/a.ts'], appliesWhen: aw }, 24)).toBe(false) // 同 commit 路径相交
    expect(isFresh(run, now, { commit: 'c2', changedPaths: [] }, 24)).toBe(false)
    expect(isFresh({ ...run, startedAt: now - 2 * 3_600_000 }, now, { changedPaths: [] }, 1)).toBe(false) // 超 1h 龄
    expect(isFresh(run, now, { changedPaths: [] }, 24)).toBe(true) // 非 git：时间锚
  })
})

describe('端到端：command 门真实执行（spec→executor→evidence→decision→store）', () => {
  it('退出码 0 → PASS；退出码 1 → FAIL；命令不存在 → INCONCLUSIVE', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qgate-e2e-'))
    try {
      const qgateDir = join(dir, '.qgate')
      const pass = await runGate({ spec: gateSpec({ executors: [{ id: 'e1', type: 'command', command: ['true'], evidenceType: 'x' }] }), trigger: 'task_close', workspace: dir, qgateDir })
      expect(pass.run.verdict).toBe('PASS')
      const fail = await runGate({ spec: gateSpec({ executors: [{ id: 'e1', type: 'command', command: ['false'], evidenceType: 'x' }] }), trigger: 'task_close', workspace: dir, qgateDir })
      expect(fail.run.verdict).toBe('FAIL')
      const missing = await runGate({ spec: gateSpec({ executors: [{ id: 'e1', type: 'command', command: ['definitely-not-a-command-xyz'], evidenceType: 'x' }] }), trigger: 'task_close', workspace: dir, qgateDir })
      expect(missing.run.verdict).toBe('INCONCLUSIVE')
      const paths = storePaths(qgateDir)
      expect(loadRunEvidence(paths, pass.run.runId).length).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
