import { strict as assert } from 'node:assert'
import { buildPaymentResponse } from './server.mjs'
const row = { id: 7, order_id: 'O1001', amount: 100, currency: 'CNY', status: 'CREATED' }
const res = buildPaymentResponse(row)
assert.equal(res.paymentId, 7); assert.equal(res.orderId, 'O1001'); assert.equal(res.amount, 100); assert.equal(res.currency, 'CNY'); assert.equal(res.status, 'CREATED')
process.stdout.write('unit tests: 5/5 pass\n')
process.exit(0)
