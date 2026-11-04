# run26 挂账台账（2026-11-03 立，run25 复盘未做项唯一事实源）

**用途**：run25 复盘（specs/2026-11-03-run25-full-retro.md）留下的未做项全部收敛到本台账，编号 N01-N09。复盘 spec 只保留归因与已修项，未做项引用本表——避免两份清单漂移。每项闭环后在「状态」列写收据（commit/证据路径），并同步 §4 的计数。

## 1 处置优先级与验收判据

| 编号 | 事项 | 锚点（问题证据） | 根因层 | 验收判据 | 状态 |
|---|---|---|---|---|---|
| N01 | **烧机测试首跑**：`bash simharness/mux/mx-burn-test.sh --until archgate` | 机制治理批与 run25 根治批共 17 项改动均未经真环境验证（spec 2026-11-02-mechanism-governance「验证」节明示留待烧机） | 制度 | 收据 `runs/burn-*/burn-test-receipt.json` 为 `status=pass`；FAIL 行归因存档 | **已完成（2026-11-03 夜两轮）**：一轮 fail 抓真缺陷＝网关旧模块缓存（stream_held ImportError 全 agent 死）→弹跳机制立法（`dcf24c35a`）；二轮推进 21 done 键，恢复/催办/回灌/闸门等待四类机制全数按设计演练（安全二轮复审 PASS、G2 双源核、退回修订、fail-closed 不放行、断点续跑路径在位），终局 2400s 修订窗超时＝bigmodel 渠道空流风暴饿死 fanfan（外部侧，2026-11-03 用户裁定「梯子消化族」不列整改）；收据 `runs/burn-20261103-211750`＋`burn-20261103-215414` |
| N02 | **HumanGate 审批台账接线**：批准动作落 `/api/approvals/history` | `ISSUE\|g5-approval-history-missing\|step20` ×2（run25 03:0x） | 产品接线 | 新一轮 G5 后该端点能查到评审卡记录；审计 14a 断言转绿 | **已完成（2026-11-04）**：产品端口加 `targetId` 精确反查（过滤先于截断）＋驱动命中失败幂等重放 decide 再判；产品 HTTP 用例覆盖创建→裁决→反查（pending-controller 16/16） |
| N03 | **发布门台账写入**：`POST /api/hermes/sim/release-gate approve` 成功 | `ISSUE\|release-gate-ledger\|step20` ×2（run25 03:1x） | 产品接线 | `evidence/release-gate.jsonl` 出现 approve 行且报告证据九引用成功 | **已完成（2026-11-04）**：run26 该键零出现＝通道已通；补文件级断言（approve 后 evidence/release-gate.jsonl 含带锚行，release-uat-state 12/12） |
| N04 | **评测数据通道**：trace 重跑出 tool_success/p99；load-probe 落 `evidence/load-probe.jsonl` | `eval-gate-gap`＋`eval-live-evidence-missing`（run25 02:53） | 评测 | 报告证据九 g4 子门无 GAP（或 GAP 缩为仅样本不足n<2 一项） | **部分完成（2026-11-04）**：eval_flow 已接 mx-load-probe（evidence/load-probe.jsonl 有生产方），run26 的 g4_eval_gap=1 根因（消费方有、生产方无）已根治；实际读数待 run27 验证 |
| N05 | **报告模板补两节**：零交付分类节（研发卡/治理卡分列）、交付物缺件节 | `zero-delivery`（60 卡无 commit 锚）＋`audit-finding`（REL-DELIVER 缺 merchant-onboarding 文档） | 报告模板 | 新报告含两节且口径可核（0 卡与缺件各有归属） | **已完成（2026-11-04）**：驱动调产品巡检器取零交付逐卡分类落 evidence/zero-delivery.json；报告新增「零交付逐卡分类（研发/治理）」与「交付物缺件清单」两节；审计查 20 核验两节与计数一致 |
| N06 | **复盘 DISP 记账闭环**：34 条问题单缺处置桶 | `retro-open-items\|director`（run25 03:3x） | 纪律 | 新轮复盘后 issues.log 的 DISP 覆盖=问题单唯一键数 | **已完成（2026-11-04 核验）**：run26 ISSUE 唯一键 30 / DISP 唯一键 30（覆盖 100%），tri-disp-backfill 收尾链归桶在位 |
| N07 | **r18 op 记录失败观察**：拍摄成功但 op 未落（映射已补，待观察是否复发） | `r18-op-register-failed\|step-ready_inbox` ×2 | 采集链 | 下一轮该键零出现；复发则按采集链缺陷升级 | **观察通过（2026-11-04）**：run26 `r18-op-register-failed` 零出现，不复发 |
| N08 | **纪律项硬断言化评估**：G3 本地测试证据、拆分证据、零交付 | `g3-local-gate-missing` ×2＋`split-evidence-missing` ×2 | 执行纪律 | 观察一轮后决定：升级为审计 FAIL 或维持黄标（记录判据） | **已裁定（2026-11-04）**：维持黄标不升 FAIL——理由见 `2026-11-04-ledger-clearance.md` 决策 3；可见性由 N11 逐步注册＋N05 分节承担，同类复发再升格 |
| N09 | **方案改名/移动的全仓引用清扫纳入守门** | run25 撞出 V3 主文归档后 4 处活跃悬空引用（已修，守门断言已钉三份文件） | 文档治理 | 守门扩到「全仓活跃面」或加 prelaunch 项（现为三文件硬编码） | **已完成（2026-11-04）**：守门由三文件硬编码扩为全活跃面扫描（代码面禁旧方案名/归档目录引用；读者面只禁旧方案名），mechanism-behavior 27/27 |

| N10 | 审计/复盘派发 SEND-FAILED 重试缺口（run26 两处：audit 两片派发首次失败由重发补位） | `audit 派发 (SEND-FAILED)` ×2（run26 07:00） | 采集链/驱动 | 派发失败自动重试一次并在案；run27 观察零失败 | **已完成（2026-11-04）**：dispatch_in_room 对 SEND-FAILED 退避 5s 重试一次，仍败落 `dispatch-send-failed` 单（原先只留日志） |
| N11 | 报告台账键未注册到步（27 个键逐步问题单空渲染风险） | `mx-report-gen` 收尾日志（run26 07:49） | 报告工具 | 台账键→步映射补登记或渲染显式标注未注册 | **已完成（2026-11-04）**：集中表 ISSUE_KEYS_BY_STEP 覆盖 run26 全部 27 表外键；沙箱实跑 `unregistered_ledger_keys` 27→0 |
| N12 | 派单器 stuck 告警分流后观察 | 补丁 730（run26 复盘批） | 产品接线 | run27 中容量饱和与真卡死两类告警能区分、拒绝原因随告警可见 | 观察（补丁 730 已入 series，run27 验证容量饱和/真卡死两态可区分） |

| N13 | **采集层页面态对齐**：拍摄位只到阶段页签，页面默认子页签/未选中本轮工件→拍到壳页（run26 32 帧核验 0 匹配，14 组前后同图） | 用户 2026-11-04 质询＋frame-verify 实测 | 采集链/产品深链 | 每步帧能等到正确子页签与本轮工件再拍（或产品提供按 run 定位深链）；核验匹配率 ≥90%，残留逐帧登记 | 待做（本批只做到「不冒充证据＋可发现」） |

## 2 已裁定不处置

| 事项 | 裁定 | 依据 |
|---|---|---|
| 429 账号限额扩容 | 不列入整改、不作裁决项 | 用户 2026-11-03 指示；工程侧兜底（rate_limit 分类＋retry_after 退避＋722 梯子＋网关恢复循环＋渠道轮转）在 run25 实测消化 56 次、零死锁。唯一升级线=`auto-recovery cycle 5/5` 连续耗尽 |

## 3 与复盘 spec 的关系

- 归因与已修项：`docs/superpowers/specs/2026-11-03-run25-full-retro.md`（12 项已修＋方案 §5.10 七条）。
- 未做项：本表。复盘 spec §「run26 首日清单」已改为引用本表编号，不再重复列举。

## 4 计数

- 待做 1（N13 采集层页面态对齐）｜观察 1（N12 补丁 730 效果）｜不处置 1（429）。N01/N02/N03/N05/N06/N07/N09/N10/N11 已完成；N08 已裁定维持黄标；N04 部分完成（探针已接线，读数待 run27）。
- 更新规则：闭环一项改状态并在此行减一；本行数字与表格须一致（守门可按需加断言）。
