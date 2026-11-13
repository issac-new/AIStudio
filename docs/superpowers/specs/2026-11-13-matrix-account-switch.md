# Matrix 账号一键切换——multiplex 档位账号与前端登录账号统一（2026-11-13）

## 变更

背景：matrix 登录链有前后端两面——前端四件套（localStorage 单槽：`matrix_access_token/user_id/device_id/homeserver_url`，消费方 matrix-js-sdk 聊天面）与后端 JWT（`POST /api/auth/matrix-login` 换发 + 服务端 `~/.hermes-web-ui/matrix-session.json` 会话，Brief 投递身份）。单槽存储下「本机登录过的账号」不留底，换账号须整链重登；gateway multiplex 档位（`~/.hermes/profiles/<profile>/.env` 的 MATRIX_* 三件套）虽各有账号但只能经 active 档被动消费。用户裁决（B-联动·轻量）：切换器把档位账号与手动登录账号统一成一个列表，点档位账号联动切档位，全程无进程重启（`switchProfile` 本就只改 `active_profile` 指针 + 清 bridge 会话，multiplex 单 gateway 不受影响）。

新增四件：

1. **前端多槽凭据仓（vault）**：`custom/client/matrix-chat/stores/matrix-credentials.ts` 扩展——`localStorage['matrix_account_vault']` 存 `{ [userId]: { accessToken, userId, deviceId, homeserverUrl, displayName, avatarUrl, source: 'manual'|'profile', savedAt } }`；`storeMatrixCredentials` 成功即自动 upsert（登录与切换两路全覆盖）；登出只清活跃单槽、**不清 vault**；新函数 `listVaultAccounts/upsertAccountVault/removeVaultAccount`。活跃凭据仍是现有四键——现有消费者零改动，vault 是旁路留底。
2. **服务端档位账号列表**：`custom/server/matrix/routes.ts` 新增 `GET /api/matrix/profile-accounts`——扫 `${HERMES_HOME}/profiles/*/.env`（跳过 `_` 开头目录），三件套（MATRIX_HOMESERVER/MATRIX_ACCESS_TOKEN/MATRIX_USER_ID）齐全才列，返回 `{ accounts: [{ profile, userId, homeserverUrl }] }` **不含 token**；复用 gateway-credentials 的回环四闸。不做在线 token 校验（失效在切换时暴露，避免列表 N×whoami 延迟）。
3. **gateway-credentials 扩 profile 参数**：`GET /api/matrix/gateway-credentials?profile=<name>` 读指定档位 `.env` 三件套（不走 matrix-session 回落——session 是「最近登录」非「该档位」）；profile 名白名单校验（`^[A-Za-z0-9][A-Za-z0-9._-]*$` 且非 `_` 开头，拒路径穿越）；无参行为不变。四闸不变。
4. **切换编排 + 切换器 UI**：`custom/client/matrix-chat/stores/account-switcher.ts` 编排——
   - `switchToProfileAccount(profile)`：① `gateway-credentials?profile=` 取三元组（404=未配置）→ ② `matrix-login` 换 JWT（401=token 失效：删 vault 项并提示重登）→ ③ `POST` 档位切换（先登录后切档：登录失败不动档位）→ ④ 写 `api_key` + 四件套 + vault upsert(source:'profile') → ⑤ `location.reload()`（所有 store 从新凭据重建）。
   - `switchToManualAccount(userId)`：vault 取凭据 → ②④⑤（不动档位）。
   - UI：matrix-chat 面板头部账号指示器（点击弹账号列表：档位源 ∪ 手动源合并、当前账号高亮、手动项可移除）。登录页一键进涉及 patch 025 扩展，挂账下批独立收口。

## 决策记录

- D1（B-联动·轻量，用户裁决）：切档位不涉 gateway 重启——`switchProfile` 是指针切换 + bridge 会话清理，multiplex 单进程服务全档位；切换器三步全是数据动作。
- D2（先登录后切档）：matrix-login 失败时档位未被触动（失败面更小）；登录成功而档位切换失败的残余不一致（matrix-session 已新而档位未切）由重试幂等修复——两侧操作均幂等。
- D3（vault 旁路不改单槽）：活跃凭据维持现有四键，全部既有消费者零改动；vault 失效项在切换 401 时直接删除（重登自动再入仓），不做 stale 标记态。
- D4（列表不含 token）：token 只在切换动作按需经 gateway-credentials?profile= 获取，与现有「按需下发三元组」同语义；列表端点仅元数据。
- D5（Brief 投递身份跟随切换，用户确认）：matrix-session.json 随 matrix-login 自动重写——切到谁，Brief 以谁投递，前后端+投递三者一动作统一。
- D6（无凭据档位不列）：50 档位仅少数配 MATRIX_*，灰项是噪音；给档位配账号属另一配置面。
- D7（reload 收口）：切换后整页 reload 而非逐 store 手工换血——autoLoginFromGateway 只在 LoginView 挂载触发（已登录态不可达），不会被 gateway 账号覆盖回旧身份。

## 验证

- 服务端：`custom/server/matrix/__tests__/` 新增 profile-accounts 用例（列表/三件套不全不列/`_` 目录跳过/回环四闸 403/profile 参数白名单与路径穿越拒绝/回落语义不回归）。
- 前端：vault 生命周期用例（storeMatrixCredentials 自动入仓/logout 不清仓/remove）；account-switcher 编排用例（mock fetch：成功链全序、token 失效删仓提示、未配置档位 404、登录失败不动档位）；切换器 UI 用例（双源合并渲染、当前项高亮、点击触发编排）。
- 既有回归：`custom/server/matrix/`＋`custom/client/matrix-chat/` 两目录 vitest 全绿（注入态 214/214；pristine 树上 element-web/词条 7 项为注入态假红，主检出注入态对照全绿定谳）；`npm run typecheck:harness` 零错；`typecheck:client` 基线内零新增。
- 活体（端点层）：serve 起树＋`HERMES_HOME` 隔离夹具真路由验证五项——profile-accounts 回环出清单（无凭据档位不列）/gateway-credentials?profile= 按名出三元组/未配置 404/路径穿越 400/LAN Origin 403。完整切换链（真 synapse 账号四处一致换新）需配真 token 档位，本机环境未具备，**未活体验证**——由行为级测试（mock fetch 全序断言）覆盖，留待真实环境首用确认。

## 设计文档影响

DESIGN_SYNC: none——纯产品功能实现批：vault 为客户端凭据缓存（无新数据真值），profile-accounts 为 profiles `.env` 的只读投影（DESIGN.md「团队与身份」域既有数据源），不触及四正本的数据域划分与投影关系；登录链实现细节不在正本叙述面。
