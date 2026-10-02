# 全流程推演慢的根因分析与优化（2026-10-02，基于 run7 实测）

## 主旨三句话

一轮 26 步全流程推演要跑通宵（run6 约 8h+，run7 4.7h 才到 11/26 步），根因不在场景脚本，而在 hermes agent 侧：**后台技能回顾 fork（background_review）空转吃掉单个 agent 79% 的 LLM 时间**，叠加全编制 `reasoning_effort: ultra` 推理档位与 10 万+ token 膨胀上下文，把单次 LLM 调用推到 p50=18.5s / p90=91s。性能优化轮曾落地"关 review fork"；同日用户最终裁决**保真优先于速度**——推理档位保持拉满、background_review 重新打开，推演必须与真实场景一致（速度回归固有成本，预期单轮时长回到 8–10h 量级）。

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

### 3.1 background_review：关→再开（保真裁决终态：开启）

性能轮曾按 R1 关闭（43 处配置 + 模板，main 03aa099d）；**用户同日终局裁决"推演须与真实场景一致"后已重新打开**（43 处置 true + 模板默认 true，main 7c3838b8）：真实部署 hermes 默认开启（fail-open），推演保真接受其 79% LLM 时间成本；留 `MX_BGREVIEW=0` 环境变量供临时提速关一轮。历史关闭期间（run7 前 11 步）的实测数据仍有效，作为 R1 定量依据保留。

原关闭记录（供回溯）

- **sim 树 43 处**：`ncwk-sim-mux/hermes/config.yaml`（root）+ 42 个 `profiles/*/config.yaml` 追加：

  ```yaml
  auxiliary:
    background_review:
      enabled: false
  ```

- **生效机制**：`run_agent.py:795-800` spawn 时现读 `load_background_review_settings()`；`hermes_cli/config.py` 缓存按文件签名（mtime/size/ino/ctime）自动失效 → **改完即时生效，无需重启，对在途 run7 零干扰**。
- **固化**：`overlay` main `37f6b860`（merge `03aa099d`）改 `mx-lib.sh` 三同构模板（`write_root_config`/`write_user_profile`/`write_agent_profile`），编制重建不回退。

### 3.2 推理档位：保持拉满（用户裁决 2026-10-02）

- 初版曾默认降为 high，用户明确指令"推理档位拉满，不要变，保持"——已回滚（main `dfb302c4`）：模板默认不覆盖，沿用宿主 `ultra`；`MX_REASONING_EFFORT` 钩子保留，仅显式设值时才覆写。sim 树 42 profile 全程 ultra 未动过。
- 影响：R2（ultra 单次延迟放大）按用户裁决**接受为固有成本**，不作为优化项；提速预期相应下调——主要收益只剩关 review 一项（fanfan 实测占其 LLM 时间 79%，该比例不受档位影响）。

## 四、验证

- **运行时验证已过（2026-10-02 21:35–21:57 窗口）**：配置生效后全编制新发生 12 个 turn，background_review 新增 = 0（改前每个任务 turn 后必跟一个，存量数百次）。观察器存档：`ncwk-sim-mux/logs/bgreview-off-watch.log`。
- 已完成：bash -n 语法过；三模板实跑输出 YAML 断言（enabled=False / effort=high / 空串=ultra / memory 4400-2750）；43 处 sim 配置 YAML 全量校验 0 异常；merge 回 main 后主树复核过。
- 下一轮全流程推演（run8）为终验：预期 26 步总时长从 8–10h 压到 ~3h 量级。

## 四b、追加（同日 22 时轮）：R4 已落地、R3 维持不动

- **R4 已落地（main `d1e24f9e`）**：write_user/agent_profile 两模板 memory 段补 `memory_char_limit: 4400 / user_char_limit: 2750`（对齐宿主实证值）；sim 树 42 profile 已同步、YAML 校验 0 异常。读取时机为 agent 进程初始化（memory_tool.py:56 / agent_init.py:1318），新拉起进程即生效，下轮全量生效。
- **R3 维持不动（有意决策，非遗漏）**：压缩阈值 0.35 在 1M 窗口下约 37 万 token 触发，看似"从不压缩"，但盲调阈值有摘要丢任务约束（卡 ID/事件 ID/RACI 口径）致返工的风险——一次返工 20–40min 即吃掉全部压缩收益；且窗口调小会被 `_SMALL_CTX_THRESHOLD_PERCENT=0.75` floor 抬得更高（context_compressor.py:1177）。待 high 档下轮实测后若任务 turn 仍慢，再按数据裁阈值。

## 五、未验证与风险声明

- 79% 节省是 LLM 时间占比，不严格等于墙钟节省（review fork 与任务 turn 部分并行）；墙钟预期保守打六到七折。
- 推理档位保持 ultra（用户裁决），单次调用 p50 18.5s 的延迟成本继续存在，属接受项。
- gateway `max_concurrent_sessions=4`（root config 实测值）下多 agent 并发对 cc-switch 上游的容量压力仍在；review 关闭后并发争抢会显著缓解，但不消除。

## 六、保真裁决记录（2026-10-02 晚，终局）

用户裁决链：①"推理档位拉满，不要变，保持"→ 撤销降档（dfb302c4）；②"所有审批复核应该都是人工介入的……打开 background_review，以使全流程推演与真实场景一致" → review 重开（43 处 true + 模板，7c3838b8）。

**终态原则：全流程推演的目标是保真复刻真实场景，速度是次要项。** 真实场景要素：真人使用 hermes 助理（ultra 推理 + background_review 默认开）+ 审批由人复核。配套基建与裁决落地：`MX_APPROVE_MODE` 三模式已实现并入 main——`auto`=脚本秒批（历史默认）、`manual`=全部挂起真人、`hybrid`=**C 裁决落地区**（928adc95）：关键操作（push origin main/master、rm -rf、--force、drop table、unlink，`MX_APPROVE_CRITICAL_EXTRA` 可扩展）挂起等真人在 element 回复 !approve/!deny；过程性操作（run7 实测 34/35）由代审 agent（`MX_REVIEW_AGENT` 默认 fanfan）DM 复核后批/拒，REJECT 理由经线程内 !deny 回传请求 agent，代审超时（`MX_REVIEW_TIMEOUT` 1800s）转人工兜底。已知保真偏差：代审者非请求主人本人（编制内主人唯一 AI 代表即请求方），语义为审批复核人代过程性复核。

事故记录：审批开关提交时 `git commit` 未限定路径，误将并行会话暂存中的 4 个文件带入；已剥离还原（080311bd，main 树经 diff 验证回到 c4337457 状态，改动内容完璧归还工作区）。教训再确认：共享树 commit 必须显式路径。

## 七、终局收敛（2026-10-02 深夜，用户第三次裁决）

裁决："在恰当场景卡点保留 background_review，推演时使用全自动审批。"落地（main 8f93a048）：

- **自动 review fork 关闭**（43 处 enabled=false + 模板默认 false；`MX_BGREVIEW=1` 恢复历史"每 turn 自动"形态）——79% LLM 空转消除。
- **卡点保留沉淀**：`gate_review <u> <闸名>`——治理闸通过后，人类账号对自家 agent DM 垫一句话建立会话缓存，再发 `!refine <闸名>` 显式触发 hermes 的 background_review fork（`slash_commands_goals` focus 路径不查 enabled 开关，走的正是 background_review 代码路径）。五闸接线：G2 评审→fanfan、概设收口→arch、G3 代码→chen、G4 测试→qi、G5 发布→fanfan。`MX_GATE_REVIEW=0` 可停用。
- **审批回归 auto 全自动**（默认值即历史行为）；hybrid/manual 全量保留为 `MX_APPROVE_MODE` 选项（人工验收轮可用）。
- 宿主真实部署**同步卡点化**（2026-10-02 用户追问后修正——原表述"零影响"与卡点原则自相矛盾）：`~/.hermes/config.yaml` 的既有 `auxiliary.background_review` 条目（review fork 的模型路由，aim）内加 `enabled: false`，与路由字段共存；沉淀改由用户在恰当卡点手动 `/refine`（真实场景无闸脚本，卡点由人判断）。备份 `config.yaml.bak-gate-review-20261002`；回滚=删 enabled 行。

净效果：推演速度恢复优化轮水平（无每 turn 空转），关键治理节点保留真实经验沉淀动作（每闸一次显式 fork），审批全自动可无人值守跑完。DM 垫话→!refine 链路为运行面路径，下轮起跑实测验证。
