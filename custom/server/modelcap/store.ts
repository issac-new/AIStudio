// overlay[modelcap] 矩阵文件读写：缺省 <HERMES_HOME>/modelcap/matrix.json。
// fail-soft 读（缺席/损坏返回 available:false + reason，不猜）；写走 tmp+rename 原子替换。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseMatrix } from './matrix'
import type { CapabilityMatrix } from './types'

export interface LoadedMatrix {
  available: boolean
  path: string
  matrix: CapabilityMatrix | null
  reason?: string
}

export function defaultMatrixPath(): string {
  const override = process.env.MODELCAP_MATRIX_PATH?.trim()
  if (override) return override
  const home = process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')
  return join(home, 'modelcap', 'matrix.json')
}

export function loadMatrix(path = defaultMatrixPath()): LoadedMatrix {
  if (!existsSync(path)) {
    return { available: false, path, matrix: null, reason: 'missing' }
  }
  try {
    const parsed = parseMatrix(JSON.parse(readFileSync(path, 'utf8')))
    if (!parsed) return { available: false, path, matrix: null, reason: 'invalid' }
    return { available: true, path, matrix: parsed }
  } catch (error) {
    return {
      available: false,
      path,
      matrix: null,
      reason: `unreadable: ${(error as Error).message}`,
    }
  }
}

export function saveMatrix(matrix: CapabilityMatrix, path = defaultMatrixPath()): string {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(matrix, null, 2), 'utf8')
  renameSync(tmp, path)
  return path
}
