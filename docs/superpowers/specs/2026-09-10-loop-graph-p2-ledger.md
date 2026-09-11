# Loop Graph P2 台账核销（2026-09-10）

来源：`.superpowers/sdd/2026-09-10-loop-graph-p2-runcenter/progress.md` 各任务 minor/deferred 行 + Task 8 important-ledger。P2 八个功能任务（Task 1-8）全部收口后，本文逐条核销其遗留项，杜绝"评审记录即遗忘记录"。

核销状态三态：

- **已修**：P2 期间（含各任务修复轮）已落地，注明落地位置；
- **顺延 P3**：确认未处理、带去向下文移入 P3 待办；
- **待决策**：技术方案就绪，等待用户业务决策后接线。

共 **33** 条：已修 5 / 顺延 P3 27 / 待决策 1。

> 注：已修表 #5 为 Task 9 收口时新发现并当场修复的构建阻断，非 Task 1-8 遗留。
>
> 编号沿革：终审修正轮（2026-09-10）起顺延表整体重编为 #6-#32、待决策条目重编为 #33，消除旧顺延表 #5 与已修表 #5 的编号双义（task-9-report.md 中的编号引用为重编前快照）；重编同时新增顺延表 #30（graph run 回放导出，spec §10 门禁项计划期裁剪未回写）。
>
> **P3 收口（2026-09-10）**：顺延 27 条已逐条复核处置——**12 条清偿 / 15 条顺延 P4**（#33 待决策维持），见第四节；P3 各任务台账（progress.md 汇总）核销状态表同见第四节第 2 部分。

---

## 一、已修（P2 内核销，5 条）

| # | 来源 | 条目 | 落地位置 |
|---|------|------|---------|
| 1 | Task 1 | "每轮有产出但永不收敛"残余盲区 | P2 停滞熔断（run-spawner.ts 台账④）：completed 且 stopMet=false 且 contracts/verifications 双空的 run 计入停滞，达阈值走与失败熔断同一条 paused 路径 |
| 2 | Task 5 | store.resumeRun 暂无 UI 调用方（预埋勿删） | P2 Task 7 介入收件箱 / 审批面板接入：approve/reject 经 store.resumeRun 携带结构化裁决值（intervention-components.test.ts 断言） |
| 3 | Task 6 | run-graph.ts:62 iteration JSDoc 仍旧语义（Task 7 顺手改） | Task 6 修复轮（3261137 迭代徽标修正）已同步：现注释为"节点自身完成次数；superStep 是全局步时钟，不充当节点迭代数" |
| 4 | Task 2 | fail 策略告警噪音时长"随 P2 收尾文档标注" | **本文档标注**：fail 策略处置 = scanner 调 failRun 置 run failed，run 随即离开 awaiting-input 注册表，后续扫描轮不再命中——同 interrupt 至多告警一次，无持续噪音窗口（`interrupt-timeout.test.ts` fail 用例断言 run.failed 恰一条） |
| 5 | Task 9（收口新发现） | 上游 v0.7.18 拉取带入 TypeScript 6.0.3，server tsc 的 moduleResolution 默认从 node10（对包含文件取 realpath）变为 Bundler（按符号链接路径解析）——`custom/server/loop/types.ts` 跨根 re-export（`../../client/loop/types`）在链接视角指向不存在的 `packages/server/src/client/…`，95 个 TS2305/TS2307/TS7006 级联报错，`npm run build:full` 阻断（P2 Task 1-8 未跑过 build:full 门禁，故此前未暴露） | **类型事实源搬迁**（overlay 代码零 patch）：定义本体从 `custom/client/loop/types.ts` 迁至 `custom/server/loop/types.ts`（链接视角与物理视角的相对解析在 custom 子树内一致），client 侧同名文件反向 re-export（vite/vitest 按 realpath 解析，client 引用零改动）；迁移体经 diff 逐字节核对。备选方案（tsconfig 显式 node10 / paths 映射）均因 TS 6 将 node10、baseUrl 列为停用（TS5107）被否 |

## 二、顺延 P3（27 条）

### 服务端 / 引擎（graph）

| # | 来源 | 条目 | P3 去向注记 |
|---|------|------|------------|
| 6 | Task 1 | scheduleLoop / updateLoop 静默吞错建议补 log | 装配层 `void store.updateLoop(...).catch(() => {})` 仍静默；改法：catch 里 log 一次 |
| 7 | Task 1 | 失败不清停滞计数的有意非对称缺注释 | 在 spawner 失败分支补一行"有意不清零"注释 |
| 8 | Task 2 | failRun 竞态日志措辞 | 措辞级小改 |
| 9 | Task 2 | escalated 先发后落水印（append 失败会重发） | 调整为先落水印再发；需评估失败语义反转的代价 |
| 10 | Task 2 | fake/real 时钟混用 | 统一 clock 注入面 |
| 11 | Task 3 | specs 灌入中途崩溃窗口（部分落表跳过剩余文件） | 单进程低危；迁移器加逐文件事务或续跑标记 |
| 12 | Task 3 | `'status' in jr` 判别偏松 | judge 真实接线时改显式字段比较（与 #27 同波） |
| 13 | Task 3 | InMemory getSpec 读侧引用 | 返回副本，防调用方改写共享结构 |
| 14 | Task 3 | 投影启发式对新非线性主干边静默丢弃 | 有测试兜底不出错；P3 投影重写时补告警 |
| 15 | Task 4 | runPersistence 台账以闭包 loop.stats 为基准，多轮成功写 tasksCompleted 少计 | 既有缺陷；改读 store 现值或累差（注意与 #16 同函数） |
| 16 | Task 4 | guard.maxIterations=3 假定契约默认 maxAttempts=3，显式配置 ≥5 时回边先耗尽 | 非默认配置边界；编译器把 guard 与契约 maxAttempts 对齐或取 max |
| 17 | Task 4 | loop-to-graph 投影 6→7 边 | legacy REST 视图补 gate→stop-check 自环等缺失边 |

### 前端 / 运行中心（runcenter）

| # | 来源 | 条目 | P3 去向注记 |
|---|------|------|------------|
| 18 | Task 5（Task 6 并入） | history 重连重复回放无去重 + 首连 subscribe 双发 | 投影幂等不出错但缓冲挤占；socket 层事件 id 去重一并做（与 #28 同波） |
| 19 | Task 5 | gate 双轴折叠不一致（图轴 'gate' vs legacy 轴 'stop'） | STAGE_BY_NODE 有 'gate' 档、STAGE_BY_LEGACY 的 scheduling 折到 'stop'；P3 统一七段或都折到 'stop' |
| 20 | Task 5 | 裸 Record 原型链键（display 级） | 换 Map 或 `Object.create(null)` |
| 21 | Task 5 | 分页越界空页 | 页码钳制到末页 |
| 22 | Task 5 | 全量订阅量级 | P3 批量/增量订阅一并 |
| 23 | Task 6 | B-5 vue-flow 边渲染零断言 | P3 实时跟踪时补组件测试 |
| 24 | Task 6 | layoutRunGraph 大图性能（数百节点） | 分层布局或虚拟化 |
| 25 | Task 6 | scrubber→图联动断言缺 | 回放联动回归测试 |
| 26 | Task 6 | 服务端 GET /api/graph/specs/:id 端点未补 | 详情页当前经 run 详情内嵌 spec 数据；补 ~4 行 overlay 自有路由（审查已判定安全） |
| 27 | Task 7 | specified 审批策略客户端无用户身份 | P3 用户身份基建到位后接 passPolicy='specified' 的"指定人"判定 |
| 28 | Task 7 | 乐观 resume 双显窗口 | 事件 id 幂等（与 #18 同波） |
| 29 | Task 7 | 检查器 channel 值 join instance.state 显示当前值 | NodeInspector 小改：attach 档叠加实时值 |
| 30 | spec §10 门禁 | graph run 回放导出未实现 | spec §10 P2 验收门禁含"回放导出"，计划期裁剪未回写台账（终审修正轮补记）；P3 补运行详情/回放浮层的导出面（可对齐 RunTraceView 的 JSONL 导出） |

### 工具链

| # | 来源 | 条目 | P3 去向注记 |
|---|------|------|------------|
| 31 | Task 7 | inject.mjs 脏树拒绝路径先删自身符号链接留半态 | 独立小改进：校验前置到任何删除动作之前 |
| 32 | Task 7 | hermes-agent verify-clean WARN 存量文档债 | 上游侧历史文件清单核对，非本仓代码改动 |

## 三、待用户决策（1 条）

| # | 来源 | 条目 | 现状与方案 |
|---|------|------|-----------|
| 33 | Task 8 important-ledger | **R1 每日 Brief Matrix 投递最后一公里未接** | **已拍板接线（2026-09-10 用户拍板：使用本机配置的登录身份；实现 commit 见 overlay `feat/r1-brief-matrix`）**。落地形态：投递函数（briefDelivery）注入点已在 patch 202 预留 → 本次由 patch 202 注入 `createMatrixBriefDelivery()`；凭据=本机 `~/.hermes-web-ui/matrix-session.json`（patch 012 matrixLogin 成功路径落盘，session-store.ts 0600/原子写）→ `LOOP_MATRIX_HOMESERVER/TOKEN/USER` env 回退；无凭据走既有 warn-once + event-log-only 路径，房间仍由 `LOOP_BRIEF_ROOM` 配置 |

---

## 四、P3 收口核销（2026-09-10，Task 9）

### 4.1 P2 顺延表 #6-#32 逐条处置

复核方法与 P2 收口相同：逐条在当前代码库重新 grep 验证（非照抄评审记录），锚点到 file:line。

**已清偿（12 条）**

| # | 处置锚点 |
|---|---------|
| 8 | failRun 竞态措辞已达标：interrupt-timeout.ts:168 `not in registry for fail policy`（说清对象与后果） |
| 12 | `'status' in jr` 松判别已改显式比较：`isJudgeFailed`（custom/server/loop/types.ts:123-127，status==='failed' 显式判定 + 旧数据 passed 回退），phase-nodes.ts:332 failTypeOf 消费 |
| 15 | runPersistence 少计已修（累差）：phase-nodes.ts:300-302 写台账前从 store 读现值作基准，:709 `base.tasksCompleted + completed` |
| 16 | guard.maxIterations 与契约 maxAttempts 对齐：graph-compiler.ts:70-84 取 `max(契约 maxAttempts, 3)`，无契约模板时 warn |
| 18 | 事件幂等根已立：event-log-store.ts append 生成 eid=`<runId>-<seq>`（SQLite 加 eid 列 + 旧表 ALTER 兜底），graph-socket.ts:35-40 延迟下发携带 eid，前端 runs store seenKeys 去重 |
| 19 | gate 双轴折叠统一：adapters.ts:40 STAGE_BY_LEGACY `scheduling → 'gate'`，legacy 轴与图轴七段一致 |
| 22 | 全量订阅改批量/增量：RunCenterView `syncVisibleRunIds`（订阅域=可见页，翻页/过滤重订阅）+ runs store subscribe/unsubscribe |
| 26 | GET /api/graph/specs/:id 已补：graph-rest.ts:176，runRest.getSpec 前端直取（不再列表端 find） |
| 27 | specified 审批身份已接：ApprovalPanel.vue `getStoredUsername()` → resume 值携带 approver，服务端 evaluateApprovalPolicy 按 approver 匹配 |
| 28 | 乐观 resume 双显窗口：与 #18 同波（eid 幂等去重）消除 |
| 29 | 检查器 join state 显示当前值：NodeInspector.vue attach 档叠加实时值（f2f5303） |
| 30 | 回放导出已实现：runRest.exportRun（GET /api/graph/runs/:id/export，run+spec+全事件）+ RunDetailView 导出入口 + patch 213/214 文案 |

**顺延 P4（15 条）**

| # | 复核现状（2026-09-10） |
|---|----------------------|
| 6 | graph-assembly.ts:279 仍 `updateLoop(...).catch(() => {})` 静默 |
| 7 | run-spawner.ts:270-277 失败分支仍无"停滞计数有意不清零"注释 |
| 9 | escalate() 仍先 emitLoopEvent 后 eventLog.append 水印（:214-221），append 失败会重发 |
| 10 | run-spawner.ts:94 仍直接 `Date.now()`；统一 clock 注入面未做（interrupt-timeout 的 clock 注入为 P2 既有） |
| 11 | graph-migrate 本期未动，specs 灌入中途崩溃窗口仍在 |
| 13 | InMemory getSpec 仍共享 spec 引用（event-log-store.ts:146-148 `spec: s.spec`，未返回副本） |
| 14 | loop-to-graph 本期未动，投影静默丢弃无告警 |
| 17 | loop-to-graph 本期未动，legacy REST 视图缺边仍在 |
| 20 | 词表仍裸 Record（adapters.ts:18/35/213，静态字面量键、原型链风险低，未换 Map） |
| 21 | RunListTable 虚拟滚动已具备，但 RunCenterView 仍分页（PAGE_SIZE=20）且页码不随列表收缩钳制到末页 |
| 23 | vue-flow 边渲染断言仍缺（run-detail-components.test.ts 仅节点投影/选中/空图） |
| 24 | layoutRunGraph 大图性能未动 |
| 25 | scrubber seek 数值化有断言，scrubber→图前缀联动断言仍缺 |
| 31 | inject.mjs 清理动作（step 0）仍先于工作树校验（step 1） |
| 32 | hermes-agent verify-clean WARN 存量文档债未动 |

#33（每日 Brief 投递）已于 2026-09-10 用户拍板并接线（见第三节该条拍板注记），不再待决策。

### 4.2 P3 各任务台账核销状态表（progress.md 汇总）

处置口径：**已清偿**（落地并验证）/ **顺延 P4**（带下文移交）/ **接受**（确认为形态/裁剪而非缺陷，不再跟踪）/ **待决策**（待用户）。

| 来源 | 条目 | 处置 | 锚点/说明 |
|---|---|---|---|
| T1 | controllers create 白名单补 maxAttempts 拷贝 + connectors 建契约消费 maxAttempts | 已清偿 | f2f5303：controllers/loop.ts、connectors×3 + loop-controller / connector-max-attempts 测试 |
| T1 | graph:event 无 eid（去重策略） | 已清偿 | eid 于 event-log-store append 生成；graph-socket 下发携带；无 eid 场景 type+ts+nodeId 复合键兜底 |
| T1 | SQLite eid 升级场景守门测试缺（两代 ALTER 同欠） | 顺延 P4 | event-log-store.ts 有旧表 ALTER 兜底（:184-189），缺旧库升级用例 |
| T1 | tripBreaker 停滞场景后缀文案误导 | 已清偿 | run-spawner.ts:243-245 停滞出口独立文案（stagnant runs, completed with no new contracts/verifications）；:203-204 补口径注释 |
| T1 | loop-to-graph fallback warn 噪音 | 已消解 | 现码 loop-to-graph.ts 无 fallback warn 路径；P4 若复现再立条 |
| T1 | 导出 query 无 limit（超大规模流式） | 顺延 P4 | |
| T2 | emitEvent 顺序约束 graph-socket 注释待补 | 已清偿 | graph-socket.ts:35-40 两步微任务链说明 |
| T2 | 翻页不清 expandedRunId / scrollTop | 顺延 P4 | RunCenterView 分页仍在，翻页未清 peek 展开与滚动位 |
| T2 | 页界 subscribe 抖动（罕见） | 顺延 P4 | |
| T2 | seenKeys 长驻上界 | 已清偿 | runs.ts:43 `SEEN_KEY_LIMIT=400` + :141 修剪 |
| T2 | graph.forked/graph.failed live 副本无 eid（低频） | 顺延 P4 | 复合键兜底已覆盖语义 |
| T2 | stop-check 徽标 gate 瞬间 | 接受 | 方向选择固有代价，已在报告声明 |
| T3 | 报告 i18n 键数 17 实为 13 | 核销 | 报告为存档快照不回改，正源以代码与本文为准 |
| T3 | /app/runs/:runId 仅 resolve 级断言（Task 9 补） | 已清偿（Task 9） | routes.test.ts 懒组件身份断言：装载目标 = runcenter RunDetailView |
| T3 | store.retro 无消费方（预留） | 顺延 P4 | 守卫实际走 features.iaRetro 单一事实源；ia store 内 retro ref 闲置 |
| T4 | 指标近似口径 UI 标注（Task 9 收口前补） | 已清偿（Task 9） | MetricsCards 样本副注 + MetricsRaw.partial + OverviewMetrics.stuckPartial + i18n patch 231/232 + 4 处测试 |
| T4 | saas-store 事件窗口截断（ASC+LIMIT 取最旧 → 熔断计数少计） | 顺延 P4 | saas-store.ts:242 仍 `ORDER BY ts ASC` + LIMIT；与 T7 getEvents 语义分叉合并为"服务端查询端点"任务 |
| T4 | 注意力点击筛选欠账 | 已清偿 | OverviewView `goTaskFromAttention` → /app/tasks?status&task（overview-components 测试断言 query 预选） |
| T4 | fleet WS 生命周期接管（stopFleetStream 无人调用） | 已清偿 | Task 8：IaShell unmount 承接（IaShell.vue:26） |
| T4 | upstream NaN 排序 bug 记账 | 记账维持 | upstream 只读，留在本表 |
| T4 | nowTick 冻结（长驻视图陈旧） | 顺延 P4 | |
| T4 | fetchRuns 失败被空态吞没（error 未渲染） | 顺延 P4 | |
| T4 | buildTodayPlan 只收 idle（blocked 到期不呈现） | 顺延 P4 | |
| T4 | normalizePriority 双词汇倒置注释 | 已清偿 | overview.ts:57 注释与实现一致 |
| T4 | cockpit attention priority 相减 NaN（upstream 潜伏） | 核销 | 面随 Task 8 cockpit 退役移除 |
| T5 | 告警时效受 fetchMetrics 5min TTL | 接受 | 通道固有限制；改进（loop 事件并入 /graph）为 P4 候选 |
| T5 | 自动归档仅覆盖 approval 源（需回写设计文档） | 顺延 P4 | **文档回写债**：本收口未回写 spec，诚实记账 |
| T5 | 任务等待锚点 createdAt | 接受 | 数据契约限制 |
| T5 | 跨视图批准无痕 | 顺延 P4 | |
| T5 | done 测试标题名不副实（防御性分支） | 顺延 P4 | |
| T6 | ia2.placeholder 键与 IaPlaceholder.vue 零消费方留存 | 已清偿（Task 9） | patch 218/219 移除 6+6 键（下游 12 个 locale patch 行号同步 -8）；删除孤儿 IaPlaceholder.vue |
| T6 | ?loop= 参数只写不读（Task 9 补 RunCenterView 消费） | 已清偿（Task 9） | RunCenterView onMounted 消费 route.query.loop 预填搜索（graphId 包含匹配）+ 测试 |
| T6 | SpecDetail 模板内直调 layoutFromSpec 非 computed | 顺延 P4 | |
| T6 | cron 粗校拒字名/描述符但文案未说明 | 顺延 P4 | |
| T6 | 模板卡片键盘不可达 | 顺延 P4 | a11y 随 P4 |
| T6 | 首拉失败错误横幅与空态同屏 | 顺延 P4 | |
| T6 | 模板语义不随实例化携带（所见非所得） | 顺延 P4 | 已列 P4 清单 |
| T6 | 模板卡描述为种类级文案 | 顺延 P4 | 需服务端 GraphSpec 补 description 或模板注册表 |
| T6 | specs 列表无分页 | 接受 | P3 规模内全量成立 |
| T6 | 创建成功不锚定新 loop 的运行 | 顺延 P4 | |
| T7 | getEvents 500 截断语义分叉（local 最新 / saas 最旧）+ 迭代推导退化 | 顺延 P4 | 与"按 taskId 服务端查询端点"合并为 P4 任务 |
| T7 | 矩阵/RunLinks 无事件缓存 TTL | 接受 | P3 规模成立 |
| T7 | loop-engine legacy persisted 事件无 taskId/runId | 接受 | legacy 不在图引擎面；「未归属」桶已显式标注 |
| T7 | OverviewView 2 条类型债（scss side-effect import + initFleetStream store 类型） | 顺延 P4 | Task 8 workspace store 迁移消除 store 类型债；scss side-effect import 仍在（OverviewView.vue:26） |
| T7 | sessionTaskId.ts deprecated 未删 | 顺延 P4 | cockpit 遗留树整体清扫随 P4（其消费方 useKanbanTaskGraph/useRunTrace* 同属遗留树） |
| T7 | applyQuery 深链残留过滤器 | 已清偿 | 39b8140 状态行筛选落空修复：TasksView applyQuery + route watcher（traceability-components.test.ts:260 断言） |
| T7 | intervention 测试 router warn | 顺延 P4 | 未重核 |
| T7 | KANBAN_STATUSES 双源 | 顺延 P4 | 未重核 |
| T7 | 报告两处失实（phase-persistence id 侥幸兼容 / 键计数虚高） | 核销 | 报告为存档快照，正源以代码与本文为准 |
| T7 | iteration 注释不符 | 顺延 P4 | 未重核 |
| T8 | A1 RETRO 语义收窄（回退=revert 4bcb1e8，回退窗口随 P4 关闭） | 待决策 → **用户已追认（2026-09-10）** | 本收口已在 README 如实声明（cockpit 退役声明），**计划级变更待用户追认**——用户已追认，回退窗口维持随 P4 关闭 |
| T8 | A2 command-post 舰队审批 UI 无落点 | 顺延 P4 → **用户已追认（2026-09-10）** | README 已注明"P4 重建"；追认范围含该重建排期（P4） |
| T8 | MatrixChatPanel openSettingsPage 死代码（push 退役路由名） | 顺延 P4 | MatrixChatPanel.vue:61 定义未消费，下轮清扫 |
| T8 | PageSidebarNav openMatrixChat 死函数 | 顺延 P4 | 随 020 重写清 |
| T8 | watchKanbanTasks 模块级 watch 永不卸 | 顺延 P4 | workspace.ts:271-279 已核实仍常驻 |

统计：P3 台账 55 条（不含 T9 本身）——已清偿 13 / 已消解 1 / 接受 6 / 核销（报告存档·面退役）3 / 待决策 1 / 记账 1 / 顺延 P4 30。P4 待办入口：本表"顺延 P4"行 + 4.1 顺延 15 条 + #33（若用户拍板）。

---

## 附：核销核对方法

- 逐条对照 progress.md Task 1-8 的 minor/deferred 行，P2 收口时（Task 9）在代码库重新 grep 验证现状（如 #3 的 JSDoc、#2 的 resumeRun 调用方、#26 的路由表），非照抄评审记录；
- 未列为本核销范围的 Task 1-8 主线缺陷（fix round 项）均已在各自修复轮收口，见 progress.md 对应 "fix round x/x (n addressed, 0 open)" 行；
- P3 排期时按本文编号引用，避免二次转述失真。

---

## 五、P4 收口核销（2026-09-12）

P4（可视化编排器 + 双入口平行共存）收口对第四节"顺延 P4"余项的逐条处置。逐条 grep 复核现状后落锚点，非照抄评审记录。

### 5.1 P2 顺延表 §4.1 余项（服务端为主，T10 批）

| # | 处置 | 锚点 |
|---|------|------|
| 6 | 已修：updateLoop 静默 catch 补 log | graph-assembly.ts（P4 T10） |
| 7 | 已修：失败分支补"计数有意不清零"注释 | run-spawner.ts |
| 9 | 已修：escalate 先落水印再发（append 失败不重发） | interrupt-timeout.ts |
| 10 | 已修：RunSpawner clock 注入面统一 | run-spawner.ts |
| 11 | 已修（位置修正）：真实窗口在 GraphSpecStore.load 文件灌表路径 → 完成标记行 + 逐 spec 续跑 | graph-rest.ts |
| 13 | 已修：InMemory getSpec 返回深副本 | event-log-store.ts |
| 14/17 | 已修：投影丢弃边 warn（模块级去重）；gate→stop-check 折叠为 scheduling 自环投影（取舍：编译拓扑无独立 stop-check 自环边） | loop-to-graph.ts |
| 20 | 已修：词表 Object.create(null) | runcenter/adapters.ts |
| 21 | 已修：页码随列表收缩钳制到末页 | RunCenterView.vue |
| 23 | 已修：flowEdges 投影断言（源/目标/箭头/taken 描色/guard 徽标） | run-detail-components.test.ts |
| 24 | 已修：单列 fan-out 折行（8 行/子列 + 累计 x 基线）+ 300 节点基准测试（重叠/全覆盖/耗时上界） | run-graph.ts / run-graph.test.ts |
| 25 | 已修：前缀联动单调性断言（seek → taken 集合扩张） | run-graph.test.ts |
| 31 | 已修：inject.mjs 脏树校验前置（拒绝时零删除，实测脏树拒绝→clean→注入成功） | inject.mjs main() |
| 32 | 已核对（文档债定性）：WARN 源 = inject 语义内 4 patch 的 9 个 tracked 文件（全部存在）；非残留债。历史 progress.md 清单已随 .superpowers 清理，无从逐文件对账（诚实声明） | verify-clean.mjs / .overlay-injected.json |

### 5.2 P3 顺延表 §4.2 余项（T11 批为主）

| 条目 | 处置 |
|---|---|
| SQLite eid 升级守门测试 | 已补（旧 schema 建表→打开→新事件回填 eid） |
| 导出无 limit | 已修（?limit= 默认/上限 10000 + eventsTruncated 标志） |
| getEvents/saas-store 窗口语义分叉 | 已修（两实现统一"最新 N 条升序"；saas DESC 截取反转） |
| graph.forked/failed live 副本无 eid | 已修（failRun/forkRun 补 eid，格式对齐 `<runId>-<seq>`） |
| 翻页不清 expandedRunId/scrollTop | 已修（换页/钳制清 peek + 滚动复位，jsdom 守卫） |
| 页界 subscribe 抖动 | 接受（syncVisibleRunIds 以可见页为域，抖动窗口无害） |
| nowTick 冻结 | 已修（60s 步进 + 卸载清理） |
| fetchRuns 失败被空态吞没 | 核销（store.error 渲染已在 P3 落地，复核确认） |
| buildTodayPlan 只收 idle | 已修（paused 且今日到期进计划 + 测试） |
| 跨视图批准无痕 | 接受（resume 事件带 approver 留痕；服务端 stampApproverIdentity 覆写） |
| done 测试标题名不副实 | 核销（复核现测试标题与断言一致） |
| cron 粗校文案 | 接受（粗校错误经表单错误行展示；详尽 cron 解析属服务端职责） |
| 模板卡片键盘不可达 | 已修（role=button + tabindex + Enter/Space） |
| 首拉失败错误横幅与空态同屏 | 已修（error prop：失败仅横幅，空态让位） |
| 创建成功不锚定新 loop | 已修（跳转带 ?loop=<name>，RunCenterView 消费预填） |
| OverviewView scss side-effect import | 已修（壳级 IaShell 统一引入，3 视图重复删除） |
| sessionTaskId.ts deprecated 未删 | 重新定性：cockpit 平行共存恢复后消费方（useKanbanTaskGraph/useRunTrace）活跃 → 去 deprecated 标记 |
| intervention 测试 router warn | 接受（jsdom vue-router 已知告警，断言全绿无噪声失败） |
| KANBAN_STATUSES 双源 | 已修（Set<KanbanTaskStatus> 类型派生，上游词表变化编译期报错） |
| iteration 注释不符 | 核销（复核服务端注释语义一致） |
| MatrixChatPanel openSettingsPage 死代码 | 已修（删除） |
| PageSidebarNav openMatrixChat | 已修（2.18 同步 patch 234，并行会话落） |
| watchKanbanTasks 模块级 watch 永不卸 | 已修（store stop 句柄 + unwatchKanbanTasks，OverviewView 卸载解除） |
| ia store retro ref 无消费方 | 接受（features.iaRetro 为活读取，retro ref 预留 RETRO 模式扩展） |
| specStore 事件窗口/模板语义随实例化（T6） | 已修（createLoop template 参数 + origin=template + meta 透传 + patch 202 接线 getTemplate） |
| A1 RETRO 回退窗口 | **计划级修订（用户裁决 2026-09-11）**：cockpit 恢复平行共存，"窗口随 P4 关闭"不再适用——旧驾驶舱常驻可达，README 已同步 |
| A2 舰队审批 UI 重建 | 已修（cockpit 恢复后 CockpitFleetGrid 审批链路复活 + Always allow 'always' 档暴露 + runcenter 面板按类型记忆） |
| matrix-bot 事件面收敛 / 失败通知 5min 合并窗口 | 顺延（通知通道改造，独立期，见 P4 计划"不做"节） |
| T7 自动归档仅覆盖 approval 源（文档回写债） | 已回写（本表即核销记录；spec §7B.4 Triage 语义以实现为准） |
| getEvents 500 截断迭代推导退化 | 已修（服务端查询端点统一，见上） |
| 导出 query 流式 | 接受（limit 上限 10000 已够 P4 规模） |

### 5.3 T10 新发现（未在台账，本收口立条并处置）

- **graph:history 回放窗口取最旧 50 条**（与"最近 50 条"注释相反）：已修（latestSeq 定位尾部窗口）→ graph-socket.ts。
- **SaaSStore 不持久化 loop.template**（createLoop 固定列）：接受（图引擎 + saas 形态下模板溯源重启即失；本地形态为主）。
- **query(runId,{limit}) 语义为"最旧前 N"**：graph:history 已绕开；export 端点沿用前 N 语义（eventsTotal/eventsTruncated 透明化）。语义重定义顺延。

统计：P4 收口处置 §5.1 14 条 + §5.2 31 条 + §5.3 3 条——已修 36 / 接受 6 / 顺延 2 / 重新定性 2 / 计划级修订 1 / 已核对 1。
