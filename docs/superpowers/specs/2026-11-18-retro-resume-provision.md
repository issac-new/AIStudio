# run31 断点闸前定位与 agent 供给内容面指纹修复

## 变更

run31 暴露两处恢复语义缺口：其一，`state.env` 缺少 `g2_arch_pass`、`close_done`、`plan_done` 时，缺省 `START_STEP=devimpl` 仍会让后段继续执行，后段完成键不能证明前段闸门已过；其二，agent 快照键混入全仓 HEAD 与全量脏态，docs-only 提交也会触发重灌，洗掉快照内已经应用的补丁文件。本批做三项修复：

1. 在现有 `simharness/mux/mx-recovery-lib.sh` 增加纯函数 `mx_resume_start_step`，按固定步骤序读取 `state.env`，返回首个缺失关键完成键对应的步骤。`mx-run.sh` 与 `run-driver-supervisor.sh` 只在未显式传 `--start-step` 时调用它；`state.env` 不存在仍返回 `smoke`，显式起点保持最高优先级。
2. 将 `mx_provision_agent_src` 的快照键改为白名单运行源码的工作态内容指纹＋补丁内容指纹。白名单为 `agent/`、`gateway/`、`hermes_cli/`、`tools/`、`plugins/`；补丁面为 `patches/series` 与 `patches/*.patch` 的路径和字节内容。全仓 HEAD、docs 与其他杂项不再直接参与换键，HEAD 仅保留为来源档案。
3. 新增 `simharness/tests/run31-resume-provision.test.sh`，直接验证断点映射与完整供给函数：docs-only 提交和未提交修改均不换键、不重灌；白名单源码或补丁内容变化换键并重灌。既有「快照键一致且 wrapper、gateway 在位即跳过」的幂等条件不变。

## 决策记录

1. **Mechanical·断点取固定流程中的首个缺失关键键，不取最后出现的 done 键。** 后段键可能来自误起点或人工补写，不能反推前段合法完成；从首个缺口重入才能恢复闸门约束。规则如下，每行所有键均为必需，除 UAT 明确为二选一：

   | 返回步骤 | `state.env` 判据 |
   |---|---|
   | `smoke` | 文件不存在或 `smoke_done` 缺 |
   | `appinit` | `appinit_done` |
   | `people` | `people_done` |
   | `ba` | `ba_dm_marker` |
   | `reqgate` | `g1_frozen` |
   | `room` | `room_analysis` |
   | `dispatch` | `dispatch_marker` |
   | `register` | `register_done` |
   | `analysis` | `analysis_done` |
   | `triage` | `triage_done` |
   | `anexec` | `anexec_done` |
   | `review` | `review_done` |
   | `archgate` | `g2_arch_pass` |
   | `close` | `close_done` |
   | `plan` | `plan_done` |
   | `devimpl` | `devimpl_done`、`g3_code_pass` |
   | `defect` | `defect_done` |
   | `testpass` | `testpass_done`、`g4_pass` |
   | `ready` | `ready_done`、`g5_ready` |
   | `release` | `release_done` |
   | `uat` | `uat_done` 或 `uat_conditional` 任一 |
   | `workmgr` | `workmgr_done` |
   | `audit` | `audit_done` |
   | `retro` | `retro_done` |
   | `ide` | `ide_done` |
   | `report` | 前置键齐全而 `report_done` 缺；全部齐全时也返回 `report`，监督器按既有 `report_done` 自退 |

2. **Mechanical·定位函数复用恢复库，不新增治理脚本。** `mx-recovery-lib.sh` 已由监督器加载且以无副作用纯函数为约定；`mx-run.sh` 增加同一来源加载即可共享映射，避免两份规则漂移，也不增加机制预算条目。
3. **Mechanical·供给键描述实际快照语义的最终内容，不用提交号代替内容。** 快照复制的是 Git 跟踪文件的当前工作态，因此源码指纹也按 `git ls-files` 的路径集逐文件读取当前字节；删除以显式标记入指纹。补丁指纹直接读取 series 和补丁文件字节，不再使用 mtime、大小或全仓 `git diff HEAD`。这样同语义的 docs 提交不换键，白名单文件的已提交或未提交内容变化都会换键。
4. **Mechanical·快照复制范围不变。** 本批只收紧重灌判据，不把未跟踪文件纳入快照，也不改补丁应用顺序。旧格式键升级后第一次重灌属于预期；之后 docs-only 变化保持原快照与补丁创建文件。
5. **UserChallenge·范围边界。** 按任务要求不修改 `simharness/aipay-scenario.sh`，不调整各步骤自身的完成键写入逻辑；本批只修缺省起点计算和供给判据。

## 验证

- 目标守门：`bash simharness/tests/run31-resume-provision.test.sh` → `ALL-PASS`。覆盖 run31 缺 `g2_arch_pass` 的混合状态返回 `archgate`，以及 close、plan、devimpl、testpass、UAT 条件完成、净环境首发与全键齐全形态。
- run31 实物只读复核：对 `/Users/cuishi/lab/ncwk-sim-mux/runs/20261117-v8-run31/state.env` 调用 `mx_resume_start_step` → `archgate`；该状态里 `g2_arch_pass`、`close_done`、`plan_done` 均缺，而 `devimpl_done`、`testpass_done`、`report_done` 均在，正是本批防绕闸形态。
- 供给行为：目标测试在临时 Git 宿主树调用真实 `mx_provision_agent_src`，以快照哨兵判断是否重灌。docs-only 提交与脏态后键不变、哨兵保留；gateway 内容变化后键变化、哨兵消失且新内容进入快照；补丁与 series 字节变化均换键，补丁变化实测触发重灌。
- 语法：`bash -n` 检查四份改动脚本与新增测试，全部通过；本任务文件 `git diff --check` 通过。`npm run inject` 在 worktree 内成功，依赖链指向本检出 `vendor/hermes-studio/node_modules`。
- 聚合门禁：`bash simharness/tests/run-gates.sh` → EXIT=1。shell 段唯一失败为 `jargon-source-gate`，其余 shell 守门（含新增测试）通过。该门因 HEAD 是 main 祖先而检查 main 提交态，6 处 HARD 全在 main 的 `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md:3022,3024,3025,3030,3031`；本任务未改该方案，属基线红，不在本批越界修复。
- vitest 补跑：聚合脚本因上述 shell 红提前退出，另跑 `node_modules/.bin/vitest run --root simharness` → EXIT=0，`Test Files 29 passed (29)`、`Tests 375 passed (375)`。

## 设计文档影响

DESIGN_SYNC: none。本批只修 simharness 的断点恢复与快照供给实现，不改变产品能力、整合架构或版本数字；恢复映射与内容面判据以本 spec 为单一事实源，因此不触及 `docs/DESIGN.md` 整合正本与数字总账。
