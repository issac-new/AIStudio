# 全功能回归修复批：审批 store 兼容、矩阵画布崩溃、并发配额接线、SOS 残桩

日期：2026-10-31 ｜ 轮次：全功能回归（用户令「对 AIStudio 进行全功能回归，修复识别到的问题、bug、缺陷、及设计不合理、风险之处」）｜ 类型：fix

## 变更

1. **审批 HumanGate store 历史 grant 行兼容（并行批已落地；本轮回归复现并复核，不重复实现）**
   - 现象：`GET /api/approvals/human-gate` 500（Internal Server Error），`/app/stage/accept?tab=risk` 走查实锤失败请求。
   - 根因：`~/.hermes/approvals/human-gate.json` 中存在历史 task grant 行 `{scope:'task', board, grant:{...}}`（旧版写入形态），`ensureLoaded()` 对每一行按 `HumanGateRequest` 全字段校验，任一不符即 throw → 读路径 500。
   - 处置：本轮回归首次复现并定位；并行「HumanGate store 合并统一」批（`f6dc39bf6`，已合入 main）实现装载升级（信封行、grant 原样内嵌）+ 归一化回写 + 未知形状 fail-closed，并带 `human-gate.test.ts` 四项守门。本批**不重复实现**，以活体（legacy store 副本 → 200/3 条）与全量测试复核；避免双迁移实现漂移。

2. **Matrix 房间画布 store 键名崩溃（并行批已落地；本轮回归复核，不重复实现）**
   - 现象：客户端 `typecheck:client` 棘轮新增 1 个错误（19 > 基线 18）：`Property 'rooms' does not exist on Store<"matrix-room">`；对应群时间线间歇不挂载的 TypeError 第二根源。
   - 根因：矩阵 room store 的状态键是 `roomList` / computed `sortedRooms`，画布兜底 watcher 写成 `roomStore.rooms.length`（不存在的键，setup 期取 `.length` 抛 TypeError，后续 watcher 不注册 → 时间线不挂载）。
   - 处置：并行「日常工作台回归修复批」（`49abc3524`，已合入 main）已改绑 `sortedRooms` 并新增 `room-canvas-watcher-sources.test.ts` 守门。本批以客户端棘轮（19→18）与全量测试复核，不重复改。

3. **架构规则 004 并发配额假执行接线**（A 类引擎 + 新 B 类补丁）
   - 现象：`RULE_CONCURRENT_QUOTA` 在 assign 链真实调用（patch 362），但 `currentRunning` 硬编码 0 → 规则永远 CONTINUE，声称的「同一负责人并发 ≤3」从未生效；且规则读的是 `task.assignee`（派发前旧值），不是本次派发目标 profile。
   - 修复：`RuleCheckOptions` 增加 `targetAssignee?: string` 与 `getRunningTaskCount?: (assignee) => Promise<number | null>`；规则 004 用目标负责人查询，缺查询通道时如实跳过（不假装执行），查询失败 fail-soft 不误拦；新补丁（712；原拟 710，主并批已占用 710-client-group-chat-rooms-shape-guard）在 `assignTask` 调用点注入 `targetAssignee: profile` 与基于 `listTasks({board,status:'running',assignee})` 的计数，保持「custom 树禁 import upstream」边界。

4. **Git 冲突 SOS 动作残桩 fail-loud**（A 类，`custom/server/loop/engine/git-sos.ts`）
   - 现象：`executeSosAction()` 三个动作分支只 `console.log`（TODO 残桩），任何调用方都会误以为已执行 merge --abort/rollback/升级通知；当前无调用方，但导出面是假能力。
   - 修复：实际执行未实现的动作显式抛错（`code='sos_action_not_implemented'`），只读 advisory（`sosAdvisoryForConflicts`，IDE `/api/ide/git/status` 消费）保持不变；补测试锁定「不静默成功」。
   - 已知缺口（不在本批扩张）：`/api/ide/git/status` 返回的 `sos` advisory 目前无客户端消费方（Git 面板只按文件 kind 标 conflicted），UI 展示与人工确认动作入口留待产品排期；本批不新增自动 git 操作。

5. **diagram-export 全量并行负载超时**（生产可配置 + 测试放宽，`custom/server/diagram/export-png.ts` / `custom/server/diagram/__tests__/diagram-export.test.ts`）
   - 现象：全量 7013 用例单跑 1 红：`runnerError: 导出超时（60000ms）`；单文件重跑 5/5 绿（11.7s）。
   - 根因：产品默认 60s 超时 vs 测试自身 90s 预算；全量并行（970 文件）时 Chromium 启动/渲染被放大到 60s+，测试与产品超时口径不一致。
   - 修复：`exportTimeoutMs()` 支持 `DIAGRAM_EXPORT_TIMEOUT_MS` 覆盖（默认仍 60s，运维可调）；测试 `beforeAll` 设 120s（vitest 90s 单测预算仍兜底），断言不改（真实 Playwright 导出仍必须落盘）。

6. **回归探针鉴权与等待健壮性**（`scripts/regression/`）
   - `walk-routes.mjs` 支持 `WALK_TOKEN`（已铸 super_admin JWT 直注 localStorage），优先级高于 `WALK_LOGIN`；新增每页「错误态文案」启发式扫描（加载失败/不可用/未授权等记 WARN，供人工分诊，不冒充缺陷）。
   - `walk-writes.mjs` 支持 `API_TOKEN` 直给 JWT。
   - `ide-workspace-verify.mjs` 深链断言由固定 8/12s 睡眠改为条件等待（轮询 store 至 taskWorkspace 就绪，上限 25s；仍然固定预算判失败），消除冷启动/负载下的假红；失败时输出完整 store 快照。
   - `harness.mjs` 支持 `WALK_VIDEO_DIR`：设置后整段走查由 Playwright 实拍录屏（webm，1560×940），用于全路由走查的录屏留证（产物落仓外）。
   - `walk-routes.mjs` 支持 `WALK_SETTLE_MS`：每页渲染后的额外停留（默认 150ms，录屏/慢速走查用 600-800ms），避免亚秒级连跳打断 WebSocket 握手产生 console 噪声。

7. **IDE 简报上下文对 docs/ 的无条件探测（404 噪声）**（A 类，`custom/client/ide/views/IdeShell.vue` + `custom/client/ide/utils/briefing-context.ts`）
   - 现象：修复后全路由走查在 `/app/eval`、`/desktop-pet` 捕获 `GET /api/studio/files/list?path=docs&root=…/coding-agent/workspace/default/global → 404`。
   - 根因：`loadBriefingContextFiles` 固定扫 `['', 'docs']`；没有 docs/ 的工作区（空 global 工作区）每次探测必 404，失败被 catch 静默为空列表（请求噪声 + 延迟归因到后续页面）。
   - 修复：先列根目录，`briefingRoots()` 只在根里真有 `docs` 目录时才二次探 docs；纯函数 + 单测。

8. **kanban `?new=1` 收窄提示 i18n 键缺漏（main 既存门禁红，本批修复）**（B 类补丁 711 + 调用点 A 类）
   - 现象：全量 `kanban-i18n-coverage` 红：zh/en 词表缺 `kanban.message.newLinkBoardTightened`（并行「日常工作台回归」批在 `SwarmKanbanView` 引入 `?new=1` 自动收窄提示时未补词条）；中文界面会静默回退内联英文兜底。
   - 根因：新增 `t('kanban.message.newLinkBoardTightened')` 引用未走 locale 追加通道（patch 324/325 同款流程）。
   - 修复：`patches/711-client-kanban-newlink-i18n.patch` 补 zh/en 词条（`{board}` 插值）；`SwarmKanbanView` 调用补 named 参数 `{ board: target }`，保留目标板名；门禁测试转绿。

9. **simulation-node-executors 幂等断言的 wall-clock 假红**（测试侧，`custom/server/graph/__tests__/simulation-node-executors.test.ts`）
   - 现象：全量负载下 `expect(r2).toEqual(r1)` 偶发 1ms `ts` 差异红（本轮实测：一次全量红 1793408136806 vs 1793408136807，单跑绿）。
   - 根因：深比较把非确定的 wall-clock `ts` 纳入断言；同 threadId+node 的幂等语义与时间戳无关。
   - 修复：`withoutTs()` 去掉 `ts` 后比较语义载荷（channel/node/task 形状不变），断言仍能抓幂等破坏。

10. **A.1「角色/排除」表分隔行缺失（并行合并落表后门禁红）**（文档修复）
   - 现象：主树 `docs-ssot-guard` 3 例红（`第 424 行分隔行单元格不符合 :?-{3,}:?`）；原因是并行批合并 A.1 时角色表表头后丢了 Markdown 分隔行。
   - 修复：补 `| --- | --- | --- |` 分隔行；A.1 实计数按守门算法对齐 413（含 E2 探针微批 spec）；`docs-ssot-guard` + `patches-series-guard` 8/8 转绿。

11. **IDE 自检把「文件列表 403」记成失败（挂账项收口）**（A 类，`custom/client/ide/utils/selfCheck.ts` + `custom/client/ide/i18n.ts`）
   - 现象：主树 `ide-smoke` 的自检汇总出现「1 失败」：`文件列表 API HTTP 403`；该会话不是 super_admin，根目录列表被服务端权限闸门拒绝。
   - 根因：自检 `api()` 的 `warnStatuses` 默认只有 `[503, 401]`，403 落到 fail；但「根目录需 super_admin、任务工作区走只读树」是既定权限边界，不是产品缺陷；自检把合法边界报成红色失败会误导用户。
   - 修复：文件列表检查把 `[401, 403, 503]` 记 warn，并新增双语 `permissionLimited` 说明（`权限受限（根目录列表需 super_admin；任务工作区走只读树）`）；新增测试「403 记 warn、汇总 fail=0」。

配套测试：
- `custom/server/loop/engine/__tests__/architecture-quota.test.ts`（新/扩）：有通道且超配额 → BLOCK；无通道 → 跳过不拦；查询失败 → 不误拦；targetAssignee 优先于 task.assignee。
- `custom/server/loop/engine/__tests__/git-sos.test.ts`（扩）：未实现动作抛错、advisory 语义不变。
- `custom/client/ide/__tests__/briefing-context-roots.test.ts`（新）：根目录无 docs / docs 是文件 / 没有条目时只扫根，不再发必 404 请求。
- `custom/client/ide/__tests__/briefing-context-loader.test.ts`（更新夹具）：根目录需带 docs 目录条目，装载器才二次探测（与生产一致）。
- `custom/client/ide/__tests__/self-check.test.ts`（扩）：文件列表 403 记 warn 并给出权限说明，汇总 fail=0。
- HumanGate legacy 迁移与矩阵画布键名由并行批的 `human-gate.test.ts` / `room-canvas-watcher-sources.test.ts` 守门，本批复核不重复补测。

## 决策记录

- **并行已修缺陷不重复实现**：HumanGate store 与矩阵画布两处在回归复现/定位时已分别由并行批落地修复（`f6dc39bf6` / `49abc3524`）；本批以复核与守门收口（客户端棘轮、目标测试、活体副本），避免双实现/双迁移漂移——修一次，不留第二套。
- **配额规则「跳过即跳过」而非硬编码放行**：缺查询通道时返回 CONTINUE 并在 message 标注跳过，与规则 001 的既有语义一致；不把「没查」伪装成「没超」。查询失败 fail-soft（不误拦派发），因为配额是治理约束不是安全边界。
- **SOS 动作 fail-loud 而非实现自动 git 操作**：`merge --abort`/回滚是破坏性动作，读路径只出 advisory；在无人确认的链路上自动执行风险高于收益，故把残桩改成显式未实现错误，保留后续接线空间。
- **diagram 超时只改测试不改产品默认**：60s 对本地 SVG 渲染是合理产品预算；全量并行的 15x 放大量属测试环境，测试预算内放宽即可，不牺牲产品超时保护。
- **探针条件等待**：固定睡眠在冷启动下产生假红（本轮首跑 5/11、复跑 11/11 实锤）；条件等待 + 上限判失败保留严格性，去掉环境噪声。
- **docs 探测先列根再决定**：404 虽被 catch 吞掉，但浏览器仍记录失败请求，异步请求还会延迟归因到后续页面；修在发起端（根目录真有 docs 才二次探）比服务端把缺失目录改成 200 空列表更符合 REST 语义。

## 验证

- 目标单测：本批新增/扩展的 `architecture-quota.test.ts`、`git-sos.test.ts`、`briefing-context-roots.test.ts`、`briefing-context-loader.test.ts`、`self-check.test.ts` 与受影响面全绿（29 文件/209 例；自检 8 例含 403→warn 新增例）；`kanban-i18n-coverage.test.ts` 1/1、`custom/client/kanban` 14 文件/64 例全绿；并行批的 `human-gate.test.ts`、`room-canvas-watcher-sources.test.ts` 同步全绿。
- 客户端棘轮：`npm run typecheck:client:ratchet` 18 ≤ 基线 18（0 新增）。
- 全量：worktree（`bd99cdbed` 基线 + 本批）`npm test` 7038 例 7027 过 / 11 跳过 / **0 失败**（含 `kanban-i18n-coverage` 与 `simulation-node-executors` 转绿）；`npm run typecheck:harness` 0 错；`typecheck:client:ratchet` 18 ≤ 基线 18。
- 补丁链：worktree 内 `npm run clean && npm run inject` 全 series（001-712）重放通过（710 主并批 + 711/712 本批依序应用）；`patches-series-guard` 绿。
- 活体：
  - `GET /api/approvals/human-gate`（`HUMAN_GATE_STORE` 指向 legacy 副本）→ 200 且返回 3 条升级后的记录（对并行实现 `f6dc39bf6` 的复核，非本批代码）。
  - `walk-routes` 修复树全量 184 项：182 过 / 2 缺陷（均为 IDE 简报 docs 探测 404）；docs 探测门控修复后同过滤集复跑 0 缺陷。
  - `walk-writes` 16/16；`ide-smoke` 11/11（自检 0 失败）；`ide-workspace-verify` 11/11。
  - 矩阵群时间线：**未用真实 Matrix 凭据验证**（走查为「未认证」WARN），仅以客户端棘轮、并行批守门测试与路由渲染复核——如实标注，不冒充实机通过。
- 构建：`npm run build` exit 0 + postbuild verify-dist 通过。
- 实拍录屏（真实浏览器 Playwright 录屏，非截图拼接；产物在仓外 `/Users/cuishi/lab/aistudio-regression-evidence-20261031/`）：
  - `01-curated-regression-demo.mp4`：带步骤字幕的端到端演示——日常工作台、看板 `?new=1` 提示（711 词条生效）、审批 4/risk 页（human-gate 200）、IDE 任务深链与文件树、IDE 自检（403 权限告警态）、评测/观测页；
  - `02-full-route-walk.mp4`：`walk-routes` 全量 155 个路由状态（118 路由 + 37 阶段页签）实拍走查，逐页停留并输出台账；
  - `03-write-flow-probe.mp4`：写流回路（建板→建卡→状态迁移→running fail-loud→删卡→归档板）实拍；
  - 视频时长/文件大小与录制时刻随产物清单同目录 `manifest.md` 记录。

## 设计文档影响

DESIGN_SYNC: none——本轮为缺陷修复与测试健壮性：HumanGate store 兼容层不改变审批裁决语义（T1/T2/T3 判定、grant 版本绑定、审计写入均不动）；配额规则从「假执行」变为「有通道才执行」，属实现与声明对齐；矩阵画布键名修正无契约变化；SOS advisory 面不变。未触及整合正本与数字总账的契约/阈值/口径。
