# 驾驶舱技术债清理 · 批次 2：#9 图→时序切源 设计

**日期**：2026-06-22
**状态**：待评审
**适用范围**：`overlay/custom/client/cockpit/`（store + 一个组件 + fixtures + 测试）
**前置**：批次 0（测试基建）、批次 1（代码质量）已完成；`npm test` = 13 passed / 101 passed。

---

## 1. 问题

审计 §🟠 #9：**点协作图拓扑节点 → 中栏时序流应切换为该事项的事件**，当前断裂。

### 现状（已核查代码）

- `CockpitGraphNode.onClick`（组件:19-22）调 `toggleGraphNode`（高亮选中）+ `focusOnGraphNodeForTimeline(nodeId)`。
- `focusOnGraphNodeForTimeline`（store:418-421）只设 `_timelineSourceLabel.value = nodeId`——**该字段无任何组件读取**（死字段）。
- 时序流 `CockpitTimeline` 始终用 `store.recentEventsForSelectedTask`，**只按 taskId 过滤**，与图节点无关。
- `CockpitEvent` 无 `nodeIds` 字段，节点与事件无关联映射。

结果：点节点，时序流纹丝不动。设计 §5.4 要求的"切换为该事项事件"未实现。

## 2. 方案（已与用户确认）

**方案 A：节点作为时序源筛选器** + **toggle 语义（取消选中则回任务级）**。

- 给 `CockpitEvent` 加可选字段 `nodeIds?: string[]`（事件涉及的节点 id）。
- 新增 store state `focusedGraphNodeId: string | null`（当前作为时序源的节点；null=任务级）。
- `focusOnGraphNodeForTimeline(nodeId)` 改为 toggle：若该节点已聚焦则取消（null），否则设为该节点。
- 新增 getter `eventsForTimeline`：`focusedGraphNodeId` 为 null → 返回 `eventsForSelectedTask`（任务级）；非 null → 过滤 `eventsForSelectedTask` 里 `nodeIds?.includes(focusedGraphNodeId)` 的事件。
- `recentEventsForTimeline(threshold)`：基于 `eventsForTimeline` 折叠（取代当前 `recentEventsForSelectedTask`）。
- `CockpitTimeline` 标题改为：显示来源标签——任务级显示任务标题（现状），节点级显示节点 label + "· 时序源"提示。
- `selectedTaskId` 变化时清空 `focusedGraphNodeId`（切任务回任务级，避免残留）。
- 种子事件补 `nodeIds`（见 §4）。

### 非目标
- 不改 `CockpitGraphNode` 的选中高亮逻辑（`toggleGraphNode` 独立保留——它管多选高亮；`focusOnGraphNodeForTimeline` 单独管时序源）。
- 不实现 #4/#6/#7/#8/#12（其它批次）。
- 不接 kanban API（种子补 nodeIds 即可）。

## 3. 设计细节

### 3.1 数据模型

`CockpitEvent` 加可选字段：
```ts
export interface CockpitEvent {
  id: string
  taskId: string
  actor: string
  kind: 'A2H' | 'A2A'
  what: string
  when: string
  pending: boolean
  ts: number
  nodeIds?: string[]  // 新增：事件涉及的图节点 id（用于节点级时序源筛选）
}
```
可选字段，向后兼容（现有测试和种子不填则不参与节点筛选）。

### 3.2 store 改动

```ts
// 新增 state（P2 段，紧邻 selectedTimelineNodeId）
const focusedGraphNodeId = ref<string | null>(null)

// 新增 getter：时序流真正使用的事件源
const eventsForTimeline = computed(() => {
  const taskEvents = eventsForSelectedTask.value
  if (!focusedGraphNodeId.value) return taskEvents
  return taskEvents.filter((e) => (e.nodeIds ?? []).includes(focusedGraphNodeId.value))
})

// 新增：基于 eventsForTimeline 的折叠版本（取代 recentEventsForSelectedTask 的用法）
function recentEventsForTimeline(threshold: number) {
  const all = eventsForTimeline.value
  if (all.length <= threshold) return { visible: all, folded: [] as CockpitEvent[] }
  return { visible: all.slice(all.length - threshold), folded: all.slice(0, all.length - threshold) }
}

// 重写 focusOnGraphNodeForTimeline（toggle 语义）
function focusOnGraphNodeForTimeline(nodeId: string) {
  focusedGraphNodeId.value = focusedGraphNodeId.value === nodeId ? null : nodeId
}
```

`selectedTaskId` watch：在已有 `selectTask` 里清空 `focusedGraphNodeId = null`（切任务回任务级）。实际上 `selectTask` 已重置 `archivedMode`，同一处加 `focusedGraphNodeId.value = null`。

**清理死字段**：`_timelineSourceLabel` 被本方案取代，删除它（及其 return 导出）。它是 #9 断裂的根源——设了没人读，本批次正好让它真正生效（改为 `focusedGraphNodeId` + 标题消费）。

### 3.3 CockpitTimeline 改动

- `recent` 从 `recentEventsForSelectedTask(THRESHOLD)` 改为 `recentEventsForTimeline(THRESHOLD)`。
- 标题区：任务级显示 `t('cockpit.timeline')`；节点级显示节点 label + 来源提示。
  - 需查节点 label：`store.topologyForSelectedTask.nodes.find(n => n.id === focusedGraphNodeId)?.label`。
  - 加一个 computed `timelineSourceLabel`。

### 3.4 fixtures/seed.ts 改动

种子事件补 `nodeIds`（task '1' 的节点：n1=refresh.ts/file/focus，n2=auth.spec/test）：
- e1（提交 PR #142，张三）：nodeIds: ['n1']（提交涉及 refresh.ts 改动）
- e2（自评：结构良好，review-agent）：nodeIds: ['n1', 'n2']（评审看了实现和测试）
- e3（2 处边界未覆盖→委派 qa，review-agent）：nodeIds: ['n2']（边界缺口在 auth.spec）
- e4（用例写完→待审，qa-agent）：nodeIds: ['n2']（qa 补的是 auth.spec 用例）

## 4. 验证

1. `npm test` 保持全绿（现有 101 断言不回归）+ **新增 3-4 个断言**覆盖：
   - `focusOnGraphNodeForTimeline('n1')` 后 `eventsForTimeline` 只含 e1/e2（nodeIds 含 n1）。
   - 再次 `focusOnGraphNodeForTimeline('n1')`（toggle）→ `focusedGraphNodeId` 回 null → `eventsForTimeline` 恢复任务级全部 4 个事件。
   - `selectTask('2')` 后 `focusedGraphNodeId` 被清空（null）。
   - 未设 `nodeIds` 的事件在节点级时序流中不显示。
2. 手测（可选）：点 refresh.ts 节点，时序流标题变 + 只显示 e1/e2；再点取消，回 4 个事件；切任务，回任务级。

## 5. 风险与回退

| 风险 | 应对 |
|------|------|
| 删 `_timelineSourceLabel` 破坏别处引用 | 已 grep 确认只有 store 自己设，无组件读；删除安全 |
| 新增字段 `nodeIds` 影响现有测试断言 | 可选字段，现有断言不涉及它；仅新增断言用 |
| 切任务未清 focusedGraphNodeId 导致残留 | `selectTask` 显式置 null，并有断言覆盖 |

**回退**：`git revert` 本批次 commit。

## 6. 开放问题

无。方案 A + toggle 语义已确认。
