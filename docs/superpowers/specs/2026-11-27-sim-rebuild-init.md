# SIM 重建初始化自愈段（run32 四轮烧机实录根治）

## 变更

`simharness/mux/mx-setup.sh` 新增 4e 段「重建初始化自愈」，修空库 studio 的三道一次性初始化缺项（run32 开跑前烧机四连败的根因收拢）：

1. 超管引导：webui DB 无活动超管时执行 `hermes-web-ui reset-default-login`（只写 SIM `WEBUI_HOME`，不触宿主）。缺它时 matrix-login 回 `ACCOUNT_PENDING_ACTIVATION` 破窗指引。
2. 账号预激活：v0.8.30 激活门要求 matrix 交换建行的用户 `status=active` 且绑定 profile。本段对全编制逐账号「密码换 matrix token → /api/auth/matrix-login 建行 → `PUT /api/auth/users/:id {status:active, profiles:[基名]}`」；admin 交换账号（governance 判读链 `_gov_tok` 的唯一来源）同闸覆盖。段尾自检 admin 交换可用性，不可用即大声告警（run32 G1「判读服务不可达」的实锤根因）。
3. 浏览器锚点：`$SIM_ROOT/pw-browsers` 缺 chromium 时 `npx playwright install chromium`（采集链预检的回落引擎；run32 实录宿主 Chrome path_service FATAL 期间它是最底兜底）。

三项全部「已满足即跳过」，反复跑 setup 无副作用；段内失败只告警不阻断（与 4b-4d 同风格）。

## 决策记录

1. **Mechanical·初始化自愈固化进 mx-setup 而非值守手册**：run32 四轮烧机三型失败全部是「重建后一次性初始化缺项」，属供给面职责而非运行面故障——值守代行激活（run32 实录）只是止血，固化为供给幂等步才是根治。落 4e 段与 4b-4d 同风格（告警不阻断），保持 setup 可反复跑的既有契约。
2. **Mechanical·预激活只覆盖基名账号，agent 账号按需**：`-agent` 后缀账号经 gateway 直连（HERMES_HOME），不走 studio webui 登录闸；首登建行按需后由同段配方补激活（值守 prompt 已载配方）。避免 setup 对 28 个 agent 账号做无消费面的批量登录。
3. **Mechanical·mx-setup 不入 MECHANISM_FILES**：本段改动不触发烧机收据失效（`mx-mechanism-receipt.py` MECHANISM_FILES 16 件不含 mx-setup.sh，实读在案），run32 第四轮烧机（burn-20261127-080847）在途收据不受影响。

## 验证

- `bash -n simharness/mux/mx-setup.sh` 语法过。
- 幂等验证：当前环境（已初始化完成）重跑 `HERMES_AGENT_SRC_PRISTINE=1 MX_MODEL_CHANNEL=host bash mux/mx-setup.sh`，预期三段全部走「已满足即跳过」分支，日志无预激活计数行。
- 隔离边界守门（isolation-boundary.test.sh 三断言）与 jargon 源层门禁过。
- 烧机在途进程不受影响（setup 非机制文件、烧机进程已加载完毕）。

## 设计文档影响

DESIGN_SYNC: none。推演设施内部供给段（simharness/mux），不触 `docs/DESIGN.md` 契约面；运行基面状态块由 run32 同步批（2026-11-26-run32-plan-sync）承载，本段属其 §5.17 第 2 条（pristine 供给链）的执行面补全，无新契约。
