# 工作台概览按「三问」重排与注意力经济守门（J 批）（2026-10-31）

日期：2026-10-31
状态：草案
来源：用户指示「深入调研 https://mp.weixin.qq.com/s/zoS7GlReWPhfCjENGxXCdg 及 https://github.com/deepseek-ai/dsh-superagent-prototype 完善 AIStudio」。上游依据=prototype `docs/005-panel.md`（面板三问）与 `docs/000-philosophy.md`（注意力经济）。
关联：`2026-10-31-superagent-domain-auth.md`（A+B 批，提供 orchestrator 健康面）、`2026-10-23-swarmstudio-integrated-design.md`（§5.1 工作台）。

## 1. 背景与目标

### 1.1 现状

`/app/dash` 的概览面 `CockpitOverview.vue` 现有三卡：①我的待办（审批待审 + RACI 等我卡）②评审闸口（待裁决 + 最近裁决）③交付进度（状态分布 + 完成率）。动线提示为「先办等我的 → 再审我审的 → 后查我交的」。

对照上游 panel 的三问顺序（`005-panel.md`）：

1. 现在有需要我做的吗？
2. 系统是否健康、在做对的事？
3. 单件工作的历史（Trigger → Eval → Ticket）？

现状缺口：
- 第 2 问（系统健康）在概览面**完全没有位置**，只在治理中心/巡检页可见；异常发生时概览面不显形。
- 第 3 问只有「状态分布」，没有「单件工作的历史」入口（任务详情/时间线在别处）。
- 上游注意力经济规则（健康态不占空间、计数等于列表长度、标签写「等谁/要什么」、状态不互相矛盾）**没有守门测试**，只靠人工走查。

### 1.2 目标

1. **价值声明**：让人打开概览面先看到「要不要我动手」，再看「系统有没有问题」，最后才看「活干到哪了」——减少无效扫视。
2. **SMART 目标**：
   - `CockpitOverview.vue` 三卡顺序与文案对齐三问；新增「系统健康」节，**仅在异常时渲染**（健康态零占位）。
   - 每个卡片数字与所链列表长度一致（新增守门测试断言）。
   - 标签文案改为「等谁 + 要什么」（如「等 张三 批准」），不出现内部代码（`T2`/`review` 等）。
   - 第 3 问补「最近一条工作历史」入口（点击进任务详情/时间线）。
3. **非目标**：
   - 不改 `/app` 默认页（JourneyView，2026-10-17 用户裁定的旅程式）。
   - 不新增独立页面；不重做视觉主题。
   - 不接 LLM 摘要；健康数据只读展示。

## 2. 决策记录

| # | 决策 | 理由 | 否决的备选 | 类型 | 用户裁定 | 可逆 |
|---|---|---|---|---|---|---|
| D1 | 落点= `/app/dash` 的 `CockpitOverview.vue`，不动 JourneyView | JourneyView 是 0→1 搭建旅程，语义不是「监督面板」；概览面才是监督入口 | 改 JourneyView（否决：改变已裁定产品方向） | UserChallenge | approved（2026-10-31 用户裁定） | 是 |
| D2 | 健康节「仅异常显形」，健康态整节省略 | 上游原文：Healthy states take no extra space；健康态占位会稀释注意力 | 常驻健康条（否决：违背注意力经济） | Mechanical | approved | 是 |
| D3 | 健康数据源本批用 `/api/hermes/sim/topology`（四服务存活）+ 既有巡检聚合；orchestrator 健康面等 A+B 合入后接入 | 本 worktree 与 A+B 并行，不能依赖未合入端点；不造数 | 等 A+B 合入再开工（否决：无谓串行） | Mechanical | approved | 是 |
| D4 | 三问文案用中文短句，不用 1/2/3 编号 | 上游规则：标签写「等谁/要什么」；编号是内部结构不外露 | 显示问号标题（否决：像文档不像产品） | Taste | approved | 是 |
| D5 | 第 3 问历史入口复用既有任务详情抽屉（`open-task`），不新建历史页 | 复用既有 `KanbanTaskDrawer` 与时间线，避免双口径 | 新建历史面板（否决：重复造轮子） | Mechanical | approved | 是 |

## 3. 改造类型与侵入点

### 3.1 A 类修改（`custom/client/`）

| 文件 | 改动 |
|---|---|
| `custom/client/ia2/components/flow/CockpitOverview.vue` | 三卡顺序与文案对齐三问；新增健康节（`v-if` 异常才渲染）；第 3 问加最近历史入口 |
| `custom/client/ia2/views/WorkbenchView.vue` | 装配健康数据（从 `/api/hermes/sim/topology` 读，fail-soft 返回 `available:false`），以 props 传入概览 |
| `custom/client/ia2/i18n*` / locale 词条 | 新增三问标题、健康节、历史入口词条；改「等谁/要什么」文案 |
| `custom/client/ia2/components/flow/__tests__/cockpit-overview.test.ts`（若不存在则新增） | 三问顺序、健康节仅异常渲染、计数=列表长度、无内部代码泄漏 |

### 3.2 服务端

无新增端点。健康数据复用现有 `/api/hermes/sim/topology`；若该端点不可用，概览面健康节不渲染（fail-soft，不显示「未知」噪音）。

## 4. 详细设计

### 4.1 三问结构

```
概览
├─ 现在需要我做什么
│   ├─ 等我处理（审批待审数 → 收件箱）
│   ├─ 等我决策的卡（RACI R/A → 看板）
│   └─ [异常时] 系统问题：<一句话>（→ 对应修复面）
├─ 系统是否健康、在做对的事        ← 仅异常时渲染
│   └─ <服务名> 不可用 / <阶段> 卡住 > N 小时（最多 3 条，超出折叠「还有 N 条」）
└─ 工作进展
    ├─ 完成率条 + 状态分布
    └─ 最近一条：<任务标题> · <当前阶段>（→ 任务详情/时间线）
```

### 4.2 注意力经济守门规则（测试可断言）

| 规则 | 断言方式 |
|---|---|
| 健康态零占位 | 健康输入为空时，DOM 中不存在健康节节点 |
| 异常最多 3 条 | 异常 5 条时渲染 3 条 + 「还有 2 条」 |
| 计数=列表长度 | 每个数字节点与对应列表 `length` 相等 |
| 无内部代码 | 渲染文本不匹配 `/\bT[123]\b/`、`/\breview\b/`、`/\bblocked\b/`（除非作为用户可见中文标签） |
| 状态不矛盾 | 若「待办 0」则不渲染红色徽标 |

### 4.3 数据形状（props 扩展）

```ts
interface HealthSignal {
  id: string
  label: string        // 用户可见的「哪里有问题」
  detail: string       // 「需要谁做什么」
  target?: string      // 点击落点（路由或任务 id）
  severity: 'blocker' | 'warning'
}
// WorkbenchView 装配后传入；空数组=健康（不渲染）
```

## 5. 验证

- `npx vitest run custom/client/ia2/components/flow/__tests__/cockpit-overview.test.ts`：新增/扩展用例覆盖 §4.2 五条规则。
- `npx vitest run custom/client/ia2/__tests__`：既有概览与工作台测试不回归。
- 浏览器实物走查：`/app/dash` 三种状态截图（健康/1 条异常/5 条异常），确认健康态零占位与折叠。
- 合并前 `npm test` 全量。

## 6. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 健康数据源不稳定导致概览抖动 | 只读、fail-soft、异常节最多 3 条；端点失败视为健康（不渲染） |
| 文案改动触发既有 i18n 测试 | 词条走既有 locale 机制，测试同步更新 |
| 三问重排让老用户找不到交付进度 | 保留第三卡位置（最后），并提供动线提示 |

回滚：仅前端组件与词条，`git revert` 即可，无数据迁移。

## 7. 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§3.3 补「工作台概览三问结构」与「健康节仅异常显形」两条产品规则。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记（计数 +1）。

## 7.1 实施偏差（如实记录）

- 测试文件落在 `custom/client/ia2/__tests__/cockpit-overview.test.ts`（仓库既有位置），未按 §3.1 新建 `components/flow/__tests__/` 重复文件。
- 原「最近裁决」列表随 `history` prop 一并移除：三问结构下第②问不再承载裁决历史，历史仍在审批收件箱与 `/api/approvals/history`。如需在概览面保留，另批给出口。
- 健康数据源只接 `/api/hermes/sim/topology` 四服务存活，未并入 qgate 失败与巡检告警。
- 「最近一条工作历史」按 `createdAt` 取最新（`CockpitTask` 无 `updatedAt`，未扩共享适配器）。

## 8. 未决问题

1. 健康数据源的聚合口径：`/api/hermes/sim/topology` 是四服务存活；是否并入 qgate 最近失败/巡检告警？实施时确认，先做服务存活。
2. 「最近一条工作历史」的选取规则：按 `updatedAt` 还是按用户相关（RACI）？倾向前者，实施时验证数据可得性。
