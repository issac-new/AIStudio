# SwarmStudio 发布说明

## 版本
SwarmStudio 0.6.33（基于 hermes-studio v0.6.33 + overlay 二次开发）

## 上游版本

| 仓库 | 版本 |
|------|------|
| hermes-studio | v0.6.33 |
| hermes-agent | v0.19.0 |
| element-web | v1.12.22 |

## 本次升级（0.6.32 → 0.6.33）

上游 v0.6.33 含 19 个提交（173 个文件变更），主要更新：

- **Desktop Agent Browser**：完整桌面端浏览器自动化 + 懒加载 MCP 发现
- **Workflow Run History**：分页侧栏解释运行历史 + 总 Run 时间预算
- **Provider 单卡模型刷新**与一次恢复（#2115）
- **文件附件**：支持从粘贴与工作区插入
- **会话滚动恢复**竞态修复（#2207）
- **Desktop 退出清理** Agent Bridge 进程（#2193）
- **聊天 abort 状态**按会话隔离、Windows 工具栏布局打磨
- **MCU 后台任务结果**隔离、聊天 diff 归因与桌面链接预览修复

### Overlay 适配

- 修复 7 个因上游变更而 context 漂移的 patch：
  - `023-client-store-chat`：fetchRuntimeSessions 行号偏移
  - `042-desktop-rebrand-swarmstudio-pkg`：version context `0.6.32 → 0.6.33`
  - `043-desktop-rebrand-swarmstudio-strings`：installer.nsh 删除 `Sleep 1500`、i18n 新增 browser 键致 context 偏移
  - `122-groupchat-sidebar-logout`：GroupChatPanel 新增 useAppStore 致行号偏移
  - `141-desktop-win-file-logging`：index.ts 新增 `type IpcMainInvokeEvent` 致 import 块下移
  - `151-desktop-startup-quit-logging`：基于 141 重新生成 context
  - `152-mcp-shim-electron-run-as-node`：043 rebrand 后 context 字符串已变 SwarmStudio
- `117/118`（hermes-agent patch）经 inject.mjs 路由至 `upstream/hermes-agent`，应用成功
- `scripts/sync-upstream.sh` 改用「优先取最新 stable release tag」策略（与 upstream 目录更新规则一致），无 tag 时 fallback `origin/main`
- 116 个 active patch 全部 inject 通过；build:full 成功；单测 500 pass / 3 fail（3 个为 i18n 措辞预先存在的失败，与本次升级无关）

## Overlay Patch 体系

- **Active patches**: 116 个（100% inject 通过率）
- **归档 patches**: 7 个（018/021/025/028 已迁移到 active patches 或合并）

### Patch 分类

| 范围 | Patch 编号 | 说明 |
|------|-----------|------|
| 数据库 schema | 001 | Matrix 列、SQLite UNIQUE 约束 |
| 服务器配置 | 002-008 | Matrix 字段、端口、element-web 中间件 |
| 客户端 API | 009-011 | Matrix 认证、Kanban 扩展 |
| 服务器控制器 | 012-017 | Auth、Kanban、Users、Middleware |
| 登录页 | 025 | Matrix 登录表单 + Remember Me + 本地降级 |
| 客户端组件 | 020, 022-034 | PageSidebarNav、ChatPanel、Kanban store |
| Kanban 路由/测试 | 035-043 | Routes、tests、desktop rebrand |
| Vite/Vitest | 000, 160 | Custom alias for overlay testing |
| Matrix 测试 | 055-060 | Right panel、threads、notifications |
| Cockpit | 070-075 | App.vue、router、AppSidebar、i18n |
| Kanban API | 078 | listWorkspaceFiles、listTimeline、attachment sync |
| ECharts/Lunar | 080, 103 | 依赖添加 |
| Group chat | 085, 087-089 | Unread tracking、autojoin |
| Gateway notice | 094-102 | Banner、files root |
| Loop 引擎 | 133-140, 161-163 | 路由、socket、i18n、cron、pg、lockfile |
| Desktop 运维 | 107, 110-132, 141-157 | agent-health、sandbox、webui-detached、win 日志、bridge 端口、MCP shim 等 |

### 新增功能（overlay）

- **Matrix 登录**：Homeserver URL + MXID + 密码，Remember Me 持久化
- **Cockpit**：全屏 AI 协作中心，登录后首页
- **SwarmKanban**：协作看板（自定义组件，独立路由）
- **原生看板**：保持上游 KanbanView 不变（AppSidebar 入口）
- **Matrix Chat**：完整 Matrix 客户端（路由动态注册）
- **ECharts 协作地图**：支持面板最大化时画布自适应
- **RunTraceView**：运行全过程可观测性（Evidence Graph）
- **Loop 引擎**：协作 loop 调度/验证/subagent 派生（133-140）

## 构建

```bash
cd overlay
npm run inject          # 应用 116 patch
npm run build:full      # 构建 dist/(openapi + client + server)
# 桌面端打包
npm run build:dmg:mac   # macOS arm64 DMG + zip
npm run build:dmg:win   # Windows x64 exe + zip + msi
```

## 开发启动

```bash
cd overlay
npm run inject                              # 注入 patches
cd ../upstream/hermes-studio
npm install --no-audit --no-fund --ignore-scripts
mkdir -p dist
cd ../../overlay
bash scripts/serve-server.sh &              # 后端 :8647
npm run dev &                                # 前端 :8649
```

## ⚠️ 同版本号覆盖更新的缓存陷阱

desktop app 的 `webuiDir()` 优先用 `~/.hermes-web-ui/webui/<version>/` 的副本。

**解决**：
1. 每次发版递增版本号
2. 重装后删除旧副本：`rm -rf ~/.hermes-web-ui/webui/<version>/`

## 不包含

- hermes-agent（runtime 下载，首次启动获取）
