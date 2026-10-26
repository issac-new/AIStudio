# 批B：AIP 机制深潜 12 篇实质 + 2 篇空壳（orchestrator 亲读，2026-10-21）

批次综述：机制密度极高的一批，讲 Palantir AIP 平台内部构造。两条主线：①对象-变量-函数三层决策架构（把 LLM 装进企业确定性外壳）②权限即上下文（Agent 权限继承用户、索引层物理隔离）。大量机制与 hermes kanban/SOUL/markings 体系存在结构同构，可直接对读。

## 机制清单

### M-B1 对象-变量-函数三层架构
- 来源：2247509441-2
- 解决什么问题：LLM 概率智能与企业工程确定性的矛盾
- 机制本体：对象层=企业现实的稳定地址空间（身份/关系/权限继承/复用，追求少而稳主干 3-7 个对象类型先立）；变量层=决策充分统计量（KPI/状态/预测/参数/会话变量五类，严格区分持久业务变量/临时交互变量/预测场景变量三类防污染主世界）；函数层=可治理执行单元（确定性函数→LLM辅助函数→Agent-as-Function 三档顺序建设，顺序不要倒）。闭环=对象感知→状态压缩→逻辑推理→Action 执行→本体回写→治理指标再入决策
- 映射：**结构同构印证**——hermes 的 ontology-shapes.yaml≈对象层、memory/session≈变量层、skills+tools≈函数层。增量=「变量层」概念：集群 session 状态/scratch 变量缺「三类变量分离」纪律（场景预测变量不得污染持久层——对应 scratch 24h 清理已有，语义可显式化）
### M-B2 Agent as Function：系统控制 LLM
- 来源：2247509428-1
- 机制本体：把 Agent 包成函数接口（结构化入参→受控推理→结构化出参）；控制权反转 LLM controls system→System controls LLM（Workflow 决定何时调 Agent，Agent 在边界内工作）；输出从人读的答案变成系统可执行的数据；审计九记录（输入/过程/上下文对象/工具调用/输出/版本/权限/Action/写回）；五转化：聊天→函数、回答→执行、Prompt→契约、Agent自主→系统调度、AI能力→软件资产
- 映射：**核心吸收候选**——hermes worker 天然是「结构化契约」（卡 body=入参、kanban_complete summary+metadata=出参），但「系统控制 LLM」在集群的对偶=「验收命令冻结+guardrail 探针决定通过」，已有。真增量=「Agent 能力资产化」叙事印证 skill 库方向 + clef 决策点（System 决定何时调 LLM 判断）正是同款架构
### M-B3 AIP Analyst 与 Provenance 图
- 来源：2247509424-1
- 机制本体：在语义层不在数据层做分析；六套分析能力（描述/诊断/预测/异常/关联/决策）；关键机制=Provenance 有向图（节点=分析步骤[工具调用+参数+结果]，边=数据依赖；四用：追推理路径/审计转换/验证真实性/可重现）；分析分支（分叉探索路径互不干扰）
- 映射：**增量候选**——集群 worker 干活过程留痕在 kanban comments/events，但「结论→证据」的有向图（每个结论可追到具体文件/命令输出）无显式结构。output-contract 论断带锚点条款是其纪律版；Provenance 图是它的机械化升级，落点=evals 审计（worker-completion-independence-verification 已做「独立核验」，可引用 Provenance 概念补「证据链完整性」判据）
### M-B4 自然语言五级执行路径
- 来源：2247509411-1
- 机制本体：text2text(意图改写)→text2sql→text2API→text2tool→text2toolchain(工具链规划编排)；层级越低越确定、越高越需要编排；text2sql 的 Schema Linking（业务语言↔物理字段映射）是成败关键；SQL 校验闸（语法/存在/权限/风险/性能/敏感）
- 映射：**等效印证**——hermes 工具调用已是 native tool calling（schema 注册非 prompt 教学）；tool-chain-assert（P0-1 工具链断言机制）= text2toolchain 的验证面。增量少，报告引用
### M-B5 规则分层四驻点
- 来源：2247509362-1
- 机制本体：业务规则（Ontology computed property/状态机/Validation）、数据规则（Pipeline Filter/Transform）、行动规则（Automation WHEN/THEN）、权限规则（Policy WHO/CAN/CONDITION）分四地存放不混写；「不让你写规则代码，让你在业务界面里定义世界运行方式」
- 映射：**结构同构印证**——集群规则也是分层：SOUL（角色行为）/_shared（治理规则）/skills（领域方法）/config（权限工具面）/guardrail 探针（验收规则）。报告对读即可
### M-B6 Terminal 编译器模型
- 来源：2247509328-1, 2247509041-1
- 机制本体：LLM=词法/语法分析器（前端），Ontology Modeling Language=中间表示，真实 CRUD=目标代码；三保险：①元数据符号表绑定（用户有权限看的对象/属性/关系动态注入上下文，LLM 不面对空世界）②类型检查（幻觉属性立即报错 Order.Speed 不存在）③自动重试（报错喂回 LLM 修正直到符合 Schema）；写操作永不静默执行=Action 面板+人批准（类 Code Review）；RBAC 前置编译（无权限者上下文里根本看不到那个 Action API）；「填空不是创作」（基于 Schema 填空而非自由生成）
- 映射：**核心增量候选**——hermes 的对应面：工具 schema=符号表（已原生）；「权限前置到上下文构建」=marking clearance 派工前校验（已有）；真增量=①「类型检查+自动重试」闭环在集群=验收失败回环（失败输出喂回 worker 修正），当前 kanban request_changes 是人工速度，可机械化②「填空非创作」——卡 body 给足 schema 约束（验收冻结）即同理念，已在委派任务书格式
### M-B7 Marking+Policy 双层权限
- 来源：2247509065-1
- 机制本体：Marking 防（数据泄露，dataset 级，PII/VIP 标记，传染性=Transform 派生表继承标记）+Policy 用（业务视图，Ontology 行级 Object Security+列级 Property Security）；Agent 权限动态继承当前操作用户（Agent 无独立权限身份）；「没有 Marking 的 Policy 是脆弱空壳，没有 Policy 的 Marking 缺业务灵活性」
- 映射：**等效印证+增量**——hermes markings 体系（派卡 markings 合取继承+clearance 校验）正是 Marking 传染性思路！「Agent 权限继承用户」在集群=worker 继承 profile clearance。增量=「行级/列级」粒度区分对集群过细（DROP，单用户无此需求），但「派生继承」已实践。报告印证
### M-B8 安全上下文注入（权限优先架构）
- 来源：2247508982-1
- 机制本体：上下文构建权决定企业 AI 安全；权限优先=ACL 过滤发生在数据接触 LLM 之前（RLS 后只有 10 条进 Prompt，LLM 物理上看不到 9990 条→prompt injection 无法套取看不见的东西）；索引层过滤而非检索后过滤；安全写回=Side Effect Management（LLM 生成参数无执行权，Logic 层拦截验证写权限，高风险强制 HITL 弹预填表单）
- 映射：**核心增量候选**——集群已有：markings 校验在派工前（闸前）、prompt-injection-guard 技能（事后扫注入）。增量=「Agent 看不见的东西才安全」原则可用于 evals T 探针设计（越权读测试=给 worker 无 clearance 卡应 block 而非执行）——guardrail-regress 已有类似探针，印证为主
### M-B9 Ontology 扼杀幻觉（结构化降噪+沿袭）
- 来源：2247508937-1
- 机制本体：RAG 裸奔三病（结构丢失[chunk 间因果断裂]/上下文过载[噪声分散注意力]/不可解释）；Ontology 解法=意图解析→图谱遍历（沿关系找强关联对象）→只注入结构化事实（降噪）→在事实边界内生成；每个 Token 可回溯到 Object Record（引用实体而非文本段）
- 映射：**等效印证**——hermes worker 上下文=workspace+卡 body+hindsight 注入，已是「结构化事实」非向量检索；research-methodology 55 条检查=同一纪律。报告引用
### M-B10 记忆=OAG（本体增强生成）
- 来源：2247509260-1
- 机制本体：短期记忆=结构化应用状态（Logic 分块各自独立上下文窗口防注意力漂移+带权限注入）；长期记忆=对象化写回（学到新信息触发 Action 结构化写回本体，而非记在对话历史里；下次直接读对象属性）；「最好的长期记忆是把非结构化信息变成结构化数据」；记忆修正=外科手术式（直接改本体状态+人纠正作为少样本反馈）
- 映射：**核心印证+增量**——hermes 记忆分层正是同构：session=短期（会话历史）、memory/skill/hindsight=长期。skill_manage「写 lessons not logs」=「非结构化→结构化」同条款！增量=「写回动作触发」——hindsight_retain 由 friction-signal-capture 计分触发（已有机制化）；记忆修正「外科手术式」=memory governance 遗忘阶梯已有。高度等效
### M-B11 多智能体协作五模式
- 来源：2247509178-2
- 机制本体：串行链（本体状态变化=接力棒）/主从分发（Router 意图识别）/执行-质检对抗（Actor-Critic 循环至通过）/异步并行（结果汇聚到同一本体对象供汇总）/人机协同（人=特殊智能体，纠正作为反馈数据）；核心洞察=「基于共享状态而非消息传递的协作」——Agent A 写本体，Agent B 看状态变化接力，省掉 API 对接与 Prompt 传上下文
- 映射：**核心增量候选**——kanban 卡=共享状态面（worker A complete 写卡，worker B 从 parent handoff 读）正是「共享状态协作」！五模式对号：主从=orchestrator 派工、串行=parents 依赖链、并行=互斥 assignee 扇出、质检对抗=reviewer/蓝军卡、人机=needs_input block。五种在集群全有机制化落点——本条价值=「印证集群编排架构与 Palantir 同构」+「Ontology 是协作通用语」可引为 SOUL ontology 三段契约的佐证
### M-B12 空壳 2 篇
- 2247509065-2、2247508982-2：PPT 讲稿正文空（len=237），跳过（正文在 -1 版已覆盖）

## 批 B 三条最重要发现
1. 「权限即上下文/上下文构建权决定安全」与集群 markings+clearance 前置校验完全同构——Palantir 用 20 年企业实践验证了 hermes 已选的路线，互证价值高
2. 「共享状态而非消息传递」的多智能体协作（M-B11）是 kanban 编排的最强外部佐证：本体状态=接力棒 ↔ 卡状态=接力棒，五模式在集群一一对号
3. 真增量集中在两处机械面：①验收失败回环自动化（Terminal 自动重试 ↔ request_changes 人工速度）②Provenance 证据链机械化（结论→文件→命令输出的有向图审计）——两者都是 evals/验收侧小改，无新基建
