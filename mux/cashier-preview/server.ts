/**
 * cashier-preview/server.ts — 收银台小程序运行预览壳（方案 §5.4.4 业务功能实证承载形态）
 *
 * 诚实契约（图注必须同款声明）：
 *   页面层 = 浏览器预览渲染（小程序为微信/支付宝原生双端工程，不能直接进浏览器）；
 *   逻辑层 = 交付 apps/csw-cashier-mp/shared/*.js 原样加载（本服务只做 CommonJS 包裹）；
 *   核心层 = 交付 csw-pay-core PayCoreService 真实执行（下单幂等/渠道回调状态机/查询），
 *            渠道端点=交付测试体系 mock-channel（本地无外呼）。
 *
 * 已知交付缺陷（run14 收尾后发现，记档不改交付件）：交付 csw-merchant-api 的 BFF 层与
 * pay-core 接口漂移——其调用 createUnifiedOrder/camelCase 端口，pay-core 实为
 * createPaymentOrder/snake_case；且该 app 无 node_modules，集成测试从未执行故未暴露。
 * 因此本壳自带薄 BFF 翻译层直连 pay-core（按小程序 shared/api-client.js 的冻结契约
 * /bff/cashier/v1/* snake_case 信封），BFF 翻译属壳职责，核心执行仍是交付代码。
 *
 * 运行：AIPAY_ROOT=<交付 worktree> node_modules/.bin/vite-node 本文件（cwd=pay-core 目录）
 * 演示专用端点 /demo/channel-pay：驱动 mock 渠道发签名回调→pay-core 状态机转 PAID。
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const AIPAY = process.env.AIPAY_ROOT || ''
const PORT = Number(process.env.PORT || 8949)
if (!AIPAY || !existsSync(join(AIPAY, 'apps/csw-pay-core/src/service.ts'))) {
  console.error('[cashier-preview] AIPAY_ROOT 未指或结构不符（须为含 apps/ 的交付 worktree）')
  process.exit(2)
}
const pcEnv = await import(pathToFileURL(join(AIPAY, 'apps/csw-pay-core/test/helpers/test-env.js')).href)
const MCH = 'MCH001'
const env = pcEnv.buildEnv()
// id→（merchant/subject/invoke_params）登记表：GET 按 id 查询时补 merchant_id 与富化字段
const reg = new Map<string, { merchant_id: string; subject: string; invoke_params: unknown }>()

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}
function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}
const ok = (data: unknown) => ({ code: 'OK', message: 'OK', data })

createServer(async (req, res) => {
  try {
    const u = new URL(req.url || '/', 'http://localhost')
    const p = u.pathname.replace(/\/+$/, '') || '/'
    if (p === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(readFileSync(join(HERE, 'page.html'), 'utf-8'))
    }
    if (p === '/shared/bundle.js') {
      // 交付 shared 逻辑原样整包下发：每个文件按 CommonJS 包裹，内置同步 require（./name 同目录解析）
      const dir = join(AIPAY, 'apps/csw-cashier-mp/shared')
      const names = readdirSync(dir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3))
      const factory: Record<string, string> = {}
      for (const n of names) factory[n] = readFileSync(join(dir, n + '.js'), 'utf-8')
      const namesJson = JSON.stringify(names)
      const dj = JSON.stringify(factory)
      const bundle = 'window.SHARED=window.SHARED||{};(function(){var D=' + dj + ';var C={};' +
        'var N=' + namesJson + ';' +
        "function rq(s){var k=s;while(k.charAt(0)==='.'||k.charAt(0)==='/'){k=k.slice(1)}" +
        "if(k.slice(-3)==='.js'){k=k.slice(0,-3)}" +
        "if(C[k])return C[k].exports;" +
        "var m={exports:{}};C[k]=m;var f=new Function('module','exports','require',D[k]);" +
        "f(m,m.exports,function(x){return rq(x);});return m.exports;}" +
        "N.forEach(function(n){window.SHARED[n]=rq(n);});})();"
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' })
      return res.end(bundle)
    }
    // ── 薄 BFF（契约=交付 shared/api-client.js 冻结形；执行=交付 pay-core）──
    if (p === '/bff/cashier/v1/orders' && req.method === 'POST') {
      const b = JSON.parse(await readBody(req) || '{}')
      const r = await env.svc.createPaymentOrder({
        merchant_id: b.merchant_id, out_trade_no: b.out_trade_no, subject: b.subject,
        amount: b.amount, channel_hint: b.channel_hint, client_host: b.client_host,
        payer_open_id: b.channel_hint === 'ALIPAY' ? undefined : (b.payer_open_id || 'oDemoCashierPreview0001'),
      })
      reg.set(r.pay_order_id, { merchant_id: b.merchant_id, subject: b.subject, invoke_params: r.invoke_params })
      return json(res, 200, ok({
        ...r, subject: b.subject, merchant_name: '示例商户', available_channels: ['WECHAT', 'ALIPAY'],
      }))
    }
    const gById = /^\/bff\/cashier\/v1\/orders\/([^/]+)$/.exec(p)
    if (gById && req.method === 'GET') {
      const id = decodeURIComponent(gById[1])
      const info = reg.get(id)
      const r = await env.svc.queryPaymentOrder({ merchant_id: info?.merchant_id || MCH, pay_order_id: id })
      return json(res, 200, ok({ ...r, subject: info?.subject || '', merchant_name: '示例商户' }))
    }
    const gByKey = p === '/bff/cashier/v1/orders' && req.method === 'GET'
    if (gByKey) {
      const r = await env.svc.queryPaymentOrder({
        merchant_id: u.searchParams.get('merchant_id') || MCH,
        out_trade_no: u.searchParams.get('out_trade_no') || undefined,
      })
      const info = [...reg.values()].find(x => x.subject !== undefined) // 富化字段尽力而为
      return json(res, 200, ok({ ...r, subject: info?.subject || '', merchant_name: '示例商户' }))
    }
    const inv = /^\/bff\/cashier\/v1\/orders\/([^/]+)\/invoke-params$/.exec(p)
    if (inv && req.method === 'POST') {
      const id = decodeURIComponent(inv[1])
      const info = reg.get(id)
      const r = await env.svc.queryPaymentOrder({ merchant_id: info?.merchant_id || MCH, pay_order_id: id })
      return json(res, 200, ok({
        pay_order_id: id, status: r.status, channel: r.channel, invoke_params: info?.invoke_params || {},
      }))
    }
    // ── 演示专用：模拟用户在渠道侧支付成功（mock 渠道签名回调→pay-core 状态机）──
    if (p === '/demo/channel-pay' && req.method === 'POST') {
      const { out_trade_no, channel, amount, channel_status } = JSON.parse(await readBody(req) || '{}')
      const adapter = channel === 'ALIPAY' ? env.alipay : env.wechat
      const n = adapter.pushNotify({
        out_trade_no, channel_status: channel_status === 'FAILED' ? 'FAILED' : 'SUCCESS',
        channel_transaction_id: `mock-txn-${Date.now()}`,
        paid_amount: amount, paid_at: new Date().toISOString(),
      })
      const ack = await env.svc.handleChannelNotify({ channel, headers: n.headers, raw_body: n.raw_body })
      return json(res, 200, { ok: true, ack })
    }
    if (p === '/demo/close' && req.method === 'POST') {
      const { merchant_id, out_trade_no } = JSON.parse(await readBody(req) || '{}')
      const r = await env.svc.closePaymentOrder({ merchant_id, out_trade_no })
      return json(res, 200, { ok: true, ...r })
    }
    res.writeHead(404); res.end('not found')
  } catch (e) {
    console.error('[cashier-preview]', e)
    json(res, 500, { code: 'PREVIEW_ERROR', message: String(e) })
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[cashier-preview] http://127.0.0.1:${PORT} （AIPAY_ROOT=${AIPAY}）`)
  console.log('[cashier-preview] 页面层=浏览器预览渲染；逻辑层=交付 shared 原样；核心层=交付 pay-core 真实执行（BFF 翻译=壳层）')
})
