# Eval Studio 腾讯评测体系补强设计（2026-10-13）

> 状态：已落地（feat/eval-tencent-metrics，commit e31b9b8）。
> 调研正本：specs/assets/wx-articles-2026-10-13/tencent-agent-eval.md（银翼AI评测室《腾讯 Agent 评测体系技术拆解：从 Harness 工程化到质量飞轮》，2026-10-09）。
> 前置基线：specs/2026-10-07-eval-studio-design.md（美团范式轮 M1-M4：四层报告/S0+S1 双轨/校准/密封/Oracle）。

## 主旨三句话

唯一主旨：把腾讯文章中「可机械执行」的评测方法论补进 Eval Studio，让推演报告从过程治理口径升级为「过程治理 + 运行时评测」双口径。受众：推演方案与报告的维护者、Eval Studio 二次开发者。读完促成：下一轮全量推演按方案 V8.21 的评测条款执行，报告按 test-report 模板新节出评测面。

## 1. 调研结论（文章说了什么）

文章主线一句话：Agent = Model + Harness，评测是 Harness 自身的一层，必须与 trace/replay 共享同一份执行轨迹。对本仓有直接工程价值的六点：

1. **六环节独立门禁**（§03）：意图/工具/参数/证据/状态/表达六环节分别度量，任何一环出问题单独报警，不必等到端到端失败。
2. **过程双指标**（§03）：Tool Head Accuracy（工具选择正确率，抓「碰巧答对」）与 Trajectory Match Score（编辑距离/最优路径长度，抓「绕冤枉路」）——结果分之外的第二道闸。
3. **异常场景覆盖**（§03）：测试集不能只放理想问题；模糊意图/缺参数/权限不足/工具超时/知识冲突/用户改口六类异常必须入集；样本标注「期望行为」而非「期望答案」；线上坏例转回归样本。
4. **发布门禁阈值化**（§08）：TTFT ≤1.5s、简单≤5s/复杂≤15s、P99 ≤2×均值、工具成功率 ≥99%、降级率 <0.5%、峰值 QPS×2 压测——把「上线就绪」从主观判断转成机械 gate。
5. **六维度量分面**（§09，信通院《云上 Agent 基准度量模型》）：功能性/安全性/可靠性/用户体验/性能效率/成本效益。
6. **A/B 对比是刚需**（§10 启示⑩）：模型/Prompt/版本切换必须内建对比；评测集从线上坏例持续回流。

## 2. 差距对照（文章 × M1 现状）

M1 已覆盖：S0+S1 断言双轨（机械优先语义兜底=启示⑥）、期望行为字段（=启示④）、Rubric Loop 改题留痕、校准（ECE/Brier）、密封防探测、回放判分与 trace 共轨（=启示①）。本轮补七面（M1 缺口全部带锚点见勘察记录）：

| # | 文章节 | M1 缺口 | 本轮落地 |
| --- | --- | --- | --- |
| 1 | §03 六环节 | 断言无环节归属，无分段报告 | 断言可选 `link`，聚合 `byLink` 分段通过率 |
| 2 | §03 双指标 | 无工具序列比对（trajectory 只是断言通过率） | 任务 `expectedToolCalls`，`processMetrics`（LCS 正确率+编辑距离绕路比） |
| 3 | §03 异常覆盖 | 用例无异常类目 | 任务 `exceptionType` 六类枚举，聚合 `byException` 分桶 |
| 4 | §08 门禁 | 无数值阈值闸（只有定性三条） | `releaseGate`：可测项机械执行，缺口项如实 no_data |
| 5 | §09 六维 | 四层≠六维，缺分面报告 | `sixDimensions`：能读数的给读数，未采集 null 立账不造数 |
| 6 | §03 坏例回流 | 失败 attempt 无转样本通路 | `POST /runs/:id/reflow` → 回归样本库（幂等、带溯源、密封拒绝） |
| 7 | §10 A/B | EvalRunTarget 只是标签 | `GET /runs/compare`：同集两 run 翻转表 + 读数 delta（密封拒绝） |

## 3. 设计决定与理由

- **双指标算法**：正确率 = LCS(期望,实际)/|期望|（截顶 1）——冗余调用不扣选择正确率（归绕路指标管）；绕路比 = 编辑距离/|期望|（文章原口径，0=零绕路）。比对对象是工具名序列，从 trace tool_span 按出现序折叠（`runner.ts evidenceFromTraceLines`），不新增采集面。
- **诚实缺席三条**：任务未声明期望序列 → 该 attempt 不参与双指标（未测≠零分）；六维中可靠/UX 未采集 → value=null 立账；门禁中 TTFT/响应分档/QPS 压测 → no_data + 缺口说明。缺口清单本身就是评测覆盖度的产品面，不硬凑代理值。
- **降级率口径**：判定端离线走 fail-open 纯 S0 = 一次降级事件（run 内 `judgeMeta.online===false` 的 attempt 占比）。这是本域真实存在的降级路径；文章的线上降级率需 live 打点，后续轮接。
- **门禁阈值 env 可调**：`EVAL_GATE_TOOL_SUCCESS_MIN`(0.99) / `EVAL_GATE_P99_RATIO_MAX`(2) / `EVAL_GATE_DEGRADE_RATE_MAX`(0.005) / `EVAL_GATE_TTFT_MS`(1500)，默认照抄文章。
- **回流落点单一事实源**：缺省集名「回归样本库」（`REGRESSION_SET_NAME`），不存在则按源集轨道建；任务 id `re-<run尾6>-<taskId>` 幂等；密封源集结构性拒绝（题目内容不出库）。
- **A/B 限定同集**：跨集逐题对比无意义（题不同）；密封集拒绝（逐题对错是探测通道）。

## 4. 实现映射

服务端 `custom/server/eval/`：types.ts（新字段五枚）｜metrics.ts（新增：比对原语/分段/分桶/双指标/六维/p99）｜releaseGate.ts（新增：阈值评估）｜aggregate.ts（compareRuns + 新聚合接线）｜runner.ts（tool_span → toolCalls）｜store.ts（校验+reflowTaskToSet）｜controller.ts（compare/reflow 路由，compare 字面路由先于 /runs/:id 注册）。零新增 patch（eval 域仍只挂 572）。

前端 `custom/client/eval/`：报告面板四新块（六环节分段条/过程双指标卡/发布门禁表/六维分面条/异常分桶表）+ 失败样本回流按钮；运行表门禁徽标列；A/B 对比块（双下拉+翻转表+delta 行）；zh/en 词条齐平（键齐平测试锁定）。

测试：`__tests__/eval-metrics.test.ts`（纯函数 19 例）+ `__tests__/eval-v2.test.ts`（校验/提取/回流/对比 11 例）。验证账：eval 域 90/90 绿；全量 vitest 与干净基线逐项对账一致（18 文件/68 败为借用依赖树的既有环境态，与本轮无关，双跑实证）。

## 5. 边界（本轮不做，如实挂账）

- **Skill 三段安全治理**（文章 §09：注册扫描→执行拦截→输出审核）：现有 toolresultguard/secguidance/codesec 各管一段但无 Skill 生命周期视角，属独立产品轮，不在本次范围。
- **live 触发评测**：维持 M1 Non-goal（回放判分零 agent 增量调用）；TTFT/响应分档/QPS 压测三缺口需 live 打点或压测轮补。
- **costUsd 取数**：成本维仍缺席（evidence 无价格表），等 runtime 计费面。
- **判定端多裁判**：单后端单模型维持，多裁判轮换后置。
