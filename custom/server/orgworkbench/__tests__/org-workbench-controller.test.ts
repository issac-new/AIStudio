// custom/server/orgworkbench/__tests__/org-workbench-controller.test.ts
// 批三 T4 守门：REST 控制器 GET /api/hermes/org-workbench/agenda（spec
// 2026-11-21-ai-native-orgworkbench-batch3 §四）——OUTCOME_WORKBENCH 功能门
// （与 outcome-controller 同款 404 语义）、宿主 JWT（ctx.state.user 缺席 401）、
// 六源装配（deps 注入桩＋默认真实接线空存储 fail-soft）、逐源失败仍 200 且
// available:false（不伪装零数据）。
// 挂载范式跟随 outcome/__tests__/outcome-controller.test.ts（Koa + createServer + fetch）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import type { AddressInfo } from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { PlatformPrincipal } from '../../../platform/contracts/identity'
import type { PendingItem } from '../../approval-inbox/pending-sources'
import type { Premise } from '../../premiselog/premise-log'
import type { ReviewCase, ReviewFinding, FindingVerification, RiskAssessment } from '../../reviewgov/types'
import type { EscalationRequest } from '../../escalation/escalation-store'
import type { ExpCandidate } from '../../expcandidates/exp-types'
import type { AgendaDeps, AgendaSourceKind } from '../agenda'

const NOW = 1_789_000_000_000
const DAY = 86_400_000

async function fetchJson(base: string, path: string) {
  const res = await fetch(`${base}${path}`)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

// ── 夹具（只填正身必填字段；投影形状细节由 agenda.test.ts 锁，这里只验装配）──

const pend = (id: string, over: Partial<PendingItem> = {}): PendingItem => ({
  id,
  kind: 'command',
  title: `双签部署 ${id}`,
  detail: '',
  createdAt: NOW - 2 * DAY,
  risk: 'high',
  dualSignRequired: true,
  outcomeRef: { outcomeId: 'oc-sign', contractVersion: 1, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
  ...over,
})

const premise = (id: string): Premise => ({
  id,
  statement: '若三日内登录率低于 40%，则注册流程存在断点',
  kind: 'market',
  scope: ['custom/server/orgworkbench'],
  reviewAt: NOW - 3 * DAY,
  status: 'hold',
  confidence: 'medium',
  createdAt: NOW - 30 * DAY,
  createdBy: 'p-analyst',
  updatedAt: NOW - 30 * DAY,
})

const disagreementFinding = (): ReviewFinding => {
  const votes: FindingVerification[] = [
    { voter: 'a-1', actorKind: 'agent', vote: 'confirm', at: NOW - DAY },
    { voter: 'a-2', actorKind: 'agent', vote: 'reject', at: NOW - DAY },
  ]
  return {
    findingId: 'f-1',
    file: 'custom/server/x.ts',
    line: 10,
    body: '该分支漏了空值检查',
    severity: 'important',
    origin: 'new',
    authorKind: 'agent',
    round: 1,
    dedupeKey: 'k-f-1',
    state: 'open',
    deferred: false,
    duplicateCount: 0,
    verifications: votes,
    createdAt: NOW - 2 * DAY,
  }
}

const reviewCase = (): ReviewCase => {
  const risk: RiskAssessment = {
    tier: 'medium',
    requiredHumanApprovals: 1,
    reasons: [],
    protectedHits: [],
    sensitiveHits: [],
    trustedAuthor: false,
    breakerTightened: false,
    classifiedAt: NOW,
  }
  return {
    caseId: 'rc-1',
    title: '评审 rc-1',
    authorKind: 'agent',
    changedPaths: [],
    diffLines: 10,
    behindFlag: false,
    risk,
    rounds: [],
    findings: [disagreementFinding()],
    approvals: [],
    checks: 'unknown',
    state: 'open',
    createdAt: NOW - 5 * DAY,
    updatedAt: NOW,
  }
}

const escalation = (): EscalationRequest => ({
  escalationId: 'esc-1',
  fromAgent: 'agent-hu',
  scope: { tool: 'terminal_exec' },
  urgency: 'urgent',
  reason: '需要写权限',
  at: NOW - 6 * 3_600_000,
  state: 'pending',
})

const candidate = (): ExpCandidate => ({
  id: 'exp-1',
  type: 'antipattern',
  statement: '同类拦截反复出现，建议先跑检查再提交',
  fingerprint: 'fp-exp-1',
  evidence: [{ taskId: 't-901', note: '三次拦截', at: Math.floor((NOW - DAY) / 1000) }],
  status: 'candidate',
  createdAt: new Date(NOW - 2 * DAY).toISOString(),
  updatedAt: new Date(NOW - DAY).toISOString(),
  injectedRuns: [],
  outcomeId: 'oc-sign',
})

/** 七源各回单条的桩（覆盖全部 AgendaDeps 键）。 */
function stubDeps(over: Partial<AgendaDeps> = {}): AgendaDeps {
  return {
    collectPendingItems: () => [pend('fleetfile:rq-1')],
    listContracts: () => [{
      outcomeId: 'oc-overdue',
      title: '逾期合同',
      dueAt: NOW - DAY,
      status: 'active',
      ownerPersonId: 'p-owner-2',
      riskTier: 'medium',
      updatedAt: NOW,
    }],
    listPremises: () => [premise('pr-20261121-0001')],
    listCases: () => [reviewCase()],
    listPendingEscalations: () => [escalation()],
    listCandidates: () => [candidate()],
    listDraftTeams: () => [{ outcomeId: 'oc-team', version: 2, updatedAt: NOW - DAY }],
    ...over,
  }
}

const KIND_BY_SOURCE: Record<AgendaSourceKind, string> = {
  approvals: 'dual_sign_pending',
  outcome_contracts: 'outcome_overdue',
  premises: 'premise_due',
  review_cases: 'review_disagreement',
  escalations: 'escalation_pending',
  exp_candidates: 'learning_candidate',
  outcome_teams: 'team_pending',
}

const SOURCE_KEYS = Object.keys(KIND_BY_SOURCE) as AgendaSourceKind[]

/** 源 kind → AgendaDeps 读函数名（覆盖注桩按此键命中）。 */
const DEP_KEY_BY_SOURCE: Record<AgendaSourceKind, keyof AgendaDeps> = {
  approvals: 'collectPendingItems',
  outcome_contracts: 'listContracts',
  premises: 'listPremises',
  review_cases: 'listCases',
  escalations: 'listPendingEscalations',
  exp_candidates: 'listCandidates',
  outcome_teams: 'listDraftTeams',
}

describe('org-workbench 控制器（/api/hermes/org-workbench/agenda）', () => {
  let base: string
  let server: ReturnType<typeof createServer>
  let currentUser: PlatformPrincipal | undefined
  // 默认真实接线组的隔离 env（空存储）
  let tmpDefaultRoot: string
  const defaultEnvKeys = [
    'HERMES_APPROVALS_QUEUE_DIR', 'HERMES_REVIEW_GOV_DIR', 'HERMES_ESCALATION_DIR',
    'EXP_STORE', 'HERMES_PREMISE_LOG_DIR',
  ] as const

  beforeEach(async () => {
    process.env.OUTCOME_WORKBENCH = '1'
    currentUser = { id: 1, username: 'owner-1', role: 'super_admin', status: 'active' }
  })

  afterEach(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()))
    delete process.env.OUTCOME_WORKBENCH
    for (const k of defaultEnvKeys) delete process.env[k]
    if (tmpDefaultRoot) rmSync(tmpDefaultRoot, { recursive: true, force: true })
    currentUser = undefined
    const { _useOutcomeStoreForTests } = await import('../../outcome/outcome-store')
    _useOutcomeStoreForTests(null)
  })

  /** 起服：注入 deps 桩与固定时钟（缺省真实时钟）。 */
  const boot = async (deps?: Partial<AgendaDeps>, now?: () => number) => {
    const { registerOrgWorkbenchRoutes } = await import('../org-workbench-controller')
    const routes = registerOrgWorkbenchRoutes({ ...(deps ? { deps } : {}), ...(now ? { now } : {}) })
    const app = new Koa()
    app.use(async (ctx, next) => {
      if (currentUser) (ctx.state as { user?: PlatformPrincipal }).user = currentUser
      await next()
    })
    app.use(routes.routes())
    server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  describe('功能门 OUTCOME_WORKBENCH', () => {
    it('门关：404 + code=outcome_workbench_disabled + ok:false（登录与否都 404，门先于鉴权）', async () => {
      delete process.env.OUTCOME_WORKBENCH
      await boot(stubDeps(), () => NOW)
      const authed = await fetchJson(base, '/api/hermes/org-workbench/agenda')
      expect(authed.status).toBe(404)
      expect(authed.body.code).toBe('outcome_workbench_disabled')
      expect(authed.body.ok).toBe(false)
      currentUser = undefined
      const anon = await fetchJson(base, '/api/hermes/org-workbench/agenda')
      expect(anon.status).toBe(404)
      expect(anon.body.code).toBe('outcome_workbench_disabled')
    })

    it('门关中途打开即时生效（每请求动态读 env，不缓存）', async () => {
      delete process.env.OUTCOME_WORKBENCH
      await boot(stubDeps(), () => NOW)
      const before = await fetchJson(base, '/api/hermes/org-workbench/agenda')
      expect(before.status).toBe(404)
      process.env.OUTCOME_WORKBENCH = '1'
      const after = await fetchJson(base, '/api/hermes/org-workbench/agenda')
      expect(after.status).toBe(200)
    })
  })

  describe('鉴权（宿主 JWT → ctx.state.user）', () => {
    it('无 JWT（ctx.state.user 缺席）：401 + ok:false', async () => {
      currentUser = undefined
      await boot(stubDeps(), () => NOW)
      const res = await fetchJson(base, '/api/hermes/org-workbench/agenda')
      expect(res.status).toBe(401)
      expect(res.body.ok).toBe(false)
    })

    it('任意登录用户可读（读面无角色门）：200', async () => {
      currentUser = { id: 2, username: 'member-1', role: 'member', status: 'active' }
      await boot(stubDeps(), () => NOW)
      const res = await fetchJson(base, '/api/hermes/org-workbench/agenda')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })
  })

  describe('GET /agenda 六源装配', () => {
    it('200 正常：七源各 1 项、kind 对位、generatedAt=注入时钟', async () => {
      await boot(stubDeps(), () => NOW)
      const res = await fetchJson(base, '/api/hermes/org-workbench/agenda')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.generatedAt).toBe(NOW)
      const sources = res.body.sources as Record<string, { available: boolean; itemCount: number; items?: Array<{ kind: string }> }>
      expect(Object.keys(sources).sort()).toEqual([...SOURCE_KEYS].sort())
      for (const key of SOURCE_KEYS) {
        expect(sources[key].available, `源 ${key} available`).toBe(true)
        expect(sources[key].itemCount, `源 ${key} itemCount`).toBe(1)
        expect(sources[key].items![0].kind, `源 ${key} kind`).toBe(KIND_BY_SOURCE[key])
      }
    })

    it('源读函数返回空 → available:true + itemCount:0（零数据=真的零数据）', async () => {
      const empty = Object.fromEntries(
        SOURCE_KEYS.map((k) => [DEP_KEY_BY_SOURCE[k], () => []]),
      ) as unknown as AgendaDeps
      await boot(empty, () => NOW)
      const res = await fetchJson(base, '/api/hermes/org-workbench/agenda')
      expect(res.status).toBe(200)
      const sources = res.body.sources as Record<string, { available: boolean; itemCount: number }>
      for (const key of SOURCE_KEYS) {
        expect(sources[key].available).toBe(true)
        expect(sources[key].itemCount).toBe(0)
      }
    })
  })

  describe('逐源 fail-soft（失败不伪装零数据、不阻断他源）', () => {
    it('单源抛异常：仍 200，该源 available:false + error，其余源照常', async () => {
      const over: Partial<AgendaDeps> = {
        listPremises: () => { throw new Error('premise store exploded') },
      }
      await boot(stubDeps(over), () => NOW)
      const res = await fetchJson(base, '/api/hermes/org-workbench/agenda')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      const sources = res.body.sources as Record<string, { available: boolean; itemCount: number; error?: string }>
      expect(sources.premises.available).toBe(false)
      expect(sources.premises.itemCount).toBe(0)
      expect(sources.premises.error).toContain('premise store exploded')
      expect(sources.premises.items).toBeUndefined()
      for (const key of SOURCE_KEYS.filter((k) => k !== 'premises')) {
        expect(sources[key].available, `源 ${key} 不受牵连`).toBe(true)
        expect(sources[key].itemCount).toBe(1)
      }
    })

    it('全部源抛异常：仍 200，七源全 available:false（不 500、不伪装零数据）', async () => {
      const boom = Object.fromEntries(
        SOURCE_KEYS.map((k) => [DEP_KEY_BY_SOURCE[k], () => { throw new Error(`boom-${k}`) }]),
      ) as unknown as AgendaDeps
      await boot(boom, () => NOW)
      const res = await fetchJson(base, '/api/hermes/org-workbench/agenda')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      const sources = res.body.sources as Record<string, { available: boolean; error?: string }>
      for (const key of SOURCE_KEYS) {
        expect(sources[key].available).toBe(false)
        expect(sources[key].error).toContain(`boom-${key}`)
      }
    })
  })

  describe('默认装配（真实六源接线，空存储 fail-soft）', () => {
    it('不传 deps：七源全 available:true 且 itemCount:0（空存储不炸、不误报失败）', async () => {
      tmpDefaultRoot = mkdtempSync(join(tmpdir(), 'orgwb-default-'))
      process.env.HERMES_APPROVALS_QUEUE_DIR = tmpDefaultRoot
      process.env.HERMES_REVIEW_GOV_DIR = tmpDefaultRoot
      process.env.HERMES_ESCALATION_DIR = tmpDefaultRoot
      process.env.EXP_STORE = tmpDefaultRoot
      process.env.HERMES_PREMISE_LOG_DIR = tmpDefaultRoot
      const { _useOutcomeStoreForTests } = await import('../../outcome/outcome-store')
      _useOutcomeStoreForTests(tmpDefaultRoot)
      await boot() // 无 deps 覆盖 → 真实六源
      const res = await fetchJson(base, '/api/hermes/org-workbench/agenda')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(typeof res.body.generatedAt).toBe('number')
      const sources = res.body.sources as Record<string, { available: boolean; itemCount: number }>
      for (const key of SOURCE_KEYS) {
        expect(sources[key].available, `源 ${key} 空存储应 available`).toBe(true)
        expect(sources[key].itemCount).toBe(0)
      }
    })
  })
})
