# 全流程推演方案×程序同步（第二批）：模型波动支撑面与运行态存储

日期：2026-11-01
状态：implemented
触发：用户令「同步调整更新全流程推演方案及程序」。第一批（完成契约门接线，main `4503b0cbf`）已合入；本批为同题续做的漂移清扫——把首批之后合入 main 的产品能力再对账一遍，只改仍有事实偏差的方案陈述与程序清单。

## 变更

1. **方案 §2.6.12 补「四层同族关系」**（`docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`）：完成契约是模型波动加固的 A 层；B 判定网（qgate pre-push L0）、C 能力路由（modelcap 矩阵/路由）、D 补偿止损（巡检自动处置／会话轮换 auto／建卡幂等）为产品侧支撑层，不进推演判据。其中 D 层建卡幂等（`runtime/hermes_cli/kanban_db.py` 与 `kanban_db_connect.py` 两文件）是派发重试不落重复卡的前提；`mx-up` 以两文件定点补位覆盖 SIM 快照，补丁本身不进宿主补丁自愈清单。
2. **方案 §2.6.8 消费纪律 6 补代批强度标注**：G5 代批（裁决人=申请人）由产品侧自动记 `deciderMode=delegated`，DecisionGrant 与审批日志记 `strength=delegated`，真人裁决记 `explicit`；审批历史与授权凭证可反查，净额规则不变（代批放行的闸仍不计通过）。
3. **程序 `simharness/mux/mx-lib.sh`**：新增 `mx_restore_idempotency_fix`——只查 SIM 快照的 `kanban_db.py`（`INSERT OR IGNORE INTO tasks`）与 `kanban_db_connect.py`（`idx_tasks_idempotency_unique`）两处标记，缺则用 `runtime/` 模板覆盖并留 `.bak`。**721 不放进 `mx_apply_agent_patches` 清单**：活体实测该补丁在宿主新版快照上正向/反向检查均失败（import 段已漂移），且补丁无 def/class/常量标记可供语义兜底，入清单会让 `fail` 退出（`fail()` 是硬 exit，`mx-up` 的 `|| log` 接不住）。
4. **程序 `simharness/mux/mx-up.sh`**：部署收尾后调用 `mx_restore_idempotency_fix`（第 ④ 步）；补丁清单范围保持 `390→707` 不变。
5. **程序 `simharness/mux/mx-clean.sh`**：hermes 运行态归档重置清单补 `orchestrator`（编排域六表/授权流水）与 `modelcap`（能力路由矩阵）——两者是新落地产品能力在 `$SIM_ROOT/hermes/` 下的存储；不归档会让下一轮继承旧轮 Trigger/Decision/Mandate 或旧能力矩阵（与 §2.6.7 评测三库隔离同款纪律）。目录缺席时该循环天然跳过，零行为变化。
6. **自动测试 `simharness/tests/harness-gate-integrity.test.ts`**：describe ㉗ 四条断言——721 不在补丁自愈清单且 mx-up 两文件定点补位、mx-clean 归档新存储、方案两处锚点在案。
7. **方案 §2.6.12 顺带修 HARD 词**：上一批引入的「守门测试锁序」改为「自动测试固定该顺序」——词表（`scripts/plan-html/jargon-check.py`）把「守门」列为自造词，提交态扫描已红。
8. **修 jargon 门分支判据反向**（`simharness/mux/tests/jargon-source-gate.test.sh`）：原判据 `merge-base --is-ancestor main HEAD` 在「main 是 HEAD 祖先」（分支已提交领先）时反而继续读 main 基线，分支提交态永远扫不到；改为 `--is-ancestor HEAD main`（HEAD 领先或分叉才读 HEAD），TS 层同修。该缺陷使上一批提交后的 HARD 词在本批首次全量复跑才暴露。
9. **修两处计数断言滞后**（`tests/eval-fullflow-integration.test.ts:39`、`tests/eval-metrics-template-sync.test.ts:90`）：两处仍断言 prelaunch「三十项」，而 run24 批已扩到「三十二项」（⑩b 跨轮残留门等两项）；断言随事实更新，prelaunch 实现不动。
10. **隔离边界白名单补 `runtime/hermes_cli`**（`tests/isolation-boundary.test.sh`）：721 定点补位读 runtime 模板两文件，属 harness→产品只读方向；白名单增列并注明只写 SIM 快照、不写产品仓。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 721 不进宿主补丁自愈清单，改 SIM 快照两文件定点补位 | 活体实测：补丁上下文绑定钉版基线，宿主新版 import 段已漂移——正向/反向 `git apply --check` 均失败（rc=1/1），且补丁 0 个 def/class/常量标记，`mx_apply_agent_patches` 会 `fail` 硬退出；`deploy-agent-runtime` 默认保留差异（实测 51 相同/1 保留），洗树后也不会自动覆盖；两文件定点补位已实测恢复（rc=0，留 `.bak`） | 继续放补丁清单（否决：下次 mx-up 直接退出）；整树 `--force`（否决：覆盖 52 文件里宿主其他已知良好态） | 是 |
| D2 | mx-clean 归档而非删除 orchestrator/modelcap | 与既有 hermes 运行态整包归档纪律一致；目录缺席零动作，不新增前置条件 | 直接 rm -rf（否决：丢证据，无法事后追查跨轮污染） | 是 |
| D3 | B/C 两层只写「不进判据」，不扩方案正文 | 推演不消费 modelcap 路由与 pre-push 判定网；展开写会把产品能力目录混进考卷，违反「一条事实只在一处说全」 | 新增 §2.6.13 全量介绍（否决：考卷膨胀且无消费位） | 是 |
| D4 | 代批强度只改方案陈述，不改代批程序 | 产品侧按「裁决人=申请人」自动判定并落凭证（`human-gate.ts:314,333`；`decision-grant.ts` 类型），程序无需传参；改程序反而多一个可漂移的事实源 | 在 decide 请求体显式传 strength（否决：与产品自动判定重复且可被伪造） | 是 |
| D5 | 上一批的 HARD 词「守门」随本批修正 | 词表把「守门」列为自造词；上一批提交后提交态扫描即红（工作副本预告 WARN 未覆盖提交态），本批不修则 main 常红 | 只屏蔽词表（否决：词表是单一事实源，为单处违规放宽会放过同类回潮） | 是 |
| D6 | 附录 A.1 计数一并归一到 449 | 首批合入后标题=448、覆盖句仍写 447，两处自相矛盾；本批新增一份 spec 正好一并校正 | 只加新行不改旧句（否决：把已知矛盾留在正本） | 是 |
| D7 | 分支判据修脚本而不绕过 | 判据反向导致「分支提交后仍扫 main 基线」，是守门假绿的根因；绕过（如临时 checkout main）会让同类假绿留在工具里 | 本批手动指定 `MX_JARGON_CHECK` 绕过（否决：不修根因，下次复发） | 是 |
| D8 | 计数以 prelaunch 事实为锚，改断言不改实现 | 三十二项是 run24 批现状（脚本头注与结尾行一致），测试是滞后侧；回退实现会删掉 run24 新增的跨轮残留门 | 把 prelaunch 回退到三十项（否决：删掉真检查换假绿） | 是 |

## 验证

- `npx vitest run simharness/tests/harness-gate-integrity.test.ts`（以主检出 vitest、`--root` 指向本 worktree 的 simharness）→ 全绿，含 ㉗ 四断言。
- `bash simharness/tests/run-gates.sh` → ALL-PASS，**226/226**。
- `bash -n` 三脚本（mx-lib/mx-up/mx-clean）语法通过。
- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts` → 6/6（附录 A.1 行数=标题计数=449）。
- **721 活体验证（2026-11-01 08:3x，SIM 快照副本 + 隔离 SIM_ROOT）**：①补丁正向/反向检查均失败（rc=1/1），标记提取 0 个；②默认 `deploy-agent-runtime --apply` 对漂移文件输出「保留目标 1」且不覆盖；`--force` 恢复模板并留 `.bak`；③新 `mx_restore_idempotency_fix` 在两文件均被洗掉的副本上 rc=0，两处标记恢复为 1/1 并各留 `.bak`；④移除 721 后 `mx_apply_agent_patches` 在快照上 rc=0（全部反向检查跳过）。
- 诚实边界：run24 在途，本批不触碰运行中的 `aipay-scenario.sh` 与已 source 的进程内存；orchestrator/modelcap 归档为预防性清场（当前 SIM 树两目录均不存在，实测无跨轮残留）。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`：§2.6.12 四层同族关系、§2.6.8 消费纪律 6 代批强度标注。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记（448→449，覆盖句 447→449 一并校正）。
