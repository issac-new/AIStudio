# 数据架构域调研:国际方法论、国内实践体系、DCMM 要求与工程化落地

> 调研日期:2026-09-04 | 服务对象:Hermes 集群 data 团队(Flink/Paimon/Fluss/Dinky/MySQL/Redis 实时数仓栈;角色 orchestrator/arch/flink/infra)
> 边界声明:本域只覆盖【数据架构】——建模方法论、架构分层、元数据/血缘工程选型、建模工具工程化;数据治理(标准/质量/主数据)、数据安全法规、数据分析由其他代理负责,交叉点仅在 §3(DCMM 数据架构域引用)与 §6(团队落点涉及治理接口)提及。
> 时效声明:文中数据检索于 2026-09-04;开源项目活跃度数据反映 2026 年 8 月前后窗口(标注于具体条目)。

## Executive Summary

**主旨:对 Flink+Paimon 实时数仓团队,数据架构的正确姿势是"Kimball 分层为骨、流式变更传播为脉、元数据/血缘自动化为翼"——六套国际/国内方法论收敛于同一套可固化动作:分层规范、命名检查器、血缘自动采集、模型评审门禁。**

三个决定性发现:

1. **方法论选择的争议在实时场景下有明确裁决**:Kimball vs Inmon 之争、Data Vault 2.0 之争,对实时数仓团队都不是二选一——主流工程实践(阿里云官方示例、Ververica Streamhouse 模式)是 ODS/DWD/DWS/ADS 分层 + Kimball 维度建模做消费层,Paimon 的 changelog 传播机制替代了 Inmon 的"集成层"和 Data Vault 的"变更吸收层"职能[23][24]。Data Vault 的历史化/审计诉求在实时场景由 Paimon merge-engine + 快照机制承担,不必引入 Hub/Link/Satellite。
2. **国内两套实践体系(华为信息架构/阿里 OneData)回答的是同一个问题——"公共层如何复用",但颗粒度不同**:华为面向集团级信息架构(L1-L3 资产目录+四大组件),阿里面向数仓产线(分层+总线矩阵+命名检查器)。对百人以下的数仓团队,阿里 OneData 的颗粒度可直接照抄,华为体系的 L3"业务对象"概念值得引入作为数据 Owner 判定锚点[14][15][31]。
3. **元数据/血缘工程选型的硬约束是"连接器是否覆盖 Flink/Paimon 栈"**,不是功能清单长短:2026-08 时点,活跃维护的只有 OpenMetadata 和 DataHub 两家[21];Paimon 已通过 FLIP-314 从 Flink 侧暴露血缘接口[42],但 OpenMetadata 的 Paimon 原生连接器仍是社区待办 issue[43]——选型必须按"血缘从 Flink SQL 网关/Dinky 侧采集"的务实路线设计,不能假设开箱即用。

本文档回答六个问题:A 国际方法论标准(§1) B 国内实践体系(§2) C DCMM 数据架构域(§3) D 元数据/血缘选型(§4) E 建模工程化与 Lakehouse 适配(§5) F 实时数仓团队落点 SOP(§6,全文档归宿)。

## 1. 国际方法论标准

**本节核心判断:DAMA-DMBOK2 和 TOGAF 提供"架构应管什么"的清单,Kimball/Inmon/Data Vault 提供"怎么建"的流派——它们全部诞生于批处理时代,实时数仓团队要做的映射是:把"集成层/变更吸收"职能交给 Paimon changelog,把"消费层建模"留给 Kimball。**

### 1.1 DAMA-DMBOK2 数据架构知识域

| 属性 | 内容 |
|---|---|
| 全称 | Data Management Body of Knowledge, 2nd Edition(第 4 章 Data Architecture) |
| 发布机构 | DAMA International |
| 年份 | 2017(第 2 版);2024 修订版;DMBOK3 在研(2025 启动) |
| 现行状态 | 现行,行业协会最佳实践指南,**非认证标准、不规定控制项**[2] |
| 性质 | 知识体系(11 个知识领域,数据治理居轮毂中心) |

**核心内容**(DMBOK2 修订版第 4 章结构[1]):
- **企业数据架构两大交付物**:企业数据模型(Enterprise Data Model,概念层~逻辑层) + 数据景观设计(Data Landscape Design,识别数据需求→维护蓝图)。
- 修订版新增 Goals and Principles 章节;Zachman 框架移为附录;活动重组为 6 大项(含"文档化现有架构 + 维护目标架构"拆分);技术章节新增数据流图、预算约束、有效度量[1]。
- 数据架构与其他知识域的治理接口:数据建模与设计、数据集成与互操作、元数据管理[1]。
- 关键定义:数据架构 = "定义数据需求、指导数据资产整合与控制、使数据投资与业务战略匹配的整体构件规范"——这一定义被 DCMM 直接借用(见 §3)[38]。

**对数据团队的实际约束**:DMBOK2 数据架构域的实质约束是**交付物完备性**——企业数据模型、CRUD 矩阵(数据实体×业务功能)、数据流图。它不管实现细节。对实时数仓团队的可执行映射:①企业数据模型不必画全公司,但**数仓的核心业务对象(用户/订单/设备/…)及其关系图必须存在且有 Owner**;②CRUD 矩阵对应到"Paimon 表×消费作业"的读写关系,这正是血缘系统的查询视图(见 §4)。

来源:[DAMA 官方 DMBOK2 修订摘要](https://www.damadmbok.org/dmbok2-revisions)[1];[Data Landscape: DAMA-DMBOK2 状态条目](https://www.data-landscape.com/regulation/dama-dmbok/)[2];[atlan DMBOK 框架指南](https://atlan.com/dama-dmbok-framework/)

### 1.2 TOGAF 数据架构(Phase C)

| 属性 | 内容 |
|---|---|
| 全称 | The Open Group Architecture Framework, ADM Phase C: Information Systems Architectures – Data Architecture |
| 发布机构 | The Open Group |
| 年份 | TOGAF 8.1.1(2000s)→ 9.1(2011)→ TOGAF 10;数据架构章节自 8.1.1 起稳定 |
| 现行状态 | 现行(TOGAF 10 下 Phase C 结构延续) |
| 性质 | 企业架构方法,数据架构是 Phase C 的两个组成之一(数据+应用) |

**核心内容**(Open Group 官方 Phase C Data Architecture 章节[9]):
- **目标**:定义支持业务所需的主要数据类型和来源,做到可被利益相关者理解、完整一致、稳定;**明确声明"这与数据库设计无关"**——是定义企业数据实体,不是设计逻辑/物理存储[9]。
- **关键决策项**:哪个应用组件是各主数据的 System of Record;是否建立企业级统一数据标准(商用套件常不可妥协);数据实体被哪些业务功能/流程/服务使用;数据实体在哪里创建、存储、传输、报告[9][10]。
- **过程**:收集数据模型→合并数据需求形成数据清单→跨架构更新矩阵(数据×业务功能、应用×数据)→从创建/分发/迁移/安全/归档视角细化视图[9]。
- **产出物清单**:目录(Data Entity/Component catalog)+ 矩阵(Data Entity/Business Function、Application/Data)+ 图(概念数据图、逻辑数据图、数据分发图、数据安全图、数据迁移图、数据生命周期图)[10]。
- **数据治理三维度检查**:Structure(组织与标准机构)、Management System(管理体系)、People(技能与角色)[10]。

**对数据团队的实际约束**:TOGAF 的价值是**"先选 System of Record 再建仓"**这条纪律——数仓团队接入任何 MySQL 源表前,应能回答"这张表的权威源是哪个库、谁拥有"。产出物清单中,数据生命周期图/数据分发图对应到实时数仓就是**分层血缘图(ODS→DWD→DWS→ADS 的数据流向图)**,可用血缘平台自动生成而非手绘(见 §4)。

来源:[Open Group TOGAF Phase C Data Architecture 原文](https://www.opengroup.org/architecture/doc-review/protected-d3/htmlclean/chap10.html)[9];[QualiWare TOGAF 9.1 Phase C 引文](https://coe.qualiware.com/resources/togaf/9-1/part2-adm/phase-c-information-systems-architectures-data-architecture/)[10]

### 1.3 Kimball 维度建模 vs Inmon CIF

| 维度 | Kimball(维度建模/总线矩阵) | Inmon(CIF/自上而下) |
|---|---|---|
| 建设顺序 | 自下而上:总线矩阵→逐业务过程建星型模型→数据集市合并 | 自上而下:先建规范化(3NF)企业级数仓→再派生部门集市 |
| 核心结构 | 星型/雪花/星座模型,事实表+一致性维度 | 企业级 EDW(3NF)+ 下游 Data Mart |
| 集成手段 | 一致性维度(Conformed Dimensions)跨集市对齐 | EDW 集中集成,集市是派生物 |
| 上手成本 | 低——工程师少、技能要求低,迭代快 | 高——需要专职建模团队,周期长 |
| 适合场景 | 分析需求驱动、快速见效、中小团队 | 业务变化频繁、企业级一致性要求高、大型组织 |

**核心事实**:两派争论至今没有裁决——业界结论是"各有所长,按场景选,且实践中大量混合(EDW 层 3NF + 集市层星型)"[3][4]。值得注意的是**阿里 OneData 明确选择了 Kimball 路线并加以升级**:第三代模型架构的核心 CDM 层全部采用多维模型,以 Kimball 维度建模为核心理念构建总线矩阵(业务板块/数据域/业务过程/维度/原子指标/业务限定/时间周期/派生指标的八要素体系)[13][12]。这等于中国头部互联网为"维度建模优先"投了实票。

**对实时数仓团队的实际约束与裁决**:
- **选 Kimball 做消费层建模**(DWD 明细宽表 + DIM 一致性维度 + DWS 汇总),这是 OneData 和 Streamhouse 实践的共同底座[12][23]。
- Inmon 的"企业级集成层"职能在 Flink+Paimon 架构中由 **ODS changelog → DWD 的统一接入**承担:Paimon 每层的 changelog-producer 让变更以分钟级传播到下一层,不需要先建一个集中 3NF 仓库再派生[24][26]。
- **总线矩阵是低成本高杠杆动作**:一张表(行=业务过程,列=维度,格=有无关联)就能暴露维度不一致问题,建议作为 arch 角色的首个固化产物(见 §6.1)。

来源:[Inmon vs Kimball 对比](https://medium.com/@goyalarchana17/data-warehouse-architecture-approaches-inmon-vs-kimball-0bd8f04bb5cf)[3];[Keboola: 成本与技能对比](https://www.keboola.com/blog/kimball-vs-inmon)[4];[阿里数据中台演进(3NF→Greenplum→OneData/Kimball)](https://www.shopex.cn/news/archives/5976.html)[13];[OneModel 八要素总线矩阵](https://www.cnblogs.com/zsql/p/15768139.html)[12]

### 1.4 Data Vault 2.0:适用场景与争议

| 属性 | 内容 |
|---|---|
| 全称 | Data Vault 2.0(建模+架构+方法论+实施四件套) |
| 发布机构 | Dan Linstedt(DVUDC,商业认证体系) |
| 年份 | 2000 年代初提出,约 2013 年扩展为 2.0 |
| 现行状态 | 现行(商业方法论,非开放标准;认证培训生态活跃) |
| 性质 | 数仓集成层建模方法论:Hub(业务键)+ Link(关系)+ Satellite(上下文/历史) |

**适用场景**(两个以上成立才值得上)[5][7]:
1. **高源变 volatility**:多源系统、频繁 schema 变更、有并购预期;
2. **监管审计压力**:金融/医保/电信/保险——审计师要求"证明 Q3 关账日这数是对的";
3. **多源身份解析**:同一客户在 5+ 系统有不同 ID。

**争议(反方证据充分)**:
- **对象爆炸与维护成本**:"太多对象、太多建模纪律、依赖小众专家、维护太重"是真实采用障碍,不是神话[5]。Ben Morris 的实践复盘:概念简单(raw vault/business vault、hard/soft rules、PIT/bridge 表层层叠加),但"新手陷阱多,无培训与顾问支持不要上"[6]。
- **语义完整性争议**:2.0 为自动化工具让路,把 Link 泛化(任意外键皆可成 Link),被批评从"语义账本"退化为"看似正确的图"[8]。
- **替代 Kimball 是伪命题**:"我们用 Vault 替换 Kimball 后一切更快"的博客都是假的——要么 Vault 上面仍跑 Kimball 星型服务查询,要么分析师很不爽[7]。**Vault 是集成层,不是消费层;分析师应查询 Vault 上建的星型集市,不查 Vault 本身**[5]。
- **时效**:GenAI 辅助建模(自动生成 Hub/Link/Satellite 候选、映射、文档)正在降低"太重"的门槛,有重新评估其成本收益的观点[5]。

**对实时数仓团队的实际约束与裁决**:**不引入 Data Vault**。理由:①其历史化(每变更一行新纪录+load_ts)与审计结构化优势,Paimon 的 merge-engine(deduplication/partial-update/aggregation)+ 快照机制已在表存储层提供等价能力,且是分钟级而非 T+1[24][26];②其对象爆炸成本对小团队不可承受[5][6];③实时数仓的消费层本来就是 Kimball 星型,Vault 在中间加一层只增加维护面。**保留其一个思想**:每个表带 `load_ts`/`source_system` 审计列——这是零成本的审计结构化(进 §6 检查清单)。

来源:[Navicat/Data Modeler: DV2.0 何时用/何时不用](https://navicat.com/en/company/aboutus/blog/3970-designing-better-databases-with-data-vault-2-0-and-navicat-data-modeler-4.html)[5];[Ben Morris 实践批评](https://ben-morris.com/data-vault-2-modelling-the-good-the-bad-and-the-downright-confusing)[6];[PetaScale Labs: Why Data Vault Exists(Vault→星型服务分层)](https://petascalelabs.com/curriculum/dimensional-data-modeling/data-vault-2/why-data-vault-exists)[7];[Reddit 数据工程社区对比](https://www.reddit.com/r/dataengineering/comments/rnmumx/kimball_vs_inmon_vs_vault/)[8]

### 1.5 国际方法论对照表(一张图看分工)

| 方法论 | 管什么 | 对实时数仓团队的可执行产物 | 是否直接采用 |
|---|---|---|---|
| DAMA-DMBOK2 第 4 章 | 架构知识域交付物清单 | 企业数据模型(核心对象级)、CRUD 矩阵=表×作业读写视图 | 借用清单,不引入流程 |
| TOGAF Phase C | System of Record 判定 + 产出物目录 | 每张接入表的"权威源+Owner"登记 | 借用纪律 |
| Kimball | 消费层星型建模 | 总线矩阵、一致性维度、事实表四步法 | **核心采用** |
| Inmon CIF | 企业级集成层 | 由 Paimon changelog 分层传播替代 | 职能替代 |
| Data Vault 2.0 | 变更吸收+审计历史化 | 由 merge-engine+快照替代;保留审计列思想 | 不引入 |

## 2. 国内实践体系

**本节核心判断:华为《数据之道》与阿里 OneData 是国内两套成体系的数据架构方法论——华为强在"信息架构=公司统一语言"(L1/L2/L3 资产目录+四大组件+数据 Owner),阿里强在"数仓产线工程化"(分层+总线矩阵+命名检查器+指标体系)。数仓团队照抄阿里颗粒度,补华为的业务对象 Owner 概念。**

### 2.1 华为《数据之道》:数据分类、数据底座、信息架构

| 属性 | 内容 |
|---|---|
| 全称 | 《华为数据之道》(机械工业出版社,2020);配套《华为数据治理之旅》白皮书 |
| 发布机构 | 华为公司数据管理部(非标准组织,企业实践总结) |
| 年份 | 2020(白皮书 2020-08) |
| 现行状态 | 现行(书籍+白皮书公开可查;方法论持续演进) |
| 性质 | 企业级数据治理与数据架构实践方法论 |

**核心方法论一:企业级信息架构四大组件**[15][16]:
1. **数据资产目录**:L1 主题域分组(最高层级分类)→ L2 主题域(互不重叠、同 Owner)→ L3 业务对象(核心层,重要的人/事/物,治理围绕其开展)→ L4 逻辑数据实体 → L5 属性;
2. **数据标准**:关键数据被识别、分类、定义及标准化,定义在公司范围内唯一,考虑跨流程要求[15];
3. **数据模型**(概念/逻辑/物理);
4. **数据分布**(数据在系统/流程中的产生与使用位置)。

**核心方法论二:数据分类框架**(按主权/结构/描述三轴)[15]:
- 按主权:外部数据/内部数据;
- 按结构:结构化(细分为**基础数据/主数据/事务数据/报告数据/观测数据/规则数据**六类)、非结构化、元数据;
- 六类结构化数据的判别特征明确(如主数据=跨流程跨系统复用、有唯一权威源;观测数据=量大、过程性、机器采集)。

**核心方法论三:数据底座**[15][14]:
- 两层结构:**数据湖**(逻辑上各种原始数据集合,保留原格式、原则上不清洗)+ **数据主题联接**(对湖数据按业务流/对象联接计算,形成主题数据);
- 主题联接五种方式:多维模型、图模型、指标、标签、算法模型[15];
- 建设四原则:数据安全、需求+规划双轮驱动、多场景供应(离线/实时、物理/虚拟)、**信息架构遵从**(资产须经 IA-SAG 信息架构专家组发布注册)[15];
- 元数据管理四步:产生(业务↔技术元数据连接)→采集(统一元模型自动采集)→注册(增量+存量)→运维(元数据中心管理全过程)[15]。

**对数据团队的实际约束**:华为体系的约束力在"**每个业务对象有 Owner、资产注册才能入底座**"。数仓团队的可移植动作:①L3 业务对象粒度最适合作为 Paimon 分层库的"数据域"划分依据(用户域/交易域/设备域…);②"信息架构遵从"落地为**表注册门禁——未登记 Owner 和业务域的表不允许进公共层**(§6.3 检查项);③华为五级数据密级/四级隐私分级属于数据安全域,本域不展开(见边界声明)。

来源:[华为数据之道总结(博客园,信息架构/分类/底座全文摘录)](https://www.cnblogs.com/qq1035807396/p/17116651.html)[15];[华为数据治理之旅白皮书 2020(官网 PDF,四大组件图)](https://download.s21i.co99.net/13115299/0/1/ABUIABA9GAAg8p2lkwYomPbPxwQ.pdf)[16];[知乎:华为数据之道笔记(数据集服务/主题联接)](https://zhuanlan.zhihu.com/p/661142974)[14]

### 2.2 阿里 OneData:OneModel / OneID / OneService

| 属性 | 内容 |
|---|---|
| 全称 | OneData 体系(OneModel 统一数据构建及管理 / OneID 统一身份标识 / OneService 统一数据服务) |
| 发布机构 | 阿里巴巴数据技术及产品部;产品载体 Dataphin/QuickBI |
| 年份 | 2015-2017 年间成型("大中台小前台"战略产物) |
| 现行状态 | 现行(阿里云对外输出为 OneData 解决方案/Dataphin 产品) |
| 性质 | 企业数据中台方法论(非标准,商业方法论) |

**OneModel(统一模型层)**[12][11]:
- 理论基础:**Kimball 维度建模**,构建总线矩阵;
- 八要素设计法:业务板块→数据域→业务过程→维度→度量/原子指标→业务限定→时间周期→派生指标;
- 分层架构:ODS(操作数据层)→ CDM/DWD(明细事实)+ DIM(公共维度)→ DWS(汇总)→ ADS(应用),每层职责清晰(阿里 DataWorks 文档给出各层官方定义与命名规则,见下);
- 模型治理:统一性/可复用性/可扩展性/一致性四目标。

**OneID(统一实体层)**[11][13]:跨平台/跨系统 ID 打通(购物 ID/设备 MAC/IP 等),基于算法自动识别 ID 映射关系,归一到唯一 OneID,解决实体统一与数据融通。对数仓团队的启示:**主数据实体(用户/设备)的 ID-Mapping 是 DWD 层的独立建模对象**,不是各业务过程事实表的附带字段。

**OneService(统一服务层)**[11]:服务元数据中心+统一查询引擎,面向业务统一数据出口,屏蔽多数据源与多物理表;让数据"复用而非复制"。

**演进路线佐证**(行在/罗金鹏公开分享)[13]:ODS+DSS 两层(Oracle 时代)→ Greenplum 引入模型化 → Hadoop 时代确立 OneData,核心 CDM 层全采用多维模型(Kimball 路线)。

**对数据团队的实际约束**:OneData 是**可直接照抄的工程规范来源**:①八要素指标设计法直接用于指标命名(见 §6.2 SOP);②分层职责与命名规则有官方模板(阿里云 DataWorks"数仓分层检查器":`dim_{业务分类}_{数据域}_{自定义内容}_{存储策略}`、`dwd_{业务分类}_{数据域}_{业务过程}_{自定义内容}_{存储策略}` 等,机器可校验)[31];③OneService 的"统一出口"原则映射为**ADS 层表 + API/订阅服务,禁止下游直查 ODS/DWD**(§6.4 检查项)。

来源:[OneData 方法论详解(ss-data,三分层+组件图)](https://ss-data.cc/posts/kb-onedata-methodology)[11];[数据中台方法论篇(博客园,OneModel 八要素)](https://www.cnblogs.com/zsql/p/15768139.html)[12];[阿里数据科学家讲透数据中台(行在/罗金鹏分享整理)](https://www.shopex.cn/news/archives/5976.html)[13]

### 2.3 两套体系对照与取舍

| 维度 | 华为《数据之道》 | 阿里 OneData |
|---|---|---|
| 主战场 | 集团级信息架构+治理组织(IA-SAG) | 数仓产线建模与指标工程 |
| 核心资产 | L1-L5 资产目录、六类数据分类 | 分层模型、总线矩阵、指标体系、ID-Mapping |
| Owner 机制 | 业务对象级 Owner,资产注册门禁 | 团队化开发,模型评审 |
| 工具承载 | 内部平台(元数据中心/数据底座) | Dataphin/DataWorks(对外商用) |
| 对 data 团队 | 借"L3 业务对象+Owner 门禁"思想 | **直接采用分层+命名+指标方法** |

## 3. DCMM(GB/T 36073-2018)数据架构域成熟度要求

**本节核心判断:DCMM 数据架构域的四个能力项(数据模型/数据分布/数据集成与共享/元数据管理)给出了一张"架构能力自评表"——其 3 级(稳健级/已定义级)要求逐条对应实时数仓团队可固化的检查动作,自评达标 3 级等于拿到甲方/投标场景的通行证。**

### 3.1 标准基本信息

| 属性 | 内容 |
|---|---|
| 标准号 | **GB/T 36073-2018**《数据管理能力成熟度评估模型》(Data Management Capability Maturity Assessment Model, DCMM) |
| 发布机构 | 国家市场监督管理总局/国家标准化管理委员会;工信部牵头,全国信标委大数据标准工作组制定 |
| 发布/实施 | 2018-03-15 发布,2018-10-01 实施 |
| 现行状态 | **现行**;2025 年发布修订版 GB/T 36073-2025(DCMM 2.0:8 域→9 域,新增"数据资产"域;28 能力项→33;441 指标→486;数据架构域内涵延续)[18][19] |
| 性质 | 推荐性国标(GB/T),国内数据管理领域首个国标;第三方评估认证体系(全国 DCMM 评估公共服务平台运营) |

**整体结构**:8 个能力域(数据战略/数据治理/**数据架构**/数据应用/数据安全/数据质量/数据标准/数据生存周期),28 个能力项,441 条指标,5 个成熟度等级(1 初始/2 受管理/3 稳健【已定义】/4 量化管理/5 优化)[17][19][38]。

### 3.2 数据架构域:四个能力项逐级要求

数据架构域定义为:"用于定义数据需求、指导对数据资产的整合和控制、使数据投资与业务战略相匹配的一套整体构件规范",下含四个二级能力项[38]:

**① 数据模型**(主题域模型/概念模型/逻辑模型/物理模型四层;组织级 vs 系统应用级)[38]:
- L2 受管理级:业务条线内按规范建模,模型评审有流程;
- L3 已定义级:建立组织级统一建模规范,主题域模型/概念模型覆盖核心业务,模型与系统实现有一致性校验;
- L5 优化级:在行业中共享数据模型经验成果。

**② 数据分布**(权威数据源判定)[38]:
- L2:业务条线内对每个数据确定权威数据源,建立主副本同步机制;
- **L3:组织内所有数据按分类管理,确定每个数据的权威数据源和合理部署,建立组织级共享的主副本同步机制与备份机制**;
- L4:预测性优化数据部署策略。

**③ 数据集成与共享**[38]:
- L1:离线文件/专用接口交换,手工汇总;
- L2:条线内公用数据交换服务规范+部门级数据平台(数据集市),用 ETL 工具标准化;
- **L3:组织级数据报文交换规范;组织级数据集成与共享平台和管理机制,整合组织内外多种类型数据;便捷易用的数据访问环境**;
- L4:采用行业报文交换标准,预见性引入新技术。

**④ 元数据管理**(元模型管理/元数据集成和变更/元数据应用)[38]:
- L2:业务领域级元模型设计、集中元数据存储库、血缘(溯源)分析与影响分析等基本应用;
- **L3:组织级元数据分类与元模型;统一的元模型变更管理流程;组织级集中元数据存储库;元数据采集/变更与数据生命周期融合;元数据应用丰富(开发管理、模型-系统一致性校验、指标库管理);元数据以服务方式跨系统共享**;
- L4:量化指标衡量元数据管理有效性。

### 3.3 对数据团队的实际约束与自评映射

| DCMM 要求(3 级口径) | 实时数仓团队对应检查物 | 固化位置 |
|---|---|---|
| 统一建模规范+评审 | 模型评审 checklist + 命名规则 | §6.3 评审 SOP |
| 每个数据有权威数据源 | 源表登记表(SoR/Owner/同步方式) | §6.3 接入门禁 |
| 组织级集成共享平台 | Paimon 公共层(ODS/DWD/DIM)统一接入 | 分层规范 §6.1 |
| 元数据集中+血缘/影响分析 | 元数据平台自动采集 + 血缘查询 | §4 选型 + §6.5 |
| 模型-系统一致性校验 | DDL 与 Paimon schema diff 检查 | §6.5 变更 SOP |
| 指标库管理 | 指标字典(八要素) | §6.2 |

**实用结论**:团队无需做认证,但 DCMM 3 级的数据架构域条文是**免费的架构能力需求清单**——对照补齐即可同时满足"对内自评"与"对外投标/甲方评估"两类场景。若企业客户要求 DCMM 证书,注意 2025 版(2.0)已切换:新增数据资产域、L2 引入评估基准、L4 引入 AI 要求[18]。

来源:[全国 DCMM 评估公共服务平台(官方:8 域/28 项/5 级定义)](http://www.dcmm.org.cn/)[17];[DCMM 模型全文解读(知乎,数据架构域 L1-L5 度量标准全文)](https://zhuanlan.zhihu.com/p/352371569)[38];[DCMM 完整解读(知乎,评估要点/流程)](https://zhuanlan.zhihu.com/p/611997675)[39];[DCMM 2.0 演进解读(腾讯云,2025 版 9 域/486 指标)](https://developer.cloud.tencent.com/article/2714705)[18];[DCMM 评估内容(鹏生 IT,28 过程域清单)](http://www.pengshengit.com/dcmm/)[19]

## 4. 元数据与血缘工程:OpenMetadata / DataHub / Apache Atlas / Amundsen

**本节核心判断:2026-08 时点这四款工具已分化为"两个活项目+一个 Hadoop 时代工具+一个休眠项目"——OpenMetadata(最快见效)与 DataHub(最强扩展)是仅有的两个现实选项;Atlas 仅在 Hive/Spark 体系内合理;Amundsen 已实质停止维护。对 Flink+Paimon 栈,选型硬约束是连接器覆盖,Paimon 原生连接器两家都还没有,Flink 作业血缘要靠 FLIP-314/自研桥接。**

### 4.1 四工具对比

| 维度 | OpenMetadata | DataHub | Apache Atlas | Amundsen |
|---|---|---|---|---|
| 出身/时间 | 2021(Collate 发起),schema-first 统一元模型 | LinkedIn(前身 WhereHows),aspect 附加式元模型 | Apache 基金会,Hadoop 生态治理先行者 | Lyft,发现/搜索工具 |
| 活跃度(2026-08) | **活跃**:~14.9k stars,1.13.3 stable(2026-07-31),2.0-rc 进行中,日级提交[21] | **活跃**:~12.5k stars,v1.7.0(2026-08-04),日级提交[21] | 维护中:2.5.0(2026-04-30),年提交 100+ 但节奏慢[21] | **休眠**:主分支 12 个月零提交,最后 release 2024-08[21] |
| 架构 | MySQL/Postgres + Elasticsearch,单体简化 | MySQL/Postgres + ES + **Kafka 流** (+可选图库),组件最重 | JanusGraph + Solr,深度绑定 Hadoop | Neo4j + ES,轻量微服务 |
| 列级血缘 | ✅ 从查询日志与转换代码解析,内置无代码人工修正编辑器[20][22] | ✅ 60+ 源列级血缘,sqlglot 解析,官方宣称 97-99% 准确率[21][20] | ✅ 但**仅来自 Hive/Spark/Sqoop hook**,无通用 SQL 解析[21] | ❌ 大体表级,靠人工喂[22] |
| 血缘采集模式 | Pull(定时抽取)+ dbt/Airflow 连接器 | **Stream(Kafka 事件)** + Push + Pull | Hook(Hadoop 组件内建) | Pull |
| 数据质量 | **内置**:测试/剖析/自定义测试,1.8 起支持数据契约[20] | Assertions + 集成 GE/dbt 结果导入[20] | ❌ 需外接 | ❌ 需外接 |
| 扩展性 | 统一 schema,快但不深 | **aspect 模型可自定义实体**,最灵活[22] | 类型系统可扩但 Hadoop 绑定 | 低 |
| 运维成本 | 中(~10 vCPU/40GiB 量级) | **重**(Kafka+多存储,>7GB RAM 起)[21] | 中(需 Hadoop 经验) | 轻 |
| 特色 | 开箱即用度最高,glossary/分类/质量全内置 | MCP Server 机器侧元数据协议(AI/Agent 侧最新);Actions 工作流自动化[20] | 与 Apache Ranger 联动做基于标签的行/列级安全策略[20] | 轻量发现,分析师体验好 |

### 4.2 选型建议(Flink+Paimon 实时数仓场景)

**结论:默认选 OpenMetadata;若 18 个月内有自建数据平台/Agent 元数据服务诉求选 DataHub。Amundsen 排除;Atlas 仅当存在存量 Hive 集群治理需求时并行使用。**

决策依据:
1. **活跃度即风险**:血缘平台是长周期基础设施,Amundsen 零提交状态意味着 bug 无修复、连接器无更新[21];Atlas 的活跃度依赖 Hadoop 生态存续[21]。
2. **列级血缘免费且真实**:OM/DataHub 在主流仓上真实解析列级血缘(Apache 2.0 免费版即含),这正是 DCMM 元数据管理 L2+ 要求的"血缘(溯源)分析、影响分析"[21][22][38]。
3. **本栈的连接器现实**(关键约束):
   - OpenMetadata 有 **Flink pipeline 连接器**(采集 Flink 作业级元数据)[44],但 **Paimon 原生连接器仍是 open issue**(#25096,社区请求中)[43];
   - Paimon 官方已实现 **FLIP-314 血缘暴露**(LineageVertexProvider 接口,供下游血缘消费系统使用)[42]——即血缘数据源侧已具备,缺的是采集桥;
   - **务实路线**:Dinky/Flink SQL Gateway 的作业 SQL 是血缘的可靠来源(等价于 dbt 连接器读 manifest 的模式)——把 Flink SQL 提交产物解析后经 OpenMetadata REST/自定义 connector 灌入,或短期用 MySQL binlog 源(CDC connector)+ Paimon catalog 的库表元数据先覆盖 80% 场景。
4. **小团队运营约束**:DataHub 的 Kafka 流架构扩展强但运维面大[22];团队无专职平台组时,OpenMetadata 单体部署显著降低失败模式数量[20][22]。
5. **验收测试**(选型必做):两家都部署,指向真实 Paimon catalog+MySQL,验证三件事:①Paimon 库表元数据可采集;②Flink 作业血缘可入库(经 FLIP-314 桥或 SQL 解析);③从一个 ADS 指标反查到 MySQL 源表全链路可走通——**"一个真实报表数字回溯到源系统每一跳"是血缘系统的唯一验收标准**[22]。

来源:[TheDataGuy 四平台战略分析](https://thedataguy.pro/blog/2025/08/open-source-data-governance-frameworks/)[20];[Datatrail 2026-08 项目状态盘点(活跃度/连接器矩阵)](https://datatrail.ai/blog/open-source-data-catalog-tools)[21];[Decube 选型指南(验收方法论)](https://www.decube.io/post/open-source-data-catalog-comparison)[22];[OpenMetadata Flink connector 文档](https://docs.open-metadata.org/v2.0.x/connectors/pipeline/flink)[44];[OpenMetadata Paimon issue](https://github.com/open-metadata/OpenMetadata/issues/25096)[43];[Paimon FLIP-314 血缘文档](https://paimon.apache.org/docs/master/flink/lineage/)[42]

## 5. 建模工程化:dbt / SQLMesh 与 Lakehouse(Flink+Paimon)适配

**本节核心判断:dbt 生态对本栈是"半扇门"——官方适配器矩阵无 Flink,dbt-flink-adapter 是第三方 MVP 且不覆盖 Paimon 特性;SQLMesh 的状态化/虚拟环境理念先进但同样无 Flink 目标。短期正解:模型逻辑 SQL 化进 Dinky/Flink SQL Gateway 管理,补测试与文档层;中期看 SQLMesh 引擎抽象或自研 dbt 目标。分层/变更传播本身交给 Paimon 原生能力,不要为建模工具牺牲流式特性。**

### 5.1 Lakehouse 实时数仓的原生模式(Flink+Paimon 官方推荐)

阿里云/Ververica 官方的流式湖仓分层模式[23][24][25][26]:

| 层 | Paimon 关键配置 | 职责 |
|---|---|---|
| ODS | 直写,deduplicate engine | MySQL CDC(Flink CDC)整库同步入湖,自动 schema evolution[26] |
| DWD | `merge-engine = partial-update`,changelog-producer = lookup | 多流拼宽表(订单+支付+目录),变更逐列补齐 |
| DWM/DWS | `merge-engine = aggregation` | 增量指标累积(预聚合) |
| ADS | 批读 | StarRocks/Trino 等外部引擎查 Paimon 外表服务查询[24] |

关键机制:**每层订阅上一层的 changelog,变更分钟级端到端传播,无需分区重写**;宽表用 partial-update 替代流式 join 大状态[23][24]。Fluss 定位补充(本栈已用):Fluss 是流式存储(列式 Arrow log+主键 KV),承担"湖的热层"——与 Paimon Union Read 组成同一逻辑表(秒级新鲜度+历史扫描),KV changelog 可被 Flink 免去重直读,替代"Kafka+Flink 状态后端"三层堆叠[34][35][36]。**小文件纪律**:缩短 commit 间隔会产生文件数爆炸(32 bucket×10s commit≈27.6 万文件/天),流式提交间隔与 bucket 数的匹配必须有规范[37]。

### 5.2 dbt 适配现状

- **官方适配器矩阵**(dbt-labs/dbt-adapters):athena/bigquery/postgres/redshift/snowflake/spark——**无 Flink,无 Paimon**[46];dbt-spark 对 Paimon 格式支持的 issue 已因 180 天无活动被标 stale[45]。
- **dbt-flink-adapter**(getindata,第三方):MVP 级,经 Flink SQL Gateway 提交,支持 `table`/`view` 两种物化,可把模型物化为流式管道;需自配 `connector_properties`(kafka/paimon 等连接器属性以 WITH 子句透传);流式测试用 `fetch_timeout_ms` 特殊语法;**无 Paimon primary-key 表/partial-update 等特性的第一类支持**[40][41]。PyPI 包存在但版本与维护强度属个人/小团队项目[41]。
- **结论**:dbt 的依赖图/测试/文档三件套有价值,但把 Flink 当"仓库引擎"的抽象在流式语义(watermark/changelog/retract)上失真;现有 adapter 无法表达 merge-engine 等核心配置。**不建议生产主干采用**;可作为批处理分支(如果团队未来建批层)的候选。

### 5.3 SQLMesh 适配现状

- SQLMesh 核心差异:**stateful**(需 Postgres 等存状态)vs dbt stateless;**Virtual Data Environments**(模型指纹+指针切换,开发环境零拷贝,提升=指针交换)[27][28][29];
- 工程收益:变更影响检测(state-based diff,自动识别哪些模型物理需要重跑)、列级血缘内置、审计测试(audits)内建[27][28];
- **适配现实**:官方目标引擎为主流仓/duckdb 等,**无 Flink/Paimon 目标**;其"gateway"引擎抽象理论上可扩,但社区暂无可用适配器(截至检索日)。价值在于其**计划/环境/审计模型**可作为团队自建"模型管理规范"的参照系(§6.3 评审 SOP 的三环境理念即源于此)。

### 5.4 对本栈的工程化落点(裁决)

1. **模型载体**:继续用 Flink SQL(Dinky 管理),Paimon DDL 与 merge-engine 配置入 Git;**每模型一文件,含 WITH 参数、主键、bucket、changelog-producer 注释头**——这是等价 dbt 的"模型即代码"底线。
2. **测试层**:自建 SQL 断言脚本(等价 dbt test:主键唯一/非空/枚举值域/行数波动阈值),挂 Dinky 作业后置校验或独立 Flink 批作业;Paimon 快照差分可做"重跑前后行数守恒"校验。
3. **文档/血缘层**:§4 的元数据平台承担;模型描述从 SQL 注释头自动解析入库。
4. **观察项**:SQLMesh 引擎抽象演进、dbt-flink-adapter 成熟度、OpenTableFormats 侧(如 paimon-spark)批处理路径成熟后,批层建模可重评 dbt。
5. **红线**:不为引入建模工具而放弃 Paimon 流式特性(partial-update/aggregation merge-engine 是分层宽表的根本,通用 SQL 建模工具目前都无法表达)[24][23]。

来源:[Ververica Streamhouse 模式](https://ververica.com/blog/streamhouse-data-processing-patterns)[23];[阿里云官方分层示例(merge-engine/changelog-producer 逐层配置)](https://alibabacloud.com/help/en/openlake/build-a-streaming-data-warehouse-based-on-flink-and-apache-paimon)[24];[Paimon 流式湖仓方案选型](https://help.aliyun.com/en/flink/realtime-flink/use-cases/scheme-of-streaming-lakehouse-based-on-paimon/)[25];[Flink & Paimon 集成深度文](https://alibabacloud.com/blog/602601)[26];[SQLMesh 官方对比文档](https://sqlmesh.readthedocs.io/en/stable/comparisons/)[27];[SYNQ: dbt vs SQLMesh](https://synq.io/blog/dbt-vs-sqlmesh-a-comparison-for-modern-data-teams)[28];[TowardsAI: 自建湖仓上的诚实对比](https://pub.towardsai.net/dbt-vs-sqlmesh-an-honest-comparison-on-a-self-hosted-lakehouse-eec0365497b8)[29];[dbt-flink-adapter GitHub](https://github.com/getindata/flink-dbt-adapter)[40];[dbt-flink-adapter PyPI](https://pypi.org/project/dbt-flink-adapter/)[41];[dbt 官方适配器清单](https://github.com/dbt-labs/dbt-adapters)[46];[dbt-spark Paimon issue(stale)](https://github.com/dbt-labs/dbt-spark/issues/933)[45];[Fluss 官方文档](https://fluss.apache.org/docs/next)[34];[Fluss vs Kafka](https://fluss.apache.org/compare/kafka)[35];[Fluss 介绍博客](https://fluss.apache.org/blog/fluss-intro)[36];[Fluss/Iceberg 小文件分析](https://alexmerced.blog/blog/2026-07-28-fluss-kafka-iceberg-streaming.html)[37];[Paimon 官网](https://paimon.apache.org/)[30]

## 6. 实时数仓团队能力落点:应固化的 SOP 与检查清单

**本节核心判断:把上述方法论收敛为 5 件可固化产物——分层与命名规范(机器可校验)、指标设计 SOP(八要素)、模型评审门禁(三环境+准入清单)、变更管理 SOP(契约+血缘影响分析)、元数据/血缘运维 SOP(验收测试)。每件都给出"谁、何时、什么动作、机器怎么查"。**

### 6.1 SOP-1 分层与命名规范(arch 起草,机器校验)

**分层职责表**(融合 OneData 分层[31][12] + Streamhouse 模式[23][24]):

| 层 | 全称 | 职责 | 禁止事项 |
|---|---|---|---|
| ODS | 原始接入层 | CDC/消息原样入湖,保留 `load_ts`/`source_system` 审计列 | 禁止清洗加工;禁止下游直连 ODS 做指标 |
| DIM | 公共维度层 | 一致性维度,总线矩阵列 | 禁止含事实度量 |
| DWD | 明细层 | 最细粒度明细+轻度宽表化(partial-update) | 禁止跳层引用 ODS 之外直连业务库 |
| DWS | 汇总层 | 主题级轻度汇总/增量预聚合(aggregation engine) | 禁止面向单一报表定制 |
| ADS | 应用层 | 面向服务的最终表/API 出口 | 禁止下游再被数仓内引用 |

ODS→DWD/DIM→DWS→ADS 单向调用,禁止逆向依赖、避免同层依赖[32][33];跨层引用(如 ADS 依赖 DWD)需在评审中说明理由。

**命名规范**(照抄 DataWorks 检查器格式,可正则校验)[31]:
```
ods_{源系统}_{源表}
dim_{业务分类}_{数据域}_{自定义内容}
dwd_{业务分类}_{数据域}_{业务过程}_{自定义内容}_{存储策略}
dws_{业务分类}_{数据域}_{自定义内容}_{时间周期}
ads_{业务分类}_{数据集市}_{主题域}_{自定义内容}_{时间周期}
```
固化方式:正则脚本进 CI,Dinky 作业发布时校验表名;不符合→拒绝发布。

### 6.2 SOP-2 指标设计规范(arch 起草,评审时执行)

采用 OneModel 八要素口径[12]:每个派生指标必须登记——业务板块、数据域、业务过程、维度、原子指标(口径唯一)、业务限定、时间周期、统计粒度。指标字典落 MySQL 表(或直接用元数据平台 glossary),**指标口径变更走 §6.4 变更 SOP**。红线:同名不同径、同径不同名不允许共存。

### 6.3 SOP-3 模型评审门禁(每周评审会 + 发布门禁)

**新表准入检查清单**(对照 DCMM L3 要求[38],逐项可勾选):
- [ ] 归属分层正确,命名符合 6.1 正则
- [ ] 登记了数据域(L3 业务对象级)与 Owner(华为思想[15])
- [ ] 源表登记了 System of Record 与同步方式(TOGAF 纪律[9])
- [ ] Paimon 表配置四要素齐备:主键/bucket 数/changelog-producer/merge-engine,且有选型理由注释
- [ ] 审计列齐备:`load_ts`、`source_system`(Data Vault 思想的零成本保留[5])
- [ ] 测试断言齐备:主键唯一/非空/值域(§5.4-2)
- [ ] 下游影响已查(血缘平台截图附评审单)
- [ ] 指标类表:八要素登记完整(§6.2)
- [ ] 小文件风险评估:commit 间隔×bucket 数量级核算[37]

### 6.4 SOP-4 变更管理(契约+血缘影响分析)

1. **上游 schema 变更**:MySQL 源表 DDL 变更须提前 N 天在变更群登记;Flink CDC 作业开 schema evolution 的,自动同步;未开的,变更日人工核对 ODS。
2. **模型口径变更**:改 DWD/DWS 逻辑前,血缘平台跑**下游影响分析**,列出所有受影响 ADS/指标;涉及对外指标的,通知消费方确认后才能合并(对齐 DMBOK 数据架构治理接口[1]、DCMM 元数据应用 L3[38])。
3. **回退**:Paimon 快照 + Flink savepoint 双回退点,评审单记录回退命令。
4. **一致性校验**:模型-实现 diff(逻辑 SQL vs 线上作业 SQL)定期抽样比对(等价 DCMM"元数据与信息系统一致性校验"[38])。

### 6.5 SOP-5 元数据/血缘运维(arch+infra 共管)

- **采集范围基线**:MySQL 库表元数据(CDC connector)、Paimon catalog 元数据、Flink 作业清单(Dinky 同步)、作业 SQL 血缘(FLIP-314 桥或 SQL 解析[42])、指标字典(glossary)。
- **每日巡检项**:采集任务成功率;血缘边数环比(骤降=采集断);新增无 Owner 表清单(→补登记)。
- **季度验收测试**:选 3 个核心报表数字,从 ADS 反查到 MySQL 源表逐跳走通并截图归档(唯一硬验收[22])。
- **选型落地顺序**:先 OpenMetadata 单机部署+MySQL/Paimon catalog 采集(2 周内见效)→ 再 Flink SQL 血缘桥 → 最后评估 glossary 替换指标字典 Excel。

### 6.6 固化优先级(impact × effort)

| 优先级 | 产物 | 理由 |
|---|---|---|
| P0(本周) | 6.1 命名正则进 Dinky 发布校验;6.3 准入清单模板 | 零平台依赖,立即可执行 |
| P1(本月) | OpenMetadata 部署+两源采集;指标字典 MySQL 建表 | DCMM L2→L3 关键跨越 |
| P2(本季) | Flink SQL 血缘桥;6.4 变更 SOP 全流程演练一次 | 血缘反查验收 |
| P3(观察) | dbt/SQLMesh 目标引擎跟进;Fluss Union Read 分层热层整合 | 技术成熟度再评 |

## 7. 与其他域的边界

- **数据质量六性/GB/T 36344、数据标准、主数据管理** → 数据治理域文档(domains/data-governance.md)负责;本域仅在 6.2 指标口径与 6.3 准入清单处引用其概念。
- **数据安全(密级/隐私/跨境)** → 安全域文档负责;华为五级密级体系本域不展开。
- **数据分析/服务化(OneService 的 API 层运营)** → 分析域负责;本域只约束"ADS 层是唯一出口"这一架构边界。

## 附录 A:标准与方法论条目总表

| # | 名称 | 发布机构 | 年份 | 状态 | 性质 |
|---|---|---|---|---|---|
| 1 | DAMA-DMBOK2(第 4 章) | DAMA International | 2017/2024 修订 | 现行(3.0 在研) | 行业知识体系 |
| 2 | TOGAF Phase C Data Architecture | The Open Group | 8.1.1→10 | 现行 | EA 方法论 |
| 3 | Kimball 维度建模 | Ralph Kimball | 1996 起著作 | 现行经典 | 建模方法论 |
| 4 | Inmon CIF | Bill Inmon | 1990s | 现行经典 | 架构流派 |
| 5 | Data Vault 2.0 | Dan Linstedt | ~2013 | 现行(商业) | 建模方法论 |
| 6 | 华为《数据之道》 | 华为 | 2020 | 现行 | 企业实践 |
| 7 | 阿里 OneData | 阿里巴巴 | ~2017 | 现行(商用输出) | 企业方法论 |
| 8 | GB/T 36073-2018 (DCMM) | 国标委/工信部 | 2018-10-01 实施 | **现行;2025 修订版(2.0)已发布** | 推荐性国标 |
| 9 | Paimon Streamhouse 模式 | Apache/阿里云 | 2023-2025 | 现行 | 官方参考架构 |
| 10 | FLIP-314(Paimon lineage) | Apache Flink/Paimon | 现行 | 已实现 | 接口规范 |

## 附录 B:引用来源清单

## Sources

由 sources.py ledger 机制生成,编号与正文 [n] 对应:

[1] https://www.damadmbok.org/dmbok2-revisions — DAMA-DMBOK 2.0 Revision: Summary of Changes(官方)
[2] https://www.data-landscape.com/regulation/dama-dmbok/ — DAMA-DMBOK2 状态条目(2nd ed 2017, revised 2024; 3.0 started 2025)
[3] https://medium.com/@goyalarchana17/data-warehouse-architecture-approaches-inmon-vs-kimball-0bd8f04bb5cf — Inmon vs Kimball 特征对比
[4] https://www.keboola.com/blog/kimball-vs-inmon — Kimball 所需工程师/技能更少
[5] https://navicat.com/en/company/aboutus/blog/3970-designing-better-databases-with-data-vault-2-0-and-navicat-data-modeler-4.html — DV2.0 何时用/何时不用;集成层非消费层
[6] https://ben-morris.com/data-vault-2-modelling-the-good-the-bad-and-the-downright-confusing — DV2.0 复杂度/新手陷阱批评
[7] https://petascalelabs.com/curriculum/dimensional-data-modeling/data-vault-2/why-data-vault-exists — Vault 适用三条件;Vault→星型分层;"替换 Kimball 是伪命题"
[8] https://www.reddit.com/r/dataengineering/comments/rnmumx/kimball_vs_inmon_vs_vault/ — 社区对比讨论
[9] https://www.opengroup.org/architecture/doc-review/protected-d3/htmlclean/chap10.html — TOGAF Phase C Data Architecture 原文
[10] https://coe.qualiware.com/resources/togaf/9-1/part2-adm/phase-c-information-systems-architectures-data-architecture/ — TOGAF 9.1 Phase C 目录/矩阵/图清单
[11] https://ss-data.cc/posts/kb-onedata-methodology — OneData 方法论(OneModel/OneID/OneService 详解)
[12] https://www.cnblogs.com/zsql/p/15768139.html — OneModel 八要素/维度建模总线矩阵
[13] https://www.shopex.cn/news/archives/5976.html — 阿里数据中台演进四阶段(行在/罗金鹏)
[14] https://zhuanlan.zhihu.com/p/661142974 — 华为数据之道笔记(数据集服务/主题联接)
[15] https://www.cnblogs.com/qq1035807396/p/17116651.html — 华为数据之道总结(信息架构四组件/六类数据/数据底座)
[16] https://download.s21i.co99.net/13115299/0/1/ABUIABA9GAAg8p2lkwYomPbPxwQ.pdf?f=%E5%8D%8E%E4%B8%BA%E6%95%B0%E6%8D%AE%E6%B2%BB%E7%90%86%E4%B9%8B%E6%97%85%EF%BC%882020%E5%B9%B4%EF%BC%89.pdf&v=1651068658 — 华为数据治理之旅白皮书(2020,四大组件官方图)
[17] http://www.dcmm.org.cn/ — 全国 DCMM 评估公共服务平台(官方:8 域/28 项/5 级)
[18] https://developer.cloud.tencent.com/article/2714705 — DCMM 2.0(GB/T 36073-2025)9 域/486 指标解读
[19] http://www.pengshengit.com/dcmm/ — DCMM 评估内容(28 过程域清单)
[20] https://thedataguy.pro/blog/2025/08/open-source-data-governance-frameworks/ — OpenMetadata/DataHub/Atlas/Amundsen 战略分析
[21] https://datatrail.ai/blog/open-source-data-catalog-tools — 2026-08 项目活跃度矩阵(Amundsen 0 提交;Atlas 2.5.0;列级血缘对比)
[22] https://www.decube.io/post/open-source-data-catalog-comparison — 选型方法论("18 个月后谁运维";血缘验收测试)
[23] https://ververica.com/blog/streamhouse-data-processing-patterns — Streamhouse 四层模式;partial-update merge engine
[24] https://alibabacloud.com/help/en/openlake/build-a-streaming-data-warehouse-based-on-flink-and-apache-paimon — 官方分层配置(merge-engine/changelog-producer 逐层)
[25] https://help.aliyun.com/en/flink/realtime-flink/use-cases/scheme-of-streaming-lakehouse-based-on-paimon/ — Paimon 流式湖仓方案选型
[26] https://alibabacloud.com/blog/602601 — Flink CDC 整库同步/schema evolution/小文件治理
[27] https://sqlmesh.readthedocs.io/en/stable/comparisons/ — SQLMesh 官方 vs dbt(VDE/环境/提升)
[28] https://synq.io/blog/dbt-vs-sqlmesh-a-comparison-for-modern-data-teams — dbt vs SQLMesh 设计哲学
[29] https://pub.towardsai.net/dbt-vs-sqlmesh-an-honest-comparison-on-a-self-hosted-lakehouse-eec0365497b8 — 自建湖仓上的对比
[30] https://paimon.apache.org/ — Apache Paimon 官网(定位/特性)
[31] https://help.aliyun.com/zh/dataworks/user-guide/data-warehouse-layering — DataWorks 数仓分层定义+命名检查器规则
[32] https://docs.feishu.cn/article/wiki/PrtNwl4CIiHKcMkML6UcoiDanbc — 层次调用规范(禁止逆向依赖)
[33] https://github.com/ForceInjection/Big-Data-Theory-and-Practice/blob/main/courses/chapter12/%E8%BE%85%E5%8A%A9%E6%9D%90%E6%96%99/%E6%95%B0%E4%BB%93%E5%88%86%E5%B1%82%E6%9E%B6%E6%9E%84%E8%AF%A6%E8%A7%A3.md — 分层边界误区(中间层屏蔽效应)
[34] https://fluss.apache.org/docs/next — Apache Fluss 官方文档(流式存储定位/表类型/湖分层)
[35] https://fluss.apache.org/compare/kafka — Fluss vs Kafka 官方对比(热层/Union Read)
[36] https://fluss.apache.org/blog/fluss-intro — Fluss 介绍(stream-table duality/changelog 直读)
[37] https://alexmerced.blog/blog/2026-07-28-fluss-kafka-iceberg-streaming.html — commit 间隔×bucket 小文件定量分析
[38] https://zhuanlan.zhihu.com/p/352371569 — DCMM 数据架构域 L1-L5 度量标准全文
[39] https://zhuanlan.zhihu.com/p/611997675 — DCMM 评估要点/流程/人员
[40] https://github.com/getindata/flink-dbt-adapter — dbt-flink-adapter(MVP/物化/connector_properties)
[41] https://pypi.org/project/dbt-flink-adapter/ — dbt-flink-adapter PyPI
[42] https://paimon.apache.org/docs/master/flink/lineage/ — Paimon Data Lineage(FLIP-314 LineageVertexProvider)
[43] https://github.com/open-metadata/OpenMetadata/issues/25096 — OpenMetadata Paimon connector 请求 issue
[44] https://docs.open-metadata.org/v2.0.x/connectors/pipeline/flink — OpenMetadata Flink connector 官方文档
[45] https://github.com/dbt-labs/dbt-spark/issues/933 — dbt-spark Paimon 支持 issue(180 天 stale)
[46] https://github.com/dbt-labs/dbt-adapters — dbt 官方第一方适配器清单(无 Flink)
