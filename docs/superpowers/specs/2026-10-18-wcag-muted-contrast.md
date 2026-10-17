# 壳层次级文字 WCAG AA 对比度修正（spec）

日期：2026-10-18
分支：`fix/wcag-muted-contrast`
来源：当前 main 双主题 WCAG 复核（8649 实机，流程总览/③分析设计/仿真中心三页）发现大量正文级文字低于 AA 4.5:1：浅色 `--text-muted #999` 对 `#fafafa/#f0f0f0` 为 2.37–2.73；深色 `--text-muted #888` 对 `#2a2a2a` 为 3.84。上游 `variables.scss` 是公共主题，不在 overlay 直接改。

## 变更

- `custom/client/ia2/styles/ia2.scss`（IaShell 壳）：`--text-muted` 浅色 `#666`、深色 `#9a9a9a`；`--text-secondary` 浅色 `#555`、深色 `#a0a0a0`；同步 `*-rgb` 变量。
- `IaLegacyShell.vue`：同一组 token 声明在 `.ia-lshell` / `.dark .ia-lshell`。
- `IdeShell.vue`：同一组 token 声明在 `.ide-shell` / `.dark .ide-shell`。
- 新增 `custom/client/__tests__/wcag-contrast.test.ts`：直接计算浅/深 muted 与 secondary 对常用背景的对比度（≥4.5），并断言三个壳层源码都声明了两套 token。

## 决策记录

1. **壳层覆盖而非改上游 variables.scss**：上游主题是全产品共用文件，按工作区规则不直接改；产品壳层覆盖可精确覆盖本产品的 IA/IDE 页面，且不影响上游其他页面。
2. **muted 与 secondary 分开定值**：只把 muted 提亮会把它推到与 secondary 同级；浅色 secondary 加深到 `#555`、深色保持 `#a0`，保留主次层级。
3. **同时覆盖三个壳**：IaShell、IaLegacyShell（设置/上游并入页）、IdeShell 都承载用户可见文字，漏一个壳会在对应页面继续不达标。
4. **token 守门 + 实机双主题复核**：单测固定值与对比度，实机审计验证实际渲染；两者都过才算完成。

## 验证

- `npx vitest run custom/client/__tests__/wcag-contrast.test.ts`：3/3 通过。
- 合并后 8649 双主题重跑审计：浅色 muted 对 `#fafafa/#f0f0f0` ≥5.0、深色 muted 对 `#2a2a2a` ≥5.0；页面级失败项应只剩图形/emoji 等非文字项。
