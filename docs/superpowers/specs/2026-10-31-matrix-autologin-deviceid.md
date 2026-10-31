# 日常工作台回归批②：Matrix 凭据校验器空 deviceId 误杀根治（房间画布「未认证」第二层）

日期：2026-10-31 ｜ 轮次：日常工作台全功能回归·复验续批 ｜ 类型：fix（1 行校验）＋test（2 例）＋probe（时序/取数 3 处）

触发：批①（2026-10-31-daily-workbench-regression.md D2）合并后复验，房间画布挂载与房间头渲染恢复，但时间线面板恒「未认证」且页面零次 :8008 请求——matrix client 从未启动。深挖定谳第二层根因。

## 1. 变更

1. **custom/client/matrix-chat/stores/matrix-credentials.ts**：`getMatrixCredentials` 必填集从「accessToken/userId/deviceId/homeserver」收为「accessToken/userId/homeserver」，deviceId 缺席回落空串。根因：网关免密自动登录链（patch 382 autoLoginFromGateway 与 matrix-client bridgeCredentialsFromGateway）按设计写 `deviceId: ''`（matrix-client.ts 头注「空 deviceId 的 client 走 /sync 正常」，client opts 侧 `if (creds.deviceId)` 已做 falsy 跳过），校验器把空 deviceId 判 null 致 `authenticated=false` → 房间画布恒「未认证」。协议上 deviceId 本为可选字段，实现与既有设计注释脱节。
2. **探针三处**（scripts/regression/daily-workbench-walkthrough.mjs）：E4 建卡上板断言固定 2.6s 改 1.5s×6 轮询（刷新管线实测 ~4.5s：createTask→refreshAllBoards→聚合→WS→DOM）；H2 关键词派生排除归档任务（搜索默认排除归档，首轮取到归档卡标题「[C2-…」命中 0 属正确行为）；G5 房间页装载窗 5.2s→8s（matrix client 首次 sync）。

## 2. 决策记录

1. **修校验器而非写者**：写空 deviceId 是网关链的既定设计（gateway dotenv 无该字段，两处写者注释明确），client 消费侧已容忍空值；唯一断点是校验器把协议可选字段当必填。改校验器＝实现归位设计注释，改动面 1 行；改写者（B 类补丁流）需为协议可选字段造数，反而不真。
2. **守门 2 例**：空 deviceId 形态返回完整凭据对象；三键缺席各态仍判 null（防走向「无凭据也放行」的反向极端）。

## 3. 验证

- vitest：`npx vitest run custom/client/matrix-chat/__tests__/matrix-credentials.test.ts custom/client/matrix-chat/__tests__/gateway-credentials-bridge.test.ts custom/client/matrix-chat/__tests__/room-canvas-watcher-sources.test.ts`。
- 活体复验（合并后主树，vite 磁盘直生效）：房间页时间线非零 + 出现输入框 + :8008 /sync 请求可见；重跑 daily-workbench-walkthrough 全绿。

## 4. 设计文档影响

DESIGN_SYNC: none。理由：恢复既有设计注释（matrix-client.ts 头注「空 deviceId 的 client 走 /sync 正常」）所声明的行为，不新增契约；deviceId 协议可选性为 Matrix 客户端规范事实。附录 A.1 随批登记（标题计数 408→409）。
