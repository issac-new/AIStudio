# 三壳表单控件正文色基线（深色主题隐形字根治）

> 日期：2026-11-04
> 状态：已实施
> 关联：2026-10-27-product-coherence-refactor.md（Task 11 建立三壳表单控件基线块，本批同构扩展）、2026-10-18 WCAG AA 修正灰立制（shell token 正身值）

## 问题（现象 → 像素实证 → 根因链）

用户报障：深色主题下「搭建 · 账号」页「账号绑定」表格各账号字体深黑不可读。

像素实证（报障截图 BMP 解码逐行采样）：

- 数据行文字实测 **#1a1a1a** 落在近黑底（≈#0d–#111）上，位于三列各自坐标带（x≈518-760 / 1248-1550 / 1976-2056）——三列同病，无例外；
- 表头行（y≈1464-1490）为亮色 #c0-#e0，正常可读——首判「角色列可读」系把表头误当数据行；
- 表格区 y≥1490 全域零亮字（亮度>115 像素为空），证实全表数据不可读而非个别单元格。

根因链（四环，逐环有锚点）：

1. `.dark` 挂在 `<html>`（= `:root` 同元素，`vendor/hermes-studio/packages/client/src/main.ts:46`、`composables/useTheme.ts:185`），把 `--text-primary` 切为 #e0e0e0；`.ia-shell` 的 `color: var(--text-primary)`（`custom/client/ia2/styles/ia2.scss`）只沿**普通文本**继承。
2. 表单控件（input/select/textarea）**UA 默认不吃 color 继承**，文字走 UA 黑。三壳基线块（`custom/client/ia2/styles/shell-overrides.scss`，2026-10-27 Task 11 立制）此前只补了边框色（WCAG 1.4.11），漏了正文色（WCAG 1.4.3）。
3. 上游 `global.scss:62-65` 对裸 input 仅设 `font-family: inherit`，无任何色基线；上游组件要么走 naive-ui（自带主题），要么显式设色（先例：`ThemeAppearanceEditor.vue:111` `color: var(--text-primary)`）。
4. 直接病灶 `custom/client/ia2/views/AccountAdminView.vue:146`：表格单元格全部是 `<input>`，`:166` 只给 `background: transparent; font: inherit`（`font:` 简写不重置 color，但也不设 color）→ UA 黑字落深底。

同类面（为什么不能只修这一个组件）：

- `custom/client` 共 **125 个文件**含裸 `<input>/<textarea>/<select>`，全部暴露于同一缺陷；
- 同病两兄弟：**placeholder**（UA 默认占位色深底同样不可读）与 **caret**（输入光标黑，深底打字看不到光标位置）。

逃逸面核查（为何壳级规则够用）：

- 全仓 `<Teleport to="body">` 共 5 文件，其中唯一含表单控件的 `IdeCommandPalette.vue` 已显式设色（`.ide-palette__input { color: var(--text-primary); &::placeholder { color: var(--text-muted) } }`）——不受影响，且印证「显式补色」是仓内既有正确范式；
- cockpit（`.cockpit` 根类）与全部 custom 视图均渲染于 `/app` → IaShell（.ia-shell）DOM 内（`custom/client/ia2/routes.ts:213`），三壳基线覆盖到位。

## 变更

| 文件 | 改动 |
|---|---|
| `custom/client/ia2/styles/shell-overrides.scss` | 三壳表单控件基线块（原 1.4.11 边框）同块追加：`color: var(--text-primary)`、`caret-color: var(--text-primary)`、`&::placeholder { color: var(--input-placeholder-color) }`；块注释补 1.4.3 依据与本案锚点 |
| `custom/client/ia2/__tests__/visual-coherence.test.ts` | 基线断言扩展：正文色/光标色/占位符色三断言（防漂移棘轮） |
| `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md` | A.1 登记本 spec（行 + 标题计数） |
| `.swarm-yuan/decisions.jsonl` | Mechanical 决策留痕（修复落位=单源基线扩展） |

覆盖机制与不破坏面：

- 组件 scoped 规则特异性高于元素级基线（`.ia-shell input` = 0,1,1 < scoped 类选择器），既有显式设色组件（IdeCommandPalette 等）行为不变；
- 本修复**不改任何组件文件**——125 文件同类面经单一事实源一次根治；
- token 自动双主题：`--text-primary` 浅 #1a1a1a / 暗 #e0e0e0（上游 variables.scss:43/119）；`--input-placeholder-color` 在 `:root` 定义为 `var(--text-muted)`（variables.scss:46），`.dark` 挂 `<html>` 同元素重定义 `--text-muted`（暗 #888），间接引用在两主题下都解析到正确值。

## 决策记录

| 决策 | 选择 | 备选 | 理由 | 类型 |
|---|---|---|---|---|
| 修复落位 | 扩展 shell-overrides.scss 既有三壳基线块（单一事实源） | 逐组件补色（125 处）；`:root` 全局兜底 | 基线块已是表单控件 token 唯一定义处（Task 11 立制，visual-coherence 守门）；组件级修复不可收敛且新组件必再犯；全局兜底波及上游渲染面 | Mechanical |
| placeholder token | `var(--input-placeholder-color)` | 直写 `var(--text-muted)` | 上游已有专用 token 且经间接引用双主题解析正确；保留主题编辑器对占位符色的覆盖能力 | Mechanical |
| 不引入 `color-scheme: dark` | 仅补 color/caret/placeholder 三个确定性属性 | `.dark` 声明 `color-scheme: dark` 交 UA 整体适配 | color-scheme 同时改变滚动条/原生下拉弹层/默认底色全量 UA 渲染，波及面不可控；外科式 token 补齐与上游范式（ThemeAppearanceEditor）一致 | Taste |

## 验证

- 目标测试：`npx vitest run custom/client/ia2/__tests__/visual-coherence.test.ts custom/__tests__/docs-ssot-guard.test.ts custom/client/__tests__/wcag-contrast.test.ts` 全绿；
- 棘轮断言（新增）：shell-overrides.scss 含三壳 input 正文色基线（`color: var(--text-primary)`）、`caret-color`、`::placeholder` 三要素——删基线即红；
- 全量 `npm test`（注入态）零失败；
- 活体走查（深色主题）：dev 服务下 `/app/stage/setup` 账号 tab，`getComputedStyle` 断言表单控件 `color === 'rgb(224, 224, 224)'`（#e0e0e0），浅色主题复核不回退（#1a1a1a 于浅底可读），截图留证；
- 修复前后像素对比：修复前数据行 #1a1a1a → 修复后同位置亮度对齐正文 token。

## 设计文档影响

DESIGN_SYNC: none

理由：整合正本 `2026-10-23-swarmstudio-integrated-design.md` 的视觉契约停留在「保留现有 tokens、状态色和组件，不新增平行体系」原则层，未逐条登记基线块内容级细节（grep 无 shell-overrides/表单控件/边框记载）；本批是既有基线块的同构扩展（同 token 家族、同落点、同守门测试），不产生新契约、不改组件清单与页面结构。shell-overrides.scss 头注随批更新，作为该块的操作性记载。
