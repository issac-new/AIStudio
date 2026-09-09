# 数据治理域调研:国际框架、国内标准、政策与工程实践

> 调研日期:2026-09-04 | 服务对象:Hermes 集群 data 团队(Flink/Paimon/Fluss/Dinky/MySQL/Redis 实时数仓栈)
> 边界声明:本域只覆盖数据标准/质量/主数据/元数据/资产;数据安全法规(个保法/数安法/跨境)由另一代理负责,本文仅在 §7 边界处提及。
> 状态:完稿(2026-09-04 调研;标准状态以当日 openstd/iso.org 官网显示为准)

## Executive Summary

**主旨:对实时数仓团队而言,数据治理的落点不是另建一套文档体系,而是把治理动作(标准校验/质量规则/变更通知)固化进 Flink/Paimon 开发流水线本身——能在 CI/CD 里机器执行的治理,才是会被真实执行的治理。**

三个决定性发现:

1. **标准供给已足够,缺的是工程化执行层**。国内有 DCMM(GB/T 36073)、GB/T 36344 数据质量六性指标、GB/T 34960.5 数据治理规范;国际有 DAMA-DMBOK2/DCAM 等框架。这些标准都回答"治理什么",但没有一个回答"在 Flink 作业变更时如何拦截坏 schema"。团队要做的正是这个缝隙。
2. **数据资产入表(2024-01-01 施行)把数据质量从技术问题变成财务问题**。入表的前提是数据资源满足资产确认条件(可计量、可控、预期带来经济利益),这倒逼元数据、血缘、质量记录成为"审计级"证据——实时数仓团队的元数据登记和数据质量记录从此有了对外部审计的意义。
3. **国内外框架收敛于同一套核心动作**:决策权分配(DGI decision rights / DAMA 治理轮毂 / DCMM 数据治理域)、质量维度量化(ISO 8000 / GB/T 36344 六性)、成熟度度量(DCMM 5 级 / DCAM 8 组件)。差异只在组织层级和颗粒度——对一线团队,GB/T 36344 六性 + 规则引擎是最小可用集。

本文档回答六个问题:A 国际框架 B 国内标准 C 国内政策 D 工程实践 E 大厂实践 F 实时数仓团队落点(§6 为全文档的最终归宿,其余章节都是它的依据)。

## 1. 国际框架

**本节核心判断:六个国际框架分工明确——DMBOK 管"知识地图"、DGI 管"组织与决策权"、COBIT 管"IT 治理映射"、ISO/IEC 38505 管"董事会问责"、ISO 8000 管"可机器验证的质量"、DCAM 管"能力度量"。对工程团队,只有 ISO 8000 和 DCAM 的做法能直接下沉到流水线。**

### 1.1 DAMA-DMBOK2

| 属性 | 内容 |
|---|---|
| 全称 | Data Management Body of Knowledge, 2nd Edition |
| 发布机构 | DAMA International(DAMA 国际) |
| 年份 | 2017(第 2 版;第 1 版 2009) |
| 现行状态 | 现行(非强制标准,行业协会最佳实践指南;DMBOK3 修订已在进行) |
| 性质 | 知识体系指南,非认证标准 |

**核心内容**:把数据管理组织为 **11 个知识领域**,Data Governance 居中心轮毂位置,其余 10 个领域围绕:数据架构、数据建模与设计、数据存储与操作、数据安全、数据集成与互操作、文档与内容、参考数据与主数据、数据仓库与商务智能、元数据、数据质量(DMBOK2 从第 1 版的 10 个领域扩展而来,新增"数据集成与互操作")。每个知识领域给出活动、角色职责、交付物、度量与成熟度模型。治理的职能被定义为:策略制定、监督与控制、决策权分配(DAOH:决策权 Decision Rights、问责 Accountability、监督 Oversight、控制 Control)。

**实际约束**:DMBOK 是"领域地图"而非操作手册——它不规定用哪个工具、什么流程步骤,企业需自行落地。对 data 团队的作用是**对齐话语体系**:团队内讨论"元数据""主数据""数据质量"时与行业同义。它对实时数仓栈没有直接的合规约束力。

来源:[DAMA DMBOK2 官方概览 PDF](https://www.dama-dk.org/onewebmedia/DAMA%20DMBOK2_PDF.pdf);[atlan.com DAMA DMBOK Framework 指南](https://atlan.com/dama-dmbok-framework);[srjconsultingservices DMBOK 条目](https://srjconsultingservices.com/ai-governance/data-management-frameworks/dama-dmbok)

### 1.2 DGI 数据治理框架

| 属性 | 内容 |
|---|---|
| 全称 | DGI Data Governance Framework |
| 发布机构 | The Data Governance Institute(Gwen Thomas 创立,美国) |
| 年份 | 2000 年代初发布,持续演进(2020s 版本仍在维护) |
| 现行状态 | 现行(行业协会框架,免费公开) |
| 性质 | 治理程序设计框架 |

**核心内容**:**10 个通用组件(Components)**,按 WHY/WHAT/WHO/HOW 四问组织:
- WHY:①Mission & Value(使命与价值) ②Data Governance Beneficiaries(受益者)
- WHAT(Program Outputs):③Data Products ④Controls(控制) ⑤Accountabilities(问责) ⑥Decision Rights(决策权) ⑦Policy and Rules(政策与规则)
- HOW:⑧Processes, Tools and Communication ⑨Data Governance Work Program(以项目组合方式管理)
- WHO:⑩Participants(参与者:治理办公室 DGO、决策机构、Data Stewards 业务侧数据管家、Data Custodians 技术侧数据保管人)

DGI 区分"Big G Governance"(高影响决策:决策权/问责/政策)与"little g governance"(日常执行:目录/定义/元数据/控制点/度量)。

**实际约束**:DGI 框架对企业的真正约束是**程序完备性检查表**——如果团队宣称"有数据治理",DGI 会问:决策权在谁?规则谁批?规则如何进控制点?Steward/Custodian 谁当?对 data 团队的可操作启示:每张表的"业务口径变更"必须有明确的决策人(Steward)和传递链路,这正是 §6 表变更通知 SOP 的理论依据。

来源:[DGI Data Governance Framework](https://datagovernance.com/the-dgi-data-governance-framework/);[DGI Framework Components(10 组件)](https://datagovernance.com/the-dgi-data-governance-framework/dgi-data-governance-framework-components/);[Component #10 Participants(Steward/Custodian 定义)](https://datagovernance.com/the-dgi-data-governance-framework/framework-component-10-data-governance-participants/)

### 1.3 COBIT 2019

| 属性 | 内容 |
|---|---|
| 全称 | Control Objectives for Information and Technologies 2019 |
| 发布机构 | ISACA |
| 年份 | 2018 发布(接替 COBIT 5),2019 正式命名 |
| 现行状态 | 现行(ISACA 官方治理框架) |
| 性质 | 企业 IT 治理与管理框架,含审计映射 |

**核心内容**:**40 个治理与管理目标**,分 5 域:
- 治理域 **EDM**(Evaluate, Direct and Monitor,董事会职责):EDM01 治理框架、EDM02 效益交付、EDM03 风险优化、EDM04 资源优化、EDM05 干系人参与
- 管理域 4 个:**APO**(对齐/计划/组织,14 个目标,含 APO01 I&T 管理框架、APO12 风险、APO14 数据——数据治理在 COBIT 5 时代为 APO01-04 改组后的目标之一)、**BAI**(构建/获取/实施,11 个)、**DSS**(交付/服务/支持,6 个)、**MEA**(监控/评价/评估,4 个)

COBIT 2019 每个目标下展开 7 类治理组件:流程、组织结构、信息流、人员技能、政策程序、文化、服务基础设施。新增 11 个设计因子(design factors)支持定制化裁剪。

**实际约束**:COBIT 是 IT 全域治理框架,数据只是其子集(APO14 Managed Data)。对 data 团队:当公司过 ISO 27001/等保/外部审计时,审计师常以 COBIT 为参照系提问"数据相关决策谁批、如何监控"——团队若已有清晰的数据Owner制度和质量报表(§6 SOP),可直接映射回答。直接实施 COBIT 对一线团队性价比低,不建议。

来源:[ISACA COBIT 官方页](https://www.isaca.org/resources/cobit);[COBIT 2019 Framework: Governance and Management Objectives 全文 PDF](https://erp.ebsafr.com/files/COBIT%202019%20Framework%20-%20PDF.pdf);[ISACA 行业文章:40 objectives/5 domains](https://www.isaca.org/resources/news-and-trends/industry-news/2020/using-cobit-2019-to-plan-and-execute-an-organization-transformation-strategy)

### 1.4 ISO/IEC 38505

| 属性 | 内容 |
|---|---|
| 全称 | Information technology — Governance of data |
| 发布机构 | ISO/IEC JTC 1/SC 40(IT 治理分委会) |
| 年份 | Part 1 第一版 2017-04;**第二版 2026-08 已发布**;Part 2:2016(数据治理对数据管理的启示) |
| 现行状态 | **38505-1:2017 已废止(Withdrawn),被 38505-1:2026 替代** |
| 性质 | 国际标准(指导性,面向治理机构/董事会) |

**核心内容**:把 ISO/IEC 38500(IT 治理六原则:责任/战略/获取/绩效/符合/人的行为)应用到**数据**上,供治理机构(董事会/高管)使用。第一版的核心工具是"数据问责地图"(data accountability map)——按"价值与影响"两维评估数据,决定治理力度;治理=评估/指导/监督数据的使用,与数据管理(存储/检索的机制)严格区分。第二版(2026-08)延续该定位,适配新的数据生态(AI、云)。

**实际约束**:适用所有类型和规模的组织,但定位在**董事会/治理机构层**——它告诉董事会该问什么问题,不告诉工程团队怎么做。对 data 团队的意义:当管理层发起"数据治理专项"时,ISO/IEC 38505 是他们引用的问责语言;团队需要准备的是能向上汇报的度量物(数据质量报表、问责清单)。

来源:[ISO 官网 38505-1:2017 页(显示 Withdrawn)](https://www.iso.org/standard/56639.html);[ISO 官网 38505-1:2026 页(Edition 2, 2026-08)](https://www.iso.org/standard/87195.html);[IEC webstore 38505-1:2017 摘要](https://webstore.iec.ch/en/publication/60383)

### 1.5 ISO 8000 数据质量系列

| 属性 | 内容 |
|---|---|
| 全称 | Data quality(系列标准) |
| 发布机构 | ISO TC 184(自动化系统与集成) |
| 年份 | 各部分 2011-2022 陆续发布 |
| 现行状态 | 现行(多部分并行,滚动修订) |
| 性质 | 国际标准;唯一以"可机器验证"为设计目标的国际数据质量标准族 |

**核心内容**(与工程团队相关的主要部分):
- **ISO 8000-8:2015**:信息与数据质量的概念与测量基础——"质量=符合明确陈述的需求"(quality is conformance to requirements),一切质量指标须可追溯到需求
- **ISO/TS 8000-81**:数据剖析(data profiling)方法,识别质量改进机会
- **ISO 8000-61:2016**:数据质量管理**过程参考模型**——Implementation(Data Quality Planning/Control/Assurance/Improvement,PDCA 循环)+ Data-Related Support + Resource Provision 三层,可对接 ISO 9001,可作认证评估依据
- **ISO 8000-110:2021**:主数据交换的语法、语义编码与数据规格符合性——强调要求必须"computer-checkable"(可由计算机检查)
- **ISO 8000-120**:数据溯源(provenance)的表示与交换;**-130**:准确性;**-140**:完整性
- **ISO 8000-150:2022**:数据质量管理的角色与职责框架

**实际约束**:ISO 8000 是六性工程化的理论源头——"质量即符合需求、需求必须机器可查"直接对应规则引擎(Great Expectations 的 expectation 即"机器可查的需求表达")。对 data 团队,ISO 8000-61 的 PDCA 过程模型就是 §6 质量门禁 SOP 的骨架:规划(定规则)→控制(执行)→保证(度量)→改进(根因分析)。不买标准文本也能按其结构实施;涉主数据交换的供应链场景(如制造业客户要求)才有采购其文本的必要。

来源:[ISO 官网 8000-110:2021](https://www.iso.org/standard/78501.html);[ISO 官网 8000-8:2015](https://www.iso.org/standard/60805.html);[ISO 8000-61:2016 全文预览](https://cdn.standards.iteh.ai/samples/63086/a26a685e6dfa4c129dfbd4930176d218/ISO-8000-61-2016.pdf);[ISO 8000-150:2022 全文预览](https://cdn.standards.iteh.ai/samples/80753/9514262e219645279238c120b2f0b8a7/ISO-8000-150-2022.pdf)

### 1.6 EDM Council DCAM

| 属性 | 内容 |
|---|---|
| 全称 | Data Management Capability Assessment Model |
| 发布机构 | EDM Council(Enterprise Data Management Council,全球金融数据管理行业协会,300+ 会员机构) |
| 年份 | DCAM 1.x 2017;DCAM 2.x 2021;**DCAM v3 已发布**(2024-2025) |
| 现行状态 | 现行(会员制;配套 CDMC 云数据管理能力模型、EDM Fellow 认证体系) |
| 性质 | 能力评估模型(能力域-能力-子能力-评估因子四层结构) |

**核心内容**:DCAM v3 以 **8 个关键组件**覆盖数据供应链:数据管理战略与业务案例(含 Funding)、数据管理组织与人才、数据架构与技术、数据治理(政策/Policies)、数据质量管理、数据平台与架构治理(含 cloud-native 数据生态)、数据运营(Datalithosphere/生命周期)与 AI-ready 评估增强。DCAM 2.x 时代为 8 组件、38 能力、118 子能力、~2000 条评估因子;v3 面向 AI 部署、云原生数据生态与现代数据管道增强指引。DCAM 的姊妹模型 **CDMC**(Cloud Data Management Capabilities)专门评云上数据治理与控制,含 14 个能力域。

**实际约束**:DCAM 是金融机构(银行/资管)监管对话的通用度量衡(BCBS 239 与之强相关)。对非金融 data 团队:直接照搬性价比低,但其**评估因子写法**(每个能力拆成可打分的 evidence-based 因子)是团队能力盘点的好模板;若公司服务金融客户或接受金融行业审计,DCAM/CDMC 是对方常引用的框架。

来源:[EDM Council DCAM 官方页(v3, 8 components)](https://edmcouncil.org/frameworks/dcam/);[DCAM v3 发布公告](https://edmcouncil.org/announcement/announcing-dcam-v3-meet-the-new-standard-for-your-data/);[Snowflake: DCAM Explained](https://www.snowflake.com/en/data-governance/frameworks/dcam/)

## 2. 国内标准

**本节核心判断:国内标准体系已与国际对齐且更"可考核"——DCMM 给成熟度等级、GB/T 36344 给质量维度、GB/T 34960.5 给治理规范,三者构成"可申报、可认证、可对标"的国内闭环;2026 年 DCMM 2.0 把"数据资产"升为独立能力域,印证资产化方向。注意:任务常引用的"DCMM 十大能力域"与"质量六性"表述均与现行标准文本不符,以下按标准原文纠偏。**

### 2.1 DCMM 数据管理能力成熟度评估模型

| 属性 | 2018 版(GB/T 36073-2018) | 2025 新版(GB/T 36073-2025,DCMM 2.0) |
|---|---|---|
| 发布机构 | 国家市场监管总局/国标委 | 同左 |
| 发布/实施 | 2018-03-15 发布,2018-10-01 实施 | 2026-01 前后发布,**2026-07-01 实施**,全面替代 2018 版 |
| 现行状态 | **已废止**(openstd 官网标准状态:废止) | **现行** |
| 能力域 | 8 个 | **9 个**(新增"数据资产"域;"数据应用"更名为"数据应用流通") |
| 能力项/指标 | 28 个能力项 / 445 条评估指标 | **33 个能力项 / 486 项量化指标** |
| 成熟度等级 | 5 级:初始级→受管理级→稳健级→量化管理级→优化级 | 5 级不变;明确 L2 为评估基准,L4 要求引入 AI 等先进技术 |

**核心内容(2018 版 8 能力域,2025 版在括注中说明)**:①数据战略 ②数据治理 ③数据架构 ④数据应用(2.0:数据应用流通,新增外部数据管理) ⑤数据安全 ⑥数据质量 ⑦数据标准 ⑧数据生存周期(需求/设计开发/运维/退役);2.0 新增第 9 域 **数据资产**(权属管理/价值评估/资产运营)。DCMM 是我国数据管理领域**首个国家标准**,借鉴 DAMA-DMBOK 并结合国内实践;评估由工信部授权的评估机构执行,多地对通过 3 级及以上企业给予最高 50 万元补贴。

**实际约束**:对企业的实际约束是**申报资质门槛**(近三年无重大违规、成立年限/人数/营收/数据量等分级门槛)与**政府数据要素政策挂钩**(数据要素试点、入表试点常要求 DCMM 3 级+)。对 data 团队:DCMM 评估时需要拿出"制度+记录"证据——元数据管理制度、质量报告、标准文档;团队平时按 §6 固化的 SOP 就是 DCMM 3 级"稳健级"的直接证据链(该级核心要求:数据管理流程制度化、组织内统一)。

来源:[openstd 国家标准全文公开系统 GB/T 36073-2018(状态:废止)](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=B282A7BD34CAA6E2D742E0CAB7587DBC);[新浪财经:GB/T 36073-2025 正式发布(2026-01)](https://finance.sina.com.cn/roll/2026-01-15/doc-inhhiyxz3481770.shtml);[腾讯云开发者:DCMM 2.0 九大能力域与 486 项指标解析](https://developer.cloud.tencent.com/article/2714705);[全国 DCMM 评估公共服务平台](http://www.dcmm.org.cn/);[DAMA China DCMM 解读](https://www.dama.org.cn/wordpress/2023/07/27/%E6%95%B0%E6%8D%AE%E7%AE%A1%E7%90%86%E8%83%BD%E5%8A%9B%E6%88%90%E7%86%9F%E5%BA%A6%E6%A8%A1%E5%9E%8Bdcmm%E4%B8%80%E6%96%87%E8%AF%BB%E6%87%82/)

### 2.2 GB/T 34960 信息技术服务 治理

| 属性 | 内容 |
|---|---|
| 全称 | 信息技术服务 治理(系列标准,ITSS 体系的服务管控领域标准) |
| 发布机构 | 国家市场监管总局/国标委;归口全国信息技术标准化技术委员会 |
| 年份 | Part 1:2017 通用要求;其余部分 2018 |
| 现行状态 | 现行 |
| 系列构成 | 第 1 部分:通用要求;第 2 部分:实施与实施指南相关;第 3 部分:绩效评价;第 4 部分:审计导则(实际名称以标准文本为准);**第 5 部分:数据治理规范(GB/T 34960.5-2018)** |

**核心内容**:Part 1 规定 IT 治理的模型与框架、治理原则,以及信息技术顶层设计、管理体系和资源的治理要求。**Part 5《数据治理规范》**是国内数据治理最直接对标的标准:规定数据治理的组织架构与职责、数据战略、数据架构、数据标准、数据质量、数据生存周期等方面的治理要求——即把"数据"作为 IT 治理的专项对象给出规范性要求。

**实际约束**:GB/T 34960 系列是**ITSS 符合性评估**的依据之一,企业过 ITSS 评估时会被对照检查。对 data 团队:Part 5 的价值在于它以国标语言确认了"数据治理必须有组织与职责划分"(对应 DGI 的 Participants/DCMM 的数据治理域),团队写内部制度时可直接引用其框架,避免自创术语。

来源:[openstd GB/T 34960.5 全文公开页](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=F3B2108863A2292F5AF0FA645CEE047F);[国家标准馆 GB/T 34960.1-2017 条目](https://ndls.cnis.ac.cn/standard/detail/ba4ce67e5eba1f49e3b1b90f5ce6be92);[工标网 34960.1 简介](http://csres.com/detail/306330.html)

### 2.3 GB/T 36344-2018 信息技术 数据质量评价指标

| 属性 | 内容 |
|---|---|
| 全称 | 信息技术 数据质量评价指标(Information technology—Evaluation indicators for data quality) |
| 发布机构 | 国家市场监管总局、中国国家标准化管理委员会 |
| 年份 | 2018-06-07 发布,**2019-01-01 实施** |
| 现行状态 | **现行**(openstd 标准状态:现行) |
| 适用范围 | 数据生存周期各阶段的数据质量评价 |

**核心内容**:规定数据质量评价指标框架,定义 **6 个一级指标**:
1. **规范性**——数据符合数据标准、数据模型、业务规则、元数据或权威参考数据的程度
2. **完整性**——按照数据规则要求,数据元素被赋予数值的程度
3. **准确性**——数据准确表示其所描述的真实实体(实际对象)真实值的程度
4. **一致性**——数据与其他特定上下文中使用的数据无矛盾的程度
5. **时效性**——数据在时间变化中正确的程度
6. **可访问性**——数据能被访问的程度

每个一级指标下再分二级指标(如完整性下分数据元素完整性/数据记录完整性等),并给出评价过程参考。

**实际约束与纠偏**:⚠️ **业界口口相传的"质量六性:完整性/唯一性/一致性/及时性/准确性/有效性"并非 GB/T 36344 原文**——国标的六性是"规范性、完整性、准确性、一致性、时效性、可访问性";"唯一性"在国标框架下通常作为"规范性/一致性"的二级指标出现,"有效性"近似"规范性"。团队在写质量规则文档时,建议**以国标六性为一级分类、以行业六性为执行子集**(唯一性→一致性的二级指标;有效性→规范性的二级指标),对内通俗、对外合规。

来源:[openstd GB/T 36344-2018 全文公开页(现行,发布/实施日期)](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=D12140EDFD3967960F51BD1A05645FE7);[CSDN:标准文本指标摘录(规范性/完整性/准确性定义)](https://blog.csdn.net/qq_42393720/article/details/138327129);[龙石数据:六维度框架](https://www.longshidata.com/blog/c/c2026082601.html)

## 3. 国内政策:数据要素与数据资产入表

**本节核心判断:两条政策合起来改变了企业数据工作的"会计意义"——数据二十条解决"数据归谁、能怎么经营",入表规定解决"数据值多少钱、怎么记账"。对一线团队的实际影响是:元数据、权属记录、质量报告从内部文档升级为可被审计、可支撑资产定价的证据链。**

### 3.1 数据二十条

| 属性 | 内容 |
|---|---|
| 全称 | 《中共中央 国务院关于构建数据基础制度更好发挥数据要素作用的意见》 |
| 发布机构 | 中共中央、国务院 |
| 年份 | 2022-12-19 对外发布 |
| 现行状态 | 现行政策(数据要素领域纲领性文件,国家数据局 2023 年成立后持续落实) |
| 性质 | 政策文件(非强制标准,但指导后续立法、标准与地方实践) |

**核心内容**:以"数据产权、流通交易、收益分配、安全治理"四大制度为框架(共 20 条,故称"数据二十条")。最具结构性影响的创新是**数据产权"三权分置"**:淡化"所有权",建立**数据资源持有权、数据加工使用权、数据产品经营权**分置的产权运行机制。配套要求:公共数据"有条件无偿/有偿使用"、建立数据流通交易制度、培育数据商与第三方专业服务机构、推动数据产品标准化、加强数据采集和质量评估标准制定。2024 年后国家数据局在《数据领域常用名词解释(第二批)》中将"三权"表述迭代为更精炼的"**数据持有权、数据使用权、数据经营权**"。

**对企业的实际影响**:①数据资产确权有了政策依据——企业对外供数/售数前须先回答"我持有什么权",倒逼建立**数据资产目录与权属台账**;②数据流通从灰色地带进入合规通道——参与数据交易所挂牌、数据产品化经营需要有明确的权属与质量证明;③与 DCMM 2.0 新增"数据资产"能力域、入表规定形成政策闭环:确权(二十条)→定级(DCMM)→定价(入表)。

来源:[国家发改委专家文章:三权分置制度框架](https://www.ndrc.gov.cn/wsdwhfz/202304/t20230410_1353438.html);[黄石政府网:三权表述迭代说明](https://www.huangshi.gov.cn/xxxgk/2020_zc/zcjd/202604/t20260402_1318472.html);[智慧城市行业分析:四梁八柱框架解读](https://www.smartcity.team/professional/%E6%95%B0%E6%8D%AE%E4%BA%8C%E5%8D%81%E6%9D%A1%E8%A7%A3%E8%AF%BB/)

### 3.2 财政部数据资产入表

| 属性 | 内容 |
|---|---|
| 全称 | 《企业数据资源相关会计处理暂行规定》 |
| 文号 | 财会〔2023〕11 号 |
| 发布机构 | 财政部 |
| 年份 | 2023-08 印发,**2024-01-01 施行** |
| 现行状态 | 现行(暂行规定;地方财政部门已发文督促执行,如深圳市财政局) |
| 性质 | 会计处理规定(企业会计准则体系下的细化规范,不构成会计政策变更) |

**核心内容**:适用于按照企业会计准则可确认为资产的数据资源——
- **自用数据**→ 符合《企业会计准则第 6 号——无形资产》定义与确认条件的,确认为**无形资产**;开发阶段支出满足资本化条件才能资本化,研究阶段支出费用化
- **用于出售的数据**→ 日常活动中持有、最终目的用于出售,符合存货准则的,确认为**存货**
- **外购数据成本构成**:购买价款+税费+**数据脱敏、清洗、标注、整合、分析、可视化等加工支出**+**数据权属鉴证、质量评估、登记结算、安全管理等费用**——治理成本被明文纳入资产成本
- **报表列示**:在"存货""无形资产""开发支出"项目下增设"其中:数据资源"子项;要求披露使用寿命/摊销方法、受限权属、单项重要数据资产等

**对企业的实际影响**(2024-2026 已验证的现实):
1. **数据治理从成本中心变成资产化前置条件**:入表前提是"合法拥有或控制+预期带来经济利益",权属鉴证与质量评估费用被明文计入资产成本——没有元数据台账、权属记录、质量报告的企业无法入表
2. **市场规模已形成但克制**:2024 年报季有 109 家上市公司披露数据资产入表,合计 26.4 亿元(百度百科引述),同时出现高鸿股份"存货"误填 8665 万后澄清的乌龙事件——说明财务口径的元数据管理尚在早期
3. **对工程团队的具体影响**:数据资源被确认为资产后,**其元数据(来源、加工链路、更新频率、时效性、质量指标)成为财务报告支撑材料**;§6 的元数据登记 SOP 与质量门禁记录,将直接决定"这条数据资产能不能被审计师认可"。反过来说,数据生命周期管理(退役/销毁)也有会计意义——深圳财政局通知明确要求对失去价值的数据资产"安全和脱敏处理后及时有效销毁"
4. **无形资产使用寿命估计**须考虑"更新频率和时效性、产品/技术迭代、同类竞品"——实时数仓的表级血缘与更新频率元数据是这些估计的直接输入

来源:[百度百科:企业数据资源相关会计处理暂行规定(含规定全文引用、109 家/26.4 亿、误填案例)](https://baike.baidu.com/item/%E4%BC%81%E4%B8%9A%E6%95%B0%E6%8D%AE%E8%B5%84%E6%BA%90%E7%9B%B8%E5%85%B3%E4%BC%9A%E8%AE%A1%E5%A4%84%E7%90%86%E6%9A%82%E8%A1%8C%E8%A7%84%E5%AE%9A/63345394);[深圳市财政局:关于加强企业数据资源相关会计处理的通知](https://szfb.sz.gov.cn/gkmlpt/content/11/11350/post_11350453.html);[德勤中国:数据资源入表企业应对之策](https://www.deloitte.com/cn/zh/services/consulting-risk/perspectives/data-resources-management.html);[锦天城律所:数据治理与合规助推入表](https://www.allbrightlaw.com/CN/10475/fd49330c9b5a0612.aspx)

## 4. 工程实践:MDM、数据标准落地、数据质量六性

**本节核心判断:工程实践的共识是"治理动作工具化+左移进流水线"——MDM 用唯一可信源(黄金记录)消灭多源歧义,数据标准靠"词根/命名规范+门禁卡点"落地,质量六性靠规则引擎把国标指标翻译成可执行断言。三者的共同失败模式是"有制度无卡点"。**

### 4.1 主数据管理 MDM

**核心做法**(综合 DAMA-DMBOK2 参考数据与主数据域、华为实践、行业通行模式):
- **识别主数据对象**:跨系统共享、描述业务实体的核心数据(客户/产品/供应商/员工/组织/科目)。判断标准:跨系统复用+跨流程统一+相对稳定
- **单一可信源(Single Source of Truth)**:每个主数据对象指定**唯一权威来源系统**(华为"数据源管理政策":每类数据有唯一权威数据源,防止多头维护),其余系统订阅不维护
- **黄金记录(Golden Record)**:多源记录经匹配-合并-存活(survivorship)规则融合为一条黄金记录;MDM 管理风格按集权程度分注册表式/共享式/混合式
- **编码标准化**:主数据编码规则全局唯一(如客户编码、物料编码),新老系统映射表受控管理
- **变更传播**:主数据变更必须按血缘广播到下游订阅系统——这正是华为"数据Owner+数据管家"体系的日常职责之一

**对实时数仓团队的落点**:Flink 作业消费的维表(用户/商品/设备维度)就是数仓内的"事实上的主数据"。落点建议:
1. 每张共享维表声明**唯一生产作业/唯一上游**(禁止两个作业写同一张 Paimon 维表——重复生产是口径漂移的根源)
2. 维表主键唯一性作为强制质量规则(unique 测试或 Flink 去重逻辑+脏行指标),违反即告警
3. 维表 schema 变更走 §6 表变更通知 SOP,下游作业订阅通知后再升级

来源:[DAMA DMBOK2 概览(参考数据与主数据知识领域)](https://www.dama-dk.org/onewebmedia/DAMA%20DMBOK2_PDF.pdf);[《华为数据之道》第 3 章(基础数据/主数据/事务数据/报告数据/观测数据/规则数据六类管理框架)、第 2 章(数据源管理政策/数据 Owner/数据管家)](https://www.scribd.com/document/657987358/%E5%8D%8E%E4%B8%BA%E6%95%B0%E6%8D%AE%E4%B9%8B%E9%81%93)

### 4.2 数据标准落地

**核心做法**——数据标准要"落地"必须完成三个映射:
1. **标准到词根**:业务术语标准化(阿里 OneData 词根管理:cnt/amt/ratio 等基础词根+业务修饰词+日期修饰词+聚合修饰词,组合生成指标命名),表/字段命名从词根库组合生成,禁止自由命名
2. **标准到字段**:数据元级标准(名称/类型/长度/精度/枚举值域/默认值/码值对照)落到物理表 DDL;华为以"信息架构四组件"管理:数据资产目录、数据标准、数据模型、数据分布——信息架构是"公司统一的数据语言"
3. **标准到门禁**:新表建表前对照标准做命名/类型/码值检查(CI 阶段),不合标准不允许发布。华为通过"内控体系赋能数据治理"——遵从性检查嵌入变革流程与 IT 实施,而非靠事后抽查

**失败模式提醒**:标准文档写完发邮件≠落地。判断是否落地只有一个标准:**命名/码值不合标准的表能不能被机器拦下来**。拦不下来就是没落地。

来源:[博客园:OneData 数据中台体系(词根管理/指标分层)](https://www.cnblogs.com/marlon1475/p/19019099);[美团技术团队:OneData 建设探索(基础指标词根表/数据流向规范 ODS→DWD→DWA→APP)](https://tech.meituan.com/2019/10/17/meituan-saas-data-warehouse.html);[《华为数据之道》第 4 章信息架构四组件](https://www.scribd.com/document/657987358/%E5%8D%8E%E4%B8%BA%E6%95%B0%E6%8D%AE%E4%B9%8B%E9%81%93)

### 4.3 数据质量六性与规则引擎工具

**维度口径先行纠偏**(详见 §2.3):国标 GB/T 36344-2018 六性 = 规范性/完整性/准确性/一致性/时效性/可访问性;业界口语六性(完整性/唯一性/一致性/及时性/准确性/有效性)是工程执行层面的近似表述。**执行层映射**:唯一性→一致性(二级指标:数据记录一致性/单实体单记录),有效性→规范性(二级指标:数据格式/值域)。团队对内可用口语六性,对外报告(尤其涉 DCMM/审计)须按国标口径。

**三个规则引擎工具对照**(针对 Flink/Paimon/MySQL/Redis 栈的现实约束:主流 DQ 工具均为批处理范式,实时链路的质量检查需要自行桥接):

| 维度 | Great Expectations (GX) | Soda Core | dbt tests |
|---|---|---|---|
| 运行位置 | Python 进程(任意环境) | Soda CLI(SQL pushdown) | 仓库计算引擎内(随 dbt run/test 批调度) |
| 声明方式 | Python API(Expectation/Suite/Validator/Checkpoint) | SodaCL(YAML 风格声明式) | YAML(generic tests)+ SQL(singular tests) |
| 结果存储 | Data Docs(HTML 报告)+ JSON | JSON + Soda Cloud(UI/告警) | warehouse log + dbt Cloud |
| 告警 | 需外部集成(靠 orchestrator) | 内置(Slack/Teams/PagerDuty) | 非零退出码交给 orchestrator |
| 检查时机 | 开发期复杂校验/CI 门禁 | 生产监控/新鲜度/跨源对账 | 仓库模型主键唯一/非空/引用/行数阈值 |
| 强项 | 300+ 预定义 Expectation、正则/统计/多表比对、Data Docs 可作"数据契约文档" | ML 异常检测(行数/指标漂移)开箱即用;`for each column` 批量声明 | 与 dbt 工作流零摩擦;每个模型 tests 块即活文档 |
| 对本栈适配 | 可用 Python/Spark 读 Paimon 文件校验;适合 CI 阶段对 Paimon 表快照校验 | 多源(MySQL+数仓)对账/新鲜度检查方便;对 Paimon 无原生连接器(走 SQL 引擎) | 仅当数仓层 SQL 逻辑用 dbt 管理时适用;Paimon 原生场景需桥接 |
| 许可 | Apache 2.0 开源(GX Core) | 开源 + 商业 Cloud/Agent | 开源 + 商业 Cloud |

**选型建议(5 问决策树,源自 pipecode 对比)**:①数据只在仓库里且已用 dbt → dbt tests;②数据落在对象存储(Paimon/Parquet)需先校验后入仓 → GX;③要异常检测/跨系统对账/新鲜度 SLA → Soda;④多工具并用时按"物理数据位置+断言族"划界并写进 README;⑤别用 GitHub star 数决策。

**实时链路的现实**:GX/Soda/dbt tests 均为批范式。对 Flink 实时链路,质量检查的等价物是:①Flink 作业内嵌指标(side output 收集脏行计数→Prometheus 指标+告警)②Paimon 快照级校验作业(定时批扫最新快照跑六性规则)③schema 演进拦截(见 §6 表变更 SOP)。**不要指望引入一个"实时数据质量平台"解决全部问题——2026 年仍没有成熟的实时 DQ 开源标准件,组合拳是常态。**

来源:[PipeCode: Data Quality Frameworks 三工具对比](https://pipecode.ai/blogs/data-quality-frameworks-great-expectations-dbt-tests-soda-core);[DataExpert: Soda vs Great Expectations](https://www.dataexpert.io/blog/soda-vs-great-expectations-data-quality-tools);[GB/T 36344 六性口径见 §2.3](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=D12140EDFD3967960F51BD1A05645FE7)

## 5. 国内大厂实践

**本节核心判断:华为与阿里走了两条不同路线但殊途同归——华为以"信息架构+数据Owner责任制"自上而下治数(咨询式,重组织),阿里以"OneData 工具体系"自下而上治数(平台式,重工具);两家共同的硬通货是:唯一权威源、统一口径、血缘可查。实时数仓团队可各取所需:学华为的 Owner/责任划分,学阿里的词根/命名/分层规范。**

### 5.1 华为数据治理(数据底座/数据地图)

依据:《华为数据之道》(华为公司数据管理部著,机械工业出版社 2020,ISBN 978-7-111-66704-9),以下要点均出自该书章节结构([Scribd 全本目录与正文节选](https://www.scribd.com/document/657987358/%E5%8D%8E%E4%B8%BA%E6%95%B0%E6%8D%AE%E4%B9%8B%E9%81%93)):

**1)责任体系(第 2 章)——业务负责制**:"业务即行为,行为即记录,记录即数据。华为公司的每一个数据,必须由对应的业务部门承担管理责任,且必须有唯一的数据 Owner"。分层任命:公司数据 Owner(数据战略制定者/数据资产所有者/数据争议裁决者,拥有公司数据日常管理最高决策权)→领域数据 Owner(各级流程 Owner 兼任)→数据管家。配套四大公司级政策:数据管理总纲、信息架构管理政策、数据源管理政策(唯一权威数据源)、数据质量管理政策。

**2)数据分类管理框架(第 3 章)——按数据特性差异化治理**:结构化数据细分为 6 类,各有治理重点:基础数据(域值表/参考数据)、**主数据**(统一语言核心)、事务数据(业务交易记录)、报告数据、观测数据(感知类)、规则数据;另管理非结构化数据(特征提取)、外部数据(合规遵从)、元数据(作用于数据价值流)。

**3)信息架构四组件(第 4 章)**:数据资产目录、数据标准、数据模型、数据分布——"信息架构是公司统一的数据语言,是业务流打通、消除信息孤岛和提升业务流集成效率的关键要素"。建设核心方法:按**业务对象**设计和落地架构。

**4)数据底座(第 5 章)——"统一数据底座建设"项目 2017-10 立项**:针对"数据搬家多、找不到、读不懂、获取难、不敢信"五大痛点。架构 = **数据湖(逻辑汇聚)** + **数据主题联接(5 种联接方式:多维模型/图模型/标签/指标/算法模型)**。关键纪律:**数据入湖 6 个标准**(物理/虚拟两种入湖方式均须满足),保证"清洁、完整、一致"。数据湖 3 个特点:"逻辑汇聚"而非物理集中。

**5)数据消费(第 6 章)——数据地图**:以用户体验为核心的数据消费门户(核心价值+关键能力),数据供应"三个 1"目标(1 分钟内可找到、1 小时内可获取……的自助供应 SLA 表述),推动"人人都是分析师"(从保姆模式到服务+自助模式)。

**6)数据质量(第 8 章)**:基于 **PDCA** 的质量管理框架,数据质量规则+异常数据监控(全面监控业务异常),设计质量度量+执行质量度量双轨,以质量综合水平牵引改进——与 ISO 8000-61 的过程模型同构。

**对 data 团队可借鉴的排序**:①数据 Owner/唯一权威源纪律(成本最低、收益最大)②入湖六标准思想(进数仓前先定验收标准)③PDCA 质量度量双轨 ④数据地图(元数据门户)——排最后,因为它是组织规模化的产物。

### 5.2 阿里数据中台治理体系(OneData)

依据:阿里《大数据之路:阿里巴巴大数据实践》方法论与美团等外部实践记录:

**1)OneData 体系 = 统一化的集团数据整合及管理方法体系**,针对的核心痛点:指标口径混乱、模型重复建设、数据孤岛、开发效率低下。核心思想:从设计、开发、部署和使用层面避免重复建设和指标冗余,保障数据口径规范统一,实现数据资产全链路关联。三特性:统一性、唯一性、规范性(美团技术团队总结引述)。

**2)规范定义层(治本之策)**:业务术语标准化(集团级业务知识库,如明确定义"支付成功订单"= 已付款+未退款+物流签收);指标三分法:**原子指标**(描述特定事件/行为/状态,如支付金额)→**衍生指标**(原子指标+时间周期+修饰词,如"近 7 天支付金额")→**派生/复合指标**(如 CTR=点击/曝光);词根库管理(基础指标词根 cnt/amt/ratio + 业务修饰词 + 日期修饰词 + 聚合修饰词 wtd/mtd)。

**3)模型分层规范**:ODS(操作数据层,贴源)→CDM/DWD+DWS(公共维度模型层,明细事实+维表+公共汇总)→ADS(应用数据层);配套**分层引用原则**(美团落地版:正常流 ODS→DWD→DWT→DWA→APP;禁止 DWT/DWA/APP 直接引用 ODS;避免同主题域 DWT 生成 DWT;反向检查——若出现 ODS→DWD→DWA→APP 直连说明主题域没盖全)。模型设计原则:高内聚低耦合。

**4)工具平台层(落地引擎)**:DataWorks 承载可视化建模+规范落地( SQL 生成),Dataphin 承载 OneData 方法论的产品化;质量保障靠统一指标口径(OneData)+血缘追踪(元数据)+数据质量卡点(非空/唯一性校验,DQC)。数据资产视角:数据公共层建设的目的是解决"数据每年 2.5 倍速增长远超业务增长"的共享问题——治理首先是成本问题。

**对 data 团队可借鉴的排序**:①词根库+指标命名规范(立即可用,零成本)②分层引用原则(实时数仓对应 ODS→DWD→DWS→ADS 的作业拓扑纪律)③指标三分法登记(原子指标全局唯一,衍生指标声明式定义)④DataWorks 类平台(规模化后才值得)。

来源:[博客园:OneData 数据中台体系](https://www.cnblogs.com/marlon1475/p/19019099);[美团技术团队:OneData 建设探索之路(SaaS 收银运营数仓)](https://tech.meituan.com/2019/10/17/meituan-saas-data-warehouse.html);[腾讯云:阿里数据仓库数据模型建设方法总结](https://cloud.tencent.com/developer/article/2248640);[阿里云开发者:阿里巴巴数据仓库建模方法论与分层架构实践](https://developer.aliyun.com/article/1673583);[《华为数据之道》Scribd 全本](https://www.scribd.com/document/657987358/%E5%8D%8E%E4%B8%BA%E6%95%B0%E6%8D%AE%E4%B9%8B%E9%81%93)

## 6. 实时数仓团队(Flink/Paimon/Fluss/Dinky)能力落点建议

**本节核心判断:实时数仓的治理抓手比离线数仓少(没有调度天然卡点),所以必须把治理固化为三样"机器可执行"的东西:Schema Registry 式的表元数据登记(资产目录)、CI/CD 里的门禁脚本(标准+质量)、事件化的变更通知(血缘下游感知)。凡是靠人自觉的环节,在实时链路里一定会失效。**

### 6.1 应固化的 SOP(按优先级排序)

**SOP-1 表变更通知(最高优先级——实时链路的独特痛点)**
- **场景**:MySQL 源表 DDL 变更 → Flink CDC 同步作业反序列化失败/静默丢字段 → Paimon 表 schema 漂移 → 下游任务炸或产出错误数据。实时链路里上游变更的影响传播是分钟级的,靠下游"发现任务挂了"再排查是灾难
- **固化动作**:①所有被 CDC 订阅的源表在登记台账中记录"订阅方作业清单"(谁在同步这张表);②源库 DDL 变更走审批(哪怕是一个群里的审批流);③变更执行前自动通知订阅方 Owner,约定停写/升级窗口;④Flink 作业开启 schema 变更失败告警(deserialization error 指标)并演练"上游加列"的常规处理路径
- **验收**:一次真实的源表加列演练,下游作业全程无人工救火

**SOP-2 质量门禁(六性规则进 CI/CD)**
- **固化动作**:①每张对外表(ADS/DWS 层)登记一组六性规则(按 §4.3 口径映射):非空率(完整性)、主键唯一(唯一性/一致性)、枚举值域(有效性/规范性)、行数环比波动阈值(及时性+准确性)、跨表一致性(如数仓总额 vs 源库总额);②规则文件入 Git,版本化;③CI 阶段:开发提交新表/改表 → 自动跑规则(对 Paimon 最新快照)→ 失败阻断发布;④生产阶段:定时校验作业(Soda/GX 或自研 SQL 检查)跑同套规则 → 失败分级告警(blocker 级打电话,warn 级群里日报);⑤杜绝"规则文档在 wiki、检查靠眼睛"
- **验收**:任选一张核心表,能回答"它的质量规则有哪些、上次什么时候跑的、结果在哪"

**SOP-3 表元数据登记(轻量数据资产目录)**
- **固化动作**:①每张表登记:业务含义(一句话)、Owner(唯一责任人)、层级(ODS/DWD/DWS/ADS)、生产作业名、上游依赖、更新频率、保留策略(生命周期/退役计划——入表时代这条有会计意义);②登记表本身放 Git/配置中心,新表 PR 必须带登记信息,不带不合;③季度对账:实际存在的表 vs 登记的表,孤儿表(无 Owner 无登记)限期认领或下线
- **验收**:新同事拿登记表能画出全链路拓扑

**SOP-4 指标口径登记(OneData 简化版)**
- **固化动作**:①原子指标库(全局唯一,如支付金额、活跃用户数,各带一句话口径+单位+统计去重规则);②衍生指标在登记时声明"原子指标+时间窗+过滤条件",禁止复制粘贴口径;③同名不同径 = 事故,发现即在登记库中标注重复并裁决唯一口径
- **验收**:报表上任意数字能通过登记库追溯到原子指标定义

**SOP-5 分层与命名规范(词根库)**
- **固化动作**:①分层引用纪律(实时版:ODS 只被 DWD 引用;DWS 不直读 ODS;禁止 ADS 跨层直读 ODS);②命名规范表/字段从词根库组合(层前缀+主题域+业务过程+词根+粒度后缀);③CI 里放一个命名 lint 脚本,10 行代码,拦住 80% 的乱命名
- **验收**:CI 有命名检查且曾真实拦下不合规范的 PR

**SOP-6 主数据/维表管理纪律**
- **固化动作**:①每张共享维表唯一生产作业(见 §4.1);②维表变更(schema/口径)走 SOP-1 通知链;③维表对账:定时跑"维表行数 vs 上游源表行数"漂移检查
- **验收**:不存在两套用户维表同时被不同作业引用而无人知晓

### 6.2 检查清单模板(可直接抄走用)

**新表上线检查单**:
```
□ 已在表登记台账登记(Owner/业务含义/层级/上游/保留策略)
□ 命名符合词根规范(CI lint 通过)
□ 已配置六性质量规则(至少:非空/主键唯一/行数波动)
□ 上游源表已在 CDC 订阅清单中,订阅关系已登记
□ 涉及个人信息的字段已打标并同步安全域负责人(边界项,见 §7)
□ 已确认不与既有表口径重复(指标登记库查重)
```

**源表 DDL 变更检查单(给上游业务库团队)**:
```
□ 在表登记台账查到全部下游订阅作业
□ 已逐一通知订阅作业 Owner 并确认窗口
□ 新增列:确认 Flink CDC 作业的容错行为(compatible/需重启)
□ 删列/改类型:与下游确认停写与回填方案后再执行
□ 变更后 24h 内检查下游作业 checkpoint 与数据到达率
```

**季度治理审计清单**:
```
□ 孤儿表清点(无 Owner/无登记/90 天无消费)→ 认领或下线
□ 质量规则覆盖率:ADS/DWS 核心表应有规则的比例 ≥ 目标值
□ 质量告警处理复盘:blocker 级平均处置时长
□ 登记信息与实际 schema/血缘的偏差率
□ (如涉入表)入表数据资产的元数据证据链完整性
```

### 6.3 工具映射到本栈的落地路径

| 治理能力 | 本栈落地建议 | 起步成本 |
|---|---|---|
| 表登记台账 | Git 管理的 YAML/CSV 目录仓库 + Dinky/Dolphin 作业清单对齐 | 半天 |
| 质量门禁 | CI 阶段用 GX/自研 SQL 扫 Paimon 快照;生产用定时 Flink batch 或 Spark job 跑规则 | 2-3 天 |
| 变更通知 | 现有 IM 群+审批流即可起步,台账驱动(不强求建平台) | 半天 |
| 指标登记 | Git markdown/YAML 起步,后期迁 OpenMetadata/DataHub | 1 天 |
| 血缘 | Flink SQL 作业拓扑用脚本解析 Dinky 元数据生成静态血缘;不强求实时血缘平台 | 2 天 |
| 命名 lint | CI 里的 10-50 行脚本 | 2 小时 |

**优先级提醒**:先 SOP-1/2(变更通知+质量门禁)后平台化。华为数据地图/阿里的 DataWorks 是组织规模化后的形态;小团队先把"机器拦得住"的三件事做实,平台化留给未来。

## 7. 与数据安全域的边界

**边界一句话**:本域(数据治理)管"数据的秩序"——标准/质量/主数据/元数据/资产;数据安全域管"数据的保护"——分类分级、访问控制、个保法/数安法/跨境合规。两域在三个点必须握手,其余互不侵入:①**分类分级**:治理的资产目录给安全域提供"有什么数据",安全域回填敏感级别;②**生命周期**:退役/销毁环节的"脱敏后销毁"要求来自安全合规(见 §3.2 深圳财政局通知),执行由治理 SOP 承载;③**新表检查单**:涉及个人信息的字段打标属安全域职责,治理检查单里只留"已打标并同步"一项(见 §6.2)。数据安全法规的详细调研见安全域文档,本文不展开。

## Appendix A: 标准条目速查表

| # | 标准/框架 | 发布机构 | 年份 | 现行状态 | 核心内容 | 对实时数仓团队的实际约束 |
|---|---|---|---|---|---|---|
| 1 | DAMA-DMBOK2 | DAMA International | 2017 | 现行(行业指南) | 11 知识领域,治理居轮毂 | 话语体系对齐,无合规约束 |
| 2 | DGI 框架 | Data Governance Institute | 2000s 起,持续维护 | 现行(免费公开) | 10 组件,WHY/WHAT/WHO/HOW;Big G vs little g | 程序完备性检查表;决策人+传递链路 |
| 3 | COBIT 2019 | ISACA | 2018 | 现行 | 40 治理/管理目标,5 域(EDM/APO/BAI/DSS/MEA) | 审计时被引用;直接实施性价比低 |
| 4 | ISO/IEC 38505-1 | ISO/IEC JTC1/SC40 | 2017(已废止);2026-08 v2 | **2017 版废止,2026 版现行** | 38500 六原则应用到数据;数据问责地图 | 管理层治理语言;团队供度量物 |
| 5 | ISO 8000 系列 | ISO TC 184 | 2011-2022 各部分 | 现行(滚动修订) | -8 质量概念测量/-61 过程参考模型(PDCA)/-110 主数据交换/-150 角色职责 | "需求必须机器可查"=规则引擎理论源头;-61 即质量门禁 SOP 骨架 |
| 6 | DCAM v3 | EDM Council | 2017;v3 2024-2025 | 现行(会员制) | 8 组件/38 能力/118 子能力/~2000 评估因子;姊妹模型 CDMC(14 域) | 金融客户/审计常引用;评估因子写法可借鉴 |
| 7 | DCMM(GB/T 36073-2018) | 市场监管总局/国标委 | 2018-03 发布,2018-10 实施 | **已废止**(被 2025 版替代) | 8 能力域/28 能力项/445 指标/5 级 | 首个国标;企业申报 DCMM 3 级的证据链 |
| 8 | DCMM 2.0(GB/T 36073-2025) | 市场监管总局/国标委 | 2026-01 发布,**2026-07-01 实施** | **现行** | 9 能力域(新增数据资产)/33 能力项/486 指标;L2 基准,L4 要求 AI | 新一轮申报与补贴的对标物;数据资产域与新政策闭环 |
| 9 | GB/T 34960 系列(ITSS 治理) | 市场监管总局/国标委 | Part1 2017,其余 2018 | 现行 | Part1 IT 治理通用要求;**Part5 数据治理规范** | ITSS 评估依据;组织与职责划分的国标依据 |
| 10 | GB/T 36344-2018 | 市场监管总局/国标委 | 2018-06 发布,2019-01 实施 | **现行** | 质量评价 6 一级指标:规范性/完整性/准确性/一致性/时效性/可访问性 | 质量规则一级分类的国标口径;对外报告/审计必用 |
| 11 | 数据二十条 | 中共中央/国务院 | 2022-12-19 | 现行政策 | 产权(三权分置)/流通交易/收益分配/安全治理四大制度 | 权属台账前置;数据产品经营的准入语境 |
| 12 | 财会〔2023〕11 号(入表) | 财政部 | 2023-08 印发,2024-01-01 施行 | 现行 | 数据资源确认为无形资产/存货;治理成本计入资产成本;披露要求 | 元数据+质量记录成为审计级证据;退役销毁有会计意义 |

## Appendix B: 参考来源清单

**国际框架**
- DAMA DMBOK2 官方概览 PDF:https://www.dama-dk.org/onewebmedia/DAMA%20DMBOK2_PDF.pdf
- Atlan:DAMA DMBOK Framework 指南:https://atlan.com/dama-dmbok-framework
- DGI 框架总览:https://datagovernance.com/the-dgi-data-governance-framework/
- DGI 10 组件:https://datagovernance.com/the-dgi-data-governance-framework/dgi-data-governance-framework-components/
- DGI 组件#10(Steward/Custodian):https://datagovernance.com/the-dgi-data-governance-framework/framework-component-10-data-governance-participants/
- ISACA COBIT 官方页:https://www.isaca.org/resources/cobit
- COBIT 2019 Governance and Management Objectives 全文 PDF:https://erp.ebsafr.com/files/COBIT%202019%20Framework%20-%20PDF.pdf
- ISACA:40 objectives/5 domains 行业文章:https://www.isaca.org/resources/news-and-trends/industry-news/2020/using-cobit-2019-to-plan-and-execute-an-organization-transformation-strategy
- ISO 38505-1:2017(Withdrawn):https://www.iso.org/standard/56639.html
- ISO 38505-1:2026(Edition 2):https://www.iso.org/standard/87195.html
- IEC webstore 38505-1:https://webstore.iec.ch/en/publication/60383
- ISO 8000-110:2021:https://www.iso.org/standard/78501.html
- ISO 8000-8:2015:https://www.iso.org/standard/60805.html
- ISO 8000-61:2016 预览:https://cdn.standards.iteh.ai/samples/63086/a26a685e6dfa4c129dfbd4930176d218/ISO-8000-61-2016.pdf
- ISO 8000-150:2022 预览:https://cdn.standards.iteh.ai/samples/80753/9514262e219645279238c120b2f0b8a7/ISO-8000-150-2022.pdf
- EDM Council DCAM:https://edmcouncil.org/frameworks/dcam/
- DCAM v3 公告:https://edmcouncil.org/announcement/announcing-dcam-v3-meet-the-new-standard-for-your-data/
- Snowflake:DCAM Explained:https://www.snowflake.com/en/data-governance/frameworks/dcam/

**国内标准**
- openstd GB/T 36073-2018(废止):https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=B282A7BD34CAA6E2D742E0CAB7587DBC
- 新浪财经:GB/T 36073-2025 发布:https://finance.sina.com.cn/roll/2026-01-15/doc-inhhiyxz3481770.shtml
- 腾讯云开发者:DCMM 2.0 九大能力域 486 指标:https://developer.cloud.tencent.com/article/2714705
- 全国 DCMM 评估公共服务平台:http://www.dcmm.org.cn/
- DAMA China DCMM 解读:https://www.dama.org.cn/wordpress/2023/07/27/数据管理能力成熟度模型dcmm一文读懂/
- openstd GB/T 34960.5:https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=F3B2108863A2292F5AF0FA645CEE047F
- 国家标准馆 GB/T 34960.1:https://ndls.cnis.ac.cn/standard/detail/ba4ce67e5eba1f49e3b1b90f5ce6be92
- 工标网 34960.1:http://csres.com/detail/306330.html
- openstd GB/T 36344-2018(现行):https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=D12140EDFD3967960F51BD1A05645FE7
- CSDN:GB/T 36344 指标摘录:https://blog.csdn.net/qq_42393720/article/details/138327129
- 龙石数据:六维度框架:https://www.longshidata.com/blog/c/c2026082601.html

**国内政策**
- 发改委:数据产权制度专家文章:https://www.ndrc.gov.cn/wsdwhfz/202304/t20230410_1353438.html
- 黄石政府网:三权表述迭代:https://www.huangshi.gov.cn/xxxgk/2020_zc/zcjd/202604/t20260402_1318472.html
- 百度百科:企业数据资源相关会计处理暂行规定(全文引用):https://baike.baidu.com/item/企业数据资源相关会计处理暂行规定/63345394
- 深圳市财政局通知:https://szfb.sz.gov.cn/gkmlpt/content/11/11350/post_11350453.html
- 德勤中国:入表应对:https://www.deloitte.com/cn/zh/services/consulting-risk/perspectives/data-resources-management.html
- 锦天城:数据治理助推入表:https://www.allbrightlaw.com/CN/10475/fd49330c9b5a0612.aspx

**工程实践与大厂**
- PipeCode:GX vs dbt tests vs Soda Core:https://pipecode.ai/blogs/data-quality-frameworks-great-expectations-dbt-tests-soda-core
- DataExpert:Soda vs GX:https://www.dataexpert.io/blog/soda-vs-great-expectations-data-quality-tools
- 博客园:OneData 数据中台体系:https://www.cnblogs.com/marlon1475/p/19019099
- 美团技术团队:OneData 建设探索:https://tech.meituan.com/2019/10/17/meituan-saas-data-warehouse.html
- 腾讯云:阿里数据模型建设方法总结:https://cloud.tencent.com/developer/article/2248640
- 阿里云开发者:阿里数仓建模方法论:https://developer.aliyun.com/article/1673583
- 《华为数据之道》Scribd 全本(华为公司数据管理部著,机械工业出版社 2020,ISBN 978-7-111-66704-9):https://www.scribd.com/document/657987358/华为数据之道

**方法与局限声明**:调研日期 2026-09-04;标准状态以 openstd.samr.gov.cn 与 iso.org 官网页面当日显示为准(关键变更:ISO/IEC 38505-1 与 GB/T 36073 均在 2025-2026 发生版本更替,引用旧版时需注意)。DCMM 2.0 能力域/指标数(9 域/33 项/486 指标)来自第三方解析文章与百度百科,建议以标准正式文本为最终依据。华为/阿里实践部分来自公开出版书籍与厂商技术博客,属方法论层面引用,非内部流程披露。
