> **何时读我**：参考 GSD 计划/验证/状态管理模式时。来源：gsd-core（计划验证/STATE 戳/validator envelope）。

# gsd-core 模式整合 (GSD-Core Patterns)

> 来源：[gsd-core](https://github.com/open-gsd/gsd-core)（方法论模式与运行时工具）。
> **安装 gsd-core 并引用其命令（gsd-tools / /gsd-* / capability），不复制其源码。**
> **gsd-core v1.9-1.10 要点**：① **effort surface axis**（v1.9.0 #2481）——negotiated 努力程度轴 + 调用时 effort 参数，与 swarm-yuan `task-scale.sh`（任务规模判定）一致：按任务复杂度协商投入；② **deferred-items.md 里程碑暴露**（v1.10.0 #2646）——milestone 关闭时 surface 未解决的 deferred items，与 swarm-yuan `--mark-active` 无占位符核验一致（关门前查遗留，不让 deferred 债务悄悄进 milestone）。

## gsd-core 安装与运行时调用（工具引用）

gsd-core 是可安装的 AI-runtime 工件 + 运行时引擎。安装后提供 `/gsd-*` skills、`gsd-tools` CLI、capability 系统、loop-host 校验。

### 安装（安装器，非项目 scaffolder）
```bash
# 交互式（选 runtime + global/local）
npx @opengsd/gsd-core@latest

# 指定 Claude 全局（推荐：装到 ~/.claude/，所有项目可用）
npx @opengsd/gsd-core --claude --global

# 指定 Claude 本地（装到 ./.claude/，仅当前项目）
npx @opengsd/gsd-core --claude --local

# 卸载（只删 gsd-* 工件）
npx @opengsd/gsd-core --claude --global --uninstall
```

> **注意：没有 `gsd-core init` 命令。** `gsd-core` bin 只是安装器。`gsd-tools init` 是 workflow-context 加载器（非 scaffolder）。

### 项目初始化（运行时 skill，非 CLI）
安装后在 AI runtime（如 Claude Code）中运行：
```
/gsd:new-project # 创建 .planning/{PROJECT,REQUIREMENTS,ROADMAP,STATE}.md + config.json + research/
```

### 运行时命令（目标技能可调用）
| 命令 | 作用 |
|------|------|
| `/gsd:new-project` | 创建 `.planning/` 目录结构（STATE.md 导航层） |
| `/gsd-execute-phase <N>` | 执行指定阶段（wave 并行 subagent） |
| `/gsd-verify` | goal-backward 对抗验证 |
| `/gsd-quick <desc>` | 轻量任务（跳过 optional agents） |
| `gsd-tools query init.execute-phase "1"` | 加载阶段 workflow 上下文（flat JSON） |
| `gsd-tools loop render-hooks <point>` | 渲染某 loop 点的 hook 分发（含 capability gates） |
| `gsd-tools state load/json/get` | 读 STATE.md |
| `gsd-tools capability list` | 列出激活的 capability |

### 共存说明
gsd-core 安装器只 prune `gsd-` 前缀目录。目标技能（`<target-skill-name>`，非 `gsd-` 前缀）在 `.claude/skills/` 下**安全共存**，互不覆盖。

### 在目标技能中的落地
- 目标技能的 workflow 节点⑤⑥可调用 `/gsd-execute-phase` / `/gsd-verify` 作为运行时引擎
- check 段可调用 `gsd-tools loop render-hooks <point>` 验证 capability gates
- 状态控制可引用 gsd-core 的 `.planning/STATE.md`（或继续用 swarm-yuan 的 `.swarm-yuan/state.yaml`，两者各管一层）
- **若项目已装 gsd-core**：目标技能的 workflow 标注"可选用 gsd-core 运行时执行 phase-loop"；若未装，降级为 swarm-yuan 自带的 state-machine.sh + subagent-orchestration.md 手动编排

## 五步 Phase Loop（核心心智模型）

gsd-core 的中心流程（引自 `docs/explanation/the-phase-loop.md`）：

```
Discuss → Plan → Execute → Verify → Ship
```

每步的存在理由（load-bearing）：
- **Discuss** — 规划前先确定*如何*构建。产出 `CONTEXT.md`（锁定决策 D-01/D-02...）
- **Plan** — 以 fresh-context subagent 序列运行：researcher → planner → plan-checker。计划按依赖分 wave，并行执行安全
- **Execute** — 每个 executor 用全新 200k 上下文窗口，只加载它需要的。**fresh context 不是便利，是防 context rot 的机制**
- **Verify** — 不只是测试。检查需求覆盖、决策覆盖、阶段目标对齐。"阶段完成不是因为执行没报错，而是因为建的就是计划的"
- **Ship** — 创建 PR，归档阶段，循环下一阶段

> 与 swarm-yuan 的 workflow 9 节点映射：Discuss≈①②，Plan≈③，Execute≈⑤，Verify≈⑥，Review≈⑦，Ship≈⑧⑨。gsd 的 5 步是更高层抽象，swarm-yuan 的 9 节点更细。目标技能可选用哪种粒度。

## swarm-yuan 4-Phase SOP 定义页（第三层认知辩证 · 本范式自有方法论）

> **定位**：4-Phase SOP 是 swarm-yuan 第三层"认知辩证"的流程组织方法论，与逻辑剃刀配对——SOP 管"推演流程"（如何推进），剃刀管"论证质量"（如何自证伪，见 `references/logic-razor.md`）。本节是其**唯一定义页**：SKILL.md（五层框架段/reference 清单）、`template-spec.md` 生成后核对清单、`subagent-orchestration.md`、`claude-code-capabilities.md`、`cognition-framework.md` 等处的"4-Phase SOP"引用均指向本节。
> **非 gsd-core 引用**：本方法论为 swarm-yuan 自有；gsd-core 五步循环（Discuss→Plan→Execute→Verify→Ship）是其可替换的运行时载体，映射见末节。

### 四阶段定义（概念澄清 → 破局重构 → 七步推演 → 行动落地）

| Phase | 名称 | 做什么 | 入口准则 | 出口准则 | workflow 节点映射 |
|-------|------|--------|---------|---------|------------------|
| 1 | 概念澄清 | Socratic 多轮提问，锁定概念定义、价值与边界，把含混需求问清楚 | 存在需求输入但概念/边界含混（术语未定义、目标不可衡量、范围不明） | 术语无歧义（可入 glossary）；目标 SMART 化 + 非目标显式；用户确认"已问清" | ≈节点① 需求理解 |
| 2 | 破局重构 | 挑战既有假设、重构问题空间；**强制联网检索（WebSearch）**引入外部证据，防止在旧框架里打转 | Phase 1 出口达成；已有初步思路但未证伪 | 假设清单被显式挑战（≥1 条外部证据）；spec 成形且含 §19 测试设计 + §21 可观测性约束（左移产出物） | ≈节点② 设计 spec |
| 3 | 七步推演 | 按"界定→分解→优先→分析→关键分析→综合→实施"七步（与第二层 7×7 双循环阶段轴同源，见 `cognition-framework.md` §2）推演实施方案 | Phase 2 出口达成；spec 通过逻辑剃刀对抗审查 | plan 成形：任务分解至可执行粒度，含 §20 变更影响范围 + 回滚预案；plan 经 checker 角色对抗检查 | ≈节点③ 实施 plan |
| 4 | 行动落地 | 执行→验证→交付；以 goal-backward 立场证伪"任务完成≠目标达成" | Phase 3 出口达成；用户确认 plan（暂停点） | 目标达成有证据（测试/门禁通过 + spec §14 交付衰减分析），非仅凭任务自述完成 | ≈节点④-⑧ |

### 多轮交互纪律（每 Phase 暂停）

- **每 Phase 结束即暂停**：向用户呈现本 Phase 产出 + 出口准则自检，获确认后方可进入下一 Phase——不允许一口气跑完四阶段。
- 暂停点的运行时对应：comet `build_pause: plan-ready`（Phase 3→4 可恢复暂停）；state-machine.sh `guard` 实现各 Phase 转换的 pre-flight 门禁（门禁分类见上文「4 类门禁分类法」）。
- 允许回退：任一 Phase 出口准则不满足即回退上一 Phase（Revision 门禁语义），不带伤前进。

### 与 `--shift-left` 门禁的关系

左移生成期必读文件（测试/变更/运维监控左移）是 4-Phase SOP 出口准则的**自动执法层**：

- Phase 2（= spec 阶段）出口"含 §19 测试设计 + §21 可观测性约束"由 `precheck --shift-left` 校验；
- Phase 3（= plan 阶段）出口"含 §20 变更影响 + 回滚预案"由 `precheck --shift-left` 校验；
- Phase 4 的"先测试后实现（test 先于/同于 impl 提交）"同样由 `--shift-left` 校验。

即：SOP 定"应该有什么"，`--shift-left` 判"实际有没有"。门禁未配置时静默跳过，SOP 的阶段语义与自律要求不变。

### 与外部运行时的可替换映射（引用点对照）

| 4-Phase | gsd-core | superpowers | comet | 其他增强 |
|---------|----------|-------------|-------|---------|
| Phase 1 概念澄清 | `/gsd-discuss-phase` | brainstorming（Socratic 设计精炼） | — | ECC council（模糊决策时） |
| Phase 2 破局重构 | `/gsd-spec-phase` | — | `/comet-design`（Design Doc） | WebSearch 强制联网检索（`claude-code-capabilities.md`） |
| Phase 3 七步推演 | `/gsd-plan-phase`（researcher→planner→plan-checker） | writing-plans | — | GOAP A* 目标规划（增强版，见 `subagent-orchestration.md`） |
| Phase 4 行动落地 | `/gsd-execute-phase` + `/gsd-verify` + `/gsd-ship` | subagent-driven 执行 | state-machine.sh | goal-backward UAT |

> 未安装对应运行时时降级为 swarm-yuan 自带载体（workflow 节点 + state-machine.sh + subagent-orchestration.md 手动编排）——SOP 语义不变。

## Goal-Backward 对抗验证（核心创新）

**核心口号（引自 gsd-verifier）：** "Task completion ≠ Goal achievement"

验证者从"阶段应该交付什么"出发，**证伪** SUMMARY 叙事：
- **FORCE 立场** — "假设阶段目标未达成，直到代码库证据证明它。起始假设：任务完成了，目标没达成。证伪 SUMMARY.md 叙事。"
- **不信任 SUMMARY** — "SUMMARY 记录的是 Claude 说了什么。你验证代码里实际存在什么。两者经常不同。"
- **发现分类严格** — 只有 BLOCKER / WARNING。"没有分类的发现不是有效输出。"
- **记录"审查者如何变软"** — 例如 plan-checker："对实际是 blocker 的发 warning 以避免与 planner 冲突"——这是要避免的失败模式

### 在目标技能中的落地
- check 段的 `--review` 子命令采用 goal-backward：先读 spec/tasks 的"应该交付什么"，再验证代码实际有什么
- reference-manual.md 审查段增加"对抗验证"小节：FORCE 立场 + 不信任自述 + BLOCKER/WARNING 分类

### razor↔abstain 裁决条款（与 logic-razor.md 互引）

**冲突**：`references/logic-razor.md` 铁律"审查者不得全盘肯定——即使方案看似无懈可击，也须挑出至少 10% 严谨性瑕疵"与 gsd-core honest verifier 原则"spec 信息不足时**弃权**（`abstain: insufficient_spec`）而非猜测"（`references/review-methodology.md` Honest Verifier Abstain 段）不可同时为真——一个强制产出批评，一个禁止无据产出。

**裁决（按轮次证据完备度分治）**：

- **razor 适用于证据充分的审查轮次**：被审查对象材料完整、可推演、可反证时，禁止以"信息不足"为由全盘肯定或弃权——仍须挑出 ≥10% 严谨性瑕疵。
- **abstain 适用于证据不足的探查轮次**：材料不足以推断 backstop truth 时，禁止编造瑕疵凑满 10%——输出 `abstain: insufficient_spec` + 待补信息清单，补充后重新验证。弃权 ≠ 通过（`--review` 中计为"需人工确认"，非 pass 非 fail）。
- **判据 = 证据完备度 checklist**（全部满足 = 审查轮次；任一不满足 = 探查轮次，abstain 输出须指明缺哪条）：
 - [ ] 主张明确：核心论点可一句话复述（观点镜像无歧义）
 - [ ] 数据可得：关键证据可追溯（文件:行 或命令输出）
 - [ ] 假设可识别：隐含假设（Warrant）可显式提取
 - [ ] 反例可构造：材料充分到能推演极端场景/边界反例
 - [ ] 结论可复验：第三方按同样材料可复现审查结论
- **两条严禁**：证据不足强行挑 10% 瑕疵 = 编造（违反 honest verifier）；证据充分却弃权 = 逃避对抗审查（违反 razor 铁律）。

> 本条款在 `references/logic-razor.md` 文末同步登记（razor 侧源文件），两处文本须保持一致，修改时同步。

## 4 类门禁分类法（Gates Taxonomy）

引自 gsd-core 安装后的 `~/.claude/skills/gsd-core/references/gates.md`（运行 `/gsd-verify` 时由 gsd-core 提供，swarm-yuan 不含此文件）。每个检查点映射到一类：

| 门禁类型 | 作用 | 何时用 |
|---------|------|--------|
| **Pre-flight** | 启动前验证前置条件（阻塞进入，无部分工作） | 开始阶段前 |
| **Revision** | 评估产出质量，回环给生产者，有迭代上限+停滞检测 | 产出后评估 |
| **Escalation** | 将无法解决的问题上报开发者 | revision 无法解决时 |
| **Abort** | 终止以防损害，保留状态 | 继续有危险时 |

**选择启发式：** "从 pre-flight 开始。若检查发生在产出后，是 revision 门禁。若 revision 循环无法解决，升级。若继续危险，abort。"

### 在目标技能中的落地
- workflow 每节点的"质量门禁"要素标注门禁类型（pre-flight/revision/escalation/abort）
- state-machine.sh 的 `guard` 命令实现 pre-flight 门禁；revision 用迭代上限+停滞检测

## 破窗清单（Broken Windows Ledger）

> 理念来源：gsd-core v1.8.0 `feat(#1950): broken-windows ledger - cross-phase defect register gating ship`（commit d16a6647）。gsd-core 的 `WINDOWS.md` 工件跨阶段累积 stubs/TODOs/skipped tests/unrun verifies/unmet truths，`/gsd-ship` 在有 open 条目时阻断（`ship:pre` 门禁，`artifact-frontmatter-equals` 谓词 on `open_count == 0`），配 `gsd-tools windows status|append|waive|fixed` 子命令 + waive 机制。

**核心问题**：跨阶段累积的技术债（stub 函数、`// TODO`、跳过的测试、未跑的 verify、未满足的 truth）若不在 ship 前清账，会随版本沉淀为"看似交付实有暗坑"。破窗清单让这些债**显式可见、可追踪、可清账**。

**清单格式**（`.swarm-yuan/WINDOWS.md`）：

```markdown
---
open_count: 2
---
# 破窗清单

- [ ] stub: payment-service（design 阶段遗留，verify 前须补实现）
- [ ] skipped-test: auth-edge-case（build 阶段跳过，ship 前须补跑）
- [x] done: logging-fix（已清账）
```

- frontmatter `open_count` = 未清账条目数（机器可读）
- 正文每条 `- [ ]` = open，`- [x]` = 已清账
- 每条注明：类型（stub/skipped-test/TODO/unrun-verify/unmet-truth）+ 来源阶段 + 清账条件

**swarm-yuan 落地（warn 不 fail，守决策 26 预算）**：
- `assets/state-machine.sh` 的 `archive` 阶段 guard 已实装：若 `.swarm-yuan/WINDOWS.md` 存在且 `open_count > 0`（或正文含 `- [ ]`），输出 warn 提示"建议 ship 前清账或 waive"。
- **不阻断 archive**（gsd-core 的 `/gsd-ship` 是 fail；swarm-yuan 降为 warn，避免在 archive guard 新增 fail 调用触发 enforce_level 重算，守决策 26 的门禁数负向预算（现值见 facts.conf FACT_GATES_BUDGET，决策 26.2））。
- 优先读 frontmatter `open_count`；缺 frontmatter 时降级数正文 `- [ ]` 未决项。

**清账机制**：
- `fixed`：条目完成后改为 `- [x] done: <说明>`，并更新 frontmatter `open_count`。
- `waive`：经决策（记 `decisions.jsonl`，type=UserChallenge，因 waive 是方向性决策）后豁免，改为 `- [x] waived: <理由>`（对齐 gsd-core `windows.enforce` 分离 tracking 与 enforcement 的设计）。

**与 Goal-Backward 的关系**：Goal-Backward（§Goal-Backward 对抗验证）要求"先定义完成标准再动手"；破窗清单是完成标准的**跨阶段持久化**--每个阶段产生的"未完成项"都进清单，ship 前的完成标准 = 清单 open_count==0。两者互补：Goal-Backward 防目标漂移，破窗清单防债沉淀。

## Wave 并行执行 + Worktree 隔离

引自 `gsd-core/workflows/execute-phase.md`：
- **orchestrator 协调，不执行** — "每个 subagent 加载完整 execute-plan 上下文。orchestrator: 发现计划→分析依赖→分组 wave→派发 agent→处理 checkpoint→收集结果"
- **上下文预算** — "~15% orchestrator，100% fresh per subagent"
- **wave + depends_on** — 计划带 `wave` + `depends_on` frontmatter；同 wave 的 executor 触碰不重叠的关注点
- **worktree 隔离** — executor 用 `isolation="worktree"` 实现真并行；非 Claude 运行时降级为顺序
- **fail-closed** — 不支持 worktree 时报错而非静默降级

### 在目标技能中的落地
- 与 superpowers 的 subagent 编排互补：superpowers 是每任务一 subagent，gsd 的 wave 是按依赖分组并行
- dev-guide.md 的"任务流程填充"可引用 wave 模式：plan 标注 wave + depends_on + files_modified

## Loop Host Contract（12 点状态机）

引自 `gsd-core/bin/lib/loop-host-contract.cjs`。5 步 × hook 点 = 12 点：

| 步骤 | hook 点 | agent 角色 | 产出 | 消费 |
|------|---------|-----------|------|------|
| discuss | pre/post | orchestrator | CONTEXT.md | — |
| plan | pre/post | researcher, planner, checker | PLAN.md | CONTEXT.md |
| execute | pre/wave:pre/wave:post/post | executor, verifier | SUMMARY.md | PLAN.md |
| verify | pre/post | orchestrator | UAT.md | SUMMARY.md |
| ship | pre/post | orchestrator | — | UAT.md |

workflow 文件用 frontmarker 自注册为 loop host。

### 在目标技能中的落地
- state-machine.sh 可扩展为 loop-host 模式：每阶段有 pre/post hook，产出/消费契约明确
- workflow.md 的"产出物归档"要素对应 produces/consumes

## Capability 声明式插件（最独特创新）

引自 `capabilities/*/capability.json`（33 个 capability）。一个 capability 是声明式 JSON bundle：
- `steps` — 向 loop 点贡献步骤（invoke skill + produce artifacts，**不阻塞**）
- `contributions` — 向 agent 注入 prompt 片段（如 planner 注入 TDD 启发式）
- `gates` — 阻塞性谓词（blocking:true, onError:halt）

**三条规则集（引自 CONTEXT.md）：**
1. `off-means-off` — 禁用的 capability 产出基线结果"by construction, not by authoring discipline"
2. `step-additive-gate-blocks` — step 是纯增量（不 halt）；阻塞前置条件是 gate
3. `cutover-self-gating` — 检测/模式逻辑移入 skill 自身（self-gating）；loop hook 故意粗粒度

### 在目标技能中的落地（装了 gsd-core 则用其运行时）
- **若装了 gsd-core**：capability 系统由 `gsd-tools` 运行时加载 `capabilities/*/capability.json` 并在 loop 点执行 gates。目标技能的 check 段调用 `gsd-tools loop render-hooks <point>` 验证 gate 状态
- **若未装**：目标技能可生成 `.swarm-yuan/capabilities/<feature>.json`（轻量自描述），precheck.sh `--review` 读取并验证 gate 谓词（降级模式，无运行时引擎）

## Context-Monitor Hook（agent 感知剩余上下文）

引自 `hooks/gsd-context-monitor.js`：
- PostToolUse hook 读取上下文指标，注入警告：剩余 ≤35% WARNING，≤25% CRITICAL（"agent 应立即停止并保存状态"）
- 让 **agent 自身**感知上下文极限

### 在目标技能中的落地
- workflow.md 的"流程控制"要素增加：上下文剩余 ≤25% 时强制保存状态到 state-machine.sh + progress ledger，暂停执行
- subagent-orchestration.md 增加：orchestrator 监控自身上下文，及时派发 subagent 卸载

## 5 层架构（Command/Skill/Workflow/Agent/Capability）

gsd-core 的分层（引自 `docs/ARCHITECTURE.md`）：
1. **Commands** — 用户入口，thin dispatch wrapper（`@workflow` include + "Execute end-to-end"）
2. **Skills** — Claude Code skills（namespace meta-skills 路由以省 token）
3. **Workflows** — 编排逻辑（`@`-include 被 command/skill 引用）
4. **Agents** — fresh-context subagent 定义（带 `<role>` `<adversarial_stance>` `<required_reading>`）
5. **Capabilities** — 声明式插件（steps/fragments/gates）

### 在目标技能中的落地
- 目标技能的 SKILL.md 是 command 层（用户入口）；references/ 是 workflow 层（编排逻辑）；subagent-orchestration.md 是 agent 层；可选 capabilities/ 是 capability 层

## Testing Standards（6 契约）

引自 `TESTING-STANDARDS.md`：
1. 练习真实代码，非源码文本（禁 `readFileSync`+`.includes`）
2. 无空真断言（LHS 须 SUT 计算）
3. 无 pass-always 测试（特性缺失须失败）
4. 测试声称路径（别 mock 整个 SUT）
5. 完整 mock（只 mock 依赖 I/O，非 SUT 业务逻辑）
6. 负空间反测（12 例 QA 矩阵）

### 在目标技能中的落地
- reference-manual.md 的测试案例段引用这 6 契约作为测试质量标准
- precheck.sh `--test` 可增加：检测 pass-always/空真断言模式

## gsd-core v1.6 全量能力（swarm-yuan 须知道但可选引用）

> 以下能力来自 gsd-core v1.6.1 源码调研。swarm-yuan **不要求全部使用**，但生成目标技能时须知道这些能力存在。

### 核心 Slash 命令（按阶段分组）

| 阶段 | 命令 | 用途 | swarm-yuan 落点 |
|------|------|------|----------------|
| 初始化 | `/gsd-new-project` | 深度上下文采集→PROJECT/REQUIREMENTS/ROADMAP/STATE.md | 生成流程 Step 2 特征卡可引用 |
| 规划 | `/gsd-spec-phase N` | Socratic WHAT-spec + 8 类边界覆盖探针 + 禁止完整性探针 | spec §4 Spec Delta 可引用 |
| 讨论 | `/gsd-discuss-phase N` | 自适应提问→CONTEXT.md + DISCUSSION-LOG.md | 4-Phase SOP Phase 1 可引用 |
| 计划 | `/gsd-plan-phase N` | researcher→planner→plan-checker 三 subagent + slopcheck 包合法性 | 4-Phase SOP Phase 3 可引用 |
| 执行 | `/gsd-execute-phase N` | wave 并行 + worktree 隔离 + checkpoint 心跳 | workflow 节点⑤可引用 |
| 验证 | `/gsd-verify-work N` | goal-backward UAT + 覆盖感知路由（auto-pass if human_judgment:false + all pass） | check 段对抗验证可引用 |
| 发布 | `/gsd-ship N` | 自动生成 PR body | workflow 节点⑧可引用 |
| 审查 | `/gsd-code-review N` | quick/standard/deep 三档 | `--review` 可引用 |
| 安全 | `/gsd-secure-phase N` | OWASP/ASVS 安全审查 | `--security` 可引用 |

### 关键能力（swarm-yuan 可能没用到）

| 能力 | 描述 | 价值 |
|------|------|------|
| **Package Legitimacy Gate** | `slopcheck` 审查 researcher 推荐的 npm 包（`[SLOP]`/`[SUS]`/`[OK]`/`[ASSUMED]`） | 防供应链投毒 |
| **Cross-AI plan-review convergence** | plan→review→replan→re-review 跨 AI 循环（最多 3 轮） | 多 AI 交叉验证计划 |
| **Plan drift guard** | `source_grounding` + `source_grounding_authority`(grep/intel/treesitter/lsp/scip) | 防计划中幻觉符号名 |
| **Coverage-aware UAT routing** | SUMMARY `coverage:` 块自动路由（auto-pass if 测试全通过 + 无人工判断） | 减少不必要的人工验证 |
| **Spec edge-coverage probe** | 8 类边界探针（boundary/adjacency/empty/encoding/ordering/precision/idempotency/concurrency） | spec 完整性保障 |
| **Spec prohibition-completeness** | must-NOT 约束探针 | 防遗漏禁止性规则 |
| **Capability 系统** | 32 个一等能力 + 第三方 overlay 安装 + consent store + host-based registry allowlist | 可扩展不 fork |
| **Runtime-aware model profiles** | `model_profile_overrides.<runtime>.<tier>` + `model_policy` 预设 + 动态路由 + 失败降级 | 多模型混用 |
| **Worktree 并行执行** | `use_worktrees` + `[checkpoint]` 心跳 + stall detection | 并行隔离 |
| **MemPalace** | 时序 KG 记忆层（recall-on-discuss/plan, artifact capture, cross-project tunnels） | 跨项目记忆 |
| **Graphify 集成** | `graphify.enabled` → `.planning/graphs/` 知识图 + commit 后自动重建 | 代码图谱 |
| **Intel 系统** | `intel.enabled` → 可查询代码库情报索引 + `api-map.json` + `API-SURFACE.md` | API 影响 |
| **MVP vertical-slice mode** | `--mvp` → UI→API→DB 特性切片 + Walking Skeleton | MVP 快速交付 |
| **TDD mode** | `tdd_mode` → planner 标记 `type: tdd` + executor 强制 RED/GREEN/REFACTOR | 测试先行 |
| **Nyquist validation** | `nyquist_validation` → 测试覆盖映射 | 覆盖率分析 |
| **`/gsd-forensics`** | 事后调查 + `/gsd-extract-learnings` 跨阶段模式提取 | 复盘改进 |
| **`/gsd-spike` + `/gsd-sketch`** | 探索性实验 + `--wrap-up` 打包为可复用 skill | 探索+知识沉淀 |
| **Multi-repo workspaces** | `/gsd-workspace --new --repos` + worktree/clone + 独立 `.planning/` | 多仓库协调 |

### Gate 类型（8 个 + 安全门禁）

| Gate | 触发点 |
|------|--------|
| `confirm_project` | 项目初始化后确认 |
| `confirm_phases` | 阶段拆分后确认 |
| `confirm_roadmap` | 路线图确认 |
| `confirm_breakdown` | 任务分解确认 |
| `confirm_plan` | 计划确认 |
| `execute_next_plan` | 执行下一个 plan 确认 |
| `issues_review` | 问题审查 |
| `confirm_transition` | 阶段转换确认 |
| `safety.always_confirm_destructive` | 破坏性操作确认 |
| `safety.always_confirm_external_services` | 外部服务调用确认 |

### `gsd-tools` CLI（20 个模块）

关键模块：`state`(load/json/update/get/patch/advance-plan/record-metric) / `phase`(next-decimal/add/insert/remove/complete/uat-passed) / `roadmap`(get-phase/analyze/validate/upgrade) / `verify`(summary/plan-structure/phase-completeness/references/commits/artifacts/key-links) / `validate`(consistency/health/context) / `scaffold`(context/uat/verification/phase-dir) / `init`(execute-phase/plan-phase/new-project/new-milestone/quick/resume/verify-work) / `capability`(install/update/remove/list/outdated/disable/enable/state/set) / `graphify`(build/query/status/diff/snapshot) / `intel`(api-surface)

## gsd-core v1.12.0 要点

> 一个破坏性变更：`<fails_when>` 强制。

- **`.planning/state.json` 机器可读状态契约**（#3227）：step 边界发布 versioned contract，best-effort 写永不失败 + `planning inspect` 只读快照——状态本身可机器消费（v1.11 的 guard 可观测性扩展到状态本身）。
- **`<fails_when>` 强制**（#3172）：验收命令必须声明可观察失败信号——"无法表达失败模式的命令不是验收测试"；与 openspec v1.10 完成判据合并为两要素=命令+失败信号。
- **证据纪律**：元数据缺失不得推出 [VERIFIED]（#2951，与本仓 missing_evidence 再印证）；多评审并行+共识门，孤立 HIGH 按证据加权（#2398/#3034）。
- 供应链：runtime-identity 断言防同名工具（#3146/#3841）+ versioned exit contract + `state validate --strict` 可门禁。

## gsd-core v1.13.0 要点

> minor 级、无破坏性变更。

- **证据纪律三连**：复核阻塞须确定性证据（#4085）+ **no-op 报真实条件与已算值**（#4157，"缺失证据不显示为零"同类）+ **不可读目录不得报为空**（#4163）——复核/上报/枚举三面全钉确定性。
- **Review Dispositions Ledger 契约化**（#4345）：评审处置清单——与 gate-audit.jsonl 同构印证。
- context-drift 前置门（#4147）与 fingerprint --diff 一致。尚未落地：dispatch.maxConcurrency 容量轴（#4162）/ quick-batch 可恢复 manifest / bracket-tolerant id（#2867）。

## gsd-core v1.14.0 要点

> 实质 minor（178 commits / 604 文件）。

- **路径遏制单点化**（#4653/#4636）："containment ONE decision, resolved two ways"——全部遏制实现删除或路由经唯一 canonical predicate，存活包装器不得自行判定"是否受遏制"；**symlink 逃逸补洞**（lexical 检查可被符号链接绕过，failing-first 覆盖先行）——路径语义须在规范化空间比对（单一事实源原则在安全边界的精化；与 claude-code v2.1.268 deny/ask 真实路径绕过修复同类）。
- **自建 lint + 违规清零**（#4654）：ESLint 规则 `no-unconfined-path-join`（426 行）+ allowlist + 全仓 drain to zero——架构不变量由机器门禁执法；守门测试钉行为，lint 钉写法，双手段互补。
- **already_present 诚实报告**（#4558）：restore 计划对与备份字节相同的目的地报 `already_present`，不报缺失 `eligible`——「no-op 报真实条件」（v1.13.0 #4157）在计划侧的延续。
- **dispatch-identity 单一所有者**（#4594）：隔离守卫的 run-scoped sentinel 由发射格式与回读解析器同一所有者判定，不从模型散文 regex 刨——**模型生成文本不是协议面**，判定依据须来自结构化字段。
- **install-time 校验全注册表**（#3929）：安装时校验取 merged registry（第一方+已装+候选），非空 `requires` 在该注册表内可满足——同一校验在不同时点必须同口径（「预览=执行口径」同类样本）。
- 相关要点：分支真新验真（#4055，幂等创建同类）/ 命名超时常量五批迁移（超时界限收敛为具名常量）/ WINDOWS.md 清单跨进程串行化（#3780，共享可变状态写串行化）。

## gsd-core v1.16.0 要点

> 实质 minor（161 commits）。

- **检查动词全部收编为 gate 模块**（ADR-5057/#5219）：gate 模块之外不得存在检查动词——router 只从 gate 模块 import 动词，游离检查要么删除要么进 gate 模块。「门禁单点化」从遏制谓词（v1.14.0）延伸到全部检查面：守门判断只有一个事实源。
- **计划工件写入 seam 单点化**（#5217）：planning-artifact 的每次变更都经其 seam 路由（拒收 fenced planned edits、跨引用写入按 seam 拆分），自建 lint 覆盖全部写入形态——写通道收编与路径遏制同构（单一写通道 + 机器门禁钉写法）。
- **陈旧计划拒绝先于回滚备份**（#5217）：记录 rollback backup 前先拒绝 stale plan file——备份动作不得固化陈旧态（先验真再落账，「no-op 报真实条件」同类）。
- **注册可证明**（#5215）：hook 注册以「注册后真的激活」为证（activation census + 对外通告命令从注册面生成）——「装了」≠「生效」，注册面与运行面同口径（install-time 校验全注册表同类：同一校验不同时点同口径）。
- **drift 世系戳校验**（#5219）：mapped-commit stamp 进校验面——世系证据自身须可校验（证据不可自证的清单不算证据链）。
- 相关要点：Svelte 脚本块尾注释终止与读错误上报（graphify 的「解析边界诚实化」）/ CI 超时预算历史（#5210）。

