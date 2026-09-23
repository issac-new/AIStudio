---
name: quality-gate
description: 在启用 QGate 的项目里按证据优先纪律完成开发闭环：先识别需求与假设、改动后跑快速门、收口前全门通过、不把 skipped 当 pass。Use when the project has a .qgate/ directory and you are about to modify code or finish a task.
---

# QGate 开发闭环纪律

本项目使用 QGate 质量门（`.qgate/` 目录存在即生效）。三条铁律：

1. **没有证据不得 PASS**：门的通过必须来自真实执行（exercised 级证据）。工具缺失、环境不具备、执行失败 = INCONCLUSIVE，不是通过，也不是失败——先修环境或补跑。
2. **收口前全门通过**：声称任务完成前，运行全部适用门并修到全绿。Stop 钩子会拦截证据缺失的收口（最多拦 2 次，之后降级放行并登记 Risk——别走到那一步）。
3. **不绕门**：不为通过门禁改配置、删门、注释掉检查。紧急情况走 Profile 降档（vibe-fast），这是人的决策。

## 工作流

- 开始任务：`/qgate-status` 了解适用门与当前状态。
- 改动代码后：需要快速反馈时 `/qgate-run`（或直接跑项目自己的 lint/test）。
- 声明完成前：`/qgate-run` 全绿 → 结束。收到 Stop 阻断时：按阻断消息中的修复指令跑门、修失败项、重跑。
- 修改持久化/数据相关代码：`data.persistence-integrity` 门会做 DB 快照与逐字段断言——HTTP 200 与单测绿都不代表数据写对了。

## 判定语义

PASS（有充分证据）/ FAIL（证据明确反驳）/ CONDITIONAL（放行但带解除条件）/ INCONCLUSIVE（证据不可得）/ WAIVED（有有效豁免）/ NOT_APPLICABLE（门不适用）。
