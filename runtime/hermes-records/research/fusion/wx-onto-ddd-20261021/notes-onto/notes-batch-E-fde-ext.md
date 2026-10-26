# 批E：FDE 扩展与前瞻 12 篇（orchestrator 亲读，2026-10-21）

批次综述：Palantir 产品演进线（Ontology+AI FDE+Agent 合流、AIP Evolve、FDA）+ 6 期本体智能简报（意外高质量，每条「判断+决策建议」结构）。核心增量=AI 维护 AI 闭环（Agent 探索/人治理/Evals 证明/Branch 隔离风险四件套）与本体锁定风险论。

## 机制清单

### M-E1 三线合流：Ontology+AI FDE+Agent
- 来源：2247509780-1
- 机制本体：Ontology=Agent 运行环境；AI FDE=建设和修改 AI 系统本身（普通 Agent 用系统，AI FDE 改系统）；AIP Evolve 调度一组 AI FDE Agents 持续进化系统；路径 Data→Ontology→Agent→Action→AI FDE→Evolve；企业形成两类硅基员工（业务型+建设型），共享同一 Ontology
- 映射：**集群对号**——业务型=worker（coder/researcher/tester），建设型=platform-skill-miner/skill_manage 链路；两类共享 SOUL+ontology+skill 底座。结构已同构，报告引用
### M-E2 AIP Evolve：AI 维护 AI 闭环
- 来源：2247509779-1
- 机制本体：给定优化目标（降成本/提 Eval 分）→一组 Agent 分析系统→建测试样本→修改模型/Prompt→跑 Evaluation→与 Baseline 比较→形成 Proposal→人审 Merge；实证：GPT-4o→5.4 Mini+2 个 Guardrail 修改，10 测试全过，成本降 65%；四件套分工「Agent 探索、人治理、Evaluation 证明、Branch 隔离风险」；企业最值钱的不是模型而是测试集+评价标准+业务约束+Ontology+权限体系
- 映射：**核心增量候选**——集群对应面：evals/baseline.md=测试集与评价标准、guardrail-regress=回归闸、kanban proposal+人审（R3 gate）=Proposal 闸。缺的机械面=「模型/Prompt 替换实验的自动化对比跑分」（time-based-model-downgrade 是定时降级非优化实验）。收益中等，登记 gap 不强推
### M-E3 FDA：Agent 接管 FDE
- 来源：2247509778-1
- 机制本体：FDE 解决软件公司与客户最后一公里，FDA 解决 AI 系统与真实业务最后一公里；三阶段：人进企业建软件→Agent 进企业参与业务→Agent 建设维护 Agent 运行的系统；「行业开始复制它上一代方法时，它已把上一代方法交给 Agent」
- 映射：**印证**——集群 skill 沉淀（flywheel）就是「把上一代方法交给可复用资产」；skill_manage 由 worker 自建=Agent 建 Agent 雏形
### M-E4 AI FDE 开发运维中枢
- 来源：2247509675-1
- 机制本体：横跨数据/本体/应用/Agent 工程+平台运维五面；「执行—观察—修正—再执行」闭环；默认不碰生产主干（Global Branch/PR 隔离验证，人审后合并）；无 Ontology 的 AI FDE 退化为通用 Agent（不知订单状态机/不知审批级/不知修改影响面）；AIP Evals 评价方式含精确匹配/关键词/数值范围/字符串距离/自定义函数/LLM 裁判
- 映射：**强印证**——hermes worker=AI FDE 完全同构：workspace=Branch 隔离、验收命令=Evals、kanban_complete 人审链=PR 合并、ontology_refs/skill=业务语义。Evals 评价方式六种 ↔ baseline.md 题型对照可引用
### M-E5 本体锁定论（Constellation Research）
- 来源：2247510041-1
- 机制本体：本体锁定=语义模型依赖+业务规则依赖+运行环境依赖三重叠加，比数据锁定深（数据可导出但业务知识不可运行）；本体承载 Action 后迁移≈重建业务执行系统；「企业可能法律上拥有本体定义，技术上却被运行环境锁死」；开放标准（RDF/OWL/SHACL/Ossie）解决语义交换但解决不了执行可移植
- 映射：**集群自察**——hermes 自建自持无厂商锁定（SOUL/skill/kanban 全本地），但同款风险在「对特定模型/Provider 的依赖」（cc-switch 统一=自建控制面，模型白名单可换）；报告一句自察即可
### M-E6 简报高价值条目集（6 期合并）
- 来源：2247509978-2, 2247510007-2, 2247509969-2, 2247509915-2, 2247509905-2, 2247509853-2, 2247509832-2
- 机制/情报要点（对 hermes 有直接关联的）：
  1. **Anthropic 1 亿美元培养 1 万名 FDE（Frontier Academy，2027 底）**——FDE 从岗位升级为产业能力建设；AWS 十亿美元级 FDE 组织；Accenture+Google 1000 人 FDE 队
  2. **Gartner 警告：到 2028 年 70% 企业放弃供应商 FDE 构建的 Agentic AI**（成本/维护/无自主能力）→FDE 合同必须含 Ontology/Skill/Agent 资产沉淀率+客户自主运营率+退出机制——**知识转移必须成为验收条件**。对集群镜像：worker 交付必须含可复用资产（skill/机制），不是只有「活干完了」——flywheel 已内建
  3. **Google Gemini Agent 四类记忆：Session/Semantic/Procedural/Episodic**——任务状态/结构化知识/工作方法/历史经验四分。对集群：session=Session、memory+ontology=Semantic、skill=Procedural、hindsight case 库=Episodic——集群四类全有且已分层！强烈印证
  4. **Google 硅基员工独立身份**（独立邮箱/存储/权限）——Agent Identity/Role/Memory/Skill/Permission 统一对象模型。对集群=profile 体系（config/SOUL/skills/clearances）已是此模型
  5. **Uber MCP Gateway**：团队各自建 MCP Server→工具重复/发现难/碎片化→统一 Control Plane（Registry/Gateway/鉴权/监控/Policy）。对集群=cc-switch 统一代理+tool_search 统一目录同构
  6. **CDO 职责从管理数据到管理 Context（Context Curation）**——Agent 基于过期报价执行 Action，问题不在模型在 Context。对集群=卡 body/context 注入质量是 orchestrator 主责
  7. **Process Context 数据**：86% 认为 Process Context 缺失 Agent 难可靠运行；有 Process Context 企业成功率高 5 倍；仅 22% G2000 有端到端流程实时可视。→派卡时给足流程上下文=成功率的 5 倍杠杆，报告引用
  8. **Apache Ossie 开放语义标准**（Microsoft+Google 支持）——语义可移植性赛道启动；对集群无直接动作，跟踪即可
  9. **Databricks Skill 进 Unity Gateway**：Skill 从个人 Prompt 变成企业可发布/授权/复用软件资产——skill 库方向印证
- 映射：上述 9 条多数为「印证集群已选路线」，唯 Gartner 70% 弃用警告与四类记忆值得进报告主体

## 批 E 三条最重要发现
1. AI 维护 AI 四件套（Agent 探索/人治理/Evals 证明/Branch 隔离，M-E2）是 RSI 方向的 Palantir 实证版——集群 evals+R3 gate+workspace 隔离已具全要件，缺自动化对比实验一层
2. Gartner「70% 企业将放弃供应商 FDE 方案，除非知识转移成为验收条件」（M-E6.2）——直接支持集群「卡完成必须带可复用资产」的 flywheel 纪律，并预警：只按「任务完成」收卡的集群会重蹈 70% 覆辙
3. Google 四类记忆（Session/Semantic/Procedural/Episodic）与集群 session/memory+ontology/skill/hindsight 四层完全对号——外部顶级实验室的记忆分类学反向验证了集群记忆架构的完备性
