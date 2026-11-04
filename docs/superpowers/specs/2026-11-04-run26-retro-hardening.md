# run26 全面复盘根治批（2026-11-04）

## 变更

用户令「全面复盘并根治：既存及潜在风险、进度问题、token 消耗过慢工作不饱和」。以 run26 实测时间账本为据，按损耗排序根治五类根因。

### 实测时间账本（run26：00:02:55 → 07:59:52，477 分钟，六闸全过）

| 段 | 耗时 | 其中可避免损耗 | 根因 |
|---|---|---|---|
| G1→G2 | 154 min | **~81 min** | 修订稿 01:18 已落 origin/main，fanfan 未 @ 复评、arch 全程零回合；驱动只死等 2400s 窗口，无触发方 |
| G2→G4（defect/testpass） | 188 min | **~61 min** | qi 汇总报告挂起：群催 2 次＋驱动 DM 1 次＋值守 DM 2 次全无回合（会话楔死），靠人工换血＋新派单唤醒 |
| 报告审计环 | 58 min | **~45 min** | ①步 7 环节效果驱动**从未采集**（矩阵要求，代码无调用）；②步 19 对话采集失败被 `|| true` 静默吞；③查18「跨模块契约用例清单」派单词未要求；④PART1 按轮注册在合并步才校验（末步才发现，回填靠人工） |
| 其余 | 77 min | — | 编译/分析/发布/UAT 正常段 |

外部渠道空流风暴（EmptyStreamError）两轮各约 10-20 min，属 2026-11-03 用户裁定「梯子消化族」，不在本批整改范围；但盯防指标口径已修正（风暴签名是空流不是 429）。

### 根治五件

1. **复评触发与失联唤醒（最大的两处损耗）**——`mux/mx-scenario-lib.sh` 新增：
   - `mx_owner_last_ts <room> <mxid>`：责任人最后发言时刻（判「安静」用）。
   - `mx_wait_revive <desc> <timeout> <room> <owner> <owner-name> <revive-text> -- <predicate...>`：等待判词时按「责任人安静 ≥420s 且距上次唤醒 ≥600s」自动**以新任务书形态**重派（DM＋群内 mention，最多 3 次），每次落 ISSUE 留痕；判词到达即返回。
   - G2 复审链改造：回灌派发后先等修订稿落仓（`repo_has`），**落仓即由驱动直接向 arch 派复评任务**（不再依赖 fanfan 转告），再进 `mx_wait_revive`。
   - G5 复审链同构改造。
2. **采集缺口在步内暴露**——驱动补步 7 环节效果采集；步 19 采集失败不再静默（落 ISSUE）；新增 `r18_guard <step>` 步末机械核验（读 `r18_matrix.step_ok`），未达标当场登记，不再等到 58 分钟后的审计环。
3. **内容缺口前移到派单词**——TEST-BE/TEST-FE/汇总三处派单书明写「跨模块契约用例清单」小节要求（审计判据 17 机械核对）。
4. **PART1 不再卡末步**——`final-report-merge.py` 新增 `--auto-part1`：本轮未注册时按 state.env 实测时间线与闸键自动起草一页读懂（数据真实、标签明示「自动起草待人工润色」、落 ISSUE），驱动报告步显式传该旗标；人工注册仍优先。
5. **N04 评测证据通道**——`eval_flow` 在消费线上证据前先跑 `mx-load-probe` 落 `evidence/load-probe.jsonl`（fail-soft，失败登记不阻断），使 `g4_eval_gap` 不再固定为 1。

另修派单器告警诊断面（补丁 730）：`kanban dispatcher stuck` 告警在 35 次误报中只给「Check profile health」，本轮实为「一名 agent 卡死＋其余容量占满」；改为挂出 ready 卡明细（id/板/责任人/年龄）并把容量性拒绝（per-profile capped）标注为 capacity-saturated 而非 stuck。

## 决策记录

1. **以「新任务书」而非「催办」唤醒**：run26 两实例实证——arch 楔死换血后旧消息不触发、qi 三催无效；换成完整任务书的新派单即起回合（run24 配方复验）。催办词只作群面留痕，实际触发靠新派单。
2. **修订落仓后由驱动直接派复评**：原设计把「修完喊复评」押在被退回者身上，等于把闸门推进权交给最可能失联的一方；驱动持有落仓事实，应自任触发方。回灌派发保留（人要修订），但复评不再依赖它转告。
3. **PART1 允许机器起草但不许空壳**：run13 闸禁的是「旧轮冒充」与「占位符出厂」；本轮自动草稿取实测时间线/闸键/问题单计数，标注起草来源并落 ISSUE 交人工润色——不造假、不空转，保持「逐轮真叙事」的实质。
4. **采集核验进步内而非事后**：审计环 24 轮里 5 轮以上在追采集缺口，等于把采集纪律的检查点推到最贵的时刻；`r18_guard` 把同一判据（`r18_matrix.step_ok` 单一事实源）前移到步末，缺口在发生处可见。
5. **告警要可诊断**：本轮值守按告警提示去查 venv/profile（错误方向），实际根因是 agent 楔死。告警不带现场数据＝把排查成本转嫁给值守人；补丁 730 让告警自带 ready 卡明细与容量性拒绝标注。

## 验证

- `bash -n`：aipay-scenario.sh、mux/mx-scenario-lib.sh 全过；`python3 ast.parse`：final-report-merge.py 过。
- **新守门（tests/mechanism-behavior.test.ts 追加 5 例）**：`npx vitest run tests/mechanism-behavior.test.ts` → **25/25 全绿**。含两条行为断言直接钉住本轮根因：①判词立即到达时零唤醒（不打扰）；②责任人安静超阈＝群内＋DM 双发并落 wait-revive 问题单；③r18_guard 与审计器同判据（缺件落 ISSUE、齐备静默）；④`--auto-part1` 起草文本不含占位符（run13 闸兼容）且含闸门时刻。
- **全量门禁**：`bash tests/run-gates.sh` → **272 passed / 0 failed**（18 文件）。其中 harness-gate-integrity ⑱ 的「G5 补齐轮收口」窗口 600→1400（等待器换 mx_wait_revive 后距离变长，判据不变，理由写进测试注释）。
- **jargon 门**：`bash mux/tests/jargon-source-gate.test.sh` → HARD=0（方案正本新增条款与 spec 全过）。
- **补丁 730**：`npm run clean && npm run inject` → `applied patch: 730-ag... (to hermes-agent)`，全量 435 枚零 WARN（补丁可重放）。
- **全量 npm test**：合并后 main 执行 7486 passed / 2 failed；两红均为文档机械门（A.1 声明数与行数、设计索引未含本 spec），当场清偿后复跑该两门 **19/19 绿**（详见合并后修复提交）。

## 设计文档影响

DESIGN_SYNC: touched。触及推演方案 §5.5/§5.6 必采证据表的执行面（采集核验前移）与 §5.3 G2/G5 复审链语义（驱动自任复评触发方）；数字总账无变化（闸判据、步数、矩阵分母均未改）。同批在方案正本 §5.10 增补「复审触发与失联唤醒」条款并登记附录 A.1。
