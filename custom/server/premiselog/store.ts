/**
 * 假设登记簿存储（B 组）——JSON 单文件 + 原子写 + 坏档隔离。
 *
 * 与 autonomyladder / autonomygov 同款约定：env 显式 > ~/.hermes-web-ui/。
 * 读侧 fail-soft（坏行丢弃，不让半条假设污染判定）；写侧校验在控制器层跑
 * checkStatement / checkScope。
 */
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import {
  PREMISE_KINDS, PREMISE_STATUSES, type Premise, type PremiseKind, type PremiseStatus, type ReevalItem,
} from './premise-log'

function storeDir(): string {
  const env = process.env.HERMES_PREMISE_LOG_DIR?.trim()
  if (env) return resolve(env)
  return underWebUi('premise-log')
}

function premisePath(): string {
  return join(storeDir(), 'premises.json')
}

function reevalPath(): string {
  return join(storeDir(), 'reeval.json')
}

interface PremiseStore {
  premises: Premise[]
  nextSeq: number
}

interface ReevalStore {
  items: ReevalItem[]
}

function isKind(v: unknown): v is PremiseKind {
  return typeof v === 'string' && (PREMISE_KINDS as readonly string[]).includes(v)
}

function isStatus(v: unknown): v is PremiseStatus {
  return typeof v === 'string' && (PREMISE_STATUSES as readonly string[]).includes(v)
}

function isUsablePremise(v: unknown): v is Premise {
  if (!v || typeof v !== 'object') return false
  const p = v as Partial<Premise>
  return typeof p.id === 'string' && typeof p.statement === 'string'
    && isKind(p.kind) && isStatus(p.status)
    && Array.isArray(p.scope) && typeof p.reviewAt === 'number'
}

function readJsonFile<T>(file: string, empty: T): T {
  if (!existsSync(file)) return empty
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as T
    if (parsed && typeof parsed === 'object') return parsed
  } catch { /* 坏档：隔离留档再从空起步 */ }
  try { renameSync(file, `${file}.corrupt-${Date.now()}`) } catch { /* 隔离失败不阻断 */ }
  return empty
}

function loadPremises(): PremiseStore {
  const raw = readJsonFile<Partial<PremiseStore>>(premisePath(), {})
  const premises = Array.isArray(raw.premises) ? raw.premises.filter(isUsablePremise) : []
  const nextSeq = typeof raw.nextSeq === 'number' && raw.nextSeq > 0 ? raw.nextSeq : premises.length + 1
  return { premises, nextSeq }
}

function savePremises(s: PremiseStore): void {
  mkdirSync(storeDir(), { recursive: true })
  atomicWriteJson(premisePath(), s)
}

function loadReeval(): ReevalStore {
  const raw = readJsonFile<Partial<ReevalStore>>(reevalPath(), {})
  return { items: Array.isArray(raw.items) ? raw.items.filter((i) => i && typeof i.id === 'string') : [] }
}

function saveReeval(s: ReevalStore): void {
  mkdirSync(storeDir(), { recursive: true })
  atomicWriteJson(reevalPath(), s)
}

// ── 前提读写 ──

export function listPremises(filter: { status?: PremiseStatus; kind?: PremiseKind } = {}): Premise[] {
  return loadPremises().premises
    .filter((p) => (filter.status ? p.status === filter.status : true))
    .filter((p) => (filter.kind ? p.kind === filter.kind : true))
    .slice()
    .sort((a, b) => a.reviewAt - b.reviewAt)
}

export function getPremise(id: string): Premise | null {
  return loadPremises().premises.find((p) => p.id === id) ?? null
}

function newId(seq: number, now: number): string {
  const d = new Date(now)
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `pr-${ymd}-${String(seq).padStart(4, '0')}`
}

export function createPremise(input: {
  statement: string
  kind: PremiseKind
  scope: string[]
  reviewAt: number
  confidence?: Premise['confidence']
  createdBy: string
  now?: number
}): Premise {
  const now = input.now ?? Date.now()
  const store = loadPremises()
  const premise: Premise = {
    id: newId(store.nextSeq, now),
    statement: input.statement.trim(),
    kind: input.kind,
    scope: input.scope.map((s) => s.trim()).filter(Boolean),
    reviewAt: input.reviewAt,
    status: 'hold',
    confidence: input.confidence ?? 'medium',
    createdAt: now,
    createdBy: input.createdBy,
    updatedAt: now,
  }
  store.premises.push(premise)
  store.nextSeq += 1
  savePremises(store)
  return premise
}

/** 整条替换（推翻/改写后的落盘入口）。 */
export function putPremise(premise: Premise): Premise {
  const store = loadPremises()
  const idx = store.premises.findIndex((p) => p.id === premise.id)
  if (idx < 0) throw new Error(`假设不存在：${premise.id}`)
  store.premises[idx] = premise
  savePremises(store)
  return premise
}

export function removePremise(id: string): boolean {
  const store = loadPremises()
  const idx = store.premises.findIndex((p) => p.id === id)
  if (idx < 0) return false
  store.premises.splice(idx, 1)
  savePremises(store)
  return true
}

// ── 重评队列 ──

export function listReeval(onlyQueued = true): ReevalItem[] {
  const items = loadReeval().items
  return (onlyQueued ? items.filter((i) => i.state === 'queued') : items).slice().sort((a, b) => b.queuedAt - a.queuedAt)
}

export function pushReeval(item: ReevalItem): ReevalItem {
  const store = loadReeval()
  store.items.push(item)
  saveReeval(store)
  return item
}

/**
 * 处置重评项。dismissed 必须带理由——无理由删除等于把闭环重新切断
 * （文章「让失败可见」的直接落地）。
 *
 * 返回形状用「成功给 item / 失败给 problems」而不是 ok 布尔：
 * 本仓 tsc 配置（strict false）下判别联合窄化在调用点不稳定；同时 K19 棘轮不允许
 * 新增 ok 字面量（失败体统一走 lib/http 的 fail），故此处不产出 ok 字段。
 */
export function resolveReeval(
  id: string,
  state: 'done' | 'dismissed',
  resolution: { by: string; note: string; now?: number },
): { item?: ReevalItem; problems?: string[] } {
  if (state === 'dismissed' && (!resolution.note || !resolution.note.trim())) {
    return { problems: ['dismissed 必带理由——无理由关闭等于把闭环重新切断'] }
  }
  const store = loadReeval()
  const item = store.items.find((i) => i.id === id)
  if (!item) return { problems: [`重评项不存在：${id}`] }
  if (item.state !== 'queued') return { problems: [`重评项已处置（${item.state}），不可重复处置`] }
  item.state = state
  item.resolution = { by: resolution.by, at: resolution.now ?? Date.now(), note: resolution.note ?? '' }
  saveReeval(store)
  return { item }
}

/** 测试隔离。 */
export function _usePremiseLogDirForTests(dir: string): void {
  process.env.HERMES_PREMISE_LOG_DIR = dir
}

export function _resetPremiseLogDirForTests(): void {
  delete process.env.HERMES_PREMISE_LOG_DIR
}
