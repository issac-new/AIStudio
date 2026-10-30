# run23 方案×报告全面复盘批：五机制入册 + 收官通道立法 + HumanGate 审批面 + 清偿门扩展 + 采集面参数化

日期：2026-10-31 ｜ 轮次：20261028-v8-run23 收官后复盘 ｜ 类型：docs（方案正本修订）＋fix（harness 执行面）

触发：用户指令「全面复盘最新版全流程推演方案及推演报告中的所有问题，进行修订完善，确保模拟人类操作员工完成全流程需求开发及交付」。

## 0. 问题全集（复盘结论）

### 方案侧（本批全部处置）

| # | 问题 | 锚点 |
| --- | --- | --- |
| P1 | run23 实锤的五项「AI 员工自主完成全流程」保障机制修在了 harness 但没进方案——四批 post-run spec（full-retro/backlog/closure/divergence）DESIGN_SYNC 全 none，下轮无契约可依、复检无判据：DM 死信重发（G1 回灌 `>/dev/null 2>&1 \|\| true` 全静默实录）、terminal-incomplete 残响当完成结算、确定性失败 11 次重启 65 分钟零新增信息、会话轮换档位 report 不动致 126K/241K 截断、DEF 卡挂父依赖阻塞结卡 26h | 方案 §4.3 纪律列表 grep 无「死信/掐流/确定性失败/轮换/DEF 卡」；对应修复锚=四份 2026-10-30 spec |
| P2 | 收官通道无方案依据：run23 操作者按用户指令临时拍板（stop 文件停监督器＋START_STEP=report 直达报告步），三前提/动作/义务未立法，下轮仍需临场造法 | 方案 §4.1 运行手册无「收官」条目；实录=`runs/20261028-v8-run23/evidence/issues.log` run23-operator-closure 条 |
| P3 | G5 HumanGate 批准只写 evidence/approved.events，不落产品审批台账——审批收件箱历史 0 条（g5-approval-ui-empty 闸门级实录），L3 六域审计 fail「审批历史留痕 0 条（人在回路实证）」；run23 用按原 ts/actor 补登记 history.json 收口=回填非根治 | aipay-scenario.sh:1985-2025（批准块只 append approved.events＋release-gate 台账）；报告第 3 章 L3 行 |
| P4 | 清偿门执法面窄：§5.9 清偿门线只查代偿台账 open 笔；纪律 56 已宣示「prelaunch check 断言上轮结构性延后 key 消失」但 mx-prelaunch-check 从未实现该检查（⑯ 只跑代偿 check-clearance）——run23 遗留 11 条延后单可带病开跑 | 方案 §4.3 纪律 56（1968 行）；mx-prelaunch-check.sh:101-103；run23 issues.log DISP 延后桶 11 键 |
| P5 | 报告证据八发布门禁只渲染 verdict+gapKeys 汇总，产品侧逐项 checks（fail→`key=实测（阈值）`点名、no_data→原因码）不进报告——读者看不到哪项差多少 | mx-report-gen.py:2780（单行 gapKeys join）；遗留清单源=2026-10-30-run23-product-capability.md §6#4 |
| P6 | 采集面两缺口：①编码面拍摄位任务号跨轮陈旧（capture-plan.env 写死 t_af224933，run23 曾因 DEV-PAYCORE-S 陈旧拍出「还没有任务工作区」空态帧）；②审批面无 UI 帧（五面承载审批按 approved.events 降级计达） | capture-plan.env:66,77；product-capability spec §4.2 审批行「无步级拍摄位」 |

### 报告侧（run23 final-report 实况，逐条定处置）

| # | 问题 | 处置 |
| --- | --- | --- |
| R1 | 六域审计 L3 fail（审批历史留痕 0 条）与步 20 已修项（g5-approval-ui-empty 已修补登记、帧已重拍）口径矛盾——L3 判定冻结于审计时点，修复后未重跑/未标注 | 本批不动历史判定（审计时点真值，改写=篡改证据）；P3 条款＋探测显形落地后下轮 L3 自然收敛；口径已记入本 spec 决策 D6 |
| R2 | 30 条问题单「观察（收尾链自动归桶：无人工处置在案）」——纪律 28② 待人工复核升桶 | 本 spec 附清账建议表（附录 A），待用户裁定后按纪律 28③ 带锚回写；本批不代写归档台账 |
| R3 | 11 条结构性「延后」单（g3-local-gate-missing×3/gate-evidence-blocked/test-report-missing/g5-ready-fail/gate-breaker-tripped×族/conclusion-gap×2/audit-finding/eval-live-evidence） | P4 机械执法落地后成为开跑硬门；附录 A 给逐条处置路径 |
| R4 | 查15 评测链单项 FAIL（收官终态） | 已收敛：SCRIPT_DIR 导出重跑转 GAP＋PART1 注册解阻塞，终态四查全过（audit-read-state.log 2026-10-31 00:07 实读；补拍轮 memory 互证）——无需动作 |
| R5 | 承载率 1/5 假低 | 已修：_face_step 改显式注册∪自动挂接双源（mx-report-gen.py:4186-4196）——无需动作 |
| R6 | G3/G4 缺口呈现弱化风险 | 已修：V8.56 带缺口 chip＋警示行；缺口本身的清偿走 P4 |
| R7 | 补拍图注/装饰图标 | 已修：ce60c155b/cef650b77——无需动作 |
| R8 | 群聊时间线间歇不挂载第二根源（TypeError rooms.length，因果未定；第一根源 activeRoom 竞态已由 3d3275734 根治） | 产品线挂账另批（本仓 custom/client），本批遗留清单登记，不混入推演侧 |

## 1. 变更

### 一、方案正本（docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md）

1. **§4.3 纪律 62 扩层**：夜间停滞「六层防线」→「七层防线」，第七层=venv 包面守卫（起跑前必在包 import 断言，缺省清单 hindsight_client/aiohttp_retry/anthropic/yaml，MX_VENV_REQUIRED_PACKAGES 可覆盖；执行面与解释器同源解析）。
2. **§4.3 新增纪律 85-89**（编号顺延，锚点=run23 实录）：
   - 85 DM 送达保障：派发类 DM 一律走「发送→房间回读确认→死信检测→自动重发」；重发幂等锚=原 event_id 内嵌去重；三试全败如实返回 SEND-FAILED 并记单（dm-send-failed），禁任何 `>/dev/null 2>&1 || true` 形态静默吞送。
   - 86 流完整性：模型流以 terminal status=incomplete 收尾=残响，禁当完成结算；有重试余额先物理重试，耗尽按瞬态失败面抛错（回合不落 settled，下轮准入面视为可重入）——与 message_stop 缺席同族语义，不完整的响应不得提交。
   - 87 确定性失败停摆：同一子目标连续 N 次（缺省 5，MX_STORM_SAME_MAX 可调）失败且失败指纹（段末 FAIL/条款行哈希）不变=确定性失败，记 driver-deterministic-fail 并停摆退出；指纹变化才继续自愈——禁无效重启把同一份 FAIL 再算一遍。
   - 88 会话上下文治理：会话轮换档位=auto，按轮归一写入网关根＋全部 profile config（单一事实源脚本供给，禁两处各写）；上下文超阈值即真轮换（换会话），禁 report 档只追加建议不动会话。
   - 89 DEF 卡纪律：缺陷卡=叶子工作，建卡禁挂父依赖（不 link 复审/迁移/阻塞卡）；修复合入 integration 后 fixer 立即结卡——依赖守卫拦结卡=派发词缺陷，不是守卫误报。
3. **§4.1 运行手册新增「收官通道」段**：触发三前提（用户明示推进／agent 群停摆超阈（最后真实 API 调用停滞）／闸门熔断两轮未过且无新证据）→ 动作（stop 文件停监督器＋START_STEP=report 直达报告步；全程可逆：report_done 未落键、重挂监督器即续跑）→ 义务（operator-closure 记单留痕、终态如实呈现未过闸、遗留账进清偿面）。收官始终是人工决策，禁自动收官。
4. **§2.6.8 发布门台账条款补 HumanGate 产品审批面**：G5 HumanGate 批准（strict 真人/standard 代批两态）除 approved.events 与 release-gate.jsonl 外，必须可在产品审批面反查（GET /api/approvals/history 含该评审卡记录）；驱动批准路径只写文件不落产品审批台账=接线缺口记单（g5-approval-history-missing），审批面 UI 帧不得以降级计达充数。
5. **§5.9 清偿门线扩展**：开跑前置在代偿 open 笔之外，同时检查上一轮问题单「延后」桶=0（结构性延后须人工处置带锚回写，或经用户裁定豁免）——纪律 56 的机械执法面；§4.1 手册 prelaunch 行同步描述。
6. **§5.4.3 呈现底线补采集两条**：编码面拍摄位 `?task=` 按轮参数化（IDE_TASK 环境变量，缺省回落上轮锚），禁跨轮陈旧任务号拍空态帧；审批面增收件箱队列帧（/app/inbox）为步 20 第二拍摄位。

### 二、harness 执行面（simharness/）

1. `mux/r18-frames.mjs`：PLAN_URL 支持 `${VAR:-default}` 环境变量展开（仅规划行 URL；展开失败回落缺省字面量）。
2. `mux/capture-plan.env`：`devimpl_done`/`ide_done` 两行改 `?task=${IDE_TASK:-t_af224933}`；新增 `ready_inbox|/app/inbox|fanfan` 行（步 20 审批收件箱队列帧）。
3. `aipay-scenario.sh`：步 20 `ready_done` 帧后增 `capture_step "ready_inbox" "/app/inbox"`；G5 批准落台账后增产品审批历史探测（GET /api/approvals/history?limit=50 反查该评审卡，无记录记 ISSUE g5-approval-history-missing——接线缺口显形，不伪造历史）。
4. `mux/mx-compensation-ledger.sh`：新增 `check-issue-clearance` 子命令——上一轮 issues.log 的 DISP「延后」桶 >0 即非零并列出键（与 check-clearance 同 run 解析）。
5. `mux/mx-prelaunch-check.sh`：新增检查项「上一轮问题单延后桶=0」（调 check-issue-clearance）。
6. `mux/mx-report-gen.py`：证据八发布门禁行增逐项 checks 渲染（fail 项点名 `key=实测（阈值）`、no_data 项带原因码短语；缺席回落旧 gapKeys 行，向前兼容）；基准 STEPS_META 步 20 keys 增 `ready_inbox`（按轮注册表随下轮叙事文件带上）。

### 三、新增守门测试

- `simharness/tests/issue-clearance.test.sh`：check-issue-clearance 三断言（延后>0 非零且列键／全观察 rc=0／无 issues.log 容错）。
- `simharness/tests/r18-plan-var-expand.test.sh`：`${VAR:-default}` 展开四断言（变量在位替换／未设回落缺省／无变量行原样／`--url` 回落参数同样展开）。

## 2. 决策记录

- **D1 五机制入册为纪律条款而非新章节**：五项都是 run 中行为契约，与既有纪律 62/83/84 同层；每条带 run23 实录锚，修订可反查。方案是终态表述（无版本沿革），不写「V8.57」标记，变更史归 git 与本 spec。
- **D2 收官通道立法口径**：三前提来自 run23 实录（用户明示＋群停摆 3h+＋熔断两轮）；动作可逆性=report_done 不落键即续跑；义务三件（记单/如实/入清偿）。刻意不立「自动收官」——停滞检测（纪律 87）只停摆记单，收官决策永远在人。
- **D3 G5 审批历史只做探测显形，不做 decide API 根治**：root fix 需先裁定评审卡 decide 的产品语义（走 review-store setVerdict 的对象/verdict 值域/与 kanban 评审卡判词的关系），本批擅接=拿审批域语义赌博；探测显形保证下轮缺口不再静默（run23 的回填补登记不会再被当成已接线）。root fix 列遗留待用户点头另批。
- **D4 不改闸门判据**：G3/G4 fail-soft 维持（2026-10-30 full-retro 批立场：缺口显形、G5 兜底，收紧须用户裁决）；本批清偿门扩展是「开跑前置检查」的执法面补全，不是闸门判定变化——§5.3 判据零改动。
- **D5 run23 归档台账不代写**：30 观察/11 延后的处置回写属人工裁决面（纪律 28②③），本批只出建议表（附录 A）与命令配方；AI 代写处置=伪造人工处置在案。
- **D6 报告历史判定不改写**：L3 fail 是审计时点真值；修复态以 P3 条款＋下轮体检收敛，不在 run23 报告里回改历史判定。
- **D7 编号与词表**：新纪律 85-89（方案现有编号至 84）；「死信重发/收官通道」等术语随条文首次出现给白话括注，不另立词表条目。

## 3. 验证

- `bash -n`：aipay-scenario.sh／mx-compensation-ledger.sh／mx-prelaunch-check.sh 全过。
- `node --check mux/r18-frames.mjs`；`python3 -m py_compile mux/mx-report-gen.py` 过。
- `bash simharness/tests/issue-clearance.test.sh` PASS（三断言）；`bash simharness/tests/r18-plan-var-expand.test.sh` PASS（四断言）。
- `bash simharness/tests/run-gates.sh` sh 段 ALL-PASS（worktree 无 node_modules 语义，vitest 段按 2026-10-30 backlog 批配方由主检出解析补跑；本批零 .ts 改动，vitest 面无新风险）。
- 方案一致性：`grep -c '^8[5-9]\. '` = 5（实测）；§5.3 判据表 diff 为零（实测：`git diff` 判据行无改动）；`jargon-check.py` 对方案正本全文＝无 HARD 违规（实测）。
- 实测记录（2026-10-31 00:2x-00:4x，worktree fix/run23-plan-retro）：
  - `bash -n`×3＋`node --check`×2＋`py_compile`×2 → ALL-SYNTAX-OK。
  - `bash simharness/tests/issue-clearance.test.sh` → 3 断言 ALL-PASS；`bash simharness/tests/r18-plan-var-expand.test.sh` → 8 断言 ALL-PASS（含射手接线与 capture-plan 参数化在位两断言）。
  - `bash simharness/tests/run-gates.sh` → rc=0（jargon-source-gate 修词后全过；顺带清掉 main 既存 3 处 HARD：对齐/实算/收口——run23 打磨批引入未过此门）。
  - 实弹核验：`check-issue-clearance --run 20261028-v8-run23` → rc=1，精确列出 11 个延后唯一键，与 run23 报告第 4 章「延后 11」逐键一致。
  - `docs-ssot-guard`：本分支 5/6 过；1 红=基线自带（`2026-10-30-chat-timeline-race-fix` 未登记——origin/main 既有缺口，local main 35e925ebd 已补 401→404）；本批登记行无幽灵/无重复/计数断言过，合并后并集自洽（404+1=405）。

## 4. 设计文档影响

DESIGN_SYNC: touched——方案正本《2026-10-05-mux-v8-fullflow-plan.md》同批修订（纪律 62 扩层＋新纪律 85-89＋收官通道＋HumanGate 审批面＋清偿门扩展＋采集两条），本文件即其 spec。闸名/26 步/判据数值/阈值零改动，整合正本数字总账无需变更。

## 附录 A：run23 台账清账建议表（待用户裁定后回写，不代写）

回写通道（裁定后执行）：
- 代偿 open 笔：`bash mux/mx-compensation-ledger.sh --run 20261028-v8-run23 resolve <id> "<commit 锚说明>"`（根治件已合入 main 的类型）或 `waive <id> "<用户批准理由>"`（设计内代演，如 dispatch-preset 预写派发词）。
- DISP 升桶：按纪律 28③ 向 issues.log 追加带锚点 DISP 行（已修必须带 commit/文件锚）。

### A.1 代偿台账 151 笔（open 全量）归类建议

| 类型 | 笔数 | 建议 | 依据 |
| --- | --- | --- | --- |
| dispatch-preset | 116 | waive（设计内代演：预写派发词=副驾形态声明面，§1.5；非产品缺陷） | §2.6.5 台账定义＋§1.5 双态声明 |
| auto-approve | 18 | 逐笔核：G5 相关=PR-2 审批通道（P3 root fix 落地后 resolve）；其余 waive 需用户理由 | 纪律 73 代批净额口径 |
| nudge | 12 | waive（空转轻推=监督器设计动作）或按 PR-3 归属裁定 | run23 值守实录 |
| card-walk-done | 3 | resolve（G5 代走 done；strict 面收紧由 §2.6.5 闸键语义补则承载） | aipay-scenario G5 块 |
| card-backfill | 1 | resolve（导演补记录 t_7fcbddcd；评审记录已补） | issues.log review-card-missing 条 |

### A.2 问题单 30 观察键升桶建议（节选高频/闸门级；全量按同口径批处理）

| 键 | 建议 | 锚点 |
| --- | --- | --- |
| roster-org-matrix-mismatch（48 次） | 已修 | full-retro 批#3（^jwt_<名字>= 口径＋issue_once；roster-account-count.test.sh 三断言） |
| driver-restart-storm | 已修 | full-retro 批#5 确定性失败停摆（本批纪律 87 入册） |
| g2-security-not-closed/g1-acceptance-blocked 等 | 观察（维持） | 闸门族真值=闸键与评审卡，非台账缺陷 |
| r18-collection-missing·step-2;4 | 已修 | full-retro 批#7 同段别名折算（载荷判据） |
| zero-delivery | 观察（维持） | 102 张治理类卡零 commit 属合法形态，逐张判定归下轮复盘 |
| g5-approval-ui-empty | 已修（回填）＋根治挂 P3 | issues.log 处置行＋本批 D3 |

### A.3 11 延后键处置路径

| 键族 | 路径 |
| --- | --- |
| g3-local-gate-missing×3／gate-evidence-blocked | 已随 divergence 批「三支 testlog 回填＋变体命中」清偿（缺件 8→5）——按锚 resolve |
| test-report-missing | 测试报告已落 integration（REPORT-DONE-RFD-001 在仓）——resolve 带锚 |
| g5-ready-fail/gate-breaker-tripped 族 | 收官终态留痕=真值记录，不建议改判；waive 需用户理由（收官决策既定） |
| conclusion-gap×2 | 下轮开跑前派单补 DEV-DONE 结论行纪律（run15 F6 既有配方）或 waive |
| audit-finding（merchant 文档缺件） | 已修（merchant-doc-backfilled 已修条同源）——resolve 带锚 |
| eval-live-evidence-missing | 维持延后（需生产流量接入，明确 no_data 口径） |

## 附录 B：遗留清单（本批不做）

| # | 项 | 归属 | 前置 |
| --- | --- | --- | --- |
| 1 | G5 批准路径调产品 decide API（g5-approval-ui-empty 根治件） | simharness＋custom/server | 用户裁定评审卡 decide 语义（review-store setVerdict 对象/verdict 值域） |
| 2 | 企业约束种子库 9 任务补 dimension | 产品线 | compliance 轴跨 privilege_injection/human_escalation 须人工逐题裁定 |
| 3 | 群时间线间歇不挂载第二根源（TypeError rooms.length） | custom/client | 因果未定，另批排查 |
| 4 | 下轮叙事注册表（narrative_run24）带 ready_inbox 键＋IDE_TASK 按轮注入 | simharness | 开跑时操作者设定 |
| 5 | G3/G4 fail-soft 是否收紧为 fail-closed | 方案 §5.3 | 用户裁决（本批 D4 维持） |
