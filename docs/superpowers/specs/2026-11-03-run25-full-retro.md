# 2026-11-03 run25 全流程复盘：问题全量归因与根治

## 变更

1. **驱动脚本**（`simharness/aipay-scenario.sh`，5 件）：
   - 步 9 补 `capture_step "dispatch_done"`（原无采集位→审计三红线每轮必炸）；
   - 步 26 采集位由「审计后」前移至「首次审计前」且键名改 `report_done`（原 `report_view` 在 report_done 之后，审计查载荷时现场永不存在）；
   - `g5-humangate-proxy` 改 `issue_once`（原重放每轮记一条，run25 同键 6 条）；
   - `_dep_txt` 的 sed 加存在性守卫与 stderr 静默（tasklist 缺失时 rc=2 直杀 ERR trap，run25 崩 5 次）；
   - 方案正本路径 2 处指向现行文件（原指向已归档 V3 主文）。
2. **监督器**（`run-driver-supervisor.sh`）：失败指纹改 `mx_fail_fingerprint` 纯函数；空失败段不产指纹、不累计确定性判定（原 grep 空输出经 shasum 得空串哈希 da39a3ee→5 轮误判自退）。
3. **恢复库**（`mx-recovery-lib.sh`）：新增纯函数 `mx_fail_fingerprint`。
4. **交付库**（`mx-delivery-lib.sh`）：新增 `dlv_gate_try` 安全包装；驱动在 G1/G2/G3/G4/G6 落键点各派一次 gate 事件（原仅 G5 发，M3 断言「缺 pass 的门=G2」）。
5. **采集器**（`r18-collect.py`）：映射补 `dispatch_done: 9`、`ready_inbox: 20`（原不在映射即 die，run25 两条失败单）。
6. **审计器**（`mx-report-audit.py`）：R8 与 A3a 取数锚定「问题单终态」表单元格，不再全文首匹配（引文历史数字词面污染，两处各撞一次）。
7. **报告合并**（`final-report-merge.py`）：注册 run25 PART1 正本；行话 HARD 清零。
8. **方案**（`2026-10-05-mux-v8-fullflow-plan.md`）：新增 §5.10「run25 复盘条款」七条（采集位单一事实源/审计收敛三分法/收尾必做件/计数口径解耦/重启起点纪律/六闸事件完备/方案改名清扫）。
9. **行为测试**（`tests/mechanism-behavior.test.ts`）：新增 4 条结构性断言（空指纹、capture 键全覆盖、六闸事件落点、方案路径无悬空）。

## 决策记录

- **问题全量归因（run25 实测，33 唯一键/79 行）**，按根因分四层：
  - **采集与报告链（本轮最大成本）**：步 9 无采集位、步 26 采集时机倒置、r18 映射缺 2 键、`r18-op-register-failed`（拍摄成功但 op 记录失败）、`evidence-push` 推送失败 —— 审计环 36 轮、约 2 小时的直接成因。
  - **流程/纪律**：G3 两分支缺本地测试证据（`g3-local-gate-missing`）、CHWX 拆分证据缺失（1 commit > 1 人日）、60 张卡零交付锚（`zero-delivery`）、34 条问题单缺 DISP 记账（`retro-open-items`）——属执行纪律面，靠方案条款与模板收紧，不在本批改代码。
  - **产品接线**：HumanGate 批准未落审批台账（`g5-approval-history-missing`）、发布门台账写入失败（`release-gate-ledger`）、M3 缺 G2 事件（本批修）——前两项需定位端点/权限，列入 run26 首日清单。
  - **评测与容量**：`eval-gate-gap`（tool_success/p99 需 trace 重跑）、`eval-live-evidence-missing`（load-probe 缺席）、429 并发洪峰 56 次 —— 前者补数据通道；**429 属外部账号限额，2026-11-03 用户裁定不列入处置范围**（现有链路已承接：`rate_limit` 分类＋`retry_after` 退避＋722 梯子＋网关恢复循环＋渠道轮转，run25 实测 56 次全部消化、零死锁零驱动退出，代价为每波 5-10 分钟等待）。
- **429 处置裁定（用户 2026-11-03）**：外部账号限额不作为本轮整改项，也不再作为待裁决事项。工程侧只保证「不退化成阻塞」——现有五层兜底在 run25 实测中消化 56 次 429、零死锁；若未来出现恢复循环耗尽（`auto-recovery cycle 5/5` 连续失败）再升级为事故面。

- **为什么不改报告里的引文数字**：审计意见书是 agent 的真实产物，引文里的历史数字（唯一键 26）反映当时快照。改引文=伪造审计记录；正确做法是修审计器取数口径（锚定报告自身计数主张位），本批按此落地。
- **为什么把采集位前移而不是只靠降级登记**：降级登记是合规黄标，但每轮都要人写一条登记才能过审计——把「可自动修复类」缺口交给人，等于把机制缺陷转嫁成值守负担（run25 我写了 4 条登记）。前移采集位后同类问题从根上消失，登记通道保留给真正不可采的步。
- **为什么六闸事件用安全包装而不是直调**：run12 实锤 `dlv_gate` 缺参 exit 4 被 `set -e` 击杀驱动成重启循环。包装三档（dlv 关闭返回/无案例房跳过记 note/发送失败不阻断）保证事件化失败不影响闸判据。
- **方案条款而非代码的边界**：G3 证据、拆分证据、零交付、DISP 记账四项属执行纪律，改代码无法强执（判据已有，执行不到位）。本批只在方案 §5.10 与报告模板收紧口径；机械执法面（审计断言）留待 run26 观察是否需要升级为硬断言。

## 验证

- `bash tests/run-gates.sh`：**254/254 全绿**（15 个测试文件，含 jargon-source-gate HARD=0）。
- `npx vitest run tests/mechanism-behavior.test.ts`：**21/21**（含本批新增 4 条结构性断言）。
- `bash -n` 全部改动脚本；`python3 -c ast.parse` 全部改动 Python。
- `bash mux/mx-burn-test.sh --dry-run` → `BURN-DRY-RUN-OK`（烧机通道可用）。
- 真环境验证留待 run26 烧机（本批触及采集位/审计/监督器，按 §5.10 第 2 条与机制地图 §6，必须跑一次 `UNTIL_STEP=archgate` 短场景）。

## 设计文档影响

DESIGN_SYNC: touched——方案正本 `2026-10-05-mux-v8-fullflow-plan.md` 新增 §5.10 七条（本批同改）；A.1 索引同批登记（484→485）。
