# SwarmStudio 发布说明

## 版本
SwarmStudio 0.6.18(基于 hermes-studio v0.6.18 + overlay 二次开发)

## 构建
```bash
cd overlay
npm run inject          # 应用 53 patch(40 迁移 + 3 rebrand + 10 i18n)
node scripts/build.mjs  # 构建 dist/(openapi + client + server)
cd ../upstream/hermes-studio
npm --prefix packages/desktop run dist -- --mac --win --publish never
```

## ⚠️ 同版本号覆盖更新的缓存陷阱

desktop app 的 `webuiDir()` 优先用 `~/.hermes-web-ui/webui/<version>/` 的副本(首次启动/runtime 下载时复制),而非 app 内打包的 dist。`cleanupLegacyWebUiVersions` 只删低于 `MIN_COMPATIBLE_WEB_UI_VERSION` 的版本,**同版本号(0.6.18)的旧副本不会刷新**。

**后果**:重装同版本 SwarmStudio 时,app 会继续用旧副本(可能是非 overlay 的旧构建),界面与新版不一致。

**解决(二选一)**:
1. 每次发版**递增版本号**(改 `packages/desktop/package.json` 的 `version`),app 会用新版本目录
2. 重装后删除旧副本再启动:`rm -rf ~/.hermes-web-ui/webui/<version>/`(macOS/Linux),app 会 fallback 到 app 内 dist

**诊断命令**:
```bash
# 查 app 实际用的 webui 路径
ls ~/.hermes-web-ui/webui/
# 旧进程占端口导致 EADDRINUSE
lsof -nP -iTCP:8748 -sTCP:LISTEN
```

## 体积(瘦身版)
| 包 | 大小 |
|----|------|
| SwarmStudio-0.6.18-arm64.dmg (Mac Apple Silicon) | 162 MB |
| SwarmStudio-0.6.18-arm64.zip (Mac) | 159 MB |
| SwarmStudio-0.6.18-x64.exe (Windows x86_64) | 139 MB |

## 包含的 overlay 功能
- Matrix 聊天(matrix 登录 + 聊天界面)
- Kanban 增强(18 条 API 路由)
- 品牌替换(SwarmStudio + logo)
- 10 语言 i18n 翻译
- element-web 静态服务集成

## 不包含
- hermes-agent(runtime 下载,首次启动获取)
