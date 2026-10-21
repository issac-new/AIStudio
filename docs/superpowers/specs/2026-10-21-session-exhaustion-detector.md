# 会话耗尽检测器 agent.session-exhaustion（2026-10-21）

## 背景

run22（20261021-v8-run22）两实录：hu 收修复令后 93 分钟三次应答回合全零工件（无工具
执行/无文件变更/无提交）、qi 收复测令后单回合应答即躺平——两案均靠值班人工识别并发
「换会话令」救活（新会话 3 分钟内恢复产出，两战两捷）。形态本质=应答行（API 调用）持续
发生而真做行（tool completed/会话第 2+ 次调用）停摆——长跑会话的执行衰竭，越催越空转。

## 落地

`custom/server/clusterinspector/detectors.ts` 新增 `detectSessionExhaustion` 并挂入
`detectAll`（首测即挂载级回归，防 active-no-artifact 首版 tree-shake 同型复发）：
profiles 面 `workTsMs` 新鲜（≤gap 阈）且 `realWorkTsMs>0`（曾真做过）且
`workTsMs-realWorkTsMs ≥ 阈`（默认 30 分钟）→ warn；≥2× 阈 → high。处置建议写进
summary：不再重复催办、直接换会话令（结束当前会话+新会话预置显式命令清单）。
配套 3 例单测（含 detectAll 挂载锚与三态静默边界）。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 判据用 realWorkTsMs>0 前置（曾真做过才报） | 新会话首回合单调用属正常，缺席不报——那是 active-no-artifact 与 task.agent-silent 的辖域，三检测器辖域不重叠。 |
| D2 | 处置建议（换会话令）写 summary 而非自动轮转 | 会话生命周期终止属判断类动作（机械可代/判断不代边界）；先可视化一个轮次校准误报率，自动轮转待实证后再议。 |
| D3 | 阈值 30/60 分钟两档、可经 exhaustionGapMs 调 | 与 active-no-artifact 的 30 分钟档对齐；高槛留给「确认性」轮转建议，避免狼来了。 |
