# run24 复盘·产品面与报告链根治四件：dispatcher 诊断面／编制利用率读数／判据 17 执法／studio 判词验证

日期：2026-11-02 ｜ 类型：fix（harness 诊断面）＋feat（报告读数）＋fix（审计执法）＋test（studio 判词回归）

触发：run24（20261031-v8-run24）复盘识别出的四件「立法与执法两套／读数不可见」问题，用户令「根治」。
本 spec 只覆盖归属本执行者的四件；同批复盘批的驱动面六件（mx-scenario-lib.sh、aipay-scenario.sh）由另一执行者并行落地，本文件不触碰。

## 变更

### 一、kanban dispatcher「ready 非空 0 spawn」根因诊断面（新补丁 723）

1. `patches/723-agent-dispatcher-refusal-reasons.patch`（新增，213 行 ＋；只改 vendor 的 `gateway/kanban_watchers.py` 与 `gateway/kanban_watchers_dispatcher.py`）。
2. `patches/series:1073-1081`：追加 723 条目（含触发背景注释，沿用 722 的形态：patch 文件内首行直接是 `diff --git a/gateway/...`，无自带头注）。

**根因定谳（干跑复现，非推断）**：spawn 被 `_dispatch_lane_task` 的 `profile_exists(assignee) is False` 分支整批拒掉，落进 `DispatchResult.skipped_nonspawnable`。该判否来自用户补丁 **391 板级 team 围栏**（`board.json` 的 `profiles` 团队表，fail-closed），而健康遥测 `has_spawnable_ready()` 调 `_profile_exists_fn()` 时**不带 board**（源码注释自称「health probes pass no board and stay unfenced」）→ 「遥测说 ready 非空、派发说全部不可 spawn」。run24 实证：board `qi-test-pay` 团队表 `['qi-tester','hu','lin','chen','xiao']`，而该板 4 张 ready 卡的 assignee 是子编制 `chen-csw-pay-core`/`lin-csw-channel-alipay`/`qi`——一个都不在表内；board `fei-test-mp` 团队表 `['fei-tester']`，ready 卡 assignee `xiao-csw-cashier-mp` 同样在外。`skipped_nonspawnable` 既不在 `describe_suppression` 的计数口径里，`_log_spawn_results` 又在 spawned 为空时完全静默，于是 196+ tick / 8 小时零诊断。

**补丁内容（只显形，不改任何 spawn 行为）**：

- `_spawn_refusal_reasons(results)`：把一 tick 的 `DispatchResult` 拒绝桶聚合计数（`skipped_unassigned`/`skipped_nonspawnable`/`auto_blocked`/`rate_limited`/`skipped_per_profile_capped`/`respawn_guard:<reason>`/`skipped_locked`/`memory_pressure:<level>`），桶全空记 `unattributed`（拒在逐卡循环之前的预算面，或 claim/spawn 腿失败）。
- `_refusal_hint(kb, settings, results)`：每段 stuck 的首次聚合给一行 actionable hint。优先分支＝板级团队表把整板 ready 卡围栏在外（逐板列出 `team=` 与被排除的 `assignees`，并写明期望值：`board.json profiles` 必须覆盖派发面实际使用的 assignee 全名，子编制逐条列出，不能只写基名，或整键删除关闭围栏）；其次＝assignee 不是活编制（查 `hermes profile list`）；最后＝无桶时的预算面（点名 `kanban.max_spawn`／`kanban.max_in_progress`／`kanban.max_in_progress_per_profile` 与期望值「null 或 ≥ 当前 running+1」）。
- 主循环（`kanban_watchers.py`）：stuck 期间逐 tick 累计，`logger.warning("kanban dispatcher: spawn refusals by reason=%s (aggregated over %d stuck ticks)", {...}, n)` 每 300s 一次；stuck 解除、estop 暂停时清零（含 hint 已发标记复位，下段 stuck 重发）。
- 既有 `kanban dispatcher stuck: ...` 警告的文案与节流**零改动**（新日志只追加在它之后），`describe_suppression` 调用原样保留。

### 二、编制利用率报告读数（`simharness/mux/mx-report-gen.py`）

1. `_staffing_utilization()`（`:5017`）：分子＝run 窗口内各编制 `<profiles>/<p>/logs/gateway.log` 中 `response ready` 行的 `time=<秒>` 之和（**只算行首时间戳 ≥ `run_started_at`** 的行——编制日志跨轮长驻，run24 实测 43 个日志共 138MB、891 条历史 `response ready`，不按行过滤会把往轮耗时算进本轮）；分母＝(出报告时点 − `run_started_at`) × 在编编制数（`profiles` 下不含 `_` 前缀的目录数）。逐行流式读取，不整文件入内存。任一要素缺席 → `available=False`，按空渲染（fail-soft，不猜数）。
2. `_readfirst_html()` 第 0 章导读区渲染（`:5144-5169`）：`编制利用率 xx%（分子 Ns／分母 定义式＝报告时点−开跑 Hh × 在编 M 编制＝Ns；计入 response ready K 条）`，后接口径句「这一行是「AI 员工实际干活时长占全天在编时长」的读数：分子是各编制日志里每次响应就绪耗时的累加，分母是从开跑到出报告的全长乘以在编人数」。元素 id 固定为 `staffing-utilization`（审计锚点，见下）。

### 三、审计执法（`simharness/mux/mx-report-audit.py`）

1. `查 17`（`:1060`）：编制利用率行缺席、或有数但缺口径句 → **WARN**（不 FAIL，避免历史轮报告重生成整批翻红）。锚点用元素 id `id="staffing-utilization"` 而非裸词「编制利用率」——run24 实证该裸词已出现在问题单台账正文（「G5 熔断等待 4.5h 期间编制利用率约 25%」），裸词锚会把缺行读成有行（本批实测踩过并已改锚）。
2. `查 18`（`:1073`）：判据 17「跨模块契约用例清单」机械执法，**run id ≥ `20261102` 适用**（`RUN_ID >= '20261102'` 字符串比较，写法同 `:867` 的 run12 时代门）。数据面＝integration 分支 `docs/test/*test-report*.md`（`git --git-dir $SIM/central/aipaydev/.git show origin/integration/RFD-001:<path>`）＋证据面同名文件 `EVID/**/*test-report*.md`。判定：在场报告**全部**无「契约用例」字样 → **FAIL**（理由：模板 §9 判据 17 已立法、G4⑦ 按标题词核对，而执法器从未存在——run24 实测 G4 通过而测试报告零「契约用例」，立法与执法两套）；部分有部分无 → WARN 点名缺件；两侧都无报告 → 只注明不判（测试报告整体缺席属既有 G4 证据链职责）。run id < 20261102 的轮次跳过并在 stdout 打 `NOTE 判据17 自 20261102 起适用`。

### 四、studio 侧判词回归（只验证，不重建）

`custom/server/governance/__tests__/lifecycle-verdict.test.ts`（中文分项判词已合 main，24 例）与 `simharness/tests/lifecycle-parity.test.ts`（13 例）实跑全绿，见 §3。**未执行** install/build（用户令「不重建」）；让 `verdict.ts` 改动在运行中的 studio 生效需重建重启，列为运维待办（§4）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 |
|---|---|---|---|
| D1 | 723 只显形不修 spawn 行为（不改围栏口径、不改遥测口径） | 围栏本身是用户立法（391，多租户板级团队隔离），改动属产品行为变更，需单独裁定；本轮目标是「让下一次能看见原因」，且诊断面零风险上线 | 直接让遥测带 board（否决：改行为、改监控语义，超出本轮授权）；直接放宽围栏（否决：削弱隔离边界） |
| D2 | 聚合计数按「每 tick 累加、每 300s 打一次、stuck 解除清零」 | 与既有 stuck 警告同节流；按窗口清零可读性最好（数字即最近 300s 窗口内的拒绝量），也避免长期 stuck 时数字无限膨胀 | 每 tick 打一行（否决：跑一轮 400+ 行日志噪音）；只打累计总数（否决：看不出恢复与否） |
| D3 | hint 只在每段 stuck 的**首次**聚合打印 | 提示内容在 stuck 期间不变，反复打印是噪音；stuck 解除后再陷才重发，保留「新症状」可见性 | 每次聚合都打（否决：300s 一条同文提示） |
| D4 | 查 17 用元素 id 锚定、且只 WARN | 裸词锚被台账正文的同词误伤（实测）；历史轮报告重生成不该因新增读数翻红 | FAIL（否决：新增读数不该变成放行门）；裸词锚（否决：已实测误判） |
| D5 | 判据 17 执法自 20261102 起、历史轮只打 NOTE | 条款 2026-10-31 才入模板（run24 前重锚批），对更早轮次追溯执行等于用新法判旧轮 | 全轮次适用（否决：历史轮全红、不可解释） |
| D6 | 判据 17 判定取「全部在场报告皆无才 FAIL」 | 一轮可能有多份 test-report（run24 现有 3 份：主/BE/FE）；按单文件判会把子报告缺项判成整轮 FAIL，与主报告达标事实矛盾 | 逐文件 FAIL（否决：误伤主报告达标的轮次） |
| D7 | 分母含报告时点（而非 run 收尾时点） | 用户给定口径即「report 时点 − run_started_at」；收尾后重生成会把空闲尾巴算进来，读数偏低——已在口径句里写明分母定义，读者可自行判断 | 用 `report_done` 时间戳（否决：与用户口径不一致；且部分轮 report_done 缺失） |

## 验证

全部实跑，命令与结果原文：

1. 723 打得上 vendor 树：
   `cd vendor/hermes-agent && git apply --check ../../patches/723-agent-dispatcher-refusal-reasons.patch` → `APPLY_CHECK_OK`。
   另做往返一致性：把补丁打到 pristine 副本后与编写态逐字节 `diff -q` 两文件 → 均相同（`ROUNDTRIP_IDENTICAL`），证明补丁不是「能过 check 但内容错位」。
2. 语法：`python3 -m py_compile simharness/mux/mx-report-gen.py simharness/mux/mx-report-audit.py` → `PY_COMPILE_OK`；773 上下文同源（vendor 两份文件单独 py_compile 亦通过）。
3. 723 功能实测（镜像 `/tmp` 树 + 真实 run24 板库，`dispatch_once(dry_run=True)`）：
   - 修复前语义复现：`refusal reasons = {'skipped_nonspawnable': 5}`，同时 `has_spawnable_ready: True` —— 即 run24 的「ready 非空 0 spawn」签名；
   - hint 实测输出：`board.json team fence (HERMES_CUSTOM board-team-fence) is refusing whole boards: 'fei-test-mp' team=['fei-tester'] excludes ['xiao-csw-cashier-mp']; 'qi-test-pay' team=['qi-tester','hu','lin','chen','xiao'] excludes ['chen-csw-pay-core','lin-csw-channel-alipay','qi']. Expected: board.json \`profiles\` lists EVERY assignee ...`
   - 空桶分支：`{'unattributed': 1}` + 预算面 hint（点名三个 max_* 配置项与期望值）；
   - `respawn_guard` 分因：`{'respawn_guard:recent_success': 1, 'respawn_guard:blocker_auth': 1}`。
4. 报告读数实跑：`AIPAY_SIM_ROOT=/Users/cuishi/lab/ncwk-sim-mux python3 simharness/mux/mx-report-gen.py --run 20261031-v8-run24` → rc=0，
   `report written: .../simulation-report.html (495439 bytes, 48 images)`；渲染行原文：
   `编制利用率 2.9%（分子 116,938s／分母 定义式＝报告时点−开跑 26.8h × 在编 42 编制＝4,049,472s；计入 response ready 286 条）——这一行是「AI 员工实际干活时长占全天在编时长」的读数…`。
   独立复算（不复用生成器代码，直接扫日志）＝`numerator=116937.6 lines=286 skipped_before_run=605 profiles=42`，与报告一致。
5. 审计三分支实测：
   - 真实 run24 报告 → `查17` 零命中（通过）；
   - 摘掉该行 → `WARN 查17 编制利用率读数行缺席（第 0 章导读区）…`；
   - 只摘口径句 → `WARN 查17 编制利用率有数但缺口径句…`；
   - 合成 `20261102-v8-run99`（证据面软链 run24、integration 指向真实仓）→
     `FAIL 查18 判据 17「跨模块契约用例清单」缺失：在场测试报告 ['integration docs/test/RFD-001-test-report-BE.md', ...] 全文零「契约用例」…`；
   - run24 自身（`20261031` < 生效日）→ `NOTE 判据17 自 20261102 起适用（本轮 20261031-v8-run24 早于生效日，契约用例清单不判）`。
6. studio 判词回归（不重建，直接跑）：
   - `npx --no-install vitest run custom/server/governance/__tests__/lifecycle-verdict.test.ts` → `Test Files 1 passed (1) / Tests 24 passed (24)`；
   - `npx --no-install vitest run --root simharness -c vitest.config.ts tests/lifecycle-parity.test.ts` → `Tests 13 passed (13)`。
   合计 37 例全绿（不是 38：任务给的 `38/38` 与这两个文件的实际例数不符——24＋13＝37；`8e58fba0a` 提交信息里的「lifecycle 38/38」按 24（verdict）＋7（rest）＋7（breaker）＝38 对得上，属另一组合集；此处如实记 37/37）。
   注：任务给的第二条路径 `custom/server/governance/__tests__/lifecycle-parity.test.ts` 不存在，实际位置是 `simharness/tests/lifecycle-parity.test.ts`（跑它需 `--root simharness`，根 vitest 配置只收 `custom/**`、`scripts/**`）。
7. harness 守门：`npx --no-install vitest run --root simharness -c vitest.config.ts tests/report-three-elements.test.ts tests/harness-gate-integrity.test.ts` → `Test Files 2 passed (2) / Tests 138 passed (138)`（含并行执行者正在改的 `mx-scenario-lib.sh` 相关 ㉘ 六件断言，当前绿）。

**已知残留（不改，如实记）**：`AIPAY_SIM_ROOT=... python3 mx-report-audit.py --run 20261031-v8-run24` 仍有 1 条 FAIL `A3a 报告问题单唯一键计数（33）≠ issues.log 实测（34）`。定性＝pre-existing 数据漂移，非本批引入：报告该数字取自 `evidence/governance-metrics.json` 的 `pairing` 长度（33，快照生成时 issues.log 100 行），而 issues.log 现有 101 行 / 34 唯一键；本轮归档件 `evidence/final-report.html`（未被我改动）同样是 33，可作旁证。属于「治理快照 vs 实时台账」时滞，处置在治理侧重跑 `gov_report`，不在本批范围。

## 设计文档影响

DESIGN_SYNC: touched——方案正本《docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md》由主会话同批修订（本执行者不持有该文件）：
- 报告规范节补「编制利用率」读数口径（分子＝run 窗口内 `response ready` time 之和、分母＝(报告时点−开跑)×在编编制数）——与新读数行同源，避免正本与渲染两套口径；
- G4 判据面补「判据 17 自 20261102 起由 `mx-report-audit.py` 查 18 机械执法」（此前只有立法无执法器）；
- dispatcher 健康面补「stuck 警告已带拒绝原因聚合与 hint（723）」，避免正本仍按「stuck 只报 tick 数」的旧描述读监控日志。
本 spec 不含方案正本改动内容，正本修订以主会话同批提交为准；若主会话未落这部分，本 spec 的四条即为缺口清单。

**运维待办（未执行，显式挂账）**

1. studio 重建重启，让 `lifecycle/verdict.ts`（中文分项判词）在运行实例生效——本批只跑 `npx vitest`（单元级，直接 import 源码），**未执行** install/build（用户令「不重建」）。命令：`npm run build:full`（＝`node scripts/build.mjs`，含注入＋构建＋`verify-dist`），随后重启 studio（桌面端退出重开，或按部署方式重启已装包）。**未执行原因**：任务明确「不重建」，且重建会与并行执行者正在跑的推演/注入互踩（`product-dist` 快照缺位告警即此风险）。
2. 723 补丁需要在下一轮 `npm run vendor:sync` / 注入前进入 `patches/series` 的生效序（本批只入库补丁与 series 条目，未执行注入）；注入后重启网关才会打出新的 `spawn refusals by reason=...` 行。
3. run24 的 `A3a` 计数缺口需治理侧重跑 `gov_report` 刷新 `governance-metrics.json` 快照后复算（非代码问题）。
