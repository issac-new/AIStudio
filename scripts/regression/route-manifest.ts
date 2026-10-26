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
  // externalLinks 默认关闭时，router guard 将公开外链送回 /app。
  'share.groupChat', 'groupChat.link',
])

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
    const [{ registerEval }, { registerBpa }, { registerOntology }, { registerSkillgov }] = await Promise.all([
      import('../../custom/client/eval'),
      import('../../custom/client/bpa'),
      import('../../custom/client/ontology'),
      import('../../custom/client/skillgov'),
    ])
    registrations.push(registerEval())
    if (features.bpa) registrations.push(registerBpa())
    if (features.ontology) registrations.push(registerOntology())
    if (features.skillgov) registrations.push(registerSkillgov())
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
        allowBlank: record.name === 'desktop.pet' && !features.pet,
      }))
    const stagePaths: Record<number, string> = {
      1: '/app/stage/setup', 2: '/app/stage/reqs', 3: '/app/stage/design',
      4: '/app/stage/build', 5: '/app/stage/accept', 6: '/app/stage/govern',
    }
    const stageTabs = Object.entries(STAGE_TABS).flatMap(([stage, tabs]) =>
      tabs.map(tab => ({
        name: `ia2.stage${stage}`,
        stage: Number(stage),
        key: tab.key,
        path: stagePaths[Number(stage)],
        visitPath: `${stagePaths[Number(stage)]}?tab=${encodeURIComponent(tab.key)}`,
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
