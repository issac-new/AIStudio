# 注意力条点击筛选 Kanban 总览

## 概述

当前点击上方注意力条（CockpitAttention）中的代办事项时，仅选中该任务并切换到工作区，Kanban 总览（CockpitKanban）显示不受影响。本 spec 实现：点击注意力项 → Kanban 总览自动筛选为仅显示该任务及其关联任务（父子链路），去除无关任务。

## 设计决策

- 新增独立的 `_attentionTaskIds` 状态，与现有手动筛选（优先级/状态/租户/看板/日期/搜索）并行且为 AND 关系
- 点击交互为切换式：再次点击同一项清除筛选

## Store 变更（`cockpit.ts`）

### 新增状态

```ts
const _attentionTaskIds = ref<string[]>([])
const attentionActive = computed(() => _attentionTaskIds.value.length > 0)
```

### 修改 `focusOnTaskFromAttention`

```ts
async function focusOnTaskFromAttention(taskId: string, title?: string, desc?: string) {
  // 同一任务再次点击 → 切换（清除筛选）
  if (_attentionTaskIds.value.length === 1 && _attentionTaskIds.value[0] === taskId) {
    _attentionTaskIds.value = []
    return
  }
  // 保持原有行为
  await selectTask(taskId)
  setWorkspaceMode('work')
  _attentionFocusTitle.value = title ?? null
  _attentionFocusDesc.value = desc ?? null
  // 计算关联任务 ID：本身 + parents + children
  const related = new Set<string>([taskId])
  const detail = _detailCache.value[taskId]
  if (detail) {
    for (const p of detail.parents ?? []) related.add(p)
    for (const c of detail.children ?? []) related.add(c)
  }
  _attentionTaskIds.value = [...related]
}
```

### 修改 `filteredTasks`

在现有全部过滤条件之后，新增一个注意力筛选检查：

```ts
// 注意力筛选（如果激活则只显示集合内的任务）
if (_attentionTaskIds.value.length > 0 && !_attentionTaskIds.value.includes(t.id)) {
  return false
}
```

### 新增方法

```ts
function clearAttentionFilter() {
  _attentionTaskIds.value = []
}
```

### return 导出

新增导出 `_attentionTaskIds`, `attentionActive`, `clearAttentionFilter`

## CockpitAttention.vue 变更

### 交互逻辑

点击同个注意力项 → 切换筛选（有则清除，无则设置）；点击不同项 → 替换。

### 样式

当前处于筛选态的任务按钮使用高亮色（`accent-primary` 背景 + `text-on-accent` 文字）。

## CockpitKanban.vue 变更

### 筛选提示条

在 `.cockpit-kanban__list` 上方新增一个提示条：
- 🎯 图标 + "注意力筛选：N 个关联任务" + 「清除筛选」按钮

### 任务高亮

属于 `_attentionTaskIds` 集合的任务卡片增加微弱的背景高亮标识。

## 数据流

```
点击注意力条项
  → CockpitAttention.handleClick()
    → 切换式调用 store.focusOnTaskFromAttention() 或 clearAttentionFilter()
      → selectTask(taskId) → 加载 _detailCache
      → 计算关联 ID 集合 → 设置 _attentionTaskIds
  → CockpitKanban 响应式更新
    → filteredTasks 检查 _attentionTaskIds 约束
      → 非空：只显示集合内任务
      → 空：正常全量显示
```

## 边界情况

- 注意力筛选与手动筛选 AND 叠加：同时激活时取交集
- detail 未缓存（空 _detailCache）：仅显示任务本身
- 关联任务不在当前 `tasks` 中：静默忽略（只显示集合与 tasks 的交集）
- 清除筛选后恢复全量显示，不影响手动筛选状态
