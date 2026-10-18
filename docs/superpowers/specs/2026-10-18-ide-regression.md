# IDE 工作区全量回归与全能力自检 — 变更说明

## 背景

2026-10-18 用户要求对 IDE 工作区及全部级联功能做完整回归，并落一个能串起全部能力的评估入口。回归发现 13 项产品缺陷，覆盖引导页、深链、文件、下载、命令面板、存储、工作流、任务简报与 i18n。

## 范围

- 客户端：`custom/client/ide/**`、`custom/client/ia2/{IaWorkspaceSwitch,AttentionStrip}.vue`、`custom/client/cockpit/components/CockpitRunTraceModal.vue`。
- 服务端：`custom/server/controllers/system/storage.ts`。
- 上游改动一律走补丁：655（FileTree 显示文件）、656（下载 header 鉴权）、657（下载 root 参数）。
- 新增：`IdeSelfCheckDialog.vue`、`utils/selfCheck.ts`、`utils/sessionBoot.ts` 及配套测试。

## 行为定义

1. **裸落地引导**：`hasActiveSession` 只认非本地草稿的真实会话。用户从左侧点选会话时由 `IdeTaskSidebar` 的 `open` 事件收起引导，裸落地自动建的草稿不触发收起。
2. **会话深链**：`resolveBootSession(querySession, sessionIds, activeId)` 返回 `matched/switchTo`。`IdeChatPane` 在 `loadSessions` 完成后应用该结果，命中即跳过 `ensureSession`。
3. **存储快照**：单次扫描总预算 4 秒（`IDE_STORAGE_SCAN_BUDGET_MS` 可覆盖）。超时分类返回已扫部分并标 `partial`，面板用 `≈ / ≥` 表示下限。进行中的扫描共享同一个 Promise，避免并发重复扫描；partial 结果缓存 10 秒，完整结果缓存 30 秒。
4. **文件树**：IDE 把 `chat.activeSession.workspace ?? ide.workspace` 写入 `filesStore.workspaceRoot`；FileTree 通过 `showFiles` 显示文件节点；文件点击走 `filesStore.openPreview`。
5. **下载**：`downloadFile/fetchFileText` 从 URL 剥离 `token`，改用 `Authorization: Bearer`。workspaceRoot 模式附加 `root` 查询参数。
6. **命令面板**：以 getter 形式监听 `ide.paletteOpen`，打开后下一帧聚焦输入框。窗口级 Escape 兜底。侧栏搜索按钮 `mousedown.prevent` 防止抢焦点。
7. **已归档任务深链**：`getTask` 返回的详情直接回填简报，逐板 `listTasks` 只负责补 board slug。`listTasks` 默认过滤 done/archived，不能作为唯一解析源。
8. **新建任务**：`codingAgentMode: 'scoped'`，使用传入的 `ide.workspace`，不再落到 `~/.hermes-web-ui/coding-agent/...`。
9. **自检**：15 个只读探针，单项 15 秒超时。401/503 记告警，500/超时/结构缺失记失败。入口在命令面板「IDE 自检（全能力冒烟）」。

## 决策记录

- D1 引导页以「真实会话或用户点选」为准，而不是任何 activeSessionId。理由：裸落地会自动建本地草稿，按 activeSessionId 判定会让引导页永不出现。
- D2 深链优先于 `ensureSession`。理由：导入/CLI 会话的 agent 与 IDE 底座不同，按 agent 匹配会新建空会话顶掉直链目标。
- D3 存储扫描设 4 秒总预算并返回 `partial`，不做无界扫描。理由：`~/.hermes/hermes-agent` 实测 118 秒，面板不可用；下限值加提示比长时间空转诚实。
- D4 文件树通过 `filesStore.workspaceRoot` 接线，并新增 `showFiles` 补丁。理由：FileTree 的 `workspaceKey` 只用于根标签，且默认只列目录；IDE 右栏没有独立文件列表。
- D5 下载改 header 鉴权并剥离 URL token，不把下载端点加回 query-token 白名单。理由：保留安全加固意图，fetch 可带 header，不需要让 token 进入日志与 Referer。
- D6 命令面板用 getter 监听并加窗口级 Escape。理由：Pinia 解包后的 `paletteOpen` 是普通布尔值，直接传入 watch 不触发；焦点又会被触发按钮抢走。
- D7 已归档任务用 `getTask` 详情回填，逐板扫描降级为 board slug 补偿。理由：`listTasks` 默认过滤 done/archived，已归档任务的深链在逐板扫描里永远命中不了。
- D8 新建任务改 scoped。理由：global 模式的默认工作区不在文件 API 沙箱内，文件树必然 400。
- D9 自检保持只读，不清理、不写库、不改配置。理由：它要在日常开发中随时可跑，不能引入副作用。
- D10 Markdown 媒体鉴权不在本轮修。理由：需要把 `<img>/<audio>/<video>` 改成鉴权 blob URL，属独立改造；本轮先修下载按钮并如实记录风险。

## 验证

- 全量 vitest：673 文件 / 4897 通过 / 8 跳过 / 0 失败。
- `tsc --noEmit -p packages/server/tsconfig.json` 与 `vue-tsc --noEmit -p tsconfig.app.json` 均 0 错。
- `npm run build:full` 返回 0，`verify-dist` 通过。
- 实机：17 个辅助页签、7 个聊天弹层、任务侧栏、命令面板、任务/会话深链、文件预览下载、存储 4 秒、自检 15 项均验证。
