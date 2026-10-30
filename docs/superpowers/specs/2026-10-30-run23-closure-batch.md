# run23 收官批：DEF 卡纪律 + governance-client unbound 修复 + 报告黑话修正

日期：2026-10-30 ｜ 轮次：20261028-v8-run23 收官 ｜ 类型：fix（run 中热线修复收口落盘）

## 变更

1. `simharness/aipay-scenario.sh`：5 个测试/缺陷派发模板追加「缺陷卡纪律（2026-10-29 run23 依赖图锁死立法）」——DEF 卡为叶子工作，建卡不得挂父依赖（不 link 到复审/迁移/阻塞卡）；修复合入 integration 后 fixer 立即结卡。根因：run23 实录 DEF 卡父链挂到阻塞 26 小时的 T06 卡，结卡被 kanban 依赖守卫正确拦截，修复/结卡脱节。
2. `simharness/mux/governance-client.sh`：`_gov_get()` 补 `local path="$1"` 绑定。根因：函数体引用 `$path` 但从未绑定，`set -u` 下报 unbound variable；`gov_report` 吞错降级为「服务不可达」，governance-metrics.json 快照缺席，报告生成器按 fail-closed 拒绝出报告。该缺陷自融合批三（ec62fa03e）引入以来首次被执行到（此前无轮走到报告步调用该函数）。
3. `simharness/mux/steps_entry.py`：步 18 叙事「G3 落键 g3_code_pass」改「G3 门禁通过、通过标记 g3_code_pass 写入状态台账」。根因：报告审计 A10 黑话检查将「落键」判 HARD 违规（词表同源 scripts/plan-html）。

## 决策记录

- **收官决策（操作者按用户指令执行）**：用户多次明示「尽快推进完成／一直在拖延」，且 A/B 裁决（收官 vs 继续）2 小时以上无回应、agent 群停摆 3 小时+（最后真实 API 调用 04:34）、G5 熔断两轮未过、监督器连续 11 次失败退避——按可逆原则执行收官：stop 文件停监督器（git/文档通道，非杀进程）＋`START_STEP=report` 直达报告步。全程可逆（report_done 未落键，重挂监督器即续跑）。
- **终态接受单项审计 FAIL**：报告审计终态=查15（评测摘要缺席）单项 FAIL。评测链样本源=集成分支测试报告 `docs/test/RFD-001-test-report.md`，该工件在本轮从未落仓（G5 r18 缺项之一），fail-closed 设计下无法也不应造数补齐。按收官判据② report_done 不落键、final-report 不合并——这是审计如实拒绝认证，非收官流程失败。
- **R18 补采走 V8.4③ 补拍口径**：步 9（群会话画布）与步 26（/app/sim 报告承载面）为收官补拍真实产品页实拍帧（r18-frames.mjs 实拍、图注明示时点）；步 7 效果锚=冻结件 commit 047a3ca；步 19 对话=m19 锚重放（38 条）。步 2/4（冒烟夹具子步）按采集纪律⑩ 登记 r18-collection-missing（payload 登记点未接线=真实缺口，post-run 修复项）。

## 验证

- `bash -n simharness/mux/governance-client.sh` 语法通过；修复后报告链四跑收敛：审计 FAIL 项 9→3→1（仅剩查15），governance-metrics.json 14K 落盘、A10 清零、R9/R18 步 7/9/19/26 全绿（驱动日志 20261028-v8-run23-driver.log 07:46–08:01 四次报告步实录）。
- steps_entry 修正经报告重生成+审计复跑验证（A10 项消失）。
- DEF 卡纪律为派发词变更，本轮 run 中已实际使用（20+ 次 unlink/complete 通道验证依赖守卫行为），无自动化测试面（派发词不入测试）。

## 设计文档影响

DESIGN_SYNC: none——三处均为 harness 执行层缺陷修复与派发词纪律，不触及整合正本/数字总账的任何契约、阈值或口径；收官决策与终态记录已按通道落 `runs/20261028-v8-run23/evidence/issues.log`（run23-operator-closure 条目），不属设计文档面。
