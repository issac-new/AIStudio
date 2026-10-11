/**
 * cashier-preview/capture.mjs — 收银台预览壳真实走查采集（方案 §5.4.4 产品成效帧）
 * 用法：node capture.mjs --out <evidence/product-outcome 目录> [--url http://127.0.0.1:8949]
 * 产出：cashier-p1-order.png / cashier-p2-paid.png / cashier-p3-idempotent.png
 * 帧为「补拍」性质（收尾后采集）时，provenance 由调用方随行登记（纪律 40⑩：图注须标注补拍时点）。
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const out = resolve(flag('--out', '.'))
const base = flag('--url', 'http://127.0.0.1:8949')
const channel = flag('--channel', 'WECHAT')
mkdirSync(out, { recursive: true })

const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const c = await b.newContext({
  viewport: { width: 430, height: 932 }, deviceScaleFactor: 2,
  locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
})
const p = await c.newPage()
await p.goto(base + '/', { waitUntil: 'networkidle' })
if (channel === 'ALIPAY') await p.click('#ch-ali')
await p.click('#btnCreate')
await p.waitForSelector('#p1:not([style*="none"])', { timeout: 15000 })
await p.waitForTimeout(600)
const payId1 = (await p.innerText('#o-id')).trim()
await p.screenshot({ path: out + `/cashier-p1-order${channel === 'ALIPAY' ? '-alipay' : ''}.png` })
console.log('[capture] P1 收银台首页 ✓ pay_order_id=' + payId1)

await p.click('#btnPay')
await p.waitForSelector('#p2:not([style*="none"])', { timeout: 30000 })
await p.waitForTimeout(500)
const statusText = await p.innerText('#r-status')
if (!/SUCCESS/.test(statusText)) throw new Error('未达 SUCCESS：' + statusText)
await p.screenshot({ path: out + `/cashier-p2-paid${channel === 'ALIPAY' ? '-alipay' : ''}.png` })
console.log('[capture] P2 支付成功 ✓ ' + statusText.slice(0, 30))

if (channel !== 'ALIPAY') {
  await p.click('#btnIdem')
  await p.waitForSelector('#idem-out .tag', { timeout: 15000 })
  const idemLine = await p.innerText('#idem-out')
  if (!/同一单号 ✓ 幂等/.test(idemLine)) throw new Error('幂等断言失败：' + idemLine.replace(/\n/g, ' '))
  await p.screenshot({ path: out + '/cashier-p3-idempotent.png' })
  console.log('[capture] P3 幂等实证 ✓')
}

const provenance = `# 收银台小程序运行效果图 provenance（纪律 40⑩ 补拍标注）

- 拍摄时点：${new Date().toISOString().replace('T', ' ').slice(0, 19)}（run14 收尾后补采，补拍通道按纪律 40⑩ 开放——图注明示补拍）
- 载体声明（诚实契约）：页面层=浏览器预览渲染（微信/支付宝原生双端工程不能直接进浏览器）；
  逻辑层=交付 apps/csw-cashier-mp/shared/*.js 原样加载；接口层=交付 csw-merchant-api handleCashierRequest
  + csw-pay-core PayCoreService 真实执行；渠道端点=交付测试体系 mock-channel（本地无外呼）。
- 交付基线：feat/t_38f95020 @ fe0c968（pay-core tsc 0 错+161 测试全绿的集成尖端）
- 三帧内容：P1 收银台首页（下单成功+渠道列表）｜P2 支付结果页（PAID+渠道交易号+订单状态查询）｜P3 幂等实证（重复提交返回同一支付单号）
- 采集器：mux/cashier-preview/capture.mjs（playwright channel=chrome，zh-CN）
`
writeFileSync(out + '/cashier-frames-provenance.md', provenance)
await b.close()
console.log('[capture] 三帧+provenance 落 ' + out)
