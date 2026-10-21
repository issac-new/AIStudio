# 推演房间打标：mx_create_room 建 com.swarmstudio.sim 房间标（spec）

日期：2026-10-21
分支：`feat/sim-room-tag`
来源：产品侧挂账实施轮（overlay `2026-10-21-sim-visibility-and-ide-task-surface.md` 补批）；用户 2026-10-21 在方案问询中显式选择「改 simharness 打标」，授权本仓本项跨仓改动。

## 一、变更

`mux/mx-lib.sh` 的 `mx_create_room`：建房成功（rid 校验 + 补邀完成后）追加一次
`PUT rooms/<rid>/state/com.swarmstudio.sim/run`，内容 `{run, rfd, taggedAt}`（run 取
`RUN_ID`、rfd 取 `RFD_ID`，均缺省空串；taggedAt=Unix 秒）。失败仅 stderr 告警，不
阻断建房、不影响返回 rid——客户端识别另有 run-state 房间集兜底，双源互补。

## 二、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 打标走房间级 state 事件（非 account_data tag/房间名前缀） | state 事件全成员经 /sync 可见、非侵入呈现语义；tag 仅创建者可见，名字前缀污染业务命名 |
| D2 | 事件类型/键固定 `com.swarmstudio.sim` / `run` | 产品端单一事实源：状态事件 + run-state 房间集两路识别，键名进产品文档 |
| D3 | 失败仅告警不 fail | 打标是呈现增强非流程前提；建群/邀请语义与既有真值核验零变化 |
| D4 | 变更加性、不动既有行 | run22 驱动进程已加载旧函数体在内存执行，源码改动不影响在跑轮；新轮起生效 |

## 三、验证

- `bash -n mux/mx-lib.sh` 语法过。
- 本仓全量 `npx vitest run`：10 文件 / 196 用例全绿（含 harness-gate-integrity）。
- 活体打标验证挂账：待下一轮建房步实拍（产品端徽标联测随 overlay 走查轮一并做）。

## 四、不做

- 不回溯给历史房间补打标（历史轮由产品端 run-state 房间集识别）。
- 不改 mx-smoke 等旁路建房路径（冒烟房无产品呈现语义）。
