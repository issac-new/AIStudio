#!/usr/bin/env node
// diagram-export-png.mjs — export_png.py 的 Node 移植（spec 项4，决策 D-6）。
// 用仓库既有 playwright 把图 HTML 的首个 SVG 栅格化为 PNG（透明底、viewBox 精确尺寸、
// scale 1–4 倍率）。浏览器解析链：bundled chromium → 系统 Chrome（channel:'chrome'，
// walkthrough 脚本同例）→ 如实报错给安装指引。
//
// 用法：node scripts/diagram-export-png.mjs <src.html> <out.png> [scale=2]
// 退出码：0 成功；2 参数错；1 渲染/浏览器失败（stderr 含原因）。
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const NETWORK_IDLE_TIMEOUT_MS = 15_000
const FALLBACK_SETTLE_MS = 4_000

function parseScale(value) {
  const scale = Number(value ?? '2')
  if (!Number.isFinite(scale) || scale < 1 || scale > 4) {
    console.error(`scale 必须是 1–4 的数字，收到：${value}`)
    process.exit(2)
  }
  return scale
}

async function launchBrowser(chromium) {
  try {
    return await chromium.launch()
  } catch (e) {
    console.error(`[diagram-export-png] bundled chromium 不可用，回退系统 Chrome（${String(e.message).split('\n')[0]}）`)
    try {
      return await chromium.launch({ channel: 'chrome' })
    } catch (e2) {
      console.error(`[diagram-export-png] 系统 Chrome 也不可用：${String(e2.message).split('\n')[0]}`)
      console.error('[diagram-export-png] 修复：npx playwright install chromium（或装 Google Chrome）')
      process.exit(1)
    }
  }
}

async function main() {
  const [src, out, scaleArg] = process.argv.slice(2)
  if (!src || !out) {
    console.error('用法：node scripts/diagram-export-png.mjs <src.html> <out.png> [scale=2]')
    process.exit(2)
  }
  const scale = parseScale(scaleArg)
  const srcAbs = resolve(src)
  if (!existsSync(srcAbs)) {
    console.error(`源文件不存在：${srcAbs}`)
    process.exit(2)
  }

  const { chromium } = await import('playwright')
  const browser = await launchBrowser(chromium)
  try {
    const page = await browser.newPage({ deviceScaleFactor: scale })
    await page.goto(pathToFileURL(srcAbs).href + '?motion=static', { waitUntil: 'domcontentloaded' })
    try {
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
    } catch {
      // 代理网络可能拖住 webfont 子请求；取消未完成加载避免再次阻塞（export_png.py 同款语义）
      await page.evaluate('window.stop()')
      await page.waitForTimeout(FALLBACK_SETTLE_MS)
      console.error('warning: webfont request stalled - captured with fallback typography; the PNG may not match the intended fonts')
    }
    await page.evaluate('document.fonts.ready')
    const motionOk = await page.locator('[data-motion-root]').evaluateAll(
      (roots) => roots.every((root) => root.dataset.frame === 'static'),
    )
    if (!motionOk) throw new Error('motion export requires a complete static frame')
    const svg = page.locator('svg').first()
    if ((await svg.count()) === 0) throw new Error('文件中没有 SVG（只接受图产物 HTML）')
    // 一 CSS 像素=一 viewBox 单位钉死尺寸，再乘倍率（export_png.py 同款）
    await svg.evaluate((el) => {
      const box = el.viewBox.baseVal
      if (![box.width, box.height].every((n) => Number.isFinite(n) && n > 0)) {
        throw new Error('PNG export requires a nonzero finite viewBox')
      }
      for (const [axis, size] of [['width', box.width], ['height', box.height]]) {
        for (const prefix of ['', 'min-', 'max-']) {
          el.style.setProperty(prefix + axis, size + 'px', 'important')
        }
      }
    })
    // 逐祖先释放 overflow，宽图完整捕获
    await svg.evaluate((el) => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        a.style.setProperty('overflow', 'visible', 'important')
      }
    })
    await svg.screenshot({ path: resolve(out), omitBackground: true })
    console.log(`OK ${resolve(out)}`)
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(`[diagram-export-png] 失败：${e.message}`)
  process.exit(1)
})
