// custom/server/orgworkbench/org-workbench-controller.ts
// 组织工作台·决策议程 REST 控制器（批三 T4，spec 2026-11-21-ai-native-orgworkbench-batch3
// §四；设计 §4.7）——GET /api/hermes/org-workbench/agenda 单只读端点。
//
// 纪律：
// - 功能门：OUTCOME_WORKBENCH≠1 → 404 {code:'outcome_workbench_disabled'}（与
//   outcome-controller 同款实现：router.use 每请求动态读 env，不缓存）。
// - 鉴权：宿主 JWT 中间件落 ctx.state.user（outcome-controller actorOf 同源）；
//   缺席（未登录）401——议程是给人决策的读面，任何登录用户可读，无角色门。
// - 装配：buildAgenda（T3 纯投影）的六/七源注入函数在此接真实账本——审批收件箱
//   复用 approval-inbox/pending-sources.collectPendingItems（D3 单一事实源）；其余
//   各域走各自 store 的列表读函数。逐源 try/catch 由 buildAgenda.runSource 承担，
//   控制器不再吞错：源失败投影为 available:false+error，HTTP 恒 200（ok 信封内
//   如实降级），不 503、不伪装零数据。
// - 待确认团队源：listAllContracts 扫描 + getTeam 过滤 status==='draft'（状态过滤
//   在真源完成，投影不猜状态）；两读函数自身 fail-soft（目录缺席=空），空结果=
//   真零数据（available:true）。
// - 零写面：人处理决定回原权威域（审批账/PremiseLog/expcandidates/OutcomeTeam），
//   本控制器不提供任何写端点（D9）。
import Router from '@koa/router'
import type { Context } from 'koa'
import { fail, ok } from '../lib/http'
import { collectPendingItems } from '../approval-inbox/pending-sources'
import { listPremises } from '../premiselog/store'
import { listCases } from '../reviewgov/store'
import { listPending } from '../escalation/escalation-store'
import { listCandidates } from '../expcandidates/exp-store'
import { getTeam, listAllContracts } from '../outcome/outcome-store'
import { buildAgenda } from './agenda'
import type { AgendaContractRow, AgendaDeps, AgendaDraftTeamRow } from './agenda'

/** 真实六源装配（模块内单一事实源；测试经 options.deps 覆盖传桩）。 */
function realDeps(): AgendaDeps {
  return {
    collectPendingItems,
    // 逾期判定（dueAt!=null && dueAt<=now && status∈{active,observing}）在投影内，
    // 这里只做行形状映射（OutcomeContract → AgendaContractRow）。
    listContracts: (): AgendaContractRow[] =>
      listAllContracts().map((c) => ({
        outcomeId: c.outcomeId,
        title: c.title,
        dueAt: c.dueAt,
        status: c.status,
        ownerPersonId: c.ownerPersonId,
        riskTier: c.riskTier,
        updatedAt: c.updatedAt,
      })),
    listPremises: () => listPremises(),
    listCases: () => listCases(),
    listPendingEscalations: () => listPending(),
    listCandidates: () => listCandidates(),
    // 草稿团队：扫合同全集＋getTeam 读 team.json，status==='draft' 才入选
    // （getTeam 坏档/缺席返回 null，fail-soft 不炸源）。
    listDraftTeams: (): AgendaDraftTeamRow[] => {
      const rows: AgendaDraftTeamRow[] = []
      for (const c of listAllContracts()) {
        const t = getTeam(c.outcomeId)
        if (t?.status === 'draft') {
          rows.push({ outcomeId: t.outcomeId, version: t.version, updatedAt: t.updatedAt })
        }
      }
      return rows
    },
  }
}

/** 控制器注入面：deps 覆盖（测试桩）与时钟（缺省真实六源＋Date.now）。 */
export interface OrgWorkbenchRouteOptions {
  /** 覆盖指定源读函数（与真实装配浅合并；测试逐源注桩/注抛）。 */
  deps?: Partial<AgendaDeps>
  /** 时钟注入（测试固定 generatedAt）；缺省 Date.now。 */
  now?: () => number
}

/**
 * 注册 org-workbench 路由（注册模式照 outcome-controller：工厂返回带 prefix 的
 * Router，宿主挂载补丁 810 import 默认实例 orgWorkbenchRoutes）。
 */
export function registerOrgWorkbenchRoutes(opts: OrgWorkbenchRouteOptions = {}): Router {
  const router = new Router({ prefix: '/api/hermes/org-workbench' })

  // 功能门（照抄 outcome-controller：每请求动态读 env；门关=端点不存在，先于鉴权）
  router.use(async (ctx, next) => {
    if (process.env.OUTCOME_WORKBENCH !== '1') {
      fail(ctx, 404, '结果工作台未启用（需 OUTCOME_WORKBENCH=1）', { code: 'outcome_workbench_disabled' })
      return
    }
    await next()
  })

  // 宿主 JWT：登录态由宿主认证中间件落 ctx.state.user；缺席=未登录 401
  router.use(async (ctx, next) => {
    if (!ctx.state?.user) {
      fail(ctx, 401, '需要登录后访问')
      return
    }
    await next()
  })

  // GET /agenda：六源决策议程（纯读投影；源失败在 available/error 内如实降级）
  router.get('/agenda', (ctx: Context) => {
    const deps: AgendaDeps = { ...realDeps(), ...opts.deps }
    ok(ctx, { ...buildAgenda(deps, opts.now ? opts.now() : Date.now()) })
  })

  return router
}

/** 默认路由实例：宿主挂载补丁 810 直接 import（实例名不变，补丁无需随动）。 */
export const orgWorkbenchRoutes: Router = registerOrgWorkbenchRoutes()
