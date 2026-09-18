// overlay/custom/client/ia2/views/scenes/collab-embed-routes.ts
// 协作场景右栏嵌入路由词表（单一事实源，2026-09-18 统一导航重构 Task 3）：
// CollabScene 用它判定右栏显示 <router-view>（嵌入 app 页）还是 cockpit 原生
// 工作区；CockpitModeBar 用同一集合做 Chat 高亮与「回跳场景首页」判定。
// 词表 = ia2.collab* 六个子路由（chat/session/history/global-agent × 列表/详情）
// + 保留集 hermes.groupChat/groupChatRoom/workflow（顶层路由仍在，历史上嵌入
// cockpit 右栏渲染；matrix/swarmKanban 已分别迁 ia2.comms* / ia2.tasks，不入表）。

/** 嵌入右栏的路由名集合 */
export const COLLAB_EMBED_ROUTE_NAMES: ReadonlySet<string> = new Set([
  'ia2.collabChat',
  'ia2.collabSession',
  'ia2.collabHistory',
  'ia2.collabHistorySession',
  'ia2.collabGlobalAgent',
  'ia2.collabGlobalAgentSession',
  'hermes.groupChat',
  'hermes.groupChatRoom',
  'hermes.workflow',
])

/** 路由名是否为协作场景嵌入页（右栏 <router-view> 渲染判定） */
export function isCollabEmbedRoute(name: string | null | undefined): boolean {
  return name != null && COLLAB_EMBED_ROUTE_NAMES.has(name)
}
