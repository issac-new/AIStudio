# 三区回归未做项收口——API 卫生、写权限、棘轮与深度验证（2026-10-31）

## 变更

承接同日《驾驶舱三区全量回归报告》4.3/4.4 的未做项，逐项收口：

1. **kanban PATCH 状态机 409 补齐（B 类补丁 714）**：`patchTask` 的 409 分类从 713 的 `cannot X for / is not in` 扩到 `cannot be set manually`、`entered by a worker claim`、`BLOCKED_BY_POLICY`。此前 `PATCH status=running` 仍回 500，现回 409 `state_transition_rejected`；守门测试 `custom/__tests__/kanban-patch-409-guard.test.ts` 同步加断言。
2. **kanban WebSocket upgrade 异常守卫（B 类补丁 715）**：`kanban-events.ts` 的 `onUpgrade` 整体包 try/catch；鉴权/DB 异常不再留 unhandled rejection 让浏览器只看到「Connection closed before receiving a handshake」，显式回 503 并销毁，客户端可按 5xx 退避重连。400/401/403 正常分支不变；新增 `custom/__tests__/kanban-ws-upgrade-guard.test.ts` 锁源码。
3. **kanban 写路径 profile 权限收口（B 类补丁 716）**：`authorizeTaskIds` 的可见性放行从 `admin || super_admin` 收窄为仅 `super_admin`；admin 保留全局读详情能力（既有 overlay 口径），但写隐藏 profile 的卡回 404。上游测试 `prevents profile-scoped users from mutating hidden tasks` 由红转绿（19/19）。
4. **架构棘轮 2 红清零（A 类）**：`approval-inbox/pending-controller.ts`、`approval-inbox/human-gate.ts`、`eval/controller.ts` 的 5 处手写 `ctx.body={ok:false,...}` 改用 `lib/http.ts` 的 `fail()`；`ctx.body=` 与 `ok:false` 均降到阈值以下（ratchet 7/7 绿）。
5. **启动阻断修复（A 类）**：`harness/workbench/loop.ts` 的 `rawGain` 在 TS 收窄下可能为 null（`attributeGain` 早退条件只查 baseline/candidate/equalBudget），补 `rawGain == null` 早退；修复 main 后端 `ts-node` 启动失败。
6. **推演写回路补测（测试资产）**：`sim-center-walkthrough.mjs` 设置页改为当前值幂等保存（验证 PUT 与回传、不改配置）；业务地图新增节点标注保存→删除（mapnotes LWW 可逆写）。
7. **历史完整运行回放（测试资产）**：新增 `sim-run-replay.mjs`，用 `SIM_REPLAY_RUN=20261028-v8-run23` 验证真实 26 步执行链呈现（26/26、七幕、6/6 质量门、证据库报告入口），不新起 run、无模型消耗。

## 决策记录

1. **棘轮只许下降，不改阈值**：5 处失败体改用 `fail()` 是最小且符合 K19 单一出口的收法；调高 1193/874 会把新债合法化，拒绝。
2. **admin 写权限收窄而非放宽测试**：profile 绑定 admin 可完成/派发其他 profile 的卡是越权；读详情放行是既有产品口径，写路径仍按 profile 隔离。super_admin 保留全局管理能力。
3. **running 走 409 而不是 400**：语义是「请求与资源当前状态冲突」（worker claim 才能进 running），与 713 的 `state_transition_rejected` 同族，客户端按 code 分支。
4. **WS upgrade 失败回 503**：异常属服务端暂不可用（DB/鉴权查询），503 + 退避重连比静默断链可诊断；不放宽任何鉴权分支。
5. **推演设置保存用当前值幂等写**：既能验证 PUT 写路径与回传，又不改变任何配置；地图标注保存后立即删除，避免残留。
6. **26 步链路用真实历史 run 回放，不新起 harness run**：新起 26 步运行是数小时、产生模型消耗与不可逆运行态；历史 run 的 run-state/证据库是同一数据面，足以验证执行链呈现。真实模型对话与 Agent 工具回合另用两次短 CLI 冒烟（只回复 OK / pwd）。
7. **网关 liveness 不落代码补丁**：崩溃栈指向高负载下 SQLite 读连接竞争触发 30s 存活探针超时；回归停止后 90 分钟未复现。改 hermes-agent 运行时属平台级变更，需单独立项与容量/索引评估，本轮只记录诊断。
8. **外部 Matrix 联邦/通话与 petdex 外部资产不验收**：单 homeserver 无联邦对端、无 WebRTC 通话终端、外网资产不可控；本地媒体上传/下载已单独验证（200/200）。

## 验证

- 目标测试：`architecture-ratchet` 7/7、409 守门 1/1、WS 守卫 1/1、admin 写权限守卫 1/1；厂商 `kanban-controller.test.ts` 19/19（此前 18/19）。
- 全量 `npm test`：**7047 通过 / 0 失败 / 11 跳过**（973 文件过，6 跳过），此前 2 例棘轮红清零。
- 活体验证：`PATCH status=running` → 409 `state_transition_rejected`；WS 合法 token 连接 open、坏 token 401；历史 run23 → 26/26 步、七幕、6/6 门、证据库报告入口；设置幂等保存回执；地图标注保存/删除；`hermes -z` 模型回合输出 OK；Agent 工具回合执行 `pwd` 返回仓库路径；Matrix 媒体上传/下载均 200。
- 后端启动：`npm run serve` 在 main 树通过（rawGain null 守卫后）。

## 设计文档影响

DESIGN_SYNC: none——本批为 kanban API/WS/写权限补丁、custom 棘轮清理与回归资产；整合正本/数字总账无对应章节。网关 liveness 为平台观察项，未改运行时。
