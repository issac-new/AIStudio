// overlay[constraints] 约束卡 JSON store（eval store 同模式：tmp+rename 原子写、
// 仅 ENOENT 按空账、_useStoreDirForTests 隔离）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ConstraintCard, ConstraintScope, ConstraintStoreShape } from './constraint-types'

const EMPTY: ConstraintStoreShape = { cards: [], nextSeq: 1 }

export function storeDir(): string {
  const env = process.env.CONSTRAINT_STORE?.trim()
  if (env) return env
  // 隔离环境（SIM 推演）随 HERMES_WEB_UI_HOME 走，不写宿主 home（token-auth appHome 同链）
  const webuiHome = process.env.HERMES_WEB_UI_HOME?.trim() || process.env.HERMES_WEBUI_STATE_DIR?.trim()
  return webuiHome ? join(webuiHome, 'constraints') : join(homedir(), '.hermes-web-ui', 'constraints')
}

function storePath(): string {
  return join(storeDir(), 'constraints.json')
}

export function readConstraintStore(): ConstraintStoreShape {
  let raw: Partial<ConstraintStoreShape>
  try {
    raw = JSON.parse(readFileSync(storePath(), 'utf8')) as Partial<ConstraintStoreShape>
  } catch (e) {
    // 仅首装无文件按空账；损坏/占用如实上抛（静默当空账会让下一次写入整体覆写）。
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { cards: [], nextSeq: 1 }
    throw e
  }
  return {
    cards: Array.isArray(raw.cards) ? raw.cards : [],
    nextSeq: typeof raw.nextSeq === 'number' ? raw.nextSeq : 1,
  }
}

export function writeConstraintStore(store: ConstraintStoreShape): void {
  mkdirSync(storeDir(), { recursive: true })
  const file = storePath()
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, file)
}

// ---------- 校验 ----------

const MAX_STATEMENT = 500
const MAX_ANCHOR = 200
const MAX_TERMS = 20

function cleanTerms(v: unknown, problems: string[], label: string): string[] {
  const arr = Array.isArray(v) ? v : []
  const terms: string[] = []
  for (const it of arr.slice(0, MAX_TERMS)) {
    if (typeof it !== 'string') continue
    const t = it.trim()
    if (t) terms.push(t)
  }
  if (arr.length > MAX_TERMS) problems.push(`${label} 最多 ${MAX_TERMS} 项`)
  return [...new Set(terms)]
}

export interface ConstraintInput {
  statement: unknown
  scope: unknown
  sourceAnchor: unknown
  effectiveRun?: unknown
  enabled?: unknown
}

/** 建卡/改卡校验：陈述必填限长、scope 至少一维非空、来源锚必填。 */
export function validateConstraint(input: ConstraintInput, problems: string[]): {
  statement: string
  scope: ConstraintScope
  sourceAnchor: string
  effectiveRun?: string
  enabled: boolean
} {
  const statement = typeof input.statement === 'string' ? input.statement.trim() : ''
  if (!statement) problems.push('statement 必填')
  if (statement.length > MAX_STATEMENT) problems.push(`statement ≤${MAX_STATEMENT} 字`)
  const sourceAnchor = typeof input.sourceAnchor === 'string' ? input.sourceAnchor.trim() : ''
  if (!sourceAnchor) problems.push('sourceAnchor 必填')
  if (sourceAnchor.length > MAX_ANCHOR) problems.push(`sourceAnchor ≤${MAX_ANCHOR} 字`)
  const rawScope = (input.scope ?? {}) as Partial<ConstraintScope>
  const columns = cleanTerms(rawScope.columns, problems, 'scope.columns')
  const specialists = cleanTerms(rawScope.specialists, problems, 'scope.specialists')
  const keywords = cleanTerms(rawScope.keywords, problems, 'scope.keywords')
  if (!columns.length && !specialists.length && !keywords.length) {
    problems.push('scope 至少一维非空（columns/specialists/keywords）')
  }
  const effectiveRun = typeof input.effectiveRun === 'string' && input.effectiveRun.trim()
    ? input.effectiveRun.trim().slice(0, 32) : undefined
  return {
    statement,
    scope: { columns, specialists, keywords },
    sourceAnchor,
    effectiveRun,
    enabled: input.enabled === undefined ? true : Boolean(input.enabled),
  }
}

// ---------- CRUD ----------

export function listConstraintCards(): ConstraintCard[] {
  return readConstraintStore().cards
}

export function createConstraintCard(input: ConstraintInput): ConstraintCard {
  const problems: string[] = []
  const v = validateConstraint(input, problems)
  if (problems.length) throw new Error(`约束卡校验失败：${problems.join('；')}`)
  const store = readConstraintStore()
  const now = new Date().toISOString()
  const card: ConstraintCard = {
    id: `ctr-${String(store.nextSeq).padStart(3, '0')}`,
    ...v,
    createdAt: now,
    updatedAt: now,
  }
  store.cards.push(card)
  store.nextSeq += 1
  writeConstraintStore(store)
  return card
}

export function updateConstraintCard(id: string, input: ConstraintInput): ConstraintCard {
  const problems: string[] = []
  const v = validateConstraint(input, problems)
  if (problems.length) throw new Error(`约束卡校验失败：${problems.join('；')}`)
  const store = readConstraintStore()
  const idx = store.cards.findIndex((c) => c.id === id)
  if (idx < 0) throw new Error(`约束卡不存在：${id}`)
  const card: ConstraintCard = { ...store.cards[idx], ...v, updatedAt: new Date().toISOString() }
  store.cards[idx] = card
  writeConstraintStore(store)
  return card
}

export function deleteConstraintCard(id: string): void {
  const store = readConstraintStore()
  const idx = store.cards.findIndex((c) => c.id === id)
  if (idx < 0) throw new Error(`约束卡不存在：${id}`)
  store.cards.splice(idx, 1)
  writeConstraintStore(store)
}

// ---------- 测试隔离 ----------

/** 测试专用：指到临时目录（eval _useStoreDirForTests 同款）。 */
export function _useStoreDirForTests(dir: string): void {
  process.env.CONSTRAINT_STORE = dir
}

export function _storeExistsForTests(): boolean {
  return existsSync(storePath())
}
