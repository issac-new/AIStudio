// overlay/harness/workbench：调度策略（Harmony 吸收轮 2026-11-03）。
//
// 论文消融里最反直觉的一条：整块重写 35.0 < 不演化 43.3，而「工具+技能逻辑分开演化，
// 再加动态调度」才到 76.7——调度是因子化演化里不可省的一块，独立于工具与技能逻辑。
// 本仓此前八面里没有调度面；本文件把它落成一个真实可编辑产物：
//   $HERMES_HOME/harness-schedule.json  { probeMaxTasks, probeK, probeConcurrency, retryBackoffSeconds }
// 由工作台 managed 面写入（双闸齐备才写），由一键自动探测读取——改了就真的改变行为，
// 不是只挂个名字的「假面」。
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { atomicWriteJson } from '../../lib/fs-store'
import { hermesHome } from './surface-registry'

export interface SchedulePolicy {
  /** 单次自动探测每题上限（与 auto-probe 的 maxTasks 同义）。 */
  probeMaxTasks: number
  /** 每任务采样次数 k（≥2 才有统计意义）。 */
  probeK: number
  /** 预留并发位（当前自动探测串行执行，此值只作声明与后续接线）。 */
  probeConcurrency: number
  /** 失败重试退避秒数。 */
  retryBackoffSeconds: number
}

export const DEFAULT_SCHEDULE_POLICY: SchedulePolicy = {
  probeMaxTasks: 5,
  probeK: 2,
  probeConcurrency: 1,
  retryBackoffSeconds: 30,
}

export const SCHEDULE_REL = 'harness-schedule.json'

export function scheduleFile(home = hermesHome()): string {
  return resolve(home, SCHEDULE_REL)
}

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback
  return Math.min(max, Math.max(min, n))
}

/** 归一化：缺项取默认，越界钳制（坏档由 readSchedulePolicy 隔离，不进这里）。 */
export function normalizeSchedulePolicy(input?: Partial<SchedulePolicy> | null): SchedulePolicy {
  const d = DEFAULT_SCHEDULE_POLICY
  return {
    probeMaxTasks: clampInt(input?.probeMaxTasks, d.probeMaxTasks, 1, 50),
    probeK: clampInt(input?.probeK, d.probeK, 1, 10),
    probeConcurrency: clampInt(input?.probeConcurrency, d.probeConcurrency, 1, 8),
    retryBackoffSeconds: clampInt(input?.retryBackoffSeconds, d.retryBackoffSeconds, 0, 600),
  }
}

export function validateSchedulePolicy(input: unknown): { valid: boolean; problems: string[]; policy?: SchedulePolicy } {
  if (!input || typeof input !== 'object') return { valid: false, problems: ['调度策略必须是对象'] }
  const body = input as Record<string, unknown>
  const problems: string[] = []
  const rules: Array<[string, number, number]> = [
    ['probeMaxTasks', 1, 50],
    ['probeK', 1, 10],
    ['probeConcurrency', 1, 8],
    ['retryBackoffSeconds', 0, 600],
  ]
  for (const [key, min, max] of rules) {
    const v = body[key]
    if (v == null) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) problems.push(`${key} 必须是 ${min}-${max} 的整数`)
  }
  if (problems.length) return { valid: false, problems }
  return { valid: true, problems: [], policy: normalizeSchedulePolicy(body as Partial<SchedulePolicy>) }
}

/** 读策略：文件缺席/坏档 → 默认值（坏档改名隔离，不静默覆写）。 */
export function readSchedulePolicy(home = hermesHome()): SchedulePolicy {
  const file = scheduleFile(home)
  if (!existsSync(file)) return { ...DEFAULT_SCHEDULE_POLICY }
  try {
    return normalizeSchedulePolicy(JSON.parse(readFileSync(file, 'utf8')) as Partial<SchedulePolicy>)
  } catch {
    try {
      renameSync(file, `${file}.corrupt-${Date.now()}`)
    } catch {
      /* 隔离失败也不覆写 */
    }
    return { ...DEFAULT_SCHEDULE_POLICY }
  }
}

/**
 * 确保策略文件存在（bootstrap）：managed 面写盘要求目标文件已存在，且「单文件写盘不创建新文件」。
 * 只在本工作台自己的调度策略上破例，写入缺省值 0600，返回是否新建。
 */
export function ensureScheduleFile(home = hermesHome()): { created: boolean; file: string } {
  const file = scheduleFile(home)
  if (existsSync(file)) return { created: false, file }
  mkdirSync(dirname(file), { recursive: true })
  atomicWriteJson(file, { ...DEFAULT_SCHEDULE_POLICY }, { mode: 0o600 })
  return { created: true, file }
}
