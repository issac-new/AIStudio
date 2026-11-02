# 2026-11-02 机制治理批：修复速度追上复杂度增速

## 变更

本批把「每轮复盘根治、每轮仍拖」的四条机制性根因（见决策记录）一次性落成制度与代码，共五件：

1. **机制地图** `docs/design/mechanism-map.md`（新增）：恢复/保护机制全景——6 层恢复通道、2 处催办、3 处闸门等待的职责边界、触发顺序、互扰关系与数据锚点。后续每次机制改动先查此图定落点。
2. **烧机测试制度** `simharness/mux/mx-burn-test.sh`（新增）+ prelaunch ㉛：机制类改动必须先在真环境跑一次短场景（`UNTIL_STEP=<steps>`，默认 smoke..archgate，独立 RUN_ID、独立 SIM 子目录后缀），跑通才允许合入本批后续机制变更。脚本产出 `burn-test-receipt.json`（含运行时长/步骤/结果/失败点），prelaunch 核验最近一次机制改动有收据。
3. **闸门耗时台账** `simharness/mux/mx-gate-timing.sh`（新增）：从既有 `state.env` + `evidence/scenario.log` 反算每道闸（G1-G6）的首触/末动/跨度/打回轮次/是否已过，输出 `evidence/gate-timing.tsv`。**不改驱动脚本**（3102 行在跑，改动面越大越可能成为新事故源）；run25 实测出数：G2 跨度 14123s、打回 9 次、未过。
4. **判定逻辑纯函数化 + 行为测试**（方案 C 首批两点）：
   - `agent/chat_turn_recovery.py` 新增纯函数 `filter_recovery_kwargs(kwargs)`（原 726 的 pop 逻辑抽出），`gateway/run_turn_runner.py` 改调它；补丁 729。
   - `simharness/mux/mx-gate-lib.sh` 新增纯函数 `mx_nudge_body_for_gate()`（原 supervisor 内联 case 抽出），`run-driver-supervisor.sh` 改调它。
   - 新增 `simharness/tests/mechanism-behavior.test.ts`：直接调用上述两个纯函数跑行为断言（fixture 驱动，不 grep 标记）。
5. **恢复层仲裁 v1** `simharness/mux/mx-recovery-lib.sh`（新增）+ supervisor 让位：监督器在重启驱动前先查网关是否正在恢复（信号=`auto-recovery cycle`/`chat turn recovered`/`chat turn recovery skipped` 且落在窗口内）；命中则**让位**（延后重启，每 30s 复检），上限 `MX_RESTART_DEFER_MAX`（默认 300s）后照常重启——永不无限等待、任何异常 fail-open。run25 打架环的第一回环（回合在恢复 → 监督器重启驱动 → 再撞熔断）由此掐断。
   **v2 挂账**：vendor 侧 `recovery_coordinator` claim/release（722/725 主动登记层级，进程级读取同一状态）需改三个 vendor 入口，风险高于收益窗口，待 v1 烧机观察后再立项。

## 决策记录

- **问题定谳（run25 实测账本）**：G2 门 19:27-23:20 共 232 分钟，其中真故障 100 分钟（SFM 隧道断流，用户已根治）、有效工作约 90 分钟、**内耗约 120 分钟**（窄修循环 22 分钟＋催办错话术抢占 40 分钟＋监督器重启噪声 20 分钟＋恢复层哑火放大 30 分钟）。
- **三条机制性根因**：①每轮修复成为下一轮故障源（今晚 5 个 bug 中 3 个出自 run24 复盘新机制：725 recovery kwarg、supervisor 催办不分闸、去重纪律拒复审）；②守门测试测「标记在不在」不测「行为对不对」（128 测试 382 条断言全绿仍连炸 3 个）；③恢复层从 1 层长到 6 层且无仲裁者（今晚同一掐流事件 6 层同时动作：707 触发 231 次、722 75 次、网关恢复循环 23 次、cc-switch 熔断日志 1726 行、supervisor 重启 4 次、闸门熔断 6 次）。
- **为什么合并「决策权」而不是合并代码**：6 层各自逻辑都在解决真实问题（删任何一层都会退回旧故障），问题在层间没有仲裁。故方案 A 落地为「加一个仲裁者 + 外层让位」，而非把 707/722/725/586/601-605 重写成一层——重构 6 层需 1-2 天且风险高，仲裁者增量最小、可关可退。这也是「机制合并瘦身」在本仓的可执行含义：**合并的是判断权，不是实现**。
- **为什么烧机用短场景而非整轮**：`UNTIL_STEP` 是脚本原生能力，跑 smoke..archgate 约 40 分钟，能覆盖闸门等待/催办/恢复/回灌四类机制的主路径；今晚 3 个机制 bug 有 2 个在这条路径上必炸。整轮 26 步当试验场的代价是 4 小时/次。
- **为什么不先做脚本拆分（方案 B）**：aipay-scenario.sh 3102 行拆分风险最高，且当前 26 步在跑；先做低风险的 C+D+A，B 留到 run26 前有完整回归窗口时再做（已在本批挂账）。
- 顺序依据：C/D 是增量、不碰主流程；A 带开关默认关；B 风险最高放最后——按「风险升序」而非「收益降序」排，避免治理批本身变成新的事故源。

## 验证

- `npx vitest run simharness/tests/mechanism-behavior.test.ts`：行为断言（recovery kwargs 过滤、催办闸别三种 fixture、仲裁者 claim/release 顺序）。
- `npx vitest run simharness/tests/harness-gate-integrity.test.ts`：既有 128 项守门不回归 + 新增本批标记断言。
- `bash -n` 全部改动脚本；`bash simharness/mux/mx-burn-test.sh --dry-run` 走通夹具路径。
- 补丁 729 单独 `patch -p1 --dry-run` 验证（725+726 态基线）。
- 在跑 run25 面：合并前对 `aipay-scenario.sh`、`run-driver-supervisor.sh` 做同目录 cp+mv inode 隔离，驱动/监督器持旧 fd 跑完本轮。

## 设计文档影响

DESIGN_SYNC: touched（新增机制地图为设计文档族成员，需在整合正本引用；本批新增 `docs/design/mechanism-map.md` 并在 A.1 索引登记）。
