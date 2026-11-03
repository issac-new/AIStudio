# run26 挂账台账（2026-11-03 立，run25 复盘未做项唯一事实源）

**用途**：run25 复盘（specs/2026-11-03-run25-full-retro.md）留下的未做项全部收敛到本台账，编号 N01-N09。复盘 spec 只保留归因与已修项，未做项引用本表——避免两份清单漂移。每项闭环后在「状态」列写收据（commit/证据路径），并同步 §4 的计数。

## 1 处置优先级与验收判据

| 编号 | 事项 | 锚点（问题证据） | 根因层 | 验收判据 | 状态 |
|---|---|---|---|---|---|
| N01 | **烧机测试首跑**：`bash simharness/mux/mx-burn-test.sh --until archgate` | 机制治理批与 run25 根治批共 17 项改动均未经真环境验证（spec 2026-11-02-mechanism-governance「验证」节明示留待烧机） | 制度 | 收据 `runs/burn-*/burn-test-receipt.json` 为 `status=pass`；FAIL 行归因存档 | **已完成（2026-11-03 夜两轮）**：一轮 fail 抓真缺陷＝网关旧模块缓存（stream_held ImportError 全 agent 死）→弹跳机制立法（`dcf24c35a`）；二轮推进 21 done 键，恢复/催办/回灌/闸门等待四类机制全数按设计演练（安全二轮复审 PASS、G2 双源核、退回修订、fail-closed 不放行、断点续跑路径在位），终局 2400s 修订窗超时＝bigmodel 渠道空流风暴饿死 fanfan（外部侧，2026-11-03 用户裁定「梯子消化族」不列整改）；收据 `runs/burn-20261103-211750`＋`burn-20261103-215414` |
| N02 | **HumanGate 审批台账接线**：批准动作落 `/api/approvals/history` | `ISSUE\|g5-approval-history-missing\|step20` ×2（run25 03:0x） | 产品接线 | 新一轮 G5 后该端点能查到评审卡记录；审计 14a 断言转绿 | 待做 |
| N03 | **发布门台账写入**：`POST /api/hermes/sim/release-gate approve` 成功 | `ISSUE\|release-gate-ledger\|step20` ×2（run25 03:1x） | 产品接线 | `evidence/release-gate.jsonl` 出现 approve 行且报告证据九引用成功 | 待做 |
| N04 | **评测数据通道**：trace 重跑出 tool_success/p99；load-probe 落 `evidence/load-probe.jsonl` | `eval-gate-gap`＋`eval-live-evidence-missing`（run25 02:53） | 评测 | 报告证据九 g4 子门无 GAP（或 GAP 缩为仅样本不足n<2 一项） | 待做 |
| N05 | **报告模板补两节**：零交付分类节（研发卡/治理卡分列）、交付物缺件节 | `zero-delivery`（60 卡无 commit 锚）＋`audit-finding`（REL-DELIVER 缺 merchant-onboarding 文档） | 报告模板 | 新报告含两节且口径可核（0 卡与缺件各有归属） | 待做 |
| N06 | **复盘 DISP 记账闭环**：34 条问题单缺处置桶 | `retro-open-items\|director`（run25 03:3x） | 纪律 | 新轮复盘后 issues.log 的 DISP 覆盖=问题单唯一键数 | 待做 |
| N07 | **r18 op 记录失败观察**：拍摄成功但 op 未落（映射已补，待观察是否复发） | `r18-op-register-failed\|step-ready_inbox` ×2 | 采集链 | 下一轮该键零出现；复发则按采集链缺陷升级 | 观察 |
| N08 | **纪律项硬断言化评估**：G3 本地测试证据、拆分证据、零交付 | `g3-local-gate-missing` ×2＋`split-evidence-missing` ×2 | 执行纪律 | 观察一轮后决定：升级为审计 FAIL 或维持黄标（记录判据） | 观察 |
| N09 | **方案改名/移动的全仓引用清扫纳入守门** | run25 撞出 V3 主文归档后 4 处活跃悬空引用（已修，守门断言已钉三份文件） | 文档治理 | 守门扩到「全仓活跃面」或加 prelaunch 项（现为三文件硬编码） | 观察 |

## 2 已裁定不处置

| 事项 | 裁定 | 依据 |
|---|---|---|
| 429 账号限额扩容 | 不列入整改、不作裁决项 | 用户 2026-11-03 指示；工程侧兜底（rate_limit 分类＋retry_after 退避＋722 梯子＋网关恢复循环＋渠道轮转）在 run25 实测消化 56 次、零死锁。唯一升级线=`auto-recovery cycle 5/5` 连续耗尽 |

## 3 与复盘 spec 的关系

- 归因与已修项：`docs/superpowers/specs/2026-11-03-run25-full-retro.md`（12 项已修＋方案 §5.10 七条）。
- 未做项：本表。复盘 spec §「run26 首日清单」已改为引用本表编号，不再重复列举。

## 4 计数

- 待做 5（N02-N06）｜观察 3（N07-N09）｜不处置 1（429）。（N01 已完成 2026-11-03 夜）
- 更新规则：闭环一项改状态并在此行减一；本行数字与表格须一致（守门可按需加断言）。
