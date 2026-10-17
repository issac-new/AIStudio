# 前端 UI/UE/UX 复盘与一致性重构 spec（主题根治 + 共享基元 + token 清零）

日期：2026-10-17
来源：用户指令「复盘 swarm studio 当前所有页面及功能，进行重构优化（从专业前端 UI UE UX 的角度）」，方案经 plan mode 批准。
验收：vitest 全量绿（worktree 跑法须 `MX_SIMHARNESS_ROOT=~/lab/ncwk/simharness`）＋ `npm run build` 过 ＋ dev 双主题走查改动屏无破相 ＋ raw hex 预算闸入测试套件。

## 背景

全量探查（路由 45 条 /app 树 + 30 并入页 + 4 岛屿 + IDE；三层设计系统；近三轮改造成果）结论：IA 层（六阶段导航 + 旅程首页）2026-10-17 刚完成 D13/D18 定稿且验收全绿，不动；ia2 核心域已有 V1-V3 视觉语言与 WCAG 校准 token。当前主要债务在主题与 token 层：governance 整模块用 Tailwind 色板亮色假设（暗色主题破相）、ide 的 hover 白透明（亮色主题不可见）、matrix-chat 四对话框白透明边框、sim 域第二套状态色与已校准 `--ia-*` 并存、ECharts 语义色缓存切主题不失效（`invalidateStatusColorCache` 全仓零调用）、custom 域约 500 处 raw hex、空态十余套与状态色双轨无共享基元。逐条证据（file:line）见收口时同目录复盘报告。

## 目标

1. 全部 custom 域颜色随主题翻转，消灭「亮色假设 / 暗色假设」破相。
2. raw hex 收敛到显式 allowlist（token 定义处 + 有理由的例外），机械闸防复发。
3. 空态与状态徽章收敛到共享基元，状态色单一事实源。
4. 走查驱动修一批交互快赢（焦点态、aria、加载/空态一致性）。

## Non-goals

- 不动 IA/导航/路由结构（D13/D18 定稿，V8.37 刚对账锚定）。
- 零新 upstream patch：30 个并入页的 upstream 视图本体不改。
- naive-ui 受控混用保持现状，只修脱离主题的色值（如 `#18a058`）。
- 不做 keep-alive（既有裁决不上）；抽屉三套不做结构合一（成本高于收益，视觉面统一即可）。
- 不做全量 WCAG 再校准——校准过的 `--ia-*` 五态与 upstream 语义色沿用，本轮只解决主题跟随。

## 方案（四批，一分支顺序推进）

批 A 主题一致性根治：governance token 化（Tailwind→Pure Ink 语义映射）；ide/matrix-chat 白透明修正；sim 三件归一到 `--ia-*`；ia2 壳层四件 chip token 化；`studio-theme-change` 监听接线 `invalidateStatusColorCache`；kanban inline style 收编；raw hex 预算闸测试入套件（目录级 ratchet）。
批 B 共享基元：`custom/client/ui/` 下 `UiEmptyState`/`UiStatusPill`；十余套空态迁移；cockpit `STATUS_COLORS` 为语义色单一事实源、sim 五态走 `--ia-*`。
批 C token 清扫：剩余 raw hex（CSS→var()、图表 JS 常量→resolveStatusColors）、死 fallback 清除（仅 upstream 全局变量剥 fallback，`--ia-*` 的 fallback 保留防独立渲染上下文）。
批 D 走查与报告：dev 双主题过核心屏，快赢修复，复盘报告（md + docx/pdf 衍生）。

## 决策记录

- D-1 颜色映射表（属性感知）：红系文字→`var(--error)`（亮 #c62828 5.9:1、暗翻转，双主题可作文字色）；绿系→`var(--success)`；琥珀文字→`var(--ia-stale)`（`--warning` 亮色 #f57f17 作小字仅 2.1:1 不可用）；蓝系→`var(--accent-info)`；浅色底→`rgba(var(--X-rgb), 0.08-0.12)` 同色系透明底；实色按钮→`var(--accent-primary)`+`var(--text-on-accent)`；slate 灰→`--text-secondary/--text-muted/--border-color/--bg-secondary`。依据=upstream `variables.scss` 亮色实值与 ia2.scss 校准注释。
- D-2 ECharts 主题联动监听挂 cockpit/index.ts（`studio-theme-change` → `invalidateStatusColorCache()`），随 ia2/index.ts 双落点幂等导入；选 cockpit 落点因 status-colors.ts 本就在该域。
- D-3 预算闸形态：vitest 测试文件扫 `custom/client/**`（排除 `__tests__`、`*.test.ts`）统计 raw hex，按目录预算表断言「实际 ≤ 预算」；批 C 收口时预算压到 allowlist 终态；ia2.scss `:root` token 定义行以结构化豁免（不数定义处）。
- D-4 i18n 覆盖守门修复（本分支首个提交）：ia-residuals 批的 `ia2.nav.stageN` 运行时派生键纳入守门覆盖面（同 `collectPatchedLeafKeys` 先例），不向静态词表塞副本——保 STAGE_META 单一事实源。该红为 91e3f2bb 合入后预存，非本批引入。
- D-5 `var(--x, #fallback)` 剥 fallback 仅限 upstream 全局变量（variables.scss 恒在）；`--ia-*`/域内 token 的 fallback 保留（组件可能在 ia2.scss 未装载的上下文渲染）。
- D-6 worktree 跑测试配方：`MX_SIMHARNESS_ROOT=/Users/cuishi/lab/ncwk/simharness`（delivery-harness-contract 与 raci-rest-guard 按「overlay 根上一级/simharness」解析，worktree 内解析到 `.claude/worktrees/simharness` 死路径——2026-10-17 双删事故余波，环境性非产品缺陷）。
