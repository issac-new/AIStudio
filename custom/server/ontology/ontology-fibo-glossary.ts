/**
 * FIBO 术语表（P1-2，2026-10-21）。
 *
 * 面向报告与 agent 的一词一义表：36 个概念的英文名、中文名、别名、真实 IRI、
 * 中英文定义、模块版本与成熟度。别名只做「同物异名」收敛，不把通用词注册成
 * 别名（报告词表 v2 的别名纪律同款）。
 *
 * 另附报告词表中的金融相关词条对齐结果：能映射到 FIBO 的标 mapped，只能建立
 * 语义关联的标 related，纯工程/协作词标 unmapped。不把流程黑话硬塞进 FIBO。
 */
import { fiboPackSummary, type FiboPackConceptRow } from './ontology-fibo'

/** 逐概念别名（只收本域真实同物异名）。 */
const ALIASES: Record<string, string[]> = {
  Payment: ['支付', '付款', 'payment', 'pay'],
  PaymentObligation: ['支付义务', 'payment obligation'],
  PaymentEvent: ['支付事件', 'payment event'],
  PaymentSchedule: ['支付计划', 'payment schedule'],
  Payer: ['付款方', 'payer'],
  Payee: ['收款方', 'payee'],
  Contract: ['合同', 'contract'],
  ContractParty: ['合同当事方', 'contract party'],
  ContractualCommitment: ['合同承诺', 'contractual commitment'],
  MonetaryAmount: ['金额', '货币金额', 'amount', 'monetary amount'],
  Currency: ['币种', '货币', 'currency'],
  Settlement: ['结算', 'settled', 'settlement'],
  SettlementEvent: ['结算事件', 'settlement event'],
  SettlementTerms: ['结算条款', 'settlement terms'],
  Account: ['账户', 'account'],
  CustomerAccount: ['客户账户', 'customer account'],
  AccountHolder: ['账户持有人', 'account holder'],
  AccountIdentifier: ['账户标识', 'account identifier'],
  AccountProvider: ['账户提供方', 'account provider'],
  IndividualTransaction: ['单笔交易', '交易流水', 'transaction'],
  TransactionRecord: ['交易记录', 'transaction record'],
  Balance: ['余额', 'balance'],
  Merchant: ['商户', 'merchant'],
  Party: ['参与方', 'party'],
  Identifier: ['标识符', 'identifier'],
  LifecycleStatus: ['生命周期状态', 'status'],
  Occurrence: ['事件实例', 'occurrence'],
  MarketTransaction: ['市场交易', 'market transaction'],
  Authorization: ['授权', '预授权', 'authorized', 'authorization'],
  Capture: ['扣款', 'captured', 'capture'],
}

export interface FiboGlossaryEntry extends FiboPackConceptRow {
  aliases: string[]
}

export interface FiboReportTerm {
  term: string
  relation: 'mapped' | 'related' | 'unmapped'
  conceptId?: string
  note: string
}

export interface FiboGlossary {
  entries: FiboGlossaryEntry[]
  reportTerms: FiboReportTerm[]
  counts: {
    terms: number
    aliased: number
    reportTerms: number
    mappedReportTerms: number
  }
}

/** 报告词表里与金融域相邻的词条；不是 59 条全映射，只挑有语义关系的。 */
const REPORT_TERMS: FiboReportTerm[] = [
  { term: '幂等', relation: 'related', conceptId: 'Payment', note: 'FIBO 不定义幂等。支付幂等的工程语义是同一 Payment 重复提交只生效一次。' },
  { term: 'int64', relation: 'related', conceptId: 'MonetaryAmount', note: 'FIBO 只定义金额是货币度量，不规定存储单位。int64 分是工程约定。' },
  { term: 'mock', relation: 'unmapped', note: '测试工程概念，FIBO 无对应类。' },
  { term: '回执', relation: 'unmapped', note: '消息送达确认，属协作协议，不是金融本体概念。' },
  { term: '涉敏', relation: 'unmapped', note: '数据敏感度分级，属安全治理，不是金融本体概念。' },
]

export function fiboGlossary(): FiboGlossary {
  const pack = fiboPackSummary()
  const entries: FiboGlossaryEntry[] = pack.concepts.map((c) => ({
    ...c,
    aliases: ALIASES[c.id] ?? [c.labelZh, c.label],
  }))
  return {
    entries,
    reportTerms: REPORT_TERMS,
    counts: {
      terms: entries.length,
      aliased: entries.filter((e) => e.aliases.length > 0).length,
      reportTerms: REPORT_TERMS.length,
      mappedReportTerms: REPORT_TERMS.filter((t) => t.relation !== 'unmapped').length,
    },
  }
}
