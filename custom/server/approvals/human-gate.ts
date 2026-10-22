// custom/server/approvals/human-gate.ts
// HumanGate 发布批准前置请求（run22 复盘产品化②，2026-10-22）。
//
// run22 实锤（R-5 环形依赖 9h）：G5 发布评审把「导演批准记录落卡」计为缺项，而
// 批准动作只在判词 PASS 后触发——评审等批准、批准等评审，永锁。当时靠评审员在
// matrix 群手工发「needs your OK」消息由审批环代批破环。本模块把该破环通道产品化：
// 发布评审（或任何持有卡面的角色）可**前置**发起人工批准请求——请求进入审批收件箱
// （与命令审批/评审审批同一聚合管线），人工批准后落批准链（approval-log）并可回写
// harness 事件账本（env HUMAN_GATE_EVENTS 指定文件，缺省不写）——批准与评审判词
// 解耦，环形依赖从产品面断根。
//
// 形态：内存+落盘单文件存储（store 文件由 env HUMAN_GATE_STORE 指定，缺省不落盘
// ——单进程内存态即收件箱可见）；请求幂等（runId+cardId 唯一键，重复发起返回在案
// 单）。与 pending-controller 的聚合挂钩：listHumanGatePending() 输出 PendingItem
// 形状（id 前缀 hgate:），由 collectPendingItems 合并。
import Router from '@koa/router'
import { appendApprovalLog } from './approval-log'
import type { PendingItem } from './pending-controller'

export interface HumanGateRequest {
  id: string                       // hgate:<runId>:<cardId>
  runId: string
  cardId: string
  title: string
  detail?: string
  requestedBy: string
  createdAt: number
  status: 'pending' | 'approved' | 'rejected'
  decidedBy?: string
  decidedAt?: number
  note?: string
}

const store = new Map<string, HumanGateRequest>()

function storeFile(): string | null {
  const p = process.env.HUMAN_GATE_STORE?.trim()
  return p || null
}

function persist() {
  const f = storeFile()
  if (!f) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs')
    fs.writeFileSync(f, JSON.stringify([...store.values()], null, 1), 'utf-8')
  } catch { /* 落盘失败不阻断收件箱 */ }
}

export function mkId(runId: string, cardId: string): string {
  return `hgate:${runId}:${cardId}`
}

export function createRequest(input: {
  runId: string; cardId: string; title: string; detail?: string; requestedBy: string
}): { req: HumanGateRequest; existed: boolean } {
  const id = mkId(input.runId, input.cardId)
  const existed = store.get(id)
  if (existed) return { req: existed, existed: true }
  const req: HumanGateRequest = {
    id, runId: input.runId, cardId: input.cardId, title: input.title,
    detail: input.detail, requestedBy: input.requestedBy,
    createdAt: Date.now(), status: 'pending',
  }
  store.set(id, req)
  persist()
  return { req, existed: false }
}

export function decide(id: string, decision: 'approve' | 'reject', actor: string, note?: string): HumanGateRequest | null {
  const req = store.get(id)
  if (!req || req.status !== 'pending') return null
  req.status = decision === 'approve' ? 'approved' : 'rejected'
  req.decidedBy = actor
  req.decidedAt = Date.now()
  req.note = note
  persist()
  // 批准链留痕（与命令/评审审批同一审计链）；harness 事件账本（可选）
  try {
    appendApprovalLog({
      id: `hgate-${req.cardId}-${req.decidedAt}`,
      actor, targetKind: 'harness', targetId: req.cardId,
      targetTitle: `HumanGate ${req.runId}/${req.cardId}`,
      decision: req.status, note: req.title,
    })
  } catch { /* 链写失败不阻断决策返回 */ }
  const ev = process.env.HUMAN_GATE_EVENTS?.trim()
  if (ev) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs') as typeof import('fs')
      fs.appendFileSync(ev,
        `humangate:${req.cardId} HUMAN-GATE-${req.status.toUpperCase()} ${actor} ${Math.floor(Date.now() / 1000)}\n`,
        'utf-8')
    } catch { /* 事件账本写失败不阻断 */ }
  }
  return req
}

/** 收件箱聚合出口（pending-controller.collectPendingItems 消费）。 */
export function listHumanGatePending(): PendingItem[] {
  return [...store.values()]
    .filter(r => r.status === 'pending')
    .map(r => ({
      id: r.id, kind: 'review' as const,
      title: `发布 HumanGate：${r.title}`,
      detail: r.detail ?? `run=${r.runId} card=${r.cardId}（前置批准请求——run22 复盘②）`,
      createdAt: r.createdAt, risk: 'high' as const,
    }))
}

export const humanGateRouter = new Router({ prefix: '/api/approvals/human-gate' })

humanGateRouter.post('/', async ctx => {
  const b = (ctx.request.body ?? {}) as Record<string, unknown>
  const runId = String(b.runId ?? '').trim()
  const cardId = String(b.cardId ?? '').trim()
  const title = String(b.title ?? '').trim()
  if (!runId || !cardId || !title) {
    ctx.status = 400; ctx.body = { ok: false, detail: 'runId/cardId/title 必填' }; return
  }
  const { req, existed } = createRequest({
    runId, cardId, title,
    detail: typeof b.detail === 'string' ? b.detail.slice(0, 500) : undefined,
    requestedBy: (ctx.state as { user?: { username?: string } })?.user?.username ?? 'anonymous',
  })
  ctx.status = existed ? 200 : 201
  ctx.body = { ok: true, request: req, existed }
})

humanGateRouter.get('/', async ctx => {
  ctx.body = { ok: true, requests: [...store.values()] }
})

humanGateRouter.post('/:id/decide', async ctx => {
  const decision = String(((ctx.request.body ?? {}) as Record<string, unknown>).decision ?? '')
  if (decision !== 'approve' && decision !== 'reject') {
    ctx.status = 400; ctx.body = { ok: false, detail: 'decision 须为 approve|reject' }; return
  }
  const actor = (ctx.state as { user?: { username?: string } })?.user?.username ?? 'anonymous'
  const req = decide(String(ctx.params.id ?? ''), decision, actor)
  if (!req) { ctx.status = 404; ctx.body = { ok: false, detail: '批准单不存在或已裁决' }; return }
  ctx.body = { ok: true, request: req }
})
