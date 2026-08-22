---
name: open-source-skill-fusion
description: "调研开源 agent 项目并融合增强 Hermes 集群：clone→深读→分析→提取→落地。"
version: 1.1.0
metadata:
  hermes:
    tags: [devops, research, agent-behavior, skill-fusion, open-source]
    related_skills: [agent-skill-repo-analysis, open-source-architecture-research, pua-pressure-engine, agent-harness-best-practices]
---

# 开源 Skill 融合增强

> 从 tanweai/pua + DenisSergeevitch/agents-best-practices 两轮融合实践中提炼。
> 定位：将外部开源 agent skill/harness 项目的核心能力消化吸收后，创建 Hermes skill + patch 核心文件，增强 29-profile 集群。
> v1.1.0：新增 openai/codex 调研知识库 + 两条纪律性 pitfall（数字实测、gap 双向查证）。

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
| `references/deepseek-harness-rc8-patterns.md` | DeepSeek Harness rc.8 可移植模式知识库（Profile Bundle 子代理/reportDelivery 唤醒/web_search 并发/推理强度三层级联，file:line 已验证 + Hermes 落地状态） |
| `references/openai-codex-architecture-patterns.md` | OpenAI Codex 完整分析（133-crate 全景、Guardian fail-closed 二审、execpolicy 判例法、角色投影 9 维、Goals 反偷懒审计、compaction=交接、四件套生态、gap 判定与落地状态） |

## Pitfalls

### 1. skill_manage 对非 orchestrator skill 报 not found
`github-profile-distribution` 等属于 default profile 的 skill，从 orchestrator
执行 `skill_manage(action='patch')` 会报 not found，即使 `skill_view` 能读
（orchestrator skills 目录部分 symlink 到 default profile）。
补救：用 `action='create'` 在 orchestrator profile 重建超集版本（原内容零损失）。
本 skill 自身（open-source-skill-fusion）即挂载于 default profile，2026-08-21
更新时已按此路径重建为 v1.1.0。

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

### 6. 新 skill 的可见性验证（2026-08-21 codex 融合实证）

新 skill 落盘后**必须立即验证可加载**，否则整个融合协议空转：

```bash
# 落盘后立即验证（缺一不可）
hermes skills list | grep <skill-name>          # 索引器收录
hermes -z "只回 YES" --skills <skill-name>        # 子会话可加载
```

**三大不可见根因**（codex-guardian-review 落地后实测踩中两个）：
1. 落在 `_shared/skills/` 平铺目录 → **索引器不收录**（只收 profile 树 `<分类>/<名>` 二级结构）
2. profile `config.yaml` 的 `skills.disabled` 显式列表误伤（历史瘦身残留）
3. frontmatter `name` 与目录名不一致

**修法**：profile 侧 `skills/<分类>/<名>` symlink 指向实体 + 检查 disabled 列表。
融合方案阶段就要把"可见性验证"写进执行步骤的最后一项，不能交付后再补。

### 7. 研究报告的数字必须实测（2026-08-21 蓝军 B+ 教训）

融合调研报告中的概数（crate 数/规则条数/模式数）**禁止目测估算**——蓝军会逐一证伪。
本轮实证：写"112 个 crate"被证伪为 133（cargo metadata 实测）、"60+ 条规则"实为 10 outcome/52 bullet、
"5 种模式"实为 3。**纪律**：报告里每个数字必须能追溯到一条真实命令输出（`cargo metadata`/`grep -c`/`wc -l`）。

### 8. Gap 分析必须双向查证，防贬低 Hermes 已有能力（2026-08-21 蓝军教训）
宣称"Hermes 缺 X"之前，必须先在 Hermes 侧实测查证：grep SOUL.md /
orchestrator_rules.md / profile 目录（config、db、spawn-trees 等）。codex
调研中 G3（宣称无 completion-unproven 纪律——实际 SOUL 已有证伪主义三条 +
验收门 + verification_evidence.db）和 G7（宣称无谱系持久化——实际有
spawn-trees/）都被蓝军抓为"未查证即下结论"。正确姿势：gap 表的 Hermes
现状列必须带证据来源；已有雏形的 gap 降格为"增强项"并下调优先级，而不是
按"从零新建"排 P1。

### 9. 扫描报告数字必须抽检复现，防假前提升级为 P0 动作（2026-08-21 Better Harness 蓝军教训）

融合方案直接引用上游扫描报告的数字前，**必须机械复现至少 3 个关键数字**。
Better Harness 融合实证：扫描报告写"[已移除] SOUL.md 0 次引用 skill"，
蓝军用 `grep -ci skill` 实测为 6 次，且明确加载 2 个 skill——假前提被升级为
P0 动作"每个 [已移除]-* profile 至少列出 3 个核心 skill"，返工 1-2 小时。
**纪律**：方案里每个上游数字必须带复现命令 + 实测输出，不接受"扫描报告说"。

### 10. 分层批量补齐模式（Tier 1/2/3）+ 锚点优先级策略（2026-08-21 Better Harness 融合实战）

大规模 SOUL.md 批量修改（如 22 个 profile 补同一规则引用）的标准流程：

**Step 1 分层**：不按"全部补齐"一刀切，按规则重要性分 Tier：
- Tier 1 全员强制（基础治理四件套：verification/output-contract/ontology/shared-rules）
- Tier 2 安全敏感团队（banned-command/defensive-patterns/mandatory-privacy → hack/ops/worker/[已移除]）
- Tier 3 领域特定（marking-rules → orchestrator/platform；kanban-advanced → worker/orchestrator）

**Step 2 锚点优先级**：27 个 profile 的 SOUL.md 结构不统一，按优先级序列找插入锚点：
```
"## 验证清单" → "## 输出契约" → "## 标准作业循环" → "## 共享规则" → "## 具体操作命令手册" → "## 红线"
```
实测 44 处插入全部命中（0 处无锚点）。

**Step 3 dry-run 先行**：生成 JSON 清单（profile × rule × anchor_line × insert_text），
人工复核后再执行。

**Step 4 从后往前插入**：同一 profile 多条规则插到同一锚点时，按 anchor_line 降序插入，
避免行号偏移。

**Step 5 审计复验**：批量修改后重跑 `audit-soul-rules.sh`，确认覆盖率从 X% → Y%。

### 11. macOS bash 3.2 兼容性（2026-08-21 实战踩坑）

`~/.hermes/bin/` 下的脚本在 macOS 默认 bash 3.2 上运行，**禁止用 `declare -A`（关联数组）**。
替代方案：用 `mktemp` 临时文件存 key-value 对，配合 `trap "rm -f ..." EXIT` 清理。

### 12. Shadow 模式设计（不改代码的强制校验）（2026-08-21 P2-1 实战）

需要给现有工具加"强制校验"但不想改代码时，用 Shadow 模式：
1. 在 SOUL.md 写"建议包含 X 字段"（非强制）
2. 写独立审计脚本定期扫描覆盖率（只记录不拦截）
3. 运行 1 周后评估：覆盖率 ≥80% → 转正（改代码加硬校验）；<80% → 分析原因
关键：豁免规则必须明确（如 [已移除] 轻量任务 test/build 可为 skip）。

### 13. 多 Harness 统一治理框架合并模式（2026-08-21 5 套 Harness 融合实战）

当需要把多套外部 Harness（如 Better Harness + HarnessEval + Codex + DSH + 麦肯锡）
融合为统一框架时，**不要逐套串行落地**，按以下模式：

**Step 1 冲突映射**：先列出所有方案修改同一文件/同一概念的冲突点
（如 kanban_comment 模板被 3 个方案同时修改），明确合并策略和修改顺序。
产物：`conflict-map.md`（冲突点 × 方案 × 合并策略 × 修改顺序）。

**Step 2 分层抽象**：把各方案的核心机制按"模型层/证据层/质量门/工作流/适配层"五层归类，
找出同层可合并的机制（如 Better Harness 7 态证据 + Codex L1-L4 + HarnessEval fail-closed
→ 统一为 S0-S4 五级谱系）。

**Step 3 三环模型**：生产环（任务执行五维）→ 评估环（Plan/Route/Decompose/Verify）→
治理环（Guardian/健康度/申诉），三环互为输入输出。

**Step 4 统一落地顺序**：按"已落地→零代码→shadow→代码"排序，避免并行修改同一文件。
本轮 7 批修改顺序：Better Harness P0 → HarnessEval P0 → Codex P1 → Better Harness P1 →
HarnessEval P1 → 麦肯锡 P2 → DSH P2。

**关键纪律**：统一框架文档必须包含"明确不吸收清单"（防削足适履）和"风险与回退表"。

### 14. 跨文档数字一致性校验（2026-08-21 蓝军 critical 教训）

同一天产出的多份融合方案/扫描报告引用同一基础事实（如 skill 分类数、profile 引用率）时，
**必须交叉校验数字一致性**。本轮实证：HarnessEval 扫描写"45 分类"，
Better Harness 融合写"44 分类"——实测 45，至少一份有误。
**纪律**：写完每份文档后，用 `grep` 跨文档抽查 3 个共享数字，确保一致。

## Related Skills

- **agent-skill-repo-analysis** — 分析 SKILL.md 型开源项目的阅读策略
- **open-source-architecture-research** — 分析代码型开源项目的阅读策略
- **github-profile-distribution** — 将融合后的 skill 同步到 GitHub 仓库
- **cognition-self-check** — 执行前防线（已有）
- **loop-engineering-gates** — 完成时验证门（已有，融合后增强）
