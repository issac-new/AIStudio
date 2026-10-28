# SwarmStudio 产品 backlog 排期（差异审计五件 + 两项追加）

> 2026-10-06 · 起因：差异审计挂出产品 backlog 五件。**终态（2026-10-07 核实）：五件全部已修复+已测试+已在 main**，全量 3904/3904 零失败。§六执行状态表=销账总账。
>
> **主旨三句话**：本文给五件 backlog 定改动面、定批次、定验收判据，不重新论证问题存在性（那在审计文档）。结论一句话：⑤已关闭，④纠正前提后可立刻做（批次 1），①②同族放批次 2，③涉及审批协议放批次 3。读完促成：按批次开工，每件的验收判据可直接抄进任务卡。

## 一、总览与批次

| 件 | 问题 | 根因一句话 | 工作量 | 批次 |
|---|---|---|---|---|
| ⑤ 治理域路由归宿 | /app/gov 死链疑虑 | 已查明：重定向保留，归宿=/app/board 五治理页签 | — | **已关闭**（2026-10-06 落版，正本 §2.5 勘误注） |
| ④ 看板测试钩子 | 自动化点不动看板 | **前提纠偏：看板是 DOM 不是 canvas**；真缺口=testid 覆盖不全 | 小（2-3 文件属性加注） | 1 |
| R29 身份缝 | 面板在真实登录形态下不可见 | harness 事件用人类身份、产品免密登录用 bot 身份，案例房不邀 bot | 小（harness 侧邀 bot+双写 index） | 1 |
| ① 房间列表同步 | 驱动直建房间不进产品房间列表 | 登录账号不在 RACI 邀请名单=房间不进其 /sync 流 | 中（2-3 server 文件） | 2 |
| ② runs 注册表接入 | 推演 run 不进运行中心 | 注册表=事件日志派生；run-progress 横幅走独立文件通道，两通道不相交 | 中（桥接 2-3 server 文件） | 2 |
| ③ 审批面统一 | 群内 !approve 与收件箱两张皮 | 收件箱 pending 三源聚合无 Matrix/推演源，harness 审批不触 /api/approvals | 中-大（协议面） | 3 |
| P13 承诺步通道 | 方案"界面完成"承诺被脚本绕开 | 复核反转：通道在位，harness 已切产品端点；残余=向导停用步静默缺陷 | 小（单步提交链） | 3 |

## 二、批次 1（先行：小改动、解锁采集与 R29 闭环）

### ④ 看板测试钩子补全（前提已纠偏）

代码面实测：工作项看板是纯 DOM Vue 渲染（SwarmKanbanView.vue:14-19 组装 KanbanBoard/KanbanTaskCard），卡根是普通 div（role="button"+aria-label+原生 click，KanbanTaskCard.vue:160-172）；TasksView 页签已带 data-testid 且支持 ?tab=/?task= 深链（TasksView.vue:149-157、9-11）。全客户端唯一真 canvas 是 IDE 画板（IdeWhiteboardPane.vue:14-47）。方案附录 F-2②"看板为 canvas 渲染"系误记，已随本批勘误。

- 改动点：KanbanTaskCard.vue:161-168（卡根补 `:data-testid="'kanban-card-'+task.id"`）；KanbanColumn.vue（列根/列头补 testid）；KanbanTaskDrawer.vue:765（抽屉根补 testid）。采集侧（simharness r18-frames/capture-ui）同步改"深链+testid 选择器"口径，停用 DOM 文本选择器点击。
- 验收判据：playwright 用 testid 能打开任意卡详情抽屉；采集脚本对步 10/12 看板操作出前后三帧无人工干预。

### R29 身份缝（delivery 面板真实形态可见）

2026-10-06 实跑验证链：delivery.* 事件落房读回 ✓（simharness bab1cda 修复读回字面量 bug 后转绿）；面板在人类矩阵身份下正确渲染案例卡+G1 绿灯（实拍 archive/r29-delivery-cases-panel.png）；无矩阵凭据或 bot 身份下面板空态。产品步 3 免密登录凭 gateway Orchestrator channel=bot 账号（@fanfan-agent），而 harness 侧 dlv_scenario_open 只邀人类账号、dlv_index_update 只写人类 account-data（mx-delivery-lib.sh:86-103、161-169，"agent bot 入房留 M4"）。

- 改动点（harness 侧，不动产品）：mx-delivery-lib.sh 的 dlv_scenario_open 邀请名单补各用户 agentMxid（fleet-manifest 已有该字段）；dlv_index_update 对人类+agent 双写。产品侧备选（长线）：步 3 免密登录改人类身份。
- 验收判据：bot 身份（免密真实形态）打开 #/app/cases 可见案例卡且 G1 灯渲染；R29 冒烟脚本（/tmp 一次性脚本固化进 mx-delivery-lib 或 r18-collect deliver）在 run10 起跑 smoke 段全绿。

## 三、批次 2（产品呈现层对推演可见：①②同族）

### ① 房间列表同步

产品房间列表唯一数据源=matrix-js-sdk /sync 房间集（matrix-room.ts:317-324），只显示本人 Join 的房间（matrix-room.ts:281-293）；收邀自动 join（matrix-client.ts:144-149）。驱动建房由网关 bot 身份走 REST createRoom，邀请名单=RACI 四元组（server/matrix/raci-matrix.ts:48-72；raci-dispatch.ts:155-158）——导演/观察者账号不在名单即不可见。

- 改动点：raci-dispatch.ts:155（invitees 归集补导演/观察者配置位）；raci-matrix.ts:49-72（建房 invite 载荷加"固定观察员"）；gateway-env.ts:159 附近（观察员名单配置读入）。
- 验收判据：导演账号登录产品，沟通区房间列表可见驱动所建群聊房间并可只读回看；隐私面评审（全员可见的房间分级）一句话结论入单。

### ② runs 注册表接入

运行中心列表=事件日志派生（graph-rest.ts:149-161 listRuns → event-log-store.ts:142-148 扫事件流取 distinct runId）；mux 的 run-progress 横幅走独立文件通道（server/controllers/sim/run-progress.ts:32-47 只读 $HERMES_HOME/run-progress.json），两通道不相交。

- 改动点：run-progress.ts:36-48 旁挂 ingest 适配（快照翻成 run.started/进度事件写 EventLogStore，event-log-store.ts:78-94 append 接口）；runId 加 `sim-` 前缀隔离命名空间。前端 runs.ts:163-190 已支持外部源投影，零大改。
- 验收判据：run10 起跑后运行中心列表出现 sim-* 条目，详情页可打开（事件骨架可渲染，不许"只进列表详情 404"半截态）。

## 四、批次 3（审批协议面）

### ③ 审批面统一

收件箱 pending=三源聚合（文件队列/fleet 命令/评审域未裁决卡，pending-controller.ts:177-224），无 Matrix/推演源；harness 审批走 mx-scenario-lib.sh:318-383（群内 !approve+m.reaction+approved.events 台账），不触 /api/approvals。

- 改动点：pending-controller.ts:177-224 加第四源（Matrix 审批事件/approved.events 翻成 PendingItem，eid 幂等键防双通道重批）；:271 decide 路由按 id 前缀分发；harness 侧（mx-scenario-lib.sh:318-383）改双写或轮询产品裁决结果（此项若做则工作量升大，涉及超时语义）。
- 验收判据：推演中一笔审批请求同时出现在群内与收件箱；任一处裁决后另一处幂等收敛；approved.events 台账与收件箱 history 可对账。

### P13 承诺步通道（2026-10-06 复核反转：通道实测在位）

初判"产品界面通道未建全"被复核反转：三步产品通道全部在位（#/app/accounts 建号即 roster 提交；gov-registry 应用资产七列表单保存即 git；gov-org 三步向导），harness 已切产品同源端点（simharness 71f7ca5 后续、overlay 101bc93 注记，mx-setup 批量预置=R31 已落地）。残余一件产品缺陷：**三步向导停用步（deactivated）两次返回空数组，静默不生效**，记档待修——改动点：gov-org OrgEditor 停用步提交链（探针 c2be916/b390258 复现）。
- 验收判据：向导停用步对测试账号执行后返回含该账号的非空结果，roster/org 状态同步。

## 五、依赖与风险

1. 批次 1 无外部依赖，立即可做；批次 2 依赖批次 1 的采集口径（帧断言要照得到①②的面）；批次 3 依赖批次 2 的①（审批事件要先在可见房间里）。
2. ②的桥接若只进列表不喂详情骨架会制造新的半截态，验收判据已堵；③双通道并存期重批风险用 eid 幂等键堵（approved.events 已有 eid 锚约定）。
3. 每件完成以"验收判据抄进任务卡+过守门"为关闭标准；关闭后在差异审计文档 §三总表销账。

## 六、执行状态（2026-10-06 21:3x 收口记账，用户指令「排期完成」执行轮）

| 件 | 状态 | 锚 |
|---|---|---|
| ⑤ 治理域路由归宿 | 已关闭 | 正本 §2.5 勘误注（overlay 53162fc9） |
| ④ 看板 testid | **已落+测试过** | overlay b27820b8：卡根 `kanban-card-<taskId>`+`data-task-id`、列根 `kanban-column-<status>`、抽屉 `kanban-task-drawer`；「testid 取帧无人工干预」属 run10 采集验收 |
| R29 身份缝 | **已落** | simharness mx-delivery-lib：dlv_scenario_open 邀 agentMxid+join、dlv_index_update_acct 人/bot 双写面；R29 冒烟 bab1cda 转绿 |
| ② runs 注册表接入 | **已落+测试过** | overlay eeb8936c：run-ingest 快照摄取（run.started/progress/completed、sim- 前缀、幂等以事件日志为真值）+event-log-registry 共用实例+详情骨架免 404；顺带根治一处边界：终态后 sset 仍刷 updated_ts 会致状态回摆（摄取侧停追进度+推导终态粘滞）。回归 400/400、全量 3816/3816 零失败 |
| ① 房间列表同步 | **已落（产品+harness 双侧）+测试过** | overlay a48675f7：resolveRoomObservers（env MATRIX_ROOM_OBSERVERS）+taskRoomInvitees 合并两路建房；simharness mx-lib mx_create_room 同名同义观察员位。隐私面一句话结论：观察员非 RACI 当事人、入房全读，默认空名单不外扩可见面，显式配置才启用。「导演可见驱动房间」实证随 run10 配 MATRIX_ROOM_OBSERVERS |
| P13 承诺步残余（停用步静默） | **已根治+测试过** | overlay d1ebc8c5+7959a291：getMatrixUserState 存在性探测（missing/deactivated 跳过、403 带状态炸出）+停用被拒响亮报错+server 名推导对齐 provision；守门③④新增 3 例，全量 3823/3823 零失败 |
| ③ 审批面统一 | **产品侧已落（读+裁决+三重幂等）；harness 入队/消费=③b 挂 run10 前置** | overlay 4c9af88a（merge 5ceac0f2）：第四源 mx-requests.jsonl 翻 PendingItem（eid 全局锚）+decide mx: 分支（四态校验/反应通道已批 409/本通道重批 409/响应文件原子写/历史落账）；三重幂等闸防双通道重批；守门 pending-controller 11/11。③b（harness 入队+轮询 mx-responses 消费）随 run10 hybrid 小样验证实施——与上行原建议同口径 |

**验证口径声明**：①②④ 服务端逻辑=新增/扩展单测 17 项+相邻回归（graph+sim 400/400、matrix+services 106/106、全量 3816/3816）+vite build 编译门；**浏览器实拍验收（testid 取帧/导演视角房间列表/运行中心 sim-* 条目）与 run10 起跑 smoke 未在本轮执行**——属排期验收判据的实证项，如实标注不冒充达成。

## 七、P9 治理边界两件评估（2026-10-06 用户指令「全做」执行轮）

差异审计 P9 的两处"机制靠闸后甄别非事前拦截"，评估与落位：

### P9a prework 门禁前置——**已落（569 gate-guard）**

- **评估**：run9 五 agent 上板即自启、越 G2 序位抢推 8 分支（G2/G3 闸后甄别兜住未污染主线），根因=认领即 spawn 无闸门序位概念。两候选机制：①看板卡 ready 在 G2 落键前不派 spawn 信号；②dispatcher 增 gate-guard。采②——`kanban_watchers_common._kanban_dispatch_allowed` 是每 tick spawn 前唯一检查点，语义集中且无需看板侧改动。
- **落位**：overlay 4c9af88a（merge 5ceac0f2）——`KANBAN_GATE_GUARD_FILE`（state.env 式文件）+`KANBAN_GATE_GUARD_KEYS`（逗号必填键）声明时键未齐 spawn 暂停；未配=惰性，生产零行为变化（保真形态不污染）。补丁 569+runtime manifest 收编+守门⑬同步断言；git apply 干净；功能五例全过。
- **run10 接线（前置）**：mx-up 给 gateway .env 写 `KANBAN_GATE_GUARD_FILE=$SIM_ROOT/runs/<RUN>/state.env`、`KANBAN_GATE_GUARD_KEYS=g2_arch_pass`（harness 仓落）；复验判据=G2 落键前零 agent spawn 抢跑（对照 run9 的 8 分支先例）。

### P9b RACI 双@同源——run10 复验口径（评估结论，机制不另改）

- **评估**：run9 四条 RACI 双@（责任人+团队负责人）走回灌通道非同源（raci-dispatch-missing×4，DISP 延后复验）。根因两候选：a) 指令遵循缺口——fanfan-agent 的 Orchestrator 未按派发词执行双@输出；b) 投递可见性缺口——房间消息对部分账号不可见。564 投递兜底已在位，b 类若再犯以**房间 event 视角为真值**（拉房间消息验证，不取账号收件视角），避免把"收件不可见"误判为"未派发"。
- **run10 复验口径**：①系分拆步后在分析房间按任务逐条拉取验证双@文本在房（event_id 可反查），缺则当场记单（不等收官回灌）；②四条全部房间可见、零回灌补发为达标；③若复发 a 类，派发词模板把双@从"要求"改为"逐条输出格式"（结构化字段先行）；复发 b 类按投递层缺口记单升格。

**2026-10-06 用户裁决（③ 终态）**：审批面统一**不做，关闭**。裁决理由=群内审批与收件箱审批两处并存是**有意的互为兜底设计**——任一处漏看还有另一处，避免审批人员遗忘；强行合并成单点反而丢掉冗余保护。③ 的「两张皮」重新定性为设计特性而非缺陷，批次 3 取消，本排期五件全部终态关闭。

## 八、run16 复盘追加件（2026-10-13，fix/run16-report-truth 轮立案）

### P-Board401Logout 看板数据面 401 → 全局清会话跳登录（批次 1 候选，小-中）

- **现象（按路由完美二分）**：run16 全程 /app/board 系拍摄位（board 主页与全部 ?tab= 治理页签、arch/chen 他账号板）**26 帧全部落登录页**（22 帧同像素+4 帧近似组，md5 分组实测）；同期非 board 拍摄位（/app 工作台、/app/accounts、/app/s/chat、/app/cases、/app/runs、/app/ide）**全部正常渲染**。帧清单=runs/20261012-v8-run16/frames-degraded/（隔离在案）。
- **客户端机制锚**：本地 BFF 端点 401 → `triggerAuthRecheck()`（`clearAuthSessionState`+`router.replace({name:'login'})`）——upstream hermes-studio `packages/client/src/api/client.ts:283→172`（overlay 仓上游树同源）。看板页数据面（kanban REST+WS，WS onclose 1006 后走 REST 探针）**任一 401 即清 token 整页弹登录**，无页面级错误态。
- **复现状态（诚实账）**：赛后两次现场实验均不复现——①单发采集同款登录开 /app/board 正常零 4xx；②同 deviceId（R18CAP）连发双登录（模拟采集风暴，Synapse 同设备重登作废旧 token 语义）后用旧会话开看板仍正常（studio JWT 自包含，看板代理不持活体 matrix token）。run16 采集时窗（10-12 16:38-41）的 gateway/studio 日志已轮转，服务端 401 源头端点不可回查——根因定位到「推演进行中的服务端状态令看板数据面 401」，最后一公里待 run17 现场取证（采集端已加 relaunchLogin 自愈+坏页 .bad.txt 侧车+审计 md5 结构性红线，复现即留痕）。
- **产品改善方向（立案理由）**：单端点 401 ≠ 用户会话失效。kanban 数据面 401 应在看板页内呈现错误态（重试/降级视图），仅主会话校验端点（如 /api/auth/me）401 才触发全局登出——现状把「代理瞬时 401」放大成「整页证据面丢失」（run16 步 5/6/7/10/11/13/14/15/16/17/19/20/21/22/24 共 15 步 UI 实拍全灭的根因）。改动面小（client.ts 401 分流：按端点族区分 logout vs 页面错误态）。
- **连带观察（不单独立案）**：登录壳页上可见 23/26 运行进度横幅——登录页渲染了需登录态的运行信息，语义混乱，随本件顺手核对。

### 采集面产品适配三小件（随 run17 验证，不占批次）

1. /app/ide?task= 深链在采集环境偶发回落默认视图（run16 devimpl 帧落 /app/runs 蓝图画廊=错页实锤；ide_done 帧正常——同 URL 两结果，疑似时序竞态）——run17 采集端 waitSpaReady 已有强断言，复现则记 product-surface-degraded 单。
2. /app/accounts 与工作台首屏偶发互换（run16 login_done 帧落工作台=错页）——hash 路由挂载时序疑点，同上观察。
3. 空态判定：testpass 帧侧栏在而主区空白（页面无错误无数据）——若为真实空态属合规画面，采集侧应标注空态语义而非判坏页（采集端 pageLooksBad 白名单待补该形态）。
