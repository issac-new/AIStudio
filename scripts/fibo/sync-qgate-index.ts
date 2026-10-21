// 单一事实源同步：ontology-fibo.ts（正本）→ qgate fibo-mini.json（派生产物）
// 运行：npm run fibo:sync（经 tsx 解析无扩展名 TS import）
// 一致性守门：custom/server/ontology/__tests__/ontology-fibo-ssot.test.ts（漂移即红，
// 改正本后必须跑本脚本再生成，只改一边 = 下次守门测试红）
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fiboQgateIndex } from '../../custom/server/ontology/ontology-fibo'

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, '..', '..', 'custom', 'qgate', 'gate-packs', 'ontology', 'data', 'fibo-mini.json')

const idx = fiboQgateIndex()
writeFileSync(target, JSON.stringify(idx, null, 2) + '\n', 'utf8')
console.log(
  `synced ${target}: ${idx.concepts.length} concepts` +
  ` (${idx.concepts.filter((c) => c.iri).length} anchored,` +
  ` ${idx.concepts.filter((c) => !c.iri).length} engineering-approximation),` +
  ` ${idx.constraints.length} constraints`,
)
