# A_壹号讲狮 精读摘要 block4（156-210，55 篇）

> 语料范围：156-210（公众号"壹号讲狮"）。产品技术解析类精读，财报/股价/政治/八卦类一句归档。
> 用途：为 SwarmStudio（hermes-studio 二开企业 Agent 平台：FIBO 本体工作台 T-Box 完整/无 Action 层、多 Agent 推演、评测域、可观测、审批治理）提取可借鉴点。

## 一、逐篇精读笔记

### 产品机制文（精读）

**156｜Palantir 最近一年的五大战略主线**：2025 五主线=Enterprise AI OS（AIP 商业营收 +100%）、AI Infra OS（Chain Reaction 进军数据中心/能源调度）、Decision AI OS（国防升级为 AI 战斗决策系统，美军 10 年百亿合同）、Agentic AI（Auto-Agent 直接执行：调库存/调电力/排产）、价值观争议管理（ICE/Immigration OS）。定位从"数据平台+分析工具"转向"AI 操作系统+自主智能执行"。

**157｜Chain Reaction**：与 Nvidia、CenterPoint Energy 合作，定义为"面向美国 AI 基础设施的操作系统"。机制：将能源节点、算力单元、AI 模型与任务流抽象为动态知识图谱（延续本体论驱动），实时感知数据中心负载/电网波动/训练进度，多智能体协同自动调整能源分配、冷却策略与任务优先级；零信任+联邦学习+不可篡改审计日志；训练任务按电力紧张窗口跨区迁移。本质=把本体+Agent 方法论从企业决策复制到"数据-算力-能源"三位一体基础设施调度。

**158｜组件-变量-本体铁三角**：Workshop 的核心数据流模型，即 MVVM 的映射。Ontology=Model（持久真相源，除非触发 Action 提交否则不变）；Variable=ViewModel（运行时临时状态，两类：Object Set Variable 对象集变量、原始值变量 String/Number/Boolean）；Component=View（输入/控制类组件 A、展示/输出类组件 B）。流向：本体→变量（数据加载初始化，变量=本体的切片/引用）；组件 A→写变量（筛选/AIP 输入）；变量→组件 B（响应式渲染）。组件间不直接对话，靠共享变量同步。AIP 场景：AIP Logic 读问题变量→查本体→输出到新对象集变量→组件 B 展示。这是 Palantir 应用层"无 glue code 联动"的机制内核。

**159｜Enterprise AI 三层架构**：底层数据/中间逻辑/上层交互，五个视角表述：传统架构（数据/模型/应用）、业务流程（Dataflow/AI flow/Workflow）、企业赋能（记忆/思考/行动）、决策智能（决策对象感知是什么/决策逻辑认知为什么/决策执行决策怎么办并办了）、Palantir 产品（Datasets+Connector+PipelineBuilder+Ontology+ObjectExplore / AIP Logic function+model / Agent Studio+Agent+Workshop+Widget+Variable+Action）。AI Data 五要点（训练数据/推理数据/AI 编排 pipeline/多模态 Connector/语义本体层）、AI Logic 四要点（Model/Rules/Tool/Logic flow）、AI Agents 两要点（多智能体协作/UI 组件混合）。

**160｜Query Objects 工具详解**：AIP Logic 给 LLM 配置本体查询工具的机制。三种查询本体方式：语义搜索块+LLM、Ontology 上预定义 Query 后由 LLM 调用（Query Functions，如 GetHighRiskVendors(region,min_spend) 参数化查询）、LLM 直接生成过滤条件。核心配置=数据暴露控制：①ObjectType 白名单（不勾选=LLM 永远查不到）；②Property 可见性（Specific Properties 推荐，大字段一律不勾防 token 爆表）；③查询范围 Global/Scoped（限定在前序对象集内二次筛选）；④Tool Description 元数据（字段描述帮助 LLM 理解语境，字段名要自然语言友好）；⑤Limit 返回数限制；⑥空结果指示（不编造）；⑦运行时继承用户 ACL（无权限=返回空）。本质：不告诉 LLM 怎么查，只定义"能查哪些表、能看哪些列"。

**161｜AIP 开发 Agent 应用精髓**：三步=Agent Studio 构建（模型/System Prompt/温度/Tools）→ Workshop 嵌入 Agent 组件（变量映射输入输出）→ 发布。Agent 七要素：上下文（文档向量库/本体/函数返回对象集）、工具（Apply Action+Call Function+Query Objects+Ontology Semantic Search）、模型（多模型任选）、记忆（Application State：String/Object Set）、指令（System 级+Task 级+/引用工具或变量）、行为（对话流中直接弹出 Action 输入画面执行增删改，或允许 Agent 自动执行选中 Action）、变量（Workshop 中配置）。

**162｜LLM 和 Tool 两利器**：Call function 工具=LLM 自主调用 Foundry 预定义 TypeScript/Logic 函数；关键在函数语义化定义（DisplayName+Description 决定 LLM 是否调用、参数提取是否正确），参数尽量简单类型（String/Number/Boolean/Date），错误返回清晰字符串而非抛异常（让 LLM 优雅回复）。Apply action 工具=LLM 自主修改本体（创建/更新/删除对象）；Ontology Manager 中 Action 及参数的 Description 是 LLM 填参依据；Plan 模式输出建议调用、Execute 模式闭环执行；安全约束=不给破坏性 Action、运行在用户权限上下文、缺参数时反问而非瞎猜。

**163｜关键词：泛化**：AIP 一套软件复用百行千业的机制拆解：数据层泛化为本体（项目只是对象的一种视角）；AI 能力泛化为可编排组件（Logic/Flow/Tools 模块化 Block）；交付从项目制泛化为持续运营；用例泛化为少数决策模式——侦测 Detect（异常识别）/诊断 Diagnose（根因追踪）/决策 Decide（约束+动作的影响评估）/执行 Act（写回与自动化），二三十个模式复用到上百用例；个体经验泛化为组织能力（专家思路结构化为 Prompt+Block+Policy，决策全程沉淀本体成可回放组织记忆）；技术选型泛化为长期演化（模型可替换、AI 当基础设施：限权/合规/数据流向/决策日志统一记录）。

**164｜AIP 最核心 10 个概念**：Datasets（原料仓库）→Ontology（数字孪生建模语言，对象+关系）→Function（可复用逻辑原子，版本控制/审批/审计）→Model（模型不可知论）→Logic（图形化模块化流程引擎，块间变量连接）→Variable（贯穿 Logic/Function/Widget 的状态载体、动态记忆）→Widget（交互元素，AIP Assist 聊天组件，双向：操作 Widget 调 Variable 实时影响 AI 分析）→Action（与 ChatGPT 的本质区别：写回操作+权限控制+审批流+数据验证）→Agent（目标+工具的自主单元）→Decision（终点，衡量成功的唯一标准）。

**165｜关键词：Enterprise AI**：核心论点：企业痛点不是模型而是数据割裂/流程复杂/合规刚性。Ontology 统一语义层（结构化属性/时序属性/文档附件/地理位置四类属性挂在对象上）；权限粒度到对象级/字段级/操作级，AI 继承调用者权限视图（AI 看到的≤人能看到的）；人-AI-流程三角（人定目标做最终决策，AI 理解预测生成方案，流程系统执行记账留痕）；LLM 只是组件之一（大模型+传统预测模型+优化算法+规则引擎混合编排）；Agent=虚拟岗位（数据上下文+工具能力+业务场景+协作方式四要素）；四层架构（数据与本体层/智能与模型层/流程与协同层/体验与控制层）形成"数据变化→AI 发现→生成方案→人审核/自动执行→写回→数据再变化"闭环；落地路径五步（选高价值场景→先本体和工具再 Agent 和 Workflow→人机协同产品化→决策沉淀为组织记忆→新场景引用旧案例）。

**166｜关键词：面向对象编程**：AIP=企业级 OOP 映射表：Ontology=Class，Object=对象实例，AIP Logic=Function（对象的方法，如 machine.detect_anomaly()），Dataflow=属性同步，AI flow=方法执行，Workflow=对象间消息传递，安全权限=封装 Encapsulation，多工厂差异化配置=多态，模板化本体=继承，系统级治理=Runtime。AIP 终极使命：将企业一切实体/流程/事件/决策/系统抽象为可操作对象，让 AI 像程序操作对象一样操作企业。

**167｜几分钟搭建文档智能搜索应用**：一个本体（带向量字段+pdf 链接字段）+三个组件（文本输入框绑定 String 变量；对象列表用该变量对向量字段做 k-NN 召回并设选中对象变量；PDF 浏览组件绑定选中对象）。底层=文档结构化分块+embedding 灌入本体；中层=对象集变量+语义搜索绑定；顶层=组件编排。全程无代码、无 SQL。

**168｜数据编排 120 种算子**：Pipeline Builder 后端=Apache Spark（算子编译为 Spark Catalyst 逻辑计划，性能等同手写 Spark）。两类形态：表级变换 Transform 节点（约 50+：Join/Union/GroupBy/Pivot/Unpivot/Explode/Window/Filter/Sort/DropDuplicates/Cast/SmartCast/FillNulls/地理 Geohash/H3/Distance/PointInPolygon/CDC/输出分区）+列表达式（200-300+ 函数：字符串/正则/日期时间/数学/逻辑 CASE-WHEN/数组/Struct/JSON/聚合/哈希/地理）。AI 算子是质变：Use LLM 万能算子（预置情感分析/分类/翻译/摘要/实体提取/自定义 Prompt 模式，批量按行调 LLM 输出到新列）、Text-to-Embeddings 向量化算子、AIP Assist 辅助生成 Regex/表达式、OCR/版面分析。90% 场景只用 7 个 Transform（AddColumn/Filter/Join/GroupBy/Window/Union/Pivot）。

**169｜Palantir 与 Oracle 两条演进路线**：Oracle=云化/标准化/平台化（自治数据库+OCI），Palantir=场景化/本体化/决策化（本体论引擎，6000 张异构表映射成"弹药-运输-道路-天气"本体后 AI 分钟级出调度方案）。三股浪潮：多云联邦、本体即代码、行动闭环（BI vs Decision Intelligence 分水岭：Oracle 让决策者看得更快，Palantir 让他们直接动手）。Palantir 试点 Outcome-Based Pricing（节省 1000 万抽 10-15%）。"以政带商"军民产飞轮。

**170｜从 Datasets 到 Object**：Dataset="计算机如何存储数据"，Object="人类如何理解业务"。Ontology/Object=语义层表征业务，Datasets=原始数据层存储变换；两者解耦支撑统一数字孪生（原始数据存储处理大量异构数据，本体对象库提供实时分析/AI 决策/业务编排敏捷性）。三步流程：Pipeline Builder 数据源→Datasets（清洗/关联/合并，批+流）→Ontology Manager 建模（选数据源/增删字段/对象被索引）→Workshop BI 分析；再通过 Actions 实现本体交互编辑（如 setClosed/创建 Order），Action 可定义 API 绑定供 Foundry 外部应用交互。AIP 共 35 个模块，核心是 Pipeline Builder+Ontology Manager 两个。

**172｜从 AIP1.0 到 AIP3.0**：作者分期：AIP1.0=Analysis Integration Platform（=Foundry，数据处理分析平台）；AIP2.0=Foundry+AI（当前阶段）；AIP3.0=Agent Integration Platform（多智能体编排架构，无代码+智能体集成两特征）。作者判断当前 Palantir 架构仍是 Foundry 架构加 AI、落后于智能体时代（作者个人观点，2024-09 旧文）。

**173/174｜Databricks 两篇**：173=K 轮融资 10 亿美元估值超千亿（年化收入 40 亿+50% 增速、AI 产品收入破 10 亿、NRR>140%），新品 Agent Bricks（智能体生产线）+Lakebase（基于开源 Postgres、为 AI 智能体优化的 OLTP 运营数据库，"为智能体重塑数据库"）。174=Databricks 踩中数据基础设施+AI 智能体两风口，从 Spark→Lakehouse→Agent 平台；15000+ 客户、60%+ 财富 500 强；延迟 IPO 策略。

**175｜三个 Flow：Dataflow × AI flow × Workflow**：AIP 产品架构公式。三 Flow 绕 Ontology 转：Dataflow=Pipeline Builder 模块（接入→编排→特征构造→本体写入→向量/地理/文档高级类型构建，产出语义化数字孪生）；AI flow=AIP Logic 模块（七类逻辑块：输入/语义搜索 Rerank/数据转换/Use LLM/评估安全 Guardrails/输出结构化/变量，LLM 是被本体上下文严格约束的智能算子单元）；Workflow=Workshop/workflow 模块（触发入口/参数收集/调用 Flow/结果展示/人机协同审批/落地执行写回）。三者层层相依：没有 Dataflow 则 AI flow 空谈，没有 AI flow 则数据难释放潜力，没有 Workflow 则落不了地。实施顺序：先 Dataflow 建本体，再 AI flow 做 1-2 个决策流水线，最后 Workflow 做精致业务应用。

**176｜AIP 如何使用 AI**：AIP=Data+Ontology+LLM 编排+应用界面+安全治理。数据层：本体作为 AI 的世界模型与"禁锢"框架（用户指令先经本体层结构化再喂 LLM；对象属性含数值/标签/时序/向量/地理/状态）；LLM 用法三态=语义对齐映射对象过滤条件、结构化查询生成（Object Set/SQL/GraphQL）、语义检索+向量搜索；OAG（Ontology-Augmented Generation）区别于传统 RAG：检索文档+实时结构化数据（SAP 库存数），答案有实时数据支撑。逻辑层：AIP Logic 无代码编排+模型不可知多模型路由。应用层：Copilot（意图识别→映射本体→生成查询→检索→综合输出多模态）、任务型 Agent（预设监控数据/触发条件/可用工具）、AI 建议进入 Action Proposal（变更前后值+影响分析+解释）→人审批→写回 ERP/MES。副作用管理：AI 不直接执行 API 请求而是转为标准行动提案。反馈回路：记录人类采纳率/修正，回流微调模型或优化 Prompt。Control Plane：权限继承过滤（构建 Prompt 上下文时自动剔除无权数据）、输入防火墙（Prompt Injection 检测）、输出净化（PII 扫描）、全链路审计（Prompt/Context/模型版本/Token 全记录）。

**177｜本体中的文档数据**：文档在 Ontology 中是有双重属性的实体：元数据层（上传者/时间/类型/版本）+内容层（可被结构化/向量化/语义化/搜索/引用）。存储：原始文件存 mediasets（非事务性大文件存储），文档对象存引用 Reference 保证本体查询高性能。Pipeline 四步：摄取与 OCR（三种选择视情况）→清洗与分块 Chunks（一个文档对象可链接多个段落对象，细粒度管理）→向量化（"向量字段用作召回，结构化字段用作上下文，两者在本体上统一"）→LLM 结构化提取（合同→甲方/乙方/金额/终止条款/生效日期变成本体结构化属性；提取出设备 ID XC-900 时自动建立维修报告与设备对象的动态链接=自动编织知识网络）。三种使用方式：语义搜索（跨措辞召回）、对话式分析（检索+LLM 生成带引用总结）、混合查询（结构化条件+非结构化条件+关联条件同查：过去 7 天生产的+质检报告含"表面划痕严重"的+供应商 A 提供的零部件——单一数据库或纯文档库都做不到）。

**178｜本体中的地理位置数据**：地理属性类型：Point（经纬度）/Line（轨迹、管线）/Polygon（覆盖区、禁飞区）/带时间戳空间对象。Pipeline Builder 六种 Geo 类型：GeoPoint/Geometry（GeoJSON）/H3Index/LatLonBoundingBox/Ontology GeoPoint/MGRS（军事格网）；支持 CRS 坐标系转换、WKT 解析、GeoJSON/Shapefile 抽取、Normalize。建模：坐标系统一 WGS84、业务约束（location 必填、仓库位置必须在国内边界内）；地理+时间+状态组合成可分析业务实体；空间关系显式化为派生属性（订单 destination 落在仓库 coverageArea 内→assignedWarehouse）。分析能力：范围查询 Within/Intersects、缓冲区/距离 Buffer/Distance、空间 Join（车位置 join 路网、事故点 join 行政区）、时空结合分析（轨迹是否进过禁区、停留时长）。地图组件与 Ontology 深度绑定：ObjectSet 驱动渲染（属性决定颜色/大小/透明度，配置式非硬编码）、地图与列表/图表双向联动、地图上选对象→Apply Action→写回本体→地图更新闭环。LLM 不直接操作坐标，调用封装好的 Geo 能力（自然语言→区域 Buffer+对象集过滤+ETA 计算）。

**179｜本体中的向量数据**：向量=对象属性的一种类型（Document.embedding:Vector<float,1536>），与 string/int/dateTime 一样可配置类型/长度/更新方式，可在 Logic/Pipeline/Workshop 直接引用。向量不直接连边，但影响关系设计：按相似度建 Document-Topic 归属、相似工单关系、推荐候选关系——"关系是事实，计算关系的依据是向量相似度"。生成两条路径：批处理 Pipeline（每日新增文档 embedding）/在线 Logic（新工单实时向量化→检索→关联→写回）。向量属性可索引（cosine/dotproduct/L2，HNSW/IVF）；向量检索是 Ontology 查询一部分，与结构化过滤组合（同地区同产品线找最相似 5 个工单）。用法：RAG（向量是知识节点的语义索引）、相似案例驱动决策（新告警→相似历史事件→Playbook 复用）、对象粒度 Co-pilot（当前客户→相似客户→对比→LLM 总结建议），"向量承担跳到相似对象集合的关键一跳"。

**180｜本体中的时序数据**：核心理念：业务对象是第一公民，时序不是离散大表而是附着在对象上的时间线（决策逻辑直接用"对象+时间"说话：machine.temperature_timeseries.slice(last_7_days)）。三种建模方式：①时序属性 Time Series Property（最推荐，背后映射时序库/分区大表但业务只见对象属性）；②时序对象类型（PriceSeries/DemandSeries/KPISeries，适合多逻辑线：实际 vs 预测 vs baseline、版本/算法配置管理）；③Relationship 连接细粒度记录（原始读数建 SensorReading 对象+关系，上层预聚合成时序属性）。设计理念：统一抽象底层异构、与对象强绑定非表驱动、多视角多尺度（原始 1min/平滑 5min/日均）、为 LLM 优化（LLM 不擅处理原始点，pipeline 预做特征工程：移动平均/趋势/异常分数挂载为特征序列）。事件检测：阈值持续 10 分钟=过热事件→建 OverheatEvent 对象（start/end/severity/occurs_on 关系）→时间轴叠加标记→LLM 引用"过去 24 小时 3 次过热事件"。进决策链：感知层（状态/趋势/异常）→为 LLM 提供结构化历史背景（统计值+重大事件转简洁 JSON context）→触发自动化 Action。实践要点：先业务对象再时序属性、区分原始序列与派生序列、明确时间粒度约定、从决策场景倒推特征与事件、Workshop 快速验证。

**181｜一张图说清 AIP**：决策闭环五环节：Datasets（Pipeline Builder 数据准备）→决策对象（Ontology 语义建模，数字孪生）→决策逻辑（AIP Logic，AI+规则推理）→决策执行（Action 经 API 写回 ERP/CRM/MES）→决策界面（Workshop+Agent 人机交互），执行结果作为新数据反馈回流。三大优势：AI 贯穿始终、Ontology 中心化（连接数据/逻辑/执行/界面的桥梁）、决策闭环自学习。

**182｜存储架构技术分析**：Palantir 不是单一数据库而是"多引擎+对象层+本体层"融合存储架构。四层：①底层引擎（关系/列存、对象存储、搜索/向量、时序/流 Kafka-Flink、文档）；②Foundry 数据层（Dataset+Transformation+Versioning+Lineage+Governance）；③Ontology 本体层（ObjectTypes/ObjectSets/Relationships/Metrics）；④AIP 应用决策层（Logic/Workshop/Actions）。六类数据的存-连方式：结构化（表→Dataset 带血缘版本→对象类型）、文件文档（对象存储 Blob→media Dataset→作为附件字段或抽取成条款对象）、文本+向量（向量索引 HNSW/IVF+列存→embedding 列→语义检索工具暴露为 related_documents）、时序流（Kafka+TSDB/时间分区 Parquet→对象时序属性或派生对象）、地理（PostGIS/GeoJSON/WKT+空间索引→location/geometry 字段+地图组件）、键值元数据（KV 引擎→Configuration Dataset→决策参数/运行时控制表）。对标 Snowflake：核心抽象 Table vs Ontology（分析 OLAP vs 操作 Operational）；微分区封闭 vs 多模态开放胶水（Parquet+AtlasDB KV+Elasticsearch，可挂载现有数据湖但复杂度高）；单向分析死胡同 vs 读写闭环（AtlasDB+Action Service 前端改对象属性即写回 SAP）。自建对标建议：多引擎各司其职+数据目录血缘（datahub/amundsen）+显式对象类型与对象级 API/权限+LLM/规则/Action 编排层。

**183｜决策四件套**：①决策对象=Ontology（decision-centric model，供应链：订单/仓库/路线/库存/SLA；制造：批次/设备/工艺参数/质量事件；医疗：患者/检查/诊疗路径；军方：目标/资产/威胁/行动方案/约束规则）；②决策逻辑=AIP Logic（Use LLM 块做理解综合建议，Transform/Function/Conditionals/Loops 确定性块做规则判断+调预测模型+批量分支；Order-to-Cash 信用拦截决策=过程挖掘定位阻塞环节+Logic 做 AI 决策 Copilot+人点接受/修改/拒绝）；③决策执行=Action（创建/更新对象、调外部 API 发 SAP/WMS、触发自动化工作流；operational decision-making："看见问题→做出决策→系统执行→再反馈数据"闭环产品常态）；④决策界面=Workshop+Copilot（列表/地图/流程图/甘特图/工单一屏聚合上下文，Copilot 嵌侧边给排序理由与批量操作建议，一键执行按钮背后连 Action，接受即改单+通知+审计日志）。

**184｜七种核心逻辑块**：①Use LLM（prompt+tools：Query objects/Apply actions/Call function/Calculator；LLM 不直接访问本体而是请求工具由后端按权限执行；输出 schema 约束；幻觉用工具查询+后置校验压制）；②Apply action（确定性调用 Action 编辑本体，不通过 LLM；关键机制：只有 Logic 函数从 Action 被调用执行时本体写入才生效，Debugger 中是"拟议编辑"）；③Execute function（调 TS/Python/Logic 函数，复用代码与性能敏感逻辑）；④Transform（纯确定性转换不用 LLM：表达式计算/枚举映射/字符串拼接；"能用 Transform 不用 LLM：更便宜更快更可预期便于审计"）；⑤Conditionals（if/else 多分支；所有分支返回类型必须一致，需 else 兜底）；⑥Loops（对 List 逐项执行，无写操作自动并行，含 action 注意幂等与并发）；⑦Create variable（中间变量：string/integer/boolean/object/list 等）。每块配置=入口+关键字段（输入绑定/prompt/tools/输出 schema/参数映射/条件表达式/集合与元素变量）+坑位提示。

**185｜从 0 到 1 搭供应链控制塔**：六步方法论：①Ontology 建供应链业务模型（Product/Location/InventoryPosition/PO/SO/Shipment/DemandForecast/SupplyPlan/Disruption/MitigationAction 十实体+关系；按角色定权限与可改范围）；②数据管道（ERP/OMS/WMS/TMS/APS+外部天气港口数据做主数据统一/库存订单视图/预测执行对比；非结构化用 AIP Document Intelligence：选样本媒体集→定义抽取字段→试策略→一键生成 Transform 全量跑→写入 Disruption 实体）；③AIP Logic 函数库（detectSupplyRisk 异常检测/simulateDisruptionImpact 影响模拟/generateMitigationOptions 方案生成（LLM 生成结构+优化引擎细算）/applyMitigationPlan 分解执行写回）；④Agent 配置（Tools=上述函数+查询函数，按角色限工具：Planner 分析+执行需审批/运营经理可执行低成本方案/管理层看摘要拍板；Prompt 写明优先级规则/约束/输出格式、禁止不调用模拟工具就拍方案）；⑤Workshop 控制塔（顶部 KPI+过滤器/左中风险列表+地图/右侧 Copilot 面板+方案卡片对比（成本 vs 服务水平 vs 风险）+模拟执行与确认执行按钮+高风险触发审批流）；⑥评估与治理（Evaluation Suites：历史场景样本回放打分——断供/封港/需求暴涨场景输入+期望行为，改策略/换模型/调 Logic 都要回放，整体不差才上线；行为审计学习闭环：建议采纳率/被改写模式回流 Prompt 与 Logic，负面 case 新增测试）。

**186｜AIP 产品蓝图**：Foundry=数据&本体平台（数据接入/编排/本体建模/应用搭建/权限治理），AIP=其上浇 LLM/Agent/评估/AI 加速层。两类叠加：新增模块（AIP Logic/Agent Studio/Document Intelligence/Evaluation Suites）+原模块加 AI（Transform 用 LLM 生成表达式、Workshop 加 AI Widget、Code Workspace 加 AI coding）。分模块：Ontology 是中台与安全边界（LLM 语义映射、受控写回必须走 Logic、权限传导到 LLM——"Ontology 是 AI 的眼睛看到什么、手能改什么的硬边界"）；Workshop 是人机协同前台（Chat/Logic CoT/Action Panel/Explanation 四类 AI Widget+Context Binding+Human-in-loop 四步交互）；Transform&Pipeline 是数据加工加速器（Document Intelligence 试策略后一键生成 Transform 进正式管道、AIP 加速 Pipeline Builder 用 LLM 生成字段映射/正则/公式但执行仍是 Spark、LLM 做清洗标注）；Code Workspace 是开发者助手；Compute Module/外部系统是工具箱（挂成 Agent 工具、封装成 Action）；安全审计评估是行为守则（Evaluation Suites 测试用例自动打分做回归与版本对比、LLM 调用可观测性记录输入输出 token 延迟错误、权限粒度下沉到 AI 行为）。

**187｜AI 大模型深度整合到产品**：架构六层：Provider/Runtime（多模型提供商+embedding 接口）/Agent Studio/Logic（可测试可调试可版本化）/Ontology（OAG 锚定）/Tool 与 Actions/Workshop UI。技术五点：OAG（语义搜索取上下文+prompt 送 LLM，作为首选模式）、分层 Prompt+Logic 块（任务分解降幻觉）、工具调用（安全交互业务系统）、Memory/State（会话记忆映射回 Workshop 变量或本体）、多模型选择策略（小模型路由/强模型关键输出/合规本地模型）。安全四点：审计 Trace Run history、最小权限、敏感信息管理（PII 脱敏禁入检索池）、模型可替换。实施四阶段：设计（目标→动作映射、先建本体）/实现（先 RAG/OAG 测检索质量再迭代 prompt、工具为 LLM 提供安全 API）/上线前（KPI 准确度/回合成功率/自动化率/误操作率+A/B）/运行中（监控延迟成本错误率，快模型路由+强模型关键输出）。

**188｜三个强大 AI 组件**：①AIP Generated Content Widget（内容生成展示，三模式：Logic 函数/Direct to LLM/prompt function；流式输出）；②AIP Interactive Widget（对话式 Agent 嵌入 Workshop：选 Agent 版本、Workshop 变量↔Agent 应用变量映射、自动发送消息触发、Tools 配置=语义搜索/Action/Workshop application/Function、上下文变量读写权限）；③Logic - Chain of Thought 组件（可视化追踪 Logic 函数执行链：先检索历史案例→语义搜索找文档→生成建议，用户点"查看推理"理解模型为何做出该建议；医疗筛查/客服/供应链异常检测三场景）。

**189｜四家公司看数据智能未来**：Palantir（"数据驱动决策平台/世界领先 AI 数据操作系统/将数据转化为决策"——定位直达决策终点）、Databricks（"data and AI company"，湖仓+AI 原生数据平台，瞄数据科学家）、Snowflake（AI 数据云，瞄分析师）、Alteryx（自助分析）。结论：起点都是数据，只有 Palantir 打通数据→AI→决策三层到达终点。

**190｜演示：本体向量字段搭 AI 应用**：Pipeline 中 text-to-embedding 算子把故障描述转为向量字段存 datasets 输出到本体（可用表达式拼接多字段+自加文本再向量化；也可自定义本体属性时直接指定向量类型+向量模型配置）；Workshop 中 chat 组件+logic 组件做智能问答。

**191｜如何理解决策 Decision**：决策=闭环+技术变换+价值变换。四要素：Goal（目标与成功指标，Palantir 案例 PR 都围绕目标与可精确衡量的成功指标）、Data（感知锚点：贴源数据+语义本体，要全要准要快）、Logic（认知：可解释的推理引擎，封装形式不重要——Model/Function/Rule/Dashboard 均可）、Action（行动：必须改变系统状态才算闭环，否则只是建议而非决策）。决策是持续迭代学习系统：行动产生新数据反哺逻辑。

**192｜如何理解数据 Data**：三层：①四特征（复杂/分散/动态/海量）；②三处理（结构化——催生 Oracle；语义化——催生 Palantir；向量化——大模型数学基础；三者齐备才是 AI Ready 数据；Palantir 本体=携带结构化+语义化+向量化+Logic+Relation+Action+Function+variables 的高级数据结构）；③两利用（AI For Data：chatBI/deepresearch/data explore/Agent 发挥数据价值支撑决策；Data For AI：采集/融合/变换/标注/语义化/向量化/合成生成高质量 AI Ready 数据喂养 AI；两者相辅相成成飞轮）。

**193｜Oracle vs Palantir 两次思想商品化**：Oracle 把库表（关系代数）商品化为 DBMS，Palantir 把本体（哲学+知识工程概念）商品化为 AIP。Palantir 的 Ontology 不是哲学/语义网的形式逻辑本体，而是工程化可视化数据语义层工具=知识图谱+数据建模+AI 编排层。"Oracle 让企业能查到数据，Palantir 让企业能问出意义"；库表告诉计算机有哪些数据，本体告诉计算机这些数据意味着什么。

**194｜演示：PipelineBuilder PDF 结构化**：两个核心算子完成 JSON→表：分解 JSON 数组算子（变多行）+分解 JSON 对象算子（变多列）；PDF 结构化只需前置"PDF 文本提取"算子（提取指定页输出 json 串），再走 JSON 结构化流程，穿插类型转换/过滤/去空格。

**195｜演示：动态嵌入知识语料库**：Travel Tips Chunk 本体（主键+文本+向量三字段）；Workshop 三组件：text input（输出存 user query 变量作过滤条件）、button（事件绑定 Action，点击将输入变量添加数据同步显示）、object list（绑定输入变量，语义搜索语料+添加语料两功能）。文本分段逻辑+切片向量化。

**196｜Percepta AI（Palantir 山寨/衍生公司）**：前 Palantir 员工创立、General Catalyst 投资、AWS+Anthropic 战略合作。模式="操作手册驱动"（注：就是基于本体的那套）：研究人员/工程师/产品经理派驻企业内部，三大支柱同步推进（智能与基础模型层/底层数据基础设施/员工 AI 工具协同），Mosaic 平台统筹，医疗/金融/制造/政府"AI 原生运营"转型，形成行业专属可复用转型框架的飞轮。

**198｜21 个产品功能演示例子**：按能力域分组的官方视频清单（带质量评级）：数据接入（Data Connection）、数据编排（JSON 解析/PDF 提表/图片提表/PDF 实体提取/首个 Pipeline/视频数据流 STREAMIE/参考项目）、本体（创建首个 Ontology/Ontology Manager/本体函数——作者评本体函数自创语言不如开放 Python 标准）、对象探索（Object Explorer）、Workshop（图片语义搜索/端到端 Workflow/首个 AIP Workflow/Agent 应用/Charts 可视化/RAG-OAG Data Tools）、Foundry 整体 Demo。暴露的产品能力清单：接入→编排→本体→对象探索→应用搭建→Agent→分析可视化→RAG/OAG 全链路皆有标准入门演示。

**199｜AI 未来十年五个基本判断**：①GPU 是下一代计算机②大模型是下一代操作系统③本体库是下一代数据库（本体沉淀世界知识/封装业务逻辑/携带操作指令；本体≠知识图谱——知识图谱是节点加边，本体涵盖感知（连接器+编排灌 datasets/mediasets/stream）→认知（object type/link type）→决策（logic/function/model）→执行（Action）全链条全要素）④Agent 是下一代软件⑤自然语言是下一代编程语言。飞轮：自然语言降门槛→更多 Agent→大模型被频繁调用→新数据回流本体库→本体自动修正世界模型→自然语言更精准。

**201｜全球首个数据智能体基准 FDABench**：南洋理工+新加坡国立+华为 2025-09 开源，面向 Data Agent（同时查数据库/读 PDF/看视频/听音频后写报告答题的 AI 系统）：2007 项任务、50+ 领域、三种题型（单选算数值/多选给结论/开放报告）、异构数据源（关系库/PDF/视频/音频/网页）、Agent-Expert 协同框架（支持规划/工具调用/自我反思/多智能体协作工作流模式）、自动评分+成本核算（响应时间/准确率/Token 成本权衡）。

**205｜AIPCon8 特色客户演讲**：Karp 强调"硅谷 AGI 炒作把 LLM 搞砸了，用好大模型必须做好本体架构工程"。用例：Lear（汽车座椅准时制生产）、Novartis Data42（临床试验数据本体加速药物研发，数周→数小时）、HSS 特种外科医院（保险申诉自动化 45 分钟→5 分钟）、Lumen（电信运营）、bp/MaineHealth/美国航空。主题：可运营 AI（LLM 从商品变竞争优势）、本体的力量（结构化数字孪生是安全部署 Agent 与模型的前提）、美国再工业化、价值实现时间压缩。

**206｜Workflow Builder**：可视化管理工作流与依赖的图工具，与 Pipeline Builder（数据源→本体）、Data Lineage（端到端数据流）构成三视图互补。五功能：①工作流探索可视化（图形展示本体/Action/函数/LLM/应用及关系，含 API 名称/输入/提交标准/代码片段）；②依赖与影响分析（追踪对象列的所有下游使用，查依赖该对象的 Action 与 Workshop 应用）；③权限与状态管理（颜色图例显示权限/视图活跃度/文件夹）；④批量操作与升级（批量升级旧函数版本，向 Ontology Manager 创建提案经评审批准合并）；⑤与 Workshop 联动（图面板选节点↔Workshop 面板高亮组件双向定位；"一个展示底层逻辑，一个展示用户交互界面"）。节点类型：Functions/Actions/objects/ObjectType/LanguageModel（Use LLM）/AIP Logic Function（无代码调用+Ontology 输入输出+元数据调试）/Workshop application（宏观管理人机界面与后端逻辑关系）/Automations/Text 节点。

**207｜为英国军方部署 AI 仿真工具**：与 Hadean 合作，其 populAI（兵棋推演，模拟人类行为与动态场景、AI 生成训练情境与虚拟 agent）+dominAI（指挥控制，多源数据态势感知）通过 Foundry 与英国防部现有数据基础设施集成，数月内部署到涉密环境。

**208｜Palantir 产品 12 处用到 LLM**：①AIP Logic Use LLM 块（输入/模块/输出三区+调试器看 CoT+运行面板建单元测试）；②Pipeline Builder Use LLM 节点（预置模板，先在几行数据上试 prompt 再全量）+Text-to-embeddings 表达式（ada-002）；③AIP Automate（本体编辑自动应用或提交人工审核，对象创建/变更触发）；④Model Catalog（模型发现/比较/沙箱/Marketplace 模板）；⑤Agent Studio；⑥Workshop widgets（Interactive/Generated Content）；⑦Workshop translations（l10n/i18n）；⑧Quiver AIP（自然语言数据分析、AIP 生成与配置卡片）；⑨AIP Threads（文档+Agent 临时分析）；⑩Transforms using LLMs（palantir_models 库）；⑪Functions using LLMs；⑫Jupyter+LLM。

**209｜Quiver vs Contour**：Contour=自助式数据探索与即席分析（拖拽低代码、快速报表仪表盘、业务分析师）；Quiver=深度多维分析与复杂转换（高级配置、时序/数组/自定义转换、事件序列图/高级地图图层、深度集成可写回 Ontology、分析存模板嵌入应用或由对象触发、数据科学家）。常见组合：Quiver 建模准备→Ontology 发布→Contour 组装业务仪表盘。

**210｜香橼看多 Databricks**（兼评两路线）："Palantir 是咨询式 AI，Databricks 是基础设施式 AI；前者卖人工服务，后者卖算力+软件杠杆；如果 AI 成为下一代操作系统，Databricks 是 Windows，Palantir 只是 SAP"。论据：数据原料规模（PB 级 Lakehouse vs 小数据项目制）、GenAI 收入四季度破亿、NRR>140% 连续六年、估值差（18x vs 25-30x）、数据引力（Unity Catalog 统一权限血缘语义后迁移成本指数级上升，5PB+ 客户迁出直接成本超 1200 万美元）。

### 时评/财报/政治类（一句归档）

**171**：2024Q3 股东信——收入 7.26 亿 +30%、净利 1.44 亿创纪录、TTM 自由现金流破 10 亿、美国政府 +40%/商业 +54%，Karp 宣示"软件世纪占领整个市场"。**197**：CTO Shyam Sankar 访谈——杀伤链=传感器到射手的决策序列、ICE 整合 20 个系统、审计日志双刃设计（赋权机构也赋权监督者）、"决策数量增速远超人员增速"、买方垄断（monopsony）病根、对 AGI 末日论高度怀疑（"硅谷世俗主义者用 AGI 填补上帝空位"）、电力类比（价值在用电侧不在发电侧）、Titan 项目（轮子上的卫星地面站，4 人机动完成 400 人指挥中心职能）；产品相关洞见：单一数据面板多玻璃面板（大家看同一事实）、人始终在回路。**200**：特朗普访英同步，Palantir 承诺 2030 年前投英 15 亿英镑+国防部 7.5 亿英镑新约（旧约十倍），国防/医疗/警务三线扩张。**202**：财报六年趋势逐年改善，日拱一卒。**203**：股价 2023 年来 +2280% vs 收入仅 +81%，110 倍市销率，历史对照 Zoom/Snowflake 判断泡沫。**204**：广告文，"中国版 Palantir 产品在路上"。**157 部分政治内容**忽略。

## 二、本块主题总览

**1. 产品技术栈全景**。存储：多引擎（关系/列存/对象存储/向量/时序流/KV）+Foundry Dataset 层（血缘/版本/权限）+Ontology 语义层（182）；编排：Pipeline Builder=可视化 Spark，120+ 算子（表级变换+列表达式）+Use LLM/Embedding/OCR 等 AI 算子（168）；模型：Model Catalog+模型不可知+多模型路由（强模型关键输出/小模型路由/本地模型合规）（187/208）；分析件：Contour（业务即席分析）与 Quiver（深度多维、可写回本体）分工（209）；工作流：Workflow Builder 依赖图管理+三 Flow 架构（175/206）；四类本体数据：时序（对象挂时间线+事件对象）、向量（属性级语义召回+相似案例跳转）、地理（Point/Line/Polygon+空间 Join+地图联动）、文档（mediasets 引用+分块向量化+LLM 结构化提取+动态链接）（177-180）。

**2. Dataset 与 Ontology 本质区别**。Dataset=计算机如何存储（原始层、无语义、单向、表驱动）；Ontology=人类如何理解业务（语义层、对象+关系、可读写闭环、决策导向）。解耦使统一数字孪生可行：底层存储异构大量，本体层敏捷供 AI/应用/Action 消费；AI 不对表说话而对业务对象说话（170/182）。

**3. 组件-变量-本体铁三角**。MVVM 映射：本体=Model（持久真相源）、变量=ViewModel（运行时状态枢纽：对象集变量+原始值变量）、组件=View（输入类+展示类）。组件不互连、靠共享变量同步；本体数据经变量初始化，组件写变量触发响应式渲染；AIP Logic 是变量间的加工传送带。这是 Workshop 无 glue code 的机制内核（158）。

**4. 三层架构与七种逻辑块**。三层=Dataflow（数据工程+本体工程）×AI flow（模型工程+RAG/OAG+安全治理）×Workflow（应用工程+流程再造+人机协同），层层相依、绕本体转（159/175）。七种逻辑块=Use LLM（prompt+tools）/Apply action（确定性写本体，仅 Action 上下文生效）/Execute function/Transform（确定性转换，能不用 LLM 就不用）/Conditionals（分支输出类型一致）/Loops（List 逐项，无写并行）/Create variable——AI 与确定性逻辑的标准化词表（184）。

**5. 决策四件套**。决策对象（Ontology：决什么）→决策逻辑（AIP Logic：怎么想）→决策执行（Action：真去干，写本体+调外部系统 API）→决策界面（Workshop+Copilot：人机共决）。决策四要素 Goal/Data/Logic/Action，Action 改变系统状态才闭环否则只是建议；AI 建议走 Action Proposal（前后值+影响分析+解释）→人审批→写回（183/191）。

**6. 21 个演示暴露的产品能力清单**。全链路皆有标准演示：数据接入→JSON/PDF/图片/实体提取等编排→本体创建与本体函数→对象探索→Workshop 应用（语义搜索/端到端 workflow/Agent 应用/图表）→RAG/OAG 工具→Foundry 整体（198）。配套能力：Query Objects 数据暴露控制（160）、Agent 七要素三步开发（161）、Evaluation Suites 回放评估（185/186）、Logic CoT 可视化（188）、Workflow Builder 依赖治理（206）。

**7. 平台级方法论**（贯穿多篇）：泛化（本体复用+决策模式库 Detect/Diagnose/Decide/Act+组织记忆沉淀）（163）；OAG 优于裸 RAG（检索文档+实时结构化数据）（176）；权限三继承（对象/字段/操作级，AI 视野≤人的视野）（165/176）；先本体和工具再 Agent 和 Workflow 的实施次序（165/175）。

## 三、对 SwarmStudio 的可借鉴清单

### P1（直接补能力差距，优先落地）

1. **本体属性类型系统扩展为"结构化+时序+向量+地理+文档"五类**（来自 177/178/179/180 四篇详解 + 165）：FIBO 工作台目前 T-Box 以类层次与结构化属性为主，Palantir 证明了本体字段类型是 AI Ready 的关键——时序挂对象成"时间线"、向量属性做对象级语义召回、地理属性支撑空间 Join 与地图联动、文档属性存引用+分块+embedding。落地：在 FIBO 本体 schema 中增加这四类属性类型定义与校验（WGS84 坐标、向量维度与索引方式、时序粒度约定、文档 mediaset 引用），最小可行版先做向量+文档两类（直接服务 RAG），时序/地理接推演需求排期。

2. **Query Objects 式"数据暴露控制"配置面板**（来自 160）：给 SwarmStudio 的 Agent/推演节点配本体查询工具时，强制配置 ObjectType 白名单+Property 可见性+Scoped 查询范围+返回 Limit+空结果不编造指令+字段描述元数据。落地：在多 Agent 推演的工具配置里实现这六项开关，属性描述直接复用 FIBO T-Box 的语义标注——这是 FIBO 本体元数据反哺 Agent 安全性的现成抓手。

3. **最小 Action 层闭环：Action Proposal + 审批 + 写回**（来自 170/176/183）：SwarmStudio 无 Action 层是与 Palantir 架构的最大单项差距；Palantir 模式=AI 生成行动提案（变更前后值+影响分析+自然语言解释）→人审阅→批准后经 Logic 写回本体与外部系统，且 Apply action 只在 Action 上下文中真正生效（调试态只是拟议编辑）。落地：不必一步做全量写回，先在推演域实现"Proposal 对象"（含参数、影响说明、状态机：生成→待审→批准/驳回→已执行），审批复用现有审批治理模块，写回先覆盖本体对象属性修改这一种，即补齐"决策执行"件。

4. **七种逻辑块作为推演编排的块词表**（来自 184）：Use LLM/Apply action/Execute function/Transform/Conditionals/Loops/Create variable 七块+三条纪律（能用 Transform 不用 LLM；分支输出类型一致；Loops 含写操作需幂等）。落地：把多 Agent 推演的编排节点对齐这七类语义（现有 Agent 节点≈Use LLM，补 Transform/Conditionals/Loops 确定性块），让推演流程中 AI 步骤与确定性步骤显式分离，可解释与评测都受益。

5. **21 个演示清单→产品功能差距对照表**（来自 198+167/190/194/195 演示文）：按"接入→编排（JSON/PDF/图片/实体提取）→本体→对象探索→Workshop 应用→Agent→分析→RAG/OAG"九个能力域逐项对照 SwarmStudio 现状，缺什么补什么。落地：直接产出一张九行对照表作为功能 roadmap 附件；其中"对象探索（Object Explorer）"和"几分钟搭一个文档语义搜索应用（本体+三组件）"两类入门演示最值得先仿——每个能力域有一个 15 分钟可复现的标准 demo 是产品成熟度的显性指标。

### P2（增强现有域，近期排期）

6. **组件-变量-本体铁三角（MVVM）用于应用/面板编排**（来自 158/164）：SwarmStudio 可观测与推演看板若引入"对象集变量+原始值变量"的状态层，组件间靠共享变量联动而非点对点传参，本体数据经变量初始化、写操作须经 Action 提交。落地：在面板 schema 中增加变量定义区（对象集变量绑定 FIBO 实例集），组件声明读写哪些变量。

7. **三层架构 Dataflow×AI flow×Workflow 作为平台信息架构**（来自 159/175）：与 SwarmStudio 五域（工作台/推演/评测/可观测/审批）正交的另一维度叙事——推演前必须 Dataflow 就绪（本体灌好）、推演中是 AI flow（Logic 块）、推演出口是 Workflow（人机协同+写回）。落地：用于产品文档与实施方法论（先本体和工具、再 AI 流水线、最后精致应用），也给新场景接入提供三问自检（数据够不够/逻辑清不清/流程顺不顺）。

8. **Evaluation Suites：历史场景回放打分 + 人类反馈回流**（来自 185/186/187）：SwarmStudio 评测域可直接对齐 Palantir 模式——历史推演场景样本（输入快照+期望行为）做回归测试，改 Prompt/换模型/调 Logic 都要回放且"整体不差才上线"；同时记录建议采纳率/人工修正，归纳成模式反写 Prompt。落地：评测域增加"场景回放套件"对象类型与版本对比报告，负面 case 自动转新测试用例。

9. **Agent 七要素配置模型**（来自 161/162）：上下文（本体/文档向量库/函数返回对象集）、工具（Query Objects+Function+Action+语义搜索）、模型（可任选）、记忆（String/Object Set 两态）、指令（System+Task+/引用）、行为（对话流内嵌 Action 表单）、变量。落地：作为多 Agent 推演中单个 Agent 的配置面板 checklist；工具描述元数据质量（函数注释、Action 参数描述）决定 LLM 调用准确率，建立"描述即接口"的规范。

10. **Logic CoT 可视化组件**（来自 184 Debugger/188 第三个组件/208）：推演过程中把 AI 步骤的中间推理链（检索了什么→调了什么工具→为何得出建议）作为可展开视图给审批人。落地：可观测域增加 CoT 时间线视图，与审批治理联动（审批人可查每步依据），对应 Palantir"每步可展开查看推理"的人机信任机制。

11. **文档数据管线：OCR→分块→向量化→LLM 结构化提取→动态链接**（来自 177/194）：文档作为本体一等公民——分块对象挂源文档，向量字段做召回、结构化字段做上下文；LLM 从文档提取实体时自动与既有本体对象建链（提取设备 ID→关联设备对象）。落地：FIBO 工作台增加"文档属性+文档结构化 pipeline"模板，金融场景天然对口（合同/研报/监管文件→FIBO 实体）。

12. **Workflow Builder 式依赖与影响分析图**（来自 206）：图形化展示推演流/应用所依赖的本体对象、函数、Action 及权限状态；追踪某对象属性变更的全部下游影响；批量升级旧版本函数时走提案-评审-合并。落地：可观测域增加"推演依赖图"视图（对象↔函数↔Agent↔面板节点），审批治理承接版本升级提案流。

### P3（叙事与长期，择机吸收）

13. **决策四件套产品叙事**（来自 181/183/191）：决策对象/决策逻辑/决策执行/决策界面四件套+Goal-Data-Logic-Action 四要素，是比"平台功能列表"更高级的产品叙事框架。落地：SwarmStudio 对外介绍按四件套组织（FIBO 工作台=决策对象、推演+评测=决策逻辑、审批+写回=决策执行、可观测=决策界面），并明示"缺 Action 层=只有建议没有决策"的补齐路径。

14. **用例模式库 Detect/Diagnose/Decide/Act**（来自 163）：不为每个用例造专用版本，而是积累二三十个可复用决策模式。落地：推演模板库按四模式分类编目，新场景先匹配模式再实例化。

15. **120 算子库与"Use LLM 算子"设计**（来自 168/194）：数据编排以 Spark 算子为底、LLM 算子按行批处理（预置情感/分类/摘要/实体提取模板）、表达式生成辅助；PDF→JSON 两算子（数组分解+对象分解）即可结构化。落地：编排能力 roadmap 参考其算子分层（90% 场景七个变换），AI 算子模板化而非裸 prompt。

16. **存储架构对标：多引擎+血缘+对象级 API**（来自 182）：不替代既有存储而是投影到统一语义层；血缘/版本/Schema 演进/多引擎统一治理是难点；对象级查询 API（非 SQL-only）+对象级权限。落地：SwarmStudio 长期架构评审时对照此四层模型检查（尤其血缘与对象级权限两点）。

17. **OAG 叙事与权限三继承**（来自 165/176）：Ontology-Augmented Generation（检索文档+实时结构化数据）优于裸 RAG；AI 视野≤人的视野（构建 Prompt 上下文时按调用者权限过滤）、输入防火墙、全链路审计。落地：作为 SwarmStudio RAG 能力与审批治理的对标话术和检查清单。

18. **Percepta AI"操作手册驱动"交付模式**（来自 196）：前 Palantir 人把本体方法论产品化为行业专属可复用转型手册+驻场交付。落地：SwarmStudio 行业落地时沉淀"行业操作手册"资产（金融 FIBO 手册先行），交付从项目制转手册复用制。

---
*生成：2026-10-21；来源：/tmp/wx-research/corpus/A_壹号讲狮/ 156-210 共 55 篇（全部读完，图片行已忽略）。*
