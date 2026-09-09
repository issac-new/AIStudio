---
name: swarm-yuan-componentization
description: "Use when turning a repo into a swarm-yuan skill, 5 gates."
version: "0.1.0"
trigger: "组件化工程 / 存量项目重构 / swarm-yuan 技能生产"
---

# Swarm-Yuan Componentization — 机制执行层核心技能

> 三层投影中的**机制执行层**：把「人定方向 · 机器守门 · AI 干活」的守门机制落进编码回路。
> 定位：按严格组件化工程规范调研掌握项目后，借助行业 skill 及成熟能力，重构成一个完整的 swarm-yuan skill——既有通用需求分析/架构设计/编码能力，又有特定应用仓库的工程规范约束。

---

## 一、什么是 swarm-yuan skill

一个 swarm-yuan skill = **通用工程能力** + **仓库特化约束** 的复合体：

```
swarm-yuan skill
├── 通用层（行业沉淀，可复用）
│   ├── 需求分析（rd-clarify / rd-analyze 方法论）
│   ├── 架构设计（architecture-design 模式库）
│   └── 编码回路（rd-apply + TDD + code-review 门）
└── 特化层（本仓库沉淀，不可迁移）
    ├── 工程规范（命名/目录/依赖/构建约定，来自调研）
    ├── 验收命令（build/test/lint 具体命令与预期退出码）
    └── 禁区清单（不可触碰的模块/文件/模式）
```

**守门点**：特化层的验收命令就是「机器守门」的物理载体——AI 每轮编码后必须跑，红即打回，无自由裁量。

---

## 二、生产流程（五阶段，每阶段有出口门）

### 阶段 1：调研掌握（Survey）
- **输入**：目标仓库路径
- **动作**：codebase-inspection（LOC/语言/依赖分布）→ 分层映射（entry/domain/infra）→ 定向深读核心链路
- **产出**：`survey.md`（架构图 mermaid + file:line 锚点 + 工程规范清单初稿）
- **出口门**：能不看书回答「这个仓库改一个典型需求要动哪几层、跑什么命令验证」

### 阶段 2：规范提炼（Distill）
- **动作**：从调研产物提取 → ① 命名/目录/依赖约定 ② 构建/测试/lint 命令及预期退出码 ③ 禁区清单 ④ 已知坑与修复模式
- **产出**：`conventions.md` + `acceptance-commands.yaml` + `forbidden-zones.md`
- **出口门**：acceptance-commands 中每条命令在本仓库实跑 exit=0（Exercised 证据）

### 阶段 3：Skill 组装（Assemble）
- **动作**：按 skill 模板组装 SKILL.md：frontmatter → 通用层引用（devops-rd 各阶段）→ 特化层内嵌（conventions/acceptance/forbidden 全文内嵌，无支持件依赖）
- **产出**：`swarm-yuan-<repo-name>/SKILL.md`
- **出口门**：skill_view 可完整加载；无 `[SKILL_PRUNED]`；acceptance 命令可直接 copy-paste 执行

### 阶段 4：回路验证（Gate-Check）
- **动作**：用它实际编码一个典型需求（真实小任务）→ 每轮跑 acceptance-commands → 验证守门有效（红会打回、绿才放行）
- **产出**：验证记录（哪轮被门拦下、修了什么）
- **出口门**：≥1 次真实拦截记录 + 最终全绿。**无拦截记录 = 门没生效 = 未完成**

### 阶段 5：注册流通（Register）
- **动作**：登记 `~/.hermes/profiles/_shared/06-observability/skill-catalog.md`（架构层=05-eng-execution，适用 profile=目标仓库团队）→ 派发给对应 worker profile
- **出口门**：catalog 行存在 + 目标 profile skills 声明含此 skill

---

## 三、增量模式（既有 swarm-yuan skill 的演进）

仓库演化后 skill 必须跟：
1. **触发**：仓库工程规范变更（构建系统/目录结构/验收命令变化）
2. **流程**：重跑阶段 1-2 的增量部分 → patch SKILL.md 特化层 → 阶段 4 回归
3. **纪律**：特化层变更必须 kanban_comment 留痕（改了哪条约定/为什么）；通用层变更禁止仓库级私改（回上游）

---

## 四、与既有机制的关系

| 机制 | 关系 |
|------|------|
| devops-rd 8阶段 | swarm-yuan 通用层直接引用其 verify-requirement/rd-apply/rd-validate，不重复造 |
| acceptance-commands.yaml | 即 kanban body「验收标准（frozen: true）」的命令级展开——worker 无权改命令 |
| 禁区清单 | 与 action-risk 可逆性分级联动：禁区=默认不可逆区，动前必须 staged-action-proposal |
| review-gates Diamond 门 | 阶段 4 的 Gate-Check 对应门 4（Asset 门：产物可复用性） |

---

## 五、反模式

- ❌ 跳过阶段 4 直接注册——「门存在但没拦过东西」= Present 级证据，不算完成
- ❌ 特化层引用外部文件——skill 必须自包含（skill 写权限限制：支持件常被拒）
- ❌ acceptance 命令写成自然语言——必须是可机械执行的 `command + expected_exit_code`
- ❌ 一个 swarm-yuan skill 覆盖多个仓库——特化层会打架，一仓一 skill

---

## 六、状态

- v0.1.0（2026-09-07）：方法论骨架落地（本文件）
- 下一步：选定第一个目标仓库实跑五阶段，产出首个 swarm-yuan skill 实例（阶段 4 拦截记录是首个 Exercised 证据）