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
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d
}
const RUN = arg('run', process.env.MX_RUN_ID || '')
if (!RUN) { console.error('需要 --run <RUN_ID>（帧落本轮 runs 目录，勿混轮）'); process.exit(1) }
const STEP = arg("step", ""), K = arg("k", "1"), RAWURL = arg("url", "")
// 跨端锚点（2026-10-12 双模式轮）：SIM_ROOT/studio/matrix 全走 env，Git Bash/远端
// homeserver 均可覆盖；默认值与 mac 单机历史行为一致。
const SIM_ROOT = process.env.AIPAY_SIM_ROOT || '/Users/cuishi/lab/ncwk-sim-mux'
const MX_SERVER_NAME = process.env.MX_SERVER_NAME || 'matrix.test'
const MX_HS_URL = process.env.MX_HS || 'http://127.0.0.1:8008'

// 拍摄位规划覆盖（2026-10-10 用户指令"截图按 Swarm Studio UI 功能规划，不乱拍凑数"）：
// mux/capture-plan.env = 步→界面单一事实源（语义正本=方案 §2.5）。本射手是唯一执行
// 点——按步名覆盖 --url/--user，调用方传参仅作规划缺席时的回落；覆盖留痕进侧车日志
// （capture-plan.log，采集时刻/步/页面/账号可审计）。射手是按次启动的 node 工具，
// 本文件可在推演进行中安全修改（bash 主脚本禁改纪律不受影响）。
const PLAN_FILE = new URL('./capture-plan.env', import.meta.url)
let PLAN_URL = RAWURL, PLAN_USER = null
try {
  const plan = readFileSync(PLAN_FILE, 'utf8').split('\n')
  for (const ln of plan) {
    const t = ln.trim()
    if (!t || t.startsWith('#')) continue
    const body = t.replace(/\s+#.*$/, '')  // 剥行内注释（URL 不含 " #" 模式，安全）
    const [st, u, usr] = body.split('|')
    if (st && st.trim() === STEP && u && u.trim()) {
      PLAN_URL = u.trim()
      PLAN_USER = (usr || '').trim() || null
      break
    }
  }
} catch { /* 规划文件缺席=不覆盖（回落调用方参数） */ }

// URL 形态归一（run13 步18 实锤：路径形态深链不带 query 时，entry.mts 的
// pathname→hash 迁移不触发，冷启动落登录链→驾驶舱首页→被带进最近群聊房，
// /app/ide 拍出房间视图错帧）。hash 形态实测全部稳定落页（scratch 探针 v5）。
// 归一化覆盖规划覆盖与 --url 回落两侧，防后续轮次复发。
if (PLAN_URL === 'none') {
  // V8.4④ 三态之「功能不存在标注」：无拍摄位=无帧退出（不拍垃圾页冒充），
  // 报告侧按缺帧 ⬜+记单呈现。rc=0（采集成功且按规划无帧，非失败）。
  console.log(`plan=none: step ${STEP} 无拍摄位，零帧退出（V8.4④ 功能不存在标注）`)
  process.exit(0)
}
if (PLAN_URL.startsWith('/') && !PLAN_URL.startsWith('/#')) {
  const ORIG_URL = PLAN_URL
  PLAN_URL = '/#' + PLAN_URL
  try {
    // OUT 尚未声明（TDZ），路径独立拼（与下方 plan-override 日志同目录）
    appendFileSync(join(SIM_ROOT, 'runs', RUN, 'evidence', 'screenshots', 'capture-plan.log'),
      `[${new Date().toISOString()}] step=${STEP} url-normalize path→hash ${ORIG_URL}→${PLAN_URL}\n`)
  } catch {}
}

const ACTION = arg('action', ''), ACTION_WAIT = parseInt(arg('action-wait', '400'), 10)
const USER = PLAN_USER || arg('user', 'fanfan'), SETTLE = parseInt(arg('settle', '4000'), 10)
if (!STEP || !PLAN_URL) { console.error('需要 --step <n> --url <路由>'); process.exit(1) }

const BASE = process.env.MX_STUDIO_BASE || 'http://127.0.0.1:8802'
const OUT = join(SIM_ROOT, 'runs', RUN, 'evidence', 'screenshots', 'steps')
mkdirSync(OUT, { recursive: true })
// 失败留痕（run12 实锤：capture_step 把 stderr 丢 /dev/null，rc=1 无从归因）——
// 顶层 await 抛错/未捕获拒绝统一落侧车日志后再退 1，后续失败可直接归因。
const ERRLOG = join(OUT, '..', 'r18-frames-errors.log')
const logErr = (tag, e) => {
  try {
    appendFileSync(ERRLOG, `[${new Date().toISOString()}] ${tag} step=${STEP} url=${PLAN_URL} user=${USER}: ${(e && e.stack) || e}\n`)
  } catch {}
}
process.on('uncaughtException', (e) => { logErr('uncaughtException', e); process.exit(1) })
process.on('unhandledRejection', (e) => { logErr('unhandledRejection', e); process.exit(1) })
if (PLAN_URL !== RAWURL || PLAN_USER) {
  try {
    appendFileSync(join(OUT, '..', 'capture-plan.log'),
      `[${new Date().toISOString()}] step=${STEP} plan-override url=${RAWURL}→${PLAN_URL} user=${PLAN_USER || '(default)'}\n`)
  } catch {}
}
const mtok = readFileSync(join(SIM_ROOT, 'creds', `${USER}.token`), 'utf8').split('\n')[0].trim()

const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    matrixAccessToken: mtok, matrixUserId: `@${USER}:${MX_SERVER_NAME}`,
    deviceId: 'R18CAP', homeserverUrl: MX_HS_URL,
  }),
}).then((r) => r.json())
if (!loginRes.token) throw new Error('matrix-login 失败: ' + JSON.stringify(loginRes))

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme: 'dark' })
// 推演 UI 始终 dark（用户 2026-10-13 裁定）：colorScheme 焊死让 system 亮度档解析为 dark；
// 下面 addInitScript 是双保险②——显式亮度档=dark，绕过 system 档对宿主系统的依赖  // 推演 UI 始终中文：浏览器级 locale 焊死（localStorage hermes_locale=zh 为第二道保险）
await ctx.addInitScript(() => { try { localStorage.setItem('hermes_brightness', 'dark') } catch {} })
const page = await ctx.newPage()
await page.goto(BASE + '/login')
await page.evaluate(([token]) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
}, [loginRes.token])

async function dismissPopups() {
  for (const txt of ['Confirm', '确认', '确定', '知道了', '稍等', '稍后提醒', '开始使用', '立即体验', '跳过']) {
    const btn = page.locator(`button:has-text("${txt}")`).first()
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(400) }
  }
  // 关闭钮只点对话框容器内的（run13 步19 实锤：裸 [aria-label=close] 横扫把看板
  // 页签本体关掉——URL 从 /#/app/board 被点到 /#/app，qi 落会话空态拍出壳页；
  // fanfan 驾驶舱首页默认带看板故历史帧侥幸正常）。模态/抽屉/通知浮层的关闭钮
  // 均在 [role=dialog]/modal/drawer 类容器内，页面骨架的关闭钮不在。
  for (const aria of ['close', '关闭', 'Close']) {
    const btn = page.locator(
      `[role="dialog"] [aria-label="${aria}"], [class*="modal" i] [aria-label="${aria}"], `
      + `[class*="drawer" i] [aria-label="${aria}"], [class*="modal" i] button:has-text("×"), `
      + `[class*="drawer" i] button:has-text("×")`,
    ).first()
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(300) }
  }
}
// 拍后自检（run11 实锤：多帧拍到"没有权限/群聊升级说明"页）：读到坏页即强关弹窗
// 重载重拍一次；仍坏则写 .bad.txt 侧车留证并继续（不阻断，如实可查）。
async function pageLooksBad() {
  const t = await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '')

  // run16 实锤补签：采集会话被服务端弹回登录页的画面是「连接你的运行时/Connect your
  // runtime」（22/48 帧同像素壳页的签名）——旧正则「登录到 Hermes|Login to」不匹配。
  return /没有权限|无权限访问|群聊升级|升级说明|登录到 Hermes|Login to|连接你的运行时|Connect your runtime/.test(t) ? t : null
}

// F1（run15 复盘）：SPA 就绪强断言——hash 冷启动壳页陷阱根治（run15 24 帧壳页同帧摘除
// 实锤：固定 SETTLE 等 4s 拍到的是未挂载路由的壳）。就绪=目标 hash 已挂 AND 正文有实
// 内容；cap 内轮询，超 cap 仍拍（如实留证，配合 pageLooksBad 自检面）。
const ROUTE_ASSERT = (() => {
  const h = PLAN_URL.split('#')[1] || ''
  return h.replace(/^\//, '')   // '/#/app/board' → 'app/board'
})()
async function waitSpaReady(capMs = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < capMs) {
    const ok = await page.evaluate((route) => {
      if (route && !location.hash.includes(route)) return false
      return ((document.body && document.body.innerText) || '').trim().length > 150
    }, ROUTE_ASSERT).catch(() => false)
    if (ok) return true
    await page.waitForTimeout(500)
  }
  return false
}

// run16 复盘（fix/run16-report-truth）：会话失效自愈——matrix-login 重拉新 token 注入
// localStorage。服务端把会话弹回 /login 时旧 token 已不可用，原重试只重 goto 不换
// token=必再弹（22 帧登录壳页根因的采集端根治）。
async function relaunchLogin() {
  const r = await fetch(`${BASE}/api/auth/matrix-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      matrixAccessToken: mtok, matrixUserId: `@${USER}:${MX_SERVER_NAME}`,
      deviceId: 'R18CAP', homeserverUrl: MX_HS_URL,
    }),
  }).then((r2) => r2.json()).catch(() => ({}))
  if (!r.token) return false
  await page.evaluate(([token]) => {
    localStorage.setItem('hermes_api_key', token)
    localStorage.setItem('hermes_server_url', location.origin)
    localStorage.setItem('hermes_locale', 'zh')
  }, [r.token]).catch(() => {})
  return true
}

const pre = `${STEP}-op${K}`
await page.goto(BASE + PLAN_URL)
await waitSpaReady()
await page.waitForTimeout(SETTLE)
await dismissPopups()
if (await pageLooksBad()) {
  await dismissPopups()
  await relaunchLogin()
  await page.goto(BASE + PLAN_URL).catch(() => {})
  await waitSpaReady()
  await page.waitForTimeout(SETTLE)
  await dismissPopups()
  const bad = await pageLooksBad()
  if (bad) writeFileSync(join(OUT, `${pre}.bad.txt`), bad.slice(0, 500), 'utf8')
}
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
