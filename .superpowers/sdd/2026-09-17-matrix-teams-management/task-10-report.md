# Task 10 报告：轮询回执上报 + DispatchList UI + P3 收口

日期：2026-09-17
分支：`feat/matrix-teams-p3-dispatch-list`（保留未删）
Merge commit：`dc75f5d`（main）

## 交付内容

1. **pollAndReport**（`stores/task-dispatch.ts`）：遍历 kv 外派索引 → `getTask(localTaskId)` → `mapKanbanStatusToReceipt` 与 `lastStatus` 比较，变化才 `sendReceipt` 并回写 kv（带 `lastSyncedAt`）；单条失败静默 `continue`，下轮重试；发送失败不回写 kv（下轮重发）。
2. **DispatchList.vue**：leader 表单（`dispatch-title-input`/`dispatch-body-input`/`dispatch-target-select`/`dispatch-profile-select`/`dispatch-send`）+ assign∪receipt 聚合列表（`dispatch-item-<前6位>`、状态徽标 `dispatch-status`）；`onMounted` 挂监听 + 30s 轮询定时器，`onUnmounted` 清理。挂载到 `TeamsManagePanel.vue` 右栏（`tmp__dispatch` section）。
3. **i18n patch 292/293**：`teams.dispatch.*` 十三键（title/new/titleField/body/target/profile/send/empty/status.created|running|done|failed/issuedBy）zh/en 成对，插入 288/289 建立的 teams 命名空间（290/291 之后）。

## Task 8/9 评审遗留（3 项全做）

1. **孤儿 receipt 不丢**：`mergeReceipt` 遇未知 taskId 先暂存 `pendingReceipts`（plain Map，无视图消费方），`upsertAssign` 补配并清理。新增用例「receipt 先 assign 后」断言最终合并。
2. **priority 透传**：`receiveAssign` 建卡携带 priority。协议层为 string、kanban `KanbanCreateRequest.priority` 为 number，做有限数值强转（`Number.isFinite(Number(p))`），非数值/缺省不携带（不硬编 0）。新增用例断言 `'3'→3`、`'high'→undefined`、缺省→undefined。
3. **unwrapRef 收敛**：新 `utils.ts` 导出 `unwrapRef`；task-dispatch 与 team-registry 两处统一调用。team-registry 旧 `?.value ?? raw` 的 `{value:null}` 误判隐患随之消除（`'value' in raw` 判定含 null 语义）。

## 与简报的偏差（均有锚点理由）

- **测试 mock registry 用 reactive+ref 包装**（简报为裸 `{value}` 对象）：setup.ts 全局 mock `useI18n`（t 返回键名），且裸对象无响应性，「切 isLeader 表单显隐」断言无法成立。组件断言改为键名断言（`teams.dispatch.status.created`/`teams.dispatch.empty`），意图不变（验证徽标渲染与状态兜底映射）。
- **发送按钮 `type="button" @click`**（简报为 `type="submit"`）：jsdom 下 submit 按钮 click 不触发 form submit（实测 sendAssignment 0 调用），form 保留 `@submit.prevent` 兼容回车。
- **teams-panel.test.ts mock client 补 `on/off`**：Task 10 接线后 DispatchList `onMounted → ensureListening()` 需要 SDK 监听面（原 mock 为 `{}`），与 duty-panel 同款 roomStore mock 同理。

## 门禁结果（overlay 根）

| 门禁 | 结果 |
|---|---|
| a. `npm test` 全量 | 169 文件 / 1713 用例全绿 |
| b. `clean && inject && verify` | 237 patch 全 applied，verify exit 0（hermes-studio/element-web/hermes-agent 无本地 commit；WARN 为注入态固有报告） |
| c. 注入态 `npm test` 再跑 | 1713 全绿 |
| d. `npm run build:full` | 通过（client+server 全链） |
| e. upstream i18n coverage | `tests/client/i18n-coverage.test.ts` 18/18 |
| f. 端到端双成员冒烟 | **未执行**：需人工双端（ncwk-sim 或 dev），留待用户验收 |

## 过程事故与恢复（如实记录）

五步法第 2 步时，`git diff` 误对 HEAD 取差（混入全部历史 patch），且中途 `git checkout --` 两个 locale 文件导致 clean 逆放 291 失败、注入态半损坏。恢复：upstream `git checkout -- . && git clean -fd` 全量重置为 pristine + 删除 `.overlay-injected.json`，再从零 `npm run inject` 重建注入态，随后按「before=注入态 / after=注入态+dispatch 块」重新生成隔离 patch。最终 292/293 在完整 `clean && inject` 序上验证通过。事故未污染 upstream commit 历史（verify 确认）。

## Concerns

1. **端到端冒烟未验**（门禁 f）：leader 填表→成员建卡→轮询回执→状态翻 Running/Done 的链路只有单测守门，双成员真实联调需人工执行。
2. **priority 语义**：协议层 `AssignContent.priority: string` 与 kanban 数字优先级（1/2/3）存在类型缝，当前按数值字符串强转；若 leader 未来想传 `'high'` 等标签，需在协议或 UI 层先做标签→数字映射。
3. **30s 轮询粒度**：简报定稿值；成员侧状态变化到 leader 侧可见最坏 30s+ 延迟，spec 已接受。
