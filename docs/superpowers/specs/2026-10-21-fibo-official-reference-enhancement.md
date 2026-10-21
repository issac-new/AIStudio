# 本体工作台 FIBO 官方参照内容增强设计

- 日期：2026-10-21
- 分支：`feat/ontology-fibo-reference`
- 类型：技术方案与调研记录
- 主宗旨：让用户能逐条核对 FIBO 内容。现有导入包已有术语，本轮补官方域导航、真实场景和来源。

## 1. 现状与主要矛盾

main 已有 `ontology-fibo.ts`。它提供 36 个概念、21 个对象属性、16 条公理，以及增量导入和真实 IRI 导出。支付、账户、结算三个域已经可用。

当前缺口在内容解释。页面没有 FIBO 域全景，没有官方实例场景，也没有固定提交和逐条源码链接。用户能看到一个术语的 IRI，却不能从页面回到具体 RDF 文件核对定义和约束。

本轮只补只读参照内容。现有导入包的类型、属性、公理和实例语义不变。

## 2. 官方调研结论

### 2.1 发布与治理

截至 2026-10-21，最新正式发布为 Q3 2026：

- tag：`master_2026Q3`
- 提交：`2d73435a4419b66b7c9f44cb9763e35fe8ac7890`
- 发布时间：2026-10-20T20:02:05Z
- 许可证：MIT

来源：[Q3 2026 Release](https://github.com/edmcouncil/fibo/releases/tag/master_2026Q3)、[固定提交](https://github.com/edmcouncil/fibo/commit/2d73435a4419b66b7c9f44cb9763e35fe8ac7890)、[MIT License](https://github.com/edmcouncil/fibo/blob/master_2026Q3/LICENSE)。

FIBO 由 EDM Council 托管和赞助，并由 OMG 标准化。GitHub 社区按季度发布。Release、Provisional、Informative 是本体成熟度，不能与季度 release 是否正式混为一谈。

来源：[README](https://github.com/edmcouncil/fibo/blob/master_2026Q3/README.md#introduction)、[开发流程](https://spec.edmcouncil.org/fibo/page/development-process)、[贡献规则](https://github.com/edmcouncil/fibo/blob/master_2026Q3/CONTRIBUTING.md#maturity-levels)。

### 2.2 仓库形态

固定 tag 的根目录包含 ACTUS、BE、BP、CAE、DER、EXMP、FBC、FND、IND、LOAN、MD、SEC。仓库只有 `master` 长期分支，没有已核实的 `dev` 或 `prod` 分支。Development 和 Production 是发布集合，不是分支名。

GitHub 源文件以 RDF/XML 为主。固定 tag 的 Git tree 有 296 个 `.rdf` 和 2 个 `.ttl`，没有 `.jsonld`。数量包含加载文件和元数据，不能解释为 296 个独立业务本体。

官方加载入口分为：

- `AboutFIBOProd.rdf`：只含 Release 本体。
- `AboutFIBOProd-TBoxOnly.rdf`：排除参考数据和示例，但 SEC Bonds 仍会带入部分参考个体。
- `AboutFIBODev.rdf`：包含 Release、Provisional、Informative。

来源：[固定 tag 根目录](https://github.com/edmcouncil/fibo/tree/master_2026Q3)、[Production 入口](https://github.com/edmcouncil/fibo/blob/master_2026Q3/AboutFIBOProd.rdf)、[TBoxOnly 入口](https://github.com/edmcouncil/fibo/blob/master_2026Q3/AboutFIBOProd-TBoxOnly.rdf)。

### 2.3 域划分

本轮显示 FND、BE、FBC、LOAN、SEC、DER、IND、MD 八个核心域，并补充 ACTUS、BP、CAE、EXMP。域说明来自各自的 `Metadata*.rdf` 或官方 README。

MD 需要单独提示。Q3 2026 的元数据仍说明其内容为 Provisional，不能把季度正式发布理解成 MD 全部稳定。

来源：[MD 元数据](https://github.com/edmcouncil/fibo/blob/master_2026Q3/MD/MetadataMD.rdf#L34-L36)、[DebtAnalytics 成熟度](https://github.com/edmcouncil/fibo/blob/master_2026Q3/MD/DebtTemporal/DebtAnalytics.rdf#L96-L97)。

## 3. 四条官方场景

### 3.1 Apple 股票、发行角色与交易所

官方 EXMP 把 `AppleIncCommonStock` 声明为 `ListedShare`，发行方为 `AppleIncEquityIssuer`，home exchange 为 `Facility-XNAS`。发行角色通过 `isPlayedBy` 连接到 Apple 法律实体。

`ListedSecurity` 对 `hasHomeExchange` 和 `hasOriginalPlaceOfListing` 均规定 `exactly 1`。页面保留 `exactly 1`，不改写成普通必填字段。

来源：[Apple 示例](https://github.com/edmcouncil/fibo/blob/master_2026Q3/EXMP/Securities/EquitiesExamples.rdf#L191-L228)、[上市约束](https://github.com/edmcouncil/fibo/blob/master_2026Q3/SEC/Securities/SecuritiesListings.rdf#L105-L126)、[Apple 法律实体](https://github.com/edmcouncil/fibo/blob/master_2026Q3/EXMP/LegalEntities/DowJonesIndustrialAverageCompanies.rdf#L305-L319)。

### 3.2 DJIA、股票篮子与成分

`DowJonesIndustrialAverage` 是 `EquityIndex`，通过 `isBasedOn` 连接股票篮子。Apple 成分个体是 `SecuritiesBasketConstituent`，连接篮子和 NASDAQ Apple Listing。

来源：[DJIA 示例](https://github.com/edmcouncil/fibo/blob/master_2026Q3/EXMP/Securities/EquityIndexExamples.rdf#L125-L158)、[指数与篮子约束](https://github.com/edmcouncil/fibo/blob/master_2026Q3/IND/MarketIndices/BasketIndices.rdf#L127-L210)。

### 3.3 固定与浮动利率互换

`InterestRateSwap` 具有两条利率腿的 qualified cardinality 约束。官方 sample 合约包含一条固定腿和一条浮动腿，两者不相交。

示例中的固定利率字面量为 1.0579，浮动利率字面量为 0.309，固定腿名义本金为 1286805，币种为 Euro。页面不补百分号，不把 sample 说成真实成交或实时行情。

来源：[互换约束](https://github.com/edmcouncil/fibo/blob/master_2026Q3/DER/RateDerivatives/IRSwaps.rdf#L209-L246)、[官方 sample](https://github.com/edmcouncil/fibo/blob/master_2026Q3/EXMP/Securities/IRSwapExamples.rdf#L128-L226)。

### 3.4 房地产担保贷款与 Mortgage

`LoanSecuredByRealEstate` 是贷款，`Mortgage` 是 `SecurityAgreement` 的子类。贷款合同、担保协议和房地产抵押品不能合并成一个节点。

该场景只显示 Schema，不虚构贷款个体。

来源：[Mortgages](https://github.com/edmcouncil/fibo/blob/master_2026Q3/LOAN/RealEstateLoans/Mortgages.rdf#L84-L137)。

## 4. 设计

### 4.1 数据来源

新增 `custom/server/ontology/ontology-fibo-reference.ts`，作为只读参照目录的单一事实源。目录包含域、场景、节点、关系、事实和来源。

现有 `ontology-fibo.ts` 继续负责可导入 T-Box。新增提交号到 `FIBO_SOURCE`，并给 FIBO 概念投影补充固定 tag 的 `sourceUrl`。OMG Commons 和本地扩展不伪造 FIBO GitHub 来源。

### 4.2 API 与页面

现有 `GET /api/hermes/ontology/fibo` 的 `pack` 增加 `reference` 字段。现有导入端点不变。

FIBO 页签保留概念表和导入按钮，新增两块只读内容：

1. 域导航：显示域职责、一级模块、成熟度和官方来源。
2. 场景浏览：切换四条场景，显示关系图、文字关系、关键事实、约束解释和源码链接。

关系图复用 Vue Flow。窄屏使用紧凑层间距和固定初始视口，避免默认 `fitView` 受最小缩放和异步尺寸影响。文字关系列表与图同时存在，避免信息只依赖颜色或图形。

### 4.3 中英文与可访问性

界面词条继续放在 `ontology/i18n.ts`，中英文键路径一致。域、场景和事实数据同时提供中英文说明，官方标签与 IRI 保持英文原文。

所有外部链接使用固定 tag。链接文本说明目标文件或 release，不使用“点击这里”。

## 5. 守门与验证

新增测试先失败，再写实现。守门覆盖：

- 提交号、tag、概念 `sourceUrl` 的固定版本。
- 核心域完整，MD 带 Provisional 提示。
- 四个场景 ID 固定，关系端点存在，来源 URL 全部钉到同一 tag。
- Apple、DJIA、互换和 Mortgage 的关键事实保持官方含义。
- REST 返回 `reference`，客户端能切换场景并显示来源链接。
- 既有 36 概念、21 属性、16 公理和导入行为不变。

验证顺序为本体目标测试、全量 `npm test`、TypeScript 类型验证、构建和浏览器热更新走查。不制作安装包。

## 6. 非目标与回滚

本轮不做完整 RDF/XML 导入，不计算 `owl:imports` 闭包，不做 OWL DL 推理或 SPARQL，也不把场景中的新类直接加入可导入包。

看板摄取入口断线是独立问题，本轮不修改。

回滚只需还原本分支。参照目录不写入用户本体和实例，不涉及数据迁移。

## 决策记录

1. **扩展既有实现，不新建并列 FIBO 包。** main 在本任务开工前已合入 36 概念导入层，本轮只补参照内容。
2. **只读场景与可导入 T-Box 分离。** 场景中的证券、衍生品和贷款内容未做完整依赖核验，不直接进入导入模型。
3. **所有来源固定到 Q3 2026。** 同时保存 tag 与完整提交，页面不使用移动 `master` 链接。
4. **官方示例优先于自编示例。** Apple、DJIA 和互换来自 EXMP。Mortgage 只显示 Schema。
5. **开放世界约束不翻译成闭世界必填。** 页面保留 `someValuesFrom`、`exactly 1` 和 qualified cardinality 的原始语义。
6. **并行边界经用户裁定。** 当前 worktree 数达到上限，用户明确允许本任务临时新增一个 worktree。本任务不清理其他会话目录。
