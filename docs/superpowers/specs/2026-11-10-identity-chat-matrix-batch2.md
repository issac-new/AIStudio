# 统一身份聊天批2：Matrix 远程身份并入画布＋element-web 内容级验收（2026-11-10）

## 变更

完成 2026-10-23 五轮统一身份聊天裁定的预留批2，与 element-web 内嵌面板的内容级验收（两项挂账清偿）。

**批2 实现——Matrix 远程身份进入统一身份聊天画布：**

1. **身份数据面**：`GET /api/ia2/identities`（`custom/server/controllers/ia2/identity-chat.ts`）在网关 profile（kind:'gateway'）之后追加 roster 绑定的 matrix 身份（kind:'matrix'）——数据源=治理仓 roster 注册表（`readRegistry('roster')` 解析表行的账号列与 AI 助理账号列），排除本机账号自身（按解析出的 matrix 账号 userId 去重）。roster 不可读/为空时 fail-soft 只回网关身份（现行为不变）。
2. **DM 对话面**：`/api/ia2/identity-chat/:id/chat` 与 `/messages` 增加 matrix 分支（id 判定＝`@` 开头且含 `:`）：
   - 账号解析=`readGatewayMatrixEnv()`（orchestrator .env 三元组）→ `loadMatrixSession()`（matrix-session.json）回落，两路全缺→409「Matrix 通道未配置」（fail-closed，不猜）。
   - DM 房解析：`m.direct` account_data 已有映射用房；缺则 `createRoom{is_direct:true, invite:[对端], preset:trusted_private_chat}`＋回写 account_data。
   - 发送复用 `raci-matrix.ts` 的 `matrixSendMessage`（m.text 事务号直发）；响应沿用 ChatTurnResult 形状（queued:true＋note 说明回复经 DM 异步到达，与网关 peer dm 超时语义同型）。
   - 消息读取：`/rooms/{id}/messages?dir=b&limit=50` 逆序映射为 IdentityMessage（自己发→role:'user'，对端→role:'assistant'）。
3. **客户端**：`identity-chat.ts` IdentityInfo.kind 扩为 `'gateway'|'matrix'`；画布行追加 kind 徽章（matrix 行复用 `user-kind.ts` 的 `isAiUserId` 判 AI/人类双徽章）；发送路径不变（id 已 encodeURIComponent）。

**element-web 内容级验收（挂账清偿）：** 带 matrix 会话的隔离环境实测 `/matrix` 内嵌面板——自动登录（gateway-credentials 桥）→房间列表渲染→进房消息可见，替代 route-manifest 中 matrix.client/clientRoom 两页的 allowBlank 专项轮定性；验收证据落本 spec 验证节。

## 决策记录

- 身份源取 roster 而非 m.direct 历史/目录检索（Mechanical）：roster 是产品建号正本（provision 写入、git 可回溯），确定性离线可解析；DM 历史派生身份列演进项（未做不猜）。
- matrix 分支的 id 判定用形态而非 query 参数（`@…:…`）——客户端 sendToIdentity/fetchIdentityMessages 签名零改动，画布无分支逻辑；网关 profile 名不含 `@`/`:` 无歧义。
- DM 回复不阻塞（queued:true）：对端是真人/远端集群，无同步回复语义；画布轮询 messages 拉对端发言，与网关身份的 Bot Chat 轮询同 UX。
- element-web 验收只在隔离环境实弹（本机 synapse 127.0.0.1:8008），产物/证据不入库。

## 验证（实测实录，2026-11-10/11 夜）

- 单测：`identity-chat.test.ts` **14/14**（既有网关 8 用例不动＋批2 新 6：roster 混排含排自身/缺席 fail-soft/chat 建房回写映射送出/messages role 映射/通道缺席 409/形态判定）。vi.mock 四依赖（roster/session/env/send），默认空 fixture 保既有用例零扰动。
- 批2 活体（隔离 worktree＋本机 synapse 127.0.0.1:8008＋shared-secret 新建活跃对端 @walkb2:matrix.test）：
  - identities 实测：roster 四身份全入列（`@walkb2/@walkb2-agent/@d20-invitee/@d20-invitee-agent:matrix.test`）；
  - DM 实弹全闭环：画布端点发 `[批2验收]…`（建房 `!mqepeccHWfPZKGvkxL`）→ walkb2 sync 收邀请→join→回复「收到！批2 对端回复实弹 ✓」→ messages 回读 `user/assistant` 双行正确；
  - 画布 UI（浏览器）：选择器列 matrix 身份＋徽章 `M·人/M·AI`（testid icc-matrix-badge-*）＋选中后历史完整回读＋`icc-input` 直发成功；
  - 凭据链实测：orchestrator .env 缺 ACCESS_TOKEN → 自动回落 matrix-session.json（设计与实现一致）。
- element-web 内容级验收（挂账清偿）：`/matrix` 自动登录（gateway-credentials 桥）→房间列表渲染含 walkb2 DM 房→回复消息正文可见（截图 /tmp/batch2-matrix.png，仓外留证）——替代 route-manifest 对 matrix.client/clientRoom 的 allowBlank 专项轮定性。
- 环境态噪音如实记：走查 console 仅 sim topology 503（OBS_SIM_ROOT 缺席既有 fail-closed，与本批无关）。

## 设计文档影响

DESIGN_SYNC: none——批2 是 IdentityChatCanvas 头注预留项的兑现，不改变 v14 统一聊天正本（docs/comm-collab-v14-unified-chat.md）的架构裁决；element-web 验收属测试面清偿。画布头注随批更新（移除「批2 预留」表述）。
