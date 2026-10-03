// r18-frames.mjs — R18 操作前后帧射手（V7.2 §9.3 R18 配套采集位）
// 一个操作 = 三帧：before（操作前界面）/ action（可选，动作瞬间）/ after（系统响应）。
// 产物命名 <step>-op<k>-{before,action,after}.png 落 runs/<RUN>/evidence/screenshots/steps/，
// 随后用 r18-collect.py op --frames 登记进 r18-steps.json（生成器按名渲染、审计查 8 断言 ≥2 帧）。
//
// 用法：node r18-frames.mjs --run <RUN_ID> --step 25 --k 1 --url '/app/board' \
//         [--action 'click:text=⌨IDE'] [--action-wait 400] [--user fanfan] [--settle 4000]
//   --action 支持 click:<playwright选择器> 或 key:<键名>；缺省只拍 before/after 两帧。
// 前提：sim studio :8802 / gateway :8801 / synapse :8008 在跑（与 capture-ui.mjs 同）。
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d
}
const RUN = arg('run', process.env.MX_RUN_ID || '')
if (!RUN) { console.error('需要 --run <RUN_ID>（帧落本轮 runs 目录，勿混轮）'); process.exit(1) }
const STEP = arg('step', ''), K = arg('k', '1'), URL = arg('url', '')
const ACTION = arg('action', ''), ACTION_WAIT = parseInt(arg('action-wait', '400'), 10)
const USER = arg('user', 'fanfan'), SETTLE = parseInt(arg('settle', '4000'), 10)
if (!STEP || !URL) { console.error('需要 --step <n> --url <路由>'); process.exit(1) }

const BASE = 'http://127.0.0.1:8802'
const OUT = join('/Volumes/nvme2230/lab/ncwk-sim-mux', 'runs', RUN, 'evidence', 'screenshots', 'steps')
mkdirSync(OUT, { recursive: true })
const mtok = readFileSync(`/Volumes/nvme2230/lab/ncwk-sim-mux/creds/${USER}.token`, 'utf8').split('\n')[0].trim()

const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    matrixAccessToken: mtok, matrixUserId: `@${USER}:matrix.test`,
    deviceId: 'R18CAP', homeserverUrl: 'http://127.0.0.1:8008',
  }),
}).then((r) => r.json())
if (!loginRes.token) throw new Error('matrix-login 失败: ' + JSON.stringify(loginRes))

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(BASE + '/login')
await page.evaluate(([token]) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
}, [loginRes.token])

async function dismissPopups() {
  for (const txt of ['Confirm', '确认', '确定', '知道了', '稍等', '稍后提醒']) {
    const btn = page.locator(`button:has-text("${txt}")`).first()
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(400) }
  }
}

const pre = `${STEP}-op${K}`
await page.goto(BASE + URL)
await page.waitForTimeout(SETTLE)
await dismissPopups()
await page.screenshot({ path: `${OUT}/${pre}-before.png` })
console.log(`shot: ${pre}-before`)

if (ACTION) {
  const [kind, rest] = ACTION.split(':')
  try {
    if (kind === 'click') {
      await page.locator(rest).first().click()
    } else if (kind === 'key') {
      await page.keyboard.press(rest)
    } else {
      console.error(`--action 仅支持 click:<sel> / key:<key>，收到 ${ACTION}`)
    }
    await page.waitForTimeout(ACTION_WAIT)
    await page.screenshot({ path: `${OUT}/${pre}-action.png` })
    console.log(`shot: ${pre}-action`)
  } catch (e) { console.error(`action 帧失败（before/after 仍有效）：${e.message}`) }
  await page.waitForTimeout(SETTLE)
  await dismissPopups()
  await page.screenshot({ path: `${OUT}/${pre}-after.png` })
  console.log(`shot: ${pre}-after`)
} else {
  await page.waitForTimeout(SETTLE)
  await page.screenshot({ path: `${OUT}/${pre}-after.png` })
  console.log(`shot: ${pre}-after（无 --action：before/after 两帧）`)
}

await browser.close()
console.log(`\n下一步登记：r18-collect.py --run ${RUN} op --step ${STEP} --title '…' --entry '…' --frames ${pre}-before.png ${pre}${ACTION ? '-action.png' : ''} ${pre}-after.png`)
