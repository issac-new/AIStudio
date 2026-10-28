# AIStudio 使用指南

本指南面向第一次启动 AIStudio 的用户。内容涵盖启动、三种工作模式、角色入口与排障。安装与架构背景见 [README](../README.md)。设计事实见[《AIStudio 终态设计文档》](superpowers/specs/2026-10-23-swarmstudio-integrated-design.md)。

## 1、启动（浏览器 web 版）

AIStudio 的日常验证与使用走浏览器 web 版，不需要安装桌面包。

### 1.1 前置条件

- Node.js 不低于 23.0.0。
- 基线源码已收录本仓 `vendor/`（hermes-studio、hermes-agent、zcode 钉版快照，台账见 [vendor/VENDOR.md](../vendor/VENDOR.md)），无需 clone 上游仓。
- Windows x64 环境见 [windows-x64-setup.md](windows-x64-setup.md)，并确认 `git config core.autocrlf false`。

### 1.2 首次启动

按顺序执行四步。

```bash
cd <本仓根目录>
npm run inject
```

进入基线目录安装依赖（node_modules 不入库，克隆后装一次）。

```bash
cd vendor/hermes-studio
npm install --no-audit --no-fund --ignore-scripts
mkdir -p dist
```

回到仓根启动后端（监听 8647 端口）。

```bash
cd ../..
npm run serve &
```

启动前端开发服务器（监听 8649 端口，改动即时热更新）。

```bash
npm run dev
```

浏览器打开 `http://localhost:8649`。

### 1.3 登录

已有账号直接登录。首次空库引导需在后端环境显式设置 `HERMES_WEB_UI_DEV_BOOTSTRAP=1`。出厂默认口令已删除，这是安全设计。权限分超级管理员、领导层、普通成员三层。组织关键权限变更需双人会签。

## 2、三种工作模式怎么走

### 2.1 日常工作台（`/app`）

左侧栏按六阶段组织。每个阶段页内嵌该阶段的看板切片与质量门状态。

- 搭台：组织、账号、团队与资产。
- 需求：冻结、分诊与排期。
- 设计：系统分析、spec 与评审。
- 开发：看板、分支与产物。
- 验收：测试、UAT 与发布门。
- 治理：评审、改进实验、安全审计与问题单。

- 派活：在看板建卡并指定负责人。AI 助理认领后执行。卡上有 RACI 徽章与研发进度。
- 催办：卡住的任务按「负责人、所属板、未指派」三态路由发催办，先唤醒后升级。
- 审批：14 个人工介入点都进审批收件箱（`/app/inbox`），批准或打回全程留痕。
- 沟通：房间页是完整 Matrix 客户端（`/app/s/room/:roomId`）。统一身份聊天窗（`/app/collab`）在一个窗口里与全部 AI 身份会话。
- 检索：点击顶部搜索框或按 `Cmd/Ctrl+K`。统一弹窗可搜索 Matrix 会话、看板任务、运行、治理文档、人员和命令。弹窗支持类型计数及看板、状态、负责人、时间筛选。旧 `/app/search` 链接仍可用于唤起弹窗。

### 2.2 IDE 工作区（`/app/ide`）

任务导向的编码工作区，不是聊天页。顶部可选编程或工作模式。左侧任务栏关联看板任务。23 个页签覆盖会话、文件、终端、审查、插件与沟通。

模型与思考档跟随 ZCode 配置单一源。用量页签呈现 token、成本与上下文趋势，零新增埋点。AIStudio IDE 会话默认关闭电脑操作，并注入禁用标记。Ycode 插件的内置默认值不等于会话已获得执行授权。实际运行仍受凭据与系统权限约束。

### 2.3 全流程推演（`/app/sim`）

推演把一次完整交付真实走一遍。主链从需求冻结到发布复盘，共 26 步。六道质量门依次为 G1 需求冻结、G2 架构评审、G3 编码门禁、G4 独立测试、G5 发布准出和 G6 复盘。

人在导演台建真实任务，查看进度并处理人工闸。监督器发现断环与停滞后催办。每轮推演产出可审计报告与证据库。最终报告位于该轮 run 目录的 `evidence/final-report.html`。用静态文件服务打开报告，保留截图的相对路径。

推演与日常共享能力，设计目标是不共享导航与写入口。**当前边界**：SIM 任务的只读观察端点与部分前端守卫已在位，但批量操作与注意力入口尚未排除 SIM 任务（设计正本 §6.4/§8.4 如实登记），验收以此为准——不要把它当成已闭合的隔离保证。

## 3、角色旅程：从哪里入手

| 角色 | 第一站 | 常用面 |
|---|---|---|
| 主管（总指挥） | `/app` 总览与状态点 | 审批收件箱、六闸仪、介入归因、交付效能 |
| 业务分析与产品 | ②需求阶段页 | 需求冻结（G1 验收标准上锁）、排期、验收标准 |
| 架构与研发 | ④开发阶段页与 `/app/ide` | 看板领任务、IDE 编码、评审治理 |
| 测试 | ⑤验收阶段页 | G4 独立测试、评测岛（评测集、红队、稳定性复测） |
| 安全、运维、审计 | ⑥治理阶段页 | 安全审计六阶段、集群巡检（检测器数量以 `custom/server/clusterinspector/` 代码与守门为准，不在文档写死）、长程可信、问题单 |

## 4、服务重启与排障

改了服务端代码或 `custom/server/` 后重启后端。改了 `custom/client/` 通常无需重启，vite 热更新自动生效。改了 vite 配置或 entry 垫片才需要重启前端。

```bash
# 重启后端（监听 :8647）
lsof -ti:8647 | xargs kill -9 2>/dev/null
cd <本仓根目录>
npm run serve &

# 重启前端（监听 :8649）
lsof -ti:8649 | xargs kill -9 2>/dev/null
npm run dev
```

改了 B 类 patch（`patches/` 目录）后，重启后端前必须重新注入，否则上游工作树仍是旧状态。

```bash
npm run clean && npm run inject
```

常见问题：

- 页面打开白屏或接口 404：先确认 8647 后端进程在（`lsof -ti:8647`），再看后端日志。
- 前端代理的 agent 健康检查指向 `http://127.0.0.1:8650/health`，agent 运行时未起时该探针报错属预期。
- 桌面端同版本号覆盖更新不生效：`webuiDir()` 优先用 `~/.hermes-web-ui/webui/<version>/` 副本，删旧副本或递增版本号。
- 端口占用：起服前先 `lsof -nP -iTCP:<端口> -sTCP:LISTEN` 看占用者，杀进程用精确 PID。

## 5、桌面端构建（可选）

日常使用不需要桌面包。当前构建脚本仍保留旧上游目录的缺省解析。
从单仓构建前，必须显式把 `OVERLAY_UPSTREAM_ROOT` 指向仓内 `vendor/`。
桌面端管理独立的 hermes runtime，其版本不与 agent teams 模块互推。

```bash
export OVERLAY_UPSTREAM_ROOT="<本仓根目录>/vendor"
npm run build:dmg:mac   # macOS arm64：DMG + zip
npm run build:dmg:win   # Windows x64：zip + NSIS 安装器（必须在 Windows 主机构建）
```

产物在 `vendor/hermes-studio/packages/desktop/release/`。

## 6、延伸阅读

- [AIStudio 终态设计文档](superpowers/specs/2026-10-23-swarmstudio-integrated-design.md)：理念、产品、设计、实施与验证的唯一正本。
- [设计文档导航](superpowers/specs/2026-10-21-ncwk-unified-product-design.md)：正本、附件和历史档案入口。
- [全流程推演方案](superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md)：26 步六闸的判据与运行规程。
- [设计事实与容量基线](superpowers/specs/2026-10-23-swarmstudio-design-ledger.md)：稳定参数、参考部署与版本快照。
- [上游升级手册](superpowers/specs/2026-10-20-upstream-0738-upgrade.md)：净树重放流程实例。
