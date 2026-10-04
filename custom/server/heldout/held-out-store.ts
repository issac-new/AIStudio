// overlay/custom/server/heldout/held-out-store.ts
// held-out 留出评测库（P7，2026-10-04 九源轮）。
//
// 出处：字节 Aspire（密封隐藏评测集，控制器持有、Agent 只拿聚合分，杜绝泄露）
// 与清华 RSI 综述（"密封测试的分数不能反过来指导更新、停止或挑选检查点"）。
// 产品化定位：给记忆蒸馏（distillgate）与推演评分的**密封题库基建**——
// 题目内容永不出库，评分只回聚合结果。
//
// 防泄露契约（测试逐条锁定）：
//   1. listSets 只回元数据（id/name/条数/时间/尝试计数），不含任何题目内容；
//   2. score 只回 {n, passRate}，不回逐条对错（逐条布尔可被重试探测泄露）；
//   3. 每调用方每集尝试上限（默认 3 次）：二分探测预期值的通道在限次内不可行；
//   4. 越界 index / 空 answers 拒绝；答案按 index 对齐不回显。
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface HeldOutItem {
  /** 题干（如"该策略适用于哪类任务"）——永不出库 */
  prompt: string
  /** 期望答案（精确匹配或 judge 判定的参照）——永不出库 */
  expected: string
}

export interface HeldOutSet {
  id: string
  name: string
  createdAt: number
  sealedBy: string
  items: HeldOutItem[]
}

interface AttemptRecord { actor: string; ts: number; n: number; passRate: number }

interface StoreShape {
  sets: HeldOutSet[]
  /** 每集尝试账（防探测：透明可审计） */
  attempts: Record<string, AttemptRecord[]>
  nextSeq: number
}

function storeDir(): string {
  const env = process.env.HELDOUT_STORE?.trim()
  return env || join(homedir(), '.hermes-web-ui', 'heldout')
}

function storePath(): string {
  return join(storeDir(), 'heldout-sets.json')
}

function readStore(): StoreShape {
  let raw: Partial<StoreShape>
  try {
    raw = JSON.parse(readFileSync(storePath(), 'utf8')) as Partial<StoreShape>
  } catch (e) {
    // 仅"首装无文件"按空账处理；损坏/占用（EBUSY/EPERM 等，含并发 rename 竞态
    // 中途读到半态）如实上抛（500）——静默当空账会让下一次 createSet 的全量
    // writeStore 把密封题库整体覆写清零且 nextSeq 重置撞号（密封面不可恢复）
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { sets: [], attempts: {}, nextSeq: 1 }
    }
    throw e
  }
  return {
    sets: Array.isArray(raw.sets) ? raw.sets : [],
    attempts: raw.attempts && typeof raw.attempts === 'object' ? raw.attempts : {},
    nextSeq: typeof raw.nextSeq === 'number' ? raw.nextSeq : 1,
  }
}

function writeStore(store: StoreShape): void {
  mkdirSync(storeDir(), { recursive: true })
  const file = storePath()
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, file)
}

export interface SetMeta {
  id: string
  name: string
  itemCount: number
  createdAt: number
  sealedBy: string
  attemptCount: number
}

/** 题库元数据列表——题目内容永不出库（契约 1）。 */
export function listSets(): SetMeta[] {
  const store = readStore()
  return store.sets.map((s) => ({
    id: s.id,
    name: s.name,
    itemCount: s.items.length,
    createdAt: s.createdAt,
    sealedBy: s.sealedBy,
    attemptCount: (store.attempts[s.id] ?? []).length,
  }))
}

export const MAX_ATTEMPTS_PER_ACTOR = 3

/** 建集（密封）：items ≥1、prompt/expected 非空；name 唯一。 */
export function createSet(input: { name: string; items: Array<{ prompt: string; expected: string }> }, sealedBy: string): { ok: true; meta: SetMeta } | { ok: false; problems: string[] } {
  const problems: string[] = []
  const name = (input.name ?? '').trim()
  if (!name || name.length > 64) problems.push('name 必填（≤64 字符）')
  if (!Array.isArray(input.items) || input.items.length === 0) problems.push('items 至少 1 条')
  else {
    input.items.forEach((it, i) => {
      if (!it?.prompt?.trim() || !it?.expected?.trim()) problems.push(`#${i} prompt/expected 均必填`)
    })
  }
  const store = readStore()
  if (!problems.length && store.sets.some((s) => s.name === name)) problems.push(`同名题库已存在：${name}`)
  if (problems.length) return { ok: false, problems }
  const set: HeldOutSet = {
    id: `held-${String(store.nextSeq).padStart(3, '0')}`,
    name,
    createdAt: Date.now(),
    sealedBy,
    items: input.items.map((it) => ({ prompt: it.prompt.trim(), expected: it.expected.trim() })),
  }
  store.sets.push(set)
  store.nextSeq += 1
  writeStore(store)
  return { ok: true, meta: { id: set.id, name, itemCount: set.items.length, createdAt: set.createdAt, sealedBy, attemptCount: 0 } }
}

export interface ScoreResult {
  n: number
  passRate: number
  /** 尝试余量（防探测契约透明化） */
  attemptsLeft: number
}

/**
 * 评分（密封）：answers 按 index 对齐；只回聚合（契约 2）；限次（契约 3）。
 * 判定 v1=大小写不敏感精确匹配（expected 全串）；judge 类评分后续接入同口。
 */
export function scoreSet(
  setId: string,
  answers: Array<{ index: number; answer: string }>,
  actor: string,
): { ok: true; result: ScoreResult } | { ok: false; problems: string[]; attemptsLeft?: number } {
  const store = readStore()
  const set = store.sets.find((s) => s.id === setId)
  if (!set) return { ok: false, problems: [`题库不存在：${setId}`] }
  const mine = (store.attempts[setId] ?? []).filter((a) => a.actor === actor)
  const attemptsLeft = MAX_ATTEMPTS_PER_ACTOR - mine.length
  if (attemptsLeft <= 0) {
    return { ok: false, problems: [`尝试上限（每调用方 ${MAX_ATTEMPTS_PER_ACTOR} 次，防探测；账目见 listSets.attemptCount）`], attemptsLeft: 0 }
  }
  if (!Array.isArray(answers) || answers.length === 0) return { ok: false, problems: ['answers 至少 1 条'], attemptsLeft }
  const seen = new Set<number>()
  for (const a of answers) {
    if (!Number.isInteger(a?.index) || a.index < 0 || a.index >= set.items.length) {
      return { ok: false, problems: [`index 越界：${a?.index}（题库 ${set.items.length} 条）`], attemptsLeft }
    }
    if (seen.has(a.index)) return { ok: false, problems: [`index 重复：${a.index}`], attemptsLeft }
    if (typeof a.answer !== 'string') return { ok: false, problems: [`#${a.index} answer 须为字符串`], attemptsLeft }
    seen.add(a.index)
  }
  // 空答（未作答条目）按错计——n 记题库全量，如实拉低 passRate（不奖励跳答）
  const byIndex = new Map(answers.map((a) => [a.index, a.answer]))
  let passed = 0
  set.items.forEach((it, i) => {
    const ans = byIndex.get(i)
    if (ans != null && ans.trim().toLowerCase() === it.expected.toLowerCase()) passed += 1
  })
  const passRate = passed / set.items.length
  store.attempts[setId] = [...(store.attempts[setId] ?? []), { actor, ts: Date.now(), n: set.items.length, passRate }]
  writeStore(store)
  return { ok: true, result: { n: set.items.length, passRate, attemptsLeft: attemptsLeft - 1 } }
}

/** 测试隔离。 */
export function _useStoreDirForTests(dir: string): void {
  process.env.HELDOUT_STORE = dir
}
