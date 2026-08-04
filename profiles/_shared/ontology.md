# 共享 Ontology — 跨团队对象模型契约

> 灵感来源：Palantir Ontology（data + logic + action + security 四要素集成）
> 适用范围：所有 Hermes agent team（swarm/hack/product/ops/[已移除]/platform）
> 作用：所有 SOUL.md 的「输出契约」段必须引用本文件的 object types；kanban_complete 的 metadata 必须用本文件定义的 property 名

---

## 一、Object Types（对象类型）

### 1. Task（任务）
对应 kanban.db 中的任务卡片。

```yaml
object_type: Task
properties:
  title: {type: string, desc: "任务标题"}
  status: {type: enum, values: [triage, todo, ready, running, blocked, done, archived]}
  assignee: {type: string, desc: "执行者 profile 名"}
  priority: {type: int, range: "0-30"}
  board: {type: enum, values: [swarm, hack, product, ops, [已移除], platform]}
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
  domain: {type: enum, values: [devops, security, [已移除], ops, product]}
  pattern: {type: string, desc: "识别到的重复模式"}
  frequency: {type: int, desc: "出现次数"}
  abstracted: {type: bool}
  skill_name: {type: string, desc: "转化后的 skill 名"}
links:
  mined_from_task: {target: Task}
  abstracted_to_skill: {target: "skill"}
```

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

## 版本

- v1.0 (2026-07-31): 初始版本，6 对象类型 + 22 动作类型 + 2 接口类型 + 8 安全标记
