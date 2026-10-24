# 群体协作评测·聚合层：拓扑/节拍读数＋跨轮评测榜

- 日期：2026-10-24
- 状态：实施中（overlay `feat/swarm-bench-scorecard`）
- 前批：spec 2026-10-24-swarm-eval-benchmark-absorption.md（四维读数）＋ 2026-10-24-swarm-eval-followup-batch.md（清账批）
- 源文：《多 Agent 群体协作的评测基准设计方法》（银翼AI评测室，2026-10-24，https://mp.weixin.qq.com/s/HmpSLcKRSd8Xr6b9RMFTpQ）§03 拓扑中心化/时延、§08 六层架构 L5 评分与 L6 聚合

## 背景与缺口

前两批已落四维度「单轮读数」，源文工程落地部分的 L5/L6 仍缺：**评分卡无法跨轮比较、拓扑维度只有消息量没有结构、没有榜单/帕累托聚合**。本批只补聚合层，不重做既有口径。

| 源文要求 | 前批现状 | 本批处置 |
|---|---|---|
| 拓扑中心化度/端到端时延（§03 ③） | 只有派发计数与字符 | 落派发图结构读数：节点/边/自环、出入度归一化中心化度、最大枢纽占比；派发节拍（跨度/中位间隔/每分钟）——描述性，不冒充端到端时延 |
| Scorecard（§08 L5） | 单轮四维原始读数 | 落跨轮指标矩阵：七项可比指标＋逐指标名次＋均位（可用指标平均名次） |
| Leaderboard + Pareto（§08 L6） | 无 | 落 `GET /api/hermes/delivery/swarm-bench`：名次榜＋非支配前沿标记＋指标口径清单 |
| 评分纯函数/可回放（§08 原则） | 已具备 | 沿用：`swarm-bench.ts` 全纯函数，输入=既有 `SwarmCollabReadout[]`，零新增埋点 |

## 变更

### 1. 读数面扩展（单一事实源）

`custom/server/delivery/swarm-collab.ts`

- `DispatchLine.ts` 补 HH:MM:SS（原为空串），`DISPATCH_RE` 加时间捕获组。
- `communication` 增 `topology`：`nodes / edges / selfLoopShare / outCentralization / inCentralization / topHubShare / topHub`。中心化度=归一化赫芬达尔指数（0=均分，1=单点全包），出入度分别计算。
- `communication` 增 `cadence`：`spanSeconds / medianGapSeconds / dispatchesPerMinute`，口径 `dispatch-time-of-day`（日志只有时分秒，跨日按 24h 上限降档）。

### 2. 评测榜纯函数

`custom/server/delivery/swarm-bench.ts`（新）

- 七项指标：任务完成率（越高越好）、每任务字符（越低越好）、意图保真（越高）、每完成锚字符成本（越低）、回灌占比（越低）、回音壁倾向（无条件通过率，越低）、拜占庭 BCR（越高，仅注入轮有值）。
- 逐指标名次（并列同名次）＋均位＝可用指标平均名次；缺指标剔除后重算，不填零。
- 跨轮帕累托：成本=每完成锚字符、收益=任务完成率；非支配者标 `onFrontier`。

### 3. 端点

`custom/server/delivery/delivery-controller.ts`

- `GET /api/hermes/delivery/swarm-bench[?runs=a,b]`：默认扫描 SIM_ROOT `runs/` 最近 20 轮，只收有证据的 run；非法 run 400；无可用 run 返回 `available:false`。
- 响应含 `entries / metrics / pareto / note`，全部只读 fail-soft。

### 4. 客户端

- `custom/client/ia2/api/effectiveness.ts`：类型镜像＋`fetchSwarmBench()`。
- `DeliveryEffectivenessView.vue`：⑤区补「拓扑/派发节拍」两行；新增⑥「群体协作评测榜」——名次表＋内联 SVG 帕累托散点（不引图表库，沿用本页 CSS 格阵先例）。

### 5. 工程登记

- `package.json` 的 `typecheck:harness` 列表加 `custom/server/delivery/swarm-bench.ts`。

## 决策记录

- **D16 拓扑与节拍是描述性读数，不进名次**：中心化度高不等于差（星型/树状本就中心化），节拍快不等于任务时延短。只呈现结构，不做价值判断，避免伪指标。
- **D17 均位＝可用指标平均名次，不做加权总分**：源文未给权重，产品自拟权重会产生不可解释的精度；平均名次可复算、可审计，且缺指标自动剔除。
- **D18 榜单只扫 SIM_ROOT 未归档 run，上限 20**：归档 tar 不在扫描面（同 interventions）；上限防目录膨胀拖垮读端点，按 run id 倒序取最近。
- **D19 少于 2 轮或指标缺席如实 null**：单轮仍出名次 1，但不产生"领先"语义；缺值不补零、不插值。
- **D20 帕累托沿用字符成本口径**：与前批 MOR/帕累托一致；token 精确口径仍挂账（依赖 run-trace span 采集率）。
- **D21 判据零变化**：榜单与拓扑只观测，退出码/六闸/26 步/eval 判据零改动；本批不改 simharness。

## 验证

- `npx vitest run custom/server/delivery/__tests__/swarm-bench.test.ts custom/server/delivery/__tests__/swarm-collab.test.ts`
- `npm run typecheck:harness`
- web 走查：`npm run dev` → 交付效能页，⑤区拓扑/节拍出数；⑥区多轮榜单与帕累托散点出数；不足两轮时名次如实降档。

## 挂账

1. token 精确口径（MOR/成本）——依赖 run-trace span 采集率。
2. 真实端到端任务时延——需任务开始/完成时间戳成对采集。
3. 回音壁文本级检测——r18 dialogs 已具备，待专门诱饵实验口径。
4. 榜单进 simharness 报告章——本批先产品端可用，报告接线待下一轮。
