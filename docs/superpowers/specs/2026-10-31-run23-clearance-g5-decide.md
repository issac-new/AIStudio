# run23 裁决执行批：台账全部清账 + G5 批准走产品 human-gate decide 通道 + fail-soft 维持记录

日期：2026-10-31 ｜ 轮次：20261028-v8-run23 清账执行 ｜ 类型：fix（harness G5 批准通道）＋docs（裁决记录）＋运行态清账（SIM_ROOT 台账，非仓库面）

触发：用户 2026-10-31 裁决三笔——①「全部清账」（run23 台账：151 笔代偿＋30 观察＋11 延后，按 2026-10-31-run23-plan-report-retro-revision.md 附录 A 建议执行）；②「批准」（G5 批准 root fix：驱动 G5 通过路径补调产品 decide API）；③「否」（G3/G4 fail-soft 不收紧，维持 V8.56 显形口径）。

## 1. 变更

### 一、G5 批准走产品 human-gate decide 通道（aipay-scenario.sh G5 块，零服务端改动）

产品面已有完整闭环（`custom/server/approval-inbox/human-gate.ts`）：`POST /api/approvals/human-gate/`（注册批准单，id=mkId(runId,cardId) 确定性幂等）→ 收件箱 pending 项（`listHumanGatePending`）→ `POST /api/approvals/human-gate/:id/decide`（decide() 落权威 store＋`appendApprovalLog`（targetId=cardId 进 /api/approvals/history）＋HUMAN_GATE_EVENTS 投影 approved.events 同款行）。驱动侧三处接线：

1. **注册批准单**（strict/standard 两态共用，判词 PASS 后、批准动作前）：`POST /api/approvals/human-gate/` {runId, cardId=RGID, title, detail=posture+七项摘要}——收件箱出现真实 pending 项（审批面 UI 帧有物可拍）；注册失败记 `g5-humangate-register-failed` 显形不阻断（approved.events 仍为闸键真值）。
2. **strict 真人链中继**：等待环真值函数扩为双源——approved.events 已有行（既有通道）或产品批准单 status=approved（真人经收件箱裁决）→ 由驱动把产品裁决中继写 approved.events（行文同款、actor=产品 decidedBy 真人，幂等=写入前再 grep）。闸键语义不变：approved.events 仍是唯一闸键真值文件，中继只是把产品面的真人裁决投影到位（治 run23 实录的「产品 HumanGate 存在但驱动与它不握手」断层）。
3. **standard/demo 代批走产品 decide**：既有 director-proxy 行照写（纪律 73 净额口径不變）后，调 `POST /api/approvals/human-gate/<id>/decide` {decision:approve, note=代批标注}——产品审批历史落记录（actor=studio 管理面身份+note 明示 proxy）；404（已裁决）=幂等通过；失败记 `g5-approval-decide-failed` 显形。
4. 上批的探测（g5-approval-history-missing）保留为验收面：decide 成功即探测通过，审批面承载不再降级计达（方案 §2.6.8 消费纪律 6 的执行件）。

### 二、check-issue-clearance 改「末次 DISP 生效」＋resolve/waive 回验根治（mx-compensation-ledger.sh）

issues.log 是 append-only 事件流，唯一键的处置终态=该键**最后一条** DISP 行（与报告第 4 章「按唯一键去重收尾」同口径）；原实现把历史任一延后行都计入，人工复核回写终态后仍恒红。改为 per-key 取末次 DISP 再判延后；配套测试补场景④（延后后补观察终态→rc=0）。
清账首战另暴露 resolve/waive 回验缺陷：旧实现 grep 字面 tab 模式在多字节行上假阴性（写入成功却报「未找到」exit 1，run23 实测 28 笔假错、行实态经 awk 复核全部正确）——回验改 awk 字段精确断言（$1==id 且 $6==状态）；顺带订正 prelaunch ⑯ 失败提示的无效传参形态（`list --status open`→`list open`，list 吃位置参数）。

### 三、run23 台账清账执行（SIM_ROOT 运行态，用户裁定「全部清账」授权）

**代偿 151 笔（compensation-ledger.tsv open→终态）**，按类型：

| 类型 | 笔数 | 动作 | 理由（waive/resolve 备注） |
| --- | --- | --- | --- |
| dispatch-preset | 116 | waive | 设计内代演：预写派发词=副驾形态声明面（方案 §1.5/§2.6.5 台账定义），非产品缺陷——用户 2026-10-31 裁定全部清账 |
| auto-approve | 18 | resolve | 审批代批已产品通道化：G5 批准走 human-gate decide＋审批历史留痕（本批落码，锚=本批 commit）——用户裁定 |
| nudge | 12 | waive | 监督器设计动作（空转轻推，PR-3 面）——用户裁定 |
| card-walk-done | 3 | waive | G5 评审卡代走 done（standard 姿态设计内；strict 收紧面由 §2.6.5 闸键语义补则承载）——用户裁定 |
| card-backfill | 1 | waive | 导演补记录 t_7fcbddcd（review-card-missing 已修同源；PR-4 面无对应产品缺陷修复，按 waive 处置——对上批 spec A.1 建议 resolve 的偏离，原因=resolve 判据要求产品修复 commit 锚而该缺陷无修复件） |

**问题单 DISP 带锚回写（30 观察＋11 延后=41 唯一键，issues.log 追加终态 DISP 行）**：

- 已修升桶（带 commit/文件锚）：roster-org-matrix-mismatch（be6f9d086）、driver-restart-storm（be6f9d086）、r18-collection-missing·step-2;4（be6f9d086 同段别名折算）、g3-local-gate-missing×3＋gate-evidence-blocked（2026-10-30-run23-divergence-retro.md：三支 testlog 回填＋变体命中）、test-report-missing（REPORT-DONE-RFD-001 在 integration，报告 L1 实测行）、audit-finding（merchant-doc-backfilled 已修同源）、g5-approval-ui-empty（run23 回填＋本批根治件）、eval-gate-gap 族（SCRIPT_DIR 导出重跑转 GAP，报告证据八）。
- 观察终态（人工复核维持，理由=真值留痕/设计内/需外部条件）：g1-acceptance-blocked、g2-security-not-closed、security-rereview-auto、gate-breaker 族、g5-ready-fail（G5 打回环按设计工作，判词真值不改判——用户裁定维持）、conclusion-gap×2（下轮派单词带结论行纪律已入册 049f7bbd8 纪律 66 面）、zero-delivery（治理类卡合法形态）、eval-live-evidence-missing（需生产流量接入，报告明确 no_data 口径——不阻断下轮，用户裁定）、其余过程级噪声键。
- 延后桶清零：全部 11 键获终态（已修或观察），无延后残留。

**执行通道**：waive/resolve 走 `mx-compensation-ledger.sh waive|resolve`（既有清偿门通道）；DISP 回写按纪律 28③ 以 append 方式追加带锚 DISP 行。用户「全部清账」裁定即纪律 28② 要求的人工处置授权；执行时间戳与操作者随行记录。

### 四、裁决③记录：G3/G4 fail-soft 维持

用户裁定「否」——G3/G4 缺口显形口径（V8.56：带缺口 chip＋警示行＋G5 兜底）维持，不收紧为 fail-closed；§5.3 判据零改动。附录 B#5 遗留项关闭。

## 2. 决策记录

- **D1 G5 根治走「驱动接线」而非「服务端改造」**：产品 human-gate 三端点+历史+事件投影闭环已在（human-gate.ts decide() 单函数三落点），缺的只是驱动与之握手；零服务端改动=零爆炸半径，且与「推演引擎能力逐步以产品面承载」的 §1.5 收紧路径一致。
- **D2 strict 中继不改闸键真值源**：approved.events 仍是唯一闸键文件（纪律 73 机械判据读它）；产品裁决→驱动中继→approved.events，actor 用产品 decidedBy（真人名），非 proxy——净额口径不受影响。
- **D3 auto-approve 用 resolve 而非 waive**：resolve 判据=对应缺陷修复合入 main 带锚——本批 human-gate decide 通道正是 PR-2「审批通道」的产品侧根治件；116 笔 dispatch-preset 无修复件可言（设计内），只能 waive。card-backfill 从上批建议的 resolve 改 waive（无修复锚，禁硬凑）。
- **D4 清账不改写既有 DISP 行**：append-only；终态由新行承载（末次生效语义，变更二配套）。报告 final-report 不重生成——归档交付物冻结于 report_done 时点，台账是活账，双时点各自可反查。
- **D5 G5 相关 DISP 不升「已修」**：g5-ready-fail/gate-breaker 族是闸门真值留痕（打回环按设计工作），不是缺陷——终态=观察（人工复核维持），禁把真值记录洗成已修。

## 3. 验证

- `bash -n` aipay-scenario.sh／mx-compensation-ledger.sh 过；issue-clearance.test.sh 四场景（含新增④末次 DISP 生效）ALL-PASS；run-gates sh 段 rc=0。
- 清账实证（2026-10-31 实跑，SIM_ROOT 台账；清账前双件备份=compensation-ledger.tsv.bak-20261031-clearance／issues.log.bak-20261031-clearance）：
  - `summary` → 总计 150 笔，open 0（waive 132＋resolve 18；dispatch-preset 116/nudge 12/card-walk-done 3/card-backfill 1=waive，auto-approve 18=resolve）。
  - `check-clearance` → 清偿门 ✓（20261028-v8-run23 无 open 代偿），rc=0。
  - DISP 终态分布（末次口径）→ 50 唯一键=已修 22／观察 28／**延后 0**（延后 11→0：6 键升已修带锚、5 键转观察终态；观察 30→28：7 键升已修带锚）。
  - `check-issue-clearance` → 延后清账 ✓（问题单延后桶=0，末次 DISP 口径），rc=0。
  - resolve/waive 回验修复后实测：同单幂等重 waive 报 ✓、不存在 id 报未找到 rc=1。
- `bash -n`×3＋issue-clearance.test.sh 四场景 ALL-PASS；run-gates sh 段 rc=0。

## 4. 设计文档影响

DESIGN_SYNC: none——G5 批准走产品通道是 §2.6.8 消费纪律 6（上批 0a83fb67e 已立）的执行件，无新契约；fail-soft 维持=零改动；清账是运行态台账处置。判据/闸名/阈值零变化，整合正本与数字总账不动。
