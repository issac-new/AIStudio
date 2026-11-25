// custom/server/agentidentity/responsibility.ts
// 责任卡：任务边界之外的可追责要素（交付标准 / 主责任人与复核人 / 升级与暂停条件 /
// 接管人 / 检验用例版本 / 成本预算 / 维护人与部署位置）。校验是纯函数，不读盘。
//
// 分离规则按研究文档 2.1 的强监管限定：只有 riskTier='high' 强制复核人且不得与
// 主责任人为同一人；中低风险允许单人，但卡面会显示「未分离」缺口供人判断。
import { createHash } from 'node:crypto'
import type { Person } from './people'

export interface AdmissionEvidence {
  representativeTasks: string[]
  edgeCases: string[]
  dataPermissionReview: string[]
  recordedAt: number
}

export interface ResponsibilityCard {
  deliveryStandard: string
  riskTier: 'low' | 'medium' | 'high'
  primaryOwner: string
  reviewer?: string
  escalation: string[]
  pauseConditions: string[]
  takerOver: string
  testCaseVersion: string
  costBudget: { limit: number; unit: string }
  maintainer: string
  deploymentLocation: string
  businessOwnerSign?: { signedBy: string; signedAt: number; note?: string; cardRevision?: string; stale?: boolean }
  admissionEvidence?: AdmissionEvidence
}

export interface CardGap { field: string; detail: string }

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const arrNonEmpty = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(nonEmpty)

/** 卡的字段级校验（不含准入专属证据）。空数组=通过。 */
export function validateCard(card: ResponsibilityCard | undefined, people: Person[]): string[] {
  if (!card) return ['责任卡未填写']
  const problems: string[] = []
  const active = new Map(people.filter((p) => p.active).map((p) => [p.id, p]))
  if (!nonEmpty(card.deliveryStandard)) problems.push('deliveryStandard 必填（交付标准）')
  if (!['low', 'medium', 'high'].includes(card.riskTier)) problems.push('riskTier 须为 low|medium|high')
  if (!active.has(card.primaryOwner)) problems.push('primaryOwner 必须是在岗自然人')
  if (card.riskTier === 'high') {
    if (!card.reviewer) problems.push('高风险执行单元必须登记复核人')
    else if (card.reviewer === card.primaryOwner) problems.push('复核人不得为同一人（高风险）')
  }
  if (card.reviewer && !active.has(card.reviewer)) problems.push('reviewer 必须是在岗自然人')
  if (!arrNonEmpty(card.escalation)) problems.push('escalation 至少一条（什么情况必须升级）')
  if (!arrNonEmpty(card.pauseConditions)) problems.push('pauseConditions 至少一条（什么情况必须暂停）')
  if (!active.has(card.takerOver)) problems.push('takerOver 必须是在岗自然人')
  if (!nonEmpty(card.testCaseVersion)) problems.push('testCaseVersion 必填')
  if (!card.costBudget || !(card.costBudget.limit > 0) || !nonEmpty(card.costBudget.unit)) {
    problems.push('costBudget 须含正的 limit 与 unit')
  }
  if (!active.has(card.maintainer)) problems.push('maintainer 必须是在岗自然人')
  if (!nonEmpty(card.deploymentLocation)) problems.push('deploymentLocation 必填')
  return problems
}

/** 带缺口字段名的读模型；forAdmission 时追加签署与准入证据两项。 */
export function cardGaps(
  card: ResponsibilityCard | undefined,
  people: Person[],
  opts: { forAdmission?: boolean } = {},
): CardGap[] {
  const gaps: CardGap[] = validateCard(card, people).map((detail) => ({ field: 'card', detail }))
  if (!card) return gaps
  if (opts.forAdmission) {
    if (!card.businessOwnerSign || !nonEmpty(card.businessOwnerSign.signedBy)) {
      gaps.push({ field: 'business-owner-sign', detail: '准入前须由业务负责人签署责任卡' })
    } else {
      // 签署绑定卡版本指纹：内容改动后旧签署失效（stale），须重新签署
      if (card.businessOwnerSign.stale) {
        gaps.push({ field: 'business-owner-sign', detail: '业务负责人签署已失效（责任卡内容已变更），须重新签署' })
      }
      // 存量签署缺版本指纹时无法判定对应哪个版本，一律要求重签
      if (!nonEmpty(card.businessOwnerSign.cardRevision)) {
        gaps.push({ field: 'business-owner-sign', detail: '旧签署无版本指纹，须重签' })
      }
    }
    const ev = card.admissionEvidence
    if (!ev || !arrNonEmpty(ev.representativeTasks) || !arrNonEmpty(ev.edgeCases) || !arrNonEmpty(ev.dataPermissionReview)) {
      gaps.push({ field: 'admission-evidence', detail: '准入须记录代表性任务、边界情况、数据与权限评估' })
    }
  }
  return gaps
}

/** 规范化 JSON（键字典序排序）——同一内容恒得同一串，是版本指纹的输入。 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** 责任卡版本指纹：去掉签署与准入证据后规范化 JSON 的 SHA-256 十六进制。
 *  签署对象与准入证据不进指纹——改证据不该让签署失效，改卡面内容才失效。 */
export function cardRevision(card: ResponsibilityCard): string {
  const { businessOwnerSign: _sign, admissionEvidence: _evidence, ...content } = card
  return createHash('sha256').update(canonicalJson(content)).digest('hex')
}

/** 中低风险卡若登记了与主责任人相同的复核人，视为「未分离」提示（不阻断）。 */
export function separationNotice(card: ResponsibilityCard | undefined): string | null {
  if (!card || card.riskTier === 'high') return null
  if (card.reviewer && card.reviewer === card.primaryOwner) return '复核人与主责任人为同一人（中低风险允许，但未分离）'
  if (!card.reviewer) return '未登记复核人（中低风险允许，但未分离）'
  return null
}
