/**
 * FIBO 域目录（P3-1，2026-10-21）。
 *
 * 支付/账户/结算之外的三个业务域只读参照：SEC 证券、DER 衍生品、LOAN 贷款。
 * 每个概念带真实 IRI、英文原定义、模块 versionIRI 与成熟度；不进入可导入包，
 * 避免未做依赖闭包核验的类污染工作台 T-Box。与并行会话的官方场景浏览互补：
 * 本目录回答「有哪些类」，场景浏览回答「这些类怎么用」。
 */
const DOMAIN_MODULES = {
  fbcFi: {
    path: 'FBC/FinancialInstruments/FinancialInstruments',
    base: 'https://spec.edmcouncil.org/fibo/ontology/FBC/FinancialInstruments/FinancialInstruments/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/FBC/20260801/FinancialInstruments/FinancialInstruments/',
    maturity: 'Release',
  },
  secListings: {
    path: 'SEC/Securities/SecuritiesListings',
    base: 'https://spec.edmcouncil.org/fibo/ontology/SEC/Securities/SecuritiesListings/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/SEC/20251201/Securities/SecuritiesListings/',
    maturity: 'Release',
  },
  derBasics: {
    path: 'DER/DerivativesContracts/DerivativesBasics',
    base: 'https://spec.edmcouncil.org/fibo/ontology/DER/DerivativesContracts/DerivativesBasics/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/DER/20260601/DerivativesContracts/DerivativesBasics/',
    maturity: 'Release',
  },
  derIRSwaps: {
    path: 'DER/RateDerivatives/IRSwaps',
    base: 'https://spec.edmcouncil.org/fibo/ontology/DER/RateDerivatives/IRSwaps/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/DER/20250401/RateDerivatives/IRSwaps/',
    maturity: 'Release',
  },
  loanLoans: {
    path: 'LOAN/LoansGeneral/Loans',
    base: 'https://spec.edmcouncil.org/fibo/ontology/LOAN/LoansGeneral/Loans/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/LOAN/20251201/LoansGeneral/Loans/',
    maturity: 'Release',
  },
  loanMortgages: {
    path: 'LOAN/RealEstateLoans/Mortgages',
    base: 'https://spec.edmcouncil.org/fibo/ontology/LOAN/RealEstateLoans/Mortgages/',
    versionIri: 'https://spec.edmcouncil.org/fibo/ontology/LOAN/20250301/RealEstateLoans/Mortgages/',
    maturity: 'Release',
  },
} as const

type DomainModuleKey = keyof typeof DOMAIN_MODULES

interface DomainConceptDef {
  id: string
  label: string
  labelZh: string
  definitionZh: string
  definitionEn: string
  module: DomainModuleKey
  localName?: string
  parent?: string
  note?: string
}

export interface FiboDomainConcept {
  id: string
  label: string
  labelZh: string
  definitionZh: string
  definitionEn: string
  iri: string
  module: string
  versionIri: string
  maturity: string
  parent?: string
  note?: string
}

export interface FiboDomain {
  id: 'SEC' | 'DER' | 'LOAN'
  labelZh: string
  labelEn: string
  summary: string
  concepts: FiboDomainConcept[]
}

const SEC_CONCEPTS: DomainConceptDef[] = [
  {
    id: 'FinancialInstrument', label: 'financial instrument', labelZh: '金融工具', module: 'fbcFi',
    definitionEn: 'written contract that gives rise to both a financial asset of one entity and a financial liability of another entity',
    definitionZh: '形成一方金融资产与另一方金融负债的书面合同',
    parent: undefined,
  },
  {
    id: 'Security', label: 'security', labelZh: '证券', module: 'fbcFi',
    definitionEn: 'financial instrument that can be bought or sold',
    definitionZh: '可以买入或卖出的金融工具',
    parent: 'FinancialInstrument',
  },
  {
    id: 'EquityInstrument', label: 'equity instrument', labelZh: '权益工具', module: 'fbcFi',
    definitionEn: 'financial instrument representing an ownership interest in an entity or pool of assets',
    definitionZh: '代表实体或资产池所有权利益的金融工具',
    parent: 'Security',
  },
  {
    id: 'DebtInstrument', label: 'debt instrument', labelZh: '债务工具', module: 'fbcFi',
    definitionEn: 'financial instrument and credit agreement evidencing monies owed by the issuer to the holder on terms as specified',
    definitionZh: '证明发行人对持有人负有约定金额债务的金融工具与信用协议',
    parent: 'FinancialInstrument',
  },
  {
    id: 'ListedSecurity', label: 'listed security', labelZh: '上市证券', module: 'secListings',
    definitionEn: 'registered security listed on at least one exchange',
    definitionZh: '在至少一个交易所上市的注册证券',
    parent: 'Security',
    note: 'FIBO 父类 RegisteredSecurity（未纳入本目录）。',
  },
  {
    id: 'Listing', label: 'listing', labelZh: '上市登记', module: 'secListings',
    definitionEn: 'catalog entry for a securities offering managed by an exchange that provides the terms under which that security is made available on that exchange',
    definitionZh: '交易所管理的证券发行目录条目，载明该证券在该交易所挂牌的条款',
  },
]

const DER_CONCEPTS: DomainConceptDef[] = [
  {
    id: 'DerivativeInstrument', label: 'derivative instrument', labelZh: '衍生工具', module: 'fbcFi',
    definitionEn: 'financial instrument that confers on its holders certain rights or obligations, whose value is derived from one or more underlying assets',
    definitionZh: '赋予持有人特定权利或义务、价值来自一个或多个标的资产的金融工具',
  },
  {
    id: 'OverTheCounterDerivativeInstrument', label: 'over-the-counter derivative instrument', labelZh: '场外衍生工具', module: 'derBasics',
    definitionEn: 'derivative instrument that is not listed on an organized exchange',
    definitionZh: '未在组织化交易所上市的衍生工具',
    parent: 'DerivativeInstrument',
  },
  {
    id: 'InterestRateDerivative', label: 'interest rate derivative', labelZh: '利率衍生工具', module: 'derBasics',
    definitionEn: 'rate-based derivative whose underlier is an interest rate',
    definitionZh: '以利率为标的的利率类衍生工具',
    parent: 'DerivativeInstrument',
  },
  {
    id: 'ForwardRateAgreement', label: 'forward rate agreement', labelZh: '远期利率协议', module: 'derBasics',
    definitionEn: 'agreement to exchange an interest rate commitment on a notional amount at a future date',
    definitionZh: '在未来日期就名义本金交换利率承诺的协议',
    parent: 'InterestRateDerivative',
  },
  {
    id: 'CreditDerivative', label: 'credit derivative', labelZh: '信用衍生工具', module: 'derBasics',
    definitionEn: 'derivative instrument that is a privately held, negotiable bilateral contract traded over-the-counter (OTC) between two parties in a creditor/debtor relationship, enabling the creditor to effectively transfer some or all of the risk of a debtor defaulting to a third party',
    definitionZh: '债权人与债务人之间场外交易的可转让双边合约，使债权人能把债务人违约风险部分或全部转移给第三方',
    parent: 'DerivativeInstrument',
  },
  {
    id: 'InterestRateSwap', label: 'interest rate swap', labelZh: '利率互换', module: 'derIRSwaps',
    definitionEn: 'swap in which the reference (underlier) for at least one leg is an interest rate',
    definitionZh: '至少一条利率腿以利率为参照的互换',
    parent: 'InterestRateDerivative',
  },
]

const LOAN_CONCEPTS: DomainConceptDef[] = [
  {
    id: 'Loan', label: 'loan', labelZh: '贷款', module: 'loanLoans',
    definitionEn: 'debt instrument whereby one party extends money or credit to another party (or parties) with the understanding that the borrowed money will be repaid according to the terms of the contract',
    definitionZh: '一方向另一方提供货币或信用、并按合同条款偿还的债务工具',
  },
  {
    id: 'SecuredLoan', label: 'secured loan', labelZh: '担保贷款', module: 'loanLoans',
    definitionEn: 'loan in which the borrower pledges some asset via a security agreement as collateral for the loan, or that is secured via third-party guarantee',
    definitionZh: '借款人以担保协议质押资产或由第三方担保的贷款',
    parent: 'Loan',
  },
  {
    id: 'CollateralizedLoan', label: 'collateralized loan', labelZh: '抵押贷款', module: 'loanLoans',
    definitionEn: 'secured loan that is secured with cash or other acceptable collateral (real property, securities or other assets) provided by the borrower as specified in the collateral agreement',
    definitionZh: '以借款人按担保协议提供的现金或其他合格抵押品担保的贷款',
    parent: 'SecuredLoan',
  },
  {
    id: 'LoanPaymentSchedule', label: 'loan payment schedule', labelZh: '贷款还款计划', module: 'loanLoans',
    definitionEn: 'regular or explicit (ad hoc) payment schedule associated with a given loan-specific account',
    definitionZh: '与特定贷款账户关联的定期或临时还款计划',
  },
  {
    id: 'LoanSecuredByRealEstate', label: 'loan secured by real estate', labelZh: '不动产担保贷款', module: 'loanMortgages',
    definitionEn: 'loan that, at origination, is secured wholly or substantially by a lien or liens on real property for which the lien or liens are central to the extension of the credit',
    definitionZh: '在发放时全部或主要由不动产留置权担保、且该留置权是授信核心条件的贷款',
    parent: 'CollateralizedLoan',
  },
  {
    id: 'Mortgage', label: 'mortgage', labelZh: '抵押（不动产）', module: 'loanMortgages',
    definitionEn: 'grant of financial interest in real property to a party that is not an owner of that real property and is recorded by a registration authority',
    definitionZh: '向非不动产所有权人授予不动产金融权益、并由登记机关登记的担保协议',
  },
]

function toDomainConcept(c: DomainConceptDef): FiboDomainConcept {
  const m = DOMAIN_MODULES[c.module]
  return {
    id: c.id,
    label: c.label,
    labelZh: c.labelZh,
    definitionZh: c.definitionZh,
    definitionEn: c.definitionEn,
    iri: `${m.base}${c.localName ?? c.id}`,
    module: m.path,
    versionIri: m.versionIri,
    maturity: m.maturity,
    parent: c.parent,
    ...(c.note ? { note: c.note } : {}),
  }
}

export function fiboDomains(): FiboDomain[] {
  return [
    {
      id: 'SEC', labelZh: '证券', labelEn: 'Securities',
      summary: '证券分类、上市与登记的基础概念；6 个类全部 Release 成熟度。',
      concepts: SEC_CONCEPTS.map(toDomainConcept),
    },
    {
      id: 'DER', labelZh: '衍生品', labelEn: 'Derivatives',
      summary: '场外衍生工具、利率与信用衍生品的上层概念；不含估值与清算细节。',
      concepts: DER_CONCEPTS.map(toDomainConcept),
    },
    {
      id: 'LOAN', labelZh: '贷款', labelEn: 'Loans',
      summary: '贷款、担保与不动产抵押的层级；抵押是担保协议，不是贷款本身。',
      concepts: LOAN_CONCEPTS.map(toDomainConcept),
    },
  ]
}
