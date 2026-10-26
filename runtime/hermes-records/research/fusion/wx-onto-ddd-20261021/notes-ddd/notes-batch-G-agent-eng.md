# 批G：Agent 工程实战（DDD）19 篇（orchestrator 亲读，2026-10-21）

批次综述：工程师视角的 Agent 工程化系列，代码级设计模式密度高。1-3 篇（概念/选型/环境）为通识。核心增量集中在 4 篇 DDD 架构（13-16）：四层权限防线/Checkpoint 快照三分类/限流熔断排队/领域实体建模。多 Agent 通信层（9-12）A2A 协议详解。与 hermes kanban/SOUL/markings 体系逐点同构，是最能直接对照出集群缺口的一批。

## 机制清单

### M-G1 DDD 领域拆解：LLM 是能力组件不是系统中心
- 来源：2247483901-1
- 机制本体：限界上下文划界（Agent 执行上下文 vs 多 Agent 通信/RAG 基础设施/可观测/用户中心各自独立，禁揉在一起）；聚合根=Session（不变性：完成后禁新增消息）；实体=Instruction（指令生命周期 PENDING/PLANNING/EXECUTING/VERIFYING/DONE/REJECTED，禁塞 prompt 里）+Message（结构化五元组 senderType/messageType/payload，禁存纯字符串数组）+Tool/ToolCallRecord 分离（定义实体 vs 会话内调用记录）；「LLM 只是领域里的一个能力组件」
- 映射：**结构同构印证**——hermes kanban 卡=Session+Instruction 合体（卡=任务聚合根、body=goal、comments=Message 流水、事件=状态变更日志）；「指令禁塞 prompt 里」=卡 body 禁口头描述、必须冻结验收同则。Message 结构化五元组 ↔ kanban events 已是结构化
### M-G2 四层权限防线（本批最重要）
- 来源：2247483917-1
- 机制本体：租户隔离层（全局第一道）→Agent 基线权限层（agentCode 静态权限包=上限）→Instruction 指令临时授权层（单次任务可再裁剪，grant ⊆ 基线，生命周期绑指令自动失效）→MCP 网关鉴权层（工具侧兜底二次校验+签名凭证）。核心规则：「租户划边界、Agent 定上限、指令收范围、MCP 做兜底」；指令授权只收缩不放大；拿不准时人工审批授权（grantSource=MANUAL）
- 映射：**核心增量**——hermes markings=租户/Agent 层（profile clearance+卡 markings 合取继承）已有；**InstructionGrant 卡级临时授权是增量**：当前卡只继承 assignee 全量 clearance，无「本卡只放开 X 工具」的收缩机制。评估：单用户集群收益中等（无租户混淆风险），但「写配置/发消息类高危工具按卡收缩」有价值——登记 gap 供后续裁决
### M-G3 Checkpoint 快照三分类
- 来源：2247483909-1
- 机制本体：三类数据严格分离——永久日志（Session/Instruction/Message/ToolCallRecord，只追加不修改，进 DB 供审计评测）不进快照；运行时状态（AgentState：中间变量/记忆摘要/下一步标记/子任务进度=驱动下一步执行的最小状态集）才进快照；瞬时数据（流式缓存/临时大报文）绝不存。四触发时机：计划生成后/单步工具成功后/人工暂停/异常保护（重试前）。版本只追加可回滚；热快照 Redis+冷快照异步落库；每 Session 保留最近 5 个有效快照。「日志用来看懂发生了什么，快照用来知道接下来该做什么」
- 映射：**印证+增量**——hermes kanban 卡=持久化状态（crash 后 dispatcher 重派=断点恢复的粗粒度版）；worker_context+comments=「日志面」；workspace 文件=「状态面」——分层已同构！增量=「快照版本化回滚」（卡 update 覆盖无版本）与「单步粒度恢复」——当前集群 crash 重派是全卡重跑，非断点续跑。评估：goal-mode 长卡有收益，登记 gap
### M-G4 三层资源分开治理的稳定性
- 来源：2247483923-1
- 机制本体：LLM 推理/token 速率/MCP 工具/调度引擎四类资源独立配额；「拒绝不是首选，排队调度才是」（任务可排队可暂停可延后——传统限流直接拒绝，Agent 拒绝浪费已有进度）；短任务优先调度+长任务隔离排队；熔断三态（CLOSED/OPEN/HALF_OPEN 探测）；溢出三策略（REJECT/DISCARD_LOW_PRIORITY/BACKPRESSURE）；**与 Checkpoint 联动：排队任务保留快照，轮到时从快照恢复——「不能断点续跑，排队等待就没有意义」**；token 速率限流必须加（少量超长 prompt 耗尽月配额）
- 映射：**强印证**——cc-switch 熔断+evo_concurrency_watchdog 三档动态降档（试探-回退升档）=同款熔断思想且更精细；kanban ready 队列+priority=排队调度已有。增量=「token 速率」维度（cost-ledger 有事后审计，事前速率闸无）——单用户收益低，DROP 但报告记录
### M-G5 可观测四支柱+评测三指标
- 来源：2247483837-1, 2247483843-1
- 机制本体：可观测=日志/指标/追踪/**成本**（第四支柱为 Agent 特有）四合一，目标「看得见任务、看得懂链路、算得清成本、报得出故障」；trace 结构=根 Span（任务）+子 Span（LLM 推理/每次工具调用/异步等待/人工等待/重试降级）。评测三指标类：业务结果（完成率/准确率/完整性/合规性）+**执行路径**（工具调用正确率/平均推理步数/无效动作率/人工介入次数）+资源成本（token/耗时/重试次数）；「同样正确结果，走 1 步 vs 绕 5 轮，路径指标评判聪不聪明」；数据集三来源（人工编写/线上抽样脱敏/负向构造）三分层（基础集必跑/边界集周跑/**回归集=历史上出过错的 case 全进，价值最高**）；可观测管「线上正在发生什么」评测管「新版本会不会出问题」
- 映射：**增量最实的一条**——baseline.md 已有业务结果类+回归集纪律（同款！）；增量=①执行路径指标（步数/无效动作率/人工介入率）集群 evals 未系统测②成本指标 token-meter 有实测但未入题组判据。「无效动作率」对 hermes=重复工具调用/空转轮次——clef-decisions.jsonl 可统计。登记为 evals 增强候选
### M-G6 容错体系四场景
- 来源：2247483831-1
- 机制本体：容错目标「失败可预判、可恢复、可兜底」；异步三案（轮询/回调/MQ 队列）；人工校验卡点（WAIT_HUMAN 状态+快照释放资源）；重试区分临时/永久故障；降级区分核心/附属能力（图表挂了不能挡预算结果交付）；「区分核心流程和附属能力」
- 映射：**强印证**——kanban_block(=WAIT_HUMAN)/crash 重派(=恢复)/transient 块(=临时故障分类)全有；「附属能力降级不挡核心交付」=deliverables 与中间产物分离已有。报告印证
### M-G7 记忆三类分离
- 来源：2247483810-1
- 机制本体：会话短期记忆（完整消息列表，session 级 TTL）+摘要记忆（阈值触发 LLM 压缩，保留最近 2-3 轮原文防细节丢失）+向量长期记忆（跨会话知识，检索式）；「不要拿向量库存当前会话消息」；sessionId 为关联主键
- 映射：**等效印证**——hermes session 压缩机制（compaction）=摘要记忆；memory/hindsight=长期。「保留最近几轮原文」=compaction 保留 head/tail 同款
### M-G8 A2A 协议与多 Agent 通信分层
- 来源：2247483860-1, 2247483874-1, 2247483882-1, 2247483891-1
- 机制本体：三层结构（传输层/消息总线层/应用协议层）；A2A=Agent↔Agent 任务委派（AgentCard 能力卡片/Task 生命周期 submitted→working→completed/failed/cancelled/Message/Artifact 产出物），MCP=Agent↔工具调用——互补非替代（「用 A2A 调数据库=拿快递单当螺丝刀，用 MCP 做 Agent 协作=缺任务生命周期」）；标准接口 sendMessage/getTask/cancelTask/getAgentCard；分布式五问题（丢失/乱序/重复/状态不一致/异构对接）
- 映射：**结构对号印证**——kanban 卡=Task（生命周期 ready→running→done 完全对号）、profile config=AgentCard（SOUL+skills+clearances 即能力卡片）、complete metadata.artifacts=Artifact、卡 body/parents handoff=Message。集群不需要引入 A2A（kanban 已是等效实现），但「AgentCard 机器可解析能力发现」提示：capability-ontology.py 导航=同职能。报告对号即可
### M-G9 多 Agent 升级判断与四模式
- 来源：2247483851-1
- 机制本体：单 Agent 四病（Prompt 臃肿/角色漂移/能力不可复用/故障影响面大）；适合多 Agent 四特征（>5-10 步+天然角色分工+跨知识域+复杂决策）；「能用单 Agent 稳定完成就不要强行多 Agent」；四模式=主管+执行（企业首选）/流水线/对等协作（高风险决策交叉校验）/市场型（竞争接单，少落地）
- 映射：**印证**——orchestrator+worker=主管执行模式；蓝军/reviewer=对等协作；「拆卡优先于加预算」=单卡 vs 多卡的判断纪律同款
### M-G10 ReAct/Plan&Solve 与工具调用本质
- 来源：2247483804-1, 2247483820-1
- 机制本体：Function Calling 本质=LLM 只输出结构化 JSON 意图，执行永远是业务代码（「大模型负责决策与生成结构化参数，执行动作的永远是我们写的后端代码」）；ReAct 三问（拿到了什么/还缺什么/继续还是结束）；复杂任务先 Plan 后 ReAct，计划可中途调整；工具描述文字质量直接决定调用成功率
- 映射：**印证**——hermes 工具调用同构；「工具描述质量」=tool schema 维护。无独立增量
### M-G11 状态持久化四类数据
- 来源：2247483826-1
- 机制本体：任务元信息（taskId 主键/权限/生命周期）+ReAct 执行上下文（完整消息+计划+进度+调用历史+循环步数防无限循环）+业务中间结果缓存（省重复调用）+状态机标记（六态）；「持久化不是保存日志，是保存可恢复的任务执行现场」；冷热分离（Redis 热状态/MySQL 主数据/Milvus 可选）
- 映射：印证 M-G3，与 kanban 卡字段对照（卡=元信息、comments=执行上下文、artifacts=中间结果、status=状态机）。报告合并引用
### M-G12 通识 3 篇
- 2247483796-1（Agent 概念）、2247483797-1（框架选型：LangGraph/SpringAI/Dify/LlamaIndex 四问选型法）、2247483798-1（Docker 环境）——通识，无集群增量；「三类 Agent：轻量工具型（生产最多）/规划型/多 Agent 协同（Demo 多）」的冷静分类可引用

## 批 G 三条最重要发现
1. 四层权限防线（M-G2）的「指令级临时授权（grant ⊆ 基线，只收缩不放大，绑指令生命周期自动失效）」是集群 markings 体系的精细化方向——单用户集群当下收益中等，但工具面持续扩大后（MCP 工具已 170+）按卡收缩高危工具值得登记 gap
2. 「排队+Checkpoint 联动：不能断点续跑，排队等待就没有意义」（M-G4）与「快照三分类」（M-G3）——集群 crash 重派=全卡重跑，goal-mode 长卡的断点续跑（从最后成功步骤恢复）是真实缺口，登记 gap
3. 评测「执行路径指标」（推理步数/无效动作率/人工介入率）与「成本指标入题组」（M-G5）是 evals 体系最实的增量——clef-decisions.jsonl+token-meter 数据已在，缺的是把它们变成题组判据
