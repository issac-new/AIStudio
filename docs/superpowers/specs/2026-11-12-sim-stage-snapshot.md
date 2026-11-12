# 2026-11-12 推演阶段快照与恢复

> 决策事实源。来源：2026-11-12 全仓设计复盘 P2-13「阶段快照与恢复」第一段。
> 现场病：run 单轮 8-27 小时，事故重跑成本极高——run29 审计环烧 4.18h、监督器
> 84 次重启；断点续跑的幂等键全在 state.env，但事故现场常伴随 evidence 损毁/键
> 回退，只有 state.env 不够回到干净断点。

## 变更

### 1. 新增 `simharness/mux/mx-stage-snapshot.sh`（save/restore/list，自包含）

- **save <run_dir> <gate> [--force]**：闸过键后把断点物料打成
  `run_dir/snapshots/<gate>.tar.gz`（临时路径+mv 原子落位）。物料清单：
  - `state.env`（断点续跑幂等键的唯一载体）；
  - evidence 关键件：`issues.log`/`scenario.log`/`approved.events`/
    `pending-backfill.tsv`/`compensation-ledger.tsv`/`governance-metrics.json`
    逐名收集 + evidence 根下其余 `*.json`/`*.jsonl` glob 全收（治理闭环快照、
    r18 帧清单、评测摘要、release-gate/uat 台账等）；
  - `boards-summary.json`：看板库摘要（每库 sha256/bytes/tasks 计数）——只摘要
    不打包库本体（活体库回写有撞库风险，恢复面以 state+evidence 为界）；
  - `manifest.json`：闸名/闸键命中与值/next_step/文件清单+sha256/harness commit。
- **restore <run_dir> <gate>**：解包到临时目录 → 按 manifest 逐文件 sha256 校验
  （校验失败绝不写现场，拦篡改/半包）→ 清单内文件逐个原子覆盖回 run_dir →
  报告闸键值与下一步步骤。清单外既有 evidence 文件一律保留（append-only 审计
  纪律，禁删）。
- **list <run_dir>**：列已有快照与 manifest 摘要。
- 前置校验：闸键未落即 save → 退出码 3（合法态静默跳过，如 G4 评测 GAP 轮），
  其余失败一律非零响亮。
- 自包含约束：不 source mx-lib.sh（其 source 期有建目录/写软链/改 PATH 副作用，
  restore 必须零副作用）；SIM_ROOT 推导序 = `MX_SIM_ROOT` env > run_dir/../../
  （runs/<id> 布局），推不出时看板摘要缺席（fail-soft，manifest 如实记 null）。

### 2. 驱动挂钩：9 处「闸 pass 分支 +1 行」，开关 `MX_STAGE_SNAPSHOT=1` 默认关

挂钩函数 `mx_stage_snapshot_maybe <gate>`（mx-scenario-lib.sh，sset_once 邻位）：
开关关闭时零开销直接返回；开启后子进程调 save，失败 fail-soft 记
`ISSUE|stage-snapshot|<gate>` 不杀驱动（断点续跑本体是 state 键幂等，快照是
恢复增强件，不构成闸依赖）；rc=3（未过闸）静默。save 幂等（同闸快照已在即
skip），监督器重启循环每圈重放零开销。

aipay-scenario.sh 落点（file:line 见验证段）：

| gate | 挂点语义 | 闸键（state.env） | 恢复后下一步 |
|---|---|---|---|
| g1 | reqgate 块尾（dlv_gate_try G1 pass 后） | g1_frozen | dispatch |
| g2 | G2 初评 PASS 收尾 + 复评 PASS 收尾（两处，同闸幂等落一份） | g2_arch_pass | close |
| g3 | devimpl 块尾（dlv_scenario_phase P3 后） | g3_code_pass | testpass |
| g4 | testpass 块尾（GAP 轮 g4_pass 未置时 rc=3 跳过） | g4_pass | ready |
| g5 | ready 块尾（两帧拍摄后） | g5_ready | release |
| g6 | release 块尾（r18_guard 20 后） | release_done | uat |
| uat | uat 块尾公共收尾（全过/有条件两分支汇合处） | uat_done\|uat_conditional | retro |
| report | report 块尾（dlv_scenario_assert 后，终态点） | report_done | （终态） |

### 3. 恢复 = 解包 + 既有断点续跑，不改驱动续跑语义

恢复后直接重跑 aipay-scenario.sh：此前步骤由 state 键幂等跳过（与监督器重启
续跑同一机制，restore 不引入第二套续跑语义）。不做事件回放（P2-13 下一段）。

### 4. 守门测试 `simharness/tests/stage-snapshot.test.ts`

run-gates.sh 自动聚合（sh 段 glob `tests/*.test.sh`、vitest 段 include
`tests/**/*.test.ts`，无手工注册清单）。覆盖：save→篡改现场→restore 恢复
state.env/evidence、篡改快照被完整性校验拦截、闸未过 rc=3、幂等 skip、
list、bash -n 三脚本、驱动 9 挂钩与开关默认值的源层断言。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 快照点=闸过键处（G1-G6+uat+report），非每步 | 每步快照 26 份×tar 开销大且大多用不上；闸点是「重跑一个阶段」的天然边界。uat 单列（release 与 retro 之间独立阶段，run29 类审计环事故正是该区间） |
| D2 | evidence 收 *.json/*.jsonl+五个具名日志，不收 steps/ 截图等大件 | 快照目标是断点续跑（键+台账+时间线），截图帧可由重采集恢复；tar 体积失控会让快照在长轮里被跳过 |
| D3 | 看板库只打摘要不打包本体 | 库是活体（worker 持续写），回写旧库=撞库；摘要 sha256+计数足够恢复后对账发现漂移 |
| D4 | restore 只覆盖清单内文件，不删清单外文件 | evidence 是 append-only 审计面；「回到快照点」以键与台账为准，多余文件如实保留并在恢复报告提示 |
| D5 | MX_STAGE_SNAPSHOT 默认关 | 首轮观察期不动既轮默认行为；观察 1-2 轮无异常后再默认开（届时另批修订本 spec） |
| D6 | 挂钩 fail-soft（失败记 ISSUE 不杀驱动） | 快照是恢复增强件；它失败时推演退化为现状（无快照裸断点续跑），不该因此中止 20+ 小时的轮次 |
| D7 | 自包含脚本，不 source mx-lib.sh | mx-lib source 期副作用（mkdir/软链/PATH）与 restore 零副作用要求冲突；独立工具也便于测试直调 |

## 验证

- `bash -n` 三脚本（mx-stage-snapshot.sh / mx-scenario-lib.sh / aipay-scenario.sh）
  全过（测试内断言）。
- `npx vitest run simharness/tests/stage-snapshot.test.ts`（simharness root）：
  9 用例全绿（见测试输出）。
- `bash simharness/tests/run-gates.sh`：sh 段+vitest 段全过。
- `node scripts/maintenance/gen-doc-indexes.mjs --write` + `--check`：过。
- `node scripts/governance-lint.mjs --budget`：0 problem（mux 工装脚本与
  .test.ts 均不在 mechanism-budget 计数类目）。
- 全量 `npm test`：Tests 行见交付报告。
- 挂钩落点（aipay-scenario.sh）：456/1159/1203/1640/2158/2579/2612/2791/3489。

## 设计文档影响

DESIGN_SYNC: none 附理由：推演工装执行面变更（mux 快照工具与驱动挂钩），
不触及整合正本（docs/design/*）与数字总账的任何口径；simharness 的恢复语义
文档化由本 spec 承载。
