# 2026-10-26 JoyAI 闭环吸收轮：打通「知识→推演→执行→回流」四处断链

## 变更

源文：《京东零售技术架构负责人贺岩：企业级AI研发闭环体系的搭建与实战》（AI早餐汇公众号 2026-09-20，JDD 2026 智能零售论坛演讲实录）。核心主张：通用大模型落地企业研发有四大短板（非工业化制品/精细化场景适配缺失/无工程化安全思维/仅提速开发环节），叠加企业内部隐形难题（跨部门协作内耗+知识碎片化运动式沉淀）；京东解法是 JoyAI/OxygenSE 三层体系——ZERO（企业知识标准化蒸馏底座，重点抓专属术语与隐性协作知识）→ ONE（全链路推演沙盘，多维图层叠加+协同推演+动态归档）→ DONG（专业 Agent 统一执行界面，工作流=接指令→查知识库→沙盘规划→动代码），核心精髓是统一上下文 ID 串联全链路产物反向回流知识库、持续调优。

本批落四处断链修复（全部规则式，不上 LLM、不做大 UI 画布）：

| 编号 | 内容 | 模块 |
|---|---|---|
| P1 | fewshot 语境接线：派发层按 taskId 取任务标题传入召回 query，打通「干活前查知识库」断链 | `custom/server/kanban/column-dispatch.ts` |
| P2 | specs 索引共享模块：`docs/superpowers/specs/*.md` 只读索引+关键词检索（mtime 缓存），供 P3/P4 消费 | `custom/server/specs/specs-index.ts`（新） |
| P3 | 术语→关联文档：36 FIBO 概念 × specs 全文提及扫描端点 + 本体工作台 fibo 表格「关联 spec」列 | `custom/server/ontology/ontology-controller.ts` + `OntologyView.vue` |
| P4 | 工作项全景串联：`GET /api/hermes/workitem/:taskId/panorama` 八面 fail-soft 汇聚（统一上下文 ID 的汇聚层实现）+ IDE 任务侧栏面板 | `custom/server/workitem/`（新域）+ `custom/client/ide/` |
| P5 | 需求影响推演：`POST /api/impact/requirement` 规则式四路命中（本体实例/板级 KG/FIBO 术语/specs 历史迭代）+ 导演台影响卡 | `custom/server/impact/`（新域）+ `DirectorPanel.vue` |

## 现状对账（源文机制 × 仓内既有能力）

| 源文机制 | 仓内现状 | 判定 |
|---|---|---|
| ZERO 知识蒸馏（结构化归档） | 数据飞轮已产品化：提炼五要素/变体/通过率门/合入门（`custom/server/eval/`，spec 2026-10-25 两轮） | 已有强对应，不重复建 |
| ZERO 术语→关联文档 | FIBO 36 概念静态术语包（`ontology-fibo-glossary.ts`），术语与文档零关联 | **真缺口 → P3** |
| ONE 需求自动拆解/影响推演 | 导演台模块靠人填表单（`simulation-graph-template.ts:1-10` 北极星注释自认）；`inferModules` 是现成正则范式 | **真缺口 → P5（规则式）** |
| ONE 多图层业务地图 | 只有执行图（SpecEditorView）与任务图（OrchestrationView） | 缺口大（UI 工程），本批不做，P5 是其数据层前置 |
| DONG 专业 Agent 执行 | 42 profile/delegate 链/coding-delegate/squad 协议 | 已有强对应，不重复建 |
| DONG「干活前查知识库」 | fewshot 召回通道就绪但断线：`exp-inject.ts:8-11` 自认「column-dispatch 层无任务文本可传」 | **真缺口 → P1** |
| 统一上下文 ID 串联 | 五套局部主键（sessionId/taskId/caseId/runId/specId）点对点互指，无贯穿汇聚面 | **真缺口 → P4（汇聚层）** |
| 增量回流闭环 | 前半环自动（qgate→候选/决策落账 KG），后半环人工（提炼 dryRun/reflow 端点）——刻意治理设计 | 维持现状（人工卡点是治理决策非缺陷） |

## 决策记录

- **D1 断链修复优先于形态复刻**：文章最大价值不是照抄 ZERO/ONE/DONG 产品形态，而是四处「机制就绪但接线断开」的修复。AIStudio 执行层与知识蒸馏已有强对应，重复建=冗余；四处断链是真缺口。
- **D2 P1 走服务端取标题而非客户端上送**：客户端 `SwarmKanbanView.vue:288-295` 虽持有 task.title，但改客户端协议要动 REST body 与事件自动触发面；服务端跨板查 title（`kanbanDbFiles()+openReadonly()` 模式，`governance-analytics.ts:41-60` 现成）零协议变更，查询毫秒级（SQLite 主键）。查不到回落现状（不传 query，保持干净）。
- **D3 P2 索引只读不落盘**：specs 目录 358+ 文件，mtime 缓存内存索引足够（读写比极低）；不建 store/版本化——specs 本身就是 git 管理的单一事实源，索引是纯读侧投影，落盘=第二事实源违反仓规。
- **D4 P3 不动 glossary 数据结构**：RELATED_DOCS 是纯读侧投影（概念×文档提及扫描），不是术语数据的一部分；写进 glossary 结构就要动版本快照与 agent-bridge 契约。端点每次现算（36×N 次子串扫描，N≈360 specs，秒级可接受）。
- **D5 P4 八面 fail-soft 不造串联**：`re-` eval id 与看板 taskId 的映射不存在（origin.taskId 指向 eval 域任务或 trace sessionId），按 origin.taskId+前缀双路匹配并输出 coverage 声明边界；trace 会话只给 eval origin 桥接的已知关联。单源失败 `available:false`，遵循仓「fail-soft 不造假」不变量。
- **D6 P5 规则式不上 LLM**：词表驱动子串扫描（实体标题/别名长度≥2），复用 `inferModules` 正则范式；影响推演是「给导演台填模块前的参考卡」，LLM 拆模块属另一档（挂账）。boundary 保守声明仿 `impact-preview.ts:11-14`「拿不准不猜数」。
- **D7 新 UI 文案走 custom locale 通道**：防同名键覆盖（2026-10-23 京东轮坑：locale 同名键覆盖）。
- **D8 补丁号先 grep 后登记**：693/695/696 连环撞号史，新号全仓确认未占用才进 series。
- **D9 worktree 超软上限**：开工时在途 5 个（上限 3），全部受 IN-FLIGHT/未合入保护无法收口；为守「不在 main 直接改」硬红线新建第 6 个，收口即删。如实记录此偏离。
- **D10 挂账不做**：业务地图多图层画布、LLM 需求拆模块、fewshot 向量化召回、泳道事件摄取端（lane-timeline 无写入方）、回流自动化触发器。防范围扩散，见「挂账」段。

## 验证

- 目标测试（全部通过）：`npx vitest run custom/server/specs custom/server/workitem custom/server/impact custom/server/kanban/__tests__/dispatch-context.test.ts custom/server/kanban/__tests__/dispatch-idempotency.test.ts custom/server/expcandidates/__tests__/exp-inject.test.ts custom/server/ontology/__tests__/ontology-fibo-related-docs.test.ts custom/server/ontology/__tests__/ontology-controller.test.ts` = 42 用例 0 败；回归 `custom/client/ide/__tests__/task-sidebar.test.ts`（17/17）、`custom/client/ia2/__tests__/director-*.test.ts`（5/5）、`custom/client/__tests__/raw-hex-budget.test.ts`（2/2）。
- `npm run typecheck:harness` 全绿（新模块 5 个已登记清单）。
- 全量 `npm test`：903 文件 6438 用例通过 / 0 败 / 11 既有 skip（两轮：首轮 1 败=新组件 `--border` 幽灵变量踩 raw-hex 预算闸，改 `--border-color` 后复跑全绿）。
- `npm run inject` 全序列含补丁 697 干净应用（numstat 8 插入 0 删除单文件）；`git apply --check` 通过。
- 活体走查（worktree 起 8668 后端+8669 前端，admin 会话，浏览器实物）：①导演台「影响推演」卡——术语 2（支付/商户）+ 历史 spec 8 + 建议模块四模块 + 边界声明完整；②本体工作台 fibo 表「关联 spec」列——Party「6 份」徽标、Payment 展开真实 spec 清单（标题+日期+命中行）；③IDE 任务侧栏「⌗」全景面板——真实任务八面计数（事件 20）、卡片标题/负责/板、覆盖边界声明。
- 走查带出并当场根治：kanban.db created_at 为 unix 秒被当毫秒渲染成 1970（`panorama.ts` toMs 换算 + ts-node 真门抓型收紧），活体复验 createdAt→2026-10-26 正确。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：新增 §2.11 研发闭环串联面（四处断链修复+挂账清单）；文档变更记录补整合 R12 行。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：核实日补 JoyAI 轮口径；补丁 406→407、服务端域 149→152（+specs/workitem/impact）、specs 353→354、全量测试滚动口径更新为 6438/0 两轮实测；新增「研发闭环串联面」行。
- 产品正本：none——本批三新面是既有页面的增量面板/列（导演台影响卡、FIBO 列、IDE 侧栏面板），不改页面导航结构。

## 挂账

1. 业务地图多图层画布（ONE 完整形态）——P5 影响推演是其数据层前置，UI 层待独立批。
2. LLM 需求自动拆模块（导演台 modules 字段自动填充）。
3. fewshot 向量化召回（现 ROUGE-L 词面相似度）。
4. 泳道事件摄取端（EVIDENCE_KINDS 已预留 lane_session/lane_handoff，无写入方）。
5. 回流自动化触发器（提炼/回流自动合入，现刻意人工卡点）。
