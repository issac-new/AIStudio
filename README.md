# AIStudio

本项目基于作者想法，由 AI 100% 完成，不包含任何人类代码。使用 Apache 2.0 协议发布。对于参考的上游项目，如需运行时部署，请遵守其授权约定，或自行参考迁移功能完成本地化实现。

Hard times create human code, human code create AI times, AI times create weak men, and weak men create hard times.

AIStudio 是单一完整项目仓。产品应用、Matrix 接入、hermes agent、Ycode、swarm-yuan 和 simharness 的源码与依赖清单都在本仓。AIStudio 让人在同一个驾驶舱指挥 AI 团队，完成需求分析、研发协作、实施交付和测试验证。

本仓基于 [hermes-studio](https://github.com/EKKOLearnAI/hermes-studio) 二次开发。上游钉版快照收录在 `vendor/`，台账见 [vendor/VENDOR.md](vendor/VENDOR.md)。二次开发位于 `patches/` 与 `custom/`，构建期注入叠加。基线保持纯净，并可独立升级。

## 理念：四个阶段的问题与解法

AI 协作从「单机单 Agent」走向「多人 + 多 Agent 并行」后，交付的四个阶段各暴露一类结构性问题。AIStudio 的功能逐条对着这四类问题来。本节按工程阶段看问题，下一节的四条主线说明组件如何跨阶段协作，二者不是两种产品分层。

| 阶段 | 问题 | 解法 |
|---|---|---|
| 需求 | 跨地域、跨团队协作割裂：群聊、看板、终端、文档各说各话 | Studio 驾驶舱统一视图，Kanban 唯一看板，Matrix 做通信基座（消息即凭证） |
| 设计 | 设计一致性与架构延续性难保 | 每节点一个 gateway 复用多个 profile。智能体消息与派发经过本机网关，产品写操作回到权威系统 |
| 编码 | 长程任务跑不稳，完成声明不可信 | 长程可信执行层审计主张、检查完成态并保存断点。改进实验台只做观测、正则化和 A/B 对比，不做自主自我改进 |
| 测试 | 质量门禁来得太晚 | 门禁左移：从 G1 需求冻结起设六道质量门（G1-G6），spec-first 钩子在写代码之前就拦截无设计改动 |

三条断言贯穿全部设计：

- 证据先于声明：完成声明必须带提交号与任务卡号。
- 未配置不等于已治理：inactive、partial 等状态如实呈现。
- 受管迁移：新归属面接管能力后，才退役旧入口。

## 体系：五件套构成完整交付系统

AIStudio 不是单一应用，而是五个组件构成的分布式交付体系：

```
产品面  AIStudio（本仓）
        驾驶舱：看板 / 审批 / 沟通 / 推演 / IDE / 治理
          │ 读模型不复制，写操作回到权威系统
          │
通信基座  Matrix
        跨地域消息 / 房间协调通道 / 协议事件（com.swarmstudio.*）凭证
          │
运行面    hermes agent
        每节点单网关多路复用，智能体有编制、有权限、有审计
          │
编码引擎  Ycode（zcode 分叉，内置 computer-use 插件）
        IDE 工作区的本机编码执行底座
          │
能力层    swarm-yuan
        对任意代码仓库生成项目专属开发技能（组件清单、配方、门禁）
```

四条主线贯穿五件套：

- 分布式需求分析：冻结需求与验收标准。
- 研发协作：看板派活、催办、并行与 RACI。
- 实施交付：IDE 编码、长程可信执行与多机协作。
- 测试验证：独立测试、评测与发布准出。

## 产品：三种工作模式

| 模式 | 入口 | 用来做什么 |
|---|---|---|
| 日常工作台 | `/app` | 六阶段（搭台、需求、设计、开发、验收、治理）：看板、审批收件箱、沟通、阶段页、全站检索 |
| IDE 工作区 | `/app/ide` | 任务导向编码：任务、会话、文件、终端、审查、完整 Matrix 客户端，编程与工作双模式 |
| 全流程推演 | `/app/sim` | 26 步完整交付演练、六道质量门、导演台、监督器、证据库 |

另有专题四岛：流程架构 BPA、本体、评测和技能治理。组织关键行变更需要双人会签。14 个人工介入点进入审批收件箱，程序不替人作决定。

<details>
<summary>运行效果图（2.17 旧版界面，当前为六阶段工作台形态，截图待更新）</summary>

### 沟通区
<img width="1914" height="928" alt="沟通区截图" src="https://github.com/user-attachments/assets/786c5b94-1d63-4179-82c3-8f9946ffa420" />

### 编码区
<img width="1916" height="917" alt="编码区截图" src="https://github.com/user-attachments/assets/85f568fe-57f4-4a49-83a9-48496b5aefa6" />

### 看板区
<img width="1920" height="930" alt="看板区截图" src="https://github.com/user-attachments/assets/bf5293b0-374a-4a7a-92a1-645d87775cbe" />

### 观测区
<img width="1920" height="984" alt="观测区截图" src="https://github.com/user-attachments/assets/621e63d7-8e94-4e3a-ade2-f647e863020c" />

</details>

## 设计：三层结构与五条契约

```
产品面（人看与操作，Vue + Koa，注入 hermes-studio）
   │ 只读：看板 / 审批 / 团队 / 运行态 / 证据
   ▼
运行面（hermes agent 进程 + Matrix + kanban）
   │ 消费：项目技能（约束、配方、门禁）
   ▼
能力层（swarm-yuan 生成的目标技能）
```

三层之间只有五条跨域契约：技能供给、能力发现与委托、任务与证据、治理与审批、推演验证。三条边界判据如下：

- 写入口唯一：任务真值只在 kanban。
- 读模型不另立真值：派生视图必须能重建。
- 运行时不反向调用：目标技能不调用产品服务。

总体设计事实的整合正本是[终态设计文档](docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md)。文档按理念、产品、架构、交付、治理、实施和验证分层组织，组件内部细节以专题文档与 ADR 为证据。

## 实施：vendor 基线 + 注入

上游基线钉版快照收录在 `vendor/`（git 跟踪 pristine 基线，台账见 [vendor/VENDOR.md](vendor/VENDOR.md)），所有二次开发住在本仓，构建期注入：

- A 类接入：`custom/` 纯新增组件，构建期 alias 重定向加运行时注册。
- B 类 patch：`patches/` 按编号序列 `git apply`，可反向还原。vendor 树注入后的脏态是预期工作态，pre-commit 钩子会阻止误提交。
- 上游升级走净树重放：外置升级源树 `git pull` → `vendor/` 整树替换 → `npm run inject` 重放。0.7.38 到 0.7.39 升级时补丁全量重放通过，二次开发不陷分叉泥潭。
- 仓内其余组件：`simharness/`（全流程推演 harness，subtree 并入）、`skills/swarm-yuan/`（技能本体源码）、`docs/superpowers/`（整合正本、专题规格与决策档案）。

| 基线 | 用途 | 版本 |
|---|---|---|
| [hermes-studio](https://github.com/EKKOLearnAI/hermes-studio) | 桌面应用主体（Vue 前端 + Koa 后端 + Electron 壳），注入目标 | v0.7.39 |
| [hermes-agent](https://github.com/NousResearch/hermes-agent) | Agent 运行时（Python，单网关多路复用） | v0.22.5 |
| zcode（Ycode 引擎底座） | IDE 编码引擎，`zcode-patches/` 注入 | v3.16.1 系列 |
| [element-web](https://github.com/element-hq/element-web) | Matrix 客户端参考实现（无构建依赖，不入仓） | v1.12.32 |

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Pinia + Vue Router + Vite + TypeScript |
| UI | Naive UI + Pure Ink 主题（黑白灰）+ ECharts |
| 通讯 | Matrix（matrix-js-sdk）+ Socket.IO |
| 后端 | Koa + SQLite |
| 桌面 | Electron（可选，日常验证走浏览器 web 版） |
| 测试 | Vitest、类型检查、协议测试与真实浏览器走查 |

## 使用：五分钟跑起来

前置：Node.js 不低于 23.0.0。基线源码已收录 `vendor/`，无需 clone 上游仓。Windows x64 支持见 [docs/windows-x64-setup.md](docs/windows-x64-setup.md)。

```bash
npm run inject                                    # 1. 注入 patch、生成派生 config、建符号链接

cd vendor/hermes-studio
npm install --no-audit --no-fund --ignore-scripts # 2. 安装依赖（node_modules 不入库，克隆后装一次）
mkdir -p dist

cd ../..
npm run serve &                                   # 3. 后端 :8647
npm run dev                                       # 4. 前端 :8649（vite，改代码即时热更新）
```

浏览器打开 `http://localhost:8649`。首次空库引导需后端显式设 `HERMES_WEB_UI_DEV_BOOTSTRAP=1`（出厂默认口令已删除）。已有账号直接登录。

改了 B 类 patch 后须 `npm run clean && npm run inject` 再重启后端。完整走法（三种模式的典型流程、角色旅程、服务重启、排障）见[《使用指南》](docs/USAGE.md)。

## 验证与证据

稳定设计参数和版本基线见[《设计事实与容量基线》](docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md)。动态测试数、补丁数和文档数不在 README 手工维护。

- 代码行为以当次目标测试、全量测试和类型检查结果为准。
- 用户界面以真实浏览器走查为准，桌面构建另行验证。
- 推演结论只覆盖对应 run，证据来自该轮运行目录。
- 历史验证档案证明当时的执行情况，不自动代表当前提交。

## 文档

- [交互式介绍页](docs/intro.html)：一页看懂 AIStudio 与五件套体系，分屏滚动叙事，离线单文件。
- [使用指南](docs/USAGE.md)：启动、三种工作模式走法、角色旅程、重启与排障。
- [AIStudio 终态设计文档](docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md)：理念、产品、设计、实施与验证的唯一正本。
- [Hermes Agent 集群设计文档](team/profiles/orchestrator/references/design-doc/hermes-complete-design-doc.md)：运行面的组织、机制、治理与决策依据。
- [Hermes Agent Architecture](vendor/hermes-agent/website/docs/developer-guide/architecture.md)：上游 agent 引擎与 gateway 内部架构。
- [设计文档导航](docs/superpowers/specs/2026-10-21-ncwk-unified-product-design.md)：正本、附件和历史档案入口。
- [全流程推演方案](docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md)：26 步六闸的推演判据与运行规程。
- [设计事实与容量基线](docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md)：稳定参数、参考部署与版本快照。
- [发布清单 RELEASE-MANIFEST.json](RELEASE-MANIFEST.json)：定义四个独立模块的版本、产物与安装通道。`npm run release:check` 执行对账。
- 发布物为 4 个独立源码包和 1 份整体包。`npm run release:packages` 负责打包，vendor 源码随包，registry 依赖在线安装，SHA256SUMS 随目录提供。
- 历史 spec 索引见[附录 A](docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md)。

## 已知注意点

- 桌面端同版本号覆盖更新有缓存陷阱：`webuiDir()` 优先用 `~/.hermes-web-ui/webui/<version>/` 副本，每次发版须递增版本号并删除旧副本。
- hermes-agent 基线源码已收录 `vendor/hermes-agent`。运行时扩展经 `runtime-manifest.json` 和注册脚本部署。

## 许可证

Apache 2.0。本项目由 AI 100% 完成。上游项目各自的授权约定在运行时部署时适用。
