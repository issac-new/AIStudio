> **何时读我**：任务命中本文档主题时按需读取（路由表见 SKILL.md）。首行：# Subagent 编排模式 (Subagent-Driven Development)

# Subagent 编排模式 (Subagent-Driven Development)

> 来源：[superpowers](https://github.com/obra/superpowers) `subagent-driven-development` 方法论。
> 本文件指导目标技能的 workflow 节点⑤（编码实现）如何采用 subagent 编排模式。
> **仅引用方法论模式，不复制 superpowers 源码。**
> **superpowers v6.3 要点**：① brainstorming 仪式按任务规模缩放——请求分类为 spike/bounded/architectural，小任务跳过双文档仪式（与 swarm-yuan `task-scale.sh` 任务规模判定一致：轻任务轻流程）；② plan 冲突处理：非灾难性冲突记录裁决后继续，仅破坏性/不可逆操作才停人（避免可控冲突拖死会话）；③ ECC v2.1 Plan Canvas——plan review 为浏览器可视化界面（点击批注/侧栏对话/Approve 按钮），降低 plan 审查的认知负担。

## 核心理念

**为什么用 subagent？** 上下文隔离。为每个任务派发一个全新的 subagent，精确构造其指令与上下文，使其专注并成功完成任务。subagent **不继承**主会话的上下文与历史——你构造它正好需要的内容。这也保留主会话的上下文用于协调工作。

**核心公式（来源：superpowers）：**
> Fresh subagent per task + task review (spec + quality) + broad final review = high quality, fast iteration

## Orchestrator / Spawn-Collect 循环

主会话（controller）的职责是**协调**，不是直接编码：

```
1. 读 plan 一次，记录上下文 + 全局约束，创建 todos
2. Pre-Flight Plan Review — 扫描一遍，找出相互矛盾或违反全局约束的任务；
 批量汇总成一个问题问人（不是一个发现一个中断）
3. 每任务循环：
 a. 派发全新 implementer subagent（带 task brief）
 b. 若 implementer 提问 → 回答、提供上下文、重新派发
 c. implementer 实现、测试、提交、自审，回报状态
 d. controller 派发 task reviewer subagent（审查 spec 合规 + 代码质量）
 e. 若有问题 → 派发 fix subagent → 重新审查
 f. 标记任务完成 + 追加 progress ledger；下一个任务
4. 全部任务完成后 → 派发 final whole-branch reviewer → 收尾
```

## 文件交接（Context Hygiene）

**铁律：粘贴进 dispatch prompt 的内容会常驻 controller 上下文整个会话。** 所以交接用**文件路径**，非粘贴文本：

- task brief → 写入唯一命名的文件，prompt 里只给路径（"read this first — it is your requirements"）
- implementer 报告 → 写入 report 文件（`task-N-report.md`），prompt 里给路径 + 报告契约
- 审查包 → diff 写入文件，reviewer prompt 给文件路径

dispatch prompt 应含：(1) 一句话说明任务位置；(2) brief 路径；(3) 前序任务的接口/决策；(4) controller 对歧义的裁决；(5) report 路径 + 报告契约。

> 反模式（来源：superpowers）：一个真实会话的 dispatch 达 42k 字符，其中 99% 是粘贴的历史。

## 状态回报契约

implementer 回报**仅**短状态 + 提交 + 一行测试摘要 + concerns + report 路径：

| 状态 | 含义 | controller 处理 |
|------|------|----------------|
| `DONE` | 完成且自审通过 | 派发 reviewer |
| `DONE_WITH_CONCERNS` | 完成但有顾虑 | reviewer 重点看 concerns |
| `NEEDS_CONTEXT` | 需要更多信息 | 回答后重新派发 |
| `BLOCKED` | 无法继续 | 见下方处理 |

**BLOCKED 处理（来源：superpowers，不可忽略）：**
1. 上下文问题 → 提供更多上下文，同模型
2. 需要推理 → 用更强模型
3. 任务太大 → 拆分
4. plan 错了 → 上报人类

> "绝不忽略 escalation，也绝不迫使同一模型无变化地重试。"

## 两阶段审查

每任务完成后，派发 **task reviewer**，产出**两个判决**：

1. **Spec 合规** — 实现是否符合 spec/proposal 的要求
2. **代码质量** — 可读性、测试覆盖、错误处理、风格

若有 Critical/Important 发现 → 派发 fix subagent → 重新审查。Minor 发现记入 ledger，留待 final review。

**final whole-branch review** — 全部任务完成后，对整个分支做一次广审。

## 修复环 + 五轮熔断（Resume-based Fix Loop）

> 来源：superpowers v6.2.0 SDD（subagent-driven-development）。修复环采用「resume 原实现者 + 五轮熔断 + controller 逐条 adjudicate」模式，作为 swarm-yuan workflow 节点⑤（编码实现）的修复环指引。

**核心问题**：每轮修复都 fresh dispatch 新 implementer 会丢失前序上下文（已试过什么、为什么不行），导致重复踩坑；但无限重试又会烧预算。需要一个"先 resume、超轮次再 fresh+更强模型、到顶则 controller 接管"的分级策略。

**五轮熔断模式**（来源：superpowers v6.2.0 SDD）：

| 轮次 | 策略 | 理由 |
|------|------|------|
| **第 1-3 轮** | **resume 原实现者**（带 open findings） | 原实现者有任务上下文，resume 比重新 onboard 快且省 token；多数修复在前 3 轮解决 |
| **第 4-5 轮** | **fresh dispatch + 更强模型**（如升 sonnet->opus） | 前 3 轮未解决说明原实现者能力或视角不足；换更强模型 + fresh 视角破局 |
| **第 5 轮（熔断）** | **controller 逐条 adjudicate** | 熔断后不再派发；controller 对每个 open finding 自行裁决（接受/拒绝/转人工），**每条 adjudication 入 ledger，禁止静默丢弃** |

**关键纪律**：
1. **第 1-3 轮用 resume，不 fresh**--"resume-the-implementer semantics instead of fresh dispatches"（来源：superpowers v6.2.0）。fresh dispatch 在前 3 轮是浪费上下文。
2. **第 4-5 轮才 fresh + 升模型**--前 3 轮未解决是能力信号，换更强模型 + fresh 视角。
3. **熔断后 controller adjudicate，不静默丢弃**--"silent discards are forbidden"（来源：superpowers v6.2.0）。每个 open finding 须有显式裁决入 ledger（`decisions.jsonl`，type=Taste，附 rationale）。
4. **不在第 5 轮前提前熔断**--"Adjudicating earlier to end a loop is pre-judging with a different name"（来源：superpowers v6.2.0）。提前 adjudicate 等于用 controller 的主观判断替代修复努力。

### Scoped Re-review（只验修复 diff）

> 来源：superpowers v6.2.0 `re-review-prompt.md`。re-reviewer 只验修复，不重读全任务。

**核心问题**：修复后重新跑完整两阶段审查（重读全任务 spec + 全部代码）成本高且信噪比低--修复通常只动一小块，全量复审会把无关的旧问题重新报一遍。

**scoped re-review 模式**：
- re-reviewer **只看 fix diff**（修复改了什么），不看全任务。
- 对每个 open finding 产出**逐条判决**：`ADDRESSED`（已修复）/ `NOT ADDRESSED`（未修复）/ `PARTIALLY_ADDRESSED`（部分修复，附说明）。
- **检查 fix diff 是否引入新破坏**（new breakage）--修复 A 时不能弄坏 B。
- **out-of-scope 观察入 ledger，不入修复环**--re-reviewer 若发现与本次 findings 无关的新问题，记入 progress ledger 留待 final review，不中断当前修复环。

**与两阶段审查的关系**：两阶段审查（§两阶段审查）是任务完成后的**首次**审查；scoped re-review 是修复后的**后续**审查。首次全量，后续 scoped，降低成本同时保持覆盖。

### 在目标技能中的落地

- workflow 节点⑤（编码实现）的"质量门禁"要素标注修复环策略（1-3 轮 resume / 4-5 轮 fresh+更强模型 / 第 5 轮 adjudicate）。
- 修复环的每轮 adjudication 记入 `decisions.jsonl`（type=Taste，附 rationale；熔断裁决 type=UserChallenge 因涉及方向性决策）。
- scoped re-review 的逐条判决（ADDRESSED/NOT_ADDRESSED）记入 progress ledger，与 findings 一一对应。

## 持久化进度（Progress Ledger）

**铁律：对话记忆不抗 context compaction。** 用 ledger 文件持久化进度：

- 位置：`<repo-root>/.swarm-yuan/sdd/progress.md`（或项目约定路径）
- 启动时 `cat` ledger；标记完成的任务 = DONE，不重新派发，从第一个未完成任务恢复
- 干净审查后追加：`Task N: complete (commits <base7>..<head7>, review clean)`

> 来源：superpowers："controllers that lost their place have re-dispatched entire completed task sequences — the single most expensive failure observed."

## 连续执行

**不要在任务之间停下来 check-in。** 执行 plan 的所有任务不停顿。停止的唯一理由：
- 无法解决的 BLOCKED
- 真正阻碍进展的歧义
- 所有任务完成

> "'Should I continue?' prompts and progress summaries waste their time."

## 模型选择

每次派发**显式指定模型**（省略会静默继承会话最贵模型）：
- 转录级任务（plan 已含完整代码）→ 便宜模型
- 集成任务 → 中档
- 架构与 final review → 最强模型

> "Turn count beats token price" — 最便宜模型在多步任务上要 2-3 倍轮次，reviewer/prose 实现者至少用中档。

## 构造 reviewer prompt 的禁忌

- 不要加开放式"检查所有用法"
- 不要让 reviewer 重跑 implementer 已跑过的测试
- **绝不预判发现**（"do not flag"、"treat as Minor at most"）— 让 reviewer 提出，在循环中裁决
- 全局约束块是 reviewer 的"注意力镜头"——从 spec 逐字复制精确值/格式/关系

## 与目标技能的整合

目标技能的 workflow 节点⑤应：
1. 引用本文件作为 subagent 编排指南
2. 在 plan-template.md 的 header 标注执行方式（subagent-driven 推荐 / inline 备选）
3. 在 scripts/state-machine.sh 中实现阶段状态持久化（survive compaction）

## superpowers v6 + comet v0.4 全量能力

> 来源：superpowers v6.1.1 + comet 源码调研；**comet 段以 v0.4.0 stable 为准**（0.4 架构：`.mjs` launcher + 稳定 CLI，无 Bash 脚本；`.comet/run-state.json`（机器态）与 `.comet.yaml`（用户可编辑）分离；阶段迁移写 `.comet/state-events.jsonl` 审计流）。

### superpowers 14 个 Skills

| Skill | 用途 | swarm-yuan 落点 |
|-------|------|----------------|
| `brainstorming` | 代码前 Socratic 设计精炼 | 4-Phase SOP Phase 1 可引用 |
| `writing-plans` | 设计→2-5 分钟任务（精确文件路径 + 验证步骤） | spec §4 tasks 可引用 |
| `executing-plans` | 批量执行 + 人工检查点 | workflow 节点⑤可引用 |
| `subagent-driven-development` | 每任务新 subagent + 两阶段审查 | 本文件核心引用 |
| `dispatching-parallel-agents` | 并发 subagent 工作流 | wave 并行可引用 |
| `test-driven-development` | 强制 RED-GREEN-REFACTOR（删违规代码） | `--test` 可引用 |
| `systematic-debugging` | 4 阶段根因（root-cause-tracing/defense-in-depth/condition-based-waiting） | check 段可引用 |
| `verification-before-completion` | 确保"真的修了" | goal-backward 可引用 |
| `requesting-code-review` | 审查前清单 + 对照 plan + 严重度阻断 | `--review` 可引用 |
| `receiving-code-review` | 回应反馈 | 审查闭环可引用 |
| `using-git-worktrees` | 隔离工作空间 | 并行执行可引用 |
| `finishing-a-development-branch` | merge/PR/keep/discard 决策 + worktree 清理 | workflow 节点⑦可引用 |
| `writing-skills` | 编写新 skill 的元技能 | swarm-yuan 自身可引用 |
| `using-superpowers` | 启动引导（SessionStart hook 注入） | 生成 skill 可引用 |

### comet 5 阶段状态机（v0.4.0）

| 阶段 | 稳定 CLI（0.4） | 产出 | swarm-yuan 落点 |
|------|------|------|----------------|
| Open | `comet state`/`guard` 子命令组 | proposal.md, design.md, tasks.md | workflow 节点②③可引用 |
| Design | 同上（阶段机统一入口） | Design Doc, delta spec | 4-Phase SOP Phase 2 可引用 |
| Build | `comet guard`（写保护） | 实现代码, commit | workflow 节点⑤可引用 |
| Verify | `comet guard --verify 语义` | verification_report | check 段可引用 |
| Archive | `comet archive` | delta spec 同步 + 归档 | workflow 节点⑦可引用 |

## ECC v2.0 编排方法论（orch-* + worktree 生命周期 + 上下文经济学）

> 来源：ECC v2.0.0（affaan-m/ECC）。orchestrator 组合模式与 worktree 生命周期管理用于 subagent 编排。

### orch-* 操作分类与规模分级

ECC 将 orchestrator 定义为**组合引擎而非重实现**：每个 `orch-*` 命令（`orch-add-feature`/`orch-change-feature`/`orch-fix-defect`/`orch-refine-code`/`orch-build-mvp`）只是**薄壳**，真正的执行逻辑委托给 `orch-pipeline` 引擎。

**操作分类（按触发条件）：**

| 触发条件 | 操作 | 说明 |
|---------|------|------|
| 能力缺失 | `orch-add-feature` | 新增能力 |
| 行为错误 | `orch-fix-defect` | 修复缺陷（须先写失败测试） |
| 行为不变、结构优化 | `orch-refine-code` | 重构 |
| 有 spec 文档 | `orch-build-mvp` | 按 spec 构建 MVP 垂直切片 |

**规模分级（blast radius 决定仪式复杂度）：**

| 级别 | 文件数 | 仪式 |
|------|--------|------|
| trivial | 1 文件 | 直接实现 |
| small | 2-3 文件 | 轻量 plan + 实现 |
| standard | 4-10 文件 | 完整 plan + 两阶段审查 |
| large | >10 文件/跨模块 | 完整 plan + 并行扇出 + 交叉验证 |

> **tie-breaker**：若涉及安全（认证/授权/注入/加密），强制 ≥standard 级。

**两阶段人工门（非全自动）：**
- **GATE 1**（plan 后）：人工确认 plan 合理，才进入实现
- **GATE 2**（commit 前）：人工确认实现符合 plan，才允许提交

### Worktree 生命周期状态机（8 状态 + salvage-before-delete）

ECC 的 worktree 生命周期管理从纯 git 事实推导 8 状态：

| 状态 | 含义 | 清理策略 |
|------|------|---------|
| `main` | 在 main 分支 | 不清理 |
| `detached` | 无分支 | 不清理 |
| `dirty` | 有未提交变更 | **永远保留** |
| `conflict` | 有 merge 冲突 | 不清理 |
| `merge-ready` | 可安全 merge | 保留 |
| `merged` | 已 merge 完成 | **可删除** |
| `stale` | 未 merge 且过时 | **salvage 后删除** |
| `idle` | 无活动 | 保留 |

**Salvage-before-delete 铁律：**
- `merged` → 直接删除
- `dirty` → **永远保留**（可能包含未提交工作）
- `stale`（未 merge 且过时）→ **先 push/bundle 到远端，再删除本地**——绝不盲删未 merge 的工作

**Lazy conflict prediction**：只在 worktree 干净且 branch 领先 main 时才运行 `git merge-tree` 预测冲突，避免对每个 worktree 都做昂贵检查。

### 上下文经济学（context economics）

ECC 的上下文管理规则（补充 swarm-yuan 的 token 预算）：

| 规则 | 说明 | swarm-yuan 落点 |
|------|------|----------------|
| **避免最后 20%** | 大型重构/高复杂度任务避免占满上下文窗口的最后 20%，留 buffer 防 compaction 截断 | subagent 编排的 dispatch 可引用 |
| **phase-boundary compaction** | 在逻辑阶段边界（plan 完成/审查完成/实现完成）手动 `/compact`，而非任意自动 compact | workflow 节点间可引用 |
| **低敏感度任务容忍更高利用率** | 简单任务可用到 80-90% 上下文，复杂任务须留 30%+ buffer | 按任务复杂度分级 |

### 团队编排（team-agent-orchestration）

- **工作项（work item）**：每个变更拆分为独立 work item，分配 owner agent
- **Kanban**：ready/running/blocked/done 四列，状态可视化
- **merge gates**：work item 合入前须过 merge gate（类似 swarm-yuan 的 precheck 门禁）
- **control pane 交接**：work item 状态写入 control pane，operator 可查看

### 迭代检索（iterative retrieval）

subagent 的上下文问题不是一次性给出全部上下文，而是**渐进式精炼检索**：
- 初始 dispatch 给最小必要上下文（task brief + 相关文件路径）
- subagent 若需更多信息，主动请求（NEEDS_CONTEXT）或自行用工具（Read/Grep/Graph）按需拉取
- 避免在 dispatch 时一次性粘贴大量历史（会常驻 controller 上下文）

### 状态回报契约的 ECC 扩展

ECC 的 `ecc.session.v1` 规范将 session 状态与 worker 健康分离：

| 概念 | 含义 | 独立字段 |
|------|------|---------|
| `state` | 生命周期状态（idle/running/complete/failed） | `workers[].state` |
| `health` | 运行健康状况（ok/degraded/error） | `workers[].health` |
| `runtime` | 运行时信息（model/tokens/duration） | `workers[].runtime` |
| `intent` | 任务意图 | `workers[].intent` |
| `outputs` | 产出物（文件/commit/PR） | `workers[].outputs` |
| `artifacts` | 中间产物（log/trace） | `workers[].artifacts` |

**swarm-yuan 的回报契约可扩展为：**
- 状态回报（DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED）= `state`
- 健康度（自审通过/有警告/有错误）= `health`
- 运行时信息（使用的模型/token 数/耗时）= `runtime`
- 任务意图（一句话说明）= `intent`
- 产出物（commit hash/文件路径）= `outputs`

### 控制面板（control pane）

ECC 的 control pane 是**本地只读 observability server**：
- 默认只读，mutation 须显式 `--allow-actions` 开启
- 聚合 session 状态 + worker 健康 + work item 进度
- 本地 HTTP server，无远程依赖

**swarm-yuan 的 state-machine.sh 可扩展：**
- 状态文件除 YAML 外，可同时写 JSON（供 control pane 消费）
- precheck 门禁结果写入 `.swarm-yuan/precheck-report.json`，control pane 读取展示

### comet 关键能力（swarm-yuan 可能没用到；v0.4.0）

| 能力 | 描述 | 价值 |
|------|------|------|
| **阶段写保护** | `comet guard` 在 open/design/archive 阶段硬阻止文件写入（0.4 稳定 CLI 形态） | 防阶段越界 |
| **机器态/用户态分离** | `.comet/run-state.json`（机器检查点）与 `.comet.yaml`（用户可编辑）拆分 | 状态治理可引用 |
| **阶段迁移审计流** | 每次迁移写 `.comet/state-events.jsonl` | 与 trace-log 同构 |
| **isolation 漂移检测 + Phase-Entry 自洽** | build/verify/archive 入口拦截分支漂移（`state rebind`）；phase 字段 vs 产出物存在性交叉检查 | 防环境漂移/非法跳阶 |
| **Context compression handoff** | Design Doc + SHA256 引用替代全量 Spec 摘录（25-30% token 节省） | token 优化 |
| **Red Flags 反合理化清单** | 5 条 agent 自检（不能替用户决定/无大小例外/历史偏好≠当前确认/不反对≠同意/未验证≠通过） | 执行准则可引用 |
| **Preset 升级标准** | hotfix/tweak 自动检测是否需升级 full workflow（3+ 文件/架构变更/新公共 API） | 因地制宜可引用 |
| **Debug Gate 协议** | 失败强制加载 systematic-debugging + 根因定位前不修源码 | check 段可引用 |
| **verify 失败回 Build + 归档确认入机器态** | 失败自动回 3 条可执行发现 + 连续失败计数持久化 + CRITICAL 不可豁免；未确认归档被拒（防绕过确认） | 修复环/决策点可引用 |

### comet 0.4.0 实操层七机制（本仓 research/comet 克隆（0.4.1 tag）源码/README A 级直查核验 + 《Harness实践》文章 C 级补充）

| 机制 | 语义 | 与 swarm-yuan 的关系 |
|------|------|---------------------|
| **Native 四相流程** | 压缩仪式：非 full 流程 Open 直进 Build（克隆 classic 状态机 `workflow!=="full"` 分支 A 级证实；"Shape→Build→Verify→Archive"相名为文章用语） | 与任务路由"避免全任务全仪式"同构；目标技能 workflow 可按模型/任务档提供轻流程变体（暂未落地） |
| **独立只读 Verifier** | Verify 相由无写权限独立 agent 验收（详见 review-methodology.md） | 三权分立司法权的上游组织形态 |
| **resume-probe 四值恢复探测** | 会话中断后只读探测，返回 auto_resume / ask_user / out_of_scope / none 四值再决策（克隆 `app/commands/resume-probe.ts` + 测试 A 级） | state-machine.sh 可增恢复探测子命令（现状：状态守卫有、恢复探测无，暂未落地） |
| **hook.allow_paths 白名单语义** | 前缀匹配 + 子目录继承 + 默认空；README L208 直查："cannot bypass protection for `.comet` or workflow artifacts" + 模糊即 deny（fail closed） | 与 fail-gate-hook scope 门同类；"保护名单"（治理产物自身不可被写通道触碰）是本仓 scope 门的补充做法 |
| **comet doctor 判据** | 修复以"恰好一个受管 Router Hook 存在"为准（多装/漏装都不算修好，克隆 `app/commands/doctor.ts` A 级）；"CodeGraph effective" = CLI + 索引 + MCP 注册三者同时就位 | 与 self-check"装了≠生效"同构；"组件生效=多前提同时就位"可作判据（暂未落地） |
| **comet eval 裁判分离** | judge 与 execution 四重分离（详见 review-methodology.md） | verifier 评测作业配置依据 |
| **官方评测数字**（B 级，克隆 README L57 直查） | 0.4.0-beta.7：Token −76.8% / 轮次 −57.4% / 耗时 −47.4% / pass^3 87.5%（+12.5pp）/ pass@3 100%（16 任务×48 运行、41 对双过样本） | 基线表 comet 行注记 |

> 附记：Superpowers 接入前经 Gen/Socket/Snyk 三引擎安全审查（14 skills 全绿）——skill 供应链三方扫描的上游实例，与 skill-supply-chain 门禁一致。

## 任务图并行实现协议

> 来源：mattpocock/skills main 线 `skills/engineering/implement-spec/SKILL.md`（v1.3 未出 tag，2026-09-29 main d81f3a1 源码实测）。上游用一张 spec+tickets 任务图驱动多实现者并行；与上文 ECC worktree 生命周期（管"工作树状态与清理"）和 ruflo supervisor（管"一仓库一调度者"）互补——本节管**任务图怎么切成并行面**。

四机制：

1. **任务图而非步骤表**：tickets 是带阻塞关系的任务图——永远存在一个可抓取的**前沿**（阻塞全落地的票）。与 mattpocock-skills-methodology §一访谈前沿、§三拆分前沿同构：依赖图前沿是通用工作面。
2. **实现者子代理各自 worktree**：每张前沿票一个实现者子代理，在基于**集成分支**的独立 worktree 独立分支上实现（开工前确认基于集成分支，不是则 reset 到它）；完成前把集成分支 tip 合回自己的分支再报告。TDD 在实现者内部驱动。
3. **合并者子代理分离**：实现者报告完成后，由单独的合并者子代理把其分支合入集成分支——实现与合并两角色不混。前沿变化即补派新实现者，最大化并发；全部完成后整条集成分支过 code review，修复由单个实现者集中处理。
4. **稀疏通信（上下文指针）**：子代理之间只传指针（spec 路径/票号/研究笔记/commit），不复制指针后面已有的内容——控制器与实现者的通信面压到最小。探索产物落仓库外共享目录，供后续子代理按需取，避免每个实现者重复探索。

**swarm-yuan 落点**：workflow 节点⑤"复杂变更（>3 文件/跨模块）并行扇出"的执行形态——扇出单位=前沿票（非整块任务），合并走集成分支（非逐个向 main 合）；与并行上限 ≤3 worktree 的用户侧纪律配合（前沿按上限分批取）。

## Ruflo v3.21 全量能力（agent meta-harness——swarm-yuan 须知道但可选引用）

> 来源：Ruflo（原 Claude Flow）v3.21.1 源码调研。323 MCP 工具 + 45 CLI 命令 + 33 插件 + witness 验证 + federation 跨机器协作。

### 核心定位

Ruflo 是 agent meta-harness——把 Claude Code / Codex 从单上下文助手变为协调式、自学习、多代理 swarm。`npx ruflo init` 一键赋予 Claude Code "神经系统"：agents 自组织为 swarm、从每个任务学习、跨会话记忆、跨机器安全通信。

### 关键能力（swarm-yuan 可能没用到）

| 能力 | 描述 | swarm-yuan 落点 |
|------|------|----------------|
| **3 层模型路由** | Tier 1 确定性 codemod（~1ms/$0）→ Tier 2 Haiku（~500ms）→ Tier 3 Sonnet/Opus；`[CODEMOD_AVAILABLE]`/`[TASK_MODEL_RECOMMENDATION]` 标记触发 | workflow 节点⑤按任务复杂度路由模型 |
| **Swarm 编排** | init swarm → spawn agents via Task tool（MCP 协调，Task 执行）；防漂移默认：层次拓扑、maxAgents 6-8、专业化策略、raft 共识 | 复杂变更的 Dynamic Workflow 替代/增强 |
| **Dual-Mode 协作** | 🔵 Claude + 🟢 Codex 并行 workers + 共享 `collaboration` 记忆命名空间 + 预置模板（feature/security/refactor/bugfix） | 跨 AI 交叉验证（gsd-core cross-AI 的增强版） |
| **AgentDB 向量记忆** | SQLite + HNSW 向量索引（~3x faster vs brute force）；RVF 便携格式跨平台传输；Claude Code ↔ AgentDB 桥（自动导入 ~/.claude/projects/*/memory/*.md） | claude-mem 的增强替代（HNSW vs ChromaDB） |
| **自学习循环** | RETRIEVE(HNSW) → JUDGE(verdicts) → DISTILL(LoRA) → CONSOLIDATE(EWC++)；SONA 神经模式 + ReasoningBank + 轨迹学习 → router 89% 路由准确率 | 记忆闭环的增强（记录之外增加学习能力） |
| **Witness 验证系统** | 每个已文档化修复用 SHA-256 指纹 + 标记子串 + Ed25519 签名证明；`ruflo verify` 验证安装字节匹配签名；三层回归保护（smoke + witness + temporal history） | `--stable-diff` 的增强（不只是检查"改了没"，而是密码学证明"字节匹配"） |
| **Agent Federation** | 跨机器/组织 agent 协作（mTLS + ed25519 challenge-response，无 API key）；14 类 PII 检测（BLOCK/REDACT/HASH/PASS）；行为信任评分；合规模式（HIPAA/SOC2/GDPR）；WireGuard mesh | 跨团队/跨仓库协调（--impact 的增强版） |
| **GOAP A* 目标规划** | 自然语言目标 → 状态空间 A* 搜索 → 可执行 agent 计划 + 自适应重规划 | 4-Phase SOP Phase 3（七步推演）的增强版 |
| **MetaHarness 自审计** | 给 harness 打分（1-100）+ 基因组（7 段）+ MCP 扫描 + 威胁建模 + 漂移检测 + MAP-Elites 进化 + redblue 对抗测试 + GEPA 学习 | swarm-yuan 自我迭代的增强（`--cognition` 的"元"层） |
| **IPFS 插件注册** | 去中心化不可变插件分发（IPFS via Pinata） | 插件分发（generate-skill.sh 的增强） |
| **Arena 竞争性测试** | 把 agent 策略作为程序在锦标赛中对决 + 爬山进化 + 共进化 | 目标技能质量评估的增强 |
| **Gaia 基准测试** | `/gaia`/`/gaia-run`/`/gaia-leaderboard` 竞争性基准 | 目标技能性能对比 |
| **Headless 后台实例** | `claude -p`（print/pipe 模式）并行后台工作 + `--max-budget-usd` + `--fallback-model` + `--resume` + `--fork-session` | Dynamic Workflows 的 CLI 级替代 |
| **1 MESSAGE = ALL OPERATIONS** | 批量所有 todos/agent spawns/file ops/terminal ops/memory ops 在一条消息中 | 并发效率（减少消息往返） |
| **自动 swarm 触发** | 3+ 文件变更/特性/重构/API+测试/安全/性能/schema 变更 → 自动触发 swarm；单编辑/简单修复/文档/配置 → 跳过 | 因地制宜（spec 分级的增强版） |

### Ruflo 行为规则（CLAUDE.md——目标技能可参考）

- 做被要求的事，不多不少；优先编辑而非创建；除非要求不创建文档
- **1 MESSAGE = ALL RELATED OPERATIONS**——批量所有操作在一条消息中
- MCP 协调；Task 执行——先调 MCP，再调 Task
- 防漂移 swarm 默认：层次拓扑、maxAgents 6-8、专业化、raft 共识、混合记忆、HNSW on、SONA on
- DDD + 有界上下文；文件 <500 行；类型化接口；TDD London School；事件溯源；边界输入验证

### 与 swarm-yuan 其他运行时的协同

| 方法论 | 重叠/增强 |
|--------|----------|
| superpowers subagent | Ruflo swarm 是增强版（6-8 agents + raft 共识 vs 单 subagent） |
| comet state-machine | Ruflo session 持久化是增强版（SQLite + HNSW vs YAML） |
| claude-mem | Ruflo AgentDB 是增强版（HNSW + 自学习 vs ChromaDB + 观察） |
| gsd-core goal-backward | Ruflo GOAP A* 是增强版（状态空间搜索 vs 对抗验证） |
| Dynamic Workflows | Ruflo swarm + Dual-Mode 是 Claude Code 原生 WF 的替代/增强 |
| gstack review | Ruflo MetaHarness 自审计是"审查的审查"（元层） |

> **swarm-yuan 不要求安装 Ruflo**——但如果项目已装，目标技能可引用其 swarm/memory/federation 能力。未装时降级为 superpowers subagent + claude-mem + gsd-core。落地时在 dev-guide.md 的「任务流程填充」段引用本编排模式。

## ECC v2.0 会话适配器契约（ecc.session.v1 + ecc.state-store.v1）

> 来源：ECC v2.0.0。session 状态管理采用多 harness 统一的 schema 契约 + typed entity 状态存储。

### ecc.session.v1 规范核心原则

ECC 的 session 适配器契约（`docs/SESSION-ADAPTER-CONTRACT.md`）定义了跨 harness 的统一 session 快照格式：

```json
{
 "version": "ecc.session.v1",
 "sessions": [{
 "id": "...",
 "kind": "claude-code|codex|opencode|dmux|...",
 "state": "idle|running|complete|failed",
 "sourceTarget": "...",
 "workers": [{
 "id": "...",
 "state": "idle|running|complete|failed",
 "health": "ok|degraded|error",
 "runtime": { "model": "...", "tokens": 0, "durationMs": 0 },
 "intent": "...",
 "outputs": { "commits": [], "files": [], "pr": "..." },
 "artifacts": { "log": "...", "trace": "..." }
 }],
 "aggregates": { "workerCount": 0, "states": {}, "healths": {} }
 }]
}
```

**关键设计规则：**

| 规则 | 说明 | swarm-yuan 落点 |
|------|------|----------------|
| **state ≠ health** | 生命周期状态（idle/running/complete/failed）与运行健康（ok/degraded/error）是**独立字段**，不混用 | subagent 回报契约可扩展为双字段 |
| **aggregates 须等于派生计数** | `aggregates.workerCount` 必须等于 `len(workers)`，不依赖上游提供 | 一致性校验 |
| **unknown state 合法** | 消费者遇到未知 state 字符串须**优雅降级**（视为 idle），不崩溃 | 兼容性 |
| **additive-only 版本化** | 移除/重命名/重类型字段强制升级到 `ecc.session.v2`；只能新增字段 | 向后兼容 |
| **adapter 特定数据隔离** | harness 特有字段（如 Claude Code 的 session ID、Codex 的 thread ID）放入 `runtime`/`artifacts` 命名空间 | 跨 harness 兼容 |
| **polling 不追加重复历史** | 轮询读取不 append 重复历史记录 | 幂等性 |

### ecc.state-store.v1 Typed Entity Schema

ECC 的状态存储使用 **7 种 typed entity**，每种有 Ajv schema 校验：

| Entity | 用途 | swarm-yuan 映射 |
|--------|------|----------------|
| `session` | 会话状态 | state-machine.sh 的 `.swarm-yuan/state.yaml` |
| `skillRun` | skill 执行记录（outcome/feedback） | 目标技能的执行历史 |
| `skillVersion` | skill 版本追踪 | swarm-yuan 自身的版本管理 |
| `decision` | 决策记录 | `.swarm-yuan/decisions.md` |
| `installState` | 安装状态 | self-check.sh 的检测结果 |
| `governanceEvent` | 治理事件（secrets/approval/policy） | security-spec 的审计追踪 |
| `workItem` | 工作项（Kanban 卡） | 任务列表 |

**Ajv 预持久化校验**：写入前用 JSON Schema 验证 entity，schema 不匹配则拒绝写入。

**migration 版本化**：schema 变更通过版本化 migration 文件管理，不破坏已有数据。

### 与 swarm-yuan 的融合

**第一层（基础字段）：**
- state-machine.sh 的 `state.yaml` 增加 `version: "swarm-yuan.state.v1"` 字段
- 状态文件增加 `health` 字段（`ok|degraded|error`），与 `phase`（state）分离
- subagent 回报契约扩展为 `state + health` 双字段

**第二层（可选，control pane）：**
- state-machine.sh 增加 `--export-json` 子命令，导出 `ecc.session.v1` 格式
- 用 `schemas/state-store.schema.json` 做 Ajv 校验

**第三层（可选，typed entity 存储）：**
- 用 `ecc.state-store.v1` 的 7 entity 替代 YAML 状态文件
- 用 `scripts/lib/state-store/` 的 migration/query 层管理状态

## ruflo v3.26–v3.32 编排与治理扩展

> 来源：ruflo v3.26.0→v3.32.4 release notes。repository supervisor + worktree leases + global AI budget + Agent-Native Versioning。

### Repository Supervisor + Worktree Leases（v3.27/v3.28）

repository supervisor + worktree leases 解决基数问题：同一仓库的 N 个 git worktree 各自调度独立 AI worker，导致资源浪费 + 竞态。

**机制**：
- **repositoryId**：通过 `git rev-parse --git-common-dir` 解析稳定的 repositoryId（跨所有 worktree 共享）
- **supervisor 选举**：每仓库**恰好一个** worktree 当选 supervisor，拥有 recurring AI-worker 调度权
- **lease-only participant**：其他 worktree 是 lease-only 参与者（15-min TTL heartbeat），只跑轻量 local-only worker
- **`daemon trigger --headless`**：显式绕过 supervisor gate（一次性用户操作，仍受 budget/dedup 约束）

**与 swarm-yuan worktree 生命周期的协同：**
- ECC 的 8 状态 worktree 生命周期 + ruflo 的 supervisor 选举可组合
- supervisor = `merge-ready` 或 `idle` 状态的 worktree；lease-only = 其他状态

### Global AI Budget（v3.27/v3.28）

跨所有 daemon 的全局 AI 预算：

| 控制面 | 命令 | 说明 |
|--------|------|------|
| **max concurrent** | `daemon budget show` | 全局最大并发 AI worker 数 |
| **hourly cap** | `daemon budget show` | 全局每小时 AI worker 上限 |
| **pause/resume** | `daemon budget pause\|resume` | 独立可脚本的预算控制 |

**structured token telemetry**：`claude --print --output-format json` 解析（lenient），receipt 到 `GlobalAiBudget.recordUsage`。schema 不匹配时降级为"不记录用量"，不破坏分析输出。

**在目标技能中的落地：**
- 若项目用 ruflo swarm 编排，dev-guide.md 引用 global budget：多 worktree 时不会失控
- subagent-orchestration 的模型选择可引用 budget：预算紧张时降级模型

### Cross-Worktree Job Dedup（v3.27）

- dedup key = `sha256(repositoryId, head, workerType, configHash)`
- 共享 registry：`~/.claude-flow/ai-jobs.json`
- 同一仓库 + 同一 head + 同一 worker 类型 → 只跑一次

**在目标技能中的落地：**
- 若项目多 worktree 并行，subagent 编排可引用 dedup：相同任务不重复派发

### Agent-Native Versioning（ANV, v3.26.0）

`ruflo version --explain` 报告 advisory 后缀：

```
3.32.4+ad.164.387.34.gabc123.cat5
 │ │ │ │ │
 │ │ │ │ └─ catalog generation (signed GAIA/HAL tier)
 │ │ │ └──────── git SHA
 │ │ └─────────── skill count (34)
 │ └─────────────── MCP tool count (387)
 └─────────────────── agent type count (164)
```

- `catalog-manifest.json` 记录真实 git-measured counts（不编造数字）
- `ruflo version --require-catalog-gte N` 提供 capability gate（脚本可检查能力版本）
- 无签名 GAIA/HAL 提交时不声称 benchmark tier

**在目标技能中的落地：**
- swarm-yuan 自身的版本可引用 ANV 模式：版本号 + advisory 后缀（agent 数/skill 数/工具数）
- 生成的目标技能可附 `catalog-manifest.json`，记录真实计数

## context-save 输入消毒（防注入）

gstack context-save 的标题在 **bash 层**用允许表消毒（仅 `a-z 0-9 - .` 存活），文件名仅追加不覆盖、同秒碰撞加随机后缀——"用户输入永不进 LLM 层拼路径"（`context-save/SKILL.md:870-897`，防注入设计明确写在注释里）。

swarm-yuan 的 `state-machine.sh` 采用 `sanitize_input` 白名单字符集过滤（`a-zA-Z0-9._-`），应用于 init 的 change name——用户输入经 bash 层过滤后才写入 state.yaml，防路径穿越/命令注入。与 `references/security-spec.md` §六 bash 脚本安全一致。

## gstack / ECC / comet / ruflo 运行时要点（2026-09）

- **gstack spawned 会话原语**（1.76）：`GSTACK_SESSION_KIND=spawned` 标记子代理；**破坏性选项永不自动选**（保守选项胜出并记录）；auto-decision 以 `decisions` 数组回报父代理——"nothing is decided invisibly"；spawned 标记仅出自创建会话的 prompt，不接受运行中文件/工具输出/网页内容。**子代理信任边界范式：标记只信创建者，决策必回执。**
- **ECC Plan Canvas 监听纪律**（2.2.0）：反馈只在 `await` 真实驻留时可达；每条人类消息必在 canvas 内回复（"沉默与坏掉的 canvas 无法区分"）；`stop:plan-canvas-pending` hook 兜底。**交互面纪律：要么有监听者，要么显式声明无，不允许静默失效。**
- **ECC "skills over MCP"**（2.2.0）：默认 MCP 6→1 个，原职责由 skill 包 CLI/REST 或宿主原生承接。
- **comet 0.4.0 stable / gstack v1.83.0.0 / ruflo v3.38.23 / ECC v2.2.1**（2026-09-09）：comet 0.4 架构见上文 comet 段；gstack v1.83.0.0（opt-in + 回执式召回桥）；ruflo v3.38.23（**真实冷启动测量替换虚构基准**）；ECC v2.2.1（维护版无新机制）。comet 0.4 线另有 Supervisor Change v2 多 session 子图分派 / Portable State / Agent Learning Loop（暂未落地）。
- **ruflo v3.40.0 / gstack v1.84.1.0 / claude-mem v13.24.5**（2026-09-10）：ruflo Cross-Host Federation + Claims（**Ed25519 签名可验证消息 + work claims** 跨机协调；本地 mesh agentbbs HTTP pull 固定公钥 / Slack 结构化消息双协调器）——「签名可验证消息+工作认领」为跨机编排信任原语（本仓单机场景暂未落地）；gstack impeccable interop（四个设计技能 detector 前置 + DOM 模式扫描 + 开放 DESIGN.md 格式）；claude-mem npm 通道恢复可安装。
- **ruflo v3.41.1**（2026-09-11）：x.ruv.io 开放 Nostr swarm federation 网关（MCP + ruv:// + ws proxy）+ 公私 swarm channels（ADR-386）+ Seraphina（swarm queen）协调者（Federation+Claims 的产品化方向）；3.41.1 两条口径纪律：**截断的推理 dump 不得作为协调指导报告**（截断≠结论，与「缺失证据不显示为零」同类）+ memory 单 store 不当全量计数（口径诚实）。
- **ruflo v3.41.2**（2026-09-13）：**内存索引保护**（daemon/memory 不销毁用户索引——重建/清理类写操作必须先辨「我的产物 vs 用户的资产」）+ **autoStart:false 被尊重**（显式否决语义必须生效，与 fail-closed 互补——默认安全管缺省、同意面管显式拒绝）+ **Seraphina 预算封顶**（x-gateway 0.6.1——界按预算分配而非计数上限，与 claude-mem #3575 剩余死线封顶同类）+ 默认频道声明（安静频道仍可发现——零活动 ≠ 不存在）。
- **ruflo v3.42.4**（2026-09-18）：**smart search 结果保检索相关性**（#3340/#3327）：其他排序键不得覆盖相关性评分——「结果按相关性排序」是检索接口的语义承诺，次级排序只能在同分内生效。
- **superpowers v6.3.0→v6.4.1**（2026-09-19，80 文件）：①新技能 **diagnosing-superpowers**：技能系统自身的根因诊断（session-discovery/skill-timeline/stumbles/repeated-work/scrub-audit 十个 prompt + redaction-policy + context-safety）——「技能要有诊断自身效能的元技能」，与复盘须复盘方法本身同构；②executing-plans 增 task-start/task-done 原子标记脚本（计划执行推进可观测）；③OpenCode 2.0 + Muse 宿主支持（宿主支持面扩大）；④codex plugin hooks 自动发现兜底修复：**关闭一个行为只有唯一显式形态**（hooks:{} 才生效；缺席/[]/空列表都回退 fallback——「缺席 ≠ 关闭」）。
- **ruflo 3.42.5 / comet 0.4.2 / gstack 1.87.5.0**（2026-09-22）：ruflo reasoningBank **接真 embedder 激活**（登记在案的能力必须真实可用）；comet prepareNativeSkillInstallTarget 全局作用域放行（CLI 不假设项目内安装目标），无新原语；gstack 测试与 CI 规划移除空闲等待（测试时间预算）。
- **comet 0.4.2→0.4.3**（2026-09-22，#450，项目记忆与 workflow 运行时）：①**project-knowledge 索引重建可恢复**：重建失败不得损毁既有索引（重建=事务性操作，失败回原状）；②workflow CLI 检查优化 + Windows 守护任务挂起修复且**保留加速路径**（修复不得回退既有性能）；③skill 项目记忆完成指引恢复（指导丢失即恢复）+ manifest 与原生技能预算对齐（发布面一致性）。

## ruflo v3.43–v3.45 路由智能化与可观测诚实化

> v3.42.5→v3.45.0。

- **路由三重门禁 + 弃权回退**：abstain ≤ 0.30 / lift ≥ 1.2 / margin ≥ 0.005，不达标就**保留原选择并标注原因**；**未校准置信度绝不写入 `successProbability`**→宁可弃权不硬猜。
- **新能力默认关、可拔除、可测量**：opt-in + 动态 import + 出错静默回退→宿主无关。
- **冻结语料 + AND 门禁决定默认切换**：197 条标注 prompt、sha256 固定，准确率与延迟双过才晋升（首测 +10.6 点但 p95 +485% **故不切换**）。
- **失败面显式化而非静默降级**：`embeddingError`/`available+reason`/「Learning degraded」告警；**学习回执不再编造**。
- **句柄空闲自释放 + 写盘原子重试**：WAL 句柄空闲释放（句柄残留会使 `memory_store` 被守卫拒绝）；rename 有界退避→写失败会让**一次性审批可被复用**。

## Pi codemode：沙箱脚本聚合形态

> earendil-works/pi（原 badlogic/pi-mono 重定向）`packages/codemode`；Pi 机制源定位不进 FACT_RUNTIMES（同 dsh/pua 先例，见 docs/upstream-baseline.md；mattpocock 属 CLI 层运行时（物化型），此先例对其不适用）。证据：官方 README 直查（B+）。

- **机制**：QuickJS/WASM 沙箱内让模型写 JS 编排其他工具——嵌套 tool call 在沙箱内完成，**只有脚本最终输出进入主上下文窗口**（中间调用与结果不进入）。
- **定位**：子代理进程的替代形态——不开新子代理上下文，用沙箱脚本聚合多次工具调用。上下文成本模型对比：子代理=固定开新窗口+结果回流；codemode=零新窗口+只回流终值。
- **与既有能力的关系**：ECC 上下文经济学（compaction/蒸馏）方向相反——那是"事后压缩已进入的"，codemode 是"事前阻止进入"；与上文任务图并行实现协议（子代理扇出）、 Mods `turn.step` 就地代答并列为编排形态第三选项。
- **对照警示**：DSH 的 `code-runtime` 包（0.1.x 线）在 0.2.1 移除——进程内代码执行形态在大厂运行时也未站稳；形态选型时优先子代理扇出，codemode 备查。
- **暂不采用**：Claude Code 无进程内沙箱脚本能力（Mods 非沙箱）；宿主出现等价能力时再评估。


### 压缩纪律须经压力例 eval（superpowers v7.0.0）

- **背景**：superpowers v7.0.0（51 文件 +2219/-399）把 TDD 技能的 Why-Order-Matters 段压缩成一行表格。发布附带 **eval 实验数据**：压力场景（「先把代码写了，测试后补」的诱惑）下 test-first 行为 control 8/10 → treatment 5/10（n=10，Claude/Codex 双臂复验）；正常 TDD 触发路径两臂无差（PPPPP→PPPPP）。发布时把五段驳论折回表格行。
- **方法层**：**「等价压缩」可能在恰好需要那段论证的压力场景测量性退化**——正常路径测不出的损失，出现在决策最脆弱的时刻。压缩优化必须带**压力例 eval**（控制/实验双臂+明确 n），不能只看正常触发路径；文档变更与代码变更同样进可测量验证面。
- **同构**：与 ruflo 评测宣称清剿先例同向（宣称须有数据），但方向相反——那是「无数据的宣称撤下」，这是「有数据的回滚」；两者合起来构成**变更须带测量**的完整闭环。
- 其余（v7.0.0）：brainstorming 仪式重建（按任务规模缩放的进一步演化）+Antigravity Marketplace manifest（多市集分发面）+Windows hook 修复批（run-hook-cmd 223 行测试）。来源：`docs/research/R106-runtime-refresh.md`。

### 去重前先快照身份：无 id 实体不得被去重吞（ruflo v3.56.7）

- **背景**：ruflo auto-memory 的 consolidate() 会给无 id 条目**就地赋 id**；去重流程在写时捕获的 ids 与盘上副本失配，合并逻辑把本已存在的无 id 条目当「别人新加的」重复追加。修复=**读 store 时快照 ids**+永不把盘上无 id 条目视为他人所写（#4058，CI 抓出）。
- **方法层**：去重/合并类逻辑必须在**读时**而非写时捕获身份基线——就地变更（赋 id）发生在捕获之后，基线就失效。**身份不明（无 id）的实体既不得被去重静默吞掉，也不得被重复加回**；这与 graphify「同名节点去重防吞」（不同文件同 id 保两节点）同轴：合并必须显式，身份保全优先于去重收益。
- **应用**：本技能 memory-writeback 与知识去重路径核对——身份捕获时点是否在一切就地变更之前；无 id 条目的处置是否有显式规则（不是默认丢弃）。
- 其余（v3.56.7）：TUI Swarm/Events/Missions 观测页与页条（观测面成体系）+AI 页 ask Codex **只读且版本按串钉定**（观测与指挥分离；钉定语义=串比较非构建版本）+MCP resources+e2e esbuild bundle。来源：`docs/research/R107-runtime-refresh.md`。

### 死路径静默吞错与契约执法（ruflo v3.59.0–3.59.8）

> 1 minor + 8 patch（2026-10-20/21 九连发，#4249-#4354）。主题=「能力回退必须可观测」与「声明契约必须真执行」。

- **静默吞掉的死路径=能力从未生效**（#4249）：`AgentDBBackend` 的 HNSW 检索走 `getController('hnsw')` 死路径——对真实 agentdb 包**每次都抛错且每次都被 catch 吞掉**，原生向量检索形同虚设。修复=直连真实导出的 `agentdb.HNSWIndex`，含过期拒绝、写后安全重建、精确余弦回退。方法层：**回退路径上的失败必须计数/可见**——「catch 后走 fallback」若不观测，fallback 就是常态而无人知（同 claude-code「被跳过的 hook 必须可见」族）。应用：本仓 memory-backends.sh 适配层的降级路径核对此条（降级发生即披露，不静默吞）。
- **声明契约必须真执行**（#4336）：`hive-mind_init` 声明 `persist:false` 却照写 `state.json` 与 bootstrap secret；修复=**任何文件写入前先校验参数**，persist:false 真的不写。同族=#4138（auto-memory 导入只增不删——源文件/标题删除后条目须同步删除，**单向同步不是同步**）与 #4351（软删除墓碑行清洗 payload + `PRAGMA secure_delete`——**删除语义要到存储层**，可恢复的删除须显式声明）。
- **活性判据按角色**（#4320）：无在途工作的空闲代理本无心跳生产者，却按「三个心跳间隔缺席」被标 error 剔出可用池——**活性检查必须区分「该有心跳而没有」与「本就不发心跳」**；同 #4323（终止/完成调用幂等——重复终止不得重复计数，与 graphify「合并必须显式」同族）。
- **锁错误快速失败**（#4343）：`acquireLock()` 把一切 `openSync()` 错误当争用——权限错误/缺父目录/锁路径被植入目录或符号链接都空耗 5 秒预算后报误导性超时；修复=`O_NOFOLLOW` 创建+非争用错误立即上报+非常规文件拒绝。**错误分类先于重试**（争用可等、配置错不可等）；O_NOFOLLOW 封「经符号链接创建」与 v3.58.1 路径围栏同族。
- **假成功清剿延续**：#4331 `task cancel` 对未知/已完成 id 不再打印 cancelled（拒绝触碰已完成任务并 exit 1）；#4332 `task status` 读错字段名恒显 `Task: undefined`——**结果解析必须对真实返回形状核账**；#4324/#4344 `total` 在 limit 之后计算致「10 of 10」假象（分页计数先全量后分页）。
- **退出路径排水**（#4334）：CLI 退出处理器改设 `process.exitCode`+best-effort `await shutdownBridge()` 排干缓存资源，不再 `process.exit(0)` 强退撞 libuv 断言——与 claude-code「停机排水」同族：**正常退出也是需要排水的路径**。
- **自证降格为他证标注**（3.59.1，ruflo-core 插件面）：witness manifests 支持外部签名密钥；旧 commit 派生种子改标 `self-attested`——**自证材料不得标注为他证**（与 gstack「跳过的升级永不说 ok」同族）。
- 其余：3.59.0 Grok Build 成为一等宿主/记忆 tag 过滤/RaBitQ 索引自动构建；3.59.5/3.59.6 蒸馏覆盖双存储（单存储失败不阻塞另一存储）与显式 `--path` 单存储导出不初始化兄弟库；3.59.8 `config_list` 非默认 scope 正确并入默认视图。来源：`docs/research/R132-runtime-refresh.md`。

### 路径包含判据须锚定分隔符边界（ruflo v3.58.1）

> 1 patch（2026-10-20，#4310-#4315，安全主导；用户指令轮吸收，细节见 ncwk 离线包 `PROVENANCE/distillation-ledger.md` 对应注记）。

- **未锚定前缀=围栏失效**：`hooks_codemod` 的 `resolveTargets()` 用 `abs.startsWith(cwd)` 做路径包含检查——兄弟目录只要名字前缀相同（如 `cwd`-staging）即通过，让工具在项目根外**读写**（CWE-22）；修复=两端都锚定到路径分隔符边界，对齐仓内本就正确的 `isWithinPrefix()`。方法层：**路径包含的判据是「路径段相等」，不是「字符串前缀」**——同族=openspec artifact 围栏（glob 展开后路径限制在 change 目录）、claude 符号链接规范化（权限在规范化空间比对）。应用：本仓围栏/白名单类脚本（precheck 路径白名单、worktree 边界）核对包含判据是否锚定分隔符。
- **分界符只消费一次**：`CommandParser` 见到每个字面量 `--` 都翻转 flag 解析态，后续作为普通操作数的 `--`（如搜索词恰为 `--`）被吞——首个 `--` 是分界符，其余回归操作数语义。
- **调用面对真实导出核账**：`TokenOptimizer.optimizedEdit()` 调用的 `editCode()` 在依赖包导出面上从未存在，另一处选了未实例化的类而非包的工厂函数 `getAgentBooster()`——**集成点必须对依赖包的真实导出核账**（接口幻觉自查），与 dsh「包源码 module-scope await 静态拒绝」同为装载前核账族。

### 终态口径=真实效果，不=调用成功（ruflo v3.57.2）

> 2 patch（2026-10-19，社区修复批 #4190-#4298）。方法论位集中在“成功/失败的口径与资源账闭合”。

- **假成功清剿三连**：`memory export/import/memory_migrate` 改为回传工具真实错误/迁移计数（此前打印固定成功文案）；`hooks worker dispatch` 只有在 daemon 真跑过才报 `Status: completed`（此前未执行也报完成）；`backupMemoryDb()` 的裸文件复制回退只在“已确认加密源且无活跃 WAL”时允许，并记录实际完成的方法（此前任一原生备份失败都回退且恒报 `backedUp: true`）。方法层：**成功文案必须由观测到的效果派生，不能由“我发起过”派生**；降级通道要带准入条件与所用方法，否则降级会把失败伪装成成功（同 gstack「no-findings 只算结论」与 dsh「缺失退出码不清零」）。
- **终态路径归还资源**：HNSW 索引在 consolidate 修剪后同步 `removePoint`（否则孤儿积累直至写入永久抛错）；TopologyManager queen 死亡后真正晋升替补（此前 failoverEnabled=true 也静默退回 mesh）；stale task owner 在终态释放；注销 swarm agent 同时移除 domain-pool 成员；策略锁下孤儿原子写临时文件被回收。方法层：**取消/失败/死亡不是“停止推进”，而是“归还槽位、索引、成员与临时资源”**；资源的创建点与回收点必须一一对应。
- **显式绑定优先于就近解析**：agentdb 图查询/寻路改走共享 `resolveDbPath()` 优先级链（此前就地解析，显式 `CLAUDE_FLOW_DB_PATH` 可能读到另一个库）；mission ledger 按项目分键（不再把一个项目的 mission 泄到每个项目的 cockpit）。**同一逻辑存储只能有一个路径裁决点**；作用域隔离要按项目键，不按进程全局态。
- **语义边界修正**：`ttl: 0` 现在立即过期（此前 falsy 判断导致永不过期）；`hooks_intelligence_attention` 拒绝未实现模式（不再接受后不执行）；`RvfBackend` 删除永不成功的原生分支（不留未完成的死路）；`init upgrade` 刷新 intelligence/session 伴生文件（不再留陈旧副本）。方法层：**显式零值、未实现能力、死分支、陈旧伴生件都要有明确语义**——“看起来支持”是比“不支持”更贵的缺陷。
- 其余：SmartRetrieval 恢复多结果召回（此前塌缩为单条）；ReasoningBank 使用真实 embedder 而非 hash 回退；workflow list/status/stop/run 按工具真实返回形状解析；one-shot CLI 在 `process.exit(0)` 前冲刷学习模式；ruvocal MCP 合并不再丢 base server 凭据；`ruflo-x-gateway` 广播 `offline_access` 以支持静默刷新。来源：`docs/research/R124-runtime-refresh.md`。

### 生成配置默认取标准信任、本机桥按来源校验（ruflo v3.57.0）

> 1 minor（2026-10-17，社区与 dream-cycle 修复批 #4210-#4252 + 策略账本完整性 #3892）。三条安全面与两条编排面有方法论位。

- **init 写出的 `.codex/config.toml` 默认是标准信任**：`sandbox_mode = "workspace-write"` / `approval_policy = "on-request"` / `web_search = "cached"`；全权形态（danger-full-access / never / live）须显式 `--codex-trust full`（或 `RUFLO_CODEX_TRUST=full`）；**已存在的 config.toml 从不改写（`--force` 也不）**，保留下来的宽松文件会被点名并给出收紧方法；init 打印写出的是哪一档。方法层：**生成器为目标项目落的宿主配置，安全默认取最严可用档，放宽必须是显式动作**——与本仓三条铁律「权限边界 fail-closed」同轴；对既有配置的态度是「不覆盖 + 点名风险」，不是静默替换（三-host e2e 实跑发现，ADR-490）。本仓 Step 9 集成宿主写 settings/.mcp.json 时按此口径：生成态保守、已有文件不动、宽松项提示。
- **MCP 桥 loopback 来源双校验**（#4226/#4243）：本机模式下未设 `MCP_AUTH_TOKEN` 时，要求 `Host` 为 loopback（挡 DNS rebinding）且 `Origin` 为 loopback 或白名单——「只监听本机」不等于「只有本机能调」，浏览器页面可借 DNS rebinding 打到 127.0.0.1；本机服务的信任判据是请求来源字段而非监听地址。本仓 `mcp-governance.md` 工具面三原则的接入面补此一条。
- **策略账本以独立归档锚核验**（#3892/#4216）：被保留/修剪过的账本对照盘上**独立的归档锚**验真，不再只信可变的 `state.json`；全量审计经围栏写入器流式输出——可变状态不能当自己的完整性证据，验真锚必须独立于被验对象（修复已修剪账本上的 `policy-ledger-verification-failed`）。与 gstack「跳过的升级永不说 ok」「锁的属主是身份不是号码」同族：凭据与证据都要抗篡改源。
- **swarm 终态与槽位纪律**（#4233-#4247）：关停时订阅投递干净取消、回执按接收者记账、紧急消息在队列溢出时保全、失败/取消的 task worker 释放槽位；coordinator 取消是终态；domain pool 不再创建未注册 agent 且终态后释放 agent；跨 agent pool 的共享 worker 预留被尊重（一处簿记改动曾会静默击穿上一条释放修复——**并发簿记的修复要互相对账**）。方法层：编排器的资源账（槽位/预留/回执）在终态路径上必须闭合，取消与失败不是「停止推进」而是「归还资源」。
- **跨进程学习统计串行化**（#4217/#4240）：read-merge-write 事务跨进程串行，修丢失的并发增量——共享计数器的更新要么原子要么加锁，与 gsd-core「WINDOWS.md 清单跨进程串行化」同类。
- **hook 生命周期事件去重按事件区分**（#4206/#4212）：Stop hook 曾占用 session-end 的去重键致后续 hook 不跑——去重键必须包含事件类型，不同生命周期事件不共享一把键；init 不写未实现的 hook（#4200/#4213）且不再对项目 helper 发放全权执行（#4221）——生成的 hook 登记只含真实存在的能力。
- **doctor 健康检查输出版本化 JSON**（#4228）+ 对 Node 24.19-24.21 下按 24.19+ 头文件编译的 `better-sqlite3` 会 abort 进程（nodejs/node#65446）给出点名诊断与解法（#4055）——诊断面结构化且带下一步，与 gstack「agent-ready 错误契约」同族。
- 其余：Claude memories 跨 project 与 worktree 根刷新（#4210）；连字符命名的 memory key 不再被当凭据字段（#4202/#4211——secret 判定不能只看键名形态）；mission ledger 按项目分键，不再把一个项目的活动 mission 泄到其他项目（#4237/#4242——作用域隔离）；`daemon status` 报真实 TTL 而非陈旧默认值（#4238/#4241）；`--no-color`/`--no-update` 在帮助、版本输出与启动更新检查之前生效（#4248/#4251）；RaftConsensus.awaitConsensus() 事件驱动替代忙轮询（#4214/#4215）。未并入：#4220 helper 执行权限修复涉及已签名 helper manifest，须私钥重签后再合——**签名工件的修复不绕签名流程**。来源：`docs/research/R123-runtime-refresh.md`。

### 技能正文体积守门与先挖后问（superpowers v7.0.1）

> 2 提交（2026-10-21）——形式薄轮，方法论实质重。

- **宿主压缩后重挂载技能在 20,000 字符处截断**：截断点之后的内容整会话消失（7.0.0 实测 subagent-driven-development 正文 32,577B，重挂载只送达前六成）；对策=修复环/终审/报告/续跑约定移入 references/、按步骤从磁盘读，并加体积守门测试（任一 SKILL.md ≥20,000 字节即测试失败）——**技能正文超宿主重挂载上限的部分等于不存在**，关键纪律须落在按需读的文件而非常驻正文。本仓物化对应：生成物 SKILL.md 体积守门入终检。
- **brainstorming 先挖后问**：先读已有 spec/plan/相关文件再提问；每个问题说明答案会改变什么；给两三个方案并推荐其一；批准后先写设计文档再动工——跳过文档直接开建 24/24→3/24（n=24 定量）。提问前置挖掘、批准前置文档，两道门都带测量数字，与 v7.0.0「压缩纪律须经压力例 eval」同属文档变更进测量面。来源：`docs/research/R140-runtime-refresh.md`。

### 声明面-消费面对账与锁活性分级（ruflo v3.59.9–3.59.17）

> 9 patch。主题=「配置面声称支持但从未生效」。

- **声明面-消费面对账族**：解析器把旗标存 camelCase 键而命令读 kebab 原键——旗标从未生效：--max-cpu-load/--no-distill/--no-signup/--no-color/--no-browser；`update --public-key` 从未加载密钥=补丁签名验证从未运行；config.yaml 不再广告死键。自查陷阱三件：kebab/camel 键失配、`--no-` 折叠、死键广告——**登记旗标≠消费旗标**，配置面与命令面须对账（与 v3.42.5「登记在案的能力必须真实可用」同族）。
- **分页后计数族第 6/7 例**：total 在 `slice(0,limit)` 之后计算，恒等于页大小——分页计数先全量后分页（v3.59.0–3.59.8 #4324/#4344 同族续案）。
- **锁活性分级 recent≠live**：持锁进程已死但锁龄低于阈值，不再永判他人在写——锁占用判定看进程存活性，不看锁龄。
- **恢复公开命令先查捆绑消费方**（pair 命令）——公开面改动先对仓内消费方核账。来源：`docs/research/R140-runtime-refresh.md`。

## 运行时版本增量（生成器侧）

### 只解析不执行与虚假成功清剿（ruflo v3.60.0–3.61.1）

> 2 minor+2 patch。主题=安全分析边界三项 + 虚假成功族续案。

- **ruRE 静态逆向六工具的安全分析边界三项**（asar/JS 应用/特征查找/ELF-PE-Mach-O/.NET 元数据/EVM 字节码解析）：① **只解析不执行**——分析不可信输入的默认姿态，解析器不运行被分析物；② **取出的字符串全过 AIDefence 门、扫描器不可用如实 `screened: false`**——防护缺席要披露，不装作筛过；③ **能力扩围走权限升级面**——外部目录 rureFolders 显式白名单（`name=/absolute/folder`）、样本绝对路径/`..` 拒绝、目录及以下每一部分不得是链接、改配置=install 级写总是先问。控制台样本拒符号链接、结果去终端转义。
- **虚假成功族再四例（声明-消费对账族第八至十一例）**：neural_compress `prune` 删光全部存储还报成功（usage 从不记录→以为无引用）、gh 失败/无匹配的 PR/issue 操作仍报成功且忽略 owner/repo、`performanceScore: 0` 与缺省值记 0.8 成功（零分与缺省是两种事实，都不得折算成好成绩）、**`update all` 忽略 `--dry-run`**——接受旗标不消费；干跑必须真干跑。
- **agentbbs room id `..` 路径逃逸**（CWE-22 族）+ **MCP session id 改 crypto.randomUUID()**（原为计数器+时间戳+Math.random 六字符，可猜测）——会话标识不得可预测。
- **CI：插件分发文件变更 plugin.json 版本必须升否则红**（#4447）——版本锁机器门禁，与本仓 facts.conf+test-doc-numbers 机器锚同构：**版本号是契约不是装饰，文件变了版本不变=CI 红**。
- 其余：桥接搜索窗口 1000→10000 可配（静默截断面收窄要显式）、cost-tracker Stop hook 写错项目修复（写盘点锚定调用方项目，不落会话项目）、`transport use slim` 等未配置 SDK 功能改报「not configured」不在调用点崩、`update all` 补 `--dry-run`、TypeScript 7 native compiler。来源：`docs/research/R141-runtime-refresh.md`。

### comet 0.5.0 增量（升级门/恢复先决/eval 产物）

- **升级门=在途任务先收口**：升级前须完成并归档在途任务——升级即破坏性变更，不与在途状态共存。
- **恢复先决=旧执行及子任务确认全停再重派**——恢复前先确认旧世界死透，防双跑。
- **eval 产物只收 regular files、跳符号链接，不完整产物不计分**——评测输入面收窄到真实完整产物。来源：`docs/research/R140-runtime-refresh.md`。

### kimi-code 2.3.1 Tower 记档（实验特性）

- mission=独立 branch+worktree 异步并行；worker 变更由独立只读 reviewer 审查；只合并通过检查的分支；worker/reviewer Never Ask 权限自动运行——用户级 worktree-flow 与子代理编排不变量（worker 权限降级、reviewer 只读、合并前置检查）的宿主化上游实证。来源：`docs/research/R140-runtime-refresh.md`。

### kimi-code main 前进记档（v2.3.1 后 21 提交，未发版）

- **Plan mode 留给用户、每个 plan 都评审**（#4247）——agent 不自行进出 Plan mode；计划权与执行权分离的宿主化表达（与本仓 spec 节点人工裁决同构）。
- **会话锁接管**（#4328）——exited process 遗留的会话锁用户可显式接管：死进程的锁不是永久占有（锁活性判据看进程存活性）。
- **MCP discovery 完成前不宣告工具**（#4364）——宣告以依赖就绪为前置，防「宣告了却不可用」。
- **Tower 并发/锁/per-spawn 模型选择改进**（#4312）；TypeScript 7 native compiler（#4329）；logout 安装的区域推断（#4311）；import-from-cc-codex 适配当前 Claude Code/Codex 布局（#4331）；流式思考可展开（#4322）。来源：`docs/research/R141-runtime-refresh.md`。

### minimax main 前进记档（v0.6.5 后新增五提交，未发版）

- **compactionTriggerAt 自动压缩触发阈值可配**（#493）——压缩时机从硬编码走向可配置（时机化治理续：阈值+总闸可配的又一宿主实证）。
- **安装器不清共享 .builtin-skills + @minimax-ai/code-acp ACP launcher**（#522）——安装器不得清共享目录（共享资产的写边界）。
- Google BYOK providers via Pi（#492）；M3.1 Flash 升默认交付模型（#509）；TUI OSC 7501 程序状态上报（#471）。来源：`docs/research/R141-runtime-refresh.md`。
