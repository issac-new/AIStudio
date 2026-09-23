import { createServer } from 'node:http'
import { openDb, insertPayment } from './db.mjs'

const PORT = 8902
const db = openDb()

export function buildPaymentResponse(row) {
  return { paymentId: row.id, orderId: row.order_id, amount: row.amount, currency: row.currency, status: row.status }
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') { res.writeHead(200); res.end('{"ok":true}'); return }
  if (req.method === 'POST' && req.url === '/payments') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        const { orderId, amount, currency } = JSON.parse(body)
        if (!orderId || typeof amount !== 'number' || !currency) { res.writeHead(400); res.end('{"error":"bad request"}'); return }
        const row = insertPayment(db, { orderId, amount, currency })
        res.writeHead(201, { 'content-type': 'application/json' })
        res.end(JSON.stringify(buildPaymentResponse(row)))
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e.message) })) }
    })
    return
  }
  res.writeHead(404); res.end()
})

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  server.listen(PORT, '127.0.0.1', () => console.log(`demo-persistence-mismatch on ${PORT}`))
}
export { server }
