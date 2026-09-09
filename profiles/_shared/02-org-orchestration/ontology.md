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
  recorded_by: {type: string, desc: "决策记录人 profile 名 (PROV-O agent)"}
  source: {type: string, desc: "出处 file:line / url / task_id (PROV-O primary-source)"}
  confidence: {type: enum, values: [high, medium, low], desc: "决策置信度 (evidence strength)"}
  provenance: {type: object, desc: "PROV-O 复合溯源字段 (recorded_by/decided_at/source/confidence)"}
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
  recorded_by: {type: string, desc: "发现记录人 profile 名 (PROV-O agent)"}
  confidence: {type: enum, values: [high, medium, low], desc: "发现置信度 (evidence strength)"}
  provenance: {type: object, desc: "PROV-O 复合溯源字段 (recorded_by/created_at/source/confidence)"}
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

> **已移档**（§一-bis Process Types/ValueChain，含产能三指标与 FDE GAP-1/2/3 提案）：本段内容见 `_shared/archive/ontology-academic-devices.md`（2026-09-08 教条排查裁决：无运行时消费方，移出契约层；复查条件：首个真实 Process 由 orchestrator 非测试路径创建时回迁）。

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

> **已移档**（§一-bis-3 OntoClean 元性质审计表、§一-bis-4 同一性标准）：本段内容见 `_shared/archive/ontology-academic-devices.md`（2026-09-08 教条排查裁决：无运行时消费方，移出契约层；复查条件：出现真实脚本消费需求时回迁）。

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

### Action 名与现行工具面映射（v1.4 增补）

上表 action 名为**语义层契约名**；现行工具面存在演化（browser_navigate/click/type → `browser_exec` / `computer_use` / `cua_browser_*` 命名）。判定 `reversible` 与 `level` 时按语义等价映射，不因工具改名而绕过 Staged Action 协议。新增工具默认归类：`reversible=false, level=shared_state`，直到在本表显式登记。

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

### 3.3 Provenance 规范（PROV-O）

All Decision/Finding written by workers MUST carry provenance: who recorded (`recorded_by`), when (`decided_at` / `created_at`), from where (`source` — file:line / url / task_id), and confidence (`high` / `medium` / `low`). This is the runtime enforcement of G2/G11 "markings from decoration to evidence". Omitting provenance on security/PII findings triggers the `marking_selfcheck` gate.

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
> 本任务的产出遵循 `~/.hermes/profiles/_shared/02-org-orchestration/ontology.md` 定义的对象模型。
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
        "ontology_version": "1.3"
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

## 七、运行时事实源演进状态（Gap-Closing Program, 2026-08-28）

> 本段为 **加法演进**（v1.5 → v1.6），仅追加不删改 §一~§六 既有语义。记录「从 Prompt 软契约升级为运行时一等事实源 + fail-closed 强制控制」的工程计划、当前基线、子卡映射、演进原则。使跨板协作有单一事实源追踪状态。

### 7.1 根因差距（G1–G11，对照 Palantir / 信通院本体智能标准）

| 编号 | Gap | 现状实测 | 严重度 |
|------|-----|----------|--------|
| **G1** | 本体对象无 DB 表 → 不可查询/推理/实体解析 | 7 board kanban.db 仅 tasks/task_links/task_comments，**无 ontology-object 表** | 🔴 CRITICAL |
| **G2** | Markings 零 enforcement（fail-open） | `kanban_tools.py` grep clearance/marking = 0 行；0 条 task 填过 markings；仅 3/7 board 有 markings 列 | 🔴 CRITICAL |
| **G3** | 本体未接入 LLM 推理回路 | 无 agent 推理时用 ontology 校验；CQ 仅人工答；无 ontology-aware 工具 | 🔴 CRITICAL |
| **G4** | 对象间关系仅 prose 无物理外键 | Finding.evidence / Decision.based_on / Report.cites 只在 body 文本 | 🟠 HIGH |
| **G5** | Process/ValueChain 仅装饰性概念 | 无实例/字段，产能指标无法采集 | 🟠 HIGH |
| **G6** | metadata 字段名不合规 | 仅 swarm 4/81 done 含 artifacts_produced；其余 6 board = 0 | 🟠 HIGH |
| **G7** | markings 列缺失 4/7 board | [已移除]/hack/ops/platform 无 markings 列（C1 已补齐） | 🟠 HIGH |
| **G8** | CQ/OEL/引用审计未接 cron | `ontology-cq-regression.py` 与 `oel_aggregate.py` 存在但无 cron 绑定 | 🟡 MEDIUM |
| **G9** | 无本体演化影响面分析工具 | 改动 ontology.md 依赖人工 grep | 🟡 MEDIUM |
| **G10** | 稳定单元影响域弱连接 | worker 写 `impacted:[...]` 无校验 | 🟡 MEDIUM |
| **G11** | TLP/CUI/SECRET 从未实际用 | clearances 配了但 0 次触发 | 🟡 MEDIUM |

### 7.2 补齐计划（分三级，按 ROI 排序，C1-C4 对应父卡 t_65725399 子卡）

| 级别 | 措施 | 对应 Gap | 交付卡 | 状态 |
|------|------|----------|--------|------|
| **一级**（软约束变硬） | P1 补齐 4 board markings 列 | G7 | C1 `t_f6261b23` | ✅ done |
| | P2 派发前 clearance fail-closed gate | G2 | C2 `t_fb1303ab` | ✅ done |
| | P3 metadata 合规 CQ16 + watchdog + cron | G6, G8 | C3 `t_2b065768` | ⚠️ done 但 cron 未注册 |
| **二级**（本体成运行时事实源） | P4 swarm ontology_objects/object_links 试点 | G1, G4 | C4 `t_7e2c0d8f` | ✅ done |
| | P5 关系语义物理化（object_links + 触发器） | G4 | 后续卡 | 待定 |
| | P6 Process/ValueChain 落地 | G5 | 后续卡 | 待定 |
| **三级**（接入 LLM 推理） | P7 ontology_validate 工具 | G3 | 后续卡 | 待定 |
| | P8 CQ 进闭环（curator 自动回填 OEL） | G3, G8 | 后续卡 | 待定 |
| | P9 稳定单元影响域强约束 + 标记实战演练 | G9, G10, G11 | `t_44f56a7c` | ✅ done |

### 7.3 演进原则

1. **加法优先，向后兼容**：默认追加 type/property/link/action/marking，不破坏既有语义。破坏性变更须附迁移路径 + deprecation 标注 + 影响 profile 清单。
2. **四要素完整性**：每个新增 object type 必须含 properties + links + markings 三段；涉及副作用的配 action type；涉及跨团队交接的配 interface type。只加 data 不加 logic/action/security = 未完成。
3. **机械可验证**：所有契约变更、合规检查、审计均可脚本化复跑。不接受"目测一致"。
4. **单一事实源**：gap 状态、子卡映射、基线数据仅在本段登记，子卡 body 引用本段（`ref: ontology.md §7.2`），不重复造轮子。
5. **演进 = commit（P7，2026-08-29 落地）**：`~/.hermes/profiles/_shared/` 已纳入 git（独立子仓，非 symlink 破坏）。每次 ontology.md / marking-rules.md / output-contract.md 等共享契约演进 = 一次 `git commit`；Staged Action 执行步追加 commit 使变更可 git blame 追溯（temporal provenance）。`git -C ~/.hermes/profiles/_shared log -- ontology.md` 必须能查到演进 commit。

### 7.4 当前基线（2026-08-28 实测）

- 7 board tasks 表 markings 列：7/7 存在、可写、事务回滚、NULL=0（C1 完成）
- clearance fail-closed gate：`~/.hermes/bin/clearance_gate.py` hook 就绪，10/0 单测全绿，未触碰 kanban_tools.py 主路径（C2 完成）
- swarm ontology_objects：Artifact=41, Finding=16, Decision=22；object_links: derived_from=44, based_on=142（C4 完成）
- CQ16 metadata 合规基线：137 done 任务仅 25 全齐 = 24.3% 合规（6/7 board <50%）
- OEL 候选：3 行全 rejected（test data），无 pending 真实漂移

### 7.5 子卡与契约依据映射

| 子卡 | 依据本段条款 | 备注 |
|------|--------------|------|
| C1 `t_f6261b23` | §7.2 P1 / §7.4 第 1 条 | 仅 schema 迁移，幂等+dry-run |
| C2 `t_fb1303ab` | §7.2 P2 / §7.4 第 2 条 | hook 形式，fail-closed |
| C3 `t_2b065768` | §7.2 P3 / §7.4 第 4 条 | 需补注册 cron |
| C4 `t_7e2c0d8f` | §7.2 P4 / §7.4 第 3 条 | 单点试点，评估后推广 |

---

## 版本

- v1.9 (2026-09-08): 教条排查裁决（kanban t_4eb5ebc3，证据 research/2026-09-08-dogma-audit-findings.json 条目 4/5/6）——移出三段无运行时消费方学术设备：§一-bis Process Types/ValueChain（含产能三指标、FDE GAP-1/2/3 提案）、§一-bis-3 OntoClean 元性质审计表、§一-bis-4 同一性标准；全文零丢失存档于 `_shared/archive/ontology-academic-devices.md`，正文各留一行指路。§一-bis-2 Link Types 保留原编号与正文不动；§六 CQ、§七 Gap 章节完好未动。
- v1.7 (2026-08-29): P7 落地——`~/.hermes/profiles/_shared/` 纳入独立 git 子仓（.git 为本目录独立仓，不破坏既有 symlink/引用），共享契约演进=commit（temporal provenance）；§7.3 演进原则增第 5 条「演进=commit」。纯加法，不动 §一~§六 语义。
- v1.8 (2026-08-29): P3 落地——§三 Decision/Finding 对象增补 PROV-O provenance 字段（recorded_by / source / confidence + provenance 复合字段），§3.3 新增 Provenance 规范段。回应 Semantica 启示三"每事实打溯源标记"（G2/G11 从装饰变证据）。纯加法演进，不动 §一~§六 语义；向后兼容（缺省置信度写入时不强制，但安全/PII finding 建议齐）。
- v1.6 (2026-08-28): 新增 §七「运行时事实源演进状态」，记录 G1–G11 差距、三级补齐计划、C1-C4 子卡映射、当前基线、演进原则。加法演进，不删改 §一~§六 语义。
- v1.5 (2026-08-27): 附录「稳定单元注册表」来源澄清——`stable-units.md` 与 `phase2-gap-analysis.md` 实为本体论四部曲调研档案（`research/ontology-four-books/phase2-gap-analysis.md`，非 _shared 合并产物）；F6 归并是把其正文吸收进本文件附录，原独立文件不再存在。引用标注改为指向 `research/` 档案源。
- v1.1 (2026-08-21): 一-bis 增补 Process/ValueChain 流程级对象 + 产能三指标（融合自麦肯锡智能体驱动型组织框架）
- v1.2 (2026-08-21): Gap 修补——顶层来源声明（G12）+ Link Types 六种关系语义（G4）+ OntoClean 元性质审计表（G5）+ 同一性标准（G11）+ 能力问题清单 15 问（G2）。依据：Palantir Link types、Guarino & Welty OntoClean (CACM 2002)、Quine identity criteria、Grüninger & Fox CQ (TOVE 1995)
- v1.3 (2026-08-22): 五 lens 专家评审驱动的契约对齐——Task.status 补 scheduled/review（对齐 kanban_db.py 9 态实现）；Finding.evidence 补字段（消除 claims/同一性悬空引用）；Knowledge 补 markings（[已移除] 儿童 PII 通道）+ domain 枚举补 [已移除]/swarm；CQ9/CQ11 悬空引用修正（retwork→task_events 事实源；verification→metadata 动态键）；ad-hoc link 对账表（15 个 schema 内 link 名归映射到 6 权威关系）；Action Types 修订为 24 条（§二 实数）；示例 ontology_version 待全量更新为 1.3


---

## 附录：稳定单元注册表（原 stable-units.md 正文，2026-08-25 F6 归并吸收进本文件；来源档案：`research/ontology-four-books/phase2-gap-analysis.md` G8）

> 配套：`marking-rules.md §6 标记沿调用链传播`——被标记为"稳定单元"的 artifact 变更时，worker 必须在 `kanban_complete(metadata)` 声明下游 1 跳影响域（`impacted: [...]`）。
> 准入条件（满足其一）：① 共享 schema/契约文档；② 公开接口被 ≥2 profile 引用；③ 被 ≥2 任务依赖的 artifact。
> 维护：orchestrator 在 kanban_create 路由时对照本表提示 worker；新稳定单元由 reviewer 在 review 时提名加入。

## 契约层（最高稳定级）

| 路径 | 类型 | 已知下游 |
|---|---|---|
| `~/.hermes/profiles/_shared/02-org-orchestration/ontology.md` | 共享对象模型契约 | 全部 27 profile SOUL（引用段） |
| `~/.hermes/profiles/_shared/02-org-orchestration/marking-rules.md` | 标记传播规则 | 全部 27 profile SOUL（2026-08-24 接线） |
| `~/.hermes/profiles/_shared/01-scheduling-bus/forward-deployed-protocol.md` | 前线部署协议 | 全部 27 profile SOUL |
|| `~/.hermes/profiles/_shared/03-evolution-memory/output-contract.md` | 输出契约 | 全部 47 profile SOUL |
|| `~/.hermes/profiles/_shared/03-evolution-memory/output-contract.md` | 验证清单 | 全部 47 profile SOUL |
|| `~/.hermes/profiles/_shared/03-evolution-memory/output-contract.md` | 共享规则索引 | orchestrator 等多数 SOUL |
|| `~/.hermes/profiles/_shared/02-org-orchestration/language-standard.md` | 语言规范 | 全部 47 profile SOUL（2026-09-09 部署） |

## 接口层

| 路径 | 类型 | 已知下游 |
|---|---|---|
| `~/.hermes/config.yaml` | Gateway/模型/auxiliary 配置 | gateway @8650/@8651、全部 profile |
| 各 profile `config.yaml` `clearances` 字段 | marking 校验输入 | orchestrator 跨 board 路由机械校验 |

## 记忆/档案层

| 路径 | 类型 | 已知下游 |
|---|---|---|
| `~/.hermes/profiles/[已移除]-orchestrator/references/child-profile.md` | 孩子档案（hindsight 双写源） | [已移除] 6 师 + swarm↔[已移除] 双写 cron |

## 变更纪律

1. 修改本表所列文件的任务，kanban_complete metadata 必须含 `impacted: [...]`（下游 1 跳）。
2. 下游任务开工前应确认已读 warn comment（ack 或 kanban_block 求澄清）。
3. 本表条目变更本身 = 稳定单元变更，需 kanban_comment 声明。

## 版本

- v1.0 (2026-08-24): 初版，本体论四部曲调研 gap 分析 G8 落地（research/ontology-four-books/phase2-gap-analysis.md）
