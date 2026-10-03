// 全功能回归走查公共装具（2026-10-03 回归轮）。
// 沿用 change-gov-walkthrough.mjs 实证配方：
//   - 系统 Chrome（channel:'chrome'，隔离链 playwright 浏览器未下载）
//   - hash 路由入口 /#/（直连 /app/* 会落空）
//   - naive-ui 遮罩拦点击：clearMasks（Escape×3）+ domClick evaluate 直点
//   - 复用表单场景：第二次开表单前整页 reload（组件 showForm 状态残留）
// 截图统一落 SHOTS 目录，缺陷记录走 record()。
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

export const BASE = process.env.WALK_BASE || 'http://localhost:8689'
export const SHOTS = process.env.WALK_SHOTS || '/tmp/regression-shots'

mkdirSync(SHOTS, { recursive: true })

export async function openBrowser() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1560, height: 940 }, locale: 'zh-CN' })
  return { browser, page }
}

export class Ledger {
  constructor(surface) {
    this.surface = surface
    this.items = []
    this.shotNo = 0
  }
  record(name, ok, note = '', severity = ok ? 'info' : 'P1') {
    this.items.push({ name, ok, note, severity })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`)
  }
  defect(name, note, severity = 'P1') {
    this.items.push({ name, ok: false, note, severity })
    console.log(`DEFECT(${severity})  ${name}  — ${note}`)
  }
  async shot(page, label) {
    const n = String(++this.shotNo).padStart(2, '0')
    const path = `${SHOTS}/${this.surface}-${n}-${label}.png`
    await page.screenshot({ path, fullPage: false })
    return path
  }
  flush() {
    const out = `${SHOTS}/${this.surface}-ledger.json`
    writeFileSync(out, JSON.stringify({ surface: this.surface, items: this.items }, null, 2))
    const bad = this.items.filter((i) => !i.ok)
    console.log(`\n[ledger] ${this.surface}: ${this.items.length - bad.length} pass / ${bad.length} defect → ${out}`)
  }
}

export async function clearMasks(page) {
  for (let i = 0; i < 3 && (await page.locator('.n-modal-mask').count()) > 0; i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
}

// 遮罩免疫点击：sel 形如 'CSS' 或 'CSS::TEXT=按钮文字'（文本精确匹配）
export async function domClick(page, sel, timeout = 15000) {
  const css = sel.split('::TEXT=')[0]
  await page.locator(css).first().waitFor({ state: 'attached', timeout })
  await page.evaluate((s) => {
    const [c, textRule] = s.split('::TEXT=')
    let el = null
    if (textRule) {
      el = [...document.querySelectorAll(c)].find((e) => e.textContent.trim() === textRule)
    } else {
      el = document.querySelector(c)
    }
    if (!el) throw new Error('not found: ' + s)
    el.click()
  }, sel)
}

export async function gotoHash(page, hash, settle = 3000) {
  await page.goto(BASE + '/#/' + hash.replace(/^\/?#?\/?/, ''), { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(settle)
}

// 登录落地（dev 链 localhost 自动登录）
export async function bootApp(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
}
