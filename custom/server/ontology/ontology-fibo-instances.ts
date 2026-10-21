/**
 * FIBO 支付样例实例摄取（P2-1，2026-10-21）。
 *
 * 一条完整的 AIPay 式支付流水：币种、金额、付款方/收款方、合同、支付义务、
 * 支付、支付事件、账户/持有人/提供方/余额/账户标识、单笔交易/交易记录/商户、
 * 结算/结算事件，以及授权/扣款两个工程扩展。写入即校验：error 级违规整批拒写，
 * 不写半套。重复执行按 `fibo:` 前缀替换，幂等。
 */
import { fiboPackApplied, mergeFiboPack } from './ontology-fibo'
import { loadInstances, loadSpec, replaceIngested, saveSpec } from './ontology-store'
import type { OntologyInstance, OntologySpec, Violation } from './ontology-types'
import { validateInstances, violationSummary } from './ontology-validate'

const DEMO_PREFIX = 'fibo:'

function inst(
  id: string,
  type: string,
  label: string,
  data: Record<string, unknown>,
  relations: Array<{ property: string; target: string }> = [],
  now = Date.now(),
): OntologyInstance {
  return { id: `${DEMO_PREFIX}${id}`, type, label, data, relations, updatedAt: now }
}

/** 支付样例批次；所有必填数据属性与 FIBO restriction 派生关系均已满足。 */
export function buildFiboDemoInstances(now = Date.now()): OntologyInstance[] {
  return [
    inst('currency-eur', 'Currency', '欧元', { currencyCode: 'EUR', currencyName: 'Euro' }, [], now),
    inst('amount-100', 'MonetaryAmount', '支付金额 100 EUR', { amountValue: 100 }, [
      { property: 'hasCurrency', target: 'fibo:currency-eur' },
    ], now),
    inst('payer-acme', 'Payer', '付款方 ACME', { partyRef: 'ACME' }, [], now),
    inst('payee-beta', 'Payee', '收款方 BETA', { partyRef: 'BETA' }, [], now),
    inst('contract-1', 'Contract', '支付合同 CT-1', { contractRef: 'CT-1' }, [], now),
    inst('obligation-1', 'PaymentObligation', '支付义务 PO-1', {
      obligationRef: 'PO-1', dueOn: '2026-11-01', obligationStatus: 'fulfilled',
    }, [
      { property: 'isObligationOf', target: 'fibo:payer-acme' },
      { property: 'hasPartyRole', target: 'fibo:payee-beta' },
      { property: 'isConferredBy', target: 'fibo:contract-1' },
    ], now),
    inst('payment-1', 'Payment', '支付 PAY-1', {
      paymentRef: 'PAY-1', paymentDate: '2026-10-21', paymentStatus: 'completed',
    }, [
      { property: 'hasPaymentAmount', target: 'fibo:amount-100' },
      { property: 'fulfillsObligation', target: 'fibo:obligation-1' },
    ], now),
    inst('payment-event-1', 'PaymentEvent', '支付事件 EVT-1', { eventAt: '2026-10-21T10:00:00Z' }, [
      { property: 'involvesPayment', target: 'fibo:payment-1' },
      { property: 'appliesToPaymentObligation', target: 'fibo:obligation-1' },
    ], now),
    inst('holder-acme', 'AccountHolder', '账户持有人 ACME', { partyRef: 'ACME' }, [], now),
    inst('provider-bank', 'AccountProvider', '账户提供方 BANK', { partyRef: 'BANK' }, [], now),
    inst('account-id-1', 'AccountIdentifier', '账户标识 ACC-1', {}, [], now),
    inst('balance-1', 'Balance', '账户余额 900 EUR', { amountValue: 900, balanceValue: 900 }, [
      { property: 'hasCurrency', target: 'fibo:currency-eur' },
    ], now),
    inst('account-1', 'Account', '账户 ACC-1', { accountNumber: 'ACC-1', openedOn: '2026-01-01' }, [
      { property: 'isHeldBy', target: 'fibo:holder-acme' },
      { property: 'isProvidedBy', target: 'fibo:provider-bank' },
      { property: 'hasBalance', target: 'fibo:balance-1' },
      { property: 'isIdentifiedBy', target: 'fibo:account-id-1' },
    ], now),
    inst('txn-record-1', 'TransactionRecord', '交易记录 TR-1', {}, [], now),
    inst('merchant-1', 'Merchant', '商户 SHOP', {}, [], now),
    inst('txn-1', 'IndividualTransaction', '单笔交易 TXN-1', {
      transactionRef: 'TXN-1', postedOn: '2026-10-21',
    }, [
      { property: 'appliesToAccount', target: 'fibo:account-1' },
      { property: 'hasMonetaryAmount', target: 'fibo:amount-100' },
      { property: 'isRegisteredIn', target: 'fibo:txn-record-1' },
      { property: 'involvesMerchant', target: 'fibo:merchant-1' },
    ], now),
    inst('settlement-1', 'Settlement', '结算 STL-1', { settlementDate: '2026-10-22' }, [], now),
    inst('settlement-event-1', 'SettlementEvent', '结算事件 STL-EVT-1', {
      settledOn: '2026-10-22T12:00:00Z',
    }, [
      { property: 'exemplifies', target: 'fibo:settlement-1' },
    ], now),
    inst('authorization-1', 'Authorization', '授权 AUTH-1', {
      authorizedAmount: 100, status: 'authorized', authorizedAt: '2026-10-21T09:00:00Z',
    }, [], now),
    inst('capture-1', 'Capture', '扣款 CAP-1', {
      capturedAmount: 100, capturedAt: '2026-10-21T10:00:00Z',
    }, [], now),
  ]
}

export interface FiboDemoIngestResult {
  ok: boolean
  importedPack: boolean
  typesAdded: number
  instances: number
  applied: { concepts: number; total: number }
  violations: Violation[]
  summary: { error: number; warning: number; info: number }
  detail?: string
}

/** 导入包（如未导入）→ 组装批次 → 全量校验 → error=0 才按前缀替换写入。 */
export function ingestFiboDemo(now = Date.now()): FiboDemoIngestResult {
  let spec: OntologySpec = loadSpec()
  let importedPack = false
  let typesAdded = 0
  const appliedBefore = fiboPackApplied(spec)
  if (appliedBefore.concepts < appliedBefore.total) {
    const merged = mergeFiboPack(spec, now)
    if (!merged.ok || !merged.spec) {
      return {
        ok: false, importedPack: false, typesAdded: 0, instances: 0,
        applied: fiboPackApplied(spec),
        violations: [], summary: { error: 0, warning: 0, info: 0 },
        detail: `FIBO 包合并冲突：${merged.collisions.map((c) => `${c.kind}:${c.id}`).join(', ')}`,
      }
    }
    const saved = saveSpec(merged.spec, 'fibo-demo', now)
    if (!saved.ok || !saved.spec) {
      return {
        ok: false, importedPack: false, typesAdded: 0, instances: 0,
        applied: fiboPackApplied(spec),
        violations: saved.violations,
        summary: violationSummary(saved.violations),
        detail: 'FIBO 包保存未通过本体自检',
      }
    }
    spec = saved.spec
    importedPack = true
    typesAdded = merged.added.types
  }

  const batch = buildFiboDemoInstances(now)
  const kept = loadInstances().filter((i) => !i.id.startsWith(DEMO_PREFIX))
  const violations = validateInstances(spec, [...kept, ...batch])
  const summary = violationSummary(violations)
  if (summary.error > 0) {
    return {
      ok: false, importedPack, typesAdded, instances: 0,
      applied: fiboPackApplied(spec),
      violations, summary,
      detail: '支付样例存在 error 级违规，整批未写入',
    }
  }
  replaceIngested(DEMO_PREFIX, batch)
  return {
    ok: true, importedPack, typesAdded, instances: batch.length,
    applied: fiboPackApplied(spec),
    violations: violations.filter((v) => v.severity !== 'error'),
    summary,
  }
}
