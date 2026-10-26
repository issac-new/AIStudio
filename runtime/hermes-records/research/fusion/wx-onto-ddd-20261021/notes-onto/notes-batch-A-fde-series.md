# 批A：《解剖 Palantir FDE》系列 16 篇机制清单（orchestrator 亲读，2026-10-21）

批次综述：系列主轴文，机制密度极高。核心是一条贯穿的方法论：FDE=组织级反向传播（Human Backpropagation），Ontology 与 FDE 一体两面（Ontology 明线建模世界，FDE 暗线理解世界）。1-9 篇讲思想与项目方法，10-16 讲 Bootcamp/定制平衡/回流/招聘/培养/考核/案例。叙事有重复但机制点扎实。

## 机制清单

### M-A1 Human Backpropagation（组织级反向传播）
- 来源：2247509853-1(FDE01), 2247509905-1(FDE02), 2247509915-1(FDE03)
- 解决什么问题：软件公司与真实世界之间的信息衰减——问题经 5-6 层组织转译变成干净的 Feature Request，真上下文全丢
- 机制本体：客户现场=Loss Function；软件上线=Forward Pass；现场误差=Loss；FDE 不传需求传「梯度」（误差+原因+共性结构）；循环=现实→误差→FDE→抽象→产品原语→平台→新现实。关键指标是循环速度（一次有效学习要多久），不是开发效率
- 依附语境：需要「能改变产品的前线工程师」存在；总部平台能承接回流
- 映射：**等效印证**——forward-deployed-protocol.md 前线侦察+reportDelivery 已覆盖「感知」半环；flywheel skill 已覆盖「回流」半环。增量=「误差信号→梯度（共性结构）」的抽象要求，可作语义补充
### M-A2 判据：第十个客户更容易交付
- 来源：FDE01, FDE11, FDE12
- 解决什么问题：怎么判断组织在积累软件复利还是在重复人力
- 机制本体：第一个项目 3 个月、第二个 1 个月、第十个只做配置=平台在学习；同题第二次部署时间 Time to Second Deployment + Reuse Ratio（项目产出被下个项目直接调用的比例）两个指标
- 映射：**收缩吸收候选**——集群 TTVV（ttvv-report.py）已测 Time-to-Validated-Value；增量=「同类任务第二次完成时间」这个维度可并入 TTVV 月报做同型任务对比，无需新基建
### M-A3 三层学习循环
- 来源：FDE03
- 机制本体：L1 项目内（构建→使用→反馈→修改）；L2 项目间（多个 FDE 重复碰到→模式→组织资产）；L3 平台层（手写能力→标准模块→工具链→平台原语）。循环速度是核心竞争力
- 映射：**等效印证**——flywheel 飞轮（挖掘 frequency≥3→提案→落地）就是 L2→L3 的机制化；L1=kanban 单卡内迭代
### M-A4 Echo-Delta-Dev 三力闭环
- 来源：2247509969-1(FDE04)
- 机制本体：Echo（发现价值/Translation，值不值得做）、Delta（实现价值/build，能不能做成）、Dev（沉淀能力，one capability many customers）三角色有意重叠；三问：解决什么问题/怎么真跑起来/下次怎么不从零开始。角色重叠防「重要问题没人完整关心」
- 映射：**等效印证+增量**——集群 orchestrator≈Delta 后方编队、worker=Delta 前线、skill 库维护=Dev；增量=集群缺「Echo 职能」的显式化（判断哪张卡值得派=Dispatch-worthiness 已有雏形）；「三种力量缺一退化」诊断句可用作集群体检：失客户直达→变研发、失工程能力→变咨询、失产品回流→变实施
### M-A5 权责匹配：Outcome+Authority+Problem Framing Authority
- 来源：2247509978-1(FDE05)
- 机制本体：对结果负责的人必须有：①问题定义权（有权说这需求不值得做）②方案设计权（边界内自主）③跨产品调用资源权。组织公式=强治理弱流程（治理定边界不可破，流程不预定怎么干）。「从前线发现重复问题到平台改变中间隔多少人」组织健康指标。平台治理（权限/审计/回滚做进平台）越强，组织越敢放权
- 映射：**等效印证**——worker 在卡内有完全执行自主权（workspace 隔离）；验收冻结=强治理；「隔多少人」→集群里=「worker 发现模式→flywheel 提案→落地」链长，已有 skill-mining-weekly 机制化。增量=「问题定义权」对 worker 的显式授权（现在 worker 遇卡描述不清时 block 而非重新定义，可讨论）
### M-A6 项目启动链与 Minimum Viable Decision Loop
- 来源：2247509992-2(FDE06)
- 机制本体：Mission（可判成败的现实目标）→ Workflow（真实的人怎么干活，含隐性知识）→ Data（只接闭环需要的最少表）→ Ontology（从 Workflow 长出）→ Application/Agent → Action（写回真实系统+权限/审批/审计/回滚）→ Outcome（决策结果回捕进本体形成反馈）→ Feedback。MVDL=真实用户基于系统上下文做出一次真实决策+执行真实 Action+看到结果，闭环发生一次项目才跨线。第一里程碑=第一个真实用户做出更好决策
- 映射：**等效印证**——集群每张卡=tracer-bullet 垂直切片（窄而完整端到端可验证）即 MVDL 同构；验收冻结=Mission 可判成败。增量=「Outcome 回捕」——卡完成后业务效果回流的显式环节弱，evals 哨兵部分覆盖
### M-A7 第一周五步现实压缩
- 来源：2247510000-1(FDE07)
- 机制本体：D1 追真问题（不介绍产品）；D2 找 Operator 不只 Stakeholder、观察真实工作流（Excel/微信/小表格=候选 Workflow）；D3 数据反驳直觉（访谈与数据必须碰撞）；D4 丑原型制造认知冲突（目的=暴露错误非获认可）；D5 真实 Workflow 对齐+值不值得继续的判断。指标=认知收敛速度（100 种可能→3 个假设）
- 映射：**等效印证**——forward-deployed-protocol 前线侦察四件套≈D1-D3 的 headless 版。增量=「侦察的目的是收敛假设数量」这个显式目标，侦察摘要可加「剩余待验证假设」字段
### M-A8 Problem Framing：决策点诊断法
- 来源：2247510007-1(FDE08)
- 机制本体：客户给的是解决方案假设非问题；向下追因果链到「可干预点」（足够接近结果+软件能改变）；真问题在异常里（关键问句：「什么时候你会不按系统建议做？」）；「看完以后准备做什么」一问杀伪需求；好问题定义的标准=能自然导出下一步行动；症状≠原因≠约束三层分离。AI 越强 Problem Framing 越重要（How 便宜了，What 稀缺）
- 映射：**吸收候选**——集群卡 body 常直接给「方案」而非「问题」；grilling 技能有拷问但偏需求澄清。增量=「异常探针」问句与「决策点」框架可入 rd-clarify/grilling 的弹药库
### M-A9 现实编译路径：Problem→Workflow→Object→Property→Relation→Logic→Action→Security→Executable World
- 来源：2247510010-1(FDE09)
- 机制本体：Object 成立标准=业务人员认识并操作的现实对象（不是数据库表改名）；Ontology 从 Workflow 生长「好的 Ontology 是用出来的」；Logic=企业经验第一次进入软件（老师傅判断规则外显化为规则/模型/约束）；Action=企业的动词（名词+动词才成运营系统）；Agent 需要的是 World Model 不是知识库；企业 Ontology 终态=企业 Runtime
- 映射：**核心增量面**——ontology.md 需对读：集群 ontology-shapes.yaml 是否含 Logic/Action/Security 三个决策件还是仅数据语义件（待批 C 汇总后核对）。这句「Agent 的世界模型」直接支撑 hermes 的 SOUL+skill 体系定位
### M-A10 Bootcamp 压缩机与 Time to Truth
- 来源：2247510014-1(FDE10)
- 机制本体：五合一压缩（销售/需求发现/架构设计/POC-生产距离/用户培训同时发生）；架构经验性确定（Defining Architecture Empirically）；Use Case Filter：伪场景四型=数据不存在/频率极低/无 Action/组织不愿变；Time to Truth（知道解决的是不是正确问题要多久）>Time to Demo
- 映射：**等效印证**——spike 技能（throwaway 实验验证想法）+verify-prd（fail-fast）≈Bootcamp 精神；seed 机制五条路线文已吸收。增量=「伪场景四型」可作为派工前 dispatch-worthiness 判据
### M-A11 Maintainable Customization：定制放在正确的层
- 来源：2247510017-1(FDE11)
- 机制本体：表层（应用/工作流/Agent）高度定制，底层（数据/权限/治理/运行时/Primitive）高度统一，Ontology 承载企业差异；标准化的是 Product Primitive 不是最终软件；好定制=下一代标准产品的训练数据；判断外包化指标=客户越多平台越强还是越乱
- 映射：**等效印证**——集群分层=SOUL(角色)+_shared(治理)+skills(能力)+workspace(实例)；SOUL 禁内嵌模板全文防第二事实源=同一哲学。增量=「skill 沉淀频率 vs 一次性卡」可作集群健康指标
### M-A12 Field to Product 回流机制
- 来源：2247510024-1(FDE12)
- 机制本体：（集群已有等效 fusion-field-to-skill-flywheel——Use Case Pull/Asset Review 三分法/失败回流/TTVV/六层上下文/三层边界全表已落）。增量仅两处：①通用结构句「Event→状态变化→约束更新→决策计算→人工确认→Action 执行→结果反馈」②Agent Primitive 拆法 Context/Event/Effect
- 映射：**等效印证**（增量并入报告不重复落地）
### M-A13 招聘画像：Agency 与 Ambiguity
- 来源：2247510027-1(FDE13)
- 机制本体：七个能力=Agency（无人给下一步时让事情向结果移动）、Ambiguity 容忍、改变观点的经历（自我认同不建立在「我必须正确」）、Problem Solving 非 Feature Building、高带宽 Translation、Learning How to Learn（知识获取速度>知识存量）、Intrinsic Motivation（结果驱动任务）、Ruthless Goal Orientation（不被产品既有边界束缚）
- 映射：**等效印证**——worker SOUL 已有偏差清单/压力升级 L0-L4（换本质不同方案=Ambiguity 行动力）；四论四问=判断函数。增量少，报告引用即可
### M-A14 培养体系：真实世界即训练
- 来源：2247510030-1(FDE14)
- 机制本体：Apprenticeship 非课程（基础训练 Know What/Mentor Know Why/项目 Know How/复盘 Judgment）；Mentor 传思考顺序非答案（问：当前最大风险是什么/只验一个假设验哪个）；Ownership Radius 为晋升标尺（跟着做→独立闭环→独立定义问题→训练他人）；高质量问题密度决定成长速度；抽象迁移=行业名词→Object/State/Relation/Constraint/Decision/Action/Outcome；伦理隐私治理训练
- 映射：**等效印证+增量**——集群 profile 分工（orchestrator 带 worker）+failure-mode-playbook 案例库=师徒制材料。增量=「Ownership Radius」可作为 profile 能力演进标尺写进 agent-profile-lifecycle；「伦理/隐私训练」对应 mandatory-privacy 已有
### M-A15 考核体系：Outcome 双向+判断质量
- 来源：2247510033-1(FDE15)
- 机制本体：Outcome>Output（改变什么>做了什么）；双向=客户 Outcome+Platform Outcome（有没有让下次同类问题更容易）；Time to Value；真 Adoption=用户行为改变（非登录数）；判断质量（选哪个需求/何时挑战何时妥协/留项目还是进平台）；Agency=面对阻力问题仍向前移动；反英雄主义（Collaboration=降低组织对自己的依赖，每个项目都不可替代=组织风险）；Growth=问题半径；张力目标平衡（五对矛盾让人判断而非消灭）；禁过早百分制（团队会优化分数不优化价值）
- 映射：**吸收候选**——集群收卡验收已机械命令化（好），但「Platform Outcome」维度弱：卡完成时 metadata.findings 有，但「这次解决让下次同类便宜了多少」无显式字段。增量=complete metadata 可加 reuse_note
### M-A16 五案例同构与方法迁移
- 来源：2247510041-2(FDE16)
- 机制本体：陆军/Airbus/NHS/铁路/制造五案例行业全异但结构全同（Problem→Workflow→Data→Ontology→Decision→Action→Outcome）；工业 AI 公式=Prediction→Prioritization→Resource Allocation→Action（只有 Prediction=报警器非 AI）；组织记忆=系统积累「过去做过什么 Action+产生什么 Outcome」；从窄处切入深处扩张（先深后宽）；行业能力=快速建模陌生行业（首次进入铁路不识 Turnout，但识别出 Asset-State-Failure-Action-Resource-Budget 骨架即迁移）
- 映射：**等效印证**——「窄而完整」=tracer-bullet 已是集群拆卡纪律。增量=「组织记忆」概念支撑 hindsight_retain 的 case 库价值叙事

## 批 A 三条最重要发现
1. FDE 方法论在集群的融合度已很高（forward-deployed-protocol+flywheel 两大等效物覆盖了感知与回流两个半环）——本批真正的增量在「指标层」：Time to Second Deployment/Reuse Ratio/认知收敛速度/隔多少人/Ownership Radius，这些是集群尚未显式化的度量维度
2. 「Ontology=企业 Runtime，Agent 需要 World Model 不是知识库」是全系列技术核心论断，直接对应 hermes 的 SOUL+ontology+skill 分层——集群 ontology-shapes.yaml 需核对是否含 Logic/Action/Security 决策件（批 C 后定论）
3. Echo 职能（判断什么值得做）在集群是空位：Dispatch-worthiness 有雏形但「伪场景四型+决策点诊断+异常探针」这套 Problem Framing 弹药未机制化——最好的落点是把 M-A8/M-A10 的判据并入派工前检查
