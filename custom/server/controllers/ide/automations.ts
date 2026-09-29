/**
 * IDE Automations REST（/api/ide/automations/*）——A2（2026-09-29）。
 *
 * GET    /api/ide/automations            规则 + 触发历史
 * POST   /api/ide/automations/rules      建规则（校验失败 400 字段级错误）
 * PATCH  /api/ide/automations/rules/:id  部分更新（enabled/name/promptTemplate/debounceMs）
 * DELETE /api/ide/automations/rules/:id  删规则
 * POST   /api/ide/automations/events     事件摄入（kanban/webhook/git 外部事件统一入口；
 *                                        file 由服务端 watcher 自产，也可经此注入测试）
 *
 * 存储：runtime/ide-automations.json + runtime/ide-automations-history.json
 * （IDE_AUTOMATIONS_STORE 前缀覆盖供守门测试；与 hermes config/db 零共享）。
 * 挂载：B 类 patch（series 506）在 bootstrap/routes.ts，继承全局 authMiddleware 链。
 * 派发：engine-controller 的 MentionDispatchService 单例（pending 槽/围栏/台账全继承）。
 */
import Router from '@koa/router'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { AutomationEngine, type AutomationDispatchPort } from '../../automations/automation-engine'
import type { AutomationEvent } from '../../automations/automation-rules'

const automationsRouter = new Router({ prefix: '/api/ide/automations' })

const STORE_BASE = process.env.IDE_AUTOMATIONS_STORE?.trim()
  ? resolve(process.env.IDE_AUTOMATIONS_STORE)
  : join(__dirname, '../../../../runtime')

let engineSingleton: AutomationEngine | null = null

/**
 * 引擎单例。dispatch 端口懒接 engine-controller 的 mention 总线单例——
 * 两个模块都在 server 启动后才可用（引擎 WS 未连时 dispatch 返回
 * engine_unreachable outcome，引擎如实落历史，不谎报成功）。
 */
export function getAutomationEngine(): AutomationEngine {
  if (engineSingleton) return engineSingleton
  const port: AutomationDispatchPort = {
    dispatch: async (params) => {
      const { getMentionDispatch } = await import('../../zcode/engine-controller')
      return getMentionDispatch().dispatch(params) as Promise<Array<{ reason: string; sessionId?: string; commandId?: string }>>
    },
  }
  engineSingleton = new AutomationEngine({
    storePath: join(STORE_BASE, 'ide-automations.json'),
    historyPath: join(STORE_BASE, 'ide-automations-history.json'),
    port,
    enableGitPoll: true,
  })
  engineSingleton.syncSources()
  return engineSingleton
}

/** 守门测试用：丢弃单例（计时器/桶状态随实例重置）。 */
export function resetAutomationEngineForTests(): void {
  if (engineSingleton) engineSingleton.dispose()
  engineSingleton = null
}

function ruleSummary(rule: unknown): string {
  const r = rule as { source?: { type?: string } }
  return String(r?.source?.type ?? 'unknown')
}

automationsRouter.get('/', (ctx) => {
  const engine = getAutomationEngine()
  ctx.body = { ok: true, rules: engine.listRules(), history: engine.listHistory() }
})

automationsRouter.post('/rules', (ctx) => {
  const engine = getAutomationEngine()
  const res = engine.addRule(ctx.request?.body)
  if ('errors' in res) {
    ctx.status = 400
    ctx.body = { ok: false, errors: res.errors }
    return
  }
  ctx.status = 201
  ctx.body = { ok: true, rule: res.rule, source: ruleSummary(res.rule) }
})

automationsRouter.patch('/rules/:id', (ctx) => {
  const engine = getAutomationEngine()
  const updated = engine.updateRule(String(ctx.params?.id ?? ''), (ctx.request?.body ?? {}) as Record<string, never>)
  if (!updated) {
    ctx.status = 404
    ctx.body = { ok: false, detail: 'rule_not_found' }
    return
  }
  ctx.body = { ok: true, rule: updated }
})

automationsRouter.delete('/rules/:id', (ctx) => {
  const engine = getAutomationEngine()
  if (!engine.removeRule(String(ctx.params?.id ?? ''))) {
    ctx.status = 404
    ctx.body = { ok: false, detail: 'rule_not_found' }
    return
  }
  ctx.body = { ok: true }
})

/** 事件摄入统一入口。事件体经 matchEvent 前的最小结构校验（type/workspacePath 必填）。 */
automationsRouter.post('/events', (ctx) => {
  const engine = getAutomationEngine()
  const body = ctx.request?.body as { type?: string; workspacePath?: string } | undefined
  const type = body?.type
  const workspacePath = typeof body?.workspacePath === 'string' ? body.workspacePath : ''
  const known = ['file', 'kanban', 'git', 'webhook']
  if (!type || !known.includes(type) || !workspacePath.startsWith('/')) {
    ctx.status = 400
    ctx.body = { ok: false, detail: '事件须含 type（file/kanban/git/webhook）与绝对 workspacePath' }
    return
  }
  const event = body as unknown as AutomationEvent
  const res = engine.ingestEvent(event)
  ctx.body = { ok: true, ...res }
})

export default automationsRouter
