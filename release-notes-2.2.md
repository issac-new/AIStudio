## SwarmStudio 2.2

基于 hermes-studio **v0.6.42** + hermes-agent **v0.20.0（v2026.8.3）** + element-web **v1.12.25**，hermes-studio 大跨度升级（59 commits / 500 文件）。

> 本次为**上游同步升级**版本：hermes-studio v0.6.39 → v0.6.42，含 secure shared rooms、remote agents、file transfers、group-chat 大重构、notification clickUrl、Sharp/STT runtime 等重大上游变更。hermes-agent / element-web 已是最新，未动。

### 本次更新

#### hermes-studio v0.6.39 → v0.6.42

| 类别 | 关键变更 |
|------|---------|
| group-chat | Secure shared rooms、remote agents 接入、agent 间 file transfers、handoff chain、mentions、profile query 切换（3448 行重构） |
| notification | clickUrl 导航（`safeNotificationClickUrl` + `webUiHashUrl`），通知点击可跳指定页 |
| 登录 | `resolveLoginRedirect(route.query.redirect)` redirect 保真，深度链接登录后保留目标页 |
| 运行时 | Sharp 图像处理、sherpa-onnx-node STT、lazy-load optional runtime、MCU 远程稳定化、model-run token 可配 |
| desktop | `naiveLocaleFor`、`isInviteOnlyPage`、group-chat-agent popup、`setWindowOpenHandler` |
| 依赖 | adm-zip ^0.6.0、sharp ^0.35.3、sherpa-onnx-node 1.13.3（+optionalDependencies 多平台） |

#### Overlay Patch 适配（137 patches，0 FAILED / 0 WARN）

冲突面 38 文件（vs 2.1 的 21 文件），但经两个 Explore agent 逐文件核查，真实手工合并集中在 17 个 patch，其余为上下文漂移自动 resync。详见 RELEASE-NOTES.md 的「2.2 明细」表。

**保留融合的上游新特性**：
- 登录 redirect 保真移植进 025 双 tab 登录流，默认跳 cockpit
- share 路由（`/share/group-chat/:inviteCode?`）保留为顶层独立路由
- notification clickUrl 导航保留
- desktop `naiveLocale`/`isInviteOnlyPage`/WebhookSettings 等上游新增全部保留

### 验证结果

- **inject**：137 patches，0 FAILED / 0 WARN
- **server `tsc --noEmit`**：0 errors
- **desktop `tsc --noEmit`**：0 errors（仅预存 TS5107）
- **vitest**：503 passed / 0 failed / 6 skipped（67 test files，与 2.1.1 基线一致，无回归）
- **inject 幂等**：clean → inject 可重现

### 已知环境提示（非本次引入）

- 本地 Node v22.23.2 < hermes-studio `engines.node >=23.0.0`（v0.6.38 起即有，npm 仅 warn 不阻塞；tsc/vitest 均在 v22 下通过）

### 不在本次范围

- 不打包 DMG（需单独触发；本机 darwin arm64 可产 mac arm64，x64/win 跨架构按需）
- 不动 hermes-agent / element-web（已最新）
- 不修改 `upstream/` 下任何文件（仅 `git checkout` 切 tag）
