// overlay/auditchain 域：前向 hash 链共用件（2026-10-21 AGT 吸收轮 B，用户裁定「全做」）。
//
// 背景：evidence 域 2026-10 落地了 tamper-evident 前向链（hash(n)=sha256(prevHash|
// canonicalJSON(body))），但仅 evidence 一处——执法决策账/审批决策日志等主审计流
// 仍是「append-only 但文件可改」。微软 Agent Governance Toolkit 的立论三问之一
// 「你能证明发生了什么吗」要求审计防篡改；本模块把已验证的链模式抽成共用件。
//
// 链纪律（与 evidence-store 同款，如实区分三类状态）：
//   - 前链时代记录（无 hash 字段，升级前落账）→ unchained，不算缺陷；
//   - 轮转/裁剪/留存边界后的首条断锚 → anchor_dangling，预期行为，不算篡改；
//   - 自身哈希不符（hash_mismatch）或中链 prevHash 断（link_broken）→ 篡改证据。
import { createHash } from 'crypto'

/** 规范化序列化（键序稳定，递归排序）——同一记录体在任何进程/任何时点哈希一致。 */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  const keys = Object.keys(v as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`
}

export const GENESIS = 'GENESIS'

/** 计算一条记录的链哈希。body = 记录去掉 hash/prevHash 链字段后的规范化体。 */
export function chainHash(prevHash: string, body: unknown): string {
  return createHash('sha256').update(`${prevHash}|${canonicalJson(body)}`).digest('hex')
}

/** 对含可选链字段的记录算链（条目级便捷面）。 */
export function chainHashOfEntry<T extends { hash?: string; prevHash?: string }>(entry: T): string {
  const { hash: _h, prevHash: _p, ...body } = entry
  return chainHash(entry.prevHash ?? GENESIS, body)
}

export type ChainEntryStatus =
  | 'chained_ok'
  | 'unchained'
  | 'hash_mismatch'
  | 'link_broken'
  | 'anchor_dangling'

export interface ChainEntryCheck {
  index: number
  status: ChainEntryStatus
  note?: string
}

export interface ChainVerifyResult {
  total: number
  chained: number
  unchained: number
  /** 无 hash_mismatch 且无 link_broken（unchained/anchor_dangling 不算破）。 */
  intact: boolean
  firstBroken: number | null
  checks: ChainEntryCheck[]
}

/** 校验一段前向链（纯函数）。改写历史/删除中插/伪造追加都会在断点现形；
 *  断链后从断点重新锚定继续验后续条目（每条自身哈希仍逐一核）。 */
export function verifyForwardChain<T extends { hash?: string; prevHash?: string }>(
  entries: readonly T[],
): ChainVerifyResult {
  const checks: ChainEntryCheck[] = []
  let chained = 0
  let unchained = 0
  let intact = true
  let firstBroken: number | null = null
  let prevHash: string | null = null  // 上一条链记录的 hash（null=链尚未开始）
  let sawChained = false
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (!e.hash || !e.prevHash) {
      unchained += 1
      checks.push({ index: i, status: 'unchained', note: '前链时代记录（升级前落账，未回填哈希）' })
      continue
    }
    if (sawChained && e.prevHash !== prevHash) {
      intact = false
      if (firstBroken === null) firstBroken = i
      checks.push({ index: i, status: 'link_broken', note: 'prevHash 与前条 hash 不符（链在此断开：改写/删除/裁剪边界）' })
    } else if (!sawChained && e.prevHash !== GENESIS) {
      checks.push({ index: i, status: 'anchor_dangling', note: '链首 prevHash 非 GENESIS：轮转/裁剪/留存边界后的断锚（预期行为，不算篡改）' })
    }
    if (chainHashOfEntry(e) !== e.hash) {
      intact = false
      if (firstBroken === null) firstBroken = i
      checks.push({ index: i, status: 'hash_mismatch', note: '记录体与哈希不符（内容被改写或伪造）' })
    } else {
      chained += 1
      checks.push({ index: i, status: 'chained_ok' })
    }
    prevHash = e.hash
    sawChained = true
  }
  return { total: entries.length, chained, unchained, intact, firstBroken, checks }
}
