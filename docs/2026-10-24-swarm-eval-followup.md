# 群体协作清账批：消融/拜占庭旋钮＋混合动机场景（2026-10-24）

- 日期：2026-10-24
- 正本 spec：`overlay/docs/superpowers/specs/2026-10-24-swarm-eval-followup-batch.md`（D10-D15 在彼处）
- 分支：simharness `feat/swarm-eval-followup`（自 main=2a79c82 起）

## 本仓改动

1. `mux/mx-scenario-lib.sh dispatch_in_room` 两旋钮（默认关=零行为，D15）：
   - `MX_ABLATE_ROLES=chen,hu`——被消融角色 mention 过滤（「无耳」实验语义）＋ `compensate ablation-skip` 台账留痕（对比端点角色清单的单一事实源）。
   - `MX_BYZANTINE_SPEC=chen-agent:corruption`——对被 @ 命中 agent 经 owner↔agent DM 追加 `[BYZANTINE-INJECT mode=… target=… ts=…]` 标记化污染指令（三模式：corruption 交付暗缺陷／noise 噪声广播／gaslight 持续否定正确路线）；事件另落 `evidence/byzantine-events.log`。
2. `mux/mx-mixed-motive.py`：竞标结算器（出价高者得、按份额截断、utility=份额×单位价值−出价）＋指标器（社会福利 W=ΣU／基尼／纳什偏离=相对离差代理／成交与预算利用）。纯函数可回放。
3. `scenarios/mixed-motive-bidding/`：独立混合动机场景（mediator＋三业务单元；市场公告→N 轮 DM 竞标→结算→报告），不触 aipaydev 26 步主链。
4. `tests/swarm-eval-followup.test.ts`：旋钮结构断言＋默认零行为断言＋mixed-motive 行为用例（结算截断/指标边界/空台账不炸）。

## 决策记录

- D10/D11/D12/D15 与正本一致（见正本 spec 决策记录节）；本仓纪律补充：两旋钮挂在 dispatch_in_room 单点（派发是任务书进 agent 的唯一入口），不改 26 步编排、不改六闸判据。
- 消融的「无耳」语义：mention 被过滤后任务书仍在群里广播——被消融角色不被指名，其余角色可见性不变；任务结局由既有 wait/回执机制自然记录（不为消融新增判定逻辑）。
- 拜占庭注入走 owner↔agent DM（私密通道，污染指令仅目标 agent 可见），标记前缀保证 scenario.log/DM 均可回查。

## 验证

- `npx vitest run`（全量）→ 213/213 通过。
- bash -n（mx-scenario-lib.sh／scenario.sh）＋py_compile（mx-mixed-motive.py）通过（守门测试内含）。

## 残余（待 run 执行）

- 消融 run（每被消融角色一轮）与拜占庭注入 run 的实际执行；mixed-motive-bidding 首跑。执行后实验数字回填正本 spec。
