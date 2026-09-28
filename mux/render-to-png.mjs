// render-to-png.mjs — _render/*.html → steps/*.png（全页截图，证据图统一出炉）
// 用法：node render-to-png.mjs  （cwd 任意；路径内建）
import { chromium } from 'playwright'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const RENDER_DIR = '/Volumes/nvme2230/lab/ncwk-sim-mux/evidence/screenshots/_render'
const OUT_DIR = '/Volumes/nvme2230/lab/ncwk-sim-mux/evidence/screenshots/steps'

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await browser.newPage({ viewport: { width: 1140, height: 1200 } })
const files = readdirSync(RENDER_DIR).filter((f) => f.endsWith('.html'))
for (const f of files) {
  const id = f.replace(/\.html$/, '')
  await page.goto('file://' + join(RENDER_DIR, f))
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(OUT_DIR, `${id}.png`), fullPage: true })
  console.log('png:', id)
}
await browser.close()
console.log(`done: ${files.length} renders → PNG`)
