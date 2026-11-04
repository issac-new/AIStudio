// overlay/custom/client/projects/utils.ts
// 视图纯函数（可测面）：状态徽标 class 映射 / 操作按钮可用矩阵 / byStatus
// 分布行 / timeline 倒序。视图层只消费不复制这些判定（单一事实源）。
import type { ProjectStatus, ProjectTaskStats, ProjectTimelineEvent } from './api/projects'

/** 状态徽标 class 后缀（配色在视图 CSS 用 ia2 状态 token：active 绿/paused 黄/completed 灰） */
export type StatusBadgeClass = 'prj-badge--active' | 'prj-badge--paused' | 'prj-badge--completed'

export function statusBadgeClass(status: ProjectStatus): StatusBadgeClass {
  if (status === 'active') return 'prj-badge--active'
  if (status === 'paused') return 'prj-badge--paused'
  return 'prj-badge--completed'
}

/** 状态文案（zh/en 双语；未知值不出现——类型收窄为三态字面量） */
export function statusLabel(status: ProjectStatus, locale: 'zh' | 'en'): string {
  const zh = status === 'active' ? '进行中' : status === 'paused' ? '已暂停' : '已完成'
  const en = status === 'active' ? 'Active' : status === 'paused' ? 'Paused' : 'Completed'
  return locale === 'zh' ? zh : en
}

export interface ProjectActionAvailability {
  pause: boolean
  resume: boolean
  complete: boolean
}

/**
 * 操作按钮可用矩阵：pause 仅 active；resume 仅 paused；complete 非 completed
 * （paused 项目仍可清算收口——完成闸在服务端按未终结任务把守，不在前端预判）。
 */
export function actionAvailability(status: ProjectStatus): ProjectActionAvailability {
  return {
    pause: status === 'active',
    resume: status === 'paused',
    complete: status !== 'completed',
  }
}

export interface DistributionRow {
  status: string
  count: number
}

/** byStatus → 确定序分布行（计数降序、同数按状态字典序；列表与详情同序） */
export function distributionRows(byStatus: Record<string, number>): DistributionRow[] {
  return Object.entries(byStatus)
    .map(([status, count]) => ({ status, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count || (a.status < b.status ? -1 : a.status > b.status ? 1 : 0))
}

export interface DistributionSegment extends DistributionRow {
  /** 0-1 占比；total=0 时各段 0（视图据此不渲染条） */
  share: number
}

/** 堆叠条段：share=count/total（total≤0 全 0，不猜分布） */
export function distributionSegments(stats: ProjectTaskStats): DistributionSegment[] {
  const total = Number(stats?.total) || 0
  return distributionRows(stats?.byStatus ?? {}).map(row => ({
    ...row,
    share: total > 0 ? row.count / total : 0,
  }))
}

/** timeline 倒序（at 降序、同刻稳定保序；不变异入参） */
export function timelineDescending(events: ProjectTimelineEvent[]): ProjectTimelineEvent[] {
  return [...events].sort((a, b) => b.at - a.at)
}

/** epoch ms → 本地时间串（列表/详情/timeline 共用一处格式） */
export function formatEpochTime(at: number, locale: 'zh' | 'en'): string {
  const d = new Date(at)
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { hour12: false })
    : String(at)
}

// --- 拓扑折叠区状态机（纯函数供测试；视图只消费不复制判定） ---

/** 折叠区状态：idle 未加载 / loading 拉取+渲染中 / ok iframe 可显 / fallback
 *  品牌渲染不支持或失败（回退显 mermaid 源文本）/ error 拓扑本身拉取失败。 */
export interface TopologyPanelState {
  open: boolean
  status: 'idle' | 'loading' | 'ok' | 'fallback' | 'error'
  /** 品牌 HTML（ok 态；iframe srcdoc 用，经 wrapGenUiHtml 加固） */
  html?: string
  /** 源文本（fallback 态兜底展示，内容不丢） */
  source?: string
  note?: string
}

export type TopologyPanelEvent =
  | { type: 'toggle' }
  | { type: 'load-start'; source?: string }
  | { type: 'load-ok'; html: string }
  | { type: 'load-fallback'; source?: string; note?: string }
  | { type: 'load-error'; note?: string }

export const TOPOLOGY_PANEL_INITIAL: TopologyPanelState = { open: false, status: 'idle' }

/**
 * 折叠区状态转移（纯函数）：
 * - toggle 只翻 open，不动加载事实——折叠再展开不重拉（html/source 保留）。
 * - load-start 记录当次源文本（无论后续成败，源都不丢）。
 * - collapse 后再 toggle 回来：status 保持已加载态，视图据此跳过重复加载。
 */
export function topologyPanelNext(state: TopologyPanelState, event: TopologyPanelEvent): TopologyPanelState {
  switch (event.type) {
    case 'toggle':
      return { ...state, open: !state.open }
    case 'load-start':
      return { ...state, status: 'loading', ...(event.source !== undefined ? { source: event.source } : {}) }
    case 'load-ok':
      return { ...state, status: 'ok', html: event.html, note: undefined }
    case 'load-fallback':
      return {
        ...state,
        status: 'fallback',
        html: undefined,
        ...(event.source !== undefined ? { source: event.source } : {}),
        ...(event.note ? { note: event.note } : { note: undefined }),
      }
    case 'load-error':
      return { ...state, status: 'error', html: undefined, ...(event.note ? { note: event.note } : { note: undefined }) }
  }
}

/** 折叠区展开且未加载过（idle）→ 需要触发一次加载（视图 watch 用） */
export function topologyNeedsLoad(state: TopologyPanelState): boolean {
  return state.open && state.status === 'idle'
}
