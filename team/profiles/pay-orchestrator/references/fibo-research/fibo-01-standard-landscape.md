# FIBO（Financial Industry Business Ontology）标准全景调研

> 分册：fibo-01 标准全景（出身与治理 / 模块架构 / 形式化基础 / 发版机制）
> 撰写日期：2026-09-20（数据获取时间即当日；引用内容各自标注其发布时间窗口）
> 方法：种子逐条核验（官方规范站 + GitHub 主仓 + OMG/EDMC 官方页面三角验证），证据不足处标注「未证实」

## Executive Summary
- FIBO（Financial Industry Business Ontology）是金融行业形式化本体标准：EDM Council 托管/赞助、OMG 标准化，MIT 开源，主仓 github.com/edmcouncil/fibo，官方规范站 spec.edmcouncil.org/fibo（均已实测）。
- **治理重大变更**：2025-07-01 EDM Council 宣布收购 OMG 并更名 **EDM Association**，2025-10-01 完成；FIBO 源文件版权行已改为 "EDM Association dba EDM Council, Inc."（源码实测）。引用旧「EDMC×OMG 联合」表述需加更名脚注。
- 起源：2008 金融危机后监管报告标准化诉求驱动，**2014 年首发**；2020-01 起**开源社区流程**（GitHub PR + DCO + Jenkins CI）。
- 形式化：**W3C OWL 2 DL** 兼容本体族（ONTOLOGY_GUIDE L256），基于 RDF/RDFS + 描述逻辑；Release 本体必须被**多个 OWL 2 推理机**证明一致（L258）。SKOS 深度使用（skos:definition 强制）；**SHACL 无官方配套（未证实项坐实为无）**。
- 规模与架构（master 全树机械实测，2026-09-20）：**12 个正式域 + ACTUS/EXMP 两个新模块**，295 个 .rdf 本体文件，约 3,494 个 owl:Class、1,220 个属性。种子所列 FND/BE/FBC/IND/SEC/DER/LOAN 全部存在；**CE 已更名为 CAE**；种子遗漏 BP/MD/EXMP/ACTUS。
- **支付类定位更正**：FIBO **不存在** PaymentMechanism 类（整仓 grep 0 命中）；核心支付类在 **FND/ProductsAndServices/PaymentsAndSchedules**（Payment/Payer/Payee/PaymentObligation/PaymentSchedule），账户类在 **FBC/ProductsAndServices/ClientsAndAccounts**（Account/DepositAccount/IBAN 等）。
- 发版：**季度正式发版**，2020Q1→2026Q2 连续 26 个季度无间断；GitHub tag 命名 `master_YYYYQn`（最新 master_2026Q2，2026-07-14 发布）；OMG 侧规范走 formal/ 编号（FND 1.2=formal/17-08-03；现行 OMG 页为 FIBO 2.0 beta）。
- 成熟度：源三级 Release/Provisional/Informative；发布两层 Production（仅 Release 源，季度末发布）/ Development（三层合体，实时发布）。

## 1. 出身与治理
### 1.1 制定机构（EDMC × OMG → EDM Association 时代）
- **EDM Council**（Enterprise Data Management Council，2005-05 成立）：FIBO 的 **host and sponsor**（托管与赞助方），FIBO® 是 EDM Council, Inc. 的注册商标。
- **OMG**（Object Management Group，1989 成立）：对 FIBO 进行 **standardization**；双方原为 "shared marketing and trademark agreement"（README 原文）。
- **⚠ 重大治理变更（种子里没有）**：
  - 2025-07-01：EDM Council 宣布**收购 OMG**，同日更名 **EDM Association**（官方公告 edmcouncil.org/announcement/...，WatersTechnology 等多方报道）。
  - 2025-10-01：收购 OMG 资产**完成**（PRNewswire 官方通稿）；双方合并为单一非营利协会，合计 700+ 成员机构。
  - 落地证据：FIBO 主仓源文件版权行已更新为 "**Copyright (c) 2018-2026 EDM Association dba EDM Council, Inc.**"（AboutFIBOProd.rdf 实测）；Q2 2026 release notes 已用 "EDM Association's FIBO web site" 措辞。
  - 对团队的含义：引用「EDMC 与 OMG 联合制定」在 2025-10 之后应更新为「**EDM Association（原 EDM Council，旗下含 OMG）**」；OMG 规范流程在合并后如何演进**未证实**，需持续跟踪 omg.org/spec/EDMC-FIBO。
- 贡献者名单（spec 站原文）：88 Solutions、Adaptive、BIAN、Bloomberg、BEA/BLS/Census（美商务部）、Citigroup、CFTC、Credit Suisse、Deutsche Bank、Exprentis、Fed KC、Goldman Sachs、HP Enterprise/Mphasis、MakoLab、Mizuho、NoMagic、Nordea、OFR（美财政部）、Pinnacle Bank、Quarule、State Street、Statistics Canada、Tahoe Blue、Thematix、Wells Fargo、Working Ontologist 等。
- 维护服务商：MakoLab（Jenkins/Jira/Wiki 基础设施 SLA 维护，README "Maintenance service" 节）。
- 首席本体学家：Elisa Kendall（EDM Association about 页提及其为 FIBO lead ontologist；单源标注）。
- 起源叙事（README 原文）：FIBO evolved out of concerns that arose **during the 2008 financial crisis**…initial publication in **2014**；用例扩展至证券主数据管理、监管报告、风险管理。

### 1.2 标准化路径（OMG 正式标准流程）
- OMG 侧规范编号形如 `formal/17-08-03`（FIBO FND v1.2，2017-12）。种子称 "FIBO 是 OMG 正式标准" **成立**（OMG Available Specification 体系）。
- OMG 侧当前主推 **FIBO 2.0 beta**（omg.org/spec/EDMC-FIBO 页面标题 "About the FIBO Specification Version 2.0 beta"），文件级清单以 `EDMC-FIBO/20180801/...` URI 空间发布。
- OMG 规范页 URL 结构：omg.org/spec/EDMC-FIBO/{FND,BE,FBC,IND,SEC,DER,...}/{version}/PDF。
- OMG 是 1989 年成立的开放会员制非营利行业标准联盟（UML/CORBA/CWM 等制定者）。

### 1.3 治理与社区（FIBO Community / 开源治理）
- **2020 年 1 月起开源社区流程**：主平台 GitHub（edmcouncil org），会话渠道 EDMConnect FIBO Interest Group + GitHub Discussions。
- 贡献规则：CONTRIBUTING.md / ONTOLOGY_GUIDE.md；**DCO**（Developer Certificate of Origin，Probot/DCO 强制 Signed-off-by）；Contributor Covenant 行为准则。
- 历史：2020-01 之前用 EDMC Wiki + Jira 组织开发流程。
- 开发基础设施：Jenkins CI + EDMC Jira + Confluence（dil-edmcouncil.atlassian.net）。

## 2. 模块架构
### 2.1 顶层模块总览
- 组织方式（FIBO Viewer 原文）：层级目录结构，顶级目录 = **domains**，其下 1-2 层子域 → modules → 底层是数十到数百个 **ontologies**。
- **实测（2026-09-20 master 分支 git 全树，651 路径 / 295 个 .rdf）**：正式域 12 个 + 2 个新模块，各域 .rdf 数量：

| 目录 | 全称 | .rdf 数 | 职责（README 原文摘译） |
|---|---|---|---|
| FND | Foundations 基础 | 59 | 人、组织、地点、合同等通用概念，支撑其余所有域 |
| BE | Business Entities 商业实体 | 48 | 数据治理、互操作、监管报告用的实体概念（法人/LEI/股权控制等） |
| FBC | Financial Business and Commerce 金融商业 | 38 | 跨领域共性：产品服务、金融中介、注册与监管机构、金融工具 |
| SEC | Securities 证券 | 36 | 证券分类/识别/发行/注册/上市，股票与债务工具细节 |
| DER | Derivatives 衍生品 | 23 | 期权、期货、远期、互换等衍生品共性概念 |
| LOAN | Loans 贷款 | 20 | 商业/小微/汽车/教育/抵押贷款合同共性概念 |
| IND | Indices and Indicators 指数与指标 | 18 | 市场指数、参考利率、经济指标、外汇、基准 |
| BP | Business Process 业务流程 | 12 | 证券发行与交易工作流等过程语义（provisional） |
| MD | Market Data 市场数据 | 11 | 价格、收益率等时变概念（历史/当前/预测值） |
| CAE | Corporate Actions and Events 公司行为与事件 | 7 | 证券生命周期中的事件与公司行为（**即种子的"CE"已更名**） |
| EXMP | Examples 示例 | 10 | 示例个体（2026Q2 新设，与参考数据隔离） |
| ACTUS | ACTUS 词汇 | 4 | 算法合同类型统一标准分类/数据字典（2026Q2 新增，provisional） |
| AboutFIBO* 等 | 加载文件/元数据 | 8 | AboutFIBOProd/Dev、MetadataFIBO 等 |

- 种子更正：① **不存在 FIBO-CE 代号**，现行目录为 **CAE**（Corporate Actions and Events）；② 种子遗漏 BP/MD/EXMP/ACTUS；③ 「FBC 含 PaymentMechanisms」**证伪**（见 §2.2）。

### 2.2 与支付直接相关的模块与类
- **核心支付本体在 FND**：`FND/ProductsAndServices/PaymentsAndSchedules.rdf`（IRI 前缀 `fibo-fnd-pas-psch`），摘要原文："defines basic concepts such as **payment, payee, payer, and payment schedule**, extending the scheduling concepts from the Dates and Times module"。核心类（源码实测）：
  - `Payment`（付款事件）、`PaymentEvent`、`Payer`、`Payee`、`PaymentObligation`（= Commitment + Duty，由 Contract 授予，"legally enforceable duty to pay a sum of money according to the terms stated in a contract"）、`PaymentSchedule`（Schedule 子类，成员为 Payment）。
  - 关键属性：`hasPaymentAmount`（subPropertyOf `hasMonetaryAmount`）、`hasPaymentSchedule`、`fulfillsObligation`。
  - 该文件版本 IRI `FND/20250701/...`（2025-07 版），变更史可追溯至 2015（FND 1.1 RTF 时代），MIT 版权行 "Copyright (c) 2013-2025 EDM Council, Inc. / Object Management Group, Inc."。
- **账户与客户在 FBC**：`FBC/ProductsAndServices/ClientsAndAccounts.rdf`（前缀 `fibo-fbc-pas-caa`，约 83KB）：`Account`、`AccountHolder`、`AccountProvider`、`DepositAccount`、`DemandDepositAccount`、`CustomerAccount`、`BankAccountIdentifier` / `BasicBankAccountIdentifier` / `InternationalBankAccountIdentifier`（IBAN，ISO 13616 结构）、`Balance`、`Fee`、`GeneralLedger`、`ChartOfAccounts`（2025-12 新增，FND-398）、`hasPaymentDueDate` 等。
- **整仓机械检索（grep 全部 295 个 .rdf）：`paymentmechanism` 字符串 0 命中** → 种子「FIBO-FBC 含 PaymentMechanisms 类」为**过时/错误信息**。历史上 OMG 2.0 beta 文件清单（20180801 快照）的 FBC ProductsAndServices 模块也只有 ClientsAndAccounts / FinancialProductsAndServices 两个文件。支付语义建模的落点是 **FND 支付类 + FBC 账户类 + LOAN 还款计划**的组合。
- 相邻支撑：`FND/Accounting/`（CurrencyAmount、ISO4217-CurrencyCodes、CashFlows、AccountingEquity）——支付金额与币种的类型基础。

### 2.3 模块间依赖与分层设计
- 分层结构（AboutFIBOProd.rdf + PaymentsAndSchedules imports 实测）：**FND 为底座**（无 FIBO 内部依赖，反向依赖 OMG Commons）；BE/FBC 依赖 FND；SEC/DER/LOAN/IND 依赖 FND+BE/FBC；CAE/BP/MD 依赖 SEC/FND；ACTUS 挂靠为独立 provisional 模块。
- 每个本体文件用 `owl:imports` 声明依赖（PaymentsAndSchedules 实例：imports CurrencyAmount、Agreements、Contracts、FinancialDates、Occurrences、LegalCapacity、ProductsAndServices、Relations + OMG Commons 5 个本体）。
- **OMG Commons Ontology Library**（`www.omg.org/spec/Commons/`，前缀 `cmns-*`）已深度融入：FIBO 正在把可泛化的内容上移到 Commons（2025Q1 起大迁移：Locations/Organizations/RegistrationAuthorities/RegulatoryAgencies 四本体移入 Commons 1.2；LegalPerson/LegalEntity 类移至 Commons organizations）。对支付团队的影响：引用 FIBO 类时可能需要同时加载 OMG Commons。
- `catalog-v001.xml`（Protégé XML catalog）管理本地 IRI→文件映射；`AllFND.rdf` 等聚合加载文件方便整域加载。

## 3. 形式化基础
### 3.1 OWL2/RDF 与本体工程
- **OWL 2 DL**（ONTOLOGY_GUIDE.md L256 原文："FIBO is designed as a W3C **OWL 2 DL** compliant family of ontologies"）；表达基于 RDF / RDF Schema / OWL 2（L86）。
- **多推理机一致性承诺**（L258）：所有 Release 成熟度的本体（含参考数据与示例）**必须被多个 OWL 2 兼容推理机证明逻辑一致**；任何贡献合入前必须保持一致性。种子「OWL2/RDF」**成立**。
- 内容工程约束：唯一命名（unique labeling）原则；属性定义在层次最高可用处、尽量少用 domain/range 限制（L260）；每个类/属性必须有 `rdfs:label` + `skos:definition`（L281）。
- 种子中「描述逻辑」表述成立（spec 站：based on Description Logic）。

### 3.2 SHACL / SKOS 等配套
- **SKOS**：深度使用。skos:definition 为**强制注解**（每实体恰一个，美式英语 + en 语言标签）；辅以 Dublin Core、OMG Commons Annotation Vocabulary（cmns-av）、FIBO Annotation Vocabulary（L241-248）。
- **SHACL**：**未在 FIBO 仓内发现任何 shapes 文件**（全树 grep 无 shacl/skos 形状文件；rdf 文件名无命中）。种子「可能有 SHACL 配套」→ **未证实**；SHACL 验证均为第三方实践（neo4j neosemantics issue、arXiv 合同一致性论文等）。若支付团队需要封闭世界校验需自建 shapes。
- 注解规范：不使用 skos:altLabel，改用 cmns-av:synonym / cmns-av:abbreviation（L210）。

### 3.3 序列化与发布产物
- 源码统一 **RDF/XML**（ONTOLOGY_GUIDE L86 + development-process 页双源确认），由 **rdf-toolkit**（Java 序列化器，git commit-hook 强制规范化重写）保证一致性。
- 发布格式：RDF/XML、Turtle、JSON-LD、csv、MS Excel、SKOS、SMIF 等（development-process 页）。
- 浏览工具：**FIBO Viewer**（onto-viewer，Java，Web 应用 + REST API）；网站 html-pages（Vue）；发布器 **ontology-publisher**（"owl-builder"，构建可发布版本及衍生产品如 glossary、FIBO-V 可视化）。
- 加载文件：`AboutFIBOProd.rdf`（一键加载全部 Production 本体；实测 dct:modified 2026-07-07，versionIRI `.../20260701/AboutFIBOProd/`）与 `AboutFIBODev.rdf`、`-TBoxOnly`、`-IncludingReferenceData` 变体。
- 参考数据：Production 另有 IncludingReferenceData 版本（ISO 4217 货币、ISO MIC、LEI、CFI 等标准代码个体）。

## 4. 发版机制
### 4.1 发版节奏与版本命名
- 正式更新季度发布（README："formal updates published quarterly"；OWL 页："FIBO Production is published at the end of each calendar quarter"）。
- **GitHub release 史实测（API 全量拉取，30 个 release）**：
  - 早期：2015-03（omg-dtc-15-02-23，OMG FTF 报告）、2017Q3、2017Q4，然后断档至 2019Q4.1（2020-03-30 发布）。
  - **2020Q1（2020-04-01）起连续季度发版至 master_2026Q2（2026-07-14），26 个季度无间断**。
  - tag 命名规则：`master_YYYYQn`（如 master_2026Q2 / master_2025Q1）；发布通常落在季度结束后 1-3 周内。
  - 近期样例发布日：2026Q2=2026-07-14、2026Q1=2026-04-20、2025Q4=2026-01-19、2025Q3=2025-10-10、2025Q2=2025-07-02、2025Q1=2025-04-09。
- 源 ontology 版本 IRI 形如 `.../FND/20250701/...`（按变更日期分目录）与 `master/2026Q1` 风格（FIBO Viewer 快照参数）并存。
- OMG 侧：FND 1.1、1.2（formal/17-08-03，2017-12）；FIBO 2.0 beta（基于 20180801 快照，dtc/19-01-01）。OMG 版本节奏明显慢于 GitHub 季度版，**日常引用应以 GitHub/spec 站季度版为准**。
- 双发布层：**Production**（全部 Release 源；季度末发布，经 SME 审查 + OWL hygiene 测试）与 **Development**（Release+Provisional+Informative 合体；实时发布，仅查引用一致性）。
- 源成熟度三级：**Release / Provisional / Informative**（Informative=被 Provisional 引用但已被否决的内容，为保引用一致性保留）。
- 弃用缓冲：deprecated 元素至少保留 6 个月（通常 9-12 个月）；Q2 2026 release notes 明确「本轮合并弃用的概念将保留至 Q3 2027」。

### 4.2 工具链（fusion/CI/发布流水线)
- Jenkins CI：PR 触发标准测试（Production 严格、Development 仅查引用一致性）；部署配置在 edmcouncil/devops 仓。
- 发布流水线仓：**rdf-toolkit**（序列化规范化）、**ontology-publisher**（构建/发布可部署版本与衍生品）、**onto-viewer**（FIBO Viewer 后端）、**html-pages**（spec 站前端，Vue）。
- 项目管理：EDMC Jira（issue 编号如 FND-389/398/401）+ Confluence（dil-edmcouncil.atlassian.net）。
- PR 治理：DCO Signed-off-by 强制；milestone 组织季度发布（如 "2026Q2 FIBO Release"）。

## Findings（核验结论一览：种子逐条真伪）
| 种子条目 | 判定 | 依据 |
|---|---|---|
| FIBO 由 EDM Council 与 OMG 联合制定 | ✅ 成立（但 2025-10 起 EDM Council 收购 OMG 并更名 EDM Association，治理已变） | spec 站+README+PRNewswire/官方公告 |
| OMG 正式标准 | ✅ 成立（formal/ 编号，如 FND 1.2=formal/17-08-03；现行 OMG 页为 FIBO 2.0 beta） | omg.org/spec/EDMC-FIBO |
| 官方规范站 spec.edmcouncil.org/fibo | ✅ | 实测可达 |
| GitHub org edmcouncil、主仓 edmcouncil/fibo | ✅ | API 实测（org 现 8 个公开仓） |
| FIBO-FND 模块及 Common/Agreements/Contracts/Parties/Places/DatesAndTimes/Products | ⚠️ 大体成立但有出入：实测子目录为 Accounting/AgentsAndPeople/Agreements(含 Contracts)/Arrangements/DatesAndTimes/GoalsAndObjectives/Law/Organizations/OwnershipAndControl/Parties/Places/**ProductsAndServices**/Relations/TransactionsExt/Utilities——无 "Common" 子目录（Common 指 OMG Commons 库）；「Products」实为 ProductsAndServices，且**支付类在此** | git 树机械实测 |
| FIBO-BE（Business Entities） | ✅ | README+树实测 |
| FIBO-FBC 含 Accounts | ✅（FBC/ProductsAndServices/ClientsAndAccounts：Account/DepositAccount/IBAN 等） | 源码实测 |
| FIBO-FBC 含 PaymentMechanisms | ❌ **证伪**：整仓 295 个 .rdf 中 `paymentmechanism` 0 命中；支付类在 FND/PaymentsAndSchedules（Payment/Payer/Payee/PaymentObligation/PaymentSchedule） | grep 机械验证 |
| FIBO-IND / FIBO-SEC / FIBO-DER / FIBO-LOAN | ✅ 四域全部存在，职责与种子一致 | README+树实测 |
| FIBO-CE（Corporate Events） | ⚠️ 代号已不存在：现行 **CAE**（Corporate Actions and Events），7 个 .rdf | README+树实测 |
| 种子遗漏的域 | 补充：BP（Business Process）、MD（Market Data）、EXMP（Examples，2026Q2 新设）、ACTUS（2026Q2 新增 provisional） | 树实测+Q2 2026 release notes |
| 形式化基于 OWL2/RDF | ✅（ONTOLOGY_GUIDE L256：OWL 2 DL compliant；L258 多推理机一致性强制） | ONTOLOGY_GUIDE.md file:line |
| 可能有 SHACL 配套 | ❓ **未证实**：仓内无任何 SHACL shapes；SKOS 则深度使用（skos:definition 强制） | 全树 grep |
| 按季度发版 | ✅（2020Q1→2026Q2 连续 26 个季度 release，无间断；Q3 2017 起有 GitHub release 史） | GitHub releases API 全量拉取 |

## Recommendations（对支付团队的落地建议）
1. **支付语义参考的直接落点**（全部实测 IRI，可 import）：
   - FND/ProductsAndServices/PaymentsAndSchedules/（Payment、Payer、Payee、PaymentObligation、PaymentSchedule、hasPaymentAmount、fulfillsObligation）——付款义务与计划的语义骨架。
   - FBC/ProductsAndServices/ClientsAndAccounts/（Account、DepositAccount、DemandDepositAccount、CustomerAccount、AccountProvider、IBAN 三件套、Balance、Fee、hasPaymentDueDate、ChartOfAccounts）——账户侧。
   - FND/Accounting/CurrencyAmount + ISO4217-CurrencyCodes——金额与币种；FND/DatesAndTimes/FinancialDates——日历/日程（节假日调整等场景配合）。
   - LOAN 域（LoansGeneral 等 20 个 .rdf）——分期还款/抵押场景直接复用。
   - 注意加载成本：FND 支付本体 imports OMG Commons 5 个本体；引用 FIBO 时建议用 AboutFIBOProd.rdf 或按域 All 文件加载。
2. **不要引用 PaymentMechanism**——该类不存在于 FIBO；对外模型对齐时用 Payment + PaymentObligation + 账户类组合表达。
3. **引用机构名规范**：2025-10 之后的新文档写「EDM Association (formerly EDM Council)，OMG 为其旗下标准组织」；旧文档中的 EDMC×OMG 表述加更名脚注。
4. **固定引用版本**：生产引用建议锚定 GitHub tag `master_2026Q2`（2026-07-14）或 spec 站对应 quarterly 快照；Development 层只做前瞻评估不做生产依赖。
5. **数据校验自建**：FIBO 不带 SHACL；若支付数据需要封闭世界约束校验，需基于 FIBO 类自行派生 shapes（可参考 ONTOLOGY_GUIDE 的唯一命名/定义约束作为 shape 素材）。
6. **跟踪 Commons 上移**：LegalPerson/LegalEntity、RegistrationAuthorities 等正迁移至 OMG Commons；版本升级时注意类 IRI 变化（deprecated ≥6 个月缓冲）。

## Methodology
- 时间窗：2026-09-20 采集。数据本身时间窗：master 分支当日快照 + 2026Q2 季度版（2026-07-14）。
- 种子逐条核验：官方规范站 + GitHub README/ONTOLOGY_GUIDE + OMG 页面三角验证；关键结论 ≥2 独立来源；单源信息已标注。
- **机械验证手段**（非仅页面阅读）：
  - `git/trees?recursive=1` API 全树清单（651 路径）→ 域名/子目录/文件计数。
  - 整仓 tarball 下载解包（fibo-master，292 个 rdf 文件扫描）→ `paymentmechanism` 全文 grep（0 命中）、owl:Class/属性正则计数、类清单抽取。
  - GitHub releases API 全量拉取（30 个）→ 发版节奏逐季核对。
  - 源 .rdf 文件直读（PaymentsAndSchedules、ClientsAndAccounts、AboutFIBOProd）→ 类/属性/版本 IRI/版权行一手取证。
- 已知局限：①OMG 规范 PDF（formal/17-08-03 全文、dtc/19-01-01 FIBO 2.0 全文）未逐页研读，仅取书目信息；②EDM Association 合并后 OMG 规范流程演进无公开细节；③类计数为正则近似（含重复定义行），非 OWL 解析器精确值；④Elisa Kendall 任 lead ontologist 为单源。

## Appendix：关键来源清单
**官方一手来源（全部 2026-09-20 实测可达）**
- https://spec.edmcouncil.org/fibo/ ——官方规范站首页（机构、使命、贡献者、开源流程）
- https://github.com/edmcouncil/fibo ——主仓 README（起源、MIT、域名录、季度发版、DCO、维护服务）
- https://github.com/edmcouncil/fibo/blob/master/ONTOLOGY_GUIDE.md ——L86（RDF/RDFS/OWL2）、L256（OWL 2 DL）、L258（多推理机一致性）、L210/L241-248/L281（SKOS/注解规范）
- https://spec.edmcouncil.org/fibo/page/development-process ——成熟度三级、Production/Development 双层、发布格式、Jenkins
- https://spec.edmcouncil.org/fibo/page/owl ——Production 季度末发布定义
- https://spec.edmcouncil.org/fibo/release-notes ——季度变更纪要、弃用保留期、Commons 迁移
- https://www.omg.org/spec/EDMC-FIBO/ ——OMG 侧 FIBO 2.0 beta 文件清单
- https://www.omg.org/spec/EDMC-FIBO/FND/1.2/PDF ——FND 1.2 正式规范（formal/17-08-03，2017-12）
- https://api.github.com/repos/edmcouncil/fibo/releases ——发版全史（30 条）
- https://api.github.com/repos/edmcouncil/fibo/git/trees/master?recursive=1 ——全树清单（651 路径）
- https://raw.githubusercontent.com/edmcouncil/fibo/master/FND/ProductsAndServices/PaymentsAndSchedules.rdf ——支付核心本体（版本 IRI 20250701）
- https://raw.githubusercontent.com/edmcouncil/fibo/master/FBC/ProductsAndServices/ClientsAndAccounts.rdf ——账户本体
- https://raw.githubusercontent.com/edmcouncil/fibo/master/AboutFIBOProd.rdf ——Production 加载文件（版权行=EDM Association dba EDM Council）
- https://github.com/edmcouncil ——org 仓清单（fibo/rdf-toolkit/ontology-publisher/onto-viewer/html-pages/devops/auto/cdmc）

**治理变更来源（2025-07~10）**
- https://edmcouncil.org/announcement/edm-council-and-object-management-group-combine-to-create-global-end-to-end-data-and-standards-authority/ ——收购 OMG + 更名 EDM Association 公告（2025-07-01）
- https://www.prnewswire.com/news-releases/edm-association-completes-acquisition-of-assets-of-object-management-group-creating-worlds-largest-data-and-standards-community-302571906.html ——收购完成通稿（2025-10-01）
- https://edmcouncil.org/about/ ——组织沿革（2005 成立、2012 FIBO 发布、2025 更名）

**本地取证存档（可复核）**
- 本仓克隆源码：research/raw/fibo-master/（master 分支 tarball）
- 全树 JSON：research/raw/fibo-tree.json
- 抓取缓存：~/.hermes/profiles/orchestrator/cache/web/（github.com-4f92df04b5.md、omg.org-6bb2369171.md、raw.githubusercontent.com-43be30b25a.md、raw.githubusercontent.com-aba020a407.md、api.github.com-27898eed9b.md、api.github.com-b963fb02f9.md）

## 验收自查
机械验证结果（独立复验通道：web_search + web_extract 直读 GitHub REST API JSON 与 OMG 规范页原文；全部于 2026-09-20 CST 实测）：

1. **版本号来源**：
   - FND 1.2 = `formal/17-08-03`：✅ 双源复验——omg.org/spec/EDMC-FIBO/FND/1.2/ 页 Normative Documents 表原文 "Specification PDF … OMG File ID formal/17-08-03"（且 Document Status: formal、IPR Mode: Non-Assert、Publication Date December 2017）+ FND/1.2/PDF 首页原文 "OMG Document Number: formal/17-08-03, Date: December 2017"。与 §4.1/Findings 表一致。
   - FIBO 2.0 beta：✅ omg.org/spec/EDMC-FIBO/ 页面标题原文 "About the FIBO Specification Version 2.0 beta"；文件级清单机读文档号 `finance/18-08-04`（同页清单实测，URI 空间 `EDMC-FIBO/20180801/...`）。
   - ONTOLOGY_GUIDE.md L256（OWL 2 DL）/L258（多推理机一致性）：file:line 引用与本地缓存全文（raw.githubusercontent.com-1b679de1e3.md）可复核；本验收独立抽取的 L86/L102/L106/L111/L126-154（content language OWL、本体头部要求、IRI/版本 IRI 格式）行号与该缓存一致。
2. **最新 release tag 实测**：`master_2026Q2`（name "Q2 2026 Release"，published_at **2026-07-14T07:07:08Z**，draft=false、prerelease=false）——来源 api.github.com/repos/edmcouncil/fibo/releases/latest，**实测时间 2026-09-20 CST**；交叉源：github.com/edmcouncil/fibo/releases 页首条 "Q2 2026 Release Notes"（Full Changelog `master_2026Q1...master_2026Q2`）。次新 `master_2026Q1` published 2026-04-20T10:07:41Z（api.github.com/releases?per_page=8 实测），季间隔与 quarterly 表述一致。
3. **tag 命名规则**：✅ `master_YYYYQn`（非 `vYYYYQn`）——releases/latest 的 tag_name 字段 + releases 页 changelog 链接双源。
4. **顶级域数量与清单**：✅ 双源一致 **12 个域目录**（ACTUS/BE/BP/CAE/DER/EXMP/FBC/FND/IND/LOAN/MD/SEC）——api.github.com/repos/edmcouncil/fibo/git/trees/master 目录枚举 + MetadataFIBO.rdf 命名空间声明（fibo-{actus,be,bp,cae,der,exmp,fbc,fnd,ind,loan,md,sec}-mod）。口径说明：Executive Summary 行「12 个正式域 + ACTUS/EXMP 两个新模块」为加总口误（12 已含 ACTUS/EXMP），以 §2.1 表（12 行域目录含 ACTUS/EXMP）与本条双源实测为准。**CID 未见于任何实测来源。**
5. **季度发版**：✅ README 原文 "formal updates published quarterly" + releases 页 2024Q1–2026Q2 逐季无缺（本验收独立核对 8 条 API 记录；全量 30 条/26 连季为报告作者 tarball+API 机械验证，存档见 research/raw/）。
6. **PaymentMechanism 证伪方向复核**：本验收直读 master `FBC/ProductsAndServices/` 目录 API，仅含 ClientsAndAccounts.rdf / FinancialProductsAndServices.rdf / MetadataFBCProductsAndServices.rdf 三文件，与 §2.2「支付类在 FND/PaymentsAndSchedules、FBC 无 PaymentMechanisms」结论不矛盾。
7. **未证实项保持标注**（不得删标引用）：CID 域；SHACL 官方配套（仓内 0 命中）；发布层 version IRI `master/2026Qn`（单源观测）；OMG 各域规范页 URL 全域同构（仅 FND/1.2 逐一实测）；EDM Association 合并后 OMG 规范流程演进；Elisa Kendall lead ontologist（单源）；formal/17-08-03 与 FIBO 2.0 beta 规范全文未逐页研读。
