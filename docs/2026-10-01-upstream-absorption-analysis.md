# upstream 技术组件吸收分析：完善 Swarm Studio

日期：2026-10-01　　性质：调研设计文档（只读分析，未动代码）　　owner：本轮调研会话
盘点范围：`upstream/` 全部 12 个组件（claude-code、codex、deepseek-harness、dsh-TUI、element-web、hermes-agent、hermes-studio、kimi-code、minimax-code、multica、routa、zcode）
理念基线：《Swarm Studio 全流程推演方案（V5 整合版）》（`docs/superpowers/specs/2026-09-29-mux-v5-fullflow-plan.md`，下称 V5 正本）与 run1-run5 推演报告执行态（V5 §九）

> 主旨三句话：本文唯一主旨是从 12 个 upstream 组件的源码级功能与 UI 盘点中，穷举出贴合 Swarm Studio 设计理念、值得借鉴吸收的改进点。受众是裁决者与后续实施会话，需要的是"每一项从哪来、落到哪去、为什么贴合理念"。读完后建议动作是对第五节分期清单逐项裁决（执行/选做/缓办）。

## 一、结论总览

Studio 的差距不在功能数量，而在三类纵深。6 路源码深挖与驾驶舱现状基线对照后，差距集中在：

1. **消息面缺聊天基础设施**。v14 统一聊天把三类会话合进一个列表，但没有线程（Threads）、已读回执、未读模型、全局混合搜索、消息操作栏。element-web 在这五处都有成熟实现，直接可借。推演 run5 实况是佐证：缺陷回流、评审对话、派发回执全挤在主时间线里刷屏（V5 步骤 19 缺陷回流语义依赖群消息，多话题并发时不可读）。
2. **运行面缺轨迹观测**。运行中心有列表、拓扑图、时间轴回放，但没有"一个 agent 一整个会话干了什么"的轨迹视图（忙段波带、热点聚合、`>10s`/`tok>1k` 谓词查询、跳错误点）。dsh-TUI 与 deepseek-harness 给出同一概念的终端与 Web 两份实现，互为印证。
3. **治理面缺暗能力的 UI**。hermes-agent v0.21.5 的能力面远大于 studio 已驱动面：约 110 条聊天内 slash 命令、审批管线（manual/smart/off 三模式+超时 settle）、cron 引擎（script 预跑、context_from 链、蓝图模板、自动化建议）、凭证池与回退链、goal/loop/heartbeat 常驻意图、会话 FTS+CJK 搜索与分支回滚，多数没有 UI 出口。run4 通道风暴（四池全限、fallback 链失败，V5 §九 run4 行）正是"凭证池无 UI、只能看日志"的直接痛点。

理念同构度最高的两个参照系是 routa 与 multica：前者"看板即协作总线、每列一个 specialist 加证据契约、三层 review gate"与六闸/RACI/驾驶舱叙事同构；后者"agent 是队友"（live peek、inbox 低噪、execution log 回放、usage leaderboard）与注意力条/审批收件箱的设计思想同源。

一条红线贯穿全部建议：**驾驶舱聚焦（V5 §13.1）**。单一入口 /app、迁移优先于复制、精简保能力。所有吸收点的落点一律是增强 /app 树内既有功能区，不新增一级页面；这与补遗⑤刚完成的收敛方向一致，不能一边精简一边铺新面。

## 二、基线：设计理念与 Studio 现状

### 2.1 理念基线（吸收判断的标尺）

从 V5 正本提取六条标尺，第五节每项建议都标注贴合哪条：

| # | 标尺 | 出处 |
|---|---|---|
| B1 | 人的角色=意图持有者、仲裁者、最终验证者；AI 员工主理执行；六道硬闸守意图对齐与不可逆决策 | V5 §一 |
| B2 | 一切"完成"带双凭证（提交号+卡号）+ 系统反向核验；判词真值化（只认结构化字段，不认消息词面） | V5 §五 2/8 |
| B3 | 驾驶舱聚焦：单一入口、迁移优先于复制、精简保能力（四档摘面） | V5 §13.1 |
| B4 | 五条设计原则：验证优先于生成；结构化产物优于自由对话；人只守两道门；自主权随实绩扩展且可溯源；为可监督性设计 | V5 §六 |
| B5 | IDE 工作台=以 zcode 为底座、吸收主流编码工具形成，取代 ACP 外呼编程工具；任务跳转主动生成简报 | V5 步骤 25 |
| B6 | 报告即产品面：R1-R16（交付物真容、操作入口可复现、协作顺序叙事线） | V5 §8.3 |

### 2.2 Studio 现状一句话画像

来自 hermes-studio 与 overlay/custom 的源码盘点：驾驶舱 /app（三栏工作台+全局注意力条+⚙管理台）+ IDE 工作台 /app/ide（15 页签辅助面板+任务简报）+ /app/board 八页签（看板/追溯/三账/追踪/治理四分区）+ 运行中心 4 页签 + 审批收件箱 + 交付案例 + 账户管理 + 24 个收编的 /hermes-* 页 + 全屏 /matrix 客户端；hash 路由、naive-ui、Pure Ink token；Electron 壳有托盘/自动更新/桌宠/聊天与面板多窗/内嵌浏览器，**无自定义 URL scheme 深链、无渲染进程崩溃自愈**。server 面约 30 个 /api/* overlay 域。

### 2.3 推演报告暴露的已知痛点（吸收的需求侧）

run1-run5 执行态（V5 §九）与 backlog（§十）中与 UI 相关的痛点，按吸收视角归并：

| 痛点 | 出处 | 对应吸收方向 |
|---|---|---|
| 通道风暴：四池全限、fallback 链失败只能看日志 | run4 | 凭证池/回退管理器（hermes 暗能力 UI 化） |
| 消息洪流：派发/回执/缺陷/评审混在群消息主时间线 | 步骤 9-19 全程 | 线程+已读模型+通知分级 |
| "在线恒零"、顶栏遥测数据链断裂 | 补遗④回归项 | presence 呈现（x20 已落一部分） |
| Observatory 首载约 5 分钟 | 已知特性 | 轨迹视图轻量化（投影是索引不是镜像） |
| 审批线程 relation 拒发致 !approve 全灭 | run5 首夜 | 审批中心集中化+语义化选项 |
| 房间海量同名堆积 | UI 缺陷批 | 列表搜索/过滤+分区 |
| P11 Phase 2 待做（runs 徽标混排/详情骨架复用/交叉跳转） | 补遗⑥ | 运行面吸收项顺势覆盖 |
| 长线记档：SBOM、graphify、影子运行、逃逸缺陷率 | §十 6 | 治理面吸收项（本文不展开 SBOM） |

既有吸收先例：2026-09-19 调研（`2026-09-19-agent-ui-landscape-research.md`）25 项中 20 项已作为 x20 批落地（V5 §七）。本文不重复 x20 已落项，只在其上纵深。

## 三、逐组件源码盘点与贴合判断

### 3.1 element-web（Matrix Web 客户端，fork 仓库）

布局：`apps/web`（React 主应用）、`apps/desktop`（Electron 壳）、`packages/shared-components`（MVVM 共享视图）、`modules/*`（fork 定制模块）。正在向 Compound 设计系统迁移，新旧两套并存。

#### 3.1.1 用户可见功能全景（穷举，锚点相对仓库根）

**登录与账号**：密码/SSO/CAS/OIDC 多流程登录（`apps/web/src/components/structures/auth/Login.tsx:403,456`）；homeserver 选择器（`views/dialogs/ServerPickerDialog.tsx`）；注册含邮箱手机验证码与图形验证码（`structures/auth/Registration.tsx`、`views/auth/InteractiveAuthEntryComponents.tsx`、`CaptchaForm.tsx`）；忘记密码三步流程（`structures/auth/ForgotPassword.tsx`）；软登出恢复（`SoftLogout.tsx`）；扫码登录（Labs，`LoginWithQR.tsx`）；登录后安全校验屏与 E2EE 恢复密钥向导（`CompleteSecurity.tsx`、`E2eSetup.tsx`）；会话被盗专属视图（`SessionLockStolenView.tsx`）；登出前密钥备份提示（`LogoutDialog.tsx`）；显示名/头像/3pid 管理（`UserProfileSettings.tsx`）；改密码含登出其它设备；停用账号红色警告；状态消息 emoji+文字（Labs）；登录页语言选择器。

**房间列表与导航**：虚拟滚动新版列表（`views/rooms/RoomListPanel/`）；主筛选 chips（Unreads/People/Rooms/Favourites/Mentions/Invites/LowPriority，`packages/shared-components/src/room-list/RoomListPrimaryFilters/`）；分区可重排+自定义分区（`stores/room-list-v3/section.ts:231`）；收藏/低优先级/标记已读/忘记房间（右键菜单 `RoomGeneralContextMenu.tsx`）；消息预览开关；列表搜索；未读徽章分层（计数/红点/提及，`views/rooms/NotificationBadge/`）；spaces 侧栏+空间树+元空间开关（`views/spaces/SpacePanel.tsx`、`SpaceTreeLevel.tsx`）；线程活动中心（未读线程集中跳转，`threads-activity-centre/`）；面包屑最近访问（`BreadcrumbsStore.ts`）；快速设置按钮+快捷主题切换；视频房间（Labs）；邀请区带接受/拒绝/拒绝并封锁。

**消息时间线**：回复+回复预览；就地编辑；撤回含加密房间等待密钥确认；批量撤回；反应 emoji 行+最近使用+图片式反应（Labs）；@提及与 #房间 pill 渲染（`views/elements/Pill.tsx`）；已读回执头像堆叠（`ReadReceiptGroup.tsx`）；输入中指示；在线状态标签；URL 预览可折叠；置顶消息顶栏轮播（上一条/下一条/查看全部，`PinnedMessageBanner.tsx`）；线程面板（全部/我的线程过滤、全部标记已读，`ThreadPanel.tsx`）；投票（创建/结束/历史）；位置共享（当前+实时+时长选择+OSM）；语音消息（按住录音+波形）；图片/视频/音频/文件渲染含 Blurhash 占位；连续媒体成组画廊；代码块高亮含行号与折叠；长消息折叠"显示更多"；跳到未读条+read marker 线（`TopUnreadMessagesBar.tsx`）；日期分隔符+跳转到日期（Labs）；房间前驱链接；消息编辑历史 diff 对话框；加入/离开等事件聚合折叠可配置显隐；E2E 状态锁图标；未信任用户警告条；发送失败重试（含重发反应）；查看事件源码 JSON；撤回占位；聊天特效 confetti/fireworks 等（可关）；图片灯箱缩放旋转；PDF 内嵌查看（Labs）；新时间线引擎（Labs）；空房间引导卡；大 emoji；12/24 小时制与用户时区；IRC 布局宽度拖拽。

**输入区**：RTE 富文本（matrix-wysiwyg，Rust/WASM）；格式按钮全套（粗斜体/行内代码/代码块/引用/链接/列表）；纯文本模式切换；markdown；链接编辑弹窗；斜杠命令约 40 条（`slash-commands/SlashCommands.tsx`：spoiler/plain/html/jumptodate/nick/topic/roomname/invite/part/remove/ban/unban/ignore/devtools/addwidget/verify/discardsession/rainbow/help/whois/rageshake/query/msg/holdcall/unholdcall/converttodm/converttoroom/me 及 join/op/status/upgraderoom 子命令）；6 类自动补全 provider（命令/emoji/通知关键词/房间/空间/用户，`src/autocomplete/`）；表情自动替换；文件上传（按钮+快捷键+拖拽）；多文件进度条与取消；上传确认与失败列表对话框；语音录制；表情/贴纸/投票/位置按钮；提及建议含最近排序；上下箭头取回历史输入（`SendHistoryManager.ts`）；Ctrl+Enter 发送开关。

**右侧面板**（`RightPanelStorePhases.ts:12-32`，12 相位卡片）：房间信息卡（头像/主题/成员数/加密状态/分享导出）；成员列表（搜索+按权限排序+邀请）；成员详情（设备数/忽略/禁言/踢/封确认）；文件列表；通知列表面板（Labs）；置顶消息卡+全部取消置顶；扩展卡（widgets+房间布局）；线程面板；加密信息逐设备验证入口；widget 卡；PDF 卡；时间线卡。

**搜索与全局导航**：房间内消息搜索+本房间/所有房间切换+结果高亮；桌面 Seshat 本地全文索引（加密房间可搜）；Spotlight 全局搜索 Ctrl+K（人/房间/公共房间/空间混合+最近搜索+建议，`dialogs/spotlight/SpotlightDialog.tsx`）；公共房间目录+NSFW 显隐+目录服务器切换；空间内房间层级浏览；创建房间向导（加密开关/可见性四档/发布目录/非联邦/视频房间）；发起 DM 多选+邀请链接复制；加入房间预览（peek/邀请制/被禁提示/敲门 knock Labs）；房间链接分享含二维码。

**通知**：桌面通知+声音+正文显隐；新版通知设置（默认策略+关键词+按会话类型覆盖+快捷全部已读，`NotificationSettings2.tsx`）；推送目标设备管理；房间级菜单（全部/仅提及/静音）；favicon 角标（canvas 绘制 99+ 截断，`favicon.ts`）；未验证会话 Toast；来电 Toast；已读回执发送开关（隐私）。

**安全与验证**：交叉签名引导；新式密钥存储面板（开启/更换恢复密钥/失步重置）；重置身份流程；会话管理器（当前会话卡+其它会话按安全建议分组+多选登出）；设备详情；二维码互验新设备；emoji SAS 比对；验证请求对话与 Toast；手动设备密钥验证；忽略用户；个人封禁列表（Labs）；加密历史可见性房间级四档；身份服务器 discovery 设置。

**设置**（用户 12 tab+房间 9 tab）：外观（主题亮暗跟随系统/自定义主题导入含色板透明度梯度派生/字号缩放含实时预览/系统字体/时间线三种布局 Modern-Bubble-IRC/紧凑模式/图片大小）；偏好（语言+拼写检查/启动窗口行为/列表与时间线十余项显隐开关/composer 十余项/链接预览三档/媒体自动播放/时区选择器）；通知；语音视频（设备选择/回声消除/噪声抑制/水平翻转/屏幕共享源选择）；键盘（8 大类 60+ 绑定可视化+恢复默认，`KeyboardShortcuts.ts:345-759`）；侧栏；安全；加密（备份状态/导出密钥/索引进度）；Labs 特性开关全列表（约 25 项 feature_*，三层 device/account/config 存储，`settings/SettingsStore.ts`）；帮助（版本/更新检查/清缓存重载/bug 报告摇一摇 rageshake）；房间设置（通用含别名/安全四档加入规则/角色权限 power levels 完整编辑器/成员管理/桥接信息/高级含房间升级）。

**桌面壳（apps/desktop）**：单实例锁；自定义协议加载静态资源防路径穿越；全量沙箱（contextIsolation+preload 白名单）；Squirrel/electron 自动更新（轮询节流+已下载去重+EOL 平台判定+更新事件转发渲染层）；托盘（win/linux，favicon 联动换图标）；徽章数（mac badgeCount/win setOverlayIcon+任务栏闪烁）；深链 `element://`（search/hash 白名单透传+SSO 多 profile 会话映射文件 `sso-sessions.json`）；拼写检查全套 IPC+右键建议；窗口状态记忆；关闭行为纯函数决策（mac 隐藏防空菜单）；退出确认拦截；渲染进程崩溃自愈 `RendererRecovery`（60 秒窗口 3 次上限+超限错误框+决策纯函数，`renderer-recovery.ts`）；Sentry 上报；开机自启三态；平台设置桥（每项带 supported 标记一次性下发）；原生菜单+mac 隐藏标题栏；Seshat 全文索引；下载管理（保扩展名+完成后可打开）；右键菜单（链接/图片/可编辑区拼写建议）；媒体认证头注入；屏幕共享选择器（含 Linux 内置 picker）；安全存储 safeStorage 多后端（不可解密绝不覆写）；代理走原生参数。

**fork 定制（modules/）**：banner（企业品牌顶条+滑出菜单，CSS 变量主题化）；restricted-guests（免注册受限访客，`@guest-` 前缀账号自动注册+定制登录页+访客视角房间预览）；widget-lifecycle（按 URL 模式预授权 widget 能力，免弹窗零点击嵌入）；widget-toggles（指定类型 widget 房间头部显隐开关）。patches/ 11 个依赖补丁均为构建修复。

#### 3.1.2 贴合判断

element-web 是 studio 全屏 /matrix 客户端与驾驶舱中栏会话画布的上游同源参照，聊天基础设施五件（线程/已读/搜索/操作栏/通知分级）全部贴合 B1（人做最终验证者需要可控的消息面）与 B3（增强既有画布而非新页面）。桌面壳三件（深链/崩溃自愈/徽章）贴合桌面产品基本盘。不适合吸收：voip/Element Call/Jitsi/PSTN、贴纸、聊天特效、spaces 元空间体系、Mjolnir、身份服务器 discovery（S3 精简方向一致，B3）。

### 3.2 hermes-agent（AI Agent 运行时 v0.21.5，Python）

能力面远大于 studio 已驱动面。按模块穷举（锚点为仓库内路径）：

- **CLI 树**（`hermes_cli/main.py:3375-3477`）：约 30 个命令组——chat/gateway（run/stop/status/migrate --multiplex/proxy）/cron（14 子命令含 runs/incidents/notepad/doctor）/kanban（约 30 动词含 dispatch/daemon/stats/gc）/profile/sessions（export/prune/repair/recover/pin/retitle）/skills（trust/audit/opt-in/publish）/plugins（capabilities/doctor/compat/pack）/mcp（serve/add/catalog/install）/auth（凭证池 priority/refresh）/peer（跨机 bot 对 bot dm/run/status）/model/moa/fallback/worktree/browser/secrets/egress/whatsapp/slack/send/login/status/pause/sync/webhook/portal/project/hooks/doctor/security/approvals/debug/backup/checkpoints/import/config/skin/console/pairing/bundles/curator/pets/journey/memory/tools/computer-use/insights/usage/monitoring/claw/vault/update/dashboard/desktop/logs/prompt-size。
- **聊天内 slash 命令注册表约 110 条**（`hermes_cli/commands.py::COMMAND_REGISTRY`）：值得做 UI 的暗命令如 `/goal`（Ralph 目标循环+judge+gate+subgoal）、`/loop --until`、`/heartbeat`、`/queue`、`/steer`、`/btw`、`/bg`、`/agents`、`/moa`、`/review`、`/plan`、`/undo`、`/branch`、`/handoff`（会话移交 IM）、`/compress`、`/rollback`、`/snapshot`、`/suggestions`（自动化建议 accept/dismiss）、`/blueprint`、`/pause`（全局急停）、`/approve` `/deny`、`/memory`、`/insights`、`/usage`、`/topup`、`/context`。
- **gateway/**：multiplex 多 profile 路由（一机一网关）；会话身份与生命周期；审批管线（`platforms/base_exec_approval.py` 卡片+manual/smart/off 三模式+超时 settle）；配对 pairing（8 位码审批替代静态白名单，`/api/pairing*`）；授权 authz（per-platform allowlist+group policy+chat-scoped grant）；Hosted Rooms（网关自建多 agent 群聊房间：append-only 事件日志/成员/副本/执行策略，≤256 活跃）；peer 网关跨机互联；api_server（OpenAI 兼容 HTTP：runs 异步+幂等键）；投递可靠性（delivery ledger+at-least-once+catch-up）；遥测（OTLP+健康）；优雅 drain 重启；egress 代理。
- **agent 核心**：工具全清单（`toolsets.py`：web/terminal/文件/patch/lsp/vision/浏览器全家/computer_use/execute_code/delegate_task/cronjob/kanban 全家/desktop 会话附加件等约 80 项）；MCP 双向（客户端 67 个 optional-mcps 预置+服务端把会话暴露为 stdio MCP）；技能 58 捆绑+150 可选+hub 搜索安装+curator 后台维护；hooks（config shell hooks+插件生命周期 7 类）；子代理（单任务+并行批+worktree 隔离+凭证租借+心跳+live log）；循环与目标（goal/loop/heartbeat，`periodic_scheduler.py`）；双层上下文压缩（网关 85%+agent 50%，`/compress --preview`）；38 个模型 provider 插件+凭证池冷却+fallback 链+MoA；记忆 8 provider；verify 引擎（recipes/runner，stop-gate）；run budget 迭代预算；宠物 petdex；vault。
- **cron/**：4 种调度语法；每 job 可配 skills/模型覆盖/script 预跑（stdout 注入 prompt，`no_agent=True` 则脚本即全部）/context_from 跨任务链接/workdir/多平台投递；at-most-once+catch-up 窗口+incidents 台账；蓝图目录（模板+槽位实例化，`/api/cron/blueprints/instantiate`）+使用建议流。
- **acp_adapter/**：ACP JSON-RPC over stdio，给编辑器集成用（会话可 fork/resume/load）。
- **通道**：内置 8 平台+插件 22 平台（matrix/slack/discord/telegram/飞书/钉钉/企微/email/line/irc/signal/qqbot/微信 iLink 等）；17 语言 locales。
- **官方 web dashboard**（`web/src/pages/`，端口 9119，19 页面+插件 slot 注入）可作交互参照。

**贴合判断**：这是"治理面暗能力 UI 化"的原料库，贴合 B4（自主权可溯源）与 B1（人守闸）。run4 通道风暴证明凭证池/回退链必须有 UI。cron+蓝图+建议贴合"运行中心"既有页签的纵深。Hosted Rooms+peer 是 swarm 概念的原生后端，studio 目前只有 matrix 一条通道（远期）。

### 3.3 编码代理五家（zcode / claude-code / codex / kimi-code / minimax-code）

五家全部是"用户可见功能与交互"盘点（详细锚点在调研记录，此处每家列关键面）：

**zcode**（智谱，桌面+Web+TUI 三端同协议 Zcode Protocol V4，studio IDE 底座）：斜杠命令 20 条（help/login/compact/init/expert/effort/dwf/fork/locale/mcp/plugins/mode/model/new/resume/rewind/skill/goal/workflow）；四档权限模式 plan/build/edit/yolo+审批面板（逐条 Bash 前缀 scope 说明+队列）；fork/rewind 基于 workspace checkpoint（文件+会话双轨）；动态工作流 DWF（模型写 TypeScript 编排脚本→编译器静态分析与 schema 合成→**用户确认后才启动**→多 actor 子会话+SQLite journal+泳道时间线可视化）；桌面 Side Pane 多类型 tab（终端/内嵌浏览器/代码查看/白板/模型调用轨迹/开发者工具/后台 Bash/计划详情/选中代码侧聊/子代理目录/工作流 actor）+tab 总览+tab 搜索；近 40 种工具调用专属渲染器；插件市场（Featured/Installed Strip 等商店术语）；hooks 7 类事件；键盘优先。

**claude-code**（Anthropic，仓库为官方开源文档+mods/plugins，功能从 CHANGELOG 7882 行提取）：斜杠命令极广（会话/上下文/模型/权限/任务/审查/环境/配置八类百余条）；Esc-Esc 快速 Rewind+Ctrl+O 全屏 transcript（后台工具结果完成后补显）；`/btw` 侧问；排队消息；auto mode（服务端分类器自动放行+拒绝时点名规则回喂模型换安全做法+危险命令无人应答 2 分钟自动拒并给改写提示+`/insights` 量化收益）；`/diff` 旁栏实时变更面板（未提交变更按文件+hunk 随 agent 改文件实时刷新）；`claude agents` 多后台会话看板；statusline 可执行脚本驱动（context_window/限额/缓存命中率/成本）；`/context` 上下文构成可视化；CLAUDE.md 分层+AGENTS.md 四种合并策略；auto memory。

**codex**（OpenAI，Rust workspace）：斜杠命令 50+（TUI `slash_command.rs` 枚举）；resume picker 懒加载 transcript 预览+分页+Resume/Fork 双动作；`/worktree` 会话进 git worktree；`/side` 临时侧聊+只读命令白名单；审批选项语义化全集（"Yes, and don't ask again for commands that start with npm"/"allow this host for this conversation"/"don't ask again for these files"），网络逐域名询问，多请求批量审批，决策写入历史 cell；沙箱三档（read-only/workspace-write/danger-full-access）+命令失败自动请求带更多权限重跑；`/statusline` 约 30 项可选可预览（context remaining%/限额/估算美元成本/TaskProgress）；`/agents` 多代理 command center（分组/线程/用量/动作）；`/memories` 设置三态（Use/Generate/Reset）；`/import` 从 Claude Code 迁移配置与项目；`/experimental` 特性开关；vim 模式+快捷键速查。

**kimi-code**（Moonshot，TS monorepo）：命令带优先级与可用性规则（idle-only/always）；三档权限（Always Ask/Ask When Needed/Never Ask）+数字键直选审批；Ctrl-S Steer 注入运行中 turn；AgentSwarm 批量派发（一个模板+items 数组，渐增并发，128 上限）+实时进度面板；goal 模式（finish-line+预算+`next` 排队管理器）；`/mcp-config` 对话式 AI 配置 MCP（不手编 JSON）；视频粘贴输入（多模态差异化）；`!` shell 模式（输出入会话上下文）；swarm/tower 多分支塔；ACP+Web+remote-control。

**minimax-code**（MiniMax，开源恢复版 TUI）：**History 浏览器**（搜索历史提示→每条可选 Fork/Edit/Rewind→rewind 再分"仅会话/会话+文件"双 scope→逐文件 Ready/Skipped 预览确认）；`/btw` 侧聊（继承最近完整前缀，未完成工具组整组排除，Ctrl+/ 主侧切换）；tok/s 净输出速度指标（排除首 token 与工具时间）；终端标题状态化（"Needs approval | Fix login | MCode"）；`/queue` 排队管理；`@` 同时搜文件与插件（选中后该消息限定用该插件工具）；遥测三通道默认全关分别 opt-in（隐私标杆）；权限三档 ASK/AUTO/FULL 紧凑标签。

**贴合判断**：五家横评的吸收价值集中在 IDE 工作台（B5）。x20 批已落 presence/workdir/resume/roster/thread-usage/memory 新鲜度/brief 差异度量/modelroute Auto 档。本文新增建议取：minimax History 浏览器+rewind 双 scope、claude `/diff` 常驻变更视图、codex 审批语义化选项、kimi steer+排队、codex/minimax 可配置状态行与 tok/s、zcode DWF 工作流时间线（studio 已有 WorkflowObservationPanel 骨架，补泳道时间线语言）。

### 3.4 dsh-TUI（DeepSeek Harness 的第三方终端 UI，Ink/React）

核心设计："会话事件日志是唯一真源，TUI 是投影"。穷举要点：

- **Trajectory 轨迹场景**（`src/screens/TrajectoryScene.tsx`、`components/trajectory/`、`dsh-adapter/trajectory/`）：全屏四区（header/wake 波带/ledger 账本/inspector）；timeline 视图（压缩墙钟：忙段又宽又高、空闲塌成细线，可切 equal/wall-clock/collapsed）与 hotspot 视图（按 duration/count/tokens 聚合排序）；节点类型 turn/step/tool/subtool/retry/approval/compaction/context/todo 等，连续同名工具折叠成 burst 行；每消息 token 记账（input/output/think/cacheRead/cacheWrite）；查询语言 `tool:` `kind:` `err:` `>10s` `tok>1k` 前缀 AND 组合原地高亮，`[`/`]` 跳错误、`{`/`}` 跳轮次；**投影是索引不是镜像**（node 只带 seq 引用，inspector 按需回读不可变快照）。
- **统一会话管理屏**：左 workspace 栏+右会话列表，每行实时 live 状态；**OCCUPIED 会话锁**（被别的进程占用的会话显示持锁 pid 拒绝进入——两进程驱动同一 append-only 日志会交错事件）。
- 命令 45+ 条（会话/状态/显示/账号/其它五类）；主题 JSON 用户化（base 上叠 colors 子集）；活动偏好指示器；像素鲸鱼宠物；DeepSeek 余额查询+会话成本估算（主+子 agent，按模型×峰值/空闲×缓存分量计价）；Kitty/Sixel 图片缩略图；Mermaid Unicode 绘制；LaTeX 排版；`@` 文件补全+`#L12-14` 行范围；Ctrl+R 历史搜索；全屏草稿编辑器；VS Code 选区通道；跨 agent 会话迁移 `/migrate`（claude-code/codex/OMP/zcode/Grok，幂等，保留 reasoning 与压缩检查点）。

**贴合判断**：Trajectory 是运行观测的现成信息设计（B4 可监督性），且"投影是索引"设计正好回应 Observatory 首载 5 分钟痛点；OCCUPIED 会话锁对应多终端驾驶舱的会话占用语义；成本估算模型可补 IDE 状态栏。

### 3.5 deepseek-harness（DeepSeek 官方 agent 底座，everything-is-a-plugin）

- **ui-trajectory Web 版**（`packages/client/` 的 ui-trajectory 包）：turn 感知事件账本+交互式 timing overview+逐记录 inspector+只渲染可见行+流式跟尾。与 dsh-TUI 互为印证，Electron/Vue 可直接参考。
- **桌面常驻宿主工程决策**（`apps/desktop/README.md`）：关窗=隐藏不退出（托盘后台续跑）；**退出前询问 Host 会打断什么**（运行中 agent/排队消息/定时提醒三类解释文案）；更新安装等待本地 analytics 收尾；嵌入式平台账号页按 origin+账号哈希持久分区隔离；F12 开 DevTools 含打包版；快捷键 chord 系统（userData/keybindings.json 主进程校验）。
- **内置运行时 payload**：自带独立 Python/Node/pnpm 发行版（numpy/pandas/office 库离线装配+manifest 摘要换版本）；默认注册 office-docx/pptx/xlsx 技能。
- **设置信息架构**：ui-settings-* 分包（general/models/plugins/plugin-inventory/agent-loop/subagent/web-search/shell/account 分区）。
- **benchmarks 按用户路径组织性能门禁**（`benchmarks/`）：session-open/long-session-browser/conversation-fold/active-stream-reconnect/terminal-io；纪律=跑生产入口、合成固定输入、纯 Node worker、预算是评审过的常量。
- website 的 llms.txt+每页 Markdown 孪生（给 agent 消费的文档出口）。

**贴合判断**：桌面宿主决策清单直接服务 studio Electron 壳（退出前任务盘点对话尤其贴合"驾驶舱常驻"定位）；ui-trajectory 与 dsh-TUI 双实现降低移植风险；性能门禁方法论服务"首载 5 分钟"类问题的治理。

### 3.6 multica（人+agent 混编团队工作区，Web+Electron+iOS+Go 后端+本机 daemon）

驱动 26 种已装 agent CLI 当"数字员工"。核心概念：Workspace>Agents（有名有姓：名字+provider+runtime+权限范围）/Squads/Skills/Runtimes（你的机器=agent 工位）/Issues（子任务+自定义状态）/Runs/Autopilots（cron 跑 standup/审计）/Inbox（**agent 需要人决策时才 ping，不是每步都通知**）/Usage（按 agent×issue 的 token 费用）。

UI 面穷举：Issues 三视图（Board 拖拽/Table 列定制/Gantt）+find-bar+filter-chips+批量工具栏+卡片 peek+行内评论与选区气泡评论+**comment-runs（评论里嵌 run）**+**execution-log-section（回放每个工具调用/命令/错误+时间戳）**+deliverables+agent 活动指示；Agents 页（inspector/profile 卡/头像栈/**presence 在场指示**/**live-peek-card 实时偷看 agent 在干嘛**/sparkline 活动趋势/活动 hover 卡/**Build with AI 用一段描述生成 agent 配置**/instructions 编辑器）；Chat（多窗口+queue+快捷 agent 栏）；Inbox 低噪；Usage（trend-card/**leaderboard**/errors-tab）；渠道集成（Slack/飞书/钉钉/企微/Telegram）；Git（GitHub/GitLab/Gitea/Forgejo 含自托管，PR 与 run 关联）；**Steering**（agent 运行中回帖落进当前 run 而非下一个）；桌面专属（**登录后自动启动内置 daemon+独立 profile 与终端 CLI 互不干扰**；**按 workspace 记忆的多 Tab（可排序/置顶/每 tab 独立前进后退+滚动位置，登出清空）**；自动更新分架构；崩溃恢复 renderer/daemon 双线）；ui-lab（**独立设计工作台**：编辑语义色明暗双主题/typography/radius，原版与修改并排对比，undo/redo/保存命名 scheme，**导出可合并的 CSS token 补丁而非直写源文件**，对比度校验，iframe 隔离预览）；CLI 的**线程感知评论读取**（单线程/尾部截断/最近活跃线程游标/增量轮询，专为 agent 上下文预算设计）。

**贴合判断**：与"团队驾驶舱"最同构的竞品。live peek/execution log/leaderboard/Steering/inbox 低噪五件直接服务 B4（可监督性）；桌面内置 daemon+独立 profile 与 studio 的 runtime-manager 现状互补；ui-lab 是 Pure Ink 主题治理的工具化方向。

### 3.7 routa（Harness 内建的多 agent 交付工作台，Next.js+Tauri+Rust Axum）

- **看板即协作总线**：列模型 backlog/todo/dev/review/done/blocked，**每列一个 specialist prompt 契约+证据契约**（Backlog Refiner→Todo Orchestrator→Dev Crafter→Review Guard→Done Reporter→Blocked Resolver，`resources/specialists/`）；卡片工件随流程单调递增（story YAML→执行 brief→Dev Evidence→Review verdict→完成摘要，"每列改变下一列可以信任什么"）；列自动化配置 `requiredArtifacts` `requiredTaskFields` `contractRules` `autoAdvanceOnSuccess`。
- **三层 Review Gate**：Harness Monitor（发生了什么：traces/变更文件/命令/git 状态归因）→Entrix Fitness（应该为真：硬门禁+证据要求+文件预算，`entrix run --tier fast|normal`）→Gate Specialist（能否过卡：验 AC 路由 Done/Dev/人工升级）。
- harness-monitor TUI 四问（谁还活着/文件最近谁改/有无未归因冲突变更/worktree 是否被 fitness 挡住）。
- 会话挂真实 PTY；GitHub 仓库导入为虚拟 workspace；Feature Explorer（自动生成路由/API 索引自查）；VS Code 扩展=Webview 全产品+自动注册当前文件夹。

**贴合判断**：与六闸叙事同构度最高的参照。studio 已有 column-automation 域（`/api/column-automation`）与治理中心，可吸收"列=specialist+证据契约+工件单调递增"模型升级为流水线治理（B2：判词真值化=只认证据契约产物）。三层 Review Gate 对应 G4 独立验证的机制化。harness-monitor 四问是"多 agent 监控页"的信息设计清单。

### 3.8 其余组件归属说明

- **hermes-studio**：即 Swarm Studio 上游本体（v0.7.26），本文作为差距基线（§2.2），不作为吸收源。
- **codex/claude-code/kimi-code/minimax-code/zcode**：见 §3.3。
- 无需单独深挖的：`dsh-TUI` 依赖的 `deepseek-harness` 已单列；其余组件（如纯库类目录）无独立 UI 面。

## 四、差距分析：按 Studio 面横向聚合

把 12 个组件的吸收点映射到 studio 既有面（全部 /app 树内，B3）：

### 4.1 驾驶舱沟通面（中栏会话画布+左栏列表）

| 缺口 | 现状 | 参照实现 | 贴合标尺 |
|---|---|---|---|
| 线程 Threads | 群消息单时间线，多话题并发刷屏 | element-web ThreadPanel+线程活动中心 | B1 |
| 已读模型 | 无 read marker/跳未读/已读回执 | element-web TopUnreadMessagesBar/ReadReceiptGroup/Unread.ts | B1 |
| 全局混合搜索 | 页头搜索框功能弱 | element-web Spotlight（人/房间/任务/会话/命令混合+最近） | B3（增强页头既有入口） |
| 消息操作栏 | 仅有基础操作 | element-web 上下文菜单分层（回复/引用/复制/转发/查看源/派生任务） | B1 |
| 通知分级 | 铃铛下拉双页签 | element-web NotificationSettings2（默认策略+关键词+按 agent/通道覆盖+全部已读） | B1 |
| 列表分区过滤 | chips 有基础过滤 | element-web 主筛选 chips+自定义分区 | B3 |
| 撤回/编辑留痕 | 无 | element-web 编辑历史+撤回确认+发送失败重试 | B2（可审计） |

### 4.2 IDE 工作台

| 缺口 | 现状 | 参照实现 | 贴合标尺 |
|---|---|---|---|
| History 浏览器+rewind 双 scope | 任务菜单 fork 缺失 | minimax /history（Fork/Edit/Rewind+仅会话/会话+文件+逐文件预览） | B5 |
| 常驻变更视图 | diff 在审查页签，非常驻 | claude /diff 旁栏实时刷新 | B5 |
| steer+排队面板 | 排队编辑有，steer 无 | kimi Ctrl-S/minimax /steer+/queue | B5 |
| 审批语义化选项 | 审批卡 Allow/Deny 粒度粗 | codex "Yes, and..." scope 说明+逐前缀/域名/文件放行 | B4 |
| 状态行可配置 | IdeStatusBar 固定项+遥测簇 | codex /statusline 约 30 项可选可预览；minimax tok/s | B4 |
| 上下文可视化 | 水位条有 | claude /context 构成分解 | B4 |
| 工作流时间线 | WorkflowObservationPanel 三区块 | zcode DWF 泳道时间线（站点灯/actor 药丸/失败空心灯） | B5 |
| 侧聊 | 辅助对话 MVP | minimax /btw+Ctrl+/ 主侧切换+继承边界 | B5 |

### 4.3 看板与治理面

| 缺口 | 现状 | 参照实现 | 贴合标尺 |
|---|---|---|---|
| 列证据契约 | column-automation 域在，无 specialist/契约语义 | routa 列模型+工件单调递增+autoAdvanceOnSuccess | B2 |
| 三层 review gate | G4 靠流程脚本 | routa Monitor→Fitness→Specialist | B2 |
| agent 在场呈现 | presence 部分落地（x20） | multica live-peek-card+sparkline+活动指示 | B4 |
| 执行日志回放 | 任务抽屉有事件流 | multica execution-log-section（时间戳化工具调用流嵌评论时间线） | B2 |
| 用量排行 | token-meter 三投影 | multica usage leaderboard+trend | B4 |
| 多 agent 监控四问 | 无专门信息设计 | routa harness-monitor 四问 | B4 |

### 4.4 运行面（运行中心+轨迹）

| 缺口 | 现状 | 参照实现 | 贴合标尺 |
|---|---|---|---|
| 轨迹视图 | 拓扑图+时间轴，无轨迹账本 | dsh-TUI Trajectory+deepseek ui-trajectory（波带/hotspot/谓词查询/跳错误） | B4 |
| 会话占用锁 | 无 | dsh-TUI OCCUPIED（持锁 pid 拒进入） | B4 |
| 常驻意图面板 | 循环分组有基础展示 | hermes /goal+/loop+/heartbeat 的 UI 化（judge 历史/gate 状态/wait pid） | B1 |
| cron/蓝图/建议 | JobsView 收编页 | hermes cron 引擎+blueprint_catalog+suggestions 三件 UI | B4 |

### 4.5 桌面壳

| 缺口 | 现状 | 参照实现 | 贴合标尺 |
|---|---|---|---|
| 深链协议 | 无 setAsDefaultProtocolClient | element-web protocol.ts（search/hash 白名单+SSO 多 profile 映射） | 产品基本盘 |
| 崩溃自愈 | 无 | element-web RendererRecovery（60s/3 次上限+纯函数决策） | 产品基本盘 |
| 徽章链路 | 系统通知有 | element-web badge.ts+favicon.ts（renderer 画 badge→setOverlayIcon/badgeCount） | B1 |
| 退出前任务盘点 | 直接退出 | deepseek desktop（运行中 agent/排队消息/定时提醒三类解释文案） | B1 |
| 多 Tab | 面板多窗有 | multica 按 workspace 多 Tab+每 tab 独立历史 | 使用习惯 |

### 4.6 通用基建

| 缺口 | 现状 | 参照实现 |
|---|---|---|
| 弹窗栈管理 | naive-ui 受控 Modal | element-web ModalManager（priority/static+onBeforeClose+finished Promise） |
| Toast 双轨 | ide/utils/toast 自给 | element-web 紧急/非紧急双容器+实例计数去重 |
| 右面板卡片机 | IDE 15 页签已类似 | element-web RightPanel phase 卡片+按上下文记忆面板状态 |
| 快捷键四件套 | 命令面板 keymap 可改 | element-web action 枚举→平台默认→可视化设置页→一键重置 |
| 主题 token 派生 | Pure Ink 手工 token | element-web 自定义色自动派生透明度梯度+prefers-contrast；multica ui-lab 工作台 |
| 性能门禁 | 无固定路径集 | deepseek benchmarks 用户路径纪律 |
| 文档 agent 出口 | 无 | deepseek llms.txt+每页 Markdown 孪生 |

## 五、吸收建议清单（分期）

每项：内容（来源锚点）→ studio 落点 → 贴合标尺 → 验证方式。验证一律三层验法（产物 grep+HTTP 200+真浏览器走查）加守门测试；走查脚本入 `overlay/scripts/` 既有模式。

### 近期（直接服务 run6 演示与日常使用）

1. **群聊线程 Threads**：element-web `ThreadPanel.tsx`/`ThreadView.tsx` 交互范式 → 驾驶舱中栏群聊卡与 /matrix 客户端，消息操作栏"在线程中回复"；线程活动中心合并入页头通知下拉。贴合 B1。验证：群内两条线程并发可各自展开回看，未读线程计数可见。
2. **已读与未读模型**：read marker 线+跳到未读条+列表徽章分层 → 左栏 FlowNavPanel 列表与中栏时间线。贴合 B1。验证：多房间制造未读，徽章计数、跳转、标记已读逐项走查。
3. **Spotlight 式全局搜索**：Ctrl+K 混合搜人/房间/任务/会话/命令+最近搜索 → 增强页头既有全局搜索框（不新增入口）。贴合 B3。验证：五类对象各搜一次直达。
4. **消息操作栏全家桶**：回复/引用/复制/转发/查看事件源/派生看板任务 → 中栏会话画布。贴合 B1+B2（派生任务即"消息转结构化产物"）。验证：每动作逐项可感知。
5. **通知分级中心**：NotificationSettings2 范式（默认策略+关键词+按 agent/通道覆盖+全部已读）→ 页头铃铛下拉扩展+设置页。贴合 B1。验证：静音某 agent 通道后其消息不进未读。
6. **运行轨迹视图**：dsh-TUI Trajectory+deepseek ui-trajectory 的 Web 化（timeline 压缩墙钟+hotspot 聚合+`err:`/`>10s`/`tok>1k` 谓词过滤+inspector 按需回读）→ RunDetailView 新增轨迹页签+IDE 辅助面板复用；投影是索引不是镜像（对 793 任务×秒级 detail 的首载痛点直接受益）。贴合 B4。验证：一次 run6 真实轨迹可查询、可跳错误点、首屏秒级。
7. **hermes 暗能力 UI 化第一批（审批+cron）**：审批中心跨 profile 聚合收件箱（gateway 审批卡+manual/smart/off 模式切换+超时 settle 呈现）扩展 /app/inbox；cron 任务列表（next_run/状态/runs/incidents）+蓝图画廊+自动化建议卡片流挂运行中心。贴合 B1+B4。验证：审批队列真卡可裁决；cron 建议可 accept 后生成任务。
8. **桌面壳三件**：深链协议 `swarm://`（search/hash 白名单透传）；渲染进程崩溃自愈（RendererRecovery 纯函数移植）；dock 徽章（未读→badgeCount/setOverlayIcon）。验证：深链打开指定任务；人为杀渲染进程 3 次内自愈；未读数体现在 dock。

### 中期（下一个迭代周期）

9. **审批语义化选项**：codex "Yes, and…" scope 说明（前缀/域名/文件三类范围记忆）→ 审批卡与 /app/inbox。贴合 B4。
10. **History 浏览器+rewind 双 scope**：minimax 交互 → IDE 任务会话（Fork/Edit/Rewind+仅会话/会话+文件+逐文件预览）。贴合 B5。
11. **常驻"Agent 改动"视图**：claude /diff 旁栏 → IDE 右辅助面板新页签（或审查页签升级），随会话改文件实时刷新。贴合 B5。
12. **steer+排队面板**：kimi/minimax → IDE 中栏输入区（运行中可注入下一可中断点；排队可视可撤）。贴合 B5。
13. **状态行可配置+tok/s**：codex 约 30 项可选+minimax 净输出速度 → IdeStatusBar 设置化。贴合 B4。
14. **agent 在场与执行回放**：multica live-peek-card+sparkline+execution-log-section → 看板卡与任务抽屉（工具调用时间戳流嵌事件时间线）。贴合 B2+B4。
15. **用量排行**：multica leaderboard+trend → 治理中心运行态分区（token-meter 已有三投影作数据源）。贴合 B4。
16. **列证据契约**：routa 列模型（specialist+requiredArtifacts+工件单调递增+autoAdvanceOnSuccess）→ /app/board 编排配置升级（column-automation 域扩展）。贴合 B2。
17. **凭证池/回退管理器**：hermes auth/fallback/credential_pool UI 化（健康/冷却/优先级拖拽+fallback 链编辑）→ 设置域。run4 通道风暴的直接对策。贴合 B4。
18. **会话操作台**：hermes sessions FTS+CJK 搜索/分支/检查点/导出 UI 化 → IDE 会话列+历史页。贴合 B5。
19. **MCP+插件商店**：能力矩阵（注册了哪些工具/hooks/命令）+OAuth 连接向导+doctor → 收编页升级。贴合 B4。
20. **goal/loop 常驻意图面板**：hermes /goal judge 历史+gate 状态+wait pid → 运行中心。贴合 B1。
21. **ui-lab 设计工作台**：multica 模式（token 实验+导出 CSS 补丁+对比度校验）→ 主题治理工具（内部资产）。贴合 B3 精神。

### 远期（记档，按需启动）

22. Hosted Rooms+peer 拓扑 UI（hermes 原生多 agent 房间与跨机互联）。
23. routa harness-monitor 四问监控页（谁活着/谁改的文件/未归因冲突/是否被门禁挡）。
24. dsh 成本估算模型（主+子 agent、模型×峰值/空闲×缓存分量）入状态栏与用量页。
25. 竞品迁移 /import（codex 从 Claude Code 导入配置/项目/近期会话的降摩擦手段）。
26. benchmarks 用户路径性能门禁（session-open/long-session/conversation-fold/stream-reconnect 四路径+预算常量纪律）。
27. llms.txt+文档 Markdown 孪生（给 agent 消费的文档出口）。

### Non-goals（明确不吸收）

- 语音视频通话域（Element Call/Jitsi/PSTN/画中画/拨号盘）：S3 已默认关语音，与理念无关。
- 贴纸/宠物商店/聊天特效：S3/S1 精简方向相反（petdex 已有且默认关）。
- Mjolnir 个人封禁列表、身份服务器 discovery、3pid 邮箱邀请、访客受限访问（restricted-guests）：matrix 运营域超范围（该模块留档，若未来需要外部观察者只读入口再启）。
- spaces 元空间体系：studio 用任务/项目/团队组织信息，吸收其"分区+筛选"思想即可，不引入第二套空间树。
- kimi tower 多分支任务塔：与 worktree 体系重叠。
- Tauri+Rust 后端重构（routa 架构）：仅记档为架构参照，不迁移。
- iOS/移动端（multica Expo）：超出桌面产品定位。
- 任何新增一级导航页面：违反 B3 驾驶舱聚焦，所有落点必须 /app 树内既有功能区。

## 六、与既有 backlog 的衔接

- P11 Phase 2（runs 列表 loop/workflow 徽标混排、workflow run 复用 RunDetailView 骨架、IDE↔运行详情交叉跳转）：与建议 6 轨迹视图同文件同动线，建议合并一批实施。
- P12 治理中心页签化（在途 rebase）：建议 14/15/16 的治理与看板落点等 P12 合入后开工，避免同文件冲突。
- 长线记档项（graphify 代码知识图谱、影子运行/双跑对比、逃逸缺陷率）：本文不替代，轨迹视图（建议 6）为逃逸缺陷率数据提供采集面。
- x20 已落项（presence/workdir/resume/roster/thread-usage/memory/brief/modelroute）：本文建议 9-13 在其上纵深，不重复。
- i18n：新面词条沿用漂移期本地字典模式，漂移治理后收编（P11 先例 i18n-run-surface）。

## 七、限制声明

- 本文档为只读调研，未改动任何代码；全部结论锚点来自 upstream 源码与 V5 正本、推演报告执行态。
- 6 路深挖为源码抽样精读加目录穷举，个别交互细节（如 element-web Labs 特性的实际完成度）以源码存在性为准，未逐特性实机验证。
- claude-code 仓库不含 CLI 引擎源码，其功能面从官方 CHANGELOG（7882 行）与 mods/plugins 提取，属文档级一手材料而非源码级。
- 元素级 UI 还原（像素/动效）不在本文范围，吸收指交互范式与信息设计。
