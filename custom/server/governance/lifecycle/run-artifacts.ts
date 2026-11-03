// overlay/governance 域：run 目录制品读写（四性四格补齐批 F1，2026-11-03）。
//
// 判据产物（AC 追溯、阶段交接键、姿态准入快照）必须随 run 归档，才能被报告引用与
// 事后回放。本模块统一三件事：run 名合法性、路径围栏、原子写读。
//
// 与既有实现的边界：breaker.json / release-gate.jsonl 各有自己的读写（先例在
// lifecycle/controller），本模块只服务新增制品，不改既有格式。存储选择 run 目录
// 而非数据库（spec D1），便于整轮拷贝归档。

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { isValidRun, safeRunDir, simRootOrNull } from '../../simcenter/observer-root'
import { atomicWriteJson } from '../../lib/fs-store'

export type RunFileResult<T> =
  | { available: true; path: string; doc: T }
  | { available: false; reason: string }

/** run 内文件的绝对路径；run 名非法 / SIM_ROOT 未配 / 越界一律 null。 */
export function runFilePath(run: string, ...parts: string[]): string | null {
  if (!isValidRun(run)) return null
  const root = simRootOrNull()
  if (!root) return null
  const runDir = safeRunDir(root, run)
  if (!runDir) return null
  return resolve(runDir, ...parts)
}

/** 原子写 JSON 制品；失败返回原因，不抛（调用方决定是否 400）。 */
export function writeRunJson(run: string, parts: string[], doc: unknown): { ok: true; path: string } | { ok: false; reason: string } {
  const path = runFilePath(run, ...parts)
  if (!path) return { ok: false, reason: 'run 非法或 SIM_ROOT 未配置' }
  try {
    atomicWriteJson(path, doc, { indent: 1 })
    return { ok: true, path }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

/** 读 JSON 制品；缺席不编造，返回 available:false 与原因。 */
export function readRunJson<T = unknown>(run: string, parts: string[]): RunFileResult<T> {
  const path = runFilePath(run, ...parts)
  if (!path) return { available: false, reason: 'run 非法或 SIM_ROOT 未配置' }
  if (!existsSync(path)) return { available: false, reason: `制品未采集：${parts.join('/')}` }
  try {
    return { available: true, path, doc: JSON.parse(readFileSync(path, 'utf8')) as T }
  } catch (e) {
    return { available: false, reason: `制品解析失败：${e instanceof Error ? e.message : String(e)}` }
  }
}

/** 列出某目录下的 JSON 文件名（不含扩展名，升序）；目录缺席返回空数组。 */
export function listRunJsonStems(run: string, parts: string[]): string[] {
  const dir = runFilePath(run, ...parts)
  if (!dir || !existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -'.json'.length))
      .sort()
  } catch {
    return []
  }
}
