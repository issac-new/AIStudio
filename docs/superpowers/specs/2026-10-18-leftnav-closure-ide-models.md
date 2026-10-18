# 左侧栏逐页闭环与 IDE 模型/辅助栏改造（2026-10-18）

分支：`fix/leftnav-closure`
来源：用户 2026-10-18 两条实报——（1）左侧栏挨个打开后的页面要限制在一屏、功能就地闭环、不跳新页面；（2）IDE 工作区的模型选择要用 Ycode 的模型配置，右侧辅助栏要中文可读（不能只有图标）。

## 一、左侧栏逐页闭环

1. **阶段页运行上下文统一**：②需求/⑤验收/⑥治理页头加 `RunSelector`；删除 `TracePanel`/`DeliveryPanel`/`GovIssuesPanel`/`GovAiQualitySection` 的手打运行目录名输入，面板经 `useRunContext` 跟随页头选择，失败保留原文。
2. **②启动运行页签化**：新增 `launch` 页签，直接挂 `OrchestrationView`；「启动准备」按钮改成切本页页签，不再跳 `/app/sim/orchestration`。
3. **④/⑤审批就地开页签**：④的「待你决定/处理审批」切到本页「审批待办」，⑤切到「G5 审批」，不跳 `/app/inbox`。
4. **④主操作改页内**：主按钮从「打开工作台」（整页跳转）改为「打开看板」页签；今日工作空态也只给「打开看板/处理审批」两个页内动作。
5. **③排期页内跳转**：「去任务分解排期」切换本页「任务分解」页签，不跳看板。
6. **①环境与资产就地配置**：模型服务商组件嵌入页签，删除「打开模型服务商」整页链接；五步页脚删除「系统设置」跳转。
7. **全流程推演**：运行编排/推演设置收进本页页签（`?tab=orchestration|settings`），删除页头跳转按钮；页头/页签固定，内容区滚动。
8. **检索/工作台任务就地处置**：检索的任务结果改开 `KanbanTaskDrawer`；工作台左栏任务簇 chip 和右栏「处理任务」也改开抽屉，不跳看板。

## 二、IDE 模型选择使用 Ycode 配置

- 服务端 `GET /api/ide/engine-models` 增加 `zcode.groups`：只读 `ZCODE_HOME/v2/config.json` 的启用 provider/模型 id/名称/推理档，不出口 `options`（密钥/端点）。
- 客户端 `fetchEngineCatalog` 取源优先级：**zcode.groups → IDE 独立目录 → Hermes appStore**；`source` 字段可观测。
- `IdeChatPane` 的模型失效判定从 `appStore.modelGroups` 改为实际选择源 `modelGroupsView`；两源目录先归一为 `{ provider, label, models: [{id}] }` 再共用（Ycode 为对象组、Hermes 为 string[]），否则对象组在 `includes` 判定下永远查不到，可用模型被误报「已移除」（2026-10-18 8649 走查实录：选中 GLM-5.3-Flash 仍报失效）。
- 运行期即时兼容：用当前 Ycode 配置生成 `runtime/ide-engine-models.json`（仅 provider/模型/baseURL，无密钥），后端无需重启即可让选择器读到 Ycode 模型；服务端 `zcode.groups` 在下次后端重启后成为单一动态来源。

## 三、辅助栏中文可读

- `IdeSidePane` 的 17 个页签在图标旁常驻中文短名（文件/审查/终端/引用/记忆/档案/工具/轨迹/流程/看板/辅助/画板/浏览器/资源/MCP/钩子/命令）；英文 locale 显示英文短名。
- 页签条允许换行；短名 11px，不缩小到不可读；`title` 保留全名。

## 决策记录

- D-1：页面内功能优先页签/抽屉，跨页只保留对象动作（打开会话/运行详情）。理由=用户明确要求不跳新页面，页签是同一屏内的唯一层级。
- D-2：阶段页运行选择放页头，面板不再各自维护输入。理由=②⑤⑥同源于一次运行，重复手打目录名既慢又会出现口径不一致。
- D-3：启动运行留在②阶段页的 `launch` 页签，而不是跳全流程推演。理由=启动是需求阶段的正常下一步；整轮监控仍在独立专区，互不混排。
- D-4：Ycode 模型配置为第一取源，IDE 独立目录次之，Hermes 最后。理由=用户明确要求 IDE 使用 Ycode 的模型配置；Hermes 目录保留仅为未初始化时的过渡，不空白。
- D-5：服务端只出口 provider/模型元数据，不出口 `options`。理由=密钥与端点不应经模型选择器出现在前端。
- D-6：辅助栏图标不能作为唯一标识，中文短名常驻。理由=用户实报「图标不知道具体是什么」。
- D-7：模型失效横幅的「重新选择」不再跳 Hermes 设置页，直接开输入框模型选择器；选择源已是 Ycode 目录。
- D-8：失效判定与选择器共用归一后的目录视图（string / {id} 双形态统一），不在每个消费点各写一套形状判断。理由=两处形状假设不一致正是本次误报的根因。
- D-9：横幅按钮文案按 locale 就地取「重选模型 / Reselect model」，不再复用 patch 473 的「去设置重选」。理由=D-7 改变行为后旧文案与事实不符；禁 inject 期改补丁不生效，只会在补丁与运行态之间制造漂移，待下一次 inject 时再把词条正式回写。

## 验证

- focused：stage-shell、sim-center-shell、sim-b4-b6-panels、gov-ai-quality、search-view、workbench-flow、side-nav、engine-models-catalog、model-switcher-source、side-pane、engine-models-rest 全绿。
- 全量：4865/4874 通过，1 个 `simulation-node-executors` 在并发下偶发不等（单独运行 9/9 通过，属既有时间敏感用例）。
- 8649 走查：阶段页运行选择器/启动运行页签、④看板页签、检索任务抽屉、全流程推演六页签、IDE 辅助栏中文短名、模型选择器 Ycode 目录。
