import { calcFee } from './src/fee.mjs'
import assert from 'node:assert'
assert.strictEqual(calcFee(100), 2)
assert.strictEqual(calcFee(0), 0)
console.log('2 cases ok')
