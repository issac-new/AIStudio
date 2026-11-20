// custom/server/outcome/outcome-controller.ts
// Outcome 域 REST 控制器与 OUTCOME_WORKBENCH 功能门（spec 2026-11-19-ai-native-
// operating-model-design.md §4.2/§4.6；批一 Task 7）。
//
// 端点表（简报逐字，前缀 /api/hermes/outcomes）：
//   GET  /                    —— 列表，query status/rootTaskId/owner 过滤（行级 readScope，T1 补）
//   POST /                    —— 创建（clientRequestId 幂等；rootTaskId 冲突 409）
//   GET  /:id                 —— 合同详情
//   PUT  /:id                 —— 修订（expectedVersion 乐观并发）
//   POST /:id/transitions     —— 状态迁移（eventId 幂等；非法 422 problems）
//   POST /:id/measurements    —— 测量提交（measurementId 幂等；evidenceRefs 必填）
//   GET  /:id/measurements    —— 测量读面（?measureId= 过滤；当前版本优先全量＋每 measure 最新摘要）
//   POST /:id/settlement      —— 结算签署（settlementId 幂等；unknown 须 gapNote+nextReviewAt）
//   GET  /:id/settlement      —— 结算读面（最新有效结算＋历史 superseded 链）
//   POST /:id/context-snapshots —— 生成最小上下文快照（sha256 内容幂等）
//   GET  /:id/context         —— 快照列表（?snapshotId= 指定取全量）
//
// 纪律：
// - 功能门：OUTCOME_WORKBENCH≠1 → 全端点 404 {code:'outcome_workbench_disabled'}（每请求
//   动态读 env，不缓存；fail 用 custom/server/lib/http，K19 信封）。
// - 权限（spec §4.6 + 任务裁决）：激活/修订/取消/结算/团队确认=ownerPersonId；observing
//   迁移与测量提交=owner 或 verificationOwnerId；actor 一律取服务端身份（ctx.state.user，
//   approval-inbox pending-controller actorOf 先例），客户端传入 signedBy/actor/recordedBy
//   一律忽略（白名单挑键实现）。owner/verifier 判权时还须在 people 名单中 active——
//   停用的人不得操作（spec §4.6「人员必须 active」）。
// - 不可变消费：applyReopen 返回新对象，本控制器不就地改嵌套；重开无专门路由（简报未列），
//   以导出函数 reopenOutcome 提供可调用面，由 Task 10 根任务重开外部触发。
// - 撕裂自愈：先账后物写序下「事件已落、contract.json 未写」由重放命中自愈——
//   eventId/settlementId 命中时校验合同状态与事件结果一致，撕裂（合同停在事件
//   from 态）则补写合同完成自愈（对齐 store create/快照的撕裂自愈语义）；合同已
//   演进到其他状态（如重开回 active）则如实返回原事件不回滚。
// - 幂等键作用域：clientRequestId 以 `${actor}:${clientRequestId}` 组合键落账与查定
//   （I2 裁决）——异 actor 重放同键不得命中他人合同；存量无组合键数据无需迁移。
// - 读面 authz（批二 T1，spec 批二 §一）：GET /、/:id、/:id/context、/:id/measurements、
//   /:id/settlement——owner/verifier（authz 同源判权：合同字段→people active 校验）得
//   readScope:'full' 全量；其他登录用户 200 但 readScope:'metadata' 脱去敏感内容
//   （最小集：合同 measures[].definition、快照 content 整体、测量 evidenceRefs、结算
//   rationale/gapNote——快照物化文本与 C1 保护面对齐）；列表面 readScope 行级（混合
//   归属）；功能门/404 语义不变。
// - 归属证明（spec §4.6）：opts.verifyRootTask 注入面返回 null（不可证明）默认
//   422 ownership_unavailable，env OUTCOME_ALLOW_UNVERIFIED_ROOT=1 显式放行（批一
//   试点/测试用，Task 10 接真实现后不再需要）；{ok:false}=可证明且不归属，永不放行。
import Router from '@koa/router'
import type { Context } from 'koa'
import { readdirSync } from 'fs'
import { join } from 'path'
import { atomicWriteJson } from '../lib/fs-store'
import { bodyOf, created, fail, ok } from '../lib/http'
import { activePersonIds } from '../agentidentity/people'
import { listAllContracts,
  appendEvent,
  appendMeasurement,
  appendSnapshot,
  createContract,
  getContract,
  listEvents,
  listMeasurements,
  listSnapshots,
  outcomeStoreRoot,
  updateContract,
} from './outcome-store'
import { applyReopen, transitionGuards } from './state-machine'
import { buildMinimalSnapshot, DEFAULT_DECISION_POLICY_VERSION } from './snapshot'
import type { SnapshotTaskSummary } from './snapshot'
import {
  bindOutcomeFamily,
  rootTaskSummary,
  snapshotPeopleRows,
  tasksTerminalOf,
  verifyRootTask,
} from './kanban-resolution'
import { suggestVerdict, validateSettlementInput, latestCurrentMeasurement } from './settlement'
import { OUTCOME_STATUSES } from './types'
import type { OutcomeContract, OutcomeMeasurement, OutcomeStatus } from './types'

/** 控制器注入面：observing 迁移的 allTasksTerminal 守卫由 Task 10 的 tasksByOutcome
 *  提供，批一以注入接口承接（缺省 fail-closed 返回 false）；taskSummaryOf 供快照
 *  resolve.task（缺省 null=任务源不可用，快照端点如实 422 不造假）。 */
export interface OutcomeControllerOptions {
  tasksTerminalOf?: (outcomeId: string) => boolean
  taskSummaryOf?: (rootTaskId: string) => SnapshotTaskSummary | null
  /** 根任务归属证明（spec §4.6）：null=不可证明（默认 422 ownership_unavailable，
   *  env OUTCOME_ALLOW_UNVERIFIED_ROOT=1 显式放行，批一试点/测试用，Task 10 接
   *  真实现后不再需要）；{ok:false}=可证明且不归属当前部署，永不放行。 */
  verifyRootTask?: (rootTaskId: string) => { ok: boolean } | null
  /** 政策版本标识：批一无政策存储，缺省固定标识；接正身后由调用方注入。 */
  decisionPolicyVersion?: string
}

/** 服务端身份（pending-controller actorOf 先例）：登录名即 person id 命名空间。 */
function actorOf(ctx: Context): string {
  return ctx.state?.user?.username ?? 'anonymous'
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')

/** 合同可由客户端提供的字段白名单：服务端管理面（schemaVersion/version/status/
 *  createdAt/updatedAt）与身份冒用面（signedBy/actor/recordedBy）一律不在此列——
 *  白名单外的键直接丢弃，客户端冒传被静默忽略而非污染合同。 */
const CONTRACT_INPUT_FIELDS = [
  'rootTaskId',
  'title',
  'valueStatement',
  'ownerPersonId',
  'processRef',
  'measures',
  'acceptance',
  'scope',
  'riskTier',
  'defaultReversibility',
  'verificationOwnerId',
  'contextPolicy',
  'learningOptIn',
] as const

function pickFields(body: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of fields) if (k in body) out[k] = body[k]
  return out
}

/** owner/verifier 判权（含 active 校验）：mode=owner 仅结果责任人；
 *  owner-or-verifier 验证责任人亦可（observing 迁移/测量/快照，spec §4.6）。 */
function authz(contract: OutcomeContract, actor: string, mode: 'owner' | 'owner-or-verifier'): boolean {
  if (!activePersonIds().has(actor)) return false
  if (actor === contract.ownerPersonId) return true
  return mode === 'owner-or-verifier' && actor === contract.verificationOwnerId
}

/** owner/verifier 入册校验（创建/修订换人时）：给定的 personId 须在名单中 active。 */
function activeProblemsFor(ids: string[]): string[] {
  const active = activePersonIds()
  return ids.filter((id) => !active.has(id)).map(
    (id) => `${id} 未在人员名单中激活（owner/verifier 必须为 active 自然人，spec §4.6）`,
  )
}

// ---------- 读面 authz（批二 T1）：owner/verifier 全量、其他登录用户 metadata ----------

/** 读面档位：full=全量；metadata=200 但脱去敏感内容（脱敏清单见各投影函数）。 */
type OutcomeReadScope = 'full' | 'metadata'

/** 读面判权：与写面同源（authz 'owner-or-verifier'＝合同字段→people active 校验）。
 *  owner/verifier 得 'full'；其他登录用户（含未登录降级 anonymous）得 'metadata'。 */
const readScopeOf = (contract: OutcomeContract, actor: string): OutcomeReadScope =>
  authz(contract, actor, 'owner-or-verifier') ? 'full' : 'metadata'

/** metadata 态合同脱敏（批二 T1 敏感度最小集）：measures[].definition（度量口径
 *  文本）整体脱去；度量骨架（measureId/name/unit/operator/baseline/target/sourceRef）
 *  与合同其余字段保留——元数据消费面（身份/状态/骨架）不受影响。 */
function contractMetadata(c: OutcomeContract): Record<string, unknown> {
  const { measures, ...rest } = c
  return {
    ...rest,
    measures: measures.map((m) => {
      const { definition: _d, ...skeleton } = m
      return skeleton
    }),
  }
}

/** metadata 态测量行脱敏：evidenceRefs（证据引用可内嵌 token——sanitizeForSnapshot
 *  同款泄漏形态）脱去；测量事实骨架（measureId/actual/availability/时间戳）保留。 */
function measurementMetadata(m: OutcomeMeasurement): Record<string, unknown> {
  const { evidenceRefs: _e, ...rest } = m
  return rest
}

/** metadata 态结算脱敏：rationale/gapNote（自然人裁决理由与缺口说明文本）脱去；
 *  verdict/settlementId/签署身份与时间等骨架保留。最新结算与 superseded 链同权。 */
function settlementMetadata(s: Record<string, unknown>): Record<string, unknown> {
  const { rationale: _r, gapNote: _g, ...rest } = s
  return rest
}

/** 合同落盘（先账后物的「物」半边）：路径规则与 store 私有 contractFileOf 一致。 */
function persistContract(next: OutcomeContract): boolean {
  try {
    atomicWriteJson(join(outcomeStoreRoot(), next.outcomeId, 'contract.json'), next)
    return true
  } catch (err) {
    console.warn(`[outcome-controller] 合同落盘失败（${next.outcomeId}）：${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

/** 身份册快照行已收敛至 kanban-resolution.snapshotPeopleRows（Task 10：控制器与
 *  派发门同一身份投影单一事实源）。 */

// ---------- reopen 可调用面（不挂路由；简报无 reopen 端点，Task 10 外部触发） ----------

export interface ReopenOutcomeResult {
  ok: boolean
  code?: string
  problems?: string[]
  contract?: OutcomeContract
}

/** 根任务重开回退（spec §3.2）：settled/observing → active、旧结算标 superseded。
 *  applyReopen 消费按不可变（返回新对象）；supersededSettlementId 空串不写
 *  settlement_superseded 事件（observing 期重开且从未结算）。version 不递增
 *  （重开不是合同语义变更，spec §4.1）。 */
export function reopenOutcome(outcomeId: string, actor: string): ReopenOutcomeResult {
  const contract = getContract(outcomeId)
  if (!contract) return { ok: false, code: 'not_found', problems: ['合同不存在'] }
  const lastSettlement = listEvents(outcomeId, 'settlement_signed')
  const latestSettlementId =
    (lastSettlement[lastSettlement.length - 1]?.payload as { settlementId?: unknown } | undefined)
      ?.settlementId
  const reopened = applyReopen(
    contract,
    typeof latestSettlementId === 'string' ? latestSettlementId : '',
  )
  if (!reopened) {
    return {
      ok: false,
      code: 'illegal_transition',
      problems: [`仅 settled/observing 合同可重开（当前 ${contract.status}）`],
    }
  }
  if (reopened.supersededSettlementId) {
    const ev = appendEvent(
      outcomeId,
      'settlement_superseded',
      { settlementId: reopened.supersededSettlementId, reason: 'root_task_reopened' },
      actor,
      contract.version,
    )
    if (!ev.ok) return { ok: false, code: 'write_failed', problems: ['结算取代事件写入失败'] }
  }
  const ev = appendEvent(
    outcomeId,
    'status_changed',
    { from: contract.status, to: 'active', reason: 'root_task_reopened' },
    actor,
    contract.version,
  )
  if (!ev.ok) return { ok: false, code: 'write_failed', problems: ['状态迁移事件写入失败'] }
  const next: OutcomeContract = { ...reopened.contract, updatedAt: Date.now() }
  if (!persistContract(next)) return { ok: false, code: 'write_failed', problems: ['合同落盘失败'] }
  return { ok: true, contract: next }
}

// ---------- 路由工厂 ----------

export function createOutcomeRoutes(opts: OutcomeControllerOptions = {}): Router {
  const router = new Router({ prefix: '/api/hermes/outcomes' })

  // 功能门（每请求动态读 env，测试与运行时切换即时生效）
  router.use(async (ctx, next) => {
    if (process.env.OUTCOME_WORKBENCH !== '1') {
      fail(ctx, 404, '结果工作台未启用（需 OUTCOME_WORKBENCH=1）', { code: 'outcome_workbench_disabled' })
      return
    }
    await next()
  })

  // GET /：列表（query status/rootTaskId/owner 过滤）。读面 authz（批二 T1 补）：行级
  // readScope——owner/verifier 行全量；他人行 metadata（contractMetadata 与 GET /:id
  // 同源，脱 measures[].definition）。列表可混合归属（一屏多合同），故 readScope 落
  // 在行上而非响应级；过滤语义（status/rootTaskId/owner）不变——脱敏不改可见行集。
  router.get('/', async (ctx) => {
    const actor = actorOf(ctx)
    const status = ctx.query.status
    if (status !== undefined && !(OUTCOME_STATUSES as readonly string[]).includes(String(status))) {
      fail(ctx, 422, `status 过滤值非法（须为 ${OUTCOME_STATUSES.join('|')} 之一）`, {
        code: 'invalid_input',
        problems: [`status 过滤值非法：${String(status)}`],
      })
      return
    }
    const rootTaskId = ctx.query.rootTaskId !== undefined ? String(ctx.query.rootTaskId) : null
    const owner = ctx.query.owner !== undefined ? String(ctx.query.owner) : null
    const items: Array<Record<string, unknown>> = []
    try {
      const ids = readdirSync(outcomeStoreRoot(), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
      for (const id of ids) {
        const c = getContract(id) // 非法目录名/坏档由 getContract 自行过滤（null）
        if (!c) continue
        if (status !== undefined && c.status !== String(status)) continue
        if (rootTaskId !== null && c.rootTaskId !== rootTaskId) continue
        if (owner !== null && c.ownerPersonId !== owner) continue
        const scope = readScopeOf(c, actor)
        items.push(
          scope === 'full' ? { ...c, readScope: scope } : { ...contractMetadata(c), readScope: scope },
        )
      }
    } catch {
      /* 存储根不存在=空列表（fail-soft 读侧） */
    }
    ok(ctx, { items })
  })

  // POST /：创建（version=1/status=draft/时间戳由服务端定；clientRequestId 幂等）
  router.post('/', async (ctx) => {
    const actor = actorOf(ctx)
    const body = bodyOf(ctx)
    const now = Date.now()
    const input = pickFields(body, CONTRACT_INPUT_FIELDS)
    // I2 裁决：幂等键作用域收敛到 actor——组合键落账与查定，异 actor 同键不命中
    const rawClientRequestId = nonEmpty(body.clientRequestId) ? body.clientRequestId.trim() : undefined
    const clientRequestId = rawClientRequestId ? `${actor}:${rawClientRequestId}` : undefined
    const outcomeId = nonEmpty(body.outcomeId) ? body.outcomeId.trim() : `oc-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const contract: Record<string, unknown> = {
      ...input,
      schemaVersion: 1,
      outcomeId,
      version: 1,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    }
    const activeProblems = activeProblemsFor(
      [input.ownerPersonId, input.verificationOwnerId].filter(nonEmpty),
    )
    if (activeProblems.length) {
      fail(ctx, 422, 'owner/verifier 未在人员名单激活', { code: 'invalid_input', problems: activeProblems })
      return
    }
    // 归属证明（spec §4.6）：null=不可证明默认拒（env 显式放行试点）；ok:false=明确不归属永不放行
    const ownership = opts.verifyRootTask ? opts.verifyRootTask(String(input.rootTaskId ?? '')) : null
    if (ownership?.ok === true) {
      /* 已证明归属，放行 */
    } else if (ownership?.ok === false) {
      fail(ctx, 422, `根任务（${String(input.rootTaskId)}）归属证明失败：不属于当前部署`, {
        code: 'ownership_unavailable',
      })
      return
    } else if (process.env.OUTCOME_ALLOW_UNVERIFIED_ROOT !== '1') {
      fail(ctx, 422, `根任务（${String(input.rootTaskId)}）归属不可证明`, {
        code: 'ownership_unavailable',
        problems: ['根任务归属不可证明（批一未接任务系统）；试点可设 OUTCOME_ALLOW_UNVERIFIED_ROOT=1 显式放行'],
      })
      return
    }
    const result = createContract({ ...contract, ...(clientRequestId ? { clientRequestId } : {}) } as never, actor)
    if (!result.ok || !result.contract) {
      const status = result.code === 'root_task_taken' || result.code === 'outcome_exists' ? 409
        : result.code === 'write_failed' ? 500 : 422
      fail(ctx, status, `创建失败（${result.code ?? 'invalid_input'}）`, {
        code: result.code,
        problems: result.problems,
      })
      return
    }
    if (result.replayed) {
      ok(ctx, { contract: result.contract, replayed: true })
      return
    }
    created(ctx, { contract: result.contract }, `/api/hermes/outcomes/${result.contract.outcomeId}`)
  })

  // GET /:id：详情（读面 authz：owner/verifier 全量；他人 metadata 脱 measures[].definition）
  router.get('/:id', async (ctx) => {
    const contract = getContract(String(ctx.params.id ?? ''))
    if (!contract) {
      fail(ctx, 404, '合同不存在', { code: 'not_found' })
      return
    }
    const scope = readScopeOf(contract, actorOf(ctx))
    ok(ctx, { contract: scope === 'full' ? contract : contractMetadata(contract), readScope: scope })
  })

  // PUT /:id：修订（owner only；白名单挑 patch，expectedVersion 乐观并发）
  router.put('/:id', async (ctx) => {
    const actor = actorOf(ctx)
    const id = String(ctx.params.id ?? '')
    const contract = getContract(id)
    if (!contract) {
      fail(ctx, 404, '合同不存在', { code: 'not_found' })
      return
    }
    if (!authz(contract, actor, 'owner')) {
      fail(ctx, 403, '仅结果责任人（ownerPersonId）可修订合同', { code: 'forbidden' })
      return
    }
    const body = bodyOf(ctx)
    const expectedVersion = body.expectedVersion
    if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      fail(ctx, 422, 'expectedVersion 须为正整数', { code: 'invalid_input', problems: ['expectedVersion 须为正整数'] })
      return
    }
    const patch = pickFields(body, CONTRACT_INPUT_FIELDS)
    const activeProblems = activeProblemsFor(
      [patch.ownerPersonId, patch.verificationOwnerId].filter(nonEmpty),
    )
    if (activeProblems.length) {
      fail(ctx, 422, 'owner/verifier 未在人员名单激活', { code: 'invalid_input', problems: activeProblems })
      return
    }
    const result = updateContract(id, patch as never, expectedVersion, actor)
    if (!result.ok || !result.contract) {
      const status = result.code === 'version_conflict' ? 409 : result.code === 'write_failed' ? 500 : 422
      fail(ctx, status, `修订失败（${result.code ?? 'invalid_input'}）`, {
        code: result.code,
        problems: result.problems,
      })
      return
    }
    ok(ctx, { contract: result.contract })
  })

  // POST /:id/transitions：状态迁移（eventId 幂等；observing=owner 或 verifier，其余=owner）
  router.post('/:id/transitions', async (ctx) => {
    const actor = actorOf(ctx)
    const id = String(ctx.params.id ?? '')
    const contract = getContract(id)
    if (!contract) {
      fail(ctx, 404, '合同不存在', { code: 'not_found' })
      return
    }
    const body = bodyOf(ctx)
    const to = body.to as unknown
    if (!(OUTCOME_STATUSES as readonly string[]).includes(to as string)) {
      fail(ctx, 422, `to 须为 ${OUTCOME_STATUSES.join('|')} 之一`, {
        code: 'illegal_transition',
        problems: [`to 须为 ${OUTCOME_STATUSES.join('|')} 之一`],
      })
      return
    }
    if (!authz(contract, actor, to === 'observing' ? 'owner-or-verifier' : 'owner')) {
      fail(ctx, 403, to === 'observing' ? '仅 owner 或验证责任人可发起 observing 迁移' : '仅结果责任人（ownerPersonId）可执行该迁移', { code: 'forbidden' })
      return
    }
    // eventId 幂等：命中 status_changed 账上同 eventId 即返回原事件（重放不重复落账）；
    // 撕裂自愈（I1 裁决）：事件在账而合同停在事件 from 态 → 补写合同完成自愈；
    // 合同已演进到其他状态（如后续再迁移/重开）→ 如实返回原事件不回滚。
    const eventId = nonEmpty(body.eventId) ? body.eventId.trim() : undefined
    if (eventId) {
      const hit = listEvents(id, 'status_changed').find(
        (e) => (e.payload as { eventId?: unknown }).eventId === eventId,
      )
      if (hit) {
        const p = hit.payload as { from?: string; to?: string }
        if (contract.status === p.from && p.to) {
          const healed: OutcomeContract = { ...contract, status: p.to as OutcomeStatus, updatedAt: Date.now() }
          if (!persistContract(healed)) {
            fail(ctx, 500, '合同落盘失败（重放同 eventId 自愈）', { code: 'write_failed' })
            return
          }
          ok(ctx, { replayed: true, healed: true, event: hit, contract: healed })
          return
        }
        ok(ctx, { replayed: true, event: hit })
        return
      }
    }
    const guards = transitionGuards(contract, to as OutcomeStatus, {
      allTasksTerminal: opts.tasksTerminalOf ? opts.tasksTerminalOf(id) : false, // 缺省 fail-closed
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    })
    if (!guards.ok) {
      fail(ctx, 422, '状态迁移被拒', { code: guards.code, problems: guards.problems })
      return
    }
    // 激活即绑定（审查修复轮二 I2 裁决）：仅 draft→active；置于 status_changed 事件
    // 落账之前——事件在前时 eventId 重放撕裂自愈会绕过绑定补完迁移（排序纪律见
    // kanban-resolution.ts bindOutcomeFamily 注释）。绑定失败=迁移整体失败 422，
    // 合同留 draft；预检零写入，失败不留半绑态。
    if (contract.status === 'draft' && to === 'active') {
      const bind = bindOutcomeFamily(id, contract.rootTaskId)
      if (!bind.ok) {
        fail(ctx, 422, '激活即绑定失败（迁移中止，合同留 draft）', {
          code: bind.code ?? 'write_failed',
          problems: bind.problems,
        })
        return
      }
    }
    const payload: Record<string, unknown> = { from: contract.status, to }
    if (typeof body.reason === 'string' && body.reason.trim()) payload.reason = body.reason.trim()
    if (eventId) payload.eventId = eventId
    const ev = appendEvent(id, 'status_changed', payload, actor, contract.version)
    if (!ev.ok) {
      fail(ctx, 500, '状态迁移事件写入失败', { code: 'write_failed' })
      return
    }
    const next: OutcomeContract = { ...contract, status: to as OutcomeStatus, updatedAt: Date.now() }
    if (!persistContract(next)) {
      fail(ctx, 500, '合同落盘失败（事件已入账，读侧以合同为准，可重试自愈）', { code: 'write_failed' })
      return
    }
    created(ctx, { contract: next })
  })

  // POST /:id/measurements：测量提交（owner 或 verifier；contractVersion 须=当前版本）
  router.post('/:id/measurements', async (ctx) => {
    const actor = actorOf(ctx)
    const id = String(ctx.params.id ?? '')
    const contract = getContract(id)
    if (!contract) {
      fail(ctx, 404, '合同不存在', { code: 'not_found' })
      return
    }
    if (!authz(contract, actor, 'owner-or-verifier')) {
      fail(ctx, 403, '仅 owner 或验证责任人可提交测量', { code: 'forbidden' })
      return
    }
    const body = bodyOf(ctx)
    // 控制器级把关：evidenceRefs 必填非空（spec §4.6 无论来源必须附证据引用）
    if (!Array.isArray(body.evidenceRefs) || body.evidenceRefs.length === 0 || !isStrArray(body.evidenceRefs)) {
      fail(ctx, 422, 'evidenceRefs 必填（至少一条非空证据引用）', {
        code: 'invalid_input',
        problems: ['evidenceRefs 必填：须为非空字符串数组（spec §4.6 无论来源如何都必须附 evidenceRefs）'],
      })
      return
    }
    if (typeof body.contractVersion !== 'number' || body.contractVersion !== contract.version) {
      fail(ctx, 409, `contractVersion 与当前合同版本不符（当前 v${contract.version}）`, {
        code: 'stale_contract',
      })
      return
    }
    const now = Date.now()
    const measurement: OutcomeMeasurement = {
      measurementId: String(body.measurementId ?? ''),
      outcomeId: id,
      measureId: String(body.measureId ?? ''),
      contractVersion: body.contractVersion,
      actual: (body.actual === null ? null : body.actual) as number | null, // 非数值由 appendMeasurement 校验拒收（422）
      availability: (body.availability ?? 'available') as OutcomeMeasurement['availability'],
      evidenceRefs: body.evidenceRefs,
      observedAt: typeof body.observedAt === 'number' ? body.observedAt : now,
      recordedBy: actor, // 服务端身份，客户端传值忽略
      recordedAt: now,
    }
    const result = appendMeasurement(measurement, actor)
    if (!result.ok) {
      const status = result.code === 'not_found' ? 404 : result.code === 'write_failed' ? 500 : 422
      fail(ctx, status, `测量提交失败（${result.code ?? 'invalid_input'}）`, {
        code: result.code,
        problems: result.problems,
      })
      return
    }
    if (result.added) created(ctx, { measurement: result.measurement })
    else ok(ctx, { measurement: result.measurement, added: false })
  })

  // GET /:id/measurements：测量读面（T13/T14 双报缺口补齐）。?measureId= 可选过滤。
  // - measurements：全量列表「当前版本优先」——contractVersion=当前版的前排、组内按
  //   落账序；旧版本（定义修订前口径）后排只作历史（spec §4.1）。
  // - latest：每 measureId 最新一条摘要，绑定口径与结算机器建议同一选取器
  //   （latestCurrentMeasurement：仅当前版本、observedAt 最大、后写覆盖）——无当前
  //   版本记录的 measure 不出现在 latest（fail-soft 不拿旧口径充新值）。
  // 读面 authz（批二 T1）：owner/verifier 全量；他人 metadata 脱测量行 evidenceRefs。
  router.get('/:id/measurements', async (ctx) => {
    const id = String(ctx.params.id ?? '')
    const contract = getContract(id)
    if (!contract) {
      fail(ctx, 404, '合同不存在', { code: 'not_found' })
      return
    }
    const measureId = ctx.query.measureId !== undefined ? String(ctx.query.measureId) : undefined
    const all = listMeasurements(id, measureId)
    const currentFirst = [
      ...all.filter((m) => m.contractVersion === contract.version),
      ...all.filter((m) => m.contractVersion !== contract.version),
    ]
    const latest: Record<string, OutcomeMeasurement> = {}
    for (const m of all) {
      if (m.measureId in latest) continue
      const pick = latestCurrentMeasurement(contract, all, m.measureId)
      if (pick) latest[m.measureId] = pick
    }
    const scope = readScopeOf(contract, actorOf(ctx))
    ok(ctx, {
      outcomeId: id,
      contractVersion: contract.version,
      measurements: scope === 'full' ? currentFirst : currentFirst.map(measurementMetadata),
      latest:
        scope === 'full'
          ? latest
          : Object.fromEntries(
              Object.entries(latest).map(([k, v]) => [k, measurementMetadata(v)]),
            ),
      readScope: scope,
    })
  })

  // POST /:id/settlement：结算签署（owner only；observing 起步；机器建议不代决）
  router.post('/:id/settlement', async (ctx) => {
    const actor = actorOf(ctx)
    const id = String(ctx.params.id ?? '')
    const contract = getContract(id)
    if (!contract) {
      fail(ctx, 404, '合同不存在', { code: 'not_found' })
      return
    }
    const body = bodyOf(ctx)
    // C1 裁决：鉴权先于幂等扫描——重放读取结算正身同样受 owner-only 约束，
    // 任何登录用户拿可猜 settlementId 不得读他人结算。
    if (!authz(contract, actor, 'owner')) {
      fail(ctx, 403, '仅结果责任人（ownerPersonId）可签署业务裁决，验证责任人不得代签（spec §4.6）', { code: 'forbidden' })
      return
    }
    // settlementId 幂等：命中账上同 id 即返回原结算（重放不重复落账、不重复迁移）；
    // 撕裂自愈（I1 裁决）：结算事件在账而合同仍 observing（status_changed/contract.json
    // 未落）→ 补迁移事件＋补写合同完成自愈；合同已到 settled=一致；其他状态（重开回
    // active 等）=已演进，如实返回原结算不回滚。
    const settlementId = nonEmpty(body.settlementId) ? body.settlementId.trim() : undefined
    if (settlementId) {
      const hit = listEvents(id, 'settlement_signed').find(
        (e) => (e.payload as { settlementId?: unknown }).settlementId === settlementId,
      )
      if (hit) {
        const original = (hit.payload as { settlement?: unknown }).settlement
        if (contract.status === 'observing') {
          const moved = listEvents(id, 'status_changed').some(
            (e) =>
              (e.payload as { to?: unknown; settlementId?: unknown }).to === 'settled' &&
              (e.payload as { settlementId?: unknown }).settlementId === settlementId,
          )
          if (!moved) {
            const heal = appendEvent(
              id,
              'status_changed',
              { from: 'observing', to: 'settled', settlementId },
              actor,
              contract.version,
            )
            if (!heal.ok) {
              fail(ctx, 500, '自愈迁移事件写入失败（重放同 settlementId 自愈）', { code: 'write_failed' })
              return
            }
          }
          const healed: OutcomeContract = { ...contract, status: 'settled', updatedAt: Date.now() }
          if (!persistContract(healed)) {
            fail(ctx, 500, '合同落盘失败（重放同 settlementId 自愈）', { code: 'write_failed' })
            return
          }
          ok(ctx, { replayed: true, healed: true, settlement: original, contract: healed })
          return
        }
        ok(ctx, { replayed: true, settlement: original })
        return
      }
    }
    if (contract.status !== 'observing') {
      fail(ctx, 422, `仅 observing 合同可结算（当前 ${contract.status}）`, {
        code: 'illegal_transition',
        problems: [`仅 observing 合同可结算（当前 ${contract.status}）；settled/cancelled 为终态，draft/active 须先走 observing`],
      })
      return
    }
    if (typeof body.contractVersion === 'number' && body.contractVersion !== contract.version) {
      fail(ctx, 409, `结算绑定版本不符（请求 v${body.contractVersion}，当前 v${contract.version}）`, {
        code: 'version_conflict',
      })
      return
    }
    const measurements = listMeasurements(id)
    // 结算前打印机器建议供签署人参考（不代决）；建议同时随响应返回
    const suggestion = suggestVerdict(contract, measurements)
    console.log(
      `[outcome] 结算建议（${id}）：verdict=${suggestion.verdict} perMeasure=${JSON.stringify(suggestion.perMeasure)} missing=${JSON.stringify(suggestion.missingMeasureIds)}——机器建议仅供参考，不代签署人裁决`,
    )
    const validation = validateSettlementInput(body, contract, measurements)
    if (validation.problems.length) {
      fail(ctx, 422, '结算入参非法', { code: 'invalid_input', problems: validation.problems })
      return
    }
    // 任务移交裁决：nextReviewAt 必须晚于签署时刻（复审排在未来才有意义）
    if (body.verdict === 'unknown' && typeof body.nextReviewAt === 'number' && body.nextReviewAt <= Date.now()) {
      fail(ctx, 422, 'nextReviewAt 必须晚于签署时刻', {
        code: 'invalid_input',
        problems: ['verdict=unknown 的 nextReviewAt 必须晚于签署时刻（不得排在过去）'],
      })
      return
    }
    const settlement = {
      settlementId: settlementId ?? `set-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      outcomeId: id,
      contractVersion: contract.version,
      verdict: String(body.verdict),
      rationale: typeof body.rationale === 'string' ? body.rationale.trim() : '',
      measurementIds: body.measurementIds as string[],
      ...(nonEmpty(body.gapNote) ? { gapNote: body.gapNote } : {}),
      ...(typeof body.nextReviewAt === 'number' ? { nextReviewAt: body.nextReviewAt } : {}),
      signedBy: actor, // 服务端身份，客户端传值忽略
      signedAt: Date.now(),
    }
    const signed = appendEvent(
      id,
      'settlement_signed',
      { settlementId: settlement.settlementId, verdict: settlement.verdict, settlement },
      actor,
      contract.version,
    )
    if (!signed.ok) {
      fail(ctx, 500, '结算事件写入失败', { code: 'write_failed' })
      return
    }
    const moved = appendEvent(
      id,
      'status_changed',
      { from: contract.status, to: 'settled', settlementId: settlement.settlementId },
      actor,
      contract.version,
    )
    if (!moved.ok) {
      fail(ctx, 500, '结算后状态迁移事件写入失败（结算已入账，重试自愈）', { code: 'write_failed' })
      return
    }
    const next: OutcomeContract = { ...contract, status: 'settled', updatedAt: Date.now() }
    if (!persistContract(next)) {
      fail(ctx, 500, '合同落盘失败（结算已入账，读侧以合同为准，可重试自愈）', { code: 'write_failed' })
      return
    }
    // 批二 T6：结算触发学习候选（双闸 learningOptIn×EXPERIENCE_INJECT；幂等按
    // settlementId）——fail-soft：存储异常 warn 不改结算结果（学习是派生面）。
    let learning: { generated: boolean; reason: string; candidateId?: string } | null = null
    try {
      const { generateLearningCandidate } = await import('./learning')
      learning = generateLearningCandidate(next, {
        settlementId: settlement.settlementId,
        verdict: settlement.verdict,
        rationale: settlement.rationale,
        signedAt: settlement.signedAt,
      })
    } catch (err) {
      learning = { generated: false, reason: `学习候选生成异常（不阻断结算）：${(err as Error).message}` }
    }
    created(ctx, { settlement, suggestion, learning })
  })

  // GET /:id/settlement：结算读面（T13/T14 双报缺口补齐）。
  // - settlement：最新有效结算=账上未被取代（无 settlement_superseded 命中）的
  //   settlement_signed 中最后一条；全被取代（settled 后重开、未再结算）→ null，
  //   历史进 superseded 链，不拿已废结算充当前（fail-soft 不造假）。
  // - superseded：历史取代链，按取代事件落账序；每条含 settlement 正身（账上可
  //   查得时；孤儿 id 只带 settlementId+reason）、取代理由与时间。
  // 读面 authz（批二 T1）：owner/verifier 全量；他人 metadata 脱最新结算与取代链
  // settlement 的 rationale/gapNote（自然人裁决文本），verdict 等骨架保留。
  // GET /:id/comparison（批二 T6）：同口径对照投影——evaluation=本合同（须已
  // settled），baseline=listAllContracts 中最近一个同口径已结算结果；effect 恒三态，
  // 不足两个同口径已结算结果恒 unknown＋缺口说明（「已注入」永不等于「有效」）。
  // 纯读面不写账；owner/verifier 全量、他人 metadata（对照行含实际读数，同测量面纪律）。
  router.get('/:id/comparison', async (ctx) => {
    const id = String(ctx.params.id ?? '')
    const contract = getContract(id)
    if (!contract) {
      fail(ctx, 404, '合同不存在', { code: 'not_found' })
      return
    }
    if (contract.status !== 'settled') {
      fail(ctx, 422, `对照仅适用于已结算合同（当前 ${contract.status}）`, { code: 'not_settled' })
      return
    }
    const { buildOutcomeComparison } = await import('./comparison')
    const { listEvents } = await import('./outcome-store')
    // 装配已结算方：合同＋当前版本测量＋最新有效结算（读侧与 settlement 面同法）
    const latestSettlementOf = (oid: string): { settlementId: string; verdict: string; signedAt: number } | null => {
      const signed = listEvents(oid, 'settlement_signed')
      const superseded = new Set(
        listEvents(oid, 'settlement_superseded')
          .map((e) => (e.payload as { settlementId?: unknown }).settlementId)
          .filter((v): v is string => typeof v === 'string'),
      )
      let latest: { settlementId: string; verdict: string; signedAt: number } | null = null
      for (const e of signed) {
        const sp = (e.payload as { settlement?: { settlementId?: unknown; verdict?: unknown; signedAt?: unknown } }).settlement
        const sid = sp?.settlementId
        if (typeof sid === 'string' && sid && !superseded.has(sid)) {
          latest = {
            settlementId: sid,
            verdict: typeof sp?.verdict === 'string' ? sp.verdict : 'unknown',
            signedAt: typeof sp?.signedAt === 'number' ? sp.signedAt : e.at,
          }
        }
      }
      return latest
    }
    const evaluation = { contract, measurements: listMeasurements(id), settlement: latestSettlementOf(id)! }
    const others = listAllContracts()
      .filter((c) => c.outcomeId !== id && c.status === 'settled')
      .map((c) => ({ contract: c, measurements: listMeasurements(c.outcomeId), settlement: latestSettlementOf(c.outcomeId)! }))
      .filter((o) => o.settlement !== null)
    const scope = readScopeOf(contract, actorOf(ctx))
    const comparison = buildOutcomeComparison(evaluation, others)
    if (scope === 'metadata') {
      // 他人：脱对照行实际读数（actual），骨架（effect/口径/目标）保留
      ok(ctx, {
        readScope: 'metadata',
        comparison: {
          ...comparison,
          rows: comparison.rows.map((r) => ({
            ...r,
            baseline: r.baseline ? { ...r.baseline, actual: null, availability: 'unavailable' } : null,
            evaluation: r.evaluation ? { ...r.evaluation, actual: null, availability: 'unavailable' } : null,
          })),
        },
      })
      return
    }
    ok(ctx, { readScope: 'full', comparison })
  })

  router.get('/:id/settlement', async (ctx) => {
    const id = String(ctx.params.id ?? '')
    const contract = getContract(id)
    if (!contract) {
      fail(ctx, 404, '合同不存在', { code: 'not_found' })
      return
    }
    const signed = listEvents(id, 'settlement_signed')
    const supersededEvents = listEvents(id, 'settlement_superseded')
    const supersededIds = new Set(
      supersededEvents
        .map((e) => (e.payload as { settlementId?: unknown }).settlementId)
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0),
    )
    const settlements = signed
      .map((e) => (e.payload as { settlement?: unknown }).settlement)
      .filter((s): s is NonNullable<unknown> => !!s && typeof s === 'object')
      .filter((s) => nonEmpty((s as { settlementId?: unknown }).settlementId))
    let latest: Record<string, unknown> | null = null
    for (const s of settlements) {
      if (!supersededIds.has((s as { settlementId: string }).settlementId)) latest = s as Record<string, unknown>
    }
    const scope = readScopeOf(contract, actorOf(ctx))
    const chain = supersededEvents.map((e) => {
      const p = e.payload as { settlementId?: unknown; reason?: unknown }
      const settlementId = typeof p.settlementId === 'string' ? p.settlementId : ''
      const found =
        (settlements.find(
          (s) => (s as { settlementId: string }).settlementId === settlementId,
        ) as Record<string, unknown> | undefined) ?? null
      return {
        settlementId,
        reason: typeof p.reason === 'string' ? p.reason : '',
        supersededAt: e.at,
        settlement:
          scope === 'full' ? found : found ? settlementMetadata(found) : null,
      }
    })
    ok(ctx, {
      outcomeId: id,
      settlement: scope === 'full' ? latest : latest ? settlementMetadata(latest) : null,
      superseded: chain,
      readScope: scope,
    })
  })

  // POST /:id/context-snapshots：生成最小上下文快照（批一 taskSummary 由注入面提供）
  router.post('/:id/context-snapshots', async (ctx) => {
    const actor = actorOf(ctx)
    const id = String(ctx.params.id ?? '')
    const contract = getContract(id)
    if (!contract) {
      fail(ctx, 404, '合同不存在', { code: 'not_found' })
      return
    }
    if (!authz(contract, actor, 'owner-or-verifier')) {
      fail(ctx, 403, '仅 owner 或验证责任人可生成派单快照', { code: 'forbidden' })
      return
    }
    const taskSummary = opts.taskSummaryOf ? opts.taskSummaryOf(contract.rootTaskId) : null
    if (!taskSummary) {
      fail(ctx, 422, `根任务（${contract.rootTaskId}）摘要不可用，禁止派单`, {
        code: 'invalid_input',
        problems: [`任务关键源失败：根任务 ${contract.rootTaskId} 摘要不可用（批一任务系统未接入，Task 10 接真实现）`],
      })
      return
    }
    const built = buildMinimalSnapshot({
      contract,
      decisionPolicyVersion: opts.decisionPolicyVersion ?? DEFAULT_DECISION_POLICY_VERSION,
      resolve: {
        task: () => ({ ok: true, task: taskSummary }),
        people: (ids: string[]) => ({ ok: true, people: snapshotPeopleRows(ids) }),
      },
    })
    if (!built.ok) {
      fail(ctx, 422, '快照构建失败（关键源/临界）', { code: 'invalid_input', problems: built.problems })
      return
    }
    const result = appendSnapshot(built.snapshot, actor)
    if (!result.ok) {
      const status = result.code === 'not_found' ? 404 : result.code === 'write_failed' ? 500 : 422
      fail(ctx, status, `快照落账失败（${result.code ?? 'invalid_input'}）`, {
        code: result.code,
        problems: result.problems,
      })
      return
    }
    if (result.added) created(ctx, { snapshot: result.snapshot })
    else ok(ctx, { snapshot: result.snapshot, added: false })
  })

  // GET /:id/context：快照列表（摘要行，fail-soft 空列表）/?snapshotId= 取全量。
  // 读面 authz（批二 T1）：owner/verifier 全量；他人 metadata——单快照 content 整体
  // 脱去（快照物化文本与 C1 保护面对齐），信封元数据（snapshotId/sha256/sourceRefs）保留；
  // 列表摘要行本就无 content，仅附 readScope。
  router.get('/:id/context', async (ctx) => {
    const id = String(ctx.params.id ?? '')
    const contract = getContract(id)
    if (!contract) {
      fail(ctx, 404, '合同不存在', { code: 'not_found' })
      return
    }
    const snapshots = listSnapshots(id) // 坏行已在读侧跳过（fail-soft）
    const scope = readScopeOf(contract, actorOf(ctx))
    const snapshotId = ctx.query.snapshotId !== undefined ? String(ctx.query.snapshotId) : null
    if (snapshotId !== null) {
      const one = snapshots.find((s) => s.snapshotId === snapshotId)
      if (!one) {
        fail(ctx, 404, '快照不存在', { code: 'snapshot_not_found' })
        return
      }
      if (scope === 'full') {
        ok(ctx, { snapshot: one, readScope: scope })
        return
      }
      const { content: _c, ...envelope } = one
      ok(ctx, { snapshot: envelope, readScope: scope })
      return
    }
    ok(ctx, {
      snapshots: snapshots.map((s) => ({
        snapshotId: s.snapshotId,
        contractVersion: s.contractVersion,
        createdAt: s.createdAt,
        sha256: s.sha256,
      })),
      readScope: scope,
    })
  })

  return router
}

/** 默认路由实例：宿主挂载补丁（Task 8，patches/804）直接 import（实例名不变，补丁
 *  无需随动）。Task 10 起注入真实现——observing 终态守卫/根任务摘要/归属证明均走
 *  kanban-resolution 看板库只读正身（批一 fail-closed 桩退役）。 */
export const outcomeRoutes: Router = createOutcomeRoutes({
  tasksTerminalOf,
  taskSummaryOf: rootTaskSummary,
  verifyRootTask,
})
