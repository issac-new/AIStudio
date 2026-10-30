# kanban 详情链加固批：sqlite 直读快道（709）＋CLI 瞬态重试＋抽屉乐观同步

日期：2026-10-31 ｜ 轮次：IDE 工作区全功能回归未了项清偿（用户令「完成所有未做」） ｜ 类型：fix（性能根治＋瞬态韧性＋呈现即时性）

## 变更

1. `custom/server/services/hermes/kanban-task-fast.ts`（新增，A 类）：任务详情 sqlite 直读快道——按上游 CLI `kanban show --json` 的拼装逻辑 1:1 复刻七键输出（task 28 字段/latest_summary/parents/children/comments/events/runs），映射源锚点全部落在钉版 0.22.5 源码行号（kanban.py:515-522 / kanban_output.py:16-31,85 / kanban_db.py:40,804,867,929,1802,1876,2007,4395,4431，见文件头注）。关键语义：skills 恒数组（None→[]）、raci dict|null、epoch int|null、`_lossy_text` 透传（整数保持整数，worker_pid 不 String 化）、payload/metadata JSON 解析、events 按 created_at,id 升序、runs 按 started_at,id 升序、latest_summary 取 COALESCE(ended_at,started_at) DESC 最新非空。fail-soft 契约：板号缺省（undefined，CLI 跨板搜索语义不廉价复刻）/板库缺失/任务不存在/任何异常 → null 回落 CLI。
2. `patches/709-server-kanban-task-detail-fast-path.patch`（B 类，series 登记 709）：`kanban-service.ts getTask` 三段改造——①快道前置（板库命中毫秒级返回；读的是与 CLI 同一存储的只读快照，竞态窗口与 CLI spawn 窗口同级且 kanbanReadCache TTL 20s 本就容忍）；②comment/event 归一化抽 `normalizeTaskDetail` 共享出口（快道与 CLI 同形状）；③CLI 瞬态失败（exec 队列超时/ETIMEDOUT/ECONNRESET/spawn 抖动）重试一次再定性——IDE 回归走查实锤首载并发风暴下偶发 500 即看板抽屉「加载任务失败」（4 次 2 次）。
3. `custom/client/kanban/components/KanbanTaskDrawer.vue`（A 类，两修）：
   - **装载 watch 补 immediate（真根因）**：抽屉装载 watch（`[props.show, props.taskId]`）非 immediate——板页在抽屉组件挂载前已恢复选中任务时，watch 错过翻转、`loadDetail` 从不执行，抽屉停在 NEmpty「加载任务失败」兜底（loading=false/detail=null 的假失败；走查 4 开 2 败交替复现，API 实况全 200）。补 `{ immediate: true }` 后 4/4 连开全绿。
   - **executePatch 乐观同步**：PATCH 响应的 task 即回填 `detail`，`loadDetail` 回包再补全；治「验收通过后状态标签滞后肉眼可见」。
4. `scripts/regression/ide-workspace-verify.mjs`（新增）：IDE 回归走查探针沉淀（未做项 B）——双断言链：任务深链→简报/工作区切根/文件树锚定（三轮一致性）＋Git 页签可见未提交变更；super_admin token 经 `IDE_VERIFY_TOKEN` 注入（默认走落地自动登录）。配套 `scripts/regression/ide-workspace-verify.test.ts` 登记路由清单守门（scripts 测试面）。

配套测试：`custom/server/services/hermes/__tests__/kanban-task-fast.test.ts`（七场景：命中形状/skills-raci 边界/排序与 JSON 解析/runs 投影/fail-soft 三态/default 板双布局）。

## 决策记录

- **快道而非只加缓存**：service 层 TTL 缓存（ListTasksCache 同款）只能治「反复拉」，治不了冷启动 4-6s（每卡每 TTL 窗口首拉仍 CLI spawn）与 exec 队列超时（缓存击穿并发仍打满队列）。直读治本：板库命中毫秒级、零子进程。形状漂移风险以 1:1 源码行号锚点复刻＋七场景守门测试对冲；任何异常回落 CLI（fail-soft 不造假）。
- **板号缺省不查快道**：CLI 的无板查询是跨板搜索（resolveTaskBoard 已有 controller 层兜），快道仅在显式板号（含 default）时命中；缺省交回 CLI＋getTaskResilient 跨板兜——不复制搜索语义，零行为漂移。
- **重试只认瞬态签名**：queue timeout/ETIMEDOUT/ECONNRESET/spawn 正则命中才重试一次；code/status=1（任务不存在语义）与其它错误保持原路径（null/500），不吞真错不放大爆炸半径。
- **抽屉两修分层**：偶发「加载任务失败」的真根因是装载 watch 非 immediate 的挂载竞态（API 全 200 也失败；快道与重试治的是另一半——CLI 冷链慢与队列超时的真失败），两层互补不互代；标签滞后用乐观同步（PATCH 响应即权威新态）而非等 loadDetail 回包。
- **「加载任务失败」文案复用警示**：NEmpty 兜底与失败态共用 `kanban.message.loadFailed` 文案，关闭态抽屉 DOM 亦残留该文本——走查判据须以「任务标题可见」为准，不得按该文案断失败（本轮探针曾误判三例）。
- **验证载体**：探针沉淀为仓内永久资产（scripts/regression/ 惯例位），本轮 /tmp 一次性探针的「三轮一致性」判据固化进 `ide-workspace-verify.mjs`。

## 验证

- 单测：`npx vitest run custom/server/services/hermes/__tests__/kanban-task-fast.test.ts` 7/7；`scripts/regression/ide-workspace-verify.test.ts` 守门过。
- 补丁：停服态 `npm run clean && npm run inject` 全序列（001-709）重放通过；`patches-series-guard`/`l2-kit-parity` 守门过。
- 活体：后端换装 709 后 `/api/hermes/kanban/t_5233eb3a?board=swarm` 冷缓存 44ms→热 4ms（修前 CLI 4-6s）；快道 vs 原始 CLI JSON 全量对照仅差服务端归一化合成字段（events id/task_id，两路一致）；抽屉 immediate 修复后 4/4 连开装载成功（修前 4 开 2 败交替）。
- 抽屉改动回归：`npx vitest run custom/client/kanban/`（既有面零新红）。

## 设计文档影响

DESIGN_SYNC: none——详情读链性能加固与呈现即时性，未触及整合正本与数字总账的契约、阈值或口径；「快道=CLI 同形状 1:1 复刻＋异常回落」契约与「重试只认瞬态签名」边界以本 spec 决策记录为事实源。
