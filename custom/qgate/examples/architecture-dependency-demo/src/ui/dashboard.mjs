import { formatMoney } from '../shared/format.mjs'
import { run } from '../core/engine.mjs'
export function dash() { return run(1) + formatMoney(2) }
