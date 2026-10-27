# 全流程推演与研发治理融合（2026-10-27）

分支：`feat/sim-governance-convergence`（worktree `sim-governance-convergence`，自 origin/main f2793d2bb 起）。

## 变更

用户裁定（2026-10-27）：全流程推演程序与研发治理融合。推演保留六类执行面——启动、脚手架监测、模拟人类操作的导演类串接行为、截屏、查看本机推演集群的全局视野、撰写报告；其余能力（六闸判读、判词解析、熔断、UAT 判定、问题单与处置、工作台账、治理指标、评测判据、报告验收）与研发治理归一，只保留一套产品侧实现。

现状核查结论：评测编排（`simharness/mux/mx-eval-lib.sh:6`）与治理结果快照（`simharness/mux/mx-closure-snapshot.sh:8`）已按"产品计算、推演透传"运行；但 G1 判读（`mx-scenario-lib.sh:2160`）、判词解析族（`:1495`）、熔断（`:1880`）、UAT 判定（`uat_verdict.py`）、工作台账（`:2069`）、治理指标（`:2182`）、评测判据（`mx-eval-summary.py`）、报告审计（`mx-report-audit.py`）仍是 Bash/Python 第二实现，与 `runtime/governance/metrics.yaml:1` 的口径单源声明冲突。

另核查出三项现行断点（驱动与产品校验已脱节，迁移首批必须修真实写链而非放宽校验）：

1. G5 发布门写入无证据锚：驱动发 `decision=approve`（`aipay-scenario.sh:1963-1968`），产品校验要求 approve 必带 anchor（`custom/server/simcenter/release-state.ts:145-167`），当前写链必 400，仅因驱动对失败只记问题单而未暴露。
2. UAT conditional 缺真实认可：驱动未带 `acknowledged:true`（`aipay-scenario.sh:2309-2319`），产品校验拒绝（`uat-state.ts:66-96`），同上被吞。
3. 评测取样只认旧报告路径：`mx-eval-lib.sh:43-45` 只读 `docs/test/<RFD>-test-report.md`，而测试报告谓词（`mx-scenario-lib.sh:1394-1421`）已支持 `docs/reports/TEST-<RFD>.md` 双路径。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 融合架构＝研发治理内核＋推演执行器：规则、判定、状态、台账一套实现；推演保留启动/监测/导演/截屏/集群视野/报告撰写 | 用户裁定的边界；消除第二事实源即消除 `metrics.yaml` 声明的口径冲突 | 两个目录机械合并（否决：SIM_ROOT 隔离与写口分域不变）；维持现状双实现（否决：三套真值已实锤漂移） | 是 |
| D2 | 新增 `custom/server/governance/lifecycle/*` 聚焦模块承载判词/G1/熔断/组合判定，不把 QGate 当六闸总引擎 | `qgate/src/core/align.ts:16` 明示 L0-L5↔G1-G6 映射仅人读；QGate 是机器检查件之一，生命周期组合是另一层职责 | 用 QGate 直接当六闸引擎（否决：语义错位，且冻结面 R3 禁拆闸禁新增第七闸） | 是 |
| D3 | G5/UAT 状态机实现上移治理域（`governance/lifecycle/`），`simcenter/release-state.ts`、`uat-state.ts` 改为兼容再导出，`/api/hermes/sim/release-gate*`、`/api/hermes/sim/uat-verdict*` 路由保持可用 | 状态机是通用生命周期语义非推演专属；simcenter 是只读聚合域（其文件头自述"只读/聚合"）；路由冻结防页面与驱动断链 | 直接删旧路由换新前缀（否决：消费面断链，违反兼容判据） | 是 |
| D4 | 报告归属拆开：撰写（叙事/HTML/脱敏/合并，含 `report/part1-skeleton.ts` 回推演链）归推演；验收规则（`report/acceptance.ts`）归治理；`mx-report-audit.py` 保留为 CLI 兼容壳 | 用户明示"撰写报告保留在推演中"；验收是治理判据属治理 | 沿用 2026-10-26-nine-point-docs-sync D1"报告能力正本在产品侧"（否决：本轮用户裁定覆盖其归属面；该决策的其余部分——生成器是兼容消费壳——仍有效） | 是 |
| D5 | `state.env` 降级为导演断点续跑投影：六闸键仍在但放行权威移到治理结果；`issues.log` 改为治理问题台账的确定性导出（服务端单写，投影只读） | 写入口唯一（整合正本 §3.7 边界判据）；旧消费者（监督器/报告/产品端点）继续可读 | 让治理服务直接写 state.env（否决：导演续跑状态与治理判定混写，双向耦合） | 是 |
| D6 | 评测判据（PASS/GAP/FAIL 与阈值）迁入产品 eval 域；场景 rubric/难度/角色/redteam 参数版本化为显式输入；`mx-eval-lib.sh` 只剩端点编排与证据采集 | 评测业务逻辑正身已在 `custom/server/eval`（V8.45 立），判据留推演侧即第二事实源 | 在推演侧继续维护 `mx-eval-summary.py`（否决：阈值改版需双侧同步，已实锤漂移风险） | 是 |
| D7 | 启动器归属回推演：`harness/sim-launch.ts` 启动能力迁至 simcenter 推演运行域，`/api/harness/sim-launch/*` 路由与安全边界（SIM_HARNESS_LAUNCH=1、super_admin、固定脚本、单实例、只杀自有 PID）不变 | harness 域是治理读模型（其 AGENTS.md 自述），启动推演是推演运行面职责 | 保留在 harness 域（否决：域职责错位） | 是 |
| D8 | 退役纪律：每项旧算法先影子对照（同输入新旧判定逐条一致）再删；静态源码锚测试同步改指向新正身，禁止以"锚还在"留双实现 | 既有路线（专题档案退役门槛：产品正身+整轮走通+影子对照后删原件） | 一次全删（否决：判词语料含 run2/run12/f1979781 三案沉淀，无对照直删即丢行为回归面） | 是 |
| D9 | conditional 认可语义收紧：无真实人类认可事件不得写 `acknowledged:true`；导演测得"有条件通过"时写 pending-acknowledgement 记录，认可事件落 approvals 域后由治理确认 | 运动员/裁判员分离（orgloop 介入点登记同款纪律）；当前驱动若为过校验自动补 ack 即造假 | 驱动自动补 `acknowledged:true`（否决：伪造人类认可，违反"证据先于声明"） | 是 |

冻结面不动：26 步主链、六闸判据语义、G6=`retro_done`@步24、spec-first/L2 门禁、`SIM_ROOT` 隔离、写口分域（日常不写推演台账）、`/app/sim` 导航。判词语料行为（末判词赢、成对弃、锚点白名单、卡面 FAIL 优先）逐字迁移，characterization tests 先行。

## 验证

- 每批：目标 `npx vitest run <path>` + 相关 `bash` 守门 + `npm run typecheck:harness`（涉服务端）。
- 收尾：`bash simharness/tests/run-gates.sh` 全量、`npm test` 全量、`tests/isolation-boundary.test.sh`、inject 重放。
- 真实写链：Koa 临时 SIM_ROOT 契约测试（G5 anchor/幂等/409、UAT conditional ack、AC-1≠AC-10）。
- 影子对照：判词/G1/UAT/熔断/评测/指标新旧实现同输入一致后才删旧件。
- 活体：隔离环境起服走查关键端点；整轮 26 步推演（受模型额度制约时如实申报缺口，不以 fixture 冒充）。

## 设计文档影响

DESIGN_SYNC: none
本批为立项 spec（决策事实源先行），未触代码与设计文档。下列设计文档影响在实施收口批随代码修订同批兑现，届时本节改声明 touched 并列入变更集（L2 声明与兑现同批纪律）：
- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`——§3.6 契约 5"推演验证"与 §3.7 边界判据补"治理实现单源"层；版本行随批。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`——端点/模块数字随批。
- `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`——§1.5 产品范围声明的实现归属细化（判据语义零改动）。
- `simharness/README.md`、根 `README.md`、`docs/USAGE.md`——职责面描述同步。
