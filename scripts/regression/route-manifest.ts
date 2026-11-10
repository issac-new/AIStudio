// 由当前路由注册链生成只读走查清单；禁止在此维护第二份路由数组。
import { JSDOM } from 'jsdom'
import { buildIaRoutes } from '../../custom/client/ia2/routes'
import { buildIdeRoutes } from '../../custom/client/ide/routes'
import { STAGE_TABS } from '../../custom/client/ia2/stage-tabs'
import { features } from '../../config/features'

const PARAM_VALUES: Record<string, string> = {
  sessionId: 'walkthrough-missing-session',
  runId: 'walkthrough-missing-run',
  loopId: 'walkthrough-missing-loop',
  roomId: '!walkthrough:matrix.test',
  agentId: 'codex',
  section: 'settings',
  pathMatch: 'walkthrough-not-found',
  rest: 'legacy',
}

const CANONICAL_PAGES = new Set([
  // ChatView/HistoryView/GroupChatView 对不存在的占位资源会回列表或现有对象。
  'ia2.collabSession', 'ia2.collabHistory', 'ia2.collabHistorySession',
  'ia2.collabGlobalAgentSession', 'ia2.groupRoom', 'hermes.session',
  'hermes.globalAgentSession', 'hermes.groupChatRoom', 'desktop.chat',
  // 群聊列表页无房参时 canonical 跳到首个真实房间（2026-10-31 录屏轮实锤，
  // 走查占位房号被改道是合法产品行为，非缺陷）。
  'hermes.groupChat',
  // externalLinks 默认关闭时，router guard 将公开外链送回 /app。
  'share.groupChat', 'groupChat.link',
])

// expected 声明面（2026-11-04 Windows 离线回归批固化判定口径，spec
// 2026-11-04-win-regression-p1-fixes）：按路由名声明「设计内失败」类别——
// roleGate=角色门 401/403；failClosed=环境变量未配置的 503；negative404=占位
// 资源负向用例；offline=外部依赖不可达 5xx。walk-routes 对命中类别的失败请求
// 记 WARN 留痕而非 defect（与既有 URL 级白名单并联，全局模式仍覆盖未声明处）。
const EXPECT_BY_NAME: Record<string, ('roleGate' | 'failClosed' | 'negative404' | 'offline')[]> = {
  // /api/auth/locked-ips 仅 super_admin（回归六-4：admin 403 属角色门非缺陷）
  'hermes.settings': ['roleGate'],
  // OBS_SIM_ROOT 未配置时 sim 面 fail-closed 503（回归二-3：子路由同源）
  'ia2.sim': ['failClosed'],
  'ia2.simSupervision': ['failClosed'],
  'ia2.simOps': ['failClosed'],
  'ia2.simEvidence': ['failClosed'],
  'ia2.simDelivery': ['failClosed'],
  'ia2.simTrace': ['failClosed'],
  'ia2.simSettings': ['failClosed'],
  'ia2.simOrchestration': ['failClosed'],
  'ia2.simMap': ['failClosed'],
  'ia2.simDirectorRun': ['failClosed'],
  // /app/s/chat 走查态拉 sim topology，同 fail-closed 源（回归二-5）
  'ia2.collabChat': ['failClosed'],
  // loop 详情用占位 loopId（walkthrough-missing-loop），404 为正确负向语义（回归二-6）
  'ia2.loopCanvas': ['negative404'],
}

function materializePath(path: string): string {
  const visitPath = path.replace(/:([A-Za-z0-9_]+)(?:\([^)]*\))?([?*]?)/g, (_match, key: string, modifier: string) => {
    if (modifier === '?') return ''
    return PARAM_VALUES[key] ?? `walkthrough-missing-${key}`
  })
  return visitPath.replace(/\/$/, '') || '/'
}

async function main(): Promise<void> {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
  const globals = globalThis as any
  globals.window = dom.window
  globals.document = dom.window.document
  globals.location = dom.window.location
  globals.history = dom.window.history
  globals.localStorage = dom.window.localStorage
  globals.sessionStorage = dom.window.sessionStorage

  // 注册函数会打印启动日志；stdout 只保留可机读的 JSON。
  const log = console.log
  console.log = () => {}
  try {
    const [{ default: router }, { getRegisteredRoutes }] = await Promise.all([
      import('@/router'),
      import('../../registries/client'),
    ])
    for (const record of buildIaRoutes()) router.addRoute(record)
    if (features.ide) {
      for (const record of buildIdeRoutes()) router.addRoute(record)
    } else {
      router.addRoute({ path: '/ide', redirect: '/app' })
      router.addRoute({ path: '/app/ide', redirect: '/app' })
      router.addRoute({ path: '/app/ide/:rest(.*)', redirect: '/app' })
    }

    const registrations: Array<Promise<void>> = []
    const [{ registerEval }, { registerBpa }, { registerOntology }, { registerSkillgov }, { registerProjects }] = await Promise.all([
      import('../../custom/client/eval'),
      import('../../custom/client/bpa'),
      import('../../custom/client/ontology'),
      import('../../custom/client/skillgov'),
      import('../../custom/client/projects'),
    ])
    registrations.push(registerEval())
    if (features.bpa) registrations.push(registerBpa())
    if (features.ontology) registrations.push(registerOntology())
    if (features.skillgov) registrations.push(registerSkillgov())
    // 与 registries/client/bootstrap.ts 同链：项目列表和详情是无开关的默认能力。
    registrations.push(registerProjects())
    await Promise.all(registrations)
    for (const record of getRegisteredRoutes()) router.addRoute(record)
    if (features.matrixChat) {
      const { registerMatrixChatRoutes } = await import('../../custom/client/matrix-chat')
      registerMatrixChatRoutes(router)
    }

    const routes = router.getRoutes()
      .filter(record => record.name !== 'ia2.shell')
      .map(record => ({
        name: String(record.name ?? ''),
        path: record.path,
        visitPath: materializePath(record.path),
        kind: record.redirect ? 'redirect' : 'page',
        public: Boolean(record.meta?.public),
        requiresSuperAdmin: Boolean(record.meta?.requiresSuperAdmin),
        allowCanonical: CANONICAL_PAGES.has(String(record.name ?? '')),
        allowQuery: record.name === 'hermes.models',
        allowBlank: (record.name === 'desktop.pet' && !features.pet)
          // matrix 客户端两页在无已连接 Matrix 会话的走查环境＝访客态（element-web
          // 未认证提示/占位房号空壳），合法空态；内容验收须专项轮带真实会话
          // （2026-11-02 全功能回归轮定性，spec 2026-11-02-full-regression-fixes）。
          || record.name === 'matrix.client' || record.name === 'matrix.clientRoom',
        expect: EXPECT_BY_NAME[String(record.name ?? '')] ?? [],
      }))
    const stagePaths: Record<number, string> = {
      1: '/app/stage/setup', 2: '/app/stage/reqs', 3: '/app/stage/design',
      4: '/app/stage/build', 5: '/app/stage/accept', 6: '/app/stage/govern',
    }
    // stage6（govern）走查态 ORGLOOP_LEDGER_TSV 未配置 → orgloop ledger 503
    // fail-closed（回归二-1 同源，声明面与路由同口径）。
    const STAGE_EXPECT: Record<number, ('roleGate' | 'failClosed' | 'negative404' | 'offline')[]> = { 6: ['failClosed'] }
    const stageTabs = Object.entries(STAGE_TABS).flatMap(([stage, tabs]) =>
      tabs.map(tab => ({
        name: `ia2.stage${stage}`,
        stage: Number(stage),
        key: tab.key,
        path: stagePaths[Number(stage)],
        visitPath: `${stagePaths[Number(stage)]}?tab=${encodeURIComponent(tab.key)}`,
        expect: STAGE_EXPECT[Number(stage)] ?? [],
      })),
    )
    const manifest = {
      routes,
      stageTabs,
      featureGates: { ...features },
      counts: {
        routes: routes.length,
        pages: routes.filter(r => r.kind === 'page').length,
        redirects: routes.filter(r => r.kind === 'redirect').length,
        stageTabs: stageTabs.length,
        visitStates: routes.length + stageTabs.length,
      },
    }
    console.log = log
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
  } finally {
    console.log = log
  }
}

await main()
