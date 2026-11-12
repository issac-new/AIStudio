# 产品域退役盘点（只盘点不删码，2026-11-12）

## 变更

custom/server 共 171 个域（目录），其中 98 个「创建后 ≤3 提交」（口径：`git log --follow -- custom/server/<域>` 计数，基线=本分支起点 origin/main@034e94138；背景材料说的 99 与实测差 1，以实测为准）。这批域有「写完即弃」嫌疑。本 spec 对 98 个域逐个判消费方，产出三档判定表：**候选退役 / 需用户裁决 / 保留**。本盘点是裁决入口，不删任何代码；退役动作待用户批准后另行立项。

### 判定口径（五路消费信号）

对每个域采集：

| 信号 | 采集方法 | 含义 |
|---|---|---|
| client | `git grep -E 词边界(域名)` 在 `custom/client` 的命中文件数 | 客户端引用（import 路径 / API 前缀；common-word 域名有自然语言碰撞，弱信号域已逐个人工复核） |
| inv | 同词边界在 `docs/manuals/aistudio-feature-inventory.md` 的命中行数 | 特性清单登记 |
| serverX | `git grep -E "['\"][^'\"]*/<域>/"` 在 custom/server 其他域生产代码（排除双方 `__tests__`） | 服务端跨域消费（含动态 import；域路由可经 controller 挂载，见 custom/server/AGENTS.md「路由挂载」） |
| patch | 词边界在 `patches/` 的命中文件数 | 挂载补丁引用（独立路由须 patches/ 挂载补丁登记） |
| commits | `git log --follow` 计数 | 域活跃度 |

- **候选退役**＝五信号全零：客户端零调用＋特性清单未列＋无服务端跨域消费＋无挂载补丁＋无registries 引用。
- **需用户裁决**＝客户端与清单皆零，但存在内部消费（serverX/patch）或属战略储备/正本引用/仅注释级命中。
- **保留**＝客户端或特性清单有真实引用（弱信号者已人工复核为代码级消费）。

已知碰撞源与处置：common-word 域名（ask/plan/swarm/speech 等）的词边界命中含英文注释、CSS 类（`speech-playing`）、i18n 文案；因此凡 client≤3 的保留判定都复核了非测试命中行的代码级形态（import / API 调用 / 动态 import），三个仅注释/文案命中域降级为需裁决。

### 判定汇总

29 候选退役 ｜ 25 需用户裁决 ｜ 44 保留（合计 98）。

### 候选退役（29，五信号全零）

| 域 | commits | client | inv | serverX | patch | 判定 |
|---|---|---|---|---|---|---|
| `agentsmd/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `autosteps/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `bashcontract/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `benchmarkforge/` | 2 | 0 | 0 | 0 | 0 | 候选退役 |
| `browserloop/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `changedfiles/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `cmdmeta/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `commandtask/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `configlayers/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `crdt/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `disclosurerules/` | 2 | 0 | 0 | 0 | 0 | 候选退役 |
| `distillgate/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `fileundo/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `goalpreempt/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `managerhub/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `permpresets/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `prdelivery/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `rulesscope/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `secguidance/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `sessionfork/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `squadcoord/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `taskgroups/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `teamsummary/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `tooldesc/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `tuicopy/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `urgencyesc/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `windowshift/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `workerabs/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |
| `wsgroups/` | 1 | 0 | 0 | 0 | 0 | 候选退役 |

### 需用户裁决（25）

| 域 | commits | client | inv | serverX | patch | 判定 |
|---|---|---|---|---|---|---|
| `auditchain/` | 1 | 0 | 0 | 4 | 0 | 需裁决 |
| `boardorg/` | 1 | 1 | 0 | 0 | 0 | 需裁决：客户端仅注释提及（IdeKanbanPane.vue:4），无 import/API/挂载消费 |
| `browsersec/` | 1 | 0 | 0 | 2 | 0 | 需裁决 |
| `cacheattr/` | 1 | 0 | 0 | 1 | 0 | 需裁决 |
| `delivery-contract/` | 1 | 0 | 0 | 0 | 0 | 需裁决：simharness PM 技能引用其为交付形态六型正本（simharness/skills/pm-planning/SKILL.md:9） |
| `kgevolution/` | 1 | 0 | 0 | 0 | 4 | 需裁决 |
| `managedsettings/` | 1 | 0 | 0 | 2 | 0 | 需裁决 |
| `result-contract/` | 1 | 0 | 0 | 1 | 0 | 需裁决 |
| `speech/` | 1 | 1 | 0 | 0 | 7 | 需裁决：唯一 client 命中是英文注释（speech bubble）；patch 命中全是 `speech-playing` CSS 类与 i18n 文案碰撞——零真实消费 |
| `statusline/` | 1 | 1 | 0 | 0 | 0 | 需裁决：唯一命中是 UI title 文案（IdeStatusBar.vue:315），无代码消费 |
| `team-library/` | 1 | 0 | 0 | 1 | 0 | 需裁决 |
| `autosched/` | 2 | 0 | 0 | 0 | 4 | 需裁决 |
| `callgate/` | 2 | 0 | 0 | 2 | 0 | 需裁决 |
| `faileroute/` | 2 | 0 | 0 | 1 | 4 | 需裁决 |
| `modelcap/` | 2 | 0 | 0 | 0 | 2 | 需裁决 |
| `obsalerts/` | 1 | 0 | 0 | 1 | 0 | 需裁决 |
| `userperms/` | 2 | 0 | 0 | 0 | 4 | 需裁决 |
| `approval-ledger/` | 3 | 0 | 0 | 3 | 3 | 需裁决：统一审批账本 P0b（AGENTS.md 关键域索引在列；消费方=toolpipeline/mention-dispatch，客户端面未接） |
| `approval-rules/` | 3 | 0 | 0 | 2 | 15 | 需裁决：AGENTS.md 关键域索引在列（与 approval-inbox 边界先例） |
| `goalbudget/` | 3 | 0 | 0 | 6 | 1 | 需裁决 |
| `humansim/` | 3 | 0 | 0 | 1 | 4 | 需裁决 |
| `taskledger/` | 3 | 0 | 0 | 4 | 0 | 需裁决 |
| `taskmodel/` | 3 | 0 | 0 | 1 | 2 | 需裁决 |
| `test-support/` | 3 | 0 | 0 | 0 | 0 | 需裁决：测试稳定性 DSL（spec 2026-11-02-test-stability-dsl）零采用者，战略储备 vs 写完即弃 |
| `videoref/` | 3 | 0 | 0 | 2 | 0 | 需裁决：IDE 视频抽帧数据面（controllers/ide/video-frames.ts 动态 import） |

### 保留（44，客户端/清单有真实引用）

| 域 | commits | client | inv | serverX | patch | 判定 |
|---|---|---|---|---|---|---|
| `ask/` | 2 | 345 | 0 | 0 | 88 | 保留 |
| `studio/` | 3 | 134 | 0 | 8 | 126 | 保留 |
| `plan/` | 3 | 52 | 0 | 4 | 14 | 保留 |
| `swarm/` | 1 | 35 | 0 | 0 | 12 | 保留 |
| `draft/` | 3 | 34 | 0 | 0 | 6 | 保留 |
| `specs/` | 1 | 28 | 0 | 4 | 30 | 保留 |
| `notify/` | 2 | 28 | 0 | 0 | 26 | 保留 |
| `brief/` | 1 | 19 | 0 | 0 | 8 | 保留 |
| `security/` | 2 | 19 | 0 | 2 | 10 | 保留 |
| `impact/` | 3 | 15 | 0 | 0 | 4 | 保留 |
| `sections/` | 1 | 9 | 0 | 0 | 5 | 保留 |
| `expdual/` | 2 | 8 | 0 | 1 | 2 | 保留 |
| `observability/` | 3 | 7 | 0 | 7 | 7 | 保留 |
| `boost/` | 1 | 5 | 0 | 0 | 2 | 保留 |
| `btw/` | 1 | 5 | 0 | 0 | 0 | 保留 |
| `whiteboard/` | 1 | 5 | 0 | 0 | 1 | 保留 |
| `execution-records/` | 2 | 5 | 0 | 2 | 4 | 保留 |
| `userenv/` | 3 | 5 | 0 | 0 | 3 | 保留 |
| `workitem/` | 3 | 5 | 0 | 1 | 4 | 保留 |
| `extmarket/` | 1 | 4 | 0 | 1 | 0 | 保留 |
| `keymap/` | 2 | 4 | 0 | 0 | 0 | 保留 |
| `compactthreshold/` | 1 | 3 | 0 | 1 | 0 | 保留 |
| `workdir/` | 1 | 3 | 0 | 0 | 6 | 保留 |
| `precedent/` | 3 | 3 | 0 | 0 | 4 | 保留 |
| `projectworkflow/` | 3 | 3 | 0 | 1 | 6 | 保留 |
| `codesec/` | 1 | 2 | 0 | 0 | 0 | 保留 |
| `learndistill/` | 1 | 2 | 0 | 0 | 0 | 保留 |
| `websearch/` | 1 | 2 | 0 | 0 | 0 | 保留 |
| `goalautonomy/` | 2 | 2 | 0 | 0 | 0 | 保留 |
| `modelroute/` | 2 | 2 | 0 | 0 | 0 | 保留 |
| `runlog/` | 2 | 2 | 0 | 0 | 0 | 保留 |
| `harnesshealth/` | 1 | 1 | 0 | 0 | 0 | 保留 |
| `hookswrite/` | 1 | 1 | 0 | 0 | 0 | 保留 |
| `importer/` | 1 | 1 | 0 | 1 | 0 | 保留 |
| `memorytax/` | 1 | 1 | 0 | 0 | 0 | 保留 |
| `shelldetach/` | 1 | 1 | 0 | 0 | 0 | 保留 |
| `mcpconfig/` | 2 | 1 | 0 | 2 | 3 | 保留 |
| `memscope/` | 2 | 1 | 0 | 0 | 0 | 保留 |
| `metricpolicy/` | 2 | 1 | 0 | 0 | 1 | 保留 |
| `premiselog/` | 2 | 1 | 0 | 1 | 1 | 保留 |
| `ctxnotes/` | 3 | 1 | 0 | 0 | 2 | 保留 |
| `filehistory/` | 3 | 1 | 0 | 1 | 0 | 保留 |
| `optadvice/` | 3 | 1 | 0 | 0 | 3 | 保留 |
| `slashcmd/` | 3 | 1 | 0 | 1 | 0 | 保留 |

弱信号保留域的复核锚点（client 计数低但已核实代码级消费）：`compactthreshold`（IdeCompactionCard.vue:10 import）、`harnesshealth`（IdeMcpPane.vue:23 import）、`hookswrite`（IdeHooksPane.vue:12 import）、`importer`（zcode/engine-controller.ts:482 动态 import parseSessionHistory）、`mcpconfig`（harness/capability-catalog.ts:23 import）、`ctxnotes`（ide/api/context-archive.ts:104 authFetch('/api/ctx-notes/')）、`filehistory`（controllers/ide/native-routes.ts:206 动态 import replay-theater）、`slashcmd`（native-routes.ts:213 动态 import）、`metricpolicy/premiselog`（governance/api/org-governance.ts /api 调用）、`optadvice`（eval/api.ts:367）、`precedent`（ia2/api/expertise.ts:80）、`projectworkflow`（projects/api/projects.ts:106）、`modelroute`（IdeChatPane.vue:88）、`codesec`（IdeSecurityBoostBar.vue:15）、`learndistill`（IdeKnowledgeBar.vue:11）、`memscope`（IdeMemoryPane.vue:12）、`memorytax`（IdeMemoryPane.vue:11）、`shelldetach`（IdeTerminalPanel.vue:27）、`websearch`（IdeMcpPane.vue:22）、`goalautonomy`（IdeGoalBudgetFloat.vue:19）、`workdir`（IdeStatusBar.vue:45）、`keymap/whiteboard/extmarket/execution-records/expdual/sections/brief` 中信号域均有多处生产引用。

## 决策记录

- **D-1 只盘点不删码**：任务边界明示「只盘点＋spec」；退役是产品面减法，每个候选域删除还牵连其 `__tests__`、vitest 配置点名清单（typecheck:harness）与 `custom/server/AGENTS.md` 登记行，须用户批准后按批立项执行。
- **D-2 五信号而非三信号**：任务给的口径是客户端/registries/特性清单；实测发现域路由大量经「controller 动态 import + patches 挂载补丁」接线（AGENTS.md「路由挂载」规约），只看客户端会把活域误判死域——`videofilehistory/slashcmd/mcpconfig/importer` 四例全靠 serverX 信号救回。故加 serverX 与 patch 两路信号，registries 实测全仓为零引用（骨架域）不单列。
- **D-3 common-word 碰撞的人工复核**：词边界 grep 对 ask/plan/swarm/speech 等英文名域有注释/CSS/i18n 碰撞。规则：凡靠 client≤3 判「保留」的域，逐一看非测试命中行是否代码级（import/API/动态 import）；据此把 `boardorg/statusline/speech` 从保留降为需裁决，并确认 `speech` 的 7 个 patch 命中全是 `speech-playing` 样式类与 i18n 文案碰撞。
- **D-4 需裁决域不预判**：`approval-ledger/approval-rules` 虽客户端零调用，但 AGENTS.md 关键域索引在列且服务端消费面活跃（执行内核 P0b 属在途战略），归需裁决而非候选；`test-support` 是 2026-11-02 立项的测试稳定性 DSL，零采用者——删（放弃投资）还是推采用，是用户的产品决策。
- **取舍**：不深挖每个候选域的 spec 来源（29 个候选域多数是吸收批一次性产物，来源可从 git log -1 查证，留给退役立项轮做）；不评估「合并近义域」选项（如 taskgroups vs taskledger），本表只回答「有没有人用」。

## 验证

- 域总数：`ls -d custom/server/*/ | wc -l` = 172，减 `__tests__` = 171 域；`git log --follow` 逐域计数，≤3 提交 = 98（非背景材料的 99，差 1 属口径差：本盘点以目录现存态为准）。
- 消费信号：词边界 git grep（client/inv/patch）＋ import 路径 git grep（serverX，含动态 import 形态 `'../../<域>/'`），排除双方 `__tests__` 与 vendor/upstream/node_modules。
- 人工复核记录：weak-keep（client≤3 的保留域 27 个）逐域查看非测试命中行；9 个可疑域用 `server/<域>|/api/<域>|['\"]/…/<域>/` 三形态复验；speech 的 patch 命中逐行查看（7 文件全为文案/样式碰撞）。
- 本 spec 不改任何产品代码，验证面=盘点可复现（信号采集命令均在判定口径节内）。

## 设计文档影响

DESIGN_SYNC: none
理由：纯盘点 spec，零代码改动；不触及整合正本与数字总账。后续退役立项批若获批执行，须按域逐批另立 spec 并同步 `custom/server/AGENTS.md` 域索引。
