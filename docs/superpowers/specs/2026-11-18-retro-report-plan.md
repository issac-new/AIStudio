# 2026-11-18 run31 报告与方案对账根治批（叙事债清偿＋六处诚实面修复＋预检两门）

## 变更

对 run31 终局报告（final-report.html）与全流程推演方案正本做证据对账（两路独立审计＋主会话快查），发现四层缺陷并全部根治：

**A 叙事债（最大缺陷）**：PART1_BY_RUN 停在 run26——run27-31 五轮 hero 全未注册（auto-part1 兜底但带 ⬜ 占位）；逐歩叙事 `_NARR` 停在 run24——run31 报告 **28 处「骨架占位·待补注册」出厂**；预检⑪ 检查键钉死 run16，五轮漏注册零拦截。根治：
1. `final-report-merge.py`：PART1_RUN27-31 五轮 hero 卡注册（素材=各轮复盘 spec＋run-metrics 真值，每卡含六闸真实口径与当轮价值定谳）。
2. `mx-report-gen.py`：STEPS_META_20261117_V8_RUN31 二十六条逐歩叙事注册（素材=driver.log 时间线＋state.env 秒锚＋值守 45 轮实录；步 15-17 G2 缺位如实记「未放行」并点根因，步 16/17 留空不补写）。
3. `mx-prelaunch-check.sh`：⑪ 键动态化（run-metrics 最新收官行）；新增 **⑪b 上轮报告零骨架占位门**（叙事债不可滚动）。

**B 报告诚实面四缺陷**（对账审计定谳）：
4. `mx-report-gen.py` `_staffing_utilization`：分母右端锚=report_done（终局轮重生成时 wall-clock 把停摆 idle 计入分母，run31 实录 7.8%→5.2% 漂移）。
5. 同文件「还没完成的」列：骨架轮写死「无未完成项」与同页 G2 ⏳ 自相矛盾——改按 STEPS_META×state 实算未达步如实列出；「每步有界面实拍」改如实措辞（帧况以各步档案标注为准）。
6. 同文件事件流计数：终局后重生成复用旧治理快照致 hero（实时）与第 4 章（快照）矛盾（74 vs 72 实锤）——issues.log 生成时刻实数为准＋快照差注记。
7. 同文件 gov_final_rows：G4 卡补三缺口键显（evidence/contract/eval gap=1 非全绿）、G5 卡补「补过」口径标（g5_supplement 语义）——对称显形不再只藏时间线。

**C 方案正本六处**（结构审计定谳）：5.10.x 落定 5.10.1＋run25 块上移归位（节序 5.9→5.10→5.10.1→5.11）；探针计数三口径统一十七组；§5.15-8 N31 条改终局回写（含 5.9%→5.9 复计调和注）；§5.15-6 digest 从句 WAIVED 对齐；§5.15-1 dream 观察窗自包含；§5.13-8/§5.14-6 director 双计数调和注。

**D 审计与收尾链**：`mx-report-audit.py` 查19 扩至十七组（RUN_ID≥20261117 必齐 harness-contract/proactive-r2/always-on/kanban-version 四组；注释十三/十四组自相矛盾修齐）；`aipay-scenario.sh` 探针注释同步；`tri-disp-backfill.py` 同键守卫（issues.log 已有同 type·subject 的 ISSUE 行时不再落「无人工处置在案」观察行——run31 实锤 step-23/25 键 ISSUE 与自动 DISP 互相矛盾）。

## 决策记录

1. **Mechanical·叙事债清偿走正道**：按 R17 设计「骨架起草→人工润色→注册」补齐六注册——不是简单删占位，而是把 run31 的 26 步真实时间线写成叙事；五轮 hero 从各自复盘 spec 提炼，六闸口径逐轮如实（run27 净额 5/6、run30 A2 停机、run31 G2 未闭环）。
2. **Mechanical·⑪b 立「叙事债不可滚动」门**：上轮报告残留骨架占位=下轮开跑红项——占位出厂等于导读层空转（run28 复盘已立法 R17 只防拒出，本门补「防欠账滚动」缺口）。
3. **Mechanical·利用率分母锚终局**：终局轮重生成的读数漂移是测量缺陷不是趋势——report_done 在位即窗口右端锚死。
4. **UserChallenge·对账范围**：用户 2026-11-18 令「全面复盘下当前全流程推演报告和推演方案，寻找存在的问题并根治」——两路独立审计（报告证据对账/方案结构审计）＋主会话快查三源交叉，四层缺陷全根治。
5. **挂账 N33**（见台账 `2026-11-18-run33-pending-batch.md`）：run25-30 六轮逐歩叙事仍欠（本轮只清 run31＋五轮 hero；逐歩叙事每轮约 26 条，run32 开跑前按同配方补）；A 对账的三项建议（327 用例聚合锚/G6 卡「100% 记账」措辞/token 总量入报告第 4 章）随 N33。

## 验证

- 语法：py_compile×4（gen/merge/audit/tri）＋bash -n×2（prelaunch/scenario）全过。
- jargon 门：方案正本 HARD=0（§5.15-8 改词「终局回写」复验）。
- ⑪/⑪b 判据自测：最新收官行=20261117-v8-run31→PART1 在册✓＋_NARR 在册✓；旧报告占位 28 处（⑪b 红判据实证——本批重建后归零）。
- run31 报告重建：mx-report-gen（叙事注册版）→final-report-merge（PART1 人工正本）→占位归零＋G4/G5 卡面补显验证。
- `bash simharness/tests/run-gates.sh` 全量；`npm test` 合并前。

## 设计文档影响

DESIGN_SYNC: none——报告链与 harness 修复，不触及整合正本与数字总账（方案正本属 SPEC_GLOB 面，其修订由本 spec 承载）。
