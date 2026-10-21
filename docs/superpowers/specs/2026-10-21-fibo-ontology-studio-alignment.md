# FIBO 金融域映射层：让本体术语带真实 IRI 与出处

- 日期：2026-10-21
- 分支：`feat/fibo-ontology-studio`（overlay 仓）
- 触发：用户要求深入调研 FIBO，完善 SwarmStudio 的本体术语与工作台能力
- 一句话：Ontology Studio 新增 FIBO 金融域映射包。36 个概念逐条带真实 IRI、英文原定义、模块版本与成熟度。导入采用增量合并，版本可回滚。

## 结论

FIBO 可以接，前提是每个术语都能回答三个问题。IRI 是什么、定义原文是什么、来自哪个模块的哪个版本。本轮把这三问答进了数据模型，没有写进注释。

三件事已经落地。模型层增加了显式 IRI 与出处字段。实体类型、对象属性、数据属性都可以填。原有单一 namespace 的种子本体不受影响。数据层内置 36 个概念、21 个对象属性、16 条公理的 FIBO 金融域包，覆盖支付、账户、结算三个域。交互层在本体工作台新增 FIBO 页签，可查看目录并一键增量导入。

验证结果：本体域 10 个测试文件、87 个用例全部通过。其中新增 FIBO 专项 16 个。

## 调研结论

### 版本与许可

FIBO 最新发布为 `master_2026Q3`，2026-10-20 发布，MIT 许可。仓库含 10 个业务域、296 个 RDF 模块。业务域为 BE、BP、CAE、DER、FBC、FND、IND、LOAN、MD、SEC。另有 ACTUS、EXMP、etc 三个辅助目录。

### IRI 与定义规则

FIBO 的非版本 IRI 形如：

`https://spec.edmcouncil.org/fibo/ontology/<域>/<模块>/.../<本体>/<资源>`

版本 IRI 把域后的路径换成发布日期，例如 `FND/20250701/ProductsAndServices/PaymentsAndSchedules/`。类名用大驼峰、单数。属性名用小驼峰、动词开头。每个类必须有 `skos:definition`，定义采用 ISO 704 的「属 + 种差」结构，不使用 `rdfs:comment`。成熟度分 Release、Provisional、Informative 三档。

这些规则直接决定了本轮的校验方式。IRI 必须落在其声明模块的 base 下。定义必须保留英文原文。成熟度必须随概念显示。

### 本项目直接使用的 12 个实锚

| 概念 | IRI 末段 | 模块与版本 | 成熟度 | 定义要点 |
|---|---|---|---|---|
| Payment | `.../PaymentsAndSchedules/Payment` | FND / 20250701 | Release | 为履行义务交付货币 |
| PaymentObligation | `.../PaymentsAndSchedules/PaymentObligation` | FND / 20250701 | Release | 按合同条款付款的可强制执行义务 |
| PaymentEvent | `.../PaymentsAndSchedules/PaymentEvent` | FND / 20250701 | Release | 涉及付款的事件 |
| MonetaryAmount | `.../CurrencyAmount/MonetaryAmount` | FND / 20260701 | Release | 以货币单位表示的金额 |
| Currency | `.../CurrencyAmount/Currency` | FND / 20260701 | Release | 交换价值媒介 |
| Account | `.../ClientsAndAccounts/Account` | FBC / 20261001 | Release | 交易与服务的记录容器 |
| IndividualTransaction | `.../ClientsAndAccounts/IndividualTransaction` | FBC / 20261001 | Release | 有货币影响并记入账户的事件 |
| Balance | `.../ClientsAndAccounts/Balance` | FBC / 20261001 | Release | 可用或应付金额 |
| Settlement | `.../Settlement/Settlement` | FBC / 20250301 | Release | 完成交易的行为 |
| SettlementEvent | `.../Settlement/SettlementEvent` | FBC / 20250301 | Release | 结算类目的实际发生 |
| Contract | `.../Contracts/Contract` | FND / 20260601 | Release | 各方同意受法律约束的协议 |
| MarketTransaction | `.../MarketTransactions/MarketTransaction` | FND / 无版本 IRI | Informative | 有本金方与对手方的市场交易 |

### 四个必须纠正的认知

**Settlement 是事件，不是金额状态。** FIBO 把 Settlement 定义为 `ContractLifecycleEvent` 的子类。SettlementEvent 是它的实际发生。把 `settled` 当成「扣款完成后的金额状态」，在 FIBO 语境里找不到锚点。本轮在包里保留这条区分，并用本地公理声明 Capture 与 SettlementEvent 不相交。

**Authorization 与 Capture 在 FIBO 里没有对应类。** 本轮下载的 7 个核心模块中，这两个名字没有 `owl:Class` 定义。FIBO 的 296 个 RDF 模块路径与类名清单里也没有对应模块。CardAccounts 模块只有一处 `authorizes`，出现在 `CreditCardNetwork` 的文字定义里，不是类。它们是 ISO 8583 与支付服务商流水线的概念。本轮把它们标为 `local-extension`，IRI 落在本工作台命名空间。

**FIBO 没有裸 Transaction 和裸 Status。** 最接近交易的概念是 `MarketTransaction`，成熟度只有 Informative。账户流水的单笔事件叫 `IndividualTransaction`。最接近状态的概念是 `LifecycleStatus`。本轮用这三个概念替代原来的 `Transaction` 与 `Status`。

**Party 与 Identifier 已经迁到 OMG Commons。** 它们的真身在 `https://www.omg.org/spec/Commons/...`。FIBO 模块只保留角色与标识的子类。本轮把它们标为 `commons`，不写成 `fibo-` 命名空间。

## 现有实现的三个硬缺口

第一，`OntologySpec` 只有一个 `namespace`，所有 IRI 都由 `namespace + 本地名` 拼出。外部标准术语无法原样进入存储。

第二，导出器同样按单一 namespace 拼 IRI。即使数据里写了 FIBO IRI，JSON-LD、SHACL、Turtle 也会把它改写成工作台前缀。

第三，qgate 的 `fibo-mini.json` 只有概念名与中文释义，没有 IRI 与模块版本。12 个概念里有两个把非 FIBO 概念标成了 FIBO。

## 方案

### 模型：显式 IRI 优先，出处随术语走

`EntityType`、`ObjectProperty`、`DataProperty` 各增加两个可选字段：`iri` 与 `provenance`。`provenance` 记录六项：origin、module、versionIri、maturity、retrievedAt、definitionEn，另加可选的 note。IRI 解析统一走 `typeIri`、`objectPropertyIri`、`dataPropertyIri`。显式 IRI 优先，缺省回落到原 namespace 规则。

`validateSpec` 增加显式 IRI 的格式校验与唯一性校验。原来的种子本体没有 `iri` 字段，行为不变。

### 数据：36 个概念的 FIBO 包

包内 36 个概念分四组：FIBO 32 个、OMG Commons 2 个、本地扩展 2 个。21 个对象属性的 domain、range 与基数来自 FIBO 的 `owl:Restriction`，不是手写的猜测。例如 MonetaryAmount 的 hasCurrency 基数为 1..1。PaymentEvent 的 involvesPayment 为 1..1。IndividualTransaction 的 appliesToAccount 为 1..1。

16 条公理分两类。12 条来自 FIBO restriction，例如「支付必须有金额」「货币金额必须有币种」。4 条是本地映射公理，消息里写明「FIBO 未显式断言」。这 4 条包括义务与支付不相交、授权与扣款不相交、扣款与结算事件不相交、账户编号唯一。

本地补充字段（金额数值、币种代码、账户编号等）逐条标 `local-extension`，note 写明「非 FIBO 定义」。FIBO 用对象属性建模金额与币种。这些标量字段只为实例落库与校验服务。

### 导入：增量、幂等、冲突整批不写

`POST /api/hermes/ontology/fibo/import` 只追加缺失的类型、属性与公理。同 id 同 IRI 跳过，因此重复导入不会产生重复项。同 id 不同 IRI 返回 409，整批不写，避免覆盖本地已有术语。导入后走原有 `saveSpec`：版本加 1，写前快照，可回滚。T-Box 导入不重写实例。

### 导出：保留真实 IRI 与出处

JSON-LD 与 SHACL 的 `@id`、`rdfs:subClassOf`、`rdfs:domain/range`、`sh:targetClass` 全部走显式 IRI。外部术语额外写 `dct:source`、`core:origin`、`core:fiboModule`、`core:fiboVersionIri`、`core:maturity`、`core:definitionEn`。本体头写 `owl:imports`。Turtle 对外部 IRI 用 `<...>` 原样输出，并生成对应 `@prefix`。

### 交互：第八页签

本体工作台新增「FIBO 金融域」页签。页面上方显示来源仓库、发布版本、取证日期、许可与六项计数。下方表格逐条显示中文名、英文名、IRI、出处、成熟度、中英文定义。导入按钮执行增量合并，结果行显示新增数量。模式页的类型卡也增加 IRI 与出处徽标，导入后的 FIBO 术语在模式页可见。

## 决策记录

1. **逐术语显式 IRI，不改多 namespace 模型。** 多 namespace 会重写存储与校验的主键体系，影响面大。逐术语 IRI 是可选字段，种子本体零改动。
2. **出处作为数据，不写注释。** 六项出处随术语进入 spec，导出时写进 RDF。机器无法校验注释。
3. **FIBO 包用 TypeScript 常量，不做运行时 RDF 解析。** 维持 OD-004 决策。包是预处理的 T-Box，运行时只读内存常量。
4. **origin 三档，禁止混标。** fibo、commons、local-extension 三种来源在 UI 与导出中都能区分。Authorization 与 Capture 不得标成 FIBO。
5. **只收录 36 个概念，不做全量 FIBO。** 包服务于支付、账户、结算三个域。全量 FIBO 有数百个模块，超出本轮范围。
6. **只把 FIBO restriction 与明确标注的本地公理写进包。** FIBO 没有断言的互斥关系不臆造。本地公理必须在消息里写明来源。
7. **增量合并，冲突不覆盖。** 导入是低风险操作。同 id 不同 IRI 说明本地已有同名异义术语，必须人工裁决。
8. **导出保留真实 IRI。** 不把外部术语改写成工作台前缀。否则导出的 RDF 无法与 FIBO 的 IRI 对应。
9. **测试以 IRI 实锚为第一守门。** 每个 FIBO 概念的 IRI 必须落在声明模块下。本地扩展不得带 FIBO IRI。合并必须幂等且不破坏种子实例。
10. **qgate 索引不在本分支改。** `custom/qgate/gate-packs/ontology/data/fibo-mini.json` 由并行分支 `feat/fibo-ontology-calibration` 校准。本分支避免同域撞车。两边合并后，工作台有完整包，语义门有轻量索引。

## 改动清单

| 文件 | 变更 |
|---|---|
| `custom/server/ontology/ontology-types.ts` | 新增 `TermProvenance`、`OriginKind`、`ExternalVocabulary`。三类术语加 `iri` 与 `provenance`。新增 IRI 解析函数 |
| `custom/server/ontology/ontology-validate.ts` | 显式 IRI 格式与唯一性校验 |
| `custom/server/ontology/ontology-export.ts` | 三格式导出改用显式 IRI。写 `dct:source` 与 `owl:imports` |
| `custom/server/ontology/ontology-fibo.ts` | 新增：36 概念、21 对象属性、16 公理、包摘要、增量合并 |
| `custom/server/ontology/ontology-controller.ts` | 新增 `GET /fibo`、`POST /fibo/import` |
| `custom/client/ontology/api.ts` | 镜像新类型与两个 API |
| `custom/client/ontology/i18n.ts` | 中英文案，键路径齐平 |
| `custom/client/ontology/views/OntologyView.vue` | 第八页签、目录表、导入按钮。模式页显示 IRI 与出处 |
| `custom/server/ontology/__tests__/ontology-fibo.test.ts` | 新增 16 个专项守门 |
| 两个既有测试文件 | 补控制器导入路径与视图页签用例 |

## 验证与未验证项

已跑：

```bash
npx vitest run custom/server/ontology custom/client/ontology custom/server/governance/__tests__/governance-ontology.test.ts
```

结果：10 个测试文件、87 个用例全部通过。其中新增 FIBO 专项 16 个，控制器新增 2 个，视图新增 1 个。

已跑：自包含服务端模块的 `tsc --noEmit`，零错误。控制器单独跑 `tsc` 时出现 8 个 `Request.body` 类型错误。这些错误全部落在既有路由行，原因是临时命令没有加载 koa body-parser 的类型增强。本轮新增路由不使用 `request.body`，未引入新错误。

未跑：全仓 5000+ 用例。只有 `custom/server/ontology`、`custom/client/ontology` 与一个治理测试消费这些改动。域内回归已覆盖。

未做：浏览器走查。当前 worktree 的改动无法在不扰动并行会话的前提下注入共享 upstream 树。视图路径由 jsdom 真实 SFC 挂载测试覆盖。控制器路径由真 koa HTTP 测试覆盖。合并后如需要，可在主树热更新环境补一次走查。

## 边界

- 不做运行时 RDF/OWL 解析与推理。不内置 pyshacl。不提供 SPARQL 端点。
- 包是 FIBO 的子集，不是全量镜像。未收录的概念不声称存在。
- 数据属性是本地补充，不是 FIBO 定义。导出时标 `local-extension`。
- FIBO 版本靠 `master_2026Q3` 与各模块 versionIRI 固定，不自动跟随上游更新。升级需要重新取证并跑本文件列出的守门测试。
- qgate 索引由并行分支校准，本分支不改该文件。

## 后续

FIBO 每季度发布。下一次升级按同一路径做。先下载目标模块，校验 versionIRI 与成熟度。再更新 `FIBO_MODULES` 与概念定义，跑 `ontology-fibo.test.ts` 的 IRI 实锚断言。若要把语义门的轻量索引与工作台完整包合并为单一事实源，需要另起一轮。先解决两个消费方的字段裁剪规则。

## 9. 产品化后续（2026-10-21）

治理语义体检覆盖卡、agent 术语查询、IDE `@fibo` 提及、qgate 一致性守门已见《2026-10-21-fibo-product-rollout-plan.md》。该方案 P0 已落地，P1 到 P3 分阶段推进。本文的 T-Box 与导入语义不变。
