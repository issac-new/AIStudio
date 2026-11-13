# AIStudio 产品交付团队培训手册

本手册面向产品需求分析、项目管理、研发、测试、运维监控、安全合规及审计内控六支团队。它帮助每支团队完成各自可检查的工作交付，并让需求、代码、测试、发布、运行和审计证据能够跨团队对账。它不讲“怎样把所有按钮点一遍”，只讲各团队怎样对结果负责。

- 适用版本：AIStudio 1.0.16-overlay。
- 读者：产品需求分析团队、项目管理团队、研发团队、测试团队、运维监控团队、安全合规及审计内控团队。
- 使用形态：浏览器 Web 版；桌面端差异不展开。
- 核实日期：2026-11-09。
- 验证范围：已核对当前源码、设计正本、run28 真实报告和运行证据。未重新执行真实 worker、Matrix、审批或生产发布，也未复验 Windows 实机，正式培训前必须按第 16、17 章预演。

## 1. 六支团队怎样使用本手册

### 1.1 六条独立学习路径

| 团队 | 主读章节 | 主要输入 | 必须交付的结果 |
|---|---|---|---|
| 产品需求分析 | 第 2、7 章 | 用户目标、业务约束、既有系统 | 冻结 spec、AC、影响面、G1/G2、UAT 判词与需求追溯 |
| 项目管理 | 第 7—12 章 | 任务、人员、依赖、容量和质量门 | RACI、派工计划、阻塞处置、质量门结论、发布决策与复盘行动项 |
| 研发 | 第 3—7 章 | 冻结 spec、任务契约、工作区 | 真实提交、可审查 diff、自测输出、receipt 和完成总结 |
| 测试 | 第 6—7 章 | 当前 commit、AC、测试设计和证据 | 独立测试报告、Eval 记录、缺陷闭环、独立评审与复评结论 |
| 运维监控 | 第 13 章 | 部署配置、服务、运行日志、发布包 |  readiness 记录、健康检查、恢复记录、观察与回滚结果 |
| 安全合规及审计内控 | 第 14 章 | 权限、策略、证据、攻击面和审计对象 | 安全姿态核对、独立审计、裁决记录、证据链检查和合规整改 |

每章都要留下交付物。只读完页面、聊过需求或看过别人截图，不算完成本章。

### 1.2 六支团队怎样交接

```text
产品需求分析：冻结目标、范围和验收标准
  ↓
项目管理：确认 RACI、依赖、派工和容量
  ↓
研发：在受控工作区实现并留下提交与自测
  ↓
测试：独立验证、Eval、缺陷闭环和独立评审
  ↓
项目管理：组织 UAT/G5 与发布决策
  ↓
运维监控：部署、观察、恢复和回滚
  ↓
安全合规及审计内控：独立复核证据、权限和整改
  ↓
项目管理：G6 复盘并进入下一轮准入
```

安全合规及审计内控不是只在末端盖章，必须从需求涉敏评估、设计、执行、审批到发布全程参与。测试独立性与审计独立性也不能互相替代。

**共同完成判据**：交接双方能按任务 ID、commit、测试、审批和运行证据对上同一对象，不能用口头“已交付”代替。

### 1.3 三种语境不能混写

| 语境 | 主要入口 | 用途与边界 |
|---|---|---|
| 日常工作台 | `/app` | 真实组织、任务、评审和治理；写操作回权威系统 |
| IDE 工作区 | `/app/ide` | 围绕任务编码、测试、审查和交付；任务锚不是聊天锚 |
| 全流程推演 | `/app/sim` | 在独立运行根演练 26 步并保存证据；不是普通生产认证 |

日常 G5/UAT 与 SIM 的 `release-gate.jsonl`、`uat-verdicts.jsonl` 不是同一写面。SIM 批量操作和注意力入口仍有隔离缺口，不能使用真实敏感数据。

### 1.4 事实和证据怎样分级

页面是工作入口，权威系统才保存最终事实：任务以 Kanban 为准，代码以 Git 为准，审批以源系统裁决记录为准，推演以该 RUN 的证据目录为准。

| 证据档位 | 可以支持什么 | 不能据此宣称什么 |
|---|---|---|
| `missing/unobserved` | 没有证据或未观测 | 不得交付，也不能写“零问题” |
| `present` | 产物存在 | 不能证明可用 |
| `wired` | 已接入目标链 | 不能证明本轮真实用过 |
| `exercised` | 本轮真实执行并留下结果 | 不能自动证明业务结果 |
| `outcome-supported` | 有后续结果支撑 | 仍受本轮范围与环境限制 |

研发完成的底线是任务卡号和真实提交号双凭证，再加可复跑测试与独立评审。零用例、`unknown`、源缺席和 `no_data` 都不能算通过。

### 1.5 授权不是一句“让 Agent 自动做”

授权同时看三层：T1/T2/T3 决定评审强度，主动性两轴决定能否越过指令继续行动，失败代价决定执行上限。推断目标最高只告知；目标差距没有明确验收契约时最多起草。不可撤回、影响外部或无法验证的动作必须压低执行上限。

**本章通过判据**：研发能说出下一项交付物，负责人能说出当前五类队列和对应动作；双方都不会把页面状态当作最终事实。

## 2. 产品需求分析团队：怎样形成可执行的 Spec 与设计

### 2.1 先写清输入，不急着建卡

一份可执行 spec 至少包含：

```text
目标：要改变什么可观察结果
范围：允许修改哪些系统、接口和文件
非目标：明确不做什么
依赖：上游数据、服务、账号、模型和人员
接口：输入、输出、错误、兼容和迁移
验收：AC-n，可观察、可判定、可反查
风险：安全、隐私、回滚和不可逆后果
验证：自测、独立测试、评审和发布证据
```

AC 至少三条，不能用“运行正常”“体验良好”“没有安全问题”代替可判标准。

### 2.2 G1 需求冻结查什么

进入 `/app/stage/reqs`，依次完成：

1. 核对范围、非目标和依赖。
2. 写出至少三条可判 AC。
3. 补范围外清单、影响面和涉敏评估。
4. 在“文档评审”处理缺项。
5. 在 G1 页面执行冻结并保存记录。

冻结后需要变更时，重新走变更、评审和冻结，不沿用旧批准。

### 2.3 G2 设计评审查什么

进入 `/app/stage/design`，完成系统分析和评审。G2 至少回答：

- 设计对象、职责、接口、数据和状态怎样组成。
- 爆炸半径影响哪些模块、用户、数据和运行环境。
- 至少两个备选方案及取舍理由。
- 验证计划怎样前移到实现之前。
- 历史偏差和既有失败怎样被回应。

**输入**：冻结 spec、依赖和既有实现。
**交付物**：设计稿、备选取舍、G2 评审记录、验证计划。
**通过判据**：评审结论与当前对象一致，缺项有负责人和复审结果。

### 2.4 第 19 节测试设计怎样写

研发或测试任务的 spec 第 19 节至少考虑四类路径：

| 路径 | 要回答的问题 |
|---|---|
| Main | 正常主路径怎样完成，结果怎样断言 |
| Alternative | 替代输入、合法分支或降级路径怎样工作 |
| Exception | 错误输入、权限不足、依赖失败和异常数据怎样处理 |
| Termination | 取消、中断、超时后的资源回收和最终状态是什么 |

步骤使用 Given/When/Then，写清前置条件、可执行动作和断言。测试步骤使用“查询、验证、构造、等待、清理、断言”，不写无法执行的“确保正常”。

### 2.5 业务地图能辅助什么

业务地图 `/app/sim/map` 可辅助核对本体、板级图谱、FIBO、历史 spec 和模块词面命中。命中只表示文本提到对应词语，不等于系统理解业务语义。采纳、排除或改造都要人工标注并回查保存结果。

**本章通过判据**：G1/G2 记录可反查，AC 能映射到测试和交付物，Termination 不再缺席。

## 3. 研发团队：怎样建立任务契约、依赖与工作区

### 3.1 任务卡最小契约

在 `/app/board?new=1` 只保留一个培训看板，创建任务并填写：

```text
任务 ID：由系统生成，后续所有证据都引用它
负责人：必须是实际活动 profile 的完整名称
目标与范围：允许做什么、不得做什么
验收标准：AC-n 与 spec 编号一致
工作区：worktree、dir 或 scratch 的明确选择
依赖：parent → child，不能有环
完成定义：提交、测试、独立评审、UAT/G5 等必需项
```

任务抽屉可继续维护优先级、正文、依赖、评论、附件、估算、模型/provider/推理档和完成总结。修改 assignee 不等于补齐结构化 RACI；当前抽屉没有专门 RACI 编辑器，缺 R/A 时应通过受控建卡或分解链补齐。

### 3.2 工作区怎样选

| 类型 | 适用场景 | 风险 |
|---|---|---|
| `worktree` | 需要隔离代码改动并保留提交 | 必须核对分支、路径和归属 |
| `dir` | 已授权的已有目录 | 不能借任务扩大到未授权路径 |
| `scratch` | 可丢弃的临时产物 | 只做 best-effort 回收，不是安全擦除 |

需要保留代码、测试报告和交付物时不得使用 `scratch`。

### 3.3 依赖和开工状态怎样判

| 状态 | 研发或负责人要做什么 |
|---|---|
| `triage` | 补规格、依赖、责任与验收 |
| `todo` | 等依赖或开工条件，不强行派发 |
| `scheduled` | 等执行窗口或唤醒条件 |
| `ready` | 具备认领条件，可触发 dispatcher |
| `running` | worker 已锁定认领并执行 |
| `blocked` | 等人工输入、依赖或能力恢复 |
| `review` | 等独立评审，不等于已独立通过 |
| `done` | 状态已迁移，继续核对证据与发布事项 |
| `archived` | 历史归档，按需回查 |

给活动任务新增未完成 parent 后，系统可把 child 降回 `todo` 并记录 `dependency_wait`。不能为了赶工删除真实依赖。

### 3.4 DoD 完成契约怎样准备

带 `AC-n` 或 DoD 块的任务，派发时会冻结契约和源哈希。完成时 `complete_task` 可能要求结构化 receipt，内核重算证据路径、sha256、TAP/JUnit 计数和失败数。声明 `test` 的 AC 不接受纯文本自述代替机器报告。

这个门只证明证据可重算和产物存在，不复跑命令，也不证明语义正确。派发后改变 AC/DoD 导致源哈希变化时，应恢复原契约或重新派发，不能伪造 receipt。

### 3.5 转为 ready 前的检查

1. 任务 ID、目标、范围和非目标完整。
2. R/A 明确，需要异人评审时评审人与实现者不同。
3. 工作区正确且需保留产物不用 `scratch`。
4. parent 已满足，AC 与测试设计对应。
5. assignee 全名能通过板级和 home 级围栏。
6. 所需 grant、模型、依赖和测试资源可用。

**本章通过判据**：卡片具备认领条件，而不是仅仅被创建；任何未完成契约都能指出责任人和补件。

## 4. 研发团队核心技能：用 swarm-yuan 约束真实交付

### 4.1 为什么它是研发核心工具，而不是可选附件

swarm-yuan 是**项目研发技能的生成器**，不是编码引擎本身。它读取目标仓库的规范、组件、依赖、历史配方和验证方式，生成 `<项目>-dev` 目标技能。真正每天参与研发的是这个目标技能，而不是每次重新运行生成器。

它把个人经验变成可执行设施：组件库清单帮助复用，关系边集帮助判断影响面，任务配方帮助重复同类交付，规则与门禁约束过程，验证与证据约束完成声明。Ycode 仍负责编码与工具调用，Kanban 仍负责工务真值，swarm-yuan 负责把项目知识和研发纪律送进这条链。

门禁主要抓“不懂规矩”的词法、结构、路径和配置问题；业务逻辑错误仍要靠真实测试、运行验证和独立审查。门禁全绿不等于业务正确。

### 4.2 六段技能和事实源怎样理解

| 逻辑段 | 研发人员用它做什么 |
|---|---|
| `SKILL.md` | 读项目铁律、改造分类、工作流入口和常用命令 |
| `workflow` | 查九节点流程、每节点准入、产出和追踪 |
| `references` | 查组件、配方、关系边集、开发/发布指南和方法论 |
| `assets` | 使用 spec/plan 模板、环境准备、数据样例和门禁配置 |
| `check` | 执行 precheck、分支、构建、测试、审查、安全和架构检查 |
| `scripts` | 使用状态机、调用追踪、关系提取、框架和审计工具 |

每类事实各有唯一正本：数字读 `assets/facts.conf`，项目行为读当前代码和运行证据，spec-first 读共享库，阶段状态读项目 `.swarm-yuan/state.yaml`，门禁证据读相应账本。`skills/swarm-yuan/` 是生成器源码，目标项目 `.swarm-yuan/` 是运行状态，不是同一个目录。

### 4.3 生成 Step 1-13 与日常九节点不能混用

**Step 1-13**只负责生成并激活可信目标技能：自检、习惯与规范探查、组件和关系提取、特征卡、骨架、正文填充、门禁与 hooks、真实测试、独立审查、经验回写、strict 完整性核验和 `--mark-active`。

strict 激活会检查 spec-first 接线、完整性、清单、预算和 manifest，最后才把 `draft` 改为 `active`。安装生成器、生成骨架、目标技能 active、宿主发现技能、本次编码实际读取技能，是五个不同事实。

日常研发使用另一套九节点：

```text
①需求理解 → ②探查 → ③设计 spec → ④实施 plan → ⑤编码实现
→ ⑥测试验证 → ⑦独立审查 → ⑧合入 main → ⑨主干回归与发布
```

### 4.4 研发四阶段怎样完成

| 阶段 | 节点 | 完成判据 |
|---|---|---|
| 分支开发 | ⑤ | 从最新 `origin/main` 起 feature 分支和隔离 worktree，测试与实现同分支，不直接在 main 开发 |
| 分支测试 | ⑥⑦ | 在 feature 分支完成真实测试、门禁和独立审查，阻断项清零 |
| 主干合并 | ⑧ | fetch、ff-only、worktree rebase、必要复测、`merge --no-ff`，证据与回滚齐全 |
| 主干回归 | ⑨ | 合入后在 main 全量回归，验证并行合入交互，再构建发布 |

分支全绿不能替代主干回归；主干回归也不能补救故意跳过的分支测试。

### 4.5 每个需求怎样使用目标技能

| 节点 | 研发人员的操作 | 必留证据 |
|---|---|---|
| 需求 | 复述目标、非目标、影响面和 AC，由人确认 | 需求边界与验收口径 |
| 探查 | 先查配方、组件和关系边集，再读必要实现 | 复用件、消费方、回归面和路径锚点 |
| spec | 写变更、决策记录、验证、设计文档影响，补测试、安全、回滚 | 经评审的 spec 与 DESIGN_SYNC |
| plan | 拆成可独立验证的任务，明确顺序、文件、测试和回滚 | plan/tasks 与每项验证方式 |
| 编码 | 在 worktree 先写或更新测试，再按复用阶梯实现 | diff、测试改动和提交 |
| 测试 | 在分支执行目标测试与门禁，补负向、边界和相邻路径 | 真实输出、覆盖和 gate-run 证据 |
| 审查 | 由非实现者审查 spec、代码、测试有效性和当次证据 | review-record、发现项和处置 |
| 合入 | 前序全绿后 rebase、复测、合并并保留 merge commit | merge commit 和证据锚 |
| 发布 | main 全量回归后构建、发布、观察和准备回滚 | 发布物、runbook、观察与回滚记录 |

复用阶梯依次是：是否真的需要、代码库已有、标准库、平台原生、已装依赖、一行调用、最小实现。任何一层命中即停止下探，不重复造轮子。

### 4.6 precheck、state-machine 和 hooks 怎样一起工作

- **precheck**：执行配置驱动的分支、构建、测试、审查、安全和架构检查。默认遍历门禁并汇总，不是遇到首个 FAIL 就停。未配置项可能 SKIPPED，因此“通过”不等于“全部覆盖”。
- **state-machine**：守阶段产出物，逐级前进，不代替 Git、测试或发布系统。不同阶段强度不同，不能把 archive guard 讲成没有证据也绝对不能合入。
- **L1 写时 hooks**：在 Write/Edit/Bash 前 deny，依赖宿主真实安装和可用。
- **L2 Git pre-commit**：检查 staged 变更与 spec；可被 `--no-verify` 绕过，需要后层兜底。
- **L3 precheck spec-first**：在门禁序列中再次检查变更与 spec 的关联。
- **L4 state-machine build guard**：无已批准 spec 时阻止进入 build。

机器所谓“已批准 spec”的基础判据是决策记录存在且非占位，不等于真实人类评审已经完成。`TEST_CMD`、`BUILD_CMD` 和 `MUTATION_CMD` 会执行真实命令，只能使用受信任配置。

守门还要防止“假绿”：零用例空跑、零断言、聚焦测试、覆盖不足和变异测试未配置都要分别核对。生成器侧的 Mutation Check 用于验证门禁能抓住故意注入的故障；项目侧变异测试只有配置 `MUTATION_CMD` 后才存在。

### 4.7 它怎样进入 worker、ACP 和 Ycode 的真实链路

```text
人给目标与授权
  → Kanban 提供任务、工作区和验收契约
  → Hermes worker 准备项目技能并组织上下文
  → ACP 把任务上下文和 cwd 交给编码 provider
  → Ycode 在任务工作区读取目标技能、编码和运行测试
  → worker / 独立验证复核后回写 Kanban
```

worker-coder 的规则要求技能准备先于 ACP 编码，编码后再升级技能；worker 必须亲自检查文件、语法、类型和测试。`provider="zcode"` 只是桥标识，强制使用 Ycode 分叉时还要核对 `engine_bin` 和版本日志。

技能文件存在、宿主发现、ACP 回复成功，都不能证明本次编码实际加载并遵守了技能。必须用当次 Skill 调用、ACP 工作区、测试和审查证据验收。

### 4.8 aistudio-dev 示例与离线包边界

本仓曾生成 `aistudio-dev` compliance 技能，历史记录包含真实生成、审查和既有缺陷，不等于当前 worktree 已激活，也不等于当前所有测试全绿。修复编码链时，应按九节点把“源码测试”“live 部署”“技能实际加载”“真实 ACP 回合”分别验收，不能用单测全绿代替整条链交付。

当前 everything 离线包采用 R134：内嵌技能、知识、docs 和 GitHub 源包，**不内嵌可经 npm/pip 镜像安装的运行时**。它不是完全断网自足包；目标机仍需内部 npm/pip 镜像或提前同步完整依赖。Windows 实机和完全气隙安装必须单独验证。

课程主入口见[《swarm-yuan 技术说明》](aistudio-interactive-training.html#scene=development-swarm-yuan-tech)；完整的 Step 1-13、precheck、状态机、hooks、变异验证和安装细节可查阅[《swarm-yuan 研发交付指南》](aistudio-swarm-yuan-developer-guide.md)（可选来源）。

**本章通过判据**：研发能说明当前目标技能是否 active、是否被本次任务实际读取，并按九节点留下 spec、测试、审查、合入和发布证据；不会把生成骨架或门禁全绿当作交付完成。

## 5. 研发团队：怎样在 IDE 中完成可审查编码

### 5.1 进入 IDE 先核对对象

从任务卡“查看变更”进入 `/app/ide?task=<任务ID>`，依次核对：

1. 任务 ID 与目标任务一致。
2. 工作区、分支和当前会话属于同一任务。
3. 任务简报中的 RACI、上下文文档、Git 和协作动态没有串卡。
4. 当前用户确实拥有文件和终端所需权限。

不要从聊天标题、目录名或 provider 名称推断任务和引擎身份。使用 Ycode 分叉时还要核对实际 `engine_bin` 和版本日志。

### 5.2 按冻结设计实现

1. 按 spec 和接口实现，不在编码中悄然扩大范围。
2. 保持需求、代码和测试一一对应。
3. 修改共享契约时，同步消费者和守门测试。
4. 每次提交保持窄而完整，能独立审查和回滚。
5. 发现设计不成立时返回变更评审，不用代码绕过 G2。

### 5.3 自测必须留下真实输出

在 IDE 终端执行项目规定的最小目标测试，记录命令、退出码和关键输出。不要用“测试文件存在”“页面能打开”“Agent 说通过”代替真实执行。

提交前再核对：

- diff 只含任务所需变更。
- 没有密钥、个人信息、临时截图或构建产物。
- 测试确实在目标 commit 上运行。
- 修复点相邻路径没有新增回归。
- 完成总结能指向 commit、测试和剩余风险。

### 5.4 IDE 各面怎样区分写读边界

| 面 | 可以做什么 | 不能误解为什么 |
|---|---|---|
| 文件、审查、终端 | 编辑、diff、暂存、提交、分支、推送和真实命令 | 看到文件不等于拥有仓库写权限 |
| Wiki、记忆、上下文档案 | 引用知识、检索和维护跨窗上下文 | 记忆“清空”可能只是隐藏，不等于物理删除 |
| 工具、轨迹、透视、工作流 | 查看工具、用量、轨迹和引擎状态 | 观测读数不直接成为发布判据 |
| 交付物、Gen UI | 本地导出和沙箱 HTML 预览 | 云分享仍是 stub，本地评审标记不是服务端审批 |
| 看板、沟通、白板 | 看板只读，Matrix 真写，白板本地标注后回传 | IDE 看板不是另一个任务写入口 |
| MCP、Hooks、slash、远程、插件 | 部分配置可写；远程只读；插件目录分宿主 | Zcode 插件安装未接通用通道，远程工作区不可写 |

命令面板的文件区仍是 backlog。IDE 自检是只读探针，不是修复动作。

### 5.5 提交与回执

提交后记录真实 commit、分支和任务 ID。需要推送时，推送属于写操作，必须核对远端、分支和审批范围。回到任务卡填写完成总结，并附自测证据；评审与状态迁移由后续独立环节完成。

**本章交付物**：真实提交、可审查 diff、自测输出、任务完成总结。
**通过判据**：另一个研发能据此重跑测试并理解变更，不需要向作者补问对象和范围。

## 6. 测试团队：怎样做独立测试与 Eval 闭环

### 6.1 三种“验证”不要混用

- **研发自测**：生产者的交付义务，证明实现者执行过目标检查。
- **G4 独立测试**：验证者独立判定，测试者不同于写码者。
- **独立代码评审**：审查变更、风险和设计符合性，不能只凭测试绿代替。

测试代码存在不等于测试执行，开发自测不能替代独立验证。

### 6.2 G4 独立验证怎样操作

1. 获取任务 AC、冻结设计、当前 commit 和自测材料。
2. 核对实跑 commit 与发布基线同祖。
3. 独立执行正常、替代、异常和终止路径。
4. 对每个缺陷建立“报 → 修 → 验”闭环。
5. 核对跨模块契约测试和真实输出。
6. 保存测试报告、执行 commit、缺陷终态和结论。

### 6.3 Eval 离线判分怎样运行

评测运行是对既有会话或显式证据进行离线判分，不是在线重跑 Agent。`k` 是每题样本数，`k<2` 不具备门禁统计意义。

1. 进入 `/app/eval`，在“评测集”创建或选择评测集。
2. 核对题目、期望行为和 Rubric。
3. 在“运行记录”提供样本映射并运行。
4. 打开报告，查看失败样本、`unknown` 和红线。
5. 对失败样本建处置单。
6. 修复后提供新证据并同卷复评。
7. 用 A/B 对比检查改善和回归。

基础练习可使用：

```json
[{"id":"t1","problem":"验证修复标记","expectedBehavior":"证据包含 OK","rubric":[{"id":"a1","text":"回复含 OK","expect":"yes","kind":"result","s0":{"kind":"regex","pattern":"OK"}}]}]
```

先以失败证据运行，再用修复后的新证据复评。原始失败 run 必须保留，原证据复现只能诊断，不能关闭处置单。

### 6.4 G4-E 怎样判

- PASS：置 `g4_eval_pass`。
- GAP：登记缺口后放行，但永远不叫 PASS。
- FAIL：不置 `g4_pass`，阻断 G5。

离线回放不会自动产生在线 QPS、P99、TTFT 或生产 SLA。没有稳定基线时是 `no_baseline`，不是“已证明无退化”。红队文本幸存不等于真实攻击成功，执行型载荷必须在已配置沙箱中运行。

### 6.5 S0/S1 和技能评估怎样判读

S0 是确定性规则；S1 依赖在线判定端，失败时可以是 `unknown`。技能评估位于第八页签，检查 spec 第 19 节，不直接给技能文档打分。

任一维度为 `no` 是 `FAIL`，全部维度为 `yes` 才是 `PASS`，其余为 `CONDITIONAL`。S1 不可用产生 `unknown`，不能把 `CONDITIONAL` 当通过。技能评估不属于 G4-E，也不能代替真实测试执行。

### 6.6 密封集与其他评测面

密封集只返回聚合结果，不显示样本明细，跨考卷版本不能直接作同卷 A/B。UI Oracle 与真实浏览器走查互补，数据飞轮和优化建议不会自动成为生产规则。

**本章通过判据**：测试者和写码者不同，缺陷闭环完整，GAP 与缺口没有被写成 PASS，复评使用同卷同版的新证据。

## 7. 研发与测试团队：怎样完成独立评审、UAT 与发布交接

### 7.1 独立评审看什么

评审输入包括任务 AC、冻结设计、worktree、diff、当前 commit、自测和独立测试。评审人依次：

1. 核对评审对象和当前 commit。
2. 核对变更是否符合设计和非目标。
3. 核对测试是否真实覆盖 AC 和异常路径。
4. 核对权限、数据、安全和回滚风险。
5. 记录发现项，选择批准或打回。
6. 修复后复验并再次评审。

系统存在 verdict 不自动证明独立评审。负责人必须核对评审 actor 与实现者不同、评审绑定当前 commit；若要求真人，还要确认认证主体确实是真人。IDE 本地标记、聊天 verdict 和 director-proxy 都不算独立真人批准。

### 7.2 批准、状态迁移和完成总结

任务抽屉的批准会先写 `kanban:<taskId>` 审批历史，再填写完成总结并转 `done`；打回先写 request_changes，再转 `blocked`。工作台快捷 complete/reopen 可能不走同一历史，因此正式培训首选任务抽屉和源系统审批链。

批准与状态迁移是两个动作，必须分别回读。评审治理中的批准、合并和回滚也是不同事件。

### 7.3 交付证据包怎样组成

- 任务卡号和真实提交号。
- 可复跑的自测和独立测试输出。
- 当前 commit 的独立评审记录。
- DoD receipt、证据路径、摘要哈希和测试计数（适用时）。
- UAT/G5 记录、发布交接和未解决风险。

完成契约通过不代表 G3/G4 或独立评审已通过。

### 7.4 日常 UAT 怎样处理

进入 `/app/stage/accept`，在“需求追溯”和“交付健康”核对任务、分支和证据。“UAT 待判”只列日常 review 卡，动作回到任务卡或审批系统，**不是逐 AC 三态编辑台账，也不写 `uat-verdicts.jsonl`**。

每条验收要求都要留下任务/评审记录和证据，未通过项回流处理。看板 `done`、UAT 和 G5 是三个不同事实。

### 7.5 日常 G5 与 SIM G5 怎样分开

日常 G5 页面复用通用 approvals/review 写面处理发布类审批，不写 SIM `release-gate.jsonl`，也不自动产生 SIM `released` 状态。实际发布还需真实发布通道回执、观察和复验。

SIM 则按步 20 G5、步 21 UAT 执行：G5 使用 `draft → pending → approved → released`，UAT 按 AC 写 pass/conditional/reject。conditional 必须填写说明，并区分 `acknowledged:true` 的真人认可与 `pending:true` 的机器评估待认可。

### 7.6 HumanGate 怎样核验

- `HUMAN_GATE_DECIDER_ROLES` 未配置时不做角色白名单校验。
- 同一主体注册并裁决默认记为 `delegated`；`HUMAN_GATE_REQUIRE_HUMAN_DECIDER=1` 才严格拒绝自批。
- SIM `posture=strict` 不自动开启产品严格配置；等到 `approved` 并读取 `decidedBy` 不等于证明第二名真人。
- 需要异人真人批准时，核对 `requestedBy != decidedBy`、`deciderMode=human`、`strength=explicit` 和实际审批 store。

### 7.7 发布交接包含什么

G5 至少核对测试证据、同 commit 可复现构建、依赖、具体回滚、灰度、用户向发布说明和人工批准。发布后按项目要求观察、复验，必要时执行回滚。

当前每版远端只上传整体源码包和 yuan everything 离线包及配套 SHA256 校验件。默认 `npm run release:packages` 只打整体包，`--all-modules` 是本地 4+1 逃生通道。

**本章通过判据**：评审对象和 actor 正确，双凭证与测试齐全，UAT/G5/真实发布没有互相替代，所有批准都能回查源系统。

## 8. 项目管理团队：怎样开工、派工与配置容量

### 8.1 开工先分四类队列

进入 `/app/board` 和 `/app/stage/build?tab=today`，先读再写：

- `ready` 未派工。
- `running` 停滞。
- `blocked` 等人。
- `review` 待审。

“今日工作”是前几条工作队列，不是全量报表。`partial/stale/error` 必须解释，空列表也可能是源缺席，不等于没有工作。SIM 卡只作观察，不混入日常派工。

### 8.2 派工前复核 RACI 和依赖

打开任务抽屉，确认 R/A、parent、工作区和验收物。普通 Markdown 里随手写“R=某某”不会自动成为结构化 RACI；缺 RACI 时通过受控建卡或分解链补齐，不把修改 assignee 当成 RACI 已补齐。

### 8.3 派工围栏和容量怎样核对

dispatcher 会检查 assignee 是否为真实 profile、板级 `board.json profiles/profile_scope` 和当前 home 的 `kanban.dispatch_profiles`。配置了就必须通过，损坏或空配置不会扩大范围。

当前团队模板为 60 秒一拍、总并发 8、单 profile 并发 3、陈超时 14400 秒；目标环境仍以实际生效配置为准。未另配 `kanban.board_concurrency` 时，代码默认每板并发 1，不能把总并发 8 当成同板 8 个工位。

容量判断顺序：

1. 依赖和 grant 已满足。
2. 负责人全名通过板和 home 围栏。
3. 全局、单板和单 profile 容量足够。
4. 模型额度、工作区和测试资源可用。
5. 才触发一次 dispatcher。

### 8.4 `routed` 和催办不等于 worker

新 `/api/orchestrator` 的 `routed` 只表示编排评估状态，不表示 worker 已启动。最小执行证据是后续真实 `claimed`、running run、worker log/PID/heartbeat。

当前看板“催办”按钮逐卡调用 `/api/kanban/nudge/route`，只解析 assignee → board team → unassigned 并返回 decision；响应必带 `delivery{state:'routed-only', sent/received 均为 null}`——**没有实际发送 Matrix 或外部消息，也不解除阻塞**。界面提示为「解析催办路由；未发送消息」。催办三态定义：

1. **routed-only（路由已解析，未发送消息）**：assignee 或板归属解析成功。这只是投递前置，`sent/received 均为 null`，发送面为零。
2. **unassigned（显式无人态）**：assignee 与板 team 双空。先派人再催办，绝不改投固定接收方（run21/22 错侧催办两实录）。
3. **解析失败（可见失败）**：卡不存在、缺参或卡源未接线（4xx/5xx）。失败可见，不静默改投。

真实通知须走任务评论、真实房间消息或结构化交接单，并保留接收证据。

### 8.5 reclaim/reassign 是真实干预

Reclaim 会终止并释放当前 claim、恢复原阶段、清重试预算，不是无副作用的刷新。Reassign 默认先 reclaim。没有阅读日志和证据前，不要连续 reclaim 代替催办。

**本章通过判据**：每张 ready 卡都能解释“谁能领、为何能领、何时能领”，每次干预都知道会改变什么状态。

## 9. 项目管理团队：running、blocked、review 怎样分类处置

### 9.1 running 先找真实工作信号

查看诊断、worker log、run history、最近事件和当前 claim。长时间无变化时先区分公共通路故障与单个 Agent 停滞。确认停滞后才 reclaim 或 reassign，并复核新的有效 claim/run。

### 9.2 blocked 先解除原因

读取阻塞原因、评论、交接单和失败事件。交接单是 append-only 结构化记录，本身不改变任务状态。原因解决后才 unblock；系统会按依赖恢复原阶段，可能回 review，也可能因 parent 未完回 todo，不是全部回 ready。

禁止全选批量 unblock、全员催办或把“路由成功”当阻塞解除。

### 9.3 review 先分派正确评审人

评审人读取变更、当前 commit、证据和实现者身份，再作裁决。review 列可能自动派发 `sdlc-review`，因此“进入 review”不自动等于真人独立评审。负责人要核对评审来源和 actor，而不是只看状态颜色。

### 9.4 等待窗口怎样利用

闸门等待或熔断时，可以并行准备：

- `prep_uat`：AC 与证据源对照，不提前判词。
- `prep_release`：发布说明和灰度骨架。
- `prep_retro`：治理度量草稿。

正式步骤仍按原顺序定稿。恢复链处理 429 或网络波动时，不能把自动恢复写成外部容量无限；连续恢复耗尽要升级人工。

### 9.5 常见误操作

| 误操作 | 正确替代 |
|---|---|
| 手改 running 或直接 SQL 制造执行 | 只让 dispatcher/worker 经 claim 形成 running，再核日志 |
| ready 很多就反复全板 Nudge | 先查围栏、依赖、容量和最近失败原因 |
| 为解卡删除围栏或盲目加并发 | 修 assignee 全名、名单和真实容量，必要时排队 |
| 把 `routed` 当 worker 已启动 | 核对 claimed、run 和 worker 信号 |
| 把“解析催办路由”当消息已送达 | 催办三态均未发送；走真实评论/房间/交接单并保留接收证据 |
| 把 done 当发布完成 | 分开核对 UAT、G5、发布回执和观察窗 |
| 把 GAP 当 PASS | 保留缺口和处置记录，允许继续不等于达标 |

**本章通过判据**：每种状态都采用对应干预，阻塞原因有证据，恢复后形成新的有效运行或评审结果。

## 10. 项目管理团队：怎样使用 G1-G6 质量门

| 门 | 准入输入与必查证据 | FAIL 时负责人的动作 | 准出记录 |
|---|---|---|---|
| G1 需求冻结 | AC、范围外、影响面、涉敏评估 | 补规格并重新冻结 | G1 冻结记录 |
| G2 架构评审 | 设计、爆炸半径、备选、验证计划、历史偏差 | 修订并复审，不带缺项排期 | G2 评审结论 |
| G3 编码门禁 | 需求/代码/测试对应、真实 testlog、适用时 runtime-proof | 补实现与证据，禁止伪造完成声明 | 提交与自测证据 |
| G4 独立测试 | 异人测试、缺陷报修验闭环、同祖 commit、契约测试 | 修缺陷并独立复验 | G4 测试报告 |
| G4-E 评测子门 | Eval、红队、评估器三角、能力覆盖、集锚 | FAIL 阻断；GAP 登记后放行但不叫 PASS | G4-E 三态与缺口 |
| G5 发布准出 | 测试、构建、依赖、回滚、灰度、说明、HumanGate | 任一硬项失败即冻结发布 | G5 审批与发布记录 |
| G6 复盘 | 问题处置、行动项、实测度量、经验回流 | 补清偿和下一轮准入，不只写报告 | `retro_done` |

### 10.1 机制存在不等于正在执法

`gates.json` 未配置时，不能宣称列门正在执法。命令验收器、工具执法、严格异人和主动性执法都有各自开关，必须读取当前生效值。

### 10.2 哪些结果不能豁免成通过

准出失败、证据不足、零测试、`unknown`、存在反证都不能用豁免掩盖。非准出检查项的豁免也需要理由、范围、批准人、缓解、有效期和复验条件。

### 10.3 源缺席与历史边界怎样判

`no_data` 是证据缺口，源缺席不是零待办，历史环形挤出和锚点悬空按系统声明解释。不能把缺失改写成“全绿”，也不能一律判为攻击。

**本章通过判据**：每道门都有当前证据、裁决人和 FAIL 动作，准出记录能从源系统反查。

## 11. 项目管理团队：怎样作验收与发布决策

### 11.1 验收发布会的输入清单

- G1 冻结 AC 与需求追溯。
- 当前 commit、可复现构建和依赖变化。
- 自测、G4、G4-E、独立评审和未闭环缺陷。
- UAT 判词与证据锚。
- 回滚、灰度、发布说明、观察项和负责人。
- HumanGate 配置与实际裁决主体。

### 11.2 日常发布怎样判

日常 G5 使用通用 approvals/review 处理发布类审批，不写 SIM 发布台账。提交发布申请、批准、驳回和实际发布是不同动作；实际发布还需要真实发布通道回执和观察窗，不能用任务 `done` 代替。

### 11.3 SIM 发布怎样判

SIM 按步 20 G5、步 21 UAT 执行。G5 批准需要证据锚，批准/发布权限与动作分开；UAT 覆盖全部冻结 AC，conditional 不等于无条件通过，`pendingAck` 不等于真人认可。

standard/demo 的 `director-proxy` 是代偿，不计真人批准。审批历史里有记录也不足以证明真人批准，必须继续看 actor、deciderMode 和 strength。

### 11.4 发布后怎样收口

发布后执行观察、复验和必要的回滚。记录异常、责任人和问题回流，不能只上传资产就写“发布完成”。

当前 1.0.16-overlay 发布资产按长期政策只有：

1. `aistudio-full-1.0.16-overlay-src.tar.gz`。
2. `swarm-yuan-offline-1.0.16-overlay-everything.zip`，版本前不带 `v`。

两件主资产配套 `SHA256SUMS-v1.0.16-overlay.txt`。everything 采用 R134，仍需要 pip/npm 镜像安装可源装依赖，不等于完全断网自足。

**本章通过判据**：发布决策有真实裁决者与证据，实际发布有回执，观察与回滚责任明确。

## 12. 项目管理团队：怎样做 G6 复盘与受控改进

### 12.1 复盘不是写总结

采用“事实 → 机制归因 → 下轮验证”三段式。行动项必须有事项、负责人、期限和验收判据。

问题单 DISP 要区分已修、观察、延后。已修必须带真实修复锚，waive 是批准豁免，不等于 resolved。延后项要有批准和截止条件。

### 12.2 收工检查什么

- `/app/stage/govern?tab=issues`：ISSUE × DISP 是否全部闭环。
- `?tab=clearance`：遗留是否真正 resolve 或经批准 waive。
- `?tab=gateLog`：FAIL 是否经修复和复审。
- `?tab=posture`：实际 enforce/strict、MCP drift 和审计链。
- `?tab=reviewGov`：评审案例、发现项和合并就绪度。

`retro_done` 是 G6 闸键，`report_done` 只表示报告步骤完成。

### 12.3 报告和补证怎样分时点

报告快照、后续补拍、补做和清偿记录必须分别标注日期。GAP、warn、open compensation 和后续新红不能回填成历史全绿。报告中的“无未完成项”也必须与后续台账对照。

### 12.4 审计不收敛怎样升级

同一审计缺口连续三轮不收敛即升级人工。审计 FAIL 后重启必须覆盖缺口的上游采集位，不能从下游反复空跑。报告计数使用生成时快照，审计取数锚定报告自身主张位，禁止全文首匹配。

### 12.5 改进实验的边界

改进实验按提案、探测、组合、晋级、回滚进行。噪声、等预算基线和语义等价反事实是三类独立证据，默认相关门多为告警。自动探测需要人工批准，写盘还需 `HARNESS2_APPLY=1`、受管路径、基线摘要和 `super_admin`。

不得自动采纳冠军、自动退役机制或递归修改改进器。

**本章通过判据**：每个问题都有 owner、DISP、证据和下一步，至少一项行动进入下一轮准入，报告与补证没有混成历史成绩。

## 13. 运维监控团队：怎样部署、观测、恢复与发布

### 13.1 先核对运行拓扑

| 服务 | 常用入口 | 运维要核对什么 |
|---|---|---|
| Koa 后端 | `8647` | 实际 cwd、绑定地址、custom 路由和数据库落点 |
| Vite 前端 | `8649` | 代理目标、 strictPort 和是否误用 dev:lan |
| hermes gateway | `8650` | profiles、API_SERVER_KEY、dispatcher 和模型通道 |
| Ycode | `3030/ws` | WS `online`、工作区、实际 `engine_bin` 和版本 |
| SIM gateway/studio | `8801/8802` | 仅在独立 SIM_ROOT 使用，不与生产混库 |

生产 `GOVERNANCE_REPO` 必须显式指定，避免回落 SIM 中央仓。`/health/ready` 只说明 Web shell 就绪，不证明 Matrix、模型、worker、Ycode 或治理仓都健康。

### 13.2 注入、启动和重启怎样操作

以下命令都会写文件或改变进程状态，必须在变更窗口执行：

```bash
cd <本仓根目录>
npm run inject
node scripts/deploy-agent-runtime.mjs
npm run serve
npm run dev
npm run zcode:ensure
npm run zcode:serve
```

`inject` 会修改 vendor 工作树并同步 runtime，不能只看 `[inject] done`。`deploy-agent-runtime.mjs` 不带 `--apply` 是 dry-run，出现 `kept` 时要人工比对，不能把保留差异当已同步。改服务端或 B 类补丁后需要重启后端；gateway、worker 和 Ycode 各有自己的装载节奏。

活轮次内禁止 inject。停止进程时先核对 PID、cwd 和进程组，只操作目标进程。

### 13.3 开课前和日常 readiness 怎样采集

先通过安全方式预置 `STUDIO_JWT`、`GATEWAY_KEY`，不要把值写进命令历史。

```bash
BASE=http://127.0.0.1:8647
lsof -nP -iTCP:8647 -sTCP:LISTEN
lsof -nP -iTCP:8650 -sTCP:LISTEN
lsof -nP -iTCP:3030 -sTCP:LISTEN
curl -fsS "$BASE/health/ready"
curl -sS -o /dev/null -w 'custom without JWT: %{http_code}\n' \
  "$BASE/api/orchestrator/health"
curl -fsS -H "Authorization: Bearer ${STUDIO_JWT}" \
  "$BASE/api/zcode-engine/health"
curl -fsS http://127.0.0.1:8650/health
```

判读：custom 路由无 JWT 返回 401 表明已挂且受保护，404 优先查注入和重启；Ycode 只有 `online:true` 才表示 WS open；gateway basic health 只表示 adapter 可响应。受保护 GET 可能刷新登录时间或初始化本地状态，不能宣称绝对零磁盘写入。

### 13.4 停滞和恢复怎样处理

- ready 不进入 running：查围栏、依赖、容量、认领锁、模型额度和 worker 日志，不手改 running。
- worker 停滞：使用 `hermes kanban sleeping-workers --idle-sec 1800` 和 diagnostics 找信号，再结合真实任务验证。
- Ycode/ACP 不可用：检查实际 CLI、provider、cwd 和 delegate result，不把 provider 名称当成功回执。
- 429 或网络故障：按 rate limit、DNS、认证、策略分类，使用有界退避；恢复耗尽即升级人工。
- `POST /api/orchestrator/tick` 会推进游标并可能投递消息，是写操作，不是健康检查。

故障记录按 ENV、TIMEOUT、PRODUCT、SCRIPT、FLOW、UNKNOWN 分类，第二次出现必须改变处置动作，不能只重复运行。

### 13.5 Graph、数据与多机边界

`GRAPH_ENGINE=legacy` 是旧执行，`shadow` 是 dry-run 双跑，`on` 才接管调度。切换模式必须重启并核对实际 tick 和事件，不能用某个导演端点可用反推全局接管。

多机是每个节点一个 gateway，本机执行，通过 peer API、Matrix 和 Git 制品协作。进度联邦是心跳和进度投影，不是统一调度、共享高可用数据库或自动 failover。备份前先确认 Studio、Kanban、治理仓、Eval、审批和 SIM 各自真值及保留期。

### 13.6 发布观察与回滚

发布前核对可复现构建、依赖、回滚命令、灰度、告警和负责人。发布后观察真实运行指标、错误、任务状态和用户反馈，必要时执行回滚并记录原因。

Windows 离线安装是 Web 模式，仍需 Node≥23、Python 3.14、Git 和内部 npm/pip 镜像。everything 不是完全断网自足包，Windows 实机与气隙环境必须单独验证。

**本章交付物**：readiness 记录、实际监听与配置清单、恢复记录、发布观察和回滚结果。
**通过判据**：每项健康结论都有对应探针或日志，恢复没有扩大权限或改变任务真值。

## 14. 安全合规及审计内控团队：怎样独立核验

### 14.1 先核对真实安全姿态

- 全局应用角色只有 `super_admin` 和 `admin`；组织 RACI、团队领导和 Matrix 权限是另外的判断面。
- `HERMES_TOOL_ENFORCE=1` 才开启工具执法；strict 决定无配置或异常是否 fail-closed，默认存在观察和 fail-open 区域。
- OS 沙箱只覆盖已接入执行面，macOS `sandbox-exec`、Linux `bwrap` 不可用时应 unavailable，不是裸跑；Windows 不在当前后端支持列表中，不能把 Windows 终端描述为已沙箱化。
- `gates.json` 未配置时不能宣称列门正在执法。
- `HUMAN_GATE_REQUIRE_HUMAN_DECIDER=1` 才严格拒绝自批，角色白名单也需显式配置。
- 治理姿态页面要读实际值，不能用 expectations 文件存在代替进程已生效。

### 14.2 安全审计怎样形成独立证据

安全审计按以下顺序执行：

1. 建立项目和攻击面目录，确认范围与版本。
2. 创建审计运行，收集候选发现和原始证据。
3. 对候选作接受、驳回或待补证判定。
4. 由非主张人独立验证，记录验证者、对象、方法和结论。
5. 复核覆盖账本、未决发现和例外。
6. 形成报告期复核与整改清单，保留审计锚。

自验、自审不能替代独立复核。安全审计、代码独立评审、G4 独立测试和组织双人会签是不同责任，不得互相顶替。

### 14.3 审批与会签怎样核验

审批前核对对象、当前 commit、影响范围、权限和不可逆后果。HumanGate 要回查 `requestedBy`、`decidedBy`、`deciderMode`、`strength` 和有效期；组织关键 admin 行还要求另一名在册合格治理人员会签。

紧急通道必须带 `[BREAK-GLASS]` 理由并留审计记录，不能作为绕过双人会签的常规方法。SIM standard/demo 的 director-proxy 是代偿，不计真人批准。

### 14.4 证据链怎样审

- 核对任务卡号、真实提交、测试、评审、UAT/G5 和运行证据是否指向同一对象。
- 检查审批历史和证据哈希链的 `intact`、`firstBroken`、`hash_mismatch/link_broken`。
- 区分篡改、环形挤出、历史锚点悬空和源缺席；没有证据时写未知，不写通过。
- 审计链只在有限保留期内提供篡改可发现性，不承诺永久不可删除全史。
- 报告快照、后续补拍和清偿记录必须分时点，不能用补证改写历史结论。

### 14.5 供应链和执行面怎样审

- 模型、MCP、技能、知识库和外部依赖先查来源、版本和准入。
- Hooks、slash、技能供给、模型配置和 runtime 注册都是真实写操作，保存后还要核对装载与重启。
- 红队文本幸存只表示规则可疑结果，执行型载荷必须在已接入沙箱中运行，不能据此宣称系统无漏洞。
- 离线包先跑脱敏扫描和 SHA256 校验，不包含真实 env、状态库、会话和日志。
- swarm-yuan 的 precheck 与变异验证用于验证规则和测试有效性，但仍需真实业务测试和独立审查。

### 14.6 数据与隔离边界怎样审

跨用户或租户隔离必须由服务端执行，不能靠导航隐藏。Matrix 不自动等于全链路 E2EE，orchestrator 摘要和 chat bridge 不能当加密证明。SIM 独立运行根不等于全入口隔离，批量操作和注意力入口仍有缺口。

多 gateway 和进度联邦不等于高可用或自动 failover，生产需要另行验证数据一致性、故障切换和恢复。

### 14.7 审计实操与完成判据

1. 选择一个不含敏感原值的培训变更。
2. 核对角色、权限、配置、当前 commit 和影响面。
3. 验证一条 HumanGate 或组织会签，记录真实 actor 和强度。
4. 检查任务、测试、审批和发布证据链。
5. 对一处缺口建立整改项，指定 owner、期限和复验条件。
6. 由另一名审计人员复核结论。

**本章交付物**：安全姿态记录、独立审计底稿、审批与证据链检查、整改和复验记录。
**通过判据**：审计者与主张人不同，结论有原始证据，未知和缺口没有被改写成通过。

## 15. run28 真实案例：含代偿六闸全过，净额只有 5/6

### 15.1 最新完整轮与历史边界

当前最新完整真实轮是 `20261107-v8-run28`。阅读时使用该 RUN 的 `evidence/final-report.html` 作为人读正本，`simulation-report.html` 作为机器档案。课程主入口见[《run28 案例》](aistudio-interactive-training.html#scene=project-run28-case)；[完整 Markdown 教学对照](aistudio-run28-simulation-case.md)为可选来源。

run25（`20261102-v8-run25`）与 run26 是历史案例：run26 已有 477 分钟、26 步、六闸全过的完整报告，后续挂账清偿与补拍必须分时点阅读，不能改写成“不是完整轮”，也不能再当最新。run27 已完成，但不是最新轮；run29 尚无完整报告，不能写成“最新完成”或引用不存在的成绩。run25/run26 的历史证据入口仍保留在[《run25 全流程推演案例》](aistudio-run25-simulation-case.md)。

### 15.2 报告中的实际成绩

- `state.env` 的 `run_started_at=1794045964` 与 `report_done=1794090918` 相差 **44,954 秒，即 12 小时 29 分 14 秒**。部分早期收官 spec 写 14h29m，本手册统一采用状态起止差，不混用或相加。
- 26 步完成，G1-G6 均留下完成键，**含代偿六闸为 6/6**。
- G1、G3、G6 首过；G2、G4、G5 经打回后完成，不能讲成“六闸全部首过”。
- 测试证据覆盖 10,785 用例，治理指标记录 4 个缺陷；证据一次通过率为 44/48，另有 4 起凭证族记录。
- 发布与 UAT 步骤均完成，但完成状态不替代对代偿、证据缺口和后续新债的审查。

### 15.3 必须同时展示的反证

- **净额六闸只有 5/6**：G5 由 `director-proxy` 代批，净额口径不计真人批准，不能把含代偿 6/6 当成无代偿能力。
- 代偿台账有 **65 笔 open**，已修为 8/65；其中脚本预写派发 48 条、卡代操作 4 张。组织自派发在案 14 条与代偿数据要分开阅读。
- 全量呈现覆盖为 **11/13**，不是 13/13；缺项必须进入补证和下一轮验证，不能用六闸完成键遮盖。
- 本轮 `scenario.log` 只有 2 行、383 字节，且均为人工补抄段界；R18 非法载荷还导致报告生成两次崩溃和审计多轮重入。这些事实证明“流程跑完”不等于“证据链完整”。

### 15.4 事故怎样转化为下一轮机制

N28 挂账族已清五件：G2 复位签名卡面、metrics 锚校验、JWT 无 profiles 时按 username 回退、OP_STEPS 并档和“落档”词表分裂。复盘根治批继续修复 `note()` 双写、R18 载荷单一校验源、审计异常隔离与机器可读缺口侧柜、交付读数契约。帧独立审计的 14 帧 MD5 全唯一，但 `ide_done` 深链报错帧和 DISP 假引用 repo-shots 仍作为新发现入账，不能因哈希唯一就宣称内容正确。

| 团队 | 用 run28 必须完成的动作 |
|---|---|
| 产品需求分析 | 回查 AC、UAT 判词和呈现缺项，不把完成步数当业务验收 |
| 项目管理 | 分列含代偿 6/6、净额 5/6 与 open 65，给每笔遗留指定责任人和清账条件 |
| 研发 | 按真实提交、工作区和测试证据复核交付，拒绝只交报告截图 |
| 测试 | 复跑失败与异常路径，核验 10,785 用例证据和 4 个缺陷的闭环，而非照抄汇总数字 |
| 运维监控 | 用状态起止、发布记录和恢复日志复核 12h29m14s 过程，保留故障与干预时间线 |
| 安全合规及审计内控 | 把 director-proxy 排除在真人批准之外，审查 65 笔代偿、11/13 呈现和空过程日志 |

**本章通过判据**：六支团队都能指出自己应复核的证据和缺口，并能解释为什么 run28 可以记为“含代偿完成”，却不能记为“净额全过、零缺陷”。

## 16. 生产配置、数据与安全边界

### 16.1 共享培训或生产怎样启动

以下占位符执行前替换为实际绝对路径。共享培训必须显式使用 production 数据落点，否则建号 CLI 与后端可能使用不同数据库。

```bash
cd <本仓根目录>
export NODE_ENV=production
export BIND_HOST=127.0.0.1
export HERMES_WEB_UI_HOME="<培训 Studio 状态目录>"
export OBS_SIM_ROOT="<保留且不存在的路径>"
export HERMES_WEB_UI_DISABLE_UPDATE_CHECK=1
npm run serve
```

需要组织或会签实操时，在同一终端使用：

```bash
GOVERNANCE_REPO="<培训治理仓绝对路径>" npm run serve
```

production 数据库为 `${HERMES_WEB_UI_HOME}/hermes-web-ui.db`；非 production 使用 `packages/server/data/hermes-web-ui.db`。建号也要指向同一状态目录：

```bash
HERMES_WEB_UI_HOME="<培训 Studio 状态目录>" \
  node vendor/hermes-studio/bin/hermes-web-ui.mjs reset-default-login
```

随机密码只显示一次，凭据文件权限目标为 0600。不要把密码写入手册或培训群。需要完整推演时，在独立环境配置真实 `OBS_SIM_ROOT`，不与日常培训共用数据库。

### 16.2 数据真值与保留期

| 数据 | 权威落点 | 使用边界 |
|---|---|---|
| Kanban 任务、尝试和事件 | `${HERMES_HOME}/kanban.db`；命名板在 `${HERMES_HOME}/kanban/boards/<slug>/kanban.db` | orchestrator DB 只存授权与游标，不复制任务真值 |
| Studio 用户、会话和产品状态 | production：`${HERMES_WEB_UI_HOME}/hermes-web-ui.db` | 备份恢复前先确认模式与 cwd，不混拷开发库 |
| 组织、邀请和治理文档 | `GOVERNANCE_REPO` 的 Markdown 与 Git commit | 保存即提交，写错仓先停写 |
| Matrix 账号与消息 | 外部 Synapse 及房间 | chat bridge state 只是游标与去重 id |
| Loop/Graph | `HERMES_LOOP_DIR`、可写 cwd 的 `.loop` 或 `${HERMES_WEB_UI_HOME}/loop` | 以启动日志实际路径为准 |
| 推演 runs、凭据和快照 | 仓外 `SIM_ROOT` | 不与生产共用 |

审批历史、治理事件、工具审计和任务证据都有容量或保留期。审计链的正确说法是“有限保留期内可发现篡改”，不是“永久不可删除全史”。

### 16.3 双角色必须遵守的安全清单

1. 不在任务卡、聊天、评测证据或培训材料中填写真实密码、令牌和个人敏感信息。
2. 不使用生产账号、生产治理仓或生产发布请求做课堂练习。
3. `npm run dev:lan` 会开放局域网开发服务，不在不可信网络中使用。
4. Synapse 管理员 token、AIStudio JWT、hermes `API_SERVER_KEY` 是三种不同凭据。
5. 紧急通道留下审计记录，但不是绕过双人会签的常规方法。
6. 需要保留交付物时不用 `scratch`。
7. 导航开关不是服务端 ACL，深链可见也不等于可写。
8. IDE 电脑操作默认关闭，插件存在不等于获得执行授权。
9. 推演隔离仍有缺口，不使用真实敏感数据。
10. 高风险命令、删除、覆盖和发布必须核对实际对象与影响。
11. 工具执法需要 `HERMES_TOOL_ENFORCE=1`，strict 另需显式配置；默认存在观察和 fail-open 区域。
12. OS 沙箱只覆盖已接入执行面，不是所有 Agent 的默认隔离；Windows 不在当前后端支持列表中，不得宣称 Windows 终端已沙箱化。
13. 需要仅本机访问时显式 `BIND_HOST=127.0.0.1` 或使用受控反向代理。
14. Matrix 协作不自动等于全链路 E2EE，orchestrator 摘要、chat bridge 和模拟房不能当加密证明。
15. 多 gateway 与进度联邦不等于统一 active-active、共享高可用数据库或自动 failover。
16. 源码和注册表存在不代表 custom 路由已挂载；先注入、重启并用受保护 API 探针核验，活轮次内不 inject。
17. 改进实验、红队和技能供给可能写文件或执行进程，写盘前核对批准、环境开关、受管路径和回滚。
18. `GRAPH_ENGINE=legacy|shadow|on` 分别表示旧执行、影子双跑和接管调度；未知值回落 legacy，不为演示直接切 on。

### 16.4 发布与离线环境

Windows 离线包面向 Windows 10/11 x64，是 Web 模式，不是 Electron 桌面线。目标机需要 Node≥23、Python 3.14、Git for Windows 和内部 npm/pip 镜像；node-pty 还依赖镜像提供 win32 预编译件，Ycode 技能中的部分源码工具仍需在目标机安装依赖。包内不得包含真实凭据、状态库、会话和运行日志，registry 继承目标机配置。R134 everything 不完全断网自足，Windows 实机与完全气隙安装均未在本手册编写轮验证；当前 OS sandbox 也不支持 Windows。

**本章通过判据**：培训环境与生产数据隔离，数据库和治理仓路径明确，所有默认安全姿态都能用实际进程配置和探针证明。

## 17. 技术实操、故障索引与参考材料

### 17.1 研发实操：完成一张可审查任务卡

**环境依赖**：培训看板、worktree、Ycode、模型和另一名评审人。

1. 写一份含 AC、非目标和 MAET 的 spec，完成 G1/G2。
2. 创建任务卡，确认 R/A、依赖、工作区和 DoD。
3. 转为 ready，触发 dispatcher，核对真实 claimed/running。
4. 在 IDE 核对任务上下文并完成小修改。
5. 运行目标测试并保存输出。
6. 提交真实 commit，由另一名评审人审查。
7. 独立执行测试与 Eval 失败处置。
8. 完成 UAT/G5 材料并回查源系统。

**完成判据**：任务、提交、测试、评审和审批能按 ID 串成一条证据链。没有 worker 时，只能验收 spec、任务和静态准备，不登记自动执行通过。

### 17.2 项目管理团队实操：主持一次开工到复盘

**环境依赖**：至少一张 ready、一张 blocked、一张 review 培训卡，以及一个受控低风险发布案例。

1. 分类四类队列并标注数据源异常。
2. 复核一张 ready 卡的 RACI、依赖、围栏和容量。
3. 触发一次 dispatcher，核对 claimed 而非 routed。
4. 对 blocked 卡补真实输入并解除阻塞，不把「解析催办路由；未发送消息」的解析结果冒充投递。
5. 为 review 卡指定独立评审人，核对 actor 与当前 commit。
6. 按 G5/UAT 清单作放行或冻结决定。
7. 为一个模拟问题写 DISP、owner、期限和验收判据。

**完成判据**：每个动作都能解释状态变化和证据，未把 GAP、代偿或本地标记当通过。

### 17.3 产品需求分析团队实操：从目标到验收追溯

**环境依赖**：一份不含敏感信息的业务需求和一名独立评审人。

1. 写目标、范围、非目标和依赖。
2. 写至少三条可判 AC、范围外清单和影响面。
3. 补 G1/G2 与 MAET 测试设计，完成评审。
4. 创建一张能映射 AC 的任务卡。
5. 用业务地图排除一个词面相关但业务无关的命中。
6. 为每条 AC 写 UAT 证据锚和三态判词。

**完成判据**：AC 能映射到设计、任务、测试和 UAT，冻结后变更重新评审，不用词面命中代替业务判断。

### 17.4 测试团队实操：从失败样本到独立复评

**环境依赖**：S0 可用，另一名评审人；S1 仅作可选扩展。

1. 核对实跑 commit 与基线同祖。
2. 运行第 6 章的 Eval 失败样本并建处置单。
3. 补新证据并执行同卷复评，保留原始失败 run。
4. 用 A/B 核对改善和回归。
5. 由非写码者复核测试报告和评审 actor。
6. 写出一个 GAP，并说明为什么它不叫 PASS。

**完成判据**：测试者不同于写码者，缺陷报修验闭环完整，原证据没有用来关闭处置单。

### 17.5 运维监控团队实操：形成 readiness 与恢复记录

**环境依赖**：培训机终端和必要的只读探针凭据。

1. 记录 commit、版本、Node、进程 cwd 和实际监听地址。
2. 请求 `/health/ready`，分别检查 custom 路由、gateway 和 Ycode `online`。
3. 核对 `GOVERNANCE_REPO`、`OBS_SIM_ROOT`、`HERMES_HOME` 和 Studio 状态目录。
4. 检查工具执法、strict、HumanGate 和 harness 启动开关的实际值。
5. 对一项异常按 ENV/TIMEOUT/PRODUCT/SCRIPT/FLOW/UNKNOWN 分类并记录证据。
6. 写观察项、恢复动作和需要升级的边界。

**完成判据**：形成不含秘密原值的 readiness 记录，已验证、未验证和开课前必须处置项分开。

### 17.6 安全合规及审计内控团队实操：完成独立复核

**环境依赖**：一份培训变更、一条低风险审批和第二名审计人员。

1. 核对角色、权限、配置和实际 commit。
2. 回查 HumanGate 或组织会签的主体、强度和有效期。
3. 检查任务、提交、测试、审批和发布证据是否同对象。
4. 对一处缺口登记 owner、期限和复验条件。
5. 由另一名审计人员复核并记录独立结论。

**完成判据**：审计者与主张人不同，缺口没有被豁免成通过，整改和复验均可反查。

### 17.7 高频故障先查什么

| 现象 | 优先排查 | 不要做什么 |
|---|---|---|
| `ready` 长期不进入 `running` | assignee 全名、board/home 围栏、依赖、容量、认领锁、模型额度和日志 | 不手改 running，不反复全板派发 |
| blocked 一直不动 | 阻塞原因、真实输入和接收证据 | 不把路由 decision 当消息，不批量 unblock |
| 测试出现大量 unknown | S0/S1、判定端和证据形状 | 不把 unknown 算通过 |
| Eval 显示 `k<2` | 同题样本数 | 不用单跑作门禁结论 |
| 显示 `no_baseline` | 稳定基线和同条件对照 | 不宣称无退化 |
| custom API 全部 404 | inject、构建版本、进程 cwd 和重启 | 不直接改业务代码掩盖 |
| Ycode HTTP 200 但不可用 | `/api/zcode-engine/health` 的 `online` 与 WS | 不只看 HTTP 状态 |
| 组织保存写错仓 | `GOVERNANCE_REPO` 和进程环境 | 不再写一次掩盖错误 |
| 新 Graph 未接管 | `GRAPH_ENGINE`、启动日志和实际 tick | 不为演示直接切 on |

### 17.8 术语速查

| 术语 | 含义 |
|---|---|
| claim | dispatcher/worker 对任务的真实认领，不是 routed 或催办 |
| DoD 完成契约门 | 核对 receipt、证据和测试计数，不等于复跑测试或独立评审 |
| 双凭证 | 真实提交号与任务卡号 |
| MAET | Main、Alternative、Exception、Termination 四类测试路径 |
| G4-E | Eval 子门；PASS/GAP/FAIL 三态，GAP 不叫 PASS |
| `CONDITIONAL` | 证据不足判 PASS、也没有明确 `no` 的中间态 |
| HumanGate | 前置批准控制点，严格异人需显式配置并回查主体 |
| `retro_done` | G6 复盘闸键，不等于 `report_done` |
| fail-soft | 局部失败时明示未知，不伪造成功 |
| fail-closed | 关键检查失败或必要配置缺失时拒绝继续 |
| `legacy/shadow/on` | Graph 的旧执行、影子双跑和接管调度三种模式 |
| DISP | 问题处置结论，已修、观察、延后要分开 |

### 17.9 参考材料

- [全量功能清单](aistudio-feature-inventory.md)：全部页面、页签、写读边界、特性开关和未接线能力。
- [swarm-yuan 技术说明（交互培训专题）](aistudio-interactive-training.html#scene=development-swarm-yuan-tech)：项目技能生成、九节点、precheck、hooks、变异验证、真实 ACP 链和离线安装；[研发交付指南](aistudio-swarm-yuan-developer-guide.md)为可选来源。
- [管理员运维参考](aistudio-operations-reference.md)：启动注入、端口、凭据、数据、健康检查和故障分类。
- [设计文档导读](aistudio-design-document-guide.md)：事实源优先级、稳定机制和正本与实现差异。
- [设计文档全量索引](aistudio-design-document-index.md)：全部根目录 spec 与 archive spec 的可点击快照。
- [run28 案例（交互培训专题）](aistudio-interactive-training.html#scene=project-run28-case)：最新完整轮的真实报告、含代偿与净额对照；[完整 Markdown](aistudio-run28-simulation-case.md)为可选来源。
- [run25 全流程推演案例](aistudio-run25-simulation-case.md)：run25/run26 历史方案、报告与后续清偿对照。
- [14 幕交互拓扑培训](aistudio-interactive-training.html)：面向第一次接触系统的技术人员。每幕先解释“这是什么、为什么要做”，再给出结构图、系统架构图和逐步演示；每一步都写清讲师怎么讲、看到什么算完成、失败怎么办、要保存什么。原始技术核对项与示例命令可展开，打印输出 14 页 A4 横屏教案。
- [AIStudio 终态设计文档](../DESIGN.md)：稳定产品与架构依据。
- [全流程推演方案](../superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md)：26 步、六闸和最终验收依据。
- [发布清单](../../RELEASE-MANIFEST.json)：当前模块版本与两件发布资产政策。

页面名称、路由或操作契约变化时，应同步修订本手册、功能清单、运维参考和文档入口。新增或移动 spec 时同步设计导读与机械索引；动态文件数不进入稳定设计总账。

<!-- docs-projection:begin 由 scripts/platform/docs/sync-training-docs.mjs 生成（--write 写入 / --check 对账）；手改此块即 docs:check 红，先跑 npm run docs:sync -->
### 17.10 当前构建的页面路由投影（生成区，勿手改）

本节由 `npm run docs:sync` 从真实载体生成：路由与特性开关出自注册链清单（`scripts/regression/route-manifest.ts`），版本出自 `package.json`，模块版本出自 `RELEASE-MANIFEST.json`。`npm run docs:check`（并入 `release:check`）对账，漂移即非零——手册不维护第二份路由清单。

- 适用版本：AIStudio 1.0.16-overlay（package.json）
- 路由计数：routes=124（page 84 / redirect 40）；stageTabs=37；visitStates=161
- 模块版本（RELEASE-MANIFEST.json）：cockpit 0.8.21-studio.1 · agent-teams v0.23.1-team.3 · ycode 3.18.2 · yuan-skill v2.100.4
- 特性开关缺省（config/features.ts，经注册链解析）：agentManager=off · bpa=on · branding=on · cockpit=on · connectionsExtras=off · ekko=on · eval=on · expdual=on · extendedI18n=on · externalLinks=off · ide=on · imageAssist=off · kanbanEnhancements=on · matrixAdmin=off · matrixAuth=off · matrixChat=on · ontology=on · pet=off · skillgov=on · voice=off

全量路由清单（行序=注册链输出序；redirect 类不可直访）：

| 路由 | path | 类型 |
|---|---|---|
|  | /app/collab/history/session/:sessionId | redirect |
|  | /app/collab/global-agent/session/:sessionId | redirect |
| hermes.historySession | /hermes/history/session/:sessionId | page |
|  | /hermes/history/group-chat/:roomId | redirect |
|  | /hermes/group-chat/history/:roomId | redirect |
| ia2.collabSession | /app/s/chat/:sessionId | page |
| ia2.commsRoom | /app/s/room/:roomId | page |
| ia2.groupRoom | /app/s/group/:roomId | page |
| ia2.simDirectorRun | /app/sim/director/:runId | page |
| ia2.collabHistorySession | /app/history/session/:sessionId | page |
| ia2.collabGlobalAgentSession | /app/agent/session/:sessionId | page |
|  | /app/ops/runs/:runId | redirect |
|  | /app/comms/room/:roomId | redirect |
| hermes.globalAgentSession | /hermes/global-agent/session/:sessionId | page |
| hermes.groupChatRoom | /hermes/group-chat/room/:roomId | page |
| ia2.stage1 | /app/stage/setup | page |
| ia2.stage2 | /app/stage/reqs | page |
| ia2.stage3 | /app/stage/design | page |
| ia2.stage4 | /app/stage/build | page |
| ia2.stage5 | /app/stage/accept | page |
| ia2.stage6 | /app/stage/govern | page |
| ia2.collabChat | /app/s/chat | page |
| ia2.govOrgAssets | /app/gov/org-assets | redirect |
| ia2.govClearance | /app/gov/clearance | redirect |
| ia2.govIssues | /app/gov/issues | redirect |
| ia2.govAudit | /app/gov/audit | redirect |
| ia2.govDocs | /app/gov/docs | redirect |
| ia2.govMetrics | /app/gov/metrics | redirect |
| ia2.simSupervision | /app/sim/supervision | page |
| ia2.simOps | /app/sim/ops | page |
| ia2.simEvidence | /app/sim/evidence | page |
| ia2.simDelivery | /app/sim/delivery | redirect |
| ia2.simTrace | /app/sim/trace | redirect |
| ia2.simSettings | /app/sim/settings | page |
| ia2.simOrchestration | /app/sim/orchestration | page |
| ia2.simMap | /app/sim/map | page |
|  | /app/collab/chat | redirect |
|  | /app/collab/history | redirect |
|  | /app/collab/global-agent | redirect |
| ia2.govSettings | /app/gov/settings | page |
| ia2.modelProviders | /app/gov/model-providers | page |
| hermes.configSettings | /hermes/config/settings | page |
| codingAgent.config | /studio/agents/:agentId/:section(skills|mcp|settings|plugins|presets) | page |
| ia2.recordDetail | /app/records/:kind/:id | page |
| ia2.loopCanvas | /app/l/:loopId | page |
| ia2.runDetail | /app/runs/:runId | page |
| hermes.session | /hermes/session/:sessionId | page |
| projectDetail | /app/projects/:id | page |
| matrix.clientRoom | /matrix/room/:roomId | page |
| share.groupChat | /share/group-chat/:inviteCode? | page |
| hermes.tasks | /hermes/tasks | redirect |
| hermes.history | /hermes/history | page |
| hermes.apiRelay | /hermes/api-relay | page |
| hermes.agentManager | /studio/agents | page |
| ekko.memory | /ekko/memory | page |
| ekko.skills | /ekko/skills | page |
| ekko.mcp | /ekko/mcp | page |
| ekko.settings | /ekko/settings | page |
|  | /hermes/agents | redirect |
|  | /hermes/coding-agents | redirect |
|  | /app/journey | redirect |
| ia2.notFound | /app/not-found | page |
| ia2.search | /app/search | redirect |
| ia2.collab | /app/collab | page |
| ia2.dash | /app/dash | page |
| ia2.board | /app/board | page |
| ia2.inbox | /app/inbox | page |
| ia2.governance | /app/gov | redirect |
| ia2.teams | /app/teams | redirect |
| ia2.agents | /app/agents | redirect |
| ia2.accounts | /app/accounts | redirect |
| ia2.eng | /app/eng | redirect |
| ia2.deliveryCases | /app/cases | redirect |
| ia2.sim | /app/sim | page |
| ia2.runs | /app/runs | redirect |
| ia2.records | /app/records | page |
| ia2.collabHistory | /app/history | page |
| ia2.collabGlobalAgent | /app/agent | page |
|  | /app/ops | redirect |
|  | /app/tasks | redirect |
|  | /app/comms | redirect |
| hermes.settings | /app/settings | page |
| hermes.chat | /hermes/chat | page |
| hermes.globalAgent | /hermes/global-agent | page |
| hermes.models | /hermes/models | page |
| hermes.connections | /hermes/connections | page |
| hermes.groupChat | /hermes/group-chat | page |
| hermes.workflow | /hermes/workflow | page |
| hermes.files | /hermes/files | page |
| hermes.skills | /hermes/skills | page |
| hermes.plugins | /hermes/plugins | page |
| hermes.mcp | /hermes/mcp | page |
| hermes.memory | /hermes/memory | page |
| hermes.channels | /hermes/channels | page |
| hermes.jobs | /hermes/jobs | page |
| hermes.kanban | /hermes/kanban | redirect |
| hermes.journey | /hermes/journey | redirect |
| hermes.logs | /hermes/logs | page |
| hermes.usage | /hermes/usage | page |
| hermes.performance | /hermes/performance | page |
| hermes.profiles | /hermes/profiles | page |
| hermes.theme | /hermes/theme | page |
| hermes.petdex | /hermes/petdex | redirect |
| hermes.skillsUsage | /hermes/skills-usage | page |
| hermes.terminal | /hermes/terminal | page |
| hermes.versionPreview | /hermes/version-preview | page |
|  | /hermes/settings | redirect |
| ide.shell | /app/ide | page |
| ia2.eval | /app/eval | page |
| ia2.bpa | /app/bpa | page |
| ia2.ontology | /app/ontology | page |
| ia2.skillgov | /app/skillgov | page |
| projects | /app/projects | page |
| desktop.chat | /desktop-chat/:sessionId | page |
|  | /ide/:rest(.*) | redirect |
| hermes.person | /person | page |
| desktop.pet | /desktop-pet | page |
| login | / | page |
| groupChat.link | /group-chat-link | page |
|  | /social-messages | redirect |
| ia2.loginAlias | /login | redirect |
| ia2.journey | /app | page |
|  | /ide | redirect |
| matrix.client | /matrix | page |
<!-- docs-projection:end -->
