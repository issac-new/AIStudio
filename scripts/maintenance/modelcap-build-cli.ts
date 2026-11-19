// overlay/scripts/maintenance/modelcap-build-cli.ts
// 能力矩阵生产者（2026-11-19 调度智能批）：eval run → capability observations →
// matrix.json。默认 dry-run；--write 才原子落盘（MODELCAP_MATRIX_PATH 可覆盖）。
//
// 用法：
//   node scripts/maintenance/modelcap-build.mjs [--write] [--min-samples 5] [--days 30]
//   node scripts/maintenance/modelcap-build.mjs --category-map '{"task_completion":"coding"}'
import { getSet, listRuns } from '../../custom/server/eval/store'
import { observationsFromEvalRuns } from '../../custom/server/modelcap/from-eval'
import { buildMatrix } from '../../custom/server/modelcap/matrix'
import { defaultMatrixPath, saveMatrix } from '../../custom/server/modelcap/store'
import type { CapabilityCategory } from '../../custom/server/modelcap/types'
import type { EvalDimension } from '../../custom/server/eval/types'

function numberArg(name: string): number | undefined {
  const idx = process.argv.indexOf(name)
  if (idx < 0) return undefined
  const raw = process.argv[idx + 1]
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function categoryMapArg(): Partial<Record<EvalDimension, CapabilityCategory>> | undefined {
  const idx = process.argv.indexOf('--category-map')
  if (idx < 0) return undefined
  try {
    const raw = JSON.parse(process.argv[idx + 1] ?? '{}')
    return raw && typeof raw === 'object' ? raw : undefined
  } catch {
    console.error('[modelcap-build] --category-map 不是合法 JSON，忽略')
    return undefined
  }
}

function main(): void {
  const write = process.argv.includes('--write')
  const minSamples = numberArg('--min-samples') ?? 5
  const maxAgeDays = numberArg('--days')
  const now = Date.now()
  const runs = listRuns()
  const categoryMap = categoryMapArg()
  const projected = observationsFromEvalRuns({
    runs,
    setOf: getSet,
    now,
    ...(maxAgeDays ? { maxAgeDays } : {}),
    ...(categoryMap ? { categoryMap } : {}),
  })
  const built = buildMatrix(projected.observations, { minSamples, now })
  built.matrix.sources = projected.sources
  const path = write ? saveMatrix(built.matrix) : defaultMatrixPath()
  const summary = {
    dryRun: !write,
    runs: runs.length,
    observations: projected.observations.length,
    rejectedObservations: projected.rejected.length,
    rejectedMatrix: built.rejected,
    sources: projected.sources.length,
    cells: built.matrix.cells.length,
    insufficient: built.matrix.cells.filter((cell) => cell.insufficient).length,
    minSamples,
    path,
  }
  console.log(JSON.stringify(summary, null, 2))
  if (!write) console.log('[modelcap-build] dry-run；加 --write 落盘')
}

main()
