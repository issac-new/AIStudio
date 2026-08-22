# 共享 Ontology — 跨团队对象模型契约

> 灵感来源：Palantir Ontology（data + logic + action + security 四要素集成）
> 适用范围：所有 Hermes agent team（swarm/hack/product/ops/[已移除]/platform）
> 作用：所有 SOUL.md 的「输出契约」段必须引用本文件的 object types；kanban_complete 的 metadata 必须用本文件定义的 property 名

---

## 零、Agent 三层概念体系（所有 team 必须区分）

> 来源：Agent Framework 公众号《Agent、Agent Framework、Agent Harness》(2026-03-25)

| 层次 | 定义 | Hermes 对应 | 竞品参考 |
|------|------|------------|---------|
| **Agent** | 具有自主决策能力的AI实体（感知→推理→行动→反馈） | 每个 profile（worker-coder, hack-recon 等） | LangChain Agent, AutoGen Agent |
| **Agent Framework** | 构建管理 Agent 的基础设施（模型路由/工具调用/记忆/编排） | Hermes Agent 本身（config.yaml+kanban+skills+delegate_task） | LangChain, CrewAI, AutoGen, MS Agent Framework |
| **Agent Harness** | 模型推理的外层治理（提案→验证→授权→执行→记录） | Hermes 的 approval 系统+kanban 生命周期+前线部署协议 | cua-driver, Claude Code Harness |

**关键区分**：Harness 防"看起来完成"伪装成"真实完成"（四权分离：行动/自评/评分/环境修改）。

### 顶层来源声明（G12，2026-08-21 增补）

> 本体顶层**不自研、只显式化**：骨架复用 Palantir 四要素模型（Data/Logic/Action/Security，palantir.com/docs/foundry/ontology/why-ontology），角色语义复用 UFO-C（Guizzardi 2005，Ontological Foundations for Structural Conceptual Models——agent/role/goal/commitment 社会性实体一等公民）。对象/动作/安全三层分别对应 Palantir 的 Object/Action/Marking types；27 profile 的 role 实例化遵循 OntoClean 准则（role ≠ subclass，见 §一-bis-2 审计表）。

---

## 一、Object Types（对象类型）

### 1. Task（任务）
对应 kanban.db 中的任务卡片。

```yaml
object_type: Task
properties:
  title: {type: string, desc: "任务标题"}
  status: {type: enum, values: [triage, todo, scheduled, ready, running, blocked, review, done, archived]}  # v1.3: 对齐 kanban_db.py:100 的 9 态实现（补 scheduled/review）
  assignee: {type: string, desc: "执行者 profile 名"}
  priority: {type: int, range: "0-30"}
  board: {type: enum, values: [swarm, hack, product, ops, [已移除], platform, [已移除]]  # 2026-08-21 补 [已移除]（rules 强制跨板建卡）}
  parents: {type: "list[ref:Task]", desc: "依赖的任务"}
  children: {type: "list[ref:Task]", desc: "派生的子任务"}
  created_at: {type: datetime}
  completed_at: {type: datetime}
  tenant: {type: string, desc: "六段式平台来源标识"}
  markings: {type: "list[string]", desc: "安全标记"}
  methodology: {type: string, desc: "采用的方法论"}
links:
  depends_on: {target: Task, desc: "依赖另一任务"}
  produced_by: {target: Task, desc: "被某任务产出"}
  consumed_by: {target: Task, desc: "被某任务消费"}
  blocked_by: {target: Task, desc: "被某任务阻塞"}
```

### 2. Artifact（产出物）
代码、报告、配置、数据等交付物。

```yaml
object_type: Artifact
properties:
  path: {type: string, desc: "文件绝对路径"}
  type: {type: enum, values: [code, report, config, data, script, binary, diagram]}
  size: {type: int, unit: bytes}
  created_by: {type: string, desc: "产出者 profile 名"}
  verified: {type: bool, desc: "是否经验证"}
  content_hash: {type: string, desc: "SHA256 摘要"}
  markings: {type: "list[string]"}
links:
  produced_by_task: {target: Task}
  consumed_by_task: {target: Task}
  derived_from: {target: Artifact}
```

### 3. Decision（决策记录）
技术选型、架构决策、优先级判定等。

```yaml
object_type: Decision
properties:
  topic: {type: string}
  choice: {type: string}
  rationale: {type: string}
  alternatives: {type: "list[string]"}
  decided_by: {type: string}
  decided_at: {type: datetime}
  markings: {type: "list[string]"}
links:
  based_on_artifact: {target: Artifact}
  based_on_finding: {target: Finding}
  produced_task: {target: Task}
```

### 4. Finding（发现/缺陷/风险）
安全发现、bug、风险、调研结论。

```yaml
object_type: Finding
properties:
  severity: {type: enum, values: [CRITICAL, HIGH, MEDIUM, LOW, INFO]}
  category: {type: string, values: [security, bug, risk, insight]}
  description: {type: string}
  source: {type: string, desc: "来源 file:line / url / task_id"}
  evidence: {type: "list[string]", desc: "证据链（file:line / 命令输出 / task_id），v1.3 补——Link Types 的 claims 关系与同一性标准均引用此字段"}  # v1.3: 消除悬空引用
  status: {type: enum, values: [open, acknowledged, fixed, wontfix]}
  created_at: {type: datetime}
  markings: {type: "list[string]"}
links:
  found_in_task: {target: Task}
  found_in_artifact: {target: Artifact}
  fixed_by_task: {target: Task}
```

### 5. Report（结构化报告）
调研报告、审查报告、测试报告、部署报告等。

```yaml
object_type: Report
properties:
  type: {type: enum, values: [research, review, test, deploy, incident, eval, audit]}
  format: {type: enum, values: [markdown, pdf, json, csv, html]}
  content_hash: {type: string}
  created_at: {type: datetime}
  authored_by: {type: string}
  markings: {type: "list[string]"}
links:
  authored_by: {target: "profile"}
  cites_artifact: {target: Artifact}
  cites_finding: {target: Finding}
  cites_decision: {target: Decision}
```

### 6. Knowledge（知识/经验）
从实践中提取的可复用知识，可被 platform-skill-miner 转化为 skill。

```yaml
object_type: Knowledge
properties:
  domain: {type: enum, values: [devops, security, [已移除], ops, product, [已移除], swarm]}  # v1.3: 补 [已移除]/swarm——孩子记忆知识每日 swarm↔[已移除] 双写
  pattern: {type: string, desc: "识别到的重复模式"}
  frequency: {type: int, desc: "出现次数"}
  abstracted: {type: bool}
  skill_name: {type: string, desc: "转化后的 skill 名"}
  markings: {type: "list[string]", desc: "v1.3 补——[已移除] 域知识含儿童 PII，跨 board 流动必须有标记通道；默认 [TLP:AMBER]"}  # v1.3: 消除唯一无 markings 对象
links:
  mined_from_task: {target: Task}
  abstracted_to_skill: {target: Skill}  # v1.3: link target 对齐 §一-bis-2（skill/profile 升为可引用类型，见 Link 对账表）
```

---

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

## 一-bis-2、Link Types（关系语义，G4，2026-08-21 增补）

> 来源：Palantir Link type（一等公民关系，palantir.com/docs/foundry/ontology/core-concepts）。此前 Hermes 仅有 task_links 表的 parent-child 物理外键，语义未声明。

| Link Type | 语义（含反向读法） | 物理载体 | 约束 |
|---|---|---|---|
| **depends_on** | A 完成前 B 不能开始（B depends_on A） | task_links(parent→child) | 有向无环（DAG）；被用于 kanban promote 门控 |
| **derived_from** | A 的内容派生自 B（如 Report 引用 Finding） | Artifact/Report 内嵌引用（file:line / task id） | 派生物自动继承源 markings（合取 AND） |
| **supersedes** | A 替代 B（新版本废弃旧版本，B 不删） | kanban_comment 标记或文件头 frontmatter | supersedes 链禁止成环；旧版保留可追溯 |
| **based_on**（Decision） | 决策基于哪些证据对象 | Decision.based_on_artifact | 至少 1 个，且引用前必须 `ls` 验证存在 |
| **mined_from**（Knowledge） | 知识从哪些任务挖掘 | Knowledge.mined_from_task | 由 platform-skill-miner 周报产生 |
| **claims**（Finding→Evidence） | 发现由哪些证据支撑 | Finding.evidence 链 | 蓝军门 4（Asset 真实性）必查 |

**使用规则**：
1. 关系语义写进 kanban_comment 时必须用上表动词原词（不用"参考了""来自"等同义改写）
2. `derived_from` 是 markings 传播的触发器——引用 marked artifact 必须声明此 link
3. 新增关系类型需走 ontology 演进评审（platform-ontology-curator）

**对象 schema 内 ad-hoc link 对账表（v1.3 增补，消除 MAJOR-2 契约漂移）**：

对象 schema 里还存在以下 link 名，它们是六种权威关系的**特化（subtype）**，不是非法名：

| ad-hoc link | 归属的权威关系 | 判定 |
|---|---|---|
| produced_by / consumed_by / blocked_by（Task） | depends_on 特化 | 合法（方向明确的依赖变体） |
| based_on_artifact（Decision）/ based_on（通用） | based_on | 同一关系，命名统一为 based_on |
| mined_from_task（Knowledge） | mined_from | 同一关系 |
| found_in_task / found_in_artifact / fixed_by_task（Finding） | claims / supersedes 的语境变体 | 保留（Finding 的定位语义需要） |
| cites_* / derived 引用（Report） | derived_from / claims | 同一关系 |

**规则**：新写 schema 时一律用六种权威动词；既有 ad-hoc 名按本表映射解读，不再新增。

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


---

## 二、Action Types（动作类型）

每个 action type 定义副作用、可逆性、所需权限级别。

```yaml
actions:
  read_file:       {side_effects: none, reversible: N/A, level: local_reversible}
  search_files:    {side_effects: none, reversible: N/A, level: local_reversible}
  write_file:      {side_effects: fs_write, reversible: true, level: local_reversible}
  patch:           {side_effects: fs_write, reversible: true, level: local_reversible}
  terminal:        {side_effects: shell_exec, reversible: false, level: command_dependent}
  web_search:      {side_effects: none, reversible: N/A, level: local_reversible}
  web_extract:     {side_effects: none, reversible: N/A, level: local_reversible}
  kanban_create:   {side_effects: db_write, reversible: true, level: local_reversible}
  kanban_complete: {side_effects: db_write, reversible: false, level: shared_state}
  kanban_block:    {side_effects: db_write, reversible: true, level: shared_state}
  kanban_comment:  {side_effects: db_write, reversible: true, level: local_reversible}
  kanban_heartbeat:{side_effects: db_write, reversible: true, level: local_reversible}
  acp_send:        {side_effects: external_call, reversible: false, level: high_risk}
  delegate_task:   {side_effects: spawn_process, reversible: false, level: shared_state}
  memory:          {side_effects: persistent_store, reversible: false, level: shared_state}
  skill_view:      {side_effects: none, reversible: N/A, level: local_reversible}
  skill_manage:    {side_effects: fs_write, reversible: true, level: shared_state}
  cronjob:         {side_effects: schedule_task, reversible: false, level: high_risk}
  computer_use:    {side_effects: os_input, reversible: false, level: high_risk}
  vision_analyze:  {side_effects: none, reversible: N/A, level: local_reversible}
  text_to_speech:  {side_effects: audio_file, reversible: true, level: local_reversible}
  browser_navigate:{side_effects: browser_action, reversible: false, level: shared_state}
  browser_click:   {side_effects: browser_action, reversible: false, level: shared_state}
  browser_type:    {side_effects: browser_action, reversible: false, level: shared_state}
```

### Staged Action 协议（不可逆动作）

对 `reversible=false` 的 action，执行前必须走 staged 协议：

1. worker 提议动作 → `kanban_comment(body="<staged-action-proposal>")`
2. 动作提案含：意图、影响范围、回滚命令、预计后果
3. 权限级别=shared_state/high_risk → 等待确认
4. 执行 → 记录 exit_code + 输出
5. 验证 → `kanban_complete` 或 回滚 → `kanban_block`

详见 `forward-deployed-protocol.md` 的 Staged Action 章节。

---

## 三、Interface Types（接口类型）

跨团队交接的标准接口定义。

### 3.1 TaskHandoff（任务交接）
所有 kanban_create 的 body 应遵循此结构：

```yaml
interface: TaskHandoff
fields:
  goal: {type: string, desc: "一句话目标"}
  acceptance_criteria: {type: list, desc: "验收条件（可机械验证）"}
  context: {type: string, desc: "上游交接物引用"}
  constraints: {type: list, desc: "约束（时间/资源/权限）"}
  ontology_refs:
    artifacts: {type: "list[ref:Artifact]"}
    findings: {type: "list[ref:Finding]"}
    decisions: {type: "list[ref:Decision]"}
```

### 3.2 CompletionHandoff（完成交接）
所有 kanban_complete 的 summary+metadata 应遵循此结构：

```yaml
interface: CompletionHandoff
summary: {type: string, desc: "1-3 句人话"}
metadata:
  artifacts_produced: {type: "list[ref:Artifact]"}
  findings: {type: "list[ref:Finding]"}
  decisions: {type: "list[ref:Decision]"}
  tests_run: {type: int}
  changed_files: {type: "list[string]"}
  acp_sessions: {type: "list[string]"}
  markings: {type: "list[string]"}
```

---

## 四、安全标记体系

### 标准 Marking 值

| Marking | 含义 | 适用 |
|---------|------|------|
| `TLP:RED` | 仅限指定个人 | Finding/Artifact 含极高敏感信息 |
| `TLP:AMBER` | 仅限需要知道的人 | Finding/Artifact 含敏感信息 |
| `TLP:GREEN` | 可在组织内共享 | 默认 |
| `TLP:CLEAR` | 可公开 | 公开报告 |
| `PII` | 含个人身份信息 | Artifact 含用户数据 |
| `CUI` | 受控未分类信息 | Artifact 含政府/合规数据 |
| `SECRET` | 机密（需 clearance） | Finding/Artifact 涉密 |
| `EYES-ONLY:<team>` | 仅限指定团队 | 跨团队隔离 |

### 传播规则

详见 `marking-rules.md`。

---

## 五、引用规范

### SOUL.md 引用

每个 profile 的 SOUL.md「输出契约」段必须包含：

```markdown
> 本任务的产出遵循 `~/.hermes/profiles/_shared/ontology.md` 定义的对象模型。
> 产出物类型：Artifact (type=code/report/...)，含 markings 标记。
> 完成交接遵循 CompletionHandoff 接口。
```

### kanban_complete 引用

```python
kanban_complete(
    summary="...",
    metadata={
        "artifacts_produced": [{"path": "...", "type": "code", "markings": ["TLP:GREEN"]}],
        "findings": [...],
        "ontology_version": "1.0"
    }
)
```

---

## 六、能力问题清单（Competency Questions，G2，2026-08-21 增补）

> 来源：Grüninger & Fox, "The role of competency questions in enterprise engineering"（TOVE 项目, 1995）。CQ 是本体的**范围契约与回归测试**：本体必须能回答的问题清单。每季度由 platform-ontology-curator 跑一遍，答不出 = 本体有 Gap 或对象缺失。

### 身份与权限类（5 问）

| # | CQ | 需要的对象/关系 |
|---|---|---|
| CQ1 | 哪些 profile 有权限处理带 PII 标记的任务？ | Profile.clearances × Task.markings（合取判定） |
| CQ2 | 任务 X 派生出的所有下游任务（传递闭包）？ | task_links depends_on |
| CQ3 | profile Y 当前在哪些 board 上有 running 任务？ | Task(board, assignee, status) |
| CQ4 | 某 Artifact 的 markings 是什么、从哪里继承的？ | Artifact.markings + derived_from 链 |
| CQ5 | 谁批准了决策 D、基于哪些证据？ | Decision(based_on, decided_by) |

### 流程与产能类（4 问）

| # | CQ | 需要的对象/关系 |
|---|---|---|
| CQ6 | 流程 P 从触发到交付用了多久、瓶颈在哪个阶段？ | Process(value_chain_stage, baseline_metrics) |
| CQ7 | 过去 7 天每 board 的任务吞吐量？ | Task(board, completed_at) |
| CQ8 | 哪些任务被阻塞超过 24 小时、被谁阻塞？ | Task(blocked, depends_on) + task_events |
| CQ9 | 某 Process 失败后返工了几次？ | task_events 中 completed→ready 回退计数（以 events 为事实源，非 Process 冗余字段——v1.3 修正原 retwork 悬空引用） |

### 质量与证据类（4 问）

| # | CQ | 需要的对象/关系 |
|---|---|---|
| CQ10 | Finding F 的证据链完整吗（每条 evidence 真实存在）？ | Finding.evidence + 蓝军门 4 |
| CQ11 | 最近完成的任务中，verification 字段覆盖率和证据强度分布？ | tasks.metadata JSON 中 verification 键（kanban_complete metadata 通道——v1.3 修正：Task schema 无此一等字段，经 metadata 动态键承载，见 P2-1 shadow 设计） |
| CQ12 | 哪些 Finding 被多个 worker 独立发现（应按同一性合并）？ | Finding identity（evidence 链→同根因） |
| CQ13 | 某任务的验收标准是什么、执行中是否被修改过？ | Task.body(frozen) + kanban_comment 审批记录 |

### 治理与演化类（3 问）

| # | CQ | 需要的对象/关系 |
|---|---|---|
| CQ14 | 规则 R 被多少 profile 引用、哪些 profile 缺引用？ | SOUL 引用审计（audit-soul-rules.sh） |
| CQ15 | 哪些 skill 是零引用/90 天未更新（能力过时）？ | Knowledge(abstracted_to_skill) + skill-health-audit |

### 回归测试方法

```bash
# 每季度 platform-ontology-curator 执行：
# 1. 逐条 CQ 写出查询（SQL/grep/脚本）
# 2. 查询失败或无数据 → 记录 Gap 到 intervention-ledger
# 3. Gap 修复后重跑直到 15/15 全绿
```

---

## 版本

- v1.0 (2026-07-31): 初始版本，6 对象类型 + 22 动作类型 + 2 接口类型 + 8 安全标记
- v1.1 (2026-08-21): 一-bis 增补 Process/ValueChain 流程级对象 + 产能三指标（融合自麦肯锡智能体驱动型组织框架）
- v1.2 (2026-08-21): Gap 修补——顶层来源声明（G12）+ Link Types 六种关系语义（G4）+ OntoClean 元性质审计表（G5）+ 同一性标准（G11）+ 能力问题清单 15 问（G2）。依据：Palantir Link types、Guarino & Welty OntoClean (CACM 2002)、Quine identity criteria、Grüninger & Fox CQ (TOVE 1995)
- v1.3 (2026-08-22): 五 lens 专家评审驱动的契约对齐——Task.status 补 scheduled/review（对齐 kanban_db.py 9 态实现）；Finding.evidence 补字段（消除 claims/同一性悬空引用）；Knowledge 补 markings（[已移除] 儿童 PII 通道）+ domain 枚举补 [已移除]/swarm；CQ9/CQ11 悬空引用修正（retwork→task_events 事实源；verification→metadata 动态键）；ad-hoc link 对账表（15 个 schema 内 link 名归映射到 6 权威关系）；Action Types 修订为 24 条（§二 实数）；示例 ontology_version 待全量更新为 1.3
