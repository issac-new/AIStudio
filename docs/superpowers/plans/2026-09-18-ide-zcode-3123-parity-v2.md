# /ide ↔ ZCode 3.12.3 对齐实施计划 v2（第二轮）

**主旨**：兑现「/ide 与 ZCode 3.12.3 核心 UI 1:1」的用户指令。事实源与三态裁决见 `specs/2026-09-18-zcode-3123-parity-analysis.md`（5446 键/87 命名空间全量对照）。本计划只排实施：M0 基线 → M1 会话面增量（用户感知最强）→ M2 资源管理器 → M3 记忆查看器 → M4 backlog 清偿。写给我们自己，读完应知道每一步改哪里、怎么验收。

**总原则**：
- 改动面全部落在 `overlay/`（A 类 custom 目录优先；改 upstream 组件走 B 类 patch，hunk 一律 `git diff --no-index` 标准法生成，不手写）。
- 每项功能：守门测试 + i18n zh/en 成对 + 截图对照三件套齐了才算完。
- 工作量口径：S ≤ 半天 / M ≈ 1-2 天 / L ≥ 3 天（含测试）。

## M0 基线与素材（S）

1. 词条快照入库：`docs/superpowers/notes/zcode-3123/`（ns-counts.json + zh-CN 全键清单 + 138 IPC 通道表），守门测试断言 87 ns/5446 键，本机 ZCode 再升级时测试红，触发对照表重审。
2. 像素基线采集：computer-use 驱动 `/Applications/ZCode.app`，固定视口（1440×900，暗色基准）逐面截图入库 `notes/zcode-3123/screens/`。采集面清单（对应用户「不能有任何遗漏」）：工作区总览、会话列、输入框全态（附件/排队/语音/@//）、排队列表、图片灯箱、PDF/视频预览、终端、命令面板、Git 面板、设置 14 个子页、资源管理器、记忆查看器、分享面板、更新弹窗、任务通知。
3. /ide 同尺寸现状截图对照，差距项挂 testid 清单（M1-M4 的验收底册）。截图按当前默认形态直接对比，亮色主题不在本轮范围（用户 09-18 裁定：保持现状）。

## M1 会话面 1:1 增量（L+，用户感知最强，最先做）

**用户 09-18 裁定（A 案）**：/ide 左栏 1:1 还原 ZCode 富侧栏，正式取代 09-18 NavRail 收敛裁决（9780cfe 的极简四按钮形态）；主题基准点同日裁定忽略、保持现状。

| # | 功能（ZCode 锚点） | 改动面 | 验收 |
|---|---|---|---|
| 1.1 | **富侧栏 1:1**（taskList 57 + taskGroup 24 + taskSearch 9 + workspaceSidebar 44 键）：任务列表、搜索框、置顶、日期分组/折叠、归档（settings.taskAutoArchive 设置项并入）、新任务入口；底部保留工作区/终端/会话开关 + ⇄ 图标条 | 新建 `custom/client/ide/views/IdeTaskSidebar.vue`（A 类）+ chatStore 会话元数据扩展（置顶/分组/归档持久化）；IdeNavRail 改为图标条并入侧栏底部；**更新 NavRail/落点相关守门测试**（appsidebar-ide-entry、ide-landing-fallback 等涉及 rail 断言处） | 列表渲染/搜索过滤/置顶归档/分组折叠单测 + 守门测试刷新 + 截图对照 |
| 1.2 | 富排队消息：enqueue/drag 排序/edit/remove/sendNow、turnSteer 转向、paused(stopped/error/generic)/resume、sendConfirm 弹窗（chat.queue.* 24 键） | chatStore 排队模型 + ChatInput 排队区 + MessageList 运行中转向入口；B 类 patch 或 custom 覆写 | 排队操作单测（增删改排序/转向/暂停恢复）+ 截图对照 |
| 1.3 | PDF/视频附件：accept 扩类、消息内 openPdf/openVideo 预览、oversized/missing 提示、upload.queued（chat.attachments.* 13 键） | ChatInput（accept + 校验）+ 消息渲染复用 `PdfFilePreview`、新增视频预览组件 | 附件类型/超限/缺失三态测试 + i18n 成对 |
| 1.4 | 图片灯箱：上一张/下一张/缩放/下载(markdownImage 8 键) | MessageList 图片消息 lightbox（新 custom 组件 IdeImageLightbox，A 类） | 键盘导航/下载落盘测试 |
| 1.5 | 审批与拦截原因：planApproval 卡片、goal/plan blocked 原因、statusPanel.sessionPlans（chat 新增键） | 既有审批面扩展 + TaskPlanCard 深链 | 审批流 e2e（沿用 delivery HumanGate 口径） |
| 1.6 | 模型失效态：invalidated fallback/reselect、loadFailed toast（modelSelection 2 + root 1 键） | ChatInput 模型按钮 + chatStore 失效检测 | 失效→fallback→重选单测 |
| 1.7 | debugInfo popover：taskId/traceId/sessionId/provider/copied（5 键） | 消息更多菜单 + RunTrace 深链 | 渲染/复制测试 |
| 1.8 | settings 增量盘点：+118 键逐项对 SettingsView 清单，缺的高价值项（toolGrouping 三组、performanceMode、notification、uiFontSize、terminalProfile…）列缺口表分流 | 盘点产物挂 spec 附录 | 对账表零「未核」状态 |

## M2 资源管理器（M）

- server：`custom/server/controllers/system/storage.ts`——`GET snapshot`（分类扫描 11 类：sessionStore/subagentTranscripts/toolOutputs/modelTrajectory/devTraces/logs/backups/exports/runtimes/config/other）、`POST clean`（分类确认清理，保留 24h 活跃会话）、`POST reveal`。spawn 固定参数、路径白名单、10s 超时，安全口径照抄 git.ts。
- client：设置页新分区（summaryTotal/图例/分类列表/清理确认弹窗/estimate 声明）。
- 验收：临时目录构造 fake 占用 e2e（扫描/清理/越界拒绝）+ 截图对照。附带收益：SwarmStudio 自身 runtime 9G/日志清理有界面了。

## M3 工作区记忆查看器（M）

- 对应 settings.memory.viewer 37 键：工作区选择+搜索、记忆文件树、文件预览（5 MiB 上限、变更/删除态、MEMORY.md 未生成态）、相对时间族。
- 落点：A 类 `custom/client/ide/views/IdeMemoryPane.vue`（或设置页入口），读 hermes/zcode 工作区记忆目录（AGENTS.md / memory/），只读。
- 验收：目录树渲染/搜索/预览上限测试。

## M4 backlog 清偿（按裁决排期，逐项独立分支）

1. v4Pane 分屏（10 键）。
2. repoWiki 生成器（52+20 键，增量 meta：模型/重试/超时/图表开关/commitId）。
3. Git push / 分支切换器（git.branchSwitcher 46 键）/ gitGraph（27 键）。
4. 白板（whiteboard 15 键）。
5. 会话分享对应物：本地导出/导入 markdown/JSON + Matrix 房间分享卡片（对应 conversationShare 165 键与 `zcode:share-import`，不照搬云链接）。
6. 任务所有权错误族（zcode.error 4 键，fleet 多实例场景）。

## 不做清单（维持既有裁决，理由见 spec §三.12）

云分享链接 / 更新族 5 ns（gh release 分发既定）/ purchase·codingPlan·manualClaimPlan / startup DB 迁移屏 / offPeak 云闲时 / bots feishu·lark（对应物=Matrix 网关）/ remote·ssh·wsl·docker 远程工作区 / CUA Helper / settingsSync。

## 风险与注意

- **上游仍在快迭代**：3.11.2→3.12.3 净增 441 键。对照表快照守门（M0.1）纳入 24h 例行 review 触发器；每轮先查 `/Applications/ZCode.app` 版本再开工（verify-baseline-before-long-plans）。
- **patch 面扩大**：1.1/1.2 触 MessageList/ChatInput（upstream 热区），hunk 冲突概率高；严格 `git diff --no-index` 生成、增量提交。
- **并行会话**：upstream `src/custom` 符号链接会被 worktree 切换，dev 前 `readlink` 确认指向 main overlay；vite 换树删 `.vite` 缓存。
- 像素 1:1 的现实边界：字体渲染（系统差异）与主题变量名不同属可接受偏差；布局结构、按钮集合、交互态必须一致。

## 收口口径

每里程碑独立 feature 分支（`feat/ide-parity-v2-m<N>`）→ overlay `npm test` 全绿 + `npm run clean && npm run inject` 重放 + `npm run build`（vue-tsc）+ i18n-coverage → 合 main。全部里程碑完成后：spec 对照表重审一遍（三态刷新为零缺口或挂裁决），快照守门绿。
