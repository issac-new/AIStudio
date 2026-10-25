import { createRouter, createWebHashHistory } from 'vue-router'
import { features } from '@/custom/features'
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
    // overlay[nav]: 2026-09-18 统一导航——/hermes/cockpit 家族与 6 条搬迁前路径
    // 别名整体退役（三栏已迁 /app/collab，深链由 catch-all 兜底落 /app 总览）。
    // HERMES_CUSTOM[CockpitChatRouteRestore] BEGIN
    // 回归修复（驾驶舱回归 2026-09-22）：统一导航退役 /hermes/chat 家族后，
    // ChatPanel 的 SessionListItem :to="sessionHref()" 与 router.push 仍按
    // hermes.session / hermes.globalAgentSession 命名路由 resolve——路由缺失
    // 致协作中心（/app）与工作台（/app）渲染挂起（No match for hermes.session
    // ×N + parentNode null）。恢复两条命名路由指向 ChatView 修复；path 是
    // 恢复性的（不挂导航），会话深链由 ChatView 读 query/param 自行定位。
    {
      path: '/hermes/chat',
      name: 'hermes.chat',
      component: () => import('@/views/hermes/ChatView.vue'),
    },
    {
      path: '/hermes/session/:sessionId',
      name: 'hermes.session',
      component: () => import('@/views/hermes/ChatView.vue'),
    },
    {
      path: '/hermes/global-agent',
      name: 'hermes.globalAgent',
      component: () => import('@/views/hermes/ChatView.vue'),
    },
    {
      path: '/hermes/global-agent/session/:sessionId',
      name: 'hermes.globalAgentSession',
      component: () => import('@/views/hermes/ChatView.vue'),
    },
    // HERMES_CUSTOM[CockpitChatRouteRestore] END
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
    // overlay[nav]: 统一导航 catch-all——未知/已退役深链（/hermes/loop、
    // /hermes/cockpit 家族等）统一回驾驶舱总览，防白屏
    { path: '/:pathMatch(.*)*', redirect: '/app' },
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

// HERMES_CUSTOM[LazyChunkReload] BEGIN: 懒加载 chunk 拉取失败兜底（2026-10-17 回归轮 D5）。
// vite dev 下深模块图的动态 import 偶发失败一次（网络/transform 竞态），浏览器 ESM
// 模块映射会把失败按 URL 永久缓存——此后每次导航到同路由立即 reject，页面无限
// 「加载中」（实测模型页 ~50% 概率）。处置：识别该类失败做一次整页重载（清失败
// 缓存，重载时 vite 已完成 transform 预热）；sessionStorage 一次性标记防重载风暴。
// 测试态兜底：mock 最小路由器无 onError（模块装载期直炸四测试文件）——能力探测后再挂
if (typeof router.onError === 'function') router.onError((error, to) => {
  const msg = String((error as Error)?.message || '')
  if (!/Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) return
  const key = 'hermes_lazy_reload'
  try {
    if (sessionStorage.getItem(key)) { sessionStorage.removeItem(key); return }
    sessionStorage.setItem(key, '1')
  } catch { /* 隐私模式降级：仍重载一次 */ }
  const target = to?.fullPath || '/'
  window.location.replace(window.location.origin + '/#' + target)
})
// HERMES_CUSTOM[LazyChunkReload] END

router.beforeEach(async (to, _from, next) => {
  // overlay[s3]（补遗⑤）：ekko 配置页与外链分享页默认关（VITE_CUSTOM_EKKO /
  // VITE_CUSTOM_EXTERNAL_LINKS 再开；与 bootstrap externalLinks 摘除同键——router 守卫为第二层防线）
  if (to.meta.ekkoConfig && !features.ekko) { next("/app"); return }
  if ((to.name === "share.groupChat" || to.name === "groupChat.link") && !features.externalLinks) { next("/app"); return }
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
      // overlay[nav]: 默认落点驾驶舱总览 /app（2026-09-18 统一导航裁决；
      // 保留 query.redirect 保真）
      const resolved = resolveLoginRedirect(to.query.redirect)
      next(resolved === '/hermes/chat' ? '/app' : resolved)
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
    // overlay[nav]: 非 superadmin 兜底落驾驶舱总览（与登录默认落点一致）
    next('/app')
    return
  }

  next()
})

export default router
