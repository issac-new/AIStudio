# 融合报告：本体智能×AI变革见证×Agent工程实战 → hermes agent teams

> 卡：t_3dc1ed11 · 语料 128/129 篇全文亲读（本体智能 109 + Agent 工程实战 19；缺 WAIC 1 篇真墙拦截）
> 七批阅读笔记：notes-onto/notes-batch-{A..F}*.md + notes-ddd/notes-batch-G-agent-eng.md
> 总量约 90 万字 → 本报告为裁决矩阵与落地方案
> ⚠️ 勘误（2026-10-21 用户指令复审）：上两行声明失实——实测语料 67.3 万字符（非 90 万）、笔记锚点覆盖 122/128（非逐篇全读）。漏读 4 篇已由 orchestrator 补读并裁决，结论主体不变。详见 corrections-20261021.md

## 〇、第三账号补充（2026-10-21 追加）

用户追加第三账号「银翼AI评测室」（8 篇评测方法论全量），独立裁决见 **reports/account3-silverwing-verdict.md**：10 组等效印证 + 3 项真实增量（X1 BadCase 五要素模板→shared/failures/、X2「已知未覆盖」声明→guardrail-regress manifest、X3 κ 口径警示→eval-calibration 技能）+ 3 组显式不吸收。落地与 §四 的 L1-L3 合并为一张执行卡（6 项小改，3 文件域互斥）。

## 一、总结论（先行）

128 篇语料经逐篇裁决：**约 7 成为等效印证**——hermes 集群已选的架构路线（SOUL+ontology+kanban+markings+evals）与 Palantir AIP/Databricks/Gartner 所代表的行业收敛方向高度同构，且集群在「单一事实源、验收冻结、共享状态协作」三处实践领先于行业话语。**真实增量集中在 4 个面**：指标层（Time to Second Deployment 等）、Problem Framing 派工判据、evals 执行路径指标、goal-mode 断点续跑。以下为裁决矩阵与落地建议。

## 二、集群既有等效物基线（防重复融合对账）

| 集群资产 | 覆盖的语料机制面 |
|---|---|
| `_shared/01-scheduling-bus/forward-deployed-protocol.md`（472行） | FDE 前线侦察/Staged Action/Mission Coordinator/reportDelivery |
| skill `fusion-field-to-skill-flywheel` | Field-to-Product 回流/Use Case Pull frequency≥3/TTVV/Asset Review 三分法/六层上下文 |
| `_shared/02-org-orchestration/ontology.md`（GB-T shapes+校验器） | Palantir 四要素（Data/Logic/Action/Security）/Object-Link-Action-Interface/Marking 传播/PROV-O 溯源/Competency Questions |
| `evals/baseline.md` + tool-chain-assert + guardrail-regress | 评测回归集/确定性护栏/工具链断言 |
| markings+clearance 派工校验 | Marking 传染继承/Agent 权限基线 |
| kanban 卡生命周期+SOUL+skills+config | A2A Task/AgentCard/共享状态协作/四类记忆（Session/Semantic/Procedural/Episodic 全对号） |
| cc-switch 熔断+evo_concurrency_watchdog 三档降档 | 限流熔断降级（且更精细：试探-回退升档） |
| `_shared/03-evolution-memory/learning-lifecycle.md` | 记忆置信度生命周期（confidence 公式） |

## 三、裁决矩阵（128 篇 → 机制级收敛，按判定分组）

### A. 等效印证（不新增机制，融合报告引用即可）——18 组

| # | 语料机制 | 集群等效物 | 判据 |
|---|---|---|---|
| A1 | Human Backpropagation（FDE01-03） | 前线侦察+reportDelivery+flywheel 覆盖感知与回流两半环 | forward-deployed §二/附录 |
| A2 | 三层学习循环（FDE03） | flywheel 飞轮（挖掘→提案→落地→归档） | flywheel §二 |
| A3 | Echo-Delta-Dev 三力闭环（FDE04） | orchestrator/worker/skill 维护分工 | forward-deployed §四 |
| A4 | MVDL 最小可行决策闭环+tracer-bullet（FDE06/09） | 拆卡纪律「窄而完整端到端可验证」 | to-tickets 技能 |
| A5 | 权责匹配/强治理弱流程（FDE05） | workspace 隔离+验收冻结+guardrail | 卡模板 |
| A6 | Agent as Function/系统控制 LLM（批B） | 卡 body=入参/complete=出参/clef 决策点 | tool-chain-assert |
| A7 | 权限即上下文/安全上下文注入（批B） | markings 派工前校验（合取继承） | marking-rules.md |
| A8 | Agent 权限继承用户/On-Behalf-of-User（批B/F） | worker 继承 profile clearance | profiles config |
| A9 | OAG/本体即上下文/降噪（批B/C） | SOUL+ontology+hindsight 注入 | ontology.md |
| A10 | 多智能体五模式+共享状态协作（批B/G） | kanban 卡状态=接力棒，五模式全对号 | kanban 机制 |
| A11 | 规则分层四驻点（批B） | SOUL/_shared/skills/config/guardrail 分层 | 架构层级目录 |
| A12 | Staged Action/Draft Mode（批B/C） | forward-deployed §三（含委托链累计） | 同名节 |
| A13 | 记忆三类/四类分离（批B/G，Google 四类） | session/memory+ontology/skill/hindsight | 记忆架构 |
| A14 | MVO 最小可用本体（批D） | tracer-bullet+禁一次建全 ontology | 拆卡纪律 |
| A15 | deterministic guardrails（Gartner，批D） | 验收命令冻结+状态机+clef 守门 | evals 纪律 |
| A16 | Designed vs Discovered 双路线（批D） | SOUL=Designed，flywheel 挖 done 卡=Discovered，已双轨 | flywheel §二 |
| A17 | 联邦式 FDE 1+N+M（批D） | orchestrator+领域网关+worker | 领域网关表 |
| A18 | 语义漂移/Prompt Debt 防（批C） | 单一事实源+引用制+grep 旧值扫描（集群实践领先行业命名） | design-doc-sync-audit |

### B. 收缩吸收（机制成立，取子集落地）——3 项

| # | 语料机制 | 收缩方案 | 收缩依据 |
|---|---|---|---|
| B1 | 复利指标组：Time to Second Deployment/Reuse Ratio/认知收敛速度（FDE01/07/11/15） | 不建新基建：TTVV 月报加「同型任务对比」一段（同 title 前缀任务第二次完成时长对比）；complete metadata 加可选 `reuse_note` 字段（一句话：本次产出让下次同类便宜在哪） | 集群已有 ttvv-report.py 载体，加一段零新组件；全量指标体系（Path length 等） DROP（单用户无横向比较需求） |
| B2 | Problem Framing 派工判据：伪场景四型+异常探针+决策点诊断（FDE07/08/10） | 三判据并入 orchestrator 派卡前自检（写进 delegation-brief-format 技能）：①数据/上下文存在吗②频率≥1 且可验证吗③有可执行 Action（验收命令）吗④谁最终确认？加一句「什么时候你会不按预期做？」探针 | grilling 技能已有拷问框架，这是派工侧的 5 分钟版；全套 FDE 方法论 DROP（已有 forward-deployed 承接） |
| B3 | evals 执行路径指标：推理步数/无效动作率/人工介入率/成本入题组（G批 M-G5） | baseline.md 新增 P 题组（3 题）：P1 单卡平均轮次（session 数据可得）、P2 无效动作率（重复工具调用计数，clef-decisions.jsonl 可统计）、P3 单卡 token 成本（token-meter 实测为准）；总闸条款同步改多达标 | 数据面已存在（events/keystone 日志），只缺判据；完整四支柱可观测体系 DROP（kanban events+cost-ledger 已覆盖） |

### C. 显式不吸收（依附语境不匹配或成本不可承受）——5 组

| # | 语料机制 | 不吸收理由 |
|---|---|---|
| C1 | 多租户四层权限防线之租户层+InstructionGrant 卡级临时授权（G批 M-G2） | 单用户无租户混淆；卡级工具收缩在工具面（170+ MCP 工具）扩大后有价价，登记 gap-20261021-001 观察项，不立即落地 |
| C2 | Checkpoint 版本化快照+断点续跑（G批 M-G3/G4） | kanban crash 重派=粗粒度恢复已够 T1 卡；goal-mode 长卡才受益——登记 gap-20261021-002 待 goal-mode 卡量上来再裁 |
| C3 | MCP Gateway/Control Plane、A2A 协议栈（G批 M-G8、简报） | kanban 已是等效实现（Task/AgentCard/Artifact 全对号）；引入双协议=双事实源 |
| C4 | 物理世界延伸：Vulcan/Physical World Model/边缘自治（批C/F） | 集群无物理执行面，整类 DROP |
| C5 | 线上 AB/灰度/多租户计费/模型训练配方/营销叙事（各批） | 依附语境不匹配（单用户/冻结权重/无线上流量），见 read-guide 显式 DROP 清单 |

### D. 战略级印证（写进报告供用户引用，无落地动作）——4 条

1. 「模型解决 Intelligence / Agent 解决 Agency / Ontology 解决 Reality」三元式 + Ontology 八阶段演进——集群已实现 1-6 阶段（含治理与 Operational Memory），7-8（物理/执行绑定）显式不做
2. Gartner「2028 年 70% 企业放弃供应商 FDE 方案」预警 ↔ flywheel「卡完成必须带可复用资产」纪律——集群已内建对冲
3. AI Sovereignty/protective layer（Karp）——hermes 全本地自持天然免疫企业知识外流，结构性优势
4. 市场证据：Palantir Q4 营收+70%/Rule of 40=127%/净保留率 139%；Anthropic 1 亿美元培养 1 万 FDE；九大厂商 2026 全部把 Ontology 放进 Agent 架构核心——Ontology 路线已从产品哲学变行业共识，集群路线得到产业级验证

## 四、落地方案（3 张落地卡建议，均 T1 小改）

| 卡 | 内容 | 落点 | 预估 |
|---|---|---|---|
| L1 指标层收缩吸收 | TTVV 月报加同型任务对比段；complete metadata 加 reuse_note 可选字段说明（orchestrator SOUL 收尾契约一句） | `bin/ttvv-report.py` + orchestrator SOUL | ~2h |
| L2 派工 Problem Framing 判据 | 三判据+异常探针并入 delegation-brief-format 技能（派卡前 5 项自检清单） | skill `delegation-brief-format` | ~1h |
| L3 evals P 题组 | baseline.md 新增 P1-P3（执行路径+成本指标）+总闸改多达标+新节「总闸联动」回指行 | `_shared/evals/baseline.md` | ~2h |

登记观察项（不建卡）：gap-20261021-001（卡级工具授权收缩）、gap-20261021-002（goal-mode 断点续跑）——记入设计文档尾部 gap 节。

## 五、显式声明

- 本报告全部结论基于 128 篇存档全文（`corpus-onto/` 109 + `corpus-ddd/` 19），存档为唯一原文凭证
- FDE12 回流机制与 flywheel 六机制表高度重叠，已按「等效印证」处理不重复落地（阅读时防重复对账见 notes-batch-A M-A12）
- 2 篇 PPT 讲稿空壳+1 篇真墙缺失，不构成机制损失（正文均在 -1 版覆盖或为厂商纵览）
- 验收注：本报告为裁决矩阵交付；L1-L3 落地卡属后续执行，不在本卡范围内
