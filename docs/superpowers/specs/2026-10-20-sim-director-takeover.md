# 产品内导演台（sim-director）接管波 spec

> 日期：2026-10-20。分支：`feat/sim-director-wave`。
> 性质：接管兄弟会话 `zcode-eval-autonomy`（已停止）在 main 工作区的在途改动，
> 稳定化后收口。上游方案正本=兄弟《2026-10-20-cockpit-split-and-hygiene.md》
> （P2 推演导演台与内容人话化）+ 本会话《2026-10-20-cockpit-audit-reconciliation.md》第九节接管记录。

## 一、内容

1. **服务端三端点**（`custom/server/loop/graph/graph-rest.ts`）：
   - `GET /api/graph/sim-director/scenarios`：默认场景（`DEFAULT_SIMULATION_SCENARIO`）。
   - `POST /api/graph/sim-director/plan`：需求（title/description/modules/assignees）→
     `compileRequirementToGraph` 编译 → `validateGraphSpec` 过检 → 返回 spec/角色表/闸数。
     入参校验：title 1-120 字符、description 1-2000、modules 1-12 个合法模块名、
     assignees 模块→员工对象。
   - `POST /api/graph/sim-director/start`：落库 spec（`meta.director.scenario/createdBy`
     溯源，origin=editor）→ 按请求 JWT 构造独立 spec runtime（`HttpKanbanBridge`
     透传 `Authorization`）起跑。无 JWT=401、无 runtime 工厂=501、DryRun 仅测试预览。
2. **推演模板线性化**（`custom/server/graph/simulation-graph-template.ts`）：
   26 节点 → 29 节点（四模块 16 + 全局 13，含 3 个人工闸路由），去掉未接线的
   verdict 条件回退环（v1 线性流水），注册第 7 种模板节点类型。
3. **客户端**：`ia2/api/sim-director.ts`（authFetch 封装三端点 + runs/replay/resume 既有面），
   `DirectorPanel.vue` 重构为导演台（场景/演员/阶段推进/人工介入/起跑入口）。
4. **本会话补钉**：守门测试 `sim-director-rest.test.ts` 7 例
   （scenarios 默认场景、plan 合法/空 body 默认/非法 400、start 401/501/全链落库溯源+JWT 透传断言）。

## 二、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 接管兄弟在途波并为其补钉端点守门测试后合 main | 用户 2026-10-20 裁定「当前会话接管兄弟会话（已停止）的内容继续」；仓库纪律=每端点有钉测，兄弟未来得及补 |
| D2 | 未接线能力一律如实告示不假成功：无 runtime 工厂=501、无 JWT=401、DryRun 仅测试/预览 | 与兄弟 spec D2（假功能保留占位但统一真实反馈）同源；导演启动是真实写路径（建看板卡），必须显式鉴权 |
| D3 | 导演 spec 的 origin 用 `editor` 过校验，溯源信息放 `meta.director` | 导演场景是用户发起的可执行 spec 而非 loop 编译模板；meta 溯源不侵入既有校验器 |
| D4 | 独立 spec runtime 按请求构造，不依赖 GRAPH_ENGINE=on 的全局调度接管 | 导演台是产品内功能，不能要求运维先开图引擎全局开关；JWT 逐请求透传使 kanban 桥以操作者身份写卡 |
| D5 | 模板 v1 线性化（去 verdict 回退环）按兄弟设计原样接管，不回改 | 回退环未接线属于设计选择而非缺陷；兄弟已同步改测试（29 节点/0 回边/7 类型）且引擎 434 测全绿 |

## 三、验证账

- [x] `sim-director-rest.test.ts` 7/7 绿（2026-10-20）
- [x] 图引擎两目录全量：33 文件 434 测全绿
- [x] DirectorPanel.vue SFC 编译通过、import 解析全部命中
- [ ] 激活后端到端起跑一次默认场景（M3 验收轮执行并回填对账文档第八节）
