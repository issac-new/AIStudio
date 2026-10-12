# FIBO（金融行业业务本体）框架知识

> 分册定位: pay-kb 的 FIBO 单一事实源——三个调研分册的框架综述 + worker 引用路由
> 调研日期: 2026-09-20（当日实测快照；版本/数字以各分册「验收自查」节为准）
> 分册全文: 本目录 `fibo-01-standard-landscape.md` / `fibo-02-pay-domain-application.md` / `fibo-03-engineering-opensource.md`
> 引用纪律: 版本号/类名/路径一律回查分册原文锚点，禁止凭记忆转写

---

## 一、FIBO 是什么（30 秒版）

FIBO = Financial Industry Business Ontology，金融行业的**形式化业务本体标准**：
用 W3C OWL 2（描述逻辑）把「金融业务概念及其逻辑关系」建模为机器可读、可推理的知识图谱 Schema。

- **谁管**: EDM Council（2025-07 宣布收购 OMG 并更名 **EDM Association**，2025-10 完成——引用旧「EDMC×OMG 联合」表述需加更名脚注）
- **什么形态**: MIT 开源，主仓 github.com/edmcouncil/fibo，官方规范站 spec.edmcouncil.org/fibo
- **怎么发版**: 季度正式发版（2020Q1→2026Q2 连续 26 个季度无间断），tag 命名 `master_YYYYQn`，最新 **master_2026Q2**（2026-07-14 发布，双源实测）
- **规模**: 12 个正式域 + ACTUS/EXMP 两个新模块，295 个 .rdf 本体文件，约 3,494 个 owl:Class / 1,220 个属性
- **成熟度**: 源码三级 Release/Provisional/Informative；发布两层 Production（仅 Release 源）/ Development（三层合体）

## 二、12 个域一览（.rdf 数为 2026-09-20 master 全树实测）

| 域 | 全称 | .rdf | 与支付团队的相关度 |
|----|------|------|--------------------|
| FND | Foundations 基础 | 59 | ★★★ **核心支付本体在此**: `FND/ProductsAndServices/PaymentsAndSchedules.rdf`（Payment/Payer/Payee/PaymentObligation/PaymentSchedule）；另有 Accounting/（CurrencyAmount、ISO4217 币种） |
| FBC | Financial Business and Commerce | 38 | ★★★ **账户侧**: `FBC/ProductsAndServices/ClientsAndAccounts.rdf`（Account/DepositAccount/DemandDepositAccount/IBAN/Balance/Fee/GeneralLedger） |
| LOAN | Loans 贷款 | 20 | ★★ 还款计划；`PaymentCard/CardAccount` 在 `LOAN/LoansSpecific/CardAccounts.rdf`（注意: 卡片建模为 LegalDocument 子类，语义有争议） |
| BP | Business Process | 12 | ★★ ClearingAndSettlement 流程语境（provisional） |
| IND | Indices and Indicators | 18 | ★★ 参考利率/外汇/基准——汇率与定价语义 |
| BE | Business Entities | 48 | ★★ 法人/LEI/股权控制——主体识别（GLEIF 关系） |
| SEC / DER / CAE / MD | 证券/衍生品/公司行为/市场数据 | 36/23/7/11 | ★ 结算/公司行为付款义务（CAE 的 CorporateActionPaymentObligation）等外围语义 |
| ACTUS / EXMP | 算法合同分类 / 示例 | 4/10 | ☆ 2026Q2 新增，观察项 |

## 三、支付团队最需要知道的三件事

1. **FIBO 有支付语义，但支付不是独立域**。全仓 `payment`（整词忽略大小写）458 处命中，分散在 FND（支付事件/义务/计划）、FBC（账户）、BP（清结算流程）、LOAN（卡与还款）——与 ISO 20022 把 Payments 作为独立业务域形成结构性反差。ISO 20022 回答「一次支付指令怎么发」（报文导向），FIBO 回答「支付这件事在业务上是什么」（业务本体导向），二者互补而非竞争。
2. **账号转账/数字货币覆盖是空白**。`CashTransfer` 0 命中、`CreditTransfer` 0 命中、无 e-money/CBDC 支付工具本体——借用 FIBO 建模中国支付场景时这些概念需自行扩展（与网联/银联报文要素之间**不存在公开映射资产**，检索无命中）。
3. **工程上可直接消费**。rdflib 从 `AboutFIBOProd.rdf` 出发加载 production 闭包实测通过: 154 文件 / 117,312 三元组 / 2.8 秒 / 2,525 个 owl:Class（本机 2026-09-20 实测，方法与踩坑见分册 03 §5）。

## 四、与相邻标准的关系

| 标准 | 关系 | 证据 |
|------|------|------|
| ISO 20022 | 互补（报文 vs 业务本体）；FIBO 无 ISO 20022 组件一一对应类 | 分册 02 §6 |
| LEI / GLEIF | GLEIF 官方本体（L1/L2）建在 FIBO 基础层之上（gleif.org/ontology 实测） | 分册 02 §5 |
| 网联/银联规范 | 无公开映射资产（检索 0 命中） | 分册 02 §6.3 |
| OMG 正式规范 | formal/ 编号（FND 1.2=formal/17-08-03）；现行 OMG 页 FIBO 2.0 beta；日常引用以 GitHub 季度版为准 | 分册 01 §4 |

## 五、批评与适用性边界（引用前必读）

- 社区/学术侧批评: 采用率有限、OWL 推理门槛高、体量大加载慢（详见分册 02 §8）。
- **推理可行性硬边界（EDMC 内部实测，分量最重）**: 全量 FIBO 一致性检查 Hermit 4 天未跑完、Pellet 2 天、Konclude 报错退出（48 vCPU/89GB 环境）——无一款主流 DL 推理机可支撑（分册 02 §8）。**任何基于 OWL 推理的实时链路设计（自动报文映射/实时合规推理）判不可行**；可行形态是「rdflib/SPARQL 查询 + 图数据库装载」（分册 03 §5-§7）。
- 中国支付体系借鉴点: **不是**拿来建交易系统，而是作为「合规语义层/产品目录/跨机构对账口径」的候选 Schema；对支付产品语义、清结算业务概念（清分/结算/在途）只覆盖部分，需中文域扩展。哪些是分析推断、哪些是实测事实，以分册 02 的证据分级标注为准。

## 六、worker 引用路由

| worker | 用途 | 锚点 |
|--------|------|------|
| pay-fintech（合规语义层） | 监管概念形式化、LEI 主体识别、合规规则表达候选 | `fibo-research/fibo-02-pay-domain-application.md`（§4 采用/§5 GLEIF/§8 批评）+ `fibo-research/fibo-01-standard-landscape.md`（§1 治理） |
| pay-clearing（清算账务建模） | 清结算概念对照（ClearingAndSettlement 语境/账户/对账语义缺口） | `fibo-research/fibo-02-pay-domain-application.md`（§3 类级证据）+ `fibo-research/fibo-03-engineering-opensource.md`（§5 实操） |
| pay-infra（报文与本体映射） | ISO 20022↔FIBO 关系、报文要素→本体类映射可行性、工程接入 | `fibo-research/fibo-03-engineering-opensource.md`（§2 仓库/§5 rdflib/§7 平台）+ `fibo-research/fibo-02-pay-domain-application.md`（§6 ISO 20022） |

> 检索示例: `grep -rn "PaymentObligation" ~/.hermes/profiles/pay-orchestrator/references/fibo-research/`

## 七、已知勘误与更名（防旧引用）

- 种子/旧资料说「FIBO-FBC 含 PaymentMechanisms」→ **证伪**（整仓 grep 0 命中）；支付类在 FND/PaymentsAndSchedules。
- 种子/旧资料说「FIBO-CE」→ 现行目录为 **CAE**（Corporate Actions and Events）。
- 2025-10 起「EDM Council × OMG 联合制定」→ 应表述为「**EDM Association**（原 EDM Council，旗下含 OMG）」。
- GitHub tag 不是 `vYYYYQn` 而是 **`master_YYYYQn`**。
- 种子说「FND 有 Common 子目录」→ 证伪；现行是 **Commons**（OMG Commons 库，`cmns-*` 文件名，2025Q1 起大迁移，闭包加载必须含它）。
