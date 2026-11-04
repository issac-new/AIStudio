# 2026-11-04 IDE 工作区四缺陷修复（工具下拉 / kanban 任务工作区权限 / 消息弹层）

## 变更

用户走查报四缺陷，本轮活体复现定谳根因后修复（复现环境：worktree 树 serve:8647 + vite:8649，账号 s swarm 非 super_admin）：

1. **bug1「工具」无法打开选取工具**：根因＝`.ide-statusbar { overflow: hidden }`（IdeStatusBar.vue）把向上弹出的面板整个裁掉——`🖥 工具 ▾` 下拉（IdeDevTools，`bottom:100%`）在 DOM 里开着但不可见不可点（活体实锤：playwright click 判 covered、elementFromPoint 命中聊天栏）；⚙ 插槽面板同病。2026-10-18 只把 slots-btn 单改 `overflow:visible` 不够，栏级裁剪仍在。修复＝栏级改 `overflow: visible`（横向溢出由 `__item` 自身 ellipsis 兜住）＋两面板 z-index 60→110（压过 `.ide-shell__split` z-100 的 ±5px 加宽命中域）。
2. **bug2/3 辅助栏选 kanban 任务后报错「当前工作区根目录需要管理员权限；当前账号只能打开自己的任务工作区」**：根因＝任务工作区根经 `/api/studio/files/list?root=` 校验，该端点带 `root` 一律要求 super_admin（补丁 097 SecFileRootSandbox 内联闸）→ 普通账号选任何任务（含本人任务/会话沙箱根）都 403。修复＝**补丁 734**：list/stat/download 三处闸门对已知任务工作区（`isWithinKnownTaskWorkspace`，含 coding-agent 工作区）放开只读面，冷缓存先 `primeTaskWorkspaceCache()` 再复查；写面 8 端点（read/write/delete/rename/mkdir/copy/upload）仍 super_admin。非任务根（如任意 ~/.hermes 目录）仍走原闸。客户端不用改：validate 通过后 FileTree 正常挂载，既有权限回落只读树（permReadOnly）保留给真正被拒的场景。
3. **bug4「消息」按钮点击后弹层直接关闭**：根因＝通知下拉面板与全屏 mask 同 z-index（`--ia-z-header-panel:800`），mask 在 DOM 后渲染盖住面板——面板内任何点击（含「消息」页签）都落在透明遮罩上→立即关闭（活体实锤：elementFromPoint 命中 `.cockpit-top__mask`）。态势面板（SitDetailPanel）同构同病。修复＝IaShellHeader.vue 两组「遮罩→面板」调序，mask 先渲染（同 z-index 下 DOM 后者在上，面板恢复可点，点外部仍落在遮罩上关闭）。
4. **存量阻塞顺修（`npm run serve` 起不来）**：①`custom/server/eval/skill-grader.ts:277` Record 值类型缺 `: string`（judge.ts:131 同款对照有）→ ts-node 严格模式 TS7008；②`custom/server/simrun/supervisor.ts:48` 用 `import.meta.url`，server tsconfig 为 commonjs → TS1343（task-boundaries.ts:17 先例注释已立法禁用），且原 `'../../../..'` 深度越界一级（源码树三级即仓根）。两处按仓内先例修复。漏网原因：vitest esbuild 不查类型＋typecheck:harness `--strict false`。

## 决策记录

- **决策 D1（bug2/3 放行口径）**：放行范围＝「已知任务工作区」（与 SecFileRootSandbox 沙箱放行清单同一事实源 `isWithinKnownTaskWorkspace`），不按 assignee 判本人——任务域通道 `/api/hermes/kanban/workspace-files` 本就无属主校验（任务沙箱限界），root 闸门再引入属主判定会造成两通道语义分叉；「本人可写/非本人只读」中的写面 8 端点本就 super_admin 全拦，无需再分。2026-10-31「root 闸门本身不放宽」旧决策在任务工作区子集上被本轮用户指令（「非本人的工作区给只读权限允许打开」）显式覆盖。
- **决策 D2（bug4 修复形态）**：遮罩调序而非改 z 值——不动 `--ia-z-header-panel` 层级变量（z-layers.ts 与 ia2.scss 成对同值有对账测试），同 z-index 下 DOM 序即层级序，零 CSS 语义变化。
- **决策 D3（bug1 修复形态）**：栏级 overflow 改 visible 而非 Teleport body（遥测面板先例）——工具下拉/插槽面板都锚定状态栏左右端，Teleport 需自管定位与关闭面，收益不成比例；z-index 110 低于页头面板层 800，不侵上层。
- **决策 D4**：守门测试取源码级断言（读 .vue/补丁文本断言关键结构），与 docs-ssot-guard/CSS 幽灵变量守门同先例——布局裁剪类缺陷在 jsdom 无真实层叠，行为级断言不可行。

## 验证

- 新增守门测试 `custom/client/ide/__tests__/ide-statusbar-overflow-guard.test.ts`（栏级不再 overflow:hidden＋两面板 z-index≥110＋补丁 734 内容锚定＋写面 8 端点 requireSuperAdmin 保留）与 `custom/client/ia2/__tests__/ia-shell-header-mask-order-guard.test.ts`（两组 mask 在面板前＋无后置残留）。
- 目标测试：ide＋ia2 客户端 244 文件 1747 例全绿；ide 控制器/simrun/eval 服务端 57 文件 488 例全绿；docs-ssot-guard 6/6（附录 A.1 登记 519 份）＋设计文档机械索引补行后培训契约 13/13。
- 活体走查（修复后，worktree 树 serve:8647＋vite:8649，非 super_admin 账号）：①铃铛→「消息」页签点击不再关闭、内容可见；②`#/app/ide?task=t_5233eb3a` 文件树正常列出（greet.py/README.md/test_greet.py…，报错消失）；③工具下拉可见（rect 320×242 全量入视口、z=110）且 zcode 按钮顶点命中即自身（可点）；④负向：任意根 `/Users/cuishi/lab/AIStudio` 仍 403、任务根 200 只读、写面 files/read 仍 403。
- 全量 `npm test`：7486 过/12 败——12 败逐一在主树（同基线未改动）复跑定性：diagram-export×3（Chrome/playwright 环境不可用，主树同红）＋specialist-presets×1（上游 routa yaml 漂移，主树同红，存量非本轮引入）＋repo-scan/secaudit/convergence/security-relay×7（20s 满载超时抖动，两树单跑均绿）。本轮引入的失败仅培训契约×1（新 spec 未登机械索引），当场修复转绿。

## 设计文档影响

DESIGN_SYNC: none
理由：三处 UI 缺陷修复＋一处只读闸门收窄（任务工作区子集），不改整合正本/数字总账口径结构；D1 决策 reversal 与补丁 734 语义已在本 spec 决策记录留痕。
