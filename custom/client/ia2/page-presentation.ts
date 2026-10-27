// overlay/custom/client/ia2/page-presentation.ts
// 页面呈现解析器（2026-10-27 产品一致性 Task 8）：route → { 域根, 阶段段,
// 页签段, 归属段, 页面段, 扁平标题 }。此前同一套路由在三个消费面各自解析：
// 最近轨迹（recent-trail.recentTitle）、面包屑（IaBreadcrumb 内联字典）、
// 浏览器标签页标题（无）——simMap/导演详情这类新页只在轨迹侧可达、面包屑只剩
// 被隐藏的根、document.title 永远是产品名。本模块把解析收敛为单一事实源：
//   - 扁平标题（pageTitle）：回落链与 recentTitle 完全一致（recent-trail.test
//     逐字守门），recentTitle 改为薄委托；
//   - 层级段（resolvePagePresentation）：面包屑消费，保留「根＞阶段＞页签/
//     页面」层级不抹平，并补 query.from 来路阶段语义（来路优先于表内归属，
//     与 nav-centers.activeStagesForRoute 同一裁决序）；
//   - document.title（installPageTitle）：页面级标题随路由变；对象级标题
//     （ChatView 会话标题/Matrix 聊天标题自写 document.title 的路由）让位，
//     写入放在 afterEach 后的 nextTick 拍——组件卸载复位发生在本轮刷新内，
//     后拍写入不被吞（时序测试见 page-presentation.test.ts）。
// 标签全部引用既有单一事实源（nav-centers/stage-meta/stage-tabs/sim-tabs），
// 不复制字符串。不 import 组件，node 环境可直跑。
import { nextTick } from 'vue'
import type { Router } from 'vue-router'
import {
  COMMON_NAVS,
  ISLAND_NAVS,
  SIM_NAVS,
  WORKBENCH_ROUTE_NAMES,
  stageKeyFromQuery,
} from './nav-centers'
import { STAGE_META } from './stage-meta'
import { resolveTab, tabForLegacyRoute, tabMeta, type StageNo } from './stage-tabs'
import { SIM_TABS_TEXT } from './views/sim/sim-tabs'
import { hasStageAttribution, stageCircles, stageOwnersForRouteName } from './stage-attribution'

export type PageLocale = 'zh' | 'en'

/** 调用方所需的最小路由形状（vue-router route 的结构子集，纯测可直接造） */
export interface PageRouteLike {
  fullPath: string
  path?: string
  name?: unknown
  query?: Record<string, unknown>
  params?: Record<string, unknown>
}

/** 面包屑可点回跳目标（vue-router 按名跳；不新增路由） */
export interface PageLinkTarget {
  name: string
  query?: Record<string, string>
}

/** 层级段：label 已按 locale 解析；无 to=纯展示段（chip/当前段） */
export interface PageSegment {
  key: string
  label: string
  to?: PageLinkTarget
}

/** 阶段归属段语境：fromQuery=来路单阶段（query.from）；否则表内归属（空数组=全程工具） */
export interface PageAttribution {
  owners: readonly StageNo[]
  fromQuery: boolean
}

export interface PagePresentation {
  /** 域根：日常=流程总览；推演=全流程推演。null=未知名（面包屑整条不渲染） */
  root: PageSegment | null
  /** 阶段段（阶段页自身/旧 gov 深链映射；含圈号短名，如「② 需求」） */
  stage: PageSegment | null
  /** 阶段页签段（?tab= 或旧深链映射） */
  tab: PageSegment | null
  /** 推演域子页段（监督面板/运行监控/证据库/编排/设置/业务地图/导演详情） */
  simPage: PageSegment | null
  /** 阶段归属段（非阶段页、非推演域的工具页） */
  attribution: PageAttribution | null
  /** 末端页面段（工具页名；旅程页/推演根=null——根即本页，不自我指认） */
  page: PageSegment | null
  /** 推演域（/app/sim* 家族）：独立导航域，无日常阶段归属 */
  isSimDomain: boolean
}

/** 末端页面名词典（键=去 ia2. 前缀的路由名；i18n 覆盖守门只豁免 name: 'ia2.*'
 *  语境，对象键会被误判为文案键——去前缀后查表统一 slice，字面量不落扫描面。
 *  2026-10-27 自 IaBreadcrumb 内联字典迁入：面包屑/扁平标题/浏览器标签共用。） */
const PAGE_LABELS: Record<string, { zh: string; en: string }> = {
  board: { zh: '看板', en: 'Board' },
  inbox: { zh: '审批收件箱', en: 'Approvals Inbox' },
  collab: { zh: '工作台', en: 'Workbench' },
  dash: { zh: '工作台概览', en: 'Workbench Overview' },
  teams: { zh: '团队', en: 'Teams' },
  agents: { zh: '智能体', en: 'Agents' },
  accounts: { zh: '账户管理', en: 'Accounts' },
  deliveryCases: { zh: '交付案例', en: 'Delivery Cases' },
  search: { zh: '检索', en: 'Search' },
  simOrchestration: { zh: '运行编排', en: 'Orchestration' },
  simSettings: { zh: '推演设置', en: 'Simulation Settings' },
  govSettings: { zh: '系统设置', en: 'System Settings' },
  modelProviders: { zh: '模型服务商', en: 'Model Providers' },
}

/** 导演运行详情（/app/sim/director/:runId）：词与 DirectorRunDetail 视图标题一致 */
const DIRECTOR_RUN_LABEL = { zh: '导演运行详情', en: 'Director run detail' }

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'] as const

function pick(locale: PageLocale, zh: string, en: string): string {
  return locale === 'zh' ? zh : en
}

function stageShortLabel(no: StageNo, locale: PageLocale): string {
  const m = STAGE_META[no - 1]
  return `${CIRCLED[no - 1]} ${pick(locale, m.navLabel, m.navLabelEn)}`
}

/** 推演域判定：SIM_NAVS 六签 + 导演详情（独立导航域，不挂日常「流程总览」） */
function simNavFor(name: string) {
  return SIM_NAVS.find(n => n.name === name) ?? null
}

function isSimDomainName(name: string): boolean {
  return Boolean(simNavFor(name)) || name === 'ia2.simDirectorRun'
}

/**
 * 扁平标题（最近轨迹与浏览器标签页共用）：
 * 推演签 → 常用入口及其工作台兄弟 → 六阶段页（?tab= 命中页签元数据时拼
 * 「阶段 · 页签」）→ 旧 gov 深链映射 → 专题岛屿 → 末端页面词典；全部未命中
 * 回落路由名，再回落 fullPath（不猜词）。
 */
export function pageTitle(route: PageRouteLike, locale: PageLocale): string {
  const name = String(route.name ?? '')

  const sim = simNavFor(name)
  if (sim) return pick(locale, sim.zh, sim.en)
  if (name === 'ia2.simDirectorRun') return pick(locale, DIRECTOR_RUN_LABEL.zh, DIRECTOR_RUN_LABEL.en)

  const common = COMMON_NAVS.find(n => n.name === name)
  if (common) return pick(locale, common.zh, common.en)
  if (WORKBENCH_ROUTE_NAMES.has(name)) {
    const workbench = COMMON_NAVS.find(n => n.key === 'workbench')!
    return pick(locale, workbench.zh, workbench.en)
  }

  const stageMatch = /^ia2\.stage([1-6])$/.exec(name)
  if (stageMatch) {
    return stageTabTitle(Number(stageMatch[1]) as StageNo, route, locale)
  }
  const legacy = tabForLegacyRoute(name)
  if (legacy) return stageTabTitle(legacy.stage, { ...route, query: { tab: legacy.tab } }, locale)

  const island = ISLAND_NAVS.find(n => n.name === name)
  if (island) return pick(locale, island.labelZh, island.labelEn)

  const short = name.replace(/^ia2\./, '')
  const pageLabel = PAGE_LABELS[short]
  if (pageLabel) return pick(locale, pageLabel.zh, pageLabel.en)

  return name || route.fullPath
}

/** 阶段页标题：短名（无圈号）；?tab= 精确命中页签元数据才拼「阶段 · 页签」，
 *  未知/缺失不拼（区别于面包屑段——那边走 resolveTab 落默认签，轨迹标题只
 *  记用户真实停留的签，守门断言见 recent-trail.test） */
function stageTabTitle(stage: StageNo, route: PageRouteLike, locale: PageLocale): string {
  const meta = STAGE_META[stage - 1]
  const base = pick(locale, meta.navLabel, meta.navLabelEn)
  const rawTab = route.query?.tab
  const tabKey = String((Array.isArray(rawTab) ? rawTab[0] : rawTab) ?? '')
  const tab = tabKey ? tabMeta(stage, tabKey) : null
  return tab ? `${base} · ${pick(locale, tab.zh, tab.en)}` : base
}

/**
 * 层级呈现解析（面包屑消费；保留层级不抹平）：
 * 阶段页 → 根/阶段/页签；旧 gov 深链 → 同构映射；推演域 → 推演根/子页段
 * （无阶段归属）；其余工具页 → 根/归属段/页面段，归属段来路（query.from）
 * 优先于表内归属（与顶栏 activeStagesForRoute 同一裁决序）。
 */
export function resolvePagePresentation(route: PageRouteLike, locale: PageLocale): PagePresentation {
  const name = String(route.name ?? '')
  const short = name.replace(/^ia2\./, '')
  const zh = locale === 'zh'

  const empty: PagePresentation = {
    root: null, stage: null, tab: null, simPage: null, attribution: null, page: null,
    isSimDomain: false,
  }
  if (!name) return empty

  // ── 推演域：根=全流程推演，子页段自 SIM_NAVS/导演详情；不吃 from、不挂阶段归属
  if (isSimDomainName(name)) {
    const root: PageSegment = {
      key: 'sim-root',
      label: pick(locale, SIM_TABS_TEXT.zh.shellTitle, SIM_TABS_TEXT.en.shellTitle),
      to: { name: 'ia2.sim' },
    }
    const sim = simNavFor(name)
    const simPage: PageSegment | null = name === 'ia2.sim'
      ? null
      : sim
        ? { key: sim.key, label: pick(locale, sim.zh, sim.en) }
        : { key: 'sim-director', label: pick(locale, DIRECTOR_RUN_LABEL.zh, DIRECTOR_RUN_LABEL.en) }
    return { ...empty, root, simPage, isSimDomain: true }
  }

  const root: PageSegment = {
    key: 'process-root',
    label: (() => {
      const journey = COMMON_NAVS.find(n => n.key === 'journey')!
      return pick(locale, journey.zh, journey.en)
    })(),
    to: { name: 'ia2.journey' },
  }

  // ── 阶段页：根/阶段/页签
  const stageMatch = /^ia2\.stage([1-6])$/.exec(name)
  if (stageMatch) {
    const no = Number(stageMatch[1]) as StageNo
    const stage: PageSegment = { key: `stage${no}`, label: stageShortLabel(no, locale) }
    const key = resolveTab(no, route.query?.tab)
    const tm = tabMeta(no, key)
    return { ...empty, root, stage, tab: tm ? { key: tm.key, label: pick(locale, tm.zh, tm.en) } : null }
  }

  // ── 旧 gov 深链（路由本身已 redirect；此分支覆盖未跳转的嵌入/测试态）
  const legacy = tabForLegacyRoute(name)
  if (legacy) {
    const stage: PageSegment = { key: `stage${legacy.stage}`, label: stageShortLabel(legacy.stage, locale) }
    const tm = tabMeta(legacy.stage, legacy.tab)
    return { ...empty, root, stage, tab: tm ? { key: tm.key, label: pick(locale, tm.zh, tm.en) } : null }
  }

  // ── 工具页：归属段（来路优先）+ 页面段
  let attribution: PageAttribution | null = null
  if (hasStageAttribution(name)) {
    const fromNo = stageKeyFromQuery(route.query?.from)
    if (fromNo) {
      const no = Number(fromNo.replace('stage', '')) as StageNo
      attribution = { owners: [no], fromQuery: true }
    } else {
      attribution = { owners: stageOwnersForRouteName(name), fromQuery: false }
    }
  }

  // 旅程页=根本身，不自我指认；其余按 末端词典 → 常用入口 → 岛屿 取页面段
  let page: PageSegment | null = null
  if (name !== 'ia2.journey') {
    const pageLabel = PAGE_LABELS[short]
    const common = COMMON_NAVS.find(n => n.name === name)
    const island = ISLAND_NAVS.find(n => n.name === name)
    if (pageLabel) page = { key: short, label: pick(locale, pageLabel.zh, pageLabel.en) }
    else if (common) page = { key: common.key, label: pick(locale, common.zh, common.en) }
    else if (island) page = { key: island.name, label: pick(locale, island.labelZh, island.labelEn) }
  }

  return { ...empty, root, attribution, page }
}

/**
 * 归属段文案（面包屑 chip）：全程工具如实标「全程」；单归属/来路=圈号+短名
 * （chip 内无空格，沿既有单归属 chip 形制）；多归属=圈号串+悬浮列名。
 */
export function attributionChipLabel(attr: PageAttribution, locale: PageLocale): { label: string; title: string } {
  const zh = locale === 'zh'
  if (attr.owners.length === 0) {
    return {
      label: zh ? '全程' : 'All stages',
      title: zh ? '跨阶段工具：不隶属单一阶段' : 'All-stage tool: not tied to a single stage',
    }
  }
  if (attr.owners.length === 1) {
    const m = STAGE_META[attr.owners[0] - 1]
    const shortLabel = `${CIRCLED[attr.owners[0] - 1]}${zh ? m.navLabel : m.navLabelEn}`
    if (attr.fromQuery) {
      return { label: shortLabel, title: zh ? `来路阶段：${stageShortLabel(attr.owners[0], locale)}` : `Came from stage: ${stageShortLabel(attr.owners[0], locale)}` }
    }
    return { label: shortLabel, title: zh ? m.title : m.titleEn }
  }
  const names = attr.owners.map(no => stageShortLabel(no, locale)).join(zh ? '、' : ', ')
  return { label: stageCircles(attr.owners), title: zh ? `所属阶段：${names}` : names }
}

// ── 浏览器标签页标题（document.title）────────────────────────────────────────

export const PRODUCT_TITLE = 'AIStudio'

/**
 * 对象级动态标题路由：这些页面自己写 document.title（ChatView 会话标题
 * tabTitle watch / MatrixChatPanel 聊天标题），页面级解析让位——同名双写
 * 必然互踩，边界=路由名单。ChatView 对非会话名也会写产品名（hermes.chat
 * 全族都在其 watch 范围内），故整族登记。
 */
export const OBJECT_TITLED_ROUTE_NAMES: ReadonlySet<string> = new Set([
  'hermes.chat', 'hermes.session', 'desktop.chat',
  'hermes.globalAgent', 'hermes.globalAgentSession',
  'matrix.client', 'matrix.clientRoom',
])

/**
 * 页面级标签页标题：随路由写 `${pageTitle} - ${PRODUCT_TITLE}`。
 * 写入时序=afterEach 后 nextTick（同一导航的组件更新/卸载复位先落地，后拍
 * 写入不被吞）；对象级标题路由跳过。挂点=registries/client/entry.mts
 * （router.isReady 后），返回卸载函数（测试/热替换用）。
 */
export function installPageTitle(
  router: Router,
  opts: { getLocale?: () => PageLocale } = {},
): () => void {
  const getLocale = opts.getLocale ?? (() => 'zh')
  const apply = (to: { name?: unknown; fullPath: string; query?: Record<string, unknown> }): void => {
    const name = String(to.name ?? '')
    if (OBJECT_TITLED_ROUTE_NAMES.has(name)) return
    document.title = `${pageTitle(to, getLocale())} - ${PRODUCT_TITLE}`
  }
  const removeHook = router.afterEach((to) => {
    void nextTick().then(() => apply(to))
  })
  apply(router.currentRoute.value)
  return removeHook
}
