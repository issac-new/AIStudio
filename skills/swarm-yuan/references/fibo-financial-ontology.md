> **何时读我**：银行、证券、保险、支付、资管等金融业务适用。做领域建模、术语消歧、字段命名、标识符校验、监管报送语义一致时读。其他行业先读 [business-ontology-methodology.md](business-ontology-methodology.md)。
>
> 本文是 FIBO `master_2026Q3` 的源码级摘要，不是 FIBO 的替代品，也不构成法律或投资建议。

# FIBO 金融业务本体参考（master_2026Q3 源码级）

## 0. 结论

FIBO 是金融业务术语与关系的权威参考，不是数据模型、报文标准或监管规则库。它能帮你把"客户、账户、余额、头寸、合约"这类易混词拆清楚。它也能给实体、角色、合约、工具、标识符找到可引用的规范定义。它还能把金额、币种、时间、标识符的约束写进代码评审。它不能帮你做：建表 DDL、ISO 20022 报文、会计分录、监管规则引擎、特定法域的合规判断。

使用 FIBO 的第一条纪律是分层看成熟度。BE、FBC、SEC、DER、IND 的 Release 模块可作首选。MD、CAE、BP、LOAN 多为 Provisional，只能作线索，引用前回源码确认。第二条纪律是不要按标签检索。FIBO 的标签在 Provisional 区仍有重复，权威标识是 IRI。

## 1. 调研基线

| 项 | 值 |
|---|---|
| 发布标签 | `master_2026Q3`（2026 年第三季度发布） |
| 提交 | `2d73435a4419b66b7c9f44cb9763e35fe8ac7890` |
| 提交日期 | 2026-10-15 |
| 发布页日期 | 2026-10-20 |
| 许可 | MIT（EDM Council 与 OMG） |
| 顶层模块 | 12 个：FND、BE、FBC、SEC、DER、IND、LOAN、MD、CAE、BP、ACTUS、EXMP |
| 类 | 3060 个唯一 IRI（不含 Metadata 与 load 文件） |
| 对象属性 | 948 个 |
| 数据属性 | 265 个 |
| 本体文件 | 191 个含类或属性声明的本体文件（Release 152、Provisional 35、Informative 3、未标注 1） |
| 目录 URI 映射 | 291 条（`catalog-v001.xml`，含 load 文件） |
| 导入边 | 2732 条，指向 279 个不同本体 |
| 卫生测试 | 59 个 SPARQL 文件，覆盖 21 组规则 |

规模与定义覆盖率（按文件内声明统计，未去重）：

- Release 级：类 2349 个声明，2206 个有 `skos:definition`（约 94%）；对象属性 603 个，578 个有定义（约 96%）；数据属性 179 个，177 个有定义（约 99%）。
- Provisional 级：类 828 个，484 个有定义（约 58%）；对象属性 321 个，111 个有定义（约 35%）。
- Informative 级：类 33 个，21 个有定义；对象属性 28 个，3 个有定义。

这组数字说明两件事：Release 级可用性高，但不是百分之百；Provisional 级不能当权威词典用。

## 2. 模块与架构

### 2.1 模块表

| 模块 | 全称 | 类 | 对象属性 | 数据属性 | 成熟度（文件数） |
|---|---|---|---|---|---|
| FND | Foundations | 453 | 243 | 59 | Release 37、Provisional 1、Informative 3 |
| BE | Business Entities | 205 | 84 | 9 | Release 34 |
| FBC | Financial Business and Commerce | 509 | 127 | 34 | Release 23、Provisional 2、未标注 1 |
| SEC | Securities | 817 | 220 | 99 | Release 23、Provisional 5 |
| DER | Derivatives | 326 | 54 | 10 | Release 16 |
| IND | Indices and Indicators | 120 | 21 | 7 | Release 9 |
| LOAN | Loans | 180 | 42 | 19 | Release 7、Provisional 8 |
| MD | Market Data | 104 | 27 | 10 | Provisional 6 |
| CAE | Corporate Actions and Events | 78 | 2 | 0 | Release 1、Provisional 3 |
| BP | Business Process | 260 | 128 | 14 | Provisional 9 |
| ACTUS | ACTUS Contract Terms | 8 | 0 | 4 | Release 2、Provisional 1 |

EXMP 只放示例个体，不定义类。

### 2.2 依赖方向

按 `owl:imports` 统计，主要方向是专业模块指向 FND、FBC、BE：

- BE 指向 FND（101 条）。
- FBC 指向 FND（138 条）、BE（72 条）。
- SEC 指向 FND（135 条）、FBC（69 条）、BE（41 条）、IND（15 条）。
- DER 指向 FND（83 条）、FBC（48 条）、SEC（32 条）、IND（22 条）。
- IND 指向 FND（47 条）、FBC（28 条）、BE（16 条）。
- LOAN 指向 FND（86 条）、FBC（29 条）。
- MD 指向 FND（21 条）、SEC（9 条）、FBC（8 条）。
- CAE 指向 FND（13 条）、FBC（5 条）、SEC（3 条）。
- BP 指向 FND（44 条）、SEC（19 条）、FBC（9 条）。
- ACTUS 指向 FND（10 条）、DER（4 条）、SEC（4 条）。

例外：`FND/TransactionsExt/SecuritiesTransactions.rdf` 引用了 FBC 的 `Security`，所以 FND 与 FBC 在模块级不是严格单向。把模块当"依赖包"，不要当"绝对分层"。

### 2.3 IRI 规则

稳定 IRI 的形态：

```
https://spec.edmcouncil.org/fibo/ontology/<域>/<模块>/.../<本体>/<资源>
```

例：

```
https://spec.edmcouncil.org/fibo/ontology/FBC/FinancialInstruments/FinancialInstruments/FinancialInstrument
```

版本 IRI 的形态：

```
https://spec.edmcouncil.org/fibo/ontology/<域>/YYYYMMDD/<模块>/.../<本体>/
```

命名空间前缀的形态：`fibo-<域>-<模块>-...-<本体>`。

### 2.4 OMG Commons 边界（重要）

FIBO 不是自包含的。`Party`、`LegalEntity`、`LegalPerson`、`Organization`、`Identifier`、`IdentificationScheme`、`PartyRole`、`ExplicitDate`、`DatePeriod`、`ScalarQuantityValue` 等上层原语定义在 OMG Commons 本体库，FIBO 通过 `owl:imports` 引用。例如 `FND/Parties/Parties.rdf` 直接导入：

- `https://www.omg.org/spec/Commons/PartiesAndSituations/`
- `https://www.omg.org/spec/Commons/Identifiers/`
- `https://www.omg.org/spec/Commons/DatesAndTimes/`
- `https://www.omg.org/spec/Commons/Organizations/`

因此，查 `Party` 或 `Identifier` 的定义时，不要在 FIBO 目录里找；要去 Commons。FIBO 定义的是金融领域的子类和角色，例如 `Customer`、`Counterparty`、`LegalEntityIdentifier`。

## 3. 核心概念族

以下 IRI 省略公共前缀 `https://spec.edmcouncil.org/fibo/ontology/`；Commons 概念标 `cmns:`。定义列引号内为 FIBO 原文，其余为紧贴原文的译文。

### 3.1 当事人与角色

| 概念 | IRI | 定义 | 关键关系 |
|---|---|---|---|
| Party | `cmns-pts:Party` | 参与某种情况的主体（Commons 定义） | 持有角色、订立合同 |
| LegalEntity | `cmns-org:LegalEntity` | 具有法律人格、能承担权利义务的主体（Commons 定义） | 发行工具、接受识别 |
| Customer | `FND/ProductsAndServices/ProductsAndServices/Customer` | "party that receives or consumes products (goods or services) and has the ability to choose between different products and suppliers" | 是 `Buyer` 的子类，不是 `Party` 的子类 |
| Client | `FND/ProductsAndServices/ProductsAndServices/Client` | "party that purchases professional services from, or has a formal relationship to purchase services from another party" | 是 `PartyRole` 的子类 |
| Counterparty | `FND/Agreements/Contracts/Counterparty` | "party to a contract with whom one negotiates on a given agreement" | 是 `ContractParty` 的子类 |
| AccountHolder | `FBC/ProductsAndServices/ClientsAndAccounts/AccountHolder` | "party that owns an account" | 是 `Owner` 的子类 |
| AccountProvider | `FBC/ProductsAndServices/ClientsAndAccounts/AccountProvider` | "party that provides and services an account" | 是 `ServiceProvider` 的子类 |
| Issuer | `FBC/FinancialInstruments/FinancialInstruments/Issuer` | "role of a party that makes (or proposes to make) one or more financial instruments available in some well-defined, typically formal way" | 是 `ContractPrincipal` 的子类 |
| Obligor | `FND/Agreements/Agreements/Obligor` | "party that is bound legally or by agreement to repay a debt, make a payment, do something, or refrain from doing something" | 是 `PartyRole` 的子类 |
| Obligee | `FND/Agreements/Agreements/Obligee` | "party to whom some commitment or obligation is owed, either legally or per the terms of an agreement" | 是 `PartyRole` 的子类 |
| Borrower | `FBC/DebtAndEquities/Debt/Borrower` | "party to a credit agreement that is obligated to repay the amount borrowed (principal) with interest and other fees according to the terms of the instrument" | 多继承：`Debtor`、`ContractParty`、`Customer` |
| Lender | `FBC/DebtAndEquities/Debt/Lender` | "a party that extends credit or money to a borrower with the expectation of being repaid, usually with interest" | 多继承：`Creditor`、`ContractParty` |
| BeneficialOwner | `BE/OwnershipAndControl/CorporateOwnership/BeneficialOwner` | "party that enjoys the benefits of ownership (such as receipt of income) of something even though its ownership (title) may be in the name of another party" | 是 `Owner` 的子类 |

关键区别：`Customer` 是角色，不是当事人的子类；`Client` 与 `Customer` 不是同义词；`Counterparty` 是合同角色；`AccountHolder` 是账户角色。代码里如果建了 `Customer extends Party`，就把"身份"和"关系"焊死了，后续一个人既是客户又是担保人时无法表达。

### 3.2 协议、合同、承诺

| 概念 | IRI | 定义 | 关键关系 |
|---|---|---|---|
| Agreement | `FND/Agreements/Agreements/Agreement` | "negotiated understanding between two or more parties, reflecting the offer and acceptance of commitments on the part of either party" | 包含 `Commitment` |
| Contract | `FND/Agreements/Contracts/Contract` | "voluntary, deliberate agreement between competent parties to which the parties agree to be legally bound, and for which the parties provide valuable consideration" | 是 `Agreement` 的子类 |
| WrittenContract | `FND/Agreements/Contracts/WrittenContract` | "formal contract that is written and signed by the parties thereto" | 是 `Contract` 的子类 |
| CreditAgreement | `FBC/DebtAndEquities/Debt/CreditAgreement` | "contractual agreement in which a debtor receives something of value and typically agrees to repay the creditor by some date in the future" | 是 `WrittenContract` 的子类 |
| Commitment | `FND/Agreements/Agreements/Commitment` | "promise made by some party to act or refrain from acting in some manner" | 是 `Situation` 的子类 |
| Duty | `FND/Law/LegalCapacity/Duty` | "some obligation which exists and is imposed on some individual" | 法律构造 |
| Right | `FND/Law/LegalCapacity/Right` | "entitlement to perform certain actions (or not), or to be in certain states (or not)" | 法律构造 |

关键区别：`Agreement` 不等于 `Contract`；`Commitment` 是承诺，不是合同本身；`Duty` 和 `Right` 是法律构造，不是业务状态字段。代码里常见错误是把"订单"叫合同、把"合同"叫产品、把"承诺"直接存成 `status`。

### 3.3 金融工具

| 概念 | IRI | 定义 | 关键关系 |
|---|---|---|---|
| FinancialInstrument | `FBC/FinancialInstruments/FinancialInstruments/FinancialInstrument` | "written contract that gives rise to both a financial asset of one entity and a financial liability of another entity" | 是 `WrittenContract` 的子类 |
| Security | `FBC/FinancialInstruments/FinancialInstruments/Security` | "financial instrument that can be bought or sold" | 是 `FinancialInstrument` 的子类 |
| DebtInstrument | `FBC/FinancialInstruments/FinancialInstruments/DebtInstrument` | "financial instrument and credit agreement evidencing monies owed by the issuer to the holder on terms as specified" | 多继承：`CreditAgreement`、`FinancialInstrument` |
| EquityInstrument | `FBC/FinancialInstruments/FinancialInstruments/EquityInstrument` | "financial instrument representing an ownership interest in an entity or pool of assets" | 是 `Security` 的子类 |
| DerivativeInstrument | `FBC/FinancialInstruments/FinancialInstruments/DerivativeInstrument` | "financial instrument that confers on its holders certain rights or obligations, whose value is derived from one or more underlying assets" | 是 `FinancialInstrument` 的子类；与 `CashInstrument` 不相交 |
| Option | `FBC/FinancialInstruments/FinancialInstruments/Option` | "derivative instrument that grants to the holder either the privilege to purchase or the privilege to sell the assets specified at a predetermined price or formula at or within a time period in the future" | 是 `DerivativeInstrument` 的子类 |
| Future | `FBC/FinancialInstruments/FinancialInstruments/Future` | "derivative instrument that obligates the buyer to receive and the seller to deliver the assets specified at an agreed price, at some later point in time" | 是 `DerivativeInstrument` 的子类 |
| Swap | `DER/DerivativesContracts/Swaps/Swap` | "derivative instrument whereby counterparties agree to exchange periodic streams of cash flows or liabilities from two different financial instruments with each other" | 是 `DerivativeInstrument` 的子类 |
| Loan | `LOAN/LoansGeneral/Loans/Loan` | "debt instrument whereby one party extends money or credit to another party (or parties) with the understanding that the borrowed money will be repaid according to the terms of the contract" | 多继承：`CreditAgreementRepaidPeriodically`、`DebtInstrument` |
| Bond | `SEC/Debt/Bonds/Bond` | "tradable debt instrument representing a loan in which the issuer owes the holder(s) a debt" | 多继承：`CreditAgreementRepaidAtMaturity`、`TradableDebtInstrument` |
| CommercialPaper | `SEC/Debt/TradedShortTermDebt/CommercialPaper` | 银行、公司或外国政府为短期融资发行的无担保短期债务工具 | 是 `MoneyMarketInstrument` 的子类 |
| CertificateOfDeposit | `FBC/ProductsAndServices/ClientsAndAccounts/CertificateOfDeposit` | 与定期存款账户关联、在特定期限内不可提取的现金工具 | 是 `CashInstrument` 的子类 |
| CollectiveInvestmentVehicle | `SEC/Securities/Pools/CollectiveInvestmentVehicle` | 投资者汇集资产、份额资本与载体资产分离的集合投资载体 | 是 `PooledFund` 的子类 |

关键区别：`FinancialInstrument` 是书面合同，不是"产品目录项"。`Security` 是"可买卖"的子类，不是所有金融工具。`Loan` 同时是债务工具和信贷协议。`Bond` 同时是可交易债务工具和到期偿还的信贷协议。代码里用一个 `instrument_type` 枚举装下所有维度，会丢失多继承语义。

### 3.4 账户、余额、头寸、持仓

| 概念 | IRI | 定义 | 代码落点 |
|---|---|---|---|
| Account | `FBC/ProductsAndServices/ClientsAndAccounts/Account` | "container for records associated with a business arrangement for regular transactions and services" | 账户主数据，不是产品，也不是合约 |
| AccountAsAnAsset | `FBC/ProductsAndServices/ClientsAndAccounts/AccountAsAnAsset` | "financial asset in the form of an account" | 资产视图，不是账户本体 |
| Balance | `FBC/ProductsAndServices/ClientsAndAccounts/Balance` | "amount of money available or owed" | 金额值对象，不是头寸 |
| Position | `FBC/ProductsAndServices/FinancialProductsAndServices/Position` | "financial exposure resulting from owning, borrowing, shorting, or entering into a contract (e.g., derivatives)" | 敞口或头寸，不是余额 |
| Holding | `FND/OwnershipAndControl/Ownership/Holding` | "owned financial interest consisting of legal or beneficial ownership of an asset or security that confers economic rights on its owner" | 持仓或所有权，不是账户余额 |
| Portfolio | `FND/OwnershipAndControl/Ownership/Portfolio` | "collection of holdings assembled and maintained as a unit for management purposes to achieve strategic objectives" | 组合，不是账户 |
| Exposure | `FBC/ProductsAndServices/FinancialProductsAndServices/Exposure` | 个人或组织暴露于损失、风险或不确定性的状态 | 风险敞口，不是会计余额 |
| Trade | `FBC/ProductsAndServices/FinancialProductsAndServices/Trade` | "situation that realizes an agreement between parties participating in a voluntary action of buying and selling goods and services" | 成交，不是订单，也不是结算 |

关键区别：`Account` 是记录容器。`Balance` 是金额。`Position` 是敞口。`Holding` 是所有权利益。`Portfolio` 是持仓集合。`Trade` 是成交情境。这六个词在中文里常混用为"账户、余额、持仓、头寸、组合、交易"，代码里必须分开。

### 3.5 金额、价格、收益率、利率

| 概念 | IRI | 定义 | 代码约束 |
|---|---|---|---|
| MonetaryAmount | `FND/Accounting/CurrencyAmount/MonetaryAmount` | "measure that is an amount of money specified in monetary units" | 金额加币种加精度 |
| AmountOfMoney | `FND/Accounting/CurrencyAmount/AmountOfMoney` | "amount of readily available cash in banknotes and coins" | 现金量，不是会计金额 |
| Currency | `FND/Accounting/CurrencyAmount/Currency` | "medium of exchange value, defined by reference to the geographical location of the monetary authorities responsible for it" | ISO 4217 |
| Price | `FND/Accounting/CurrencyAmount/Price` | "amount of money, goods, or services requested, expected, required, or given in exchange for something else" | 价格，不是收益率 |
| Yield | `FBC/FinancialInstruments/InstrumentPricing/Yield` | "return on the investor's capital investment" | 百分比，不是金额 |
| InterestRate | `FND/Accounting/CurrencyAmount/InterestRate` | "amount charged, expressed as a percentage of principal, in exchange for the use of assets" | 比率，不是利息金额 |
| Interest | `FBC/DebtAndEquities/Debt/Interest` | "the cost of using credit, or another's money, expressed as a rate per period of time, payable by a debtor to a creditor" | 金额，不是利率 |
| Principal | `FBC/DebtAndEquities/Debt/Principal` | "with respect to a debt: the value of an obligation, such as a bond or loan, raised and that must be repaid at maturity" | 方面（Aspect），不是金额类 |

关键区别：`Price`、`Yield`、`InterestRate`、`Percentage` 是不同概念；`Interest` 是金额，`InterestRate` 是比率；`Principal` 是"本金这个方面"，具体金额用 `MonetaryAmount`。代码里一个 `rate` 字段装所有比率，会让报表口径无法解释。

### 3.6 标识符

| 标识符 | IRI | 标准 | 用途 | 校验要点 |
|---|---|---|---|---|
| LegalEntityIdentifier | `BE/LegalEntities/LEIEntities/LegalEntityIdentifier` | ISO 17442 | 法人机构唯一标识 | 20 位字母数字，mod-97 校验 |
| InternationalSecuritiesIdentificationNumber | `SEC/Securities/SecuritiesIdentification/InternationalSecuritiesIdentificationNumber` | ISO 6166 | 证券国际标识 | 12 位，Luhn 校验 |
| BusinessIdentifierCode | `FBC/FunctionalEntities/FinancialServicesEntities/BusinessIdentifierCode` | ISO 9362 | 金融机构或非金融机构标识 | 8 或 11 位 |
| MarketIdentifierCodeRegistryEntry | `FBC/FunctionalEntities/InternationalRegistriesAndAuthorities/MarketIdentifierCodeRegistryEntry` | ISO 10383 | 交易场所标识（注册表条目） | 4 位，查注册表 |
| FinancialInstrumentGlobalIdentifier | `SEC/Securities/SecuritiesIdentificationIndividuals/FinancialInstrumentGlobalIdentifier` | OMG FIGI | 金融工具全球标识 | 12 位，含校验位 |
| CommitteeOnUniformSecuritiesIdentificationProceduresNumber | `SEC/Securities/SecuritiesIdentificationIndividuals/CommitteeOnUniformSecuritiesIdentificationProceduresNumber` | CUSIP | 北美股票或注册债券标识 | 9 位，含校验位 |
| StockExchangeDailyOfficialListCode | `SEC/Securities/SecuritiesIdentificationIndividuals/StockExchangeDailyOfficialListCode` | SEDOL | 英国证券标识 | 7 位，含校验位 |
| UniqueTransactionIdentifier | `FBC/ProductsAndServices/FinancialProductsAndServices/UniqueTransactionIdentifier` | UTI | 交易唯一标识 | 按监管规则生成 |
| UniqueProductIdentifier | `DER/DerivativesContracts/DerivativesBasics/UniqueProductIdentifier` | UPI | OTC 衍生品产品标识 | 按监管规则生成 |
| UniqueSwapIdentifier | `DER/DerivativesContracts/Swaps/UniqueSwapIdentifier` | USI | 互换交易标识 | 按监管规则生成 |
| UniversalLoanIdentifier | `LOAN/RealEstateLoans/HomeMortgageDisclosureActCoveredMortgages/UniversalLoanIdentifier` | ULI | 房地产抵押贷款标识 | 按 HMDA 规则生成 |

关键区别：标识符不是裸字符串；每个标识符都有方案、发行方、有效期和校验规则。代码里用 `code` 一个字段装 LEI、ISIN、内部编号，后续无法校验、无法去重、无法跨系统映射。

### 3.7 时间、日程、事件

| 概念 | IRI | 定义 | 代码约束 |
|---|---|---|---|
| ExplicitDate | `cmns-dt:ExplicitDate` | 显式日期（Commons） | 日期，不是时间点 |
| DatePeriod | `cmns-dt:DatePeriod` | 日期期间（Commons） | 起止日期，含边界语义 |
| Schedule | `FND/DatesAndTimes/FinancialDates/Schedule` | "collection of events, observations, or other occurrences and the associated dates and/or times when they will be done" | 规则加例外 |
| PaymentSchedule | `FND/ProductsAndServices/PaymentsAndSchedules/PaymentSchedule` | "schedule for delivery of money in fulfillment of an obligation" | 期数、金额、日期规则 |
| Occurrence | `FND/DatesAndTimes/Occurrences/Occurrence` | 发生（FIBO 上层） | 事件本体 |
| Action | `CAE/CorporateEvents/CorporateActions/Action` | 动作或行动 | 公司行动的上位 |
| CorporateAction | `CAE/CorporateEvents/CorporateActions/CorporateAction` | "action carried out by or specifically relating to a legal entity that may affect the securities it issues and may have a material impact on its stakeholders" | 公司行动 |
| TradeLifecycleEvent | `FBC/ProductsAndServices/FinancialProductsAndServices/TradeLifecycleEvent` | "kind of event that occurs during one or more stages of the lifecycle of a trade" | 交易事件 |
| Settlement | `FBC/FinancialInstruments/Settlement/Settlement` | "act of finalizing a transaction, including but not limited to finalizing accounting, exchanging consideration, and/or legally recording documents" | 结算事件 |
| Clearing | `BP/Process/FinancialContextAndProcess/Clearing` | "The process by which securities trades are cleared." | 清算过程 |

关键区别：`Settlement` 是完成交易的行为或事件，`Clearing` 是清算过程；`TradeLifecycleEvent` 是交易事件，`CorporateAction` 是发行人的公司行动。代码里把"清算"和"结算"合成一个状态，会让对账和监管报送口径混乱。

### 3.8 市场数据

| 概念 | IRI | 定义 | 代码约束 |
|---|---|---|---|
| Price | `FND/Accounting/CurrencyAmount/Price` | 交换某物所需、预期或支付的钱、商品或服务量 | 带币种、时间、来源 |
| Yield | `FBC/FinancialInstruments/InstrumentPricing/Yield` | 投资者资本投资的回报 | 带计算方法、期间 |
| InterestRate | `FND/Accounting/CurrencyAmount/InterestRate` | 以本金百分比表示的用资成本 | 带基准、期限、重置规则 |
| Index | `FND/Arrangements/IdentifiersAndIndices/Index` | "indirect shortcut derived from and pointing into, a greater volume of values, data, information or knowledge" | 带编制方法、基期 |
| ValuationMethod | `FND/Arrangements/Assessments/ValuationMethod` | "method used to determine the present or expected worth of an asset" | 带方法、输入、日期 |

关键区别：价格、收益率、利率、估值是不同概念；市场数据必须带时间戳、来源和口径，否则不可复现。

## 4. 术语消歧表（中文与 FIBO）

| 中文常用词 | 常见英文 | FIBO 首选概念 | 不要混淆 | 代码建议 |
|---|---|---|---|---|
| 客户 | customer | `Customer`（买方角色） | `Client`（专业服务）、`Counterparty`（合同对手）、`AccountHolder`（账户持有人） | `party_role` 加 `role_type` |
| 登录账号 | system user | 无直接对应 | 登录账号是认证主体，不一定是当事人 | 系统账号与业务当事人分开 |
| 账户 | account | `Account`（记录容器） | `AccountAsAnAsset`（资产视图）、`DepositAccount`（存款产品） | 账户主数据独立于产品与合约 |
| 余额 | balance | `Balance`（金额） | `Position`（敞口）、`Holding`（所有权） | 金额值对象，带币种 |
| 头寸 | position | `Position`（金融敞口） | `Balance`（金额）、`Exposure`（风险暴露） | 头寸表按工具、市场、方向 |
| 持仓 | holding | `Holding`（所有权利益） | `Position`（敞口）、`Portfolio`（组合） | 持仓与头寸分表 |
| 组合 | portfolio | `Portfolio`（持仓集合） | `Account`（账户）、`Fund`（基金） | 组合是管理单位 |
| 交易 | trade 或 transaction | `Trade`（成交情境） | `Transaction`（更泛）、`Order`（指令）、`Settlement`（结算） | 成交、指令、结算分表 |
| 订单 | order | 无通用类（FIBO 只覆盖基金订单台与订单路由） | `Trade`（成交）、`Instruction`（指令） | 订单管理自建模型，语义与 FIBO 的 Trade 一致 |
| 合约 | contract | `Contract`（法律约束协议） | `Agreement`（理解）、`FinancialInstrument`（工具）、`Product`（产品） | 合同头、条款、承诺分表 |
| 产品 | product | `FinancialProduct`（机构提供给消费者的产品） | `FinancialInstrument`（工具）、`Account`（账户） | 产品目录与工具主数据分开 |
| 发行人 | issuer | `Issuer`（角色） | `Obligor`（义务人）、`LegalEntity`（主体） | 角色表，不建 `issuer` 子类 |
| 本金 | principal | `Principal`（方面） | `MonetaryAmount`（金额）、`Interest`（利息金额） | 本金金额用金额类型 |
| 利息 | interest | `Interest`（金额） | `InterestRate`（比率） | 金额与比率分开 |
| 面值 | nominal value 或 par value | `hasNominalValue`（属性） | `Price`（价格）、`Principal`（本金） | 面值是工具属性，不是金额字段 |
| 清算 | clearing | `Clearing`（过程） | `Settlement`（结算行为） | 清算与结算分状态 |
| 结算 | settlement | `Settlement`（完成交易的行为） | `Clearing`（清算）、`Payment`（付款） | 结算事件独立 |
| 托管 | custody | `Custodian`（角色）、`SecuritiesCustody`（过程） | `DepositAccount`（存款） | 托管关系独立建模 |
| 估值 | valuation | `ValuationMethod`（方法）、`Revaluation`（重估） | `Price`（价格） | 估值带方法、输入、日期 |
| 受益所有人 | beneficial owner | `BeneficialOwner`（角色） | `Owner`（所有权人）、`Shareholder`（股东） | 受益所有权独立关系 |

这张表不是翻译词典，而是"遇到这个词时先问是哪个概念"的校验表。FIBO 没有覆盖所有中文金融词。表中的"无直接对应"要如实标注，不要硬套。

## 5. 代码落地校验单

### 5.1 金额与币种

- 金额字段用定点小数，禁止 `float` 和 `double`；数据库用 `DECIMAL` 或 `NUMERIC`，不用二进制浮点。
- 每个金额字段必须有币种；跨币种金额必须带汇率、汇率日期和汇率来源。
- 明确舍入规则：中间计算精度、最终展示精度、舍入方向（四舍五入或银行家舍入）。
- 价格、收益率、利率、百分比分开建模；不要用一个 `rate` 字段装所有比率。

校验方法：搜索 `float`、`double`、`REAL`、`FLOAT` 与金额字段同现；搜索 `amount` 字段附近是否有 `currency`；读 DDL 的 `DECIMAL` 精度。

### 5.2 标识符

- 标识符值对象带 `scheme`、`issuer`、`valid_from`、`valid_to`；不要用裸 `code`。
- 按方案校验：LEI 20 位 mod-97；ISIN 12 位 Luhn；BIC 8 或 11 位；MIC 4 位；FIGI 12 位。
- 一个实体可有多个标识符；不要假设"一个实体一个编号"。
- 外部标识符变更要留历史；不要覆盖旧值。

校验方法：搜索 `code`、`no`、`number` 字段是否无 `scheme`；搜索标识符校验函数；读唯一约束是否只建在 `value` 上。

### 5.3 当事人与角色

- `party` 与 `party_role` 分表；角色带类型、生效期、来源。
- 不要在 `party` 上放"客户等级""授信额度"等关系属性；它们属于客户关系或授信协议。
- 一个人可以同时有多个角色；不要用布尔字段表达角色。

校验方法：看 `customer` 是否继承 `party`；看角色是否有有效期；看 KYC 字段落在哪张表。

### 5.4 合约与履约

- 合同头、条款、承诺、履约事件分开；合同版本链保留历史。
- 订单、成交、结算分表；不要用一个 `trade` 表装三种语义。
- 状态由事件推导；更正用冲正或补偿事件，不改历史。

校验方法：看合同表是否有 `version`；看状态字段是否有对应事件表；看更正逻辑是否 `UPDATE` 历史行。

### 5.5 时间

- 区分时间点与日期；存储 UTC，展示带时区。
- 生效日、记账日、结算日、报告日分开。
- 营业日日历、节假日、时区作为配置；不要硬编码。
- 支持 as-of 查询。历史报表可复现。

校验方法：搜索 `date` 字段的语义注释，查看时区处理，确认是否有营业日日历表。

### 5.6 事件与审计

- 事件日志不可变。状态表是投影。
- 事件带 `occurred_at`、`recorded_at`、`actor`、`subject`、`causation_id`、`correlation_id`。
- 审计日志与业务事件分开。审计日志保留期限按监管要求。

校验方法：确认事件表是否禁止更新或删除，校验状态变更是否都有事件，校验审计日志保留策略。

## 6. 常见误区

1. 把 `Customer` 当 `Party` 的子类。FIBO 里 `Customer` 是 `Buyer` 的子类，`Buyer` 是角色。角色不是主体。
2. 把 `Account` 当合约或产品。`Account` 是 `FinancialRecord`，是记录容器。
3. 把 `Balance` 当 `Position`。`Balance` 是金额，`Position` 是敞口。
4. 把 `Security` 当 `FinancialInstrument` 的同义词。`Security` 是"可买卖"的子类，不是所有工具。
5. 把 `Loan` 当纯产品。`Loan` 同时是 `DebtInstrument` 和 `CreditAgreement`。
6. 把标识符当字符串。标识符必须带方案、发行方、有效期。
7. 把 FIBO 当数据模型或报文标准。FIBO 是本体。DDL、API、ISO 20022 报文要另外设计。
8. 用 Provisional 模块的词当权威。MD、CAE、BP、LOAN 多数是 Provisional。引用前回源码确认。
9. 按标签检索。Release 级仍有少量重复标签（例如 `NotificationProvision` 同时出现在 FND 和 SEC）。权威标识是 IRI。
10. 认为 FIBO 包含全部概念。`Party`、`Identifier`、`Date`、`Quantity` 在 OMG Commons。FIBO 在 Commons 之上定义金融子类和角色。

## 7. 查询与取证方法

### 7.1 离线克隆

```bash
git clone --depth 1 --branch master_2026Q3 https://github.com/edmcouncil/fibo.git
```

### 7.2 从 IRI 找文件

`catalog-v001.xml` 是 IRI 到文件的映射。例如：

```bash
grep -n 'FinancialInstruments/FinancialInstruments/' catalog-v001.xml
```

### 7.3 从术语找定义

```bash
grep -rn -A 12 'rdf:about="&fibo-fbc-fi-fi;FinancialInstrument"' \
  FBC/FinancialInstruments/FinancialInstruments.rdf
```

注意：FIBO 的 RDF/XML 用 DOCTYPE 实体缩写，`&fibo-fbc-fi-fi;` 是命名空间前缀。用支持实体解析的 RDF 工具（rdflib、Jena、RDF4J）比纯正则可靠。

### 7.4 看依赖

```bash
grep -rho '<owl:imports rdf:resource="[^"]*"' --include='*.rdf' FBC | sort | uniq -c
```

### 7.5 看成熟度

```bash
grep -rn 'hasMaturityLevel' --include='*.rdf' FBC | head
```

### 7.6 看卫生测试

`etc/testing/hygiene_parameterized/` 下有 59 个 SPARQL 测试，覆盖标签、定义、唯一性、循环、弃用、punning 等规则。它们是 FIBO 自己的质量门禁，可以借鉴到项目。

### 7.7 引用格式

引用 FIBO 时至少给：发布标签、模块或文件、IRI。例如：

```
FIBO master_2026Q3, FBC/FinancialInstruments/FinancialInstruments.rdf,
https://spec.edmcouncil.org/fibo/ontology/FBC/FinancialInstruments/FinancialInstruments/FinancialInstrument
```

只写"FIBO 说"不够，因为 FIBO 有 Release 与 Provisional 之分，同一个词在不同模块可能有不同成熟度。

## 8. 与 ISO 标准的关系

| 标准 | 内容 | FIBO 的角色 | 项目要做什么 |
|---|---|---|---|
| ISO 17442 | LEI | 定义 `LegalEntityIdentifier` | 校验 20 位与 mod-97 |
| ISO 6166 | ISIN | 定义 `InternationalSecuritiesIdentificationNumber` | 校验 12 位与 Luhn |
| ISO 10383 | MIC | 定义 `MarketIdentifierCodeRegistryEntry` | 查注册表，校验 4 位 |
| ISO 9362 | BIC | 定义 `BusinessIdentifierCode` | 校验 8 或 11 位 |
| ISO 4217 | 货币代码 | 定义 `Currency` 与币种标识 | 金额必带币种 |
| ISO 8601 | 日期时间 | 通过 Commons 的日期时间类型使用 | 存储 UTC，展示带时区 |
| ISO 3166 | 国家与地区代码 | 通过 Commons 使用 | 地址与国家代码校验 |
| ISO 10962 | CFI | 定义 `FinancialInstrumentClassificationCode` | 工具分类按 CFI 轴 |
| ISO 20022 | 金融报文 | FIBO 不定义报文 | 报文映射单独做 |
| ISO 704 | 术语工作原则 | FIBO 的定义遵循 | 定义用上位概念加区分特征 |

FIBO 提供"概念和关系"，ISO 标准提供"代码、格式、校验规则、报文"。两者互补，不能互相替代。

## 9. 边界与未覆盖

- 不提供物理数据模型：没有表结构、索引、分区、主键策略。
- 不提供 API 契约：没有 REST 或 GraphQL schema、错误码、分页。
- 不提供报文标准：ISO 20022、FIX、SWIFT MT 要单独映射。
- 不提供会计分录：借贷方向、科目、记账规则要按会计制度设计。
- 不提供监管规则：资本充足率、报送口径、法域差异要按监管文件实现。
- 不提供完整参考数据：ISO 代码表、交易所日历、评级、价格要接外部源。
- 不保证定义百分之百覆盖：Release 级约 94% 的类有定义，Provisional 级约 58%。引用前回源码确认。
- 不保证标签唯一：Release 级仍有少量重复。用 IRI，不用 label 做唯一键。

## 10. 来源与版本基线

- 仓库：https://github.com/edmcouncil/fibo
- 发布：`master_2026Q3`，2026-10-20 发布
- 提交：`2d73435a4419b66b7c9f44cb9763e35fe8ac7890`，2026-10-15
- 许可：MIT，版权归 EDM Council 与 OMG。引用或再分发片段时保留版权与许可声明
- 主要阅读文件：`README.md`、`ONTOLOGY_GUIDE.md`、`CONTRIBUTING.md`、`catalog-v001.xml`、`AboutFIBOProd*.rdf`、`MetadataFIBO.rdf`、FND、BE、FBC、SEC、DER、IND、LOAN、MD、CAE、BP、ACTUS 的模块文件、`etc/testing/hygiene_parameterized/*.sparql`
- 数据采集日期：2026-10-22

本文是源码级摘要，不是 FIBO 的官方文档，也不代表 EDM Council 或 OMG 的立场。术语定义以 FIBO 源文件为准。本文的中文解释用于工程沟通，不构成法律意见。
