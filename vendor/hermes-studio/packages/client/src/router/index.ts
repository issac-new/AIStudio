import { createRouter, createWebHashHistory } from 'vue-router'
import { hasApiKey, isStoredSuperAdmin } from '@/api/client'
import { hasDesktopBrowserBridge } from '@/utils/desktop-bridge'
import { resolveLoginRedirect } from '@/utils/login-redirect'
import { captureProviderImport } from '@/utils/provider-import'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/hermes/tasks',
      name: 'hermes.tasks',
      redirect: to => ({ name: 'hermes.chat', query: {
        tasks: '1', taskSearch: to.query.search, taskStatus: to.query.status,
        taskOrder: to.query.order, taskPage: to.query.page,
      } }),
    },
    {
      path: '/desktop-pet',
      name: 'desktop.pet',
      component: () => import('@/views/hermes/DesktopPetView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/share/group-chat/:inviteCode?',
      name: 'share.groupChat',
      component: () => import('@/views/hermes/SharedGroupChatView.vue'),
      meta: { public: true, standaloneChat: true, inviteOnly: true },
    },
    {
      path: '/group-chat-link',
      name: 'groupChat.link',
      component: () => import('@/views/hermes/GroupChatLinkView.vue'),
      meta: { standaloneChat: true },
    },
    // P4 平行共存（2026-09-11）：原有 AI 协作中心（cockpit）恢复——chat/session/
    // history/global-agent/swarm-kanban/matrix-chat 嵌套为其子路由；/app 六区域
    // IA 平行可达，登录默认落点仍为 /app（071 守卫）。
    {
      path: '/hermes/cockpit',
      name: 'hermes.cockpit',
      component: () => import('@/custom/ia2/views/scenes/CollabScene.vue'),
      meta: { fullscreen: true },
      children: [
        {
          path: 'chat',
          name: 'hermes.chat',
          component: () => import('@/views/hermes/ChatView.vue'),
        },
        {
          path: 'session/:sessionId',
          name: 'hermes.session',
          component: () => import('@/views/hermes/ChatView.vue'),
        },
        {
          path: 'history',
          name: 'hermes.history',
          component: () => import('@/views/hermes/HistoryView.vue'),
        },
        {
          path: 'history/session/:sessionId',
          name: 'hermes.historySession',
          component: () => import('@/views/hermes/HistoryView.vue'),
        },
        {
          path: 'global-agent',
          name: 'hermes.globalAgent',
          component: () => import('@/views/hermes/GlobalAgentView.vue'),
        },
        {
          path: 'global-agent/session/:sessionId',
          name: 'hermes.globalAgentSession',
          component: () => import('@/views/hermes/GlobalAgentView.vue'),
        },
        {
          path: 'swarm-kanban',
          name: 'hermes.swarmKanban',
          component: () => import('@/custom/kanban/views/SwarmKanbanView.vue'),
        },
        {
          path: 'matrix-chat',
          name: 'hermes.matrixChat',
          component: () => import('@/custom/matrix-chat/views/MatrixChatView.vue'),
        },
        {
          path: 'matrix-chat/room/:roomId',
          name: 'hermes.matrixChatRoom',
          component: () => import('@/custom/matrix-chat/views/MatrixChatView.vue'),
        },
      ],
    },
    // 2026-09-12 审查：系统通知/外部深链仍使用搬迁前绝对路径（GlobalPendingActions
    // pendingSourceClickUrl → completion-notification hash 导航），补路径别名——
    // name 归 cockpit 子路由所有，别名仅 path 级兼容。
    { path: '/hermes/chat', component: () => import('@/views/hermes/ChatView.vue') },
    { path: '/hermes/session/:sessionId', component: () => import('@/views/hermes/ChatView.vue') },
    { path: '/hermes/history', component: () => import('@/views/hermes/HistoryView.vue') },
    { path: '/hermes/history/session/:sessionId', component: () => import('@/views/hermes/HistoryView.vue') },
    { path: '/hermes/global-agent', component: () => import('@/views/hermes/GlobalAgentView.vue') },
    { path: '/hermes/global-agent/session/:sessionId', component: () => import('@/views/hermes/GlobalAgentView.vue') },
    {
      path: '/desktop-chat/:sessionId',
      name: 'desktop.chat',
      component: () => import('@/views/hermes/ChatView.vue'),
      meta: { standaloneChat: true },
    },
    {
      path: '/hermes/jobs',
      name: 'hermes.jobs',
      component: () => import('@/views/hermes/JobsView.vue'),
      meta: { hermesConfig: true },
    },
    {
      path: '/hermes/kanban',
      name: 'hermes.kanban',
      component: () => import('@/views/hermes/KanbanView.vue'),
      meta: { hermesConfig: true },
    },
    // overlay[command-post]: 2.13 恢复 workflow 路由（071 曾删除；审批深链
    // GlobalPendingActions 一直指向它，跨团队工作流审批需要可用入口）
    {
      path: '/hermes/workflow',
      name: 'hermes.workflow',
      component: () => import('@/views/hermes/WorkflowView.vue'),
    },
    {
      path: '/hermes/models',
      name: 'hermes.models',
      component: () => import('@/views/hermes/ChatView.vue'),
    },
    {
      path: '/hermes/api-relay',
      name: 'hermes.apiRelay',
      component: () => import('@/views/hermes/ApiRelayView.vue'),
    },
    {
      path: '/hermes/profiles',
      name: 'hermes.profiles',
      component: () => import('@/views/hermes/ProfilesView.vue'),
      meta: { requiresSuperAdmin: true },
    },
    {
      path: '/hermes/logs',
      name: 'hermes.logs',
      component: () => import('@/views/hermes/LogsView.vue'),
    },
    {
      path: '/hermes/usage',
      name: 'hermes.usage',
      component: () => import('@/views/hermes/UsageView.vue'),
    },
    {
      path: '/hermes/performance',
      name: 'hermes.performance',
      component: () => import('@/views/hermes/PerformanceView.vue'),
      meta: { requiresSuperAdmin: true },
    },
    {
      path: '/hermes/journey',
      name: 'hermes.journey',
      component: () => import('@/views/hermes/JourneyView.vue'),
      meta: { hermesConfig: true },
    },
    {
      path: '/hermes/skills-usage',
      name: 'hermes.skillsUsage',
      component: () => import('@/views/hermes/SkillsUsageView.vue'),
    },
    {
      path: '/hermes/skills',
      name: 'hermes.skills',
      component: () => import('@/views/hermes/SkillsView.vue'),
      meta: { hermesConfig: true },
    },
    {
      path: '/hermes/plugins',
      name: 'hermes.plugins',
      component: () => import('@/views/hermes/PluginsView.vue'),
      meta: { hermesConfig: true },
    },
    {
      path: '/hermes/petdex',
      name: 'hermes.petdex',
      component: () => import('@/views/hermes/PetdexView.vue'),
    },
    {
      path: '/hermes/memory',
      name: 'hermes.memory',
      component: () => import('@/views/hermes/MemoryView.vue'),
      meta: { hermesConfig: true },
    },
    {
      path: '/hermes/config/settings',
      name: 'hermes.configSettings',
      component: () => import('@/views/hermes/HermesSettingsView.vue'),
      meta: { hermesConfig: true },
    },
    {
      path: '/hermes/settings',
      name: 'hermes.settings',
      component: () => import('@/views/hermes/SettingsView.vue'),
    },
    {
      path: '/hermes/theme',
      name: 'hermes.theme',
      component: () => import('@/views/hermes/ThemeView.vue'),
    },
    {
      path: '/hermes/channels',
      name: 'hermes.channels',
      component: () => import('@/views/hermes/ChannelsView.vue'),
      meta: { hermesConfig: true },
    },
    {
      path: '/social-messages',
      redirect: {
        name: 'hermes.connections',
        query: { view: 'messages' },
      },
    },
    {
      path: '/hermes/terminal',
      name: 'hermes.terminal',
      component: () => import('@/views/hermes/TerminalView.vue'),
      meta: { requiresSuperAdmin: true },
    },
    {
      path: '/hermes/connections',
      name: 'hermes.connections',
      component: () => import('@/views/hermes/ChatView.vue'),
    },
    {
      path: '/studio/agents',
      name: 'hermes.agentManager',
      component: () => import('@/views/hermes/ChatView.vue'),
      meta: { requiresSuperAdmin: true },
    },
    {
      path: '/studio/agents/:agentId/:section(skills|mcp|settings|plugins|presets)',
      name: 'codingAgent.config',
      component: () => import('@/views/hermes/CodingAgentConfigView.vue'),
      meta: { codingAgentConfig: true, requiresSuperAdmin: true },
    },
    {
      path: '/ekko/memory',
      name: 'ekko.memory',
      component: () => import('@/views/ekko/MemoryView.vue'),
      meta: { ekkoConfig: true, requiresSuperAdmin: true },
    },
    {
      path: '/ekko/skills',
      name: 'ekko.skills',
      component: () => import('@/views/ekko/SkillsView.vue'),
      meta: { ekkoConfig: true, requiresSuperAdmin: true },
    },
    {
      path: '/ekko/mcp',
      name: 'ekko.mcp',
      component: () => import('@/views/ekko/McpView.vue'),
      meta: { ekkoConfig: true, requiresSuperAdmin: true },
    },
    {
      path: '/ekko/settings',
      name: 'ekko.settings',
      component: () => import('@/views/ekko/SettingsView.vue'),
      meta: { ekkoConfig: true, requiresSuperAdmin: true },
    },
    {
      path: '/hermes/agents',
      redirect: { name: 'hermes.agentManager' },
    },
    // overlay[command-post]: 2.13 恢复 group-chat 路由（071 曾删除；服务端
    // 多 agent 群聊一直在线、groupStore 已连，cockpit 需要原生跨团队会话面）
    {
      path: '/hermes/group-chat',
      name: 'hermes.groupChat',
      component: () => import('@/views/hermes/GroupChatView.vue'),
    },
    {
      path: '/hermes/group-chat/room/:roomId',
      name: 'hermes.groupChatRoom',
      component: () => import('@/views/hermes/GroupChatView.vue'),
    },
    {
      path: '/hermes/history/group-chat/:roomId',
      redirect: to => ({
        name: 'hermes.groupChatRoom',
        params: { roomId: to.params.roomId },
      }),
    },
    {
      path: '/hermes/group-chat/history/:roomId',
      redirect: to => ({
        name: 'hermes.groupChatRoom',
        params: { roomId: to.params.roomId },
      }),
    },
    {
      path: '/hermes/files',
      name: 'hermes.files',
      component: () => import('@/views/hermes/FilesView.vue'),
    },
    {
      path: '/hermes/coding-agents',
      redirect: { name: 'hermes.agentManager' },
    },
    {
      path: '/hermes/version-preview',
      name: 'hermes.versionPreview',
      component: () => import('@/views/hermes/VersionPreviewView.vue'),
      meta: { requiresSuperAdmin: true },
    },
    {
      path: '/hermes/mcp',
      name: 'hermes.mcp',
      component: () => import('@/views/hermes/McpManagerView.vue'),
      meta: { hermesConfig: true },
    },
  ],
})

// Desktop exposes a dedicated settings page. Actual browsing stays inside the
// chat tool panel so this route never creates or positions a WebContentsView.
if (hasDesktopBrowserBridge()) {
  router.addRoute({
    path: '/hermes/browser',
    name: 'hermes.browser',
    component: () => import('@/views/hermes/DesktopBrowserView.vue'),
  })
}

async function ensureDesktopAuth(): Promise<void> {
  if (hasApiKey()) return
  const bridge = (window as typeof window & {
    hermesDesktop?: { isDesktop?: boolean; ensureAuth?: () => Promise<boolean> }
  }).hermesDesktop
  if (bridge?.isDesktop === true && bridge.ensureAuth) {
    await bridge.ensureAuth().catch(() => false)
  }
}

function isDesktopShell(): boolean {
  return (window as typeof window & {
    hermesDesktop?: { isDesktop?: boolean }
  }).hermesDesktop?.isDesktop === true
}

router.beforeEach(async (to, _from, next) => {
  if (to.path === '/hermes/models' && Object.prototype.hasOwnProperty.call(to.query, 'importProvider')) {
    captureProviderImport(to.query.importProvider)
    const query = { ...to.query }
    delete query.importProvider
    // Replace before auth redirects; the credential-bearing fragment never
    // becomes a persisted login redirect or a server request query.
    next({ path: to.path, query, replace: true })
    return
  }
  await ensureDesktopAuth()

  if (to.name === 'codingAgent.config' && ['plugins', 'presets'].includes(String(to.params.section)) && to.params.agentId !== 'dsh') {
    next({ name: 'codingAgent.config', params: { ...to.params, section: 'settings' }, replace: true })
    return
  }

  // Public pages don't need auth
  if (to.meta.public) {
    // Already has key, skip login
    if (to.name === 'login' && hasApiKey() && !isDesktopShell()) {
      // overlay[ide]: 默认跳 IDE 工作台（/ide，而非上游的 /hermes/chat）；
      // 保留 query.redirect 保真。2026-09-16 用户裁决：登录默认落点改为 IDE。
      const resolved = resolveLoginRedirect(to.query.redirect)
      next(resolved === '/hermes/chat' ? '/ide' : resolved)
      return
    }
    next()
    return
  }

  // All other pages require token
  if (!hasApiKey()) {
    next({ name: 'login', query: { redirect: to.fullPath } })
    return
  }

  if (to.meta.requiresSuperAdmin && !isStoredSuperAdmin()) {
    // overlay[ide]: 非 superadmin 兜底落 IDE 工作台（与登录默认落点一致）
    next('/ide')
    return
  }

  next()
})

export default router
