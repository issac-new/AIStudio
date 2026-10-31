// overlay[modelcap] 矩阵聚合：把评测观测聚成 模型×类别×难度 的可路由单元格。
// 诚实边界：样本不足输出 passAt1=null（insufficient），不拿全局均值或 0 冒充。
import {
  CAPABILITY_CATEGORIES,
  MODELCAP_MATRIX_VERSION,
  MODELCAP_STALE_DAYS,
  type CapabilityCell,
  type CapabilityCategory,
  type CapabilityMatrix,
  type CapabilityObservation,
} from './types'

export interface BuildMatrixOptions {
  minSamples?: number
  staleDays?: number
  now?: number
}

export interface BuildMatrixResult {
  matrix: CapabilityMatrix
  rejected: number
}

interface Group {
  model: string
  provider: string | null
  category: CapabilityCategory
  difficulty: string | null
  passes: number
  samples: number
  updatedAt: number
  setHash: string | null
  mixedSetHash: boolean
}

function isCategory(value: unknown): value is CapabilityCategory {
  return typeof value === 'string' && (CAPABILITY_CATEGORIES as readonly string[]).includes(value)
}

export function buildMatrix(
  observations: readonly CapabilityObservation[],
  options: BuildMatrixOptions = {},
): BuildMatrixResult {
  const minSamples = options.minSamples ?? 5
  const staleDays = options.staleDays ?? MODELCAP_STALE_DAYS
  const now = options.now ?? Date.now()
  const staleMs = staleDays * 24 * 3600_000
  const groups = new Map<string, Group>()
  let rejected = 0

  for (const observation of observations) {
    if (!observation || typeof observation.model !== 'string' || !observation.model.trim()) {
      rejected += 1
      continue
    }
    if (!isCategory(observation.category)) {
      rejected += 1
      continue
    }
    const passed = observation.passed
    const total = observation.total
    if (
      !Number.isInteger(passed) || !Number.isInteger(total)
      || total <= 0 || passed < 0 || passed > total
    ) {
      rejected += 1
      continue
    }
    const at = Date.parse(observation.at)
    if (!Number.isFinite(at)) {
      rejected += 1
      continue
    }
    const provider = typeof observation.provider === 'string' && observation.provider.trim()
      ? observation.provider.trim()
      : null
    const difficulty = typeof observation.difficulty === 'string' && observation.difficulty.trim()
      ? observation.difficulty.trim().toUpperCase()
      : null
    const key = [observation.model.trim(), provider ?? '', observation.category, difficulty ?? ''].join('\u0000')
    const group = groups.get(key) ?? {
      model: observation.model.trim(),
      provider,
      category: observation.category,
      difficulty,
      passes: 0,
      samples: 0,
      updatedAt: 0,
      setHash: null,
      mixedSetHash: false,
    }
    group.passes += passed
    group.samples += total
    group.updatedAt = Math.max(group.updatedAt, at)
    const setHash = typeof observation.setHash === 'string' && observation.setHash.trim()
      ? observation.setHash.trim()
      : null
    if (setHash) {
      if (group.setHash && group.setHash !== setHash) group.mixedSetHash = true
      else if (!group.setHash) group.setHash = setHash
    }
    groups.set(key, group)
  }

  const cells: CapabilityCell[] = [...groups.values()].map((group) => ({
    model: group.model,
    provider: group.provider,
    category: group.category,
    difficulty: group.difficulty,
    samples: group.samples,
    passes: group.passes,
    passAt1: group.samples >= minSamples ? group.passes / group.samples : null,
    // 多评测集混合时不给指纹，避免把不可比的样本合并后仍宣称同一考卷。
    setHash: group.mixedSetHash ? null : group.setHash,
    updatedAt: new Date(group.updatedAt).toISOString(),
    stale: now - group.updatedAt > staleMs,
    insufficient: group.samples < minSamples,
  }))

  cells.sort((a, b) =>
    a.category.localeCompare(b.category)
    || (a.difficulty ?? '').localeCompare(b.difficulty ?? '')
    || (b.passAt1 ?? -1) - (a.passAt1 ?? -1)
    || a.model.localeCompare(b.model))

  return {
    matrix: {
      version: MODELCAP_MATRIX_VERSION,
      generatedAt: new Date(now).toISOString(),
      minSamples,
      cells,
      sources: [],
    },
    rejected,
  }
}

/** 严格解析矩阵文件；结构不对返回 null（调用方按 available:false 处理，不猜）。 */
export function parseMatrix(raw: unknown): CapabilityMatrix | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (value.version !== MODELCAP_MATRIX_VERSION) return null
  if (typeof value.generatedAt !== 'string' || Number.isNaN(Date.parse(value.generatedAt))) return null
  if (!Number.isInteger(value.minSamples) || (value.minSamples as number) < 1) return null
  if (!Array.isArray(value.cells)) return null
  const cells: CapabilityCell[] = []
  for (const item of value.cells) {
    if (!item || typeof item !== 'object') return null
    const cell = item as Record<string, unknown>
    if (typeof cell.model !== 'string' || !cell.model) return null
    if (!isCategory(cell.category)) return null
    if (!Number.isInteger(cell.samples) || (cell.samples as number) < 0) return null
    if (!Number.isInteger(cell.passes) || (cell.passes as number) < 0) return null
    if ((cell.passes as number) > (cell.samples as number)) return null
    if (cell.passAt1 !== null && (typeof cell.passAt1 !== 'number' || !Number.isFinite(cell.passAt1))) return null
    if (typeof cell.updatedAt !== 'string' || Number.isNaN(Date.parse(cell.updatedAt))) return null
    if (typeof cell.stale !== 'boolean' || typeof cell.insufficient !== 'boolean') return null
    cells.push({
      model: cell.model,
      provider: typeof cell.provider === 'string' ? cell.provider : null,
      category: cell.category,
      difficulty: typeof cell.difficulty === 'string' ? cell.difficulty : null,
      samples: cell.samples as number,
      passes: cell.passes as number,
      passAt1: cell.passAt1 as number | null,
      setHash: typeof cell.setHash === 'string' ? cell.setHash : null,
      updatedAt: cell.updatedAt,
      stale: cell.stale,
      insufficient: cell.insufficient,
    })
  }
  return {
    version: MODELCAP_MATRIX_VERSION,
    generatedAt: value.generatedAt,
    minSamples: value.minSamples as number,
    cells,
    sources: Array.isArray(value.sources) ? value.sources.filter((s): s is string => typeof s === 'string') : [],
  }
}
