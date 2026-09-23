// 单元测试：只测响应构造契约（纯函数，不触库）。全绿。
// 这正是演示要点：unit test 与实现共享"响应正确"的假设，完全没覆盖持久化正确性。
import { strict as assert } from 'node:assert'
import { buildPaymentResponse } from './server.mjs'

const row = { id: 7, order_id: 'O1001', amount: 100, currency: 'CNY', status: 'CREATED' }
const res = buildPaymentResponse(row)

assert.equal(res.paymentId, 7)
assert.equal(res.orderId, 'O1001')
assert.equal(res.amount, 100)
assert.equal(res.currency, 'CNY')
assert.equal(res.status, 'CREATED')
console.log('unit tests: 5/5 pass')
process.exit(0)
