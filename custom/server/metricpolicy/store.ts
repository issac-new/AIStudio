/**
 * 度量登记簿存储（C 组）——内置派生指标 + 用户登记指标合并读。
 *
 * 与其余新域同款约定：env 显式 > ~/.hermes-web-ui/；读侧 fail-soft。
 */
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import type { MetricDef } from './types'

function storeDir(): string {
  const env = process.env.HERMES_METRIC_POLICY_DIR?.trim()
  if (env) return resolve(env)
  return underWebUi('metric-policy')
}

function storePath(): string {
  return join(storeDir(), 'metrics.json')
}

interface StoreShape {
  metrics: MetricDef[]
}

/**
 * 内置派生指标登记。
 *
 * consumers 一律为空——这不是遗漏：它们确实还没有绑定过任何决策，页签上会如实标为
 * 装饰。等它们真的改变过一次决策，由使用方登记 decisionRef（这是本域存在的意义）。
 */
export const BUILTIN_METRICS: MetricDef[] = [
  {
    key: 'measure/autonomy-rate',
    namespace: 'measure',
    title: '自主运营比例',
    definition: 'AL>=4 配置目标承接的任务数 / 已派发任务总数',
    sources: ['autonomygov/scale', 'kanban tasks'],
    consumers: [],
    version: 1,
    builtin: true,
  },
  {
    key: 'measure/human-machine-ratio',
    namespace: 'measure',
    title: '人机配比',
    definition: 'agent 身份承接任务数 / human 身份承接任务数',
    sources: ['agentidentity/identities', 'kanban tasks'],
    consumers: [],
    version: 1,
    builtin: true,
  },
  {
    key: 'measure/human-minutes-per-task',
    namespace: 'measure',
    title: '单任务人时',
    definition: '任务 started→completed 时长中位数 / 60（分钟）',
    sources: ['kanban tasks (started_at, completed_at)'],
    consumers: [],
    version: 1,
    builtin: true,
  },
  {
    key: 'measure/rework-rate',
    namespace: 'measure',
    title: '返工率（代理口径）',
    definition: '（crashed + gave_up + respawn_guarded）/ completed',
    sources: ['kanban task_events'],
    consumers: [],
    version: 1,
    builtin: true,
  },
  {
    key: 'measure/skill-declaration-coverage',
    namespace: 'measure',
    title: '技能声明覆盖率',
    definition: '声明了 skills 的任务数 / 任务创建事件总数',
    sources: ['kanban task_events (kind=created)'],
    consumers: [],
    version: 1,
    builtin: true,
  },
  {
    key: 'measure/interface-count',
    namespace: 'measure',
    title: '接口数（反向指标）',
    definition: '每个任务为取上下文需要跨越的系统数均值（越小越好）',
    sources: [],
    consumers: [],
    version: 1,
    builtin: true,
  },
]

function isUsableMetric(v: unknown): v is MetricDef {
  if (!v || typeof v !== 'object') return false
  const m = v as Partial<MetricDef>
  return typeof m.key === 'string' && typeof m.title === 'string'
    && typeof m.definition === 'string' && Array.isArray(m.sources)
    && Array.isArray(m.consumers) && typeof m.version === 'number'
    && (m.namespace === 'measure' || m.namespace === 'settle')
}

function loadStored(): MetricDef[] {
  const file = storePath()
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<StoreShape>
    if (parsed && Array.isArray(parsed.metrics)) return parsed.metrics.filter(isUsableMetric)
  } catch { /* 坏档：隔离留档再从空起步 */ }
  try { renameSync(file, `${file}.corrupt-${Date.now()}`) } catch { /* 隔离失败不阻断 */ }
  return []
}

function saveStored(metrics: MetricDef[]): void {
  mkdirSync(storeDir(), { recursive: true })
  atomicWriteJson(storePath(), { metrics })
}

/** 合并读：内置 + 存储（同 key 时存储覆盖内置，允许补 consumers 与 sources）。 */
export function listMetrics(): MetricDef[] {
  const stored = loadStored()
  const byKey = new Map(BUILTIN_METRICS.map((m) => [m.key, m]))
  for (const m of stored) byKey.set(m.key, m)
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export function getMetric(key: string): MetricDef | null {
  return listMetrics().find((m) => m.key === key) ?? null
}

/** upsert 到存储层（内置项也会写入存储以承载 consumers/version 变更）。 */
export function putMetric(def: MetricDef): MetricDef {
  const stored = loadStored()
  const idx = stored.findIndex((m) => m.key === def.key)
  if (idx >= 0) stored[idx] = def
  else stored.push(def)
  saveStored(stored)
  return def
}

/**
 * 删除存储层覆盖。内置指标删掉覆盖后回到内置定义（不会真的消失）——
 * 这是刻意的：口径不能因为「不想看见」而消失。
 */
export function removeMetric(key: string): boolean {
  const stored = loadStored()
  const idx = stored.findIndex((m) => m.key === key)
  if (idx < 0) return false
  stored.splice(idx, 1)
  saveStored(stored)
  return true
}

/** 测试隔离。 */
export function _useMetricPolicyDirForTests(dir: string): void {
  process.env.HERMES_METRIC_POLICY_DIR = dir
}

export function _resetMetricPolicyDirForTests(): void {
  delete process.env.HERMES_METRIC_POLICY_DIR
}
