// card-classify.ts — 任务卡分类判据（run20 复盘产品化，2026-10-16）
//
// 背景：零交付检测器（completion.zero-delivery）只能出「候选+人工分诊」——治理/
// 台账类卡合法无代码锚 vs 研发交付类卡零凭证，31 张候选逐张人工判定滞留在报告层。
// 本模块把分类判据产品化为单一事实源：标题规则（v1；卡 schema 无类型字段，等
// 上游加字段后此处换数据源、规则退役）。
//
// 判据（优先序）：
//   1. 有交付引用（branch_name / body 含 commit= 锚）→ delivery（上游已处理，此处兜底）
//   2. 治理词命中 ∧ 无研发词 → governance（评审/复盘/台账/审计/登记/准出等——合法无锚）
//   3. 研发词命中 ∧ 无治理词 → delivery（DEV-/TEST-/AN-/T 编号/开发/实现/修复/缺陷）
//   4. 双命中或双不命中 → uncertain（维持人工分诊，禁机器臆断）
// 词表来源=run20 实测 31 张候选的标题分布（issues.log zero-delivery 条目 +
// evidence/work-report.md 零交付遥测节）。

export type CardClass = 'governance' | 'delivery' | 'uncertain'

/** 治理/台账/评审类卡标题特征（合法无代码锚——run20 实测多数属此类） */
const GOVERNANCE_RE = /(评审|复盘|台账|审计|意见书|跟踪|主卡|派发|分诊|排期|准出|发布登记|验收|治理|检查|登记|备案|G[1-6]\b|UAT|REL-)/
/** 研发交付类卡标题特征（须有代码凭证） */
const DELIVERY_RE = /(DEV-|TEST-|AN-|DEF-|FEAT-|T\d{1,2}\b|开发|实现|修复|缺陷|用例|编码|重构)/

export interface ClassifiableCard {
  title?: string | null
  body?: string | null
  branch_name?: string | null
}

/** commit= 锚（卡 body 内的交付凭证行） */
const COMMIT_ANCHOR_RE = /(?:^|\s)commit=[0-9a-f]{7,40}/i

/** 卡分类（纯函数；判据变更须同批改 __tests__/zero-delivery.test.ts 分类用例） */
export function classifyCard(card: ClassifiableCard): CardClass {
  const title = String(card.title ?? '')
  const body = typeof card.body === 'string' ? card.body : ''
  const branch = String(card.branch_name ?? '').trim()
  // 1. 交付引用在位 → delivery（零交付检测器上游已按此过滤，此处为独立调用方兜底）
  if (branch || COMMIT_ANCHOR_RE.test(body)) return 'delivery'
  const gov = GOVERNANCE_RE.test(title)
  const dev = DELIVERY_RE.test(title)
  if (gov && !dev) return 'governance'
  if (dev && !gov) return 'delivery'
  return 'uncertain'
}
