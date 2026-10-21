/**
 * FIBO 官方只读参照目录：域导航与 EXMP/Schema 场景。
 * 与 ontology-fibo.ts 的可导入 T-Box 分离；这里不生成可写入用户本体的类型。
 */

export interface FiboDomain {
  code: string
  nameEn: string
  nameZh: string
  summaryEn: string
  summaryZh: string
  modules: string[]
  maturityNote?: string
  maturityNoteEn?: string
  sourceUrl: string
}

export interface FiboScenarioNode {
  id: string
  labelZh: string
  kind: 'class' | 'individual'
  domain: string
  level: number
  typeLabel?: string
}

export interface FiboScenarioEdge {
  source: string
  target: string
  property: string
  labelEn: string
  labelZh: string
  sourceUrl: string
}

export interface FiboScenarioFact {
  textEn: string
  textZh: string
  sourceUrl: string
}

export interface FiboScenario {
  id: string
  titleEn: string
  titleZh: string
  summaryEn: string
  summaryZh: string
  domains: string[]
  nodes: FiboScenarioNode[]
  edges: FiboScenarioEdge[]
  facts: FiboScenarioFact[]
  caveat?: string
  caveatEn?: string
}

export interface FiboReference {
  domains: FiboDomain[]
  scenarios: FiboScenario[]
}

function githubSource(release: string, path: string, lines?: string): string {
  return `https://github.com/edmcouncil/fibo/blob/${release}/${path}${lines ? `#L${lines}` : ''}`
}

function domains(release: string): FiboDomain[] {
  const src = (path: string, lines?: string) => githubSource(release, path, lines)
  return [
    {
      code: 'FND', nameEn: 'Foundations', nameZh: '基础',
      summaryEn: 'Shared agreements, contracts, parties, dates, law, organizations and relations used by the other domains.',
      summaryZh: '为其他域提供协议、合同、参与方、日期、法律、组织与关系等共用概念。',
      modules: ['Accounting', 'AgentsAndPeople', 'Agreements', 'Arrangements', 'DatesAndTimes', 'GoalsAndObjectives', 'Law', 'Organizations', 'OwnershipAndControl', 'Parties', 'Places', 'ProductsAndServices', 'Relations', 'TransactionsExt', 'Utilities'],
      sourceUrl: src('FND/MetadataFND.rdf', '56'),
    },
    {
      code: 'BE', nameEn: 'Business Entities', nameZh: '商业实体',
      summaryEn: 'Legal entities, corporations, ownership and control, government bodies and functional entities.',
      summaryZh: '覆盖法律实体、公司、所有权与控制、政府机构与功能性实体。',
      modules: ['Corporations', 'FunctionalEntities', 'GovernmentEntities', 'LegalEntities', 'OwnershipAndControl', 'Partnerships', 'PrivateLimitedCompanies', 'SoleProprietorships', 'Trusts'],
      sourceUrl: src('BE/MetadataBE.rdf', '42-L48'),
    },
    {
      code: 'FBC', nameEn: 'Financial Business and Commerce', nameZh: '金融业务与商业',
      summaryEn: 'Shared financial products, services, intermediaries, regulators, instruments and commerce concepts.',
      summaryZh: '覆盖金融产品与服务、中介、监管机构、金融工具及跨业务共用概念。',
      modules: ['DebtAndEquities', 'FinancialInstruments', 'FunctionalEntities', 'ProductsAndServices'],
      sourceUrl: src('FBC/MetadataFBC.rdf', '34'),
    },
    {
      code: 'LOAN', nameEn: 'Loans', nameZh: '贷款',
      summaryEn: 'Commercial, small-business, auto, student and mortgage loans, including obligations, credit risk and security agreements.',
      summaryZh: '覆盖商业、小企业、汽车、教育与按揭贷款，以及义务、信用风险和担保协议。',
      modules: ['LoansGeneral', 'LoansSpecific', 'RealEstateLoans'],
      sourceUrl: src('LOAN/MetadataLOAN.rdf', '32'),
    },
    {
      code: 'SEC', nameEn: 'Securities', nameZh: '证券',
      summaryEn: 'Common securities concepts, equities, debt instruments, funds and asset-backed securities.',
      summaryZh: '覆盖证券共通概念、股票、债务工具、基金与资产支持证券。',
      modules: ['Debt', 'Equities', 'Funds', 'Securities'],
      sourceUrl: src('SEC/MetadataSEC.rdf', '34'),
    },
    {
      code: 'DER', nameEn: 'Derivatives', nameZh: '衍生品',
      summaryEn: 'Options, futures, forwards, swaps and other derivative contracts.',
      summaryZh: '覆盖期权、期货、远期、互换及其他衍生品合约。',
      modules: ['CreditDerivatives', 'DerivativesContracts', 'RateDerivatives', 'SecurityBasedDerivatives'],
      sourceUrl: src('DER/MetadataDER.rdf', '34'),
    },
    {
      code: 'IND', nameEn: 'Indicators', nameZh: '指标',
      summaryEn: 'Market indices, reference interest rates, economic indicators, foreign exchange and benchmarks.',
      summaryZh: '覆盖市场指数、参考利率、经济指标、外汇与基准指标。',
      modules: ['EconomicIndicators', 'ForeignExchange', 'Indicators', 'InterestRates', 'MarketIndices'],
      sourceUrl: src('IND/MetadataIND.rdf', '36'),
    },
    {
      code: 'MD', nameEn: 'Market Data', nameZh: '市场数据',
      summaryEn: 'Time-varying market data for instruments, loans and funds, including prices, yields and debt analytics.',
      summaryZh: '覆盖金融工具、贷款与基金随时间变化的价格、收益率和债务分析数据。',
      modules: ['CIVTemporal', 'DebtTemporal', 'DerivativesTemporal', 'TemporalCore'],
      maturityNote: 'Q3 2026 元数据仍把 MD 标为 Provisional；季度正式发布不代表这些内容已全部稳定。',
      maturityNoteEn: 'The Q3 2026 metadata still marks MD as Provisional; a formal quarterly release does not make all of this content stable.',
      sourceUrl: src('MD/MetadataMD.rdf', '34-L36'),
    },
    {
      code: 'ACTUS', nameEn: 'ACTUS', nameZh: 'ACTUS 受控词表',
      summaryEn: 'ACTUS controlled vocabularies and mappings that connect FIBO knowledge graphs with ACTUS systems.',
      summaryZh: '提供 ACTUS 受控词表与映射，用于连接 FIBO 知识图谱和 ACTUS 系统。',
      modules: [],
      sourceUrl: src('ACTUS/MetadataACTUS.rdf', '51'),
    },
    {
      code: 'BP', nameEn: 'Business Process', nameZh: '业务流程',
      summaryEn: 'Business processes for securities issuance and trading.',
      summaryZh: '覆盖证券发行与交易流程。',
      modules: ['Process', 'SecuritiesIssuance'],
      sourceUrl: src('README.md', 'directories-and-fibo-domains'),
    },
    {
      code: 'CAE', nameEn: 'Corporate Actions and Events', nameZh: '公司行动与事件',
      summaryEn: 'Corporate actions and events across securities lifecycles.',
      summaryZh: '覆盖证券生命周期中的公司行动与事件。',
      modules: ['CorporateEvents'],
      sourceUrl: src('README.md', 'directories-and-fibo-domains'),
    },
    {
      code: 'EXMP', nameEn: 'Examples', nameZh: '官方示例',
      summaryEn: 'Reference individuals for legal entities and securities used in official examples.',
      summaryZh: '提供法律实体与证券等官方参考个体，是场景内容的实例来源。',
      modules: ['LegalEntities', 'Securities'],
      sourceUrl: src('EXMP/MetadataEXMP.rdf', '30'),
    },
  ]
}

function scenarios(release: string): FiboScenario[] {
  const src = (path: string, lines: string) => githubSource(release, path, lines)
  const equities = (lines: string) => src('EXMP/Securities/EquitiesExamples.rdf', lines)
  return [
    {
      id: 'apple-listed-share',
      titleEn: 'Apple listed share, issuer role and exchange',
      titleZh: 'Apple 股票、发行角色与交易所',
      summaryEn: 'An official EXMP path from a listed share to its issuer role, legal entity and home exchange.',
      summaryZh: '沿官方 EXMP 实例，从上市股票连接到发行角色、法律实体与 home exchange。',
      domains: ['SEC', 'FBC', 'BE', 'FND', 'EXMP'],
      nodes: [
        { id: 'AppleIncCommonStock', labelZh: 'Apple 普通股', kind: 'individual', domain: 'EXMP', level: 0, typeLabel: 'ListedShare' },
        { id: 'AppleIncEquityIssuer', labelZh: 'Apple 股票发行角色', kind: 'individual', domain: 'EXMP', level: 1, typeLabel: 'ShareIssuer' },
        { id: 'Facility-XNAS', labelZh: 'NASDAQ 交易设施', kind: 'individual', domain: 'EXMP', level: 1, typeLabel: 'Exchange' },
        { id: 'AppleInc-US-CA', labelZh: 'Apple Inc. 法律实体', kind: 'individual', domain: 'EXMP', level: 2, typeLabel: 'ForProfitCorporation' },
      ],
      edges: [
        { source: 'AppleIncCommonStock', target: 'AppleIncEquityIssuer', property: 'fnd-rel:isIssuedBy', labelEn: 'is issued by', labelZh: '发行方', sourceUrl: equities('191-L210') },
        { source: 'AppleIncEquityIssuer', target: 'AppleInc-US-CA', property: 'cmns-rlcmp:isPlayedBy', labelEn: 'is played by', labelZh: '由实体扮演', sourceUrl: equities('222-L228') },
        { source: 'AppleIncCommonStock', target: 'Facility-XNAS', property: 'sec-lst:hasHomeExchange', labelEn: 'has home exchange', labelZh: '所属交易所', sourceUrl: equities('191-L210') },
      ],
      facts: [
        {
          textEn: 'ListedSecurity constrains both hasHomeExchange and hasOriginalPlaceOfListing to exactly 1 Exchange.',
          textZh: 'ListedSecurity 对 hasHomeExchange 与 hasOriginalPlaceOfListing 都规定 exactly 1 个 Exchange。',
          sourceUrl: src('SEC/Securities/SecuritiesListings.rdf', '105-L126'),
        },
        {
          textEn: 'AppleInc-US-CA is both a ForProfitCorporation and a PubliclyHeldCompany, with legal name Apple Inc.',
          textZh: 'AppleInc-US-CA 同时是 ForProfitCorporation 与 PubliclyHeldCompany，法定名称为 Apple Inc.。',
          sourceUrl: src('EXMP/LegalEntities/DowJonesIndustrialAverageCompanies.rdf', '305-L319'),
        },
        {
          textEn: 'The official NASDAQ Listing individual has listing date 1980-12-12.',
          textZh: '官方 NASDAQ Listing 个体的 hasListingDate 为 1980-12-12。',
          sourceUrl: equities('946-L954'),
        },
      ],
      caveat: '官方 EXMP 用于说明结构，不代表 2026 年实时市场数据。',
      caveatEn: 'Official EXMP individuals illustrate structure; they are not live 2026 market data.',
    },
    {
      id: 'djia-equity-index',
      titleEn: 'DJIA, equity basket and constituents',
      titleZh: 'DJIA、股票篮子与成分',
      summaryEn: 'An equity index is based on a basket; dated weighted constituents connect the basket to listed shares.',
      summaryZh: '股票指数基于股票篮子，带日期和权重的成分个体把篮子连接到上市股票。',
      domains: ['IND', 'SEC', 'FBC', 'FND', 'BE', 'EXMP'],
      nodes: [
        { id: 'DowJonesIndustrialAverage', labelZh: '道琼斯工业平均指数', kind: 'individual', domain: 'EXMP', level: 0, typeLabel: 'EquityIndex' },
        { id: 'DowJonesIndustrialAverageBasket', labelZh: 'DJIA 股票篮子', kind: 'individual', domain: 'EXMP', level: 1, typeLabel: 'BasketOfEquities' },
        { id: 'DowJonesIndustrialAverageBasket-AppleIncCommonStockConstituent', labelZh: 'Apple 股票成分', kind: 'individual', domain: 'EXMP', level: 2, typeLabel: 'SecuritiesBasketConstituent' },
        { id: 'XNASListedAppleIncCommonStock', labelZh: 'NASDAQ Apple 上市记录', kind: 'individual', domain: 'EXMP', level: 3, typeLabel: 'Listing' },
      ],
      edges: [
        { source: 'DowJonesIndustrialAverage', target: 'DowJonesIndustrialAverageBasket', property: 'fbc-dae:isBasedOn', labelEn: 'is based on', labelZh: '基于篮子', sourceUrl: src('EXMP/Securities/EquityIndexExamples.rdf', '125-L135') },
        { source: 'DowJonesIndustrialAverageBasket-AppleIncCommonStockConstituent', target: 'DowJonesIndustrialAverageBasket', property: 'cmns-col:isConstituentOf', labelEn: 'is constituent of', labelZh: '属于篮子', sourceUrl: src('EXMP/Securities/EquityIndexExamples.rdf', '150-L158') },
        { source: 'DowJonesIndustrialAverageBasket-AppleIncCommonStockConstituent', target: 'XNASListedAppleIncCommonStock', property: 'fnd-rel:involves', labelEn: 'involves', labelZh: '涉及上市记录', sourceUrl: src('EXMP/Securities/EquityIndexExamples.rdf', '150-L158') },
      ],
      facts: [
        {
          textEn: 'EquityIndex has isBasedOn some BasketOfEquities; BasketOfEquities is a BasketOfSecurities.',
          textZh: 'EquityIndex 具有 isBasedOn some BasketOfEquities；BasketOfEquities 是 BasketOfSecurities 的子类。',
          sourceUrl: src('IND/MarketIndices/BasketIndices.rdf', '127-L210'),
        },
        {
          textEn: 'The official Apple constituent has weight 1.0 in this example.',
          textZh: '官方示例中的 Apple 成分个体 hasWeight 为 1.0。',
          sourceUrl: src('EXMP/Securities/EquityIndexExamples.rdf', '150-L158'),
        },
      ],
      caveat: '该内容说明官方示例结构，不提供当前指数成分或权重。',
      caveatEn: 'This explains the official example structure, not current index constituents or weights.',
    },
    {
      id: 'fixed-float-ir-swap',
      titleEn: 'Fixed-float single-currency interest rate swap',
      titleZh: '固定与浮动单一货币利率互换',
      summaryEn: 'A sample swap exchanges exactly two legs: one fixed and one floating, with disjoint leg types.',
      summaryZh: '官方 sample 互换交换两条利率腿，一条固定、一条浮动，两类腿互不相交。',
      domains: ['DER', 'FBC', 'FND', 'SEC', 'EXMP'],
      nodes: [
        { id: 'Contract-IY7VKEUR45886', labelZh: 'sample 利率互换合约', kind: 'individual', domain: 'EXMP', level: 0, typeLabel: 'FixedFloatSingleCurrencyInterestRateSwap' },
        { id: 'ContractLeg1-IY7VKEUR45886', labelZh: '固定利率腿', kind: 'individual', domain: 'EXMP', level: 1, typeLabel: 'FixedInterestRateLeg' },
        { id: 'ContractLeg2-IY7VKEUR45886', labelZh: '浮动利率腿', kind: 'individual', domain: 'EXMP', level: 1, typeLabel: 'FloatingInterestRateLeg' },
        { id: 'FixedInterestRate', labelZh: '固定利率', kind: 'individual', domain: 'EXMP', level: 2, typeLabel: 'FixedInterestRate' },
        { id: 'FloatingInterestRate', labelZh: '浮动利率', kind: 'individual', domain: 'EXMP', level: 2, typeLabel: 'FloatingInterestRate' },
        { id: 'NotionalAmount', labelZh: '名义本金金额', kind: 'individual', domain: 'EXMP', level: 2, typeLabel: 'MonetaryAmount' },
        { id: 'Euro', labelZh: '欧元', kind: 'individual', domain: 'EXMP', level: 3, typeLabel: 'Currency' },
      ],
      edges: [
        { source: 'Contract-IY7VKEUR45886', target: 'ContractLeg1-IY7VKEUR45886', property: 'exchanges', labelEn: 'exchanges fixed leg', labelZh: '交换固定腿', sourceUrl: src('EXMP/Securities/IRSwapExamples.rdf', '128-L139') },
        { source: 'Contract-IY7VKEUR45886', target: 'ContractLeg2-IY7VKEUR45886', property: 'exchanges', labelEn: 'exchanges floating leg', labelZh: '交换浮动腿', sourceUrl: src('EXMP/Securities/IRSwapExamples.rdf', '128-L139') },
        { source: 'ContractLeg1-IY7VKEUR45886', target: 'FixedInterestRate', property: 'hasInterestRate', labelEn: 'has fixed rate', labelZh: '具有固定利率', sourceUrl: src('EXMP/Securities/IRSwapExamples.rdf', '172-L176') },
        { source: 'ContractLeg2-IY7VKEUR45886', target: 'FloatingInterestRate', property: 'hasInterestRate', labelEn: 'has floating rate', labelZh: '具有浮动利率', sourceUrl: src('EXMP/Securities/IRSwapExamples.rdf', '222-L226') },
        { source: 'ContractLeg1-IY7VKEUR45886', target: 'NotionalAmount', property: 'hasNotionalAmount', labelEn: 'has notional amount', labelZh: '具有名义本金', sourceUrl: src('EXMP/Securities/IRSwapExamples.rdf', '178-L183') },
        { source: 'NotionalAmount', target: 'Euro', property: 'hasCurrency', labelEn: 'has currency Euro', labelZh: '币种为 Euro', sourceUrl: src('EXMP/Securities/IRSwapExamples.rdf', '178-L183') },
      ],
      facts: [
        {
          textEn: 'InterestRateSwap uses qualified cardinality 2 for exchanges on InterestRateSwapLeg.',
          textZh: 'InterestRateSwap 对 exchanges 规定 qualifiedCardinality = 2，onClass = InterestRateSwapLeg。',
          sourceUrl: src('DER/RateDerivatives/IRSwaps.rdf', '400-L425'),
        },
        {
          textEn: 'FixedInterestRateLeg and FloatingInterestRateLeg are disjoint.',
          textZh: 'FixedInterestRateLeg 与 FloatingInterestRateLeg 被声明为 disjoint。',
          sourceUrl: src('DER/RateDerivatives/IRSwaps.rdf', '226-L246'),
        },
        {
          textEn: 'The sample literals are 1.0579 for the fixed leg and 0.309 for the floating leg, without an added percent unit.',
          textZh: 'sample 中固定腿 hasRateValue 为 1.0579，浮动腿为 0.309；页面不自行添加百分号。',
          sourceUrl: src('EXMP/Securities/IRSwapExamples.rdf', '172-L226'),
        },
        {
          textEn: 'The fixed leg notional amount is 1286805 with currency Euro.',
          textZh: '固定腿名义本金为 1286805，hasCurrency 为 Euro。',
          sourceUrl: src('EXMP/Securities/IRSwapExamples.rdf', '178-L183'),
        },
      ],
      caveat: '这是官方 sample swap contract，不是一笔已核实的真实成交，也不是可定价的完整合约。',
      caveatEn: 'This is an official sample swap contract, not a verified real trade or a complete priceable contract.',
    },
    {
      id: 'mortgage-security-agreement',
      titleEn: 'Real-estate-secured loan versus Mortgage',
      titleZh: '房地产担保贷款与 Mortgage 的区分',
      summaryEn: 'A loan secured by real estate is a loan; Mortgage is modeled as a SecurityAgreement, not as the loan itself.',
      summaryZh: '房地产担保贷款是贷款，Mortgage 则建模为 SecurityAgreement，不等同于贷款本身。',
      domains: ['LOAN', 'FND', 'FBC'],
      nodes: [
        { id: 'LoanSecuredByRealEstate', labelZh: '房地产担保贷款', kind: 'class', domain: 'LOAN', level: 0 },
        { id: 'Mortgage', labelZh: 'Mortgage 担保协议', kind: 'class', domain: 'LOAN', level: 0 },
        { id: 'CollateralizedLoan', labelZh: '有担保贷款', kind: 'class', domain: 'LOAN', level: 1 },
        { id: 'RealProperty', labelZh: '房地产', kind: 'class', domain: 'FND', level: 1 },
        { id: 'DisclosureProvision', labelZh: '披露条款', kind: 'class', domain: 'FND', level: 1 },
        { id: 'UseOfProceedsProvision', labelZh: '资金用途条款', kind: 'class', domain: 'FND', level: 1 },
        { id: 'SecurityAgreement', labelZh: '担保协议', kind: 'class', domain: 'FBC', level: 1 },
      ],
      edges: [
        { source: 'LoanSecuredByRealEstate', target: 'CollateralizedLoan', property: 'rdfs:subClassOf', labelEn: 'subclass of', labelZh: '子类', sourceUrl: src('LOAN/RealEstateLoans/Mortgages.rdf', '84-L124') },
        { source: 'LoanSecuredByRealEstate', target: 'RealProperty', property: 'isCollateralizedBy', labelEn: 'some real property', labelZh: 'some 房地产', sourceUrl: src('LOAN/RealEstateLoans/Mortgages.rdf', '84-L124') },
        { source: 'LoanSecuredByRealEstate', target: 'DisclosureProvision', property: 'hasContractualElement', labelEn: 'some disclosure provision', labelZh: 'some 披露条款', sourceUrl: src('LOAN/RealEstateLoans/Mortgages.rdf', '84-L124') },
        { source: 'LoanSecuredByRealEstate', target: 'UseOfProceedsProvision', property: 'hasContractualElement', labelEn: 'some use-of-proceeds provision', labelZh: 'some 资金用途条款', sourceUrl: src('LOAN/RealEstateLoans/Mortgages.rdf', '84-L124') },
        { source: 'LoanSecuredByRealEstate', target: 'SecurityAgreement', property: 'refersTo', labelEn: 'refers to some agreement', labelZh: 'refersTo some 担保协议', sourceUrl: src('LOAN/RealEstateLoans/Mortgages.rdf', '84-L124') },
        { source: 'Mortgage', target: 'SecurityAgreement', property: 'rdfs:subClassOf', labelEn: 'subclass of', labelZh: '子类', sourceUrl: src('LOAN/RealEstateLoans/Mortgages.rdf', '126-L137') },
      ],
      facts: [
        {
          textEn: 'LoanSecuredByRealEstate uses someValuesFrom restrictions; these are not closed-world mandatory instance fields.',
          textZh: 'LoanSecuredByRealEstate 使用 someValuesFrom；这些约束不是闭世界实例表单的必填字段。',
          sourceUrl: src('LOAN/RealEstateLoans/Mortgages.rdf', '84-L124'),
        },
        {
          textEn: 'Mortgage is a SecurityAgreement subclass, so the loan contract, security agreement and real property stay distinct.',
          textZh: 'Mortgage 是 SecurityAgreement 的子类，因此贷款合同、担保协议与房地产抵押品保持为不同节点。',
          sourceUrl: src('LOAN/RealEstateLoans/Mortgages.rdf', '126-L137'),
        },
      ],
    },
  ]
}

/** 由调用方传入固定 release，避免参照目录与导入包各自维护版本。 */
export function fiboReference(release: string): FiboReference {
  return { domains: domains(release), scenarios: scenarios(release) }
}
