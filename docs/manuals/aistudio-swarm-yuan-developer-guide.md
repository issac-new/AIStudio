# swarm-yuan 研发交付指南

本指南面向需要使用 swarm-yuan 完成真实研发交付的技术人员。它回答三个问题：怎样生成可信的项目技能，怎样让技能约束每天编码，怎样证明门禁和交付证据没有造假。

- 核实日期：2026-11-03。
- 事实范围：当前生成器源码、脚本、配置和本仓历史生成记录。本文没有执行安装、生成、激活或真实 ACP 编码回合。
- 核心原则：**生成器生成项目技能，项目技能约束研发；门禁验证过程，真实测试和独立审查验证结果。**

## 1. swarm-yuan 到底是什么

swarm-yuan 是项目研发技能的生成器。它对目标仓库执行规范提取、组件与关系盘点、门禁配置和独立验证，产出 `<项目>-dev` 目标技能。此后该项目的 AI 编码应受目标技能约束。`skills/swarm-yuan/SKILL.md:6-13`

生命周期是：

```text
生成目标技能
→ 目标技能进入日常研发
→ 项目发生变化
→ 指纹感知与局部重探查
→ 技能局部更新
→ 继续研发
```

它解决五类问题：项目已经有什么、哪些文件能改、组件怎样依赖、项目怎样测试和发布、结果怎样证明。产物不是一份项目介绍，而是组件清单、关系边集、任务配方、规则门禁和验证证据。`skills/swarm-yuan/README.md:86-121`

### 它不是什么

- 不是 Ycode、Codex 或其他编码宿主的替代品。
- 不是通用技能商店；目标技能按具体仓库生成。
- 不是单纯 lint 包；它还有项目认知、spec 前置、任务配方和反馈更新。
- 不是质量保证的充分条件；门禁全绿不等于业务逻辑正确。
- 不是任何任务都适用的重流程；个人脚本、一次性原型、typo 小改和纯人工开发不适用。只做项目开发任务时应使用该项目的目标技能，而不是重新运行生成器。`skills/swarm-yuan/SKILL.md:15-27`

## 2. 六段技能怎样组织

| 逻辑段 | 主要载体与作用 |
|---|---|
| meta | `SKILL.md`：项目铁律、改造分类、工作流入口、文档路由、常用命令 |
| workflow | `references/workflow.md`：九节点流程、准入、产出和调用追踪 |
| reference | `references/*.md`、`relations.jsonl`：组件、配方、关系、开发和发布知识 |
| assets | spec/plan 模板、分支与环境准备、数据样例、门禁配置 |
| check | precheck 与检查段：分支、范围、构建、测试、审查、复用、安全和架构 |
| scripts | precheck、state-machine、trace-log、relations、框架和审计工具 |

lite 保留核心认知、模板和门禁脚本，不含完整 hooks/commands/settings 与完整九节点 `workflow.md`；standard 是完整骨架；compliance 在 standard 上增加合规资料和矩阵。`skills/swarm-yuan/references/generation-flow.md:69-75`

### 每类事实各有唯一正本

- 数字：`assets/facts.conf`。当前为 56 个门禁函数、11 个核心、18 个架构、19 个合规、6 个 advisory-only；执行序列 `--all=11`、`--all-full=29`、`--compliance-suite=19`。`skills/swarm-yuan/assets/facts.conf:24-32`
- 配置变量：当前 `FACT_CONF_VARS=199`，不要复制旧文档中的 197。`skills/swarm-yuan/assets/facts.conf:34-46`
- 项目真实行为：目标项目当前代码、配置、测试和运行证据。
- spec-first 判据：`spec-first-lib.sh`。
- 日常九节点：目标技能 `references/workflow.md`。
- 阶段状态：目标项目 `.swarm-yuan/state.yaml`。
- 调用与门禁证据：目标项目 `.swarm-yuan/` 的对应账本。

`skills/swarm-yuan/` 是生成器源码，目标项目 `.swarm-yuan/` 是运行状态，两者不能混写。`skills/swarm-yuan/docs/usage-manual.md:476-485`

## 3. Step 1-13 怎样生成可信技能

下表中的“写”表示会创建或修改文件、配置、账本或宿主状态。只运行骨架脚本不能宣布生成完成。

| Step | 动作与产出 | 副作用与完成判据 |
|---:|---|---|
| 1 | 自检生成器、运行时和文档一致性 | 推荐 `self-check.sh --check-only`；不加该参数会自动安装或升级运行时 |
| 2 | 读取 AGENTS/CLAUDE/记忆，形成开发习惯初稿 | `mine-habits.sh` 写 `.swarm-yuan/notes/habits.md` |
| 3 | 结构、规范、代码组织三路探查 | `trace-log.sh` 写 `trace.jsonl`；图谱工具可能建立索引 |
| 4 | 形态判定、组件库、调用链、关系边集和框架规律 | 关系提取和 `--inject-frameworks` 会写目标技能资料与 precheck |
| 5 | 填充 17 项特征卡 | P0 六项必须是具体值，不留占位符 |
| 6 | 创建 auto/lite/standard/compliance 骨架 | 写目标技能目录，初始为 draft |
| 7 | AI 用真实探查结果填充全部项目文件 | 写正文、references、recipes；复杂填充可分批和 worktree 隔离 |
| 8 | 审核 precheck、rules.d、测试容量和 Mutation Check | 写配置和规则，变异后仍能抓出故障才证明断言有效 |
| 9 | 定制 hooks、commands、settings、MCP 和 workflow 标注 | 写宿主/项目配置；非 lite Git 项目会安装 L2 pre-commit |
| 10 | 运行 `--all`，失败后修复重跑 | 执行真实构建和测试，可能生成构建物与门禁状态 |
| 11 | 独立第三方审查 | 写 review-record，不能只口头说“已审查” |
| 12 | 可复用经验写回项目知识或记忆后端 | 写记忆，后端可替换 |
| 13 | strict 完整性、清单、计数、预算核验后 `--mark-active` | 写 status、manifest 和 activation report；失败应保持 draft |

权威步骤见 `skills/swarm-yuan/SKILL.md:56-82`。

### strict 激活为什么不是改状态字

`--mark-active` 会依次检查框架与 spec-first 接线、`verify_completeness --strict`、`inventory-verify --strict`、最终预算和 manifest，写 activation report，最后才把 `status: draft` 改成 `active`。任何必需 strict 检查失败都应保持 draft。`skills/swarm-yuan/scripts/generator/subcommands.sh:765-860`

默认生成位置是目标项目 `.agents/skills/`；已有受支持项目技能目录时优先复用。AIStudio 的专用集成可显式落到 `.claude/skills/`，项目特例不能写成所有项目的默认行为。`skills/swarm-yuan/scripts/generator/subcommands.sh:954-970`

## 4. 日常九节点与研发四阶段

Step 1-13 负责生成技能，日常九节点负责使用技能，编号不能混用：

```text
①需求理解 → ②探查 → ③设计 spec → ④实施 plan → ⑤编码实现
→ ⑥测试验证 → ⑦独立审查 → ⑧合入 main → ⑨主干回归与发布
```

| 研发阶段 | 节点 | 完成含义 |
|---|---|---|
| 分支开发 | ⑤ | feature 分支自最新 `origin/main` 起步，测试与实现同分支，禁止直接在 main 开发 |
| 分支测试 | ⑥⑦ | 测试、门禁和独立审查都在 feature 分支完成，全绿才允许合入 |
| 主干合并 | ⑧ | 核验前序证据、回滚、迁移兼容和设计文档，再执行合入 |
| 主干回归 | ⑨ | 合入后在 main 复跑全量回归，全绿才构建发布 |

⑨用于发现并行合入交互和合并语义问题，不是跳过⑥⑦的补救通道。`skills/swarm-yuan/references/template-spec.md:254-282`

状态机六阶段对应关系是：open=①②，design=③④，build=⑤，verify=⑥⑦，archive=⑧，operate=⑨及发布后观察。`skills/swarm-yuan/assets/state-machine.sh:15-18`

## 5. 每个需求怎样操作

| 环节 | 操作 | 完成判据 |
|---|---|---|
| 需求理解 | AI 复述目标、非目标、影响面、约束和 AC，人确认或纠正 | 边界和验收口径明确，信息不足不臆测 |
| 探查 | 先查 recipes、组件清单和关系边集，再读必要实现 | 复用件、消费方、接口影响和回归面有路径或证据锚 |
| spec | 写变更、决策记录、验证、设计文档影响，补测试、复用、安全和回滚 | spec 经人评审，DESIGN_SYNC touched/none 明确 |
| plan | 拆成可独立验证的任务，明确文件、顺序、测试、回滚和灰度 | 每项任务有验证方式，plan 与 spec 一致 |
| worktree | 从最新主干创建 feature 分支与隔离工作区，记录基线 | 工作区隔离、分支非保护分支、起点和基线测试明确 |
| 编码 | 先写或更新测试，再按复用阶梯实现 | 改动在允许范围，测试与实现同分支，无未经批准的依赖升级 |
| 测试 | 在 feature 分支运行目标测试和适配门禁 | 退出码、覆盖、断言、负向用例和接口映射满足配置，SKIP 可解释 |
| 独立审查 | 非实现者审查 spec、代码、测试有效性和当次证据 | review-record 有 findings、结论和处置，阻断项关闭 |
| 合入 | fetch → main ff-only → worktree rebase → 复测 → merge --no-ff → 授权 push | ⑥⑦证据齐全，形成 merge commit，远端操作有授权 |
| 发布 | main 全量回归后构建、发布、灰度和观察 | 发布物、release notes、告警、runbook 和回滚入口齐全 |

复用阶梯依次是：是否真的需要、代码库已有、标准库、平台原生、已装依赖、一行调用、最小实现。任何一层命中即停止下探。`skills/swarm-yuan/references/lazy-generation-methodology.md:9-34`

## 6. precheck 怎样执行和判读

配置分 core、arch、compliance，并可加载 industry 与最后的 `precheck.patch.conf` 用户覆盖层。项目定制优先放覆盖层，避免升级漂移。`skills/swarm-yuan/assets/precheck.conf:98-119`

```bash
# 执行检查，可能写测试、构建和追踪产物
bash scripts/precheck.sh --all
bash scripts/precheck.sh --all-full
bash scripts/precheck.sh --compliance-suite

# 查看实际注册与强度
bash scripts/precheck.sh --list-gates

# 显式开启逐门禁证据
GATE_RUNS_DIR=.swarm-yuan/gate-runs bash scripts/precheck.sh --all-full
```

`GATE_RUNS_DIR` 默认为空，gate-runs 证据落盘默认关闭。FAIL 导致非零退出并写失败标记；覆盖式全绿才清旧标记。未配置项可能 SKIPPED，默认情况下有跳过仍可能通过，所以“通过”不等于“全部覆盖”。`skills/swarm-yuan/assets/precheck.conf:42-48`；`skills/swarm-yuan/assets/precheck.sh:1969-1975,2038-2086`

当前 `--all/--all-full/--compliance-suite` 会遍历门禁并积累失败，最后统一汇总，不是遇到首个 FAIL 就停止。`TEST_CMD`、`BUILD_CMD`、`MUTATION_CMD` 会作为 shell 命令执行，只能使用受信任配置。`skills/swarm-yuan/assets/precheck.sh:1878-1893`；`skills/swarm-yuan/assets/gates/quality/test.sh:19-28`

## 7. state-machine 和 spec-first 四层怎样配合

state-machine 只能逐级前进，不允许通过普通 `set phase` 伪造阶段；`verify_result=pass` 前必须先写证据字段；transition 只负责 guard 和状态更新，不会自动 merge 或 release。`skills/swarm-yuan/assets/state-machine.sh:351-400,672-700`

不同阶段的实际强度不同：design 缺 proposal/spec 会失败；build 在 `SPEC_REQUIRED=1` 时无已批准 spec 会失败；verify 在 tasks 文件存在时有未勾项会失败，文件不存在会降级跳过；archive 的 `verify_result` 非 pass 会失败，verify_evidence 为空只 warn；operate 的运营报告和 verify 状态主要是提示。`skills/swarm-yuan/assets/state-machine.sh:184-327`

| 层 | 作用与边界 |
|---|---|
| L1 写时 hooks | 在 Write/Edit/Bash 前 deny，依赖宿主真实安装和可用 |
| L2 Git pre-commit | 检查 staged 源码与 spec；可被 `--no-verify` 绕过，由后层兜底 |
| L3 precheck spec-first | 在核心门禁序列中检查变更与 spec 的关联 |
| L4 state-machine build guard | 无已批准 spec 时阻止进入 build |

四层共享 `spec-first-lib.sh`。机器所谓“已批准 spec”的基础判据是包含非占位决策记录，不等于真实人类评审已经完成。`skills/swarm-yuan/assets/hooks/spec-first-pre-commit.sh:1-18`；`skills/swarm-yuan/assets/spec-first-lib.sh:105-138`

L1 已实测 Claude Code、Codex、ZCode；Cursor、Gemini、OpenCode、Kimi-Code、Windsurf/Devin CLI 目前只有生成配置，尚未实测。`skills/swarm-yuan/assets/facts.conf:130-136`

## 8. 守门测试和变异验证怎样防止假绿

`check_test` 先运行真实 `TEST_CMD`，再检查零用例空跑、覆盖率、零断言、断言密度、聚焦测试和负向/边界比例；配置 `MUTATION_CMD` 后继续检查变异结果。`skills/swarm-yuan/assets/gates/quality/test.sh:3-90`

负向比例主要按含相关关键词的测试文件占比计算，不是对业务语义的完整理解。`skills/swarm-yuan/assets/gates-strict.sh:198-275`

两种变异验证不能混讲：

- **生成器侧 Mutation Check**：故意给门禁函数注入故障，重跑 violating/compliant fixture；变异后仍能抓出故障才证明断言有效。`skills/swarm-yuan/references/generation-flow.md:89-99`
- **项目侧变异测试**：只有配置 `MUTATION_CMD` 后才执行；命令失败、无法解析阈值分数或分数低于阈值都会 fail。`skills/swarm-yuan/assets/gates-strict.sh:277-305`

fixture 双态测试只能证明违规样例被抓、合规样例通过和重构前后行为一致，不能证明所有真实缺陷都能被拦截。外部有效性文档仍记录真实历史 bug 语料待采集，既有试验中 fixture 曾漏掉 3 个 P0/P1 bug。`skills/swarm-yuan/verifier/v2/external-validity.md:1-13,47-52`

## 9. 与 worker、ACP、Ycode 的真实交付链

```text
人：目标、授权、关键判断和发布裁决
  ↓
Kanban：任务、工作区、执行状态和证据回流
  ↓
Hermes worker-coder：读取任务和代码、准备项目技能、协调 ACP、亲自复核
  ↓
ACP：把任务上下文和 cwd 交给编码 provider
  ↓
Ycode：在任务工作区读取目标技能、编码、运行测试并产生证据
  ↓
worker / 独立验证：复核后回写 Kanban
```

worker-coder 明确要求技能准备先于 ACP 编码，编码后升级技能；ACP 产出必须由 worker 亲自检查文件、语法、类型和测试后再完成。`team/profiles/worker-coder/SOUL.md:9-38`

必须披露四个边界：

1. `provider="zcode"` 只是 provider/桥标识，不足以证明实际启动的是 Ycode 分叉；还要核对 `engine_bin` 和版本日志。
2. 技能生成端点成功只代表生成、扫描和链接流程完成，不代表目标技能 active。
3. 宿主发现技能不等于本次编码实际读取和使用了技能。
4. 真实 ACP 回合、编码前技能装载与真实调用仍需当次证据，不能用源码测试替代。

核心编码链的历史源码测试为 Python 6/6、skillgov 18/18、runtime 注册 4/4，但 live 生效面未执行，真实 ACP 编码回合保留未验证。`docs/superpowers/specs/2026-10-26-core-coding-chain-alignment.md:40-60`

## 10. aistudio-dev 案例怎样讲

历史生成记录显示，AIStudio 曾生成 `aistudio-dev` compliance 技能，落点为主工作区 `.claude/skills/aistudio-dev/`，本地生成、不入库，替代旧 `ncwk-dev` 与 `simharness-dev`。`docs/superpowers/specs/2026-10-24-aistudio-dev-regen.md:1-8`

该记录同时保留 66 个预存失败、27 个旧上游路径引用和后续 WARN→PASS 的审查过程。这说明“曾生成 active 技能”不能被包装成“当前所有测试全绿”，也不能证明当前 worktree 已激活该技能。`docs/superpowers/specs/2026-10-24-aistudio-dev-regen.md:43-55`

修复 ACP→Ycode→项目技能→任务工作区链时，应分别验收：

- 源码 diff 和测试是否通过；
- profile、`.env` 和 runtime 是否部署到真实宿主；
- 技能是否在编码前被实际读取；
- ACP cwd 是否就是 Kanban 任务工作区；
- 真实 ACP 回合是否按技能执行并留下测试与审查证据。

## 11. everything 离线包的真实口径

当前 `--everything` 等价于：

```text
--no-vendor
+ knowledge
+ docs
+ GitHub 源码包
```

它包含技能本体、知识资产、docs 和 gstack/superpowers/ECC 源码包，不包含 npm/pip 运行时包。可经镜像安装的内容一律不打包。`skills/swarm-yuan/scripts/make-offline-bundle.sh:28-47`

R134 是当前有效口径，R145“全内嵌”已撤销。everything 与默认档是互补关系，不是互相包含。`docs/superpowers/specs/2026-11-03-offline-everything-complete.md:1-14`

因此不能说“everything 在完全断网机器上一定一次装齐所有功能”。正确说法是：源装不了的资料尽量内嵌，npm/pip 运行时及依赖树仍需要目标机镜像源；完全气隙环境只能接受诚实降级，或提前把完整依赖同步到内部镜像。

还应注意：

- 安装前会验证 SHA256SUMS，校验失败拒绝安装。`skills/swarm-yuan/scripts/make-offline-bundle.sh:284-325`
- Windows 实机未验证，现有测试主要使用 file:// 本地仓和 npm/bun/install 桩。`skills/swarm-yuan/scripts/make-offline-bundle.sh:519-525`；`skills/swarm-yuan/tests/test-r134-everything-bundle.sh:1-10,33-72`
- gstack 浏览器面默认 `--no-browser`，Chromium 离线不可引导；缺 Bun 时还可能经 npm 源安装。`skills/swarm-yuan/scripts/make-offline-bundle.sh:466-488`
- 含第三方版权材料的知识资产只限本地或内部分发，公开分发前另做合规核对。`skills/swarm-yuan/README.md:397-405`

## 12. 研发交付验收清单

- [ ] 目标技能已通过 strict 激活，不是 draft 骨架。
- [ ] 当前宿主能发现技能，本次任务有实际读取证据。
- [ ] 探查先使用组件、配方和关系边集，没有凭印象重复造轮子。
- [ ] spec、plan、worktree、分支和基线明确。
- [ ] ⑤编码、⑥⑦分支测试与审查、⑧合入、⑨主干回归顺序完整。
- [ ] precheck 的 FAIL 和 SKIPPED 分别解释，没有把“通过”写成“全部覆盖”。
- [ ] spec-first L1-L4 的实际宿主和生效状态已核对。
- [ ] 测试有真实输出、负向和边界用例；需要时有变异验证。
- [ ] 独立审查有 review-record，actor 与实现者不同。
- [ ] 技能实际加载、ACP cwd、Ycode 身份和真实回合有证据。
- [ ] 离线包没有写成完全断网自足，Windows 和气隙安装未验证项已披露。

只有以上每一项都与当前任务相关且有证据，才能把该次研发交付写成完成。
