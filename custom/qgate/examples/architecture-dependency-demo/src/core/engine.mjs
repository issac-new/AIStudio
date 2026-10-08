// core 不许依赖 ui（forbidden: core→ui）
import { formatMoney } from '../shared/format.mjs'
export function run(amount) { return formatMoney(amount) }
// 注释里的 import 不算数：import { dash } from '../ui/dashboard.mjs'
export const note = "import { fake } from '../ui/dashboard.mjs'"
