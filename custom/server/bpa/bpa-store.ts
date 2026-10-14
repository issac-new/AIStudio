/**
 * 流程架构域存储面（bpa）：架构清单（nodes+config）与 PEMM 成熟度历史。
 * 纯文件面、fail-soft 读、带界写（skillgov-store 同款纪律）。
 * env：BPA_STORE 覆盖架构文件；BPA_MATURITY_STORE 覆盖成熟度文件。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { BpaConfig, BpaNode, PemmAssessment } from './bpa-types'
import { BPA_DEFAULT_CONFIG } from './bpa-types'

function storeDir(): string {
  return join(homedir(), '.hermes-web-ui', 'overlay')
}

export function architectureFile(): string {
  return process.env.BPA_STORE?.trim()
    ? resolve(process.env.BPA_STORE.replace(/^~/, homedir()))
    : join(storeDir(), 'bpa-architecture.json')
}

export function maturityFile(): string {
  return process.env.BPA_MATURITY_STORE?.trim()
    ? resolve(process.env.BPA_MATURITY_STORE.replace(/^~/, homedir()))
    : join(storeDir(), 'bpa-maturity.json')
}

function writeJson(file: string, payload: unknown): void {
  const dir = dirname(file)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8')
}

export interface BpaArchitecture {
  config: BpaConfig
  nodes: BpaNode[]
  updatedAt: number
}

/** fail-soft 读：文件缺失/损坏 → 空架构 + 默认配置（产品面呈现「尚未搭建」态）。 */
export function readArchitecture(): BpaArchitecture {
  try {
    const raw = JSON.parse(readFileSync(architectureFile(), 'utf8')) as Partial<BpaArchitecture>
    const nodes = Array.isArray(raw.nodes) ? raw.nodes.filter((n) => n && typeof n.id === 'string' && typeof n.name === 'string' && typeof n.level === 'number') : []
    const config = { ...BPA_DEFAULT_CONFIG, ...(raw.config && typeof raw.config === 'object' ? raw.config : {}) }
    return { config, nodes: nodes as BpaNode[], updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0 }
  } catch {
    return { config: { ...BPA_DEFAULT_CONFIG }, nodes: [], updatedAt: 0 }
  }
}

export function writeArchitecture(nodes: BpaNode[], config: BpaConfig): BpaArchitecture {
  const arch: BpaArchitecture = { config, nodes, updatedAt: Date.now() }
  writeJson(architectureFile(), arch)
  return arch
}

// ---------- 编号字典与结构完整性 ----------

/** 编号即字典：^L[1-6](-[0-9]{2}){level}$（段数=层级：L1-06 / L2-06-02 / L3-06-02-01）。 */
export function isValidNodeId(id: string, level: number): boolean {
  if (!/^[1-6]$/.test(String(level))) return false
  const re = new RegExp(`^L${level}(-[0-9]{2}){${level}}$`)
  return re.test(id)
}

export class BpaUpsertError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BpaUpsertError'
  }
}

/** upsert 一条节点（结构完整性在写入点强制，不等体检兜底）。 */
export function upsertNode(arch: BpaArchitecture, incoming: BpaNode): BpaNode[] {
  const level = incoming.level
  if (!isValidNodeId(incoming.id, level)) {
    throw new BpaUpsertError(`编号 ${incoming.id} 与层级 L${level} 不匹配（应为 ^L${level}(-[0-9]{2}){${level}}$，如 L${level}-06-02-01）`)
  }
  if (!incoming.name?.trim()) throw new BpaUpsertError('名称必填')
  if (level === 1) {
    if (incoming.parentId) throw new BpaUpsertError('L1 流程类的 parentId 必须为 null（一级直接挂在地图分区上）')
  } else {
    if (!incoming.parentId) throw new BpaUpsertError(`L${level} 必须挂父节点`)
    const parent = arch.nodes.find((n) => n.id === incoming.parentId)
    if (!parent) throw new BpaUpsertError(`父节点 ${incoming.parentId} 不存在`)
    if (parent.level >= level) throw new BpaUpsertError(`父节点 ${parent.id} 层级 L${parent.level} 必须低于子节点 L${level}`)
    if (arch.config.forbidSkippingLevel && parent.level !== level - 1) {
      throw new BpaUpsertError(`禁止跨级：L${level} 的父节点应为 L${level - 1}（当前 ${parent.id} 为 L${parent.level}）`)
    }
  }
  if (level > arch.config.maxDepth) throw new BpaUpsertError(`层级 L${level} 超过上限 L${arch.config.maxDepth}`)
  const node: BpaNode = {
    ...incoming,
    name: incoming.name.trim(),
    updatedAt: Date.now(),
  }
  if (level !== 1) {
    delete (node as { section?: unknown }).section
    delete (node as { pcfRef?: unknown }).pcfRef // 对标映射只作用于 L1（与分区同律）
  }
  const idx = arch.nodes.findIndex((n) => n.id === node.id)
  if (idx >= 0) arch.nodes[idx] = node
  else arch.nodes.push(node)
  return arch.nodes
}

/** 级联删除：节点及其全部子孙（返回删除的 id 集）。 */
export function deleteNodeCascade(arch: BpaArchitecture, id: string): string[] {
  const removed: string[] = []
  const walk = (pid: string): void => {
    removed.push(pid)
    for (const child of arch.nodes.filter((n) => n.parentId === pid)) walk(child.id)
  }
  if (!arch.nodes.some((n) => n.id === id)) return removed
  walk(id)
  arch.nodes = arch.nodes.filter((n) => !removed.includes(n.id))
  // 引用清理：drivers/supports 指向已删节点的，就地摘除（防悬空引用越攒越多）
  for (const n of arch.nodes) {
    if (n.drivers) n.drivers = n.drivers.filter((r) => !removed.includes(r))
    if (n.supports) n.supports = n.supports.filter((r) => !removed.includes(r))
  }
  return removed
}

// ---------- PEMM 成熟度历史 ----------

const MATURITY_HISTORY_LIMIT = 50

export function readMaturityHistory(): PemmAssessment[] {
  try {
    const raw = JSON.parse(readFileSync(maturityFile(), 'utf8')) as { history?: PemmAssessment[] }
    return Array.isArray(raw.history) ? raw.history : []
  } catch {
    return []
  }
}

export function appendMaturity(entry: PemmAssessment): PemmAssessment[] {
  const history = [...readMaturityHistory(), entry].slice(-MATURITY_HISTORY_LIMIT)
  writeJson(maturityFile(), { history })
  return history
}

/** PEMM 总体成熟度=最低分因素（短板决定论：能动因素不齐，流程无法持续高绩效）。 */
export function pemmOverall(scores: Partial<Record<string, number>>): number | null {
  const vals = Object.values(scores).filter((v): v is number => typeof v === 'number' && v >= 0 && v <= 4)
  if (vals.length === 0) return null
  return Math.min(...vals)
}
