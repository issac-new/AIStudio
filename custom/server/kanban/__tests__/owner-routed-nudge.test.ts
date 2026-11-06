/**
 * owner-routed-nudge 单测（run21+run22 两轮错侧催办立案的产品化①）：
 * 路由决策四态——assignee 在位直投 / 空置回落板 team / 双空显式无人 / 卡不存在。
 * 铁律回归：双空态返回 unassigned 而非任何固定接收方（run21 三连误催复测侧、
 * run22 退回单只达组织者两实录的防复发锚）。
 *
 * P2 Task 3 催办诚实三态：/route 端点响应必带
 * delivery{state:'routed-only',sent:null,received:null}——「只解析路由、未发送
 * 消息」是服务端契约不是 UI 措辞；消费者不得把路由解析当送达（手册 §8.4 催办
 * 三态定义的服务端锚）。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { resolveNudgeTarget, setNudgeCardProvider, nudgeRouter, type NudgeCardLike } from '../owner-routed-nudge'

const cards: NudgeCardLike[] = [
  { id: 't_fix_01', assignee: 'hu-csw-channel-wechat', title: 'DEF-BE-S1-01 台架漂移', board: 'hu-channel-wechat' },
  { id: 't_orphan', assignee: '', title: '未认领卡', board: 'qi-test-pay', boardTeam: 'qi-researcher' },
  { id: 't_wild', assignee: null, title: '双空卡', board: 'x-cashier-mp', boardTeam: null },
]

describe('resolveNudgeTarget — 催办路由跟随卡 owner', () => {
  it('assignee 在位 → 直投 assignee（run22 缺项 owner 直派的解析面）', () => {
    const d = resolveNudgeTarget(cards, 't_fix_01')
    expect(d.found && d.route === 'assignee' && d.target === 'hu-csw-channel-wechat').toBeTruthy()
  })
  it('assignee 空置 → 回落板 team 并标可见性注记（建卡未认领=派单断环信号）', () => {
    const d = resolveNudgeTarget(cards, 't_orphan')
    expect(d.found && d.route === 'board-team' && d.target === 'qi-researcher').toBeTruthy()
    expect(d.found && d.note?.includes('建卡未认领')).toBeTruthy()
  })
  it('双空 → 显式 unassigned，绝不改投固定接收方（两轮错侧催办防复发锚）', () => {
    const d = resolveNudgeTarget(cards, 't_wild')
    expect(d.found && d.route === 'unassigned' && d.target === '').toBeTruthy()
  })
  it('卡不存在 → card-not-found', () => {
    expect(resolveNudgeTarget(cards, 't_none')).toEqual({ found: false, reason: 'card-not-found' })
  })
})

describe('/api/kanban/nudge/route — 催办三态 delivery 契约（P2 Task 3）', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    setNudgeCardProvider(() => cards)
    const Koa = (await import('koa')).default
    const bodyParser = (await import('@koa/bodyparser')).default
    const app = new Koa()
    app.use(bodyParser())
    app.use(nudgeRouter.routes(), nudgeRouter.allowedMethods())
    server = createServer(app.callback())
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })

  afterAll(async () => {
    setNudgeCardProvider(null)
    await new Promise<void>(r => server.close(() => r()))
  })

  it('成功解析 → delivery 恒 routed-only 且 sent/received=null（未发送是契约）', async () => {
    const res = await fetch(`${base}/api/kanban/nudge/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: 't_fix_01' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; decision: { route: string }; delivery: unknown }
    expect(body.ok).toBe(true)
    expect(body.decision.route).toBe('assignee')
    expect(body.delivery).toEqual({ state: 'routed-only', sent: null, received: null })
  })

  it('unassigned 态同样只解析不投递——delivery 不因双空改语义', async () => {
    const res = await fetch(`${base}/api/kanban/nudge/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: 't_wild' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { delivery: unknown }
    expect(body.delivery).toEqual({ state: 'routed-only', sent: null, received: null })
  })

  it('解析失败（卡不存在/缺参）→ 4xx 可见失败，不带 delivery 成功语义', async () => {
    const notFound = await fetch(`${base}/api/kanban/nudge/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: 't_none' }),
    })
    expect(notFound.status).toBe(404)
    expect(await notFound.json()).not.toHaveProperty('delivery')
    const noBody = await fetch(`${base}/api/kanban/nudge/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(noBody.status).toBe(400)
    expect(await noBody.json()).not.toHaveProperty('delivery')
  })
})
