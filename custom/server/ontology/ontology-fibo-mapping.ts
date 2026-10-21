/**
 * FIBO 数据源映射注册表（P1-3，2026-10-21）。
 *
 * 回答「这个概念落在哪个物理载体」：看板字段、推演状态键/产物、报告章节、REST 端点。
 * 没有载体的概念显式标 unmapped，不默认有映射。注册表只描述，不写数据。
 */
import { fiboPackSummary } from './ontology-fibo'

export interface FiboSourceMapping {
  conceptId: string
  labelZh: string
  status: 'mapped' | 'unmapped'
  kanban: string[]
  runs: string[]
  reports: string[]
  api: string[]
  note?: string
}

type Override = Omit<FiboSourceMapping, 'conceptId' | 'labelZh' | 'status'> & { status?: 'mapped' }

const OVERRIDES: Record<string, Override> = {
  Payment: {
    kanban: ['task.finance.paymentRef'],
    runs: ['fibo-demo/payment'],
    reports: ['支付流水'],
    api: ['/api/hermes/ontology/instances?type=Payment'],
  },
  PaymentObligation: {
    kanban: [],
    runs: ['fibo-demo/obligation'],
    reports: ['支付义务'],
    api: ['/api/hermes/ontology/instances?type=PaymentObligation'],
  },
  PaymentEvent: {
    kanban: [],
    runs: ['event-log'],
    reports: ['支付事件'],
    api: ['/api/hermes/ontology/instances?type=PaymentEvent'],
  },
  Payer: {
    kanban: [],
    runs: ['fibo-demo/payer'],
    reports: ['付款方'],
    api: ['/api/hermes/ontology/instances?type=Payer'],
  },
  Payee: {
    kanban: [],
    runs: ['fibo-demo/payee'],
    reports: ['收款方'],
    api: ['/api/hermes/ontology/instances?type=Payee'],
  },
  Contract: {
    kanban: ['task.finance.contractRef'],
    runs: ['fibo-demo/contract'],
    reports: ['合同'],
    api: ['/api/hermes/ontology/instances?type=Contract'],
  },
  MonetaryAmount: {
    kanban: [],
    runs: ['fibo-demo/amount'],
    reports: ['金额'],
    api: ['/api/hermes/ontology/instances?type=MonetaryAmount'],
  },
  Currency: {
    kanban: [],
    runs: ['fibo-demo/currency'],
    reports: ['币种'],
    api: ['/api/hermes/ontology/instances?type=Currency'],
  },
  Settlement: {
    kanban: [],
    runs: ['fibo-demo/settlement'],
    reports: ['结算'],
    api: ['/api/hermes/ontology/instances?type=Settlement'],
  },
  SettlementEvent: {
    kanban: [],
    runs: ['fibo-demo/settlement-event'],
    reports: ['结算事件'],
    api: ['/api/hermes/ontology/instances?type=SettlementEvent'],
  },
  Account: {
    kanban: [],
    runs: ['fibo-demo/account'],
    reports: ['账户'],
    api: ['/api/hermes/ontology/instances?type=Account'],
  },
  Balance: {
    kanban: [],
    runs: ['fibo-demo/balance'],
    reports: ['余额'],
    api: ['/api/hermes/ontology/instances?type=Balance'],
  },
  IndividualTransaction: {
    kanban: ['task.finance.transactionRef'],
    runs: ['fibo-demo/transaction'],
    reports: ['交易流水'],
    api: ['/api/hermes/ontology/instances?type=IndividualTransaction'],
  },
  TransactionRecord: {
    kanban: [],
    runs: ['fibo-demo/transaction-record'],
    reports: ['交易记录'],
    api: ['/api/hermes/ontology/instances?type=TransactionRecord'],
  },
  Authorization: {
    kanban: [],
    runs: ['fibo-demo/authorization'],
    reports: ['授权', '预授权'],
    api: ['/api/hermes/ontology/instances?type=Authorization'],
  },
  Capture: {
    kanban: [],
    runs: ['fibo-demo/capture'],
    reports: ['扣款'],
    api: ['/api/hermes/ontology/instances?type=Capture'],
  },
  AccountHolder: {
    kanban: [],
    runs: [],
    reports: ['账户持有人'],
    api: ['/api/hermes/ontology/instances?type=AccountHolder'],
  },
  AccountProvider: {
    kanban: [],
    runs: [],
    reports: ['账户提供方'],
    api: ['/api/hermes/ontology/instances?type=AccountProvider'],
  },
  Merchant: {
    kanban: [],
    runs: [],
    reports: ['商户'],
    api: ['/api/hermes/ontology/instances?type=Merchant'],
  },
}

export interface FiboMappingSummary {
  rows: FiboSourceMapping[]
  counts: { total: number; mapped: number; unmapped: number }
}

export function fiboMappings(): FiboMappingSummary {
  const rows: FiboSourceMapping[] = fiboPackSummary().concepts.map((c) => {
    const o = OVERRIDES[c.id]
    if (!o) {
      return {
        conceptId: c.id, labelZh: c.labelZh, status: 'unmapped',
        kanban: [], runs: [], reports: [], api: [],
        note: '本产品当前无该概念的物理载体（参照术语）',
      }
    }
    const hasSource = o.kanban.length + o.runs.length + o.reports.length + o.api.length > 0
    return {
      conceptId: c.id, labelZh: c.labelZh,
      status: hasSource ? 'mapped' : 'unmapped',
      kanban: o.kanban, runs: o.runs, reports: o.reports, api: o.api,
      ...(o.note ? { note: o.note } : {}),
    }
  })
  const mapped = rows.filter((r) => r.status === 'mapped').length
  return { rows, counts: { total: rows.length, mapped, unmapped: rows.length - mapped } }
}
