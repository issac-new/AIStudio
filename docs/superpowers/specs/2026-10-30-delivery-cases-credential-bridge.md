# 交付案例面板空态根治：matrix 凭据双桥（client initClient + server gateway-credentials 会话回落）

日期：2026-10-30 ｜ 类型：fix（产品缺陷）｜ 触发：run23 用户指令「现在就修交付案例前端投影缺陷」

## 变更

1. **`custom/client/matrix-chat/stores/matrix-client.ts`**——`initClient()` 凭据缺失时先桥接再报错：调 `/api/matrix/gateway-credentials`（fetch 无鉴权，服务端回环四闸在），拿到三元组即 `storeMatrixCredentials` 持久化后继续正常初始化路径（含 homeserver 对账）；拿不到保持原错误口径 `'No Matrix credentials found'`。新增模块级 `bridgeCredentialsFromGateway()`（configured 门 + 三字段齐全门 + catch 返回 null，不吞错成假凭据）。
2. **`custom/server/matrix/routes.ts`**——`gateway-credentials` 端点凭据链两级：orchestrator profile `.env`（桌面单用户形态，原语义）→ **回落 `matrix-session.json`**（patch 012 在 `/api/auth/matrix-login` 校验通过即落盘的本机最近会话；SIM 多 profile 形态下 orchestrator .env 不存在而会话文件在）。两级同信任域（端点回环四闸不变；会话文件 0600 由 session-store 保证）。
3. **`simharness/mux/r18-frames.mjs`**（采集面加固，非本缺陷必需但同族）——拍摄登录态补写 matrix 四件套（键名与 `matrix-credentials.ts` 的 MATRIX_KEYS 对齐），采集环境不再依赖产品桥接也能拍到真实面板。
4. **守门测试** `custom/client/matrix-chat/__tests__/gateway-credentials-bridge.test.ts`（3 断言：桥接顺序在报错前／桥接成功即持久化／实现含三道门）。

## 决策记录

- **根因**（两层，run23 实录）：①登录有三种形态，其中「matrix-login 换 JWT 直写 `hermes_api_key`」不写 matrix 四件套，而交付案例/会话画布等依赖 matrix-js-sdk 的面板全走 `initClient()` → 凭据缺失即恒空态；②SIM 多 profile 形态下 `gateway-credentials` 只读 orchestrator `.env`（不存在）→ 即使客户端有桥接也拿不到凭据。两层各修一层即闭环。
- **不扩展 API 契约**：复用既有 `gateway-credentials` 端点做服务端回落，不改 `/api/auth/matrix-login` 响应结构。
- **信任域不放宽**：回环四闸原样；会话回落只在 orchestrator .env 缺席时启用，不改变桌面形态行为。

## 验证

- 单测：`npx vitest run custom/client/matrix-chat/__tests__/gateway-credentials-bridge.test.ts` → 3 passed；`custom/client/matrix-teams` → 198 passed（20 文件）；`custom/server/matrix` 基线外零新增失败（6 个既有失败为 worktree 缺注入态+前批挂账，stash 对照确认）。`npm run typecheck:harness` rc=0。
- 构建：client（vite）+ server（build-server.mjs）均 rc=0；部署 SIM product-dist。
- **端到端实测（决定性）**：浏览器只写 `hermes_api_key`（复现原缺陷路径）→ 打开 `/app/stage/accept?tab=cases` → `syncState=SYNCING`、`matrix_access_token` 已被桥接写入、`cases=1`、案例卡渲染（`emptyPanel:false`）；`deliver_gate` 帧重拍，OCR 零「暂无交付案例」、含 RFD-001 案例卡与门禁灯。

## 设计文档影响

DESIGN_SYNC: none——不改端点契约与字段（gateway-credentials 响应结构原样，仅来源多一级回落）；不改协议事件类型。若后续方案 §2.5 承载面描述要注明「交付案例面板在 token 登录形态下自愈」，属文案级补充，随下次正本修订带入。
