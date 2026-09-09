# 数据分析域：国内外标准规范与工程实践调研

> 版本：v1.0（2026-09-04）
> 调研执行时间：2026-09-04（文中所有"截至"表述以此为基准）
> 读者：Hermes 集群 data 团队（Flink/Paimon/Fluss/Dinky/MySQL/Redis 实时数仓技术栈）
> 范围：数据分析域 = 指标体系 / 分析方法 / 分析工程化（实验与语义层）。架构、治理、安全域由其他文档覆盖；仅在指标口径层面交叉引用。
> 证据规则：每个标准条目含【出处/机构】【核心内容】【团队约束】；关键结论均有 URL 或文献锚点；关键结论至少两个独立来源三角验证；引述他人转述的第三方数据已显式标注"转引"。

---

## 0. Executive Summary

**主旨（一句话）**：数据分析域的能力分水岭不在"会跑数"，而在三道工程化关卡——**指标口径可信、实验结论可信、图表表达可信**；这三道关卡在国内外均已收敛为成文规范，实时数仓团队应将其固化为 SOP 与检查清单，而不是依赖个人经验。

**写给谁、解决什么问题**：给 data 团队的负责人与研发——决定"数据分析能力建设优先投什么、固化哪些 SOP、抄谁的规范"。

**三个决定性发现**（其余发现见各章，按重要度排序）：

1. **指标口径管理是全行业第一痛点，解法已高度收敛**：阿里 OneData（原子/派生指标 + 修饰词体系）、字节 DataLeap（指标字典 + 唯一负责人 + 口径出口一致）、美团指标平台（"定义即研发"，自动语义）、滴滴（T1/T2/T3 分级 + 指标生命周期）与海外 dbt Semantic Layer / Cube / Open Semantic Interchange，本质是同一套五件套：**原子/派生分层定义、指标注册评审（唯一负责人）、业务口径+技术口径双记录、血缘与变更周知、分级运营**。Gartner 2025 年把 Metrics Layer 列为 ABI 平台第一位常见能力（经美团官方文转引），_metric layer 已从"可选项"变成"标配能力位"_。
2. **A/B 实验纪律决定数据团队可信度上限，且全部可清单化**：微软 ExP 的七条经验规则（KDD 2014）、美团 2025《可信实验白皮书》8 章体系、字节 Libra/DataTester 的 240 万+ 实验规模实践，共同证明：样本量/MDE 预计算、AA 分组或 SRM 校验、辛普森悖论分层核查、CUPED 方差缩减、多重比较与 peeking 控制，都是**可写成检查清单的机械动作**，不需要每实验重新发明。
3. **可视化不需要自创规范，直接裁剪国际标准**：IBCS SUCCESS 七规则已升格为 ISO 24896:2026（首个商务报告记号国际标准），叠加 Tufte/Few 经典原则与 AntV/飞书国内设计规范，团队只需裁剪出"图表选型表 + 色板规则 + 反模式清单"三页纸即可落地。

**主要矛盾的判断**：对当前 Flink/Paimon/Fluss 实时数仓而言，第一矛盾不是"缺分析人才"，而是**实时链路生产的指标缺口径契约**——指标名随口起、SQL 口径散落在 Dinky 作业里、实时/离线两个数，下游分析的所有结论都被这个源头污染。所以 F 节把 SOP-01（指标口径管理）与 SOP-03（实时离线一致性对账）定为 P0。

---

## 1. 分析方法论：KDD / CRISP-DM / TDSP

> **文眼**：KDD 是学术认知框架，CRISP-DM 是单项目流程标准，TDSP 是团队级工程化改造——三者是"认识论→流程→组织"的递进关系，不是并列候选。

### 1.1 KDD（Knowledge Discovery in Databases）

| 项 | 内容 |
|---|---|
| 出处 | Fayyad, Piatetsky-Shapiro, Smyth，《The KDD Process for Extracting Useful Knowledge from Volumes of Data》，Communications of the ACM, 39(11): 27–34, 1996；另见 KDD-96 大会论文《Knowledge Discovery and Data Mining: Towards a Unifying Framework》（AAAI, 1996） |
| 机构 | 提出：该学术共同体（Fayyad 等）；发表于 ACM |
| 核心内容 | 九步知识发现流程：①明确 KDD 目标 → ②创建目标数据集（Selection）→ ③预处理/清洗 → ④数据变换（降维/投影）→ ⑤选择数据挖掘方法 → ⑥选择挖掘算法 → ⑦数据挖掘 → ⑧结果解释/评估 → ⑨知识固化合并。强调知识发现是**多步、可回溯迭代**的过程，数据挖掘只是其中一步 |
| 团队约束 | 它给了团队统一的"知识发现"词汇表和"挖掘只是环节之一"的清醒认知；但九步模型太学术、无组织角色与产物定义，**不建议直接当项目 SOP**，适合作为培训与术语底座 |
| 锚点 | https://doi.org/10.1145/240455.240464 ；https://cdn.aaai.org/KDD/1996/KDD96-014.pdf |

### 1.2 CRISP-DM 1.0

| 项 | 内容 |
|---|---|
| 出处 | 《CRISP-DM 1.0: Step-by-Step Data Mining Guide》，1999–2000 年发布，由 SPSS（时为 ISL）、Daimler-Benz（时并入 DaimlerChrysler）、NCR、OHRA 联合主导，约 200 余家组织贡献评审 |
| 机构 | SPSS / Daimler 等企业联盟（非官方标准化组织，但是数据挖掘领域事实标准） |
| 核心内容 | 六阶段循环：Business Understanding → Data Understanding → Data Preparation → Modeling → Evaluation → Deployment。特征：①各阶段可回退迭代；②Data Preparation 占实际工作量最大；③Evaluation 阶段必须区分"模型评估"（指标好不好）与"业务评估"（结论值不值钱）；④Deployment 不是终点，新数据触发新一轮循环 |
| 团队约束 | 至今仍是数据挖掘/分析项目的事实流程基线（微软 TDSP 官方文档明确以 CRISP-DM/KDD 为可映射生命周期）。团队可直接采用其六阶段作为**分析项目立项模板**；注意其 1.0 后未再官方更新，缺失 MLOps/协作工程内容（这正是 TDSP 补的） |
| 锚点 | 原始白皮书 PDF：http://nas.uhcl.edu/boetticher/ML_DataMining/CRISPWP-0800.pdf ；https://www.datascience-pm.com/crisp-dm-2/ |

### 1.3 Microsoft TDSP（Team Data Science Process）

| 项 | 内容 |
|---|---|
| 出处 | Microsoft 于 2016 年发布并开源；官方仓库 Azure/Microsoft-TDSP（Docs/README.md 与 Docs/lifecycle-detail.md，作者 bradsev 等） |
| 机构 | Microsoft（Azure/Cortana Intelligence 团队） |
| 核心内容 | **四大组件**：①数据科学生命周期定义；②标准化项目结构（Git 仓库模板 + 文档模板）；③基础设施与资源指南；④项目执行工具集。**五阶段生命周期**：Business Understanding → Data Acquisition and Understanding → Modeling → Deployment → Customer Acceptance（迭代执行）。配套：项目章程（charter）模板、数据报告/模型报告模板、角色泳道图（swimlane）、"sharp question"提问法（答案必须是数字或名字）、SMART 成功指标定义（如"3 个月内流失预测准确率达到 X%"）。官方声明可与 CRISP-DM/KDD 映射共存 |
| 团队约束 | TDSP = CRISP-DM + **团队工程化**（repo 规范、文档模板、角色分工、敏捷接口）。对团队的直接可抄物：项目目录模板、charter 模板、各阶段 checklist。注意它面向"生产化预测分析项目"，纯探索性/临时分析只需取其部分阶段（官方已明示） |
| 锚点 | https://github.com/Azure/Microsoft-TDSP/blob/master/Docs/README.md ；https://github.com/Azure/Microsoft-TDSP/blob/master/Docs/lifecycle-detail.md |

### 1.4 三者选型对照

| 维度 | KDD | CRISP-DM | TDSP |
|---|---|---|---|
| 定位 | 学术认知框架 | 单项目流程事实标准 | 团队级工程化方法论 |
| 组织角色 | 无 | 无 | 有（泳道图 + 角色职责） |
| 产物模板 | 无 | 部分（任务清单） | 完整（charter/数据报告/模型报告/Git 模板） |
| 适用场景 | 教学/术语 | 一次性分析/挖掘项目 | 需要多人协作、可复制的分析项目 |
| 本团队建议 | 术语底座 | 分析项目立项模板骨架 | 项目结构/文档模板直接抄 |

---

## 2. 指标体系方法论与国内大厂指标中台实践

> **文眼**：指标体系方法论解决"选哪些指标"，指标中台解决"指标如何不出第二套口径"——前者靠 OSM×AARRR×MECE 组合拳，后者收敛到"原子/派生分层 + 注册评审 + 一处定义多处消费"五件套。

### 2.1 北极星指标（North Star Metric）

- 【出处】Sean Ellis（GrowthHackers 创始人）2017 年提出；体系化于 Amplitude《The North Star Playbook》。
- 【核心内容】一个团队/产品只定义**一个**最能代表用户获得核心价值、且可长期指引增长的指标；配套少数几个 **input metrics（输入指标）** 构成可拆解的指标树，输入动则北极星动。Amplitude 建议北极星表达为比率（rate）而非计数（count），避免"越大越虚荣"。
- 【团队约束】①北极星必须可拆解成输入指标树，否则只是口号；②防虚荣指标（累计注册数类）；③数据团队的义务是把北极星及其输入指标全部纳入指标字典并保证口径唯一。
- 【锚点】https://amplitude.com/books/north-star/about-north-star-framework ；https://www.koji.so/docs/north-star-metric-framework （Ellis 2017 出处考据）；https://medium.com/growthhackers/finding-your-north-star-metric-fc1c1f71cbcb

### 2.2 OSM 模型（Objective–Strategy–Measurement）

- 【出处】中文互联网数据领域通用方法论，滴滴技术团队《滴滴数据仓库指标体系建设实践》（2020）为最常引用的系统性实践文本。
- 【核心内容】O（业务目标：用户要什么/业务要什么）→ S（为达成目标采取的策略）→ M（策略带来的可度量指标变化）。M 层区分**结果型指标**（滞后、难干预，用于监控）与**过程型指标**（可干预、用于定位原因）；配套维度选择（定性/定量维度）。
- 【团队约束】OSM 是"横向"方法：给任何新需求先问目标和策略，再定指标，避免"先有数再找用途"；滴滴实践给出可直接套用的网约车示例（O：便捷/快速/安全 → S：多入口/多品类/司机准入 → M：完单率/排队时长/服务分…）。
- 【锚点】https://www.cnblogs.com/didijishu/p/13590106.html

### 2.3 Google HEART 框架（与 GSM 过程）

- 【出处】Google，Kerry Rodden、Hilary Hutchinson、Xin Fu，CHI 2010 论文《Measuring User Experience: Five Components and Ten Metrics》（Google 研究报告 2009/CHI 2010）。
- 【核心内容】五类体验度量：Happiness / Engagement / Adoption / Retention / Task Success；配套 **GSM 三步过程**（Goals→Signals→Metrics）把目标转成信号再转成指标。OSM 与 GSM 结构同源，OSM 偏业务侧、HEART 偏体验侧。
- 【团队约束】做产品/体验类指标体系时的标准起手式；与 OSM 二选一即可，勿混用造成两套目标体系。
- 【锚点】https://www.heartframework.com/ ；https://www.statsig.com/perspectives/heart-framework-measuring-ux

### 2.4 AARRR 海盗指标

- 【出处】Dave McClure，2007 年 Startonomics 大会演讲《Startup Metrics for Pirates》；《精益数据分析》（Lean Analytics, Croll & Yoskovitz, 2013）推广至主流。
- 【核心内容】用户生命周期五段：Acquisition 拉新 → Activation 激活 → Retention 留存 → Revenue 变现 → Referral 推荐；每段配标准指标族（新增/激活率、DAU/MAU、留存率/流失率、LTV/客单价/GMV、邀请率/裂变系数）。
- 【团队约束】AARRR 是"纵向"补盲框架：检查指标体系是否漏掉某个生命周期阶段；注意业内对 R 顺序（Revenue/Retention）有分歧，按业务模式自定即可。滴滴实践建议 OSM×AARRR 组合：OSM 定核心，AARRR 查覆盖。
- 【锚点】https://gtm-labs.co/pirate-metrics （2007 Startonomics 出处考据）；https://www.cnblogs.com/didijishu/p/13590106.html

### 2.5 MECE 与指标拆解

- 【出处】Barbara Minto（麦肯锡首位女性 MBA 咨询顾问），MECE 原则 + 金字塔原理（《The Pyramid Principle》, 1970s 于麦肯锡内部成型，1987 成书）。
- 【核心内容】拆解必须 Mutually Exclusive, Collectively Exhaustive（相互独立、完全穷尽）：每个分解维度不重叠、合起来不遗漏；结论先行、以上统下。
- 【团队约束】①指标树拆解（北极星→输入指标）必须过 MECE 检验，否则会出现两个指标算同一件事（口径冲突温床）；②常用拆解维度：乘法拆解（GMV=流量×转化率×客单价）、加减拆解（留存=新客+活客+回流−流失）、组织拆解（T1/T2/T3，见 2.7）。
- 【锚点】https://www.mckinsey.com/alumni/news-and-events/global-news/alumni-news/barbara-minto-mece-i-invented-it-so-i-get-to-say-how-to-pronounce-it ；https://en.wikipedia.org/wiki/MECE_principle

### 2.6 阿里 OneData 与指标建模规范

- 【出处】阿里巴巴《大数据之路：阿里巴巴大数据实践》（2017，电子工业出版社）提出 OneData 体系；产品化为阿里云 Dataphin / DataWorks。
- 【核心内容】OneData = **OneID（统一身份）+ OneModel（统一模型）+ OneService（统一服务）**。指标建模核心是三层指标对象：**原子指标**（业务过程 + 度量，如"支付订单金额"）＋**时间周期**＋**修饰词** → 组合生成**派生指标**（如"近 7 天线上生鲜门店下单总数"），再组合出衍生/计算指标。配套命名规范（词根表）、数据板块/主题域分层、公共层唯一生产。
- 【团队约束】①原子指标只能在公共层创建（DataWorks 产品规则硬编码了这一约束）；②派生指标 = 原子+周期+修饰词的**组合式定义**让"同名不同口径"无处藏身；③对团队：词根表和原子/派生分层可零成本抄用。
- 【锚点】https://www.alibabacloud.com/help/zh/dataworks/user-guide/data-metric/ ；https://www.alibabacloud.com/help/zh/dataworks/user-guide/derived-metric ；https://www.cnblogs.com/zsql/p/15768139.html

### 2.7 滴滴指标分级与生命周期

- 【出处】滴滴技术《滴滴数据仓库指标体系建设实践》（2020）。
- 【核心内容】①**指标分级**：T1（公司战略层）/T2（业务策略层）/T3（业务执行层），自上而下拆解、自下而上归因；②**指标生命周期**：定义→生产→消费→下线，全程配运维、质量保障、数据运营；③指标核心管理层放 DWM 层，配元数据管理工具维护维度基础信息与技术信息。
- 【团队约束】T1/T2/T3 分级直接决定报表权限、告警级别和变更评审强度（T1 指标改口径必须全员周知）；"下线"环节常被忽略——指标无下线机制则字典必然腐化。
- 【锚点】https://www.cnblogs.com/didijishu/p/13590106.html

### 2.8 字节跳动：指标字典 + 数据 BP 组织 + DataLeap 指标平台

- 【出处】字节跳动数据平台/火山引擎官方输出：DataLeap 指标平台案例（2023-08）；"中台 + BP 制"组织模式公开解读（2021）；火山引擎 DataTester（见 §3）。
- 【核心内容】①**组织侧**：字节未采用纯中台制，而是"中台 + BP（数据 BP）制"——平台提供通用能力，数据 BP 嵌入业务线负责需求与口径落地，避免中台脱离业务；②**工具侧**：DataLeap 指标平台提供"指标定义、运营、发现、洞察、质量、消费与反馈"全流程；案例中"音乐投稿率"与"音乐投稿率（音乐元素投稿比例）"同名近义、口径不同，解法是：**每个指标指定唯一负责人 → 关联方向对齐口径 → 公共层统一加工 → 可视化屏蔽物理表**，最终口径答疑会大幅减少；③机制上自上而下发起指标看板建设，从业务指标诉求中抽象统一规范并建使用规范。
- 【团队约束】①"指标必须有唯一负责人"比"指标定义写得全"更重要——无主指标等于没有指标；②屏蔽物理表（只暴露指标视图）是防口径漂移的工程手段；③数据 BP 角色对小团队同样适用（可由分析负责人兼任）。
- 【锚点】https://www.cnblogs.com/bytedata/p/17660141.html （DataLeap 案例，官方号）；https://cloud.tencent.com/developer/article/1948665 （中台+BP，转述官方分享）；https://www.dtstack.com/zh-cn/blogs/bbs-article-110/

### 2.9 美团：指标治理与新一代指标平台（自动语义）

- 【出处】美团技术团队官方：①《业务数据治理体系化思考与实践》（2022-05）——在元数据仓库上搭建数据治理指标体系；②《美团 BI 在指标平台和分析引擎上的探索和实践》（2026-03-20）。
- 【核心内容】②文要点：BI 从"数据集驱动"转向"指标驱动"解决口径混乱与性能瓶颈；**自动语义**能力实现"定义即研发"——业务口径与技术口径连接定义，自动解析为结构化逻辑表达、自动关联星型/雪花模型、智能路由选表；**增强计算**（智能物化宽表/汇总表 + 查询降级）兼顾运营监控（秒级）与灵活分析（海量）。指标定义能力覆盖限定指标、忽略维度、二次计算、期初期末等复杂语义。当前支撑百余业务线、百万级查询量、成功率 99.9%+。文中转引：**Gartner ABI 报告 2023 年将 Metrics Store（指标仓库）列为 BI 关键 12 能力之一，2025 年将 Metrics Layer 列为 BI 常见能力第一位**。
- 【团队约束】①"业务口径由业务团队写、技术口径由数仓团队写、平台推导非原子指标生产过程"的**双口径连接定义**是可直接采纳的协作契约；②全局路由（统一口径）+ 数据集（细分场景口径）双轨制，回答了"统一口径会不会牺牲灵活性"这一常见反对意见；③自建指标平台前先读此文——它列出了自建必须回答的四大挑战（语义表达、分析扩展、自动化语义层、计算性能）。
- 【锚点】https://tech.meituan.com/2026/03/20/Busniness-Intelligence-practice-in-meituan.html （一手官方文）；https://tech.meituan.com/2022/05/12/Business-Data-Governance.html

### 2.10 大厂实践共性提炼：指标中台五件套

无论阿里/字节/美团/滴滴，落地形态不同，机制上收敛为同一套五件套（团队可直接对标自查）：

1. **分层定义**：原子指标公共层唯一生产；派生/衍生指标组合式生成（阿里/美团/滴滴一致）。
2. **注册评审**：指标进入字典前过注册 + 评审，指定唯一负责人（字节案例、美团配送 P0/P1 指标注册评审一致）。
3. **双口径记录**：业务口径（业务语言）+ 技术口径（SQL/字段映射）同时登记，且互相绑定。
4. **血缘 + 变更周知**：指标↔表↔字段映射打通，口径变更触发下游周知（字节案例的核心痛点）。
5. **分级运营**：核心指标严格治理（T1/PR、P0/P1），探索指标快速通道（P2/自定义），治理与灵活两开。

---

## 3. A/B 测试与实验规范

> **文眼**：A/B 实验的价值不在"跑过实验"，而在**可信**；可信 = 实验前（随机化/样本量）+ 实验中（SRM/peeking 防护）+ 实验后（分层核查/统计推断）三段都有机械可查的纪律，微软、字节、美团三家的规范在这些点上完全一致。

### 3.1 微软 ExP：全球实验方法论的源头

- 【出处】Microsoft Experimentation Platform（ExP），Ronny Kohavi 于 2006 年立项、2007 年上线；2019 年时微软 15+ 主要产品线（Bing/Office/Windows/Xbox/Teams 等）在用。方法论载体：《Trustworthy Online Controlled Experiments: A Practical Guide to A/B Testing》（Kohavi, Tang, Xu，Cambridge University Press, 2020）；《Seven Rules of Thumb for Web Site Experimenters》（KDD 2014）；《A/B Testing Intuition Busters》（KDD 2022）；《Statistical Challenges in Online Controlled Experiments》（The American Statistician, 2023）。
- 【核心内容】①实验 = 在线对照实验（OCE），随机化保证因果推断；②**七条经验规则**（KDD 2014）：速度很重要（且页面关键区域更重要）、实验至少运行 1–2 周并覆盖完整周（防周内效应与新奇效应）、警惕新奇效应（第一周提升常衰减）、样本量决定可检测效应、审计反向指标、避免"看起来显著"的跨实验过度解读等；③后续论文系统化常见误解：统计显著≠业务重要、区间估计优于点估计、多重比较与 peeking 陷阱。
- 【团队约束】①任何实验结论必须同时报效应量 + 置信区间，不报裸 p 值；②实验周期覆盖完整周是硬约束；③experienced 从业者凭直觉判断产品策略的正确率仅约 1/3（Kohavi 引用，美团白皮书亦转引）——这就是必须实验、不能拍板的量化依据。
- 【锚点】https://exp-platform.com/ （平台史与论文列表，一手）；https://exp-platform.com/rules-of-thumb/ ；https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/

### 3.2 字节 Libra / DataTester

- 【出处】字节跳动实验平台 Libra，对外产品名火山引擎 A/B 测试 DataTester；官方输出与媒体披露（36氪 2020-09：上线 9 年累计 70 万+ 实验、日新增 1500+ 实验、服务 400+ 业务；DataFun 2023：累计 240 万+ 实验、日新增 4000+、同时运行 5 万+、服务 500+ 业务线）。
- 【核心内容】①实验文化："一切改动皆实验"——产品/算法/运营策略默认走实验；②平台能力：科学分流（分层正交模型，业界普遍以《Overlapping Experiment Infrastructure: More, Better, Faster Experimentation》Google 2010 论文为蓝本）、智能统计引擎（置信区间、p 值、MDE 灵敏度）；③**MDE（最小可检测效应）用于判断"不显著"结论是否 solid**：若指标目标提升率低于当前样本量下的 MDE，则"无显著差异"可能是"样本不够"而非"真无差异"。
- 【团队约束】①每个实验开启前必须先算样本量/MDE，不能先跑再看；②分流模型直接复用分层正交 + 域嵌套的成熟设计，不要自创；③实验数量大时必须依赖平台化的分流与报告自动化，人工 Excel 式评估不可持续。
- 【锚点】https://m.36kr.com/p/1191621103733001 ；https://zhuanlan.zhihu.com/p/649134539 ；https://www.cnblogs.com/bytedata/p/17223854.html ；https://www.cnblogs.com/bytedata/p/16992173.html （MDE 解释，官方号）；https://www.volcengine.com/docs/6287/65838 （实验报告解读，官方文档）

### 3.3 美团：可信实验白皮书 + 配送 A/B 评估体系

- 【出处】①《可信实验白皮书（方法指南篇）》，美团履约 & 外卖团队资深数据科学家撰写，2025-08 PDF 发布，技术团队公众号 2025-05 起系列连载（共 8 章）；②《美团配送 A/B 评估体系建设与实践》（2020-05-28）。
- 【核心内容】**白皮书 8 章体系**：1 走进 AB 实验；2 实验基础与统计学基础（假设检验、两类错误、P 值）；3 随机对照实验（含提高功效的进阶手段、保证同质性的实验方式、解决溢出效应的复杂随机对照）；4 随机轮转实验（抛硬币/完全/配对轮转）；5 准实验（双重差分 DID）；6 观察性研究（合成控制、匹配、Causal Impact）；7 高阶工具（统合分析、多重比较）；8 开放式分析引擎（SDK 与线下分析实战）。针对履约场景的特有挑战：小样本（城市区域仅几十个）与**溢出效应**（SUTVA 被违反——骑手跨区域接单导致实验单元不独立）。
- 【核心内容（2020 配送文）】①业界分流基本以 Google 分层实验论文为蓝本，但配送场景涉及用户/骑手/商家三端、请求不独立，传统用户哈希分流失效 → 采取**限流准入 + AA 分组**（实验前用动态规划找出无统计显著差异的对照组/实验组）；②**指标分级运营**：治理指标 P0/P1（注册 + 评审 + 数据团队第三方独立生产，保证权威）vs 探索指标 P2（算法团队自定义、免评审、即席查询）；③**染色数据**：参与实验的流量每次操作打上实验场景/实验组/分组标记，业务数据模型与染色数据模型按流量实体关联成实验粒度模型——解决"选了区域但并非该区域全部单量都触发实验"的归因问题；④评估以 T 检验 + P 值为准（弃真错误概率一般取 0.05）。
- 【团队约束】①实验假设/成功指标/分流策略必须在实验前文档化（美团五步闭环：提出假设→定义成功指标→检验假设→分析学习→发布）；②AA 分组或 SRM 校验是实验可信的最低门槛；③治理指标与探索指标必须分级——防止实验者"只挑支持自己假设的指标"（原文明确指出此风险）。
- 【锚点】白皮书 PDF：https://s3plus.meituan.net/ddfile/2025可信实验白皮书2025.8.20.pdf ；https://tech.meituan.com/2025/05/22/meituan-AB-Online-Controlled-Experiment-01.html ；https://tech.meituan.com/2025/08/22/meituan-AB-Online-Controlled-Experiment-08.html ；https://tech.meituan.com/2020/05/28/Peisong-A-B-Test.html （一手全文已核）

### 3.4 样本量计算与方差缩减

- 【出处】①两比例 Z 检验样本量公式（经典统计，Neyman-Pearson 框架；业界工具如 Select Statistical Consultants 样本量计算器标准实现，power 常取 80%）；②"每实验组样本量 ≈ 16·p̄(1−p̄)/δ²"经验式：Kohavi 等（KDD 2014 论文 / 2020 专著）给出的 α=0.05、power=0.8 下的速算规则；③CUPED：Deng, Xu, Kohavi, Walker，《Improving the Sensitivity of Online Controlled Experiments by Utilizing Pre-experiment Data》，WSDM 2013（微软）；④美团 KDD 2024 论文解读确认 CUPED/CUPAC/MLRATE 等方差缩减方法已在美团落地。
- 【核心内容】两比例指标（转化率类）样本量：n（每组）= (z_{α/2}·√(2p̄q̄) + z_β·√(p₁q₁+p₂q₂))² / (p₁−p₂)²，α=0.05、β=0.2 时可用 16 倍规则速算。均值类指标用两样本 T 检验版本（需方差估计）。CUPED 用实验前协变量（实验前同窗口的同指标）构造校正变量，可缩减方差、等效减少样本量或缩短实验周期。
- 【团队约束】①开实验前必须给出：指标基线 p̄、目标 MDE、α、power → 样本量 → 预计实验天数；②"跑满样本量前禁止看结论"（防 peeking；若必须中途看，用序贯方法或修正显著性水平）；③实时数仓团队的责任是为实验平台提供稳定准确的实验前数据（CUPED 的协变量）与染色数据模型。
- 【锚点】https://select-statistics.co.uk/calculators/sample-size-calculator-two-proportions/ ；https://exp-platform.com/rules-of-thumb/ ；https://tech.meituan.com/2024/07/26/KDD-2024.html （CUPED/CUPAC/MLRATE 落地，官方）

### 3.5 辛普森悖论与幸存者偏差防范

**辛普森悖论**
- 【出处】Edward H. Simpson，1951 年论文《The Interpretation of Interaction in Contingency Tables》（JRSS-B）；在 A/B 测试语境的工程化讨论见微软 ExP"puzzling outcomes"专栏与多篇业界复盘。
- 【核心内容】分组数据与合并数据呈现**相反方向**的结论。A/B 中的典型形态：实验组总体 +3%，但按设备/地域/用户群分层后每个 segment 都在输——权重结构差异（如实验组涌入了更多低基线 segment）造成的合并优势假象。中文实践文概括为"合并与分组两个口径单独看都没错，但指向截然相反的行动"。
- 【防范纪律】①实验分流时把强混杂因子（平台/地域/新老客）纳入分层分流或至少纳入 AA 校验指标集（美团配送文：分流因子选取）；②实验解读时强制做 segment 方向核对：总体显著但多数 segment 反向 → 报警而非庆祝；③比值/比率指标（转化率、人均值）比加总指标更易触发，评估时同时看分子分母。
- 【锚点】https://zh.wikipedia.org/wiki/辛普森悖论 ；https://atticusli.com/replication-crisis/ab-testing-simpsons-paradox/ ；https://www.cnblogs.com/datadriven/p/simpson-paradox-in-abtesting.html ；https://www.woshipm.com/zhichang/6419417.html

**幸存者偏差**
- 【出处】经典统计学/因果推断常识（教科书级概念；二战 Wald 飞机弹孔案例为通用教学典故）；中文产品复盘语境的系统讨论见《产品复盘三大归因陷阱》（2025）。
- 【核心内容】只统计"留存至今"的样本导致系统性偏差。分析场景：①只用当前活跃用户算行为均值（流失用户不在样本里）；②功能"老用户都喜欢"的结论忽略掉被劝退的用户；③对"成功案例"归因而忽略沉默失败者。
- 【防范纪律】①一切用户级分析按 **cohort（同期群）** 切，禁止用存量截面替代；②漏斗与留存分析必须从"进入漏斗/注册"全量出发，而非从"完成第一步"出发；③复盘结论必须回答"哪些人不在样本里"。
- 【锚点】https://www.woshipm.com/zhichang/6419417.html

**相关≠因果的警示**（与上两者并列的第三陷阱）：微软 Office 365 观测到"看到错误信息并崩溃的用户流失率更低"，实为高活跃用户既看到更多错误又流失更低——美团白皮书 §1.1 转引此例，连同"巧克力消耗量与诺贝尔奖数相关 0.79"共同说明：观察性相关不可作为策略依据，因果结论必须走实验或准实验（DID/合成控制，白皮书 §5–6）。

### 3.6 实验生命周期检查清单（由上述规范提炼，可直接入库）

**实验前**
- [ ] 假设与成功指标已文档化，指标取自指标字典（治理级），非自定义裸 SQL
- [ ] 分流单位与分流因子已评审（是否需要区域/骑手级等非用户级分流；溢出效应评估）
- [ ] 样本量/MDE 已计算：α=0.05、power≥0.8，预计天数覆盖 ≥1 个完整周
- [ ] AA 校验方案就绪（新流量 AA 试跑或历史 AA 分组）；关键混杂维度已列入校验集
- [ ] 反向指标（性能、崩溃率、负反馈）与护栏指标已定义

**实验中**
- [ ] SRM 检查：实验/对照组样本比与配置比偏离超阈值即报警（默认 <0.1% 偏离容忍，参照 ExP 惯例）
- [ ] 禁止在达到样本量前做"是否显著"的正式结论（peeking 控制）
- [ ] 染色数据完整落仓，实验粒度模型可对账

**实验后**
- [ ] 报告含：效应量 + 置信区间 + p 值，禁止只报相对提升
- [ ] 分层方向核对：核心 segment（新老客/平台/地域）方向一致性检查（辛普森悖论防线）
- [ ] 新奇效应核对：首周 vs 后续周趋势
- [ ] 决策记录：发布/不发布/迭代，含否决理由（一次定清，避免反复争论）

---

## 4. 语义层与 Headless BI

> **文眼**：语义层/指标层的行业地位已从"Looker 的产品特性"升级为"Gartner ABI 第一位常见能力 + 开放标准（OSI）"；对团队的意义是——指标口径管理有了标准化工程载体，不必再自建指标平台。

### 4.1 概念脉络（现状基线）

- 【出处】美团 BI 实践文（2026-03，转引 Gartner）+ Airbnb Minerva。
- 【核心内容】①Looker（2012 年创立，LookML 建模语言）最早把"语义模型与 BI 工具分离"产品化；②2021 年 Airbnb Minerva《Minerva: A Unified Approach to Business Intelligence Metrics》公开，标志"指标平台"概念确立（美团官方文即以此为指标平台元年）；③Gartner ABI 神力象限：2023 年 Metrics Store 列为 12 项关键能力之一，2025 年 Metrics Layer 列为常见能力第一位（经美团官方文转引）；2025 Gartner Critical Capabilities 中 "Metrics Creation" 亦成为独立评能力项（Pyramid Analytics 转引）。
- 【锚点】https://tech.meituan.com/2026/03/20/Busniness-Intelligence-practice-in-meituan.html ；https://pyramidanalytics.com/gartner-2025-critical-capabilities-for-abi

### 4.2 dbt Semantic Layer + MetricFlow

- 【出处】dbt Labs 官方文档与官方博客（docs.getdbt.com；Coalesce 2025 公告）。
- 【核心内容（截至 2026-09 现状）】①旧 dbt Metrics 包已**废弃**，由 MetricFlow 引擎接替（2023 年 dbt 收购 Transform 获得该技术）；②当前架构：在 dbt 模型 YAML 上定义 **semantic models**（entities/dimensions/measures）+ **metrics** + saved queries，MetricFlow 基于 semantic graph 动态生成 SQL，经 REST/GraphQL/JDBC API 供下游工具查询；③**许可演进**：MetricFlow 原为 source-available，2025-10 Coalesce 大会宣布**开源（Apache 2.0）**，并与 Snowflake/Salesforce 等合作对齐开放语义标准；④支持 dbt v1.12+，另支持以 Apache Ossie 文档定义语义层（Apache Ossie，孵化中，开源语义层文档标准）；⑤dbt 官方定位：语义层是 AI/Agent 可信取数的关键——"指标不应是概率性的、依赖 LLM 猜计算，而应是确定性的"。
- 【团队约束】①选 dbt 语义层 = 绑定 dbt 生态与 dbt Cloud/平台能力（查询 API 部分能力与平台绑定，需核对许可条款）；②YAML 语义定义可进 Git 走 PR 评审，天然兼容"指标注册评审"SOP；③轻量团队可用 dbt-core + 开源 MetricFlow 自托管。
- 【锚点】https://docs.getdbt.com/docs/use-dbt-semantic-layer/sl-faqs （一手）；https://docs.getdbt.com/docs/build/semantic-models ；https://www.getdbt.com/blog/open-source-metricflow-governed-metrics ；https://www.getdbt.com/blog/dbt-labs-affirms-commitment-to-open-semantic-interchange-by-open-sourcing-metricflow

### 4.3 Open Semantic Interchange（OSI，开放语义交换倡议）

- 【出处】Snowflake 牵头，与 dbt Labs、Salesforce 等于 2025-09-23 联合发布；Apache 2.0 许可。
- 【核心内容】厂商中立的**语义元数据开放标准**（指标、维度、数据集、关系等语义元数据的互操作格式），目标是语义定义可跨平台迁移，防供应商锁定；dbt MetricFlow 开源即声明对齐 OSI。
- 【团队约束】选型时把"是否支持/对齐 OSI"作为长期锁定风险评估项；自建指标字典时，字段设计可参考 OSI 的语义元数据模型，保持未来可迁移。
- 【锚点】https://www.snowflake.com/en/news/press-releases/snowflake-salesforce-dbt-labs-and-more-revolutionize-data-readiness-for-ai-with-open-semantic-interchange-initiative/ （一手）

### 4.4 Cube（Headless BI 代表）

- 【出处】Cube Dev（cube.dev），Cube Core 开源（GitHub cube-js/cube）。
- 【核心内容】开源语义层起家，定位"built on a semantic layer 的 agentic analytics 平台"；能力：语义模型（cubes/views/measures/dimensions/joins/access rules in code）、**pre-aggregations 预聚合加速**（对直连明细库查询性能问题的招牌解法）、多协议 API（REST/GraphQL/SQL）、行级权限与缓存、MCP server/Chat API 供 AI agent 消费；单仓多引擎，可对接 MySQL/ClickHouse/DuckDB 等多种数据源。
- 【团队约束】①对本团队最相关的特性是 pre-aggregation：能在**不改 Flink/Paimon 生产链路**的前提下为 BI 查询自动建汇总加速，缓解实时明细查询压力；②Headless 模式（语义层 API 喂给任意 BI/应用）与"指标一处定义多处消费"的大厂指标中台理念同构；③注意开源核心与企业云版的功能边界（行级权限等高级能力核对许可）。
- 【锚点】https://docs.cube.dev/docs/introduction ；https://github.com/cube-js/cube ；https://cube.dev/articles/what-is-headless-bi

### 4.5 选型对照与建议

| 方案 | 本质 | 优势 | 代价/风险 | 适合谁 |
|---|---|---|---|---|
| 阿里 OneData / DataWorks·Dataphin | 中台方法论 + 产品 | 指标建模规范最成熟，国内生态熟 | 绑定阿里云产品；重 | 已在阿里云体系的企业 |
| dbt Semantic Layer + MetricFlow | Git 化语义层 | 指标进 Git/PR 评审；Apache 2.0 开源后可自托管；OSI 对齐 | 需采用 dbt 工作流；实时源适配需验证 | 数据转换已在/计划用 dbt 的团队 |
| Cube | Headless BI 语义层 | 预聚合加速强；多数据源/多协议；AI agent 友好 | 需自维护一层服务；高级功能许可核对 | 多 BI 工具/多应用消费同一套指标的团队 |
| 大厂自建指标平台（美团模式） | 自研元数据+语义+物化 | 深度贴合业务、性能可控 | 研发成本极高 | 有平台团队的中大型组织 |
| BI 工具内置指标能力 | BI 内闭环 | 零额外组件 | 口径被单工具锁定，跨工具不一致风险高 | 极小团队起步 |

**本团队建议（分两步走）**：第一步（立即可做，零新增组件）——用 Git 仓库 + YAML 文件建立指标字典与注册评审流程（§6 SOP-01），字段设计参考 OSI 语义元数据模型；第二步（指标消费方 ≥3 个工具或 AI 取数需求出现时）——在 Dinky/Flink 产出的 Paimon/Fluss/MySQL 汇总层之上引入 dbt Semantic Layer 或 Cube 做统一语义出口，实时指标务必与离线指标共用同一语义定义，仅物化链路不同。

---

## 5. 数据可视化与报告规范

> **文眼**：可视化规范的国际解是 IBCS（已升格为 ISO 24896:2026），国内解是 AntV/飞书设计规范；共同内核是同一句话——**图表选型从"我要回答什么问题"出发，而不是从"图长什么样"出发**。

### 5.1 IBCS 与 ISO 24896:2026

- 【出处】International Business Communication Standards（IBCS®），HICHERT+FAISST 发起的 Creative Commons 项目，由非营利 IBCS Association 治理发布；**2026 年其记号体系升格为 ISO 24896:2026《Notation for Business Reporting》——首个商务报告记号国际标准**。
- 【核心内容】SUCCESS 七规则组：**S**ay（传达信息：报表必须有明确 message，不是数据堆砌）、**U**nify（语义统一：同样的事物看起来一样，不同的看起来不一样——统一的语义记号：实心=实际、空心=预测/计划、斜纹=对照期等）、**C**ondense（提高信息密度）、**C**heck（视觉完整性：防图表操纵）、**E**xpress（选对表达：图表类型服从信息类型）、**S**implify（去杂物）、**S**tructure（结构化组织：报表页结构层级）。
- 【团队约束】①管理/经营类报表直接套 SUCCESS：最见效的是 Unify（语义记号统一）与 Check（杜绝截断 Y 轴等操纵）；②ISO 24896 可作为对外交付/审计场景的引用依据。
- 【锚点】https://www.ibcs.com/IBCS （一手）；https://www.ibcs.com/ （ISO 24896 发布公告）

### 5.2 经典个人规范：Tufte 与 Few

- 【出处】①Edward Tufte，《The Visual Display of Quantitative Information》（1983，第 2 版 2001）；②Stephen Few，《Information Dashboard Design》（2006/2013）及 Perceptual Edge 白皮书系列（如《Tapping the Power of Visual Perception》2004、《Dashboard Design for Real-Time Situation Awareness》）。
- 【核心内容】①Tufte：**数据墨水比**（data-ink ratio 最大化，删掉与数据无关的墨水）、**lie factor**（图形变化与数据变化之比，>1.05 即为误导）、防图表垃圾（chartjunk）；②Few：仪表盘是"一屏之内传达达成目标所需的最重要信息"的视觉展示，强调前注意加工（颜色/形状先于意识被感知）驱动的快速阅读；实时监控型仪表盘与死报告设计原则不同。
- 【团队约束】团队规范可压缩为三句 Tufte/Few 纪律：删掉非数据墨水、图形比例忠实于数据比例、监控大盘（Few 式）与分析报告（IBCS 式）分开设计。
- 【锚点】https://www.perceptualedge.com/articles/ie/visual_perception.pdf ；https://www.perceptualedge.com/articles/Whitepapers/Dashboard_Design.pdf ；数据墨水比中文实践：https://zhuanlan.zhihu.com/p/137943119

### 5.3 国内设计规范：AntV 与飞书

- 【出处】①蚂蚁集团 AntV《图表用法》+ Ant Design 可视化规范；②字节跳动飞书开放平台《数据可视化设计指南》（2025-02 更新）。
- 【核心内容】①**AntV 图表用法**：图表按功能分类——比较/分布/流程/占比/区间/关联/趋势/时间/地图 九类，选型首要问题是"我有什么数据、需要用图表做什么"，而不是"图表长成什么样"（按形状分类是误用之源）；Ant Design 提供配套语义色板。②**飞书指南**：色板体系分分类色板/顺序色板等；分类色板给出行业通用的用色顺序建议，**类别超过 14 个时建议循环取色**；对不同数据关系（构成/比较/趋势/分布）给出图表匹配规则。
- 【团队约束】这两家是国内公开、可自由引用、与主流前端生态（ECharts/AntV 组件）兼容的选型规范，直接抄进团队 wiki 即可，不必自研。
- 【锚点】https://antv-2018.alipay.com/zh-cn/vis/chart/index.html （一手）；https://ant-design.antgroup.com/docs/spec/visual-cn ；https://open.feishu.cn/document/design-specification/data-visualization/data-visualization-design-guide?lang=zh-CN

### 5.4 图表选型速查表（团队可裁剪版）

| 分析问题 | 首选图 | 次选 | 禁用 |
|---|---|---|---|
| 分类比较（少类别） | 柱状图（横向条形更易读标签） | 点图 | 饼图 |
| 类别占比（≤5 类） | 饼图/环形图 | 堆叠柱 | 类别>5 仍用饼图 |
| 时间趋势 | 折线图 | 面积图（单序列） | 双轴折线滥用 |
| 相关性 | 散点图 | 气泡图 | 双 Y 轴暗示因果 |
| 分布 | 直方图/箱线图 | 核密度图 | 用均值柱状图代替分布 |
| 目标达成 | 子弹图（Few） | 仪表盘指针图（限实时监控） | 装饰性仪表盘 |
| 流量转化 | 漏斗图 | 分步堆叠条 | 3D 漏斗 |
| 地理分布 | 分级统计地图 | 散点地图 | 把地图当装饰背景 |

### 5.5 反模式清单（评审 checklist）

- [ ] Y 轴从非 0 起点且未显式标注（夸大差异，违反 IBCS Check）
- [ ] 双 Y 轴两个量纲暗示虚假因果
- [ ] 饼图 >5 类 / 3D 饼图
- [ ] 折线图 X 轴时间间隔不均匀（如股票式抽取）
- [ ] 彩虹色板表达连续数值（顺序色板才是正解，飞书指南）
- [ ] 红绿同框区分数据（色盲不可达；用蓝橙）
- [ ] 图例距离图形过远 / 颜色分类 >14 未循环取色（飞书指南硬规则）
- [ ] 无口径脚注：图上数字缺"口径 + 时间窗 + 数据源"三要素（团队硬约束，见 SOP-05）
- [ ] 表格当图表用（大量数字无人读）/ 图表当表格用（精确值必须表格）

### 5.6 报告结构规范

- 结论先行（金字塔原理，Minto）：第一页/第一段给判断与建议，证据在后。
- 每个关键数字三要素：口径定义 + 时间窗 + 来源表/作业（可追溯性）。
- 探索性分析与定论报告分开：探索稿必须显式标注"未过评审口径，仅供参考"。

---

## 6. 对实时数仓团队的能力落点建议（SOP 固化清单）

> **文眼**：数据分析域对 Flink/Paimon/Fluss 团队的核心要求是"指标生产端的可信"——实时链路是指标的第一现场，口径契约与实时/离线一致性是两个必须最先固化的 P0。

### 6.1 能力地图（本域视角）

| 能力 | 现状常见短板（实时数仓团队特有） | 对应规范来源 |
|---|---|---|
| 指标口径管理 | 指标名随口起；SQL 散落在 Dinky 作业；无负责人 | §2 五件套（阿里/字节/美团收敛解） |
| 实时/离线一致性 | Flink 汇总与批口径对不上（事件时间/迟到数据/watermark 差异） | §2.9 美团双口径；§4 语义层同一定义 |
| 实验支撑 | 染色数据/实验粒度模型缺失；实验指标来自裸 SQL | §3.3 美团染色数据 + P0/P1/P2 分级 |
| 报表与大盘 | 监控大盘与经营报表混用；图表无口径脚注 | §5 IBCS/Few/AntV |
| 分析项目流程 | 临时取数无方法论约束 | §1 CRISP-DM/TDSP |

### 6.2 应固化的 SOP（按优先级）

**SOP-01 指标口径管理规范（P0，第一优先）**

- 指标唯一注册入口：任何对外指标必须先登记再开发；登记卡字段（YAML 样例，可直接入库）：

```yaml
metric: pay_order_amt_d                      # 指标英文名（词根组合）
name_cn: 当日支付订单金额                      # 中文名
level: T2                                     # T1 战略/T2 策略/T3 执行
type: atomic                                  # atomic 原子 / derived 派生 / derived+  衍生
biz_process: pay_order                        # 业务过程
measure: sum(pay_amount)                      # 度量与聚合
time_window: 1d                               # 时间周期
modifiers: [线上]                              # 修饰词
biz_caliber: "支付成功的订单金额，不含已全额退款订单"   # 业务口径（业务方写）
tech_caliber: >                                # 技术口径（数仓写）
  SELECT SUM(pay_amount) FROM dwd_pay_order_di
  WHERE pay_status = 'SUCCESS' AND refund_full = 0
owner: @zhang.san                             # 唯一负责人（必填）
upstream: [dwd_pay_order_di]                  # 上游表
sink: [paimon.dws_pay_rt, mysql.ads_pay]      # 物化去向
refresh: realtime@Flink + daily@batch         # 刷新机制
created: 2026-09-04
```

- 规则（三角验证自阿里/字节/美团实践）：①原子指标只在公共层（dwd/dws）定义一次；②派生指标 = 原子 + 时间周期 + 修饰词组合，禁止另写 SQL 版本；③每个指标必须有唯一 owner；④业务口径与技术口径同时登记并互相绑定；⑤口径变更必须走评审并周知所有下游消费方（血缘驱动）；⑥指标有下线流程。

**SOP-02 指标命名与分层规范（P0）**

- 词根表先行（业务过程词根 + 修饰词根），命名 = 词根组合，禁拼音混编、禁中英混拼。
- 分层落位：dwd（原子/明细）→ dws（轻度汇总，指标主产地）→ ads（面向场景）；T1/T2/T3 分级决定变更评审强度（T1 口径变更需团队外周知）。

**SOP-03 实时/离线一致性对账（P0，实时数仓团队独有职责）**

- 每个注册指标若同时有实时与离线物化，必须建立**每日对账作业**（Dinky 定时批）：Fluss/Paimon 实时结果 vs 批重算结果，差异率超阈值（建议 0.1%，按指标定）告警并出三方排查单（Flink 作业 / 源头 / 口径漂移）。
- 对账前提：事件时间语义统一（event time + watermark 策略登记进指标卡 tech_caliber）；迟到数据处理策略（allow lateness/侧输出）显式写入口径。
- 口径漂移定义：任何一侧修改了过滤条件/去重逻辑/时间窗而未同步另一侧与指标卡——按事故处理。

**SOP-04 实验支撑规范（P1）**

- 实验指标必须取自指标字典（治理级 P0/P1），探索指标允许即席但不得进入正式报告（美团 P0/P1/P2 模式）。
- 分流/染色数据落仓约定：实验标记（实验 ID/组别）随事件进入 Paimon 明细，实验粒度宽表与业务宽表按实体键关联。
- 实验"三算"清单进 PR 模板：样本量/MDE 预计算、AA/SRM 校验、分层方向核对（§3.6 检查清单整体入库）。

**SOP-05 报表与可视化规范（P1）**

- 采用 §5.4 选型表 + §5.5 反模式清单为评审门；所有报表页脚必须含口径脚注（指标名→字典链接 + 时间窗 + 数据源）。
- 监控大盘（Few 式，一屏、秒读、自动刷新）与经营/分析报告（IBCS 式，结论先行）分开评审。

**SOP-06 分析项目流程（P2）**

- 涉及建模/归因的分析项目按 CRISP-DM 六阶段立项（模板抄 TDSP charter），交付物含：业务理解（sharp question + SMART 成功指标）、数据理解（数据源与质量报告）、结论（含口径三要素）、决策建议。

### 6.3 落地节奏建议

| 阶段 | 动作 | 依赖 |
|---|---|---|
| 第 1 周 | SOP-01 指标卡 YAML 模板 + 词根表入库；盘点存量 T1/T2 指标补登记 | 无 |
| 第 2–3 周 | SOP-02 命名规范宣贯；SOP-03 对账作业搭框架（先覆盖 T1 指标） | 指标卡到位 |
| 第 2 个月 | SOP-04 实验三算清单并入需求模板；SOP-05 可视化评审门上线 | 字典可用 |
| 持续 | 指标下线季度清理；对账差异复盘 | 各 SOP 运行 |

### 6.4 明确不建议做的

- 不要在指标字典尚未建立时先上指标平台工具（工具会固化坏口径；先有契约再有平台——美团指标平台也是先有元数据治理体系）。
- 不要让同一指标同时存在"平台定义版"和"某作业里的 SQL 版"（回归字节"音乐投稿率"案例的老路）。
- 不要把探索性即席 SQL 直接固化为报表（口径未经注册评审，违反 SOP-01）。

---

## 7. 附录：标准与方法论索引表

> 共 40 条目；"约束"列 = 对本数据团队的实际约束。调研窗口：2026-09-04；各条目时效以所附 URL 页面当时内容为准。

| # | 名称 | 标准号/出处 | 机构/提出者 | 核心内容 | 团队约束 |
|---|---|---|---|---|---|
| 1 | KDD 流程 | CACM 39(11):27-34, 1996；KDD-96 框架文 | Fayyad, Piatetsky-Shapiro, Smyth（ACM/AAAI） | 九步知识发现流程 | 术语与认知底座，不作项目 SOP |
| 2 | CRISP-DM 1.0 | 《Step-by-Step Data Mining Guide》1999-2000 | SPSS/Daimler/NCR/OHRA 联盟 | 六阶段循环流程 | 分析项目立项模板骨架 |
| 3 | Microsoft TDSP | Azure/Microsoft-TDSP, 2016 | Microsoft | 5 阶段 + 4 组件 + 角色泳道 + 仓库/文档模板 | 项目结构与文档模板直接抄 |
| 4 | 北极星指标 | Sean Ellis 2017；Amplitude《North Star Playbook》 | Sean Ellis / Amplitude | 单一价值指标 + 输入指标树，rate 优于 count | 北极星及其输入全部进字典 |
| 5 | OSM 模型 | 滴滴指标体系实践 2020（中文业界通行） | 滴滴等 | Objective→Strategy→Measurement；结果/过程指标 | 新指标先问目标与策略 |
| 6 | HEART + GSM | CHI 2010, Rodden et al. | Google | 五类体验度量 + Goals-Signals-Metrics | 体验类指标起手式，与 OSM 二选一 |
| 7 | AARRR | Startonomics 2007《Startup Metrics for Pirates》 | Dave McClure | 五段生命周期指标族 | 横向补盲检查指标覆盖 |
| 8 | MECE/金字塔 | 《The Pyramid Principle》1970s-1987 | Barbara Minto（麦肯锡） | 相互独立完全穷尽；结论先行 | 指标树拆解必须过 MECE |
| 9 | OneData | 《大数据之路》2017 | 阿里巴巴 | OneID+OneModel+OneService | 公共层唯一生产理念 |
| 10 | 原子/派生指标建模 | DataWorks/Dataphin 产品规范 | 阿里云 | 原子+时间周期+修饰词→派生 | 词根与组合式定义直接抄 |
| 11 | DataLeap 指标平台 | 火山引擎官方案例 2023 | 字节跳动 | 指标全流程管理；唯一负责人；屏蔽物理表 | 唯一 owner + 口径出口一致 |
| 12 | 中台+BP 组织模式 | 字节数据平台公开分享 2021 | 字节跳动 | 平台通用能力 + BP 嵌业务 | 小团队 BP 角色可兼任 |
| 13 | 美团指标平台/自动语义 | 美团技术团队 2026-03 | 美团 | 定义即研发；双口径连接；智能物化 | 业务/技术双口径协作契约 |
| 14 | 指标分级与生命周期 | 滴滴实践 2020 | 滴滴 | T1/T2/T3；定义-生产-消费-下线 | 分级定评审强度；补下线机制 |
| 15 | 微软 ExP 体系 | exp-platform.com, 2006- | Microsoft（Kohavi 等） | 大规模在线对照实验平台与方法 | 因果结论必须走实验 |
| 16 | Trustworthy Online Controlled Experiments | Cambridge UP, 2020 | Kohavi, Tang, Xu | A/B 实验工程化百科 | 实验规范引用基准书 |
| 17 | Seven Rules of Thumb | KDD 2014 | Kohavi, Deng, Longbotham, Xu | 七条实验经验规则 | 实验周期/新奇效应硬约束 |
| 18 | 字节 Libra/DataTester | 36氪 2020/DataFun 2023/官方文档 | 字节跳动 | 240 万+ 实验；MDE 灵敏度判断 | 实验前必算样本量/MDE |
| 19 | 美团可信实验白皮书 | 2025-08 PDF，8 章 | 美团履约&外卖 | RCT/轮转/准实验/观察性研究全套 | 实验设计规范的中文首选读本 |
| 20 | 美团配送 A/B 评估体系 | 美团技术团队 2020-05 | 美团配送 | AA 分组；染色数据；P0/P1/P2 指标分级 | 非用户级分流与实验数仓设计模板 |
| 21 | CUPED | WSDM 2013 | Deng, Xu, Kohavi, Walker（微软） | 实验前数据方差缩减 | 提供稳定实验前数据/协变量 |
| 22 | 辛普森悖论 | JRSS-B 1951 | E.H. Simpson | 分层与合并结论反转 | 分层分流 + segment 方向核对 |
| 23 | 幸存者偏差防范 | 统计学通识；woshipm 2025 复盘 | 统计学（Wald 典故） | cohort 分析替代存量截面 | 一切用户分析按同期群切 |
| 24 | dbt Semantic Layer/MetricFlow | docs.getdbt.com；Coalesce 2025 | dbt Labs | 语义模型 YAML + 动态 SQL + 多协议 API；2025-10 Apache 2.0 开源 | Git 化指标评审的工程载体 |
| 25 | Open Semantic Interchange | 2025-09-23 发布，Apache 2.0 | Snowflake/dbt/Salesforce 等 | 语义元数据互操作开放标准 | 字典字段设计对齐 OSI 模型 |
| 26 | Apache Ossie | ossie.apache.org（孵化中） | Apache | 开源语义层文档标准 | dbt 语义层的开放替代格式 |
| 27 | Cube 语义层 | cube.dev；github cube-js/cube | Cube Dev | 开源语义层 + 预聚合 + 多协议 + agent 接入 | 不改生产链路加 BI 加速层 |
| 28 | Looker LookML | Looker 2012- | Looker/Google Cloud | 最早的语义建模与 BI 分离产品 | 历史脉络与范式参照 |
| 29 | Airbnb Minerva | 2021 公开 | Airbnb | 指标平台统一指标层概念确立 | 指标平台元年参照 |
| 30 | Gartner ABI 指标层能力 | Gartner ABI 2023/2025（经美团文转引） | Gartner | Metrics Store 12 能力之一；2025 Metrics Layer 第一位 | 指标层=标配能力位 |
| 31 | IBCS SUCCESS | ibcs.com, CC 许可 | HICHERT+FAISST/IBCS Association | 七规则组（Say/Unify/Condense/Check/Express/Simplify/Structure） | 经营报表直接套用 |
| 32 | ISO 24896:2026 | ISO 24896:2026 | ISO | 商务报告记号国际标准（首个） | 对外交付/审计引用依据 |
| 33 | Tufte 可视化原则 | 《The Visual Display of Quantitative Information》1983 | Edward Tufte | 数据墨水比；lie factor | 删非数据墨水；图形比例忠实 |
| 34 | Few 仪表盘规范 | Perceptual Edge 白皮书/《Information Dashboard Design》 | Stephen Few | 一屏监控；前注意感知 | 监控大盘与分析报告分开设计 |
| 35 | AntV 图表用法 | antv 图表用法站 | 蚂蚁集团 | 九类功能图表分类与选型 | 选型表直接引用 |
| 36 | 飞书可视化设计指南 | 飞书开放平台 2025-02 版 | 字节跳动（飞书） | 色板体系；>14 类循环取色 | 色板规则直接引用 |
| 37 | 可视化反模式清单 | 综合 Tufte/Few/IBCS/Google | 综合 | 截轴/双轴/3D/彩虹色等 | 报表评审门 |
| 38 | DCMM | GB/T 36073-2018 | 中国国家标准 | 数据管理能力成熟度模型（首个数据管理国标） | 治理域对接参考（详见治理域文档） |
| 39 | 数据质量评价指标 | GB/T 36344-2018 | 中国国家标准 | 数据质量评价指标体系 | 指标卡质量字段参考 |
| 40 | ISO 8000 数据质量 | ISO 8000 系列 | ISO/TC 184 | 国际数据质量与主数据标准族 | 跨境/对外交付场景参考 |

---

## 附：主要一手来源清单（按章节）

- §1：CRISP-DM 白皮书 PDF（uhcl.edu 镜像）；Azure/Microsoft-TDSP GitHub README 与 lifecycle-detail（2026-09-04 抓取全文）
- §2：tech.meituan.com 2026-03 美团 BI 指标平台（一手全文）；cnblogs/bytedata 2023 DataLeap 案例（官方号全文）；cnblogs/didijishu 2020 滴滴指标体系（全文）；alibabacloud DataWorks 指标/派生指标产品文档（全文）
- §3：exp-platform.com 与 rules-of-thumb（一手全文）；tech.meituan.com 2025 白皮书系列 01/08（一手全文）；tech.meituan.com 2020 配送 A/B（一手全文）；36氪/知乎 DataFun DataTester 规模数据（转引，已标注）；tech.meituan.com 2024 KDD 解读（CUPED 落地）
- §4：docs.getdbt.com FAQ 与 semantic-models（一手全文）；getdbt.com 开源 MetricFlow 公告（一手全文）；Snowflake OSI 新闻稿（一手）；docs.cube.dev 介绍（一手全文）
- §5：ibcs.com 与 IBCS 标准、ISO 24896 发布页（一手）；perceptualedge.com Few 白皮书 PDF（一手）；antv-2018 图表用法（一手全文）；飞书开放平台设计指南（官方页）
- §7：openstd.samr.gov.cn GB/T 36344-2018 页；国标 GB/T 36073-2018 公开解读多篇

**已知边界声明**：①知乎/36氪等平台有反爬限制，其数据以搜索引擎摘要 + URL 锚点形式核验，未抓取全文，规模数字均为字节官方口径的转引；②Gartner 2025 Metrics Layer 排位为经美团官方文转引，未直接购买 Gartner 报告原件；③Libra 平台内部设计细节（分流算法实现）无公开论文，本报告仅引用其公开输出与行业通行的 Google 分层实验蓝本。
