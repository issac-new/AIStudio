## SwarmStudio 2.1

基于 hermes-studio **v0.6.39** + hermes-agent **v0.20.0（v2026.8.3）** + element-web **v1.12.25**，三上游组件全量升级至最新稳定版，同步完成 overlay patch rebase 与验证。

> 本次为**上游同步升级**版本：不引入新功能，目标是把三个 upstream 推进到各自最新 stable release，并保持 overlay 定制全量干净注入、零回归。

### 本次更新

#### 三上游升级

| 组件 | 旧版本 | 新版本 | 关键上游变更 |
|------|--------|--------|-------------|
| hermes-studio | v0.6.38 | **v0.6.39** | Ekko agent（`setupGlobalEkkoAgent` + tool approval/clarification 拦截链路）、MCU 远程连接稳定化（#2383）、model-run token 生命周期可配（#2382）、runtime activation 错误暴露与 Web UI 切换隐藏（#2353）、group-chat typing 在线成员校验、`runtimeRequiredFiles`→`runtimeRequiredFileGroups` 重构（支持 Windows 多 hermes 启动器候选） |
| element-web | v1.12.22 | **v1.12.25** | matrix-js-sdk 升级至 42.1.0、EventTile 迁移到 shared components、Seshat 5.0.0、compound-web 9.9.0、MSC3391/MSC3852 移除、macOS 32px 标题栏样式、对话气泡折叠改进（仅 upstream 参考源更新；dist 产出维持既有外部机制，overlay 不 patch element-web） |
| hermes-agent | v0.20.0（HEAD ≥ tag） | v0.20.0（v2026.8.3） | 收敛到干净的 release tag。HEAD 此前已位于或晚于 v2026.8.3，本次统一对齐到 tag commit（`3c27eb623`），无功能变更 |

#### Overlay Patch 适配

全量 138 patch 中 **136 干净应用，0 FAILED / 0 WARN**。

**禁用 2 个**（被上游吸收或已废弃）：

| patch | 原因 |
|---|---|
| `030-client-groupchatview` | 上游 v0.6.39 已将 `store.connect()` 改为 `await store.connect()`（与本 patch 内容相同），patch 冗余 |
| `126-desktop-system-hermes-agent-default` | 三处 helper（`preferredSystemHermesCommand` / `explicitSystemHermesEnabled` / `resolveExecutable`）全程无引用；`execFileSync` import 由 patch 144 覆盖；`run_agent.py` 检查由 patch 148 覆盖；上游 v0.6.39 重构 `runtimeRequiredFiles`→`runtimeRequiredFileGroups` 使本 patch 目标消失 |

**修订 2 个**（刷新上下文以对齐 v0.6.39）：

| patch | 修订内容 |
|---|---|
| `016-server-middleware-user-auth` | hunk #3 上下文对齐 v0.6.39：`issueModelRunJwt` 函数体由 `MODEL_RUN_EXPIRES_SECONDS` 改为 `getModelRunJwtExpiresSeconds()`（上游新增函数）；`toAuthenticatedUser` 起始行号 176→184（上游新增 `getModelRunJwtExpiresSeconds` 函数导致下移） |
| `042-desktop-rebrand-swarmstudio-pkg` | version 上下文 `0.6.38`→`0.6.39`（上游版本号 bump） |

#### 冲突面核查（事先评估）

升级前对 138 patch 目标与 v0.6.39 变更文件（112 个）做了交集分析，确认 21 个重叠文件中：
- 11 个 i18n locale 文件（en/zh/de/es/fr/ja/ko/pt/ru/zh-TW）+ package.json：上游新增 key 与 overlay key 无冲突，inject 全部干净应用
- 4 个 server 文件 + 2 个 desktop 文件 + 3 个 client group-chat 文件：逐一核查后，实际需修订的仅上述 2 个 patch，其余上下文漂移在 `git apply --whitespace=nowarn` 容差内

### 验证结果

- **inject**：136 patches，0 FAILED / 0 WARN（hermes-studio + hermes-agent 全量干净应用）
- **server `tsc --noEmit`**：0 errors（与 2.0 基线一致）
- **vitest**：503 passed / 0 failed / 6 skipped（67 test files，与 2.0 基线完全一致，无回归）
- **inject 幂等**：`npm run clean` → `npm run inject` 可重复还原并重新应用

### 已知环境提示（非本次引入）

- 本地 Node v22.23.2 < hermes-studio `engines.node >=23.0.0`。此要求在 v0.6.38 已存在，npm 仅 warn 不阻塞；本次 tsc/vitest 均在 v22 下通过。生产构建建议用 Node ≥23。

### 不在本次范围

- 不构建 DMG 安装包（平台相关、属对外发布，需单独触发）
- 不做 element-web 源码构建/dist 发布（dist 产出维持既有外部机制；upstream/element-web 仅作参考源同步到 v1.12.25）
- 不修改 `upstream/` 下任何文件（仅 `git checkout` 切 tag）
