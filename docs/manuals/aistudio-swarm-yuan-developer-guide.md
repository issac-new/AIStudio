# swarm-yuan 研发交付指南

本指南面向需要使用 swarm-yuan 完成真实研发交付的技术人员。它回答三个问题：怎样生成可信的项目技能，怎样让技能约束每天编码，怎样证明门禁和交付证据没有造假。

- 核实日期：2026-11-09；当前 yuan 版本为 **v2.100.1**，版本载体见 `RELEASE-MANIFEST.json:88-96`。
- 事实范围：当前生成器源码、脚本、配置和本仓历史验证记录。本轮只复核源码并修订文档，未重新执行安装、生成、激活或真实 ACP 编码回合；历史实证的证明范围见第 9 节。
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

## 2. 生成器、目标技能和运行态怎样划界

三类文件必须分开：

| 边界 | 实际位置 | 职责与不能混淆之处 |
|---|---|---|
| 生成器源码 | 本仓 `skills/swarm-yuan/` | `scripts/` 负责生成、升级和核验，`assets/` 提供门禁与模板，`references/` 提供生成期方法论，`tests/` 与 `verifier/` 验证生成器自身。它不是某个目标项目的运行账本。 |
| 目标技能 | 目标项目技能目录下的 `<项目>-dev/` | 由生成器创建并由 AI 用项目事实填充，包含自己的 `SKILL.md`、`references/`、`assets/`、`scripts/`、`rules.d/` 和宿主配置。生成器的 `SKILL.md` 与目标技能的 `SKILL.md` 不是同一文件。 |
| 项目运行态 | 目标项目根 `.swarm-yuan/` | 保存当前任务状态、探查笔记、追踪、决策、门禁结果、指纹与恢复数据。`state-machine.sh` 的 `STATE_DIR` 和 `trace-log.sh` 的账本都落在这里。`skills/swarm-yuan/assets/state-machine.sh:77-82`；`skills/swarm-yuan/assets/trace-log.sh:123-156` |

目标技能内部还可能出现另一个 `.swarm-yuan/`：`activation-report.json` 和框架注入的 `effects/` 属于技能生成/升级证据；`skill-manifest.json` 与 `.swarm-yuan-version` 则直接在技能根。严格激活还会先查技能内 `.swarm-yuan/decisions.jsonl`，再回退项目根账本。不能因为目录同名就把两处数据合并。`skills/swarm-yuan/scripts/generator/subcommands.sh:293-305,696-749,865-869`；`skills/swarm-yuan/scripts/generate-skill.sh:524-530`

“运行态”也不等于“一律删除或一律不入库”。AIStudio 有意入库 `.swarm-yuan/hooks/`、部分基线和收据；是否入库遵循目标项目规则，不按目录名猜测。

默认生成位置是目标项目 `.agents/skills/`；若项目已有受支持的技能目录，按 `.agents/skills`、`.claude/skills`、`.codex/skills` 等注册顺序优先复用。第三个位置参数可显式指定目标目录，AIStudio 历史 `.claude/skills/aistudio-dev` 是项目特例，不是所有项目的默认值。`skills/swarm-yuan/scripts/generator/subcommands.sh:978-995`

### 六段技能的实际文件职责

| 逻辑段 | 主要载体与作用 |
|---|---|
| meta | `SKILL.md`：项目铁律、改造分类、工作流入口、文档路由、常用命令；`skill-manifest.json` 记录 profile、框架和文件计数，`.swarm-yuan-version` 记录生成来源与注入状态。 |
| workflow | `references/workflow.md`：九节点流程、准入、产出、状态控制和调用追踪。 |
| reference | `references/codebase.md`、`dev-guide.md`、`release.md`、`reference-manual.md`、`recipes.md`、`relations.jsonl`、`framework-knowledge.md` 等：项目结构、组件、配方、关系、开发和发布知识；`lessons.md` 是升级时保留的项目经验。 |
| assets | `spec-template.md`、`plan-template.md`、审查记录模板、分支与环境准备、数据样例、任务类型门禁映射和行业/标准映射。 |
| check | `scripts/precheck.sh`、`gates-{strict,warn,advisory}.sh`、`precheck*.conf`、`gate-enforce-level.conf`、`rules.d/` 与 `reference-manual.md` 检查段：注册、配置并执行检查；非 lite 另有 `hooks/hooks.json`、`commands/`、`settings.local.json`、`.mcp.json` 负责宿主接入。 |
| scripts | `state-machine.sh`、`trace-log.sh`、`memory-writeback.sh`、`relations-*.sh`、`inventory-*.sh`、`project-fingerprint.sh`、框架与审计工具：承载状态、证据和项目维护动作；目标技能内的 `generate-skill.sh` 是转发垫片。 |

真实分发清单以 `UNIVERSAL_FILES` 为准，项目内容保留清单以 `PROJECT_SPECIFIC_FILES` 为准。lite 保留核心认知、模板和门禁脚本，不含完整 hooks/commands/settings 与完整九节点 `workflow.md`；standard 是完整骨架；compliance 在 standard 上增加合规资料和矩阵。`skills/swarm-yuan/scripts/generate-skill.sh:63-198`；`skills/swarm-yuan/references/generation-flow.md:69-75`

### 数字各有唯一正本

- 门禁：`assets/facts.conf`。当前 **59 = FULL 53 + advisory-only 6**；`--all=12`，`--all-full`=32（standard=核心 12+架构 20），`--compliance-suite=19`。FULL 53 又等于 standard 32 + compliance 19 + `decision_audit/state_phase` 2；53 是 `ALL_GATES_FULL` 数组成员数，不是 `check_*` 总数，也不是 `--all-full` 的数量。`skills/swarm-yuan/assets/facts.conf:24-32`；`skills/swarm-yuan/assets/precheck.sh:683-691`
- 配置变量：当前 **204 = core 30 + arch 126 + compliance 48**，不要复制旧文档中的 197/199。`skills/swarm-yuan/assets/facts.conf:34-46`
- 项目真实行为：目标项目当前代码、配置、测试和运行证据。
- spec-first 判据：`spec-first-lib.sh`。
- 日常九节点：目标技能 `references/workflow.md`。
- 阶段状态：目标项目 `.swarm-yuan/state.yaml`。
- 调用与门禁证据：目标项目 `.swarm-yuan/` 的对应账本；技能激活证据：目标技能内的 manifest、版本文件和 activation report。

## 3. Step 1-13 怎样生成可信技能

下表中的“写”表示会创建或修改文件、配置、账本或宿主状态。只运行骨架脚本不能宣布生成完成。

| Step | 动作、主要脚本与产出 | 副作用与完成判据 |
|---:|---|---|
| 1 | `self-check.sh --check-only` 自检生成器、运行时和文档一致性 | 不加 `--check-only` 可能安装或升级运行时；自检通过才进入生成。 |
| 2 | 读取 AGENTS/CLAUDE/记忆；`mine-habits.sh` 形成开发习惯初稿 | 写项目根 `.swarm-yuan/notes/habits.md`；统计事实须由 AI 审读，不能直接当规范。 |
| 3 | 结构、规范、代码组织三路探查 | `trace-log.sh` 写 `trace.jsonl`；图谱工具可能建立索引，探查报告落 `.swarm-yuan/notes/`。 |
| 4 | 形态判定、组件库、调用链、关系边集和框架规律 | `relations-extract.sh`、`framework-evidence.sh`、`generate-skill.sh --inject-frameworks` 写目标技能资料与 precheck 标记区块。 |
| 5 | 填充 17 项特征卡 | P0 六项必须是具体值，P1 在激活前也必须清零占位。 |
| 6 | `generate-skill.sh <name> <project-dir> [target-dir]` 创建 auto/lite/standard/compliance 骨架 | 写目标技能目录、初始 `status: draft`、manifest 和版本文件；已有 draft 可断点续传。 |
| 7 | AI 用真实探查结果填充全部项目文件 | 写 `SKILL.md`、references、recipes、framework-knowledge；复杂填充可分批和 worktree 隔离。 |
| 8 | 审核 `precheck*.conf`、`rules.d`、测试容量和 Mutation Check | `conf-render.sh` 已产初稿，AI 补语义项；变异后仍能抓出故障才证明门禁断言有效。 |
| 9 | 定制 hooks、commands、settings、MCP 和 workflow 标注 | 写宿主/项目配置；非 lite Git 项目安装项目根 `.swarm-yuan/hooks/` 的 L2 pre-commit。 |
| 10 | 运行目标技能 `precheck.sh --all`，失败后修复重跑 | 执行真实构建和测试，可能生成构建物、追踪和显式开启的门禁证据。 |
| 11 | 独立第三方审查并运行 `precheck.sh --review` | 写 `references/review-record.md`，不能只口头说“已审查”。 |
| 12 | `memory-writeback.sh` 写回项目知识或记忆后端 | 可写 `.swarm-yuan/project-knowledge.md`、`.zcode/memories/` 或已配置后端；后端可替换，写回失败不伪造成功。 |
| 13 | `verify_completeness --strict`、清单 strict 核验后 `--mark-active` | 做最终预算、manifest 和 activation report，最后才把 draft 改为 active。 |

权威步骤见 `skills/swarm-yuan/SKILL.md:56-82`，自动化与 AI 判断的分工见 `skills/swarm-yuan/references/generation-flow.md:9-32`。

### strict 激活的实际顺序与失败语义

`--mark-active` 不是直接改 frontmatter。当前实现按以下顺序执行：

1. 要求 `SKILL.md` 存在；若不是 draft，报告无需标记并退出 0，不重跑激活检查。
2. `check_framework_globs`，防止已激活框架的配置全空。
3. `check_spec_first_wiring`，防止 `SPEC_REQUIRED=1` 但检测目录为空等失效配置。
4. `verify_completeness --strict`，检查占位符、工作流要素、项目内容和决策记录。
5. `inventory-verify.sh --tsv --path-check --stability-audit --strict`，检查清单计数、形态、登记路径与稳定性信号。
6. 若 relations 边集存在则抽样验证，失锚只告警；随后执行最终产物预算检查。
7. 重写 `skill-manifest.json`，写 `.swarm-yuan/activation-report.json`。
8. `audit-closure` 的 open goal 只告警；最后把 `status: draft` 改为 `active`，解锁 `--all-full` 和 `--compliance-suite`。

任一必需步骤失败都会 `exit 1` 并在改写状态前停止，保持 draft。relations 与 audit-closure 是明确的 advisory，不得把它们写成硬阻断；activation report 只证明当次激活链通过，不证明项目以后永远全绿。`skills/swarm-yuan/scripts/generator/subcommands.sh:798-885`

单独运行 `verify_completeness` 时，draft 非 strict 模式允许报告占位并返回 0，便于断点续传；`--strict` 或 active 状态下发现缺失返回 1。两种语义不能混写。`skills/swarm-yuan/scripts/generator/subcommands.sh:384-407,436-519`

### SCHEMA_EPOCH 只兼容历史决策，不放松 strict

决策校验的 Python 主路径以 `SCHEMA_EPOCH=2026-10-28T00:00:00+00:00` 分界：

- 所有记录都必须逐行是合法 JSON 对象；`UserChallenge:incomplete` 在任何时期都不能作为完整决策。
- 边界前记录，以及时间戳缺失或不可解析的记录，按历史记录处理：不追溯要求后来新增的完整字段 schema。
- 边界后记录必须有非空 `type`、`ai_suggestion`（或兼容字段 `suggestion`）和 `user_action`；`UserChallenge` 还必须有 `alternatives`、`missing_context`、`cost_if_wrong`。
- strict 仍要求至少一条非空决策记录，其它完整性、清单、预算和激活检查均不放宽。

因此，grandfathering 解决的是“新 schema 回溯误杀历史账本”，不是允许新决策缺字段。`skills/swarm-yuan/scripts/generator/subcommands.sh:290-380`；回归锁见 `skills/swarm-yuan/tests/test-r143-decisions-grandfathering.sh:32-70`。无 Python 时还存在旧 grep 降级路径，不能把上述边界默认外推到该降级路径，必要时应单独验证。

### 升级怎样保住项目经验

`references/lessons.md` 已登记进 `PROJECT_SPECIFIC_FILES`，升级保留项目内容，不被模板重写。`test-lessons-preserve.sh` 在 create 后手加 lessons 和 `SKILL.md` 入口行，连续两次 upgrade 都比较 MD5，锁定 lessons 与入口文件的字节级保留和幂等性。`skills/swarm-yuan/scripts/generate-skill.sh:187-198`；`skills/swarm-yuan/tests/test-lessons-preserve.sh:37-73`

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
bash scripts/precheck.sh --all                # 12
bash scripts/precheck.sh --all-full           # standard 32
bash scripts/precheck.sh --compliance-suite   # 19

# 查看实际注册与强度
bash scripts/precheck.sh --list-gates

# 显式开启逐门禁证据
GATE_RUNS_DIR=.swarm-yuan/gate-runs bash scripts/precheck.sh --all-full
```

三个聚合模式都会遍历各自数组并累计 FAIL，最后统一汇总，不是遇到首个 FAIL 就停止。`TEST_CMD`、`BUILD_CMD`、`MUTATION_CMD` 会作为 shell 命令执行，只能使用受信任配置。`skills/swarm-yuan/assets/precheck.sh:1879-1898`；`skills/swarm-yuan/assets/gates/quality/test.sh:19-28`

### 返回码和状态不是一回事

| 结果 | 当前语义 |
|---|---|
| 0 | 没有 FAIL/ERROR；WARN、advisory 和默认模式下的 SKIPPED 不阻断。`--fix-suggest` 即使收集到 FAIL 也固定返回 0，只输出建议，不能当验收通过。 |
| 1 | 业务 FAIL 或门禁自身 ERROR 的最终汇总失败；未知模式、非法 `--format` 等部分 CLI 用法错误也返回 1，须结合输出判断。 |
| 2 | 一类用于配置/项目根/门禁实现完整性等启动或运行错误；另一类是显式 `--strict-skip` 且没有 FAIL、但存在 SKIPPED。返回 2 不能一律解释成“部分跳过”。 |

最终输出单列 `fail`、`warn`、`advisory`、`skip` 计数。skip 不计 warn，也不等于 pass；默认情况下有跳过仍可能返回 0，所以“通过”不等于“全部覆盖”。`skills/swarm-yuan/assets/precheck.sh:2031-2087`

### gate-runs 与失败标记怎样使用

- `GATE_RUNS_DIR` 默认为空，JSONL 证据落盘默认关闭；`--format json` 或设置该目录会启用输出捕获，但只有目录非空才写 `gate-runs.jsonl`。目录不可创建时告警并关闭证据落盘，不伪造文件。
- 每条记录字段为 `ts/run/gate/status/ids/duration_s`；`run` 是按当前 JSONL 行数递增的单门禁记录序号，不是整套套件共享的批次号。`status` 包括 pass/fail/error/skip/warn/advisory，`ids` 是从输出中提取并去重的检查 ID，耗时单位为秒。
- `state-machine.sh` 的 `verify_evidence` 可引用 `gate-run#N`，但还要结合时间、命令和项目工作区确认该记录属于当次任务。
- FAIL/ERROR 会写项目根 `.swarm-yuan/.gate-fail-flag`，内容供白名单拦截使用；只有覆盖式聚合运行全绿才清旧标记，单个门禁变绿不会清除全局失败状态。

实现见 `skills/swarm-yuan/assets/precheck.sh:1255-1321,1338-1467,1969-1975,2038-2087`。

### ADR 的 shortcut 清单不新增门禁

`shortcut: <上限>, <何时升级>` 挂在既有 `check_adr` 的第 5 段：有标记表示已登记的妥协；缺少逗号后的升级触发条件会按 `no-trigger` 告警。它复用 architecture 族的 warn 门禁，不新增 `check_*`，所以门禁总数仍为 59。当前扫描不含 shell 文件，这是源码明示的边界，不能声称覆盖所有语言。`skills/swarm-yuan/assets/gates/architecture/adr.sh:80-99`

## 7. state-machine 和 spec-first 四层怎样配合

### 六状态的真实准入强度

state-machine 只能逐级前进，普通 `set phase` 和 `set created_at` 被拒绝；`verify_result=pass` 前必须先写 `verify_evidence`。transition 只负责 guard 和状态更新，不会自动 merge 或 release。`skills/swarm-yuan/assets/state-machine.sh:351-400,675-700`

| 状态 | 对应节点 | 准入与降级 |
|---|---|---|
| open | ①② | 初始化 change、phase、build_mode、isolation、pending 结论和证据空位；已有状态在非交互环境必须显式 `--force` 才能重置。 |
| design | ③④ | 需要 proposal 或可替代的 SPEC_FILE；缺 decisions.jsonl 主要告警。 |
| build | ⑤ | 需要 build_mode/isolation；`SPEC_REQUIRED=1` 时还需已批准 spec。判定库缺失会披露并降级跳过 spec 检查。 |
| verify | ⑥⑦ | tasks 文件存在时有未勾项会失败；文件不存在会降级跳过。 |
| archive | ⑧ | `verify_result` 必须为 pass；verify_evidence 为空在 archive guard 里只 warn，破窗清单和 delta spec 归档提示也不阻断。 |
| operate | ⑨及发布后 | verify 状态和 operate-report 主要是提示，不是强阻断发布控制器。 |

具体 guard 见 `skills/swarm-yuan/assets/state-machine.sh:184-351`。状态机是流程辅助，不是操作系统沙箱；不使用它、直接编辑状态文件或绕开调用链，都不能由脚本自身根除，必须靠 Git、门禁和审查补证。

### L1-L4 的实际触发与绕过面

| 层 | 实际触发 | 主要降级或绕过面 |
|---|---|---|
| L1 写时 hooks | spec-first 在 PreToolUse 的 Write/Edit/MultiEdit 触及 `WRITABLE_DIRS` 时检查；Bash 的 rules.d 和推进态命令属于相邻但不同的拦截面 | 宿主未装/未启用 hooks、宿主配置尚未实测、draft、非可写区、`SPEC_REQUIRED=0`、配置或判定库缺失都会降级；Claude/Codex/ZCode 的已实测结论不能外推到全部宿主。 |
| L2 Git pre-commit | staged 文件触及可写区时检查实际 index 中的 spec 与关联变更 | `git commit --no-verify` 可跳过；draft、开关关闭、检测目录为空、判定库/conf 缺失会 fail-open，由 L3/L4 和审计补位。 |
| L3 precheck spec-first | `--all` 核心序列或显式 `--spec-first` 时检查 staged、branch diff 和 untracked 中的可写区变更 | 只有真运行才生效；开关关闭、无目录、无判定库或非 Git 项目会 SKIPPED。 |
| L4 state-machine build guard | `transition build`/`auto` 进入 build 时检查已批准 spec | 不使用状态机就不会触发；`SPEC_REQUIRED=0` 或判定库缺失会降级。 |

四层共享 `spec-first-lib.sh`，但关联面不同：L1/L4 检查存在性，L2 以 staged ∪ branch 和 index 正文为准，L3 以 staged ∪ branch ∪ untracked 和 worktree 正文为准。机器所谓“已批准 spec”的基础判据是包含非占位“决策记录”段，不等于真实人类评审已经完成。`skills/swarm-yuan/assets/spec-first-lib.sh:105-185`；`skills/swarm-yuan/assets/gates/process/spec-first.sh:21-58`；`skills/swarm-yuan/assets/hooks/spec-first-pre-commit.sh:1-18,50-75`

L1 已有 Claude Code、Codex、ZCode 的宿主实证；Cursor、Gemini、OpenCode、Kimi-Code、Windsurf/Devin CLI 当前只有生成配置，尚未实证。`skills/swarm-yuan/assets/facts.conf:130-136`

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
编码引擎：在任务工作区发现/读取目标技能、编码、运行测试并产生证据
  ↓
worker / 独立验证：复核后回写 Kanban
```

worker-coder 要求技能准备先于 ACP 编码，首轮 prompt 带技能绝对路径；编码后升级技能。ACP 产出必须由 worker 亲自检查文件、语法、类型和测试后再完成。`team/profiles/worker-coder/SOUL.md:19-38,53-107`

### 当次证据至少核对这些字段

| 证据层 | 文件或通道 | 关键字段与能证明的内容 |
|---|---|---|
| 任务与上下文 | `materials/delegate-result.json` | `taskId/board/taskTitle/taskStatus/assignee/branch`、`promptSha256/promptChars`；证明哪张卡、哪份最终上下文被装配。 |
| 会话与工作区 | 同上 | `sessionId/cwd/model`；证明 ACP 会话及请求的工作区，`cwd` 还应与 Kanban 规范 workspace 对账。 |
| 引擎身份 | `delegate-result.json` 与 `materials/delegate-log.txt` | `engineBin/engineBinSource`，日志另有 `engine_bin_source=`/`engine_bin=`；可区分 env、official-bundle、ycode-fork、bridge-default。 |
| 回合结果 | 同上及 `materials/runs.jsonl` | `exit/stopReason/stage/startedAt/endedAt/usage`；G3 的机器判据要求 `exit=0` 且 `stopReason=end_turn`，不能只凭日志存在。 |
| 技能装载 | worker 的 `yuan_skill` handoff、ACP `session/update` 与测试/ diff | 技能路径只证明交付位置；`Skill` 工具 pending→completed、技能路径引用和当次回答/改动才能证明该探针实际调用了技能。 |
| 实现质量 | worker handoff、测试和审查记录 | `changed_files/tests/diff`、构建/类型/测试真实输出与独立复核；引擎自称完成不能替代 worker 验证。 |

字段实现见 `runtime/hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py:258-323`；G3 消费见 `simharness/aipay-scenario.sh:1559-1586`。

必须披露四个边界：

1. `provider="zcode"` 只是 provider/桥标识，不足以证明实际启动的是 Ycode 分叉；还要核对 `engineBin` 和 `engineBinSource`。历史成功探针使用的是 `official-bundle`，不能改写为分叉实证。
2. 技能生成端点成功只代表生成、扫描和链接流程完成，不代表目标技能 active，也不代表当前 worktree 激活。
3. 宿主发现技能不等于本次编码实际读取和使用了技能；当次 `session/update`、工具调用和输出仍需对应。
4. 源码单测、协议冒烟、一次真实 Skill E2E、每个生产回合是四层不同证据，不能互相替代。

### 历史证据按时间分层，不能停在“未验证”

- 2026-10-26 最早源码批次确实记录过真实 ACP 回合未验证；同一份 spec 后续追加了真实桥协议探针：先因额度 fail-closed，随后在 2026-10-27 成功完成真实模型回合。该探针观察到 `Skill: {"skill":"echo-dev"}` pending→completed、预期回文、任务 cwd 和 `end_turn`，证明**那次 echo-dev 探针**的 Skill 调用闭环。`docs/superpowers/specs/2026-10-26-delegate-task-context.md:27-50`
- 上述探针的 `engine_bin_source=official-bundle`，所以它不证明 Ycode 分叉身份；引擎默认解析顺序和这一边界另有记录。`docs/superpowers/specs/2026-10-26-nine-point-reconciliation.md:37-47`
- 2026-11-07 又有 `zcode-acp-server 0.82.1` 真机冒烟：握手、会话、工具流、`end_turn` 和实物落盘在约 24 秒完成，驱动注释记录其 sessionUpdate 与 0.43.2 实测结构兼容。它证明**该版本桥的特定冒烟与协议兼容**，不证明每次 worker 都读取目标技能，也不改变引擎身份判据。`docs/superpowers/specs/2026-11-07-vendor-upgrade-studio-v0817.md:20`；`runtime/hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py:198-204`

因此，正确结论不是“真实 ACP 一直未验证”，也不是“真实链已对所有回合证明”，而是：**特定真实 ACP/Skill E2E 与 0.82.1 冒烟已有记录；任何新的交付仍须提交当次技能装载、cwd、引擎身份和测试结果。**

## 10. aistudio-dev 案例怎样讲

历史生成记录显示，AIStudio 曾生成 `aistudio-dev` compliance 技能，落点为主工作区 `.claude/skills/aistudio-dev/`，本地生成、不入库，替代旧 `ncwk-dev` 与 `simharness-dev`。`docs/superpowers/specs/2026-10-24-aistudio-dev-regen.md:1-8`

该记录同时保留 66 个预存失败、27 个旧上游路径引用和后续 WARN→PASS 的审查过程。这说明“曾生成 active 技能”不能被包装成“当前所有测试全绿”，也不能证明当前 worktree 已激活该技能。`docs/superpowers/specs/2026-10-24-aistudio-dev-regen.md:43-55`

修复 ACP→编码引擎→项目技能→任务工作区链时，应分别验收：

- 源码 diff 和测试是否通过；
- profile、`.env` 和 runtime 是否部署到真实宿主；
- 技能是否在编码前被实际读取；
- ACP cwd 是否就是 Kanban 任务工作区；
- 当前 ACP 回合是否按技能执行并留下测试与审查证据；
- 引擎究竟来自官方捆绑还是 Ycode 分叉。

## 11. everything 离线包的真实口径

当前 R134 有效，`--everything` 等价于：

```text
--no-vendor
+ knowledge
+ docs
+ GitHub 源码包
```

它包含技能本体、知识资产、docs 和 gstack/superpowers/ECC 源码包，不包含 npm/pip 运行时包。可经镜像安装的内容一律不打包。R145“全内嵌”已撤销；everything 与默认档是互补关系，不是互相包含。`skills/swarm-yuan/scripts/make-offline-bundle.sh:36-46`；`docs/superpowers/specs/2026-11-03-offline-everything-complete.md:1-14`

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
- [ ] precheck 的 FAIL、ERROR、SKIPPED 分别解释，没有把“通过”写成“全部覆盖”。
- [ ] spec-first L1-L4 的实际宿主和生效状态已核对，没有把配置生成当成运行实证。
- [ ] 测试有真实输出、负向和边界用例；需要时有变异验证。
- [ ] 独立审查有 review-record，actor 与实现者不同。
- [ ] 技能实际加载、ACP cwd、引擎身份和当次回合有分层证据；provider 名称没有代替引擎身份。
- [ ] 离线包没有写成完全断网自足，Windows 和气隙安装未验证项已披露。

只有以上每一项都与当前任务相关且有证据，才能把该次研发交付写成完成。
