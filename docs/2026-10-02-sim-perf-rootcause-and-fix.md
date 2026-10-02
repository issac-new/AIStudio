# 全流程推演慢的根因分析与优化（2026-10-02，基于 run7 实测）

## 主旨三句话

一轮 26 步全流程推演要跑通宵（run6 约 8h+，run7 4.7h 才到 11/26 步），根因不在场景脚本，而在 hermes agent 侧：**后台技能回顾 fork（background_review）空转吃掉单个 agent 79% 的 LLM 时间**，叠加全编制 `reasoning_effort: ultra` 推理档位与 10 万+ token 膨胀上下文，把单次 LLM 调用推到 p50=18.5s / p90=91s。本次已落地"关 review fork + 推理档位降档钩子"双优化，预期单轮总时长压至原来的 1/3 左右。

## 受众

维护 ncwk-sim-mux 推演栈、需要复跑 V5 全流程（run8+）的工程会话。

## 读完促成什么动作

下一轮推演起跑前不必再做任何事（编制重建自动带新配置）；如需回退，删 `auxiliary.background_review` 段或设 `MX_REASONING_EFFORT=ultra`。

---

## 一、耗时账本（run7 2026-10-02 16:49–21:27，4h38m，完成 11/26 步）

数据源：`ncwk-sim-mux/runs/20261002-v5-run7/evidence/scenario.log`（270 行带时间戳）与 `hermes/profiles/fanfan/logs/agent.log`。

| 构成 | 实测 | 占比/说明 |
|---|---|---|
| fanfan（枢纽 agent）LLM 调用 | 331 次，累计纯延迟 203min | p50=18.5s，p90=91.3s，max=416s，总输入 22.7M token |
| 其中 background_review fork | 160min（7 次 fork，各 17–70 次 API 调用） | **79%——最大单项** |
| 其中任务 turn 本身 | 43min（单 turn 56 次 API） | 真实工作 |
| 场景脚本轮询（15s 间隔） | 144 次"未见 DONE"轮询 | 等待的表现而非原因，平均检测延迟仅 7.5s |
| 消息投递 | 秒级（16:51:17 派发→16:51:19 turn 开始） | 非瓶颈 |

阶段间空档几乎全部以"[fanfan/chen/hu] 线程内回复 !approve"收尾（56 次，间隔 3–22min）——approve 条目出现的时刻 = agent 完成上一段工作的时刻，间隔即 agent 侧耗时。

## 二、根因链（四个，按影响排序）

### R1：background_review fork 空转（79%）

- **触发**：每个 matrix 任务 turn 结束时，工具迭代数 ≥ `skills.creation_nudge_interval`（默认 10，`agent_init.py:1369`）就 spawn 一个带全量历史的"回顾技能库"fork（`turn_finalizer.py:680-706` → `run_agent.py:786`）。
- **代价**：fork 带 history=133 全量消息，单次输入 76K–162K token，每次跑 17–70 个 API 调用、20–48min。推演全程无人在环，这些调用不进任何验收判据，纯空转。
- **官方佐证**：hermes 自己在 cron 路径就关了它（`scheduler.py:2438`，注释"no human-in-the-loop need for skill/memory review forks (~30K tok/event)"）；`turn_finalizer.py:697` 注释同样承认。gateway 消息路径（推演所用）没有传 `skip_background_review`，是唯一漏网的无人场景。
- **存量规模**：改配置前全编制累计 spawn 数百次（chen 54 / xiao 46 / fanfan 41 / lin 34 / …）。

### R2：reasoning_effort: ultra（单次延迟放大器）

- 宿主 `~/.hermes/config.yaml` `agent.reasoning_effort: ultra`，mx-setup 生成编制时原样抽取 → 42/42 profile 全部 ultra。
- 实测：任务 turn 的 API 调用输出普遍只有几百 token，时间消耗在超长推理思考上。历史上 v4-run1 已踩过"reasoning_effort max 导致超时"坑（五环境根因之一）。

### R3：上下文膨胀（延迟随 in 平方级上涨）

- 任务会话 history 不截断（history=133），实测分桶：in 25K→50K→75K→100K 对应 p50 延迟 14.8s→25.4s→30.1s（0–25K 仅 7.7s）。
- background_review 的全量快照进一步放大（见 R1）。

### R4：次要点（本次不动）

- memory 工具反复失败重试：`errors.log` 实锤"Memory consolidation failed 4 times this turn"（memory 上限 2200 字符太小）+ hindsight prefetch 10s 超时——每 turn 白耗约 1min。
- 场景脚本 `wait_truth`/`wait_alive_truth` 15s 轮询（`mx-scenario-lib.sh:238,294`）与 relay 接力 sleep 90/120s——结构合理，合计影响分钟级。
- 打回返工循环（凭证核验未通过→agent 重做）——治理语义，保留。

## 三、已落地优化（2026-10-02 21:35 生效）

### 3.1 关闭 background_review（对应 R1）

- **sim 树 43 处**：`ncwk-sim-mux/hermes/config.yaml`（root）+ 42 个 `profiles/*/config.yaml` 追加：

  ```yaml
  auxiliary:
    background_review:
      enabled: false
  ```

- **生效机制**：`run_agent.py:795-800` spawn 时现读 `load_background_review_settings()`；`hermes_cli/config.py` 缓存按文件签名（mtime/size/ino/ctime）自动失效 → **改完即时生效，无需重启，对在途 run7 零干扰**。
- **固化**：`overlay` main `37f6b860`（merge `03aa099d`）改 `mx-lib.sh` 三同构模板（`write_root_config`/`write_user_profile`/`write_agent_profile`），编制重建不回退。

### 3.2 推理档位降档钩子（对应 R2）

- 同一提交：模板默认 `reasoning_effort: high`，`MX_REASONING_EFFORT` 环境变量可覆盖，空串保留宿主值。
- **下一轮起跑生效**（编制重建时写入）；在途 run7 不动，避免前后档位不一致干扰归因。
- 选 high 而非 medium 的权衡：推演打回多为格式/流程错误（DONE 行 card ID 填错等），与推理深度弱相关；但一次返工 = 一个完整 turn（20–40min），档位过浅有返工增多风险。high 是保守起点，下轮实测后可再降。

## 四、验证

- 已完成：bash -n 语法过；三模板实跑输出 YAML 断言（enabled=False / effort=high / 空串=ultra）；43 处 sim 配置 YAML 全量校验 0 异常；merge 回 main 后主树复核过。
- 观察中：`ncwk-sim-mux/logs/bgreview-off-watch.log`（20min 观察器，21:35 后新 turn vs 新 review spawn 对照）。判据：改后全编制 background_review 新增 = 0。
- 下一轮全流程推演（run8）为终验：预期 26 步总时长从 8–10h 压到 ~3h 量级；若单步仍慢，下一个优化面是 R3（history 截断/压缩）与 R4（memory 上限）。

## 五、未验证与风险声明

- 79% 节省是 LLM 时间占比，不严格等于墙钟节省（review fork 与任务 turn 部分并行）；墙钟预期保守打六到七折。
- `high` 档对返工率的影响未实测，下轮用打回次数对照（run6/run7 issues.log 有基线）。
- gateway `max_concurrent_sessions=4`（root config 实测值）下多 agent 并发对 cc-switch 上游的容量压力仍在；review 关闭后并发争抢会显著缓解，但不消除。
