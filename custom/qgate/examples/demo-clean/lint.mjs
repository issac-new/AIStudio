// Golden scenario: demo-clean — 干净工程，门禁应 PASS。
// 代码与测试都对，lint 不触发 console.log 禁令。
import { readFileSync } from 'node:fs'
const src = readFileSync('src/index.mjs', 'utf8')
if (src.includes('console.log')) { console.error('lint: console.log forbidden'); process.exit(1) }
process.stdout.write('lint clean\n')
