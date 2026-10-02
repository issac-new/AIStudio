# 吸收二期剩余项方案与评估（#13/#14/#16/#19）

日期：2026-10-01　　性质：方案与评估文档（不含实施代码）　　owner：本轮实施会话
来源：《2026-10-01-upstream-absorption-round2-exhaustive.md》§六中期/远期清单中"工程类剩余项"的实施方案与评估依据。四项均已过本环境实证勘察（非纸面推演）。

> 主旨三句话：本文唯一主旨是给二期清单剩余四个工程项定"怎么做、多大代价、何时启动"。受众是后续实施会话与裁决者。读完后建议动作：#13 裁决是否立项迁移；#14 裁决是否按最小件开工；#16/#19 作为对标资产留存备查。

## 一、#13 设置架构升级：三层范式迁移方案

**现状（实证）**：studio 设置面两处承载——①收编的上游 SettingsView（17 个设置组件，路径迁 /app/settings，IaLegacyShell 壳）；②IDE/驾驶舱本地偏好散在 localStorage（ide_status_slots/ia2.flow.sortMode 等十数键）与本地字典。无层级覆盖语义：同一名义设置（如"时间线布局"）无法在"全局默认→工作区→会话"间分层。

**目标范式（element-web 实证锚点）**：7 级 SettingLevel handler（config/default/account/room-account/room/device/platform）+ SettingController（依赖/互斥/服务器能力探测/变更重载声明式表达，`element-web/apps/web/src/settings/{handlers,controllers,watchers}/`）；zcode 设置页 16 节双作用域（user/workspace，SettingsScopeBadge，`zcode/packages/ui/src/settings/settingsPageConfig.ts:49-154`）是轻量参照。

**迁移三步**（每步独立可交付）：
1. **建层**（纯基建，零行为变化）✅ 已落地（2026-10-02，settings-layers/ 四层读写链+JSON 复合值+adoptLegacySetting 遗留收养，20 守门）。
2. **迁键**（按域分批）**进行中**：
   - 批一（已迁）：ia2.flow.sortMode（房间排序）、ide.slots（状态栏槽位）——29d6117。
   - 批二（已迁）：notify.prefs（通知分组降噪）、ide.websearchTier、ide.goalAutonomy——b899474。
   - 批三（候选，overlay 自有）：ncwk.cols（三栏宽度——自带双层旧键链+CustomEvent 广播，需保序细迁）、ide_keymap_overrides_v1（键位覆盖）、kanban_saved_views（保存视图）。
   - **上游自有键（须 patch 批次）**：hermes.kanban.selectedBoard（KanbanView/store）、hermes_ide_layout/sidePane.width（上游壳布局）——随漂移治理轮 patch 化同批。
   - **不迁（非偏好）**：hermes_api_key/server_url/locale（账号配置）、ide-permission-mode:<sid>（会话态）、runcenter:inbox:archived（UI 态）、hermes_ide_workspace（工作区选择=状态）。
3. **Controller 声明**（只对确有依赖/互斥关系的设置项，约 5 组：时间线布局×紧凑模式、通知分级×铃铛计数、主题×密度等）：声明式互斥+变更重载提示。

**代价估算**：步 1 约 1 个工作日（含守门）；步 2 每域 1-2 小时；步 3 半日。**启动条件**：无环境依赖，但建议与 #15 插件宿主同批（插件设置节直接长在新层上，避免二次迁移）。

## 二、#14 Squads 混编面：评估与最小落地方案

**现状（实证）**：混编数据模型已在——`custom/client/matrix-teams/stores/team-registry.ts`（accounts/leaders/duties/agentTeams；registry 走 matrix 房间事件，写路径 writeSelfAccount + leader 门控写）；账户管理页（/app/accounts）有团队展示。**缺口**：无 per-squad role 行内编辑与 leader 指定的产品面（multica 范式：squad-detail 成员行内改 role、leader 只能设 agent）。

**与 multica 的映射**：multica Squads=独立后端实体；studio 的"队"=matrix registry 事件投影（无独立 squad 表）。所以不做"Squads 页"，做**账户页团队卡的行内编辑增强**：
1. 成员行 role 下拉（当前 registry 的 agentTeams[*].profiles/role 语义），保存走既有 registry 写路径（leader 门控复用）。
2. 每队"指定 leader"按钮（agent-only 校验在服务端投影侧）。
3. 守门：非 leader 账号界面只读（与 registry 写门控一致）。

**代价估算**：1.5-2 个工作日（含走查）。**风险评估**：registry 写路径是 matrix 事件流（非 REST 直写），行内编辑的冲突合并语义需先验证（两人同时改同队）——建议先做一个"编辑→事件→回读一致"的 spike 再铺 UI。**启动条件**：spike 验证通过；不依赖 #12/#13（早前记档的依赖关系解除——经实证队册与 ekko/设置架构无耦合）。

## 三、#16 hermes-agent apps/desktop 对标差距清单

来源：本轮调研（hermes-agent 穷尽盘点路）+ studio desktop 壳现状（暴露面 diff 路）。hermes-agent 官方 Electron（`upstream/hermes-agent/apps/desktop/src/app/` 30 功能域）逐域对照：

| 域 | studio 现状 | 判定 |
|---|---|---|
| command-center / command-palette | Spotlight 混合搜索已在（首轮落地） | 已有等效 |
| cron | JobsView 收编页+Automations 入口 | 已有等效 |
| profiles | ProfilesView 收编页 | 已有等效 |
| messaging/channels | ChannelsView 收编页 | 已有等效 |
| agents 编队视图（subagent/spawn_tree 数据） | cockpit fleet 实时会话面 | 部分等效（spawn_tree 谱系无——记 #7 同链受阻） |
| artifacts 工件面 | 治理中心工件库+报告链 | 已有等效 |
| quick-entry 全局快捷入口 | 无 | 差距（托盘快捷发指令，远期可评） |
| hud 常驻浮层 | 注意力条近似（非浮层） | 形态差异，不追 |
| pet-overlay | petdex 已收编（默认关） | 有意关闭 |
| starmap 星图 | 无 | 差距（装饰性，不追） |
| session/quick-entry 桌面速聊 | 面板多窗+聊天窗 | 已有等效 |
| webhooks/learning | server 路由在线无 UI | 差距（webhooks 管理面可收编候选） |
| backend 生命周期（discovery/claim/health/ownership） | runtime-manager 部分 | 差距（多实例所有权仲裁是 studio 弱面，值得专项） |

**结论**：30 域中 8 已有等效、4 部分等效、2 有意关闭、3 不追、2 真差距（webhooks 管理面、backend 所有权仲裁）。**webhooks 管理面收编**是低成本高价值件（hermes WebhooksPage 范式，server /api/webhooks 在线）；**backend 所有权仲裁**属架构专项不单列。

## 四、#19 routa specialist 契约库移植评估

**现状**：首轮 #16 已落列证据契约（ColumnAutomation.requiredArtifacts，YAML 声明→TRANSITION 匹配透传+缺件可核）。routa 契约库（约 30 个 yaml）的可移植件分两档：

1. **workflows/kanban 九件套**（backlog-refiner→todo-orchestrator→dev-executor→review-guard→qa-frontend→blocked-resolver→done-reporter→pr-publisher→flow-analyst）：与六闸列语义直接同构。移植方式=prompt 契约文本入库（overlay 资产）+列自动化配置引用其名，不需要 routa 的运行时。**价值**：六闸每列一个命名守门员的现成 prompt 库，省一轮设计。
2. **review 三层**（pr-reviewer 采集→security-*-reviewer 专项→pr-analyzer 汇总判）：对应 G4 独立验证的机制化。移植方式=评审域（approvals review）支持"多段评审单"——一层采集单+N 个专项单+汇总判词。**价值**：G4 判词真值化（B2）的结构升级；**代价**：评审域数据模型变更（评审单嵌套），中工程。

**建议**：先做 1（纯资产入库+配置引用，零模型变更）；2 列为评审域专项（与 IMP-25 独立审批人视图同批设计）。

## 五、汇总：启动条件矩阵

| 项 | 形态 | 环境依赖 | 裁决依赖 | 建议批次 |
|---|---|---|---|---|
| #13 步 1 建层 | 代码 | 无 | 建议与 #15 同批 | 下批可做 |
| #14 团队卡行内编辑 | 代码 | registry spike 验证 | 无（依赖已解除） | spike 后 |
| #16 webhooks 管理面收编 | 代码 | 无（server 在线） | 无 | 下批可做 |
| #16 backend 所有权仲裁 | 架构专项 | 多实例环境 | 需立项 | 远期 |
| #19-1 契约文本入库 | 资产+配置 | 无 | 无 | 下批可做 |
| #19-2 评审域多层 | 专项 | 无 | 与 IMP-25 同批 | 专项轮 |
