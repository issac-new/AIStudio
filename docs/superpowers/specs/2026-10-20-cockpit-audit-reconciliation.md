# 驾驶舱整治·独立审计增量对账（致兄弟会话与用户）

> 日期：2026-10-20。作者：本会话（zcode，服务端+验收分工）。
> 本文是与兄弟会话 `zcode-eval-autonomy` 正本《2026-10-20-cockpit-split-and-hygiene.md》
> （D1-D12）的对账文档：两会话各自独立做了全量审计，以下逐类标注「重叠 / 本会话新增」，
> 新增项请兄弟会话在对应批次择取；用户两项裁定记录于第一节。

## 一、用户裁定记录（2026-10-20，本会话在场）

| 裁定 | 内容 |
|---|---|
| 撞车处置 | **分工接力**：兄弟会话做客户端拆分/噪声/布局（其 B1-B6 批）；本会话做 matrix 服务端与 patch 层（已落，见第二节）+ 兄弟合 main 后的全量独立验收 |
| 拆分形态 | **以兄弟会话形态为准**：侧栏按路由模式切换（/app/sim* 为推演专区）、六阶段页归日常、日常进度由看板任务聚合驱动（其 D5/D6/D7）。本会话原方案（单壳双区+六阶段归推演域）作废 |

## 二、本会话已落（服务端/patch 层，commit 7252100b）

- 新单一事实源 `custom/server/matrix/server-info.ts`：`getMatrixServerInfo()`=
  显式 env（`MATRIX_HOMESERVER_URL`/`MATRIX_SERVER_NAME`/`ELEMENT_WEB_URL`）→ gateway
  dotenv → 兜底 `http://127.0.0.1:8008`/`matrix.test`/`/element-web/`。
- 新端点 `GET /api/matrix/server-info`（无凭据、无回环闸，决策 D4）。
- 补丁 667：element-web `config.json` 动态分支前移到静态分支前（修 patch 008 遮蔽——
  旧动态分支不可达），默认 `https://matrix.org` 退役；`?hs=` 覆盖保留。
- 补丁 668：`auth.ts` 六处写死 `localhost:8008` 全部改走 server-info（:803/:875 硬编码、
  :945/:988/:1026/:1058 回落；用户级 `matrix_homeserver_url` 优先语义不变）。
- 补丁 669：登录页 homeserver 无 localStorage 记忆时用 server-info 预填（LAN 部署不再拿 localhost）。
- 客户端 helper 已就位：`custom/client/ia2/matrix-server-info.ts`（`fetchMatrixServerInfo()`
  带缓存+兜底，`@/custom/ia2/matrix-server-info` 可导入）。
- 验证：补丁应用逐字节比对 IDENTICAL×3；vitest matrix server 全目录 89/89、新测 12/12。
- **未做 inject 激活**（兄弟在主 checkout 有未提交改动，inject 会灌入半成品——激活留待
  兄弟合 main 后的验收轮，见其 spec D6 同理）。

### 提请兄弟会话采纳（客户端侧，本会话守约未碰 `.vue`）

1. `AccountAdminView.vue:14,16,34` 与 `OrgEditor.vue:47`：建号/邀请表单的 homeserver
   默认值改读 `fetchMatrixServerInfo()`（helper 已就位）；邀请文本内嵌地址同源。
2. `PlatformSettings.vue:414`：`https://matrix.org` placeholder 提示文案（上游文件，需补丁；
   影响微，可挂账）。
3. matrix.to 分享链/二维码/SummaryCard 已由兄弟 5d815c06 修复 ✓（重叠，无需动作）。

## 三、导航结构增量（兄弟 spec 未列，本会话三路审计新增）

| # | 发现 | 锚点 | 建议批次 |
|---|---|---|---|
| N1 | 路径→区域投影存在两份平行实现，靠人工同步；且兜底把全部日常页高亮成④开发 | `custom/client/ia2/routes.ts:50-66`(areaForPath) vs `nav-centers.ts:51-70`(centerForPath)、`nav-centers.ts:68` | 拆分批：两表合一为单一事实源 |
| N2 | `STAGE_META.tools` 17 张阶段工具卡配置无任何 Vue 组件渲染（假入口；唯一消费方是守门测试投影） | `stage-meta.ts:51-105`、`stage-attribution.ts:159-162` | 拆分批：删除或接入，二选一 |
| N3 | SimFlowStrip「运行复盘」跳 `ia2.simTrace`（重定向）落进⑤验收阶段页壳，标签语义与落点不符 | `views/sim/SimFlowStrip.vue:25` | 拆分批 |
| N4 | 运行编排/推演设置双 URL 并存：`?tab=orchestration|settings` 页内嵌入版（`SimCenterView.vue:44-45`）与独立路由版（`routes.ts:388-398`），同一内容两种页头两种面包屑 | 同上 | 拆分批：归一为页内签，独立路由保留重定向 |
| N5 | 治理面三套并存：⑥八签 + GovOverlay 七区覆盖层（`store/flow.ts:11-13`，仍由 `IaShellHeader.vue:279-280` 触发）+ 系统设置七域。兄弟已挂账，建议明确去留时间表 | 同上 | 挂账跟踪 |
| N6 | 全站无 404 页：catch-all 把失效深链静默送回 `/app`（兄弟 D3 选 redirect 兜底旧深链——对账：无差别回首页会掩盖真的失效链接，表现为「点了没反应」） | 上游 `router/index.ts:293` | 建议：保留旧链 redirect 表，但兜底落「页面不存在」页（含回首页/检索入口） |

## 四、机读噪声互补清单（与兄弟清单取并集；△=兄弟已列，＋=本会话新增）

1. △ SimAnchorDrawer 原始 JSON 倾倒（兄弟 B3 已列）
2. ＋ `ontology/views/OntologyView.vue:388,419,541`：axiom 约束列整列 JSON.stringify、数据列截断、20000 字符导出 pre——本体页对人类员工纯技术字段堆砌
3. ＋ `kanban/components/KanbanTaskDrawer.vue:1342,1403`：任务抽屉事件流/run.metadata 整段 JSON 无折叠无导语
4. ＋ `matrix-chat/components/MatrixPinnedMessagesCard.vue:232`：固定消息列表直渲染裸 event id（`$xxxx:matrix.test`）
5. ＋ `cockpit/components/RunTraceInspector.vue:66,95,100`（另 :73 裸 runId）：toolArgs/toolResult 原文截断 pre
6. ＋ `governance/components/KnowledgeGraphSection.vue:216`：冲突项 `JSON.stringify → JSON.stringify`
7. ＋ `loop/runcenter/components/RunTimeline.vue:148`：payload JSON（已有 details 折叠，程度轻）
8. ＋ 次要：`ide/views/IdeDeliverPane.vue:175`、`ide/views/WorkflowObservationPanel.vue:232` 裸 runId 片段

统一处置建议（与兄弟 B3 的 `ia2/format.ts` 同源思路）：折叠 + 中文导语 + 关键字段中文标签三板斧。

## 五、陈旧内容互补清单（△=兄弟已列，＋=本会话新增）

1. △ `views/sim/SupervisionPanel.vue:59,84`：监督签 placeholder/错误文案写死 run20 示例（兄弟已列）
2. ＋ `views/sim/steps-registry.ts:73`：步 19 operator 含「（V8.30 职责归位）」，经 OverviewPanel 渲染上屏
3. ＋ `views/gov/GovAiQualitySection.vue:42`：副标题「判据锚=方案正本 V8.35 §5.8.2」
4. ＋ `ontology/i18n.ts:126,227`：本体台账表单 placeholder 写死 run19
5. △ `views/sim/sim-tabs.ts:6,18-19` + `IaBreadcrumb.vue:54-55`：已 redirect 路由的死词条（兄弟已列 sim-tabs 残留）
6. ＋ `i18n-gov-tabs.ts:2`：自称「过渡事实源（A0 2026-10-16）」仍被 4 个组件消费，过渡态多日未清偿
7. ＋ `SimCenterView.vue:2-5`：头注自称「编排/设置放页头按钮」与实际页签实现不符
8. ＋ `components/RunLinks.vue:77`：注释仍写已退役路径 `/app/ops/runs/:runId`
9. ＋ 零引用死组件 12 个（与兄弟「约 3000 行死视图」清单大概率重叠，合并去重）：
   `GovClusterSection/GovHealthSection/GovOntologySection/GovSessionHealthSection`（gov 零引用）、
   `InboxNavEntry/BpaNavEntry/OntologyNavEntry/EvalNavEntry/SkillgovNavEntry/AccountsNavEntry`（IaSideNav 上线前旧导航件）

## 六、假功能互补（△=兄弟已列，＋=本会话新增）

1. △ `kanban/components/KanbanToolbar.vue:250`：帮助「?」`@click="() => {}"`（兄弟已列「看板？按钮空对象」）
2. ＋ 正面信息：本会话对 client 全部 `/api/*` 调用按前缀逐一核对服务端注册（custom 414 条
   路由 + upstream studio 路由），**未发现悬空调用**——API 面健康。
3. △ 未接线挂账 5 处（GatekeeperSection 计数/启动预检/OpsPanel 调度器/IdeMcpPane 三维/
   IdeShareEntry 云分享，均有如实标注；兄弟 B2「假检查诚实化」同源）

## 七、M3 独立验收计划（兄弟合 main 后执行，本会话负责）

1. 全量活页面走查：8649 dev 逐路由截图（/app 全路由 + 33 阶段签 + 4 岛屿 + IDE + 设置域），
   布局启发式（横向溢出/裁切/遮罩叠序）+ 人工复核，产出视觉台账。
2. matrix 链路活体验证：`/element-web/config.json` base_url/server_name、
   `/api/matrix/server-info`、登录页预填、分享深链（兄弟 5d815c06 成果）端到端。
3. 回归：overlay 相关测试套件 + 兄弟各批次守门测试重放。
4. 验收报告回填本文件第八节。

## 八、验收账（M3 后回填）

待填。

## 九、接管记录（2026-10-20，用户裁定）

| 项 | 内容 |
|---|---|
| 裁定 | 兄弟会话已停止，本会话接管其在途工作并继续整项任务（含合 main 与后续批次） |
| 接管物 | 导演台在途波：`DirectorPanel.vue` 重构（457 行改动）、新客户端 `ia2/api/sim-director.ts`、graph-rest 三端点（`/api/graph/sim-director/scenarios\|plan\|start`）、推演模板 26→29 节点线性化（去 verdict 回退环+3 人工闸路由+第 7 节点类型）、`HttpKanbanBridge` JWT 透传、`directorRuntimeFactory` 装配（独立 spec runtime，不依赖 GRAPH_ENGINE 全局接管） |
| 稳定化动作 | 补守门测试 `sim-director-rest.test.ts` 7 例（入参校验/401 JWT 闸/501 无工厂/起跑全链落库溯源）；DirectorPanel SFC 编译+import 解析验证通过；图引擎 33 文件 434 测全绿 |
| 决策 D13 | 接管波按「未接线能力如实告示」验收：无 runtime 工厂=501、无 JWT=401、DryRun 仅测试预览——不假成功（与兄弟 spec D2 同源） |
