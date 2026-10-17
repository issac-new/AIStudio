# 顶栏搜索框键盘焦点可见性（spec）

日期：2026-10-18
分支：`fix/focus-visible-search`
来源：WCAG 2.4.7 焦点可见性抽查（深/浅两主题、流程总览/③分析设计/仿真中心，各 Tab 12 次）发现唯一缺口：顶栏搜索框 `.cockpit-top__search-input` 显式 `outline: none`，聚焦时无任何可见指示；其余受检元素均有轮廓或阴影。

## 变更

- `IaShellHeader.vue`：为搜索框增加 `:focus-visible` 轮廓——2px `var(--accent-primary)`、offset 1px、圆角 4px。
- `wcag-contrast.test.ts` 增加源码断言：搜索框声明 `:focus-visible` 且使用 2px 实线轮廓。

## 决策记录

1. **只补搜索框**：焦点抽查 72 个样本只有这一处无指示；其余元素已有可见焦点，不做无依据的全局改动。
2. **用既有 accent token**：不新增颜色；轮廓颜色随主题，避免第二套色值。
3. **保留 `outline: none` 基础态**：只在 `:focus-visible` 出现轮廓，鼠标点击不显示，符合键盘用户预期。

## 验证

- `npx vitest run custom/client/__tests__/wcag-contrast.test.ts`：6/6 通过。
- 合并后重跑焦点抽查：3 页 × 双主题 × 12 次 Tab，失败 0。
