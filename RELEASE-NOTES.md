# SwarmStudio 发布说明

## 版本
SwarmStudio 0.6.20（基于 hermes-studio v0.6.20 + overlay 二次开发）

## 上游版本

| 仓库 | 版本 |
|------|------|
| hermes-studio | v0.6.20 |
| hermes-agent | v2026.6.19 |
| element-web | v1.12.22 |

## Overlay Patch 体系

- **Active patches**: 65 个（100% inject 通过率）
- **Disabled/stale patches**: 22 个（已注释，含 10 个 i18n locale、4 个 combined、8 个 stale）
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
| Vite/Vitest | 000 | Custom alias for overlay testing |
| Matrix 测试 | 055-060 | Right panel、threads、notifications |
| Cockpit | 070-075 | App.vue、router、AppSidebar、i18n |
| Kanban API | 078 | listWorkspaceFiles、listTimeline、attachment sync |
| ECharts | 080 | 依赖添加 |
| Group chat | 085, 087-089 | Unread tracking、autojoin |
| Gateway notice | 094-102 | Banner、files root |

### 新增功能

- **Matrix 登录**：Homeserver URL + MXID + 密码，Remember Me 持久化
- **Cockpit**：全屏 AI 协作中心，登录后首页
- **SwarmKanban**：协作看板（自定义组件，独立路由）
- **原生看板**：保持上游 KanbanView 不变（AppSidebar 入口）
- **Matrix Chat**：完整 Matrix 客户端（路由动态注册）
- **ECharts 协作地图**：支持面板最大化时画布自适应

## 构建

```bash
cd overlay
npm run inject          # 应用 65 patch
node scripts/build.mjs  # 构建 dist/(openapi + client + server)
cd ../upstream/hermes-studio
npm --prefix packages/desktop run dist -- --mac --win --publish never
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
