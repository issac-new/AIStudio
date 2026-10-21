# 《Agent 工程实战》系列精读笔记（公众号：AI变革见证，2026-10-16 ~ 10-21，共 20 篇）

来源：/tmp/wx-research/corpus/B_AI变革见证/（19 篇连载）+ /tmp/wx-research/corpus/B_extra/（1 篇评论文章）。连载主线：概念与选型 → Docker 环境 → 最小 Agent（工具调用/记忆/规划/持久化/容错/可观测/评测）→ 多 Agent 与 A2A/MCP → DDD 架构（领域模型/Checkpoint/权限/限流熔断）。技术栈主线为 Java + Spring AI Alibaba，Python/LangGraph 为旁路线。

## 一、逐篇精读笔记（按系列顺序）

### 001-别再被 Agent 概念忽悠（2026-10-19）
破除"Agent 是新技术"的误解：Agent 概念几十年前就有，现在的 Agent = 用 LLM 作决策大脑，把"思考→调用工具→观察结果→再调整"串成闭环系统；对话模型是被动一问一答，Agent 是目标驱动的循环。Agent 无自我意识，"自主"只是代码按预设循环执行，把"循环执行"当"万能自主"是 Demo 翻车的根源。四组件：大脑（LLM）、工具体系（手）、记忆模块、状态与控制层（循环终止/异常/权限）。三类落地形态：轻量工具型（生产最多）、规划型（长任务易跑偏）、多 Agent 协同（真实落地少、多停留在 Demo）——作者强烈建议从第一类入手，"能简单就不要复杂"。四条局限：长任务跑偏（必须 max 轮次限制）、幻觉仍在（关键业务加校验）、成本不可控（配额+缓存）、调试困难（必须可观测）。给出五阶段学习路线（本连载的目录）。

### 002-LangGraph/Spring AI Alibaba/Dify/LlamaIndex 怎么选（2026-10-19）
选型四问：主力语言（Java/Python）、目标（Demo vs 生产）、团队运维现状（要不要多租户/权限/审核）、可维护性（自定义工具与流转量）。结论：Java 后端嵌企业系统选 Spring AI Alibaba（复用 Spring 事务/权限/RocketMQ，生产管控友好）；Python 复杂长任务原型选 LangGraph（编排强、原生状态持久化，但生产规范靠自觉）；Dify 低代码适合轻量验证、不适合深度定制底座；LlamaIndex 只在"文档检索是核心"时选。三个坑：追时髦选最炫框架、把 Demo 能力等同生产能力（Demo 隐藏了超时/格式错误/工具失败/Token 超限）、频繁切换框架浅尝辄止。混合模式常见：Dify 验证可行性 → Spring AI Alibaba 重构生产版。

### 003-开发环境搭建：Docker Compose 全套调试栈（2026-10-19）
容器化理由：环境隔离、一键启停、团队一致性、可复用；明确这是开发环境不是生产环境。组件清单：模型网关（远程 API 或 Ollama）、Milvus 向量库（低配可换 Chroma）、Langfuse（LLM 链路追踪，调试必备）、Redis（会话状态/短期记忆/断点续传状态）。两种开发模式：模式 A（推荐）本机 IDE + Docker 只跑中间件；模式 B 代码进容器（隔离彻底但调试难）。五个高频坑：端口冲突、内存不足（Milvus 需 16G+，OOM 则降级换 Chroma）、镜像拉取失败（配国内源）、容器重启数据丢失（volume 持久化、`down` 不带 `-v`）、容器内地址与宿主 localhost 混淆。

### 004-最小 Agent 实战 1：手写第一个工具调用 Agent（2026-10-19）
核心认知：Function Calling 不是大模型执行代码，是 LLM 输出结构化 JSON 描述"要调哪个工具、传什么参数"，解析与执行由业务代码负责，工具结果再回传 LLM 生成最终答案。消息四角色：system（规则+工具定义）、user、assistant（自然语言或工具调用 JSON）、tool（工具返回）。工具描述文字质量直接决定模型选工具与出参的正确率。单轮链路：注入工具定义 → 用户问题 → LLM 返回工具调用 JSON → 解析执行 → tool 消息追加 → 二次请求 LLM → 最终回答；Langfuse 里能看到两次请求的消息差异。四个坑：工具描述含糊模型不选工具、不校验 JSON 直接解析（要加提取/异常捕获/重试）、参数类型不匹配（要校验+类型转换）、忘记把工具结果放回消息上下文。

### 005-最小 Agent 实战 2：记忆系统三类分治（2026-10-19）
三类记忆边界分明：短期会话记忆（Redis 存当前会话完整消息数组，sessionId 为主键，TTL 过期）、摘要记忆（消息超阈值如 15 轮时 LLM 压缩，保留最近 2-3 轮原始消息防丢最新细节）、向量长期记忆（Milvus 存跨会话知识，检索 TopN 后手动拼进 System Prompt，不自动写入会话消息）。组装顺序：系统提示词 + 摘要/历史 + 检索到的长期记忆 + 新问题。工程原则：不要拿向量库存当前会话消息。五个坑：全存向量库（污染上下文）、无 TTL 无限堆积、摘要丢关键数字（摘要 prompt 明确要求保留数字/约束/实体）、只看相似度不做元数据过滤（用户 id/标签/时间范围过滤）、Token 预算失控（上下文长度校验超阈值触发摘要）。

### 006-最小 Agent 实战 3：ReAct 与 Plan&Solve 推理循环（2026-10-19）
ReAct = 走一步看一步（Thought/Action/Observation 循环）；Plan&Solve = 先让 LLM 输出计划再逐步执行，计划要做成"可更新的步骤列表"而非一次写死；两者组合：简单任务纯 ReAct，复杂任务先 Plan 再 ReAct，执行中发现情况变化重新规划。思考环节让 Agent 每步回答三问：拿到什么、还缺什么、继续调工具还是结束。最小循环：LLM 输出 Thought+Action → 解析执行 → Observation 追加上下文 → 直到 Final Answer；Action 结构化约定如 `Action: calculator(a=100, b=0.2)` / `Action: final_answer(...)`。循环状态对象至少含：消息列表、已执行步骤、工具返回结果、是否完成、最终答案。铁律：必须设 max_steps（5~10），否则 LLM 跑偏即死循环。五个坑：无结束条件、无最大循环次数、Observation 不回填上下文、计划与执行脱节（每步把当前计划+已执行步骤发给 LLM 对照）、Prompt 规则堆太多反而输出不稳。

### 007-最小 Agent 实战 4：状态持久化与断点续传（2026-10-19）
四个企业场景驱动：服务重启内存任务丢失、长任务网络断开、人工介入跨小时会话、多人协同接力。核心论断：状态持久化不是存日志，是保存"可恢复的任务执行现场"；日志用于排查，持久化状态用于续跑。可恢复状态四大类：任务基础元信息（taskId/sessionId/userId/类型/时间戳）、ReAct 执行上下文（完整消息列表、计划清单、计划进度、工具调用历史、循环步数——步数保存防恢复后无限循环）、业务中间结果（缓存避免重复调工具降成本）、任务状态机枚举（PENDING/RUNNING/WAIT_HUMAN/PAUSED/COMPLETED/FAILED）。分层存储冷热分离：Redis 热状态（会话消息/临时状态/中间结果）、关系库任务主数据（taskId 主键，断点恢复唯一可信数据源）、Milvus 只存归档不可作恢复源。恢复六步：触发恢复 → 读元信息按状态分派（COMPLETED 直接返回结果；FAILED/PAUSED/WAIT_HUMAN 允许恢复；过期拒绝）→ 加载完整现场 → 校验完整性（损坏则降级询问重启）→ 继续 ReAct 循环 → 结束更新终态。关键工程要点：一步一存（每个 ReAct 步骤结束就 Redis+数据库双写），不要整个任务跑完再批量保存。六个坑：只存日志不存可执行状态、只写 Redis 不落库、无状态机靠解析文本判断进度、断点恢复重复执行工具（每次调用给唯一调用 ID 做幂等）、保存时机靠后丢最新步骤、恢复后无 max_step 兜底。

### 008-最小 Agent 实战 5：容错体系（异步/人工校验/重试/降级）（2026-10-19）
容错目标：不是保证永不失败，而是失败可预判、可恢复、可兜底；区分临时与永久故障、核心与附属能力。异步三方案：轮询（下游无回调时，注意轮询间隔与最大等待）、回调（传回调地址，注意回调丢失与重复的幂等）、消息队列（削峰+任务持久+支持重试）。异步任务状态六枚举：PENDING/RUNNING/SUCCESS/FAILED/CANCELED/TIMEOUT，Agent 按状态分支处理。人工校验节点：HUMAN_CONFIRM 是与工具调用、final_answer 平级的特殊 Action——LLM 识别高风险输出该 Action → 暂停循环 → 全量持久化现场 → 前端展示确认面板（任务目标/已完成步骤/下一步动作/依赖数据/业务影响/驳回意见框，反对只有确认/取消按钮的差设计）→ 用户决定作为新消息追加上下文 → 唤醒 ReAct 继续（不是硬编码改结果跳过 LLM）。重试：只重试临时故障（超时/429/短暂 500/锁等待），永久错误（参数错/401/403/业务校验不过/用户驳回）禁止重试；指数退避 2s/4s/8s/16s，上限 3~4 次；每次调用全局唯一 callId + 执行记录查询做幂等。降级四方案：跳过附属功能、部分返回（标注缺失）、备用实现切换、转人工处理；降级规范：记录故障日志、明确告知用户结果限制、降级方案由业务规则预定义不交给 LLM 决定。升级后任务状态机十枚举（新增 RETRYING/DEGRADING/PARTIAL_SUCCESS/CANCELED），典型流转如 RUNNING→RETRYING→RUNNING、RUNNING→WAIT_HUMAN→（确认→RUNNING/驳回→FAILED）、RUNNING→DEGRADING→PARTIAL_SUCCESS→COMPLETED。taskState 扩展字段：retryMap、failedTools、asyncJobMap、humanConfirmStatus、degradeRecord；工具结果类型枚举：SYNC_SUCCESS/ASYNC_SUBMITTED/TEMP_ERROR/PERM_ERROR/PARTIAL_RESULT。六个坑：异步回调不恢复完整现场（jobId 关联 taskId）、人工确认绕过 ReAct、重试不分错误类型、降级交给 LLM 自主决策、重试无幂等、状态机非法流转（状态变更必须落库+读取时校验合法性）。

### 009-最小 Agent 实战 6：可观测体系（日志/指标/追踪/告警/成本）（2026-10-20）
目标四句话：看得见任务、看得懂链路、算得清成本、报得出故障。四大支柱：结构化 JSON 日志（ELK/Loki，埋点六类事件：任务生命周期、LLM 推理（输入输出/Token/耗时）、工具调用（入参/返回/耗时/错误码/重试次数）、状态机变更、降级、断点恢复）、指标（Prometheus+Grafana，四组：任务业务指标（成功率/人工介入率/P50~P99/断点恢复次数）、LLM 指标（失败/超时/P95 延迟/输入输出 Token）、工具指标（失败率/P95/重试/降级次数）、系统资源）、链路追踪（Trace=一次 Agent 任务，Span 拆根 Span/LLM 推理/工具调用/异步等待/人工等待/重试降级；Langfuse 为主，可接 OpenTelemetry）、成本监控（Token 按模型单价换算，按用户/任务类型/模型/时间维度聚合，预算阈值告警）。埋点统一标签：traceId/taskId/sessionId/userId/agent_version/model_name + event_type/status/error_code；敏感数据（手机号/证件/金额）入库前必须脱敏。三大大盘（业务总览/性能/成本）。告警分业务/性能/成本三类，降噪靠冷却时间与 P0/P1/P2 分级。分工：Langfuse 看单任务链路详情与内容审计，Prometheus+Grafana 做聚合大盘与告警。六个坑：无全局 traceId 串不起来、日志不脱敏、只盯 LLM 指标漏工具与状态机、指标爆炸、告警风暴、Token 死循环无成本告警（成本告警+max step 双保险）。

### 010-最小 Agent 实战 7：自动化评测体系（2026-10-20）
定位区分：可观测监控线上正在发生什么，评测提前验证新版本会不会出问题。指标三组：业务结果（任务完成率/答案准确率/完整性/合规性）、执行路径（工具调用正确率/平均推理步数/无效动作率/人工介入次数——评"聪不聪明"）、资源成本（单任务平均 Token/P50/P95 耗时/失败重试次数）。数据集三来源：人工编写基础用例、线上真实会话抽样（必须脱敏+人工标注）、负向/边界构造（参数缺失/模糊提问/错误指令/工具失败/多轮复杂/冲突需求）。用例字段：case_id/query/expected_outcome（可为结果约束而非完整答案）/tags/difficulty/reference。分层：基础集（必跑）、边界集（每周）、回归集（守住已修复 bug 不复发——作者认为价值最高）。打分三方案：规则匹配（入门）、LLM-as-judge（工程首选；裁判给 0~5 分+理由；铁律：固定裁判模型版本，换裁判分数整体偏移无法对比；同 case 多次评测取平均降随机性）、RAGAS（高阶量化）。CI/CD 流水线：改代码/提示词 → 自动拉起评测环境 → 批量执行 → 与上一稳定版基线对比 → 生成报告（指标对比/退化案例清单/资源统计/失败详情可复现）→ 完成率降超 3% 阻断发布。五个坑：全是简单样例、裁判模型不稳定、数据集不维护（新 bug 修复后必须回灌回归集）、把分数当唯一标准（自动化筛选+人工抽查）、评测环境与线上不一致（仅隔离业务数据）。

### 011-多 Agent 协作实战 8：从单 Agent 到多 Agent（2026-10-20）
单 Agent 四瓶颈：Prompt 臃肿、角色漂移、能力无法复用、故障影响面大；多 Agent 的价值是解耦与稳定，不是炫技。适合特征：步骤超 5~10 步且各步骤需不同专业能力、天然角色分工、跨多业务知识域、需多轮分析多方校验的复杂决策；不适合：一问一答、单工具即可、固定短流程。四大架构模式：主管+执行（中央调度，企业落地最常用，缺点是主管单点决策风险）、流水线（顺序固定，前环节失败拖垮后续）、对等协作（多视角交叉校验降幻觉，难收敛，适合风险决策）、市场型（任务池竞争接单，偏研究、工程落地难）。四个设计难点：任务拆分（按业务模块/执行步骤/能力角色）、传递结构化消息、子任务失败处理（重试/换备用 Agent/部分结果/上报主管重规划）、控制通信轮次降 Token（每次通信传完整上下文，仅关键节点同步）。落地五步：试点场景 → 角色识别 → 选架构（优先主管+执行）→ 定义通信协议 → 开发调试接评测体系。

### 012-多 Agent 协作实战 9：消息总线、状态同步与可靠传递（2026-10-20）
多 Agent 本质是分布式系统，五个经典问题：消息丢失、乱序、重复投递、状态不一致、异构对接成本。三层结构定调：传输层（HTTP/SSE/TCP）、消息总线层（持久化/路由/重试/死信/限流）、应用协议层（A2A 在此层）——"MQ 管消息能不能安全送到，A2A 管送到后双方怎么读懂任务含义"，A2A 不是 MQ 替代品而是上下层关系。三种通信模式：同步 RPC（少量 Agent 短任务）、消息总线异步（企业内部长任务解耦）、消息总线+A2A 混合（异构首选：总线承载投递，payload 遵循 A2A 的 AgentCard/Task/Message/Artifact）。Topic 规划示例：task.dispatch、task.state.change、task.result、agent.error。可靠性四件套：投递语义选"至少一次+业务幂等"（messageId 做去重主键维护消费记录表）、指数退避重试+限流、死信队列（存原始消息/错误原因/重试次数，支持修复后重放）。状态同步：中心化（主管/独立状态服务维护全部 Task 状态，A2A Task 自带状态天然适配，一致性好评测简单）优先于分布式广播（去中心化容错强但冲突复杂）。A2A 四实体：AgentCard（能力卡片，机器可解析）、Task（submitted→working→completed/failed/cancelled 生命周期）、Message（多 Part 消息，支持 SSE 流式）、Artifact（产物+元数据）；标准接口 sendMessage/sendStreamingMessage/getTask/subscribeToTask/cancelTask/getAgentCard。三个坑：把 A2A 当 MQ 替代品、过度设计（Demo 先自研消息体，规模上来再迁 A2A）、A2A 版本迭代需做 AgentCard 版本兼容。

### 013-多 Agent 协作实战 10：A2A 最小可运行 Demo（2026-10-20）
Demo 刻意排除消息总线/持久化/幂等重试/鉴权/流式 SSE，先跑通语义层。两角色：OrchestratorAgent（拉 AgentCard、构建 Task 下发、轮询 getTask、汇总 Artifact）与 WorkerAgent（暴露 A2A 接口、维护本地 Task 状态机、产出 Artifact）。AgentCard 关键字段：agentId/name/description/version/capabilities（主管匹配用）/endpoint/supportedModes/authentication（生产加 JWT）。Task 字段：taskId/title/status/assigneeAgentId/initiatorAgentId/createdAt/updatedAt/messages/artifacts。Message 结构：messageId/role/parts[]（type+text）；Artifact 结构：artifactId/title/type/content（结构化数据）。A2A 基于 JSON-RPC（统一 `{jsonrpc, id, method, params}`），Demo 只实现 getAgentCard/sendMessage/getTask/cancelTask 四方法。时序：主管拉卡片确认能力 → sendMessage 建 Task（置 working）→ Worker 后台执行产出 Artifact → 置 completed → 主管轮询取 Artifact；生产应换 subscribeToTask 订阅或总线推送。三个 A2A 特性：能力描述与实现解耦（新增 Agent 只读卡片不改主管代码）、Task 生命周期由标准枚举承载（异构框架都能读懂）、结果统一封装 Artifact（上层无需重新约定格式）。Demo→生产升级六步：轮询改订阅、A2A 消息封装投 MQ、messageId 幂等去重、重试限流死信、鉴权、Langfuse 链路打通。四个坑：把 A2A 当大框架（它是协议规范不是 SDK）、混淆 Message 与 Task（Message 是对话消息，Task 是一次委派作业、内含多轮 Message）、大段业务文本塞 Task 字段忽略 Artifact、随意扩展自定义 status 破坏异构互通。

### 014-多 Agent 协作实战 11：A2A 生态组件盘点（2026-10-20）
组件帮你省掉的是"符合 A2A 规范的接口外壳"：JSON-RPC 解析校验、AgentCard 序列化（官方标准路径 /.well-known/agent-card.json）、Task CRUD 与状态流转校验（防非法跳转如 failed→working）、Message/Artifact 模型封装、SSE 订阅管理、协议版本兼容。四类方案：官方参考 SDK（a2a-python/typescript/go，轻量库不绑框架、默认内存存储需自接持久化）、框架原生集成（LangSmith Agent Server 官方 A2A 端点、社区包 a2a-langgraph；Java 生态注意 Spring AI 原生支持 A2A 而 Spring AI Alibaba 需搭配 AgentScope spring-boot-starter-agentscope-runtime-a2a-nacos + Nacos A2A 注册中心；CrewAI 把 A2A 作为一等委派原语；Microsoft Agent Framework（原 AutoGen）提供多语言托管包）、独立 A2A 网关（统一对外暴露 A2A 入口、内部对接普通 HTTP Agent 做协议转换、统一管理 AgentCard/路由/鉴权/限流/Task 日志，适合几十个异构 Agent 的平台，代价是架构变重）、低代码插件（Dify 经 Nacos A2A Server 插件；Flowise 无正式支持）。核心误区再强调：组件封装 A2A ≠ 自带可靠性——Task 持久化、幂等去重、失败重试、死信告警、总线分发、追踪上报、权限租户隔离这七件事组件全不管，仍要自己搭。正确组合：Agent 业务逻辑 + 框架 A2A 封装（协议层）→ 消息总线（可靠性底座）。仍需自己实现的场景：技术栈无成熟 Adapter、需深度改造交互模型（自定义 Part/特殊权限模型）、边缘低资源、做协议兼容层。

### 015-多 Agent 协作实战 12：A2A+MCP 端到端全链路（2026-10-20）
定调：A2A 与 MCP 是上下层搭档非竞品——A2A 管 Agent↔Agent 任务委派（有 Task 生命周期/状态机/订阅/取消），MCP 管 Agent↔外部工具调用（单次工具调用，无长流程多轮交互能力）。标准链路：Supervisor --A2A--> Worker --MCP--> 数据库 MCP 服务；数据库不感知 A2A。两个反面误区：用 A2A 调数据库（无工具描述与参数 Schema，"拿快递单当螺丝刀"）、用 MCP 做 Agent 协作（无任务生命周期）。业务闭环八步：Supervisor message/send 下发 → Worker 建 Task 置 working → Worker 内 LLM 判断需查库 → MCP Client 连 Database MCP Server → 拉工具列表选 sql_query 生成安全 SQL → 拿数据整理 → A2A 回传结果置 completed → Supervisor 返回用户。选型两路线：LangGraph（原型）与 Spring AI Alibaba+AgentScope+Nacos（微服务生产，天然适配 Higress/多租户）。架构铁律：MCP Server 独立部署不与 Worker 进程耦合（否则工具扩容、权限管控、鉴权、日志隔离都麻烦），同一 MCP 服务可被多个 Worker 与单 Agent 复用（工具中台化）。四个生产坑：权限两层（A2A 层校验 Agent 间访问权限 + MCP 层校验工具调用权限，不能拿到任务就放行 SQL）、超时重试分层（A2A 层管任务消息投递重试，MCP 层管单次工具调用重试；查询类幂等 SQL 可重试、写类必须加幂等 ID）、状态分开记录（MCP 调用失败 ≠ A2A 任务失败，Worker 可换工具或回报异常而非整体失败）、工具细节不外传（不把 MCP 工具列表传给主管，主管只关心业务结果）。不适合场景：独立单 Agent 只用 MCP 即可；固定工作流直接用框架内置工具调用，不必引入 A2A。

### 016-Agent 架构设计 13：DDD 拆解 Agent 领域模型（2026-10-21）
为什么需要 DDD：过程式写法的五大工程病——会话只是一串消息数组（分不清用户输入/模型思考/工具入参/工具返回/系统通知）、状态是零散变量（不知道哪些要持久）、工具只是函数（无统一描述/权限/限流/版本/超时）、指令无生命周期（无待执行/执行中/成功/失败/取消流转）、多 Agent 委派无统一领域契约。定位：LLM 只是领域里的"能力组件"，不是系统中心。限界上下文：Agent 单执行单元上下文含指令/会话/运行时状态/工具定义与调用/记忆快照/校验规则权限标签；剥离消息总线与 A2A（多 Agent 上下文）、向量库实现（RAG 基础设施）、日志计费（可观测）、账号租户主数据（用户中心）。核心模型：
- 聚合根 AgentSession：sessionId、tenantId、agentCode、status（CREATED/RUNNING/PAUSED/COMPLETED/FAILED/CANCELLED）、createdAt/updatedAt/expireAt、parentSessionId（支持 A2A 委派：主管会话关联 Worker 会话）、metadata（渠道/优先级）。不变性：会话终态后不允许新增消息与工具调用；子对象不能脱离 Session 存在。
- Instruction 指令实体：instructionId、sessionId、content（原始文本）、goal（结构化目标，用于校验是否完成）、status（PENDING/PLANNING/EXECUTING/VERIFYING/DONE/REJECTED）、plan（LLM 分步方案，值对象）、deadline、retryCount、assignee（A2A 委派执行者）。行为：生成计划、校验目标达成、标记失败/重派、取消。
- Message 消息实体：messageId、sessionId、senderType（USER/LLM/TOOL/SYSTEM/AGENT_PEER）、senderId、messageType（TEXT/TOOL_CALL_REQUEST/TOOL_CALL_RESULT/ERROR/NOTICE）、payload（结构化 json）、rawContent、tokenUsage（值对象）、createdAt。好处：检索/过滤/可观测/成本统计直接按类型筛选，不用解析文本。
- Tool 与 ToolCallRecord 分离：Tool 是全局实体（toolId/toolCode/name/description、inputSchema/outputSchema、authRule 权限标签、timeout/rateLimit/retryPolicy、provider=MCP 服务地址或本地函数标识）；ToolCallRecord 是会话内实体（recordId/sessionId/instructionId/toolId/inputArgs/output/status（INIT/RUNNING/SUCCESS/ERROR/TIMEOUT）/cost/costTime）。MCP 服务就是 Tool 的一个 provider 实现，模型无需改动——A2A+MCP 能打通的底层原因。
- AgentState 运行状态实体：stateId、sessionId、memorySnapshot（摘要记忆快照）、variableMap（业务中间变量结构化 KV）、nextStepHint（下一步动作标记）、checkpointVersion（快照版本号）。铁律：不要把 LLM 完整思考日志塞进 State，State 只存结构化机器可读数据用于恢复执行，思考文本放 Message。
- 值对象清单：TokenUsage、PlanStep（内容/顺序/依赖）、MemorySummary（内容/范围/生成时间）、ErrorInfo（错误码/信息/根因标签）、PermissionTag。
协作链路：Instruction 生成 Plan（→PLANNING）→ 写 Message 更新 AgentState → 生成 ToolCallRecord 关联 Tool 经 MCP 调用 → 结果写回 Message/Record → 校验目标达成 Instruction DONE、Session COMPLETED → 每步可打 Checkpoint。A2A 只是传输层，两边领域模型保持统一，单 Agent 与多 Agent 委派复用同一套模型。存储：Session/Instruction/ToolCallRecord/Message 落关系库；AgentState 快照放 Redis 配版本号；Tool 定义放配置中心支持动态注册 MCP 工具。四个坑：领域模型绑死框架数据结构（框架只是运行载体）、State 塞满非结构化文本（快照巨大恢复慢）、指令无生命周期做不了超时提醒/取消/重派/委派失败回滚（"生产 Agent 与 Demo Agent 最核心分界线"）、工具定义与调用记录混在一起（Tool 全局统一管理权限/限流/版本，Record 归属会话用于审计/重试/回放）。这套模型自然长出的高级能力：断点续传、指令超时重试人工介入、工具审计回放、A2A 委派、基于 Instruction 目标的自动评测、记忆分层、tenantId 顶层过滤的多租户隔离。

### 017-Agent 架构设计 14：Checkpoint 断点快照与恢复服务（2026-10-21）
快照只存"驱动下一步执行的最小状态集"，三分法：永久归档数据（Session 主记录/Instruction/Message/ToolCallRecord——只追加不修改的事实流水，落库用于审计回溯评测，恢复时"读取"它们而非快照"保存"它们）、运行时快照数据（AgentState，Checkpoint 核心）、临时瞬时数据（流式输出缓存/工具大报文/token 缓存——绝对不存，可重新生成）。金句："日志用来看懂发生了什么，快照用来知道接下来该做什么。"四种标准触发时机（贴合指令生命周期）：计划生成后（PLANNING→EXECUTING，重启免重新规划）、单步工具调用成功后（最常用，回退不重复调工具）、人工介入暂停时（VERIFYING，释放运行资源，A2A 主管暂停子任务也用这类）、异常保护（重试前保存，失败不丢进度）；不推荐：每 token、每轮思考前、1~2 步短任务。支持自动快照+手动快照（API 人工干预）两种模式。CheckpointRecord 字段：checkpointId、sessionId、instructionId、version（同 session 单调递增自增整数）、stateSnapshot（AgentState 序列化，优先 Protobuf 减体积）、snapshotType（PLAN/STEP/MANUAL/ERROR_PROTECT）、status（NORMAL/DISCARDED）、createdAt、remark。值对象：SnapshotMeta（大小/耗时/变量 key 清单，用于监控清理）、RestoreContext（是否跳过已完成工具/是否重置重试计数器/恢复触发人）。不变性：快照只追加不覆盖；废弃标 DISCARDED 不直接删（保留排查）；不跨 Session/Instruction 复用。存储分层：热快照 Redis（key=sessionId:checkpoint:version）、冷快照超 7 天落对象存储/库大字段、每 Session 只保留最近 5 个有效快照定时异步清理。打快照流程：读 AgentState 过滤瞬时变量 → version+1 组装 → 写 Redis 热存储 + 异步落库（主链路只写 Redis 不被数据库拖慢，落库失败短期 Redis 仍可恢复）→ 写一条 System Message 流水（"已保存快照 version=3"）→ 继续执行。恢复流程：传 sessionId+targetVersion → 校验会话状态必须是 PAUSED/FAILED（已完成禁止恢复）→ 读 CheckpointRecord → 读历史 Message/ToolCallRecord 流水 → 重建运行时上下文 → 遍历快照后已成功的工具记录（幂等校验）→ Instruction 置 RUNNING → 从 nextStepHint 继续。DDD 优势：恢复逻辑不耦合 LLM 不耦合工具，本地 Agent 与 A2A Worker 一套通用。五个坑：快照与流水不一致（最终一致性，恢复时以数据库流水为准——"流水是事实源，快照只是辅助"）、无幂等恢复后重复执行（Tool 实体加幂等键配置+recordId 全局唯一，已成功直接返回缓存结果）、快照体积失控（大对象只存资源 ID 恢复时重拉；摘要单独存）、多分支并行恢复（一个 Session 同一时刻只允许一个活跃执行流，恢复前加分布式锁）、过期快照堆积（会话终态后延时清理任务）。能力边界：支持重启续跑/隔时暂停继续/回退重试/A2A Worker 中断恢复/快照回放复现 bug；不适合秒级短任务、纯流式对话、token 级回滚。框架自带 Checkpoint（LangGraph MemorySaver）适合 Demo，自研快照服务适合生产（与指令/租户/审计/A2A 打通），可"框架快照做开发调试，自研快照服务上线"。

### 018-Agent 架构设计 15：权限模型（工具/指令/租户隔离/MCP 鉴权）（2026-10-21）
与传统 RBAC 的差异：传统"用户→角色→资源"静态绑定长期有效；Agent 场景三层主体（租户/AgentCode/指令会话）且同一 Agent 处理 A 任务可查订单、B 任务不可——权限必须"基础静态权限+本次指令临时授权+调用时动态校验"。四层防线逐层校验、任意一层不过即拦截：租户隔离层（tenantId 顶层绑定一切，租户间工具/数据/会话完全隔离，不可突破的底线）→ Agent 基线权限层（AgentPolicy：policyId/tenantId/agentCode/allowedToolCodes（基线最大范围）/denyToolCodes 黑名单/permissionMode（ALLOW_LIST 白名单优先）/creator——长期静态）→ Instruction 指令临时授权层（InstructionGrant：grantId/instructionId/sessionId/allowedToolCodes（必须是基线子集）/expireAt（默认随指令生命周期）/grantSource（AUTO 自动裁剪/MANUAL 人工审批）/auditRemark；GrantStatus 枚举 EFFECTIVE/EXPIRED/REVOKED）→ MCP 网关鉴权层（工具侧兜底：Agent 不直连 MCP，先走网关，就算上层被绕过还能拦住非法调用）。口诀："租户划边界、Agent 定上限、指令收范围、MCP 做兜底。"值对象 ToolPermissionClaim 权限凭证（每次调用携带、序列化传给 MCP 网关）：tenantId/sessionId/instructionId/agentCode/toolCode/grantId/claimSign 签名防篡改。AuthResult 五枚举：PASS/DENY_TENANT/DENY_AGENT_POLICY/DENY_INSTRUCTION_GRANT/DENY_MCP_AUTH（区分拒绝原因便于审计）。校验链路九步：建 Session/Instruction → 读 AgentPolicy 基线 → 按指令内容自动裁剪生成 InstructionGrant（拿不准进人工审批）→ LLM 输出 tool_call 后、真正发起 MCP 请求前框架侧前置拦截（不在 grant 清单直接拦截不发起调用——关键设计：后置校验浪费 token 且模型仍会生成越权请求）→ 放行的组装 Claim 签名 → MCP 网关验签+二次核对 grant → MCP 服务内部再做数据行级权限（只能查本租户数据）→ 结果返回同时生成权限审计日志绑定 ToolCallRecord → Instruction 完成自动撤销 InstructionGrant。A2A 权限传递：主管下发子 Instruction 同步生成子 InstructionGrant，子授权只能是主管当前 grant 的子集，主管可随时撤销子任务授权立即拦截 Worker 后续工具调用——防权限沿委派链无限放大。MCP 鉴权两方案：MCP 网关（生产首选，MCP 原生服务不改代码，统一收口验签/查授权/租户校验/限流/审计）、MCP 服务内置鉴权中间件（自建少量工具，transport 层解析 claim，缺点每个服务重复开发）；明确反对静态 Token（长期有效、泄露风险大、无法绑定 session/指令做细粒度回收）。六个坑：只在前端/上层校验无 MCP 兜底、临时授权超基线（代码强制校验子集关系）、授权不回收（指令完成/取消/会话终止主动标 REVOKED + expireAt 兜底）、权限日志缺失（每次调用无论放行拒绝都记审计日志，关联 tenantId/sessionId/instructionId/agentCode/toolCode/结果/操作人，绑定 ToolCallRecord）、A2A 全量下放权限、策略热更新（已存在 Instruction 沿用授权快照，新指令才读新策略）。两场景：只读工具自动授权、写类工具强制人工审批（读写分离的授权策略）。

### 019-Agent 架构设计 16：限流熔断降级排队调度（2026-10-21）
先分清保护三类资源：LLM 推理资源（成本高/配额/并发上限/流式长占通道；控并发推理数与 token 速率）、MCP 工具资源（异构、水位独立、部分不支持高并发；按工具维度独立限流，一个工具故障不拖垮其他）、调度引擎自身（任务有状态可恢复、长任务占 worker；控活跃会话数防内存线程连接池耗尽）。与传统限流的本质差异：Agent 任务可以排队、暂停、延后，不是"来了就处理超了直接拒绝"；核心原则：短任务优先调度、长任务隔离排队、故障链路快速熔断、流量按租户/Agent 类型配额隔离。调度上下文三实体（与 Session/Instruction 解耦，经 instructionId 关联）：AgentQuota（quotaId/tenantId/agentCode/maxActiveSession/maxLlmConcurrency/tokenPerMinute/queueCapacity/queueTimeout/priorityMode（NORMAL/SHORT_FIRST）；约束：租户配额是顶层上限，租户内所有 Agent 并发总和不得超租户全局配额）、TaskQueueItem（queueItemId/instructionId/sessionId/priority（数字小优先级高）/taskType（SHORT/LONG）/enqueueAt/expireAt/status（PENDING/RUNNING/CANCELLED/EXPIRED））、CircuitBreakerRecord（resourceType（LLM/MCP_TOOL）/resourceKey（模型名/toolCode）/state（CLOSED/OPEN/HALF_OPEN）/failureThreshold/resetTimeout/lastFailureAt）。溢出策略枚举 QueueOverflowPolicy：REJECT 直接拒绝/DISCARD_LOW_PRIORITY 丢低优先级/BACKPRESSURE 返回排队告知由上游选等待或取消。调度七步：新 Instruction 统一入调度层 → 校验租户+AgentQuota → 资源足直接分配 worker 置 RUNNING → 满则封装 TaskQueueItem 进优先级队列 → 调度中心持续消费取最高优先级启动 → 执行中每次调 LLM/MCP 单独走独立限流+熔断校验 → 结束释放配额；排队超时自动标指令失败写消息流水通知用户。与 Checkpoint 联动是排队能落地的关键：排队中/被暂停调度的任务保留快照，调度到它时从快照恢复续跑，否则排队等待没有意义。A2A 场景：子任务进 Worker 侧调度队列，配额归属 Worker 所在租户，主管可设子任务优先级，Worker 熔断打开时回报主管选择重试/换方案/人工介入。四层限流由粗到细：租户全局（活跃任务+总 token 速率）、Agent 类型（写操作 Agent 配额收紧）、LLM 模型（按模型分并发池）、MCP 工具（每 toolCode 独立并发上限）；避坑：不能只限请求次数，必须加 token 速率限流（少量超长 prompt 就能打爆月配额）。熔断三态机：CLOSED 统计失败率→达阈值 OPEN 直接拒绝不再请求→冷却结束 HALF_OPEN 放少量探测→成功回 CLOSED 失败回 OPEN；两种触发分开：MCP 工具熔断（超时/业务异常/连接失败计入；熔断后所有要调该工具的 Agent 被拦截，调度层可选降级）、LLM 推理熔断（连续超时/5xx/配额耗尽）；粒度必须按资源隔离，A 工具熔断不影响 B 工具。降级五方案（绑定在 Quota 配置可全局开关或按 AgentCode 配置）：能力降级（禁高风险慢工具只留只读）、模型降级（主模型熔断切备用低成本模型）、策略降级（关自动工具调用转人工）、简化计划降级（放弃分步规划改简化方案）、拒绝降级（强一致任务不许降级，排队或返回繁忙）。重试控制：指数退避、区分可重试错误（网络/超时可，权限拒绝/参数错误禁）、重试上限且重试占配额、熔断期间禁止重试。七个坑：长任务不隔离饿死短任务（长短任务独立 worker 池分开配额）、排队无上限（队列上限+溢出策略）、熔断全局一把锁（按 toolCode/模型独立实例化）、排队任务无过期控制（expireAt+消费前判断+支持主动撤销）、配额只控并发不管 token（并发+token 速率双限流）、熔断恢复瞬间流量冲击（半开探测+限流平缓释放不一次放行）、与 Checkpoint 脱节（入队前打快照，队列项绑定快照版本号）。典型场景：配额最大活跃 10/LLM 并发 5/短任务优先，来 12 个任务则 10 跑 2 排队；订单工具连续超时熔断打开后所有调用该工具的 Agent 被拦截可选降级提示；完成一个释放配额取最高优先级短任务；排队超 15 分钟自动超时失败通知用户。

### 补-8 个州联手起诉 OpenAI（2026-10-16，B_extra，非连载）
新闻评论文章，与 Agent 工程无直接关系。2026-10-14 美国 8 个州总检察长分别在本州法院协同起诉 OpenAI：指控一为虚假宣传（宣称 ChatGPT 对青少年安全、默认适龄防护，实际护栏不稳定）；指控二为生成有害内容的现实风险（自伤引导、危险医疗指导、强化偏执妄想、极端场景协助策划暴力、讨好式设计拉长青少年使用时长）。OpenAI 回应已有分年龄防护、主张行业统一监管。三个解读点：责任边界重构（不能拿"AI 会幻觉"当免责金牌，宣传了安全就要承担对应承诺责任）、监管从事后删内容转向事前产品设计管控（讨好式对话设计、青少年防护有效性纳入合规审查）、上市前夕重大变量。对行业启示：安全宣传必须客观、未成年人保护将成为 AI 产品硬性合规门槛、护栏永远存在被绕过的可能。对 SwarmStudio 的间接关联：平台宣传口径与实际防护能力要对账；面向未成年/敏感人群的输出防护与审计留痕是合规硬需求。

## 二、作者方法体系总览

### 整体架构图景（分层 + 演进路线）

作者的全景是一套"从 Demo 到生产"的五层递进体系，16 篇连载正好是逐层补齐：

1. **认知与选型层**（001-003）：Agent=LLM 决策+循环执行+工具+记忆+状态控制的工程系统；能简单不复杂；框架只是载体，选型看语言/目标/团队/可维护性。
2. **单 Agent 引擎层**（004-007）：消息四角色流转 → 三层记忆（短期/摘要/向量）→ ReAct+Plan&Solve 循环（max_steps 兜底）→ 状态持久化与断点续传（一步一存、冷热分离、状态机枚举）。
3. **容错与运维层**（008-010）：异步三通道（轮询/回调/MQ）+ 人工卡点（HUMAN_CONFIRM 作为一等 Action）+ 重试（临时/永久错误分治+指数退避+callId 幂等）+ 降级（业务预定义不交给 LLM）→ 可观测四支柱（日志/指标/追踪/成本，统一 traceId 标签）→ 评测三指标组+三层数据集+LLM 裁判+CI 基线阻断。
4. **多 Agent 协作层**（011-015）：四架构模式（主管+执行优先）→ 三层通信结构（传输/总线/应用协议；MQ 管可靠投递、A2A 管语义互通）→ A2A 四实体（AgentCard/Task/Message/Artifact）与 JSON-RPC 接口 → 生态选型（官方 SDK/框架原生/网关/低代码插件）→ A2A+MCP 上下层搭档（Supervisor --A2A--> Worker --MCP--> 工具，MCP 独立部署中台化）。
5. **领域架构层**（016-019，DDD 收口）：AgentSession 聚合根 + Instruction/Message/Tool/ToolCallRecord/AgentState 六实体 + 值对象 → Checkpoint 服务（流水与快照分治、四触发时机、版本化追加、热冷分层、幂等恢复）→ 四层权限防线（租户隔离/Agent 基线/指令临时授权/MCP 网关兜底，A2A 委派权限收缩传递）→ 限流熔断降级排队（三类资源分治、四层限流、按资源隔离熔断、五类降级、与 Checkpoint 联动的排队调度）。

演进路线本身也是方法论："轻量工具型 → 规划型 → 多 Agent"从简到繁；"先手写最小 Demo 搞懂底层，再上框架"；"框架快照做开发调试，自研快照服务上线"；"Demo 先自研消息体，规模上来再迁 A2A"。

### 反复强调的铁律

1. 能简单就不要复杂：单 Agent 能稳定完成的不上多 Agent；一问一答不上 A2A；固定工作流用框架内置工具调用。
2. 一步一存：每个 ReAct 步骤/工具调用完成即双写状态，不等任务结束批量保存。
3. max_steps 兜底 + 成本告警双保险：防死循环、防 token 失控（一夜账单）。
4. 幂等贯穿始终：callId/recordId/messageId 三级去重（工具调用/断点恢复/消息消费）。
5. 错误分治：临时错误可重试（指数退避），永久错误立即终止；降级方案由业务规则预定义，禁止交给 LLM 自主决策。
6. 日志与状态分治、流水与快照分治："日志看懂发生了什么，快照知道接下来做什么"；流水是事实源，快照只是辅助。
7. State 只存结构化机器可读数据，LLM 思考文本放 Message；大对象只存资源 ID。
8. 前置拦截优于后置拦截：LLM 输出 tool_call 之后、发起 MCP 请求之前做权限拦截。
9. 权限只能收缩不能放大：指令授权 ⊆ Agent 基线；A2A 子授权 ⊆ 父授权；指令结束权限回收。
10. 按资源隔离做熔断限流：A 工具熔断不影响 B 工具；并发限流必须配 token 速率限流。
11. 组件封装 ≠ 可靠性：A2A SDK/框架只给协议外壳，持久化/幂等/重试/死信/鉴权/隔离永远要自己搭。
12. 统一标签贯穿可观测与评测：traceId/taskId/sessionId/userId/agent_version 全链路携带；裁判模型版本必须固定。

### 避坑点汇总表（坑 | 根因 | 治法）

| # | 坑 | 根因 | 治法 | 出自 |
|---|---|---|---|---|
| 1 | 把"循环执行"当"万能自主"，Demo 上线翻车 | 对 Agent 能力预期过高 | 降预期；max 轮次+状态校验+关键业务人工校验 | 001 |
| 2 | Demo 能力当生产能力 | 官网 Demo 隐藏异常场景 | 选型时区分两者；补超时/格式错/失败/Token 超限处理 | 002 |
| 3 | 频繁切换框架浅尝辄止 | 每个只跑 HelloWorld | 吃透一套再换；原理相通 | 002 |
| 4 | 本机裸装环境污染 | 版本冲突、环境不一致 | Docker Compose 一键启停+volume 持久化 | 003 |
| 5 | 工具描述含糊模型不选工具 | 描述质量决定调用正确率 | 写明能力/适用场景/参数含义 | 004 |
| 6 | 模型输出 JSON 带杂文本直接解析 | LLM 输出不稳定 | JSON 提取+异常捕获+参数校验+重试 | 004 |
| 7 | 工具结果不放回消息上下文 | 缺少 tool 消息回填 | 结果包装成消息追加分组再二次请求 | 004/006 |
| 8 | 全部记忆塞向量库 | 三类记忆边界不清 | 短期 Redis、摘要压缩、向量只存跨会话知识+元数据过滤 | 005 |
| 9 | 会话数据无 TTL 无限堆积 | 无过期策略 | Redis TTL+单 session 消息长度上限 | 005 |
| 10 | 摘要丢关键数字/约束 | 摘要 prompt 不设要求 | 明确保留数字、约束、关键实体；留最近 2-3 轮原文 | 005 |
| 11 | ReAct 无结束条件/无 max_steps | 缺循环保护 | Final Answer 规则+代码解析结束动作+强制步数上限 | 006 |
| 12 | 计划与执行脱节 | 执行时不回看计划 | 每步把当前计划+已执行步骤发给 LLM 对照 | 006 |
| 13 | 持久化只存对话不存执行状态 | 误把日志当现场 | 存消息+计划+进度+工具历史+步数+中间结果+状态机 | 007 |
| 14 | 只写 Redis 不落库 | 热缓存当主存储 | 数据库为断点恢复唯一可信源，冷热分离 | 007 |
| 15 | 用文本判断任务进度 | 无标准状态枚举 | PENDING/RUNNING/WAIT_HUMAN/PAUSED/COMPLETED/FAILED 状态机 | 007 |
| 16 | 断点恢复重复执行工具 | 无幂等 | 每次调用唯一 ID+执行前查记录 | 007/008/017 |
| 17 | 状态保存时机靠后 | 批量保存丢最新步骤 | 一步一存，每步 Redis+库双写 | 007 |
| 18 | 异步回调不恢复完整现场 | 只存工具结果不存上下文 | jobId 关联 taskId，回调时完整读现场 | 008 |
| 19 | 人工确认绕过 ReAct 硬编码结果 | 破坏推理链路 | 用户决定作为新消息追加上下文，LLM 继续推理 | 008 |
| 20 | 无脑重试永久错误 | 不分错误类型 | 错误码分类+黑名单；401/403/参数错/业务校验不过禁重试 | 008/019 |
| 21 | 降级交给 LLM 自主决策 | 模型不稳定不可控 | 降级规则代码/配置预定义，LLM 只执行 | 008 |
| 22 | 状态机非法流转 | 状态变更不落库不校验 | 每次变更持久化+读取时校验合法性 | 008 |
| 23 | 埋点无统一 traceId | 日志指标无法关联 | 全埋点强制 traceId/taskId/sessionId/userId | 009 |
| 24 | 日志不脱敏 | 隐私泄露 | 入库前过滤器自动替换敏感字段 | 009 |
| 25 | 只监控 LLM 忽略工具/状态机 | 观测面不全 | 全链路：工具失败率、状态卡死、人工堆积、token 死循环成本告警 | 009 |
| 26 | 告警风暴 | 阈值过低无降噪 | 合理阈值+持续时间判断+冷却+P0/P1/P2 分级 | 009 |
| 27 | 评测集全是简单样例 | 无边界负向场景 | 加参数缺失/模糊/错误指令/工具失败/多轮复杂 | 010 |
| 28 | 裁判模型打分漂移 | 换裁判分数整体偏移 | 固定裁判模型版本；同 case 多次取平均 | 010 |
| 29 | 数据集不更新 | bug 修复不回灌 | 线上新 bug 修复后场景加入回归集 | 010 |
| 30 | 评测环境与线上不一致 | 版本/工具/提示词漂移 | 环境尽量一致，仅隔离业务数据 | 010 |
| 31 | 强行上多 Agent | 收益小于复杂度成本 | 对照适合特征判断；单 Agent 能完成就不拆 | 011 |
| 32 | Agent 间闲聊轮次失控 | 通信设计差 | 结构化消息、传完整上下文、仅关键节点同步 | 011 |
| 33 | 把 A2A 当 MQ 替代品 | 混淆层级 | A2A=应用协议层，MQ=总线层，组合使用 | 012 |
| 34 | 消息重复投递重复计算 | 至少一次语义无幂等 | messageId 去重+消费记录表+死信队列 | 012 |
| 35 | 混淆 Message 与 Task | 概念不清 | Message 是对话消息；Task 是委派作业，内含多轮 Message | 013 |
| 36 | 大段业务文本塞 Task 字段 | 忽略 Artifact | 产物独立放 Artifact 便于存储/下载/复用 | 013 |
| 37 | 随意扩展 Task 自定义状态 | 破坏异构互通 | 用 A2A 原生 status 枚举 | 013 |
| 38 | 以为 A2A SDK 自带可靠性 | 组件只做协议外壳 | 持久化/幂等/重试/死信/鉴权/隔离自建 | 014 |
| 39 | Spring AI 与 Spring AI Alibaba A2A 能力混淆 | 生态认知错误 | Spring AI 原生支持；Alibaba 需 AgentScope+Nacos | 014 |
| 40 | 拿 A2A 调数据库 / 拿 MCP 做协作 | 协议职责错配 | A2A 管委派生命周期，MCP 管工具调用 | 015 |
| 41 | MCP 与 Worker 同进程 | 耦合导致扩容/管控难 | MCP Server 独立部署中台化 | 015 |
| 42 | 工具细节通过 A2A 外传 | 违反分层封装 | 主管只关心业务结果，工具封装在 Worker 内 | 015 |
| 43 | 领域模型绑死框架数据结构 | 模型与载体不分 | DDD 模型独立，框架只是运行载体 | 016 |
| 44 | State 塞满非结构化文本 | 思考日志混入状态 | Message 存文本，State 只存结构化变量+摘要快照 | 016 |
| 45 | 指令无生命周期 | 无 Instruction 实体 | 独立实体管理 PENDING~REJECTED 流转，支撑超时/取消/重派/回滚 | 016 |
| 46 | 工具定义与调用记录混写 | 全局能力与执行流水不分 | Tool 全局实体管权限限流版本；Record 归会话管审计回放 | 016 |
| 47 | 全量消息塞快照 | 快照体积爆炸恢复慢 | 三分法：流水归档/最小状态集入快照/瞬时数据不存 | 017 |
| 48 | 快照与流水不一致 | 双写失败 | 最终一致性，恢复时以数据库流水为准 | 017 |
| 49 | 多分支并行恢复 | 无会话锁 | 一 Session 一活跃执行流+分布式锁 | 017 |
| 50 | 快照无清理 | 存储无限膨胀 | 每 Session 留最近 5 个，DISCARDED 延时清理 | 017 |
| 51 | 权限只在上层校验 | 无工具侧兜底 | Agent 前置拦截+MCP 网关双层校验 | 018 |
| 52 | 临时授权超基线 | 无子集校验 | 代码强制 allowedToolCodes ⊆ AgentPolicy | 018 |
| 53 | 授权不回收 | 指令结束权限残留 | 终态主动 REVOKED + expireAt 兜底 | 018 |
| 54 | A2A 全量下放权限 | 委派链权限放大 | 子授权=父授权子集，可随时撤销 | 018 |
| 55 | 静态 Token 调 MCP | 长期有效无法细粒度回收 | 签名 Claim 凭证绑定 session/instruction/grant | 018 |
| 56 | 长任务饿死短任务 | 调度池不分 | 长短任务独立 worker 池分开配额 | 019 |
| 57 | 排队无上限无过期 | 队列膨胀内存打爆 | 队列上限+溢出策略+expireAt+主动撤销 | 019 |
| 58 | 熔断全局一把锁 | 未按资源隔离 | 按 toolCode/模型独立实例化熔断器 | 019 |
| 59 | 只限请求不限 token | 超长 prompt 打爆配额 | 并发+token 速率双限流 | 019 |
| 60 | 熔断恢复瞬间冲击 | 堆积任务一次放行 | 半开探测+限流平缓释放 | 019 |
| 61 | 排队与快照脱节 | 调度起来无法恢复 | 入队前打快照，队列项绑定快照版本号 | 019 |
| 62 | 安全宣传超出实际防护 | 合规风险（OpenAI 诉讼启示） | 宣传口径与防护能力对账；敏感人群输出防护+审计留痕 | 补 |

## 三、对 SwarmStudio 的可借鉴清单

对照 SwarmStudio 现状（已有：kanban/matrix 派发、A2A、工具契约缺 inputSchema/outputSchema/authRule、图检查点+恢复建议器、七档权限+审批域+执法门、评测域、run-trace/obs-signals、token 预算；空白：无统一 Instruction 实体（5 套局部状态机）、无通用 LLM/MCP 限流熔断、多协议委派无统一回执账本、无租户隔离主体面、记忆无三层显式模型）：

**P1（直击已知空白）**

1. **统一 Instruction 指令实体收敛 5 套局部状态机**（来自 016）。建立 Instruction 实体：instructionId/sessionId/content/goal（结构化目标）/status（PENDING→PLANNING→EXECUTING→VERIFYING→DONE/REJECTED）/plan/deadline/retryCount/assignee，把现有 5 套局部状态机映射为该实体的字段与流转，一次性获得任务超时提醒、取消、重派、委派失败回滚能力——作者称之为"生产 Agent 与 Demo Agent 最核心分界线"。落地：在 overlay 的领域模型层新建 Instruction 聚合，各派发入口（kanban/matrix/A2A）改为创建 Instruction 而非各自维护局部状态。
2. **AgentState 结构化四件套 + checkpointVersion**（来自 016/017）。AgentState 只存 memorySnapshot（摘要快照）/variableMap（业务中间变量 KV）/nextStepHint/checkpointVersion 四类结构化数据，LLM 思考文本一律进 Message；大对象只存资源 ID 恢复时重拉。落地：把现有图检查点的 state 负载按此四字段重构 schema，检查点体积与恢复速度立竿见影。
3. **限流熔断降级排队四件套（调度上下文三实体）**（来自 019）。新建 AgentQuota（tenantId/agentCode/maxActiveSession/maxLlmConcurrency/tokenPerMinute/queueCapacity/queueTimeout/priorityMode）、TaskQueueItem（priority/taskType SHORT-LONG/expireAt）、CircuitBreakerRecord（resourceType LLM-MCP_TOOL/resourceKey/state CLOSED-OPEN-HALF_OPEN），四层限流（租户/Agent 类型/LLM 模型/MCP 工具）+ 并发与 token 速率双限流 + 按资源隔离的熔断 + 溢出策略枚举（REJECT/DISCARD_LOW_PRIORITY/BACKPRESSURE）。落地：作为独立调度域模块接入现有 token 预算体系，把预算从"只记账"升级为"记账+执法"；入队前打快照、队列项绑定 checkpointVersion，与现有图检查点联动。
4. **A2A 委派统一回执账本**（来自 012/013/017）。以 Task（submitted/working/completed/failed/cancelled）+ Artifact（artifactId/title/type/content）+ messageId 幂等去重消费记录表为骨架，建立多协议委派的统一回执账本：任何协议（A2A/内部派发）的委派都登记为一条 Task 记录并产出 Artifact，恢复/审计/评测全部读这本账。落地：在派发域增加 TaskLedger 表，A2A 与内部派发适配器统一写入。
5. **租户隔离主体面**（来自 016/018/019）。tenantId 作为顶层主体贯穿：Session 聚合根带 tenantId、AgentQuota 租户全局配额为顶层上限、AgentPolicy 绑定 tenantId、ToolPermissionClaim 携带 tenantId、MCP 网关做租户行级校验。落地：给现有权限域与工具策略增加 tenantId 维度过滤，作为所有数据与工具访问的第一道 where 条件。

**P2（补强现有能力）**

6. **Tool 契约补 inputSchema/outputSchema/authRule/幂等键**（来自 016/017/018）。Tool 全局实体字段清单：toolId/toolCode/name/description/inputSchema/outputSchema/authRule（权限标签）/timeout/rateLimit/retryPolicy/provider（MCP 地址或本地函数标识）+ 幂等键配置；ToolCallRecord 会话内实体：recordId/sessionId/instructionId/toolId/inputArgs/output/status（INIT/RUNNING/SUCCESS/ERROR/TIMEOUT）/cost/costTime。正对 SwarmStudio 已知的契约缺口。
7. **Message senderType/messageType 分类**（来自 016）。senderType 五枚举 USER/LLM/TOOL/SYSTEM/AGENT_PEER + messageType 五枚举 TEXT/TOOL_CALL_REQUEST/TOOL_CALL_RESULT/ERROR/NOTICE + payload 结构化 + tokenUsage 值对象。落地：统一 run-trace 与会话消息的 schema，检索/过滤/成本统计不再解析文本。
8. **四层权限防线 + 前置拦截 + Claim 凭证**（来自 018）。在现有七档权限+执法门之上叠加：AgentPolicy 基线（allowedToolCodes/denyToolCodes）→ InstructionGrant 临时授权（必须 ⊆ 基线，grantSource AUTO/MANUAL，指令终态自动 REVOKED+expireAt 兜底）→ LLM 输出 tool_call 后、发起请求前的前置拦截 → ToolPermissionClaim 签名凭证经 MCP 网关二次校验；AuthResult 区分 DENY_TENANT/DENY_AGENT_POLICY/DENY_INSTRUCTION_GRANT/DENY_MCP_AUTH 便于审计。A2A 子授权=父授权子集、可随时撤销。
9. **Checkpoint 触发时机四型 + 流水/快照分治 + 存储分层**（来自 017）。在现有图检查点上增加 snapshotType（PLAN/STEP/MANUAL/ERROR_PROTECT）四型触发；明确 Message/ToolCallRecord 为只追加事实流水（恢复时读取而非快照保存）、AgentState 为最小状态集、流式缓存绝不入快照；热快照 Redis（sessionId:checkpoint:version）+ 异步落库 + 每 Session 保留最近 5 个 + 恢复时以流水为准 + 分布式锁防多分支并行恢复。
10. **记忆三层显式模型**（来自 005）。短期（Redis 完整消息数组+TTL+单 session 长度上限）/摘要（超阈值如 15 轮触发 LLM 压缩，保留最近 2-3 轮原文，摘要 prompt 明确保留数字/约束/实体）/向量长期（跨会话知识+元数据过滤，检索结果手动拼 prompt）；上下文长度校验超阈值自动触发摘要。
11. **评测域补执行路径指标与回归集回灌**（来自 010）。在七维/考卷快照/LLM 裁判之外补：工具调用正确率/平均推理步数/无效动作率/人工介入次数四项路径指标；线上新 bug 修复后强制回灌回归集；完成率降超阈值（如 3%）CI 阻断发布。
12. **容错分支类型化**（来自 008）。工具结果类型枚举 SYNC_SUCCESS/ASYNC_SUBMITTED/TEMP_ERROR/PERM_ERROR/PARTIAL_RESULT 驱动主循环分支；taskState 扩展 retryMap/failedTools/asyncJobMap/humanConfirmStatus/degradeRecord；人工确认面板五要素（目标/已完成步骤/下一步动作/依赖数据/业务影响+驳回意见框），用户决定作为新消息回注而非硬编码改结果。

**P3（工程细节与长期项）**

13. **可观测补状态机变更/降级/断点恢复事件埋点**（来自 009）。现有 run-trace/obs-signals 之外补六类事件中的缺口（状态机变更、降级、断点恢复事件），agent_version 标签随埋点携带以支撑版本对比；Langfuse 式单任务详情与聚合大盘分工。
14. **A2A 领域契约统一**（来自 013/016/018）。委派消息用标准 Task/Message/Artifact 结构，不自造扩展状态；AgentCard 增加 capabilities/endpoint/authentication 字段规范能力发现；主管可动态发现新增 Worker 而不改核心代码。
15. **限流熔断与降级的五类降级策略**（来自 019）。能力降级（禁高危慢工具留只读）、模型降级（主模型熔断切低成本备模）、策略降级（转人工）、简化计划降级、拒绝降级（强一致任务排队或繁忙）；降级开关绑定 Quota 配置，可全局或按 AgentCode。
16. **重试与熔断互斥规则**（来自 019）。重试占配额、熔断 OPEN 期间禁止重试、半开阶段只放探测请求、指数退避 2/4/8/16s 上限 3~4 次——写进工具契约 retryPolicy 的执法逻辑。
17. **安全宣传与防护能力对账**（来自 B_extra）。平台对外宣称的权限模式/审批/隔离能力需与实测防护一致并留审计日志，参考 OpenAI 被诉教训：宣传了什么安全承诺，就要能拿出对应机制与留痕。
18. **"框架快照调试、自研快照生产"的双轨策略**（来自 017）。SwarmStudio 的恢复建议器可沿用此定位：图检查点（框架层）保开发调试，领域 CheckpointRecord（自研层）保生产恢复，两者经 checkpointVersion 对齐。
