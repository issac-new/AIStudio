# ZCode 桌面端 open-file→工作区会话＋Windows APP 启动贯通（2026-11-10）

> 用户指令：Windows 下也要支持；完成 zcode-patches 深改（open-file → 按路径开会话），使「工具」面板打开 ZCode APP 即以选中 kanban 任务的 workspace 为根。

## 现状定谳（源码实测）

上游桌面端**已有**工作区打开全链，唯缺 darwin `open-file`：
- 启动 argv：`--open-workspace <path>` → `extractOpenWorkspacePathFromArgs`（desktopDeepLinkUrl.ts:224）→ `startupOpenWorkspaceRequest`（index.ts:941）→ 主窗口 bootstrap 以该工作区打开。
- 已运行实例：`app.on('second-instance')` → `handleSecondInstanceWorkspaceRequest` → `handleOpenWorkspacePath`（index.ts:2105）。
- `handleOpenWorkspacePath`（desktopOAuthDeepLink.ts:188）：校验本地目录→IPC 投 renderer，冷启动有 pending 队列等 renderer ready。
- **darwin `open -a ZCode <dir>` 的目录以 `open-file` 事件到达（不进 argv），全仓零处理**——上批披露的缺口。
- CLI（zcode-cli）**不认** `--open-workspace`（rg 零命中）——该参是桌面端专属，不可附加到 PATH CLI。

## 变更

1. **zcode-patches/010-desktop-open-file-workspace.patch**（vendor/zcode 分叉，补丁路径树相对）：index.ts 在 second-instance 块后加 darwin `app.on('open-file')`：
   - ready 前（`open -a` 冷启动）：并入 `startupOpenWorkspaceRequest`（首个优先 `??=`，source 复用 `open-workspace-arg`）——随主窗口 bootstrap 打开，与 argv 冷启动同语义；
   - ready 后：`handleOpenWorkspacePath(path, logger, { allowWithoutReadyWindow: true, resolveApplicationWindow: … })`——与 second-instance 完全同口径。
2. **AIStudio win32 启动计划**（devtools.ts）：
   - 新增 `resolveWindowsZcodeAppExe(env, exists)`：`%LOCALAPPDATA%\Programs\ZCode\ZCode.exe`（productName=ZCode，nsis per-user 默认位；可注入）。
   - `zcode` 键：exe 在场→直接启动 exe，带 cwd 时附 `--open-workspace <dir>`（桌面端 argv/second-instance 全链承接）；exe 缺席→维持现状 `start "" /d <dir> zcode`（PATH CLI，只设工作目录，不附加 CLI 不认识的参）。
   - darwin 不变（`open -a ZCode <dir>`——本批补丁后经 open-file 生效）。
3. 测试：服务端 win32 三态（exe+cwd／无 exe 回落／exe 无 cwd）；补丁内容锁（010 含 `app.on("open-file"`＋series 登记）；zcode-patches-guard 既有面自然覆盖 010 一一对应。

## 决策记录

| # | 决策 | 依据 | 备选（否决理由） |
|---|---|---|---|
| D1 | darwin 用补丁接 open-file，而非启动侧改 `open --args --open-workspace` | 用户明令 zcode-patches 深改；open-file 是 macOS 惯例（Finder「打开方式」同链生效）；--args 形态留作无补丁环境逃生 | 只改启动侧 --args（否决：不满足指令且丢失 Finder 链） |
| D2 | open-file 冷启动并入 `startupOpenWorkspaceRequest` 而非直投 handler | 与 argv 冷启动同语义（主窗口 bootstrap 即带工作区）；renderer 尚无窗口可投 | 直投 handler（否决：ready 前无窗口只能落 pending，多绕一层） |
| D3 | win32 探测 nsis per-user 默认 exe，缺席回落 PATH CLI＋/d | productName=ZCode 实测；CLI 不认 --open-workspace 不可盲附；回落保底不炸 | 强制 exe（否决：安装位不确定时按钮失效）；附参给 CLI（否决：未知参风险） |
| D4 | 本批不触 DSH win32（TOOL_DEFS DSH 平台仅 darwin） | 白名单定义如此 | — |

## 验证

- 服务端 `devtools.test.ts`：win32 exe+cwd→`{file:exe,args:['--open-workspace',dir]}`；无 exe+cwd→`start "" /d`；exe 无 cwd→裸 exe；darwin 既有断言零回归。
- 补丁锁（并入 zcode-patches-guard 或新断言）：010 文件在、series 登记、含 `app.on("open-file"` 与 `startupOpenWorkspaceRequest ??=`。
- 重放：pristine zcode 树 `git apply --check` 010（树相对路径）；standalone/全链重放由 CI 门覆盖。
- `npm run typecheck:harness`；全量门。

## 设计文档影响

DESIGN_SYNC: none

补丁接线属上批 spec（2026-11-10-ide-devtools-task-cwd）D2 披露项的兑现，跨平台启动语义随本 spec 记档；不新增设计边界，不改 DESIGN.md 既有章节。
