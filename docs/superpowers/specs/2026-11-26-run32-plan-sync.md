# run32 开跑前方案与程序同步批（run31 后八天设计变更吸收）

## 变更

run31 终局（2026-11-18）至本批（2026-11-26）之间，hermes-agent 基线两次换血（v0.23.3→v0.23.4）、studio 基线进 v0.8.30、zcode 进 4.0.0、整体包发至 v1.0.21-overlay，共 88 份新规格入库；推演侧正本停在 §5.16。本批按「哪些变更会改变推演中 agent 实际遭遇的运行时行为或判读口径」筛出并吸收，六件：

1. **方案正本**（`docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`）四处：
   - 「运行基面」状态块进位 2026-11-26：hermes-agent v0.23.4（提交 8fc0374447）、studio v0.8.30、zcode 4.0.0、整体包 v1.0.21-overlay；宿主覆盖层 31 件滞后（H-1，待用户裁决）不影响推演供给——快照供给新增仓内基线导出通道（见第 2 条）；SIM 实体维持拆除态，run32 开跑前重建。
   - §5.14 第 4 条（开跑时间学 G-d 窗）废止注记：用户 2026-11-26 裁决「没有需要避开的时段，夜间正常跑」——开跑时刻不再受窗约束，凌晨段处置回归值守形态谱系（既有判据不变，run14 空转收场判据等）。
   - §5.11 验证面扩组至十八：新增组 18「sim-product 产品面」（场景库发现＋拍摄位四态＋运行监督状态三个只读 REST 面），承载路线图 P1/P2/P3 挂的「SIM 重建后端到端验收」；准出规则计数同步。
   - 新增 §5.17「run32 开跑前吸收条款」八条＋§4.1 运行手册补快照源开关注记。
2. **推演程序**（simharness）五件：
   - `mx-lib.sh`：①`KANBAN_UNMARKED_TIER` 缺省 T1 进推演进程环境（补丁 803 未标层卡缺省 T2 后，派发器对无授权卡记 needs_decision 不派发——推演建卡不带层标记，不处置即派发停摆）；②快照供给新开关 `HERMES_AGENT_SRC_PRISTINE=1`：从本仓 `git archive HEAD -- vendor/hermes-agent` 导出纯净基线并 git 化，替代宿主快照源（宿主 H-1 漂移不影响推演）；③mx-up 起 studio 时补传 `SIM_SCENARIOS_ROOT`／`SIM_CAPTURE_PLAN_PATH`（两个端点按进程 cwd 解析，SIM_ROOT 下必落空——路线图端到端验收的真实断链）；④新增 always-on 取证函数（gateway 日志三 watcher 关键词计数＋deferred 台账计数）。
   - `aipay-scenario.sh`：开跑段与报告步各取证一次，落 `evidence/always-on-watchers.jsonl`——§5.15 第 1 条立法的取证面此前无生产方（run31 由值守手工取证），本批补齐生产方。
   - `mx-capability-probes.mjs`：组 17 正例判据更新（补丁 793 已扩读面，列表 JSON 应携 version/verification——在场即断言数值形状，缺席如实取证记缺）；新增组 18 三探针。
   - `capability-probes.test.ts`：组名单扩至十八＋sim 三路由挂载夹具＋组 18 断言。
3. **挂账台账回填**（两份）：`2026-11-18-run32-pending-batch.md` 七项状态落锚（N32-1 口径换源定谳 session_model_usage／N32-2 tri-disp-backfill 落码／N32-3 mx-recovery-lib 首个缺失键／N32-4 值守手术面入库（探针 403 双合法＋stamp 内容指纹＋五枚重造补丁按原版保留）／N32-5 提交 37b363a／N32-6 补丁 793／N32-7 run31 复盘对账段）；`2026-11-18-run33-pending-batch.md` N33-2/N33-3 标注已清（提交 df4eb0118／414335740）。状态列照实改写，不删行。
4. **数字总账**（`2026-10-23-swarmstudio-design-ledger.md`）：表头核实日 2026-11-17 进位 2026-11-26（§C 各行已随 11-26 发版批核对进位，本批只进表头日期并补一行核对注记）。
5. **simharness/README.md** 运行基面段同步：快照源开关用法与 v0.23.4 基面一行。

## 决策记录

1. **Mechanical·`KANBAN_UNMARKED_TIER=T1` 缺省进推演环境**：授权门锚 `vendor/hermes-agent/tools/kanban_tools.py:82-86`（未标层缺省读该 env，非法值回落 T2）＋派发拦截锚 `vendor/hermes-agent/hermes_cli/kanban_db_dispatch.py:2289-2300`（T2/T3 在认领前验证持久化授权，无授权记 needs_decision）——推演建卡不带层标记（`simharness/mux/mx-scenario-lib.sh:311` 建卡只带 --project），且全推演环境无授权持久化数据。不处置＝run32 派发全面停摆（比 run31 任何一次断摆都深）。T1 直通即恢复 run31 同语义；env 只进推演进程树（gateway/驱动/hermes-sim CLI），产品宿主档不变。`MX_KANBAN_UNMARKED_TIER` 保留覆盖口，授权体系接入推演组织模型后可整体撤除。
2. **Mechanical·快照源默认仍宿主、推演显式走 pristine 开关**：`mx_provision_agent_src`（mx-lib.sh:842）已有 `HERMES_AGENT_SRC_FROM` 覆盖口但要求来源带 .git——仓内 vendor 树不带 .git（仓规禁建），直接指过去会被跳过。本批加 `HERMES_AGENT_SRC_PRISTINE=1`：`git archive` 导出基线→git init→交回现有「按内容指纹建键→拷 tracked 文件→打补丁→runtime 部署」流程，供给键按内容指纹天然区分两源。不改默认源（改默认=大机制变更，宿主 venv 候选与 config 语义仍被 hermes-sim wrapper 依赖；H-1 解决后宿主源恢复无损）。纯净基线＋补丁序列＋runtime 部署＝注入态等价（inject 518/518 幂等已证），宿主 `kanban_parser.py` 缺 --project 参数的 H-1 漂移不再触达推演。
3. **Mechanical·组 18 只读无负例**：三个面均为只读投影（scenarios 列表/详情 fail-soft 空态、capture-plan 四态投影、simrun 状态 fail-soft disabled）——无拒绝语义面可探，正例-only 合法（组 5/6/7 先例）。
4. **Mechanical·dreaming sunset 执行面落地**：观察窗第二轮=run32。口径澄清：机制预算对 dreaming 单项退役（补丁 788 移 skip 名单）与整批退役（三项判据）是两条独立判据，方案 §5.15 第 1 条即单项口径，无矛盾。run32 若 dream 产出仍为 0，由 run32 复盘批执行单项退役（788 移名单、预算行更新、报告如实记录），owner=run32 复盘批；取证生产方由本批补齐（always-on-watchers.jsonl 自动落盘），值守不再手工。
5. **Mechanical·token 值守读法不新增脚本**：真值聚合已有单一实现（`simharness/mux/mx-report-gen.py:5133-5165` 读各 profile session_model_usage），§5.17 记录值守一行读法即可；不新增机制文件（机制预算纪律：脚本上限 79 对在册数，无必要不涨）。
6. **Mechanical·档位卡维持可选**：v0.23.4 批遗留的 kanban_verification_levels 测试三枚存量红未复跑，卡级 verification 档位的活体标定继续留 run33；run32 任务书不强制档位卡（理由同 run31：验收环不叠加二次验证依赖）。
7. **UserChallenge·范围与时段确认**：用户 2026-11-26 指令「修订全流程推演方案及推演程序，启动新一轮推演」；同日补充裁决「没有需要避开的时段，夜间正常跑」（废止 §5.14 第 4 条的开跑窗约束，本批照录）。

## 验证

- `npx vitest run simharness/tests/capability-probes.test.ts`（十八组齐＋组 18 三探针绿＋组 17 更新后绿）
- `npx vitest run simharness/tests/harness-gate-integrity.test.ts`＋`bash simharness/tests/run-gates.sh`（推演门整面）
- `bash simharness/tests/jargon-source-gate.test.sh`（方案正本新段落过词表门）
- 合并档回归 `npm run regress -- --scope merge`
- 机制文件清单有变更（mx-lib/aipay-scenario/probes）→ 机制 digest 变化 → 重烧 `mx-burn-test.sh` 取 pass 收据（开跑硬门 ㉛）；收据 verify-latest 过后才开跑
- 实物链：SIM 重建（pristine 源）→ mx-up → 组 18 探针 SIM 环境活体 → 预检三十四项全绿 → 开跑 run32

## 设计文档影响

DESIGN_SYNC: touched。修订件＝`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`（核实日进位 2026-11-26＋运行基面注记）与 `simharness/README.md`（运行基面段同步快照源开关）；整合正本无契约面变更（推演快照源属运行事实，正文不动）。
