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
- **默认模型也取 Ycode 配置**（2026-10-18 用户追加指令）：服务端返回 `zcode.default`，优先 `setting.json` 里用户选中的 provider family（`providerFamilyDomain` + `modelProviderFamilySelectedKeys`），否则取首个启用 provider 的首模型。客户端新会话（含标题栏＋、命令面板、复用的空会话）都带这个默认；空会话若模型为空或不在目录内（历史 `aim` 等），自动切换为默认，不再一进 IDE 就弹失效横幅。旧后端未重启期间由独立目录 `config.defaultModel` 供给同一默认。
- **与 provider 管理器对齐**（2026-10-18 用户实报「怎么和本机 zcode 的配置不一样」）：默认与目录顺序的第一来源改为 `provider_config.json` 的 `providerOrder` + `providerRules`（显示名 `providerName`、组内模型 `modelOrder` 与目录交集重排、规则 `enabled:false` 剔除）；`setting.json` family 键降为次级兜底——实测本机 family 键指向 coding-plan/GLM-5.3-Flash，而用户实际首选是 providerOrder 首位 XGLM（47b8a0af）/glm-5.3。
- **与 ZCode 3.15.3 UI 命名空间对齐**（用户二次实报「还是旧的」）：ZCode 选择器用的是 UI 命名空间——模板供应商（如 `bigmodel-api`，用户命名 SGLM，modelOrder 以 GLM-5.3 为首）经 3.15.x 内置清单（`runtime/provider/<platform>/<ver>/…/zcode-builtin.json` 取最大版本）解析到引擎条目（`builtin:bigmodel-coding-plan`）。目录分组=providerOrder 全量解析（rule 直连引擎 id 或 `templateId` 走清单，alias 记 UI id），未覆盖的启用引擎条目垫后。**默认模型第一信号 = `cli/rollout/model-io-*.jsonl` 最新记录的 `model {providerId, modelId}`**（本机正在用的 bigmodel-api/GLM-5.3，经 alias/provider 双键匹配回引擎组），压过 providerOrder 首位。实测：XGLM → SGLM(GLM-5.3 首) → kimi-mid → kimi-max → Bigmodel API，默认 SGLM/GLM-5.3。

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
- D-10：默认模型跟随 ZCode 的 provider family 选择（`setting.json`），没有显式 family 时取首个启用 provider 首模型；不复用 Hermes 的 `selectedModel`（`aim`/`qwen` 等 CLI 别名不在 ZCode 目录内，必然误报失效）。理由=用户实报「Ycode 默认使用 Zcode 的模型配置」；默认源与选择源必须同一事实源。
- D-11：默认与目录排序的第一事实源是 `provider_config.json`（provider 管理器），`setting.json` family 键只是 OAuth 套餐 UI 的选择，两者可能指向不同 provider。理由=用户实报默认与「本机 zcode 的配置」不一致；实测 providerOrder 首位 XGLM/glm-5.3 与 family 键指向的 coding-plan/GLM-5.3-Flash 不同，前者才是实际所用。
- D-12：目录用 ZCode UI 命名空间（模板供应商经 3.15.x 内置清单解析到引擎条目、用户命名优先），默认模型第一信号=rollout「正在用」记录。理由=用户二次实报「还是旧的，和本机 Zcode（3.15.3）不一样」——config.json 引擎序/providerOrder 序都不等于「正在用」；本机在用 bigmodel-api(=SGLM)/GLM-5.3 既非引擎首组也非 providerOrder 首位，只有 rollout 记录能忠实表达。providerOrder 首位、family、首组依次兜底。
- D-13：客户端只采信带 `zcode.default` 的 zcode 目录（新服务端在目录非空时必出 default，可作版本判据）；旧后端无 default 的 zcode.groups 不采信，回落独立目录（种子已按新命名空间/顺序/默认配置）。理由=用户指令「直接重新加载配置刷一下」——运行中 8647 是旧代码且 run21 期间不可重启，不加判据则旧目录永远压过种子，分组刷新不生效；判据在后端升级后自动失效回采信服务端。2026-10-18 追加：中间版本后端（有 default 无档位）同样不采信——判据升级为「default + 思考档位」双标志，思考档控制（D-14）在半新后端下经种子生效。
- D-14：思考档与 ZCode 一致，不用 Hermes 推理强度（2026-10-18 用户指令）。档位单一事实源=ZCode 内置清单 `modelConfigRules.modelRules`（modelMatch 正则后命中覆盖，optionSpecs.reasoningLevel.values），服务端把它补进目录 per-model `reasoningLevels`（config.json 已显式声明时优先）；本机实测 glm-5.3→low/high/max、GLM-5.3(coding-plan)→关/开、k3→low/high/max。IDE 侧禁用并隐藏 ChatInput 内置档位控件（其选项读 Hermes model_meta/默认档），换成 IdeChatPane 自有「思考」选择器，写同一会话字段 setSessionReasoningEffort——引擎侧消费路径不变；模型无档位不渲染控件（不落 Hermes 默认档）。控件位置：浮于输入区右上角（，菜单向下开）——2026-10-18 实测首版右下定位（right:48/bottom:6）在窄列被 ChatInput 的 input-wrapper 层级覆盖不可见，composer 底行也无空位。

## 验证

- focused：stage-shell、sim-center-shell、sim-b4-b6-panels、gov-ai-quality、search-view、workbench-flow、side-nav、engine-models-catalog、model-switcher-source、side-pane、engine-models-rest 全绿。
- 全量：667 个测试文件通过 / 5 跳过；4868 个用例通过 / 8 跳过，零失败（2026-10-18 收口轮两次全量复跑一致）。
- 构建：`vite build` 临时 outDir 通过（22.7 秒，64MB），未覆盖共享 dist。
- 8649 走查：六阶段页与全流程推演（6 页签）均有左侧栏/顶部栏、无上游 rail、无页面级滚动（超出内容在 `.stg__body`/`.sim-center__body` 内滚）；②启动运行页签渲染编排表单，④看板页签就地渲染看板；检索页 1156 条结果与工作区过滤可用；专题三页统一壳层；辅助栏 17 个中文短名按六组逐组核对；模型选择器分组显示 BigModel - Coding Plan / Bigmodel - API Key / kimi-max / SRK / kimi-mid，选 GLM-5.3-Flash 与 k3 后均不再误报失效。
