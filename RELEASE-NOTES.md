# SwarmStudio 发布说明

## 版本
SwarmStudio **2.19**（基于 hermes-studio v0.7.19 + hermes-agent v0.21.2 源码跟踪 + overlay 二次开发；desktop 捆绑 runtime 0.21.0）
SwarmStudio **2.18**（基于 hermes-studio v0.7.19 + hermes-agent v0.21.1 源码跟踪 + overlay 二次开发；desktop 捆绑 runtime 0.21.0）
SwarmStudio **2.17**（基于 hermes-studio v1.0.2 + hermes-agent v0.21.1 源码跟踪 + overlay 二次开发；desktop 捆绑 runtime 0.21.0）
SwarmStudio **2.16**（基于 hermes-studio v1.0.2 + hermes-agent v0.21.1 源码跟踪 + overlay 二次开发）
SwarmStudio **2.15**（基于 hermes-studio v0.7.18 + hermes-agent v0.21.0 源码跟踪 + overlay 二次开发）

> **2.19** — overlay 功能轮 + agent 源码跟踪升级（2026-09-12）：P4 可视化编排器全量合入（画布编排 / 自建 spec 起跑 / 审批 Always-allow / 台账 48 条清偿）+ cockpit 平行共存双入口 + 24h 审查修复 + Loop 入口两轮往返终态（Loop Engineering 按钮还原旧弹窗冻结；顶栏 "Swarm Studio" 字样新增为循环工程图页入口）。hermes-agent **v2026.9.7 (v0.21.1) → v2026.9.11 (v0.21.2)**（986 commits / 1650 文件 +103473/−14021：state.db 损坏分级与 FTS 修复簇（corruption 分类 / 隔离 / lost_and_found 挽救 / sessions repair --check-only 非零退出）、DeepSeek Flash 1M 窗口 + 原生视觉、desktop 本地媒体 range 请求与玻璃表面、local-models GPU 常驻推荐、web 损坏库 503 节流、revert Collective Wisdom V1）。hermes-studio 仍 **v0.7.19**、element-web 仍 **v1.12.27**——零升级。desktop 捆绑 runtime pin 维持 **0.21.0**。

### 2.19 明细

- **P4 可视化编排器**：T1 GraphSpec 元数据 + analyzeGraphSpec 死图检测四铁律；T2-T4 spec-runtime 编辑器节点注册表（plan 三出口 / Best-of-N fan-out / converge 选优 / gate 白名单）+ 自建 spec 起跑 REST + specs 校验/删除/origin；T6-T8 编排器客户端（画布 / 面板 / 守卫 / 导入导出 / 试跑 / 容器框 + 迭代徽标）；T9 审批 Always-allow 按类型记忆（runcenter 自动放行留痕 + 撤销防竞态 + 舰队审批 always 档）；T10/T11 台账服务端/前端批清偿；T12 台账收口核销（48 条逐条处置）。IaNav 底部用户设置入口（齿轮直达 /hermes/settings）。
- **cockpit 平行共存（P4 用户裁决）**：/app IA 与 AI 协作中心（cockpit）双入口共存——视图层 53 文件复原、路由嵌套归位（patch 240）、侧栏双入口（patch 241）、守卫放行、RETRO 回退开关保留。
- **24h 变更审查修复**（fix/24h-review-findings，20 项发现 P0×1 / P1×4 / P2×15 中 16 项修复合入）：gateCommands 模板注入面收口（P0）、graph history 尾窗 latest 语义、日程弹窗双 store 断裂、always-allow 跨面板防重发、specs 删除先持久后内存 + POST /specs id 形状守门、Matrix 客户端键控池、dotenv/inject 面等；2 项经用户裁决不修（always-allow 粒度、matrix-login 公开覆写）。
- **Loop 入口终态（两轮往返）**：a019910 将 Loop Engineering 按钮改导航 /hermes/loop → d3a3d7c 按用户裁决还原旧 LoopModal 弹窗（冻结，再改须先问用户）；终态新增顶栏 "Swarm Studio" 字样入口（5855502）：点击 / Enter 导航 /hermes/loop（hermes.loop），守门测试三断言固化（点击导航 + 键盘可达 + 按钮冻结 emit 不走路由）。
- **hermes-agent v0.21.2 源码跟踪升级 + patch 117 regen（混合解）**：保留上游 `workspace_kind: Optional[str] = None` 继承模型，"默认 dir" 意图收进 `create_task` 的 None 回退行（kanban_db.py ~L1272）+ schema DEFAULT 'dir'（~L863）；patch 从 3 文件缩为 2 文件 3 hunk（kanban_swarm.py 的 create_swarm 默认值改动随上游继承模型吸收，不再需要）。
- **patch 系列 180 → 190**：新增 236-245（236/237 编排器 i18n zh/en、238/239 IaNav 设置入口 i18n zh/en、240 cockpit 平行路由、241 侧栏双入口、242/243 Always-allow i18n、244/245 Fleet always i18n）；无其他 regen。
- **验证门禁**：overlay vitest 131 文件 **1489 过 / 6 skip / 0 fail**（含顶栏入口守门 3 断言新增）；上游 `vue-tsc -b` EXIT=0；全系列 190/190 inject 干净落位（26dcc34a 轮实测）；运行面实测：launchd 监管 gateway running、5 platforms connected、kanban 22 任务可读（agent CLI 直读）。
- **构建物**（2026-09-12，未上传 GitHub / ModelScope，按既定指令）：`SwarmStudio-0.7.19-arm64.dmg` 391,055,844 B（sha256 `e7f2a19964c4edc9884dedfa7407b22269fe43f4abfc577e071ca9f79f24f336`，无签名 adhoc / TeamIdentifier=not set 实测）+ `SwarmStudio-0.7.19-x64.zip` 429,827,893 B（sha256 `5b1d79ece2cd4300f24fbf18715056f02ef3233a75bfe8360209e95395fadcd5`），位于 upstream/hermes-studio/packages/desktop/release/。本机 /Applications 已换装 2.19（xattr 清隔离；webui :8748 健康端点 status ok、gateway running、5 platforms connected；发行包内置顶栏 "Swarm Studio" 入口实测——CockpitView bundle 含新入口锚串）。

> **2.18** — upstream 升级轮（2026-09-11）：hermes-studio **v1.0.2 → v0.7.19**（= v1.0.3 内容 + 0.7.19 版本切割，17 commits/159 文件 +4179/−323：OpenCode session headers 修复 #2996、mobile health data agent bridge #2972、Studio 公告对话框 #2989、会话列表按类别分页 #2977/#2982、Doubao TTS 语速控制 #2978、codex 多行 TOML 配置保留 #2969、workspace 树无隙折叠 #2965、后台委派保留侧栏活动 #2961、Ekko CLI/域名统一 + 圆角图标 #2980、Chromium profile 跨重命名保留 #2979、MCP/Windows 启动修复 #2988）。hermes-agent 仍 **v2026.9.7 (v0.21.1)**、element-web 仍 **v1.12.27**（v1.12.28 仅 rc）——零升级。desktop 包版本随上游 **0.7.18 → 0.7.19**（产物名 SwarmStudio-0.7.19-*，与 2.16/2.17 的 0.7.18 同名产物明确区分）。runtime pin 维持 **0.21.0**。

### 2.18 明细

- **patch 系列 177 → 180**：regen **11**（002 dashboard-env 文档块叠加上游 relay 域名切换；023 chat store import 双向扩展合并；025 登录页 logo-debrand 保持（上游加圆角样式随块删除）；042 版本行取上游 0.7.19、品牌字段保持 SwarmStudio；043 采纳上游 `configureDesktopIdentity` 重构替代我方 inline profile 保留块；088 上游新增 `countSessions` 与我方 `listSessionIdsByUserId` 共存；089/094 chat store 上下文漂移重生成；177 cli-shim 品牌串 7 处保持 SwarmStudio；195 上游 mobile-health import 与我方 fleet-tap import 共存；201 修复重生成丢失的 custom-modules.d.ts）+ 新增 **3**（**233** desktop-identity setName 翻回 SwarmStudio；**234** 删除上游侧栏重构后死代码 openMatrixChat（TS6133，matrix 入口由 ia2 /app/comms 内联路由承接）；**235** 上游 v0.7.19 新增 sessions 测试断言适配我方 116 includeChildren 四参扩展）。
- **2.17 以来 main 并入的 overlay 功能首次进构建**：R1 Brief Matrix 投递（登录会话本机落盘 + 三段式每日 Brief + Matrix 投递 + gateway 凭据链 + HOME_ROOM 回落）、P3 IA 六区域导航（/app 路由树 + 总览首屏 + 介入中心 + 编排区实装 + 工作项↔run 追溯 + observer/engine 卡片）。
- **验证门禁**：重放树 180/180 干净落位；inject 180/180；overlay vitest 110 文件 **1203 过/6 skip/0 fail**；上游完整 build（openapi + vue-tsc -b 严格门禁 + vite + server tsc + build-server）exit 0；上游新增测试 sessions-controller + studio-announcements **84/84**。
- 已知沿用（2.16 决策）：非品牌关键面的上游 Ekko 文案（~600 处，i18n locale 与辅助字符串）保持上游原文不逐条替换。
- **构建物（2026-09-11，未上传 GitHub/ModelScope，按用户指令）**：`SwarmStudio-0.7.19-arm64.dmg` 390,539,182 B（sha256 `6af9aaa4d8216cf7c70bce891a10b3c86e19f34ad688feb5973df392a7d00abc`）+ `SwarmStudio-0.7.19-x64.zip` 429,350,650 B（sha256 `c1dce287fa65fd253fa24f7ba964dcd4f9ab6415fd841dea6ecd84db45d404cc`），位于 upstream/hermes-studio/packages/desktop/release/。本机 /Applications 已装 2.18（0.7.19，webui :8748 HTTP 200 验证通过）。

> **2.17** — 三 upstream 复核（2026-09-10）：hermes-studio 仍 **v1.0.2**（Latest 标记在 v0.7.18 为上游维护者误置，v1.0.2 为实际最新）、hermes-agent 仍 **v2026.9.7 (v0.21.1)**、element-web 仍 **v1.12.27**（v1.12.28 仅 rc）——**零 upstream 升级**。本版为 **overlay 自有功能轮**：AI 协作中心 loop graph 彻底重构三期（P0 内核 + P1 生产切换 + P2 运行中心）全部合入 main（b556bdc → 209ecee，31 commits + P2 squash），patches 148 → **158**（新增 201-212 共 11 条，无 regen）。desktop 捆绑 runtime pin 0.20.6 → **0.21.0**（P2 会话 T5）。

### 2.17 明细（overlay 侧）

- **Loop Graph 彻底重构**（spec: docs/superpowers/specs/2026-09-09-loop-graph-aihub-redesign-design.md）：
  - **P0 图执行内核**：GraphSpec 可序列化 DSL + 守卫回边编译期校验、声明式谓词求值器 PredicateExpr、EventLogStore append-only 事实源（node:sqlite 内置驱动）、CheckpointManager 事件日志驱动 + 检查点 fork、四层有限终止 + join 屏障 + fail-branch + 真 resume、HITL 闭环
  - **P1 生产切换**：LoopInstance→GraphSpec 编译器（六节点拓扑 + 守卫 repair 回边）、五阶段节点工厂、R2 workspace 上下文注入（GRAPH-CONTEXT.md）、RunSpawner 调度收敛、patch 202 生产装配（routes.ts 挂 graphAssembly + GRAPH_ENGINE 三态分流）、graph REST/Socket 真实化 + 数据迁移 + e2e；终审修复波 14/14（router 挂载/scheduleLoop 建环/socket 惰性绑定/verifier-bridge 审批闭环等）
  - **P2 运行中心**：调度收尾（cron 自启/停滞熔断/socket 补试）、interrupt 72h 超时策略（escalate/auto-approve/fail）、graph_specs 表化 + judge pending、persistence 真实 kanban 写入（幂等 + 失败走 repair）、运行中心列表（双轴/合法操作集/待我处理排序）、运行详情（执行图画布 + 时间轴回放 + 三级分辨率）、节点检查器 + 介入收件箱（peek/attach/审批/两态归档）、R1 每日 Brief（三段式结构化汇总 + Matrix 投递）
  - GRAPH_ENGINE 默认 legacy（shadow 浸泡后切 on）
- **登录页默认值**（patch 025）：`@swarm:matrix.test` / `TestPass123!` 预填
- **desktop 捆绑 runtime pin 0.20.6 → 0.21.0**（T5）

### 2.17 验证门禁

inject 158/158 → server tsc 0 错误 → overlay vitest **1015 pass / 6 skip / 0 fail**（104 文件；较 2.16 的 560 净增 455，P0-P2 新测试）→ `npm run build`（vue-tsc -b 严类型门禁 + vite + server tsc + build-server）全绿 → electron-builder mac dmg + win x64 zip 各自独立 invocation 成功。

### 2.17 构建产物（**不上传**，sha256 留档）

```
d3e283b4db791268a1ca8e422b76b351a1b47e689abae1598da88e4c829cba49  SwarmStudio-0.7.18-arm64.dmg
d0b6594613174a6cad3b07eda6fa0603480ccef73d7e6e4e5b25143249d567d1  SwarmStudio-0.7.18-x64.zip
```

（按指示本版 mac arm64 dmg + win x64 zip **不上传** GitHub Release 与 ModelScope；desktop bundle 版本号维持上游 0.7.18（v1.0.2 上游 quirk），与 2.16 同名，以 overlay 版本 + sha256 区分。）

> **2.16** — hermes-studio v0.7.18 → **v1.0.2**（2026-09-09 发布的 Latest；15 commits、301 文件 +9281/−3545：上游品牌重塑 Ekko Studio + MCP 名称迁移、任务计划持久化与聊天内实时进度、聊天文件链接按引用行预览、浏览器标注删除/撤销、App 通知事件整合、host 级 Agent 更新策略基座、原生 OpenCode Free provider + 免 key 编码代理、技能开关默认恢复修复、MCP 触发的桌面重启循环修复、中继桥免确认关闭、桥接重启超时修复、TTS 语义符号保留、跳过思考块朗读）。hermes-agent v0.21.0 → **v0.21.1**（v2026.9.7，2026-09-07 发布；≈6000 commits：审批环境变量拆分转义与 argv0 操作数修复、kanban 唤醒/路由锚点/心跳生命周期/网关所有权一批加固、桌面 READY 哨兵合并缓冲修复）。element-web 维持 **v1.12.27**（仍是最新稳定版）。

### 2.16 迁移工作（overlay 侧）

- **11 个 patch regen**：studio 7（023/025/041/042/043/141/177 — 品牌三件套撞上游 Ekko Studio 改名，品牌字段按 042 先例保留 SwarmStudio；141/151 区域撞上游桌面重启循环修复；025 登录页去 logo 化维持）+ agent 4（117/118/178/179 — 上游把 kanban.py 拆分为 kanban_parser/kanban_boards/kanban_output 多模块，178 跨文件移植：任务动词留 kanban.py、boards 动词→kanban_boards.py、parser spec→kanban_parser.py、任务字段表→kanban_output.py；177 品牌字符串、118 run-trace 种子逻辑重挂上游重构后的 profile 创建流程、117 workspace_kind 默认值两行重放）
- **新增 patch 201**（vue-tsc 迁移修复）：上游 v1.0.2 build 脚本新增 `vue-tsc -b` 严类型门禁（2.15 从未跑过），暴露并修复：`@/custom/*` 以通配 ambient 声明解析（custom 树维持 overlay vitest + vite 构建验证姿态，不进上游严格 vue-tsc）；**修复 2.15 起即存在的 `openMatrixChat` 未定义潜伏 bug**（侧栏 Matrix 按钮点击即报错）；chat.ts/ChatPanel/GroupChatPanel/WorkflowView 上游重构后的残留引用清理；GroupMessageList 网关告警过滤改用 `isGatewayNotice` 内容检测（group 消息链路无 systemType 打标）
- **验证门禁**：inject 148/148 → server tsc 0 错误 → overlay vitest 560 pass/6 skip/0 fail（较 2.15 净增 19 个测试）→ vue-tsc 0 错误 → openapi 429 endpoints → vite build + build-server 全绿 → 上游 patch 触及区测试（kanban-routes/hermes-kanban-service/auth-routes-avatar 27 个 + matrix 六件 30 个）全过；agent 侧 4 patch 重放零失败 + 9 个触及文件 Python 语法校验 + `kanban --help` 冒烟可见 set-reasoning/estimate 动词
- 本版构建产物（mac arm64 dmg + win x64 zip）**不上传** GitHub Release 与 ModelScope（按指示暂缓发布）



### 2.16 构建产物（未发布，sha256 留档）

```
412cbffadf4f603ff7c93e12dbacc98b8775f5ec37676e57fbf51d76a4145f81  SwarmStudio-0.7.18-arm64.dmg
5262612f3d8133b5bfd17c01d22e5e23d9e20ea27f4499410265d3e57b34ae04  SwarmStudio-0.7.18-x64.zip
```

（按指示未上传 GitHub Release 与 ModelScope；发布时以此 sha256 为准区分同名产物 SwarmStudio-0.7.18-*。）

> **2.15** — hermes-studio v0.7.17 → **v0.7.18**（2026-09-06 发布的 Latest；31 commits、218 文件 +9017/−948：OpenCode coding agent、群聊云端中继远程 agent、移动端日历/定位一次性授权、会话操作菜单整合、Runtime 轮询收敛 super admin、Windows runtime 修复批次）。hermes-agent 维持 **v0.21.0**（v2026.8.31 仍是最新 stable tag）。element-web 维持 **v1.12.27**（仍是最新稳定版）。runtime pin 维持上游原生 `hermes-0.20.6-runtime`（v0.7.18 未改 pin，仓库的 hermes-0.21.0-runtime tag 仍未被上游引用）。

### 2.15 明细

**上游版本**

| 仓库 | 版本 | 变化 |
|------|------|------|
| hermes-studio | v0.7.18 | v0.7.17 → v0.7.18（31 commits，218 文件 +9017/−948） |
| hermes-agent | v0.21.0（v2026.8.31） | 不变（仍为最新 stable） |
| element-web | v1.12.27 | 不变（仍为最新 stable） |

**上游 v0.7.18 主要内容**（31 commits）

- **OpenCode coding agent**：新增 OpenCode 支持（#2890）、失败 MCP runtime 隔离与移除清理（#2888）、OpenCode 图标贯通（bcf49d67）、chat-run 的 worker 分流纳入 opencode
- **群聊云端中继**：远程 agent 云端传输（b5b2acd8）、远端输出批量有序 ack（91bb81a5）、群 agent socket 隔离与断线重连重加入（0d7c6c3e）、共享群访客可看已发布 agent 图片（27544731）、中继 payload 保留与 summary 状态恢复（f901f570）、工具折叠与移动端布局对齐单聊（#2927）、消息引用回复箭头恢复（#2903）
- **移动端能力**：一次性定位请求（#2820）、日历/提醒整合与 consent（#2926，新增 mobile-device-target / mobile-calendar 服务）
- **会话体验**：会话操作菜单整合（#2912）、移动菜单直接建分类（#2887）、分类折叠状态刷新保留（#2896）
- **桌面/runtime**：空闲 Runtime 轮询停止且仅 super admin 可见（#2925，App.vue RuntimeRestartPrompt 加 `isStoredSuperAdmin` 门）、跨平台设置快捷键（#2910）、Windows tar 缺失回退 Node tar（d0e6f1cc）与解压隔离（3a122952）、split Hermes runtime 的 MCP bridge import 修复（cdfc1b14）、托管 MCP 启动 harness 强制 Node 模式（89e1bf7b/7905706f）
- **聊天/文件 UX**：workspace Markdown 预览（#2908）、代码样式本地文件链接预览（62eb9049）、上传图片发送前预览（#2885）、消息引用改引号图标（#2893）、下载页购买 CTA（#2895）、Ekko 重复工具失败恢复（#2891）、server env parser 空值跨行正则修复（#2884）

**patch 迁移（4 regen / 147 active）**

初次顺序干跑（pristine v0.7.18 + 全系列重放）仅 4 处失败，全部为上下文漂移型冲突，逐个 3-way 合并解决：

- **042**（desktop package.json rebrand）：version 行随上游 0.7.18，品牌字段（name/description/author）保持我方——新版 patch 不再触碰 version 行；
- **070**（App.vue）：上游 #2925 新增 `isStoredSuperAdmin` import 与 RuntimeRestartPrompt 条件，与我方 authStore import 并存（双保留）；
- **102**（GroupMessageList）：上游 emptyStateAgents 新增 OpenCode 行，与我方 gateway 消息过滤器/banner 改动错位共存；
- **195**（chat-run fleet-tap）：上游 import 块新增 mobile-calendar 组，与我方 fleet-tap import 并存（双保留）。

i18n 级联链（074/075 → 139/140 → 158–200 共 20 个 patch）全部干净通过，零冲突。

**回归与验证**

- progressive 树（v0.7.17 + 144 个 studio patch 逐个提交）重建 0 失败；regen 后在全新 v0.7.18 树全量重放 **0 失败**、终态与 regen HEAD 逐字节一致；真实树 clean 反向 **147/147**。
- inject **147/147**（studio 144 + agent 3）；server `tsc --noEmit` 0 错；overlay vitest **74 files / 541 pass / 6 skip / 0 fail**（与 2.14 基线完全一致）；`build:full` 产出新鲜 dist。
- 构建插曲：钥匙串新出现两张同名 Apple Development 证书，electron-builder 自动拾取签名后 macOS 26 XProtect 将未公证签名应用判为恶意软件并启动时自动删除；最终按 2.x 惯例以 `CSC_IDENTITY_AUTO_DISCOVERY=false` 禁用签名重新构建（与 2.14 可用状态一致），GitHub/ModelScope 的 dmg 已替换为无签名版。

**已知边界（沿袭 2.14）**

- runtime pin 仍为 `hermes-0.20.6-runtime`：agent 0.21.0 源码创建的看板 DB 在旧 runtime CLI 下仍会报 `no such function: kanban_write_sanctioned`，待上游 bump `hermes-0.21.0-runtime` 后自动解决。

**构建产物**（2 个构建物：mac arm64 DMG + Windows x64 zip）

| 构建物 | 大小 | sha256 |
|------|------|------|
| SwarmStudio-0.7.18-arm64.dmg | 391,898,109 B（373.8 MiB） | `df35af46e419f9656355bdf4f19f936be1cdde7e92bdf8945413586b8e7f0629` |
| SwarmStudio-0.7.18-x64.zip | 429,682,841 B（409.7 MiB） | `cb08cc0c67eb6ef5ac3330776ef94b7df4dd80d539b726f1945562c3f31ffe57` |

（未发布副产品：arm64.zip、x64.exe。**注意**：mac 构建按 2.x 惯例为无签名/未公证产物——钥匙串中出现 Apple Development 证书时 electron-builder 会自动拾取签名，而 macOS 26 XProtect 会将此类未公证签名应用判为恶意软件并在启动时自动删除；因此本轮以 `CSC_IDENTITY_AUTO_DISCOVERY=false` 显式禁用签名（与 2.14 的可用状态一致，TeamIdentifier=not set），已发布的 dmg 为无签名版。）

---

SwarmStudio **2.14**（基于 hermes-studio v0.7.17 + hermes-agent v0.21.0 源码跟踪 + overlay 二次开发）

> **2.14** — hermes-studio v0.7.16 → **v0.7.17**（20 commits、115 文件 +6909/−723：coding agent Skills/MCP 视图统一、Boring Avatars、桌面退出生命周期重构、Grok/Codex/Ekko 修复批次）。hermes-agent 维持 **v0.21.0**（v2026.8.31 仍是最新 stable tag）。element-web 维持 **v1.12.27**（仍是最新稳定版）。runtime pin 维持上游原生 `hermes-0.20.6-runtime`（v0.7.17 未改 pin；仓库已出现 hermes-0.21.0-runtime tag 但上游尚未引用，随上游后续 bump 自动跟进）。**2.13（指挥中心升级）未单独发布，随本轮 2.14 一并上车。**

### 2.14 明细

**上游版本**

| 仓库 | 版本 | 变化 |
|------|------|------|
| hermes-studio | v0.7.17 | v0.7.16 → v0.7.17（20 commits，115 文件 +6909/−723） |
| hermes-agent | v0.21.0（v2026.8.31） | 不变（仍为最新 stable） |
| element-web | v1.12.27 | 不变（仍为最新 stable） |

**上游 v0.7.17 主要内容**（20 commits）

- **coding agent 体验统一**：Skills 与 MCP 视图合并（#2871）、设置导航（#2854）、Grok 配置页对齐其他 agent（#2870/#2868）、Grok 失败会话续跑（#2857）、Grok/Codex 切官方 npm registry（#2855/#2881）
- **头像更换 Boring Avatars**（#2875，替换生成式头像）
- **app-relay / app-connections**：生产端点恢复（#2874）、entitlement 失败透出（#2872）、购买链接与失败本地化（#2873）
- **桌面退出生命周期重构**：tray quit 可取消待执行重启（#2852，新增 `app-lifecycle` 模块）、已处理的重启提示持久化（#2842）
- **Ekko 加固**：超大工具输出截断（#2847）、记忆与工作区处理加固（#2846）、provider 不安全 MCP 工具名代理过滤（#2849）
- **其他**：TTS 启动时激活 provider 水合（#2839）、Skills 路径保留字符编码（#2845）、移动渠道版本支持（#2843）

**patch 迁移（8 regen / 147 active）**

初次干跑 12 失败，其中 4 个为 agent 仓 patch（studio 树上预期失败），实际冲突 8 处：

| patch | 冲突点 | 解决 |
|-------|--------|------|
| 026-client-accountsettings-matrix | AccountSettings.vue 上游改动 | 3-way 干净合并，零手工 |
| 042-desktop-rebrand-swarmstudio-pkg | 版本行 0.7.16→0.7.17 vs 品牌字段 | 版本取上游 0.7.17，品牌取 ours（先例沿用） |
| 070-cockpit-App.vue | 上游 #2839 在 App.vue 用 profilesStore 替换了 authStore 位 | 双保留：upstream `profilesStore`（TTS 水合）+ ours `authStore`（fetchUser） |
| 080/136/137/138 依赖 patch | 根 package.json 依赖块插入位偏移（上游新增 boring-avatars-vanilla 等） | 并集合并，双方依赖都保留 |
| 151-desktop-startup-quit-logging | 上游 #2852 把退出逻辑抽成 `app-lifecycle` 模块，`quitApp`/`isQuitting` 结构变更 | 日志移植到新架构：`quitApp` 保留 reason 参数并委托 `appLifecycle.quit()`；before-quit 改用 `appLifecycle.isQuitting` |

**2.13 功能随车发布**：2.13（指挥中心升级：舰队网格 / 看板服务端聚合 / 团队注册表 / 注意力收件箱 / 群聊与工作流回航）此前已合入 main 但未产出构建物，本轮与上游升级合并为 2.14 一次性发布。

**验证**

- `npm run inject` 147 patches 全量干净应用（143 studio + 4 agent）
- Phase 0 交叉验证：v0.7.17 重放终树 vs 线上 2.13 注入树，差异 92 文件全部可由上游 v0.7.16→v0.7.17 变更解释，无 overlay 改动丢失
- server `tsc --noEmit` 0 错误；`npm run build:full` 通过
- overlay vitest：**74 files / 541 pass / 6 skip / 0 fail**（与 2.13 基线完全一致）
- upstream patch 触碰面测试：kanban 三件套 + auth-routes-avatar（44 pass）、matrix ×6（30 pass）

**构建产物**（macOS arm64 DMG + Windows x64 zip）

- `SwarmStudio-0.7.17-arm64.dmg`（373.7MB）
  `4e9cad848c35b2edf63edd6793a2b9cbf65627a940d55e34bb777b8ffe85a89d`
- `SwarmStudio-0.7.17-x64.zip`（409.7MB）
  `0e0802e975c538613b8c44e07c1bb8995cf29c6c466426aa0f3a6f3b356f9a7b`

---

## 历史版本

SwarmStudio **2.13**（基于 hermes-studio v0.7.16 + hermes-agent v0.21.0 源码跟踪 + overlay 二次开发；未单独发布，随 2.14 上车）

> **2.13 指挥中心升级（Command Post）** — 本轮为 overlay 功能版本：上游三仓维持 2.12 基线（hermes-studio v0.7.16 / hermes-agent v0.21.0 / element-web v1.12.27）不动，全部能力来自 overlay 追加（patch 195–200 + custom 代码 +3253 行）。目标：让 AI 协作中心成为多团队 × 多任务并行的日常主指挥岗位——补齐相对 hermes TUI / Claude Code 的核心差距（多会话同屏、跨团队组织、统一待办、群聊会话面）。

### 2.13 明细

**A. 舰队网格（Fleet Grid）— 治"单会话视角"**
- 新增服务端跨 profile 会话聚合：patch 195 把 ChatRunSocket 实例注册给 custom fleet-tap，快照 = 内存 sessionMap（isWorking/队列/最近 200 条事件/尾部预览）+ sessions DB 合并，零额外子进程。
- 新 WS `/api/hermes/fleet/events`：1.5s tick 推送全量快照（按用户 profile 权限过滤、变化才发）；REST `GET /api/hermes/fleet/sessions`。
- cockpit 右栏新模式"舰队"：网格卡片（状态点/profile 徽标/运行时长/尾部预览/队列徽标），**待审批可就地一键批准/拒绝、待澄清就地应答**（`POST /api/hermes/fleet/approval|clarify`，跨 profile），点击卡片秒切全量聊天（自动切 profile）。

**B. 看板服务端聚合 — 治"N+1 轮询"**
- 新 `GET /api/hermes/kanban/overview`：一次返回全部 board + 任务（board 级 10s 缓存 + in-flight 去重）。
- 新 WS `/api/hermes/kanban/overview/events`：每 board 一个共享 `hermes kanban watch`（引用计数、闲置 5 分钟回收），事件扇出触发客户端去抖刷新；客户端 30s 盲轮询降为 60s 兜底。

**C. 团队注册表 — 治"无团队实体"**
- Team = { profiles, boards, pinnedSessions } 具名集合，JSON 原子存储于 `~/.hermes-web-ui/overlay/teams.json`，REST CRUD（`/api/hermes/teams`，super_admin 写）。
- cockpit TopBar 团队切换器 + 管理弹窗；切换团队后看板列/注意力条/舰队/收件箱全部按 team 收窄；选择记忆（localStorage）。

**D. 统一注意力收件箱 — 治"四套分散信号"**
- 权重排序：审批 > 阻塞 > 澄清 > 待审 > 待分类 > 会话未读 > Matrix/群聊未读 > 待办提醒；原通知面板升级为"指挥收件箱"（徽标计数改为全源），审批/澄清就地处理，任务类点击选中对应看板任务。

**E. 群聊 / 工作流回航 — 治"死链"**
- patch 198 反转 071 的路由删除：恢复 `/hermes/workflow`、`/hermes/group-chat(+/room/:roomId/+2 redirect)`；GlobalPendingActions / PageSidebarNav 的群聊与工作流审批深链复活，服务端 40+ 端点的多 agent 群聊重新有 UI 入口（cockpit 的 groupStore 本就连着）。

**回归与验证**
- 干净基线（pristine v0.7.16）全量注入 **147/147** patch 通过；server `tsc --noEmit` 0 错；`build:full` 产出新鲜 dist。
- overlay vitest：**74 files / 541 pass / 6 skip / 0 fail**（2.12 基线 69/518/6/0，新增 5 个测试文件 +23 用例：fleet-tap / kanban-overview / teams-store / inbox-adapter / fleet-adapter；notify-modal 测试适配新收件箱语义）。
- upstream i18n-coverage 维持既有失败面（26 个静态缺失键，数量与 2.12 一致，无新增）。

**已知边界（记录在案，后续版本）**
- 舰队快照的"尾部预览"来自内存消息尾，历史会话只有 idle 状态 + lastActive；非 running 会话不回放事件流。
- Loop 引擎真执行（E6）、终端指挥面扩容（E7）、cockpit 用户态全量服务端化（E10）未在本轮范围，见 `docs-cockpit-command-post-2.13.md` 非目标节。

---

## 历史版本

SwarmStudio **2.12**（基于 hermes-studio v0.7.16 + hermes-agent v0.21.0 源码跟踪 + overlay 二次开发）

> **2.12** — hermes-studio v0.7.15 → **v0.7.16**（2026-09-02 发布的 Latest；同 commit 双标签 **v1.0.1**——上游在打 0.7.16 的同时补打了 1.0 线标签，内容完全一致；6 commits、122 文件 +3845/−332：Grok coding agent / coding-agents 隔离全局模式 / Windows 旧版数据安全迁移 / runtime 重启桥接修复）。hermes-agent 维持 **v0.21.0**（v2026.8.31 仍是最新 stable tag，本轮无新版本）。element-web v1.12.26 → **v1.12.27**（1.12.27 已正式发布，参考实现同步 checkout）。runtime pin 维持上游原生 `hermes-0.20.6-runtime`（`0.21.0-runtime` 仍未发布，agent 源码跟踪 0.21.0 与 runtime 0.20.6 分离惯例延续）。

### 2.12 明细

**上游版本**

| 仓库 | 版本 | 变化 |
|------|------|------|
| hermes-studio | v0.7.16（=v1.0.1） | v0.7.15 → v0.7.16（单 tag，6 commits；v1.0.1 为同 commit 双标签） |
| hermes-agent | v0.21.0（v2026.8.31） | 不变（仍为最新 stable） |
| element-web | v1.12.27 | v1.12.26 → v1.12.27（参考实现，非构建依赖） |

**上游 v0.7.16 主要内容**（6 commits）

- **Grok coding agent**（#2832）：coding-agents 阵容新增 Grok（内置 agents 空状态插画同步新增 Pi/Grok 形象）
- **coding-agents 隔离全局模式**（#2828）：Studio 全局（跨 profile）支持 coding agent 隔离运行
- **Windows 旧版 Hermes 数据安全迁移**（#2834 + #2836）：legacy Windows 数据目录迁移 + 迁移范围收紧（只动确认属于 Hermes 的数据）
- **bridge 远程 runtime 重启桥接**（#2827）：runtime 重启事件正确透传到桌面端（RuntimeRestartPrompt 联动）

**patch 迁移（3 regen / 141 active）**

初次干跑仅 3 失败（2.11 同期为 19），上游 0.7.15→0.7.16 变更与 overlay 触面基本正交：

| patch | 冲突点 | 解决 |
|-------|--------|------|
| 042-desktop-rebrand-pkg | package.json 版本行 0.7.15→0.7.16 vs 品牌 | 版本取上游 0.7.16，品牌取 ours（2.11 先例沿用） |
| 102-groupmessagelist-gateway-banner | 上游 emptyStateAgents 新增 Pi/Grok 两行，hunk#2 上下文错位 | 过滤器逻辑不变，上下文重排后 regen |
| 141-desktop-win-file-logging | index.ts import 块上游新增 setWebUiRestartRequestHandler，hunk#1 错位 | import 并集 regen（2.11 的 144 先例） |
| 151-desktop-startup-quit-logging | 同文件级联失败 | 141 修复后零改动通过 |

**验证**

- `npm run inject` 141 patches 全量干净应用（clean → inject 端到端复跑）
- `npm run build:full` 通过（client + server + openapi）
- `npm test` 69 文件 518 passed / 6 skipped
- `build:full` vite 构建 + electron-builder mac/win 双产物

**构建产物**（sha256 见下）

- `SwarmStudio-0.7.16-arm64.dmg`（macOS arm64，375MB）
  `d3ea40218e49be74a11f63f35f31372174dcd77fe7a35cb79ba717e205777d8b`
- `SwarmStudio-0.7.16-x64.zip`（Windows x64，411MB）
  `3fda92c77c699c072fb96667800a685a75a491a33df52bc06d55fc540fc1c6f9`

### 2.11 归档说明（上一版，基于 hermes-studio v0.7.15）

> **2.11** — hermes-studio v0.7.12 → **v0.7.15**（2026-09-01 发布的 Latest，v0.7.13/14/15 三个 tag、9 commits、80 文件 +4053/−1074，全部集中在 runtime 稳定性）+ hermes-agent v0.20.6 → **v0.21.0**（v2026.8.31，"Pantheon" 大版本，911 commits：Bot Mode / hermes peer / cron 记忆 / 子代理实时转向 / MCP 指挥中心 / 桌面浏览器接管）。element-web v1.12.26 仍是最新稳定版（1.12.27 仅 rc），本轮不动。runtime pin：上游原生 `hermes-0.20.6-runtime`（`0.21.0-runtime` 截至 2026-09-01 仍未发布，probe 404），agent 源码跟踪 v0.21.0 与 runtime 0.20.6 暂时分离（同 2.6/2.9 惯例，0.21.0 runtime 发布后随上游 pin 自动跟进）。

### 2.11 明细

**上游版本**

| 仓库 | 版本 | 变化 |
|------|------|------|
| hermes-studio | v0.7.15 | v0.7.12 → v0.7.15（v0.7.13 / v0.7.14 / v0.7.15 三个 tag） |
| hermes-agent | v0.21.0（v2026.8.31） | v0.20.6（v2026.8.27）→ v0.21.0，911 commits |
| element-web | v1.12.26 | 不变（1.12.27 仅 rc） |

**上游 v0.7.13–15 主要内容**（9 commits，runtime 稳定性专项）

- **runtime 重启循环与离线版本检查修复**（#2822）：RuntimeRestartPrompt 确认式重启、Hermes 版本探测不再触发更新检查
- **Hermes CLI 与 bridge runtime 选择统一**（#2808）：CLI/bridge/桌面三端 runtime 解析收敛到同一套选择逻辑
- **无效 runtime 回退处理修复**（#2815）、**Windows runtime 文件系统重试**（#2801）
- **ekko-agent 有界文件读取 + 原生命令**（#2812，安全加固）
- **创建 Hermes 会话时复用 Agent 状态**（#2805）

**上游 agent v0.21.0 主要内容**（"Pantheon"，911 commits）

- **Bot Mode**：agent 社会化——命名 + 头像 + 共享 roster + Discord 式群聊（bots 互聊 + @提及）
- **`hermes peer`**：bot 与 bot 之间跨 profile/gateway 的持久 DM
- **cron 记忆与连续性**：定时任务加载/更新持久记忆、continuity 输出延续、durable notepad、monitor 无变化跳过 LLM
- **子代理实时转向**：delegate_task 运行中列表 / 纠偏 / 提前止损收部分结果；子输出 JSON-schema 校验
- **MCP 指挥中心**：server+catalog 合一桌面页、后台健康检查、fleet 成本面板、`hermes://` 深链装
- **CLI**：Ctrl+P 命令面板、/status（reasoning/审批/上下文）、状态栏 cache-hit%/延迟/tokens-per-ticks、全局急停
- **桌面浏览器接管**：agent 直接导航/点击/读取内置浏览器页面
- **provider 浪潮**：Meta Model API（Muse Spark）/ CommandCode / Tencent TokenPlan / Nebius Token Factory / Ramp Router / Actual Computer；`model_overrides` 自助修 context/pricing
- **安全**：AGENTS.md/skills/memory 写入强制审批（prompt-injection 防线）、泄密红线大扫除、Windows 破坏性命令审批、macOS TCC 稳定签名身份
- **kanban**：上游原生 `boards export/import`（tar.gz 便携归档，与我们 patch 178 的 set-project 正交共存）

**patch 迁移（10 regen / 1 退役 / 141 active）**

初始干跑 19 失败，解开级联后真实冲突 5 处，其余自动 3-way 合入：

| patch | 冲突点 | 解决 |
|-------|--------|------|
| 042-desktop-rebrand-pkg | package.json 版本行 0.7.12→0.7.15 vs 品牌 | 版本取上游 0.7.15，品牌取 ours（先例沿用） |
| 144-server-bridge-stderr-capture | manager.ts import 块（上游 +execFileSync） | 两侧 import 并集 |
| 149-runtime-manager-require-run-agent | runtime-manager.ts 必需文件列表 | **退役**：上游已原生含 run_agent.py/cli.py 检查（同 108 先例） |
| 178-agent-kanban-cli-verbs | kanban.py 3 处（上游新增 export/import 撞 set-project） | 两侧并存（export/import + set-project），kb API（_normalize_board_slug 等）验证在位 |
| 188-desktop-runtime-local-priority | paths.ts import（上游已含 dirname） | 取上游 import；本地优先逻辑 hunk 全部落位，runtime-manager.ts:247 活路径验证 |

自动合并（干净 3-way）：074/075（cockpit i18n en/zh）、118（agent profiles run-trace）、141（win 文件日志）、143（bridge worker 端口）、187zh（i18n 去重 zh）。i18n 级联（161/162/167/168/187en/190/191）在 074/075 regen 后全部干净应用。

**验证**

- inject 141/141 全过（studio 137 + hermes-agent 4）；pristine v0.7.15/v2026.8.31 双树序列化重放 141/141 零干预
- server `tsc` 0 errors；desktop `build:main` 通过
- overlay vitest 69 文件 518 passed / 6 skipped / 0 failed（与 2.9/2.10 基线一致）
- 上游 patch 触区测试 60/60（kanban-routes/controller/service + auth-routes-avatar + runtime-version-manager + web-ui-restart）
- 上游全套（4797 tests）：4722 通过；68 失败已逐类归因——Pinia 初始化类（login-view/sidebar-search 等，patch 与测试字节同 2.10，2.10 既有）、HOME 泄漏类（runtime 测试在本机 ~/.hermes 存在时失败，沙箱 HOME 后 29/29 全过，打包态 isPackaged() 短路不受影响）、overlay 有意分叉类（上游测试断言原版行为，如 server user-auth/sessions-db 与 brand/sidebar）。无 2.11 迁移引入的回归。
- `build:full` vite 构建 + electron-builder mac/win 双产物

**构建产物**（sha256 见下）

- `SwarmStudio-0.7.15-arm64.dmg`（macOS arm64，375MB）
  `06d1f2f8fcab7f25f78193fbc69d2d74c18d7ace2d605d97dde7580c5352239e`
- `SwarmStudio-0.7.15-x64.zip`（Windows x64，411MB）
  `9dec92391ff06193734ad913b0f1cc32e484459b8850faf97f2789a510dce9a9`

### 2.10 归档说明（上一版，基于 hermes-studio v0.7.12）

> **2.10** — hermes-studio v0.6.47 → **v0.7.12**（2026-08-30 发布的 Latest，跨 minor 大版本：1521 文件 +69K/−22K 行，服务端全量模块化重构 + Ekko Agent 并入 Studio + API 前缀 hermes→studio）。hermes-agent v0.20.6（v2026.8.27）与 element-web v1.12.26 仍是最新稳定版，本轮不动；上游 desktop runtime 已原生 pin `hermes-0.20.6-runtime`（ref v2026.8.27）与我们跟踪的 agent 一致，patch 108 使命完成摘除。

### 2.10 明细

**上游版本**

| 仓库 | 版本 | 变化 |
|------|------|------|
| hermes-studio | v0.7.12 | v0.6.47 → v0.7.12（v0.7.0 / v0.7.1 / v0.7.11 / v0.7.12 四个 tag） |
| hermes-agent | v0.20.6（v2026.8.27） | 不变（仍为 Latest） |
| element-web | v1.12.26 | 不变（1.12.27 仅 rc） |

**上游 v0.7.x 主要内容**（v0.6.47→v0.7.12，1521 文件）

- **服务端模块化重构**（PR #2744 canonical module ownership）：`db/hermes`、`controllers/`、`routes/`、`services/` 全量迁入 `modules/studio|hermes`；REST API 前缀 `/api/hermes/*` → `/api/studio/*`（保留 legacy-app-api 别名中间件兼容旧调用）
- **Ekko Agent 并入 Studio**（PR #2752/2760）：独立 ekko-agent 合并为 `packages/ekko-agent`，统一 agent runtime 管理，托管 memory/skills/MCP/全局配置、并行工具调用
- **Agent Bridge 强化**：shell-wrapped 运行时启动修复、降级运行时模块自愈、Windows Hermes home 标准化与启动崩溃隔离
- **desktop runtime 默认 Hermes 0.20.6**（PR #2781）+ 升级启动崩溃隔离、pending interaction 超时 UX 改进
- **chat 体验**：DeepSeek thinking tool calls（Ekko）、chat-chain 相关 246 文档、global Coding Agent reasoning 控制收敛、附件传输与媒体预览改进

**patch 迁移（142/142 全过 = studio 138 + hermes-agent 4）**

| 类别 | 数量 | 说明 |
|------|------|------|
| 全局路径重写 | 36 文件 | 27 条 server 模块化映射（db/controllers/routes/services → modules/studio\|hermes）+ API studio 前缀 + mock 相对路径 |
| 重生成 | 17 | 008→bootstrap/http、020（5-tab 会话切换）、025 LoginView、070 App.vue、071 router cockpit、072 AppSidebar、097/098/123/124（files root 沙箱）、107/157（agent-health 代理）、113、134/135/189（loop/terminal 路由→bootstrap/routes.ts）、194（PTY 上限，收编上游 killPtySession 中心化 helper） |
| 上下文修复 | 22 | 011/012/013/014/023/024/026/027/034/035/038/042/078/088/089/101/115/116/139/140/141/144/169 |
| 摘除 | 2 | 108（上游原生 pin hermes-0.20.6-runtime）、133（上游侧边栏重构后锚点消失，仅剩无实效注释） |
| 干净应用 | 其余 | 含 hermes-agent 4 patch 直接落于 v2026.8.27 纯净基线 |

**custom/（A 类）适配**：`@/api/hermes/{sessions,chat,files}` → `@/api/studio/*` 模块导入清扫（16 文件，运行时 URL 由上游 legacy 别名兜底）；files-root 测试断言同步 studio 前缀。

**验证**

- inject 142/142 全过（studio 138 + hermes-agent 4）
- server `tsc` type-check 0 errors；desktop `build:main`（tsc）通过
- overlay vitest 69 文件 518 passed / 6 skipped / 0 failed（与 2.9 基线一致）
- `build:full` 真实 vite 构建 + server esbuild 通过；mac arm64 DMG + win x64 zip 双产物打包签名完成

**构建产物**（sha256 见下）

- `SwarmStudio-0.7.12-arm64.dmg`（macOS arm64，375MB）
  `f4790d1675c066dd31a4dc7f8b3619b79e18d5a22680ceec6694efe88e2318ca`
- `SwarmStudio-0.7.12-x64.zip`（Windows x64，411MB）
  `742753505e0c2ca47fdff33cacfa35e871856e6f7f93b08ca945bf782884956f`

### 2.9 归档说明（上一版，基于 hermes-studio v0.6.47）


> **2.9** — hermes-agent v0.20.5 → **v0.20.6**（v2026.8.27，2026-08-27 发布的 Latest，1376 commits / feat 116 + fix 824 + test 124，6 个 patch 目标文件中上游触碰 2 个但均未落入我们的 hunk 上下文 → **4 个 agent patch 零 regen** 纯净树序列化重放全过）。hermes-studio v0.6.47 与 element-web v1.12.26 仍是最新稳定版，本轮不动；`hermes-0.20.5-runtime` / `0.20.6-runtime` 上游均未发布（probe 404），patch 108 的 runtime pin 维持 0.20.4。本版同时搭载 2.8 之后合入 main 的两项 overlay 功能：**Cockpit 终端多工具**（Claude Code > Codex > DeepSeek Harness 优先顺序）与 **PTY 泄漏修复**（2026-08-28 P0 事故：卸载后僵尸重连孤儿连接 + 服务端并发上限 100，patches 189–194）。产物名沿用 studio 基线 `0.6.47`（agent-only 升级，同 2.6 惯例），与 v2.8 同名不同 sha，以 release tag + sha256 区分。

### 2.9 明细

**上游版本**

| 仓库 | 版本 | 变化 |
|------|------|------|
| hermes-studio | v0.6.47 | 不变（仍为 Latest） |
| hermes-agent | v0.20.6（v2026.8.27） | v0.20.5（v2026.8.19）→ v0.20.6 |
| element-web | v1.12.26 | 不变（1.12.27 仅 rc） |

**上游 v0.20.6 主要内容**（1376 commits）

- **真实浏览器 Profile**：consent-gated 本地默认 Chromium real-profile（agent-browser copy + browser-use CDP）、Windows real-profile close-with-approval 流程
- **托管 SSH 更新引擎**：main process 集成 managed update engine、per-connection SSH 更新、gateway 经 control socket 暂停而非 tree-kill、fleet profile rail（所有已注册 gateway 的 agent 同条展示）
- **模型目录**：GLM-5.3-Flash（z.ai / OpenRouter / Nous Portal）、MiniMax M3 free / H3 Max（FAL t2v+i2v）、Inkling free models
- **群聊/会话**：群聊回合 Stop 按钮、只读 stored-transcript resume、legacy NULL-profile 行一次性 owner backfill、browser_exec 行以首个 `#` 注释为标题（对齐 CLI/TUI）
- **压缩**：lean tail retention 默认化（compaction 保留 10–25K verbatim 而非 100–240K）
- kanban review handoff summary 带入唤醒回合；agent-as-provider 自身 tool work 折回回合；Slack unfurl_links/unfurl_media 控制；macOS Full Disk Access 一键引导

**patch 迁移（0 regen / 4 clean）**

| patch | 目标文件 | 上游触碰 | 结果 |
|-------|----------|----------|------|
| 117-agent-default-workspace-kind-dir | kanban_db.py / kanban_swarm.py / plugin_api.py | plugin_api.py（89 行） | 干净应用 |
| 118-profile-default-run-trace | profiles.py | profiles.py（63 行） | 干净应用 |
| 178-agent-kanban-cli-verbs | kanban.py | 无 | 干净应用 |
| 179-agent-projects-list-json | projects_cmd.py | 无 | 干净应用 |

**搭载的 overlay 功能（2.8 → 2.9 期间合入 main）**

- Cockpit 终端多工具（`3b14abf`）：终端工具按 Claude Code > Codex > DeepSeek Harness 优先顺序自动选择
- PTY 泄漏修复（`d0523a6`，2026-08-28 P0 事故 252 孤儿 PTY 的复盘修复）：TerminalView/Panel ws 生命周期守卫（patches 192/193）+ 服务端终端会话并发上限 100（patch 194）+ pane 直改；postmortem 见 `docs/superpowers/specs/2026-08-28-terminal-pty-leak-postmortem.md`

**验证**

- inject 144/144 全过（studio 140 + hermes-agent 4，后者直接落于 v2026.8.27 纯净基线）
- server `tsc --noEmit` 0 errors；desktop `build:main`（tsc）通过
- overlay vitest 69 文件 518 passed / 6 skipped / 0 failed（与 2.8 后基线一致）
- `build:full` 真实 vite 构建 + server esbuild 通过

**构建产物**（sha256 见 GitHub release v2.9；文件名与 v2.8 相同，以 tag 区分）

- `SwarmStudio-0.6.47-arm64.dmg`（macOS arm64）
- `SwarmStudio-0.6.47-x64.zip`（Windows x64）

---

## 上一版（hermes-studio v0.6.47，SwarmStudio 2.8）

> **2.8** — hermes-studio v0.6.46 → **v0.6.47**（2026-08-24 发布的 Latest，14 commits / 130 文件 / +10655−311，主体为全新 social-messages 模块）。hermes-agent v0.20.5（v2026.8.19）与 element-web v1.12.26 已是最新稳定版，本轮不动；`hermes-0.20.5-runtime` 上游仍未发布（probe 404），patch 108 的 runtime pin 维持 0.20.4。patch 基线迁移仅 **3 个 regen**（023/042/088，均为 import/version 区上下文并集，语义零变更），其余 131 个 studio patch 干净应用，134/134 按序全过。

### 2.8 明细

**上游版本**

| 仓库 | 版本 | 变化 |
|------|------|------|
| hermes-studio | v0.6.47 | v0.6.46 → v0.6.47 |
| hermes-agent | v0.20.5（v2026.8.19） | 不变（仍为 Latest） |
| element-web | v1.12.26 | 不变（仍为 Latest） |

**上游 v0.6.47 主要内容**（14 commits）

- 全新 standalone social message push（飞书/Telegram/微信 iLink 三适配器 + session-push + 绑定通知，约 40 个新文件）
- claude-code-proxy / codex-proxy：多条 system message 合并为单条 leading message
- GLM-5.3 reasoning effort 规范化修复后整体 revert（最终回落到上游原状）
- 上传大小可配置（`HERMES_MAX_UPLOAD_SIZE`）；codex workspace 文件链接带行号预览
- 群聊完整房间头像光晕修复；Gateway approval waiter 精确结算；App chat resume 条件缓存
- App relay `If-Match` 转发修复

**patch 迁移（3 regen / 131 clean）**

| patch | 冲突点 | 解决 |
|-------|--------|------|
| 023-client-store-chat | import 区：上游新增 `setSessionPushEnabled` 与我们的 `fetchWorkspaceRunChangesForSession`/`hasApiKey` 同行 | 并集合并，3 hunk 语义不变 |
| 042-desktop-rebrand | `version` 行：patch 曾 pin `0.6.46` | version 行改取上游（不再 pin），brand 字段保持 ours；今后 version bump 零冲突 |
| 088-run-chat-autojoin | import 区：上游新增 `listWorkspaceRunChangesForAssistantMessages` 与我们的 `listSessionIdsByUserId` 同区 | 并集合并，2 hunk 语义不变 |

**验证**

- inject 138/138 全过（studio 134 + hermes-agent 4）
- 真树注入结果与 pristine v0.6.47 + 134 patch 参照树 `diff -rq` 零差异
- server `tsc --noEmit` 0 errors；desktop `build:main`（tsc）通过
- overlay vitest 66 文件 484 passed / 6 skipped / 0 failed（custom 测试代码与 2.6 收口 bit-identical——git `diff 0b2766e HEAD -- custom/` 为空；历史 notes 的「67 文件 503 passed」计数口径已不可复现，以本版 484/6/0 为基线）
- upstream patch 触及测试（kanban-routes/controller/service、auth-routes-avatar、matrix ×6）10 文件 74/74 通过
- `build:full` 真实 vite 构建 + server esbuild 通过

**构建产物**（sha256 见 GitHub release v2.8）

- `SwarmStudio-0.6.47-arm64.dmg`（macOS arm64）
- `SwarmStudio-0.6.47-x64.zip`（Windows x64）

## 补记（hermes-studio v0.6.46，SwarmStudio 2.7）

> **2.7** — hermes-studio v0.6.44 → **v0.6.46**（跨 0.6.45，31 commits / 291 文件）。10 个 B 类 patch 基线迁移（023/042/089/094/098/099/100/101/116/122），漂移根因：上游 chat.ts reasoning-effort 持久化、tool-run 折叠、Git-aware 文件树、agent presets 多行 import、`listSessionSummaries` 内存过滤重写；语义全部保留。element-web v1.12.26、hermes-agent v0.20.5 当时已是最新，未动。v2.7 发布于 2026-08-24，产物 `SwarmStudio-0.6.46-arm64.dmg` / `SwarmStudio-0.6.46-x64.zip`。（本段为收口后补记——2.7 当时漏写 RELEASE-NOTES 段落。）

## 上一版（hermes-agent v0.20.5 + element-web v1.12.26，SwarmStudio 2.6）

> **2.6** — 三组件对齐 GitHub 最新稳定版：hermes-agent v0.20.4 → **v0.20.5**（v2026.8.19，804 commits，4 patch 纯净树重放全过、零重生成）、element-web v1.12.25 → **v1.12.26**；hermes-studio **v0.6.44 仍为最新稳定版未动**（仓内 `v1.0.0` tag 系 2026-08-16 的历史祖先 tag，非新版本）。**关键配套**：重启用 patch 108，把 app 内 runtime pin 从滞后的 `hermes-0.20.0-runtime` 提升到当前已发布的 `hermes-0.20.4-runtime`（`hermes-0.20.5-runtime` 上游尚未发布，发布后需再 bump）。产物沿用 `0.6.44` 版本名（electron-builder 4 段版本会拆成 `0.6.4-4.2` 故弃用 0.6.44.2），与 2.4 产物同名不同 sha，以 release tag + sha256 区分。

### 2.6 明细

**上游版本**

| 仓库 | 版本 | 变化 |
|------|------|------|
| hermes-studio | v0.6.44 | 不变（仍为 Latest release） |
| hermes-agent | v0.20.5（v2026.8.19） | v0.20.4 → v0.20.5 |
| element-web | v1.12.26 | v1.12.25 → v1.12.26 |

**hermes-agent v0.20.4 → v0.20.5（804 commits，feat/fix 计 566）**

- **desktop**（107 fix + 62 feat，最大头）：native_compaction 预检查点裁剪保留压缩摘要消息、catalog 漂移同步（OpenRouter 免费模型进出）、keyless provider 全链路视为已认证（opencode-free 出现在 /model 与桌面 picker）
- **relay / bot-mode / gateway / cli / update / cron**：durableGroupChatRooms 远端合并持久化路径丢弃 tombstone 与 roomId、relay/gateway 稳定性修复、更新器与 cron 修复
- SwarmStudio 运行时 runtime 暂保持 **0.20.4**：`hermes-0.20.5-runtime` 发行包上游未发布（探测 404），app 内 Runtime Versions UI 将在上游发布后可直接拉取

**element-web v1.12.25 → v1.12.26**

- Timeline MVVM 共享 TimelineView、自定义用户状态、房间列表分区展开/折叠持久化、注册限流提示
- 修复：macOS 登录页 homeserver 无法修改、置顶消息编辑后 banner 更新、暗色主题代码高亮、音频 WAV fallback 等
- （element-web 不打进 app 包，patch 008 middleware 静态服务；本仓仅跟踪源码版本）

**Overlay 适配**

| 项 | 内容 |
|---|---|
| patch 108（重启用） | runtime pin `hermes-0.20.0-runtime` → `hermes-0.20.4-runtime`；`DEFAULT_HERMES_AGENT_VERSION`/cli-shim 两处 fallback `0.20.0` → `0.20.4`。全新安装首启直接拉取当前 agent runtime；现有安装 cached==expected 不触发重下 |
| agent patch 117/118/178/179 | **零重生成**（804 commits 跨度下 hunk 锚点存活，纯净 v2026.8.19 顺序重放 4/4 PASS） |
| 测试修复 | `cockpit-schedule-modal.test.ts` 午夜窗口 flaky：fixture `now-1h` 在 00:00–01:00 运行时跨天致日面板只剩 1 条；改为锚定当天 08:00/20:00 |

**打包产物（mac arm64 + win x64，未签名沿 2.x 惯例）**

- `SwarmStudio-0.6.44-arm64.dmg`（387.4 MB，sha256 `4c11da5f…2a40f24`，与 2.4 同名产物 sha 不同）
- `SwarmStudio-0.6.44-x64.zip`（424.7 MB，Windows x64，sha256 `1faceb1b…cfcd3da`，与 2.4 同名产物 sha 不同）
- 位置：`upstream/hermes-studio/packages/desktop/release/`

**验证**

- inject 138 patch 全过（含重启用 108；hermes-agent 4/4）
- server `tsc --noEmit` 0 errors
- overlay vitest 67 文件 503 passed / 6 skipped / 0 failed（与基线一致）
- `build:full` 真实 vite 构建通过

## 上一版（hermes-agent v0.20.4 runtime 升级，SwarmStudio 2.5）

> **2.5** — hermes-agent v0.20.0 → v0.20.4 升级（3016 commits / 3386 文件，含 v0.20.1/0.20.2/0.20.3 三个中间版本）。上游 hermes-studio 与 element-web 已是最新，未动。overlay 4 个 hermes-agent patch（117/118/178/179）**无需重生成**——目标代码路径（`hermes_cli/kanban*.py` / `profiles.py` / `projects_cmd.py` / `plugins/kanban/...`）在 0.20.4 跨度内虽被上游 60 个 commit 触碰，但 patch 上下文边界未漂移，纯净 v0.20.4 严格顺序重放 4/4 全过。

### 2.5 明细

**上游版本**

| 仓库 | 版本 |
|------|------|
| hermes-studio | v0.6.44 |
| hermes-agent | v0.20.4（v2026.8.18） |
| element-web | v1.12.25 |

**hermes-agent v0.20.0 → v0.20.4 主要子跨度 | 备注**

| release | tag | commits | 备注 |
|---|---|---:|---|
| v0.20.1 | v2026.8.13 | 1620 | refactor(usage) simplify-pass follow-ups |
| v0.20.2 | v2026.8.16 | 979 | release v0.20.2 |
| v0.20.3 | v2026.8.16.2 | 258 | release v0.20.3 |
| v0.20.4 | v2026.8.18 | 159 | 最新 stable |

**Overlay patch 适配（4 个 hermes-agent patch，0 FAILED）**

- 117-agent-default-workspace-kind-dir：defaults.py / kanban_db.py / kanban_swarm.py / plugin_api.py 默认 workspace kind + dir 注入；上游改动 0 patch 边界触碰
- 118-profile-default-run-trace：profiles.py 默认 profile run trace 注入；上游 4 commits 触碰但行号偏移在 git apply 容差内
- 178-agent-kanban-cli-verbs：kanban.py `--reasoning` / `set-reasoning` / `estimate` / `boards set-project` 注入
- 179-agent-projects-list-json：projects_cmd.py 顶部 `project list --json` 注入

**验证**

- 注入：133 patch 全 inject 通过（hermes-studio 133 + hermes-agent 4，0 FAILED）
- server `tsc --noEmit` 0 errors
- overlay vitest 67 文件 503 passed / 6 skipped / 0 failed

## 上一版（v0.6.43 → v0.6.44，SwarmStudio 2.4）

SwarmStudio **2.4**（基于 hermes-studio v0.6.44 + overlay 二次开发）

> **2.4** — hermes-studio v0.6.43 → v0.6.44 升级（15 commits / 90 文件，群聊实时房间完整历史、tool panel 上移、跨房间活跃 Agent runs、App profile 紧凑头像、LAN QR 码去 VPN 地址、agent bridge fallback providers）。7 个 patch 适配重生成（133 patches 0 FAILED）。hermes-agent / element-web 已是最新，未动。

### 2.4 明细

**上游版本**

| 仓库 | 版本 |
|------|------|
| hermes-studio | v0.6.44 |
| hermes-agent | v0.20.0（v2026.8.3） |
| element-web | v1.12.25 |

**v0.6.43 → v0.6.44 主要上游变更**

- **群聊**：实时房间加载完整历史（#2594）、tool panel 上移至 transcript 之上（#2572）、跨房间展示活跃 Agent runs（#2573）、历史允许折叠活跃房间（#2584）
- **App/连接**：App profile 列表紧凑头像（#2592）、LAN QR 码排除 VPN 地址（#2591）、app relay 预连接生命周期修复（#2598）
- **agent bridge**：重复 bridge 预持久化用户消息去重（#2601）、fallback providers 应用（#2599）
- **其他**：provider 无 model catalog 不再误判连接失败（#2587）、文件名以点开头的路径穿越误判修复（#2586）、折叠的 provider 分组保留（#2585）、网站隐私政策（#2590）

**Overlay 适配（7 个 patch 重生成）**

| patch | 适配内容 |
|---|---|
| 042 | 版本号 context 0.6.43 → 0.6.44 |
| 070 / 071 | cockpit App.vue/router 重生成；维持历史决策——上游 group-chat 路由在 cockpit 下仍移除（0.6.44 的 redirect 目标微调） |
| 085 / 102 | 群聊 unread-tracking / gateway-banner 重生成（0.6.44 群聊历史与房间管理重构） |
| 113 | settings hide-sidebar-footer 重生成 |
| 124 | kanban workspace-files allowlist 重生成（0.6.44 该文件内部重构） |

**打包产物（mac arm64 + win x64）**

- `SwarmStudio-0.6.44-arm64.dmg`（369.5 MB，sha256 `03c20587…9d6224b77`）
- `SwarmStudio-0.6.44-arm64.zip`（389.7 MB，sha256 `43bdc884…8784044eb`）
- `SwarmStudio-0.6.44-x64.zip`（405.0 MB，Windows x64，sha256 `8437de71…79c8c94c`）
- 位置：`upstream/hermes-studio/packages/desktop/release/`；未签名/notarize（沿 2.x 惯例）

**验证**

- 133 patch 全 inject 通过（纯净 v0.6.44 树严格顺序重放 133/133）
- server `tsc --noEmit` 0 errors
- overlay vitest 67 文件 503 passed / 6 skipped / 0 failed
- patch 涉及的上游测试 10 文件 74/74 PASS（kanban-routes/controller/hermes-kanban-service、auth-routes-avatar、matrix ×6）

## 上一版（v0.6.42 → v0.6.43，SwarmStudio 2.3）

SwarmStudio **2.3**（基于 hermes-studio v0.6.43 + overlay 二次开发）

**上游版本**

| 仓库 | 版本 |
|------|------|
| hermes-studio | v0.6.43 |
| hermes-agent | v0.20.0（v2026.8.3） |
| element-web | v1.12.25 |

**v0.6.42 → v0.6.43 主要上游变更**

- **群聊（主线）**：完整历史导航与分页（#2568/#2565）、跨设备排队消息撤回（#2570）、语音输入 + 可取消执行队列（#2555）、交互响应按 runtime 降级（#2569）、@ 可见扫描排除发送者自身（#2525）、tool result 载荷上限（#2548）、Tools 跟随所属 Agent run（#2536）、handoff depth 停止安全呈现（#2519）、滚动摘要 cursor 安全（#2511）
- **App 连接与安全**：App/设备安全连接（#2523）、按云账号隔离连接（#2557）、App entitlement 强制 + relay 恢复（#2561）、移动端下载中心（#2575）
- **Coding Agents**：CLI `/compact` `/context` 命令桥接（#2566）、Codex tool_search 门控加固（#2576）、Pi RPC 集成（#2528）
- **其他**：kanban 任务文本自选方向（#2545）、侧边栏分组与 workflow relay 修复（#2546）

**Overlay 适配（19 个 patch 重生成/扩展）**

| patch | 适配内容 |
|---|---|
| 002 | config.ts 上游新增 `getLanAdvertiseUrl`/`isAppEntitlementRequired`，`getDashboardUrl` 并存重生成 |
| 005 / 012 / 016 | auth 链重生成；016 保留上游 `verifyUserJwtPayload` 重构与 `app_device_*` JWT 字段，matrix_user_id 注入不变 |
| 020 | `ActiveSection` 并集上游新增 `connections` + 我方 `matrix` |
| 031 / 085 / 087 / 101 / 102 / 122 | 群聊 client/server patch 重生成；087 保留 autojoin 块并采纳上游 join `historyLimit` 签名 |
| 042 | 版本号 context 0.6.42 → 0.6.43 |
| 070 / 071 | cockpit App.vue/router 重生成；维持 0.6.42 决策——上游重新加回的 group-chat 路由在 cockpit 下仍移除 |
| 074 / 075 / 187-zh | i18n en/zh 基座重生成，下游 158/159/161/162/163/167/168/185/186/187-en 级联自愈 |
| 135 | loop socket namespace 重生成 |
| 175 | vitest 3.x（上游升级）对 mock 缺失 export 抛错，补齐 `patchBoard`/`estimateTask`/`estimateText`/`listProjects` 四个 mock 项 |

**验证**

- 133 patch 全 inject 通过（纯净 v0.6.43 树严格顺序重放 133/133，且与逐 patch 重放树零差异）
- server `tsc --noEmit` 0 errors
- overlay vitest 67 文件 503 passed / 6 skipped / 0 failed
- patch 涉及的上游测试 9 文件 54/54 PASS（kanban-routes/controller、auth-routes-avatar、matrix ×5）

**打包产物（mac arm64 + win x64）**

- `SwarmStudio-0.6.43-arm64.dmg`（369.5 MB，sha256 `8112f929…31b0b183`）
- `SwarmStudio-0.6.43-arm64.zip`（389.7 MB，sha256 `2e42a1b1…94ab6f13`）
- `SwarmStudio-0.6.43-x64.zip`（405.0 MB，Windows x64，sha256 `6910b127…507dfa5`；mac 主机跨平台构建，electron 42.3.0 win-x64，node-pty prebuild 按目标修剪）
- 位置：`upstream/hermes-studio/packages/desktop/release/`；未签名/notarize（沿 2.x 惯例）
- 打包时补修 patch 122：上游 #2523 删除了 `SettingsCircuitBadge.vue`，去掉 122 中无模板用法的死 import（`useAuthStore` 登出逻辑不变）

## 上一版（v0.6.39 → v0.6.42，SwarmStudio 2.2）

SwarmStudio **2.2**（基于 hermes-studio v0.6.42 + overlay 二次开发）

> **2.2** — hermes-studio v0.6.39 → v0.6.42 大跨度升级（59 commits / 500 文件，含 secure shared rooms、remote agents、file transfers、group-chat 大重构、notification clickUrl、Sharp/STT runtime）。同步完成 patch rebase（137 patches 0 FAILED）与验证。hermes-agent / element-web 已是最新，未动。

### 2.2 明细

**上游版本**

| 仓库 | 版本 |
|------|------|
| hermes-studio | v0.6.42 |
| hermes-agent | v0.20.0（v2026.8.3） |
| element-web | v1.12.25 |

**v0.6.39 → v0.6.42 主要上游变更**

- **Secure shared rooms + remote agents**：group-chat 安全共享房间、远程 agent 接入、agent 间文件传输（file transfers）
- **Notification clickUrl**：通知点击可导航到指定 URL（`safeNotificationClickUrl` + `webUiHashUrl`）
- **登录 redirect 保真**：`resolveLoginRedirect(route.query.redirect)`，深度链接登录后保留目标页
- **group-chat 大重构**：secure rooms、handoff chain、mentions、profile query 切换（3448 行 diff）
- **运行时**：Sharp 图像处理、sherpa-onnx-node STT、lazy-load optional runtime、MCU 远程稳定化、model-run token 可配
- **desktop**：`naiveLocaleFor`、`isInviteOnlyPage`、group-chat-agent popup、`setWindowOpenHandler`

**Overlay patch 适配（137 patches，0 FAILED / 0 WARN）**

本版冲突面 38 文件，远大于 2.1 的 21 文件，但经两个 Explore agent 逐文件核查，真实手工合并集中在以下 patch：

| patch | 文件 | 冲突 | 修法 |
|---|---|---|---|
| 008 | server/index.ts | 上游加 `GET/HEAD` 方法守卫 + 删 `/webhook`，patch 加 `/element-web/` | 重新生成，保留上游方法守卫，手插回 `/element-web/` 排除 |
| 025 | LoginView.vue | 上游加 `resolveLoginRedirect`，patch 整段重写 | 重新生成，移植 redirect 保真进 matrix/local 双 tab 登录流，默认跳 cockpit |
| 027 | UserManagementSettings | 上游加 `fixed:'right'` 列固定 | context 对齐 |
| 029 | SettingsView | 上游加 `WebhookSettings` import | context 对齐 |
| 042 | desktop/package.json | version bump | context 0.6.39→0.6.42 |
| 043 | desktop/index.ts (strings) | 上游加 `safeNotificationClickUrl` + clickUrl handler | 重新生成 index.ts 段 |
| 070 | App.vue | 上游加 `naiveLocale` + `isInviteOnlyPage` | 重新生成，保留上游新增 computed |
| 071 | router/index.ts | 上游加 2 条 share 路由 + `resolveLoginRedirect` guard | 重新生成，share 路由留顶层独立，guard 合成 cockpit 版 redirect |
| 085 | group-chat store | 上游加 `pendingClarifies` 打断相邻性 | 重新生成，挪插入点 |
| 088 | run-chat | 上游加 `randomUUID` import 打断相邻性 | context 对齐 |
| 089 | chat store | 上游加 approval handling | 重新生成 |
| 097 | download.ts | 上游加 `createAppImagePreview` import | context 对齐 |
| 102 | GroupMessageList | 上游加 `RoomAgentHandoffChain` type import | context 对齐 |
| 122 | GroupChatPanel | 上游加 `GroupChatMention`/`RoomAgentHandoffChain` type | 重新生成，保留 SettingsCircuitBadge + 加 useAuthStore |
| 128 | desktop/index.ts (click handler) | 上游重写 notification click（clickUrl 分支） | 重新生成，条件 raise + clickUrl 流合并 |
| 135 | server/index.ts | 上游重构 loopbackBaseUrl 位置 | context 对齐 |
| 017/080/136/137/138 | package.json | adm-zip 版本 + sharp/sherpa 新增打破相邻性 | 全部重新生成 |

**保留的上游新特性（融合进 overlay）**

- 登录 redirect 保真（`resolveLoginRedirect`）已移植进 025 双 tab 登录流
- share 路由（`/share/group-chat/:inviteCode?`、`/group-chat-link`）保留为顶层独立路由
- notification clickUrl 导航保留
- desktop `naiveLocale`/`isInviteOnlyPage`/WebhookSettings 等上游新增全部保留

**验证**

- inject：137 patches，0 FAILED / 0 WARN（hermes-studio + hermes-agent 全量干净应用）
- server `tsc --noEmit`：0 errors
- desktop `tsc --noEmit`：0 errors（仅预存 TS5107 tsconfig 弃用 warn）
- vitest：503 passed / 0 failed / 6 skipped（与 2.1.1 基线一致，无回归）
- inject 幂等：clean → inject 可重现

---

## 2.1.1（历史）

SwarmStudio **2.1.1**（基于 hermes-studio v0.6.39 + overlay 二次开发）

> **2.1.1** — runtime 统一（本地 hermes agent 安装优先，dev 态复用 `~/.hermes/hermes-agent/venv`）+ 修复 `verify-clean.mjs` 预存 bug（路径误写 `swarm-studio`/`swarm-agent` 导致 hermes-studio/hermes-agent 校验误报）+ 重新打包 mac arm64 DMG / x64 zip。

> **2.1** — 三上游组件全量升级至最新稳定版（hermes-studio v0.6.38→v0.6.39、element-web v1.12.22→v1.12.25、hermes-agent 收敛到干净 tag v2026.8.3）。同步完成 patch rebase（136/138 干净应用，禁用 2 个被上游吸收/废弃的 patch）与验证。

### 2.1.1 明细

**1. verify-clean.mjs bug 修复**（预存，非 2.1 引入）

`overlay/scripts/verify-clean.mjs` 校验上游工作树时路径写错：
- `resolve(upstreamRoot, 'swarm-studio')` → `hermes-studio`（目录名不匹配 → `git status` 静默返回空 → 误报「工作树干净」）
- `['element-web', 'swarm-agent']` → `['element-web', 'hermes-agent']`（hermes-agent 同样被跳过）

修复后三仓状态正确报告（inject 后 hermes-studio / hermes-agent 应 WARN，element-web 应 OK）。

**2. runtime 统一：本地 hermes agent 安装优先**（patch 188）

新增 `patches/188-desktop-runtime-local-priority.patch`，改 `packages/desktop/src/main/paths.ts` + `runtime-manager.ts`：

- 新增 `localHermesInstallDir()` / `usingLocalHermesInstall()`：检测 `~/.hermes/hermes-agent/venv/bin/hermes`（可被 `HERMES_LOCAL_AGENT_DIR` 覆盖、`HERMES_DESKTOP_USE_LOCAL_HERMES=0` 禁用）。
- dev 态（`!isPackaged()`）下，`hermesBin()` / `bundledPython()` 指向本地 venv；`bundledNode()` / `nodeBinDir()` 走系统 node（`process.execPath` 所在目录）。
- `rootRuntimeReady()`：本地 hermes 在场时直接返回 true → `isDesktopRuntimeReady()` 为 true → 启动跳过捆绑 runtime 下载。
- **打包态（`isPackaged()`）守卫不变**：DMG/EXE 产物仍用捆绑 runtime 树，运行时行为不受影响；本地优先仅作用于开发态。

**3. 验证**

- inject：137 patches（原 136 + patch 188），0 FAILED / 0 WARN
- desktop `tsc --noEmit`：0 errors（仅预存 TS5107 tsconfig 弃用 warn）
- server `tsc --noEmit`：0 errors
- vitest：503 passed / 0 failed / 6 skipped（无回归）
- `npm run verify`（修复后）：hermes-studio / hermes-agent / element-web 三仓状态正确报告

### 打包产物（mac，未签名）

本机 darwin arm64 原生构建 arm64，跨架构构建 x64（electron-builder `--x64`）。均未代码签名（本地无 Developer ID；macOS 首次打开需右键「打开」放行）。

| 产物 | 架构 | 大小 |
|------|------|------|
| `SwarmStudio-0.6.39-arm64.dmg` | mac arm64 | 338M |
| `SwarmStudio-0.6.39-arm64.zip` | mac arm64 | 358M |
| `SwarmStudio-0.6.39-x64.dmg` | mac x64 | 343M |
| `SwarmStudio-0.6.39-x64.zip` | mac x64 | 363M |

产物位置：`upstream/hermes-studio/packages/desktop/release/`

## 上游版本

| 仓库 | 版本 |
|------|------|
| hermes-studio | v0.6.39 |
| hermes-agent | v0.20.0（v2026.8.3） |
| element-web | v1.12.25 |

## 本次升级（2.0 → 2.1）

### 三上游升级摘要

| 组件 | 2.0 | 2.1 | 关键上游变更 |
|------|-----|-----|-------------|
| hermes-studio | v0.6.38 | **v0.6.39** | Ekko agent（setupGlobalEkkoAgent + tool approval/clarification 拦截）、MCU 远程连接稳定化、model-run token 生命周期可配、runtime activation 错误暴露、group-chat typing 在线成员校验、runtimeRequiredFiles→runtimeRequiredFileGroups 重构 |
| element-web | v1.12.22 | **v1.12.25** | matrix-js-sdk 升级、EventTile 迁移到 shared components、Seshat 5.0.0、compound-web 9.9.0、MSC3391/MSC3852 移除、macOS 32px 标题栏（仅参考源更新；dist 产出维持既有外部机制） |
| hermes-agent | v0.20.0（HEAD ≥ tag） | v0.20.0（v2026.8.3） | 收敛到干净 release tag（HEAD 此前已 ≥ tag，无功能变更） |

### Overlay patch 适配

全量 138 patch 中 **136 干净应用，0 FAILED / 0 WARN**；禁用 2 个：

| patch | 状态 | 原因 |
|---|---|---|
| 030-client-groupchatview | **禁用** | 上游 v0.6.39 已 `await store.connect()`（与本 patch 相同），patch 冗余 |
| 126-desktop-system-hermes-agent-default | **禁用** | dead helpers（preferredSystemHermesCommand/explicitSystemHermesEnabled/resolveExecutable 全程无引用）；execFileSync 由 patch 144 覆盖；run_agent.py 检查由 patch 148 覆盖；上游 v0.6.39 重构 runtimeRequiredFiles→runtimeRequiredFileGroups 使本 patch 过时 |

修订 2 个 patch 的上下文以对齐 v0.6.39：

| patch | 修订 |
|---|---|
| 016-server-middleware-user-auth | hunk #3 上下文对齐 v0.6.39：`issueModelRunJwt` 体 `MODEL_RUN_EXPIRES_SECONDS`→`getModelRunJwtExpiresSeconds()`；toAuthenticatedUser 行号前移 |
| 042-desktop-rebrand-swarmstudio-pkg | version 上下文 `0.6.38`→`0.6.39` |

### 验证

- inject：136 patches，0 FAILED / 0 WARN（hermes-studio + hermes-agent 全量干净应用）
- server `tsc --noEmit`：**0 errors**（与 2.0 基线一致）
- vitest：**503 passed / 0 failed / 6 skipped**（67 test files，与 2.0 基线一致，无回归）
- inject 幂等：clean → inject → clean 可还原上游工作树

### 已知环境提示（非本次引入）

- 本地 Node v22.23.2 < hermes-studio engines `>=23.0.0`（v0.6.38 同要求，npm 仅 warn 不阻塞；tsc/vitest 均通过）

---

## 2.0（历史）

SwarmStudio **2.0**（基于 hermes-studio v0.6.38 + overlay 二次开发）

> **2.0** — hermes-agent v0.20.0 kanban 五大新功能全量迁移（单卡 model/provider/reasoning 钉选、board project 作用域、effort estimate、运行中 worker 评论即时送达）+ i18n/测试技术债清理。

### 上游版本（2.0 时点）

| 仓库 | 版本 |
|------|------|
| hermes-studio | v0.6.38 |
| hermes-agent | v0.20.0 |
| element-web | v1.12.22 |

### 0.6.37 → 0.6.38（2.0 历史明细）

上游 v0.6.38 含 2 个提交（21 文件变更），主要是 Windows runtime 修复与 Hermes 0.19.0 网站兼容性恢复：

- **Windows Runtime Python home 修复**（#2349）：修复 Windows 下 Python 运行时路径
- **Hermes 0.19.0 网站兼容性恢复**（#2348）

### Overlay 适配

- 042 版本号 0.6.37 → 0.6.38
- 无其他 patch 冲突（v0.6.38 为小版本）

### 验证

- 125 patch 全 inject 通过
- server `tsc --noEmit` 0 errors；client `vue-tsc` 17 baseline errors（0 new）
- kanban/avatar 测试 44/44 PASS；agent patch 117/118 干净应用

## hermes-agent v0.20.0 kanban 能力迁移（patch 178-186）

把 v0.19.0→v0.20.0 区间的 5 个 kanban 新功能迁移到 Swarm kanban 与 AI 协作中心，使两处 UI 与 hermes-agent v0.20.0 后端对齐。

### 迁移内容

- **A. 单卡 model + provider 钉选**：`create --model/--provider`、`set-model` CLI 动词全链路打通（CLI→service→routes→client→store→UI）。TaskForm 加 model/provider 输入；TaskDrawer Meta 区 Model 行可显示/编辑/清除。
- **B. 单卡 reasoning_effort**：hermes-agent 补 `create --reasoning` + `set-reasoning` CLI 动词（patch 178）；`_task_to_dict` 序列化补 reasoning_effort。TaskForm/Drawer 加思考深度选择（minimal/low/medium/high/xhigh/max/ultra/none）。
- **C. board 挂到 project**：`project list --json`（patch 179）+ `boards create --project`/`boards set-project` CLI 动词（patch 178）；TS `GET /projects`、`PATCH /boards/:slug`。Toolbar 建板对话框加 project 选择器（选中后 default_workdir 镜像 project 主目录）。
- **D. effort estimate**：`kanban estimate` CLI 动词复刻 plugin `_run_estimate`（auxiliary model，ok:false 降级且 exit 0，对齐 REST 非错误语义）。TaskForm 建卡前 Estimate 按钮 + TaskDrawer 既有卡 Estimate 按钮，行内显示 `~15k tok · M`。
- **E. 运行中 worker 评论即时送达**：后端零改动（comments POST 已通，worker 端 v0.20 自动轮询注入 live turn）。TaskDrawer 评论区运行中任务显示「评论将在数秒内送达运行中的 worker」提示文案。

### 偏差（对照上游明示）

- model 下拉：上游桌面端用 composer SDK picker + `GET /model-options`；Swarm 用自由文本 + provider 文本（hermes-studio 无 SDK picker，model-options 无 CLI 动词）。
- board settings：上游有「Board settings…」对话框改既有板 project；Swarm 仅建板时可选 + PATCH API。
- `hermes kanban repair`（运维 CLI）不做。

### Patch 清单

| patch | 内容 |
|---|---|
| 178 | hermes-agent kanban CLI 动词（create --reasoning / set-reasoning / estimate / boards create --project / boards set-project） |
| 179 | hermes-agent `project list --json` |
| 180 | TS service：KanbanTask/KanbanBoard 字段 + patchTask/createTask/createBoard 接入 + estimateTask/estimateText/listProjects/setBoardProject |
| 181 | TS controllers：estimate/projects/patchBoard + create/createBoard 字段透传 |
| 182 | TS routes：POST /estimate、POST /:id/estimate、GET /projects、PATCH /boards/:slug |
| 183 | client API：types + wrappers（estimateTask/estimateText/listProjects/patchBoard） |
| 184 | client store：projects state + 4 个 action |
| 185/186 | i18n en/zh：kanban.form model/provider/reasoning、kanban.board project、kanban estimate/liveCommentHint |
| custom | KanbanTaskForm/TaskDrawer/Toolbar.vue + SwarmKanbanView.vue + CockpitWorkspace.vue |

### 验证

- 全量 inject 138 patches，0 FAILED / 0 WARN（hermes-agent patch 干净应用）
- CLI 冒烟（隔离 HERMES_HOME）：project/board/task create/reasoning/estimate 全路径通过
- server `tsc --noEmit` 0 errors；client `vue-tsc` 8 errors（chat/matrix 既有，0 i18n）
- vitest 503 passed / 0 failed / 6 skipped（67 test files，3 连跑稳定）

参考：`docs/superpowers/specs/2026-08-04-hermes-agent-020-kanban-migration-design.md`、`docs/superpowers/plans/2026-08-04-hermes-agent-020-kanban-migration.md`

### i18n / 测试修复（patch 187 + 测试断言修正）

发版前清掉 main 既有技术债：

- **patch 187**：去除 patch 159/161/162/163 注入残留导致的 8 个 TS1117 duplicate-key（`loop.onboarding.cta`/`kanban.action.archive`/`kanban.message.taskArchived` 重复、`accurate:` 顶格缩进、zh 侧 `swarmKanban/matrixChat/cockpit/diagnostics/matrixIdentity` 错放顶层）。vue-tsc **16 → 8 errors**。
- **cockpit-run-trace-modal 3 例**：断言中文翻译值但 test setup 的 `useI18n` mock 返回 raw key，恒失败；改为断言 raw key。
- **phase3-integration scheduler**：fire-and-forget tick flush 窗口 50ms 并行负载下 flake，扩到 250ms。

## 上一版（0.6.36 → 0.6.37 + hermes-agent 0.19.1 → 0.20.0）

上游 v0.6.37 含 20+ 提交（210 文件变更），hermes-agent v0.20.0 rollup。主要更新：

- **cli-shim 重构**（214 行重写）：Windows runtime 修复 + storage migration
- **GroupChatPanel 重构**（2380 行重写）+ GroupMessageList 重构（195 行）
- **paths.ts runtime 重构**（#8314 bundle Hermes source runtime + Windows 更新修复）
- **MCU 自动聆听模式**（#2338）+ Ekko voice 模式切换
- **authorized provider OAuth runtime**（#2337）
- **profile archive lifecycle 加固**（#2324）
- **macOS signing keychain 修复**（#2315）
- hermes-agent 0.20.0 rollup（1162 files）

### Overlay 适配（11 patches 重写 + 3 obsolete）

- 043/177：cli-shim rebrand 拆分（v0.6.37 cli-shim 214 行重写）
- 085/102/122：group-chat store + GroupMessageList + GroupChatPanel 适配（2380+195 行重写）
- 126/145/147：paths.ts/runtime 适配（147 obsolete——run_agent.py 模式被上游取代）
- 152 obsolete（ELECTRON_RUN_AS_NODE 已内置）
- 042/088 版本号 + deleteSession import 适配

### 验证

- 126 patch 全 inject 通过
- server `tsc --noEmit` 0 errors；client `vue-tsc` 16 baseline errors（0 new）
- kanban/avatar 测试 44/44 PASS

## 上一版（0.6.36 → 0.6.36 保持版）

上游 v0.6.36 含 40+ 提交（326 文件变更），主要更新：

- **kanban task board 重设计**（#2296）：修复归档 + 重新设计任务板
- **完整 RTL 布局支持**（#2294/#2270/#2269）：Arabic locale、Naive UI 镜像、方向感知 CSS
- **MCU 同步语音字幕**（#2305）
- **Ekko session workspaces**（#2289）+ compact 关系图（#2297）
- **独立 headless app relay**（#2275）
- **chat live reasoning 稳定化**（#2299）+ 工具抽屉精炼（#2283）
- **桌面更新后使用打包 WebUI**（#2314）
- 多项 i18n/voice/desktop 修复

### Overlay 适配（10 patches 重写）

- 025 重写：LoginView 适配 RTL `text-align: start`
- 070 重写：App.vue 适配 `naiveRtl` + `locale`，保留 authStore + cockpit sidebar 逻辑
- 074/075 重写：i18n locales 锚点适配（上游新增 Arabic + RTL keys）
- 101/102 重写：MessageList/GroupMessageList 适配上游 scroll snapshot 重构 + banner 正确插入
- 029 重写：SettingsView 适配上游移除 VoiceSettings + voice→models redirect
- 042/043 版本号 + minWidth context 适配
- 135 重写：index.ts 适配 `bodyParser→createRequestBodyParser` 重构

### 验证

- 127 patch 全 inject 通过
- server `tsc --noEmit` 0 errors；client `vue-tsc` 15 baseline errors（0 new）
- kanban/avatar 测试 44/44 PASS

## 上一版（0.6.33 → 0.6.35 + hermes-agent 0.19.0 → 0.19.1）

上游 hermes-studio v0.6.35 含 24 个提交（224 个文件变更），hermes-agent v0.19.1 为 ~1000 PR rollup。主要适配：

### kanban 对齐（上游 #2216 align kanban with Hermes 0.19）

- **附件系统切换到 CLI 模型**（patch 013 重写）：uploadAttachment → `hermes kanban attach`、removeAttachment → `hermes kanban attach-rm`，kanban.db 单一事实源，与上游 service 层 listAttachments 对齐。废弃 .attachments.json 旁路 meta store。
- **attach-from-URL 走 CLI**（patch 169 重写）：URL 下载到临时文件 → CLI attach，保留逐跳 SSRF 守卫。
- **附件下载切上游 readAttachment 路径**（patch 174 新增）：`/api/hermes/kanban/:taskId/attachments/:attachmentId`，含路径校验 + 授权。
- patch 010/013/014/035/037/164/165 锚点适配（上游 KanbanTask 已内置 `goal_mode`、createTask/接口新字段、controller 结构重写）。
- 测试 mock 补齐（patch 175/176 新增）。

### v0.6.35 新功能适配

- **per-user theme**（patch 024/025）：localLogin 适配 `loginWithPassword` 返回 LoginResponse 对象，内联 `activateUserTheme`。
- **desktop.chat 独立聊天窗口**（patch 071 重写）：router 保留顶层 desktop.chat 路由，其余迁入 cockpit children。
- patch 009/042/070/072/087/088/078/124 适配（auth 返回类型、desktop 版本号、App.vue standaloneChat、AppSidebar 导入、group-chat/run-chat 新处理器、workspace-files allowlist）。

### hermes-agent 0.19.1

patch 117/118 恢复干净应用（0.19.0 时因 drift 跳过）。

### 验证

- 126 个 active patch 全部 inject 通过
- server `tsc --noEmit` 0 errors；client `vue-tsc` 9 个 pre-existing baseline errors
- kanban/avatar 测试 44/44 PASS；agent CLI smoke OK
- 全量 vitest 63 个失败均为 overlay 有意变更与上游测试断言的既有冲突（login UI/files API/i18n 覆盖/rebrand 等，与 v0.6.33 同类）

## 上一版（0.6.32 → 0.6.33）

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

## hermes-agent v0.19.0 kanban 能力对账（patch 164-173）

把 hermes-agent v0.19.0 kanban 能力缺口迁移到「Swarm kanban」与「AI 协作中心」工作区页面，分 4 阶段：

- **P1 — KanbanTask 接口 +19 字段**（patch 164/165）：`branch_name`/`idempotency_key`/`consecutive_failures`/`worker_pid`/`last_failure_error`/`max_runtime_seconds`/`last_heartbeat_at`/`current_run_id`/`workflow_template_id`/`current_step_key`/`model_override`/`max_retries`/`goal_mode`/`goal_max_turns`/`session_id`/`block_kind`/`block_recurrences`/`claim_lock`/`claim_expires`，对应 Python `Task` dataclass。均 optional/nullable，向后兼容。
- **P2 — 补 5 个缺失 HTTP wrapper**（patch 166）：`readArtifact`/`debugHomeChannels`/`listWorkspaceFiles`/`getTimeline`/`searchSessions` + 3 类型 `FileNode`/`TimelineItem`/`SessionSearchResult`（从 cockpit-extras 迁入主 client，cockpit-extras 改 re-export 保兼容）。
- **P3 — CockpitWorkspace 运维状态 meta 行 + events/runs**（patch 167/168 + custom .vue）：工作区加 5 个只读 meta 行（Worker 健康/失败熔断/Claim 锁/Workflow 编排/派生溯源）+ events + run history 两区段。i18n 补 en/zh。
- **P4 — attach-from-URL**（patch 169-173 + patch 166 追加）：新增 `POST /api/hermes/kanban/:id/attachments/url`，service 端全局 fetch 下载 + 25MB 双校验 + `assertSafeOutboundUrl` SSRF 守卫（复用 `url-guard.ts`）。KanbanAttachments.vue 加「从 URL」输入行。

验证：server `tsc --noEmit` 0 errors；client `vue-tsc` 9 个 pre-existing baseline errors（0 引用本次新增字段/wrapper/UI）；kanban/cockpit vitest 全绿。

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
