// overlay/prefixreuse 域：长会话已验证前缀复用数据面（minimax 长会话性能吸收，
// 独立设计轮 2026-09-26-prefix-reuse-design.md §5 层 1）。
//
// 链式指纹 + 增量校验 + 复用计划（详见设计文档 §2）：
// - buildPrefixChain：prefixHash[n]=sha1(prefixHash[n-1]||msg[n])，改任何历史
//   其后全变；
// - verifyPrefix：给定 lastVerifiedIndex+lastVerifiedHash，重算校验一致性与
//   可复用前缀长度（mismatch 自动覆盖 compact 改写路径）；
// - reusePlan：一致→只发 suffix；不一致/空→全量回退（复用是优化不是语义依赖）。
import { createHash } from 'crypto'

export type Message = { role: string; content: string }

function h(prev: string, msg: Message): string {
  return createHash('sha1').update(prev).update(msg.role).update('\u0000').update(msg.content).digest('hex')
}

/** 链式指纹（每条消息一个增量哈希；prefix[0] 不含 GENESIS 依赖）。 */
export function buildPrefixChain(messages: readonly Message[]): string[] {
  const out: string[] = []
  let prev = ''
  for (const m of messages) {
    prev = h(prev, m)
    out.push(prev)
  }
  return out
}

export interface PrefixVerification {
  /** 可复用前缀长度（消息条数；0=不可复用）。 */
  reusableCount: number
  /** 校验是否一致（false=历史被改写/压缩介入，回退全量）。 */
  consistent: boolean
}

/** 已验证点校验：指纹一致则前缀可复用。 */
export function verifyPrefix(
  chain: readonly string[],
  lastVerifiedIndex: number,
  lastVerifiedHash: string,
): PrefixVerification {
  if (lastVerifiedIndex < 0 || lastVerifiedIndex >= chain.length) {
    return { reusableCount: 0, consistent: false }
  }
  const consistent = chain[lastVerifiedIndex] === lastVerifiedHash
  return { reusableCount: consistent ? lastVerifiedIndex + 1 : 0, consistent }
}

export interface ReusePlan {
  /** 复用前缀条数。 */
  reuseCount: number
  /** 需要发送的消息（reuseCount=0 即全量）。 */
  suffix: Message[]
  /** 复用还是回退。 */
  mode: 'incremental' | 'full'
}

/** 复用计划（校验一致→增量；否则全量）。 */
export function reusePlan(
  messages: readonly Message[],
  verification: PrefixVerification,
): ReusePlan {
  const reuseCount = verification.consistent ? verification.reusableCount : 0
  return {
    reuseCount,
    suffix: messages.slice(reuseCount),
    mode: reuseCount > 0 ? 'incremental' : 'full',
  }
}
