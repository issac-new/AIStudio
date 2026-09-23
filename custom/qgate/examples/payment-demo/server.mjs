// Payment demo 服务（零依赖）。POST /payments → 写 payment + ledger 两表。
// 注意：本服务携带一个"植入缺陷"（见 db.mjs），用于演示 QGate 持久化门禁的价值：
// 单元测试全绿（响应构造函数正确），但持久化字段与跨表不变量是错的。
import { createServer } from 'node:http'
import { openDb, insertPayment } from './db.mjs'

const PORT = 8901
const db = openDb()

export function buildPaymentResponse(row) {
  // 纯函数：响应契约。unit.test.mjs 只测这里（不触库）——单测绿 ≠ 数据对。
  return {
    paymentId: row.id,
    orderId: row.order_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
  }
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"ok":true}')
    return
  }
  if (req.method === 'POST' && req.url === '/payments') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        const { orderId, amount, currency } = JSON.parse(body)
        if (!orderId || typeof amount !== 'number' || !currency) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end('{"error":"bad request"}')
          return
        }
        const row = insertPayment(db, { orderId, amount, currency })
        res.writeHead(201, { 'content-type': 'application/json' })
        res.end(JSON.stringify(buildPaymentResponse(row)))
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: String(e.message) }))
      }
    })
    return
  }
  res.writeHead(404)
  res.end()
})

// 仅作为主入口时监听（unit.test 只 import 纯函数，不起端口）
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`payment-demo listening on ${PORT}`)
  })
}

export { server }
