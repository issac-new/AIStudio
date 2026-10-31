# 全流程推演方案×程序同步（第二批）：模型波动支撑面与运行态存储

日期：2026-11-01
状态：implemented
触发：用户令「同步调整更新全流程推演方案及程序」。第一批（完成契约门接线，main `4503b0cbf`）已合入；本批为同题续做的漂移清扫——把首批之后合入 main 的产品能力再对账一遍，只改仍有事实偏差的方案陈述与程序清单。

## 变更

1. **方案 §2.6.12 补「四层同族关系」**（`docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`）：完成契约是模型波动加固的 A 层；B 判定网（qgate pre-push L0）、C 能力路由（modelcap 矩阵/路由）、D 补偿止损（巡检自动处置／会话轮换 auto／建卡幂等）为产品侧支撑层，不进推演判据。其中 D 层建卡幂等（agent 侧 `721-agent-kanban-idempotency-unique.patch`）是派发重试不落重复卡的前提，随 `mx-up` 运行时补丁自愈清单覆盖。
2. **方案 §2.6.8 消费纪律 6 补代批强度标注**：G5 代批（裁决人=申请人）由产品侧自动记 `deciderMode=delegated`，DecisionGrant 与审批日志记 `strength=delegated`，真人裁决记 `explicit`；审批历史与授权凭证可反查，净额规则不变（代批放行的闸仍不计通过）。
3. **程序 `simharness/mux/mx-lib.sh`**：`mx_apply_agent_patches` 自愈清单补 `721-agent-kanban-idempotency-unique.patch`（模型波动 D 层）。宿主工作态已含该补丁时反向检查直接跳过；宿主自更新洗树后才由本清单补位。
4. **程序 `simharness/mux/mx-up.sh`**：刷新注释的补丁范围 `390→707` 更正为 `390→721`（事实对账，不改执行序）。
5. **程序 `simharness/mux/mx-clean.sh`**：hermes 运行态归档重置清单补 `orchestrator`（编排域六表/授权流水）与 `modelcap`（能力路由矩阵）——两者是新落地产品能力在 `$SIM_ROOT/hermes/` 下的存储；不归档会让下一轮继承旧轮 Trigger/Decision/Mandate 或旧能力矩阵（与 §2.6.7 评测三库隔离同款纪律）。目录缺席时该循环天然跳过，零行为变化。
6. **自动测试 `simharness/tests/harness-gate-integrity.test.ts`**：新增 describe ㉗，四条断言——721 在补丁自愈清单、mx-up 注释范围、mx-clean 归档新存储、方案两处锚点在案。
7. **方案 §2.6.12 顺带修 HARD 词**：上一批引入的「守门测试锁序」改为「自动测试固定该顺序」——词表（`scripts/plan-html/jargon-check.py`）把「守门」列为自造词，提交态扫描已红。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 721 只进 mx-up 自愈清单，不改 `aipay-agent-sync.sh` 默认清单 | 后者是部署到宿主的按需清单（默认只带五个核心补丁），721 已随产品部署进宿主工作态；SIM 需要的是自更新洗树后的补位 | 两清单都加（否决：部署清单是人工按需语义，扩面会改变其契约） | 是 |
| D2 | mx-clean 归档而非删除 orchestrator/modelcap | 与既有 hermes 运行态整包归档纪律一致；目录缺席零动作，不新增前置条件 | 直接 rm -rf（否决：丢证据，无法事后追查跨轮污染） | 是 |
| D3 | B/C 两层只写「不进判据」，不扩方案正文 | 推演不消费 modelcap 路由与 pre-push 判定网；展开写会把产品能力目录混进考卷，违反「一条事实只在一处说全」 | 新增 §2.6.13 全量介绍（否决：考卷膨胀且无消费位） | 是 |
| D4 | 代批强度只改方案陈述，不改代批程序 | 产品侧按「裁决人=申请人」自动判定并落凭证（`human-gate.ts:314,333`；`decision-grant.ts` 类型），程序无需传参；改程序反而多一个可漂移的事实源 | 在 decide 请求体显式传 strength（否决：与产品自动判定重复且可被伪造） | 是 |
| D5 | 上一批的 HARD 词「守门」随本批修正 | 词表把「守门」列为自造词；上一批提交后提交态扫描即红（工作副本预告 WARN 未覆盖提交态），本批不修则 main 常红 | 只屏蔽词表（否决：词表是单一事实源，为单处违规放宽会放过同类回潮） | 是 |
| D6 | 附录 A.1 计数一并归一到 449 | 首批合入后标题=448、覆盖句仍写 447，两处自相矛盾；本批新增一份 spec 正好一并校正 | 只加新行不改旧句（否决：把已知矛盾留在正本） | 是 |

## 验证

- `npx vitest run simharness/tests/harness-gate-integrity.test.ts`（以主检出 vitest、`--root` 指向本 worktree 的 simharness）→ 全绿，含新 ㉗ 四断言。
- `bash simharness/tests/run-gates.sh` → ALL-PASS。
- `bash -n` 三脚本（mx-lib/mx-up/mx-clean）语法通过。
- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts` → 6/6（附录 A.1 行数=标题计数=449）。
- 诚实边界：run24 在途，本批不触碰运行中的 `aipay-scenario.sh` 与已 source 的进程内存；721 的「洗树后补位」路径未在整轮推演上实测，仅做静态清单与反向检查语义验证；orchestrator/modelcap 归档为预防性清场（当前 SIM 树两目录均不存在，实测无跨轮残留）。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`：§2.6.12 四层同族关系、§2.6.8 消费纪律 6 代批强度标注。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记（448→449，覆盖句 447→449 一并校正）。
