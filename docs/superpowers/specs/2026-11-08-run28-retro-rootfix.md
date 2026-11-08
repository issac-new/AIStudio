# 2026-11-08 run28 复盘根治批（证据链/载荷契约/审计收敛）

> 决策事实源。复盘对象：`20261107-v8-run28`（14h29m，六闸全过，report_done=1794090918）。本批清偿收官后仍在现场暴露、但未进入 N28 台账的产品缺陷；证据取自 run28 运行产物与源码，不引用记忆转述。

## 背景与结论

run28 的组织流程跑完了，但推演工装在三处失效，导致「六闸全过」的报告建立在空证据与人工补录之上：

1. **过程时间线为空**。`runs/20261107-v8-run28/evidence/scenario.log` 全文只有 2 行 383 字节，两行均为值守人工补抄的段界行。报告里“完整过程日志”的链接指向空文件，`mx-gate-timing.sh` 无输入，熔断器的日志复位通道恒为零。根因是 `note()` 把 `log()` 的 stdout 管道给 `tee`，而 `log()` 只写 stderr，tee 永远收到空输入；守门测试还把这一坏实现钉成了不变量。
2. **R18 载荷契约无人校验**。报告生成在 06:28:12 与 06:30:24 两次失败，驱动日志留下 `mx-report-gen.py:2763 AttributeError: 'str' object has no attribute 'get'`——`effect.evidence` 被人工补录成字符串数组。同一形状在审计器、`r18_matrix.step_ok`、`unified-report-layer` 等处都会抛异常；审计器没有分区隔离，一次异常终止全部检查，最终形成 18 次审计重入、11 类缺口逐轮暴露的“剥洋葱”。
3. **降级凭证写法不统一**。`r18-collect-failed` 的主体在源码里有 `step13`（缺连字符）、`step7`、`step-?`（采集失败步号未知）三种形态，审计只识别 `step-<n>`，凭证在案仍判 FAIL；标准处置流程产出的 `DISP` 行则完全不参与 R18 降级。

本批的目标不是把 run28 报告改好看，而是让下一轮在同样的坏载荷、同样的人工补录、同样的处置流程下，**不崩溃、不空证据、一轮审计看全缺口**。

## 问题台账

| 编号 | 级别 | 现象（run28 实证） | 根因锚点 | 处置 |
|---|---|---|---|---|
| N29-1 | P0 | `scenario.log` 全轮空（2 行/383B，人工补抄） | `simharness/mux/mx-scenario-lib.sh:88` `note(){ log "$*" \| tee -a "$SCEN_LOG"; }`；`simharness/mux/mx-lib.sh:179` `log()` 只写 stderr | note() 直接写 stderr 与 SCEN_LOG，不写 stdout |
| N29-2 | P0 | 报告生成两次崩溃；审计遇坏载荷整轮中止 | `mx-report-gen.py:2763`；`r18_matrix.py:60-86`；`mx-report-audit.py:783` 均直接属性访问，无 schema 校验 | `r18_matrix.schema_errors()` 单一校验源＋读写两端安全访问 |
| N29-3 | P0 | 审计 18 次重入（05:31–06:35），逐轮只报一类缺口 | `mx-report-audit.py` 线性脚本，任一异常中止后续检查 | R18 段异常隔离＋`report-audit-findings.json` 侧柜一次列全 |
| N29-4 | P1 | 凭证在案仍 FAIL | `mx-scenario-lib.sh:586,590` `step${_st}`；`aipay-scenario.sh:448` `step7`；run28 `step-?` | 写作面统一 `step-<n>`；审计兼容旧形态并告警 |
| N29-5 | P1 | 处置行不算降级 | `mx-report-audit.py:170-176,733` 只解析 ISSUE 行 | ISSUE/DISP 同权识别凭证族 |
| N29-6 | P1 | 进度锚误判 STALE（lin 的 T03 分支不可见） | `mx-scenario-lib.sh:1340-1349` 只数固定六路与 `wt/t_*` | 动态枚举 `feat/*`、`wt/*`、`test/*` 中本轮新鲜分支 |
| N29-7 | P1 | 交付读数拿不到 AI 对话全文 | `custom/server/delivery/delivery-controller.ts:233-238` 读 `ops[].dialogs`，生产者在 `steps[n].dialogs` | 生产者契约优先，旧形状兼容 |
| N29-8 | P2 | 熔断文案「累计  轮未过」空轮数 | `mx-scenario-lib.sh:2568` jq 失败无兜底 | 缺省回合数回落 `?` |
| N29-9 | P2 | `file:` 空路径误报“源缺席” | `mx-scenario-lib.sh:1212-1213` 未校验 `_rel` | 空路径前置记单，文案指向配置 |
| N29-10 | P2 | `r18_guard` 对坏形状 fail-open | `mx-scenario-lib.sh:602-613` `2>/dev/null \|\| true` 吞异常 | 坏形状记 ISSUE，不再静默 |
| N29-11 | P1 | repo 型产物证据登记静默失败 | `r18-collect.py` 的 `op --frames` 必填，而 `mx-scenario-lib.sh:1205` 的 repo 分支不传帧 → argparse exit 2 被 `\|\| true` 吞；run28 repo 型步载荷靠人工补录 | 帧参数改可选（0 帧允许）；登记失败记 `r18-op-register-failed` |
| N29-12 | P2 | 审计汇总行输出源码字面量 | `mx-report-audit.py:1413` f-string 引号错位，run28 日志实见 `缺图：✅步 无「}，⬜步 {pending_no_img or 」无"` | 修正字符串，缺图计数正常输出 |
| N29-13 | P2 | `docs-ssot-guard` 在 main 已红（A.1 行转义竖线） | `2026-11-07-run28-burn-fixes` A.1 行含 `\|`，守门解析器按裸 `\|` 切列 → 3 列变 4 列；上一批合并时未跑全量 | 该行改「或 tostring」不含竖线；本批顺带清偿 |

不列入本批但留档：dispatcher zombie `reclaimed=0`（run28 中 arch 实际已完工，证据不足以定性缺陷）；被杀驱动残留的 `state.env` 段内键（需驱动 epoch 设计）；审计 FAIL 后自动回退上游起点（本批先产出机器可读缺口侧柜，自动回退另案）；`GATE_ENFORCE_DENY` 收窄的恢复条件（配置债，已有 decisions 留痕）。

## 变更

**验收**：GIVEN 一份 `effect.evidence` 为字符串数组的 R18 载荷，WHEN 运行 `mx-report-gen.py` 与 `mx-report-audit.py`，THEN 两者均不崩溃，审计在同一遍输出全部缺口并写出 `report-audit-findings.json`；GIVEN 一次正常驱动运行，WHEN 任意 `note()` 被调用，THEN `evidence/scenario.log` 追加对应 `[mux HH:MM:SS]` 行，且 stdout 不出现该行。

1. **R18 载荷契约（非机制面）**
   - `simharness/mux/r18_matrix.py`：新增 `as_dict`/`as_list`/`schema_errors(steps)`；`step_ok`、`evaluate` 对非法形状返回未达标，不抛异常。契约覆盖 `steps` 容器、`dialogs`、`ops[].frames`、`effect.text`、`effect.evidence[].{label,anchor}`、`skill.gen/invoke`、`delivery.frames`。
   - `simharness/mux/mx-report-gen.py`：载荷渲染、补录证据、有效图统计、逐步徽标改用安全访问；坏形状渲染为带步号与期望类型的 schema 错误占位。
   - `simharness/mux/mx-report-audit.py`：加载与 R18 段加异常隔离；坏形状转为 FAIL 明细；新增 `evidence/report-audit-findings.json`（全部 fails/warns、步号、工具版本锚）；凭证族接受 `DISP` 行；`stepN` 旧形态兼容并 WARN。
   - `simharness/mux/r18-collect.py`：新增 `validate` 子命令；`load_payload` 校验顶层与 `steps` 类型；保存前打印 schema 告警；`op --frames` 改为可选（repo 型 0 帧登记），登记失败不再静默吞掉。
   - `simharness/mux/mx-report-audit.py`：汇总行引号错位修正（缺图计数恢复输出）；六问快照读取对非对象形状降级。
   - `simharness/mux/unified-report-layer.py`、`mx-narrative-skeleton.py`、`demo-kit-gen.py`：同类安全访问。
2. **交付读数（非机制面）**
   - `custom/server/delivery/delivery-controller.ts`：`extractIntentDialogs` 优先读步骤级 `dialogs`，保留 `ops[].dialogs` 兼容；测试夹具补生产者真实形状。
3. **过程证据链（机制面）**
   - `simharness/mux/mx-scenario-lib.sh`：`note()` 输出到 stderr 并追加 `SCEN_LOG`，不写 stdout；空 `SCEN_LOG` 守卫；`mx-delivery-smoke.sh` 同步。
   - `simharness/mux/mx-scenario-lib.sh`：`r18-collect-failed` 主体统一 `step-<n>`；`r18_guard` 坏形状记 ISSUE；`file:` 空路径前置校验；熔断回合数兜底 `?`。
   - `simharness/mux/mx-scenario-lib.sh`：进度锚保留固定六路，另枚举 `origin/feat/*`、`origin/wt/*`、`origin/test/*` 中 tip 不早于本轮开跑时刻的分支。
   - `simharness/aipay-scenario.sh`：`step7` 改 `step-7`。
   - `simharness/tests/decision-receipts.test.ts`：把 note() 契约改为「stdout 无 `[mux` 行、stderr 有行、scenario.log 有行」，并断言 `$()` 捕获不受污染。
4. **复盘与登记**：新增本 spec；`.qgate/scope.yaml`、附录 A 标题计数与 A.1 行、设计文档索引随批登记；顺带清偿 main 上已红的 `docs-ssot-guard`（A.1 转义竖线行改文案）。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | `note()` 只写 stderr 与 SCEN_LOG，不写 stdout | 写 stdout 会污染 `$(dispatch_in_room ...)` 捕获（`aipay-scenario.sh:1265/1849/2637`），marker 落库会变成整行日志；原测试标题的「保持 stdout」与实际契约相反，按捕获安全修正 |
| D2 | schema 校验单一源放 `r18_matrix.py` | 报告生成、审计、`r18_guard`、测试都已 import 该模块；分散各写一份会重演「三处硬编码」漂移 |
| D3 | 凭证族 ISSUE/DISP 同权，旧步号形态兼容但 WARN | 处置行是标准流程产物，不认等于惩罚按流程走的人；旧形态兼容保证历史轮报告可复现，WARN 保留收口压力 |
| D4 | 进度锚动态枚举分支，不扩固定名单 | 固定名单每出现新分支命名就失效；动态枚举以「tip 不早于本轮开跑」为新鲜度判据，与 `branch_fresh` 同源 |
| D5 | 交付读数以 `steps[n].dialogs` 为主、`ops[].dialogs` 兼容 | 生产者 `r18-collect.py` 写在步骤级；旧形状保留避免历史载荷读数归零 |
| D6 | 审计侧柜本批只做数据面，不自动改重入起点 | 自动回退会改驱动控制流，需独立设计与烧机；先让缺口一次看全，人工/值守按侧柜批量处置 |
| D7 | 机制面集中一批烧机到 archgate | 用户裁决「一并根治并烧机」；机制 digest 变更后旧收据不认账，分散提交会重复烧机 |
| D8 | gate_security 假红导致的 fail-gate 阻断按既有决策清除，不纳入本批代码面 | 该门 55 项红均为 token 字面量假阳（`gate-audit.jsonl` 与 decisions.jsonl 2026-11-07 条在案）；恢复条件沿用既有决策，专项清理另案 |

## 验证

- 语法：改动 `.py` 全量 `python3 -m py_compile`；改动 `.sh` 全量 `bash -n`；`npx tsc --noEmit -p custom/server/tsconfig.json`。
- 目标测试：`npx vitest run simharness/tests/harness-gate-integrity.test.ts simharness/tests/decision-receipts.test.ts simharness/tests/mechanism-behavior.test.ts simharness/tests/unified-report-layer.test.ts simharness/tests/report-three-elements.test.ts custom/server/delivery/__tests__/swarm-collab.test.ts custom/__tests__/docs-ssot-guard.test.ts custom/__tests__/l2-kit-parity.test.ts`。
- 坏载荷复现：把 run28 evidence 复制到临时目录，注入 `effect.evidence` 字符串元素，分别运行报告生成与审计；判据=不崩溃、schema FAIL 指明步号与期望类型、侧柜含全部缺口。
- 正常载荷回归：run28 原始 r18 载荷重跑报告生成与审计，判据=生成成功、审计结论与 run28 终态一致（除本批新增的 schema 检查外不新增 FAIL）。
- `bash simharness/tests/run-gates.sh`：shell 门全 ALL-PASS（r18-capability 四段/审计查8/采集器/值守语义）；vitest 段 361/362，1 红为 `kanban-junk-runid` 夹具对未注入的 vendor 树敏感（主树注入态同用例绿，worktree 注入后复跑绿，非本批面）。
- `npm test` 全量两轮：8585/8585 用例全过（6 文件 skip 属既定跳过）；两轮各带 1-2 个 `vitest-worker: Timeout calling "onTaskUpdate"` 基建错误——与在跑烧机抢 CPU 的负载伪象（用例层零失败），烧机结束后第三轮洁净复跑确认。
- 合并前：`npm test`、`node scripts/merge-invariants.mjs --check --quiet`、`node scripts/governance-lint.mjs --budget`。

实测结果（2026-11-08，worktree `fix/run28-retro-rootfix`）：

- 语法：7 个改动 `.py` 全部 `py_compile` 通过；3 个改动 `.sh` 全部 `bash -n` 通过。
- `simharness/mux/tests/r18-capability.test.sh`：①生成器/②审计/③采集器/④validate 四段全过（新增 ④ 覆盖坏形状 exit 1 与路径定位）。
- `npx vitest run --root simharness tests/{harness-gate-integrity,decision-receipts,mechanism-behavior,v84-frame-gates,unified-report-layer}.test.ts`：196/196 通过（新增 schema 单测与审计侧柜负向用例）。
- `npx vitest run custom/server/delivery/__tests__/swarm-collab.test.ts`：23/23 通过（夹具改生产者步骤级 dialogs，保留 legacy ops 形状）。
- 坏载荷复现（run28 evidence 副本，注入 `effect.evidence` 字符串元素）：报告生成 rc=0、零 Traceback、stderr 两条 `R18 schema` 告警、报告正文渲染「R18 载荷形状非法」占位章；审计 rc=1、零 Traceback、侧柜 `report-audit-findings.json` 记 2 条 schema FAIL（38 WARN）。
- 正常载荷回归（同一副本换回 run28 原载荷）：报告生成 rc=0、零 schema 告警；审计 rc=0、侧柜 0 FAIL/38 WARN——与 run28 终态一致。真实 issues.log 的 DISP 凭证族（frame-capture-failed×多步）正确降级对应步，`step-?` 未知主体 2 条汇总为 WARN 而非误降级（N29-4/N29-5 在真实数据上的验证）。
- 机制面实测（2026-11-08 晚）：`bash simharness/mux/mx-burn-test.sh --until archgate`（MX_G2_WAIT=1500）**pass**——7590s、21 done 键、0 FAIL 行，g2_arch_pass 落键；`mx-mechanism-receipt.py verify-latest --root . --receipts .qgate/burn/burn-receipts.jsonl` **ok**（run=burn-20261108-200101，digest f261cd62…）。N29-1 活体验证：烧机轮 `evidence/scenario.log` 320 行（对照 run28 全轮 2 行）——note() 双写落地，闸计时/熔断日志复位通道恢复有源。烧机环境插曲（与批内改动无关，如实记录）：SIM studio :8802 于 09:38 死亡致首次烧机 32s 预检拒跑，`mx-up.sh` 幂等拉起后恢复；前一会话遗留烧机（burn-20261108-080712）09:28 死亡无收据，其陈旧锁经 guard 四因子判活自动放行。

## 设计文档影响

DESIGN_SYNC: none——改动落在 simharness 推演工装与交付读数消费面：`r18_matrix` 契约校验、报告/审计渲染、`note()` 证据链、进度锚与降级凭证写法；不触及整合正本、数字总账或机制地图行级语义（note/进度锚均为既有机制内部实现修正，未新增机制）。
