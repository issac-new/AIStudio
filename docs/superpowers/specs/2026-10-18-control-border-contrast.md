# 表单控件边框 WCAG 1.4.11 非文本对比度（spec）

日期：2026-10-18
分支：`fix/control-border-contrast`
来源：补齐 V8.41 验收记录里「1.4.11 非文本对比度未测量」的遗留。实测深/浅两主题下输入框边框对背景只有 1.26–1.53:1，低于 3:1；带文字的按钮边框也偏低，但按钮由文字标签标识，边框属装饰，不纳入本批控件边界修复。

## 变更

- 三个壳层新增 `--ia-border-control`：浅色 `#8a8a8a`（对 `#fafafa/#f0f0f0/#fff` 为 3.03–3.45）、深色 `#808080`（对 `#1a1a1a/#252525/#2a2a2a` 为 3.63–4.41）。
- `ia2.scss`、`IaLegacyShell.vue`、`IdeShell.vue` 分别对 `input/select/textarea` 应用该边框色。
- `wcag-contrast.test.ts` 增加 1 例：两种主题控件边框 ≥3:1，且三个壳层源码都声明了两套 token。

## 决策记录

1. **只修表单控件边界**：WCAG 1.4.11 要求「识别控件所必需的视觉信息」达到 3:1；输入框的边框是唯一边界，必须修。带文字按钮由标签识别，边框不是唯一识别信息，保持现有轻边框以免视觉过重。
2. **不覆盖 `--border-color` 全局值**：只给控件加 `--ia-border-control`，卡片/分隔线等装饰边框保持原视觉层级，避免整页边框变重。
3. **三个壳层同步**：IaShell、IaLegacyShell、IdeShell 都可能承载表单；漏一个壳会在对应页面继续不达标。
4. **焦点可见性不在本批**：本批只处理非文本对比度（1.4.11）；键盘焦点指示属 2.4.7，另行复核。

## 验证

- `npx vitest run custom/client/__tests__/wcag-contrast.test.ts custom/client/__tests__/raw-hex-budget.test.ts`：7/7 通过。
- 合并后 8649 双主题重跑非文本审计：`input-border` 与状态图形失败数为 0；带文字按钮的装饰边框仍低于 3:1，按上述决策不纳入。
