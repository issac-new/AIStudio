# Cockpit 右边栏功能补缺设计

**日期**：2026-06-23
**状态**：待评审
**基线设计**：`docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`（§5.5 右栏工作区、§5.8 历史、§5.6 A2UI）
**高保真原型**：`.superpowers/brainstorm/12551-1782031991/content/cockpit-final-polished.html`
**适用项目**：`overlay/custom/client/cockpit/`

---

## 1. 背景

驾驶舱右边栏在 P3-P6 中已完成主体功能实现，但与设计规格和高保真原型仍存在若干差距。本 spec 汇总这些差距并定义修复方案。

## 2. 审计发现总表

| 类别 | 数量 | 优先级 |
|------|------|--------|
| 🔴 缺失功能 | 5 项 | 高 |
| 🟡 功能不完整 | 5 项 | 中 |
| 🟠 视觉/样式差异 | 3 项 | 中 |
| 🔵 交互问题 | 3 项 | 低 |
| 🟣 数据流问题 | 2 项 | 低 |
| ⚪ i18n 闲置 | 4 项 | 低 |

## 3. 修复清单

### 批次 1：高优先级 — 功能补缺

#### 1.1 ModeBar 添加最大化按钮

**文件**：`CockpitModeBar.vue`

在 ModeBar 右侧 spacer 后添加 `⛶` 最大化按钮：

```vue
<span class="cockpit-mode-bar__spacer" />
<button type="button" class="cockpit-mode-bar__max"
  :title="store.maximized.right ? '还原' : '最大化'"
  @click="onRightMaximize">
  {{ store.maximized.right ? '🗗' : '⛶' }}
</button>
```

点击行为：调用 `store.toggleMaximized('right')` → 独占式全屏右栏，中栏自动折叠。与 CockpitView 中 `onColCtrl('right')` 的逻辑一致（三态：正常→最大化→折叠→正常）。

**样式**：Pure Ink，与现有 `.cockpit-col__ctrl` 风格统一。

#### 1.2 Workspace footer 添加 "⌘ Claude Code" 快捷按钮

**文件**：`CockpitWorkspace.vue`

在模板库按钮后、稍后处理前添加：

```vue
<button type="button" class="cockpit-workspace__btn" @click="store.enterTerminal()">⌘ {{ t('cockpit.modeTerm') }}</button>
```

作为编程模式的快捷入口，等同于点模式切换器的「⌘ 编程」tab。

#### 1.3 ChatPane 添加 "↗ 打开完整" 按钮

**文件**：`CockpitChatPane.vue`

在聊天头部"返回工作项"旁添加打开完整页面的链接。从 `channel.routeTarget` 获取路由目标：

```vue
<button type="button" class="cockpit-chat-pane__open" @click="openFullPage">
  ↗ {{ t('cockpit.openFull') }}
</button>
```

#### 1.4 CollabBar 频道 chip 添加路由跳转

**文件**：`CockpitCollabBar.vue`

点击频道 chip 时除了 `selectChannel` 设置当前频道外，额外支持路由跳转：

- 保留 `selectChannel` 行为（切换到聊天模式）
- chip 右侧添加小箭头按钮 `↗`，点击后使用 `channel.routeTarget` 路由跳转

---

### 批次 2：中优先级 — 完善既有功能

#### 2.1 决策选项添加推荐标记 + 描述文本

**文件**：`CockpitWorkspace.vue`

在 `decisions` 数组中为 `conditional` 添加 `recommended: true` 标记和 `descKey`。

```ts
const decisions: { key: WorkDecision; labelKey: string; descKey?: string; recommended?: boolean }[] = [
  { key: 'conditional', labelKey: 'cockpit.decisionConditional', descKey: 'cockpit.decisionConditionalDesc', recommended: true },
  { key: 'reject', labelKey: 'cockpit.decisionReject' },
  { key: 'approve', labelKey: 'cockpit.decisionApprove' },
]
```

渲染：
```
[dot] 有条件通过   [推荐]
      结构 OK，需补用例
```

#### 2.2 TopBar i18n 修正

**文件**：`CockpitTopBar.vue`

- 为 `sidebar.history` / `sidebar.search` 创建正确的 i18n key（`cockpit.schedule` / `cockpit.search`）
- 或在 i18n 文件中添加对应 key
- 移除硬编码中文降级逻辑

#### 2.3 Attention 标签 i18n 化

**文件**：`CockpitAttention.vue`

将硬编码的"需要你"替换为 `{{ t('cockpit.attention') }}`。

#### 2.4 历史动作筛选 i18n 化

**文件**：`CockpitHistoryModal.vue`

将 `ACTIONS = ['审批', '决策', '补充', '评估', '委派']` 替换为 i18n key 数组：

```ts
const ACTIONS = [
  { key: 'approve', labelKey: 'cockpit.actionApprove' },
  { key: 'decide', labelKey: 'cockpit.actionDecide' },
  { key: 'supplement', labelKey: 'cockpit.actionSupplement' },
  { key: 'evaluate', labelKey: 'cockpit.actionEvaluate' },
  { key: 'delegate', labelKey: 'cockpit.actionDelegate' },
]
```

#### 2.5 用户名动态获取

**文件**：`CockpitView.vue` + 可能需调整 store

从 user/profile store 获取当前用户名，替换 `user-name="石磊"` 硬编码。

---

### 批次 3：低优先级 — 非关键项

#### 3.1 清理未使用的 i18n keys

**文件**：i18n 补丁 patches + CockpitView

- 移除 `rightPlaceholder` / `midPlaceholder`（P2 遗留）
- 确认 `openFull` / `recommend` 是否用于新功能（批次 1.3/2.1 会使用）
- 移除 `archivedHint` 如果确实不用

#### 3.2 Diff 区块动态化

**文件**：`CockpitWorkspace.vue`

将硬编码的 diff 行替换为从 `workItem.modifiedFiles` 动态渲染。每行显示文件名 + 行号 ± 号 + 代码片段。

#### 3.3 评分持久化到模板

**文件**：`cockpit-kv.ts`, `CockpitTemplateManager.vue`

在 `A2uiTemplate` 接口添加 `score?: number` 字段，`saveTemplate` 和 `applyTemplate` 方法同步处理评分。

---

## 4. 不变事项

- 所有样式继续 Pure Ink（CSS 变量白名单，无自定义色值）
- 统一选中态语言（左 3px 色条 + `rgba(0,0,0,.05)` 浅底）保持不变
- 组件继续使用 `<script setup>` Vue 3 组合式 API
- 测试框架使用 vitest + @vue/test-utils
- 数据流保持 Pinia store 单向流动
