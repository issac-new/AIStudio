# IDE 会话头部工具栏清晰化与弹窗外壳统一

> 日期：2026-11-16
> 状态：已批准（用户 2026-11-16 选定「按推荐改法全做」），终审收口完成（IMPORTANT 1-3 已修；Minor 4-8 挂账待裁）
> 基线：origin/main `6dab0115a`
> 读者：IDE 面维护者与验收人

## 变更

问题（用户反馈实测）：IDE 会话头部 14 个纯图标按钮看不出用途；点击后打开的东西分属六种交互形态（全屏对话框×2、行内查找条、侧滑面板×4、浮窗×3、气泡×2、路由跳转），布局与跳转观感杂乱。

1. **分组**：`IdeChatPane.vue` 头部 actions 分三组并加竖分隔线——`会话`（＋新建/⏎恢复/🎞抽帧）、`查找与回顾`（🔍查找/🕘历史）、`工具`（⇋侧问/⏱后台任务/⇔对照/计划/子代理/电脑操作/用量）＋`诊断`（会话诊断/活动收件箱）。
2. **高频动作加文字**：新建、恢复、查找三个按钮改为「图标＋短文字」，其余保持图标；短文字入 `IDE_LOCAL_TEXT.chatActions`（中英双语）。
3. **统一弹窗外壳**：新增 `IdePanelShell.vue`（props：`title`、`variant: 'dialog'|'panel'`、`onClose`、`testid`；统一宽度/标题栏/关闭按钮/Esc 关闭）：
   - dialog 变体接管 `IdeRecoveryDialog`、`IdeVideoFramesDialog` 的容器+遮罩+头部；
   - panel 变体接管 `IdeHistoryBrowser`、`IdeBtwPanel`、`IdeBgTasksPanel`、`IdeSideSessionPane` 的头部条（标题样式/关闭钮统一，停靠位置不动）。
4. 无障碍：每组容器 `role="group"`＋`aria-label`；全部按钮保留 `aria-label`/`title`。
5. **终审收口（final review IMPORTANT 1-3，2026-11-16 同批）**：
   - 级联序：`--label` 修饰符改为嵌套在 `.ide-chat__action` 内的复合选择器 `&.ide-chat__action--label`，`width:auto/font-size:12px` 不再被 base 同特异性压制（原独立规则写在 base 之前失效）；
   - 模态 z 层：dialog 变体 `z-index` 60→400，壳内注释立层级单一事实源（60=浮窗、400=模态），压过 splitter 100/colhead 95/briefing 90 与后挂 z-60 浮窗；
   - Esc 层次：模块级开窗栈（后开先关，一次 Esc 只关栈顶）＋ IME 守卫（`isComposing || keyCode === 229` 直接 return），多层同开不再一次全关、Safari 中文组词取消候选词不连坐关面板。

非目标：不动六个面板的内部业务与停靠布局；不改 composer 工具条；不做整个 IDE 信息架构重设计；终审 Minor 4-8 不在本批（已记录待裁）。

## 决策记录

| 决策 | 选择 | 理由 | 类型 |
|---|---|---|---|
| 只加分组/文字还是连外壳 | 全做（用户裁定） | 用户明确选「按推荐改法全做」 | UserChallenge |
| 外壳形态 | 单组件双变体，panel 变体只统一头部不动物理停靠 | 停靠布局牵动 IDE 栅格，风险不成比例 | Taste |
| 词条落点 | `IDE_LOCAL_TEXT.chatActions`（IDE 本地字典单一事实源） | 仓规：IDE 运行期文案集中此文件 | Mechanical |
| 级联序修法 | 复合选择器（嵌套 `&.ide-chat__action--label`）而非仅调规则顺序 | 特异性抬高后不依赖书写顺序，重排不复发 | Mechanical |
| 模态 z 层取值 | 400（介于 GoalBudgetFloat 340 与 EngineModelsDialog 500 之间） | 终审建议值：压过全部既有 chrome 与 z-60 浮窗，低于更高阶全局模态（500/600） | Mechanical |
| Esc 层次机制 | 模块级 symbol 栈（普通 `<script>` 块，非 `<script setup>` 每实例态） | 后开先关只关栈顶；`<script setup>` 顶层是每实例执行，模块级状态必须独立块 | Taste |
| IME 守卫形态 | `isComposing \|\| keyCode === 229` 双分支 | Safari 老版组词期不置 isComposing，只置 229 | Mechanical |

## 验证

- TDD：先写失败测试再实现——①`IdePanelShell` 渲染测试（标题/关闭/Esc/两变体类名）；②`IdeChatPane` 分组结构测试（三组容器、分隔线类、高频按钮含文字、aria-label）；③六个既有组件测试全部保持绿（testid 不变）。
- 终审收口 TDD：`IdePanelShell.test.ts` 先加 RED——两壳叠开一次 Esc 只关栈顶（后挂载者）、再按关下一层；isComposing/keyCode 229 的 Esc 不触发关闭且普通 Esc 仍关闭。实测 RED 5 failed（新增 5 项全红、既有 12 项绿）→ 实现后 GREEN 17/17。
- 终审收口守门（jsdom 无真实层叠/级联，源码级断言）：`chat-toolbar-clarity.test.ts` 新增——复合选择器在位且独立 `--label` 规则不回潮；dialog z-index ≥400 且「60=浮窗、400=模态」注释在位；Esc 接线含 IME 双守卫。
- 命令：`npx vitest run custom/client/ide`（133 文件 861 测试全绿）；`npm test` 全量（1171 通过｜6 跳过，9025 测试通过｜11 跳过，0 失败）；`git diff --check -- custom/client docs` 干净。改后端无涉及，免 typecheck:harness。
- 浏览器实物走查：本 worktree dev 起前端，核对分组观感、三个文字按钮、恢复/抽帧对话框新外壳、历史/侧问/后台任务/对照面板统一头；截图留证。

## 设计文档影响

- DESIGN_SYNC: none —— 纯客户端 UI 表达层修复，不触及产品面/架构面/数字总账口径（无新路由/端点/域/补丁/依赖）。
