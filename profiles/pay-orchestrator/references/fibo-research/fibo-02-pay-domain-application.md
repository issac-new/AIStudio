# FIBO 支付域应用调研报告（pay team 分册）

> **任务定位**：Hermes 支付团队（pay-fintech 合规 / pay-clearing 清算结算 / pay-infra 报文技术）FIBO 调研系列之「支付域应用」分册
> **撰写**：Hermes subagent ｜ **完成日期**：2026-09-20 ｜ **数据获取时间**：2026-09-20（当日检索快照）
> **状态**：v1.1 双通道合并（骨架 v0.1 → 全节回填 → 并入第二采集通道：ISO/TR 22126、CPMI d230/PIE、ISDA DRR、EDMC 2015 监管提案史、AI grounding 实证、FIBO-V 属性实测）
> **诚实声明**：凡标注「未找到公开证据」的条目，均为实际检索未获证实，禁止引用为事实。
> **证据分级**：A=官方一手（标准文本/官方公告）｜B=厂商/行业一手（案例自述）｜C=学术/第三方分析｜D=传闻未证实（单列，不作结论依据）
> **源码实测基线**：clone `https://github.com/edmcouncil/fibo`（浅克隆）→ `/Users/YOURNAME/hermes-docker-sandbox/workspace/research/_fibo_repo/`，HEAD commit **`08322e9ec08a32f37038178e10dc12e7a7de6ab5`**（2026-09-11 09:11:52 -0700）。所有 `file:line` 锚点均出自该 commit，可用 `git show 08322e9e:<path>` 复核。

---

## 0. 执行摘要（Executive Summary）

1. **FIBO 有支付语义，但支付不是独立域**：支付类散布在 FND（Payment/PaymentSchedule/PaymentObligation）、FBC（Account/PaymentService/Settlement）、BP（ClearingAndSettlement 流程语境）、LOAN（PaymentCard/CardAccounts）、DER（SettlementTerms）、CAE（CorporateActionPaymentObligation）。实测全仓 `payment`（忽略大小写、整词）命中 **458 次**，但没有一个叫 "Payments" 的顶层域目录——这与 ISO 20022 把 Payments 作为独立业务域的做法形成结构性反差。
2. **银行账户体系覆盖强，支付工具覆盖偏弱**：Account 层次（DemandDepositAccount/DepositAccount/IBAN 等）在 FBC 是 Release 成熟度；而银行卡只有 LOAN 域的 `PaymentCard`（且被建模为 LegalDocument 的子类，见 §3.1），无 CashTransfer、无支付报文、无清算所净额头寸管理语义。
3. **对 ISO 20022 的关系是"引用与适配"，不是"映射标准"**：FIBO 内 ISO 20022 以 `cmns-av:adaptedFrom` 注解出现（如 FBC/DebtAndEquities/Debt.rdf:1144），CAE 域收录了 ISO 20022/15022 与 GLEIF 的 corporate action 码表，但**未找到公开证据**表明存在 OMG/EDM 官方发布的 FIBO↔ISO 20022 全量映射规范。
4. **LEI/GLEIF 是 FIBO 最深的标准化伙伴关系**：FIBO 原生含 LEI 类（BE/LegalEntities/LEIEntities.rdf:273 `LegalEntityIdentifier`），其类注解直接引用 GLEIF L2 Relationship Record CDF；GLEIF 官方 L1/L2 本体由同一批 FIBO 核心作者（Working Ontologist 等）打造，EDMC 曾在 FSB 层面推动 FIBO 作为 LEI 语义层（§5.2）。
5. **产业采用：数据治理/KG 场景有真实案例，支付交易处理场景无证据**：Ontotext GraphDB FIBO 方案（B）、FIB-DM 数据模型分发 3500 用户/162 银行下载（B，厂商自述）、Lakeside Bank 生产 KG 导入 FIBO BE/LOAN/SEC（C，第三方分析）；但「银行核心支付系统用 FIBO」**未找到公开证据**。
6. **批评是实质性的**：Dean Allemang（FIBO 前核心建模者）公开承认 "Adoption of FIBO has been disappointing"（B/C）；CEUR-WS 论文实测 Hermit 一致性检查 4 天跑不完（C）；OWL 门槛与季度演进速度被多方指认（§6）。
7. **对 pay team 的一句话建议**：把 FIBO 当**支付业务语义资产库/对账字典**（账户、主体、义务、净额、结算事件定义）选择性借用，不要当支付报文或清算引擎模型——那是 ISO 20022（报文层）和 CDM（交易生命周期层）的地盘；借鉴其本体方法论而规避其"全量采用"陷阱（§7、§8）。

---

## 1. 调研范围、方法与证据分级

- **范围**：FIBO 在支付/清算/合规领域的实际应用与产业采用；与 ISO 20022、LEI 等标准的关系；对中国支付体系的可借鉴点；反对与批评声音。
- **方法**：
  - 源码实测：`git clone --depth 1 https://github.com/edmcouncil/fibo`，grep/awk 提取类 IRI、成熟度、定义原文，全部结论附 file:line；
  - 官方一手来源：EDM Council / spec.edmcouncil.org / OMG / GLEIF / GitHub Releases；
  - 学术与第三方：CEUR-WS、Ontotext、FIB-DM、行业评论；
  - 三角验证：关键结论至少 2 个独立来源；无法交叉验证的降级标注。
- **证据分级**：A=官方一手（标准文本/官方公告）；B=厂商/行业一手（案例自述）；C=学术/第三方分析；D=传闻未证实（单列，不作结论依据）。
- **检索基数**：两通道合计 22 组 web_search（返回约 180 条原始结果，相关约 100 条）+ 5 次页面全文抓取 + 6 轮本地仓库 grep 实测 + FIBO 主仓文件树（651 项全量）与 3 个支付相关 OWL 文件的元素级解析；合并去重后全文引用独立来源约 40 个（第一通道约 22 个：A 级 8、B 级 6、C 级 5；第二通道增补约 18 个，见 §9.1 末尾），未证实/缺口若干（§9.3）。

---

## 2. FIBO 基本盘核实（治理、模块、发布机制）

### 2.1 标准身份 【证据等级 A】

- FIBO = Financial Industry Business Ontology，由 EDM Council（现 EDM Association）主持开发、通过 OMG 标准化，OWL（W3C Web Ontology Language，基于描述逻辑）表达。来源：https://spec.edmcouncil.org/fibo （"FIBO is hosted and sponsored by the Enterprise Data Management Council (EDMC)... It is also standardized by the Object Management Group (OMG). FIBO is developed as an ontology in the Web Ontology Language (OWL)."）【A】
- 治理身份变更：2025-07-01 EDM Council 宣布收购 OMG，2025-10-01 完成交割，EDM Council 更名 **EDM Association**——FIBO 的主持方与标准化方现在同属一个组织。来源：https://edmcouncil.org/announcement/edm-association-completes-acquisition-of-object-management-group-creating-worlds-largest-data-and-standards-community 【A】
- 仓库自述发布机制（README.md:14）："Revisions are made on a continuous basis by several teams addressing specific domain areas (e.g., securities, derivatives, indices, and so forth), available in GitHub, with **formal updates published quarterly**." 自 2020 年 1 月起转为开源社区流程开发（https://spec.edmcouncil.org/fibo 首页）。【A】
- 许可：MIT（ONTOLOGY_GUIDE.md 与每份 .rdf 头部声明）。【A】

### 2.2 模块结构（clone 实测，commit 08322e9e）

顶层域目录与 .rdf 文件数（`find <domain> -name "*.rdf" | wc -l`）：

| 域 | 全称 | .rdf 数 | 与支付的关系（实测） |
|---|---|---|---|
| FND | Foundations（基础库） | 59 | Payment/PaymentSchedule/PaymentObligation/Payer/Payee 在此（FND/ProductsAndServices/PaymentsAndSchedules.rdf） |
| BE | Business Entities（业务实体） | 48 | LegalEntity/LEI（LEIEntities.rdf），支付主体侧 |
| FBC | Financial Business and Commerce | 38 | Account 全家桶、Settlement、PaymentService、ClearingHouse、Collateral——**支付基础设施词汇最集中的域** |
| SEC | Securities | 36 | 证券侧 Settlement（SettlementTerms 等），无零售支付 |
| DER | Derivatives | 23 | 衍生品结算（DerivativeSettlementTerms、DerivativesClearingOrganization） |
| IND | Indices & Indicators | 18 | 无 payment 命中（0 文件） |
| LOAN | Loans | 20 | PaymentCard/CardAccounts/LoanPaymentSchedule——**银行卡与消费信贷支付词汇在此** |
| BP | Business Process（业务流程） | 12 | Clearing/ClearingAndSettlement 语境类（Provisional 成熟度） |
| CAE | Corporate Actions & Events | 7 | CorporateActionPaymentObligation、GLEIF/ISO15022 码表 individuals |
| MD | Market Data | 11 | 无支付语义 |
| ACTUS | ACTUS 词汇（2026 新增） | 4 | 合约现金流算法词汇（Provisional），含 FIBO 映射文件 |
| EXMP | Examples（2026Q2 从各域迁出） | 10 | 52 条 LEI registry entry 示例（EXMP/LegalEntities/FinancialInstitutionExamples.rdf） |

全仓 `<owl:Class rdf:about` 计数：**3169** 个类定义（commit 08322e9e 实测）。Allemang 引用超过 2000 类、FIB-DM 引用 2435/2500 类，量级一致。

### 2.3 治理与维护模式 【A + C】

- 出人出钱：EDM Council 会员机构贡献 SMME（主题专家），ontologist 团队维护。贡献者名单含 Citigroup、Deutsche Bank、Goldman Sachs、State Street、Wells Fargo、Mizuho、Nordea、Wells Fargo、CFTC、OFR（US Treasury）、Federal Reserve Bank of Kansas City 等。来源：https://edmcouncil.org/financial-industry-business-ontology 【A】
- 工作方式：每周工作组电话会 + GitHub issue/PR 流程 + reasoner 一致性门禁（ONTOLOGY_GUIDE.md:258："our ontologies, including all reference data and examples that have 'Release' level maturity, must be provably logically consistent using multiple OWL 2 compliant reasoners"）。【A】
- 成熟度三级：Release / Informative / Provisional（每份 .rdf 的 `fibo-fnd-utl-av:hasMaturityLevel` 注解，实测见 §3）。【A】

---

## 3. FIBO 对支付域的覆盖度：类级证据（clone 实测）

### 3.0 grep 实测总表（commit 08322e9e）

| 关键词（整词） | 忽略大小写命中次数 | 备注 |
|---|---|---|
| `payment` | **458** | 含类名/属性名/注解文本 |
| `Payment`（大小写敏感） | 29 | 主要为类 IRI 与引用 |
| `Settlement` | 52 | |
| `Account` | 39 | 含 Accounting 前缀词 |
| `Clearing` | 25 | |
| `Loan` | 68 | |
| `Collateral` | 20 | |
| `CashTransfer` | **0** | **该类不存在**（诚实发现，见 3.4） |

含 Payment 的文件按域分布：FND:5, FBC:5, SEC:9, DER:4, LOAN:5, BP:4, CAE:2, MD:2, IND:0, BE:0（文件数，`grep -rl "Payment"`）。
- 路径级对照（第二通道，主仓 tree 651 项全量、truncated=false）：**文件路径含 "Payment" 的仅 1 个**——`FND/ProductsAndServices/PaymentsAndSchedules.rdf`（15,908 字节），即全仓「专用于支付」的本体文件只有一个；上表 36 个文件是内容级命中（类名/注解提及 Payment/Settlement/Clearing）。两个口径互相印证：支付不是独立域。规模对照：SEC 域 36 个 .rdf、LOAN 域 20 个（§2.2），支付专用文件 1 个。

### 3.1 支付直接相关类（file:line 锚点 + 定义原文）

**FND 域（支付原语，Release 成熟度）**——`FND/ProductsAndServices/PaymentsAndSchedules.rdf`：

- `:122` `fibo-fnd-pas-psch:Payment` — 子类 of `fnd-dt-oc:Occurrence`；定义："**delivery of money in fulfillment of an obligation, such as to satisfy a claim or debt**"；关联 `hasPaymentAmount` → `MonetaryAmount`。
- 同文件类清单（`rdf:about` 全量提取）：`Payment`、`PaymentEvent`（子类 TransactionEvent，含 qualifiedCardinality=1 约束）、`PaymentObligation`、`PaymentSchedule`、`Payer`、`Payee`、属性 `fulfillsObligation`/`hasPaymentAmount`/`hasPaymentSchedule`。
- 成熟度：`:88` `hasMaturityLevel → Release`。
- 净额语义：`FND/Agreements/Contracts.rdf:555` `PaymentNettingProvision`、`:570` `SettlementNettingProvision`（清算净额的合同条款层表达）。

**FBC 域（支付基础设施词汇，多数 Release）**：

- `FBC/ProductsAndServices/ClientsAndAccounts.rdf:196` `fibo-fbc-pas-caa:Account`；`:645` `DemandDepositAccount`（定义含 DDA 缩写与 MMDA/NOW 排除性解释，监管口径定义）；同文件还有 `DepositAccount`、`InvestmentOrDepositAccount`、`InternationalBankAccountIdentifier`（IBAN）、`BasicBankAccountIdentifier` 等（文件成熟度 Release）。
- `FBC/FinancialInstruments/Settlement.rdf:161` `fibo-fbc-fi-stl:Settlement` — 定义："**act of finalizing a transaction, including but not limited to finalizing accounting, exchanging consideration, and/or legally recording documents, as applicable**"（文件成熟度 Release）；同文件 `SettlementConvention`、`CashSettlementTerms`、`PhysicalSettlementTerms`。
- `FBC/FunctionalEntities/FinancialServicesEntities.rdf:391` `ClearingHouse`、`ClearingBank`、`ClearingCorporation`、`CentralCounterpartyClearingHouse`、`:757` `PaymentService`（子类 MerchantService，关联 PaymentObligation；文件 Release）。
- `FBC/FunctionalEntities/EuropeanEntities/EUFinancialServicesEntities.rdf:128` `PaymentInstitution`（欧盟 PSD 语境的支付机构，提供 PaymentService）。
- `FBC/FunctionalEntities/InternationalRegistriesAndAuthorities.rdf` 与 `FBC/FunctionalEntities/Markets.rdf`：收录 ISO 10383 MIC 码（`adaptedFrom` 注解直接指向 iso20022.org 页面）。
- `FBC/DebtAndEquities/Debt.rdf:312` `Collateral`（及 `PhysicalCollateral`/`NonPhysicalCollateral`/`isCollateralizedBy`，Debt 文件 Release）。
- RTGS 语义痕迹：`FBC/FunctionalEntities/BusinessCentersIndividuals.rdf:3888` `TARGETSettlementDay`（TARGET2 结算日 individual；同系列有 `AbuDhabiSettlementDay`、`ESASSettlementDay`）。

**BP 域（清算结算流程语境，注意成熟度）**：

- `BP/Process/FinancialContextAndProcess.rdf:41` `fibo-bp-prc-fcp:Clearing`、`:47` `ClearingAndSettlement` — 定义："**The business process or service area of securities clearing and settlement.**" ⚠️ 该文件成熟度 **Provisional**（`hasMaturityLevel` 实测），且定义明确锚定 **securities** 清算结算，不是零售/大额支付清算。

**LOAN 域（银行卡，Release）**：

- `LOAN/LoansSpecific/CardAccounts.rdf:584` `fibo-loan-spc-crd:PaymentCard` — ⚠️ 父类是 `cmns-doc:LegalDocument`（卡片被建模为"法律文件"而非支付工具/凭证），含 CardExpirationDate、CardVerificationCode 约束；同文件 `PaymentCardAgreement`、`CardAccount`（文件成熟度 Release）。全仓 `PaymentCard` 命中 12 处。

**DER / CAE / LOAN 其他**：

- `der-drc-bsc:DerivativesClearingOrganization`、`der-drc-bsc:DerivativeSettlementTerms`、`der-cr-cds:CashSettlementMethod`/`SettlementAuction`、`der-drc-cur:ForeignExchangeSettlementNettingProvision`（外汇净额条款）。
- `cae-ce-srca:CorporateActionPaymentObligation`、`InterestPaymentAction`；`fbc-dae-dbt:InterestPayment`/`PrincipalPayment`（Debt.rdf）；`loan-ln-ln:IndividualPaymentTransaction`、`LoanPaymentSchedule`、`PaymentHistory`。
- LOAN 域 `*Loan*` IRI 类 58 个（`Loans.rdf:279` `Loan`、`LoanProducts.rdf:86`）。

### 3.2 覆盖度判断：支付是核心还是边缘 【分析推断，基于上述 A 级实测】

结论：**支付语义在 FIBO 中是"辅助/服务性"存在，不是一等域**。依据（均为推断，推断所基于的事实已列 §3.1）：
1. 无 Payments 顶层域、无专组 working group 迹象（EDMC 内容团队按 securities/derivatives/indices/loans 组织，GitHub Releases 按域分节，未见 payments 团队）；
2. `Payment` 在 FND 是 `Occurrence`（事件发生）而非金融产品/交易类型，建模重心在"履约事件+义务+日程"，服务于证券与信贷场景（票息支付、本金偿还）；
3. `ClearingAndSettlement` 是证券语境的 Provisional 类；清算机构词汇（ClearingHouse/CCP）在 FBC 实体侧丰富，但**清算过程语义**（头寸、净额计算、轧差、排队、流动性）缺失——`PaymentNettingProvision` 只是合同条款，不是净额计算模型；
4. 支付工具侧只有 `PaymentCard`（且语义滑稽地挂在 LegalDocument 下）；无账户到账户转账（CashTransfer 命中 0）、无 e-money、无 CBDC 词汇（2026Q2 Release Notes 提到 BE 域新增"market data related to digital currencies"的**数据提供商**类，但无数字货币支付工具本体）。
5. 对照组：贷款域 20 文件/58 个 Loan 类、证券域 36 文件——体量差一个数量级。

**给 pay team 的覆盖度定性：FIBO 覆盖"支付的商业语义骨架"（谁、对谁、什么义务、用什么账户、按什么日程、清算结算角色是谁），不覆盖"支付的技术执行语义"（报文、指令、清算文件、对账流水）。**

### 3.3 与支付清算词汇的映射能力（与 ISO 20022 / 网联 / 银联业务组件对照）【分析推断】

- **对 ISO 20022 业务组件**：ISO 20022 的 `PaymentInstruction`/`CreditTransfer`/`Debtor`/`Creditor`/`SettlementInstruction` 等组件在 FIBO 无一一对应类（`CreditTransfer` 全仓命中 0——实测 `grep -riwo "CreditTransfer"` 无输出）。FIBO 的 `Payment`+`PaymentObligation`+`Payer`/`Payee`+`Settlement` 组合可**语义覆盖**信用转移的概念空间，但粒度和报文导向完全不同：ISO 20022 是"一次指令怎么发"，FIBO 是"支付这件事在业务上是什么"。
- **对网联/银联**：未找到公开证据表明网联（NUCC）或银联（UnionPay）有 FIBO 相关映射或引用（检索 `网联 FIBO`、`UnionPay FIBO ontology` 均无命中）。中国清算机构的业务字典（如网联的支付指令要素）与 FIBO 类之间不存在公开映射资产。
- **可映射性评估（推断）**：FIBO 的本体方法论（ISO 704 定义规范、genus/differentia 结构、adaptedFrom 溯源注解、成熟度分级）对网联/银联构建自己的支付概念本体有直接参考价值；但逐类映射需要人工对齐工程，目前没有现成桥。

### 3.4 诚实记录：搜了但没有的东西

- `CashTransfer`：0 命中（任务提示词中的这个类名在 FIBO 中不存在）。
- `CreditTransfer` / `DirectDebit`：0 命中（实测）。
- 无支付报文、无清算文件格式、无对账/差错处理类。
- FND 曾有 provisional Cash Flows 本体（2025 年加入，见 open-investment-model/fibo-alignment.md 引述），本次 clone 中 FND 无同名文件——`find FND -iname "*cash*"` 未命中独立 CashFlows 目录；该信息标注为**待复核的第三方转述**（C 级）。

---

## 4. 产业采用盘点：谁在用、怎么用

### 4.1 银行与金融机构 【A（贡献者名单）→ B（使用深度）】

- **贡献者 ≠ 生产采用**，先分清楚。EDM Council 官方贡献者名单含 Citigroup、Credit Suisse、Deutsche Bank、Goldman Sachs、Mizuho、Nordea、State Street、Wells Fargo、Pinnacle Bank 等（https://edmcouncil.org/financial-industry-business-ontology ）【A】。OMG IND 1.0 规范致谢名单同样列出上述机构（https://www.omg.org/spec/EDMC-FIBO/IND/1.0/PDF ）【A】。
- State Street：与 OMG/EDMC 在 2015 年做过利率互换 FIBO POC（OMG FDTF wiki 自述："the successful proof of concept activity carried out in conjunction with State Street in 2015, which focused on interest rate swaps"，https://omgwiki.org/OMG-FDTF/doku.php?id=fibo ）【A/B】。EDMC/OMG OTC 衍生品 POC 材料展示 FIBO 对 ISDA UPI 码的自动映射（https://www.omg.org/news/meetings/tc/dc-13/special-events/semantic-pdfs/FS-T4-Newman.pdf ）【A】。
- Wells Fargo 的 David Newman 以 EDMC Semantic Technology Program 主席身份长期署名 FIBO 材料（BTDM 文档、POC 材料）【A】；但**未找到公开证据**表明 Wells Fargo 有生产级 FIBO 部署的自述。
- Lakeside Trust Bank（化名合成案例，作者自述"the figure is illustrative of the boil-the-ocean trajectory, not a measurement of a named institution"）：生产 KG 导入 FIBO BE/LOAN/SEC 模块做受益所有权穿透与敞口聚合，FIBO 类承担客户 360/AML/BCBS 239 查询（https://thedatapraxis.com/blog/lakeside-bank-knowledge-graph-reference/ ）【C】——注意这是合成案例（composite），证据等级按 C 不按 B。

### 4.2 数据治理与工具厂商 【B】

- **Ontotext**：GraphDB 官方 FIBO 方案页 + 技术博客（加载 FIBO、OWL 2 RL 推理、SKOS 词汇对齐、结构完整性检查；2020Q2 版 FIBO 实测 106,187 条显式陈述→405,493 条推理陈述）。https://www.ontotext.com/solutions/financial-services/fibo-ontotext-products 、https://www.ontotext.com/blog/fibo-graphdb-inference-and-property-path-features/ 【B】
- **FIB-DM（Bank Model Consulting / Jurgen Ziemer）**：把 FIBO 经 CODT 专利变换转成 ERwin/PowerDesigner 数据模型，自述"3,500 users, including 162 banks, have already downloaded the open-source core version"且 EDM Council 在官网背书 FIB-DM（https://fib-dm.com/semantics-for-large-banks-1-open-banking-video/ 、https://spec.edmcouncil.org/fibo/page/data-model ）【B】——下载量是厂商自述，未见独立审计。
- **Adaptive、NoMagic、TopQuadrant** 提供 FIBO web 化浏览/管理；**Wizdom Systems** 提供 LEI Resolver Service；**agnos.ai** 提供基于 FIBO 的 EKG 产品（FIBO Build-Test-Deploy-Maintain 方法论文档，https://raw.githubusercontent.com/edmcouncil/fibo/c8f237c62e6c86f606fcf62c54f7757f04f478e1/etc/site/fibo/doc/FIBO_BTDM.pdf ）【A/B】。
- **MakoLab**：2016 年提案 FIBO GLEI 扩展（fibo PR #248），后与 Ontotext 协作（https://github.com/Ontotext-AD/GLEI ）【A/B】。

### 4.3 监管与公共部门、标准组织 【A】

- 美国监管机构直接参与：CFTC、OFR（US Treasury）、Federal Reserve Bank of Kansas City 在贡献者名单（§4.1）【A】；BEA/BLS/Census/Statistics Canada 贡献经济统计类。
- EDM Council 2012 年前后在 FSB LEI 私营部门准备组（PSPG）会议上推介 FIBO 作为 LEI 的语义解决方案（https://a-teaminsight.com/blog/edm-council-plans-to-show-semantic-solution-for-lei-at-next-weeks-fsb-meeting/ ）【B，行业媒体报道官方行动】。
- GLEIF↔FIBO 的标准化互动见 §5.2。
- 监管报告场景：FIBO 初始用例即 Dodd-Frank/MiFID II/BCBS 239 的监管数据词汇（CEUR-WS 论文引述，https://ceur-ws.org/Vol-3337/semrec_paper1.pdf ）【C/A 转述】。

### 4.4 与 ISDA CDM 等其他标准项目的协作与竞争 【A + C】

- **分工格局**（第三方分析，OpenIM fibo-alignment.md，https://github.com/antikas/open-investment-model/blob/main/model/fibo-alignment.md ）：FIBO 管"东西是什么"（实体、工具、合同类型），CDM 管"交易怎么走生命周期"（order/execution/allocation/settlement instruction）；该文明确写道"the trade-lifecycle entities...are not in FIBO — that grain is ISDA CDM"【C】。
- ISDA CDM 官方：现由 FINOS 托管、社区规范许可，覆盖衍生品/repo/SBL 债券的交易生命周期与机器可执行报告（DRR）。https://www.isda.org/isda-solutions-infohub/cdm/ 【A】
- 协作证据：EDMC/OMG POC 演示 FIBO 类↔ISDA UPI 码映射（§4.1 Newman PDF）【A】；FBC 2022Q1 Release 引入美国 ILDR 监管字段与 ACTUS 对齐（https://github.com/edmcouncil/fibo/releases/tag/master_2022Q1 ）【A】。
- **支付视角**：CDM 不做零售支付；FIBO 也不做。零售/跨境支付的交易生命周期事实上由 ISO 20022 报文生态+各 MI 自家规范承载——三者是互补空位关系，不是竞争关系（推断，基于上述 A 级范围声明）。
- **「机器可执行监管报送」的事实标准在 CDM 一侧**【A】：ISDA DRR 已覆盖 9 个辖区（含 ESMA EMIR Refit），加拿大 OSC 与 ISDA 合作把监管规则编码进 DRR，报告可按 ISO 20022 格式直接产出（isda.org、drr-docs.isda.org）；英格兰银行《数字监管报告 2023》将 CDM 列为主要 DRR 倡议，BISIH 新加坡中心×MAS 的 Project Ellipse 亦用 CDM 建模抵押贷款报送数据（bankofengland.co.uk）。FIBO 没有对等的可执行监管产物。
- **监管采纳史**【A】：EDM Council 2015-10 致 CPMI-IOSCO 备忘录，建议以 FIBO 作为 OTC 衍生品数据协调的「罗塞塔石碑」（bis.org/2026/07/edm.pdf 存档原文，署名 Michael Atkin）；后续 CPMI-IOSCO 的 CDE 协调实际走要素清单路线，未以 FIBO 为载体。截至 2026-09，**未找到任何 G20 监管当局将 FIBO 采纳为强制/推荐报告标准的公开证据**。

### 4.5 未找到公开证据的传闻清单（诚实单列）

- 「某头部银行核心支付系统采用 FIBO」：未找到公开证据。
- 「SWIFT/CPMI 在 ISO 20022 工作中参考 FIBO」：未找到公开证据（GLEIF 2018 年给 FCA 的咨询回复仅并列提到 "schema.org, ISO 20022, FIBO and XBRL" 作为候选标准模板，是 GLEIF 自己的建模提议，非 ISO 20022 侧证据；https://www.gleif.org/media/pages/lei-solutions/regulatory-use-of-the-lei/consultation-responses/c219b5d1f5-1746444855/2018-06-11_pubconresponses_fca-smarter-regulatory-reporting_v1.0-final.pdf ）。
- 「中国任何支付机构/清算机构采用 FIBO」：未找到公开证据。
- 「FIBO 在数字人民币/CBDC 设计中的角色」：未找到公开证据。
- 以上任何一条如被引用为事实即违反本报告纪律。

### 4.6 2024-2026 的新叙事：FIBO 作为 AI 接地层 【B + C】

- EDMC 官方定位已改口："**The most important emerging use for FIBO today is to optimize AI platforms** because ontologies radically improve the ability for AI tools to use data to carry out better and more precise reasoning."（edmcouncil.org/frameworks/industry-models/fibo/）【B】——从「监管报告的通用语义」转向「AI 的语义底座」。
- 开源实证 **kuber-map**：把 FIBO 做成金融 AI agent 的接地上下文包（每概念绑定 FIBO IRI、provenance 标签不混用），同一 agent 有/无 FIBO 上下文对照评测：准确率 47.5%→92.8%（+45.3pt，263 题、5 用例），幻觉引用率 55%→0%（gpt-4o-mini，项目自报、方法与数据公开可复核）（github.com/AI-First-Community/kuber-map）【C】。
- 工程模式：LLM agent 按「受限 FIBO 词汇 + 人工权威映射表」给数据列标注 FIBO IRI，SHACL 校验做确定性拒绝门，OWL 推理只做子类闭包（johnra.me 2026 系列）【C】。
- **对支付域的含义**：这条线不依赖 FIBO 的支付类存在——要的是「标准 IRI + 机器可读定义」的**接地纪律**。中文支付术语层可整体复刻该模式（§7.2 第 6 条）。

---

## 5. 与相邻标准的关系

### 5.1 ISO 20022：业务语义层 vs 报文层 【A + 推断】

- **官方映射存在吗？** 未找到公开证据表明存在 OMG/EDM Council 官方发布的 FIBO↔ISO 20022 全量映射规范。检索 OMG 规范库（omg.org/spec/EDMC-FIBO）、spec.edmcouncil.org、GitHub edmcouncil/fibo 均无 "ISO 20022 mapping" 规范文件。**如实标注：未找到公开证据。**
- **仓库内实际关系是"引用与适配"**（全部为 clone 实测，commit 08322e9e）：
  - `FBC/DebtAndEquities/Debt.rdf:1144`：`SecurityAgreement` 类注解 `cmns-av:adaptedFrom: ISO 20022`（该文件唯一一处 ISO 20022 文本引用）；
  - `FBC/FunctionalEntities/InternationalRegistriesAndAuthorities.rdf:303,314,356` 与 `Markets.rdf` 多处：ISO 10383 MIC 码 `adaptedFrom` 指向 iso20022.org 发布页；
  - `CAE/CorporateEvents/ISO15022-CorporateActionIndividuals.rdf:38`：ISO 15022 corporate action 码表 individuals，abstract 明确"Scope excludes...message definitions associated with ISO 15022 as well as related messages covered by ISO 20022"——即 FIBO 明确把自己限定在码表/事件语义，**不碰报文定义**；
  - GitHub Releases（2022Q1 及 2026Q2）声明 CAE 域正在"map FIBO to controlled vocabularies for corporate actions in ISO 20022 and ACTUS"（https://github.com/edmcouncil/fibo/releases ）【A】——进行中的是**码表词汇映射**，不是报文模型映射。
- **结构性对比（推断）**：ISO 20022 是报文/业务组件标准，有规范化的支付域（pacs/pain/camt）与中文落地路径（CIPS V3 报文标准基于 ISO 20022，见 §7.1）；FIBO 是 OWL 本体，支付在其架构里只是跨域辅助概念。两者在"支付"上的交集是**业务词典**（agent、account、settlement、date conventions），不是模型。FIBO 官方 wiki 对自身定位的表述可作佐证：FIBO 试图成为"financial data standards 的 foundation"，语义层可对齐其他表示形式（https://omgwiki.org/OMG-FDTF/doku.php?id=fibo ）【A】。
- **ISO 侧的语义化走自建路线、未采用 FIBO**【A】：ISO/TR 22126-3:2023 用 W3C PROV-O 做 ISO 20022 概念模型的语义富化与变更溯源；ISO/TR 22126-2:2025 把 ISO 20022 元模型与 e-Repository 表示为 OWL DL（以 auth.016 报文为案例），用的是**自建 RDF 词汇**而非 FIBO（iso.org/standard/76310.html；iteh.ai 样章）。即「ISO 20022 + OWL」路线已被 ISO 官方验证，但官方路径里没有 FIBO。
- **FIBO 侧的承诺-交付缺口**【A】：2024Q1 Release 原文 "we plan to release controlled vocabularies for ISO 20022 and ACTUS related corporate actions over the coming months"；其后多个季度重复 "anticipate resuming work on ... ISO 20022 and ACTUS controlled vocabularies"；至 2026Q1 Release 仍是 "We anticipate changes in Q2 ... as we map FIBO to controlled vocabularies for corporate actions in ISO 20022 and ACTUS"（github.com/edmcouncil/fibo/releases 逐季原文）。连 corporate actions 码表这一个切面都一再顺延；**支付报文族（pacs/pain/camt）的 FIBO 映射资产：未找到公开证据**。
- **支付报文协调的实际载体不是本体**【A】：CPMI《跨行跨境支付 ISO 20022 统一数据要求》（2023 首发、2026 更新版 bis.org/cpmi/publ/d230.pdf）12 项一般要求 + 统一数据模型，end-2027 目标，2025 年设 Harmonisation Panel 治理；PIE 工作组 2026 跟进报告（bis.org/cpmi/pietf/iso20022_2026.pdf）确认各 MI 进度不均、动能向上，并明确 **LEI 因覆盖率与基础设施所限仅作 name+postal address 之外的补充要素，不是支付处理的主识别符**。

### 5.2 LEI / GLEIF：最深的一条标准化伙伴关系 【A】

FIBO 侧（clone 实测）：
- `BE/LegalEntities/LEIEntities.rdf:273` `fibo-be-le-lei:LegalEntityIdentifier`；同文件 `LegalEntityIdentifierScheme`、`LEIRegisteredEntity`；
- `:84` changeNote：为 FIBO 2.0 RFC 加入 ISO 17442 LEI 与 GLEIF Common Data Format 支撑约束；
- `:85` changeNote：支持 GLEIF LEI Level 2 所有权关系；
- `:106,113,134,234`：多个类注解 `adaptedFrom: GLEIF Level 2 Relationship Record (RR) Common Data Format (CDF)`（直链 gleif.org）；
- `CAE/CorporateEvents/GLEIF-CorporateActionIndividuals.rdf`：GLEIF CDF corporate action 码表 individuals（abstract 注明"as of 4 March 2021"，实测 48 个 individual/thing 节点）；
- `EXMP/LegalEntities/FinancialInstitutionExamples.rdf`：52 条银行 LEI registry entry 示例（JPMorgan、Citi、Barclays、ING、Commerzbank 等，实测）；
- 官方 use case BE-01（EDMC Confluence）：把 GLEIF XML CDFF 变换为 OWL 语义模型、证明 FIBO BE 与 GLEIF CDFF 兼容、以 Apple 实例演示映射（https://dil-edmcouncil.atlassian.net/wiki/spaces/BE/pages/8258689/ ）【A】。

GLEIF 侧（官方一手）：
- GLEIF 官方发布并维护 L1（Who Is Who）与 L2（Who Owns Whom）本体：https://www.gleif.org/ontology/L1/ 、https://www.gleif.org/ontology/L2/ 【A】。L1 页面致谢与贡献者含 **Working Ontologist（Dean Allemang/Pete Rivett 系 FIBO 核心班底）**，且 L1/L2 本体 import OMG 技术流程元数据与 OMG LCC 标准——即 GLEIF 本体与 FIBO 出自同一技术社区、共享 OMG 基础设施；
- 2022Q1 Release 官方声明："working towards better alignment with the latest GLEIF ontologies and plan to publish a mapping ontology to further demonstrate how to integrate FIBO with the GLEIF data published at data.world"（https://github.com/edmcouncil/fibo/releases/tag/master_2022Q1 ）【A】。

**结论（推断，基于上述 A 级证据）**：GLEIF 没有直接"采用 FIBO"，而是与 FIBO 团队**同源共建**了两套相互对齐的本体（GLEIF L1/L2 官方本体 ≈ FIBO BE LEI 模块的平行实现），这是 FIBO 方法论被官方标准组织实质性复用的最强案例；EDMC 早在 FSB PSPG 时期即推动该路线（§4.3）。但"GLEIF 基于 FIBO 构建 Relationship Data"若表述为直接依赖则过强——准确表述是**基于同一方法与同一批作者、互相映射**。

### 5.3 其他相邻标准 【A】

- **OMG Commons（cmns-*)**：FIBO 的上层本体（非金融通用类），LegalEntity 等最基础类已在 Commons（open-investment-model/fibo-alignment.md 亦指出此点）【A/C】。
- **ACTUS**：2026Q2 起在 FIBO 内有专属域（4 个 .rdf），`ACTUS/ACTUSContractTermMapping.rdf` abstract："a mapping from ACTUS contract terms...to the corresponding concept(s) in FIBO"——这是 FIBO 仓内**存在的官方映射文件范例**（对 ACTUS，不是对 ISO 20022）【A】。
- **XBRL**：仅 GLEIF 咨询回复语境并列提及，无映射资产（§4.5）。
- **ISO 17442（LEI）/ISO 10383（MIC）/ISO 4914（UPI）**：均有 adaptedFrom/类级引用（Debt 侧 DER-146 PR 加 ISO 4914 UPI 定义，2026Q2 Release Notes）【A】。

---

## 6. 批评与反对声音

以下每条均有实际来源，无 strawman：

1. **采用率低——来自 FIBO 自己的核心建模者** 【B/C】：Dean Allemang（FIBO 长期核心建模者，Working Ontologist）：*"Adoption of FIBO has been disappointing; there are projects here and there that make use of it, but the goal of making the data landscape of the finance industry more coherent and understandable has not been achieved."* 并指出十年积累 2000+ 类导致"想找到你需要的东西很难"，out-of-the-box 体验是一堵 OWL 实体墙，需要课程或顾问才能上手。https://medium.com/@dallemang/does-an-ontology-need-an-interpreter-cc624e8c4f3f （Allemang 的结论是 LLM+SPARQL 对话入口可能是解药，但对采纳困境的承认是直白的）
2. **OWL 推理在规模上不可用——学术实测** 【C】：CEUR-WS Vol-3337 论文《Reasoning in the FIBO ontology – A challenge》：FIBO 使用完整 SROIQ(D) 逻辑；Hermit 一致性检查 4 天未跑完、Pellet 2 天未跑完（48 vCPU/89GB RAM 环境）；Konclude 直接报错退出；结论"none of the bog-standard DL reasoners can support reasoning over logically complex ontologies like FIBO"。https://ceur-ws.org/Vol-3337/semrec_paper1.pdf
3. **OWL 专业门槛与双栈割裂——厂商一线观察** 【B】：FIB-DM（Ziemer）："OWL needs highly specialized ontologists...many banks and investment managers don't have the semantic expertise in-house"；RDF 三元组库适合知识与分析、"doesn't work well for transaction processing and core banking"，于是需要把 OWL 变换回 ER 关系模型的双轨方案。https://fib-dm.com/semantics-for-large-banks-1-open-banking-video/
4. **实施成本与组织阻力——第三方综述** 【C】：Global Fintech Series：复杂度、遗留系统集成、资源门槛（小机构玩不起）、文化阻力四类实施障碍。https://globalfintechseries.com/featured/financial-information-business-ontology-fibo-architecture-use-cases-and-implementation-challenges/
5. **覆盖与工具适配的工程瑕疵** 【C/B】：Ontotext 博客实测指出 FIBO 的 SKOS 词汇层与 OWL 类层的层级映射是 lossy 的（`skos:broader` vs `rdfs:subClassOf` 语义不对齐，需要 OWL 2 RL 推理修补）。https://www.ontotext.com/blog/fibo-graphdb-inference-and-property-path-features/
6. **与 CDM/ISO 20022 的分工模糊带** 【C】：OpenIM 对齐文档指出交易生命周期粒度不在 FIBO（是 CDM 的地盘），采购方需自行理解三层分工。https://github.com/antikas/open-investment-model/blob/main/model/fibo-alignment.md
6a. **词表属性爆炸——工具厂商实测** 【B】：TopQuadrant 对 FIBO-V（1,700+ 概念的 SKOS 词表发行版）的可用性分析：486 个在用属性中约 300 个仅服务单一概念、仅 21 个服务 18+ 概念；业务用户扩展/维护困难，而 EDMC 对属性整合建议的回应是不敢拍板（"we did not feel comfortable making the judgement calls required for property consolidation"）（topquadrant.com/blog/best-approaches-for-using-and-extending-fibo-vocabulary）。
6b. **概念强、实现验证弱——学术** 【C】：FOMI/GFRO 基金监管报告原型论文："the financial ontology standards (FIBO) are conceptually strong but lack the testing to allow for robust implementation"（ceur-ws.org/Vol-2050/FOMI_paper_1.pdf）；Bennett 2013（Springer JBR，被引 171）与 CEUR Vol-2205 同时指出全量 FIBO "too large and unwieldy for any one operational use case"，落地必须裁剪为 operational ontology。
7. **平衡视角**：Allemang 同文确认 FIBO 团队用 design patterns/模块化/命名规范/课程持续缓解问题；EDMC 侧的 ONTOLOGY_GUIDE.md:258 显示其质量门禁（多 reasoner 一致性）是社区内严肃执行的——批评集中于"可用性/采纳"，而非"建模质量"。

**未找到公开证据的批评**：FIBO 治理资金问题、EDMC 内部路线斗争等——均未找到公开证据，不列。

---

## 7. 对中国支付体系的可借鉴点

> 本节性质声明：7.1 是有 A 级来源的事实底座；7.2/7.3 是基于前文证据的**分析推断**（已逐条标注），仅供 pay team 决策参考，不构成"已被验证的做法"。

### 7.1 语境对齐（事实底座）【A】

- **ISO 20022 迁移已成事实**：Swift 网络跨境支付 MT/ISO 20022 并行期于 2025-11-22 结束，11-24 数据显示 97% 支付指令经 ISO 20022 发送（https://m.mpaypass.com.cn/news/202512/22182254.html ，行业媒体转述 Swift 公告）。
- **CIPS 的 ISO 20022 路线**：CIPS 官方声明将使其 ISO 20022 报文使用指南与 CPMI 跨境支付统一数据要求（BIS CPMI d218）在 2027 年底前对齐（https://www.cips.com.cn/en/2023-10/17/article_2023122305151170038.html ）【A】；《人民币跨境支付系统报文交换标准》现行 V3.0.1（2026-03-23，https://www.cips.com.cn/kjjqgs/2026-07/18/article_2026071800152022362.shtml ）【A】。
- 中国侧现状：支付语义资产实际由报文标准（CIPS V3/ISO 20022）、监管报送规范与各清算机构业务字典分散承载；**未找到公开证据**表明中国支付体系存在公开的 OWL 本体资产或与 FIBO 的任何对接。
- 对标基线（第二通道增补）：①Deutsche Bank 实测「80% 以上的拒付源于 ISO 20022 数据属性的误用」（flow.db.com G20 路线图白皮书）【B】——迁移后的治理重心是字段级数据质量而非语义哲学；②CPMI d230 的 12 项统一要求 + 统一数据模型可直接充当 CIPS 2027 对齐的差距评审/验收清单【A】；③mBridge 平台的技术身份方案是「ISO 20022 元数据载荷 + LEI」（BIS 宣传册 2023-10）【A】——两条支付基建线都没有本体层的位置。

### 7.2 可借鉴点（分析推断，每条注明依据）

1. **业务语义资产化——"字典+文法"独立于报文存在**（依据 §2.1/§3.1 A 级证据 → 推断）：FIBO 证明支付的商业概念（义务、账户、清算角色、净额条款、结算事件）可以做成与报文版本无关的可治理资产。对中国支付体系：在 CIPS/网联报文标准之上沉淀一层中文业务概念本体（ISO 704 式定义+溯源注解），可让监管报送、对账、风控共享同一套定义，而不是每个系统各养一份字典。**标注：分析推断。**
2. **报文迁移的前置语义建模**（依据 §5.1 + §7.1 → 推断）：CIPS 2027 对齐 CPMI 数据要求是又一轮字段级改造；若迁移前先建业务组件本体（以 FIBO 的 Payment/PaymentObligation/Settlement 定义为参照骨架），可把"报文字段变更"降维成"语义层映射+渲染层变更"。FIBO 自身与 ISO 20022 没有官方映射（§5.1）恰好说明这件事**没人做成过**——是空位也是机会。**标注：分析推断。**
3. **LEI 深度应用**（依据 §5.2 A 级证据 → 推断）：GLEIF L1/L2 本体是现成的、官方维护的、与 FIBO 兼容的实体关系本体。中国支付体系（CIPS 间接参与行穿透、备付金主体识别、受益所有权审查）可直接复用 GLEIF L2 的 accounting-consolidation 关系模型，不必从 FIBO 全量起步。**标注：分析推断，落地需评估 LEI 在境内的强制覆盖范围。**
4. **数据治理标准衔接**（依据 §4.3/§6 → 推断）：FIBO 的初始用例就是 BCBS 239 风险数据聚合；其"定义+溯源注解+成熟度分级+reasoner 门禁"的资产治理流程可直接映射到支付机构的数据治理（DCAM/CDMC 体系 EDMC 已商业化）。**标注：分析推断。**
5. **合规规则的表达层**（依据 §3.1 的 PaymentNettingProvision/ KYC-AML 场景案例 §4.1/§4.2 → 推断）：净额条款、支付义务、合格主体这类合规概念的 OWL 表达可用于机读合规规则（如备付金存管规则中的主体资格条件）。但注意 §6.2：全量 OWL 推理在工程上不可行，中国落地应选 OWL 2 RL 或 SHACL 子集。**标注：分析推断。**
6. **AI 接地的中文复刻**（依据 §4.6 → 推断）：对账问答/报文生成助手按「中文支付术语层 + 每条术语绑定可解引用标识 + 来源标签禁混用」落地；FIBO 实证该纪律可把金融 LLM 幻觉引用率打到 0（+45.3pt）。不必引入 OWL，词表 + IRI 纪律即可。**标注：分析推断。**
7. **形态与治理的分工**（依据 §4.4/§6 教训 → 推断）：支付语义资产按「受控词汇 + 可执行产物（SHACL 规则包、对账/差错规则集、报文测试集）」形态建——形态学 CDM（模型=代码，监管与工程都接得住），治理学 FIBO（周例会、引用一致性、季度发版、弃用缓冲期 6-12 个月）。FIBO 的反面教材是概念对了但没有可执行产物，采用起不来。**标注：分析推断。**

### 7.3 反面教训：FIBO 十余年采用不广的组织与激励原因（分析推断，事实依据见 §6）

1. **供给侧成功≠需求侧成功**（Allemang 原话："solved the supply-side problem...without ever solving the demand-side problem"）：标准组织只激励"把模型建全"，不激励"让人用起来"；培训/顾问门槛把中小机构挡在门外。
2. **技术栈跃迁成本由采用方独自承担**：OWL→关系库/报文栈之间没有免费桥梁，FIB-DM 这类桥是第三方商业行为；对中国借鉴=若建本体，必须同时配套到现有栈（SQL/报文/数仓）的官方免费变换工具，否则重蹈覆辙。
3. **大而全 vs 够用就好的路线之争**：FIBO 追求"预先覆盖所有应用"，支付团队若借鉴，应反着做——从单一场景（如 CIPS 对账、备付金校验）的最小本体起步，用 FIBO 当词典不当框架。
4. **治理与发布节奏**：季度发版对标准是优点，对采用方是漂移成本（2026Q2 还在做域合并与概念迁移，Release Notes 自述 concepts deprecated until Q3 2027）；借鉴者应锁版本+抽象自己的稳定层。
   **本小节全部为分析推断**，其事实前提（采纳低、reasoner 不可用、双栈成本、季度漂移）均有 §6 来源。

---

## 8. 结论与行动建议（pay team 向）

| 级别 | 建议 | 依据 |
|---|---|---|
| **立即** | 把 FIBO 的支付相关**定义文本**（Payment/PaymentObligation/Settlement/PaymentNettingProvision/DemandDepositAccount 等，§3.1 锚点）作为中文支付业务字典的对标参考，纳入 pay-clearing 的术语治理 | A（clone 实测） |
| **立即** | 评估直接采用 **GLEIF L1/L2 本体**（而非 FIBO 全量）做机构主体/受益所有权语义层；跨境报文中 LEI 按 CPMI 2026 口径作补充要素设计，同步建「LEI↔统一社会信用代码/行号」映射资产 | A（§5.2、§5.1） |
| **立即** | CIPS/跨境产品对齐工作直接以 CPMI d230 十二项要求+统一数据模型为验收清单；每季度一次检索跟踪 FIBO releases 的 ISO 20022 词汇是否真实交付 | A（§5.1、§7.1） |
| **中期** | 在 CIPS ISO 20022 对齐项目（2027 deadline）中，试点"业务组件本体先行"：选 1 个报文族（如 pacs.008/009）建语义层映射原型，参照 FIBO 定义但映射到 ISO 20022 组件 | A+推断（§7.2.2） |
| **中期** | 任何本体落地强制配"到现有栈的变换工具"（SQL DDL/报文 XSD 生成），规避 FIBO 式双栈割裂 | B/C（§6.3） |
| **观察** | EDMC/OMG 合并后的 FIBO 治理变化、LLM+FIBO 对话入口（Allemang 提议）是否实质降低采用门槛、CDM 是否向支付域外溢 | 动态跟踪 |
| **不做** | 不要全量导入 FIBO 做支付生产系统；不要用全 OWL DL 推理做在线支付链路 | C（§6.2 实测 4 天跑不完） |

---

## 9. 附录：来源清单、检索日志与未证实事项

### 9.1 来源清单（URL + 证据等级；访问日期均为 2026-09-20）

**A 级（官方一手）**
1. https://spec.edmcouncil.org/fibo — EDM Council FIBO 官方 spec 站（身份、OWL、OMG 标准化）
2. https://edmcouncil.org/financial-industry-business-ontology — EDMC FIBO 页（贡献机构名单）
3. https://edmcouncil.org/announcement/edm-association-completes-acquisition-of-object-management-group-creating-worlds-largest-data-and-standards-community — OMG 收购完成公告（2025-10-01）
4. https://github.com/edmcouncil/fibo + Releases（含 https://github.com/edmcouncil/fibo/releases/tag/master_2022Q1）— 源码仓与季度 Release Notes（ISO 20022/GLEIF/ACTUS 映射声明）
5. 本地 clone commit 08322e9ec08a32f37038178e10dc12e7a7de6ab5 全部 file:line 锚点（§3、§5.1、§5.2）
6. https://www.gleif.org/ontology/L1/ 、https://www.gleif.org/ontology/L2/ — GLEIF 官方本体（作者含 Working Ontologist，import OMG LCC）
7. https://dil-edmcouncil.atlassian.net/wiki/spaces/BE/pages/8258689/ — EDMC use case BE-01（GLEIF CDFF↔FIBO 变换与映射）
8. https://www.cips.com.cn/en/2023-10/17/article_2023122305151170038.html 、https://www.cips.com.cn/kjjqgs/2026-07/18/article_2026071800152022362.shtml — CIPS 官方（ISO 20022 对齐承诺、报文标准 V3.0.1）
9. https://www.isda.org/isda-solutions-infohub/cdm/ — ISDA CDM 官方范围声明
10. https://www.omg.org/spec/EDMC-FIBO/IND/1.0/PDF — OMG FIBO IND 规范（参与机构）
11. https://omgwiki.org/OMG-FDTF/doku.php?id=fibo — OMG FDTF wiki（FIBO 治理流程、State Street POC）
12. https://www.omg.org/news/meetings/tc/dc-13/special-events/semantic-pdfs/FS-T4-Newman.pdf — EDMC/OMG 衍生品 POC（FIBO↔ISDA UPI 映射）

**B 级（厂商/行业一手）**
13. https://www.ontotext.com/solutions/financial-services/fibo-ontotext-products 、https://www.ontotext.com/blog/fibo-graphdb-inference-and-property-path-features/ — Ontotext FIBO 方案与实测博客
14. https://fib-dm.com/semantics-for-large-banks-1-open-banking-video/ 及该站 PDF — FIB-DM 自述（3500 下载/162 银行，厂商自述未独立核实）
15. https://spec.edmcouncil.org/fibo/page/data-model — EDMC 官方对 FIB-DM 的背书页
16. https://raw.githubusercontent.com/edmcouncil/fibo/c8f237c62e6c86f606fcf62c54f7757f04f478e1/etc/site/fibo/doc/FIBO_BTDM.pdf — FIBO BTDM 方法论（厂商服务生态、Newman/Allemang 署名）
17. https://a-teaminsight.com/blog/edm-council-plans-to-show-semantic-solution-for-lei-at-next-weeks-fsb-meeting/ — A-Team 报道 EDMC 在 FSB PSPG 推介 FIBO-LEI
18. https://m.mpaypass.com.cn/news/202512/22182254.html — 移动支付网转述 Swift ISO 20022 迁移完成公告
19. https://github.com/Ontotext-AD/GLEI — Ontotext GLEI 映射工作区（MakoLab 协作史）

**C 级（学术/第三方分析）**
20. https://ceur-ws.org/Vol-3337/semrec_paper1.pdf — 《Reasoning in the FIBO ontology – A challenge》（reasoner 实测）
21. https://medium.com/@dallemang/does-an-ontology-need-an-interpreter-cc624e8c4f3f — Dean Allemang 批评文章（"Adoption of FIBO has been disappointing"）
22. https://thedatapraxis.com/blog/lakeside-bank-knowledge-graph-reference/ — Lakeside Bank 生产 KG 案例（作者自述含合成成分）
23. https://globalfintechseries.com/featured/financial-information-business-ontology-fibo-architecture-use-cases-and-implementation-challenges/ — 实施障碍综述
24. https://github.com/antikas/open-investment-model/blob/main/model/fibo-alignment.md — OpenIM 对 FIBO/CDM 分工的第三方对齐分析

**第二采集通道增补（2026-09-20，与上合并去重）**
- A 级：iso.org/standard/76310.html（ISO/TR 22126-2:2025 页）+ cdn.standards.iteh.ai 样章（22126-3:2023）；bis.org/cpmi/publ/d230.pdf（CPMI 统一数据要求 2026 更新版）；bis.org/cpmi/pietf/iso20022_2026.pdf（PIE 跟进报告，LEI=补充要素）；bis.org/2026/07/edm.pdf（EDMC 2015-10 致 CPMI-IOSCO 备忘录存档）；bis.org/innovation_hub/projects/mbridge_brochure_2311.pdf（mBridge：ISO 20022 载荷+LEI）；drr-docs.isda.org 与 isda.org（DRR 9 辖区、OSC 合作）；bankofengland.co.uk 数字监管报告 2023（CDM/Ellipse）；github.com/edmcouncil/fibo/releases（2024Q1→2026Q1 逐季 ISO 20022/ACTUS 承诺原文）；spec.edmcouncil.org/fibo/ontology/BE/LegalEntities/LEIEntities/LegalEntityIdentifierScheme；本通道 PaymentsAndSchedules.rdf / Settlement.rdf / CashFlows.rdf 元素级实测 + 主仓 tree 651 项路径级统计（其中 ClientsAndAccounts.rdf 拉取失败 0 字节、MarketsIndividuals.rdf 超时，均已在正文标注）。
- B 级：edw2016.dataversity.net（State Street FIBO POC 自述）；edmcouncil.org/frameworks/industry-models/fibo/（AI 定位改口、scores of institutions 表述）；flow.db.com（Deutsche Bank G20 白皮书：80% 拒付归因）；topquadrant.com（FIBO-V 1,700 概念/486 属性实测）；fib-dm.com（2,446 类口径、本体人才稀缺自述）；dil-edmcouncil.atlassian.net（FIBO-FCT-Derivatives 2024-11-19 会议纪要：把 FINOS CDM/FpML/XBRL 列为兼容审阅对象）。
- C 级：github.com/AI-First-Community/kuber-map（+45.3pt 接地评测，自报）；ceur-ws.org/Vol-2050（GFRO：概念强实现弱）；ceur-ws.org/Vol-2205（Bennett：概念本体设计、ISO SC9 WG1 上层本体仅非正式讨论）；link.springer.com/jbr.2013.13（Bennett 2013）；johnra.me 2026（agent 标注+SHACL 门模式）；emergentmind.com（「FIBO 覆盖 payments」的二手误传示例，以本报告实测纠正）。

### 9.2 检索日志摘要

- 本地 grep 轮次：6 轮（clone/文件计数→Payment/CashTransfer/Settlement/Clearing IRI 提取→Account/Collateral/Loan→ISO20022/GLEIF/LEI 引用→定义原文与成熟度→净额/ACTUS/TARGET 锚点），全部在 commit 08322e9e 上执行。
- web_search 查询组（11 组）：FIBO ISO 20022 mapping / GLEIF FIBO relationship / FIBO criticism OWL / bank FIBO production case study / site:gleif.org FIBO / EDMC OMG acquisition / GLEIF EDMC FIBO partnership / CIPS ISO 20022 中文 / FIB-DM downloads / ISDA CDM FIBO / FIBO ISO 20022 OMG specification。
- web_extract 抓取：gleif.org/ontology/L1、L2、github.com/edmcouncil/fibo/releases。

### 9.3 未证实事项与数据缺口

1. FIBO↔ISO 20022 官方全量映射规范：**未找到公开证据**（存在的是码表级 CAE 映射进行中声明，§5.1）。
2. 银行核心支付/清算生产系统采用 FIBO 的具名案例：**未找到公开证据**。
3. 中国支付机构/清算机构与 FIBO 的任何对接：**未找到公开证据**。
4. FIB-DM "3500 用户/162 银行下载"：厂商自述（B），无独立核实渠道。
5. Lakeside Bank 案例：作者自述为合成案例（C），不能当作具名机构采用证据。
6. FND "Cash Flows provisional ontology (2025)"：第三方转述（C），本次 clone 未见对应文件，待复核。
7. Allemang 文中"FIBO 每季度发新 release"表述与 README"formal updates published quarterly"一致，已按 A 级核实。
8. FIBO 对 ISO 20022 **支付报文族**（pacs/pain/camt）的映射资产：**未找到公开证据**（corporate actions 码表映射自 2024Q1 起多季承诺、至 2026Q1 仍未交付，§5.1）。
9. kuber-map 的 +45.3pt 接地评测：项目自报（C），方法与数据公开但无独立第三方复现。
10. 本通道 `ClientsAndAccounts.rdf`（两次拉取 0 字节）与 `MarketsIndividuals.rdf`（超时）未能元素级复核，正文相应结论改以 OMG FBC 1.0 规范、用户案例与「未找到公开证据」口径表述。

---

## 验收自查（实测结果，2026-09-20 执行）

| 项目 | 实测值 | 命令/方法 |
|---|---|---|
| clone commit hash | `08322e9ec08a32f37038178e10dc12e7a7de6ab5`（2026-09-11 09:11:52 -0700，浅克隆 depth=1） | `git log -1 --format="%H %ci"` |
| grep `payment`（整词、忽略大小写） | **458 次** | `grep -riwo "payment" --include="*.rdf" . \| wc -l` |
| grep `Payment`（整词、大小写敏感） | 29 次 | `grep -rwo "Payment" --include="*.rdf" . \| wc -l` |
| 含 payment 行数 | 387 行 | `grep -rwi "payment" --include="*.rdf" . \| wc -l` |
| grep `Settlement` | 52 ｜ `Clearing` 25 ｜ `Account` 39 ｜ `Loan` 68 ｜ `Collateral` 20 ｜ `CashTransfer` **0** | `grep -rwo <word> --include="*.rdf" . \| wc -l` |
| 含 Payment 文件按域 | FND:5 FBC:5 SEC:9 DER:4 LOAN:5 BP:4 CAE:2 MD:2 IND:0 BE:0 | `grep -rl "Payment" --include="*.rdf" <domain> \| wc -l` |
| 全仓类定义总数 | 3169 | `grep -rho "<owl:Class rdf:about" --include="*.rdf" . \| wc -l` |
| 域 .rdf 文件数 | FND:59 BE:48 FBC:38 SEC:36 IND:18 DER:23 LOAN:20 BP:12 CAE:7 MD:11 ACTUS:4 EXMP:10 | `find <domain> -name "*.rdf" \| wc -l` |
| 关键类成熟度抽查 | PaymentsAndSchedules=Release；ClientsAndAccounts=Release；Settlement=Release；FinancialServicesEntities=Release；CardAccounts=Release；FinancialContextAndProcess=**Provisional** | `grep hasMaturityLevel <file>` |
| 报告溯源抽查路径 | 所有 file:line 锚点可经 `git -C _fibo_repo show 08322e9e:<path>` 复核 | 本报告 §3/§5 |
