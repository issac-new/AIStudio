# Matrix 部署地址单一事实源（server-info）+ 上游写死链接补丁整治

> 日期：2026-10-20。分支：`feat/matrix-server-link-unify`（worktree `.claude/worktrees/matrix-link`）。
> 本文是本批变更正本。背景：驾驶舱整治任务由两会话分工——兄弟会话 `zcode-eval-autonomy`
> 负责客户端拆分/噪声/布局（其正本=《2026-10-20-cockpit-split-and-hygiene.md》），
> 本会话负责 matrix 服务端与 patch 层（本文）+ 增量对账（《2026-10-20-cockpit-audit-reconciliation.md》）。

## 一、问题

产品内 matrix 地址口径散落十处且多处错误（2026-10-20 独立审计锚点）：

1. 注入树 `packages/server/src/bootstrap/http.ts:559`：element-web `config.json` 默认
   `https://matrix.org`（本部署 homeserver 是 `http://127.0.0.1:8008`，server_name=
   `matrix.test`）；且该动态分支被同中间件静态分支 `startsWith('/element-web/')` 完全
   遮蔽不可达——实际命中的是静态文件或 index.html（patch 008 引入的结构缺陷）。
2. 注入树 `packages/server/src/modules/studio/controllers/auth.ts` 六处写死
   `http://localhost:8008`（:803、:875 两处 TODO 注释硬编码；:945、:988、:1026、:1058
   四处 `matrix_homeserver_url` 回落值）——LAN 部署建号/改资料/删号/重置密码全打本机。
3. 注入树 `packages/client/src/views/LoginView.vue:15`：登录页 homeserver 默认值写死
   `http://localhost:8008`——LAN 用户打开登录页即拿到错误地址。
4. `custom/server/matrix/gateway-env.ts:112-177`：RACI/模拟回落用 `:localhost` 域，
   与生产 `matrix.test` 不一致（见决策 D3，本批不改默认值）。

客户端分享对话框 matrix.to 外链等四处已由兄弟会话 5d815c06 修复，不在本批。

## 二、方案

单一事实源收口：所有需要 homeserver/域名/element-web 入口的位置统一从新模块取。

1. **新模块 `custom/server/matrix/server-info.ts`**：`getMatrixServerInfo()` 返回
   `{ homeserverUrl, serverName, elementWebUrl }`。解析顺序=显式 env
   （`MATRIX_HOMESERVER_URL`/`MATRIX_SERVER_NAME`/`ELEMENT_WEB_URL`）→ gateway dotenv
   （`MATRIX_HOMESERVER` + `MATRIX_USER_ID` 域段，复用 `readGatewayMatrixFile`）→
   本部署兜底（`http://127.0.0.1:8008` + `matrix.test` + `/element-web/`）。
2. **新端点 `GET /api/matrix/server-info`**（挂在既有 matrix router，custom 侧直改）：
   只暴露非敏感部署地址（homeserver 本就显示在登录表单里），不涉凭据。
3. **补丁 667**（http.ts）：config.json 动态分支前移到静态分支之前（修遮蔽），
   homeserver 改取 server-info；`?hs=` 显式覆盖保留（运维调试），覆盖时 server_name
   仍按 URL hostname 推导（维持旧行为），默认路径用 server-info 的 serverName。
4. **补丁 668**（auth.ts）：六处写死值改 `getMatrixServerInfo().homeserverUrl`；
   后四处保留 `hermesUser.matrix_homeserver_url` 优先（用户级覆盖语义不变）。
5. **补丁 669**（LoginView.vue）：onMounted 无 localStorage 记忆时用 server-info 预填；
   记忆优先逻辑不变。
6. **客户端 helper `custom/client/ia2/matrix-server-info.ts`**（新文件，无冲突面）：
   `fetchMatrixServerInfo()` 带缓存 + 兜底。供兄弟会话改造 AccountAdminView/OrgEditor
   表单默认值时引用（提请见对账文档）；本批不碰任何 custom 客户端既有 `.vue`。

## 三、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 两会话分工：本批只做服务端/patch 层，custom 客户端既有 `.vue` 一律不碰 | 用户 2026-10-20 裁定「分工接力：我做服务端+验收」；兄弟会话正在改 IaSideNav/AccountAdminView 同族文件，零文件重叠是硬边界 |
| D2 | 推演/日常拆分形态以兄弟会话为准，本批不涉及 IA | 用户 2026-10-20 裁定「以兄弟形态为准」（侧栏按路由模式切换、六阶段归日常、进度看板驱动） |
| D3 | gateway-env 的 `:localhost` 模拟回落默认值不改，只经 server-info 提供显式 env 覆盖通道 | sim/推演环境 localhost 是正确值（docker-compose matrix-sim:8008 server_name=localhost）；改默认值会害推演，根治=可配置而非改兜底 |
| D4 | `/api/matrix/server-info` 不设 gateway-credentials 的回环四闸 | 端点只暴露非敏感地址（登录页公开可见）；登录页在鉴权前、LAN 部署合法需要它 |
| D5 | element-web config.json 分支前移（修 008 遮蔽）且响应结构不变 | 旧动态分支不可达是结构缺陷；响应键位不变，element-web 客户端无感 |
| D6 | 本批不做整树 `npm run inject` 激活 | inject 会把兄弟会话在主 checkout 的未提交改动一并灌入共享 upstream 树（2026-10-19 同类事故在案）；补丁以 `git apply --check` + `/tmp` 实测验证，激活留待兄弟合 main 后的验收轮 |
| D7 | 补丁号 667-669，series 注册带注释块 | 跟随仓库补丁编号纪律（历史撞号教训在案） |

## 四、验证账（收口回填）

- [x] `git apply --check` 三补丁对当前注入树通过（667/668/669，于 upstream 仓根执行——
  在他仓子目录内执行会被解析到该仓根而静默跳过，exit 0 假绿，已入账）
- [x] 副本实测应用 + 逐字节比对：`patch -p1` 应用后与期望副本 IDENTICAL×3（2026-10-20）
- [x] `vitest run custom/server/matrix/__tests__/server-info.test.ts` 绿（8/8）
- [x] `vitest run custom/server/matrix/__tests__/` 全目录绿（89/89，12 文件）
- [x] 客户端 helper 单测绿（4/4）
- [ ] 激活后活体（验收轮回填）：`curl 8647/element-web/config.json` 的 base_url=
  `http://127.0.0.1:8008`、server_name=`matrix.test`；`GET /api/matrix/server-info` 200
- [x] 存量凭据对账收口（2026-10-20 接管轮）：`matrix-client.ts` initClient 起连前以
  server-info 单源对账 localStorage 存量 homeserver（localhost↔127.0.0.1 与尾斜杠视为
  等价，`matrix-chat/utils/server-url.ts` + 单测 4/4）；不一致 → 不起旧 client，置
  `serverMoved`，`MatrixServerMovedBanner`（挂 MatrixChatPanel + WorkbenchView 中栏）人话
  提示旧→新地址并引导重登（活体已验：伪造旧地址后横幅渲染、文案与按钮正确）
- [x] 登录页预填优先级根治（补丁 672）：原 669 实现 localStorage 旧地址优先、单源仅兜底
  ——迁移后表单永远预填失效地址（"报错链接不对"的完整根因链末端）；672 反转为单源优先，
  全链注入验证（隔离 worktree 464 补丁序列 + 672 干净应用，终态与在线文件一致）

## 五、明确不做（挂账）

1. ~~AccountAdminView/OrgEditor 表单默认值改读 server-info~~（已接单源，2026-10-20 接管轮核对：两处均经 `fetchMatrixServerInfo` 预填，客户端零写死 8008）。
2. gateway-env 模拟回落默认值与 SIMULATED_USERS 域名（D3）。
3. ~~matrix.to 分享链/二维码~~（兄弟会话 5d815c06 已修；接管轮补：分享/导出/留房/清屏四个 body 级弹窗与 RunTraceNodeDetail 已挂 `--ia-z-modal` 账本变量）。
4. ~~PlatformSettings.vue:414 placeholder~~（已清：客户端 `matrix.org`/`8008` 写死零残留）。
