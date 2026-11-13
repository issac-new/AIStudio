# Matrix 账号切换批二——密码档位支持＋登录页一键进＋完整链活体（2026-11-13）

承接 [2026-11-13-matrix-account-switch.md](./2026-11-13-matrix-account-switch.md)（批一挂账项本批全收口）。批一用户质询「orchestrator 有 matrix 的 access token」核实定谳：orchestrator `.env` 配的是 **MATRIX_PASSWORD（密码形态）**而非 MATRIX_ACCESS_TOKEN——本机唯一真实档位即此形态，批一只认 token 形态致其不进切换器，为真实产品缺口。

## 变更

1. **密码档位支持（服务端）**：`gateway-env.ts` 的 `readProfileMatrixEnv` 判定扩展——token 三件套（HOMESERVER+ACCESS_TOKEN+USER_ID）**或**密码三件套（HOMESERVER+PASSWORD+USER_ID）任一齐全即视为已配置；返回体带 `kind: 'token' | 'password'` 与对应凭据字段。`listProfileMatrixAccounts` 同口径（两种形态都列，列表仍只回 profile/userId/homeserver 元数据）。`gateway-credentials?profile=` 透传 kind 与凭据（token 或 password，回环四闸内与 token 下发同信任域）。
2. **密码档位支持（客户端编排）**：`account-switcher.ts` 的 `fetchProfileCredentials` 拿到 `kind:'password'` 时先 `matrixSdkLogin`（matrix-js-sdk 密码登录，本地 synapse 直连）换 token+deviceId，再走批一原链（matrix-login → 档位联动 → 写凭据入仓）。密码档位登录失败（M_FORBIDDEN 等密码错）映射为 StaleTokenError 语义提示更新 `.env`。
3. **登录页一键进（patch 025 面）**：`vendor/hermes-studio/packages/client/src/views/LoginView.vue`（经 patch `025-client-loginview-matrix.patch` 注入）登录表单下方新增「本机账号」区——档位账号（profile-accounts）∪ vault 手动账号（同批一切换器合并口径），点击即调批一切换编排（`switchToProfileAccount/switchToManualAccount`，登录页场景等价于免密登录）；manual_logout 标记存在不拦截显式点击（明确意图优先）。patch 025 以注入态 vs git-HEAD pristine diff 重生成。
4. **完整切换链活体验证**：本机 synapse（127.0.0.1:8008）＋orchestrator 密码档位真跑——密码换 token → matrix-login 换 JWT → JWT 可用（fetchCurrentUser）→ active_profile 切换落盘 → matrix-session.json 换新，五点一致。

## 决策记录

- D8（密码形态入列，用户质询驱动）：档位凭据形态两态（token/密码），列表与按名取同口径；密码只在切换动作经回环闸按需下发，列表端点仍零凭据（延批一 D4）。
- D9（密码换 token 在客户端做）：matrixSdkLogin 本就是客户端能力（登录表单同函数）；服务端不做密码代登（避免服务端持有密码形态职责，matrix-login 契约仍只收 token 不变）。
- D10（登录页复用切换编排）：一键进=切换编排的登录页场景（写 api_key+四件套后 reload 进应用），零新链路；vault 在未登录态同样可读（localStorage 本地留底）。
- D11（批二开新 spec 不改写批一）：批一 spec 已有内容收据，改写触发 drift 须 SPEC_REBIND；本批独立四段引用旧件，历史事实源不动。

## 验证

- 服务端：profile-accounts 用例扩展（密码档位入列/密码缺 user 或 homeserver 不列/`gateway-credentials?profile=` 密码形态返回 kind+password/混合形态 token 优先）。
- 前端：account-switcher 编排用例扩展（password 形态先 matrixSdkLogin 再走链/密码错映射 StaleTokenError）；登录页组件用例（双源渲染/点击分发/空态/加载降级/失败行内提示）。
- 回归：matrix 两目录 vitest **225/225**（批一 214 → +11）；typecheck:harness 零错；补丁 769 链尾追加后 `npm run clean && npm run inject` 全链重放 md5 恒等。
- 活体（完整链，本机 synapse 真跑，2026-11-13 夜）九点全过——
  段 A（真实 home＋生产 DB，NODE_ENV=production）：① profile-accounts 列出 orchestrator（密码形态）② gateway-credentials?profile=orchestrator 回 kind=password ③ synapse 密码换 token 成功 ④ matrix-login 换 JWT（super_admin/active）⑤ JWT 调 /api/auth/me 200 全字段＋matrix-session.json 重写（updatedAt 刷新）；
  段 B（HERMES_HOME 隔离夹具，同生产 DB）：⑥ 隔离面清单正确 ⑦ PUT /api/hermes/profiles/active 200（requireSuperAdmin 过）⑧ 隔离 active_profile 落盘=新档位 ⑨ 真实 ~/.hermes/active_profile 未动（零污染实证）。
  已知插曲：synapse 容器活体中途自重启一次（外部事件），恢复后全链复跑通过；段 A 首跑曾连开发态空库得 403（DB 双态坑，NODE_ENV=production 后正确）。

## 设计文档影响

DESIGN_SYNC: none——批一口径不变（vault 客户端缓存、profile-accounts 只读投影），密码形态是既有 `.env` 数据源的另一种取值；登录页为 UI 使用面。不触及 DESIGN_DOCS 四正本。
