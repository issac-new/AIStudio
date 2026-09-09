// overlay/custom/server/loop/graph/graph-migrate.ts
// P1 Task 8 — 旧 LoopInstance 数据迁移为 GraphSpec 表（GraphSpecStore 持久化）
//
// 幂等：按 spec id（`loop-<loopId>`）检测已迁移；dry-run（默认）只打印清单不落盘。
// CLI 包装：scripts/graph-migrate.mjs（node ≥22.18 类型剥离直引本文件）。

import type { LoopInstance } from '../types'
import type { LoopStateStore } from '../store/state-store'
import { compileLoopToSpec, type CompileDeps } from './graph-compiler'
import type { GraphSpecStore } from './graph-rest'

export interface MigrateOpts {
  store: LoopStateStore
  specStore: GraphSpecStore
  /** 编译所需的最小 deps（迁移只产 spec，不执行——deps 仅用于读取 gate 命令等编译参数） */
  compileDeps: CompileDeps
  apply?: boolean
  log?: (msg: string) => void
}

export interface MigrateResult {
  total: number
  migrated: number
  skipped: number
  ids: string[]
}

export async function migrateLoops(opts: MigrateOpts): Promise<MigrateResult> {
  const log = opts.log ?? (() => {})
  const loops = await opts.store.listLoops()
  const result: MigrateResult = { total: loops.length, migrated: 0, skipped: 0, ids: [] }

  for (const loop of loops) {
    const specId = `loop-${loop.id}`
    if (opts.specStore.get(specId)) {
      result.skipped++
      log(`skip ${specId}（已迁移）`)
      continue
    }
    const spec = compileLoopToSpec(loop as LoopInstance, opts.compileDeps)
    if (opts.apply) {
      await opts.specStore.save(spec)
      result.migrated++
    } else {
      result.migrated++
    }
    result.ids.push(specId)
    log(`${opts.apply ? 'migrate' : 'dry-run'} ${specId} ← loop ${loop.id} (${loop.pattern}, status=${loop.status})`)
  }
  return result
}
