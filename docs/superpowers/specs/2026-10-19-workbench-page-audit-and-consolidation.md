# 工作台全页面走查与整合重规划（2026-10-19）

## 一、结论先行

本次以 **58 条路由**（六阶段 29 页签 + 全流程推演 6 签 + 常用/专题/旧链接/IDE）在真实 run21 数据上逐页走查，随后清场做全新 0→1 环境。走查发现并修复了 9 类结构性问题：运行选择器空态/ID 口径、工作台群聊跳出 `/app` 壳、工作台三栏被全局 `.wb` 规则压成竖排、G2 页签空白、推演总览 26 步表压住右栏、治理仓根写死旧盘、SIM studio 缺 `OBS_SIM_ROOT`/分支仓、构建 custom 符号链接指向旧 worktree、预检只读契约副作用。修复后 overlay 全量 **5237 用例**、simharness **181 门禁**全绿；全新环境 prelaunch **22/22** 全绿；smoke G1/G3/G4/G5/G6 通过（G2 为测试账号 role=admin 的假阳性）。

剩余主要矛盾从「页面打不开/数据 503」转为「信息密度与入口重复」：注意力条横排截断、工作台右栏长列表、阶段页部分页签无主操作、专题页体量过大。下面给出按 P1-P3 的整合批次，不与已修结构问题混在一起。

## 二、走查方法与证据

- 环境：SIM studio `:8802`（`OBS_SIM_ROOT=/Users/cuishi/lab/ncwk-sim-mux`），run21 数据；1440×900、深色、中文。
- 方法：Playwright 逐路由打开，采集最终 URL、正文长度、可见按钮数、控制台错误、旧术语、空态标记与截图；对工作台/阶段页/推演总览补 DOM 盒模型探针。
- 证据：`/tmp/ncwk-walkthrough-final/`（58 张截图 + `results.json` + `report.md`）。
- 清场后：`mx-clean --apply --reset-central --reset-workspaces --reset-memory`，中央仓孤儿重立 `f8348c8`（旧历史 tag `mx-clean-20261019-012939-pretrunc`），runs/ 为空；`mx-setup` 供给 30 账号/42 profiles/28 板；`mx-up` 起 8801+8802。

## 三、已修复（结构性问题）

| # | 问题 | 修法 | 锚 |
|---|---|---|---|
| 1 | 流程总览/推演总览停在「选择运行…」，run-state 不加载 | RunSelector 自动选最新轮；运行中心 `sim-<目录>` 复合 ID 归一为目录名 | `custom/client/ia2/views/sim/RunSelector.vue`；overlay `58d360bc` |
| 2 | `/app/collab` 被内嵌 GroupChatView 跳到 `hermes.groupChatRoom`，整页出壳且出现上游侧栏 | `/app/collab`、`/app/dash` 补 `standaloneEmbed`；补丁 665 让嵌入态只 join 不改父路由 | `custom/client/ia2/routes.ts:200-213`；`patches/665-client-groupchat-embedded-no-route-escape.patch` |
| 3 | 工作台三栏竖排（`.wb` 被全局同名规则改成 flex） | `wbGridStyle` 内联 `display:grid`，压过全局规则 | `custom/client/ia2/views/WorkbenchView.vue:117` |
| 4 | ③分析设计「质量门 G2」整页空白 | `TAB_COMPONENTS` 补 `g2: StageGatePanel`（`TAB_PROPS.g2` 已在） | `custom/client/ia2/views/stage/StageShell.vue:121` |
| 5 | 推演总览 26 步表横向溢出压住右栏六道门 | 左栏 `overflow-x:auto` + 表 `min-width:760px` | `custom/client/ia2/views/sim/OverviewPanel.vue` 样式 |
| 6 | 账户绑定/文档评审 404；分支交付 503 | 治理仓根 `GOVERNANCE_REPO → OBS_SIM_ROOT/central/aipaydev → 旧 NVMe` 回落；studio 注入 `SIM_BRANCHES_REPO/SIM_ANCHOR_REPO` | `custom/server/governance/repo-root.ts`；simharness `mux/mx-lib.sh` |
| 7 | studio 未带 `OBS_SIM_ROOT`，推演端点全 503 假绿 | `ensure_studio_up` 显式注入；prelaunch ⑤ 增加进程 env 机械检查 | `mux/mx-lib.sh:518`；`mux/mx-prelaunch-check.sh` |
| 8 | 只重建客户端时 product-dist 不同步；上游 custom 符号链接指向旧 worktree，服务端编旧代码 | 快照双 mtime（server+client）；inject 校验 realpath，目标错则重链 | `mux/mx-lib.sh`；`scripts/inject.mjs` |
| 9 | 门禁测试调用 `--print-paths` 在真 SIM_ROOT 造测试 run，prelaunch ⑧ 误判 | `--print-paths` 纯只读（不建 evidence/锁目录）；`mx-clean`/`mx-smoke` 全角变量名 `${VAR}` 收口 | `mux/mx-report-gen.py`；`mux/mx-clean.sh`；`mux/mx-smoke.sh` |

## 四、仍待整合（重新规划）

### P1：一屏内闭环与入口去重（建议下一批）

1. **注意力条降噪**：当前横排 10+ 个截断 chip（`Restore DEF-BE…`、`【缺陷】…`、`+9`），占满首屏一行。建议收成「N 项待处理」一个计数入口，点开抽屉按类型（阻塞/待审/待分类）分组，保留严重项前 3 条；与 `/app/inbox` 同一数据源。
2. **工作台右栏「任务·决策」分页**：17 条长列表平铺，且「任务受困」与全局「阻塞」用词不一致。建议页签「待我处理 / 全部 / 已处理」，行内保留验收/打开；术语统一为「阻塞/进行中/待验收」。
3. **阶段页每签一个主操作**：G2 已修；排期/风险与交接/质量与测试等空态需给人话原因 + 一个就地动作（去任务分解、去审批、去运行总览），不留纯空白页签。
4. **IDE 空态引导**：无任务时左栏 0 任务、文件树「无子目录」。建议默认展示最近任务或明确「从看板选一张卡带入工作区」，并保留「进入会话工作区」主按钮。
5. **评测直链**：feature off 时 `/app/eval` 静默回 `/app`，书签会误解。建议注册一个「评测未启用」页或明确 404，不静默落首页。

### P2：体量与专题页收敛

6. **推演总览密度**：26 步表 + 交付物 14 件 + 右栏六道门同屏，表已可横向滚动；下一步可折叠七幕分组、默认只展开当前幕，右栏固定。
7. **专题页统一壳**：流程架构/本体/评测/技能治理四页体量差异大（技能治理约 6.4 万字符）。建议统一「左栏筛选 + 单层页签 + 详情抽屉」，重页签懒加载分段。
8. **检索与工作台聚类**：检索页 8k 字符/118 按钮已可用；建议加结果类型计数与保存筛选，任务结果与工作台任务簇共用抽屉。
9. **看板入口去重**：`/app/board`、③任务分解、④看板三处同源。保留 `/app/board` 为全量入口，阶段页签只留当前阶段过滤视图，并互相「在阶段页打开」回链。

### P3：术语与文案

10. 旧链接 `/app/runs`、`/app/gov/docs` 等保留重定向（零断链），但不要再出现在新文档/导语；数据里的「任务受困」等历史文案统一到「阻塞/停滞」。
11. 清理已退场的 i18n 键（`sim-delivery`/`sim-trace` 导语在推演区已不渲染）与历史注释中的「仿真中心/治理中心/驾驶舱」。

## 五、全新 0→1 环境就绪状态

- prelaunch：**22 过 / 0 败**（2026-10-19 01:56）。
- smoke：PASS=8 / FAIL=1（G2）。G2 的「ACL 泄漏」为测试账号 `chen` 本身 `role=admin` 的假阳性；同轮 G3 板外 assignee 拒认领通过，说明团队围栏生效。G4 真实派生 `fanfan-sys-analyst` 到 `done`，provider 回退 `custom:cc-switch/aim` 可用；G1 双用户 DM 往返通过，矩阵适配器实际可用（`mx-up` 的 90s 告警为早期假阴性）。
- 残留告警：根配置 `model.provider: builtin:bigmodel-coding-plan` 在 SIM runtime 未识别，回退 `custom:cc-switch/aim`；建议下一轮前把 SIM 根配置 provider 改为可用值，避免每条回合打 WARNING。
- 中央仓：`main` 孤儿重立 `f8348c8`，远端仅 main；runs/ 清空；30 账号/42 profiles/28 板在位。

## 六、决策记录

- D-1：结构性问题（打不开/503/出壳/空白页签）立即修；信息密度与入口整合按 P1-P3 分批，不与结构修复混提交。
- D-2：运行选择器以「最新一轮」为默认，运行中心复合 ID 在前端归一为目录名；run-state/报告端点继续只认目录名。
- D-3：工作台是 `/app` 壳内原生三栏，群聊/会话只嵌入中栏，不再跳上游 `hermes.groupChatRoom`。
- D-4：SIM 根/分支仓/快照新鲜度由 harness 统一注入与检查，禁止依赖调用者 shell 继承或单文件 mtime。
- D-5：smoke G2 的 admin 账号 ACL 断言登记为测试设计缺陷（非产品围栏失效），下一批改为非 admin 账号 + default 板哨兵口径；本轮不以改测试掩盖。
- D-6：P1-P3 为建议批次，未在本轮改产品交互；先交付走查证据与结构修复，避免边测边改造成基线漂移。
