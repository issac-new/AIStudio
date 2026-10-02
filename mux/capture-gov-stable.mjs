// capture-gov-stable.mjs — 稳定补拍（最小 bootstrap：3 键+单 boot+单 nav，run2 收口实测
// 完整 8 键/多 boot 的采集会被注意力队列劫持路由）。CAPTURE_ONLY=room|g5drawer|gov 可分组。
import { chromium } from 'playwright'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
const BASE = 'http://127.0.0.1:8802'
const RUN_ID = process.env.RUN_ID || '20260929-v4-run2'
const RUN_DIR = `/Volumes/nvme2230/lab/ncwk-sim-mux/runs/${RUN_ID}`
const OUT = `${RUN_DIR}/evidence/screenshots/steps`
mkdirSync(OUT, { recursive: true })
const USER = process.env.CAPTURE_USER || 'admin'
const ONLY = process.env.CAPTURE_ONLY || ''
const mtok = readFileSync(`/Volumes/nvme2230/lab/ncwk-sim-mux/creds/${USER}.token`, 'utf8').split('\n')[0].trim()
const state = {}
for (const line of readFileSync(`${RUN_DIR}/state.env`, 'utf8').split('\n')) {
  if (line.includes('=') && !line.startsWith('jwt_')) {
    const i = line.indexOf('='); state[line.slice(0, i).trim()] = state[line.slice(0, i).trim()] ?? line.slice(i + 1).trim()
  }
}
const ROOM = state.room_analysis || ''
const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ matrixAccessToken: mtok, matrixUserId: `@${USER}:matrix.test`, deviceId: `GOVSTABLE-${Date.now()}`, homeserverUrl: 'http://127.0.0.1:8008' }) }).then(r => r.json())
if (!loginRes.token) throw new Error('login fail')
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2, locale: 'zh-CN' })).newPage()
await page.goto(BASE + '/login')
await page.evaluate(([t]) => { localStorage.setItem('hermes_api_key', t); localStorage.setItem('hermes_server_url', location.origin); localStorage.setItem('hermes_locale', 'zh') }, [loginRes.token])
await page.goto(BASE + '/#/app')
await page.waitForTimeout(9000)
// 拍前去噪（V5 §8.4②）：CSS 隐藏公告横幅/版本通知（"知道了"=跳转劫持钮，禁点）；
// 样式注入后同文档 hash 导航不丢，全程有效。
await page.addStyleTag({ content: '.n-notification,.announcement-banner,[data-testid="studio-announcement"]{display:none!important}' }).catch(() => {})
console.log('boot hash:', await page.evaluate(() => location.hash), '| user:', USER)

if (!ONLY || ONLY === 'gov') {
  await page.evaluate(() => { location.hash = '#/app/board?tab=gov-docs' })  // 治理中心内嵌看板 tab：/app/gov 别名落 gov-org（无工件库钮），正身=tab=gov-docs
  await page.waitForTimeout(4500)
  console.log('gov docs at nav:', await page.evaluate(() => document.querySelectorAll('[data-testid^="gov-doc-"]').length))
  const DOCS = [
    ['ui-gov-center', null, null],
    ['ui-gov-roster', 'roster', '账号清单'],
    ['ui-gov-appregistry', 'app-registry', '应用资产'],
    ['ui-gov-org', 'org', '组织与权限'],
    ['ui-gov-doc', 'freeze', 'G1 需求冻'],
    ['ui-gov-tasklist', 'tasklist', 'SMART'],
    ['ui-gov-design', 'design', '概要设计'],
    ['ui-gov-schedule', 'schedule', '排期'],
    ['ui-gov-test', 'test', '测试报告'],
    ['ui-gov-release', 'release', '发布说明'],
    ['ui-gov-uat', 'uat', 'UAT'],
    ['ui-gov-audit', 'audit', '审计'],
    ['ui-gov-retro', 'retro', '复盘'],
    ['ui-gov-tlpaycore', 'testlog-paycore', 'G3 证据'],
    ['ui-gov-tlchwx', 'testlog-chwx', 'G3 证据'],
    ['ui-gov-tlchali', 'testlog-chali', 'G3 证据'],
    ['ui-gov-tlmp', 'testlog-mp', 'G3 证据'],
  ]
  for (const [name, kind, frag] of DOCS) {
    if (existsSync(`${OUT}/${name}.png`) && !process.env.FORCE) { console.log('skip:', name); continue }
    let ok = false
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      await page.evaluate(() => { location.hash = '#/app/board?tab=gov-docs' })  // 治理中心内嵌看板 tab：/app/gov 别名落 gov-org（无工件库钮），正身=tab=gov-docs
      await page.waitForTimeout(2500)
      if (kind) {
        const btn = page.locator(`[data-testid="gov-doc-${kind}"]`)
        if (await btn.count() === 0) { console.log('  [warn]', name, 'btn missing', attempt); continue }
        await btn.first().scrollIntoViewIfNeeded().catch(() => {})
        await btn.first().click().catch(() => {})
        ok = await page.locator('.gov-docs__docview-hd b', { hasText: frag }).first()
          .waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)
      } else {
        ok = await page.locator('[data-testid^="gov-doc-"]').first().isVisible().catch(() => false)
      }
    }
    if (!ok) { console.log('  [FAIL]', name, '头校验未过，不截'); continue }
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${OUT}/${name}.png` })
    console.log('shot:', name)
  }
}

if (!ONLY || ONLY === 'g5drawer') {
  if (existsSync(`${OUT}/ui-g5-carddrawer.png`) && !process.env.FORCE) {
    console.log('skip: ui-g5-carddrawer')
  } else {
    let ok = false
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      await page.evaluate(() => { location.hash = '#/hermes/kanban?board=fanfan-review' })
      await page.waitForTimeout(3500)
      // G5 评审卡按轮取（旧写死 t_ea68c462 是 run2 卡——run7 预检实锤任何新轮必打不开）：
      // state card_g5_ready 优先，缺省按准出评审标题找；done 卡视区外时先状态筛出。
      const stSel = page.locator('text=全部状态').first()
      if (await stSel.isVisible().catch(() => false)) {
        await stSel.click().catch(() => {})
        await page.waitForTimeout(800)
        const doneOpt = page.locator('text=已完成').first()
        if (await doneOpt.isVisible().catch(() => false)) { await doneOpt.click().catch(() => {}); await page.waitForTimeout(1500) }
      }
      const g5id = state.card_g5_ready || state.card_g5 || ''
      const byTitle = page.locator('text=/发布准出评审/').first()
      const card = (await byTitle.isVisible().catch(() => false)) || !g5id
        ? byTitle : page.locator(`text=${g5id}`).first()
      if (await card.isVisible().catch(() => false)) {
        await card.scrollIntoViewIfNeeded().catch(() => {})
        await card.click().catch(() => {})
      }
      // 抽屉签名=「Task ID」字段行（卡面上没有）+ .task-drawer 根；仅卡标题可见不算开抽屉。
      // 抽屉根是 v-else-if="task && detail" 详情就绪才渲染——waitFor 轮询免假阴性。
      ok = await page.locator('.task-drawer').first()
        .waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false)
      ok = ok && (await page.locator('text=Task ID').first().isVisible().catch(() => false))
    }
    if (ok) { await page.screenshot({ path: `${OUT}/ui-g5-carddrawer.png` }); console.log('shot: ui-g5-carddrawer（抽屉校验过）') }
    else console.log('  [FAIL] ui-g5-carddrawer 抽屉未开，不截')
  }
}

if (!ONLY || ONLY === 'room') {
  if (existsSync(`${OUT}/ui-room-archived.png`) && !process.env.FORCE) {
    console.log('skip: ui-room-archived')
  } else if (ROOM) {
    let ok = false
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      await page.evaluate((r) => { location.hash = `#/app/s/group/${encodeURIComponent(r)}` }, ROOM)
      await page.waitForTimeout(6000)
      ok = page.url ? (await page.evaluate((r) => location.hash.includes(r.slice(0, 12)), ROOM)) : false
    }
    if (ok) { await page.screenshot({ path: `${OUT}/ui-room-archived.png` }); console.log('shot: ui-room-archived（房间校验过）') }
    else console.log('  [FAIL] ui-room-archived 房间未进视图')
  }
}
await browser.close()
console.log('stable capture done')
