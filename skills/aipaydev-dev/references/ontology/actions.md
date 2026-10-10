# swarm-yuan 动作类型目录（Action Types）——受治理的状态变换单元

> **何时读我**：判断"AI 允许做哪些动作、各动作的治理载体与留痕载体"、评审动作空间封闭性（新动作进目录）时读。日常开发任务不读。
>
> 本文件定义 swarm-yuan 里"被允许改变世界状态"的动作类型（Palantir Actions 的对应物：受治理/受权限/留痕的状态变换）。
> 核心纪律（Palantir "AI 经本体论行动" 的映射）：**AI 的一切状态变换动作必须在类型化动作空间内发生**——每个动作类型有治理载体（谁能触发/什么条件下允许）与留痕载体（触发后记到哪本账）。动作空间外的自由形式操作会被 rules.d/gate FORBID。

## 动作目录

| 动作 ID | 变换什么状态 | 治理载体（准入条件） | 留痕载体 |
|---------|-------------|---------------------|----------|
| `generate_skill` | 无 → 新 Skill（draft 态） | 生成器命令 + profile 档位 | trace.jsonl 生成节点行 |
| `mark_active` | Skill.status: draft → active | 三关状态门（无占位符 + path-check HALLUCINATION=0 + audit-closure advisory） | SKILL.md status 字段翻转 + 决策留痕 |
| `update_map_entry` | 地图行内容（replace/delete/append） | inventory-update 的 §4/§6/§9 域限定 + 五列格式校验 + 多义命中拒绝 | decisions.jsonl（phase=self-growth） |
| `write_fingerprint` | 无/旧 → 新 Fingerprint | last-good 红线（骤降 >50% 拒绝，需 --force 显式覆盖 + 决策留痕） | fingerprint 文件 + 决策行 |
| `run_gates` | 无 → GateExecution 记录 | precheck 执行序列（--all/--all-full/--compliance-suite） | gate-runs.jsonl 行 |
| `make_decision` | 无 → Decision 事件 | 三级分类（Mechanical 直做/Taste 给方案/UserChallenge 必停五要素） | decisions.jsonl 行（含 outcome + goal_id） |
| `close_goal` | goal.closure: open → closed | change set ↔ final validation set 链接成立（审计闭环语义） | decisions 行 closure 字段 |
| `gate_deny` | 命令执行被阻断 | rules.d 三值判定 forbid / fail-gate flag 未清除 | gate-audit.jsonl + gate-deny.jsonl 双写 |
| `persist_rule` | 临时放行 → 持久规则（写回 rules.d） | 审批沉淀：justification + 日期 + 决策留痕三要素 | rules.d 新行 + decisions.jsonl |
| `upgrade_skill` | Skill 的通用文件部分（保项目内容文件） | `--upgrade` 路径 + 版本戳对账 | .swarm-yuan-version 更新 |
| `inject_framework_gates` | precheck.sh 的标记区块内容 | ACTIVE_FRAMEWORKS 检测 + 区块 sha 记录 | framework-evidence 台账 |

## 动作空间纪律（AI 经本体论行动）

1. **封闭动作空间**：目标技能的 AI 改变上述状态只能走对应动作类型（及其脚本入口）——绕过入口直接改文件会被 `mounted_in` 关系挂载的 hooks 拦（gate_deny）或被 integrity-guard 的自指防护拦（保护 Ledger/RuleFile/Fingerprint 自身）。
2. **每动作可审计**：上表右列保证"没有不留痕的动作"——这是审计层（goal 闭环）能成立的本体论前提（账本行 records 动作）。
3. **新增动作须过三问**：治理载体是什么？留痕载体是什么？它变换的状态属于哪个对象类型？——三问无答案的"新动作"不进实现。
