# 上游吸收域手记（llms.txt 孪生）

> 给后续会话与 agent 的单页入口（2026-10-01 吸收批 10 落地 #27）：本目录是
> Swarm Studio 吸收上游组件的全部设计与实施事实的单一事实源索引。
> 人读也一样用——点开主文档即全景。

## 主文档（必读）

- [2026-10-01-upstream-absorption-analysis.md](./2026-10-01-upstream-absorption-analysis.md)
  12 组件源码盘点 + 贴合判断 + 27 项吸收清单 + **附录 27 项执行对账表**（实施终态）。
  逐项终态判定（已落地/核实已存在/记档待环境）与合 main 锚点都在对账表里。
- [2026-10-01-upstream-absorption-round2-exhaustive.md](./2026-10-01-upstream-absorption-round2-exhaustive.md)
  **补全版（第二轮，穷尽盘点）**：首轮未展开面全部展开（hermes-agent web dashboard 19 页逐页/
  ui-tui/127 RPC/290 端点；zcode 三端逐件；element-web 补 80 项+Labs 26 全清单；编码四家+dsh 补漏）+
  两个新视角——**hermes-studio 上游暴露面 diff**（六个"有而没用"面+门控不一致）与
  **69 条推演改进点×吸收源交叉对照**（未覆盖残留前 6 方向）。第二轮分期清单 22 项。

## 吸收实施轮的验证资产

- 走查脚本：`overlay/scripts/absorb-msg-surface-walkthrough.mjs`（消息面 5/5）、
  `overlay/scripts/absorb-run-observatory-walkthrough.mjs`（运行观测 6/6）、
  `overlay/scripts/absorb-runtime-caps-walkthrough.mjs`（暗能力 6/6）。
- 守门：`custom/client/ia2/__tests__/msg-surface-absorption.test.ts`、
  `custom/client/matrix-chat/__tests__/top-unread-bar.test.ts`、
  `custom/client/ide/__tests__/trajectory-pane.test.ts`（含 trace 路由双路径静态断言）、
  `custom/client/ide/__tests__/history-browser.test.ts`、
  `custom/server/kanban/__tests__/column-artifacts.test.ts`（列证据契约）、
  `custom/client/ia2/__tests__/runtime-caps.test.ts`（CLI 文本协议解析）。

## 延续线索（记档待环境/待治理）

- **蓝图画廊已落地**（2026-10-02 四轮解封，见 round2 文档四轮记档）：网关 api_server
  代理（runtime-caps 域五端点）+运行中心 runs 页签画廊；蓝图=运行时 venv python 导入。
- **#13 步二进行中**：settings-layers 基建+首批两键（flow.sortMode/ide.slots）已迁，
  剩余散键逐域迁入（kanban selectedBoard/attention 偏好等）。
- **desktop patch 537/538 化**：深链+dock 徽章已实施于注入树（tsc 绿），patch
  化随注入漂移治理轮统一收编（漂移期应用面不可验证，先入库先丢失风险为真）。
- **peer 拓扑（#22）/竞品迁移 import（#25）**：超范围真记档，不在任何在途 backlog。
- **workflow run 复用 RunDetailView 骨架（P11 Phase2 第三件）**：zcode 引擎 run
  与 graph run 数据域不同，需事件流→时间线升级设计，单独立项。

## 上游盘点速查（12 组件一句话）

| 组件 | 性质 | 本轮主要吸收 |
|---|---|---|
| element-web | Matrix Web 客户端 | Spotlight/跳未读条/线程聚合/桌面壳协议 |
| hermes-agent | AI agent 运行时 | runtime-caps 暗能力代理（凭证池/cron/建议） |
| zcode / claude-code / codex / kimi / minimax | 编码代理五家 | 轨迹账本/History 浏览器/审批语义化/steer（多件核实已存在） |
| dsh-TUI / deepseek-harness | DeepSeek 底座+TUI | 轨迹视图 Web 化/桌面常驻宿主决策清单 |
| multica | 人+agent 工作区 | 用量排行榜/在场呈现词汇（核实方向） |
| routa | 多 agent 交付工作台 | 列证据契约 requiredArtifacts |
| hermes-studio | Studio 上游本体 | （差距基线，非吸收源） |
