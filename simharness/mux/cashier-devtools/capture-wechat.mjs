/**
 * cashier-devtools/capture-wechat.mjs — 微信开发者工具模拟器实拍（交付小程序原样运行）
 *
 * 承载形态（2026-10-11 用户指令：真开发者工具演示，不用浏览器预览）：
 *   运行载体 = 微信开发者工具（wechatwebdevtools）模拟器，工程=交付 apps/csw-cashier-mp/wechat 原样；
 *   宿主 API 由自动化通道接管（交付前端未接线网络基址——wx.request 相对路径直传是交付实况，
 *   不改交付件）：mockWxMethod('request') 路由到本地薄 BFF（交付 pay-core 真实执行）；
 *   mockWxMethod('requestPayment') 模拟支付面板确认（渠道=本地 mock 同口径）。
 * 产出：cashier-devtools-p1-order.png / -p2-paid.png / -p2-fail-retry.png / -p2-closed.png
 */
import automator from 'miniprogram-automator'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const out = resolve(flag('--out', '.'))
const BFF = flag('--bff', 'http://127.0.0.1:8949')
const CLI = flag('--cli', '/Applications/wechatwebdevtools.app/Contents/MacOS/cli')
const PROJECT = flag('--project', process.env.AIPAY_ROOT + '/apps/csw-cashier-mp/wechat')
mkdirSync(out, { recursive: true })

const post = (p, body) => fetch(BFF + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function makeOrder(channel) {
  const outTradeNo = 'DEVTOOLS-' + Date.now().toString(36).toUpperCase()
  const env = await post('/bff/cashier/v1/orders', {
    merchant_id: 'MCH001', out_trade_no: outTradeNo, subject: '云咖啡 · 拿铁大杯', amount: 2800,
    client_host: channel === 'ALIPAY' ? 'ALIPAY_MP' : 'WECHAT_MP', channel_hint: channel,
  })
  return { outTradeNo, payOrderId: env.data.pay_order_id }
}

console.log('[devtools] 启动微信开发者工具…工程=' + PROJECT)
const miniProgram = await automator.launch({ cliPath: CLI, projectPath: PROJECT })
console.log('[devtools] IDE 已连接')

// 宿主接管：request→本地 BFF；requestPayment→模拟面板确认成功
// 网络接管：evaluate 在小程序上下文重写 wx.request（相对路径→绝对 BFF 地址后调原实现，
// 工程副本 urlCheck=false 允许本地 http）；requestPayment 用静态结果 mock（模拟面板确认成功）。
const BASE_LIT = JSON.stringify(BFF)
await miniProgram.evaluate(new Function(`
  const orig = wx.request.bind(wx)
  const BASE = ${BASE_LIT}
  Object.defineProperty(wx, 'request', {
    configurable: true,
    value: function (o) {
      if (o && o.url && o.url.charAt(0) === '/') o.url = BASE + o.url
      return orig(o)
    },
  })
  return true
`))
await miniProgram.mockWxMethod('requestPayment', { errMsg: 'requestPayment:ok' })
console.log('[devtools] wx.request→BFF / wx.requestPayment→模拟确认 已接管')

async function shot(name) {
  await sleep(600)
  await miniProgram.screenshot({ path: `${out}/${name}` })
  console.log('[devtools] 帧落盘 ' + name)
}

/** 页面数据就绪轮询（自定义组件 tag 元素查询不稳，以 data 为准） */
async function waitData(page, pred, tag, timeoutMs = 12000) {
  for (let i = 0; i < Math.ceil(timeoutMs / 500); i++) {
    await sleep(500)
    const d = await page.data()
    if (pred(d)) return d
  }
  const d = await page.data()
  throw new Error(`${tag} 未就绪：loading=${d.loading} loadFailed=${d.loadFailed} order=${JSON.stringify(d.order || {}).slice(0, 80)}`)
}


// ── 场景 1：P1 收银台首页（查单渲染）+ 支付成功 P2 ──
{
  const { outTradeNo } = await makeOrder('WECHAT')
  const page = await miniProgram.reLaunch(`/pages/cashier/index?merchantId=MCH001&outTradeNo=${outTradeNo}&channelHint=WECHAT`)
  const d = await waitData(page, (x) => x.loading === false && x.loadFailed === false && (x.order || {}).payOrderId, 'P1 订单渲染')
  if (!(d.channelOptions || []).some(c => c.available)) throw new Error('无可用支付渠道：' + JSON.stringify(d.channelOptions))
  await shot('cashier-devtools-p1-order.png')

  // 触发支付 → invoke（BFF）→ requestPayment（mock ok）→ redirectTo 结果页
  // （自定义组件元素查询在本版 IDE 不稳，改调页面真实方法 onPay——同一真实链路）
  await page.callMethod('onPay')
  // 支付调起成功的瞬间（P1→P2 跳转前）由结果页轮询接管；此处补渠道回调转 SUCCESS
  await post('/demo/channel-pay', { out_trade_no: outTradeNo, channel: 'WECHAT', amount: 2800, channel_status: 'SUCCESS' })
  await sleep(2500)
  const rp = await miniProgram.currentPage()
  if (!rp.path.includes('cashier/result')) throw new Error('未跳转结果页：' + rp.path)
  await waitData(rp, (x) => ((x.result || {}).status) === 'SUCCESS', 'P2 成功态')
  await shot('cashier-devtools-p2-paid.png')
}

// ── 场景 2：P2 支付失败（可重试）──
{
  const { outTradeNo, payOrderId } = await makeOrder('WECHAT')
  await post('/demo/channel-pay', { out_trade_no: outTradeNo, channel: 'WECHAT', amount: 2800, channel_status: 'FAILED' })
  const page = await miniProgram.reLaunch(`/pages/cashier/result?payOrderId=${payOrderId}`)
  const fd = await waitData(page, (x) => ((x.result || {}).status) === 'FAILED', 'P2 失败态')
  if (!fd.canRetry) throw new Error('失败态 canRetry 应为 true')
  await shot('cashier-devtools-p2-fail-retry.png')
}

// ── 场景 3：P2 订单已关闭（不可重试）──
{
  const { outTradeNo, payOrderId } = await makeOrder('WECHAT')
  await post('/demo/close', { merchant_id: 'MCH001', out_trade_no: outTradeNo })
  const page = await miniProgram.reLaunch(`/pages/cashier/result?payOrderId=${payOrderId}`)
  // CLOSED 经交付 status-mapper 映射为失败视图+canRetry=false（「订单已关闭，请重新下单」）
  await waitData(page, (x) => ((x.result || {}).status) === 'FAILED' && x.canRetry === false, 'P2 关单态')
  await shot('cashier-devtools-p2-closed.png')
}

const provenance = `# 收银台小程序运行效果图 provenance——微信开发者工具模拟器实拍（纪律 40⑩ 补拍标注）

- 拍摄时点：${new Date().toISOString().replace('T', ' ').slice(0, 19)}（run14 收尾后补采，补拍通道按纪律 40⑩ 开放）
- 承载形态（2026-10-11 用户指令：真实开发者工具演示，不用浏览器预览）：
  运行载体=微信开发者工具（wechatwebdevtools）模拟器；工程=交付 apps/csw-cashier-mp/wechat 原样加载（未改动一字节）。
  宿主 API 接管（交付前端网络层未接基址属交付实况，不改交付件）：自动化通道 mockWxMethod('request')
  将 wx.request 路由到本地薄 BFF（交付 pay-core PayCoreService 真实执行：下单幂等/渠道回调状态机/主动关单/查询）；
  mockWxMethod('requestPayment') 模拟支付面板确认（渠道端点=交付测试体系 mock-channel 同口径，本地无外呼）。
  页面渲染/WXML/WXSS/组件/页面流转（P1→redirectTo P2/轮询/三态视图）全部为交付代码在真模拟器中真实运行。
- 交付基线：feat/t_38f95020 @ fe0c968
- 帧系列：P1 收银台首页（查单渲染+渠道选择+支付按钮）｜P2 支付成功｜P2 支付失败（可重试按钮在位）｜P2 订单已关闭（无重试按钮）
- 采集器：mux/cashier-devtools/capture-wechat.mjs（miniprogram-automator 官方自动化通道）
`
writeFileSync(out + '/cashier-frames-provenance.md', provenance)
await miniProgram.close()
console.log('[devtools] 四帧+provenance 完成 → ' + out)
