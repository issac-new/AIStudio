// 批一 Task 12：审批收件箱 outcome 绑定与双签门守门（spec 2026-11-19-ai-native-operating-model
// §3.3.2/§4.3）。走真实 decide 路由（approvalsRoutes），覆盖：
//   - pending 聚合标注：条目源记录携带 outcome_ref/dual_sign_required（T11 下发）→
//     展示面带 outcomeId/contractVersion/双签要求；无绑定条目不带（回归不变）；
//   - decide 门：stale contractVersion 409；合同不可读 409（fail-closed 不猜）；
//     dual_sign_required 单签仍 pending（第一签落账）、同人两票不生效、
//     owner+verifier 两笔不同 actor 顺序批准才 resolved（响应文件+历史含 outcome 引用）；
//     映射失败 actor 403 拒签；否决不设双签（收紧方向不加门槛）；
//   - 无 outcome 绑定条目行为回归不变（单签直决）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Koa from 'koa'
import type { OutcomeStatus } from '../../outcome/types'

let dir = ''
let queueDir = ''
let base = ''
let server: ReturnType<typeof createServer> | null = null
let currentActor = 'owner@example.com'

const ENV_KEYS = [
  'HERMES_AUTONOMY_GOV_DIR', 'HERMES_ENFORCE_APPROVALS_DIR', 'HERMES_APPROVALS_LOG_FILE',
  'HERMES_REVIEW_DIR', 'HERMES_APPROVALS_QUEUE_DIR', 'HUMAN_GATE_STORE', 'AUTONOMY_DUAL_SIGN',
  'AGENT_IDENTITY_STORE', 'OUTCOME_STORE',
] as const
const before: Record<string, string | undefined> = {}

function jsonBody(ctx: Koa.Context, next: () => Promise<void>): Promise<void> {
  if (ctx.method !== 'POST') return next()
  return (async () => {
    const chunks: Buffer[] = []
    for await (const c of ctx.req) chunks.push(c as Buffer)
    try { (ctx.request as { body?: unknown }).body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { (ctx.request as { body?: unknown }).body = {} }
    await next()
  })()
}

async function start(): Promise<void> {
  const { approvalsRoutes } = await import('../pending-controller')
  const app = new Koa()
  app.use(async (ctx, next) => {
    ;(ctx.state as { user?: { username?: string; role?: string } }).user = { username: currentActor, role: 'super_admin' }
    await next()
  })
  app.use(jsonBody)
  app.use(approvalsRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => (server as ReturnType<typeof createServer>).listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
}

async function decide(id: string, decision: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/approvals/${encodeURIComponent(id)}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  })
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}

async function pendingItems(): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${base}/api/approvals/pending`)
  const body = await res.json() as { items: Array<Record<string, unknown>> }
  return body.items
}

/** 造合同（owner=p-owner / verifier=p-verifier，version/status 由参定；
 *  批二 T2 起支持 cancelled/settled 等终态合同造档）。 */
async function makeContract(outcomeId: string, version: number, status: OutcomeStatus = 'active'): Promise<void> {
  const { createContract } = await import('../../outcome/outcome-store')
  const r = createContract({
    schemaVersion: 1,
    outcomeId,
    rootTaskId: `rt-${outcomeId}`,
    version,
    title: '发布事故率下降',
    valueStatement: '降低发布流程引发的生产事故',
    ownerPersonId: 'p-owner',
    measures: [{
      measureId: 'm-1', name: '发布事故数', definition: '滚动 30 天发布直接引发故障次数',
      unit: '次', operator: 'lte', baseline: null, target: 0, sourceRef: 'incidents://release',
    }],
    acceptance: { statements: [], requiredEvidenceKinds: [] },
    scope: { included: ['发布流程'], excluded: [] },
    riskTier: 'high',
    defaultReversibility: 'one-way',
    verificationOwnerId: 'p-verifier',
    contextPolicy: { allowedScopes: ['project'], excludedSourceKinds: [] },
    learningOptIn: false,
    status,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  }, 'seed')
  expect(r.ok).toBe(true)
}

interface DeferredFixture {
  id: string
  requestId: string
  outcomeId?: string
  contractVersion?: number
  dualSign?: boolean
}

/** 落一条 deferred.json 记录（outcome 绑定字段按需；多条按 id 累积合并）。 */
function writeDeferred(fx: DeferredFixture): void {
  const nowSec = Date.now() / 1000
  const row = {
    id: fx.id,
    session_key: 'kanban:b:t1',
    request_id: fx.requestId,
    tool: 'terminal',
    preview: 'git push origin main',
    risk: 'high',
    created_at: nowSec,
    expires_at: nowSec + 3600,
    status: 'pending',
    ...(fx.outcomeId ? {
      outcome_ref: {
        outcomeId: fx.outcomeId,
        contractVersion: fx.contractVersion ?? 1,
        ownerPersonId: 'p-owner',
        verificationOwnerId: 'p-verifier',
      },
      ...(fx.dualSign ? { dual_sign_required: true } : {}),
    } : {}),
  }
  const file = join(queueDir, 'deferred.json')
  let rows: Array<Record<string, unknown>> = []
  if (existsSync(file)) {
    try { rows = JSON.parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>> } catch { rows = [] }
  }
  rows = [...rows.filter((r) => r.id !== fx.id), row]
  writeFileSync(file, JSON.stringify(rows), 'utf8')
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'outcome-inbox-'))
  for (const k of ENV_KEYS) before[k] = process.env[k]
  queueDir = join(dir, 'queue')
  process.env.HERMES_AUTONOMY_GOV_DIR = join(dir, 'autonomygov')
  process.env.HERMES_ENFORCE_APPROVALS_DIR = join(dir, 'enforce')
  process.env.HERMES_APPROVALS_LOG_FILE = join(dir, 'approvals-log.json')
  process.env.HERMES_REVIEW_DIR = join(dir, 'review')
  process.env.HERMES_APPROVALS_QUEUE_DIR = queueDir
  process.env.HUMAN_GATE_STORE = join(dir, 'hgate.json')
  process.env.AGENT_IDENTITY_STORE = join(dir, 'people-store')
  process.env.OUTCOME_STORE = join(dir, 'outcome-store')
  delete process.env.AUTONOMY_DUAL_SIGN
  mkdirSync(queueDir, { recursive: true })
  mkdirSync(process.env.AGENT_IDENTITY_STORE, { recursive: true })
  mkdirSync(process.env.OUTCOME_STORE, { recursive: true })
  // 名册：owner/verifier 两自然人（emails 供 actor 映射）
  writeFileSync(join(process.env.AGENT_IDENTITY_STORE, 'people.json'), JSON.stringify({
    people: [
      { id: 'p-owner', name: '张三', emails: ['owner@example.com'], active: true, source: 'manual', createdAt: 1 },
      { id: 'p-verifier', name: '李四', emails: ['verifier@example.com'], active: true, source: 'manual', createdAt: 1 },
    ],
    nextSeq: 3,
  }), 'utf8')
  currentActor = 'owner@example.com'
  await start()
})

afterEach(() => {
  server?.close()
  server = null
  for (const k of ENV_KEYS) {
    if (before[k] === undefined) delete process.env[k]
    else process.env[k] = before[k]
  }
  rmSync(dir, { recursive: true, force: true })
})

describe('pending 聚合：outcome 绑定标注', () => {
  it('deferred 条目携带 outcome_ref/dual_sign_required → 待审项标注 outcomeId/contractVersion/双签要求', async () => {
    await makeContract('oc-anno', 1)
    writeDeferred({ id: 'd-anno', requestId: 'rq-anno', outcomeId: 'oc-anno', contractVersion: 1, dualSign: true })
    writeDeferred({ id: 'd-plain', requestId: 'rq-plain' })
    const items = await pendingItems()
    const bound = items.find((i) => i.id === 'deferredfile:d-anno')
    expect(bound).toBeTruthy()
    expect((bound!.outcomeRef as { outcomeId: string }).outcomeId).toBe('oc-anno')
    expect((bound!.outcomeRef as { contractVersion: number }).contractVersion).toBe(1)
    expect(bound!.dualSignRequired).toBe(true)
    // 无绑定条目不带 outcome 面（回归不变）
    const plain = items.find((i) => i.id === 'deferredfile:d-plain')
    expect(plain).toBeTruthy()
    expect(plain!.outcomeRef).toBeUndefined()
    expect(plain!.dualSignRequired).toBeUndefined()
  })

  it('fleetfile 队列条目携带 outcome_ref → 同样标注（gateway 源经 worker 插件入队形态）', async () => {
    writeFileSync(join(queueDir, 'queue.jsonl'), JSON.stringify({
      request_id: 'rq-ff', digest: 'd1', command: 'git push origin main',
      allowed_choices: ['once', 'deny'], timeout_seconds: 300, enqueued_at: Date.now(),
      outcome_ref: { outcomeId: 'oc-ff', contractVersion: 3, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
    }) + '\n', 'utf8')
    const items = await pendingItems()
    const ff = items.find((i) => i.id === 'fleetfile:rq-ff')
    expect(ff).toBeTruthy()
    expect((ff!.outcomeRef as { outcomeId: string }).outcomeId).toBe('oc-ff')
    expect((ff!.outcomeRef as { contractVersion: number }).contractVersion).toBe(3)
    expect(ff!.dualSignRequired).toBeUndefined()
  })
})

describe('decide 门：stale 合同与 fail-closed', () => {
  it('contractVersion 与当前合同不符 → 409 stale_contract，不写响应、仍 pending', async () => {
    await makeContract('oc-stale', 1)
    writeDeferred({ id: 'd-stale', requestId: 'rq-stale', outcomeId: 'oc-stale', contractVersion: 2, dualSign: true })
    const r = await decide('deferredfile:d-stale', 'once')
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('stale_contract')
    expect(existsSync(join(queueDir, 'responses', 'rq-stale.json'))).toBe(false)
    expect((await pendingItems()).some((i) => i.id === 'deferredfile:d-stale')).toBe(true)
  })

  it('合同不可读（不存在/坏档）→ 409 outcome_unavailable（fail-closed 不猜）', async () => {
    writeDeferred({ id: 'd-ghost', requestId: 'rq-ghost', outcomeId: 'oc-ghost', contractVersion: 1 })
    const r = await decide('deferredfile:d-ghost', 'once')
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('outcome_unavailable')
    expect(existsSync(join(queueDir, 'responses', 'rq-ghost.json'))).toBe(false)
  })
})

describe('decide 门：owner/verifier 双签', () => {
  beforeEach(async () => {
    await makeContract('oc-ds', 1)
    writeDeferred({ id: 'd-ds', requestId: 'rq-ds', outcomeId: 'oc-ds', contractVersion: 1, dualSign: true })
  })

  it('单签（owner 第一签）→ 409 仍 pending：签署落账但不写响应文件', async () => {
    const first = await decide('deferredfile:d-ds', 'once')
    expect(first.status).toBe(409)
    expect(first.body.code).toBe('dual-sign-required')
    expect(existsSync(join(queueDir, 'responses', 'rq-ds.json'))).toBe(false)
    expect((await pendingItems()).some((i) => i.id === 'deferredfile:d-ds')).toBe(true)
  })

  it('owner 两票不生效（同人重复签仍 409、仍 pending）', async () => {
    expect((await decide('deferredfile:d-ds', 'once')).status).toBe(409)
    expect((await decide('deferredfile:d-ds', 'once')).status).toBe(409)
    expect(existsSync(join(queueDir, 'responses', 'rq-ds.json'))).toBe(false)
    expect((await pendingItems()).some((i) => i.id === 'deferredfile:d-ds')).toBe(true)
  })

  it('owner+verifier 顺序两笔不同 actor → resolved：响应文件落地、历史含 outcome 引用、不再在列', async () => {
    expect((await decide('deferredfile:d-ds', 'once')).status).toBe(409)
    currentActor = 'verifier@example.com'
    const second = await decide('deferredfile:d-ds', 'once')
    expect(second.status).toBe(200)
    const resp = JSON.parse(readFileSync(join(queueDir, 'responses', 'rq-ds.json'), 'utf8')) as { request_id: string; choice: string }
    expect(resp.request_id).toBe('rq-ds')
    expect(resp.choice).toBe('once')
    // 历史落账携带 outcome 引用（resolved 的授权回执形态）
    const entry = (second.body.entry as { outcomeRef?: { outcomeId: string; contractVersion: number }; decision: string })
    expect(entry.decision).toBe('once')
    expect(entry.outcomeRef).toEqual({ outcomeId: 'oc-ds', contractVersion: 1 })
    expect((await pendingItems()).some((i) => i.id === 'deferredfile:d-ds')).toBe(false)
  })

  it('映射失败 actor（既非 owner 也非 verifier）→ 403 拒签、不落签署账', async () => {
    currentActor = 'stranger'
    const r = await decide('deferredfile:d-ds', 'once')
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('not_outcome_signer')
    expect(existsSync(join(queueDir, 'responses', 'rq-ds.json'))).toBe(false)
    // 拒签未污染签署账：owner 首签仍走第一签路径（409 pending）
    currentActor = 'owner@example.com'
    expect((await decide('deferredfile:d-ds', 'once')).status).toBe(409)
    expect(existsSync(join(queueDir, 'responses', 'rq-ds.json'))).toBe(false)
  })

  it('否决不设双签：owner 单人 deny 即决（收紧方向不加门槛）', async () => {
    const r = await decide('deferredfile:d-ds', 'deny')
    expect(r.status).toBe(200)
    const resp = JSON.parse(readFileSync(join(queueDir, 'responses', 'rq-ds.json'), 'utf8')) as { choice: string }
    expect(resp.choice).toBe('deny')
  })
})

describe('decide 门：绑定但非双签格与无绑定回归', () => {
  it('outcome 绑定但非 dual_sign_required → 单签即决（版本门仍生效）', async () => {
    await makeContract('oc-single', 1)
    writeDeferred({ id: 'd-single', requestId: 'rq-single', outcomeId: 'oc-single', contractVersion: 1, dualSign: false })
    const r = await decide('deferredfile:d-single', 'once')
    expect(r.status).toBe(200)
    const resp = JSON.parse(readFileSync(join(queueDir, 'responses', 'rq-single.json'), 'utf8')) as { choice: string }
    expect(resp.choice).toBe('once')
    expect((r.body.entry as { outcomeRef?: { outcomeId: string } }).outcomeRef?.outcomeId).toBe('oc-single')
  })

  it('无 outcome 绑定条目行为回归不变（任意 actor 单签直决）', async () => {
    writeDeferred({ id: 'd-plain', requestId: 'rq-plain' })
    currentActor = 'whoever'
    const r = await decide('deferredfile:d-plain', 'once')
    expect(r.status).toBe(200)
    expect(existsSync(join(queueDir, 'responses', 'rq-plain.json'))).toBe(true)
  })

  it('fleetfile 绑定条目走同一门：stale 409 / 版本符合且非双签格单签直决', async () => {
    await makeContract('oc-ff2', 1)
    const now = Date.now()
    writeFileSync(join(queueDir, 'queue.jsonl'), [
      JSON.stringify({
        request_id: 'rq-ff-stale', digest: 'd1', command: 'git push', timeout_seconds: 300, enqueued_at: now,
        outcome_ref: { outcomeId: 'oc-ff2', contractVersion: 9, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
      }),
      JSON.stringify({
        request_id: 'rq-ff-ok', digest: 'd2', command: 'git push', timeout_seconds: 300, enqueued_at: now,
        outcome_ref: { outcomeId: 'oc-ff2', contractVersion: 1, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
      }),
    ].join('\n') + '\n', 'utf8')
    const stale = await decide('fleetfile:rq-ff-stale', 'once')
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('stale_contract')
    expect(existsSync(join(queueDir, 'responses', 'rq-ff-stale.json'))).toBe(false)
    const okRes = await decide('fleetfile:rq-ff-ok', 'once')
    expect(okRes.status).toBe(200)
    expect(existsSync(join(queueDir, 'responses', 'rq-ff-ok.json'))).toBe(true)
  })

  it('outcome 绑定条目不吃 autopass 低风险自动放行（stale/双签门不可绕）', async () => {
    process.env.HERMES_APPROVALS_AUTOPASS_GRACE_MS = '0'
    try {
      // 低风险只读命令＋outcome 绑定（矩阵 externalEffect 等格可对 low 命令 ask）——
      // 若 autopass 放行将绕过 stale 合同门；治理面不随抽检器放宽（T11 同则）。
      writeFileSync(join(queueDir, 'queue.jsonl'), JSON.stringify({
        request_id: 'rq-ff-auto', digest: 'd9', command: 'grep deploy README.md',
        timeout_seconds: 300, enqueued_at: Date.now() - 60_000,
        outcome_ref: { outcomeId: 'oc-ff2', contractVersion: 1, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
      }) + '\n', 'utf8')
      const { _resetAutopassScanThrottleForTests } = await import('../pending-controller')
      _resetAutopassScanThrottleForTests()
      const res = await fetch(`${base}/api/approvals/autopass/scan`, { method: 'POST' })
      const body = await res.json() as { ok: boolean; acted: number }
      expect(res.status).toBe(200)
      expect(body.acted).toBe(0)
      expect(existsSync(join(queueDir, 'responses', 'rq-ff-auto.json'))).toBe(false)
      // 无绑定低风险条目仍照常自动放行（回归不变）
      writeFileSync(join(queueDir, 'queue.jsonl'), JSON.stringify({
        request_id: 'rq-ff-auto2', digest: 'd10', command: 'grep deploy README.md',
        timeout_seconds: 300, enqueued_at: Date.now() - 60_000,
      }) + '\n', 'utf8')
      _resetAutopassScanThrottleForTests()
      const res2 = await fetch(`${base}/api/approvals/autopass/scan`, { method: 'POST' })
      const body2 = await res2.json() as { acted: number }
      expect(body2.acted).toBe(1)
      expect(existsSync(join(queueDir, 'responses', 'rq-ff-auto2.json'))).toBe(true)
    } finally {
      delete process.env.HERMES_APPROVALS_AUTOPASS_GRACE_MS
    }
  })
})

// ── 审查修复轮（2026-11-20，I-1/I-2/M-2/M-3）──


describe('审查 I-1：fleetfile 响应幂等（防覆盖翻盘）', () => {
  it('已决条目二次 decide 被拒（404），响应不被改写', async () => {
    await makeContract('oc-i1', 1)
    writeFileSync(join(queueDir, 'queue.jsonl'), JSON.stringify({
      request_id: 'rq-i1', digest: 'd1', command: 'git push', timeout_seconds: 300, enqueued_at: Date.now(),
      outcome_ref: { outcomeId: 'oc-i1', contractVersion: 1, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
    }) + '\n', 'utf8')
    expect((await decide('fleetfile:rq-i1', 'once')).status).toBe(200)
    // 已答后任何二次裁决（含单方改 session/always）被幂等拒绝
    const again = await decide('fleetfile:rq-i1', 'session')
    expect(again.status).toBe(404)
    const resp = JSON.parse(readFileSync(join(queueDir, 'responses', 'rq-i1.json'), 'utf8')) as { choice: string }
    expect(resp.choice).toBe('once')
  })

  it('双签第一签后 deny 一票即决；此后补签不得覆盖翻盘', async () => {
    await makeContract('oc-i1b', 1)
    writeDeferred({ id: 'd-i1b', requestId: 'rq-i1b', outcomeId: 'oc-i1b', contractVersion: 1, dualSign: true })
    // owner 第一签：409 仍 pending
    expect((await decide('deferredfile:d-i1b', 'once')).status).toBe(409)
    // 换人 deny：否决一票即终（合法）
    currentActor = 'verifier@example.com'
    expect((await decide('deferredfile:d-i1b', 'deny')).status).toBe(200)
    const resp = JSON.parse(readFileSync(join(queueDir, 'responses', 'rq-i1b.json'), 'utf8')) as { choice: string }
    expect(resp.choice).toBe('deny')
    // deny 已决：owner 再补 once 签不得覆盖翻盘（fleetfile/deferredfile 同一语义，
    // deferredfile 既有幂等；这里锁 deferred 面，fleetfile 面由上一用例锁）
    currentActor = 'owner@example.com'
    const flip = await decide('deferredfile:d-i1b', 'once')
    expect(flip.status).toBe(404)
    const resp2 = JSON.parse(readFileSync(join(queueDir, 'responses', 'rq-i1b.json'), 'utf8')) as { choice: string }
    expect(resp2.choice).toBe('deny')
  })

  it('fleetfile 双签第一签后 deny 即决、补签 404 不翻盘（writeFleetFileResponse 幂等）', async () => {
    await makeContract('oc-i1c', 1)
    writeFileSync(join(queueDir, 'queue.jsonl'), JSON.stringify({
      request_id: 'rq-i1c', digest: 'd2', command: 'git push origin main', timeout_seconds: 300, enqueued_at: Date.now(),
      outcome_ref: { outcomeId: 'oc-i1c', contractVersion: 1, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
      dual_sign_required: true,
    }) + '\n', 'utf8')
    expect((await decide('fleetfile:rq-i1c', 'once')).status).toBe(409) // owner 第一签
    currentActor = 'verifier@example.com'
    expect((await decide('fleetfile:rq-i1c', 'deny')).status).toBe(200) // deny 即决
    currentActor = 'owner@example.com'
    // 同人两票路径外：双签第二签补 once——响应已在（deny），幂等拒绝不翻盘
    const flip = await decide('fleetfile:rq-i1c', 'once')
    expect(flip.status).toBe(404)
    const resp = JSON.parse(readFileSync(join(queueDir, 'responses', 'rq-i1c.json'), 'utf8')) as { choice: string }
    expect(resp.choice).toBe('deny')
  })
})

describe('审查 I-2：fleet tap 透传 outcome_ref 走同门', () => {
  let approvalRespondCalls: Array<{ id: string; choice: string }>

  /** 注册 fake tap：单会话带一条 approval.requested 事件（outcome_ref 按 806 data 形状）。 */
  async function registerTapWithApproval(approvalData: Record<string, unknown>): Promise<void> {
    const { registerChatRunSocket } = await import('../../services/hermes/fleet-tap')
    approvalRespondCalls = []
    registerChatRunSocket({
      sessionMap: new Map([['s-tap', {
        profile: 'worker-a',
        isWorking: true,
        events: [{ event: 'approval.requested', data: { approval_id: 'a-tap', ...approvalData } }],
      }]]),
      bridge: { approvalRespond: async (id: string, choice: string) => { approvalRespondCalls.push({ id, choice }); return { resolved: true } } },
    }, { getSession: () => ({ profile: 'worker-a' }), listSessions: () => [] })
  }

  afterEach(async () => {
    const { unregisterChatRunSocket } = await import('../../services/hermes/fleet-tap')
    unregisterChatRunSocket()
  })

  it('tap 条目带 outcome_ref → pending 标注；stale 版本 decide 409 且不触达 bridge', async () => {
    await makeContract('oc-tap', 1)
    await registerTapWithApproval({
      preview: 'git push origin main',
      choices: ['once', 'deny'],
      outcome_ref: { outcomeId: 'oc-tap', contractVersion: 8, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
      dual_sign_required: true,
    })
    const items = await pendingItems()
    const tapItem = items.find((i) => i.id === 'fleet:s-tap:a-tap')
    expect(tapItem).toBeTruthy()
    expect((tapItem!.outcomeRef as { outcomeId: string }).outcomeId).toBe('oc-tap')
    expect(tapItem!.dualSignRequired).toBe(true)

    const r = await decide('fleet:s-tap:a-tap', 'once')
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('stale_contract')
    expect(approvalRespondCalls).toEqual([]) // 未放行、不触达 agent
  })

  it('tap 双签条目 owner+verifier 顺序两笔 → resolved（bridge 放行一次＋历史带 outcome 引用）', async () => {
    await makeContract('oc-tap2', 1)
    await registerTapWithApproval({
      preview: 'git push origin main',
      choices: ['once', 'deny'],
      outcome_ref: { outcomeId: 'oc-tap2', contractVersion: 1, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
      dual_sign_required: true,
    })
    expect((await decide('fleet:s-tap:a-tap', 'once')).status).toBe(409) // owner 第一签仍 pending
    expect(approvalRespondCalls).toEqual([])
    currentActor = 'verifier@example.com'
    const second = await decide('fleet:s-tap:a-tap', 'once')
    expect(second.status).toBe(200)
    expect(approvalRespondCalls).toEqual([{ id: 'a-tap', choice: 'once' }])
    expect((second.body.entry as { outcomeRef?: { outcomeId: string } }).outcomeRef?.outcomeId).toBe('oc-tap2')
  })

  it('tap 绑定非双签条目：单签直决（stale 门仍生效）', async () => {
    await makeContract('oc-tap3', 1)
    await registerTapWithApproval({
      preview: 'grep deploy README.md',
      outcome_ref: { outcomeId: 'oc-tap3', contractVersion: 1, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
    })
    const r = await decide('fleet:s-tap:a-tap', 'once')
    expect(r.status).toBe(200)
    expect(approvalRespondCalls).toEqual([{ id: 'a-tap', choice: 'once' }])
  })

  it('mx 请求条目带 outcome_ref → 同门：stale 409 / 双签两笔后响应文件落地', async () => {
    await makeContract('oc-mx', 1)
    writeFileSync(join(queueDir, 'mx-requests.jsonl'), JSON.stringify({
      eid: '$mx1:matrix.test', title: 'git push origin main', detail: 'worker 推送', createdAt: 1000,
      outcome_ref: { outcomeId: 'oc-mx', contractVersion: 5, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
      dual_sign_required: true,
    }) + '\n', 'utf8')
    // stale：409 不写响应
    const stale = await decide('mx:$mx1:matrix.test', 'once')
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('stale_contract')
    expect(existsSync(join(queueDir, 'mx-responses', '_mx1_matrix_test.json'))).toBe(false)
    // 版本修齐后双签两笔 → resolved
    writeFileSync(join(queueDir, 'mx-requests.jsonl'), JSON.stringify({
      eid: '$mx1:matrix.test', title: 'git push origin main', detail: 'worker 推送', createdAt: 1000,
      outcome_ref: { outcomeId: 'oc-mx', contractVersion: 1, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
      dual_sign_required: true,
    }) + '\n', 'utf8')
    expect((await decide('mx:$mx1:matrix.test', 'once')).status).toBe(409) // owner 第一签
    currentActor = 'verifier@example.com'
    const second = await decide('mx:$mx1:matrix.test', 'once')
    expect(second.status).toBe(200)
    const resp = JSON.parse(readFileSync(join(queueDir, 'mx-responses', '_mx1_matrix_test.json'), 'utf8')) as { decision: string }
    expect(resp.decision).toBe('once')
    expect((second.body.entry as { outcomeRef?: { outcomeId: string } }).outcomeRef?.outcomeId).toBe('oc-mx')
  })
})

describe('审查 M-2/M-3：签署台账版本过滤与停用名册拒签', () => {
  it('M-2：旧版本签署不凑对——合同升级后旧签被过滤，双签按当前版本重凑', async () => {
    await makeContract('oc-m2', 1)
    writeDeferred({ id: 'd-m2', requestId: 'rq-m2', outcomeId: 'oc-m2', contractVersion: 1, dualSign: true })
    // 种一条旧版本（v99）owner 签——合同现为 v1，旧签不得凑对
    const { recordOutcomeDualSign } = await import('../../autonomygov/store')
    recordOutcomeDualSign('deferredfile:d-m2', { role: 'owner', actor: 'owner@example.com', at: 1, contractVersion: 99 })
    // verifier 按 v1 签：过滤后无既有签 → verifier 是当前版本第一签（仍 pending，待 owner）
    currentActor = 'verifier@example.com'
    const first = await decide('deferredfile:d-m2', 'once')
    expect(first.status).toBe(409)
    expect(first.body.code).toBe('dual-sign-required')
    expect((first.body.roles as Record<string, string | null>).owner).toBeNull() // 旧 owner 签未计入
    // owner 按 v1 补第二签：两笔当前版本、两角色、不同 actor → resolved
    currentActor = 'owner@example.com'
    const second = await decide('deferredfile:d-m2', 'once')
    expect(second.status).toBe(200)
    expect(existsSync(join(queueDir, 'responses', 'rq-m2.json'))).toBe(true)
  })

  it('M-3：停用（inactive）名册成员无签署权——403 拒签', async () => {
    await makeContract('oc-m3', 1)
    writeDeferred({ id: 'd-m3', requestId: 'rq-m3', outcomeId: 'oc-m3', contractVersion: 1, dualSign: true })
    // verifier 名册行停用：emails 命中但 active=false → 拒签
    const peopleFile = join(process.env.AGENT_IDENTITY_STORE!, 'people.json')
    const people = JSON.parse(readFileSync(peopleFile, 'utf8')) as { people: Array<{ id: string; active: boolean }> }
    people.people.find((p) => p.id === 'p-verifier')!.active = false
    writeFileSync(peopleFile, JSON.stringify(people), 'utf8')
    currentActor = 'verifier@example.com'
    const r = await decide('deferredfile:d-m3', 'once')
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('not_outcome_signer')
    expect(existsSync(join(queueDir, 'responses', 'rq-m3.json'))).toBe(false)
  })
})

// ── 批二 Task 2（2026-11-20）：合同状态门（终态拒批）＋ fleet tap 瞬态收口 ──
// spec 2026-11-20-ai-native-cognition-batch2 §一：cancelled/settled 终态合同的绑定
// 条目拒批（409 outcome_not_active，与 dispatch 面对齐）；deny/终态否决照常放行
// （否决不设门）。fleet: 分支 tap 快照读取瞬态失败不再 fail-open：绑定不可证时
// 聚合面标 outcomeUnverified、decide 批准类 409 outcome_unavailable、autopass 同拒。

describe('批二 T2：合同状态门——终态合同拒批、deny 放行', () => {
  it.each(['cancelled', 'settled'] as const)('终态 %s 合同：批准 409 outcome_not_active，不写响应、仍 pending', async (status) => {
    await makeContract('oc-t2a', 1, status)
    writeDeferred({ id: 'd-t2a', requestId: 'rq-t2a', outcomeId: 'oc-t2a', contractVersion: 1 })
    const r = await decide('deferredfile:d-t2a', 'once')
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('outcome_not_active')
    expect(r.body.contractStatus).toBe(status)
    expect(existsSync(join(queueDir, 'responses', 'rq-t2a.json'))).toBe(false)
    expect((await pendingItems()).some((i) => i.id === 'deferredfile:d-t2a')).toBe(true)
  })

  it('终态合同 deny 放行（否决不设门）：单人 deny 即决、响应 choice=deny', async () => {
    await makeContract('oc-t2b', 1, 'cancelled')
    writeDeferred({ id: 'd-t2b', requestId: 'rq-t2b', outcomeId: 'oc-t2b', contractVersion: 1, dualSign: true })
    const r = await decide('deferredfile:d-t2b', 'deny')
    expect(r.status).toBe(200)
    const resp = JSON.parse(readFileSync(join(queueDir, 'responses', 'rq-t2b.json'), 'utf8')) as { choice: string }
    expect(resp.choice).toBe('deny')
  })

  it('非终态（observing）合同不受状态门影响：批准照常过门单签即决（回归）', async () => {
    await makeContract('oc-t2c', 1, 'observing')
    writeDeferred({ id: 'd-t2c', requestId: 'rq-t2c', outcomeId: 'oc-t2c', contractVersion: 1 })
    const r = await decide('deferredfile:d-t2c', 'once')
    expect(r.status).toBe(200)
    expect(existsSync(join(queueDir, 'responses', 'rq-t2c.json'))).toBe(true)
  })
})

describe('批二 T2：fleet tap 瞬态收口——outcomeUnverified 三面', () => {
  let approvalRespondCalls: Array<{ id: string; choice: string }>

  /** 注册 fake tap：单会话单条 approval.requested（data 定制；避免展开触发 getter）。 */
  async function registerTapEvents(events: Array<{ event: string; data: unknown }>): Promise<void> {
    const { registerChatRunSocket } = await import('../../services/hermes/fleet-tap')
    approvalRespondCalls = []
    registerChatRunSocket({
      sessionMap: new Map([['s-tap', {
        profile: 'worker-a',
        isWorking: true,
        events: events as Array<{ event: string; data: any }>,
      }]]),
      bridge: { approvalRespond: async (id: string, choice: string) => { approvalRespondCalls.push({ id, choice }); return { resolved: true } } },
    }, { getSession: () => ({ profile: 'worker-a' }), listSessions: () => [] })
  }

  afterEach(async () => {
    const { unregisterChatRunSocket } = await import('../../services/hermes/fleet-tap')
    unregisterChatRunSocket()
  })

  it('聚合标注：tap 条目 outcome 绑定字段读取瞬态抛错 → 条目在列且标 outcomeUnverified（不猜无绑定）', async () => {
    const data: Record<string, unknown> = {
      approval_id: 'a-tap',
      preview: 'git push origin main',
      choices: ['once', 'deny'],
    }
    // 字段读取瞬态失败模拟：getter 在 tap 事件 data 上抛（不用字面量展开，防注册期即炸）
    Object.defineProperty(data, 'outcome_ref', {
      enumerable: true,
      get() { throw new Error('transient tap field read') },
    })
    await registerTapEvents([{ event: 'approval.requested', data }])
    const items = await pendingItems()
    const tapItem = items.find((i) => i.id === 'fleet:s-tap:a-tap')
    expect(tapItem).toBeTruthy()
    expect(tapItem!.outcomeUnverified).toBe(true)
    expect(tapItem!.outcomeRef).toBeUndefined()
  })

  it('聚合标注：outcome_ref 在但形状不合法 → 同标 outcomeUnverified（fleetfile 源同口径）', async () => {
    writeFileSync(join(queueDir, 'queue.jsonl'), JSON.stringify({
      request_id: 'rq-t2-mal', digest: 'd-t2', command: 'git push origin main',
      timeout_seconds: 300, enqueued_at: Date.now(),
      outcome_ref: { outcomeId: 'oc-broken', contractVersion: 'two' },
    }) + '\n', 'utf8')
    const items = await pendingItems()
    const item = items.find((i) => i.id === 'fleetfile:rq-t2-mal')
    expect(item).toBeTruthy()
    expect(item!.outcomeUnverified).toBe(true)
    expect(item!.outcomeRef).toBeUndefined()
    // 无 outcome_ref 字段的普通条目不误标（回归）
    writeFileSync(join(queueDir, 'queue.jsonl'), JSON.stringify({
      request_id: 'rq-t2-plain', digest: 'd-t3', command: 'git push origin main',
      timeout_seconds: 300, enqueued_at: Date.now(),
    }) + '\n', 'utf8')
    const plain = (await pendingItems()).find((i) => i.id === 'fleetfile:rq-t2-plain')
    expect(plain).toBeTruthy()
    expect(plain!.outcomeUnverified).toBeUndefined()
  })

  it('autopass 拒：绑定不可证（形状不合法）条目不吃低风险自动放行', async () => {
    process.env.HERMES_APPROVALS_AUTOPASS_GRACE_MS = '0'
    try {
      // 低风险只读命令＋解不出的 outcome_ref——若按「无绑定」放行将绕过合同门
      writeFileSync(join(queueDir, 'queue.jsonl'), JSON.stringify({
        request_id: 'rq-t2-auto', digest: 'd-t4', command: 'grep deploy README.md',
        timeout_seconds: 300, enqueued_at: Date.now() - 60_000,
        outcome_ref: { outcomeId: 'oc-broken', contractVersion: 'v2' },
      }) + '\n', 'utf8')
      const { _resetAutopassScanThrottleForTests } = await import('../pending-controller')
      _resetAutopassScanThrottleForTests()
      const res = await fetch(`${base}/api/approvals/autopass/scan`, { method: 'POST' })
      const body = await res.json() as { ok: boolean; acted: number }
      expect(res.status).toBe(200)
      expect(body.acted).toBe(0)
      expect(existsSync(join(queueDir, 'responses', 'rq-t2-auto.json'))).toBe(false)
    } finally {
      delete process.env.HERMES_APPROVALS_AUTOPASS_GRACE_MS
    }
  })

  it('decide 409：快照读取瞬态失败 → 409 outcome_unavailable 且不触达 bridge（不退风险档闸猜）', async () => {
    const { registerChatRunSocket } = await import('../../services/hermes/fleet-tap')
    approvalRespondCalls = []
    registerChatRunSocket({
      // 整体快照读取抛错模拟：sessionMap.entries() 抛（getFleetLiveEntries 不吞）
      sessionMap: { entries() { throw new Error('transient snapshot read') } },
      bridge: { approvalRespond: async (id: string, choice: string) => { approvalRespondCalls.push({ id, choice }); return { resolved: true } } },
    }, { getSession: () => ({ profile: 'worker-a' }), listSessions: () => [] })
    const r = await decide('fleet:s-tap:a-tap', 'once')
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('outcome_unavailable')
    expect(approvalRespondCalls).toEqual([])
  })

  it('decide 409：条目绑定字段读取抛错（outcomeUnverified 标记）→ 409 outcome_unavailable 不触达 bridge', async () => {
    const data: Record<string, unknown> = {
      approval_id: 'a-tap',
      preview: 'git push origin main',
      choices: ['once', 'deny'],
    }
    Object.defineProperty(data, 'outcome_ref', {
      enumerable: true,
      get() { throw new Error('transient tap field read') },
    })
    await registerTapEvents([{ event: 'approval.requested', data }])
    const r = await decide('fleet:s-tap:a-tap', 'once')
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('outcome_unavailable')
    expect(approvalRespondCalls).toEqual([])
  })

  it('decide 409：条目不在快照（事件窗旋转/瞬态）→ 409 outcome_unavailable（旧路径无门直放，收口）', async () => {
    // 快照健康但无该 approval——绑定状态不可证，批准类不放行
    await registerTapEvents([{ event: 'approval.requested', data: { approval_id: 'a-other', preview: 'git push', choices: ['once', 'deny'] } }])
    const r = await decide('fleet:s-tap:a-tap', 'once')
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('outcome_unavailable')
    expect(approvalRespondCalls).toEqual([])
  })

  it('快照不可读时 deny 照常放行（否决不设门）：bridge 收到 deny', async () => {
    const { registerChatRunSocket } = await import('../../services/hermes/fleet-tap')
    approvalRespondCalls = []
    registerChatRunSocket({
      sessionMap: { entries() { throw new Error('transient snapshot read') } },
      bridge: { approvalRespond: async (id: string, choice: string) => { approvalRespondCalls.push({ id, choice }); return { resolved: true } } },
    }, { getSession: () => ({ profile: 'worker-a' }), listSessions: () => [] })
    const r = await decide('fleet:s-tap:a-tap', 'deny')
    expect(r.status).toBe(200)
    expect(approvalRespondCalls).toEqual([{ id: 'a-tap', choice: 'deny' }])
  })

  it('健康 tap 的无绑定条目照旧走风险档闸直决（回归：互斥分流不误伤）', async () => {
    await registerTapEvents([{
      event: 'approval.requested',
      data: { approval_id: 'a-plain', preview: 'grep deploy README.md', choices: ['once', 'deny'] },
    }])
    const r = await decide('fleet:s-tap:a-plain', 'once')
    expect(r.status).toBe(200)
    expect(approvalRespondCalls).toEqual([{ id: 'a-plain', choice: 'once' }])
  })
})
