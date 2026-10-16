// overlay/custom/client/ia2/nav-centers.ts
// 三中心一级导航单一事实源（A0，2026-10-16 三中心重构）：
// [工作台 /app] [推演中心 /app/sim] [治理中心 /app/gov] 入口表 + 高亮判定
// 纯函数 centerForPath + 岛屿入口组（IDE/BPA/本体/评测/技能治理，右侧收纳）。
// 设计锚=docs/superpowers/specs/2026-10-16-workbench-detailed-design.md 屏 0；
// 需求锚 R8（导航按关注面归位：当日工作/一轮推演/治理问责分开）。
// 路由纪律：全部消费既有路由记录（ia2.collab / ia2.sim / ia2.governance 与
// 岛屿各名），本模块不注册不改动路由；/app/gov 在 C1 升格前仍是既有重定向
// （落 /app/board?tab=gov-org 进治理内容），治理中心入口先经重定向，
// C1 后直达七签壳，此处零改动。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export type CenterKey = 'workbench' | 'sim' | 'gov'

export interface CenterNavMeta {
  key: CenterKey
  /** 既有路由名（vue-router push 按名跳；不新增路由） */
  name: string
  /** 中心首页路径（centerForPath 判定词表的正例锚） */
  path: string
  labelZh: string
  labelEn: string
}

/** 三中心入口（顺序即顶栏渲染序） */
export const CENTER_NAVS: readonly CenterNavMeta[] = [
  { key: 'workbench', name: 'ia2.collab', path: '/app', labelZh: '工作台', labelEn: 'Workbench' },
  { key: 'sim', name: 'ia2.sim', path: '/app/sim', labelZh: '推演中心', labelEn: 'Simulation Center' },
  { key: 'gov', name: 'ia2.governance', path: '/app/gov', labelZh: '治理中心', labelEn: 'Governance Center' },
]

/**
 * 路径 → 当前中心 key（高亮判定纯函数）。/app 家族按前缀归工作台，
 * 但 /app/sim*、/app/gov* 更长前缀先判；非 /app 家族（IDE 侧 / 上游壳页）
 * 返回 null。段边界匹配：/app/simulation 不误判为推演中心。
 */
export function centerForPath(path: string): CenterKey | null {
  if (path === '/app/sim' || path.startsWith('/app/sim/')) return 'sim'
  if (path === '/app/gov' || path.startsWith('/app/gov/')) return 'gov'
  if (path === '/app' || path.startsWith('/app/')) return 'workbench'
  return null
}

/** 岛屿入口（顶栏右侧收纳；路由既有，功能开关由挂载方按 featureKey 门控）。
 *  字段名用 name（vue-router 跳转目标，与 CenterNavMeta.name 同语义）——
 *  i18n 覆盖守门按 `name: 'ia2.*'` 语境豁免路由名，非文案键不进词表。 */
export interface IslandNavMeta {
  testid: string
  /** 既有路由名 */
  name: string
  /** config/features.ts 开关键（与 FlowNavPanel 各 NavEntry 门控同源） */
  featureKey: 'ide' | 'bpa' | 'ontology' | 'eval' | 'skillgov'
  labelZh: string
  labelEn: string
}

export const ISLAND_NAVS: readonly IslandNavMeta[] = [
  { testid: 'ia-nav-island-ide', name: 'ide.shell', featureKey: 'ide', labelZh: 'IDE', labelEn: 'IDE' },
  { testid: 'ia-nav-island-bpa', name: 'ia2.bpa', featureKey: 'bpa', labelZh: 'BPA', labelEn: 'BPA' },
  { testid: 'ia-nav-island-ontology', name: 'ia2.ontology', featureKey: 'ontology', labelZh: '本体', labelEn: 'Ontology' },
  { testid: 'ia-nav-island-eval', name: 'ia2.eval', featureKey: 'eval', labelZh: '评测', labelEn: 'Eval' },
  { testid: 'ia-nav-island-skillgov', name: 'ia2.skillgov', featureKey: 'skillgov', labelZh: '技能治理', labelEn: 'Skill Gov' },
]

/** 顶栏词条 locale（响应式跟随；同 i18n-tasks-tabs 小字典先例，不读 473 树） */
export function useCenterNavLocale() {
  const i18nCtx = useI18n()
  return computed<'zh' | 'en'>(() => {
    const loc = String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh')
    return loc.startsWith('zh') ? 'zh' : 'en'
  })
}
