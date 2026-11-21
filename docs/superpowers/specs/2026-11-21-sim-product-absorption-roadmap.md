# 2026-11-21 推演程序融入产品能力：第四阶定性＋融入度盘点＋路线图立案

> 用户立法（2026-11-21，接续同日「本质上是治理程序」）：**推演程序融入 AIStudio 的产品能力中**。定性谱系四阶完整：临时工具（10-08）→产品能力一环（10-15）→治理程序本质（11-21a）→**融入产品能力（11-21b，归宿）**。含义：推演不是产品之外的独立工具仓，其治理能力的最终形态=AIStudio 产品能力的组成部分；判读/判据留在产品域，驱动面逐步产品化，simharness 最终收敛为薄执行层直至退役。

## 融入度盘点（2026-11-21 实测）

**已融入产品面（五件，均有代码锚）**：
| 能力 | 产品承接位 | 锚 |
|---|---|---|
| 六闸判读/判词/熔断/审计/台账正本 | `custom/server/governance/`（lifecycle/run-metrics 等 20+ 文件） | simharness `governance-client.sh` 头注自证「单一事实源=custom/server/governance/lifecycle，本文件不含任何判据」 |
| 报告链 | `custom/server/report/` | 10-15 融合批移植＋REST 接线（patch 580） |
| 评测判据 | `custom/server/eval/e2e-verdict` | fail-closed 消费 |
| 推演运行态并入运行中心 | `custom/server/controllers/sim/run-ingest.ts` | sim-* runId 事件入 EventLogStore，运行中心可见 |
| 审批/权限通道 | H3 交互审批桥＋permmodes v4 会话权限档 | patch 581/4c88ca92 |

**仍在 simharness 的剩余面（四类）**：
1. 驱动壳：`mux/`（mx-up/mx-clean/mx-relay/run-driver-supervisor 等）
2. 场景库：`scenarios/`（26 步主链场景＋roster）
3. 采集面：r18-collect/r18-frames/capture-ui（帧/证据采集）
4. 环境供给：mx-setup（SIM 拓扑搭建/盖章）

## 融入路线图（P1-P4 分批，等裁决逐批开工）

| 批 | 内容 | 代价/风险 | 验收 |
|---|---|---|---|
| P1 | 推演驱动 REST 化：产品端点（start/stop/status/list 演推 run）＋驾驶舱推演页签（runId 徽标消费既有 observer/overview 聚合） | 中——mx-relay 驱动协议挪进 controller；SIM 拓扑绑定面用 HERMES_ROOT 参数化解耦 | 端点四绿＋前端走查；SIM 重建后端到端一轮 |
| P2 | 场景库产品化：scenarios/ 迁产品数据面（版本化/校验入 REST） | 低——数据资产迁移＋路径解引 | 场景经 REST 可列表/拉取 |
| P3 | 采集面产品化：帧拍摄位/证据采集并入产品 eval 域 | 中——capture-plan 注册表与治理判据对齐 | 采集产物直落产品证据库 |
| P4 | simharness 收敛退役：驱动壳薄化→归档（对齐 SIM 实体已拆态，重建走产品通道） | 高——依赖 P1-P3 全落 | 全量推演能力可在产品面独立运行 |

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 本轮只立定性＋路线图，不开工 P1 | 「大改先沟通」纪律＋迁移面涉及驱动协议重设计；P1-P4 各自独立立项 spec |
| D2 | 三正本定性句补归宿措辞（轻改） | 与上轮治理定性批同型：身份句补「融入产品能力」归宿，不动结构 |
| D3 | 融入度盘点以代码锚为证（不信目录名自述） | governance-client 头注/run-ingest 源注/patch 历史三源互证 |

## 验证

- [x] 三正本定性句修订后 grep 复核。
- [x] `gen-doc-indexes --check` 0 problem＋`merge-invariants --check` pass。

## 设计文档影响

DESIGN_SYNC: touched —— 本批修订整合正本 `docs/DESIGN.md`（simharness 表行定性句补归宿）；路线图立案为后续 P1-P4 各批的设计依据。
