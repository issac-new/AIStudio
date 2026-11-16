# IDE 会话头部工具栏清晰化与弹窗外壳统一

> 日期：2026-11-16
> 状态：已批准（用户 2026-11-16 选定「按推荐改法全做」），实施中
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

非目标：不动六个面板的内部业务与停靠布局；不改 composer 工具条；不做整个 IDE 信息架构重设计。

## 决策记录

| 决策 | 选择 | 理由 | 类型 |
|---|---|---|---|
| 只加分组/文字还是连外壳 | 全做（用户裁定） | 用户明确选「按推荐改法全做」 | UserChallenge |
| 外壳形态 | 单组件双变体，panel 变体只统一头部不动物理停靠 | 停靠布局牵动 IDE 栅格，风险不成比例 | Taste |
| 词条落点 | `IDE_LOCAL_TEXT.chatActions`（IDE 本地字典单一事实源） | 仓规：IDE 运行期文案集中此文件 | Mechanical |

## 验证

- TDD：先写失败测试再实现——①`IdePanelShell` 渲染测试（标题/关闭/Esc/两变体类名）；②`IdeChatPane` 分组结构测试（三组容器、分隔线类、高频按钮含文字、aria-label）；③六个既有组件测试全部保持绿（testid 不变）。
- 命令：`npx vitest run custom/client/ide`；改后端无涉及，免 typecheck:harness。
- 浏览器实物走查：本 worktree dev 起前端，核对分组观感、三个文字按钮、恢复/抽帧对话框新外壳、历史/侧问/后台任务/对照面板统一头；截图留证。

## 设计文档影响

- DESIGN_SYNC: none —— 纯客户端 UI 表达层修复，不触及产品面/架构面/数字总账口径（无新路由/端点/域/补丁/依赖）。
