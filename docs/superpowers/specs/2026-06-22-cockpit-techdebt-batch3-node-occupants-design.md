# 驾驶舱技术债清理 · 批次 3：#4 协作图节点显示在场者 设计

**日期**：2026-06-22
**状态**：待评审
**适用范围**：`overlay/custom/client/cockpit/`（store 类型 + 一个组件 + fixtures + 测试）
**前置**：批次 0/1/2 已完成；`npm test` = 13 passed / 105 passed。

---

## 1. 背景与判断

审计 #4 原文："CollabMap 应用级加左右两栏（空间列=workspace 在场者 + 组织列=编排链）"。

**经核查，审计与设计原文存在偏差**：
- **设计 §5.4（权威）**："空间-组织联动：应用级视图体现'谁在哪个空间、谁和谁怎么联动'——**节点显示在场者**，连线标注 A2H/A2A 关系。"
- **高保真原型**：grep "空间/组织/在场/编排链" 零结果——原型未落地"两栏"布局，用的是节点画布。
- **连线标注 A2H/A2A**：已实现（`relations` + label 渲染，见 CollabMap.vue）。

结论：审计的"双栏"是过度解读。设计真正缺的是**节点显示在场者**（"谁在哪个空间"）。本批次按设计原文实现，不采用审计的"双栏"——既贴合设计、又是小改动、有数据支撑（channel members）、原型视觉一致（沿用节点画布）。

## 2. 现状

- `CockpitGraphNode` 显示 `node.label`（文件名）+ 焦点标记，**无在场者**。
- `GraphNode` interface 无 occupants 字段。
- `CollabChannel.members` 已有成员数据（如 `['张三','李四','你']`），可作为派生源，但本批次直接给节点补 occupants（更直接，与 channel 解耦）。

## 3. 目标与非目标

### 成功标准

1. `GraphNode` 加可选 `occupants?: string[]`（节点上的在场者名字）。
2. `CockpitGraphNode` 在 label 下方横排显示在场者小圆点（最多 3 个，超出显 `+N`），hover 出名字（title 属性）。
3. 种子节点 n1/n2 补 occupants（语义合理）。
4. `npm test` 保持 105 passed + 新增断言验证 occupants。

### 非目标
- **不**做审计的"双栏布局"（§1 已论证其为过度解读）。
- **不**接 kanban API（种子补 occupants 即可）。
- **不**改连线标注 A2H/A2A（已实现）。
- **不**复用 group-chat 的 ProfileAvatar（对种子字符串名字过重，用轻量首字圆点）。

## 4. 设计

### 4.1 数据模型

```ts
export interface GraphNode {
  id: string
  taskId: string
  label: string
  kind: GraphNodeKind
  focus: boolean
  links?: string[]
  /** 该节点的在场者（谁在处理这个文件/测试），节点上以小圆点显示，hover 出名字。 */
  occupants?: string[]
}
```
可选字段，向后兼容。

### 4.2 CockpitGraphNode 展示

label 下方加一行 occupants 圆点：
- 每个 occupant 一个小圆点（10px，背景 `var(--accent-primary)`，白字首字符）。
- 最多显示前 3 个，超出显 `+N`（灰底圆点）。
- 每个圆点 `title="名字"` 提供 hover tooltip（原生，无需 JS）。
- 无 occupants 时不渲染该行（不占位）。

视觉（Pure Ink，仅用 CSS 变量）：
```
┌─────────────┐
│ refresh.ts  │   ← label（现状）
│  [焦点]     │   ← focus 标记（现状）
│ ● ●  +1     │   ← occupants 圆点（新增）
└─────────────┘
```

### 4.3 种子 occupants

task '1' 的两个节点（基于种子 events 的 actor 语义）：
- n1 (refresh.ts)：occupants: ['张三', 'review-agent']（张三提交、review-agent 评审过实现）
- n2 (auth.spec)：occupants: ['qa-agent']（qa 补的测试）

## 5. 验证

1. `npm test` 保持 105 + 新增断言：
   - GraphNode 接受 occupants 字段（类型层）
   - CockpitGraphNode 渲染 occupants 圆点（组件测试：传入 occupants，断言 DOM 含对应圆点 + title）
2. 手测：节点上看到圆点，hover 显示名字。

## 6. 风险与回退

| 风险 | 应对 |
|------|------|
| 节点变高撑乱画布 | occupants 行紧凑（圆点 10px，一行），画布 120px 足够；无 occupants 不占位 |
| occupants 字段与未来 API 冲突 | 可选字段，语义明确（节点级在场者），与 channel.members 解耦 |

**回退**：`git revert` 本批次。

## 7. 开放问题

无。方向（节点显示在场者，非双栏）、展示（小圆点 + hover）均已确认。
