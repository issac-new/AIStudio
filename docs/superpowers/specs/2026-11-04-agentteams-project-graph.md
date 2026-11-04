# AgentTeams 吸收批三：项目 workflow 拓扑契约

来源：AgentTeams `buildWorkflow`（agentteams-controller/internal/server/project_handler.go:761-860）——
LangGraph 对齐的 `{nodes, edges, next, interrupts}` 投影 + paused 作为 human interrupt + mermaid 导出。
批一 spec：2026-11-04-agentteams-project-workflow.md（本批扩展其域，无新补丁）。

## 变更

1. **纯函数投影** `custom/server/projectworkflow/graph.ts`：
   `projectTaskGraph(projectId, opts)` 读全板 kanban 库（复用批一 project-tasks.ts 的
   listBoardDbs/连接面）→
   - `nodes`：`{ id, title, status, assignee, board }`（全状态，非终结也进图）
   - `edges`：task_links 父子链 → `{ source: 父, target: 子 }`
   - `next`：就绪节点=自身 `todo|ready` 且全部父链 `done|archived`（对齐 _parents_satisfied 口径与批一完成守卫）
   - `interrupts`：blocked 卡（含 block_kind/reason）、项目 paused（读 projects-state.json）、
     review 待决卡——各带可读 reason
2. **端点**（挂进批一已挂载的 projectworkflow 路由，**零新补丁**）：
   `GET /api/projectworkflow/projects/:id/graph` → JSON；`?format=mermaid` →
   `text/plain` mermaid `graph TD` 源（specToMermaid 纯函数：状态着色 classDef、
   就绪节点高亮、interrupt 虚线）。
3. **客户端**：项目详情页（批一 ProjectDetailView）加「拓扑」区——mermaid 源 POST 到
   既有 `/api/hermes/diagram/mermaid-brand`（custom/server/diagram/mermaid-branded.ts:284，
   服务端渲染品牌 HTML+SVG）内嵌展示；JS 调用照 custom/client/ide/utils/diagram-export.ts 的
   既有用法。不引入新图库。

## 决策记录

| # | 决策 | 备选 | 取舍理由 |
|---|---|---|---|
| D1 | 挂进 projectworkflow 既有路由 | 新路由+新补丁 | 路由 731 已挂载，同域扩展零补丁零挂载成本 |
| D2 | mermaid 渲染走既有 mermaid-brand 端点 | 引入客户端 mermaid 库/复用 vue-flow | mermaid-brand 是仓内已验证的品牌渲染通道；vue-flow 需把任务图映射成 RunGraphData，字段语义不合（六态 vs 任务九态）成本高 |
| D3 | next 只认 todo/ready | 含 triage | 对齐 dispatch 实际会派的 lane（ready）与 recompute_ready 的产物（todo→ready）；triage 是待分解态不是可执行节点 |
| D4 | 图含非终结全部节点 | 只画关键路径 | AgentTeams buildWorkflow 也是全节点投影；阻塞分析需要全貌 |

## 验证

- 目标测试：`npx vitest run custom/server/projectworkflow`（新增 graph 测试：临时库造
  父子链/环防御/blocked/review/paused 各态，断言 nodes/edges/next/interrupts/mermaid 文本）
- 全量：`npm test`（对照基线 4 存量红，0 新增）
- 行为验证：真实库任一项目 → graph JSON 结构完整；mermaid 文本过 mermaid-brand 渲染不报错

## 设计文档影响

DESIGN_SYNC: none
批一域内的扩展面；若正本「项目」节未来登记，本批与批一合并描述。
