# IA 收口：阶段路径单一投影 + 推演子页归一 + 阶段工具可达（spec）

日期：2026-10-21
分支：`feat/ia-projection-sim-subpage`
来源：`2026-10-21-swarmstudio-complete-design.md` §9.3 未闭环缺口 #2（推演编排/设置双 URL、两套页头）与 #3（路径→阶段两份投影、17 张阶段工具卡无渲染）。

## 一、变更

### 1. 路径→阶段单一投影

新增 `custom/client/ia2/stage-path.ts`，导出 `StageKey` 与 `stageKeyForPath(path)`，承载唯一一份路径归属规则：

- `/app/teams`、`/app/agents`、`/app/stage/setup` → stage1
- `/app/stage/{reqs,design,build,accept,govern}` → stage2-6
- `/app/sim*` → null（推演独立域，不参与阶段高亮）
- `/app/gov*` → stage6
- 裸 `/app` / `/app/` → stage1（旅程页）
- 其余 `/app/*` → stage4
- 非 `/app` → null

`routes.ts` 的 `areaForPath` 与 `nav-centers.ts` 的 `centerForPath` 改为委托该函数，不再各写一份同义规则。

### 2. 推演子页单一 URL / 单一内容

`SimCenterView` 收敛为**四签 + 两个专区动作**：

- 页签：导演台 / 监督面板 / 运行监控 / 证据库。
- 专区动作：页头右侧「运行编排」「推演设置」，跳独立路由 `ia2.simOrchestration` / `ia2.simSettings`，保留 `run` / `from` query。
- 移除本页内嵌的 `OrchestrationView`（任务协同图）与 `SimSettingsView embedded`：
  - 任务协同图只留 `/app/board` 的「任务协同」签（D9：看板链交互视图只留看板）。
  - 运行编排页只留 `SimOrchestrationView`（graph specs/runs 只读），与页签语义一致。
  - 推演设置页只留 `SimSettingsView` 独立页（带面包屑/页头/返回）。
- `ia2.sim` 路由增加 `beforeEnter: simLegacyTabGuard`：旧深链 `/app/sim?tab=orchestration|settings` 重定向到对应独立路由，保留 `run` / `from`；其余 `?tab=` 原样放行。
- `SimSettingsView` 移除 `embedded` prop 与内嵌样式（唯一消费方已删除，避免死模式）。

### 3. 阶段工具卡可达

`StageShell` 在页头与页签之间渲染 `STAGE_META.tools` 的紧凑工具行（仅当该阶段有工具时）：

- 每项：`data-testid="stg-tool-<key>"`、标题取 `desc`、点击按 `tool.to` 跳转。
- 阶段 2-6 共 17 张工具卡从死数据变为可达入口；阶段 1 无工具，不渲染空行。

## 二、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 路径归属只留 `stageKeyForPath` 一份 | 两份同义规则（`areaForPath` / `centerForPath`）靠注释「同步」维持，任何一侧改动都会造成场景条与左栏高亮漂移；单一实现+一致性测试才能根治 |
| D2 | 推演页签收敛为四签，编排/设置改为专区动作 | `SimCenterView` 头注原本就写「运行编排与推演设置是专区级动作，放页头按钮」，实现却做成六签；四签与 `sim-tabs.ts` 的单一事实源一致 |
| D3 | 编排签不再内嵌任务协同图 | 同一「运行编排」名在两处呈现不同内容（页签=任务协同图，独立页=graph specs/runs），是比双 URL 更严重的语义分裂；按 D9 任务协同图只留看板 |
| D4 | 旧 `?tab=` 深链走路由守卫重定向，不在组件内兼容 | 守卫在渲染前完成，避免先渲染错误面板再跳；保留 `run`/`from`，旧书签零断链 |
| D5 | `SimSettingsView` 删除 `embedded` 模式 | 唯一消费方（SimCenterView 内嵌）已移除；保留死分支会让后续误以为存在第二种承载方式 |
| D6 | 阶段工具行用紧凑芯片，不做卡片墙 | 17 张卡若做卡片墙会与页签重复并挤占首屏；芯片行只承担跨页/跨域直达，符合「单层页签+一个主操作」的既有约束 |
| D7 | 不在本轮处理 404、三治理面去留、导演/26 步详情归口 | 三者均需产品或后端决策，超出本轮导航收口范围；如实留在设计正本 §9.3 |

## 三、验证

- 定向测试：
  - `npx vitest run custom/client/ia2/__tests__/stage-path.test.ts`
  - `npx vitest run custom/client/ia2/__tests__/routes.test.ts custom/client/ia2/__tests__/sim-center-shell.test.ts custom/client/ia2/__tests__/stage-shell.test.ts custom/client/ia2/__tests__/workbench-nav-centers.test.ts custom/client/ia2/__tests__/unified-nav-guard.test.ts`
- 构建：`npm run build`（client + verify-dist）。
- 浏览器（`npm run dev`，8649）：
  - `/app/sim` 四签 + 两个专区动作；点击「运行编排」落 `/app/sim/orchestration`，内容为 graph specs/runs 而非任务协同图；点击「推演设置」落 `/app/sim/settings`。
  - `/app/sim?tab=orchestration&run=r1` 重定向到 `/app/sim/orchestration?run=r1`；`?tab=settings` 同理。
  - `/app/board?tab=orchestra` 任务协同图仍在。
  - 阶段页（如 `/app/stage/design`）出现「阶段工具」行，点击跨域入口可跳转。
  - 左栏阶段高亮与场景条在 `/app/teams`、`/app/agents`、`/app/gov/audit`、`/app/sim` 四处一致。
- 未验证项如实记录（如无真实 running run 时的导演台数据态）。

## 四、验证账（2026-10-21 实施轮）

- 定向测试：`npx vitest run custom/client/ia2/__tests__/stage-path.test.ts ...` 7 文件 / 103 用例全绿；全量 `npx vitest run custom/client/ia2` **92 文件 / 672 用例全绿**。
- 构建：`npx vite build --config vite.config.overlay.ts` rc=0（15.67s），`node scripts/verify-dist.mjs` OK（口令扫描零命中）。
  - 注：`npm run build` 的 prebuild `ensure-injected` 在 zcode 树干净时尝试重放 7 条 zcode 补丁，001 与当前 zcode 版本不匹配而失败；属既有环境问题，与本批零交集。构建验证走直接 vite 命令。
- 浏览器（8669，dev 热更新；8649 被另一 worktree 的 serve-main 占用，未干扰）：
  - `/app/sim`：四签（导演台/监督面板/运行监控/证据库）+ 页头两个专区动作在位；无 orchestration/settings 页签。
  - 点「运行编排」→ `#/app/sim/orchestration?run=...`，页面为 `orc-page`（graph specs/runs），无 VueFlow 任务协同图。
  - 点「推演设置」→ `#/app/sim/settings?run=...`，`sst-page` 与返回钮在位。
  - 旧深链 `#/app/sim?tab=orchestration&run=p2-verify-20261019&from=3` → `#/app/sim/orchestration?run=p2-verify-20261019&from=3`（run/from 保留）。
  - `/app/stage/design`：阶段工具行 3 张（看板·任务协同/监督面板/质量门与流程），点击「质量门与流程」→ `#/app/stage/design?from=3`；`/app/stage/setup` 无工具行。
  - `/app/teams` → `#/app/stage/setup?tab=teams` 且左栏 stage1 高亮；`/app/gov/audit` → `#/app/stage/govern?tab=audit` 且 stage6 高亮；`/app/sim` 不出现日常阶段高亮。
  - 控制台仅既有 sim 端点 503（本环境未配置推演后端），无 JS 页面异常；截图受 in-app browser 隐藏视口限制未取，结构走查以 DOM/路由断言为准。
- 未验证：真实 running run 下的导演台数据态；侧栏与页头同时提供编排/设置入口（双入口可后续择一收敛，不阻塞本批）。

## 五、不做（挂账）

- 404 诚实页（需改上游 catch-all 或加全局守卫，单独立项）。
- ⑥八签 / GovOverlay 七区 / 设置七域的去留表与合并（需产品裁定）。
- 导演 run 与 26 步 run-state 的详情归口（需产品裁定）。
- G5 真实审批状态机、UAT 写路径（需服务端状态机设计）。
