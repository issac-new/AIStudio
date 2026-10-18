# IDE 输入区与 ZCode 输入框对齐（composer 工具条五控件 + 模型面板管理入口）

日期：2026-10-18 ｜ 状态：实施中 ｜ 分支：`feat/ide-composer-parity`

## 主旨三句话

- 唯一主旨：IDE 工作区聊天输入区的控件布局与 ZCode 桌面端输入框保持一致——输入区下方一排「模式 / 电脑操作 / 上下文容量 / 模型选择 / 思考强度」，模型选择面板带「管理模型」入口。
- 受众及所需：SwarmStudio IDE 日常使用者（用户本人），需要在 IDE 里获得与 ZCode 相同的肌肉记忆。
- 读完促成什么动作：验收时逐控件对照 ZCode 输入框走查一遍即可。

## 参照锚点（ZCode 侧）

- 工具条组装：`upstream/zcode/packages/ui/src/v4/composer/V4ComposerToolbar.tsx`（模型/思考/context 簇）；`V4ComposerModeControls.tsx`（模式）；`V4ComposerCuaEntry.tsx`（电脑操作入口）。
- 词条：`upstream/zcode/packages/ui/src/i18n/locales/zh-CN.ts:4374`（上下文容量）、`:4505`（管理模型）、`:4531-4534`（切换模式 / 电脑操作）。
- 模型面板管理入口语义：`chat.toolbar.model.manageModels` = 打开模型供应商管理（ZCode 落设置页；IDE 落已有的引擎目录管理对话框 `IdeEngineModelsDialog`）。

## 现状（IDE 侧，main c2067d1f）

- 模型选择按钮在 ChatInput（上游复用件）底部行，点击开 `ide-input-model-picker`（锚在输入区上方）；面板无管理入口。
- 思考档按钮浮在输入区右上（commit 2aee045a 的补丁形态），不在同一行。
- 模式（IdePermissionSwitcher 七档）在头部动作区；上下文水位条（IdeContextBar）游离在输入区上方独立一行；电脑操作入口不存在。
- 头部另有 IdeModelSwitcher（含 Auto 路由 + 管理引擎目录），与输入区模型按钮功能重叠，双入口。

## 方案

1. **新 composer 工具条行**（`IdeChatPane` 内，ChatInput 正下方，与 `ide-chat__model-picker` 同锚容器）：按 ZCode 顺序一排五控件——模式（IdePermissionSwitcher 迁入，面板改向上开）、电脑操作（新声明式开关）、上下文容量（IdeContextBar 迁入）、模型选择（行内触发器，复用现有 `onModelClick`/picker 逻辑）、思考强度（既有 effort 控件从右上浮层迁入，菜单改向上开）。
2. **模型面板补齐**：面板顶部加「⚡ Auto（复杂度路由）」（吸收 IdeModelSwitcher 的 pickAuto/tierModels 逻辑），底部加「⚙ 管理模型…」打开 `IdeEngineModelsDialog`，保存后重拉目录（写穿）。ChatInput 内置模型按钮在 IDE 以 :deep 隐藏（单一入口，防双触发器）。
3. **头部收敛**：移除头部 IdePermissionSwitcher 与 IdeModelSwitcher（功能全部并入输入区行与面板），IdeModelSwitcher.vue 及其专属测试随功能迁移删除，源选择守门断言迁入 input-model-button 测试。
4. **电脑操作（诚实语义）**：per-session 开关（localStorage 持久化），开启/关闭时向当前会话发一条 `[computer-use-policy]` 声明（与 IdeMcpPane websearch 档同一既有模式），tooltip 注明声明式与引擎 CUA 插件通道未接的事实。
5. **模式穿线升级**：选择除写 localStorage 外，PUT `/api/hermes/permmodes/session-mode/:profileId`（profile=ide.agentId）——服务端落盘随任务派发 createSession.config.mode 生效（session-mode-controller.ts 既有通道）；面板诚实注保留（会话内即时切换仍待 chat 发送链接引擎 mode）。

## 决策记录

- D-1：五控件放 ChatInput 正下方独立一行，不塞进 ChatInput 内部。理由=ChatInput 是上游复用件无插槽，塞入须开 patch；独立行同样满足「输入区下方」，且全部落在 overlay 自有代码。
- D-2：电脑操作做声明式开关（发 `[computer-use-policy]` 会话消息），不仿 ZCode 的插件启动语义。理由=ZCode CUA 是宿主插件深集成（权限代理/Helper，`packages/services/src/cua-permission-broker/`），IDE 的引擎 WS 桥无该通道；声明式是本仓既有模式（websearch 档），诚实且零伪造。
- D-3：模型面板的管理入口开 `IdeEngineModelsDialog` 而非跳设置页。理由=IDE 模型目录本就独立于 Hermes 设置页（2026-09-26 用户指令），对话框保存后写穿重拉，与 ZCode「面板内直达管理」同位。
- D-4：头部 IdeModelSwitcher 删除、Auto 路由与管入口并入输入区面板。理由=「与 ZCode 一致」意味着模型选择只有输入区一个入口；保留双入口是本次要消除的不一致。
- D-5：模式选择加 REST 穿线但不动 chat 发送链。理由=session-mode REST 与 mention-dispatch 穿线已在线（session-mode-controller.ts 头注），接入是纯增益；chat 发送链接引擎 mode 是独立轮（组件头注既有挂账），本轮不扩。
- D-6：思考档/上下文条/模式面板统一向上开。理由=工具条贴屏底，向下开必然被裁（ZCode 同位组件同样 `side: "top"`，display.tsx:313）。
- D-7：既有测试锚点全保（ide-perm-*、ide-effort-*、ide-input-model-*、ide-context-bar）；`model-switcher-source.test.ts` 的双源守门断言迁入 `input-model-button.test.ts` 后删原文件。理由=测试跟着被守门的行为走，行为没丢测试不丢。
- D-8（变基补记）：main 并行进 9c0ae4b1（思考档 Teleport 进 ChatInput 底栏左簇），与本批同域。本批五控件同排的目标下，思考档落 composer 行、Teleport 方案并位退役（宿主解析/回落浮层代码随删）；其「空会话补默认模型」（adoptDefaultModelIfEmpty）与本批无冲突，原样保留。理由=两方案不能并存（双触发器/双位置），用户本批指令的粒度（五控件一排）是裁决依据。

## 验收

- [ ] vitest 全绿（新增 composer 行为断言 + 迁移断言；无删除行为）
- [ ] vue-tsc 零错
- [ ] `npm run dev`（8649，后端复用 8647）浏览器走查：输入区下方一排五控件齐、顺序对、各自可交互、模型面板有 Auto 与管理模型、管理保存后目录即刷
- [ ] 头部无重复入口（模式/模型已收敛）
