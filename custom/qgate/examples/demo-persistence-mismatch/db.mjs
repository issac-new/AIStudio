// Golden scenario: demo-persistence-mismatch — 单测绿但持久化门禁红。
// 响应契约正确，但 amount 单位换算错误落库（payment=元×100，ledger=元）。
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function openDb() {
  mkdirSync(join(import.meta.dirname, 'data'), { recursive: true })
  const db = new DatabaseSync(join(import.meta.dirname, 'data', 'payment.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, payment_id INTEGER NOT NULL REFERENCES payment(id), amount REAL NOT NULL, currency TEXT NOT NULL);
  `)
  return db
}

export function insertPayment(db, { orderId, amount, currency }) {
  const status = 'CREATED'
  const storedAmount = amount * 100 // 植入缺陷：元→分落库
  db.exec('BEGIN')
  try {
    const info = db.prepare('INSERT INTO payment (order_id, amount, currency, status) VALUES (?, ?, ?, ?)').run(orderId, storedAmount, currency, status)
    db.prepare('INSERT INTO ledger (payment_id, amount, currency) VALUES (?, ?, ?)').run(Number(info.lastInsertRowid), amount, currency)
    db.exec('COMMIT')
    return { id: Number(info.lastInsertRowid), order_id: orderId, amount, currency, status }
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
