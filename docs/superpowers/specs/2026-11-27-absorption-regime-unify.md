# 吸收制度合一、台账退役与记忆清理（2026-11-27）

> 状态：用户 2026-11-28 批准；实施中。「验证」一节在收口时回填实测数字。实施计划见 `docs/superpowers/plans/2026-11-28-absorption-regime-unify.md`。
> 来源：用户 2026-11-27 指令「按 C 做」。C 方案出自同日对「调研学了很多却形不成演进路线」的复盘：把三套吸收制度合并成一套，退役一批台账，清理项目记忆。调查事实存在项目记忆 `rsi-route-retro-20261127`。
> 吸收总账：不适用（治理整顿，无外来材料）。

这份规格让今后的吸收轮只有一个入口：开工先查一本账，裁决只用一套词，落地必须报成色，没落地的事必须带回看日。读者是执行或审查这次整顿的开发会话与审查者。

## 一、现在哪里出了问题

| 现象 | 证据 |
|---|---|
| 同一件裁决有三套说法 | `team/skills/devops/harness-fusion-patterns/SKILL.md:72` 写「吸收/保留/不吸收」；`team/skills/devops/article-methodology-fusion/SKILL.md:25` 写「吸收/收缩吸收/等效印证/不吸收」；swarm-yuan 侧的台账引决策 36 写「改写吸收/记档观察/不吸收」（`skills/swarm-yuan/docs/research/2026-10-20-absorption-ledger-and-capability-inventory.md:187`） |
| 规程在仓里，吸收轮不走它 | 2026-10-24 起 22 份吸收类规格里，写采集深度的 4 份、写回看安排的 0 份、写落地成色的 0 份；三个 hermes 侧规程技能的名字，在 10-31 之后的规格以及 `custom/`、`scripts/`、`docs/manuals/`、`AGENTS.md` 里零引用 |
| 摘要级材料先落地，全文到了再补 | Trustworthy RSI 综述：10-31 按摘要落了约束保持门（`docs/reports/2026-10-31-rsi-survey-and-tech-stack.md:132`），11-26 读完 82 页全文后补四个缺口（`docs/superpowers/specs/2026-11-26-trustworthy-rsi-fulltext.md:6`）；Proactive AI 综述同型（项目记忆 `proactive-ai-round2-20261114`） |
| 挂账提出后再无人提起 | `ROUTING_MIN_RANK1`、`evaluateFourMode`、`TOOL_OUTCOME_UNKNOWN`、可学习性奖励四项，各只在提出它的那份规格里出现（本轮逐项检索核实）；同类共 12 项，清单见「变更」§2 |
| 规程数量超出设计原则 | `docs/DESIGN.md:1306` 写「同主题技能不超过 3 本」；hermes 侧同属吸收、调研、融合的技能有 18 本 |
| 停更的快照仍被当作现状 | `skills/swarm-yuan/docs/research/2026-10-20-absorption-ledger-and-capability-inventory.md` 自述「派生视图，不承载真值」，10-24 后停更；`docs/absorption-domain-README.md` 只索引 10-01 一批 |
| 登记机制立了没人用 | `docs/superpowers/specs/registry/` 于 11-05 立，只有 `ainative` 一个域；`scripts/spec-archive.mjs` 在 `package.json`、回归矩阵、钩子、CI 里都没有调用登记；读登记目录的只有脚本自己与它的测试 |
| 记忆索引超限 | `MEMORY.md` 共 25,407 字符，超过 24,400 的限额，会话启动时末尾 2 行被截掉；115 行的长度在 201 到 400 字符之间；4 个文件各登记了两到三次 |

另有一处要先处理再改规程：两份枢纽技能的宿主副本比仓内正本新（`article-methodology-fusion` 是 1.7.0 对 1.5.0，`harness-fusion-patterns` 是 1.5.0 对 1.4.0）。直接在仓内扩写，会把宿主新增的内容挡在正本之外。

## 变更

### 1. 规程合一：一份正本管三类对象、四类材料

正本是 `team/skills/devops/article-methodology-fusion/SKILL.md`，升到 2.0.0（理由见决策 D1）。

1. **先回灌**：用宿主 `~/.hermes/skills/devops/` 下的两份副本逐字节覆盖仓内同名文件。差异已逐行看过：前者多 1 条坑、1 条坑的补记、第 3 步的增补和版本号；后者多「第五波速查」20 行与一处状态修正。两份都没有账号、密钥、令牌。回灌后跑 `team/tests` 下的隐私测试。
2. **改抬头**：适用面从「文章源 → hermes 集群」扩成四类材料（文章、论文、报告；代码仓；技能包；上游版本差量）乘三类对象（AIStudio；hermes 智能体团队；swarm-yuan）。
3. **新增一节**，标题逐字为 `## 跨对象总规程（三类对象 × 四类材料）`，内容是下面的五步、词表、各对象附加约束表。
4. **第 3 步**（现状扫描与防重复融合）开头加一句：先查吸收总账，再查三处档案家。
5. **第 6 步**（落地与机械验收）末尾加三件事：标成色、写总账、定回看日。

五步：

| 步 | 做什么 | 完成标志 |
|---|---|---|
| 1 同源查重 | 查吸收总账；再查三处档案家：`docs/superpowers/specs/`、`skills/swarm-yuan/docs/research/`、`~/.hermes/shared/research/`（含各 profile 的 `workspace/research/`）。关键词用原文链接、仓库名、论文编号、标题里的独特词 | 命中即前轮已开工：逐条核验前轮落点是否真在位，只补缺口；未命中才从头做 |
| 2 采集存档标深度 | 深度三档：源码级、全文级、摘要级 | 深度写进总账行和来源档首段 |
| 3 逐条裁决 | 五个判定词：吸收、收缩吸收、等效印证、记档待定、不吸收。每条带理由和落点 | 裁决矩阵落盘；判一条不连带判相邻条 |
| 4 落地标成色 | 成色三档：语义落地、机制落地、效力落地。另记一栏「默认行为变更：有或无」 | 原入口命令实跑；过独立审查；成色写进总账 |
| 5 入账与回看 | 每轮写一行；每个记档待定项单独成行并带回看日 | 总账有行；下一次吸收轮做第 1 步时，读出到期的待定行并汇报 |

两条硬约束写进规程：摘要级材料不得直接落地，只能记为「记档待定」（D4）；落地物是只读诊断或默认关闭的开关时，「默认行为变更」记「无」，成色最高记到「机制」。

词表（统一词，以及归并进来的旧词）：

| 统一词 | 归并的旧词 | 旧词出处 |
|---|---|---|
| 吸收 | 吸收、保留、改写吸收、派卡 | `harness-fusion-patterns:72`；swarm-yuan 台账 §2.6（引决策 36）；宿主 `harness-fusion-patterns` 第五波速查 |
| 收缩吸收 | 收缩吸收 | `article-methodology-fusion:25` |
| 等效印证 | 等效已有、等效印证、核实已存在 | 宿主 `harness-fusion-patterns` 第五波速查；`article-methodology-fusion:25`；`docs/absorption-domain-README.md:16` |
| 记档待定 | 记档观察、登记待裁决、挂账、有意不落 | swarm-yuan 台账 §2.6（引决策 36）；宿主第五波速查；`team/skills/devops/fusion-landing-audit/SKILL.md:18` |
| 不吸收 | 不吸收、语境 DROP | `article-methodology-fusion:24`；`team/skills/devops/fusion-landing-audit/SKILL.md:24` |

各对象附加约束：

| 对象 | 落地时还要守什么 |
|---|---|
| AIStudio | 规格四段与设计文档同步声明（仓规第 2 条）；改动按纯新增或骨架修改分类落位 |
| hermes 智能体团队 | 先改仓内 `team/` 正本，宿主副本走安装通道；跨 profile 写入按原有路由 |
| swarm-yuan | 入库前两问是硬判据，答不上不入库（决策 46）；证据分 A、B、C 三级（决策 39）；轮档落 `skills/swarm-yuan/docs/research/R<编号>-*.md`；改技能升版本号并写变更记录 |

`team/skills/devops/harness-fusion-patterns/SKILL.md` 升到 1.6.0：第 4 步「吸收/保留/不吸收三分」后加一句，判定词与成色以跨对象总规程的词表为准。`fusion-landing-audit` 与 `research-ledger-reconciliation` 正文不动，由总规程点名为回看与季度对账的程序。

### 2. 吸收总账：一本账管查重、挂账与回看

路径 `team/shared/research/absorption-ledger.md`，与技术组件台账同处（理由见 D2）。Markdown，三张表。

| 表 | 一行是什么 | 列 |
|---|---|---|
| 一、轮次 | 一轮吸收 | 编号、日期、来源、深度、对象、裁决计数、成色计数、默认行为变更、来源档、回看日 |
| 二、记档待定 | 一条没落地也没否决的事 | 编号、提出处、事项、回看日、处置 |
| 三、规程地图 | 一份载体 | 路径、所属侧、角色（规程、真值、已冻结、已退役）、说明 |

编号规则：轮次从 `L001` 顺排，待定从 `P001` 顺排。取值只用 §1 的三个深度档、五个判定词、三档成色。表二的「提出处」写提出它的轮次编号；治理类事项没有轮次，写提出它的规格文件名。裁决计数与成色计数各写成以斜杠分隔的非负整数，顺序同词表。历史规格没写的事实记「未声明」；没有外来材料可裁的轮次，裁决计数与成色计数记「不适用」。

回填范围分四块。

**轮次行，22 行。** 下面 22 份规格各一行：前 18 份按文件名识别，后 4 份按内容识别。深度、裁决计数、成色取自规格正文；规格没写的记「未声明」，不推断。`2026-11-21-sim-product-absorption-roadmap.md` 没有外来材料，来源照实写，裁决计数与成色计数记「不适用」。

```
2026-10-24-swarm-eval-benchmark-absorption.md
2026-10-25-agent-data-flywheel-absorption.md
2026-10-26-joyai-closed-loop-absorption.md
2026-10-27-version-diff-absorption.md
2026-10-30-helixharness-absorption.md
2026-10-30-swarm-yuan-ub-mode-absorption.md
2026-10-31-daily-research-absorption.md
2026-11-03-swarm-yuan-absorption-pstack-evals.md
2026-11-05-ainative-absorption.md
2026-11-05-four-rsi-papers-absorption.md
2026-11-07-ponytail-headroom-absorption.md
2026-11-11-zcode-3180-sync-and-qwen-absorb.md
2026-11-12-ai-agent-handbook-absorption.md
2026-11-16-always-on-agents-absorption.md
2026-11-20-agnes-harness-absorption.md
2026-11-20-rsi-lifecycle-absorption.md
2026-11-21-sim-product-absorption-roadmap.md
2026-11-25-zcode-400-capability-absorption.md
2026-11-23-rsi-recursive-theory.md
2026-11-26-trustworthy-rsi-fulltext.md
2026-11-26-palantir-self-improvement-architecture.md
2026-11-27-palantir-rulings-followup.md（Palantir 批的接续轮）
```

文件名含那四个词、但不是吸收轮的已合入规格，一律入账并在行内说明，因为已合入的规格不能改抬头。还没合入的，可以在抬头写「吸收总账：不适用」加理由，本规格即一例。

**记档待定行，蒸发挂账 12 行。** 回看日取提出日加 60 天。行号已逐条核对。

| # | 事项 | 提出处 |
|---|---|---|
| 1 | `ROUTING_MIN_RANK1` 初值 90，待对生成物实测后调整 | `2026-11-03-swarm-yuan-absorption-pstack-evals.md:67` |
| 2 | 上下文开销比的 token 口径（现为字符代理比值） | `2026-11-05-ainative-absorption.md:90`、`:188` |
| 3 | OO-Harness 的 base/specialized/router 骨架 | `2026-11-05-four-rsi-papers-absorption.md:88` |
| 4 | LLM 硬准入 | `2026-11-12-ai-agent-handbook-absorption.md:85` |
| 5 | 手册批 5（资产登记册与 Agent Release） | `2026-11-12-ai-agent-handbook-absorption.md:10` |
| 6 | `evaluateFourMode` 接入执行链 | `2026-11-16-always-on-agents-absorption.md:143` |
| 7 | Agnes 快路径未经真实流量验证 | `2026-11-20-agnes-harness-absorption.md:135` |
| 8 | Agnes `TOOL_OUTCOME_UNKNOWN` 一次性许可 | `2026-11-20-agnes-harness-absorption.md:134` |
| 9 | Agnes 会话级插件 pinning | `2026-11-20-agnes-harness-absorption.md:134` |
| 10 | 可学习性奖励 `r=1−p` | `2026-11-23-rsi-recursive-theory.md:36` |
| 11 | zcode 4.0 能力吸收 P2（设计插件试用） | `2026-11-25-zcode-400-capability-absorption.md:3` |
| 12 | SIM 重建后的端到端验证 | `2026-11-21-sim-product-absorption-roadmap.md:38` |

**记档待定行，待判载体 8 行。** 提出处写本规格文件名，回看日 2026-12-27。对象是 7 个入站引用不超过 1 处的 hermes 侧技能：`fusion-evidence-commit-hygiene`、`kanban-heavy-fusion-playbook`（各 0 处）；`delta-research-dispatch`、`fusion-field-to-skill-flywheel`、`incremental-repo-research`、`local-skill-fusion-routing`、`upstream-agent-skill-fusion`（各 1 处）。再加附录 B（`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-b-plans-research.md:4`，历史索引，自述目录数量不滚动维护）。
**规程地图。** 表三登记三侧现行载体：规程正本；各侧真值载体（`skills/swarm-yuan/references/capability-map.md`、`skills/swarm-yuan/docs/upstream-baseline.md`、技术组件台账）；本批冻结与退役的 T1、T2。

守门测试 `custom/__tests__/absorption-ledger.test.ts`。放在这个目录下就被根测试面的既有覆盖规则纳入，不改回归矩阵（`scripts/__tests__/regression-matrix.test.ts:101` 的发现规则会复核）。五条断言：

| 断言 | 判红条件 |
|---|---|
| A 来源档真实 | 表一任一行「来源档」列写了的文件路径不存在 |
| B 可识别的吸收规格全部入账 | `docs/superpowers/specs/` 直接子文件里，日期不早于 2026-10-24 且文件名含 absorption、absorb、research、survey 之一的规格，既没有被表一任何一行的来源档引用，前 15 行里也没有「吸收总账：不适用」 |
| C 新规格声明的行不悬空 | 日期不早于 2026-11-28 的规格，前 15 行出现「吸收总账：」且后面不是「不适用」时，其后的编号不在表一，或该行来源档不是这份规格 |
| D 待定行字段齐 | 表二任一行缺提出处或回看日；提出处写的轮次编号不在表一，或写的规格文件不存在；回看日不是 `YYYY-MM-DD` |
| E 用词不漂移 | 表一、表二里深度、裁决计数、成色计数、处置四列的取值，不是词表里的词、「未声明」、「不适用」、规定格式的计数 |

机检覆盖不到的一类：文件名里没有那四个词、抬头也没写「吸收总账：」的吸收规格。这一类靠独立审查节点按规程第 1 步核对，不靠机检。

### 3. 入口：开工前先查账

- `AGENTS.md` 工作规则加第 15 条：吸收轮开工前先查吸收总账的同源行，按跨对象总规程执行，收口时登记轮次行，记档待定项逐条入账；新写的吸收规格在抬头写「吸收总账：编号」。
- `docs/README.md`：现行入口表里「上游吸收域单页索引」一行改指吸收总账；目录职责表补 `team/shared/research/` 一行。

### 4. 退役与降级清单

| 编号 | 对象 | 证据 | 处置 |
|---|---|---|---|
| T1 | 规格按域登记机制：`scripts/spec-archive.mjs`、`scripts/__tests__/spec-archive.test.ts`、`docs/superpowers/specs/registry/` | 11-05 立，只用过 `ainative` 一个域；脚本没有自动调用方；读登记目录的只有脚本自己与它的测试 | 删脚本与测试。登记目录保留，`README.md` 标「已冻结」。`config/mechanism-budget.json` 删 `spec-archive` 条目，`limits.scripts` 由 79 改 78，`changes` 记一条。召回走 git 历史 |
| T2 | `skills/swarm-yuan/docs/research/2026-10-20-absorption-ledger-and-capability-inventory.md` | 自述不承载真值；10-24 后停更；唯一引用方是 `skills/swarm-yuan/docs/design-redesign-2026-10-21.md` | 不移动。文件前 6 行内加冻结声明，指向吸收总账与 `skills/swarm-yuan/references/capability-map.md` |
| T3 | `docs/absorption-domain-README.md` | 只索引 10-01 一批；8 处入站引用 | 缩成不超过 15 行的指针页：技术组件台账、吸收总账、10-01 的两份报告。路径不变 |
| T4 | 项目记忆索引 `MEMORY.md` | 见 §5 | 重写 |

T1 删脚本后，规格 `2026-11-05-ainative-absorption.md` 抬头指向的 `registry/ainative.md` 仍在，不产生悬空引用。

### 5. 记忆清理（仓外，可回滚）

对象是 ZCode 的项目记忆目录 `/Users/cuishi/.zcode/cli/memories/projects/aistudio-a5936c959ea077fa/memory/`，现有 919 个主题文件。只动索引和已证实过期的条目，不批量删主题文件（D8）。

1. 先备份：整个目录打一个压缩包，放在记忆目录的上一级，文件名带日期。
2. 重写 `MEMORY.md`：每个文件只留一行；行长不超过 160 字符；只写标题加一句钩子，过程细节留在主题文件里。目标总字符数不超过 22,000。现有 4 个重复登记的文件各并成一行。
3. 订正已证过期的条目：对清单后面「过期候选」表的 14 行逐份核对，属实的在主题文件末尾加一行「现状（2026-11-27 核）」，索引行同步改；查下来说法已错、又没有可复用教训的，移出索引，文件保留。
4. `memory-index-archive.md`：页头的截止日期改成实际覆盖范围；页尾两条互相矛盾的计数注记并成一条。
5. 立长期规则：存一条 feedback 类记忆，写明索引行长上限、同文件单行、状态类信息不进索引标题、每月末把两个月前且不是 feedback 类的条目移出索引。

过期候选 14 行，来自同日子代理盘点。标「已核」的两行，本轮直接核对过文件原文；其余以核对结果为准。

| # | 记忆文件 | 待核实的过期说法 |
|---|---|---|
| 1 | `daily-research-absorption-20261031` | 记 hermes-studio v0.8.0 未升级、zcode 3.17.1 未同步；`vendor/VENDOR.md` 现为 v0.8.30（已核） |
| 2 | `rsi-improvement-plan-20261031` | 「主动式 AI 吸收」一段仍是五档旧口径，已被 11-03 第二轮改写 |
| 3 | `rsi-improvement-plan-20261031`、`rsi-lifecycle-survey-research-20261120`、`rsi-math-absorption-20261123`、`palantir-self-improvement-20261126` | 「机制扩展停止」的裁定日期有 10-31 与 11-01 两种写法 |
| 4 | `loop-graph-selfdrive-readiness` | 记「run13 验证后再打开」；之后已打开，10-24 循环面换成工作流，10-20 运行中心界面已删 |
| 5 | `loop-graph-redesign-progress` | 图引擎默认 legacy、附录 A 登记、工作树位置，都是当时的状态 |
| 6 | `rsi-kernel-design` | 记「全部实测验证」；10-31 记缺口登记册已迁址、探针指向旧路径 |
| 7 | `zcode-rsi-loop-workflow-20260928`、`zcode-session-db-loop-graph-workflow-20260928` | 会话数、消息数是 09-28 的快照 |
| 8 | `ai-native-testing-research-20261102`、`proactive-ai-round2-gaps-20261114`、`rsi-lifecycle-survey-research-20261120`、`intelligent-ui-source-research-20261124` | 写「待裁决、未开工、待立项」，对应批次其后已落地或合入 |
| 9 | `agnes-harness-absorption-20261120`、`loopforge-sop-trust-implementation-20261116` | 摘要仍写待合并、待开工，实已合并收官 |
| 10 | `four-rsi-papers-absorption-20261105` | 客户端类型基线记 96 待清偿，11-23 记为 15；「OO-Harness 最小骨架」无后续 |
| 11 | `zcode-3180-sync-qwen-absorb-20261111` | 3.18.0 基线与「引擎产物仍旧」是临时状态，现为 4.0.0 |
| 12 | `task-intent-single-slot-concurrent-20261127`、`loop-to-workflow-20261024` | 前者第 27 行仍写「已作为待裁决项交给用户」，第 25 行已记定为仓规第 14 条；后者第 35 行仍把房间下拉列在余项里，第 31 行记已清（已核） |
| 13 | `rsi-math-absorption-20261123` | 衰减审计口径 11-26 已改为含已回滚轮 |
| 14 | `memory-index-archive.md`、`MEMORY.md` | 归档索引页头写「2026-11-01 之前」，实际含到 11-12 的条目；索引页尾两条归档说明分别写 413 条与 173 条（按上面第 4 步处置） |

### 6. 不在本批的事

| 事项 | 为什么不在这批 |
|---|---|
| hermes 自主轮次（夜间循环、雷达派工）强制入总账 | 要在宿主与仓之间双向同步总账，是新增机制；本批总账只覆盖仓内发起的轮次（D2） |
| 夜间任务收窄为只出草案；三对象的健康指标与月度排序 | 属于复盘里 A 方案的部分，用户选的是 C；总账的待定表与回看日已为它备好数据 |
| 项目技能 aistudio-dev 的认知快照刷新（停在 10-24） | 要走 swarm-yuan 生成器的刷新链，另立一批 |
| 把两份枢纽技能的新正本部署到宿主 | 宿主写入走 `team/` 安装通道，时机由用户定（D9） |
| hermes 的 hindsight 记忆 | 与 ZCode 项目记忆是两套系统；本批只清后者 |
| 运行态四本账本（决策、收据、拦截、复发） | 提交钩子在用 |
| 已合入的规格 | 历史按当时事实保留（`docs/README.md` 归档规则 3） |
| 按轮次编写的挂账台账口径 | 用户 2026-11-03 立法，改它要用户明示 |

### 7. 实施顺序

批一，记忆清理（仓外，不占合并窗口）。批二，回灌两份技能、扩写规程正本、建总账并回填、写守门测试、改 `AGENTS.md` 与 `docs/README.md`。批三，T1 到 T3。批四，合并前回归。推送按仓规第 14 条先登记本批任务卡，范围写实际变更集。

### 验收判据

- 仓内 `article-methodology-fusion/SKILL.md` 版本号不低于 1.7.0，含标题逐字为「跨对象总规程（三类对象 × 四类材料）」的一节，含五个判定词的词表。
- `custom/__tests__/absorption-ledger.test.ts` 五条断言全过；变异探针 3 个全判红：删表一一行；在一份新规格抬头写一个不存在的编号；删表二某行的回看日。
- `scripts/spec-archive.mjs` 与其测试文件不存在；`docs/superpowers/specs/registry/README.md` 含「已冻结」；`config/mechanism-budget.json` 没有 `spec-archive` 条目，`limits.scripts` 等于在册脚本数。
- `docs/absorption-domain-README.md` 不超过 15 行，页内三个链接的目标文件都存在。
- T2 文件前 6 行含冻结声明与两个指向现行载体的链接。
- 记忆索引：总字符数不超过 22,000；同一文件只出现一次；被索引的文件全部存在；备份压缩包存在且能列出 919 个文件。
- `AGENTS.md` 含第 15 条，引用总账路径与规程正本路径。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 规程正本定为扩写既有 `article-methodology-fusion`，不新建技能 | 设计正本写明同主题技能不超过 3 本；该技能已有 10 处入站引用和 26 条实证坑 | 新建一本控制面技能（否决：成了第 19 本）；改 `harness-fusion-patterns` 当正本（否决：它是仓库源分支的母本，文章源分支由它指向前者） | 是 |
| D2 | 总账放 `team/shared/research/`，仓内是唯一主本；hermes 自主轮次本批不入账 | 与组件台账同处，随 team 包到达宿主；两个部署域各留主本，会重演夜间循环技能 379 行对 633 行的漂移 | 放 `~/.hermes/shared/research/`（否决：仓外没有版本历史，ZCode 会话写宿主有事故先例）；建同步脚本（否决：新增脚本） | 是 |
| D3 | 五个判定词统一；旧词按词表归并，不回改历史文档 | 三套同义词是重复吸收和口径漂移的直接来源；历史文档按当时事实保留 | 各侧留原词、只做映射（否决：映射表本身成了第四份口径） | 是 |
| D4 | 摘要级材料不得直接落地 | Trustworthy RSI 与 Proactive AI 两例都是摘要级先落、全文到后补 | 允许摘要级落地但加标注（现状；否决：标了没人回看） | 是 |
| D5 | 守门做成测试进 `npm test`，不加门、不加钩子 | 规程文字 4 周零引用；测试不计入机制预算，随全量回归执行 | 只写规程（否决：同类规程已有零引用先例）；加 qgate 门（否决：与「机制扩展停止」的既有裁定相抵） | 是 |
| D6 | 规格按域登记机制退役：删脚本与测试，登记目录冻结 | 立后 3 周只有 1 个域、没有自动调用方；与新增的总账配对 | 留到 12-20 复审（否决：用户选 C 要求本批退役一批，而它零消费） | 是，git 召回 |
| D7 | hermes 侧 7 个低引用技能本批只登记不删 | 入站引用数是静态证据；域退役判据要求多轮确认人与智能体都不用 | 本批直接删（否决：11-12 删 27 个域被用户推翻的先例） | 是 |
| D8 | 记忆清理先备份；只动索引与已证过期的条目，不批量删主题文件 | 919 个文件只有索引进上下文；删除不可逆，多数文件含实证坑 | 按日期批量删（否决）；全量重新蒸馏（否决：本身是一轮大工程，另议） | 是 |
| D9 | 两份枢纽技能的新正本本批不部署到宿主 | 宿主写入有事故先例；走 team 安装通道，时机由用户定 | 本批直接拷贝两个文件（否决） | 是 |

## 验证

实施后逐条执行，实测数字回填本节。

1. `npx vitest run custom/__tests__/absorption-ledger.test.ts`（新增）；同批复跑 `custom/__tests__/docs-ssot-guard.test.ts`、`custom/__tests__/l2-kit-parity.test.ts`、`scripts/__tests__/regression-matrix.test.ts`，以及引用 `AGENTS.md` 的测试文件。
2. 变异探针 3 个；做完后核对被改文件的合并摘要与变异前一致。
3. `node scripts/governance-lint.mjs --budget`：0 problem，`scripts` 上限等于在册数。
4. `node scripts/gen-doc-indexes.mjs --check` 与 `node scripts/merge-invariants.mjs --check`。
5. 回灌后跑 `team/tests` 的隐私测试；T2 改文件头后跑 swarm-yuan 的文档数字测试 `test-doc-numbers.sh`。
6. 合并前 `npm run regress -- --scope merge`；负载高导致单面超时的，按回归工具给出的办法单面复跑并如实记录。
7. 记忆索引实测：总字符数、行数、重复数、断链数；备份压缩包内的文件数。
8. 实施时如仍未做，须写进交付说明的未验证项：宿主副本未更新；hermes 自主轮次未入账；项目技能认知快照未刷新。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md`：治理原则段（「同主题技能不超过 3 本」所在的一段）补三句——外来材料的吸收只有一份规程正本、一本总账；裁决只用五个判定词，落地必报三档成色；记档待定项带回看日。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：§A 增一行「吸收制度：规程 1 份、总账 1 本、判定词 5 个、成色 3 档、深度 3 档」，权威依据写本规格。
