---
name: open-source-skill-fusion
description: "调研开源 agent skill/harness 项目，消化吸收后融合增强 Hermes 集群。覆盖：clone→深度阅读→结构化分析→提取可移植能力→创建 skill/patch 核心文件→验证。适用于研究 SKILL.md 型项目（PUA、agents-best-practices 等）并融合进 Hermes。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, research, agent-behavior, skill-fusion, open-source]
    related_skills: [agent-skill-repo-analysis, open-source-architecture-research, pua-pressure-engine, agent-harness-best-practices]
---

# 开源 Skill 融合增强

> 从 tanweai/pua + DenisSergeevitch/agents-best-practices 两轮融合实践中提炼。
> 定位：将外部开源 agent skill/harness 项目的核心能力消化吸收后，创建 Hermes skill + patch 核心文件，增强 29-profile 集群。

## When to Use

- 用户说"调研分析 GitHub 项目 X 并融合增强 Hermes"
- 用户说"消化吸收 XXX 的理念完善 hermes agent 集群"
- 需要将外部 agent 行为协议（PUA 话术、Harness 工程规则等）移植为 Hermes skill
- 需要将外部 agent 架构模式（四权分离、循环不变量等）patch 进 SOUL.md/rules.md

## Core Workflow (5 steps)

### Step 1: 深度调研（clone + 阅读源码）

1. `git clone --depth 1` 目标仓库到 `/tmp/`
2. `find . -maxdepth 3 -type f` 映射目录结构
3. 按优先级阅读高信号文件（SKILL.md → hooks → agents → references → README）
4. 对 SKILL.md 型项目用 `agent-skill-repo-analysis` skill 的阅读策略
5. 对代码型项目用 `open-source-architecture-research` skill 的阅读策略

**关键**：不只读 README，必须读 hooks/*.sh 和 agents/*.md——它们包含确定性实现，
不是 prompt 级建议。

### Step 2: 结构化分析

产出包含以下维度的分析报告：

| 维度 | 分析内容 |
|------|---------|
| 架构与模块 | skill 层级、hook 系统、agent 花名册、reference 文档 |
| 核心能力 | 三大支柱、升级系统、模式检测、路由、治理 |
| 工作流设计 | 单任务流、多 agent 拓扑、循环/迭代设计 |
| 独有特性 | 与同类项目的差异化 |
| 技术栈 | skill 格式、hook 语言、状态存储、测试 |
| 融合评估 | 可移植 vs 不建议移植，gap 分析 |

### Step 3: 提取可移植能力

按"三道防线"模型分类可移植能力：

| 防线 | 定位 | 触发时机 | 典型来源 |
|------|------|---------|---------|
| 执行前 | 认知自检 | 任务开始前 | cognition-lattice, cognition-self-check |
| 执行中 | 压力升级+失败检测 | terminal 连续失败 | PUA failure-detector, pressure escalation |
| 完成时 | 验证门+防作弊 | kanban_complete 前 | PUA harness-governance, loop-engineering-gates |
| 持续维护 | 熵管理+定期清理 | 周期性 | agents-best-practices entropy management |

**不建议移植的判断标准**：
- 依赖 Claude Code 式 hook 生命周期 → Hermes 用 skill + cognition 代替
- 排行榜/段位系统 → 与集群定位不符
- 平台特定 slash command → Hermes 用 skill_view 加载
- Hermes 已有等价机制（goal_mode, Human Gate, kanban_block 等）

### Step 4: 创建 skill + patch 核心文件

#### 创建新 skill

每个新 skill 应是 class-level（不是 session-specific）：

| skill 类型 | 命名规则 | 示例 |
|-----------|---------|------|
| 行为协议 | `<source>-<capability>` | pua-pressure-engine, pua-methodology-router |
| 架构参考 | `<domain>-<concept>` | agent-harness-best-practices |
| 维护流程 | `<domain>-<action>` | harness-entropy-management |

skill 内容结构：
```markdown
---
name: <skill-name>
description: "<57字符以内触发描述>"
version: 1.0.0
metadata:
  hermes:
    tags: [...]
    related_skills: [...]
---
# <Title>
> 来源：<repo>，适配 Hermes 环境。
## 触发条件 / When to Use
## 核心内容（表+代码块）
## 与其他 skill 的联动
## 与 Hermes 的集成映射
```

#### Patch 核心文件

| 文件 | Patch 内容 | 注意事项 |
|------|-----------|---------|
| `SOUL.md` | 新增强制规则块（最高优先级） | 用 `## 🔴 强制规则：` 前缀；放在认知自检块之后 |
| `loop-engineering-gates.md` | 增强验证门检查项 | 保留原有内容，在末尾追加新段落 |
| `orchestrator_rules.md` | 增加路由表/规则 | 按 §0.5.N 编号递增 |
| `_shared/*.md` | 共享参考文件增强 | 这个文件被所有 profile 读取 |

**Patch 技巧**：
- 用 `patch` 工具的 `mode='replace'`，匹配文件末尾的唯一字符串
- 如果文件被 `offset/limit` 分页读取过，重新 `read_file` 全文再 patch
- patch 后用 `grep -c` 验证关键词数量

### Step 5: 验证

1. `skill_view(name)` 加载每个新 skill，确认 `readiness_status: available`
2. `grep -c` 验证 patch 的关键词出现在目标文件中
3. `wc -l` 确认文件行数增长符合预期
4. 如果发布到 GitHub，用 `github-profile-distribution` skill 的 5 步流程同步

## Fusion Pattern: 三道防线体系

经过两轮融合（PUA + agents-best-practices），Hermes 集群形成了完整的四层防线：

```
执行前 → cognition-self-check + cognition-lattice（已有）
    ↓    认知偏差自检 + 思维模型选择
Harness 边界 → agent-harness-best-practices（新增）
    ↓    模型提议 → Harness 验证/授权/执行 + 循环不变量 + 风险分类
方法选择 → pua-methodology-router（新增）
    ↓    14种方法论 × 五看板路由 + 失败切换链
执行中 → pua-pressure-engine（新增）
    ↓    L0-L4 压力升级 + 失败模式检测 + 深层换框
完成时 → loop-engineering-gates（增强）+ pua-harness-governance（新增）
    ↓    四权分离 + 候选vs最终 + 压缩交接 + 机械不变量
持续维护 → harness-entropy-management（新增）
    ↓    定期清理 + 文档新鲜度 + 重复失败分析
```

## Reference Files

| File | Content |
|------|---------|
| `references/pua-pressure-escalation-architecture.md` | tanweai/pua 完整分析（三能力支柱、L0-L4、SPINNING/EXPLORING/MIXED、方法论路由、四权分离、PUA Loop Oracle） |
| `references/harness-best-practices-architecture.md` | agents-best-practices 完整分析（10规则、L0-L5成熟度、16组件、7循环不变量、14风险类、压缩交接、六层防护、熵管理） |

## Pitfalls

### 1. skill_manage 对非 orchestrator skill 报 not found
`github-profile-distribution` 等属于 default profile 的 skill，从 orchestrator
执行 `skill_manage(action='patch')` 会报 not found，即使 `skill_view` 能读。
替代方案：用 `action='create'` 创建新 skill 到 orchestrator profile。

### 2. 上下文压缩时遗忘 patch 的文件
session 较长时，之前 patch 的文件内容可能被压缩。patch 前务必重新 `read_file`
目标文件的完整内容（不用 offset/limit），确认匹配字符串唯一且当前。

### 3. 新 skill 的 description 必须自包含
系统提示只显示 description 前 57 字符。触发条件必须在这 57 字符窗口内
自包含，不能依赖 skill body 中的上下文。

### 4. Hermes 无 Claude Code 式 hook
PUA 的 `failure-detector.sh`、`integrity-guard.sh` 等 shell hooks 依赖
Claude Code 的 PostToolUse/PreToolUse 生命周期。Hermes 没有这个机制——
用 skill + 认知自检 + Loop Engineering 验证门代替确定性 hook。

### 5. 融合后须更新 GitHub 发布
创建/patch skill 后，如果用户要求发布到 GitHub，用 `github-profile-distribution`
的 5 步流程同步。注意 skills 目录是 symlink，需用 `shutil.copytree(symlinks=True)`
保留符号链接。删除 `skills/.curator_backups/`（含旧邮箱/路径）。

## Related Skills

- **agent-skill-repo-analysis** — 分析 SKILL.md 型开源项目的阅读策略
- **open-source-architecture-research** — 分析代码型开源项目的阅读策略
- **github-profile-distribution** — 将融合后的 skill 同步到 GitHub 仓库
- **cognition-self-check** — 执行前防线（已有）
- **loop-engineering-gates** — 完成时验证门（已有，融合后增强）
