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
| 33 | Task 8 important-ledger | **R1 每日 Brief Matrix 投递最后一公里未接** | 投递函数（briefDelivery）注入点已在 patch 202 预留（当前 createGraphAssembly 未传该参数）；接线需 getMatrixClient 单例 + `LOOP_MATRIX_*` env 四件套 + patch 202 注入 ~15 行。**待用户确认 bot 身份与凭据来源后实施**。落地前诚实边界已在 README 声明：默认只落事件日志（graphId='daily-brief' 审计 run，delivered:false），聊天里收不到每日简报 |

---

## 附：核销核对方法

- 逐条对照 progress.md Task 1-8 的 minor/deferred 行，P2 收口时（Task 9）在代码库重新 grep 验证现状（如 #3 的 JSDoc、#2 的 resumeRun 调用方、#26 的路由表），非照抄评审记录；
- 未列为本核销范围的 Task 1-8 主线缺陷（fix round 项）均已在各自修复轮收口，见 progress.md 对应 "fix round x/x (n addressed, 0 open)" 行；
- P3 排期时按本文编号引用，避免二次转述失真。
