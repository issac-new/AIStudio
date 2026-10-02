# upstream 技术组件吸收分析·补全版：穷尽盘点与推演交叉对照

日期：2026-10-01　　性质：调研设计文档（只读分析，未动代码）　　owner：本轮调研会话

> **执行终态记档（2026-10-01 深夜，用户裁定「帮我判断形成方案推进落实」后实施）**：
> §六近期 6 项经源码核实后按四批处置——
> **A 批（建议 1 上游自用四件）已落地合 main 05dc790c**：Web 终端收编三段链（ANNEXED_LEGACY+VIEW_LOADERS+侧栏条目）、Spotlight 底部会话全文深搜升级行（openSessionSearch 接线，此前零调用方）、页头账户区版本号钮+changelog 弹窗（上游 11 语言数据接线）、petdex/agentManager 门控一致性（S3 既定语义补消费方）+features.ts 重复键清理；守门 9 例新增+邻域回归 460/460 全绿。
> **B 批（建议 2 消息面治理）两件落地合 main da28a1ec**：系统事件聚合折叠（连续 ≥3 条状态事件折叠一行可展开，element-web 合并行范式）+permalink 改 studio 内链（#/app/s/room/:roomId?event=:id 编码）+房间路由 event 参数直跳（jumpToEvent 为 C6 修过的全链路）；守门 6 例新增+matrix-chat 47/47 全绿。tab 溢出一件（建议 2 第三件）记档：目标组件定位不确定（疑似上游 ChatPanel 会话 tab，需 patch 路线），不为显得有进展而猜改。
> **C/D 批（建议 4/5/6）源码核实后判定不重复造轮**：待审批汇聚=注意力条 blocked/review/triage 梯队+决策行+铃铛双计数已实质覆盖（首轮 #7 跨 profile 审批中心在）；web 房间深链选中=MatrixRoomCanvas routeRoomId→selectRoom 既有（D3 兜底），B2 已补强 event 直跳；通道状态卡=RuntimeSection 凭证池卡（provider/failed/failureDetail+失败徽标）+SLO 分档成功率+p95+错误预算已在（首轮 runtime-caps 批），实时冷却/优先级编辑维持首轮 #17 记档待环境。
> 建议 3（房间列表卫生）未动，留待下批。

> **二轮执行终态记档（2026-10-01 深夜续，用户裁定「完成所有剩余工作」后实施）**：
> **建议 3 落地合 main 503db60e**——房间列表排序器三档（活跃/未读/名称，localStorage 持久化，
> element-web skip-list sorters 范式；sortFlowRows 单一事实源）+同名房悬停从属标注（房 ID+最后活跃时间）；
> 守门 7 例新增+flow 系 20/20 绿。
> **建议 2 第三件（tab 溢出）改判关闭**——缺陷载体（会话 tab 条）在 v12/v14 重构中已退役，
> 痛点实质（同名不可区分）由左栏消歧后缀+排序器+搜索承接。
> **建议 4-6（C/D 批）维持核实结论**（已覆盖不重造，见上节）。
> **中期 #8 核实过半**：?board= 直链与板选项带计数上游原生已在（KanbanView.vue:60-99），
> 首轮台账此处过时；计数口径统一（stats-bar 读 kanbanStore.stats vs boardOptions 读 board.total
> 两数据源）需动上游 store/server 聚合，漂移期 patch 不可验证，记档带锚点待治理轮。
> **中期 #15 落地**：插件接缝定义文档 `2026-10-01-plugin-seam-definition.md`（八组 24 缝枚举+
> 不开放面+实施前提，合 main 3bda8d1e）。
> **浏览器走查 10/10**（`scripts/absorb-round2-walkthrough.mjs`：changelog/深搜/终端收编/
> 门控/排序器/event 深链，href 硬断言替代文案断言——locale 时序使文案中英不定）。
> **中期受阻项记档**：#7 会话家族树（Fork/Rewind 依赖 hermes 会话分叉命令通道，runtime 未就绪，
> 首轮 #10 同源记档）；#9 工件编辑器+新鲜度徽标（自有治理中心工程，等 P12 页签化合入后开工，
> 防同文件冲突——沿用首轮纪律）；#10 暗能力 UI 化第二批（tui_gateway 127 RPC/subagent/spawn_tree，
> hermes runtime 通道未就绪）；#11 蓝图实例化 UI（CLI 通道已通，需 /api/cron/blueprints 协议
> 考证+槽位表单设计，专项轮）；#12 ekko/JEV 开 flag（产品裁决项：开 flag 后需走查评估面，
> 不擅自开）；#13 设置架构升级（element-web 三层范式是大工程，与 #15 插件宿主同批设计更省）；
> #14 Squads 混编面（账户管理页延伸工程，等 #12/#13 裁决后统一定交互）。
> **环境修复记档**：dev 起不来根因=.overlay-injected.json manifest 落后 series 两条（537/538
> 实际已在树），ensure-injected 补套失败即退——核实树内证据后登记 manifest 两条，
> 恢复 dev；走查五坑新增两条=naive-ui 关闭钮不响应合成 JS click（必须 locator 真点）、
> dev 实例 DefaultCredentialPrompt 自动弹窗须每步清场。
> **三轮执行终态记档（2026-10-01 深夜续二，用户裁定「完成所有剩余任务」后实施）**：
> **#7/#10/#11 实证维持受阻（证据升级）**：本机 hermes CLI（v0.21.5+5355）无 blueprints
> 子命令、/api/cron/blueprints 经 studio 后端 404——「CLI 通道已通」仅指 CLI 本体可用，
> 蓝图/分叉/RPC 面均不可达，维持记档待 runtime。
> **#9 落地合 main 9adb5959**：通用工件编辑链（PUT /api/governance/doc 保存即本地提交+
> ref 分支证据件 409 只读+工作树优先读+docMeta HEAD/origin 取新）+工件卡新鲜度徽标
> （本轮<24h/旧轮，24h 为轮次窗口代理判定如实标注）+**P12 docview flex 压扁根治**
> （走查实锤：内容列受限时文档盒压到 2px、头部被 reviews 覆盖，flex-shrink:0+min-height
> 修复；「overflow 的 flex 项必防压扁」又一实证）。守门：服务端 4 例新增（temp 仓自包含）+
> 客户端静态 5 例+治理域 110/110 绿；走查 gov-doc-edit-walkthrough.mjs 4/4。
> **#12 可开证明**：ekko 四页（memory/skills/mcp/settings）flag-on 实例走查 4/4 不被守卫
> 弹回（scripts/ekko-flagon-walkthrough.mjs 入库）——默认仍关，开 flag 只差用户一句话。
> **#13/#14/#16/#19 方案与评估落盘**：`2026-10-01-absorb-round2-remaining-plans.md`——
> #13 三层迁移三步（步 1 无依赖可做）；#14 依赖实证解除（与 ekko/设置无耦合），先 spike
> 验证 registry 事件冲突合并再铺 UI；#16 对标 30 域出两真差距（webhooks 管理面收编=
> 低成本高价值可下批、backend 所有权仲裁=架构专项）；#19 拆两段（九件套契约文本入库
> 零模型变更可做、评审多层列专项）。走查新坑=gov 页冷载 selector 等待不稳
> （state:'attached'+预热+稳定子选择器）。
盘点范围：`upstream/` 全部 12 个组件 + `overlay/` 现状基线 + 推演语料（V5 正本、V3 生命周期、aipaydev 全链报告、ncwk-sim-mux evidence 全部报告与审计）
上位文档：《2026-10-01-upstream-absorption-analysis.md》（下称首轮）——27 项清单已全部收口，逐项终态见其附录对账表。本文是它的补全版：首轮是抽样精读，本文按"无遗漏"要求做穷尽盘点，并新增两个首轮没有的视角——**hermes-studio 上游暴露面 diff**（上游有而 studio 没用起来的面）与**推演改进点×吸收源交叉对照**（需求侧驱动）。

> 主旨三句话：本文唯一主旨是把 12 个 upstream 组件的功能与 UI 穷尽到底（首轮未展开的面全部展开），用 69 条推演改进点台账做需求侧校验，找出首轮之后仍然成立的吸收缝隙。受众是裁决者与后续实施会话。读完后建议动作是对第六节分期清单逐项裁决。

## 一、结论总览

七路源码深挖（约 14M token 调研量）与 69 条推演改进点台账交叉后，结论修正首轮的三处判断，并确认三个新方向：

1. **首轮"差距三类纵深"判断仍成立，但最大的未利用面不在外部组件，而在上游本体**。hermes-studio（已更名 ekko-studio v0.7.26）自身有六个面"有而没用起来"：Web 终端（路由活着、superadmin 门控现成、零导航入口）、SessionSearchModal 全局会话搜索（组件全局挂载但 overlay 侧零调用方）、changelog 更新弹窗（072 重写侧栏时丢弃，11 语言数据闲置）、ekko/JEV 评估体系（server 路由在线纯 flag 关）、语音全家（tts/stt 路由与 WS 全保留）、session-shares 外链族（server 在线前端关）。**吸收的第一优先级是把自己的上游用起来**（详见 §4）。
2. **hermes-agent 的界面资产被首轮严重低估**。它不只是运行时：自带官方 Web dashboard（19 页逐页 API 面，端口 9119）、官方 Electron 桌面应用（apps/desktop 30 个功能域，与 Swarm Studio 定位重叠度最高的同族参照）、ui-tui（React+Ink 46 组件）、tui_gateway 127 个 RPC 方法（暗能力 UI 化的现成后端契约）、gateway 约 290 个 HTTP 端点。首轮"约 110 条 slash 命令"实为 75 条+别名（hermes_cli/commands.py:51-313，含 desktop 处置元数据与 desktop_surface_registry()，可直接当 studio 命令面板的可见性矩阵用）。
3. **推演台账证实：约三分之二痛点已被自有批次（P0-P12、x20、首轮 27 项）覆盖**，真正未覆盖、需要从 upstream 吸收的集中在六个方向：**消息/房间时间线治理**（系统事件折叠、permalink 直跳、房间列表卫生）、**web 端深链驱动**（房间深链选中、全路由可断言）、**IDE 空态与 Web 终端**、**看板计数口径单一源**、**治理工件编辑器+新鲜度徽标**、**模型通道可观测面板**（五起通道事故全部靠事后实证定位）。
4. 新增三个首轮未列的吸收方向：**会话家族树**（dsh-TUI SessionTree rewind/fork/adopt 三操作一屏，呼应 IMP-3 长房间回溯与 run6 会话谱系）、**跨线程待审批汇聚条**（codex pending_thread_approvals，多 agent 并行时审批统一收口，呼应 run5 审批全灭一夜）、**插件接缝枚举法**（deepseek-harness ctx 约 90 键全表 + dsh-TUI 四接缝，是 studio 未来插件化的定义起点）。
5. 一处理念对齐修正：multica 的 Squads（人+agent 混编、per-squad role 行内编辑、leader 只能设 agent）与 routa 的 specialist 契约库（约 30 个 yaml 逐个落实，含 workflows/kanban 九件套与 review 三层拆分）比首轮概括的更直接可用——**六闸每列一个命名守门员的 prompt 契约库已存在**，不需要重新设计。

红线不变：驾驶舱聚焦（V5 §13.1），所有吸收落点在 /app 树内既有功能区，不新增一级页面。

## 二、首轮纠偏与核实记录

穷尽盘点的副产品是修正首轮的量化偏差，如实记档：

| 首轮表述 | 穷尽核实结果 | 锚点 |
|---|---|---|
| hermes-agent slash 命令"约 110 条" | 实为 75 条+别名（Session 28/Configuration 20/Tools&Skills 20/Info 17/Exit 1 分组） | hermes-agent/hermes_cli/commands.py:51-313 |
| element-web 用户设置 12 tab | 实为 13 tab（含 SessionManager 与 Mjolnir） | element-web/apps/web/src/components/views/dialogs/UserTab.ts:10-22 |
| element-web 右侧面板 12 相位 | 实为 14 相位（漏 ThreePidMemberInfo 等） | element-web/apps/web/src/stores/RightPanelStorePhases.ts:14-31 |
| hermes-studio 即 Swarm Studio 上游 | 上游已更名 ekko-studio，包名与品牌均换 | hermes-studio/package.json:2-3 |
| element-web 斜杠命令"约 40 条" | 成立：35 Command+4 颜文字+6 特效 ≈ 45 | element-web/apps/web/src/slash-commands/SlashCommands.tsx:71-841 |

## 三、逐组件穷尽盘点（首轮未展开面全部展开）

首轮已覆盖的内容不重复罗列（见首轮 §3），本节只列**本轮新增量**。锚点均相对各仓库根。

### 3.1 hermes-agent（首轮只到模块级，本轮到页面/端点/数据模型级）

**A. 官方 web dashboard 逐页**（19 页+插件 tab，导航 web/src/App.tsx:141-223，鉴权 dashboard_auth/routes.py:176-496，WS 面 7 条）——首轮只有一句话，本轮逐页落实：ChatPage（内嵌 PTY，2133 行）、SessionsPage（列表/搜索/时间线/导入导出，2223 行，19 个 sessions 端点）、FilesPage（远程文件树）、AnalyticsPage（token 用量，受 dashboard.show_token_analytics 门控）、ModelsPage（主辅模型+MoA 编辑器，1368 行）、LogsPage（三文件×级别×组件过滤）、CronPage（ScheduleBuilder+蓝图实例化，1286 行）、SkillsPage（hub 搜索/安装/安全扫描，1665 行）、PluginsPage（dashboard+agent 双类插件+memory provider 向导，1418 行）、McpPage（CRUD+OAuth 轮询弹窗）、ChannelsPage（WhatsApp/Telegram onboarding 状态机，1460 行）、WebhooksPage、PairingPage（approve/revoke）、ProfilesPage（SOUL.md 编辑器+AutoDescribe，1426 行）、ProfileBuilderPage（多步向导）、ConfigPage（schema 表单+原始 YAML 双模）、EnvPage（掩码+reveal 一次）、SystemPage（凭证池/checkpoints/curator/multiplex 迁移，1649 行）、DocsPage（iframe）。
**插件 slot 机制**：30 个命名 slot（backdrop/header-*/sidebar/pre-main/每页 :top/:bottom），`web/src/plugins/slots.ts:61-96`，插件 manifest 可注入 tab 页面（plugins/kanban/dashboard/manifest.json）。

**B. ui-tui**（首轮空白）：React+Ink，46 组件（goalBar 常驻目标条/journey 学习时间线/agentsPanel 子代理面板/billingOverlay/pluginsHub/widgetGrid/queuedMessages/maskedPrompt 等），本地 slash 约 55 条八组（独有 /density /details /fortune /theme /replay /replay-diff /terminal-setup），键位含 Ctrl+C 三态、Ctrl+B VAD 一键通话、Ctrl+P 命令面板。

**C. gateway HTTP API 约 290 端点按域**（hermes_cli/web_routers/*）：status/system 18、learning graph 4（/api/learning/graph 节点 CRUD，studio 很可能未消费）、curator 3、analytics 4、audio/voice 8、chat 6、cron 13、dashboard 插件 17、files/media 16、**git 21（worktree/review/create-pr/file-diff，studio 很可能未消费）**、local-models 17、mcp 12、memory providers 3、messaging 11、models 7、ops 27（pairing/webhooks/凭证池/doctor/backup/checkpoints）、profiles 17、skills 5+hub、sessions 19（timeline/messages-around/latest-descendant/owner-backfill/prune）、tools 12、dashboard auth 11、api_server OpenAI 兼容（/v1/runs+/p/<profile>/ 多路复用）。

**D. cron 蓝图 16 模板**（cron/blueprint_catalog.py，BlueprintSlot 类型化表单槽 time/enum/weekdays/text）：Morning briefing/Important-mail monitor/Weekly review/Workday start reminder/Custom reminder/Evening wind-down/Topic news digest/Bills & renewals/Price watch/Competitor watch/Habit check-in/Hydration nudge/Weekly meal plan/Daily learning drip/Gratitude reflection/On-this-day。

**E. apps/desktop 官方 Electron**（首轮未提）：30 功能域（agents/artifacts/chat/command-center/command-palette/cron/hud/learning/messaging/pet-overlay/profiles/quick-entry/session/starmap/webhooks 等），backend 生命周期管理（discovery/claim/health/ownership）。**这是与 Swarm Studio 定位重叠度最高的同族参照，应列为对标基准**。

**F. tui_gateway 127 个 RPC 方法**：session.* 31、subagent.* 4、spawn_tree.* 3、vault.* 7、wake.* 6、voice.* 3、connectors.* 9、handoff.* 3、bot_relay.* 4、display.* 8、approval.* 3、billing.* 2、hosted_room 服务族（hosted_room_service.py/hosted_room_peer_http.py 跨机传输）。

**G. 数据模型供料**：Hosted Rooms SQLite 事件溯源六表（hosted_rooms/hosted_room_events 幂等 UNIQUE(room_id,event_id)/hosted_room_links/hosted_room_remote_runs/hosted_room_revoked_grants/hosted_room_peer_reservations TTL，gateway/hosted_rooms.py:88-200）；pairing 策略常量即文档（8 字符码/TTL 3600s/每平台 3 待批/5 次失败锁 1h）；delivery_ledger 投递义务表（gateway/delivery_ledger.py:190）；审批管线 9 文件（tools/approval*.py+approval_prompt.py 选择集 once/session/always/deny）。

**H. 生态面**：plugins/ 22 平台适配+38 model-providers+12 web 搜索+8 memory+8 image_gen；optional-mcps 66 个分 6 大类；skills 58 捆绑分 13 类；plugin-catalog 约 290 条 YAML。locales 17 语言+tests/agent/test_i18n.py 强制 parity（studio i18n 可复制的工程范式）。

### 3.2 zcode（首轮只有概括，本轮逐件落实）

**桌面端**：自定义窗口框+托盘（win）+未读徽标+3 秒去重通知；**资源管理器子窗口**（进程级 CPU/内存采样 10+ 文件）；界面双模式 coding/office；侧栏四分区（置顶/时间线/分组 dnd-kit 拖拽+组颜色+吸顶头/归档）+排序偏好持久化；会话内 turn 导航缩略轨（ConversationTurnNavigator 虚拟化 hover 跳转）、状态面板聚合九类（环境/变更/目标/todo/计划/后台任务/已结束工作流/已结束子代理/终端）、**队列面板拖拽排序+Send now**（ConversationQueuePanel.tsx:32）；输入区 2387 行（思考级别八档 select/cycle 双交互、Coding Plan 配额）；分享整套（选择模式+权限选择+只读时间线+Web 免登落地页）；分屏 CSS 变量驱动拖拽不重挂 pane（workbenchLayout.ts:10）。
**设置页 3 组 16 节**（settingsPageConfig.ts:49-154）+作用域双层（user/workspace）+统一搜索。**Automations 2040 行**（状态过滤/Run now/重启/暂停/双入口创建）+**Off-Peak 闲时任务**（排队位置徽章/保活横幅/桌面 cron 调度器）+保存的工作流双页签（启动对话框/实参表/运行历史）。记忆浏览（工作区树+文件树+搜索+相对时间分级）。**工作流泳道时间线"轨道-站点"模型**（timeline-model.ts:86,130 TimelineStation/band）+确认卡内嵌预览+amend 停前任+运行视图（取消/恢复门禁/提问行/产物区/溯源）。Git pane（变更卡/分支切换/提交图布局算法）。预览族 9 件（code/markdown/image/media/pdf/office/patch）。**db.sqlite 22 版迁移谱系**（session/message/part/todo/permission/workflow_*/dwf_* 四表/model_usage 三表）。
**TUI**：审批三档（allow_once/allow_project/deny）、侧栏五段可折叠、子代理 live transcript、思考档/模式/模型三建议面板、压缩时间线。
**权限四系统细节**：审批四档×scope 徽章（前缀/精确命令二级，最多 5 条）+deny 可附 freeText 反馈（PermissionDialog.tsx:119-156）；plan 模式特例（EnterPlanMode 免提示）；桌面通知按 requestId 去重。

### 3.3 element-web（首轮遗漏约 80 项，本轮全补）

**消息/时间线新增**：转发对话框（跨房间+搜索）、导出向导（时间线/附件/E2E 密钥 MegolmExportEncryption）、内容举报+房间举报、取消全部置顶确认、上传确认/失败对话框、**房间升级向导+警告条+前身 tile**、消息体工厂层 MBodyFactory、独立渲染层 renderer/（code-block/pill/spoiler/link-tooltip）、Spoiler、/plain /html 原样发送、LateEventGrouper 迟到聚合、代码块复制/展开/折行。
**房间/空间/成员新增**：**敲门管理条 RoomKnocksBar**（审批范式）、受限加入规则管理、空间层级浏览器（全树+批量加入）、空间子对象五件、拒绝并拉黑邀请、未知身份邀请警告、批量邀请进度对话框、空房间引导、邀请上下文详情（谁邀请+理由）、FacePile 头像堆叠、PresenceLabel、LiveContentSummary、位置信标 13 件、最近表情记忆。
**安全/E2EE 新增**：重置加密身份向导族、手动设备密钥验证、密钥存储删改面板、4S 密钥对话框族四件、**SecurityRecommendations 安全建议汇总卡**、KeyVerificationStateObserver、设备监听器五件、UIA 交互认证通用框架。
**设置新增**：通用控件族 8 件（SettingsFlag/Field/Dropdown/Fieldset/Section/Subsection/Banner/Indent）、字体缩放面板、主题选择+custom_themes、拼写语言管理、Seshat 索引管理、图片尺寸档位、布局切换器、**键盘快捷键重绑定 UI（可录制）**、3pid 增删、DiscoverySettings、**UIFeature 18+ 配置级 UI 裁剪门**（UIFeature.ts:11——studio 四档摘面的同构上游机制）。
**Stores 新增**：**EchoChamber 本地回显**（先发后验+失败重试）、MessagePreviewStore+逐事件预览生成器、**通知状态层级树**（房间→列表→空间聚合，SummarizedNotificationState）、**RoomSkipList 跳表**（8 过滤器×3 排序器增量更新）、双轨 Toast（ToastStore 阻塞+NonUrgentToastStore 非紧急）、OwnProfile/UserProfiles 缓存、ReleaseAnnouncementStore、RoomScrollStateStore、音频播放四件、Widget 六件套、TypingStore。
**通用元件新增**：PersistedElement（Widget 跨路由持久化）、画中画拖动容器、骨架屏、TabbedView、QRCode、Validation+PasswordScorer、就地编辑两件、TruncatedList、TagComposer、聊天特效 6 种、13 种 Toast 全列、服务器离线/存储驱逐/会话恢复失败对话框三件、BetaCard 反馈。
**无障碍/性能新增**：**LandmarkNavigation（F6 跨区跳转）**、Roving tabindex 全套（按钮/网格/工具栏）、KeyBindingsManager 约 50 动作、发送耗时埋点、Worker 化三件（blurhash/indexeddb/playback）、Rageshake 日志上报、**SessionLock 多标签页会话锁**、StorageManager 配额驱逐。
**桌面壳新增**：X.509/PKCS#11 硬件密钥 IPC、macOS 自绘标题栏、原生图片保存、getDisplayMedia 回调、语言随系统、CLI 参数解析。
**Labs 26 个全清单**（首轮未列全）：video_rooms/notification_settings2/msc3531 审核隐藏/latex/wysiwyg/mjolnir/exclude_insecure_devices/bridge_state/jump_to_date/sliding_sync/simplified_sliding_sync/element_call/disable_call_per_sender_encryption/location_share_live/dynamic_room_predecessors/reaction_images/new_timeline/pdf_viewer/login_with_qr/url_preview_bundle/hidebold/ask_to_join/notifications/msc4362/user_status/retention。
**架构模式 15 件**（§六吸收主力）：MVVM 基座（BaseViewModel+Snapshot+Disposables 自动 dispose）、ModalManager 三级栈（普通+priority+static 独立 React root）、设置三层（7 级 SettingLevel handler+20 SettingController 依赖互斥+watcher）、跳表过滤排序管线、43 个类型化 dispatcher payload、EchoChamber、VirtualizedList（Flat/Grouped+无障碍插件点）、可重绑定键盘、Roving、面板尺寸系统（react-resizable-panels+键盘可调）、运行时模块 API 22 面+Watchable、Widget 驱动模型、Worker 工厂、视觉回归（storybook-addon-vis）、通知聚合树。

### 3.4 hermes-studio 暴露面 diff（本轮独有视角，详见 §4）

（单独成节，此处不重复。）

### 3.5 编码四家+dsh 双件（本轮新增量）

**claude-code**（无引擎源码，CHANGELOG 2800+ 行+plugins/mods/examples）：**mods 机制**（座位化高优先级插件层：agents-md 四档加载策略/sec-default 防覆盖/telemetry 第一方埋点）；官方插件 12+（ralph-wiggum 自指循环/hookify markdown 定义 hook/feature-dev 7 阶段/frontend-design 反 AI 审美/plugin-dev 元开发/pr-review-toolkit 6 专项评审 agent/security-guidance 25+ 漏洞类）；后台会话 CLI 五件套（attach/logs/stop/respawn/rm）；**claude --desktop 移交桌面**、/teleport 跨机 worktree 抓取、/artifacts 云端工件、/ultrareview 云端评审、/autofix-pr、/schedule、/doctor prompt-audit、/mcp reconnect all、send-now 打断立即发、workflow 脚本运行时（agent()/parallel()/pipeline()）、模型治理三键（allowedProviders/availableModelsMatch/deniedModels）、企业面（examples/mdm 移动管控模板、settings 三档起点）。
**codex**（新增量最大）：斜杠命令补 30+（/pets 环境宠物、/voice WebRTC、/goal 长任务、/daemon、/ps /stop 后台终端、/theme 实时预览、/keymap chord、/apps connectors、/archive /export /raw、/warnings、/cd /pwd、/debug-config 配置分层来源、/title、/hooks 浏览、/multi-agents 切换器、/auto-review 重试、/elevate-sandbox）；TUI 面板新增（**MCP elicitation 结构化提问弹窗**、**pending_thread_approvals 跨线程待审批汇聚条**、async_questions 异步提问、effort_ignition、paste_burst 检测、终端通知 BEL/OSC9 双后端、线程身份色稳定取色、Blossom 欢迎动画、branch_summary 状态项、workspace_messages 头条、inline_visualization 内联可视化指令、mermaid 终端渲染 crate 16KB 上限）；config 键全清单（Tui/Memories/Apps/OTel/ToolSuggest 分块）；exec 非交互（--json/--output-schema/review --uncommitted）；**协作底座**（agent-message-board-client 频道协议、agent-roles、collaboration-mode-templates、guardian-context 审批上下文、user-verification 平台原生核验、multi-agent 历史行）；exec-server 远程执行（Noise 加密信道）、code-mode gRPC 单元执行、cloud-tasks。
**kimi-code**：斜杠命令补 40+（/yolo /auto /secondary-model /provider /add-dir /reload 双热载、goal 七子命令 status/pause/resume/cancel/replace/next/manage、/web 起服务浏览器开会话、/desktop、/remote-control）；packages 职责（kaos 执行抽象含 SSH、transcript 四层同构渲染数据层、pi-tui 差分渲染、tree-sitter-bash 权限分析、minidb）；Web UI 独占（全局搜索/移动端布局/Lab 三 tab）；**kimi-inspect 调试检查器**（会话活动徽章/DI 注册表/跨会话全文搜索 live/index 徽标）；对话框族 20+（cache-hint 缓存过期四选一/四类启动前确认/agent-activity-viewer 后台 agent 全屏 tail-follow）。
**minimax-code**：斜杠命令补 25+（/review 审 staged+unstaged+untracked、/parent 子代理返回父级、/steer、/decision 重开待决、/transcript、/allow /always /deny 命令化审批、/checkin 签到）；TUI 屏（agent-team/panel、background-work、inspection 产品自检报告、transcript 容量表）；主题四内置+custom+ansi16 回退；**Esc 级联取消边界语义**（同会话后台 Bash+子代理一并取消，跨进程任务不动）；诊断上传最小化（allowlist+文件名不透明化）。
**dsh-TUI**：**SessionTree 会话家族树屏（rewind/fork/adopt 三操作）**、Settings 屏（插件可注册 section+快捷键重映射）、StatusLine 逐字段悬停详情；键位全表 40+（Enter 工作中=steer 到回合边界/Tab=排 follow-up/Ctrl+Enter=打断立即发/Esc 九级层级/Ctrl+C/D 阶梯）；**插件四接缝**（tuiShortcuts 注册组合键/托管对话框独占键盘/tuiStatus.registerView 富状态视图/scene 注册表）；命令补 20+（/tree /bg /star /color /lang 即时本地化 /activity /preset 两审模式 /connect 远程机 /home /restart）；会话置顶持久化、herdr 对外状态上报、九个偏好域。
**deepseek-harness**：**ctx 接缝全表约 90 键**（capability-seams.md——插件可注册面枚举：commands/tools/skills/hooks/agents/approval/planMode/goals/jobs/workflowEngine/terminals/mcp/llm/fs/sessionQuery/settings/credentials/tokenMeter/spillStore/compaction/web/telemetry 等）；**插件管理器工程化**（install 前 inspect 预检/多 registry 回退/requestId 安装流/断线恢复/pendingBuilds 构建脚本审批/HMR）；packages 分组图（core 组/能力族/数据面/接入面）；experimental agent-team 四件套；apps/desktop 新面（mandatory-update 强制更新遮罩/crash-report/fatal-recovery/browser-guests 内嵌访客浏览器/十个 preload）；client UI 分包 50+（聊天域/代理域/侧栏系六件含 ui-sidebar-terminal/ui-sidebar-browser）。

### 3.6 multica + routa（本轮新增量）

**multica**：页面补 12（my-issues 个人视角/projects+项目详情含本地目录模式/members 详情/billing/agents/new 三分支 manual/ai/ai-session/runtimes 下钻单机/attachments 预览/onboarding 五步流/invitations 三件/landing 组/渠道绑定×5）；**设置 URL 契约**（?tab=&section=&integration= 兼容旧链重定向，settings-navigation.ts:34-97）+设置 17 tab 全列（含 tokens PAT/wakeups 工作区定时唤醒/issue_statuses 自定义状态流/properties 自定义属性/quick_actions）；Go 后端路由域全清单（daemon RPC 域含 GC-check 族+orphan 恢复、search-index 三件套 manifest/snapshot/changes、issues 域 wakeups 全 CRUD+trigger/checkin/runs、autopilots deliveries+replay+webhook-token 轮换、agents 批量取消/env、mika 特建）；**Squads 细节**（per-squad role 行内编辑+leader 只能设 agent+dirty-guard+squad briefing+leader 评估回写）；**Autopilots 三触发器**（schedule cron 双向映射可视化/webhook 签名密钥+事件过滤+payload 预览+deliveries replay/api）；Runtimes 按机器分组+远程推送更新+删除双路径（unbind-agents/archive-agents）；Skills 三源 URL 识别（clawhub/skills.sh/github）+runtime 本地导入+zip 归档；Electron 壳补（独立 issue 窗口/窗口覆盖层/导航手势/**freeze-breadcrumb 冻结崩溃诊断**/daemon 管理 IPC 全套 12 个/auth-session-coordinator）。
**routa**：Web 页面穷举（/messages 跨 workspace 消息审阅中心、/a2a 协议调试、/ag-ui 事件检查器、/mcp-tools 浏览器、/traces trace 回放多视图、/canvas/[id]、team run 回放、reposlide 代码库导览幻灯、settings 十一页含 fluency 仓库流畅度诊断）；**harness 面板族 20+**（governance-loop-graph/module-graph-view/health-score-cards/execution-plan-flow/lifecycle-view/repo-signals/design-decision 等——驾驶舱治理可视化的图形语言库）；看板 git 内嵌（stage/unstage/discard/commit 直接在看板内）；**specialist 契约约 30 个逐个落实**（core 4+harness 1+issue 2+release 1+review 8 含 security 四专项+team 9+tools 12+workflows/kanban 9 件套）；Axum API 域 40+（含 fitness 六端点/canvas specialist 生成/schedules tick/sandboxes/worktrees）；Tauri 壳（托盘 workspace-first 快捷跳转+GitHub PR/Issues 子菜单动态更新/macOS 菜单栏模式/双 origin 导航注入）。

## 四、hermes-studio 上游暴露面 diff（本轮核心新视角）

来源：暴露面 diff 路全量对账（注入态工作树+git HEAD v0.7.26 双锚点）。上游已更名 **ekko-studio**（五包：client/server/desktop/**ekko-agent 新运行时**/esp32-c3 硬件固件/skills）。

### 4.1 暴露状态总账

上游约 24 条路由+50 个 server 域+8 条 WS 通道+42 个 IPC，经 overlay ANNEXED_LEGACY 机制（ia2/routes.ts:84-120，27 条收编）后状态分布：收编+增强（ChatView 六路由/群聊/看板/工作流）、收编（Jobs/技能/插件/MCP/记忆/渠道/设置/Profiles/日志/用量/性能/Journey/主题等 15 项）、未启用 flag 关（ekko 四页/外链三页/语音全家/宠物三件/社媒+ESP32/图像辅助面板）、退役摘除（SocialMessages/Devices/GlobalAgent 成死文件）、替换（导航三件套被 ia2 壳+072 重写）、暴露（desktop 壳全部功能零摘除+server 全域在线）。

### 4.2 "有而没用起来"清单（按吸收价值排序，全部零或近零成本）

1. **Web 终端 TerminalView**——terminal+mobile-terminal 两条 WS 在线，路由活着且 superadmin 门控现成，只差 IaSettingsSidebar 加一条目。运维价值最高、成本最低。注：同时回应推演 IMP-38（IDE 浏览器模式终端卡"连接中"）。
2. **SessionSearchModal 全局会话搜索**——组件已全局挂载（App.vue:400），overlay 侧零调用方；驾驶舱 IaGlobalTop 加一个按钮调 openSessionSearch() 即可。
3. **changelog 更新弹窗**——上游每版本维护 11 语言 changelog（data/changelog.ts），072 重写 AppSidebar 时丢弃；挂进账户区解决"用户不知道基线升到哪"。
4. **ekko 四页+JEV 评估体系**——JEV 是上游近两版主投入（#3159-3211），server ekko 四域路由在线，纯 flag 关；hermes 侧 JevSettingsPanel 已随 ModelsView 暴露。
5. **语音全家**（RealtimeVoiceStage+stt/tts+设置语音区）——server 路由/WS/组件全保留，纯 flag 关；studio 无等效物。
6. **session-shares 外链族**——server 在线，0.7.24 加强了分享权限模型（#3121/3128/3129）；有对外分享场景可开。
7. 桌面浏览器自动化 UI 面（25+ IPC 在线，0.7.25 加了顺序批次 12 tab）——独立页与标注 UI 可达性待装机走查核实。

### 4.3 门控不一致（需裁决的小修复）

- Petdex 侧栏条目未随 features.pet 门控（IaSettingsSidebar.vue:72 vs features.ts）——要么补门控要么全开。
- features.agentManager 定义了但无运行时消费方（仅测试断言），flag 与实际行为不符。
- 0.7.26 #3232 统一导航（StudioNavigationRail）被 072 遮蔽属有意替换，但每次上游 bump 需重对 072，是迁移成本大头。

## 五、推演改进点×吸收源交叉对照

完整 69 条 IMP 台账在调研记录，本节给结论性交叉（台账每条均带出处锚点与覆盖状态判定）。

### 5.1 覆盖状态分布

69 条中：已覆盖（自有批次 P0-P12/x20/首轮 27 项）约 45 条；部分覆盖约 15 条；未覆盖约 9 条。**未覆盖与部分覆盖的残留才是真正的吸收需求**。

### 5.2 未覆盖残留×upstream 吸收源映射（需求侧前 6 方向）

| 方向 | 推演证据 | 吸收源（本轮锚点） |
|---|---|---|
| 消息/房间时间线治理 | IMP-1/3/4：系统消息英文裸奔、3000+ 条长房无法回溯、tab 截断同名（跨 4 份报告） | element-web 系统事件折叠聚合可配置显隐+LateEventGrouper、permalink 跳指定事件、房间升级前身 tile；dsh-TUI SessionTree 家族树 |
| 房间列表卫生 | IMP-2：同名房 ×10+ 堆积（5 处出处） | element-web RoomSkipList（8 过滤器×3 排序器：活跃度/未读/字母）+自定义分区 |
| web 端深链驱动 | IMP-7：房间深链不驱动选中（两轮空拍根因） | element-web room URL 定位范式+首轮已落的桌面壳深链延伸到 web 路由 |
| 看板计数口径单一源 | IMP-10/11/13：43 vs 46 口径矛盾、默认打开空板、30 板 chip 挤 3 行 | 服务端聚合口径统一（自有修复）+multica issues 域 facets/groups 端点设计（router.go:2004-2006）+?board= 直链 |
| 治理工件编辑器+新鲜度 | IMP-45/46：工件只读无编辑→commit 链、旧轮工件顶包无徽标 | 自有编辑链延伸（P7/P8 先例）+新鲜度徽标（本轮无现成 upstream 件，element-web 编辑历史 diff 对话框可参考交互） |
| 模型通道可观测面板 | IMP-53/54/55：五起通道事故全靠事后定位（run4 中止/run5 停摆 6h） | hermes-agent SystemPage 凭证池面（web_routers/ops.py:334-421）+AnalyticsPage 按模型统计+真实载荷探针（自有）+codex /debug-config 分层来源视图范式 |

### 5.3 跨 run 系统性模式（8 类，吸收判断的权重依据）

消息洪流与房间卫生失控（最高频）、通道与容量不可观测（5 起独立事故）、判词/状态真值偏差（贯穿六轮，双凭证纪律的根因）、空态/零值冒充终态（truth-audit 5 张失实全属此类）、审批链路多点断裂、计数口径不一致、证据锚点断裂、双树双线漂移。前三类直接决定 §六分期排序。

### 5.4 报告链 R1-R16 执行落差要点

三次被打回（09-28 上午 10 处内容错配/14:00 31 图 13 张不符/truth-audit 再锤 5 张）的共同根因是"目标视图加载失败页配臆造描述"——**处置转向补全功能而非改描述**，这是"报告即产品面"（B6）的实证：报告的每一个缺陷最终都追溯到产品面的真实缺口。run5 终版四查全过=报告链收敛终点。对吸收的启示：优先补"会让演示出丑的面"（空态、计数、深链、通道状态），而非锦上添花的新功能。

## 六、吸收建议清单（第二轮·分期）

原则：首轮 27 项已收口，本清单全部是**首轮之后仍成立的缝隙**；每项带来源锚点+studio 落点+推演 IMP 关联；落点全部 /app 树内（B3）。验证一律三层验法+守门测试，走查脚本入 overlay/scripts/ 既有模式。

### 近期（零/低成本，直接服务演示与日常）

1. **上游自用四件**（§4.2）：Web 终端收编进 IaSettingsSidebar（+回应 IMP-38）；SessionSearchModal 挂驾驶舱页头（与首轮 Spotlight 并存分工：Spotlight 混合对象、SessionSearchModal 专搜会话）；changelog 弹窗挂账户区；Petdex/agentManager 门控不一致修复。验证：四处入口可走查点击。
2. **消息时间线治理三件**（IMP-1/2/3，最高频痛点）：系统事件折叠聚合（element-web 事件聚合折叠可配置显隐范式）进中栏画布；长房间 permalink 直跳（消息操作栏加"复制链接/跳转到此"）；会话 tab 溢出治理（宽度自适应+tooltip+序号）。验证：run6 房间实录可折叠、可直跳、tab 可辨。
3. **房间列表卫生**（IMP-2）：左栏列表排序器（活跃度/未读/字母）+同名房从属徽标（轮次/时间语义），参照 RoomSkipList 的过滤器×排序器管线思想。验证：30 房列表可操作。
4. **跨线程待审批汇聚条**（IMP-18/24 延伸，run5 审批全灭一夜）：codex pending_thread_approvals 范式——驾驶舱注意力条聚合所有 profile/看板/群的待审批，点击直达。验证：三源各造一条待审批，汇聚条可见可跳。
5. **web 端深链驱动**（IMP-7）：房间路由深链驱动左栏选中+全路由可断言（expectRoute 守门）。验证：深链直达指定房间且列表选中态正确。
6. **通道状态卡最小版**（IMP-53/54/55，五起事故）：驾驶舱运行态分区加通道健康卡（四池状态/429 计数/fallback 链位置），数据源用既有 modelroute+日志聚合，不必等凭证池 runtime。验证：人为限流一池，卡片可见变化。

### 中期（下一个迭代周期）

7. **会话家族树视图**（dsh-TUI SessionTree rewind/fork/adopt）：IDE 会话列+运行详情加谱系视图，呼应 IMP-3 与 run6 会话谱系取证需求。
8. **看板计数单一聚合源+板定位**（IMP-10/11/13）：服务端聚合口径统一+?board= 直链+板列表分组/搜索（multica facets/groups 端点设计参照）。
9. **治理工件编辑器+新鲜度徽标**（IMP-45/46）：通用工件"编辑→保存即提交 git"链（P7/P8 先例延伸）+工件卡"本轮/旧轮"时间窗徽标。
10. **暗能力 UI 化第二批**：tui_gateway 127 RPC 中 studio 未消费族——subagent.*/spawn_tree.*（agent 编队视图数据源）、learning graph（/api/learning/graph 节点 CRUD→"agent 成长"面）、git 21 端点（内嵌代码评审面板后端）。
11. **Automations 升级**：zcode 范式（双入口创建/状态过滤/运行历史/保存的工作流双页签）+hermes cron 蓝图 16 模板实例化 UI（BlueprintSlot 类型化表单槽已就绪，首轮记档待环境项条件已部分成熟）。
12. **ekko/JEV 评估体系开 flag 试用**：server 路由在线，hermes 侧 JevSettingsPanel 已暴露；评估体系直接服务 B2 判词真值化与"逃逸缺陷率"长线记档（IMP-66）。
13. **设置架构升级**：element-web 三层（SettingLevel handler+SettingController 依赖互斥+watcher）或 zcode 16 节双作用域范式，治理 studio 设置面（当前分散在收编页+本地字典）。
14. **Squads 混编面**：multica per-squad role 行内编辑+agent-only leader+squad briefing——映射 RACI 责任分配面（当前 /app/accounts 组织编辑器的下一步）。
15. **插件接缝定义**（不急但先定义）：参照 deepseek-harness ctx 90 键全表+dsh-TUI 四接缝+element-web module-api 22 面，定义 studio 插件 API 面枚举文档（纯文档先行，不实施）。

### 远期（记档，按需启动）

16. hermes-agent apps/desktop 对标审计（30 功能域逐一对照 studio 桌面壳，出差距清单）。
17. 插件管理器工程化（inspect 预检/registry 回退/pendingBuilds 审批/HMR，deepseek-harness plugin-manager 全套）。
18. multica daemon GC-check+orphan 恢复协议（多 agent 悬挂任务单向确认）。
19. routa specialist 契约库移植评估（workflows/kanban 九件套+review 三层对六闸列自动化的升级，与首轮 #16 列证据契约汇合）。
20. 语音全家开 flag（C-5，需产品裁决是否与 S3 精简方向冲突）。
21. session-shares 外链族开 flag（对外分享场景出现时）。
22. 企业面（claude-code examples/mdm 管控模板+模型治理三键，企业部署需求出现时）。

### Non-goals（首轮已列，本轮追加确认）

首轮 Non-goals 全部维持。追加：claude-code mods 机制（座位化插件层，studio 无对应插件体系前不引入）；codex /pets 与 dsh-TUI 像素鲸鱼（宠物方向 S3 已摘）；kimi tower（与 worktree 体系重叠，首轮已判）；esp32-c3 硬件固件（ekko 上游新面，超范围）。

## 七、与既有 backlog 的衔接

- 首轮 27 项对账表中的"记档待环境"三项（凭证池/蓝图画廊/Hosted Rooms）：本轮 §六-6 通道状态卡给出凭证池的最小不等环境替代；§六-11 蓝图条件部分成熟；Hosted Rooms 维持远期。
- P12 治理中心页签化在途：§六-9 工件编辑器落点等 P12 合入后开工（沿用首轮纪律）。
- P11 Phase 2 第三件（workflow run 复用 RunDetailView 骨架）：维持单独立项记档。
- IMP-38 的根治（IDE 终端）：§六-1 Web 终端收编是浏览器态缓解，桌面态 Electron 跑路演是另一条线，二者不互斥。

## 八、限制声明

- 本文档为只读调研，未改动任何代码；锚点全部来自 upstream 源码、overlay 源码与推演语料。
- 七路深挖为"目录穷举+关键文件精读"，单文件行数级细节（如 ChatPage 2133 行的逐行行为）未逐行核实；交互细节以源码存在性为准，未逐特性实机验证。
- hermes-studio 暴露面 diff 的"注入态"锚点基于当前工作树（patch 注入态），纯净上游锚点以 git HEAD v0.7.26 为准；桌面浏览器标注 UI 可达性等 4 项标注"待核实"（需装机走查）。
- claude-code 无 CLI 引擎源码，功能面来自 CHANGELOG+plugins/mods（文档级一手材料）。
- 69 条 IMP 台账的覆盖状态判定基于语料内锚点+首轮对账表，个别"部分覆盖"的边界判定存在解释空间，实施前建议复核对应 IMP 的出处原文。
- 元素级 UI 还原（像素/动效）不在范围内，吸收指交互范式与信息设计。
