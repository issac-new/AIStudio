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

## 能力归类表（2026-11-21c 第五阶精化）

| 功能类 | 归属能力域 | 现有产品承接位 | 路线图 |
|---|---|---|---|
| 组织（roster/角色/团队编排/board 围栏） | 研发治理和协作·组织能力 | 部分在 kanban/team 域 | P1 深化 |
| 治理（六闸/审计/判词/台账/熔断） | 研发治理和协作·治理能力 | custom/server/governance（已承接） | 持续深化 |
| 串联（26 步主链/派单链/审批传输） | 研发治理和协作·协作能力 | 部分在 dispatch/loop 域 | P1 主对象 |
| 环境供给/采集/场景数据 | 推演设施（非能力归类） | — | P2/P3 降优先 |

## 融入路线图（P1-P4 分批，等裁决逐批开工）

| 批 | 内容 | 代价/风险 | 验收 |
|---|---|---|---|
| P1 | ~~推演驱动 REST 化~~ **开工对账（2026-11-21）：交付物已基本在案**——REST 面=custom/server/simrun（11-02 产品批：supervisor＋status/start/stop 三端点）＋graph-rest run 全套＋run-progress 端点；前端面=/app/sim 六面板（SimCenterView/Director/RunDetail/Evidence）。本批补齐验收欠账：router 契约测试 5/5（端点四绿达成：router 三端点＋run-progress 既有测试） | 已付：对账批（测试＋盘点）；原估「协议挪 controller」不再需要 | 控制面/视图面产品在案＋协议契约已测；**SIM 重建后端到端挂账**（环境缺席） |
| P2 | ~~场景库产品化~~ **已落地**（2026-11-21 收尾批）：/api/sim/scenarios 发现＋roster 数组摘要（REST 投影；物理迁移随 P4 归档——D1 决策防破坏 mx-* 引用） | 已付 | REST 可列表/拉取 ✓（测试 3 例） |
| P3 | ~~采集面产品化~~ **已落地（REST 投影层）**：/api/sim/capture-plan 四态结构化 JSON（正本仍在 capture-plan.env 单一事实源）；「采集产物直落证据库」属驱动执行面，随 SIM 重建端到端验证 | 已付（投影层）；执行面挂端到端 | 四态解析测试 4 例 ✓ |
| P4 | **归档预备态**：能力面全产品化（P1 对账＋P2/P3 落地＋驱动绑定在案）；README 归档预备标注 | 已付（预备态） | 「产品面独立运行」端到端挂 SIM 重建窗口——归档执行待该验证 |

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
