# 2026-10-26 JoyAI 闭环吸收·挂账清偿批：完成未做五件

## 变更

上批（2026-10-26-joyai-closed-loop-absorption.md）挂账的五件，用户指令「完成未做」全清偿。全部有探查锚定的实现路径，零新外部依赖。

| 编号 | 挂账件 | 落法 | 模块 |
|---|---|---|---|
| B1 | LLM 需求拆模块 | `POST /api/hermes/impact/suggest-modules`：clefAskMixed choice 问句出 JSON 模块数组（synthesize.ts:172-196 同构范本），离线/失败回落 inferModules 词表（fail-open）；导演台「AI 拆模块」按钮回填 | `custom/server/impact/module-suggest.ts`（新）+ DirectorPanel |
| B2 | fewshot 向量召回 | 特征哈希 bigram 向量（hashing trick，定长 512 维+余弦）——零依赖确定性真向量；召回=max(ROUGE-L 字符口径, bigram 余弦)，阈值 0.45 沿用 | `custom/server/eval/vectorizer.ts`（新）+ similarity.ts/fewshot.ts |
| B3 | 泳道事件摄取端 | column-dispatch 派发落账循环（:231-244）并排写 lane_handoff+lane_session 证据（确定性 evidenceId `lane-<taskId>-<col>-<ref>` 幂等，review-store:263-270 落账范式）；panorama 加 laneTimeline 面（listEvidence 按 kind 过滤→LaneEvent→投影） | column-dispatch.ts + evidence 域 + panorama.ts |
| B4 | 回流自动触发 | runner.ts appendRun 后对失败 attempts 自动 reflowTaskToSet（幂等 re- id 兜底；对齐 store.ts:510-516 auto-reflow-on-close 先例）；env `EVAL_AUTO_REFLOW_ON_RUN` 默认开、`=0` 关；distill 提炼维持人工 dryRun 卡点（治理决策不变） | custom/server/eval/runner.ts + auto-reflow.ts（新） |
| B5 | 业务地图多图层画布 | 推演专区新子路由 `sim/map`（routes.ts:432-442 模式+SIM_NAVS 一行）：需求中心+四路实体（本体/图谱/术语分层配色）+specs 文档+建议模块；ImpactEntityHit 加 docs 字段（实体↔spec 共现边）；图层开关 chip 组（RunTraceOverview 过滤钮模式）+网格分层布局（OntologyView 模式） | `custom/client/ia2/views/sim/BusinessMapView.vue`（新）+ requirement-impact.ts |

## 现状对账（探查结论 × 挂账项）

- LLM 通道：eval/clef.ts 是唯一共享通道（judge/badcase-distill/synthesize/uioracle 四消费者），无 key 纯 env（EVAL_JUDGE_BASE_URL 默认 127.0.0.1:8000），默认离线 fail-open 零崩溃——B1 复用不新建。
- 向量基建：全仓零 embedding 实现零依赖（fewshot.ts:7-8 自认）——引外部 embedding 需模型下载离线不可用，特征哈希 bigram 向量是无模型基线的真向量（hashing vectorizer，NLP 标准做法）。
- 泳道数据面：lane_timeline.ts 投影函数+EVIDENCE_KINDS 枚举+REST 校验三件早备，唯一缺写入方；EvidenceRecord 无 laneId 字段→编码约定 artifactType=泳道名、note=from→to、ref=承接（commandId/sessionId）。
- 回流先例：auto-reflow-on-close（处置单关闭自动回流，默认开）已是既定治理形态——B4 是同一语义在 run 完成路径的补全，不是新扩权；reflow 幂等（re- id 重复触发安全）。
- 画布基建：vue-flow ^1.48.2 已在（EditorCanvas/OrchestrationView/OntologyView 三先例），无 d3-force/dagre——网格分层布局是仓内既定模式。

## 决策记录

- **D1 B1 离线回落词表而非报错**：本地默认无 clef serve，LLM 档是增强非依赖；导演台按钮离线时如实提示「已回落词表推导」不装成功。
- **D2 B2 特征哈希向量不引外部 embedding**：真·外部 embedding（transformers/onnx）需模型下载、离线不可用、体积大，违反零依赖确定性基线；hashing trick bigram 向量+余弦是确定性可测的真向量口径（单词组级语义近似），与 ROUGE-L 字符口径取 max 兜住两边盲区。
- **D3 B3 泳道语义编码进 EvidenceRecord 现有字段**：不加 schema 字段（不动版本化结构）：kind=lane_handoff/lane_session、artifactType=目标泳道（列名）、note=from→to、ref=承接（commandId>sessionId 回落）。evidenceId 确定性幂等防重放重复落账。
- **D4 B4 默认开与先例对齐**：EVAL_AUTO_REFLOW_ON_CLOSE 先例默认开，B4 同语义默认开（EVAL_AUTO_REFLOW_ON_RUN=0 关）；distill 提炼自动 dryRun 不做——dryRun 卡点是「人看一眼再入库」的治理决策，自动化提案无人看等于没有。
- **D5 B5 图结构服务端组装 docs 字段**：客户端自行扫 specs 会把检索逻辑复制第二份；ImpactEntityHit.docs 由服务端 requirement-impact 现算（matchedTerm×specMentionsTerm 封顶 3）。
- **D6 B5 只读画布不做编辑**：ONE 的「协同标注/在线修改」是下一档（需持久化层+多人协议），本批落「多图层叠加可视化」核心语义；编辑挂账。
- **D7 补丁号 698 先 grep 后登记**（693-697 连环撞号史延续）。
- **D8 worktree 超软上限第 6 个**：在途 5 个全受 IN-FLIGHT/未合入保护，守「不在 main 直接改」红线，收口即删，如实记录。

## 验证

- 定向测试全绿：`npx vitest run custom/server/impact custom/server/eval/__tests__/vectorizer.test.ts custom/server/eval/__tests__/auto-reflow.test.ts custom/server/kanban/__tests__/dispatch-lane.test.ts custom/server/kanban/__tests__/dispatch-idempotency.test.ts custom/server/workitem` = 20/20。
- 守门闸：raw-hex 预算闸（ia2 域 0 裸 hex——BusinessMapView 色板全 token var() 化）+ 路由名快照（ia2.simMap 登记）修复后 6/6 绿。
- `npm run typecheck:harness` 绿（新模块 module-suggest/vectorizer/auto-reflow 已登记清单）。
- 全量 `npm test` 复跑：901 文件 6448 用例通过 / 0 败 / 11 既有 skip（首轮 2 败=上述两守门闸，修复后全绿）。
- 无新补丁（五件全部落在既有域内，impactRoutes/workitemRoutes 挂载沿用补丁 697）；`npm run inject` 全序列干净。
- 活体走查（worktree 8670 后端+8671 前端，浏览器实物）：①B5 业务地图——16 节点 23 边（需求中心+FIBO 四术语+specs+模块），图层开关关 FIBO 层 16→12 生效，边界声明完整；②B1 AI 拆模块——模块回填 pay-core 等四项+如实提示「判定端不可用——已回落词表推导」（本地无 clef serve 的预期路径）；③B3 IDE 全景面板——「泳道履历」面在位（无派发任务如实 0），createdAt 正常显示 2026-10-26。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§2.11 补挂账清偿段（五件落地+新挂账=画布协同编辑/LLM 重排档）。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：研发闭环串联面行更新（+suggest-modules 端点+泳道时间线+业务地图页+向量召回口径）；路由/页签数随批。
- 产品正本：none——B5 是推演专区新页（导航结构变化已由总账路由数承载）。

## 挂账（本批不做）

1. 业务地图协同编辑/在线标注（需持久化+多人协议，D6）。
2. fewshot LLM 重排档（派发链是同步函数，异步改造超出本批；hashing 向量已覆盖词组级语义）。
3. lane_session 的非派发摄取源（会话创建事件通道，现只有列编排派发面）。
