/**
 * FIBO 金融域本体对齐包（2026-10-21 深调研落地）。
 *
 * 来源：https://github.com/edmcouncil/fibo · master_2026Q3（2026-10-20 发布）
 * 取证方式：逐模块下载 RDF/XML → 解析 owl:Class / owl:ObjectProperty /
 *   owl:Restriction（含 qualifiedCardinality）→ 记录真实 IRI、skos:definition
 *   原文、模块 owl:versionIRI 与 hasMaturityLevel。
 *
 * 三条硬规矩（防止「名义 FIBO」）：
 *   1. 每个 fibo 概念/属性的 IRI 必须落在其 module.base 下，且 definitionEn
 *      是 RDF 原文，不接受改写。
 *   2. FIBO 已迁移到 OMG Commons 的概念（Party/Identifier）标 origin=commons，
 *      不冒充 fibo- 命名空间。
 *   3. FIBO 无对应类的工程近似（Authorization/Capture）标
 *      origin=local-extension，IRI 落本工作台命名空间，并在 note 写明。
 *
 * 本包只做 T-Box（类型/属性/公理），实例由用户或看板摄取产生；不做运行时
 * RDF/OWL 推理（OD-004 决策不变），但导出的 JSON-LD/SHACL/Turtle 保留真实
 * IRI 与 dct:source，可被外部 pyshacl/rdflib 消费。
 */
import {
  versionIriOf,
  type Axiom,
  type DataProperty,
  type EntityType,
  type ExternalVocabulary,
  type ObjectProperty,
  type OntologySpec,
  type OriginKind,
  type TermProvenance,
} from './ontology-types'

export const FIBO_PACK_ID = 'fibo-finance'
export const FIBO_PACK_NAMESPACE = 'https://swarm.studio/ns/fibo-alignment#'

export const FIBO_SOURCE = {
  repo: 'https://github.com/edmcouncil/fibo',
  release: 'master_2026Q3',
  releasedAt: '2026-10-20',
  retrievedAt: '2026-10-21',
  license: 'MIT',
  viewer: 'https://spec.edmcouncil.org/fibo/ontology',
  spec: 'https://www.omg.org/spec/EDMC-FIBO/',
} as const

interface ModuleDef {
  path: string
  base: string
  versionIri: string
  maturity?: string
}

/** 本包引用的源模块（版本可追溯；Commons 模块无 FIBO 成熟度标注）。 */
export const FIBO_MODULES: Record<string, ModuleDef> = {
  payments: {
    path: 'FND/ProductsAndServices/PaymentsAndSchedules',
    base: 'https://spec.edmcouncil.org/fibo/ontology/FND/ProductsAndServices/PaymentsAndSchedules/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/FND/20250701/ProductsAndServices/PaymentsAndSchedules/',
    maturity: 'Release',
  },
  currency: {
    path: 'FND/Accounting/CurrencyAmount',
    base: 'https://spec.edmcouncil.org/fibo/ontology/FND/Accounting/CurrencyAmount/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/FND/20260701/Accounting/CurrencyAmount/',
    maturity: 'Release',
  },
  accounts: {
    path: 'FBC/ProductsAndServices/ClientsAndAccounts',
    base: 'https://spec.edmcouncil.org/fibo/ontology/FBC/ProductsAndServices/ClientsAndAccounts/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/FBC/20261001/ProductsAndServices/ClientsAndAccounts/',
    maturity: 'Release',
  },
  settlement: {
    path: 'FBC/FinancialInstruments/Settlement',
    base: 'https://spec.edmcouncil.org/fibo/ontology/FBC/FinancialInstruments/Settlement/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/FBC/20250301/FinancialInstruments/Settlement/',
    maturity: 'Release',
  },
  fpas: {
    path: 'FBC/ProductsAndServices/FinancialProductsAndServices',
    base: 'https://spec.edmcouncil.org/fibo/ontology/FBC/ProductsAndServices/FinancialProductsAndServices/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/FBC/20260701/ProductsAndServices/FinancialProductsAndServices/',
    maturity: 'Release',
  },
  contracts: {
    path: 'FND/Agreements/Contracts',
    base: 'https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/FND/20260601/Agreements/Contracts/',
    maturity: 'Release',
  },
  agreements: {
    path: 'FND/Agreements/Agreements',
    base: 'https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Agreements/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/FND/20260601/Agreements/Agreements/',
    maturity: 'Release',
  },
  legal: {
    path: 'FND/Law/LegalCapacity',
    base: 'https://spec.edmcouncil.org/fibo/ontology/FND/Law/LegalCapacity/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/FND/20251201/Law/LegalCapacity/',
    maturity: 'Release',
  },
  occurrences: {
    path: 'FND/DatesAndTimes/Occurrences',
    base: 'https://spec.edmcouncil.org/fibo/ontology/FND/DatesAndTimes/Occurrences/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/FND/20250301/DatesAndTimes/Occurrences/',
    maturity: 'Release',
  },
  relations: {
    path: 'FND/Relations/Relations',
    base: 'https://spec.edmcouncil.org/fibo/ontology/FND/Relations/Relations/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/FND/20260701/Relations/Relations/',
    maturity: 'Release',
  },
  lifecycles: {
    path: 'FND/Arrangements/Lifecycles',
    base: 'https://spec.edmcouncil.org/fibo/ontology/FND/Arrangements/Lifecycles/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/FND/20240101/Arrangements/Lifecycles/',
    maturity: 'Release',
  },
  beEntities: {
    path: 'BE/FunctionalEntities/FunctionalEntities',
    base: 'https://spec.edmcouncil.org/fibo/ontology/BE/FunctionalEntities/FunctionalEntities/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/BE/20260701/FunctionalEntities/FunctionalEntities/',
    maturity: 'Release',
  },
  marketTx: {
    path: 'FND/TransactionsExt/MarketTransactions',
    base: 'https://spec.edmcouncil.org/fibo/ontology/FND/TransactionsExt/MarketTransactions/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/FND/TransactionsExt/MarketTransactions/',
    maturity: 'Informative',
  },
  commonsParties: {
    path: 'Commons/PartiesAndSituations',
    base: 'https://www.omg.org/spec/Commons/PartiesAndSituations/',
    versionIri: 'https://www.omg.org/spec/Commons/20250801/PartiesAndSituations/',
  },
  commonsIds: {
    path: 'Commons/Identifiers',
    base: 'https://www.omg.org/spec/Commons/Identifiers/',
    versionIri: 'https://www.omg.org/spec/Commons/20221101/Identifiers/',
  },
  commonsContext: {
    path: 'Commons/ContextualDesignators',
    base: 'https://www.omg.org/spec/Commons/ContextualDesignators/',
    versionIri: '',
  },
  commonsOrgs: {
    path: 'Commons/Organizations',
    base: 'https://www.omg.org/spec/Commons/Organizations/',
    versionIri: '',
  },
  commonsRegistration: {
    path: 'Commons/RegistrationAuthorities',
    base: 'https://www.omg.org/spec/Commons/RegistrationAuthorities/',
    versionIri: '',
  },
}

type ModuleKey = keyof typeof FIBO_MODULES

interface ConceptDef {
  id: string
  /** FIBO 英文 label（Commons 概念同）。 */
  label: string
  labelZh: string
  defEn: string
  defZh: string
  category: string
  origin: OriginKind
  module?: ModuleKey
  /** 模块内的本地名（缺省 = id）。 */
  localName?: string
  parent?: string
  key?: string
  note?: string
  props?: DataProperty[]
}

function conceptIri(c: ConceptDef): string {
  if (c.origin === 'local-extension') return `${FIBO_PACK_NAMESPACE}${c.id}`
  if (!c.module) throw new Error(`FIBO 概念 ${c.id} 缺少 module`)
  return `${FIBO_MODULES[c.module].base}${c.localName ?? c.id}`
}

function conceptProvenance(c: ConceptDef): TermProvenance {
  if (c.origin === 'local-extension') {
    return {
      origin: c.origin,
      retrievedAt: FIBO_SOURCE.retrievedAt,
      note: c.note ?? '非 FIBO 概念：本工作台工程近似，不得冒充 FIBO 术语。',
    }
  }
  const m = FIBO_MODULES[c.module!]
  return {
    origin: c.origin,
    module: m.path,
    versionIri: m.versionIri || undefined,
    maturity: m.maturity,
    retrievedAt: FIBO_SOURCE.retrievedAt,
    definitionEn: c.defEn,
    ...(c.note ? { note: c.note } : {}),
  }
}

/** 本地补充字段（非 FIBO 定义）：FIBO 用对象属性建模金额/币种等关系，实例落库需要标量字段。 */
function localProp(
  id: string,
  label: string,
  datatype: DataProperty['datatype'],
  opts: Partial<Omit<DataProperty, 'id' | 'label' | 'datatype' | 'provenance'>> = {},
): DataProperty {
  return {
    id,
    label,
    datatype,
    modality: opts.modality ?? 'should',
    ...opts,
    provenance: {
      origin: 'local-extension',
      retrievedAt: FIBO_SOURCE.retrievedAt,
      note: '工作台本地补充字段（非 FIBO 定义）；FIBO 以对象属性建模金额、币种、日期等关系。',
    },
  }
}

// ---- 概念（36 类：FIBO 32 + Commons 2 + 本地扩展 2） ----

const CONCEPTS: ConceptDef[] = [
  // —— 参与方与协议 ——
  {
    id: 'Party', label: 'party', labelZh: '参与方', origin: 'commons', module: 'commonsParties',
    defEn: 'person or organization',
    defZh: '个人或组织（FIBO 已把 Party 迁移到 OMG Commons，不在 fibo- 命名空间下）',
    category: '参与方与协议',
  },
  {
    id: 'Agreement', label: 'agreement', labelZh: '协议', origin: 'fibo', module: 'agreements',
    defEn: 'negotiated understanding between two or more parties, reflecting the offer and acceptance of commitments on the part of either party',
    defZh: '两方或多方经协商达成的理解，体现各方对承诺的要约与接受',
    category: '参与方与协议',
  },
  {
    id: 'Contract', label: 'contract', labelZh: '合同', origin: 'fibo', module: 'contracts', parent: 'Agreement',
    defEn: 'voluntary, deliberate agreement between competent parties to which the parties agree to be legally bound, and for which the parties provide valuable consideration',
    defZh: '有行为能力的各方自愿、审慎达成的协议，各方同意受法律约束并提供对价',
    category: '参与方与协议',
    props: [localProp('contractRef', '合同编号', 'string')],
  },
  {
    id: 'ContractualElement', label: 'contractual element', labelZh: '合同要素', origin: 'fibo', module: 'contracts',
    defEn: 'element, such as an arrangement, provision, requirement, rule, specification, and standard that forms an integral part of an agreement',
    defZh: '构成协议不可分割组成部分的元素（安排、条款、要求、规则、规格、标准等）',
    category: '参与方与协议',
  },
  {
    id: 'ContractualCommitment', label: 'contractual commitment', labelZh: '合同承诺', origin: 'fibo', module: 'contracts', parent: 'ContractualElement',
    defEn: 'provision specifying something that the contracting parties agree to, i.e., a promise or pledge made by one of the parties to perform some action or fulfill some duty',
    defZh: '规定缔约方约定事项的条款，即一方作出的履行某行为或义务的承诺',
    category: '参与方与协议',
  },
  {
    id: 'Commitment', label: 'commitment', labelZh: '承诺', origin: 'fibo', module: 'agreements',
    defEn: 'promise made by some party to act or refrain from acting in some manner',
    defZh: '某方作出的作为或不作为承诺',
    category: '参与方与协议',
  },
  {
    id: 'Duty', label: 'duty', labelZh: '义务', origin: 'fibo', module: 'legal',
    defEn: 'some obligation which exists and is imposed on some individual',
    defZh: '施加于某个主体的义务',
    category: '参与方与协议',
  },
  {
    id: 'PaymentObligation', label: 'payment obligation', labelZh: '支付义务', origin: 'fibo', module: 'payments', parent: 'Commitment',
    defEn: 'legally enforceable duty to pay a sum of money according to the terms stated in a contract',
    defZh: '按合同条款支付一定金额的可依法强制执行的义务',
    category: '参与方与协议',
    note: 'FIBO 多重父类：Commitment + Duty；本包取 Commitment 作单继承父类（模型限制，已如实登记）。',
    props: [
      localProp('obligationRef', '义务编号', 'string'),
      localProp('dueOn', '到期日', 'date'),
      localProp('obligationStatus', '义务状态', 'string', { enum: ['open', 'fulfilled', 'overdue', 'cancelled'] }),
    ],
  },
  {
    id: 'Payer', label: 'payer', labelZh: '付款方', origin: 'fibo', module: 'payments',
    defEn: 'a party who pays a bill or fees, or who makes payments to a payee in partial or complete fulfillment of an obligation',
    defZh: '支付账单/费用，或向收款方付款以部分/全部履行义务的一方',
    category: '参与方与协议',
    note: 'FIBO 父类 Obligor（未纳入本包）。',
    props: [localProp('partyRef', '参与方编号', 'string')],
  },
  {
    id: 'Payee', label: 'payee', labelZh: '收款方', origin: 'fibo', module: 'payments',
    defEn: 'a party to whom a debt should be paid, or to whose order a bill of exchange, note, or check is made payable, or who receives or will receive a payment from a payer in partial or complete fulfillment of an obligation',
    defZh: '应收款的一方，或收款方付款的受领人（部分/全部履行义务）',
    category: '参与方与协议',
    note: 'FIBO 父类 Obligee（未纳入本包）。',
    props: [localProp('partyRef', '参与方编号', 'string')],
  },
  {
    id: 'ContractParty', label: 'contract party', labelZh: '合同当事方', origin: 'fibo', module: 'contracts',
    defEn: 'legally competent party that has entered into a binding agreement, accepting and conceding obligations, responsibilities, and benefits as specified',
    defZh: '已订立有约束力协议、按约定承担义务/责任并享有利益的法律上适格的参与方',
    category: '参与方与协议',
    note: 'FIBO 父类 PartyRole（未纳入本包）。',
  },

  // —— 支付与金额 ——
  {
    id: 'Payment', label: 'payment', labelZh: '支付', origin: 'fibo', module: 'payments', parent: 'Occurrence', key: 'paymentRef',
    defEn: 'delivery of money in fulfillment of an obligation, such as to satisfy a claim or debt',
    defZh: '为履行义务（如清偿索赔或债务）而交付货币的行为',
    category: '支付与金额',
    props: [
      localProp('paymentRef', '支付编号', 'string', { required: true, modality: 'shall' }),
      localProp('paymentDate', '支付日期', 'date'),
      localProp('paymentStatus', '支付状态', 'string', { enum: ['initiated', 'completed', 'failed', 'returned'] }),
    ],
  },
  {
    id: 'PaymentEvent', label: 'payment event', labelZh: '支付事件', origin: 'fibo', module: 'payments',
    defEn: 'an event that involves delivery of money in fulfillment of an obligation',
    defZh: '涉及为履行义务而交付货币的事件',
    category: '支付与金额',
    note: 'FIBO 父类 TransactionEvent；FIBO 区分事件类目（OccurrenceKind）与事件实例（Occurrence）。',
    props: [localProp('eventAt', '事件时间', 'datetime')],
  },
  {
    id: 'PaymentSchedule', label: 'payment schedule', labelZh: '支付计划', origin: 'fibo', module: 'payments',
    defEn: 'schedule for delivery of money in fulfillment of an obligation',
    defZh: '为履行义务而交付货币的时间安排',
    category: '支付与金额',
    note: 'FIBO 父类 Schedule（未纳入本包）。',
  },
  {
    id: 'MonetaryAmount', label: 'monetary amount', labelZh: '货币金额', origin: 'fibo', module: 'currency', key: 'amountValue',
    defEn: 'measure that is an amount of money specified in monetary units',
    defZh: '以货币单位表示的一定金额的度量',
    category: '支付与金额',
    note: 'FIBO 父类 ScalarQuantityValue；金额与币种是两个独立关系（hasAmount / hasCurrency）。',
    props: [
      localProp('amountValue', '金额数值', 'number', { required: true, modality: 'shall', min: 0 }),
    ],
  },
  {
    id: 'Currency', label: 'currency', labelZh: '币种', origin: 'fibo', module: 'currency', key: 'currencyCode',
    defEn: 'medium of exchange value, defined by reference to the geographical location of the monetary authorities responsible for it',
    defZh: '交换价值媒介，按其货币主管当局的地理位置界定',
    category: '支付与金额',
    note: 'FIBO 父类 MeasurementUnit；ISO 4217 币种代码见 CurrencyIdentifier。',
    props: [
      localProp('currencyCode', 'ISO 4217 代码', 'string', { required: true, modality: 'shall', pattern: '^[A-Z]{3}$' }),
      localProp('currencyName', '币种名称', 'string'),
    ],
  },

  // —— 结算 ——
  {
    id: 'ContractLifecycleEvent', label: 'contract lifecycle event', labelZh: '合同生命周期事件（类目）', origin: 'fibo', module: 'fpas',
    defEn: 'kind of event that occurs during one or more stages of the lifecycle of an agreement',
    defZh: '在协议生命周期一个或多个阶段发生的事件类目',
    category: '结算',
  },
  {
    id: 'ContractLifecycleEventOccurrence', label: 'contract lifecycle event occurrence', labelZh: '合同生命周期事件（实例）', origin: 'fibo', module: 'fpas', parent: 'Occurrence',
    defEn: 'actual occurrence of an event during a specific stage of a specific contract lifecycle',
    defZh: '特定合同生命周期特定阶段中事件的实际发生',
    category: '结算',
  },
  {
    id: 'Settlement', label: 'settlement', labelZh: '结算（事件类目）', origin: 'fibo', module: 'settlement', parent: 'ContractLifecycleEvent',
    defEn: 'act of finalizing a transaction, including but not limited to finalizing accounting, exchanging consideration, and/or legally recording documents, as applicable',
    defZh: '完成交易的行为，包括但不限于完成会计处理、交换对价和/或依法登记文件（视情况而定）',
    category: '结算',
    note: 'FIBO 的 Settlement 是合同生命周期事件类目，不是「金额状态」；扣款完成 ≠ 结算。',
    props: [localProp('settlementDate', '结算日期', 'date')],
  },
  {
    id: 'SettlementEvent', label: 'settlement event', labelZh: '结算事件（实例）', origin: 'fibo', module: 'settlement', parent: 'ContractLifecycleEventOccurrence',
    defEn: 'specific event involving the finalization a transaction or portion thereof, including but not limited to finalizing accounting, exchanging consideration, and/or legally recording documents, as applicable',
    defZh: '完成交易或其一部分的具体事件，包括但不限于会计处理、交换对价和/或依法登记文件',
    category: '结算',
    note: 'FIBO 把 SettlementEvent 建模为 Settlement 类目的实际发生（exemplifies），不是 Payment 的同义词。',
    props: [localProp('settledOn', '结算完成时间', 'datetime')],
  },
  {
    id: 'SettlementTerms', label: 'settlement terms', labelZh: '结算条款', origin: 'fibo', module: 'fpas', parent: 'ContractualCommitment',
    defEn: 'contract terms that define the commitment to and mechanism for settling one or more sides of a transaction',
    defZh: '定义交易一方或多方结算承诺与机制的合同条款',
    category: '结算',
  },

  // —— 账户与流水 ——
  {
    id: 'Account', label: 'account', labelZh: '账户', origin: 'fibo', module: 'accounts', key: 'accountNumber',
    defEn: 'container for records associated with a business arrangement for regular transactions and services',
    defZh: '与定期交易和服务的商业安排相关联的记录容器（注意：是记录容器，不是资金容器）',
    category: '账户与流水',
    note: 'FIBO 父类 FinancialRecord；账户是记录容器，余额/持有人/提供方都是独立关系。',
    props: [
      localProp('accountNumber', '账户编号', 'string', { required: true, modality: 'shall' }),
      localProp('openedOn', '开户日期', 'date'),
    ],
  },
  {
    id: 'CustomerAccount', label: 'customer account', labelZh: '客户账户', origin: 'fibo', module: 'accounts', parent: 'Account',
    defEn: 'account that represents an identified, named collection of balances and cumulative totals used to summarize customer transaction-related activity over a designated period of time',
    defZh: '代表具名、可识别的一组余额与累计值、用于汇总客户在指定期间交易活动的账户',
    category: '账户与流水',
  },
  {
    id: 'AccountHolder', label: 'account holder', labelZh: '账户持有人', origin: 'fibo', module: 'accounts',
    defEn: 'party that owns an account',
    defZh: '拥有账户的参与方',
    category: '账户与流水',
    note: 'FIBO 父类 PartyRole（未纳入本包）。',
  },
  {
    id: 'AccountIdentifier', label: 'account identifier', labelZh: '账户标识', origin: 'fibo', module: 'accounts', parent: 'Identifier',
    defEn: 'identifier that denotes an account',
    defZh: '标识账户的标识符',
    category: '账户与流水',
  },
  {
    id: 'AccountProvider', label: 'account provider', labelZh: '账户提供方', origin: 'fibo', module: 'accounts', parent: 'Party',
    defEn: 'party that provides and services an account',
    defZh: '提供并维护账户服务的参与方',
    category: '账户与流水',
  },
  {
    id: 'IndividualTransaction', label: 'individual transaction', labelZh: '单笔交易', origin: 'fibo', module: 'accounts', parent: 'Occurrence', key: 'transactionRef',
    defEn: 'event that has a monetary impact and is documented in the records associated with an account',
    defZh: '具有货币影响、并记录在与账户关联的记录中的事件',
    category: '账户与流水',
    note: 'FIBO 的 IndividualTransaction 是账户流水的单笔事件，不等同于 MarketTransaction（Informative 的交易概念）。',
    props: [
      localProp('transactionRef', '交易编号', 'string', { required: true, modality: 'shall' }),
      localProp('postedOn', '入账日期', 'date'),
    ],
  },
  {
    id: 'TransactionRecord', label: 'transaction record', labelZh: '交易记录', origin: 'fibo', module: 'accounts',
    defEn: 'record of transactions associated with an account',
    defZh: '与账户关联的交易记录',
    category: '账户与流水',
    note: 'FIBO 父类 Record / Registry（未纳入本包）。',
  },
  {
    id: 'Balance', label: 'balance', labelZh: '余额', origin: 'fibo', module: 'accounts', parent: 'MonetaryAmount',
    defEn: 'amount of money available or owed',
    defZh: '可用或应付的金额',
    category: '账户与流水',
    props: [localProp('balanceValue', '余额数值', 'number', { required: true, modality: 'shall', min: 0 })],
  },
  {
    id: 'Merchant', label: 'merchant', labelZh: '商户', origin: 'fibo', module: 'beEntities', parent: 'Party',
    defEn: 'party engaged in the purchase and sales of goods produced by others for profit',
    defZh: '以营利为目的购销他人生产的商品的参与方',
    category: '账户与流水',
    note: 'FIBO 父类 FunctionalBusinessEntity；本包上提到 Party 以保持层级连通（已如实登记）。',
  },

  // —— 标识与状态 ——
  {
    id: 'Identifier', label: 'identifier', labelZh: '标识符', origin: 'commons', module: 'commonsIds',
    defEn: 'sequence of characters uniquely identifying that with which it is associated',
    defZh: '在其关联对象范围内唯一标识该对象的字符序列（FIBO 已迁移到 OMG Commons）',
    category: '标识与状态',
  },
  {
    id: 'LifecycleStatus', label: 'lifecycle status', labelZh: '生命周期状态', origin: 'fibo', module: 'lifecycles',
    defEn: 'classifier indicating the position or state of something at a particular point in its life-cycle',
    defZh: '指示某物在其生命周期某一时点所处位置或状态的分类器',
    category: '标识与状态',
    note: 'FIBO 无裸 Status 类；本概念取代「Status」这一口头泛称。',
  },
  {
    id: 'Occurrence', label: 'occurrence', labelZh: '事件实例', origin: 'fibo', module: 'occurrences',
    defEn: 'happening of an OccurrenceKind, i.e., an event',
    defZh: '事件类目的一次实际发生（即事件实例）',
    category: '标识与状态',
    note: 'FIBO 的基础区分：事件类目（OccurrenceKind）vs 事件实例（Occurrence）；Payment 属于后者。',
  },

  // —— 交易（诚实兜底） ——
  {
    id: 'MarketTransaction', label: 'market transaction', labelZh: '市场交易', origin: 'fibo', module: 'marketTx',
    defEn: 'Any transaction which defines a supply of some negotiable item in return for some Consideration. The Market Transaction has a Principal and a Counterparty, i.e. it is not symmetrical.',
    defZh: '定义以某种对价供给可流通标的的任何交易；有本金方与对手方，因而不对称',
    category: '交易（诚实兜底）',
    note: 'FIBO 无裸 Transaction 类；该概念成熟度为 Informative，仅作对照，不建议作为交易主键。',
    props: [localProp('tradeRef', '交易编号', 'string')],
  },

  // —— 工程扩展（明确非 FIBO） ——
  {
    id: 'Authorization', label: 'authorization', labelZh: '授权（工程扩展）', origin: 'local-extension',
    defEn: '',
    defZh: '卡支付流水线中的可撤回资金保留：授权额度 ≠ 已扣款额度（FIBO 全仓无对应类；属 ISO 8583 / PSP 领域概念）',
    category: '工程扩展（非 FIBO）',
    note: 'FIBO 无 Authorization 类（全仓 code search 0 命中）。保留本概念是为了和 Capture/Settlement 做语义区分；不得标注为 FIBO。',
    props: [
      localProp('authorizedAmount', '授权金额', 'number', { required: true, modality: 'shall', min: 0 }),
      localProp('status', '授权状态', 'string', { required: true, modality: 'shall', enum: ['authorized', 'voided', 'expired'] }),
      localProp('authorizedAt', '授权时间', 'datetime'),
    ],
  },
  {
    id: 'Capture', label: 'capture', labelZh: '扣款（工程扩展）', origin: 'local-extension',
    defEn: '',
    defZh: '把已授权额度转为实际扣款的动作：扣款 ≠ 结算（FIBO 全仓无对应类；属卡支付 API 术语）',
    category: '工程扩展（非 FIBO）',
    note: 'FIBO 无 Capture 类（全仓 code search 0 命中）。语义门用它区分 capturedAmount / settledAmount；不得标注为 FIBO。',
    props: [
      localProp('capturedAmount', '扣款金额', 'number', { required: true, modality: 'shall', min: 0 }),
      localProp('capturedAt', '扣款时间', 'datetime'),
    ],
  },
]

// ---- 对象属性（Domain/Range/基数来自 FIBO owl:Restriction） ----

interface ObjectPropDef {
  id: string
  label: string
  labelZh: string
  defEn: string
  origin: OriginKind
  module: ModuleKey
  localName?: string
  domain: string[]
  range: string[]
  cardinality?: { min?: number; max?: number }
  modality: ObjectProperty['modality']
  note?: string
}

function objectPropIri(p: ObjectPropDef): string {
  return `${FIBO_MODULES[p.module].base}${p.localName ?? p.id}`
}

function objectPropProvenance(p: ObjectPropDef): TermProvenance {
  const m = FIBO_MODULES[p.module]
  return {
    origin: p.origin,
    module: m.path,
    versionIri: m.versionIri || undefined,
    maturity: m.maturity,
    retrievedAt: FIBO_SOURCE.retrievedAt,
    definitionEn: p.defEn,
    ...(p.note ? { note: p.note } : {}),
  }
}

const OBJECT_PROPS: ObjectPropDef[] = [
  {
    id: 'hasPaymentAmount', label: 'has payment amount', labelZh: '支付金额', origin: 'fibo', module: 'payments',
    defEn: 'specifies the amount of money involved in a payment',
    domain: ['Payment'], range: ['MonetaryAmount'], cardinality: { min: 1 }, modality: 'shall',
  },
  {
    id: 'fulfillsObligation', label: 'fulfills obligation', labelZh: '履行支付义务', origin: 'fibo', module: 'payments',
    defEn: 'satisfies a requirement for payment of some claim, debt, or other obligation',
    domain: ['Payment'], range: ['PaymentObligation'], modality: 'should',
  },
  {
    id: 'involvesPayment', label: 'involves', labelZh: '涉及支付', origin: 'fibo', module: 'relations', localName: 'involves',
    defEn: 'PaymentEvent involves exactly one Payment (FIBO qualifiedCardinality 1)',
    domain: ['PaymentEvent'], range: ['Payment'], cardinality: { min: 1, max: 1 }, modality: 'shall',
    note: 'FIBO 属性名为 involves，域/范围按 PaymentEvent 的 owl:Restriction 收窄。',
  },
  {
    id: 'appliesToPaymentObligation', label: 'applies to', labelZh: '对应支付义务', origin: 'commons', module: 'commonsContext', localName: 'appliesTo',
    defEn: 'PaymentEvent applies to exactly one PaymentObligation (FIBO qualifiedCardinality 1)',
    domain: ['PaymentEvent'], range: ['PaymentObligation'], cardinality: { min: 1, max: 1 }, modality: 'shall',
    note: 'Commons 的 appliesTo 域更宽；FIBO 在 PaymentEvent 上以 qualifiedCardinality 1 收窄到 PaymentObligation。',
  },
  {
    id: 'isObligationOf', label: 'is obligation of', labelZh: '义务归属', origin: 'fibo', module: 'agreements',
    defEn: 'relates an obligation to the party that is obligated',
    domain: ['PaymentObligation'], range: ['Payer'], cardinality: { min: 1 }, modality: 'shall',
  },
  {
    id: 'hasPartyRole', label: 'has party role', labelZh: '当事方角色', origin: 'commons', module: 'commonsParties',
    defEn: 'relates something to a role played by a party in that context',
    domain: ['PaymentObligation'], range: ['Payee'], cardinality: { min: 1 }, modality: 'shall',
    note: 'FIBO 在 PaymentObligation 上以 hasPartyRole someValuesFrom Payee 约束；Commons 的域更宽，本包按支付域用法收窄。',
  },
  {
    id: 'isConferredBy', label: 'is conferred by', labelZh: '由合同授予', origin: 'fibo', module: 'relations',
    defEn: 'relates a right or obligation to the agreement that confers it',
    domain: ['PaymentObligation'], range: ['Contract'], modality: 'should',
  },
  {
    id: 'hasCurrency', label: 'has currency', labelZh: '币种', origin: 'fibo', module: 'currency',
    defEn: 'relates a monetary amount to its currency (FIBO qualifiedCardinality 1)',
    domain: ['MonetaryAmount'], range: ['Currency'], cardinality: { min: 1, max: 1 }, modality: 'shall',
  },
  {
    id: 'hasContractParty', label: 'has contract party', labelZh: '合同当事方', origin: 'fibo', module: 'contracts',
    defEn: 'indicates a party that has entered into a binding agreement, accepting and conceding obligations, responsibilities, and benefits as specified',
    domain: ['Contract'], range: ['ContractParty'], modality: 'should',
  },
  {
    id: 'hasContractualElement', label: 'has contractual element', labelZh: '合同要素', origin: 'fibo', module: 'contracts',
    defEn: 'indicates something that is a component of an agreement',
    domain: ['Agreement'], range: ['ContractualElement'], modality: 'should',
  },
  {
    id: 'isHeldBy', label: 'is held by', labelZh: '持有人', origin: 'fibo', module: 'relations',
    defEn: 'relates an asset or account to the party that holds it',
    domain: ['Account'], range: ['AccountHolder'], cardinality: { min: 1 }, modality: 'shall',
  },
  {
    id: 'isIdentifiedBy', label: 'is identified by', labelZh: '以标识符标识', origin: 'commons', module: 'commonsIds',
    defEn: 'relates something to an identifier that denotes it',
    domain: ['Account'], range: ['AccountIdentifier'], modality: 'should',
  },
  {
    id: 'hasBalance', label: 'has balance', labelZh: '账户余额', origin: 'fibo', module: 'accounts',
    defEn: 'relates an account to the net amount of money available in that account',
    domain: ['Account'], range: ['Balance'], cardinality: { min: 1 }, modality: 'shall',
  },
  {
    id: 'isProvidedBy', label: 'is provided by', labelZh: '账户提供方', origin: 'commons', module: 'commonsOrgs',
    defEn: 'relates a service or account to the provider that supplies it',
    domain: ['Account'], range: ['AccountProvider'], cardinality: { min: 1 }, modality: 'shall',
  },
  {
    id: 'appliesToAccount', label: 'applies to account', labelZh: '所属账户', origin: 'fibo', module: 'accounts',
    defEn: 'indicates the account to which the transaction record or individual transaction applies',
    domain: ['IndividualTransaction'], range: ['Account'], cardinality: { min: 1, max: 1 }, modality: 'shall',
  },
  {
    id: 'hasMonetaryAmount', label: 'has monetary amount', labelZh: '交易金额', origin: 'fibo', module: 'currency',
    defEn: 'relates a transaction to the monetary amount involved (FIBO qualifiedCardinality 1)',
    domain: ['IndividualTransaction'], range: ['MonetaryAmount'], cardinality: { min: 1, max: 1 }, modality: 'shall',
  },
  {
    id: 'involvesMerchant', label: 'involves merchant', labelZh: '涉及商户', origin: 'fibo', module: 'accounts',
    defEn: 'indicates the merchant (seller) involved in the transaction',
    domain: ['IndividualTransaction'], range: ['Merchant'], modality: 'may',
  },
  {
    id: 'isRegisteredIn', label: 'is registered in', labelZh: '登记于交易记录', origin: 'commons', module: 'commonsRegistration',
    defEn: 'relates an individual transaction to the record in which it is registered',
    domain: ['IndividualTransaction'], range: ['TransactionRecord'], modality: 'should',
  },
  {
    id: 'exemplifies', label: 'exemplifies', labelZh: '体现结算类目', origin: 'fibo', module: 'relations',
    defEn: 'relates an occurrence to the kind of event it exemplifies (FIBO qualifiedCardinality 1)',
    domain: ['SettlementEvent'], range: ['Settlement'], cardinality: { min: 1, max: 1 }, modality: 'shall',
  },
  {
    id: 'hasSettlementAmount', label: 'has settlement amount', labelZh: '结算金额', origin: 'fibo', module: 'settlement',
    defEn: 'indicates the monetary amount required for cash settlement',
    domain: ['SettlementTerms'], range: ['MonetaryAmount'], modality: 'should',
  },
  {
    id: 'hasPreferredSettlementCurrency', label: 'has preferred settlement currency', labelZh: '首选结算币种', origin: 'fibo', module: 'settlement',
    defEn: 'indicates the preferred currency for settlement purposes',
    domain: ['SettlementTerms'], range: ['Currency'], modality: 'should',
  },
]

// ---- 公理（FIBO restriction 派生 + 明确标注的本地对齐公理） ----

const AXIOMS: Axiom[] = [
  {
    id: 'ax-fibo-payment-amount', kind: 'relation', modality: 'shall',
    constraint: { type: 'required-relation', onClass: 'Payment', property: 'hasPaymentAmount' },
    message: '支付必须有金额（FIBO Payment 上 hasPaymentAmount someValuesFrom MonetaryAmount）',
    description: 'FIBO restriction 派生',
  },
  {
    id: 'ax-fibo-obligation-payer', kind: 'relation', modality: 'shall',
    constraint: { type: 'required-relation', onClass: 'PaymentObligation', property: 'isObligationOf' },
    message: '支付义务必须有付款方（FIBO isObligationOf someValuesFrom Payer）',
    description: 'FIBO restriction 派生',
  },
  {
    id: 'ax-fibo-obligation-payee', kind: 'relation', modality: 'shall',
    constraint: { type: 'required-relation', onClass: 'PaymentObligation', property: 'hasPartyRole' },
    message: '支付义务必须有收款方（FIBO hasPartyRole someValuesFrom Payee）',
    description: 'FIBO restriction 派生',
  },
  {
    id: 'ax-fibo-monetary-currency', kind: 'relation', modality: 'shall',
    constraint: { type: 'required-relation', onClass: 'MonetaryAmount', property: 'hasCurrency' },
    message: '货币金额必须有币种（FIBO hasCurrency qualifiedCardinality 1）',
    description: 'FIBO restriction 派生',
  },
  {
    id: 'ax-fibo-payment-event-payment', kind: 'relation', modality: 'shall',
    constraint: { type: 'required-relation', onClass: 'PaymentEvent', property: 'involvesPayment' },
    message: '支付事件必须涉及一笔支付（FIBO involves qualifiedCardinality 1）',
    description: 'FIBO restriction 派生',
  },
  {
    id: 'ax-fibo-payment-event-obligation', kind: 'relation', modality: 'shall',
    constraint: { type: 'required-relation', onClass: 'PaymentEvent', property: 'appliesToPaymentObligation' },
    message: '支付事件必须对应一项支付义务（FIBO appliesTo qualifiedCardinality 1）',
    description: 'FIBO restriction 派生',
  },
  {
    id: 'ax-fibo-account-holder', kind: 'relation', modality: 'shall',
    constraint: { type: 'required-relation', onClass: 'Account', property: 'isHeldBy' },
    message: '账户必须有持有人（FIBO Account isHeldBy AccountHolder）',
    description: 'FIBO restriction 派生',
  },
  {
    id: 'ax-fibo-account-balance', kind: 'relation', modality: 'shall',
    constraint: { type: 'required-relation', onClass: 'Account', property: 'hasBalance' },
    message: '账户必须有余额（FIBO Account hasBalance someValuesFrom Balance）',
    description: 'FIBO restriction 派生',
  },
  {
    id: 'ax-fibo-account-provider', kind: 'relation', modality: 'shall',
    constraint: { type: 'required-relation', onClass: 'Account', property: 'isProvidedBy' },
    message: '账户必须有提供方（FIBO Account isProvidedBy someValuesFrom AccountProvider）',
    description: 'FIBO restriction 派生',
  },
  {
    id: 'ax-fibo-individual-account', kind: 'relation', modality: 'shall',
    constraint: { type: 'required-relation', onClass: 'IndividualTransaction', property: 'appliesToAccount' },
    message: '单笔交易必须归属一个账户（FIBO appliesToAccount qualifiedCardinality 1）',
    description: 'FIBO restriction 派生',
  },
  {
    id: 'ax-fibo-individual-amount', kind: 'relation', modality: 'shall',
    constraint: { type: 'required-relation', onClass: 'IndividualTransaction', property: 'hasMonetaryAmount' },
    message: '单笔交易必须有金额（FIBO hasMonetaryAmount qualifiedCardinality 1）',
    description: 'FIBO restriction 派生',
  },
  {
    id: 'ax-fibo-settlement-event', kind: 'relation', modality: 'shall',
    constraint: { type: 'required-relation', onClass: 'SettlementEvent', property: 'exemplifies' },
    message: '结算事件必须体现一个结算类目（FIBO exemplifies qualifiedCardinality 1）',
    description: 'FIBO restriction 派生',
  },
  {
    id: 'ax-local-account-number-unique', kind: 'property', modality: 'shall',
    constraint: { type: 'unique-key', onClass: 'Account' },
    message: '账户编号在本地工作台内唯一（工作台本地规则，非 FIBO 断言）',
    description: '本地工程规则',
  },
  {
    id: 'ax-local-obligation-payment-disjoint', kind: 'class', modality: 'shall',
    constraint: { type: 'disjoint', classes: ['PaymentObligation', 'Payment'] },
    message: '支付义务与支付本身不相交（义务 ≠ 履行；本地对齐公理，FIBO 未显式断言）',
    description: '本地对齐公理',
  },
  {
    id: 'ax-local-authorization-capture-disjoint', kind: 'class', modality: 'shall',
    constraint: { type: 'disjoint', classes: ['Authorization', 'Capture'] },
    message: '授权与扣款不相交（卡支付流水线的不同阶段；本地公理，FIBO 无这两个类）',
    description: '本地对齐公理',
  },
  {
    id: 'ax-local-capture-settlement-disjoint', kind: 'class', modality: 'shall',
    constraint: { type: 'disjoint', classes: ['Capture', 'SettlementEvent'] },
    message: '扣款与结算事件不相交（扣款完成 ≠ 结算完成；本地对齐公理，FIBO 无 Capture 类）',
    description: '本地对齐公理',
  },
]

// ---- 转换与合并 ----

function toEntityType(c: ConceptDef): EntityType {
  return {
    id: c.id,
    label: c.labelZh,
    labelEn: c.label,
    description: c.defZh,
    iri: conceptIri(c),
    parent: c.parent,
    category: c.category,
    key: c.key,
    modality: 'shall',
    provenance: conceptProvenance(c),
    dataProperties: c.props ?? [],
  }
}

function toObjectProperty(p: ObjectPropDef): ObjectProperty {
  return {
    id: p.id,
    label: p.labelZh,
    iri: objectPropIri(p),
    domain: p.domain,
    range: p.range,
    cardinality: p.cardinality,
    modality: p.modality,
    description: p.defEn,
    provenance: objectPropProvenance(p),
  }
}

/** 外部词表前缀（导出 @context / @prefix / owl:imports）。 */
function vocabularies(): ExternalVocabulary[] {
  const used = new Set<ModuleKey>()
  for (const c of CONCEPTS) if (c.module) used.add(c.module)
  for (const p of OBJECT_PROPS) used.add(p.module)
  const prefixOf: Record<string, string> = {
    payments: 'fibo-fnd-pas-psch',
    currency: 'fibo-fnd-acc-cur',
    accounts: 'fibo-fbc-pas-caa',
    settlement: 'fibo-fbc-fi-stl',
    fpas: 'fibo-fbc-pas-fpas',
    contracts: 'fibo-fnd-agr-ctr',
    agreements: 'fibo-fnd-agr-agr',
    legal: 'fibo-fnd-law-lcap',
    occurrences: 'fibo-fnd-dt-oc',
    relations: 'fibo-fnd-rel-rel',
    lifecycles: 'fibo-fnd-arr-lif',
    beEntities: 'fibo-be-fct-fct',
    marketTx: 'fibo-fnd-txn-mkt',
    commonsParties: 'cmns-pts',
    commonsIds: 'cmns-id',
    commonsContext: 'cmns-cxtdsg',
    commonsOrgs: 'cmns-org',
    commonsRegistration: 'cmns-reg',
  }
  return [...used].map((k) => ({
    prefix: prefixOf[k] ?? k,
    iri: FIBO_MODULES[k].base,
    label: FIBO_MODULES[k].path,
  }))
}

/** FIBO 对齐包的 T-Box（版本 1；导入目标 spec 时由 saveSpec 升版本）。 */
export function fiboPackSpec(now = Date.now()): OntologySpec {
  return {
    id: FIBO_PACK_ID,
    namespace: FIBO_PACK_NAMESPACE,
    version: 1,
    versionIri: versionIriOf(FIBO_PACK_NAMESPACE, 1),
    label: 'FIBO 金融域本体对齐包（Payments / Accounts / Settlement）',
    vocabularies: vocabularies(),
    entityTypes: CONCEPTS.map(toEntityType),
    objectProperties: OBJECT_PROPS.map(toObjectProperty),
    axioms: AXIOMS,
    updatedAt: now,
  }
}

export interface FiboPackConceptRow {
  id: string
  label: string
  labelZh: string
  definitionZh: string
  definitionEn: string
  iri: string
  origin: OriginKind
  module?: string
  versionIri?: string
  maturity?: string
  parent?: string
  category: string
  note?: string
}

export interface FiboPackPropertyRow {
  id: string
  label: string
  labelZh: string
  iri: string
  origin: OriginKind
  module?: string
  domain: string[]
  range: string[]
  cardinality?: { min?: number; max?: number }
}

export interface FiboPackSummary {
  id: string
  label: string
  namespace: string
  source: typeof FIBO_SOURCE
  counts: {
    concepts: number
    fibo: number
    commons: number
    localExtensions: number
    objectProperties: number
    axioms: number
  }
  modules: Array<{ path: string; versionIri: string; maturity?: string }>
  concepts: FiboPackConceptRow[]
  objectProperties: FiboPackPropertyRow[]
}

export function fiboPackSummary(): FiboPackSummary {
  return {
    id: FIBO_PACK_ID,
    label: 'FIBO 金融域本体对齐包（Payments / Accounts / Settlement）',
    namespace: FIBO_PACK_NAMESPACE,
    source: FIBO_SOURCE,
    counts: {
      concepts: CONCEPTS.length,
      fibo: CONCEPTS.filter((c) => c.origin === 'fibo').length,
      commons: CONCEPTS.filter((c) => c.origin === 'commons').length,
      localExtensions: CONCEPTS.filter((c) => c.origin === 'local-extension').length,
      objectProperties: OBJECT_PROPS.length,
      axioms: AXIOMS.length,
    },
    modules: [...new Set([...CONCEPTS.map((c) => c.module), ...OBJECT_PROPS.map((p) => p.module)]
      .filter((k): k is ModuleKey => Boolean(k)))]
      .map((k) => ({ path: FIBO_MODULES[k].path, versionIri: FIBO_MODULES[k].versionIri, maturity: FIBO_MODULES[k].maturity })),
    concepts: CONCEPTS.map((c) => {
      const prov = conceptProvenance(c)
      return {
        id: c.id,
        label: c.label,
        labelZh: c.labelZh,
        definitionZh: c.defZh,
        definitionEn: c.defEn,
        iri: conceptIri(c),
        origin: c.origin,
        module: prov.module,
        versionIri: prov.versionIri,
        maturity: prov.maturity,
        parent: c.parent,
        category: c.category,
        note: c.note,
      }
    }),
    objectProperties: OBJECT_PROPS.map((p) => ({
      id: p.id,
      label: p.label,
      labelZh: p.labelZh,
      iri: objectPropIri(p),
      origin: p.origin,
      module: FIBO_MODULES[p.module].path,
      domain: p.domain,
      range: p.range,
      cardinality: p.cardinality,
    })),
  }
}

export interface FiboMergeCollision {
  kind: 'type' | 'objectProperty' | 'axiom'
  id: string
  reason: string
}

export interface FiboMergeResult {
  ok: boolean
  spec?: OntologySpec
  added: { types: number; objectProperties: number; axioms: number }
  skipped: { types: number; objectProperties: number; axioms: number }
  collisions: FiboMergeCollision[]
}

/**
 * 把 FIBO 包合并进当前 spec（增量、非破坏）：
 *   - 只追加缺失的类型/属性/公理；已有同 id 且同 IRI → 跳过（幂等）。
 *   - 同 id 但 IRI 不同 → 冲突，整批不写（不做静默覆盖：本地类型可能已有实例）。
 *   - 实例保持不变；导入后由调用方 saveSpec（版本+1+快照）落盘。
 */
export function mergeFiboPack(current: OntologySpec, now = Date.now()): FiboMergeResult {
  const pack = fiboPackSpec(now)
  const collisions: FiboMergeCollision[] = []
  const addedTypes: EntityType[] = []
  const addedProps: ObjectProperty[] = []
  const addedAxioms: Axiom[] = []
  let skippedTypes = 0
  let skippedProps = 0
  let skippedAxioms = 0

  const existingTypes = new Map(current.entityTypes.map((t) => [t.id, t]))
  for (const incoming of pack.entityTypes) {
    const existing = existingTypes.get(incoming.id)
    if (!existing) { addedTypes.push(incoming); continue }
    if ((existing.iri ?? '') !== (incoming.iri ?? '')) {
      collisions.push({
        kind: 'type', id: incoming.id,
        reason: `id 已被本地类型占用（现有 IRI=${existing.iri ?? '(本地命名空间)'}，FIBO IRI=${incoming.iri ?? '(无)'}）`,
      })
    } else skippedTypes++
  }

  const existingProps = new Map(current.objectProperties.map((p) => [p.id, p]))
  for (const incoming of pack.objectProperties) {
    const existing = existingProps.get(incoming.id)
    if (!existing) { addedProps.push(incoming); continue }
    if ((existing.iri ?? '') !== (incoming.iri ?? '')) {
      collisions.push({
        kind: 'objectProperty', id: incoming.id,
        reason: `id 已被本地对象属性占用（现有 IRI=${existing.iri ?? '(本地命名空间)'}，FIBO IRI=${incoming.iri ?? '(无)'}）`,
      })
    } else skippedProps++
  }

  const existingAxioms = new Set(current.axioms.map((a) => a.id))
  for (const incoming of pack.axioms) {
    if (existingAxioms.has(incoming.id)) skippedAxioms++
    else addedAxioms.push(incoming)
  }

  if (collisions.length > 0) {
    return {
      ok: false,
      added: { types: 0, objectProperties: 0, axioms: 0 },
      skipped: { types: skippedTypes, objectProperties: skippedProps, axioms: skippedAxioms },
      collisions,
    }
  }

  const vocabularies = [...(current.vocabularies ?? [])]
  for (const v of pack.vocabularies ?? []) {
    if (!vocabularies.some((x) => x.prefix === v.prefix)) vocabularies.push(v)
  }

  return {
    ok: true,
    spec: {
      ...current,
      vocabularies,
      entityTypes: [...current.entityTypes, ...addedTypes],
      objectProperties: [...current.objectProperties, ...addedProps],
      axioms: [...current.axioms, ...addedAxioms],
      updatedAt: now,
    },
    added: { types: addedTypes.length, objectProperties: addedProps.length, axioms: addedAxioms.length },
    skipped: { types: skippedTypes, objectProperties: skippedProps, axioms: skippedAxioms },
    collisions: [],
  }
}

/** 当前 spec 已导入多少 FIBO 概念（UI 显示 n/total）。 */
export function fiboPackApplied(spec: OntologySpec): { concepts: number; total: number; applied: string[] } {
  const ids = new Set(spec.entityTypes.map((t) => t.id))
  const applied = CONCEPTS.filter((c) => ids.has(c.id)).map((c) => c.id)
  return { concepts: applied.length, total: CONCEPTS.length, applied }
}
