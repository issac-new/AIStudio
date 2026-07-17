## SwarmStudio 1.6

基于 hermes-studio 0.6.30 + hermes-agent 0.18.2，升级上游并适配 7 个 overlay patch + 1 个入口 shim。

### 本次更新

#### 上游升级 hermes-studio 0.6.29 → v0.6.30
升级 21 个上游提交，主要包含：
- **Workflow orchestration v2**：全新工作流编排引擎。
- **Durable Ekko Agent memory**：Ekko agent 持久化记忆。
- **Realtime voice mode for single chat**：单聊实时语音模式。
- **MoA presets in chat model selection**：聊天模型选择支持 MoA 预设。
- **MCU device code provisioning + auto microphone channel**：MCU 设备配置体验改进。
- **First-screen loading optimization**：首屏加载优化。
- **Session model switch loading state**：会话模型切换加载状态。
- **Journey graph exploration improvements**：Journey 图谱探索改进。
- **Mobile browser speech fallback**：移动端浏览器语音回退。
- **Provider setup guidance + state preservation**：Provider 配置引导。
- **Windows chat console windows hidden**：隐藏 Windows 聊天控制台窗口。
- **i18n 改为异步创建**：i18n/index.ts 从同步导出 `i18n` 改为异步 `i18nReady` Promise。

#### Overlay Patch 适配（7 个 patch + 1 个入口 shim）
v0.6.30 上游变更导致 7 个 patch + 1 个入口 shim 失效：
- `008-server-index-element-web-middleware`：index.ts `serve(distDir)` 新增 cache-control 回调；重新生成 patch。
- `031-client-chatpanel`：ChatPanel.vue 新增 `canScopedCodingAgentUseProvider` import；重新生成完整 patch。
- `042-desktop-rebrand-swarmstudio-pkg`：version 0.6.29 → 0.6.30。
- `070-cockpit-App.vue`：App.vue imports 重构为 `defineAsyncComponent`；重新生成完整 patch。
- `101-messagelist-gateway-banner`：MessageList.vue `displayMessages` 行号漂移；重新生成。
- `107-agent-health-proxy`：index.ts `serve(distDir)` 上下文被 patch 008 改变；重新生成。
- `110-sidebar-logout-consistency`：WorkflowView.vue imports 重构；重新生成完整 patch。
- `registries/client/entry.mts`：i18n 从同步 `i18n` 改为异步 `i18nReady`；适配 `.then()` 链式调用。

#### 系统特性（延续 1.3+）
- **默认优先使用本机 hermes-agent**：桌面端自动检测系统 PATH 中的 hermes，检测到则跳过 runtime 下载。
- 逃生开关：`HERMES_DESKTOP_FORCE_BUNDLED_RUNTIME=1` 可强制使用 bundled runtime。

### 验证结果
- inject：111 patch 全应用
- overlay 测试：65 文件 / 489 测试全过
- 构建：mac arm64 dmg + win x64 zip 均成功

### 下载
- SwarmStudio-0.6.30-arm64.dmg — macOS Apple Silicon
- SwarmStudio-0.6.30-x64.zip — Windows x64
