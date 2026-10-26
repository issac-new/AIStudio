# 批D：本体建设治理与竞对 17 篇（orchestrator 亲读，2026-10-21）

批次综述：两条线。①本体建设方法论（Databricks 六层/MVO/Gartner/四点思考）——讲怎么建；②竞对格局与 FDE 产业化（Palantir vs Databricks vs 微软、全球 FDE 竞赛、FDE 1.0-4.0）——讲产业走向。对 hermes 的价值在方法论对照与「Designed vs Discovered Ontology」这组关键区分。

## 机制清单

### M-D1 Databricks 六层建设法
- 来源：2247509755-1
- 机制本体：Layer0 数据基础（Entity Resolution 先行：「现实世界里到底有几个客户」先于建模）→L1 Metadata（第一消费者从人变 Agent，描述给机器不给人）→L2 Semantic Model（指标/维度/关系/同义词）→L3 上下文资产（从 SQL/Dashboard/Agent 行为自动提取，authority score 评可信度：来源/使用频率/新鲜度）→L4 Governance→L5 Evaluation。起点是业务运行不是本体建模项目
- 映射：**核心增量**——authority score 机制=「知识可信度=来源权威×使用频率×新鲜度」可直接转译为 hindsight 记忆与 skill 的评分手法（learning-lifecycle confidence 公式已有 upvoted/recalled/recency 三因子，同构印证；「来源权威」维度是其增量）
### M-D2 Designed vs Discovered Ontology 双路线
- 来源：2247509703-1（本体决战，本批最重要）
- 机制本体：Palantir=Designed（人工/AI 辅助显式建模，贵但稳，SuperRepo 支持 Ontology-as-Code 在 TypeScript 声明对象/关系/接口/动作）；Databricks=Discovered（从 SQL/Dashboard/Agent 使用痕迹反向学习企业语义，「让 AI 观察企业然后从数字痕迹中学习世界」）；Palantir 建 Operational Model（企业允许发生什么），Databricks 先建 Context Model（AI 该信什么）
- 映射：**集群路线判定**——hermes 是混合态：SOUL/_shared=Designed（人裁决写入），hindsight/kanban 历史=Discovered（沉淀自然发生）。flywheel 的「挖掘 done 卡 frequency≥3」正是 Discovered 路线！集群已双轨并行，报告里给这组命名即可
### M-D3 Gartner：确定性护栏（deterministic guardrails）
- 来源：2247509791-1
- 机制本体：Agent 可以概率，边界不能概率；「这人有权限批 500 万付款吗/订单交付完了吗/这动作允许吗」必须确定性约束（模型不许猜）；架构从 Data→RAG→LLM 变为 Data→Ontology→Model→Agent→Action；「给 Agent 知识→给 Agent 一个世界」
- 映射：**强印证**——hermes 验收命令冻结/kanban 状态机/markings=确定性护栏的实践；clef 本地决策守门=确定性小决策面。报告引用 Gartner 背书
### M-D4 本体治理三命题（语义共享/行动语义协议/可信本体）
- 来源：2247509624-1
- 机制本体：语义碎片化是企业真病（数据共享本质是语义共享）；多智能体网络交换的不是数据而是「可理解、可验证、可执行的行动语义」——本体成为新一代 AI 通用语义协议；可信 AI 建立在可信本体上（不是模型对齐而是业务规则+权限+流程约束建模）
- 映射：**印证**——hermes 跨 agent 协作走 kanban 卡（行动语义：状态机+验收+markings）而非裸消息，正是「行动语义协议」实践。SOUL ontology 三段契约=语义协议已接线
### M-D5 MVO 最小可用本体
- 来源：2247509724-1
- 机制本体：一开始建全企业本体=瀑布思想必败；MVO=从任务出发问「Agent 完成这项业务最少必须理解什么」（Viable 比 Minimum 重要：用最小认知范围支撑真实业务闭环）；本体从数据出发改为从工作任务出发
- 映射：**强印证**——tracer-bullet 垂直切片（窄而完整）+「能拆成 2-3 张依赖卡优先拆卡」=MVO 同构；集群从未试图一次建全 ontology-shapes。报告引用
### M-D6 数据引力三段论
- 来源：2247509697-1
- 机制本体：Data Gravity（数据聚→计算/应用/开发者聚）→Workload Gravity（Databricks：计算被数据吸住）→Semantic/Ontology Gravity（Palantir：业务定义沉淀后迁移=重建企业认知体系）；「最强的锁定是新需求默认在这里发生」
- 映射：**集群自察工具**——hermes 的引力面=kanban 历史库+hindsight+skill 库（新任务默认读这些）；报告引用作「集群资产引力」自察视角
### M-D7 模型层→工作流层主战场迁移
- 来源：2247509481-1
- 机制本体：企业不缺模型缺执行体系；「AI 是否真正进入业务/拥有行动能力/能闭环」取代准确率成为核心指标；企业软件边界消失（Agent 横向穿透）；未来企业软件最大价值=企业上下文
- 映射：**背景印证**，无独立增量
### M-D8 中国公司三条启示
- 来源：2247509237-1
- 机制本体：功能交付→决策闭环（Agent 不能调 API 产生法律/财务后果就隔一层皮）；Bootcamp 先用后买；安全即产品（卖审计追踪不卖性能）
- 映射：弱增量，报告一句带过
### M-D9 观远案例：Metric-centric vs Object-centric
- 来源：2247509992-1
- 机制本体：BI 世界观=指标中心（发现异常→解释→建议→任务→跟踪指标恢复），决策智能=对象中心（现实世界由对象/关系/状态/事件/约束/规则/行动组成非指标）；从 Data→Info→Insight 到 Data→Context→Reasoning→Decision→Action→Feedback；路径依赖风险（最成功的产品定义能力边界）
- 映射：**自察镜**——hermes 评测体系偏 metric（evals 通过率），但 kanban 卡=对象（有状态机/关系/动作）——集群天然对象中心，评测是指标面。此对照写报告
### M-D10 联邦式 FDE（1+N+M）
- 来源：2247509832-1
- 机制本体：总部能力中心（底座/方法论/标准）+N 个专业域 FDU（工程+架构+领域跨职能小队）+M 个嵌入式前线；「总部知道共性，现场知道真相」；关键不是下沉是回流
### M-D11 顶级 FDE 画像与 FDE 1.0-4.0
- 来源：2247509822-1, 2247509818-1
- 机制本体：第一能力=定义问题非解决问题（模糊世界→结构化世界）；业务建模能力（读懂企业）；产品+架构+工程三合一；演进：1.0 工程师出总部→2.0 AI 部署=业务重构（Engineering→Context 转移）→3.0 FDE=组织（FDU）→4.0 FDE 做成 AI 产品（AI FDE GA）
- 映射：印证，与批 A 招聘画像合并引用。FDE 4.0=AI FDE 对集群镜像=「worker 干活 orchestrator 验收」已是常态；下一步「Agent 建 Agent」=skill_manage 由 worker 自建 skill 已在发生
### M-D12 全球 FDE 竞赛六路线
- 来源：2247509815-1
- 机制本体：Palantir（FDE=产品进化机制+AI FDE GA+Agent 建 Agent）、OpenAI（垂直行业 FDE 连接前沿模型与真实世界反馈）、Anthropic（经 DXC 外包复制）、微软（Account-Aligned FDE 绑定战略客户）、Databricks（独立 FDE 组织）、IBM（FDU 跨职能单元）；顶级 FDE 全球仅约 2000 人；「客户问题→现场工程→产品能力→平台升级→更复杂问题」飞轮为 Palantir 特有
- 映射：**产业背景**，写报告引言。顶级 FDE 稀缺性 ↔ 用户单人管 50 agent 的杠杆逻辑互证
### M-D13 空壳
- 2247509389-1（业务孪生，len=237 空壳），跳过

## 批 D 三条最重要发现
1. Designed vs Discovered Ontology 双路线（M-D2）是判定集群本体策略的最佳框架：hermes 已是混合双轨（SOUL=Designed，flywheel 挖 done 卡=Discovered），无需改道，报告命名即可
2. Databricks authority score（M-D1）与集群 learning-lifecycle confidence 公式同构，缺「来源权威」因子——若后续做记忆评分手升级可参照
3. Gartner deterministic guardrails（M-D3）给集群「验收命令冻结+状态机+markings」体系提供权威外部命名与背书，值得写进设计文档
