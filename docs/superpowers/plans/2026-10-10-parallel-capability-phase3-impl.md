# 团队并行能力三期（并行粒度落地）实施记录

- 日期：2026-10-10 00:40
- 状态：产品面代码已落 main；实跑验证（GRAPH_ENGINE=on 双轨对照）留 run13 图执行轮
- 上游正本：specs/2026-10-08-team-parallel-dev-capability.md §3 三期；specs/2026-10-09-parallel-capability-foundation-spec.md §4

## 本轮交付（feat/parallel-capability-phase3）

| # | 交付物 | 锚点 | 验证 |
|---|---|---|---|
| 1 | decompose 拆分粒度增强：子卡 estimate_days 全链（LLM 提议→归一 [0.25,2.0]→落库带审计事件）；>1 人日触发一轮重规划（带显式反馈，恰好一轮防循环）；重规划仍超限=钳到 1.0d 带审计放行 | runtime/hermes_cli/kanban_decompose.py（overlay 镜像层，上游基底+delta） | pytest 9/9（含重规划决策链三态） |
| 2 | estimate CLI `--days` 直设旁路 + REST 端点 `POST /api/hermes/kanban/:id/estimate`（days 直设 / persist LLM 估算） | kanban.py `_cmd_estimate` 头段；kanban_parser.py；patches/013+014+035 | patch hunk 计数已同步；CLI 逻辑与 --persist 同构 |
| 3 | report-gen 三层解析：注入表（reportFns）→运行时 deps.fnTable→默认建卡报告器（bridge 建「报告编写」卡+等完成，五类工作面产品语义）；GRAPH_REPORT_MODULE env 注入通道（run13 接 CLI 生成器） | custom/server/graph/node-executors/index.ts report-gen 注册；graph-assembly.ts 注入源 | vitest 21/21（新增 2 测） |
| 4 | 测试守门 | runtime/tests/hermes_cli/test_kanban_decompose_estimate.py（9 测） | 合并树（上游+overlay runtime 覆盖）venv 直跑；勿在 overlay 裸树跑（toolsets/ruamel 在上游，B 轨尾注已知） |

## 设计决策（为什么这样做）

1. **重规划恰好一轮**：LLM 拆分粒度是概率行为——一轮带反馈的重试性价比最高（多数超限会被修正），多轮=无限循环风险+token 燃烧；兜底钳制保正 fan-out 永不阻塞（estimate_set 事件链保真，派发加权看到的总量仍诚实）。
2. **estimate 先落 CLI 直设（--days）而非只走 LLM**：REST/UI 面与 decompose 产物需要确定性写入口；LLM 估算（--persist）保留为辅助路径。
3. **report-gen 默认建卡而非内置生成器**：报告编写本身是五类工作面之一（用户指令），产品语义=一张「报告编写」卡经派发器派给报告 agent；真生成器（harness/CLI 侧）经 GRAPH_REPORT_MODULE 注入，不动 node-executors。

## 遗留（run13 图执行轮）

- GRAPH_ENGINE=on 实跑 26 步模板 + 与 simharness bash 双轨对照（等价性验证）。
- 并行度实算指标（§4.4-13）：≥2× 基线（run11 ~50%）。
- deploy --apply 部署验证（宿主 orchestrator 在跑，窗口留 mx-setup）。
- estimate UI 人日列（看板列展示，本轮只做了 API 面）。
- git 分支真值锚节点类型（branch_fresh 语义）决策：卡状态 vs 分支锚，双轨对照后定。
