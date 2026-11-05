# 四篇 RSI 论文源码级吸收（执行证迹 / INV-DOM 分层 / 组件库消费 / 债清偿）

> 日期: 2026-11-05
> 状态: 已实施
> 关联: 调研源=arXiv 2610.14224（Harness²）、2610.13025（Evo²）、2609.24972（RRSI）、2610.28380（OO-Harness）；源码仓=`google-research/harness2`、`google-research/rrsi`
> 用户裁定: 本轮四篇论文调研后确认执行 W1+W2+W3+W6 全量（含覆盖 2026-10-31「机制扩展停止」的决策）

## 结论

四篇论文对改进实验台的增量只有四点，其余机制本仓已经更强：

1. **执行证迹**（Evo² §3.3.2、Harness² compose 的 UNSAFE 判定）：本仓只校验文件写盘摘要，没有「新机制是否真的被执行」的行为证据。
2. **INV/DOM 分层**（Harness² 的核心设计）：本仓零实现，`Proposal.domain` 只是经验检索标签。
3. **组件库消费**（PluginRSI/Evo² 的 donor）：组件库晋级即入库，但全仓无消费者。
4. **两项债**：`command` 验证档不可达；工作台设计 §6 的 code 计数与实现漂移。

本仓在防过拟合侧（噪声带、密封留出、反事实变换、等预算归因、保留率、约束保持、单层消融）已覆盖 RRSI 选择侧全部机制，且提案侧退火预算/停滞/剪枝已注入起草 prompt。本批不重复造这些门。

## 变更

### W1 执行证迹门（新增可判定证据，不新增门文件）

- 新模块 `custom/server/harness/workbench/execution-trace.ts`：
  - `executionMarkersOf(variant)` 从候选树路径推导可判定标记：`skills/<name>/SKILL.md`、`skills/<name>.md`、`sub_agents/<name>.md`（含 `subagents/` 别名）。
  - 只有 `skills` 与 `sub_agents` 属可观测面；`scripts`/`plugin` 候选被 `assertTreeRunnable` 禁跑，指令面（system_prompt/guardrails/memory/tool_guidance）的「执行」就是被写进提示词，无法从轨迹证伪——两者如实记 `static`，不造假。
  - `computeExecutionTrace(markers, hits, scannedChars)` 产出 `ExecutionTrace`，`hitRatio` 在无标记时为 null。
- `probe-runner.ts`：`runProbeTasks` 接受 `markers`，在每个「题×样本」单元的原始 stream-json stdout 上做一次包含性扫描（单单元上限 4MB，总扫描上限 32MB），结果回 `markerHits`。扫描对象是原始事件流而非 `result.text`——工具调用参数只出现在事件流里。
- `service-auto-probe.ts`：主探测（非回归/非等预算/非反事实）按候选算标记并下传，结果随 `recordProbe` 写入 `ProbeMetrics.executionTrace`。
- `loop-report.ts` 新增两个 code：
  - `mechanism_not_executed`（blocker）：增益超噪声带、有可判定标记、轨迹零命中——判定造假代价高于误杀代价。
  - `mechanism_trace_missing`（warning；`HARNESS2_RSI_REQUIRE_EXECUTION=1` 升 blocker）：未采集证迹。

### W2 INV/DOM 分层与分类归因

- `Proposal.editClass: 'invariant' | 'domain' | 'mixed' | null`，`createProposal` 接受并校验；缺省 null=未声明。
- `loop-report.ts` 新增两个 code：
  - `edit_class_undeclared`（warning；`HARNESS2_EDIT_CLASS_STRICT=1` 升 blocker）
  - `edit_class_mixed`（warning；同一提案混装两类改动会破坏归因，建议拆两份；strict 下 blocker）
- `loop-advice-evolution.ts` 产出 `classAttribution`：按类聚合已采纳轮数、平均增益、平均成本变化、回归失败任务数；`seesawSuspected` 在同一面上出现「相邻两个已采纳轮分属不同类且增益符号相反」时为真。
- 面板：提案卡显示类徽标；进化报告新增分类归因行。

### W3 组件库消费（crossover donor）

- `component-library.ts` 新增 `selectDonors({ surfaceKey, domain, baseContent, limit })`：
  - 只取 `evidence.delta > 0` 的条目，按 (kind,name) 取最新版本；
  - 同面优先、跨域优先（跨域 donor 才是 Evo² 说的可迁移经验）；
  - 与基线内容逐行 Jaccard ≥0.6 的条目不提供（已在基线里，送进去只会诱导重写），记入 `skipped` 并给理由。
- `service.ts` 起草器：donor 清单（含 id 与证据）注入 prompt，要求模型返回 `donorIds`；`createProposal` 存 `donorRefs`。donor 采纳不改变晋级裁决。
- 不新增门：donor 是候选来源，不是证据；其增益仍由既有六层证据链判定。

### W6 债清偿

- `evidence.ts` 从评测运行的 attempt 明细统计 `commandChecks: { total, passed }`（任务声明了 `outcome.argv` 才算）；`loop-advice-tier.ts` 据此让 `command` 档可达。
- 守门测试 `four-paper-absorption.test.ts` 正则提取 `loop-report.ts` 的 code 并断言数量，锁死计数漂移。
- 设计文档 §6 去掉硬编码的「64 个 code」，改为「code 清单以 `loop-report.ts` 为准，数量由守门测试锁定」。
- 顺手清偿改进面板自身 5 个类型错误（`ProposalDto` 缺 `constraints`、`PromotionDto` 缺 `appliedVia`、模板里 `as SurfaceKey` 强转、`surfaceName` 入参过窄）；client 类型错误 101→96，面板文件清零。余下 96 个为 pre-existing（`matrix-room-readers.ts` 51、`IdeChatPane.vue` 11、`cockpit-filter-slice.ts` 7 等），棘轮基线 18 与实现早已脱节（主树同样 101>18），不在本批范围。

## 决策记录

| 决策 | 选择 | 备选 | 理由 | 类型 | 用户裁定 |
|------|------|------|------|------|---------|
| 执行证迹判定方向 | 零命中即拦，null 只告警 | 全告警 | 标记来自候选自身路径，轨迹里一次都没出现说明机制大概率没跑；误杀可由人工在批准环节复核 | Mechanical | approved |
| 扫描对象 | 原始 stream-json stdout | result.text | 工具调用参数只在事件流里，result.text 只有最终答复 | Mechanical | approved |
| 不可观测面 | 如实标 static，不参与判定 | 用提示词哈希冒充执行 | 指令面的「执行」就是进提示词，轨迹证不了；造假比缺证据更坏 | Mechanical | approved |
| INV/DOM 是否必填 | 缺省 warning，env 可升 blocker | 强制必填 | 既有 201 个用例与历史提案没有该字段，强制必填要把存量全部改判；warning 达到归因目的 | Mechanical | approved |
| mixed 类 | 允许但告警 | 拒收 | 模型常把流程与领域知识混在一段里；拒收会逼它编造分类，告警+拆分建议更可执行 | Mechanical | approved |
| donor 冲突处理 | 选源时过滤 | 晋级时拦截 | 已在基线里的组件送进 prompt 只会诱导重复改写，源头过滤比事后拦截便宜 | Mechanical | approved |
| command 档判据 | 任务声明 `outcome.argv` 且有 attempt 结果 | 按 verifier 名字匹配 | argv 是结构性声明，不依赖各域注册名 | Mechanical | approved |
| 设计正本修订 | 随批重绑（SPEC_REBIND=1） | 只在新 spec 记漂移 | 不修 §6 会让「单一事实源」继续漂移；用户已批准本批含文档同步 | Mechanical | approved |

## 验证

- `npx vitest run custom/server/harness/workbench`（含新增 `four-paper-absorption.test.ts`）
- `npm run typecheck:harness`
- 全量 `npm test`
- 变异探针：删掉 `mechanism_not_executed` 分支后守门用例必须变红（测试有效性自检）

## 设计文档影响

- DESIGN_SYNC: touched
- `docs/superpowers/specs/2026-10-19-harness2-improvement-workbench.md`：§4 数据模型新增 `editClass`/`donorRefs`/`executionTrace`/`commandChecks`；§6 门禁新增四个 code 并去掉硬编码计数；新增 §15 四篇论文吸收。
- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：RSI 段补记本批四项。

## 已知边界

- 转述式泄漏仍检不到（既有子串匹配的局限），本批不扩大。
- 执行证迹只覆盖 skills/sub_agents；scripts/plugin 由自动探测禁跑，指令面不可观测。
- 权重共演化（Evo² 主表收益来源）不在产品边界内；OO-Harness 的 base/specialized/router 未实现，只记录为下一轮设计候选。
