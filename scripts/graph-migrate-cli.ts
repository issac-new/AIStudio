// overlay/scripts/graph-migrate-cli.ts
// P1 Task 8 — 迁移 CLI 主体（经 vite-node 运行；scripts/graph-migrate.mjs 是薄壳入口）
//   node scripts/graph-migrate.mjs            # dry-run（默认）
//   node scripts/graph-migrate.mjs --apply    # 落库 .loop/graph-specs.json（幂等）
//   node scripts/graph-migrate.mjs --store-dir <dir>

import { existsSync, promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import { migrateLoops } from '../custom/server/loop/graph/graph-migrate'
import { GraphSpecStore } from '../custom/server/loop/graph/graph-rest'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const storeDirIdx = args.indexOf('--store-dir')
const storeDir = storeDirIdx >= 0 ? args[storeDirIdx + 1] : resolve(process.cwd(), '.loop')

async function loadLocalLoops(dir: string): Promise<unknown[]> {
  const loopsDir = resolve(dir, 'loops')
  if (!existsSync(loopsDir)) return []
  const entries = await fs.readdir(loopsDir)
  const loops: unknown[] = []
  for (const entry of entries) {
    const p = resolve(loopsDir, entry, 'loop.json')
    if (!existsSync(p)) continue
    try { loops.push(JSON.parse(await fs.readFile(p, 'utf-8'))) } catch { /* 损坏条目跳过 */ }
  }
  return loops
}

const loops = await loadLocalLoops(storeDir)
const specStore = new GraphSpecStore(resolve(storeDir, 'graph-specs.json'))
await specStore.load()

// 迁移只读 loops 列表产 spec（编译不执行任何节点——deps 为结构 stub）
const stubStore = { listLoops: async () => loops } as never
const compileDeps = {
  store: stubStore, dryRun: true, connectors: [],
  worktreeManager: {}, dispatcher: {}, verifier: {}, persistence: {},
} as never

const result = await migrateLoops({ store: stubStore, specStore, compileDeps, apply, log: m => console.log(m) })
console.log(`\n${apply ? 'APPLY' : 'DRY-RUN'}：共 ${result.total} 个 loop，迁移 ${result.migrated}，跳过 ${result.skipped}${apply ? '' : '（加 --apply 落库）'}`)
