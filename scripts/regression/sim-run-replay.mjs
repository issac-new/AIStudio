// 历史完整运行回放探针（2026-10-31 未做项收口）：用真实 run-state 验证 26 步执行链
// 的呈现（KPI 步骤数/七幕/质量门/证据库），不启动新 run、不产生模型消耗。
// 用法：SIM_REPLAY_RUN=<RUN_ID> node scripts/regression/sim-run-replay.mjs
// 未设 SIM_REPLAY_RUN 时跳过（exit 0），便于并入通用回归门。
import { openBrowser, bootApp, gotoHash, Ledger, waitForApp } from './harness.mjs'

const RUN = process.env.SIM_REPLAY_RUN?.trim() || ''
const led = new Ledger('sim-replay')
if (!RUN) {
  led.record('历史运行回放', true, '未设 SIM_REPLAY_RUN，跳过', 'WARN')
  led.flush()
  process.exit(0)
}

const { browser, page } = await openBrowser()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))

try {
  await bootApp(page)
  await gotoHash(page, `app/sim?run=${encodeURIComponent(RUN)}`, 1800)
  await waitForApp(page, 30000)

  const kpi = page.locator('[data-testid=director-kpi-steps]')
  await kpi.waitFor({ state: 'visible', timeout: 20000 })
  const kpiText = (await kpi.innerText()).replace(/\s+/g, ' ').trim()
  const done = Number((kpiText.match(/(\d+)\s*\/\s*26/) || [])[1] ?? -1)
  led.record('26 步执行链 KPI', done > 0, `run=${RUN} kpi=${kpiText}`)
  const acts = await page.locator('[data-testid^=director-act-]').count()
  led.record('七幕执行分组', acts === 7, `acts=${acts}`)
  const gates = page.locator('[data-testid=director-kpi-gates]')
  const gateText = (await gates.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  led.record('质量门 KPI', /\/\s*6/.test(gateText), gateText || '缺席')
  await led.shot(page, 'director-replay')

  // 证据库读取同一 run 的真实台账/报告入口（不点下载）
  await gotoHash(page, `app/sim/evidence?run=${encodeURIComponent(RUN)}`, 1500)
  await page.locator('[data-testid=ev-panel]').first().waitFor({ state: 'visible', timeout: 20000 })
  const report = page.locator('[data-testid=ev-report-link]').first()
  const reportHref = await report.getAttribute('href').catch(() => null)
  led.record('证据库报告入口', Boolean(await report.count()), reportHref ? `href=${reportHref}` : '入口在，无 href')
  await led.shot(page, 'evidence-replay')
} catch (e) {
  led.defect('历史运行回放', String(e).slice(0, 180), 'P1')
} finally {
  if (errors.length) led.defect('历史运行回放 [pageerror]', errors.slice(0, 2).join(' | '), 'P2')
  led.flush()
  await browser.close()
}
