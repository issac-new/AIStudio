# approval-proxy 幂等去重（run24 同 pending 9 次重复代批根治）

日期：2026-10-31 ｜ 类型：fix（harness 审批代理）

## 1. 变更
`simharness/mux/mx-approval-proxy.sh` python 批准段增批前去重：处理 asks 前读代批日志，event_id 前 24 字符已出现即跳过（`if ev[:24] in _done: continue`）。守门 `harness-gate-integrity.test.ts` 审批环断言组加两条符号断言（含「幂等去重」注释与去重判断式）。

## 2. 决策记录
- 根因：LAST_TS 时间游标对同窗内重复处理不充分——run24 实测单实例 32 秒内对同一 pending（$_jGKjkm9…）代批 9 次，台账 9 笔重复（已 resolve 留首笔）；xiao 真人模拟同批同请求属双通道并存设计不算重复面。event 级查重是最小根治：不动游标逻辑、不动 policy 面，只加批前守卫。
- 备选否决：改 LAST_TS 推进策略（时序假设多，改不好引入漏批）；日志查重用完整 event_id（日志行截断存 24 字符，按现存形态取前缀）。

## 3. 验证
- `bash -n` 过；vitest 受影响文件断言组过（合并前跑）。
- 行为验证：run24 下一轮值守实测（重复代批新增=0）。

## 4. 设计文档影响
DESIGN_SYNC: none——纯工具缺陷修复，无方案/模板面变更（run24 污染批 spec 已覆盖审批环语境）。
