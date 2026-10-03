// 全路由健康度扫描（驾驶舱 /app/* 全家 + 收编页 + /ide）：
//   每路由记录：渲染是否为空、错误 toast、裸 i18n 键、console error、失败请求，并截图。
// 用法：node scripts/regression/walk-routes.mjs [routeFilterRegex]
import { openBrowser, gotoHash, clearMasks, Ledger, SHOTS } from './harness.mjs'

const filter = process.argv[2] ? new RegExp(process.argv[2]) : null

const ROUTES = [
  // —— 沟通协作工作台（WorkbenchView 家族）——
  ['app-root', 'app'],
  ['app-dash', 'app/dash'],
  ['app-s-chat', 'app/s/chat'],
  ['app-board', 'app/board'],
  ['app-inbox', 'app/inbox'],
  ['app-gov', 'app/gov'],
  ['app-accounts', 'app/accounts'],
  ['app-cases', 'app/cases'],
  ['app-runs', 'app/runs'],
  ['app-history', 'app/history'],
  ['app-agent', 'app/agent'],
  // —— 收编页（IaLegacyShell + IaSettingsSidebar）——
  ['settings', 'app/settings'],
  ['hermes-chat', 'hermes/chat'],
  ['hermes-models', 'hermes/models'],
  ['hermes-connections', 'hermes/connections'],
  ['studio-agents', 'studio/agents'],
  ['hermes-group-chat', 'hermes/group-chat'],
  ['hermes-workflow', 'hermes/workflow'],
  ['hermes-files', 'hermes/files'],
  ['hermes-skills', 'hermes/skills'],
  ['hermes-plugins', 'hermes/plugins'],
  ['hermes-mcp', 'hermes/mcp'],
  ['hermes-memory', 'hermes/memory'],
  ['hermes-channels', 'hermes/channels'],
  ['hermes-config-settings', 'hermes/config/settings'],
  ['hermes-jobs', 'hermes/jobs'],
  ['hermes-kanban', 'hermes/kanban'],
  ['hermes-journey', 'hermes/journey'],
  ['hermes-logs', 'hermes/logs'],
  ['hermes-usage', 'hermes/usage'],
  ['hermes-performance', 'hermes/performance'],
  ['hermes-profiles', 'hermes/profiles'],
  ['hermes-theme', 'hermes/theme'],
  ['hermes-petdex', 'hermes/petdex'],
  ['hermes-skills-usage', 'hermes/skills-usage'],
  ['hermes-terminal', 'hermes/terminal'],
  ['hermes-version-preview', 'hermes/version-preview'],
  // —— 旧深链迁移（重定向应落地）——
  ['legacy-ops', 'app/ops'],
  ['legacy-tasks', 'app/tasks'],
  ['legacy-comms', 'app/comms'],
  ['legacy-eng', 'app/eng'],
  // —— IDE 侧 ——
  ['ide-root', 'ide'],
]

const RAW_KEY_RE = /\b(?:ia2|common|approvals|ide|ma|chat|settings|nav)[.][a-zA-Z0-9_.]+\b/

const { browser, page } = await openBrowser()
const led = new Ledger('routes')

let consoleErrors = []
let failedReq = []
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)))
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
page.on('response', (r) => { if (r.status() >= 400) failedReq.push(`${r.status()} ${r.url().slice(0, 120)}`) })

try {
  await openApp(page)
  for (const [name, hash] of ROUTES) {
    if (filter && !filter.test(name)) continue
    consoleErrors = []
    failedReq = []
    try {
      await gotoHash(page, hash, 3800)
      await clearMasks(page)
    } catch (e) {
      led.defect(`导航 ${name} (/${hash})`, `goto 异常: ${String(e).slice(0, 120)}`, 'P1')
      continue
    }
    const probe = await page.evaluate((rawReSrc) => {
      const rawRe = new RegExp(rawReSrc)
      const body = document.body
      const text = (body.innerText || '').slice(0, 20000)
      const rawKeys = [...new Set((text.match(rawRe) || []))].slice(0, 8)
      const msgs = [...document.querySelectorAll('.n-message, .n-notification, .n-alert')].map((e) => e.textContent.trim().slice(0, 120))
      // 内容区空白判定：排除壳层（顶栏/注意力条/图标栏/设置侧栏）后主内容区文本量。
      // 只看 body 文本会被壳层文案骗过（首轮实锤：整页空白仍 ≥40 字符）。
      const chrome = '.studio-navigation-rail, .ia-header, .ia-attn-bar, .ia-lshell__sidebar, .page-sidebar, header, nav'
      const clone = body.cloneNode(true)
      for (const el of clone.querySelectorAll(chrome)) el.remove()
      const contentLen = (clone.innerText || '').replace(/\s+/g, '').length
      const blank = contentLen < 40
      return { rawKeys, msgs: msgs.slice(0, 5), blank, contentLen, url: location.hash }
    }, RAW_KEY_RE.source)

    const errs = consoleErrors.filter((e) => !e.includes('ResizeObserver') && !e.includes('Download the Vue Devtools'))
    const badReq = failedReq.filter((r) => !r.includes('favicon'))
    led.record(`路由 ${name} (/${hash}) 渲染`, !probe.blank, `→ ${probe.url}${probe.rawKeys.length ? ' | 裸键:' + probe.rawKeys.join(',') : ''}${probe.msgs.length ? ' | 提示:' + probe.msgs.join(' / ') : ''}`)
    if (errs.length) led.defect(`路由 ${name} console 错误`, errs.slice(0, 3).join(' | '), 'P2')
    if (badReq.length) led.defect(`路由 ${name} 失败请求`, badReq.slice(0, 4).join(' | '), 'P2')
    if (probe.rawKeys.length) led.defect(`路由 ${name} 裸 i18n 键`, probe.rawKeys.join(','), 'P2')
    await led.shot(page, name)
  }
} finally {
  led.flush()
  await browser.close()
}

async function openApp(page) {
  await page.goto('http://localhost:8689/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
}
