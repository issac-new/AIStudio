// 数据层。植入缺陷：payment.amount 写成分（amount * 100，单位换算时机错误），
// ledger.amount 保持元 —— 字段断言与跨表不变量双双失败，而响应构造函数不受影响。
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function openDb() {
  mkdirSync(join(import.meta.dirname, 'data'), { recursive: true })
  const db = new DatabaseSync(join(import.meta.dirname, 'data', 'payment.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL REFERENCES payment(id),
      amount REAL NOT NULL,
      currency TEXT NOT NULL
    );
  `)
  return db
}

export function insertPayment(db, { orderId, amount, currency }) {
  const status = 'CREATED'
  // ── 植入缺陷：这里把元换算成分落库；正确应为 amount ──
  const storedAmount = amount * 100
  const tx = db.prepare('INSERT INTO payment (order_id, amount, currency, status) VALUES (?, ?, ?, ?)')
  const ledger = db.prepare('INSERT INTO ledger (payment_id, amount, currency) VALUES (?, ?, ?)')
  db.exec('BEGIN')
  try {
    const info = tx.run(orderId, storedAmount, currency, status)
    ledger.run(Number(info.lastInsertRowid), amount, currency)
    db.exec('COMMIT')
    return { id: Number(info.lastInsertRowid), order_id: orderId, amount, currency, status }
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
