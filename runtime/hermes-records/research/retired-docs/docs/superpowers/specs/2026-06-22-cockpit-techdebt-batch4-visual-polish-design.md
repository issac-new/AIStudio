# 驾驶舱技术债清理 · 批次 4：#7 #8 #12 视觉细化 设计

**日期**：2026-06-22
**状态**：待评审
**适用范围**：`overlay/custom/client/cockpit/`（cockpit.scss + 两个组件）
**前置**：批次 0/1/2/3 已完成；`npm test` = 13 passed / 107 passed。

---

## 1. 背景

批次 4 原覆盖审计 🟡 四项（#6 #7 #8 #12）。经逐项对照高保真原型（`.superpowers/brainstorm/12551-1782031991/content/cockpit-final-polished.html`）：

- **#6 右栏重心**：用户确认保持当前 padding（20px 24px），字号/max-width 已与原型一致 → **跳过**。
- **#7 #8 #12**：有真实视觉差异，本批次处理。

## 2. 差异清单（当前 → 原型）

| # | 项 | 当前 | 原型规范（行号） | 改动 |
|---|----|------|------------------|------|
| **#7** | 折叠竖条 label 字号 | `font-size: 11px`（cockpit.scss:57） | `font-size: 15px`（原型:78） | 改 15px |
| **#8** | 协作图画布提示文字 | 无 | `.canvas .hint { position:absolute; bottom:4px; left:8px; font-size:8px; color:var(--text-muted) }`（原型:154） | CollabMap canvas 加 hint |
| **#12** | 归档态 banner 变灰 | banner 保持 warning 黄 | `.sw.archived .banner { background:bg-2; border:bd }` + `.dot { background:k4 }`（原型:398-399） | Workspace banner 加 archived 样式 |

## 3. 目标与非目标

### 成功标准
1. 折叠竖条 label 字号 15px。
2. 协作图画布左下角显示 hint 提示（8px，i18n key）。
3. 归档态下 Workspace banner 变灰（bg-secondary + border-color + dot 变 text-muted）。
4. `npm test` 保持 107 passed（视觉改动，新增 i18n key 若需）。

### 非目标
- 不改 #6（用户确认保持当前）。
- 不改逐控件半透明（保持当前整 body opacity:.5 方式，仅补 banner 变灰）。
- 不接 API、不碰 upstream。

## 4. 设计

### 4.1 #7 rail label 字号（cockpit.scss）
`.cockpit-rail__label` 的 `font-size: 11px` → `15px`（对齐原型:78）。

### 4.2 #8 canvas hint（CollabMap）
在 `.cockpit-map__canvas` 内（SVG 之后、GraphNode 之前）加：
```html
<span class="cockpit-map__hint">{{ t('cockpit.mapHint') }}</span>
```
样式（scoped）：
```scss
.cockpit-map__hint { position: absolute; bottom: 4px; left: 8px; font-size: 8px; color: var(--text-muted); pointer-events: none; }
```
i18n：`cockpit.mapHint` = "拖拽节点 · 点节点切时序源"（zh）/ "Drag nodes · click to filter timeline"（en）。需加到 patches/074(en) 与 075(zh) 对应的 cockpit 段——但这些是 B 类 patch（改 upstream i18n 文件）。**改为 overlay 侧 i18n**：经查 cockpit 的 i18n 是经 patch 074/075 注入 upstream locale 文件的。新增 key 需扩 patch 或另开。**简化**：本批次 hint 用**硬编码中文**（与种子数据一致，驾驶舱当前未完全 i18n 化），加 TODO 注释后续 i18n。

### 4.3 #12 banner 变灰（CockpitWorkspace）
banner 当前 class 无 archived 变体。给 banner 元素加 `:class="{ 'is-archived': isReadOnly }"`，样式：
```scss
.cockpit-workspace__banner.is-archived {
  background: var(--bg-secondary);
  border-color: var(--border-color);
  .cockpit-workspace__banner-dot { background: var(--text-muted); }
}
```

## 5. 验证
`npm test` 保持 107 passed（纯样式，无逻辑改动）。手测：折叠竖条字变大、画布左下角有提示、归档态 banner 变灰。

## 6. 风险与回退
全为样式/模板小改，`git revert` 即回退。

## 7. 开放问题
无。#6 跳过、#12 整 body 方式、i18n 用硬编码均已确认。
