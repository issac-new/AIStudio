# FIBO 深调研与语义门索引实锚校准

- 日期:2026-10-21
- 分支:`feat/fibo-ontology-calibration`(overlay 仓)
- 触发:用户指令「深入调研 https://github.com/edmcouncil/fibo 完善本体相关内容」
- 一句话:把 qgate 语义门的 `fibo-mini.json` 从「名义 FIBO」(12 概念、零 IRI 锚点、两条工程近似混标为 FIBO)校准为「实锚 FIBO」(18 概念、每概念真实 IRI 与定义原文、无对应类者如实标注),provider 接口加可选 `iri` 字段,测试同步升级。

## 1. 调研结论(全部实测锚)

### 1.1 版本与治理

- 最新版:**master_2026Q3,2026-10-20 发布**(GitHub releases 实测)——新增数字资产与 DTI(ISO 24165)、ACTUS 分类法受控词汇、OECD 养老金本体、季度 ISO MIC 更新。
- 季度发版制:2020Q1→2026Q3 连续 27 个季度;MIT 许可;EDM Council 主办(2025 年收购 OMG 后更名 EDM Association)。
- 开发约定(ONTOLOGY_GUIDE.md 实测):IRI 模式 `https://spec.edmcouncil.org/fibo/ontology/<域>/<模块>/<本体>/<资源>`;定义一律 `skos:definition`(禁 `rdfs:comment`)、ISO 704 属+种差结构;标签全局唯一;成熟度三级 Release/Provisional/Informative;21 类 SPARQL hygiene 测试 CI 门。

### 1.2 架构关键变化(影响引用方式)

**FIBO 基础概念已大量迁移到 OMG Commons(cmns- 前缀)**:Party、Identifier、Situation 等真身在 `https://www.omg.org/spec/Commons/...`,FIBO 本体文件里只剩补充(如 FND/Parties/Parties.rdf 只定义 PartyRoleIdentifier/TaxIdentifier)。引用时必须区分 fibo- 与 cmns- 两个命名空间,「FIBO 全自带」是过时认知。

### 1.3 12 概念锚点核实(校准依据)

| 原概念 | 真锚 | 实测发现 |
|---|---|---|
| Payment | `fibo-fnd-pas-psch:Payment`(FND/ProductsAndServices/PaymentsAndSchedules,Release) | 定义 "delivery of money in fulfillment of an obligation, such as to satisfy a claim or debt";父类 Occurrence |
| Account | `fibo-fbc-pas-caa:Account`(FBC/ProductsAndServices/ClientsAndAccounts,Release,versionIRI 20261001) | 定义 "container for records associated with a business arrangement for regular transactions and services";父类 FinancialRecord——**账户是记录容器,不是资金容器** |
| Party | `cmns-pts:Party`(OMG Commons) | 定义 "person or organization";父类 Agent;FIBO 内已无此定义 |
| Transaction | **FIBO 无此类**;最接近 `fibo-fnd-pas-pas:TransactionEvent` | 定义 "any sale, assignment, lease, license, loan, advance, contribution, or other transfer of any interest...";父类 OccurrenceKind |
| Obligation | 双锚 `fibo-fnd-law-lcap:Duty` + `fibo-fnd-agr-agr:Commitment` | Duty="some obligation which exists and is imposed on some individual";Commitment="promise made by some party to act or refrain from acting";PaymentObligation=二者交叉 |
| Identifier | `cmns-id:Identifier`(OMG Commons) | 定义 "sequence of characters uniquely identifying that with which it is associated";父类 Designation |
| MonetaryAmount | `fibo-fnd-acc-cur:MonetaryAmount` | "measure that is an amount of money specified in monetary units";父类 ScalarQuantityValue |
| Currency | `fibo-fnd-acc-cur:Currency` | "medium of exchange value, defined by reference to the geographical location of the monetary authorities responsible for it";父类 MeasurementUnit |
| Status | **无裸 Status 类**;真身 `fibo-fnd-arr-lif:LifecycleStatus` | "classifier indicating the position or state of something at a particular point in its life-cycle" |
| Authorization | **FIBO 无对应类**(code search 实测:4 处命中全是 Commons BusinessAuthorizations 的 import 声明) | 近邻=OMG Commons BusinessAuthorizations(cmns-bauth),与支付预授权语义不同源 |
| Capture | **FIBO 无对应类**(全仓 0 命中) | 卡支付 API 术语(授权-扣款-结算三部曲),FIBO 不建模 PSP 流水线 |
| Settlement | `fibo-fbc-fi-stl:Settlement`(FBC/FinancialInstruments/Settlement) | "act of finalizing a transaction, including but not limited to finalizing accounting, exchanging consideration, and/or legally recording documents" |

### 1.4 新增 6 概念(支付域高频歧义对,全部实锚)

Payer/Payee(PartyRole 级角色,勿与主体混)、PaymentObligation(义务≠履行,与 Payment 构成最强歧义对)、PaymentEvent(事件类目≠事件实例)、Balance(时点净额,MonetaryAmount 子类)、Contract(协议文本层)。

## 2. 决策记录

1. **校准而非重造**:12 个既有概念 id 全部保留(测试与下游映射兼容),只校准 definition/iri/source 与 distinctFrom 语义——最小破坏面。
2. **Authorization/Capture 保留概念但如实标注**:语义门的支付域歧义检测(captured vs settled)是真实需求,FIBO 无类不妨碍工程近似,但 `source` 从 "FIBO" 改为 "engineering-approximation",`iri` 留空——「无锚不冒充有锚」。
3. **iri 字段可选**:provider 接口 `OntologyConcept` 加 `iri?: string`,IndexFileProvider 透传不校验——零破坏扩展;executor 不消费该字段(仅审计/展示)。
4. **概念数 12→18**:新增 6 概念全部来自 PaymentsAndSchedules/ClientsAndAccounts/Agreements 三个 Release 级本体;测试断言 `concepts.length` 同步改 18 并新增 iri 抽查断言。
5. **constraints 不动**:现有 3 条表达式是工程不变量(refund≤captured 等),由 persistence 门执行侧落地,与 FIBO 校准正交。
6. **不引入运行时 RDF**:维持 OD-004 决策(预处理索引,不做 RDF/OWL 运行时推理);本次只是让预处理索引的来源真实化。

## 3. 改动清单

- `custom/qgate/gate-packs/ontology/data/fibo-mini.json`:重写(18 概念+iri+版本锚)
- `custom/qgate/src/ontology/provider.ts`:`OntologyConcept` 加 `iri?: string`
- `custom/qgate/__tests__/qgate-p5-p9.test.ts`:概念数断言 12→18+iri 断言
- `custom/qgate/README.md`:ontology 节补 FIBO 版本锚与 Commons 架构说明

## 4. 验证

- `cd custom/qgate && npm test`(vitest run __tests__)全绿
- 既有测试依赖面:`fibo-payment` id、`fibo-capture.distinctFrom ∋ fibo-settlement` 两断言保持不变
