# SwarmStudio

> 基于 [hermes-studio](https://github.com/EKKOLearnAI/hermes-studio) 二次开发的 **AI 协作中心**桌面应用。本仓是 overlay（二次开发层），通过构建期注入将自定义功能叠加到上游，上游源码始终保持纯净、可独立升级。

SwarmStudio 把「人类协作伙伴 + 本地 Agent 集群 + 人机 1:1 协作」三类工作统一在一个驾驶舱（Cockpit）里统筹：既有突出重点的全貌概览，又可针对具体任务接入，进行补充 / 评估 / 决策 / 审批。同时提供协作看板、Matrix 即时通讯、运行全过程可观测性等能力。

---

## 运行效果图

<img width="1914" height="928" alt="d5515cbc-58fa-48d4-b66b-2edefd345b65" src="https://github.com/user-attachments/assets/786c5b94-1d63-4179-82c3-8f9946ffa420" />
<img width="1916" height="917" alt="d71cdaa7-eb9b-45ed-b435-1bc2ee2031f4" src="https://github.com/user-attachments/assets/85f568fe-57f4-4a49-83a9-48496b5aefa6" />
<img width="1920" height="923" alt="67876615-bab7-4880-b919-8c7f4caa1165" src="https://github.com/user-attachments/assets/71136468-70f8-4cb2-b7bb-c25978fdfb0a" />
<img width="1920" height="933" alt="d0c3941b21d78a93b6c90f67e9faea87" src="https://github.com/user-attachments/assets/4827c359-09bb-4052-9eb1-2696061c3e2d" />
<img width="1920" height="930" alt="ea0b09bd5c3e608883e6a661e6fc658b" src="https://github.com/user-attachments/assets/bf5293b0-374a-4a7a-92a1-645d87775cbe" />

## 功能特色

### 🚀 Cockpit — AI 协作中心（主操作界面）

登录后的首页，三段联动式布局（全貌 → 聚焦 → 处理）：

- **顶栏**：品牌 · 日程 · 时钟 · 搜索 · 在线状态 · 通知 · 用户
- **注意力条**：克制的「需要你」提醒（浅底 + 左色条 + 文字），重心始终在右栏工作区
- **左栏**：Kanban 统筹入口，按优先级聚合三类工作（协作 / 管理 / 易用），支持筛选
- **中栏**：协作图（图谱画布）+ 时序事件流（纵向时间线），呈现并行 / 派生 / 收敛
- **右栏**：工作区重心，A2UI 表单 + 文件资源管理器，底部衔接 Claude Code / 提交
- **模式切换**：⚡ 工作项 / 💬 协作 / ⌘ 编程，同一任务多视角处理
- 视觉严格遵循 **Pure Ink** 黑白灰主题（仅 status 用 error / warning / success 三色），避免颜色过载

### 🔭 RunTraceView — 运行全过程可观测性

把线性聊天消息流重构成 **Evidence Graph（证据图）**，呈现多 agent 协作的并行 / 派生 / 收敛：

- **证据分层**（不可伪造原则）：`L1` 前端事件流可靠可见（实线）/ `L2` 运行时 hook 后补齐（虚线 + 推断标签）/ `L3` 分布式 trace propagation 后补齐（点线 + future 标签）
- **TraceNode 类型**：ingress / workflow / agent / skill / tool …，skill 可下钻展开内部「思维链 + 工具」交错编排
- **时间轴 + 检查器 + 时间游标**：回放 live / replay 两种模式
- 对齐 **OpenTelemetry GenAI 语义约定**的 JSONL 导出 + 证据档案（Evidence Dossier）导出
- 第 1 层零运行时改动，纯前端消费已有 Socket.IO 事件流（`run/tool/subagent/usage/reasoning`）

### 📋 SwarmKanban — 协作看板

自定义组件（独立路由 `swarm-kanban`），与上游原生 KanbanView 并存：

- 看板列 / 任务卡 / 任务抽屉 / 任务表单 / 内联创建
- 批量操作栏、注意力条、编排面板、诊断区
- Markdown 渲染、附件管理、租户解析（多租户隔离）
- 工作区文件列表、时间线、附件同步 API

### 💬 Matrix Chat — 完整 Matrix 客户端

49 个组件构成的完整即时通讯客户端，路由动态注册为 Cockpit 子路由：

- 房间列表 / 消息流 / 消息输入 / 上下文菜单 / 消息操作栏
- 文件面板 / 成员列表 / 成员信息 / 邀请 / 转发 / 导出 / 加入 / 离开 / 创建房间
- 群聊未读追踪、自动 join、日期分隔符、清空消息
- 基于 `matrix-js-sdk`，经 Matrix homeserver 认证

### 🔐 Matrix 账号集成

- **登录**：Homeserver URL + MXID + 密码，Remember Me 持久化 + 本地降级
- **管理**：账号设置、用户管理（admin-service）
- 服务端：Matrix 认证路由、数据库 schema 扩展（Matrix 列 + SQLite UNIQUE 约束）

### 🎨 品牌与网关通知

- 桌面端 rebrand 为 SwarmStudio（config + package）
- 品牌样式变量注入
- Gateway 通知横幅：Chat / Group Chat 关停公告，经内容检测识别（非 systemType）

### 🌐 国际化

扩展 i18n 翻译键（看板、历史筛选、Matrix 聊天等），直接经 patch 注入上游 locale 文件，无需运行时 merge。

---

## 架构

### 技术架构说明
<img width="2960" height="4000" alt="image" src="https://github.com/user-attachments/assets/3e41bc6e-7afc-4c2b-b437-404e1f33c629" />

### 工作区三层布局

```
ncwk/
├── upstream/                 # 上游原始项目（只读，禁止直接修改）
│   ├── hermes-studio/        #   SwarmStudio 桌面应用主体（v0.6.20）
│   ├── element-web/          #   Element Web Matrix 客户端参考实现
│   └── hermes-agent/         #   Hermes AI Agent 运行时
├── overlay/                  # ← 本仓：二次开发代码（唯一被提交的地方）
│   ├── custom/               #     A 类：纯新增代码（组件/store/服务）
│   ├── patches/              #     B 类：上游骨架修改（git apply 可逆）
│   ├── registries/           #     运行时注册中枢（路由/导航/组件）
│   ├── config/               #     功能开关
│   ├── scripts/              #     inject / build / sync 工具链
│   └── tests/                #     单测
└── docs/superpowers/         # 设计文档（specs + plans）
```

**核心原则**：三个上游仓始终保持上游原状，`.git` 永不污染，可独立 `git pull` 升级；所有二次开发代码集中在 overlay 仓。

### 混合注入策略（A 类 + B 类）

二次开发改动按「是否能纯新增」分两类，分别用不同机制接入上游：

| 类别 | 改动性质 | 存放 | 接入机制 | 可逆性 |
|------|---------|------|---------|--------|
| **A 类** | 纯新增文件（组件/store/服务） | `custom/` | 构建期 alias 重定向 + entry shim + 运行时 registry | 零侵入上游源码 |
| **B 类** | 修改上游骨架（schema/config/vite/路由） | `patches/` | `git apply`（构建期注入） | `git apply --reverse` 完全还原 |

> 为什么不全用 A 类？对修改文件做分类后发现，~7 类改的是上游骨架（schemas 加列、config 加字段、vite 预打包等），属运行前置条件，无法运行时注册，必须转 patch。

### overlay 仓库目录结构

```
overlay/
├── custom/
│   ├── client/                    # 前端 A 类代码
│   │   ├── cockpit/               #   驾驶舱（27 组件 + store + adapters + 样式）
│   │   ├── matrix-chat/           #   Matrix 聊天（49 组件 + views）
│   │   ├── kanban/                #   协作看板（14 组件 + utils + views）
│   │   ├── chat/                  #   网关通知横幅
│   │   ├── branding/              #   品牌注入
│   │   └── test/                  #   测试桩
│   └── server/                    # 服务端 A 类代码
│       ├── kanban/                #   看板服务
│       └── matrix/                #   Matrix 认证路由 + admin-service
├── patches/                       # B 类 patch（73 个 active + 归档）
│   └── series                     #   patch 应用顺序清单
├── registries/
│   ├── client/                    # 客户端注册中枢 + entry shim + bootstrap
│   └── server/                    # 服务端 bootstrap（预留）
├── config/
│   ├── features.ts                # 功能开关（VITE_* 环境变量控制）
│   └── bootstrap.ts
├── scripts/
│   ├── inject.mjs                 # 注入工具（应用 patch + 生成派生 config + 建符号链接）
│   ├── build.mjs                  # 完整构建编排
│   ├── build-dmg.mjs              # 桌面端 dmg 打包
│   ├── verify-clean.mjs           # 校验上游工作树干净
│   ├── sync-upstream.sh           # 上游升级流程
│   └── serve-server.sh            # 开发期后端启动
└── tests/                         # 单测（vitest）
```

---

## 运行原理

### 1. 注入流程（`npm run inject`）

`scripts/inject.mjs` 是核心，幂等执行，将 overlay 叠加到上游工作树：

```
inject.mjs
  │
  ├─ 0. 清理自残留（旧 server/src/custom 符号链接 + 非 patch 的 build 产物）
  ├─ 1. 校验上游工作树干净（脏则报错，提示先 clean）
  ├─ 2. 应用 B 类 patch ──── 按 patches/series 顺序 git apply 到 hermes-studio
  ├─ 3. 建符号链接
  │     ├─ overlay/node_modules → upstream/hermes-studio/node_modules（复用上游依赖）
  │     └─ upstream/.../server/src/custom → overlay/custom/server（server 用相对路径 import）
  ├─ 4. 生成派生 vite.config.overlay.ts（alias 重定向 + entry 重定向，见下）
  └─ 5. 写清单 .overlay-injected.json（记录已应用 patch，供 clean 反向还原）
```

**`npm run clean`** 反向执行：按清单逆序 `git apply --reverse` 还原 patch + 移除符号链接 + 还原 build 产物，让上游完全回到 HEAD。

### 2. A 类接入：构建期 alias 重定向 + 运行时注册

A 类代码不改动上游源码，靠两个机制接入：

**(a) 派生 vite config 的 alias 重定向**

`inject` 生成的 `vite.config.overlay.ts` 在上游 vite config 基础上 `mergeConfig` 注入 alias（数组形式保证匹配顺序，更具体的前缀先匹配）：

| alias | 指向 | 作用 |
|-------|------|------|
| `/src/main.ts` | `overlay/registries/client/entry.mts` | 把 index.html 入口重定向到 overlay shim |
| `@/custom` / `@custom` | `overlay/custom/client` | 自定义组件解析到 overlay |
| `@registries` | `overlay/registries` | 注册中枢解析到 overlay |
| `@`（兜底） | `upstream/.../client/src` | `@/api`、`@/views` 等仍解析到上游 |

**(b) entry shim + 运行时 registry**

`registries/client/entry.mts` 忠实复制上游 `main.ts` 的启动序列（createApp → use pinia/i18n/router → FOUC/token 处理），唯一差别是在 `app.use(router)` 与 `app.mount()` 之间插入 A 类注册：

```
entry.mts
  ├─ 复制上游 main.ts 启动序列（createApp / use pinia / use i18n / use router）
  ├─ import('./bootstrap').then(bootstrapClient(app))   ← A 类注册插入点
  │     │
  │     ├─ 按 features 开关动态 import 各 custom 模块
  │     │   ├─ registerMatrixChat(app)
  │     │   ├─ registerKanbanEnhancements(app)
  │     │   ├─ registerBranding(app)
  │     │   └─ registerCockpit(app)
  │     │
  │     └─ 把 registry 收集到的路由 router.addRoute()（必须在 mount 前）
  │           └─ 动态子路由（如 matrix-chat 作为 cockpit 子路由）也在此注册
  │
  ├─ router.isReady() + 重导航（让动态路由对初始导航生效）
  └─ app.mount('#app')
```

`registries/client/index.ts` 是注册中枢，提供 `registerRoute` / `registerNavEntry` / `registerComponent`，各 custom 模块调用它们收集扩展，bootstrap 在 mount 前统一挂载。

> **为何不用顶层 await**：es2020 target 不支持，用 `.then` 链式保证 bootstrap 在 mount 前完成。

### 3. 功能开关

`config/features.ts` 用 `import.meta.env.VITE_*` 读取环境变量（必须带 `VITE_` 前缀，否则 Vite 不注入客户端 bundle）。默认全开（向后兼容），可经环境变量关闭：

| 开关 | 环境变量 | 默认 |
|------|---------|------|
| matrixChat | `VITE_CUSTOM_MATRIX_CHAT=false` | 开 |
| matrixAuth | `VITE_CUSTOM_MATRIX_AUTH=true` | 关 |
| matrixAdmin | `VITE_CUSTOM_MATRIX_ADMIN=true` | 关 |
| kanbanEnhancements | `VITE_CUSTOM_KANBAN_ENHANCEMENTS=false` | 开 |
| branding | `VITE_CUSTOM_BRANDING=false` | 开 |
| extendedI18n | `VITE_CUSTOM_EXTENDED_I18N=false` | 开 |
| cockpit | `VITE_CUSTOM_COCKPIT=false` | 开 |

### 4. 完整构建流水线（`npm run build:full`）

`scripts/build.mjs` 编排四步，产物落到上游 `dist/`（desktop 构建读取该目录）：

```
1. openapi:generate     → dist/server/openapi.json（上游脚本）
2. vite build           → dist/client/（用 overlay config：@/custom alias + entry shim）
3. tsc --noEmit         → server 类型检查
4. build-server         → dist/server/（上游打包脚本）
```

桌面端打包：`npm run build:dmg:mac|win|linux`（`scripts/build-dmg.mjs`）。

### 5. 数据流（运行时）

```
浏览器 (Vue3 + Pinia + Vue Router)
  │  index.html → entry shim (alias 重定向)
  │  ├─ @/custom/*   → overlay custom 组件
  │  └─ @/*          → 上游 client src
  │
  │  Socket.IO 事件流 (run/tool/subagent/usage/reasoning)
  │  ├─ chat.ts handleEvent        → 线性 Message[]（上游，不改）
  │  └─ RunTraceView 并行消费者     → Evidence Graph（overlay，零侵入）
  │
Koa Server (上游 packages/server + custom/server 经符号链接)
  ├─ Matrix 认证路由 (custom/server/matrix/routes.ts)
  ├─ Kanban 服务 (custom/server/kanban)
  └─ element-web 中间件 (patch 008)
  │
hermes-agent (运行时，首次启动下载)
```

---

## 快速开始

### 环境要求

- Node.js ≥ 23.0.0
- 上游仓已 clone 到 `../upstream/`（hermes-studio / element-web / hermes-agent）

### 上游依赖

SwarmStudio 基于以下三个上游开源项目二次开发：

| 上游项目 | GitHub 仓库 | 用途 |
|---------|-----------|------|
| **hermes-studio** | https://github.com/EKKOLearnAI/hermes-studio | SwarmStudio 桌面应用主体（Vue 前端 + Koa 后端 + Electron 壳），本 overlay 的注入目标 |
| **hermes-agent** | https://github.com/NousResearch/hermes-agent | Hermes AI Agent 运行时（Python，运行时首次启动自动下载） |
| **element-web** | https://github.com/element-hq/element-web | Element Web Matrix 客户端参考实现（v1.12.22） |

**独立安装运行（不依赖 overlay 二次开发）**

若只想运行上游原版，可直接用官方命令安装：

```bash
# 1. 安装 hermes-agent 运行时（Python）
pip install hermes-agent[all]

# 2. 安装 hermes-web-ui（SwarmStudio 桌面应用）
npm install -g hermes-web-ui

# 3. 启动 web UI 服务
hermes-web-ui start

# 4. 启动 agent（终端 TUI 交互模式）
hermes --tui

# 5. 启动 agent dashboard（桌面 GUI 后端）
hermes dashboard --tui
```

> 注：上述是上游官方用法。本 overlay 仓的二次开发版需经 `npm run inject` 注入后从源码构建（见下文「开发启动」），不走全局安装路径。

### 开发启动（首次）

```bash
cd overlay
npm run inject                                       # 1. 注入 patches + 生成派生 config + 建符号链接

cd ../upstream/hermes-studio
npm install --no-audit --no-fund --ignore-scripts    # 2. 安装上游依赖（overlay 经符号链接复用）
mkdir -p dist

cd ../../overlay
bash scripts/serve-server.sh &                       # 3. 后端 :8647（ts-node 直跑上游 src/index.ts）
npm run dev                                          # 4. 前端 :8649（vite，host + strictPort）
```

开发期 vite dev server 代理 `/agent-health` → `http://127.0.0.1:8650/health`。

### 前后端服务重启

开发期后端用 `serve-server.sh`（前台进程，`node -r ts-node/register` 直跑 TS 源码，无热重载）；前端用 vite dev server（HMR 自动热更新）。两者各自独立，重启互不影响。

**重启后端**（改了 server 代码 / patch / `custom/server/` 后需重启）：

```bash
# 1. 找到并杀掉旧后端进程（监听 :8647）
lsof -ti:8647 | xargs kill -9 2>/dev/null

# 2. 重新启动（后台）
cd overlay
bash scripts/serve-server.sh &                        # 默认 :8647
# 或指定端口：bash scripts/serve-server.sh --port 8647

# 若改了 B 类 patch，重启前需先重注入：
# npm run clean && npm run inject
```

**重启前端**（改了 `custom/client/` 后通常无需重启——vite HMR 自动热更新；仅当改了 `vite.config.overlay.ts` / alias / entry shim 时需重启）：

```bash
# 1. 杀掉旧 vite 进程（监听 :8649）
lsof -ti:8649 | xargs kill -9 2>/dev/null

# 2. 重新启动
cd overlay
npm run dev                                           # 前台跑，Ctrl+C 停止；或加 & 后台
```

> **若改了 B 类 patch**：后端重启前必须 `npm run clean && npm run inject` 重新注入，否则上游工作树仍是旧 patch 状态。

### 完整构建 + 桌面端打包（两个版本构建物）

SwarmStudio 桌面端当前版本 **0.6.20**，构建产物分 **macOS** 与 **Windows** 两个版本。

**方式 A — overlay 一键脚本（推荐，自动 inject + build:full + electron-builder）**

```bash
cd overlay

# macOS 版（arm64 DMG + zip）
npm run build:dmg:mac
# 产物：upstream/hermes-studio/packages/desktop/release/
#       ├── SwarmStudio-0.6.20-arm64.dmg
#       └── SwarmStudio-0.6.20-arm64.zip

# Windows 版（x64 exe + zip + msi）
npm run build:dmg:win
# 产物：upstream/hermes-studio/packages/desktop/release/
#       ├── SwarmStudio-0.6.20-x64.exe
#       ├── SwarmStudio-0.6.20-x64.zip
#       └── __msi-x64/
```

`build-dmg.mjs` 编排 5 步（自动完成，无需手动分步）：
1. `inject` — 应用 patch + 生成派生 config + 建符号链接
2. `build:full` — 用 overlay vite config 构建 web UI → `dist/client` + `dist/server`
3. `desktop:install` — `npm ci --prefix packages/desktop`
4. `build:main` — `tsc` 编译桌面主进程
5. `electron-builder --<platform> --publish never` — 打包

**方式 B — 手动分步（更细粒度控制）**

```bash
cd overlay
npm run inject                  # 1. 注入 patch
npm run build:full              # 2. 构建 dist/(openapi + client + server)

cd ../upstream/hermes-studio
npm ci --prefix packages/desktop --no-audit --no-fund   # 3. 桌面端依赖
npm --prefix packages/desktop run build:main            # 4. tsc 编译主进程

# 5. 打包（--mac / --win / --linux，可组合）
npm --prefix packages/desktop run dist -- --mac --win --publish never
# 产物同样落到 packages/desktop/release/
```

> **关键**：必须用 overlay 的 `build:full`（`scripts/build.mjs`，用 overlay vite config），而非上游的 `npm run build`——后者会覆盖 `dist/` 且不带 `@/custom` alias + entry shim，产物不含自定义组件。`build-dmg.mjs` 已默认绕开上游 `npm run dist`（避免其内部 `npm run build` 覆盖 dist）。

**仅构建 web UI（不打桌面端）**

```bash
cd overlay
npm run inject          # 应用 73 patch
npm run build:full      # 构建 dist/(openapi + client + server)，落到上游 dist/
```

### 常用命令

| 命令 | 作用 |
|------|------|
| `npm run inject` | 应用 B 类 patch + 生成派生 config + 建符号链接 |
| `npm run clean` | 反向还原上游工作树（逆序 reverse patch + 移除链接） |
| `npm run verify` | 校验上游工作树状态干净 |
| `npm run sync` | 上游升级（clean → fetch/reset → re-inject） |
| `npm run dev` | 前端开发服务器 :8649 |
| `npm run build` | 仅构建 client bundle |
| `npm run build:full` | 完整构建 web UI（openapi + client + server）→ 上游 dist/ |
| `npm run build:dmg:mac` | macOS 版构建物（arm64 DMG + zip，一键 inject+build+打包） |
| `npm run build:dmg:win` | Windows 版构建物（x64 exe + zip + msi，一键 inject+build+打包） |
| `npm run build:dmg:linux` | Linux 版构建物（一键 inject+build+打包） |
| `npm test` | 运行单测（vitest） |

---

## 开发工作流

### 修改上游骨架（B 类）

1. 在 `upstream/hermes-studio` 直接改（临时）
2. `git diff > overlay/patches/NNN-描述.patch` 生成 patch
3. 还原上游工作树（`git checkout -- .`）
4. 把 patch 文件名加入 `overlay/patches/series`
5. `npm run inject` 验证可应用

### 新增功能（A 类）

1. 在 `overlay/custom/client/<feature>/` 写组件 / store
2. 在 `overlay/registries/client/bootstrap.ts` 调度注册（按 features 开关动态 import）
3. 用 `registerRoute` / `registerNavEntry` / `registerComponent` 收集扩展
4. `npm run dev` 即可热加载验证

### 上游升级

```bash
npm run sync   # = clean → git fetch/reset upstream → re-inject
```

patch 冲突时用 `git apply --reject` 手动排查，修复后重跑 inject。详见 `docs/superpowers/specs/2026-06-21-overlay-architecture-design.md`。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vue 3 + Pinia + Vue Router + Vite + TypeScript |
| UI | Naive UI + Pure Ink 自定义主题（黑白灰）+ ECharts |
| 通讯 | Matrix（matrix-js-sdk）+ Socket.IO |
| 后端 | Koa + SQLite |
| 桌面 | Electron（hermes-studio packages/desktop） |
| 测试 | Vitest（41 个测试文件） |
| Agent | hermes-agent（运行时下载，OpenTelemetry GenAI 语义对齐） |

---

## 规模

- **73** 个 active B 类 patch（100% inject 通过率）
- **94** 个自定义 Vue 组件（Cockpit 27 / Matrix Chat 49 / Kanban 14 / 其他 4）
- **41** 个单测文件
- 上游基础：hermes-studio v0.6.20 / hermes-agent / element-web v1.12.22

## 设计文档

完整设计文档位于 `../docs/superpowers/`（specs + plans），覆盖 Cockpit、RunTraceView、Kanban、Matrix 集成、overlay 架构等。

## ⚠️ 同版本号覆盖更新的缓存陷阱

桌面端 `webuiDir()` 优先用 `~/.hermes-web-ui/webui/<version>/` 的副本。每次发版需递增版本号，重装后删除旧副本：

```bash
rm -rf ~/.hermes-web-ui/webui/<version>/
```

## 不包含

- hermes-agent（运行时首次启动自动下载，不在本仓）
