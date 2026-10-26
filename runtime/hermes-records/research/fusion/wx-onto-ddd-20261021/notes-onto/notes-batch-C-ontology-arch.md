# 批C：本体架构与合流 16 篇（orchestrator 亲读，2026-10-21）

批次综述：本批是全语料的理论制高点，讲清「为什么 Agent 时代本体从可选变必选」。核心论断链：模型解决 Intelligence、Agent 解决 Agency、Ontology 解决 Reality；Agent 越强 Ontology 越重要；本体从 Knowledge Model→World Model→Runtime 演进。与 hermes 集群的 SOUL/ontology/skill 分层高度同构，可直接对读出集群的本体成熟度位置。

## 机制清单

### M-C1 Ontology 与 Harness 合流论
- 来源：2247509739-1, 2247509735-1
- 机制本体：传统链 LLM→Tool Calling→API 演化为 LLM→Harness→Ontology→Action→Enterprise System——Ontology 插进 Harness 与工具之间，Agent 不理解 API 只理解业务；Ontology MCP（2026-06 GA）把 Object/Action/Query 直接暴露为 MCP Tool，企业不再为每个 Agent 单独开发 API 集成；Agent 可再暴露为 Tool（Agent 调 Agent）；AI FDE 反向构建 Ontology（人建本体给 Agent 用 → Agent 参与建本体）；CPU/Harness=OS 类比：CPU 越强 OS 越重要（能力越强控制越重要）
- 映射：**印证+重大启示**——hermes 架构正是此型：SOUL+ontology.md=Ontology 层、tools/guardrail=Harness、kanban=编排、markings=权限门。OpenAI Astra Critical 评级后加隔离/权限/监控的实例=cluster 对 worker 的收权逻辑同款。Ontology MCP 对应=集群把 skill/tool 经 MCP 暴露给外部 Agent 的可能性（semantica runtime 已在管理知识图谱，方向一致）
### M-C2 Agent 变薄 Ontology 变厚 + 语义漂移/Prompt Debt
- 来源：2247509658-1, 2247509689-1
- 机制本体：反模式=每 Agent 自带企业知识副本（100 个 Agent=100 个企业副本→分叉）；企业 AI 真险境=Semantic Drift（口径改了要改多少个 Prompt？散落 Prompt/Skill/Memory/SQL/字段的旧定义找不全）——「过去的软件工程害怕复制代码，未来的企业 AI 更害怕复制语义」；Prompt Debt 新债种；正解=智能属于 Agent、企业属于 Ontology（规则改一次全 Agent 生效）；薄≠弱（Reasoning/Planning 仍强，薄指不重复存企业知识）；「Agent 不应背着整个企业去思考」（浏览器 analogy）
- 映射：**核心印证集群已有纪律**——「共享规则引用（按架构层级目录）+单一事实源」正是此原则的 hermes 版：SOUL 引用 _shared 不复制全文（forward-deployed 模板禁内嵌即同款）、capability-ontology.py 单接口导航、grep 旧值残留扫描（design-doc-sync-audit）。增量=「语义漂移」作为名词可引入 fleet 审计话术（skill-fleet-consistency-audit 已在做此事）
### M-C3 Ontology 八阶段演进
- 来源：2247509799-1
- 机制本体：Knowledge Representation（世界有什么）→Semantic Layer（意味着什么）→Enterprise Context Layer（这是哪家的世界）→Agent World Model（怎么行动）→Agent Governance Layer（被允许怎么行动）→Shared Multi-Agent Memory（共享现实：Operational Memory 记录发生了什么/谁做了什么/什么状态变了，非 Conversation Memory）→Physical World Model（连接物理）→Operational Execution Layer（绑定 Function/Action/Workflow 后本体=执行结构，Data/Semantic/Application/Workflow 四层收敛为 Ontology-driven Runtime）
- 映射：**集群定位标尺**——hermes ontology-shapes.yaml 处于 1-3 阶段（语义+上下文），SOUL 三段契约+tier 守门=第 5 阶段治理，hindsight=第 6 阶段 Shared Memory（Operational Memory 对应 kanban 卡结果+hindsight 事件记忆），无 7/8（无物理世界、无本体直接绑定执行面——但 kanban 卡状态机+验收命令已具雏形）。本条价值=给集群体体提供成熟度坐标系
### M-C4 十八面体全景
- 来源：2247509085-1
- 机制本体：本体 18 特性分五层：骨架（对象/属性/关系/结构/语义）+大脑（向量/函数）+感官（统计/时序/文档/音频/视频/地图）+手脚（行动/告警/权限/接口）+皮肤（样式）；「多数企业的数据建设只做到对象和属性堆砌」
- 映射：**对读工具**——hermes 卡对象面=对象/属性/关系（body/字段/parents 链）+权限（markings）+行动（kanban 状态机）+告警（blocked/needs_input）；无多模态感官面（图片要 vision_analyze 才可见——正好本会话就是案例）。报告对读即可
### M-C5 OAG/DOMA 架构推演
- 来源：2247508888-1
- 机制本体：Data+Ontology+Models+Agents 四层；对象必须带 Links+Action（定义 Factory 同时绑定 Shutdown_Line()+Reschedule_Shift()，Action 含逻辑校验+权限控制如「库存<10 才允许触发补货」）；OAG 检索对象非文本块；工具绑定=平台自动把 Action 定义转成 LLM 可调 Function Tools；回写事务管理=Draft Mode 强制（Agent 操作默认拟态 Staged，人批准才真提交）+变更元数据（哪个 Agent/哪条 Prompt/谁批准的）
- 映射：**印证**——Staged Action（forward-deployed-protocol §三）与 Draft Mode 同构；「Action 含逻辑校验+权限控制」=集群验收命令冻结+markings 双闸同款。「变更元数据」=kanban events 已记
### M-C6 本体三作用：链接/增强/封装
- 来源：2247509477-1
- 机制本体：链接（系统+多模态数据挂载到业务对象）；增强（语义[字段加业务含义/口径/约束]/计算[衍生指标封装]/向量/模态）；封装（业务逻辑/行业经验/决策规则/治理体系结构化——「企业真正值钱的不是数据」）；数据工程=数据治理≠本体工程=业务建模
- 映射：**印证**——skill 库=「封装」面的 hermes 实现（经验结构化）；「数据治理≠业务建模」对集群的转译=「文档整理≠本体建设」，ontology.md/shapes 维护是建模不是归档
### M-C7 无本体 AI 是悬浮 AI
- 来源：2247509689-1（蓝图）, 2247509761-2（老技术辩）, 2247509340-1（vs RAG）, 2247508937-1（扼杀幻觉，与批B M-B9 重复印证）
- 机制本体：先建 Context 再上 Agent（顺序不能反：刚入职智商极高但不懂公司的新人比喻）；RAG=记忆系统（我知道什么）vs Ontology=世界模型（世界怎么运行）；九大厂商（AWS/Microsoft/Salesforce/SAP/ServiceNow/Google/Snowflake/Databricks/Palantir）2026 全部把 Ontology 放进 Agent 架构核心=行业共识形成；Salesforce 区分 Descriptive（描述业务含义）vs Structural（映射数据）双本体
- 映射：**战略印证**——hermes 走的正是「Context 先行」路线（SOUL/ontology 在 worker 之前存在），此文群是集群架构选择的最强外部佐证弹药，写进融合报告给用户
### M-C8 两大基础设施论（GPU+Ontology）
- 来源：2247509316-1, 2247509269-1
- 机制本体：GPU=算力肌肉，Ontology=逻辑秩序（T-box 概念层/A-box 实例层/公理）；数据库（文件柜）→本体库（认知地图）：字面检索→语义推理、黑盒→可解释、数据孤岛→统一认知；神经符号结合；LLM for Ontology（自动构建）与 Ontology for LLM（驱动）双向奔赴
- 映射：**背景印证**，无独立增量。db→ontology 的「文件柜/认知地图」比喻可入报告通俗层
### M-C9 Ontology-Centric 替代 App-Centric
- 来源：2247509086-1
- 机制本体：SaaS 围墙花园中间件=人（Excel/PPT/会议）；Ontology-Centric=应用消失、SaaS 退化为读写接口、本体=唯一真相层+唯一交互面；OODA 闭环（Observe 连接器→Orient LLM+Function Calling→Decide HITL→Act 事务写回+审计）；模型不可知论——模型成大宗商品后价值流向 Context 和 Workflow
- 映射：**印证**——hermes 集群里「应用」已经消失（worker+工具+卡=一切），正是 Ontology-Centric 形态；「价值流向 Context」=用户裁决的「高质量优先/建设期」方向印证
### M-C10 空壳 3 篇
- 2247508937-2、2247509086-2、2247509085-2（PPT 讲稿正文空），跳过；正文在对应 -1 版

## 批 C 三条最重要发现
1. 「模型解决 Intelligence / Agent 解决 Agency / Ontology 解决 Reality」三元式+八阶段演进=全语料最重要的理论框架，可直接作为 hermes 集群架构自述的坐标系：集群已实现 1-6 阶段（含治理与共享记忆），缺口在 7-8（物理世界与执行层绑定）
2. Semantic Drift/Prompt Debt（M-C2）是集群「单一事实源+引用制」纪律的行业级命名——集群实践领先于行业话语，报告里可反向输出
3. Ontology MCP（把本体能力标准化暴露给任意 Agent）预示集群 semantica/skill 库的外化路线：现在 skill 只服务 fleet 内 worker，未来可经 MCP 服务外部 Agent——与 tool_search 里大量 mcp__rea__ 工具的存在互相印证，方向已在发生
