// capture-v42.mjs — 20260929 重构轮复跑截图（RUN_ID 参数化 + 三新特性位）
// 前提：sim studio :8802 / gateway :8801 / synapse :8008 在跑；本轮推演进行中或已收官
// 用法：RUN_ID=20260929-v4-run2 node capture-v42.mjs [only]   （only=位名；缺省全跑）
// 与 capture-v4.mjs（run1 专用）互不影响；登录真实 matrix-login（fanfan）。
// 新增位：
//   ui-08c-flow-timeline  P4③ 分析群右栏「任务流转」时间线（tdp-flow-sec 区域特写）
//   ui-08d-members        建群全量预邀实证（成员面板：人+agent 并排 17 号在列）
//   ui-20b-spotcheck      V4.1 抽检器：收件箱「抽检·自动放行回看」区（含真实自动放行条目）
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8802'
const RUN_ID = process.env.RUN_ID || '20260929-v4-run2'
const RUN_DIR = `/Volumes/nvme2230/lab/ncwk-sim-mux/runs/${RUN_ID}`
const OUT = `${RUN_DIR}/evidence/screenshots/steps`
const mtok = readFileSync('/Volumes/nvme2230/lab/ncwk-sim-mux/creds/fanfan.token', 'utf8').split('\n')[0].trim()

const state = {}
for (const line of readFileSync(`${RUN_DIR}/state.env`, 'utf8').split('\n')) {
  if (line.includes('=') && !line.startsWith('jwt_')) {
    const i = line.indexOf('='); state[line.slice(0, i).trim()] = state[line.slice(0, i).trim()] ?? line.slice(i + 1).trim()
  }
}
const ROOM = state.room_analysis || ''
console.log('RUN_ID =', RUN_ID, '| room_analysis =', ROOM)
if (!ROOM) console.log('WARN: state 无 room_analysis（推演未到建群步？）')

const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    matrixAccessToken: mtok, matrixUserId: '@fanfan:matrix.test',
    deviceId: 'CAPTURE-V42', homeserverUrl: 'http://127.0.0.1:8008',
  }),
}).then((r) => r.json())
if (!loginRes.token) throw new Error('matrix-login 失败: ' + JSON.stringify(loginRes))

const only = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

await page.goto(BASE + '/login')
await page.evaluate(([token, mtok2]) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
  localStorage.setItem('hermes.kanban.selectedBoard', 'fanfan-pm-plan')
  localStorage.setItem('matrix_access_token', mtok2)
  localStorage.setItem('matrix_user_id', '@fanfan:matrix.test')
  localStorage.setItem('matrix_device_id', 'CAPTURE-V42')
  localStorage.setItem('matrix_homeserver_url', 'http://127.0.0.1:8008')
}, [loginRes.token, mtok])

async function shot(name, url, opts = {}) {
  if (only && only !== name) return
  await page.goto(BASE + '/#' + url.replace(/^#/, ''))
  // 拍前去噪：CSS 隐藏版本通知 toast（严禁点击"知道了"=跳转劫持钮）+Esc 收浮层
  await page.addStyleTag({ content: '.n-notification,.announcement-banner{display:none!important}' }).catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  // 快门守门（8.4 规范）：目标组件非空且无加载态才拍；空/加载中重试，最终仍空=拒拍记缺陷
  if (opts.expect) {
    let gated = false
    for (let i = 0; i < 6 && !gated; i++) {
      gated = await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        const spins = [...document.querySelectorAll('.n-spin, [class*="spin"]')]
        const spinning = spins.some((s) => getComputedStyle(s).display !== 'none' && !!s.offsetParent)
        return !!el && (el.innerText || '').trim().length > 0 && !spinning
      }, opts.expect).catch(() => false)
      if (!gated) await page.waitForTimeout(1500)
    }
    if (!gated) { console.error(`DEFECT[shutter-gate]: ${name} 目标 ${opts.expect} 空/加载中——拒拍（补数据或修组件后重拍）`); return }
  }
  // 文本级快门守门：动态数据（在线三数等）须水合到预期形态才拍——空态即拒拍
  if (opts.expectText) {
    const rx = new RegExp(opts.expectText)
    let textOk = false
    for (let i = 0; i < 8 && !textOk; i++) {
      const body = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '))
      textOk = rx.test(body)
      if (!textOk) await page.waitForTimeout(1500)
    }
    if (!textOk) { console.error(`DEFECT[shutter-gate]: ${name} 文本 /${opts.expectText}/ 未达——拒拍（数据未水合）`); return }
  }
  await page.waitForTimeout(opts.wait ?? 4000)
  // ⚠️ 不点任何弹窗按钮："知道了"=通知跳转钮，点击即劫持导航到 board?task=<卡>
  // （run2 实锤：五连拍全被劫持到 t_666aecf8；去掉 Dismiss 循环后全部正确落位）
  if (opts.after) await opts.after()
  await page.screenshot({ path: `${OUT}/${name}.png`, ...(opts.fullPage ? { fullPage: true } : {}) })
  const probe = await page.evaluate(() => {
    const q = (s) => !!document.querySelector(s)
    return {
      url: location.hash || location.pathname,
      hasLogin: !!document.querySelector('input[type=password]'),
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 90),
    }
  })
  // 文件名-内容对齐校验：落地路由与预期不符即记缺陷（防 ui-26 错拍类复发）
  // 校验前剥 hash 前缀（probe.url 形如 #/app，expectRoute 写 ^/app——直接测必误报，
  // run5 09-30 实锤 DEFECT[route-mismatch] 全是校验器自身假红）
  const landed = (probe.url || '').replace(/^#/, '')
  if (opts.expectRoute && !new RegExp(opts.expectRoute).test(landed)) {
    console.error(`DEFECT[route-mismatch]: ${name} 落地 ${probe.url} ≠ 预期 /#${opts.expectRoute}`)
  }
  console.log('shot:', name, JSON.stringify(probe))
}
// 同画面去重：全量拍完按文件字节哈希报告重复帧（采集计划收敛依据）
async function reportDuplicateFrames() {
  const { createHash } = await import('node:crypto')
  const { readdirSync, statSync } = await import('node:fs')
  const bySize = new Map()
  try {
    for (const f of readdirSync(OUT)) {
      if (!f.endsWith('.png')) continue
      const p = `${OUT}/${f}`
      const { readFileSync } = await import('node:fs')
      const h = createHash('md5').update(readFileSync(p)).digest('hex')
      bySize.set(h, (bySize.get(h) || []).concat(f))
    }
  } catch { return }
  const dups = [...bySize.values()].filter((v) => v.length > 1)
  if (dups.length) console.warn('WARN[duplicate-frames]:', JSON.stringify(dups))
}

/** 严格"房间真打开"判据：见到真实消息气泡（≥3 条长文本）才算开房成功。
 *  消息行选择器=.mx_EventTile（MatrixMessageItem 根类，element-web 风格）——
 *  run7 实锤双坑：①深链只渲染壳（V5 §8.4 深链不驱动）；②旧判据 [class*=message]
 *  等命不中 mx_EventTile，守门自诞生起只不放行、永不能放行（run6 零截图隐性根因）。
 *  此判据为快门守门唯一事实源，群聊图位共用。 */
async function roomLoaded() {
  return page.evaluate(() => {
    const t = (document.body.innerText || '')
    if (/未选择会话|从左侧选择一个会话/.test(t)) return false
    const nodes = [...document.querySelectorAll('.mx_EventTile')]
    return nodes.filter(n => (n.innerText || '').trim().length > 8).length >= 3
  }).catch(() => false)
}

/** 打开本轮分析群：V5 §8.4「房间须左栏点击选择（深链不驱动）」——run7 实锤深链
 *  /app/s/room/<id> 只渲染壳不驱动画布。正道=#/app/s 会话视图 FlowNavPanel 的
 *  flow-session-<roomId> 行精确点选（矩阵房列表等 sync，run4 实测 9s 未必上列）。
 *  去噪一律 CSS 隐藏 toast，不点任何弹窗按钮（"知道了"=通知跳转劫持钮）。 */
async function openCurrentRoom() {
  const hideToasts = async () => {
    await page.addStyleTag({ content: '.n-notification,.announcement-banner{display:none!important}' }).catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
  }
  await page.goto(BASE + '/#/app/s')
  await page.waitForTimeout(9000)
  await hideToasts()
  let clicked = false
  for (let i = 0; i < 10 && !clicked; i++) {
    const row = ROOM
      ? page.locator(`[data-testid="flow-session-${ROOM}"]`).first()
      : page.locator('[data-testid="flow-cluster-chat-all"] >> text=支付收银台需求分析讨论群').first()
    if (await row.count().catch(() => 0)) {
      await row.click({ timeout: 4000 }).catch(() => {})
      await page.waitForTimeout(5500)
      await hideToasts()
      if (await roomLoaded()) clicked = true
    }
    if (!clicked) await page.waitForTimeout(2500)
  }
  if (clicked) console.log('room opened via flow-session row: ' + (ROOM || '<by-name>').slice(0, 20))
  else console.log('WARN: 本轮房间未在列表命中（sync 未达/非成员）')
  return clicked
}

// ── 驾驶舱全景 + P5 概览 ──
await shot('ui-03-cockpit', '/app', { wait: 6000, expect: '[data-testid="wb-rail-left"], .ia-shell, main', expectRoute: '^/app', expectText: '\\d+ 人 · \\d+ 智能体 · \\d+ 机器' })
await shot('ui-03b-dash', '/app/dash', { wait: 5000, expect: '[data-testid*="dash"], .ia-overview, main', expectRoute: '/app' })

// ── 补遗④第 3 项：驾驶舱回归（第 4 步）——页头「任务」「在线」chips 下拉逐项验证 ──
// 合格线：任务计数=看板实况（推演后>0）；在线三数（人/智能体/机器）各>0，恒零即 DEFECT（准出阻断）；
// 两组下拉可开（可点选跳转的入口在面板内，截屏留档）。
if (!only || only === 'sit-chips') await guarded('sit-chips', async () => {
  await page.goto(BASE + '/#/app')
  await page.waitForTimeout(7000)
  await page.addStyleTag({ content: '.n-notification,.announcement-banner{display:none!important}' }).catch(() => {})
  // ① 任务 chip：计数与状态下拉开面板
  const tasksChip = page.locator('[data-testid="sit-tasks"]')
  if (!(await tasksChip.isVisible({ timeout: 6000 }).catch(() => false))) throw new Error('sit-tasks chip 不可见')
  const tasksText = (await tasksChip.innerText()).replace(/\s+/g, ' ').trim()
  const taskNum = parseInt((tasksText.match(/(\d+)/) || ['0'])[1], 10)
  console.log(`[sit] 任务 chip 文本="${tasksText}" 计数=${taskNum}`)
  await tasksChip.click(); await page.waitForTimeout(1500)
  const tasksPanel = page.locator('[data-testid="sit-panel-tasks"]')
  const panelOk = await tasksPanel.isVisible().catch(() => false)
  if (!panelOk) throw new Error('任务下拉面板未打开（下拉不可点选）')
  await page.screenshot({ path: `${OUT}/ui-04a-sit-tasks.png` })
  console.log('shot: ui-04a-sit-tasks')
  if (taskNum <= 0) console.error('DEFECT[sit-tasks-zero]: 任务计数=0（应=看板实况，推演后须>0）')
  await page.locator('[data-testid="sit-panel-close"]').click().catch(() => page.keyboard.press('Escape'))
  await page.waitForTimeout(600)
  // ② 在线 chip：三数解析 + 下拉
  const onlineChip = page.locator('[data-testid="sit-online"]')
  const onlineText = (await onlineChip.innerText()).replace(/\s+/g, ' ').trim()
  const nums = (onlineText.match(/\d+/g) || []).map(Number)
  const total = nums[0] ?? 0
  const detail = nums.slice(1)
  console.log(`[sit] 在线 chip 文本="${onlineText}" 总数=${total} 明细=${JSON.stringify(detail)}`)
  if (total <= 0 || (detail.length >= 3 && detail.slice(0, 3).every((n) => n <= 0))) {
    console.error(`DEFECT[sit-online-zero]: 在线恒零（文本="${onlineText}"）——补遗④第 3 项准出阻断`)
  }
  await onlineChip.click(); await page.waitForTimeout(1500)
  const onlinePanel = page.locator('[data-testid="sit-panel-online"]')
  if (!(await onlinePanel.isVisible().catch(() => false))) throw new Error('在线下拉面板未打开')
  await page.screenshot({ path: `${OUT}/ui-04b-sit-online.png` })
  console.log('shot: ui-04b-sit-online')
})

// ── 补遗④第 2/4/5 项产品面：P6 账户管理 / P7 应用资产 / P8 组织（保存即 git 提交，R13）──
await shot('ui-01-accounts', '/app/accounts', { wait: 4500, expect: 'main', expectRoute: '/app/accounts' })
await shot('ui-gov-center', '/app/gov', { wait: 5500, expect: 'main', expectRoute: '/app/gov' })


// ── 分析群：全景 + P4③ 时间线特写 + 成员面板（全量预邀实证）──
if (await openCurrentRoom()) {
  await page.waitForTimeout(2500)
  // 空态拒拍守门（run5 09-40 覆盖事故根治，R12）：房间画布必须见到真实消息气泡
  // （.mx_EventTile 长文本行）才落盘，否则拒拍保留旧图。判据单一事实源=roomLoaded()。
  if (!(await roomLoaded())) {
    console.error('DEFECT[shutter-gate]: ui-08-groupchat 会话画布为空态（房间不可达/已清）——拒拍，保留既有截图')
  } else {
    await page.screenshot({ path: `${OUT}/ui-08-groupchat.png` })
    console.log('shot: ui-08-groupchat')
  }

  // P4③：右栏「任务流转」节区域特写（存在性随消息流；缺失时也截全栏供审计）
  if (!only || only === 'ui-08c-flow-timeline') {
    const sec = page.locator('[data-testid="tdp-flow-sec"]')
    if (await sec.isVisible().catch(() => false)) {
      await sec.scrollIntoViewIfNeeded().catch(() => {})
      await page.waitForTimeout(600)
      await sec.screenshot({ path: `${OUT}/ui-08c-flow-timeline.png` })
      console.log('shot: ui-08c-flow-timeline (P4③ 时间线出数)')
    } else {
      const tdp = page.locator('[data-testid="tdp"]')
      if (await tdp.isVisible().catch(() => false)) {
        await tdp.screenshot({ path: `${OUT}/ui-08c-flow-timeline.png` })
        console.log('shot: ui-08c-flow-timeline (tdp 全栏——时间线节未出，如实留档)')
      } else {
        console.log('WARN: tdp 面板不可见，跳过 ui-08c')
      }
    }
  }

  // 成员面板：点开成员列表截图（预邀实证；按钮文案自适应兜底两轮）
  if (!only || only === 'ui-08d-members') {
    for (const label of ['成员', 'Members', '参与者']) {
      const btn = page.locator(`button:has-text("${label}")`).first()
      if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(1500); break }
    }
    await page.screenshot({ path: `${OUT}/ui-08d-members.png` })
    console.log('shot: ui-08d-members')
  }

  // 消息卡链接特写（滚动到底部最新派发/回执）
  if (!only || only === 'ui-08b-msgcard') {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(800)
    await page.evaluate(() => {
      const sc = [...document.querySelectorAll('[class*=timeline],[class*=messages]')].pop()
      if (sc) sc.scrollTop = sc.scrollHeight
    })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/ui-08b-msgcard.png` })
    console.log('shot: ui-08b-msgcard')
  }
} else {
  console.log('WARN: 本轮房间未在列表命中')
}

// ── 看板 RACI + 等您操作 ──
await shot('ui-10-kanban', '/app/board', { wait: 4500, expect: '.kanban-board, [class*="kanban"], main', expectRoute: '/app/board' })

// ── 收件箱：三档分区全景 + V4.1 抽检区特写 ──
await shot('ui-20-inbox', '/app/inbox', { wait: 4500, expect: 'main', expectRoute: '/app/inbox' })
if (!only || only === 'ui-20b-spotcheck') {
  const sec = page.locator('[data-testid="approval-spotcheck"]')
  if (await sec.isVisible().catch(() => false)) {
    await sec.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(600)
    await sec.screenshot({ path: `${OUT}/ui-20b-spotcheck.png` })
    console.log('shot: ui-20b-spotcheck (V4.1 抽检区)')
  } else {
    console.log('WARN: 抽检区不可见（本轮尚无自动放行条目或区域为空）——ui-20-inbox 全景已含该区状态')
  }
}

// ── IDE 任务简报 + 治理面 ──
const ideTask = process.env.IDE_TASK || state.card_review_rfd || ''
await shot('ui-25-ide', `/app/ide${ideTask ? `?task=${ideTask}` : ''}`, { wait: 6000, expect: 'main', expectRoute: '/app/ide' })
// ui-25-models：IDE 内 Models 页（模型设置面）——run7 补位（原仅 capture-ui.mjs 旧脚本有，
// 旧脚本 OUT 落全局目录且房间硬编码，不可用于 run 轮；此位迁移入 RUN_ID 参数化链）
await shot('ui-25-models', '/app/ide', {
  wait: 3500,
  after: async () => {
    const m = page.locator('text=/^Models$|^模型$/').first()
    if (await m.isVisible().catch(() => false)) { await m.click().catch(() => {}); await page.waitForTimeout(2500) }
  },
})
// ui-26-report：第 26 步交付物=本报告自身——直拍生成的 simulation-report.html 首屏（治"拍成治理中心"错拍）
if (!only || only === 'ui-26-report') {
  await page.goto('file://' + RUN_DIR + '/evidence/simulation-report.html', { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/ui-26-report.png` })
  console.log('shot: ui-26-report (report file first screen)')
}

// ── 补遗④：R14 skill 过程位 + 流转衔接现场位（缺席记 DEFECT 不炸）──
async function guarded(name, fn) {
  try { await fn() } catch (e) { console.error(`DEFECT[capture-${name}]: ${e.message}`) }
}
async function renderTextFrame(name, title, body) {
  await page.setContent(
    `<div style="font:12px ui-monospace;padding:0"><div style="font:600 14px -apple-system;padding:10px 16px;background:#f3f4f6">${title}</div>`
    + `<pre style="font:12px ui-monospace;padding:16px;white-space:pre-wrap;margin:0">${body.replace(/</g, '&lt;')}</pre></div>`,
    { waitUntil: 'load' })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`shot: ${name}`)
}
// R14① 生成过程·定义帧：swarm yuan 生成器定义（扫描→资产梳理→产出的配方真容）
if (!only || only === 'skill-gen') await guarded('skill-gen', async () => {
  const { existsSync, readFileSync, readdirSync } = await import('node:fs')
  const gen = process.env.SWARM_YUAN_SKILL || `${process.env.HOME}/.zcode/skills/swarm-yuan/SKILL.md`
  const cands = [gen, '/Volumes/nvme2230/lab/.wxwork/v5run4/scripts/aipay/skills/aipaydev-dev/SKILL.md']
  const p = cands.find((c) => c && existsSync(c))
  if (!p) throw new Error('swarm-yuan 生成器定义不可寻')
  let body = readFileSync(p, 'utf8')
  // 装配脚印：每 profile 的 aipaydev-dev 副本计数（生成→分发链真值）
  const profDir = '/Volumes/nvme2230/lab/ncwk-sim-mux/hermes/profiles'
  if (existsSync(profDir)) {
    const copies = readdirSync(profDir).filter((u) => existsSync(`${profDir}/${u}/skills/aipaydev-dev/SKILL.md`))
    body = `# 装配脚印（真值）\n${copies.length} 个 profile 装有 aipaydev-dev skill 副本：${copies.slice(0, 12).join(' ')}${copies.length > 12 ? ' …' : ''}\n\n# 生成器/产出定义真容（${p}）\n` + body
  }
  await renderTextFrame('ui-skill-gen', `R14·生成过程（定义真容）：${p}`, body.slice(0, 5000))
})
// R14② 产出·文件树帧 + ③ 内容帧：本轮 xxx-dev skill 真容（file:// 直读真实产物）
if (!only || only === 'skill-views') await guarded('skill-views', async () => {
  const { readdirSync, readFileSync, existsSync, statSync } = await import('node:fs')
  const skillRoots = [`${RUN_DIR}/workspaces`, '/Volumes/nvme2230/lab/ncwk-sim-mux/hermes/profiles']
  const cand = []
  const walk = (d, depth) => { if (depth > 4 || !existsSync(d) || cand.length > 8) return
    for (const f of readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) {
        walk(`${d}/${f.name}`, depth + 1)  // 无条件递归（skills 命中也要进去找 SKILL.md）
        if (/skill|\.swarm|yuan/i.test(f.name)) cand.push(`${d}/${f.name}`)
      } else if (/SKILL\.md$/.test(f.name)) cand.push(`${d}/${f.name}`)
    } }
  for (const r of skillRoots) walk(r, 0)
  const skillMd = cand.find((c) => /aipaydev-dev\/SKILL\.md$/.test(c)) || cand.find((c) => c.endsWith('SKILL.md'))
  if (!skillMd) throw new Error('未找到 xxx-dev SKILL.md（walk ' + skillRoots.join(',') + '）')
  // 文件树帧：skill 目录 + 一层子文件与大小
  const dir = skillMd.slice(0, skillMd.lastIndexOf('/'))
  const tree = readdirSync(dir, { withFileTypes: true }).map((f) => {
    const fp = `${dir}/${f.name}`
    const sz = f.isDirectory() ? `${readdirSync(fp).length} 项` : `${statSync(fp).size}B`
    return `${f.isDirectory() ? 'd' : '-'} ${sz.padStart(8)}  ${f.name}`
  }).join('\n')
  await renderTextFrame('ui-skill-tree', `R14·产出文件树：${dir}`, tree)
  // 内容帧
  await renderTextFrame('ui-skill-content', `R14·产出内容：${skillMd}`, readFileSync(skillMd, 'utf8').slice(0, 5000))
})
// R14④⑤ 驱动开发过程两帧：skill 五步能力调用现场（agent 真实产出物引用该 skill 的痕迹）
if (!only || only === 'skill-drive') await guarded('skill-drive', async () => {
  const { readdirSync, readFileSync, existsSync, statSync } = await import('node:fs')
  // roots 修正（run5 R14 实锤缺席根因）：原只搜 RUN_DIR/workspaces（不存在——工作区在
  // SIM_ROOT/workspaces）与 boards；swarm yuan 生成的 aipaydev-dev 技能真容在
  // hermes/profiles/<profile>/skills/aipaydev-dev/（N 份装配副本），驱动现场痕迹
  // （分支提交/测试输出）在 SIM_ROOT/workspaces/<user>/aipaydev。
  const roots = [`${RUN_DIR}/workspaces`, '/Volumes/nvme2230/lab/ncwk-sim-mux/workspaces', '/Volumes/nvme2230/lab/ncwk-sim-mux/hermes/profiles', '/Volumes/nvme2230/lab/ncwk-sim-mux/hermes/kanban/boards']
  const hits = []
  const small = (p) => { try { return statSync(p).size < 400000 } catch { return false } }
  const grep = (d, depth) => { if (depth > 4 || !existsSync(d) || hits.length > 6) return
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const fp = `${d}/${f.name}`
      if (f.isDirectory()) { if (!/node_modules|\.git/.test(f.name)) grep(fp, depth + 1); continue }
      if (!/\.(md|txt|log|json)$/.test(f.name) || !small(fp)) continue
      try { const t = readFileSync(fp, 'utf8')
        if (/xxx-dev|五步能力/.test(t)) hits.push({ fp, excerpt: t.slice(Math.max(0, t.search(/xxx-dev|五步能力/) - 200), 1800) })
      } catch { /* 二进制/权限跳过 */ }
    } }
  for (const r of roots) grep(r, 0)
  if (hits.length === 0) throw new Error('workspaces/boards 未见 xxx-dev 或五步能力引用痕迹（skill 驱动开发现场缺席）')
  await renderTextFrame('ui-skill-drive-a', `R14·驱动现场①：${hits[0].fp}`, hits[0].excerpt)
  if (hits[1]) await renderTextFrame('ui-skill-drive-b', `R14·驱动现场②：${hits[1].fp}`, hits[1].excerpt)
})
// 流转现场①：群内缺陷回流/提测流转消息（群视图滚动至含 FAIL/缺陷/提测 关键词可见）
if (!only || only === 'flow-defect') await guarded('flow-defect', async () => {
  if (!ROOM) throw new Error('无 room_analysis')
  await page.goto(BASE + '/#/app')
  await page.waitForTimeout(6000)
  const hit = page.locator('text=/FAIL|缺陷|提测|READY-GATE/').first()
  if (await hit.isVisible({ timeout: 8000 }).catch(() => false)) {
    await page.screenshot({ path: `${OUT}/ui-flow-defect.png` })
    console.log('shot: ui-flow-defect')
  } else throw new Error('群内未见流转关键词消息')
})
// 流转现场②：发布冻结/解冻（REL-* 关联卡状态或收件箱决策历史；无冻结事件=如实 WARN）
if (!only || only === 'flow-freeze') await guarded('flow-freeze', async () => {
  await page.goto(BASE + '/#/app/board')
  await page.waitForTimeout(5500)
  const rel = page.locator('text=/REL-|blocked|冻结/').first()
  if (await rel.isVisible({ timeout: 6000 }).catch(() => false)) {
    await rel.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${OUT}/ui-flow-freeze.png` })
    console.log('shot: ui-flow-freeze')
  } else console.log('WARN[flow-freeze]: 本轮无 REL- 冻结/解冻现场（G5 首过无冻结事件时为合法缺席）')
})
// 流转现场③：验收对账（UAT 逐条判词真容——中央仓验收报告渲染帧）
if (!only || only === 'flow-uat') await guarded('flow-uat', async () => {
  const { existsSync, readFileSync, readdirSync } = await import('node:fs')
  const accDir = '/Volumes/nvme2230/lab/ncwk-sim-mux/central/aipaydev/docs/acceptance'
  if (!existsSync(accDir)) throw new Error('中央仓 acceptance 目录不存在')
  const f = readdirSync(accDir).filter((n) => /RFD-001/.test(n)).sort().pop()
  if (!f) throw new Error('无 RFD-001 验收报告')
  await renderTextFrame('ui-flow-uat', `流转·验收对账：docs/acceptance/${f}`, readFileSync(`${accDir}/${f}`, 'utf8').slice(0, 5000))
})
await reportDuplicateFrames()
await browser.close()
console.log('capture-v42 done')
