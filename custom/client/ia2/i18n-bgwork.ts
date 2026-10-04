// overlay/custom/client/ia2/i18n-bgwork.ts
// 后台任务执行感知三件套（2026-10-04 用户裁决：驾驶舱对后台任务无感知=失控感，
// 不符合全链路追踪设计）的本地小字典——漂移期 i18n 本地字典通道先例
// （同 custom/governance/i18n.ts 模式：不动 patch 473 locale 单一事实源面）。
export const bgworkMessages = {
  zh: {
    live: '执行中',
    lastActive: '最近产出 {sec}s 前',
    noActivity: '暂无会话活动',
    executingRoutes: '{n} 路执行中',
    runTitle: '推演运行',
    runMeta: '{done}/{total} 段 · 最近完成 {step}',
    updatedAgo: '更新 {sec}s 前',
    stale: '进度已 {min} 分钟未更新',
  },
  en: {
    live: 'live',
    lastActive: 'last output {sec}s ago',
    noActivity: 'no session activity',
    executingRoutes: '{n} in flight',
    runTitle: 'Simulation run',
    runMeta: '{done}/{total} phases · latest {step}',
    updatedAgo: 'updated {sec}s ago',
    stale: 'no progress update for {min} min',
  },
} as const

export type BgworkLocale = typeof bgworkMessages.zh

export function pickBgworkMessages(locale: string | undefined | null): BgworkLocale {
  return String(locale ?? 'zh').startsWith('zh') ? bgworkMessages.zh : bgworkMessages.en
}
