// 全功能只读走查：路由由 route-manifest.ts 从真实注册链生成。
// 用法：node scripts/regression/walk-routes.mjs [routeFilterRegex]
// 仅输出清单：node scripts/regression/walk-routes.mjs --manifest
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openBrowser, bootApp, gotoHash, clearMasks, Ledger, SHOTS } from './harness.mjs'
import { canonicalBounced, isBlankContent, isLateRequest, routeSettled } from './walkthrough-probes.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const RAW_KEY_RE = /\b(?:ia2|common|approvals|ide|ma|chat|settings|nav)[.][a-zA-Z0-9_.]+\b/
const args = process.argv.slice(2)

function loadManifest() {
  const result = spawnSync(process.execPath, [
    `${ROOT}node_modules/vite-node/vite-node.mjs`,
    '--config', `${ROOT}vitest.config.ts`,
    `${ROOT}scripts/regression/route-manifest.ts`,
  ], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })
  if (result.status !== 0) throw new Error(`路由清单生成失败: ${result.stderr || result.stdout}`)
  return JSON.parse(result.stdout)
}

function slug(value) {
  return String(value).replace(/^ia2\./, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110)
}

function safeUrl(raw) {
  try {
    const url = new URL(raw)
    for (const key of url.searchParams.keys()) {
      if (/token|key|secret|password|credential/i.test(key)) url.searchParams.set(key, 'REDACTED')
    }
    return url.toString().slice(0, 260)
  } catch {
    return String(raw).split('?')[0].slice(0, 260)
  }
}

function safeText(value) {
  return String(value).replace(/([?&](?:token|key|secret|password|credential)=[^&\s]+)/gi, 'REDACTED').slice(0, 320)
}

async function currentRoute(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#app')
    return el?.__vue_app__?.config?.globalProperties?.$router?.currentRoute?.value?.fullPath || location.hash.slice(1)
  })
}

async function waitForRoute(page, visit) {
  const expected = `/${visit.visitPath.replace(/^\//, '')}`
  await page.waitForFunction(({ expected, kind, allowAny, allowCanonical, allowQuery }) => {
    const el = document.querySelector('#app')
    let current = el?.__vue_app__?.config?.globalProperties?.$router?.currentRoute?.value?.fullPath
    let browser = location.hash.slice(1)
    if (!current || document.body?.innerText?.includes('AIStudio 加载中')) return false
    if (allowAny) return true
    if (allowQuery) {
      current = current.split('?')[0]
      browser = browser.split('?')[0]
      expected = expected.split('?')[0]
    }
    if (kind === 'redirect') return current !== expected && browser !== expected
    if (allowCanonical) {
      return (current === expected && browser === expected) || (current !== expected && browser !== expected)
    }
    return current === expected && browser === expected
  }, { expected, kind: visit.kind, allowAny: visit.path === '/', allowCanonical: visit.allowCanonical, allowQuery: visit.allowQuery }, { timeout: 30_000 })
}

async function waitForApp(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('#app')
    return Boolean(el?.__vue_app__) && !document.body?.innerText?.includes('AIStudio 加载中')
  }, undefined, { timeout: 60_000 })
}

/**
 * 2026-10-31：整页重载（鉴权失效/落地重定向）会销毁执行上下文，page.evaluate 抛
 * "Execution context was destroyed"。等应用重新挂载后重试一次，避免把环境重载
 * 记成走查崩溃（super_admin 全量扫第 3 站实录）。
 */
async function evaluateWithRetry(page, fn, arg, attempts = 2) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await page.evaluate(fn, arg)
    } catch (error) {
      const message = String(error)
      if (attempt >= attempts || !/Execution context was destroyed|navigat/i.test(message)) throw error
      await waitForApp(page).catch(() => {})
      await page.waitForTimeout(600)
    }
  }
}

async function waitForSettled(page) {
  await page.waitForFunction(() =>
    !document.querySelector('#boot-fallback, .boot-fallback, .page-loading[aria-busy="true"]'),
    undefined, { timeout: 30_000 })
}

const manifest = loadManifest()
if (args.includes('--manifest')) {
  console.log(JSON.stringify(manifest, null, 2))
  process.exit(0)
}
const filterArg = args.find(arg => !arg.startsWith('--'))
const filter = filterArg ? new RegExp(filterArg) : null
/** 每页结束后的额外停留毫秒（WALK_SETTLE_MS 覆盖；录屏/慢速走查用 600-800）。 */
const SETTLE_MS = (() => {
  const raw = Number(process.env.WALK_SETTLE_MS)
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 150
})()
const visits = [
  ...manifest.routes.map(route => ({
    ...route,
    id: slug(route.name || `${route.kind}-${route.path}`),
    label: `${route.kind === 'redirect' ? '重定向' : '页面'} ${route.name || route.path}`,
  })),
  ...manifest.stageTabs.map(tab => ({
    ...tab,
    kind: 'stageTab',
    id: slug(`stage-${tab.stage}-${tab.key}`),
    label: `阶段页签 ${tab.stage}/${tab.key}`,
  })),
].filter(visit => !filter || filter.test(visit.id) || filter.test(visit.name) || filter.test(visit.visitPath))
if (visits.length === 0) throw new Error(`没有匹配的走查路由: ${filterArg}`)

const { browser, page } = await openBrowser()
const led = new Ledger('routes')
let consoleErrors = []
let failedReq = []
page.on('pageerror', error => consoleErrors.push(`PAGEERROR: ${safeText(error)}`))
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(safeText(message.text()))
})
const requestOrigins = new Map()
page.on('request', request => requestOrigins.set(request, safeUrl(page.url())))
page.on('requestfailed', request => {
  const origin = requestOrigins.get(request)
  requestOrigins.delete(request)
  failedReq.push({ status: 'FAILED', url: safeUrl(request.url()), error: request.failure()?.errorText,
    origin, pageAtResponse: safeUrl(page.url()) })
})
page.on('response', response => {
  if (response.status() >= 400) {
    const origin = requestOrigins.get(response.request())
    failedReq.push({ status: response.status(), url: safeUrl(response.url()),
      origin, pageAtResponse: safeUrl(page.url()) })
  }
  requestOrigins.delete(response.request())
})

// 生产链无 dev 自动登录：WALK_LOGIN=user:pass 时经同源 /api/auth/login 换 JWT 注入
// localStorage（与 dev 链 devAutoLogin 同键），再重载进壳。dev 链不设此变量即原行为。
// WALK_TOKEN=<JWT> 时直接注入 localStorage（与 dev 自动登录/生产登录同键），
// 供已铸 super_admin 会话的回归轮使用；优先级高于 WALK_LOGIN。
async function ensureLogin() {
  const walkToken = process.env.WALK_TOKEN?.trim()
  if (walkToken) {
    await page.evaluate((t) => {
      localStorage.setItem('hermes_api_key', t)
      localStorage.setItem('hermes_active_profile_name', 'default')
    }, walkToken)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    return
  }
  const login = process.env.WALK_LOGIN
  if (!login || !login.includes(':')) return
  const [username, password] = login.split(/:(.+)/)
  const token = await page.evaluate(async ({ username, password }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const body = await res.json().catch(() => null)
    const jwt = body?.token || body?.jwt
    if (jwt) localStorage.setItem('hermes_api_key', jwt)
    return jwt
  }, { username, password })
  if (!token) throw new Error('WALK_LOGIN 登录失败（检查凭据与后端）')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
}

led.record('路由清单覆盖', true,
  `${manifest.counts.routes} 路由（${manifest.counts.pages} 页面/${manifest.counts.redirects} 重定向）+ ${manifest.counts.stageTabs} 阶段页签；本次匹配 ${visits.length} 项`)
try {
  await bootApp(page)
  await ensureLogin()
  await waitForApp(page)
  // 权限面判据（2026-10-31）：requiresSuperAdmin 路由对 admin 会被守卫送回 /app，
  // 这是权限边界而非页面缺陷；记 WARN，专项轮用 WALK_TOKEN=super_admin 复验内容。
  const role = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/auth/me', {
        headers: { Authorization: 'Bearer ' + (localStorage.getItem('hermes_api_key') || '') },
      })
      return r.ok ? String((await r.json())?.user?.role || 'unknown') : 'unknown'
    } catch { return 'unknown' }
  })
  led.record('会话角色', true, role)
  for (const visit of visits) {
    consoleErrors = []
    failedReq = []
    try {
      await gotoHash(page, visit.visitPath, 250)
      await waitForRoute(page, visit)
      await waitForSettled(page)
      await clearMasks(page)
      // currentRoute 更新后再让 Vue 完成本轮 DOM patch，避免截图落到上一页。
      // WALK_SETTLE_MS 可调页面停留（2026-10-31 录屏轮）：默认 150ms；慢速走查/
      // 实拍录屏用 600-800ms，避免亚秒级连跳把 WS 握手打断成 console 噪声。
      await page.waitForTimeout(SETTLE_MS)
    } catch (error) {
      const actual = await (async () => {
        try {
          return `${await currentRoute(page)} @ ${await page.evaluate(() => location.hash)}`
        } catch {
          return '执行上下文已销毁（整页重载）'
        }
      })()
      if (visit.requiresSuperAdmin && role !== 'super_admin') {
        led.record(`${visit.label}（权限回退）`, true,
          `非 super_admin 被守卫改道 | 当前 ${actual}，未验收该页内容`, 'WARN')
        continue
      }
      led.defect(`导航 ${visit.label}`, `${safeText(error)} | 当前 ${actual}`, 'P1')
      continue
    }
    const probe = await evaluateWithRetry(page, (rawReSrc) => {
      const rawRe = new RegExp(rawReSrc)
      const body = document.body
      if (!body) {
        // 整页重载/网关重启瞬间 body 尚未建立：按白屏报，不抛 TypeError 吞掉归因。
        return {
          rawKeys: [], msgs: [], loading: true, unauthenticated: false, suspicious: [],
          hasVisual: false, contentLen: 0, url: location.hash, title: document.title, overflow: false,
        }
      }
      const text = (body.innerText || '').slice(0, 20000)
      const rawKeys = [...new Set((text.match(rawRe) || []))].slice(0, 8)
      const msgs = [...document.querySelectorAll('.n-message, .n-notification, .n-alert')]
        .map(el => el.textContent.trim().slice(0, 160)).filter(Boolean)
      const clone = body.cloneNode(true)
      const chrome = '.studio-navigation-rail, .ia-header, .ia-attn-bar, .ia-lshell__sidebar, .page-sidebar, header, nav'
      for (const el of clone.querySelectorAll(chrome)) el.remove()
      const contentLen = (clone.innerText || '').replace(/\s+/g, '').length
        + [...body.querySelectorAll('textarea, input, select')].reduce((n, el) => n + String(el.value || '').length, 0)
      const hasVisual = [...body.querySelectorAll('canvas, img, iframe')].some(el => {
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      return {
        rawKeys,
        msgs: msgs.slice(0, 5),
        loading: text.includes('AIStudio 加载中'),
        unauthenticated: text.includes('未认证'),
        // 错误态文案启发式（2026-10-31 全功能回归）：白屏/空态判据之外，页面显示
        // 「加载失败/不可用/未授权」也要有人看见。记 WARN 不作缺陷（有合法空态）。
        suspicious: [...new Set((text.match(/(加载失败|加载不出来|请求失败(?!后)|服务不可用|出错了|未授权|无权限|无法加载|not available|failed to load)/gi) || []))]
          .slice(0, 4),
        hasVisual,
        contentLen,
        url: location.hash,
        title: document.title,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    }, RAW_KEY_RE.source)

    const expectedPath = `/${visit.visitPath.replace(/^\//, '')}`
    const currentPath = visit.path === '/' ? expectedPath : await currentRoute(page)
    const reached = visit.path === '/' || routeSettled({
      current: currentPath, browser: probe.url.slice(1), expected: expectedPath,
      kind: visit.kind, allowCanonical: visit.allowCanonical, allowQuery: visit.allowQuery,
    })
    const bounced = canonicalBounced({ allowCanonical: visit.allowCanonical, current: currentPath, expected: expectedPath })
    const blank = isBlankContent(probe)
    const note = `→ ${probe.url} | 内容 ${probe.contentLen}${probe.msgs.length ? ` | 提示:${probe.msgs.join(' / ')}` : ''}`
    if (!reached) led.defect(`${visit.label} 未到达目标`, `期望 ${expectedPath}，实际 ${probe.url}`, 'P1')
    if (visit.kind === 'redirect') {
      led.record(visit.label, reached, note)
    } else if (probe.unauthenticated) {
      led.record(`${visit.label}（未认证）`, reached, `${note} | 未验证房间数据`, 'WARN')
    } else if (visit.allowBlank && blank) {
      led.record(`${visit.label}（默认关闭）`, reached, `${note} | 合法透明空态，未验收宠物内容`, 'WARN')
    } else if (bounced) {
      led.record(`${visit.label}（守卫弹回）`, reached, `${note} | 守卫改道，未验收该页内容`, 'WARN')
    } else {
      led.record(visit.label, reached && !blank, note)
    }
    if (probe.overflow) led.defect(`${visit.label} 横向溢出`, `scrollWidth > innerWidth @ ${probe.url}`, 'P2')
    if (probe.rawKeys.length) led.defect(`${visit.label} 裸 i18n 键`, probe.rawKeys.join(','), 'P2')
    if (probe.suspicious.length) led.record(`${visit.label} 错误态文案`, true, probe.suspicious.join(' / '), 'WARN')

    const errs = consoleErrors.filter(e => !e.includes('ResizeObserver') && !e.includes('Download the Vue Devtools'))
    // 资源加载错误没有 URL 或堆栈，网络响应用于判责；console 只保留真正的应用异常。
    const expectedErrs = errs.filter(e => !e.startsWith('PAGEERROR') &&
      (e.includes('walkthrough') || e.startsWith('Failed to load resource')))
    const badErrs = errs.filter(e => !expectedErrs.includes(e))
    if (badErrs.length) led.defect(`${visit.label} console 错误`, badErrs.slice(0, 3).join(' | '), 'P2')
    if (expectedErrs.length) led.record(`${visit.label} 占位资源提示`, true, `${expectedErrs.length} 条`, 'WARN')

    const lateReq = failedReq.filter(isLateRequest)
    const activeReq = failedReq.filter(r => !lateReq.includes(r))
    const expectedReq = activeReq.filter(r => r.url.includes('walkthrough') && [400, 404, 409, 422].includes(r.status))
    const permissionReq = activeReq.filter(r => visit.requiresSuperAdmin && [401, 403].includes(r.status))
    const environmentReq = activeReq.filter(r => r.url.includes('matrix.test') || r.url.includes('assets.petdex.dev'))
    // 2026-10-31 设计内 fail-soft（决策见 spec 2026-10-31-three-zone-regression-fixes）：
    // App 级 ProviderConfigurationPrompt 按网关 orchestrator profile 查询，非白名单用户 403，
    // 客户端 catch 静默不弹窗。放宽＝削弱权限边界，不修；走查记 WARN 不记缺陷。
    const failSoftReq = activeReq.filter(r =>
      r.status === 403 && r.url.includes('/api/hermes/available-models?profile=orchestrator'))
    // dev 链自动登录先试口令（出厂已移除，401）再走 Matrix 桥——401 是设计内回落。
    const devLoginReq = activeReq.filter(r => r.status === 401 && r.url.includes('/api/auth/login'))
    const badReq = activeReq.filter(r =>
      !r.url.includes('favicon') && !expectedReq.includes(r) && !permissionReq.includes(r)
      && !environmentReq.includes(r) && !failSoftReq.includes(r) && !devLoginReq.includes(r))
    if (badReq.length) {
      led.defect(`${visit.label} 失败请求`, badReq.slice(0, 4).map(r => `${r.status} ${r.url}`).join(' | '), 'P2')
    }
    if (failSoftReq.length) {
      led.record(`${visit.label} 权限 fail-soft`, true,
        failSoftReq.slice(0, 2).map(r => `${r.status} ${r.url}`).join(' | '), 'WARN')
    }
    if (devLoginReq.length) {
      led.record(`${visit.label} dev 登录回落`, true, `${devLoginReq.length} 条 401（口令→Matrix 桥）`, 'WARN')
    }
    if (lateReq.length) {
      led.record(`${visit.label} 跨页延迟请求`, true,
        `${lateReq.length} 条，不归入本页缺陷` + (lateReq.slice(0, 2).map(r => ` | ${r.status} ${r.url}`).join('')), 'WARN')
    }
    if (expectedReq.length) led.record(`${visit.label} 占位资源预期响应`, true, `${expectedReq.length} 条`, 'WARN')
    if (permissionReq.length) led.record(`${visit.label} 权限受限`, true, `${permissionReq.length} 条 401/403`, 'WARN')
    if (environmentReq.length) led.record(`${visit.label} 外部环境不可用`, true, `${environmentReq.length} 条 matrix.test`, 'WARN')
    await led.shot(page, visit.id)
  }
} finally {
  led.flush()
  await browser.close()
}
if (led.items.some(item => !item.ok)) process.exitCode = 1
console.log(`[artifacts] ${SHOTS}`)
