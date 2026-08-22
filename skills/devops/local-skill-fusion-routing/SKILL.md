---
name: local-skill-fusion-routing
description: "调研本机skill包并双通道融合(Claude Code vs Hermes)。含副本判定+看板扩scope。"
version: 1.0.0
metadata:
  hermes:
    tags: [skill-fusion, local-research, dual-channel, kanban-orchestration]
    related_skills: [open-source-skill-fusion, fusion-implementation-patterns, kanban-orchestrator, claude-code-project-skills]
---

# 本地 Skill 包调研与双通道融合路由

> 2026-08-06 BMAD + maestro + swarm-yuan 三源融合任务编排实践提炼。
> 补充 `open-source-skill-fusion`（default profile，GitHub 仓库向）：本 skill 覆盖**本机 skill 包**调研 + **编排/编码双通道分流**两个它未覆盖的变体。

## When to Use

- 用户要求调研**本机已有的 skill 包**（而非 GitHub 仓库）并融合增强
- 终态架构是 **agent team 调度编排 + 外部编码 agent（Claude Code/Codex）执行开发** 时的融合分流
- 用户在调研任务已创建后**中途追加新调研对象**
- GitHub 调研目标名称有歧义需消歧

## 1. 本地 skill 包侦察流程

调研对象是本机 skill 包时（如 swarm-yuan），与线上仓库流程的差异：

### 1.1 多副本定位

```bash
mdfind -name <pkg> | head -10
find ~ -maxdepth 3 -iname "*<pkg>*" 2>/dev/null | grep -v Library
```

典型副本位置：`~/.claude/skills/`、`~/.codex/skills/`、`~/.cc-switch/skills/`、`~/.agents/`、`~/.hermes/skills/`、源 git 仓库（可能在 `/Volumes/.../lab/`）。

### 1.2 权威副本判定

各副本可能不同步（内容漂移）。判定方法：

```bash
diff -rq <copyA> <copyB> | head -20        # 找差异
cd <源仓库> && git log --oneline -5          # 确认源版本
```

选文件最全/最新的副本作权威阅读源。实例：swarm-yuan 的 cc-switch 副本含 facts.conf + 完整 framework-gates（75 框架），比 codex 副本新。

### 1.3 入口文件别漏

除 skill 目录本身，必须读宿主 agent 的入口定义（如 `~/.claude/commands/<pkg>.md` slash command）——它定义 AI 执行流程，是最高信号文件之一。

### 1.4 侦察摘要写进任务体

orchestrator 的侦察结果（结构摘要、关键文件清单+行数、已知能力基线）直接写进 kanban 任务 body 的「已知结构摘要」节，节省 worker 重复侦察。

## 2. 双通道分流融合（编排 + 外部编码 agent 架构）

终态架构为 **Hermes agent team 调度、Claude Code 编码**（ACP 委托）时，融合评估必须分两通道，不能只产出 Hermes 侧清单：

| 通道 | 目标 | 能力类型 | 落地位置 |
|------|------|---------|---------|
| A → 外部编码 agent | 终端编码场景 | 项目内文件操作、bash 门禁、组件穷举、框架规则库、spec-driven 流程 | `~/.claude/skills\|commands\|agents` 或增强目标 skill 自身 |
| B → Hermes team | 编排调度 | 决策治理、任务路由、记忆写回、标记传播、跨会话协调 | SOUL.md / rules.md / _shared / 新建 Hermes skill |

**协同接口设计**（报告必备章节）：kanban 任务 → ACP 委托 → 编码侧门禁验收 → 结果回传的完整链路。

**同源去重**：外部项目与 Hermes 可能已有同源能力。实例：swarm-yuan `task-methodology-router` 与 Hermes `pua-methodology-router` 均源自 tanweai/pua；swarm-yuan 已做过 Palantir 标记传播映射（决策 28/29）与 Hermes markings 重叠。发现同源时判定以哪边为准，不重复移植。

## 3. 融合任务中途扩 scope 的看板操作

用户追加新调研对象时，**不要新建第二个融合任务**（会产生两个收敛点）：

1. `kanban_create` 新调研任务（与兄弟调研任务同 assignee）
2. `kanban_link(parent_id=<新调研>, child_id=<已有融合任务>)` 追加依赖边——融合任务自动等待新输入
3. `kanban_comment` 到融合任务：更新范围（N 源）、多方去重要求、新增约束（如双通道架构）

## 4. 调研前目标消歧

GitHub 同名项目很多（maestro 有 8+ 个：mobile-dev-inc E2E 测试、Netflix 工作流、Doriandarko Claude 编排…）：

```bash
gh search repos <name> --limit 8 --json fullName,description,stargazersCount
```

列候选后 `clarify` 让用户确认再建卡——调研错目标浪费整个 worker run。用户也可能直接给 URL 指向小众仓库（如 shariqriazz/maestro，93★），接受并继续。

## 5. 任务体必备要素（调研卡）

- 目标仓库/路径 + 权威副本位置 + stars/语言/分支
- 调研范围按 `open-source-skill-fusion` Step 1-2（clone→结构映射→高信号文件→结构化分析）
- **关键关注点**：与 Hermes 现有机制的映射问题（如 BMAD scale-adaptive ↔ 轻/中/重三级路由）
- **输出要求**：报告路径 + 可移植能力清单（三道防线分类）+ 每个能力标注目标文件
- **能力基线**（去重参考）：cognition-lattice、pua-pressure-engine、pua-methodology-router、agent-harness-best-practices、loop-engineering-gates、harness-entropy-management、Palantir ontology+markings
- 约束：严禁编造（引用真实路径+行号）、调研未完成前不提方案

## Pitfalls

### 1. orchestrator 侧 skill 多为 default profile 实体的 symlink

`skill_view`/`skills_list` 能读的 skill（含 devops 分类下大部分），`skill_manage` patch 时可能报 "not found in active profile... exist in other profiles: 'default'"。skill_manage 无 cross_profile 参数，无法越权。应对：在 orchestrator profile 创建新 class-level skill 承接经验（本 skill 即此产物），或建议用户 `hermes curator adopt <name>`。

### 2. kanban_link 参数顺序

`kanban_link(parent_id=..., child_id=...)`——parent 在前。写反会把错误的任务降级到 todo。

### 3. workspace_kind 必显式指定

所有 kanban_create 必须显式 `workspace_kind="dir"`（调研类）或 `"worktree"`（代码类），**禁 scratch**（产物自动删除）。
