# Harness² 源码级调研笔记（google-research/harness2，2026-10-19 快照）

> 调研对象：`https://github.com/google-research/harness2`，本地浅克隆 `main`（2026-10-19）。
> 目的：把两篇公众号文章的二手描述，逐条对到源码实现；给 SwarmStudio「改进实验台」提供可直接落地的约束。
> 阅读顺序：先看结论，再看分节证据；所有行号以本快照为准。

## 结论先行（五条）

1. **八组件不是八种文件，而是一棵可编辑树**。OpenCode 下有 8 条路径（系统提示词、护栏、长期记忆、工具指导、Skills、子智能体、脚本、插件），Codex 下压成 5 条（`AGENTS.md` 合并 c1/c3/c4/c6，Skills 换 `.agents/skills/`，插件换 `.codex/hooks.json`）。见 `core/prompts.py:424-430,475-480` 与 `substrate/opencode.py:42-88`、`substrate/codex.py` 的 `SurfaceSpec`。
2. **并行不是「K 个候选」而是「2K 候选 + K 个组合」**。每个任务跑 K 个不变式（INV）候选、K 个领域（DOM）候选，再由 K 个独立组合器各产出一份成品；顺序模式则是 K 轮「INV+DOM → 组合」，上一轮成品作为下一轮基线。见 `core/recursion.py:343-566`。
3. **选择器不看分数，看匿名交付物**。方法层把 K 个成品去掉非交付、匿名成 A/B/C、把完整交付物写到磁盘，让选择模型读文件后输出 `<choice>` 与 `<why>`；评分（judge）只在选择之后发生。见 `core/selection.py:15-16,268-357`。
4. **经验库是「按域 + 整棵 harness + 四字段教训」**。采纳后反思，只有 `cue/lesson/evidence/confidence` 齐备才入库；库按 benchmark/executor/mode/k/seed 隔离，任务只在同域内按顺序读取历史条目。见 `core/selection.py:402-505`、`core/library.py:15-181`、`core/schedule.py:331-347`。
5. **预算有恒等式，成本逐阶段记账，但没有 `--max-usd`**。账本要求 R=4k 次 rollout、P=3k 次改进会话，重复标签直接报错；成本字段存在，但官方没有内置预算上限，这是社区提出的缺口。见 `core/ledger.py:26-33,89-113`、`docs/EXPERIMENTS.md`。

## 1. 仓库结构与调用链

```
harness2/core/
  spec.py        benchmark 适配协议（方法层只看这些）
  tree.py        c1..c8 可编辑树的读/校验/写/diff/多样性
  context.py     证据树（唯一把证据送进模型的方式）+ 防泄漏
  proposer.py    通过 CLI 通道调用改进模型
  recursion.py   并行/顺序两种任务级递归
  selection.py   匿名选择 + 采纳后反思
  library.py     按域经验库
  ledger.py      R=4k / P=3k 预算账本
  schedule.py    任务流、续跑、库隔离
  judge.py       选择之后才评分（不在方法内）
substrate/
  opencode.py    OpenCode 可编辑面与安装模式
  codex.py       Codex 可编辑面与安装模式
```

调用链（单个任务）：`schedule` 先跑 k 次 base rollout → `recursion.run_mode` 做任务级递归并产出 k 个成品 → `selection.run_selection` 选一个 → `reflect_adoption` 反思并写库 → 之后 `judge` 才给分。这个顺序是理解源码的关键：**选择阶段拿不到分数，只有交付物和轨迹**。

## 2. 八组件可编辑面（源码逐字）

OpenCode 的 `OPENCODE_SURFACE`（`substrate/opencode.py:42-88`）：

| 本仓面 | 源组件 | 路径 | 上下文位置 |
|---|---|---|---|
| 系统提示词 | c1 persona/procedure | `systemprompt.md` | 常驻 |
| 护栏 | c6 always-on rules | `guardrails.md` | 常驻 |
| 记忆 | c3 durable domain facts | `LongTermMEMORY.md` | 常驻 |
| 工具指导 | c4 tool prose | `tool_descriptions/tool_guidance.md` | 常驻 |
| Skills | c6 reusable workflow | `skills/<name>/SKILL.md` | 按需（`skill` 工具） |
| 子智能体 | c5 delegated subagent | `sub_agents/<name>/AGENT.md` | 按需（`task` 工具，独立上下文） |
| 脚本 | c7 deterministic helper | `scripts/<name>.py` | 按需（Bash + python） |
| 插件 | c8 plugin | `plugin/<name>.ts` | 工具循环内 |

Codex 的对应关系（`core/prompts.py:475-480`）：`AGENTS.md` 合并 c1/c3/c4/c6；Skills 移到 `.agents/skills/<name>/SKILL.md`；子智能体、脚本路径不变；插件换成 `.codex/hooks.json`。源码注释明确说 c8 是「唯一能在工具循环内强制执行、模型无法跳过的杠杆」。

c2 没有独立文件，它对应「上下文如何组装」这一运行时角色；源码的八组件分组图把系统提示词、护栏、记忆、Skills 归为“构建上下文”，因此 c2 不是一个可编辑路径。

## 3. 任务级递归：2k 候选 + k 组合

并行模式（`core/recursion.py:343-449`）的调度：

```
k 次 base rollout（共享基线）
2k 个改进阶段：INV1..INVk, DOM1..DOMk
  - 每个阶段读同一份证据树（base rollouts + 当前 harness + 库 + 决策）
  - 提议失败：带错误重试 1 次；再失败则回退到 base（kept_base/fell_back）
2k 次候选 rollout
k 个组合阶段 AGG1..AGGk
  - 每个组合器拿全量候选的 harness + rollout 作为 pool
  - 产出 k 份成品
k 次成品 rollout
```

顺序模式（`core/recursion.py:452-566`）的调度：

```
k 次 base rollout
for t in 1..k:
  基于 current_harness 提议 INV_t、DOM_t（共享历史池）
  跑两份候选
  COMPOSE_t 把本轮候选与历史池合成 current_harness
  跑一份成品 c_t
  current_harness = c_t 的树
最终成品 c1..ck
```

账本恒等式（`core/ledger.py:26-33`）：`R=4k`（k base + 2k 候选 + k 成品），`P=3k`（k INV + k DOM + k 组合）。`assert_identity` 还会检查标签重复，因为重复标签可能凑够数量但实际少跑了一个候选（`ledger.py:89-113`）。

源码注释（`recursion.py:15-17`）直接写了「每个模式调度 4k 次 rollout 和 3k 个改进阶段」。

## 4. 证据树与提示词：短指针，不截断

`core/context.py:15-24` 定义的证据树：

```
context/task.md                  任务原文（去掉评分标准）
context/rollouts/<label>.md      完整轨迹（不按 prompt 预算截断）
context/deliverables/<label>/    交付物（由 judge 的提取器读取）
context/harness/<rel>            正在编辑的 c1..c8 树
context/library/INDEX.md         同域历史任务 + 完整 harness
context/pool/<label>/            组合阶段的候选 harness + rollout
MISSION.md                       任务说明（短指针）
```

`mission()`（`context.py:521+`）只给一段「证据在磁盘上，去读」的指针；改进器通过文件系统读证据，而不是把长轨迹塞进提示词。这是「上下文窗口就是计算边界」的工程落法。

## 5. 选择：匿名交付物 + 模型判断，无真值

`run_selection`（`selection.py:268-357`）的步骤：

1. 组装候选池：并行模式恰为 `agg1..aggk`，顺序模式恰为 `c1..ck`；base 明确排除（`selection.py:93-111`）。
2. 丢掉非答案：未成功、未交付、交付物为空、渲染失败的候选都记入 `dropped`（`selection.py:114-153`）。
3. 生成匿名 id：按 `task_id|k|mode` 做种子洗牌，映射到 A/B/C…，保证重跑稳定（`selection.py:71-86`）。
4. 把每个候选的完整交付物写到 `context/candidates/<id>.md`，不做裁剪；有渲染资产时也复制进去（`selection.py:183-219`）。
5. 选择器模型读文件，输出 ```choice``` 与 `<why>`；选择失败时回退到一个有交付的 base，再退到第一个成品，绝不抛异常（`selection.py:332-357`）。
6. k=1 时跳过选择器，直接交付唯一成品（`selection.py:360-399`）。

因此，源文的「不依赖标准答案」不是一句口号：**方法层根本没有分数**，选择器看的是交付物本身；judge 只在选择提交后运行（`spec.py:247-250` 与 `selection.py:15`）。

## 6. 反思与经验库：cue/lesson/evidence/confidence

采纳后 `reflect_adoption`（`selection.py:402-451`）重建证据树，复制 base harness，写 `adoption.json`（匿名 id → 实际标签的映射 + 选择理由），再让反思模型输出：

```
<experience>
cue: <什么情况下这条经验适用>
lesson: <可迁移的教训>
evidence: <支持它的执行证据>
confidence: <置信度>
</experience>
<edits> <每个编辑做了什么> </edits>
```

只有 `cue/lesson/evidence` 三项都非空才入库（`selection.py:493-505`、`library.py:43-47`）。

库的落盘结构（`library.py:15-24`）：

```
<root>/<run-tag>/<mode>/<domain>/INDEX.md
<root>/<run-tag>/<mode>/<domain>/harnesses/<task>/harness/<rel>
<root>/<run-tag>/<mode>/<domain>/harnesses/<task>/EXPERIENCE.md
```

要点：

- **按域检索**：域目录里只会有同域条目，检索是“构造出来的”，不靠相似度搜索（`library.py:20-24`）。
- **整棵树**：存的是完整 harness，不是摘要；后续任务可以在它的基础上改（`library.py:106-152`）。
- **隔离**：库按 benchmark、执行器、模式、k、seed 分开，避免一个模式污染另一个（`schedule.py:331-347`）。
- **顺序**：同域任务按顺序跑，只读更早的条目；不同域可并发（`docs/EXPERIMENTS.md`）。

## 7. 预算与账本

- R=4k、P=3k，`assert_identity` 强制对账（`ledger.py:26-33,89-113`）。
- 每个阶段记录 `usd / cached / attempts`；rollout 也有自己的账（`ledger.py:40-87`）。
- 没有 `--max-usd` 或预算上限；成本只记账不阻断。这是官方 README/EXPERIMENTS 与社区 issue 都提到的缺口。
- 阶段重试最多 2 次（`recursion.py:36 STAGE_ATTEMPTS=2`），传输重试 2 次（`config.py:TRANSPORT_ATTEMPTS=2`）。

## 8. 校验与安全（可直接复用的硬规则）

`core/tree.py` 的可编辑树校验：

- 路径必须命中 allowlist；`normalize_rel` 拒绝绝对路径和 `..`（`tree.py:82-110`）。
- 常驻文本上限 24,000 字符（OpenCode），理由逐字是「每个 token 都在和 Agent 自己的输出预算竞争」（`opencode.py:50-51`）。
- 每个技能必须有 `description:`；OpenCode 还要求 frontmatter `name:` 与目录一致，否则静默丢弃（`tree.py:267-298`）。
- 每个技能名必须出现在常驻文本里，否则是「死技能」（`tree.py:292-297`）。
- 子智能体需要 `description:`；OpenCode 还要求 `mode: subagent`（`tree.py:301-314`）。
- 脚本必须能 `compile()`；技能/常驻文件引用的脚本必须真实存在（`tree.py:317-333,254-264`）。
- hooks 文件必须是合法 JSON、顶层有 `hooks`、事件名合法、每个 hook 是 `command` 类型且命令非空（`tree.py:216-251`）。
- **防泄漏**：harness 与证据树不得包含评测器判词，逐字标记为 `deterministic_eval_summary`、`deterministic_eval_result`、`judge_scope_and_deterministic_status`、`Judge findings on the rendered result`、`"passed_count"`、`"pass_rate"`、`"test_pass_rate"`（`context.py:419-518`）。
- 多样性：候选树两两做逐行 Jaccard，塌缩成一份内容会被看见（`tree.py:407-427`）。
- 风险：Codex 执行器关闭沙箱，网络不限制；公开 benchmark 的评分标准可能被联网取到，官方建议在评测主机做出口防火墙/DNS 策略（`docs/EXPERIMENTS.md`）。

## 9. CLI 与可复现性

- 精炼：`harness2 --bench lab --k 3 --mode sequential --only-domains X --max-tasks 1`。
- 判分与报告必须使用相同的 benchmark、执行器、子集、k、mode、seed；换了模型或任务选择要换 `HARNESS2_RUNS_DIR`。
- `--dry-run` 只预览任务，不调模型；`--workers N` 按域并发；`--substrate cx` 切 Codex。
- `harness2-judge --bases` 给基线评分，便于对照成品。
- 重复同一命令即可续跑；缓存覆盖所有请求模式才会跳过。

## 10. 与本仓「改进实验台」的映射

| 源文机制 | 本仓落点 | 差异与说明 |
|---|---|---|
| 八组件可编辑树 | `surface-registry.ts` 八面登记 + `source` 映射（c1/c3/c4/c5/c6/c7/c8） | 本仓的“面”是 Hermes 运行时的真实产物（SOUL.md、skills、memories 等），不是基准树；源码映射用于对照，不冒充同一物 |
| 2k 候选 + k 组合 | `variants` + `probes` + `composition` | 本仓把候选生成交给用户/外部 agent，不内置 Proposer；`mode` 记录并行/顺序语义 |
| 不依赖真值的选择 | 工作台以行为对比 + 回归门 + 人工批准为主 | 本仓面向治理，保留 Eval Studio 的通过率/回归作为硬门；这是有意加严，不是源码复刻 |
| 匿名选择 | 前端展示候选标签；对比读数并列 | 未实现匿名选择器调用（不新增模型调用） |
| cue/lesson/evidence/confidence | `Experience` 新增可选字段 + 采纳时可选反思 | 已对齐四字段语义与“三项齐备才入库” |
| 按域经验库 | `Proposal.domain` + `Experience.domain` | 本仓在单一 store 内按域区分；未做按域目录的物理隔离 |
| 整棵 harness 快照 | `Experience.snapshot` 存被采纳候选内容 | 单文件面；多文件整树快照未做 |
| R=4k/P=3k 账本 | 提案级 `budgetCapUsd` + 每个探测的真实成本 | 本仓没有 rollout 账；以 Eval 运行成本替代 |
| 防泄漏标记 | `findGraderMarkers` 在创建提案时拒绝 | 逐字对齐源文 marker 清单 |
| 候选多样性 | `candidateDiversity` + `candidate_collapse` 警告 | 逐行 Jaccard，与 `tree.diversity` 同口径 |
| 常驻文本上限/技能触发/脚本编译/hooks schema | 未全量移植 | 本仓 managed 面只有 SOUL.md 与 SKILL.md；已加非空与防泄漏检查，结构校验待后续（见挂账） |

## 11. 本批直接回灌的源码约束

1. **八面源码映射**：每个面新增 `source.components/context/opencode/codex`，治理页可见。
2. **防泄漏**：候选内容命中源文七个 marker 之一即拒绝创建（400，返回命中清单）。
3. **多样性**：提案派生 `diversity`（n / nDistinct / meanLineJaccard）；塌缩或并行单候选给警告。
4. **经验库**：提案新增 `domain`；经验新增 `domain/cue/lesson/evidenceText/snapshot`；采纳时可提交反思，三项齐备才写入 adopted 经验并附 harness 快照。
5. **留痕**：批准绑定候选集合摘要；晋级记录 applied/backup；回滚校验当前文件摘要，外部改动拒绝覆盖。

## 12. 未移植项与理由

- **Proposer/Aggregator 会话**：源文通过 CLI 让模型改 harness；本仓已有自己的 Agent/IDE 与审批链，重复造 Proposer 会引入第二套模型调用与成本口径。工作台只接收候选内容。
- **匿名选择器**：本仓的治理目标是“人可复核”，显示候选标签与证据更利于审计；匿名选择适合基准评测，不适合治理页。
- **4k/3k 账本**：本仓不跑 baseline/候选 rollout，探测绑定外部 Eval 运行；因此只做提案级预算与实测成本，不伪造 R/P 计数。
- **完整 tree 校验**：常驻上限、技能触发、脚本编译、hooks schema 属于 Hermes 运行时/技能治理面的职责；工作台已接入防泄漏与路径安全，结构校验留在既有 `skillgov`/`qgate` 面，避免双重事实源。

## 参考锚点

- `README.md`：两阶段递归与八组件定义。
- `docs/EXPERIMENTS.md`：k/mode/seed 语义、成本、网络限制、续跑。
- `harness2/core/prompts.py:424-430,475-480`：OpenCode/Codex 组件表。
- `harness2/core/tree.py:42-110,216-333,336-427`：可编辑面、校验、diff、多样性。
- `harness2/core/recursion.py:36,343-566`：并行/顺序调度与重试回退。
- `harness2/core/selection.py:71-153,268-505`：匿名选择、回退、反思。
- `harness2/core/library.py:15-181`：按域经验库结构。
- `harness2/core/ledger.py:26-113`：R/P 恒等式。
- `harness2/core/context.py:399-518`：防泄漏路径与判词标记。
- `harness2/substrate/opencode.py:42-88`、`substrate/codex.py`：两种执行器的 SurfaceSpec。
