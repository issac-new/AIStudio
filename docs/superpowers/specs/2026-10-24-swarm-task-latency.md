# 群体协作评测·任务锚点时延（补 L2 时延挂账）

- 日期：2026-10-24
- 状态：实施中（overlay `feat/swarm-task-latency`；simharness `feat/swarm-bench-report`）
- 前批：spec 2026-10-24-swarm-bench-leaderboard.md（拓扑/节拍+评测榜）
- 源文：§03「端到端任务延迟」；前批仅落派发节拍，明确标注非端到端时延

## 背景与口径

派发节拍只量「派发发生得密不密」，不量「一个任务从派发到落地花了多久」。scenario.log 同时含派发时间与 `[真值] … ✓` 时间，可机械计算**任务锚点时延**：

- 起点＝该任务 ID 的首条派发行时间（HH:MM:SS）
- 终点＝该任务 ID 之后首条含 ✓ 的真值行时间（✗ 超时行不计；文件顺序必须先于终点）
- 跨零点按 +24h 修正（日志只有时分秒，>24h 如实降档）
- 输出：样本数、中位、P95（最近秩）、最大、逐任务样本（上限 50）

命名与 UI 均写「锚点时延（派发→首个 ✓ 真值）」，不冒充完整任务端到端时延。

## 变更

### 1. 读数面

`custom/server/delivery/swarm-collab.ts`
- `DispatchLine` 增 `lineIndex`；`parseTruthAnchors()` 解析带时间戳的 ✓ 真值行与任务 ID。
- `communication.taskLatency`：`basis='dispatch-to-first-truth'`，中位/P95/最大/逐任务。

### 2. 评测榜

`custom/server/delivery/swarm-bench.ts`
- 第八项指标 `taskLatencyMedianSeconds`（越低越好，无样本=null）。
- `mine.rank` 等既有逻辑不变；缺样本不补零。

### 3. 客户端

- `api/effectiveness.ts` 类型镜像。
- ⑤区增「锚点时延」行；⑥区增「锚点时延」列。

### 4. harness

- `mx-eval-lib.sh` 采集 `/api/hermes/delivery/swarm-bench` → `swarm-bench.json`（fail-soft）。
- `mx-eval-summary.py` 透传 `swarmBench`（runsScanned/entries/frontierSize），不进判据。
- `mx-report-gen.py` 证据八表增「群体协作评测榜」行：入榜轮数、首位轮次、均位、完成率、锚点时延、前沿数。
- 守门测试 `tests/swarm-bench-integration.test.ts`：三处接线在位＋判据区零新增＋缺文件 null。

## 决策记录

- **D22 锚点时延≠端到端时延**：终点取首个 ✓ 真值（产物落地），不含后续评审/回执；UI 与报告均标注口径，避免把 17 分钟系分稿落地误读为项目交付时延。
- **D23 只用文件顺序在派发之后的真值**：防止把上一轮/重做的旧真值算成时延；✗ 超时行不计。
- **D24 榜单指标增至八项**：锚点时延越低越好；无样本轮剔除该指标后重算均位，不补零。
- **D25 harness 只透传不进判据**：与前批 D21 一致，退出码/六闸/26 步零改动。

## 验证

- overlay：`npx vitest run custom/server/delivery/__tests__/*.test.ts`；`npm run typecheck:harness`；web 走查⑤/⑥区。
- simharness：`npx vitest run tests/swarm-bench-integration.test.ts`；`bash -n`＋`py_compile`。

## 仍挂账（本轮无法诚实落地）

1. **token 精确口径**：run22 obs-signals 的 totals.llmCalls=0、tokens 全 0，无可用 usage；待 span 采集率达标。
2. **回音壁文本检测**：run22 r18-steps dialogs=0；需诱饵实验或启用 dialog 采集后的专门 run。
3. **消融/拜占庭/竞标市场首跑**：机制就绪，需 run 预算与 8801/8802 环境。
