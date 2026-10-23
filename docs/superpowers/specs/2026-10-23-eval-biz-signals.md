# 京东吸收轮·立项批：行为数据当评测信号 + 评测结果翻译成经营语言

- 日期：2026-10-23
- 状态：已落地（feat/eval-business-signals）
- 源文：《京东 Agent 评测体系技术拆解》实践②⑦（同轮 spec：2026-10-23-jd-eval-absorption.md 挂账项，用户裁定「根据建议完成实施」后立项）

## 落地内容

### 1. 行为信号面（实践②：行为数据当评测信号）

文章口径：「JoyCoder 用采纳率/活跃度/调用次数给模型打分——真实接受行为比离线榜单新鲜」。本仓对应物=run-trace 遥测（obssignals 域窗口合计）。

- `custom/server/eval/behavior-signals.ts`（纯函数）：`buildBehaviorSignals(totals, days)` 组装六信号行——LLM 错误率/工具失败率/429 率/缓存命中率/活跃会话数/调用总量。每行带 `basis`（口径）+`samples`（样本量）+`sufficient`（低于 MIN_SAMPLES 如实降级不供消费）+`onDrift`（信号漂移时评测侧消费建议，如「线上错误率上行而离线未红 → 跑回放判分确认退化」）。
- 端点 `GET /api/hermes/eval/behavior-signals?days=7`（fail-soft：采集不可用 available=false 如实缺席）。
- 前端：指标治理页顶部「行为信号」区块（MetricRegistryPanel），无真实使用时如实呈现「行为信号缺席，结论以离线集为准」。
- 边界纪律：不并入 METRIC_DEFS（评测域指标单一事实源），观测域信号供评测消费、两套口径互不冒充（boundary 字段声明）。

### 2. 经营语言摘要（实践⑦：评测结果翻译成经营语言）

文章口径：「评测结论直接写成 GMV/转化率，跨部门沟通零折算——业务方听得懂评测，评测才进得了决策」。本仓无 GMV 口径，对应物=决策者三句话：能不能发布、质量成本几何、修什么最值。

- `custom/server/eval/business-summary.ts`（纯函数）：`businessSummaryOf(run)` 输出结构化摘要——`verdict`（releasable/blocked/insufficient 三态）+`facts[]`（质量/成本/耗时/归因/稳定性事实行）。
- 端点 `GET /api/hermes/eval/runs/:id/business-summary`。
- 前端：报告面板顶部「经营语言摘要」卡（verdict 徽标+事实句），句子由 i18n 词条插值组装（双语免费）；经营换算（差额账）仍归虚拟损益表，本面不重复造账（boundary 声明）。

## 决策记录

1. **D1 信号只供消费不自动触发**：onDrift 是建议文案不是自动化动作——评测触发权在人（与 obsalerts 告警/评测运行的权责分界；自动化是另一立项）。
2. **D2 样本量门槛（sufficient）**：行为信号是「无感投票」，票数不足不算票——llm≥30/tool≥20/session≥3 以下如实标 insufficient，与「单跑不作门禁」同族统计纪律。
3. **D3 摘要形态=结构化事实+前端组句**：后端只出 verdict+facts[key,params]，句子 i18n 组装——避免后端维护双语句子模板，也避免「机翻味」硬编码。
4. **D4 verdict 优先级=红线>门禁 fail>统计纪律（k<2）>判定端离线**：安全优先于通过率；证据不足时宁可 insufficient 不给 releasable（fail-closed）。
5. **D5 归因行 byRole 优先、byLink 兜底**：责任主体（角色）比行为环节更接近「修什么最值」的决策语言；无角色标注回落最弱环节。
6. **D6 读数缺席不造句**：facts 里不出现的键=无数据（成本/耗时/稳定性均可缺席）——「不造数」纪律的句子级贯彻。

## 验证

- 新增 `eval-biz-signals.test.ts` 9 用例（信号降级/零使用/verdict 三态/归因优先级/缺席语义）全绿。
- eval 全域（server+client）30 文件 265 用例全绿；typecheck:harness 0 错。
- 客户端面板测试补 behaviorSignals mock（fail-soft 桩）。

## 挂账

- 行为信号→自动触发评测（如错误率超阈自动排回放判分运行）——需与调度/预算域协商，另行立项。
- 经营摘要的基线对比（vs 基准 run 的 delta 句式）——待 A/B 对比域与摘要域接线。
