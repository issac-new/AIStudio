# ontology.md 学术设备档案（2026-09-08 教条排查移出）

> 来源：`_shared/02-org-orchestration/ontology.md` @ commit f8b24ec：L157-228（§一-bis）、L262-276（§一-bis-3）、L278-291（§一-bis-4） | 排查证据：research/2026-09-08-dogma-audit-findings.json 条目 4/5/6
> 移出原因：三段均无运行时消费方（grep bin/scripts/skills/cron 零命中；表段自称的季度复审 cron、ValueChain 周报产物、蓝军门实体解析实例均不存在），违反「契约层只放活机制」原则。执行卡：kanban t_4eb5ebc3。
> 复查条件（每段各一行，条件出现时回迁正文）：
> - §一-bis Process Types/ValueChain：首个真实 Process 由 orchestrator 非测试路径创建时回迁
> - §一-bis-3 OntoClean 元性质审计表：出现真实复审脚本+cron 消费时回迁
> - §一-bis-4 同一性标准：CQ12 回归脚本接入同一性判定时回迁

---

## §一-bis Process Types（原文 @L157-228，逐字节保留）

## 一-bis、Process Types（流程级对象，2026-08-21 增补，融合自麦肯锡智能体驱动型组织框架）

> 任务级对象（Task/Artifact/Decision/Finding）承载单卡生命周期；流程级对象承载**跨卡价值链**——从触发到交付的端到端周期。无流程级对象则无法度量端到端价值（麦肯锡 J1：AI 转型基本单元是端到端业务流程，不是单点工具）。

### Process（流程实例）

一个 Process 由一串有依赖关系的 Task 组成，承载端到端价值链。

| 属性 | 类型 | 说明 |
|------|------|------|
| id | string | `proc-<slug>-<date>` |
| name | string | 流程名（如"用户需求→功能交付"） |
| trigger | enum [user_request, scheduled, event, manual] | 触发源 |
| tasks | Task[] | 组成任务（含 parents 依赖链） |
| value_chain_stage | enum [intake, decompose, execute, verify, deliver, retrospect] | 当前阶段 |
| baseline_metrics | dict | 基线指标（见下） |
| markings | Marking[] | 继承自 tasks（合取 AND） |

**分工**：Process 由 orchestrator 创建管理（在 kanban_comment 中标记流程归属），worker 只见 Task。

### 产能三指标（麦肯锡 J2：关注经营产能而非压缩成本）

| 指标 | 计算 | 用途 |
|------|------|------|
| 端到端周期 | trigger→deliver 的 wall-clock 时间 | 流程健康度（超阈值=瓶颈） |
| 任务吞吐量 | 单位时间 done 任务数（按 board/profile 分） | 产能基线 |
| 瓶颈环节 | 各 stage 停留时间最长者 | 优化指向（哪个环节拖慢价值链） |

### ValueChain（价值链视图）

跨 Process 的聚合视图：按 value_chain_stage 统计各阶段停留时间、失败率、返工率。由 ops-eval 周报生成。

### FDE 资产复利双指标（2026-09-01 FDE 融合 GAP-1 **提案·试运行**，来源：前沿部署工程14/17）

> ⚠️ **状态声明（2026-09-01 复盘修正）**：本节为规则**提案**，非已生效机制。生效条件：`~/.hermes/bin/asset-compound-metrics.py` 采集脚本跑通并首次输出 7 板双指标真实数字之前，本节仅为口径定义。此前版本误标「已落地」，已按诚实性复盘修正。

> 来源：微信公众号「战略增长引擎体系」《前沿部署工程》系列文14「本体复用率 + 交付周期压缩率」双数字判据、文17「复用率 ≥30%/60% 阶梯」。核心理念：**判断一套本体/规则/skill 体系是否真实产生复利，只看两个数字，不看建了多少对象**。

| 指标 | 计算 | 数据来源 | 达标线（对齐文17 阶梯） |
|---|---|---|---|
| **复用率** | 新 Process 中引用既有 ontology_objects/skill/rule 的占比 | `processes.baseline_metrics.reuse_rate`；ops-eval 月报统计 | 首季度 ≥30%，成熟期 ≥60% |
| **周期压缩率** | 同类 Process 第 N 次周期 vs 首次周期的 wall-clock 比值 | `processes` 表 created_at→updated_at + stage 停留时间 | 第 3 次同类交付压缩 ≥20% |

**落地机制（零代码，写进现有流程）**：
1. orchestrator 创建重型 Process 时，在 kanban_comment 标注 `process_metrics: {expected_reuse: <引用的既有资产列表>}`；
2. ops-eval 周报（已有 ValueChain 生成机制）追加双指标统计段；
3. 双指标连续 2 个统计期无改善 → 按 review-gates.md 失败模式标签归类（`[capability-gap]` 或 `[routing-error]`），入月度失败模式统计。

### 语义资产分级与双跑（2026-09-01 FDE 融合 GAP-2 **提案·试运行**，来源：文14）

> ⚠️ **状态声明（2026-09-01 复盘修正）**：本节为规则**提案**。生效条件：出现首个走完「试运行→2 任务周期无回退→升权威源」完整路径并留有 kanban 记录的资产之前，本节仅为流程定义。本节自身（及 GAP-1/3 两节）即首个试运行对象。

> 来源：文14「隐性知识先入试运行等级，经双跑验证后升权威源，不允许跳级」。Hermes 对应物：规则/skill/ontology 变更的上线路径。现状缺陷：新规则/skill 直接过 SOUL patch 即生效，无验证期。

| 等级 | Hermes 对应 | 准入 | 升级条件 |
|---|---|---|---|
| **试运行** | skill 提案（platform-skill-miner SkillProposal）/ _shared patch 的草稿 commit | 提案评审通过 | ≥2 个完整任务周期内无回退（无 kanban_request_changes 因该规则打回） |
| **权威源** | 正式 _shared 规则 / 已发布 skill | 双跑期满 + 至少 1 例正向证据 | — |
| **过期** | 6 个月无引用的规则/skill | — | harness-entropy-management 定期清理流程 |

**双跑硬规则**：涉及 workflow 强约束的 _shared 变更（如 verification 字段、路由规则），必须在新旧规则**并行生效 ≥2 个统计周期**后才能删除旧规则——即先加新、观察、再删旧，禁止一步替换。

### 版本回滚演练（2026-09-01 FDE 融合 GAP-3 **提案·试运行**，来源：文14/17）

> ⚠️ **状态声明（2026-09-01 复盘修正）**：本节为规则**提案**。生效条件：platform 板出现首条真实演练记录（含 diff 统计 + 验证脚本输出）之前，本节仅为制度草案。基线：截至今日演练次数 = 0。

> 来源：文14「每季度 1 次回滚演练并留记录」「任一次回滚演练失败=红色告警」、文17「能否回滚到上周三所依赖的版本 = 工程能力 vs 演示能力的分水岭」。

- **对象**：_shared 规则文件（.bak 已存在但从未演练恢复）、skill 库（update 后漂移史实：hermes-skills-update-protection、hermes-patch-watchdog 两个 skill 的存在即是事故证据）；
- **演练节奏**：每季度由 platform-skill-miner 或 orchestrator 抽 1 个 _shared 文件 + 1 个被 update 破坏过的 skill，从 .bak/备份恢复并跑该文件关联的验证清单（如 forward-deployed-protocol.md §五脚本）；
- **记录**：演练结果写 kanban_comment（board=platform），失败即开 Finding（severity=HIGH）；
- **现状基线**：截至 2026-09-01 演练次数 = 0（ontology.md.bak.* 两份备份存在但无恢复验证记录）。

---

## §一-bis-3 OntoClean 元性质审计表（原文 @L262-276，逐字节保留）

## 一-bis-3、OntoClean 元性质审计表（G5，2026-08-21 增补）

> 来源：Guarino & Welty, "Evaluating Ontological Decisions with OntoClean", CACM 45(2), 2002。四元性质：Rigidity（刚性：是否所有实例必然拥有）/ Identity（同一性：是否自带识别标准）/ Unity（统一性：是否有统一部分拓扑）/ Dependence（依赖性：是否依赖外部对象存在）。

| 对象类型 | Rigidity | Identity | Unity | Dependence | 审计结论 |
|---|---|---|---|---|---|
| **Task** | 刚性（occurrent，必然有生命周期） | ✅ task id | ✅（状态机黏合） | ✅ 依赖 assignee/board | 实体类，合法 |
| **Artifact** | 刚性 | ✅ 路径+内容 hash | ✅ | ❌ 独立 | 实体类，合法 |
| **Report** | **反刚性**（是 Artifact 在"报告语境"下的 role） | ✅（继承 Artifact 的） | ✅ | ✅ 依赖任务 | **Report 是 Artifact 的 role，不是子类**——本体的 5 节骨架是 role 判据（report-style 接口），不建 is-a 继承 |
| **Finding** | 刚性（断言一旦做出必然是断言） | ✅ evidence 链 | ⚠️ 弱（多证据松散聚合） | ✅ 依赖 Task/Artifact | 合法，但 Unity 弱意味着"同一发现被两人独立发现"应合并而非视为两实例 |
| **Decision** | 刚性（历史决策不可变） | ✅ 时间点+决策者+主题 | ✅ | ✅ 依赖 alternatives/证据 | 合法；supersedes 表达决策改向，不改 Decision 本身 |
| **Knowledge** | 反刚性（数据在被识别为模式前只是普通输出） | ✅ pattern 签名 | ✅ | ✅ 依赖 mined_from | **Knowledge 是"被挖掘状态"的 role**——skill 是其物化形态 |
| **Profile（角色）** | 反刚性（worker-coder 今天写码明天审查） | ✅ profile 名 | ✅ | ✅ 依赖 team | role 非 subclass——27 profile 是 Agent 类的 role 实例化 |

**审计结论**：Report 与 Knowledge 应理解为 **role**（可建模为接口/状态），Task/Artifact/Finding/Decision 是合法实体类。此表每季度由 platform-ontology-curator 复审。

---

## §一-bis-4 同一性标准（原文 @L278-291，逐字节保留）

## 一-bis-4、同一性标准（Identity Criteria，G11，2026-08-21 增补）

> 来源：Quine "no entity without identity"（Ontological Relativity, 1969）——每引入一类实体，须能回答"何时两个描述指同一实例"。

| 对象类型 | 同一性标准 | 判定示例 |
|---|---|---|
| Task | kanban task id 全局唯一 | 两卡即使标题相同也是两个 Task |
| Artifact | 文件路径 + 内容 hash（路径同而 hash 变 = 新版本，用 supersedes 连接） | 报告 v2 与 v1 是两个 Artifact 实例 |
| Finding | evidence 链指向同一根因 = 同一 Finding（多 worker 独立发现应合并） | 蓝军门 2（Consistency）的判定依据 |
| Decision | (decided_by, topic, decided_at) 三元组 | 同人同时刻同主题只有一个 Decision |
| Report | 报告路径（路径唯一即实例唯一） | — |
| Knowledge | pattern 签名（domain + pattern 归一化） | 相同模式重复出现计 frequency+1，不开新实例 |

**执行规则**：实体解析（Entity Resolution）发生在蓝军门 2（Consistency）——Checker 合并候选时必须按上表判定"真同一"还是"表面相似"。
