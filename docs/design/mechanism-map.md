# 机制地图（恢复与保护机制全景）

**用途**：本图回答一个问题——「我要改的这件事，落在哪一层、会和谁抢」。任何机制类改动（补丁或脚本）落点前先查此图；改完必须同步此图（与 A.1 索引同批）。数据锚点来自 run25（2026-11-02）实测日志计数。

## 0 一句话

恢复机制分三级时序（回合内 → 回合间 → 进程级），另有三个**横切保护面**（渠道轮转、闸门熔断、催办）穿插其间。三级之间**当前没有仲裁者**——这是 run25 内耗 120 分钟的结构性原因；仲裁者由补丁 728 引入（默认关，见 §5）。

## 1 三级时序（一件事发生，从内到外依次响应）

### 第 1 级·回合内重试（同一个 API 调用链内，秒级）

| 机制 | 补丁/位置 | 触发条件 | 行为 | run25 实测 |
|---|---|---|---|---|
| 掐流残响判定 | 707 `agent/codex_runtime.py` | 上游流以 `terminal status=incomplete` 收尾 | 物理重试一次；耗尽抛 `EmptyStreamError` | 231 次 incomplete |
| 瞬态失败归类 | 722 `conversation_loop` | 收到 `EmptyStreamError` 等瞬态错误 | 归为 timeout 类，入重试梯子（3 次，退避） | 75 次 |
| 供应商恢复循环 | 网关内置 `auto-recovery cycle N/5` | 梯子耗尽且判为 provider 不可用 | 5 轮循环，17s 起步退避 | 23 次 |

状态载体：进程内存（无跨回合状态）。

### 第 2 级·回合间恢复（一个回合已死，救会话，分钟级）

| 机制 | 补丁/位置 | 触发条件 | 行为 | run25 实测 |
|---|---|---|---|---|
| chat 回合恢复 | 725+726 `agent/chat_turn_recovery.py` + `run_turn_runner.py` | 回合以瞬态失败终结（auth/billing/policy 等确定性失败不救） | 同会话注入「续做」提示再跑一回合，预算 `HERMES_CHAT_TURN_RECOVERY`（默认 1，上限 3） | 19:57 secops 触发但被 kwargs bug 挡掉（726 修） |
| 续作泵 | 637 网关 | 回合结束但任务未交卷 | 继续推进 | 未单独计数 |
| 挂死槽清扫 | 586 网关 | 无新消息的挂死槽（复用活动钟判活） | 周期驱逐 | 未单独计数 |
| 会话轮换/遥测/心跳/检查点 | 601-605 | 迭代数/上下文尺寸/规则漂移 | 心跳再锚定、轮换、检查点 | 未单独计数 |

状态载体：会话级（`state.db` 会话行、`messages` 历史）。

### 第 3 级·进程级监督（进程死了，拉起，十分钟级）

| 机制 | 位置 | 触发条件 | 行为 | run25 实测 |
|---|---|---|---|---|
| 驱动监督器 | `simharness/mux/run-driver-supervisor.sh` | 驱动进程缺席 | 断点续跑（`START_STEP` 幂等） | 4 次重启（21:41/21:54/22:35/23:16） |
| 网关看护 | `mx-gateway-babysit.sh` | gateway health 3 连败 | 重启网关 | 19:04 一次 |
| 熔断死等催办 | supervisor `_br_nudge_*` | 熔断后证据指纹 N 秒不变 | 按闸别催办（G2/G5/通用三分支，main 3993beb69 修） | 6 次熔断、催办多次 |

状态载体：`runs/<RUN>/state.env`（键值幂等）、`governance/breaker.json`（熔断轮次）、supervisor owner 注册表。

## 2 三个横切保护面

| 面 | 位置 | 触发 | 行为 | run25 实测 |
|---|---|---|---|---|
| 渠道轮转+熔断 | cc-switch（外部进程） | 单渠道失败 | 三渠道轮转（SGLM/XGLM/CGLM），熔断 Open→HalfOpen→Closed | 1726 行熔断日志 |
| 闸门硬闸+熔断 | `aipay-scenario.sh` + 治理服务 `breaker.ts` | 闸判据未闭环 | 不放行；两轮不过则熔断阻断 | 6 次打回 |
| 闸内等待+回灌 | `aipay-scenario.sh` 各闸段 | 等 agent 结论/证据 | `wait_truth` 轮询 → 超时回灌补发 → 记录放行/FAIL | G2 超时 2 轮 |

## 3 互扰关系（run25 实测的打架链）

```
上游掐流
  → 707 判残响（231 次）
  → 722 入梯子重试（75 次）─── 3 连耗尽 ──→ 网关恢复循环（23 次）
  → 回合死 → 725 该救（被 kwargs bug 挡掉，已修）
  → supervisor 见驱动缺席 → 重启驱动（4 次）
      └→ 驱动撞闸门熔断（failRounds=2）→ 退出
          └→ 熔断死等催办 → 用错闸话术 → 抢占 agent 回合（40 分钟）
              └→ 修订更慢 → 再次超时 → 再重启（回到 supervisor）
```

**关键结论**：单层都做对了自己那件事，串起来是一个正反馈循环。缺少的是「谁先谁后、谁该让位」——即 §5 的仲裁者。

## 4 改动落点指引（改之前查这里）

| 你要改的事 | 落点 | 不要碰 |
|---|---|---|
| 上游流异常判定/重试策略 | 707、722（`codex_runtime.py`、`conversation_loop.py`） | 不要改 725（跨回合层） |
| 回合死后续做 | 725+726（`chat_turn_recovery.py`） | 不要改 722（回合内层） |
| 进程拉起重启 | supervisor（`run-driver-supervisor.sh`） | 不要在 scenario 里加重启逻辑 |
| 闸门等待/回灌/催办话术 | `aipay-scenario.sh` 闸段 + supervisor 催办段 | 两处同语义逻辑必须同批改（曾经分叉过） |
| 渠道级故障 | cc-switch（外部，只读诊断） | 不要在 hermes 侧加重试对冲 cc-switch 已有轮转 |

## 5 仲裁者（补丁 728，默认关）

- 位置：`agent/recovery_coordinator.py`；状态文件 `runs/<RUN>/recovery-state.json`（无 RUN 时用 `HERMES_HOME` 下）。
- 级别：`turn_retry`(1) < `turn_recovery`(2) < `process_supervisor`(3)。内层活跃时外层 `claim` 被拒 → 让位等待。
- 接入点三个：722 梯子入口、725 recovery 入口、supervisor 重启前（脚本侧读同一状态文件）。
- 开关：`HERMES_RECOVERY_COORDINATOR=0`（默认关）。**开启条件**：烧机测试通过 + 观察一轮无回归，由人显式开启。
- 失败语义：任何异常一律放行（fail-open），协调器自身永不成为故障源。

## 6 制度挂钩

- **烧机测试**：机制类改动（触及本图任一行）合入前必须跑 `simharness/mux/mx-burn-test.sh`（短场景 smoke..archgate，约 40 分钟），收据 `burn-test-receipt.json` 由 prelaunch ㉛ 核验。
- **行为测试**：判定逻辑一律抽纯函数（`filter_recovery_kwargs`、`mx_nudge_body_for_gate` 为首批），由 `simharness/tests/mechanism-behavior.test.ts` 直接调用断言——**禁止只加 `toContain` 标记断言**（run25 教训：382 条标记断言全绿仍连炸 3 个）。
- **闸门耗时台账**：每道闸进出写 `evidence/gate-timing.tsv`，ETA 与报告按此出数，质量环预算与故障损耗分列。
