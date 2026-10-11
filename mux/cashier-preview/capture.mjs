/**
 * cashier-preview/capture.mjs — 收银台预览壳真实走查采集（方案 §5.4.4 产品成效帧·系列完整性）
 * 用法：node capture.mjs --out <evidence/product-outcome 目录> [--url …] [--channel WECHAT|ALIPAY] [--scenario success|fail|closed]
 * 场景与帧名（交付 status-mapper 三态契约：SUCCESS/FAILED 可重试/CLOSED 不可重试）：
 *   success → cashier-p1-order[-alipay].png + cashier-p2-paid[-alipay].png（+微信程 cashier-p3-idempotent.png）
 *   fail    → cashier-p2-fail-retry.png（支付失败+重试按钮+返回商户）
 *   closed  → cashier-p2-closed.png（订单已关闭不可重试）
 * 全部整页截图（fullPage）保证布局完整。补拍帧 provenance 随行登记（纪律 40⑩）。
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const out = resolve(flag('--out', '.'))
const base = flag('--url', 'http://127.0.0.1:8949')
const channel = flag('--channel', 'WECHAT')
const scenario = flag('--scenario', 'success')
const ali = channel === 'ALIPAY' ? '-alipay' : ''
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

if (scenario === 'success') {
  const payId1 = (await p.innerText('#o-id')).trim()
  await p.screenshot({ path: `${out}/cashier-p1-order${ali}.png`, fullPage: true })
  console.log('[capture] P1 收银台首页 ✓ pay_order_id=' + payId1)
  await p.click('#btnPay')
  await p.waitForSelector('#p2:not([style*="none"])', { timeout: 30000 })
  await p.waitForTimeout(500)
  const statusText = await p.innerText('#r-status')
  if (!/SUCCESS/.test(statusText)) throw new Error('未达 SUCCESS：' + statusText)
  await p.screenshot({ path: `${out}/cashier-p2-paid${ali}.png`, fullPage: true })
  console.log('[capture] P2 支付成功 ✓')
  if (channel !== 'ALIPAY') {
    await p.click('#btnIdem')
    await p.waitForSelector('#idem-out .tag', { timeout: 15000 })
    const idemLine = await p.innerText('#idem-out')
    if (!/同一单号 ✓ 幂等/.test(idemLine)) throw new Error('幂等断言失败：' + idemLine.replace(/\n/g, ' '))
    await p.screenshot({ path: `${out}/cashier-p3-idempotent.png`, fullPage: true })
    console.log('[capture] P3 幂等实证 ✓')
  }
} else if (scenario === 'fail') {
  await p.click('#btnPayFail')
  await p.waitForSelector('#p2:not([style*="none"])', { timeout: 30000 })
  await p.waitForSelector('#btnRetry:not([style*="none"])', { timeout: 5000 })
  const title = await p.innerText('#r-title')
  const reason = await p.innerText('#r-fail')
  if (!/支付失败/.test(title) || !/请重试/.test(reason)) throw new Error(`失败态断言失败：${title}/${reason}`)
  await p.screenshot({ path: `${out}/cashier-p2-fail-retry${ali}.png`, fullPage: true })
  console.log('[capture] P2 支付失败（可重试+返回商户）✓ ' + reason.trim())
} else if (scenario === 'closed') {
  await p.click('#btnClose')
  await p.waitForSelector('#p2:not([style*="none"])', { timeout: 30000 })
  const title = await p.innerText('#r-title')
  const reason = await p.innerText('#r-fail')
  if (!/订单已关闭/.test(title) || !/重新下单/.test(reason)) throw new Error(`关单态断言失败：${title}/${reason}`)
  const retryVisible = await p.isVisible('#btnRetry')
  if (retryVisible) throw new Error('CLOSED 态不应出现重试按钮（canRetry=false）')
  await p.screenshot({ path: `${out}/cashier-p2-closed${ali}.png`, fullPage: true })
  console.log('[capture] P2 订单已关闭（不可重试）✓')
} else {
  throw new Error('未知 scenario：' + scenario)
}

if (scenario === 'success' && channel === 'WECHAT') {
  const provenance = `# 收银台小程序运行效果图 provenance（纪律 40⑩ 补拍标注）

- 拍摄时点：${new Date().toISOString().replace('T', ' ').slice(0, 19)}（run14 收尾后补采，补拍通道按纪律 40⑩ 开放——图注明示补拍）
- 载体声明（诚实契约）：页面层=浏览器预览渲染（微信/支付宝原生双端工程不能直接进浏览器）；
  逻辑层=交付 apps/csw-cashier-mp/shared/*.js 原样加载；核心层=交付 csw-pay-core PayCoreService 真实执行
  （下单幂等/渠道回调状态机/主动关单/查询）；渠道端点=交付测试体系 mock-channel（本地无外呼）。
  结果页三态视图=交付 status-mapper.toResultView 驱动（SUCCESS/FAILED 可重试/CLOSED 不可重试）。
- 交付基线：feat/t_38f95020 @ fe0c968（pay-core tsc 0 错+161 测试全绿的集成尖端）
- 系列构成（产品功能页全状态，整页截图完整布局）：
  微信程：cashier-p1-order（P1 收银台首页）｜cashier-p2-paid（P2 支付成功）｜cashier-p2-fail-retry（P2 支付失败可重试+返回商户）｜
  cashier-p2-closed（P2 订单超时关闭不可重试）｜cashier-p3-idempotent（幂等实证=重复提交同一支付单号）
  支付宝程：cashier-p1-order-alipay（P1）｜cashier-p2-paid-alipay（P2 支付成功）
- 采集器：mux/cashier-preview/capture.mjs --channel WECHAT|ALIPAY --scenario success|fail|closed
  （playwright channel=chrome，zh-CN，fullPage 整页）
`
  writeFileSync(out + '/cashier-frames-provenance.md', provenance)
}
await b.close()
console.log(`[capture] scenario=${scenario} channel=${channel} 完成 → ${out}`)
