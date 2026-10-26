# 驾驶舱技术债清理 · 批次 2：#9 图→时序切源 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点协作图节点 → 中栏时序流切换为该节点相关事件（toggle：取消则回任务级），真正打通 #9 联动；测试 101 → 105（+4 新断言）全绿。

**Architecture:** 方案 A——给 CockpitEvent 加可选 `nodeIds?`，store 新增 `focusedGraphNodeId` + `eventsForTimeline` getter，CockpitTimeline 消费它并显示来源标签；删死字段 `_timelineSourceLabel`。

**Spec:** `docs/superpowers/specs/2026-06-22-cockpit-techdebt-batch2-graph-to-timeline-design.md`

---

## 前置准备

**分支：** overlay 基于 main 建 `fix/cockpit-techdebt-batch2-graph-timeline`。**起点核验**：`git rev-parse HEAD` == `git rev-parse main` 才建（批次 0 教训）。

**基线：** `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test` = 13 passed / 101 passed。

**边界：** 不动 `toggleGraphNode`（多选高亮独立）；不改其它批次项；不碰 upstream。

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `cockpit/store/cockpit.ts` | 改 | CockpitEvent 加 nodeIds?；+ focusedGraphNodeId/eventsForTimeline/recentEventsForTimeline；重写 focusOnGraphNodeForTimeline；selectTask 清 focused；删 _timelineSourceLabel |
| `cockpit/components/CockpitTimeline.vue` | 改 | recent 改用 recentEventsForTimeline；标题显示来源标签 |
| `cockpit/fixtures/seed.ts` | 改 | 种子事件 e1-e4 补 nodeIds |
| `cockpit/__tests__/cockpit-store.test.ts` | 改 | +4 断言（节点筛选/toggle/切任务清空/无nodeIds不显示） |

---

### Task 1: 建分支 + 基线

- [ ] **Step 1: 起点核验**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git branch --show-current                          # 期望 main
[ "$(git rev-parse HEAD)" = "$(git rev-parse main)" ] && echo OK || echo MISMATCH
```
Expected: `main` + `OK`。不等则 `git checkout main` 再核。

- [ ] **Step 2: 建分支 + 基线测试**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout -b fix/cockpit-techdebt-batch2-graph-timeline
npm test 2>&1 | tail -3                            # 期望 13 passed / 101 passed
```
Expected: 新分支 + 基线绿。不绿则停止。

- [ ] **Step 3: 不提交**

---

### Task 2: store 改动（数据模型 + getter + 方法）

**Files:** Modify `cockpit/store/cockpit.ts`

- [ ] **Step 1: CockpitEvent 加 nodeIds 字段**

定位 `export interface CockpitEvent { ... }`（约第 37-46 行），在 `ts: number` 后加：

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
  /** 事件涉及的图节点 id（节点级时序源筛选用；不填则该事件不在节点级时序流显示） */
  nodeIds?: string[]
}
```

- [ ] **Step 2: 新增 focusedGraphNodeId state**

在 P2 state 段（`const selectedTimelineNodeId = ref<string | null>(null)` 紧邻处，约第 203 行后）加：

```ts
  /** 当前作为时序源的图节点（null=任务级时序流）。点节点 toggle，切任务清空。 */
  const focusedGraphNodeId = ref<string | null>(null)
```

- [ ] **Step 3: 新增 eventsForTimeline getter**

在 `eventsForSelectedTask` computed 之后（约第 222 行后）加：

```ts
  /** 时序流真正使用的事件源：无 focusedGraphNodeId 时=任务级；有则按节点筛选。 */
  const eventsForTimeline = computed(() => {
    const taskEvents = eventsForSelectedTask.value
    if (!focusedGraphNodeId.value) return taskEvents
    return taskEvents.filter((e) => (e.nodeIds ?? []).includes(focusedGraphNodeId.value))
  })
```

- [ ] **Step 4: 新增 recentEventsForTimeline 方法**

在 `recentEventsForSelectedTask` 函数之后（约第 245 行后）加：

```ts
  /** 基于 eventsForTimeline 的折叠版本（取代 recentEventsForSelectedTask 的时序流用法）。 */
  function recentEventsForTimeline(threshold: number) {
    const all = eventsForTimeline.value
    if (all.length <= threshold) return { visible: all, folded: [] as CockpitEvent[] }
    return {
      visible: all.slice(all.length - threshold),
      folded: all.slice(0, all.length - threshold),
    }
  }
```

- [ ] **Step 5: 重写 focusOnGraphNodeForTimeline（toggle）**

定位 `function focusOnGraphNodeForTimeline(nodeId: string) { ... }`（约第 418-421 行），整段替换为：

```ts
  function focusOnGraphNodeForTimeline(nodeId: string) {
    // toggle：点已聚焦节点→取消（回任务级）；点新节点→设为时序源。
    focusedGraphNodeId.value = focusedGraphNodeId.value === nodeId ? null : nodeId
  }
```

- [ ] **Step 6: selectTask 清空 focusedGraphNodeId**

定位 `function selectTask(id: string | null) { ... }`（约第 183-187 行），在 `archivedMode.value = false` 之前加一行：

```ts
  function selectTask(id: string | null) {
    selectedTaskId.value = tasks.value.some((t) => t.id === id) ? id : null
    // 切任务时清空节点级时序源（避免上个任务的节点聚焦残留）
    focusedGraphNodeId.value = null
    // 退出归档只读态（recallHistoryItem 会在调用 selectTask 后重新设置）
    archivedMode.value = false
  }
```

- [ ] **Step 7: 删死字段 _timelineSourceLabel**

定位 `const _timelineSourceLabel = ref<string | null>(null)`（约第 351 行）删除该行。

- [ ] **Step 8: 更新 return 对象**

在 store 的 return 对象里：
- 删除 `_timelineSourceLabel`（约第 484 行）
- 新增 `focusedGraphNodeId, eventsForTimeline, recentEventsForTimeline`（放在 eventsForSelectedTask/recentEventsForSelectedTask 附近，约第 471 行那块）

- [ ] **Step 9: 测试确认无回归（此刻新 getter 未被消费，应仍 101 passed）**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | tail -3
```
Expected: `13 passed / 101 passed`。若失败，多为 return 对象遗漏导出新符号或编辑笔误，据报错修。

- [ ] **Step 10: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/store/cockpit.ts && git commit -m "feat(cockpit): node-level timeline source (#9 graph→timeline)

CockpitGraphNode.onClick called focusOnGraphNodeForTimeline, but it only
set a dead _timelineSourceLabel field nothing reads — timeline stayed
task-scoped. Per design §5.4 'click graph node → timeline switches to
that node's events':

- CockpitEvent gains optional nodeIds?: string[]
- store: focusedGraphNodeId (null=task-level), eventsForTimeline getter
  filters by node when set, recentEventsForTimeline folds it
- focusOnGraphNodeForTimeline now toggles focusedGraphNodeId
- selectTask clears focusedGraphNodeId (no stale focus across tasks)
- delete dead _timelineSourceLabel"
```

---

### Task 3: CockpitTimeline 消费新 getter + 来源标签

**Files:** Modify `cockpit/components/CockpitTimeline.vue`

- [ ] **Step 1: script 改 recent + 加来源标签 computed**

把 `<script setup>` 第 9-16 行（THRESHOLD/expanded/recent/visibleEvents/hasTask）替换为：

```ts
const THRESHOLD = 4
const expanded = ref(false)

const recent = computed(() => store.recentEventsForTimeline(THRESHOLD))
const visibleEvents = computed(() =>
  expanded.value ? [...recent.value.folded, ...recent.value.visible] : recent.value.visible,
)
const hasTask = computed(() => !!store.selectedTask)
// 节点级时序源：显示被聚焦节点的 label 作为来源提示；任务级则不显示。
const timelineSourceLabel = computed(() => {
  const nid = store.focusedGraphNodeId
  if (!nid) return null
  return store.topologyForSelectedTask.nodes.find((n) => n.id === nid)?.label ?? null
})
```

- [ ] **Step 2: 标题区显示来源标签**

把模板里 `<div class="cockpit-timeline__head">` 段（约第 21-23 行）替换为：

```html
    <div class="cockpit-timeline__head">
      <span class="cockpit-timeline__title">{{ t('cockpit.timeline') }}</span>
      <span v-if="timelineSourceLabel" class="cockpit-timeline__source">· {{ timelineSourceLabel }}</span>
    </div>
```

- [ ] **Step 3: 加来源标签样式**

在 `<style scoped lang="scss">` 的 `.cockpit-timeline__title { ... }` 之后加：

```scss
.cockpit-timeline__source { font-size: 10px; color: var(--text-muted); margin-left: 6px; }
```

- [ ] **Step 4: 测试确认无回归**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | tail -3
```
Expected: `13 passed / 101 passed`。

- [ ] **Step 5: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/components/CockpitTimeline.vue && git commit -m "feat(cockpit): timeline shows node source label + uses eventsForTimeline

CockpitTimeline now consumes recentEventsForTimeline (node-scoped when a
graph node is focused) instead of recentEventsForSelectedTask. Header
shows the focused node's label as source ('· refresh.ts') so the
graph→timeline switch is visually visible."
```

---

### Task 4: 种子事件补 nodeIds

**Files:** Modify `cockpit/fixtures/seed.ts`

- [ ] **Step 1: 给 seedEvents 的 e1-e4 加 nodeIds**

定位 `export const seedEvents: CockpitEvent[] = [...]`，把四个事件改为（只加 nodeIds 字段，其余不变）：

```ts
export const seedEvents: CockpitEvent[] = [
  { id: 'e1', taskId: '1', actor: '张三', kind: 'A2H', what: '提交 PR #142', when: '14:32', pending: false, ts: 1732, nodeIds: ['n1'] },
  { id: 'e2', taskId: '1', actor: 'review-agent', kind: 'A2A', what: '自评：结构良好', when: '14:35', pending: false, ts: 1735, nodeIds: ['n1', 'n2'] },
  { id: 'e3', taskId: '1', actor: 'review-agent', kind: 'A2A', what: '2 处边界未覆盖 → 委派 qa', when: '14:36', pending: true, ts: 1736, nodeIds: ['n2'] },
  { id: 'e4', taskId: '1', actor: 'qa-agent', kind: 'A2H', what: '用例写完 → 待审', when: '现在', pending: true, ts: 1740, nodeIds: ['n2'] },
]
```

- [ ] **Step 2: 测试确认无回归**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | tail -3
```
Expected: `13 passed / 101 passed`。

- [ ] **Step 3: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/fixtures/seed.ts && git commit -m "chore(cockpit): tag seed events with nodeIds for node-level timeline

e1 (提交 PR) → n1 (refresh.ts); e2 (自评) → n1+n2 (实现+测试都看);
e3 (边界未覆盖) / e4 (qa 补用例) → n2 (auth.spec). Lets the node-level
timeline filter show meaningful subsets when focusing a graph node."
```

---

### Task 5: 新增 4 个 store 断言

**Files:** Modify `cockpit/__tests__/cockpit-store.test.ts`

- [ ] **Step 1: 在 describe 块末尾（最后一个 `it` 之后、`})` 之前）加 4 个断言**

定位文件末尾的 `it('topology relations carry a2a/a2h labels', ...)` 之后，加：

```ts
  it('focusOnGraphNodeForTimeline filters eventsForTimeline by node', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.events = [
      { id: 'e1', taskId: 't1', actor: 'a', kind: 'A2H', what: 'x', when: '1', pending: false, ts: 1, nodeIds: ['n1'] },
      { id: 'e2', taskId: 't1', actor: 'b', kind: 'A2A', what: 'y', when: '2', pending: false, ts: 2, nodeIds: ['n1', 'n2'] },
      { id: 'e3', taskId: 't1', actor: 'c', kind: 'A2A', what: 'z', when: '3', pending: false, ts: 3, nodeIds: ['n2'] },
      { id: 'e4', taskId: 't1', actor: 'd', kind: 'A2H', what: 'w', when: '4', pending: false, ts: 4 },
    ]
    expect(s.eventsForTimeline.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4'])
    s.focusOnGraphNodeForTimeline('n1')
    expect(s.eventsForTimeline.map((e) => e.id)).toEqual(['e1', 'e2'])
    s.focusOnGraphNodeForTimeline('n2')
    expect(s.eventsForTimeline.map((e) => e.id)).toEqual(['e2', 'e3'])
  })

  it('focusOnGraphNodeForTimeline toggles off → back to task-level events', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.events = [
      { id: 'e1', taskId: 't1', actor: 'a', kind: 'A2H', what: 'x', when: '1', pending: false, ts: 1, nodeIds: ['n1'] },
      { id: 'e2', taskId: 't1', actor: 'b', kind: 'A2A', what: 'y', when: '2', pending: false, ts: 2 },
    ]
    s.focusOnGraphNodeForTimeline('n1')
    expect(s.eventsForTimeline.map((e) => e.id)).toEqual(['e1'])
    s.focusOnGraphNodeForTimeline('n1') // 同一节点再点 → 取消
    expect(s.focusedGraphNodeId).toBeNull()
    expect(s.eventsForTimeline.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('selectTask clears focusedGraphNodeId', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' }), task({ id: 't2' })]
    s.selectTask('t1')
    s.focusOnGraphNodeForTimeline('n1')
    expect(s.focusedGraphNodeId).toBe('n1')
    s.selectTask('t2')
    expect(s.focusedGraphNodeId).toBeNull()
  })

  it('events without nodeIds are excluded from node-level timeline', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.events = [
      { id: 'e1', taskId: 't1', actor: 'a', kind: 'A2H', what: 'x', when: '1', pending: false, ts: 1, nodeIds: ['n1'] },
      { id: 'e2', taskId: 't1', actor: 'b', kind: 'A2A', what: 'y', when: '2', pending: false, ts: 2 }, // 无 nodeIds
    ]
    s.focusOnGraphNodeForTimeline('n1')
    expect(s.eventsForTimeline.map((e) => e.id)).toEqual(['e1'])
  })
```

- [ ] **Step 2: 跑测试，期望 4 个新断言通过（共 105）**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | tail -4
```
Expected: `Test Files 13 passed (13)` / `Tests 105 passed (105)`。若新断言失败，据失败信息修（常见：return 对象没导出 focusedGraphNodeId/eventsForTimeline）。

- [ ] **Step 3: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/__tests__/cockpit-store.test.ts && git commit -m "test(cockpit): cover node-level timeline filter, toggle, task-switch clear"
```

---

### Task 6: 合并 + 收尾

- [ ] **Step 1: 最终测试**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | tail -3
```
Expected: `13 passed / 105 passed`。

- [ ] **Step 2: 分支纯净度（不应含非 cockpit 改动）**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git log --oneline main..HEAD                                      # 期望 5 个 commit
git diff --name-only main..HEAD | grep -vE "cockpit/" && echo WARN || echo CLEAN
```
Expected: 5 commits + `CLEAN`。

- [ ] **Step 3: 合入 main + 复测 + 删分支**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git merge fix/cockpit-techdebt-batch2-graph-timeline --no-ff -m "Merge fix/cockpit-techdebt-batch2-graph-timeline: #9 graph node → timeline source"
npm test 2>&1 | tail -3                          # 期望 13 passed / 105 passed
git branch -d fix/cockpit-techdebt-batch2-graph-timeline
```

---

## Self-Review

**Spec 覆盖**：§2 方案 A（nodeIds 字段→Task2 Step1；focusedGraphNodeId→Step2；eventsForTimeline→Step3；toggle→Step5）；toggle 语义→Step5 + 断言2；selectTask 清空→Step6 + 断言3；CockpitTimeline 消费→Task3；种子 nodeIds→Task4；§4 四类断言→Task5。死字段清理→Task2 Step7。全覆盖。

**占位符**：无。每 step 含完整代码。

**类型一致**：`focusedGraphNodeId`/`eventsForTimeline`/`recentEventsForTimeline` 在 store 定义（Task2）与 return 导出（Step8）、组件消费（Task3）、断言使用（Task5）拼写一致。`nodeIds` 字段名贯穿 CockpitEvent 定义→种子→断言。

**稳健性**：Task2 Step9 在加 getter 后、消费前先测一次（101 不回归），隔离"store 改动"与"组件消费"两类问题；Task5 Step2 明确期望 105，便于发现断言计数偏差。
