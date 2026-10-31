// 全流程推演（/app/sim*）交互回归：七个入口逐页 + 运行选择器 + 编排编辑器 +
// 业务地图需求影响分析（本地确定性算法，无模型调用）+ 设置面只读核对。
// 不点「开始运行」「保存设置」——会改运行态/配置，回归轮只验证可逆交互。
// 用法：node scripts/regression/sim-center-walkthrough.mjs
import { openBrowser, bootApp, clearMasks, gotoHash, Ledger, waitForApp } from './harness.mjs'

const { browser, page } = await openBrowser()
const led = new Ledger('sim')
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))

async function step(name, fn) {
  errors.length = 0
  try {
    await fn()
    await page.waitForTimeout(600)
    await clearMasks(page)
    led.record(name, true, errors.length ? '但有错误: ' + errors[0] : '')
  } catch (e) {
    led.defect(name, String(e).slice(0, 160), 'P1')
  }
}

/** 点击侧栏推演导航（真实点击；naive 遮罩已清）。 */
async function nav(testid, expectedHash) {
  await page.locator(`[data-testid=${testid}]`).first().click({ timeout: 8000 })
  await page.waitForFunction((h) => location.hash.startsWith(h), expectedHash, { timeout: 20000 })
  await waitForApp(page, 20000)
  await page.waitForTimeout(800)
}

async function panel(sel, label) {
  const el = page.locator(sel).first()
  await el.waitFor({ state: 'visible', timeout: 15000 })
  const text = (await el.innerText()).replace(/\s+/g, ' ').trim()
  if (text.length < 2) throw new Error(`${label} 内容为空`)
  return text
}

try {
  await bootApp(page)
  await gotoHash(page, 'app/sim', 1200)

  await step('导演台（/app/sim）面板 + 运行选择器', async () => {
    await panel('[data-testid=ia-sim-panel-overview]', '导演台')
    const rs = page.locator('[data-testid=sim-run-selector]')
    if (!(await rs.count())) throw new Error('运行选择器缺席')
    await led.shot(page, 'overview')
  })

  await step('监督面板（/app/sim/supervision）', async () => {
    await nav('ia-side-nav-sim-supervision', '#/app/sim/supervision')
    await panel('[data-testid=ia-sim-panel-supervision]', '监督面板')
    await led.shot(page, 'supervision')
  })

  await step('运行监控（/app/sim/ops）', async () => {
    await nav('ia-side-nav-sim-ops', '#/app/sim/ops')
    await panel('[data-testid=ia-sim-panel-ops]', '运行监控')
    await led.shot(page, 'ops')
  })

  await step('证据库（/app/sim/evidence）', async () => {
    await nav('ia-side-nav-sim-evidence', '#/app/sim/evidence')
    await panel('[data-testid=ia-sim-panel-evidence]', '证据库')
    await led.shot(page, 'evidence')
  })

  await step('运行编排（/app/sim/orchestration）', async () => {
    await nav('ia-side-nav-sim-orchestration', '#/app/sim/orchestration')
    await panel('[data-testid=orc-page]', '运行编排')
    await page.locator('[data-testid=orc-refresh]').first().click({ timeout: 8000 })
    await page.waitForTimeout(1500)
    await page.locator('[data-testid=orc-editor]').first().click({ timeout: 8000 })
    await page.locator('[data-testid=orc-editor-mode]').first().waitFor({ state: 'visible', timeout: 15000 })
    await led.shot(page, 'orchestration-editor')
  })

  await step('推演设置（/app/sim/settings）只读核对', async () => {
    await nav('ia-side-nav-sim-settings', '#/app/sim/settings')
    await panel('[data-testid=sst-page]', '推演设置')
    const fields = page.locator('[data-testid^=sst-input-]')
    if ((await fields.count()) < 1) throw new Error('设置输入项缺席')
    await led.shot(page, 'settings')
  })

  await step('业务地图（/app/sim/map）空值校验 + 需求影响分析', async () => {
    await nav('ia-side-nav-sim-map', '#/app/sim/map')
    await panel('[data-testid=sim-map-page]', '业务地图')
    await page.locator('[data-testid=sim-map-analyze]').first().click({ timeout: 8000 })
    const err = page.locator('[data-testid=sim-map-error]')
    await err.waitFor({ state: 'visible', timeout: 8000 })
    const msg = (await err.innerText()).trim()
    if (!msg) throw new Error('空值提交未报错')
    await led.shot(page, 'map-empty-validation')
    // 本地确定性四路命中（custom/server/impact/requirement-impact.ts），不调模型、不落库。
    await page.locator('[data-testid=sim-map-title]').fill('收银台改版')
    await page.locator('[data-testid=sim-map-desc]').fill('小程序收银台支持微信支付，涉及支付流程与退款')
    await page.locator('[data-testid=sim-map-analyze]').first().click({ timeout: 8000 })
    await page.locator('[data-testid=sim-map-canvas]').first().waitFor({ state: 'visible', timeout: 20000 })
    const layer = page.locator('[data-testid^=sim-map-layer-]').first()
    if (await layer.count()) {
      await layer.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(400)
    }
    await led.shot(page, 'map-analyzed')
  })
} finally {
  led.flush()
  await browser.close()
}
