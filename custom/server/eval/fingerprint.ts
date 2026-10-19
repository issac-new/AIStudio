// overlay[eval] 评测集内容指纹（百度评测体系轮 B1，2026-10-19）。
//
// 范式来源：《百度 Agent 评测体系技术拆解》§6 评测集治理——数据集当资产管：
// 版本化、可精确复现，「回归才有锚点」。改题/回流后指纹变化，历史 run 读数
// 与新集读数的可比性即断裂——报告期用 run.setHash ≠ 当前集指纹显式示警。
import { createHash } from 'crypto'
import type { EvalSet, EvalTask } from './types'

/** 规范化序列化：键排序后 JSON（对象键序不稳 → 排序保证同内容同串）。 */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** 全量 sha1 指纹（等值判定用全量，呈现截短）。 */
export function contentFingerprint(set: Pick<EvalSet, 'tasks'>): string {
  const canonical = canonicalize(set.tasks as unknown as EvalTask[])
  return createHash('sha1').update(canonical, 'utf8').digest('hex')
}

/** 呈现用短指纹（前 12 位；集规模 <10^3 下碰撞可忽略——见 spec 决策记录）。 */
export function shortFingerprint(hash: string): string {
  return hash.slice(0, 12)
}
