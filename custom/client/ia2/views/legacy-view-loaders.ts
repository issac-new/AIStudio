/** 收编页视图装载表（路由名 → 懒加载工厂；与 routes.ts 收编记录一一对应）
 * 2026-10-16 走查三修：抽共享模块——侧栏悬停预取与壳空闲预热共用此表。 */
export const VIEW_LOADERS: Record<string, () => Promise<unknown>> = {
  'hermes.settings': () => import('@/views/hermes/SettingsView.vue'),
  // ChatView 族（页面内自持会话列/页签；路径不变 → ChatView 按 path 分派行为不变）
  'hermes.chat': () => import('@/views/hermes/ChatView.vue'),
  'hermes.session': () => import('@/views/hermes/ChatView.vue'),
  'hermes.globalAgent': () => import('@/views/hermes/ChatView.vue'),
  'hermes.globalAgentSession': () => import('@/views/hermes/ChatView.vue'),
  'hermes.models': () => import('@/views/hermes/ChatView.vue'),
  'hermes.connections': () => import('@/views/hermes/ChatView.vue'),
  'hermes.agentManager': () => import('@/views/hermes/ChatView.vue'),
  'hermes.groupChat': () => import('@/views/hermes/GroupChatView.vue'),
  'hermes.groupChatRoom': () => import('@/views/hermes/GroupChatView.vue'),
  // 工具/配置/系统页（上游独立视图）
  'hermes.workflow': () => import('@/views/hermes/WorkflowView.vue'),
  'hermes.files': () => import('@/views/hermes/FilesView.vue'),
  'hermes.skills': () => import('@/views/hermes/SkillsView.vue'),
  'hermes.plugins': () => import('@/views/hermes/PluginsView.vue'),
  'hermes.mcp': () => import('@/views/hermes/McpManagerView.vue'),
  'hermes.memory': () => import('@/views/hermes/MemoryView.vue'),
  'hermes.channels': () => import('@/views/hermes/ChannelsView.vue'),
  'hermes.jobs': () => import('@/views/hermes/JobsView.vue'),
  'hermes.kanban': () => import('@/views/hermes/KanbanView.vue'),
  'hermes.journey': () => import('@/views/hermes/JourneyView.vue'),
  'hermes.logs': () => import('@/views/hermes/LogsView.vue'),
  'hermes.usage': () => import('@/views/hermes/UsageView.vue'),
  'hermes.performance': () => import('@/views/hermes/PerformanceView.vue'),
  'hermes.profiles': () => import('@/views/hermes/ProfilesView.vue'),
  'hermes.theme': () => import('@/views/hermes/ThemeView.vue'),
  'hermes.petdex': () => import('@/views/hermes/PetdexView.vue'),
  'hermes.skillsUsage': () => import('@/views/hermes/SkillsUsageView.vue'),
  'hermes.configSettings': () => import('@/views/hermes/HermesSettingsView.vue'),
  'hermes.terminal': () => import('@/views/hermes/TerminalView.vue'),
  'hermes.versionPreview': () => import('@/views/hermes/VersionPreviewView.vue'),
}

// ── 预取（走查三修：侧栏迟钝根治——冷首访编译/分片拉取移到悬停与空闲期）──
const warmed = new Set<string>()

/** 悬停/聚焦预取单页：点击前把懒分片拉热（dev=预编译，prod=预下载）；记忆化零重复。 */
export function prefetchLegacyView(name: string): void {
  const loader = VIEW_LOADERS[name]
  if (!loader || warmed.has(name)) return
  warmed.add(name)
  void loader().catch(() => warmed.delete(name))
}

/** 空闲预热全表（壳挂载后由 IaLegacyShell 调用）：错峰 200ms 逐个拉热，
 * 后台把所有设置页分片备好——任何侧栏点击都是热路径。 */
export function warmAllLegacyViews(): void {
  const names = Object.keys(VIEW_LOADERS)
  names.forEach((name, i) => setTimeout(() => prefetchLegacyView(name), 600 + i * 200))
}
