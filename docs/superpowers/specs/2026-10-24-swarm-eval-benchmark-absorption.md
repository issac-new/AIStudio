# 多 Agent 群体协作评测基准吸收轮：四维度读数面＋红队社会病理向量

- 日期：2026-10-24
- 状态：已落地（overlay `feat/swarm-eval-absorption`；simharness `feat/swarm-eval-absorption`）
- 源文：《多 Agent 群体协作的评测基准设计方法》（银翼AI评测室，2026-10-24，https://mp.weixin.qq.com/s/HmpSLcKRSd8Xr6b9RMFTpQ）
- 关联正本：全流程方案 V8.51 §2.6.11；整合正本 R7 §3.10；数字总账同步刷新

## 背景与缺口对照

源文主张多 Agent 评测基准须建四维度量化体系（通信拓扑与信息流效能／混合动机场景／信用分配与帕累托效能／社会动力学与拜占庭容错），并给出六层工程架构（任务→编排→蜂群→Trace 拦截→评分纯函数→聚合）与「评分=纯函数、可回放、Trace 无侵入旁路」三条工程原则。逐维度对照本仓现状：

| 源文维度 | 吸收前现状 | 本批处置 |
|---|---|---|
| 通信开销比 MOR | 消息量无任何度量（仅 relay 运维语义） | 落「每任务协作消息字符」读数（字符口径代理，D3） |
| 语义意图保真度 | 无概念 | 落「锚点保真度」（任务 ID/模块名跨跳保持率；全文相似度挂账 D4） |
| 认知死锁率 | 有死锁事故台账（run22 判词死锁 12.5h 损耗）但非读数 | 落「死锁/等待信号」＝回灌类代偿占比＋回执缺席计数（既有台账直接换算） |
| 混合动机场景 | 场景全协作型，无利益冲突注入 | 场景级改造挂账（不动 26 步主链，D7）；本批落对抗样本先入红队向量库 |
| 反事实贡献度（Leave-One-Out） | 无（「反事实」仅评测裁判保守口径） | 落观察口径 criticality（参与 vs 缺席任务成功率差，D5）；实验性消融挂账 |
| Shapley 价值归因 | 全仓零命中 | 落任务粒度近似（v(S)=子团队任务成功率，观察数据，D6） |
| 帕累托前沿 | 无（kanban 的 pareto 是进度偏差集中度，异义同名） | 落 per-agent 成本-收益散点＋非支配前沿标记（成本=消息字符代理，D3） |
| 回音壁检测 | 无 | 落「一致通过率＋打回率」读数（打回＝批判性在线的证据，D8） |
| 拜占庭故障注入 | 无行为级注入（qgate 3f+1 是架构静态门） | 注入实验挂账（需专门 run，D7）；本批红队种子库 +2 向量（互批合谋/迎合上位） |
| 评分纯函数/可回放 | 已具备（Eval Studio＋eval 链就是纯函数评分） | 无需改，直接沿用其分工纪律（D1） |

## 落地内容

### 1. 群体协作读数端点（产品正身，单一事实源）

`custom/server/delivery/swarm-collab.ts`（纯函数）＋ `GET /api/hermes/delivery/swarm-collab?run=<id>`（`delivery-controller.ts`）。对一次 run 的既有证据（scenario.log 派发行、compensation-ledger.tsv、issues.log、uat-verdicts.jsonl、release-gate.jsonl）离线计算四组读数，全部 fail-soft、缺席如实 null：

- **communication**：每任务协作消息字符（MOR 字符口径）、锚点保真度（派发行中任务 ID/模块名保持率）、死锁/等待信号（回灌类代偿条数与占比、回执缺席数）
- **credit**：per-agent 贡献度分解（派发数/被派发数/完成锚点数/拥有问题单数）＋观察口径 criticality＋任务粒度 Shapley 近似
- **pareto**：per-agent 成本（消息字符）×收益（完成锚点）非支配前沿标记
- **social**：回音壁倾向度（UAT 一致通过率＋G5 打回计数）、异常拦截面（问题单发现数）、byzantine 如实 no_data（注入实验挂账）

### 2. 红队种子库 v2：社会病理两向量

`custom/server/eval/redteam-seed.ts`：向量库 4→6（新增 `collusion_review` 互批合谋、`sycophancy_conform` 迎合上位，各 6 任务模板，全部 risk 断言 expect=no）；集名 `红队种子库·v1→v2`（内容指纹变化，防幂等复用旧集——V8.48 集名版本化同款配方）。

### 3. 呈现面

`custom/client/ia2/views/effectiveness/DeliveryEffectivenessView.vue` 增第四区「群体协作」（四维度读数表＋帕累托标记），数据面 `api/effectiveness.ts` 增 `fetchSwarmCollab`。

### 4. eval 链接线（判据零变化）

simharness：`mx-eval-lib.sh eval_collect` 采集 swarm-collab.json（fail-soft 静默）→ `mx-eval-summary.py` payload 增 `swarmCollab` 透传（不进判据）→ `mx-report-gen.py` 证据八表增「群体协作读数」行 → 守门测试 `tests/swarm-collab-integration.test.ts`。判据、六闸、26 步零改动（先观察纪律）。

## 决策记录

- **D1 度量器单一事实源在产品端**：四维度读数由 overlay delivery 端点计算，simharness 只「调端点→落证据→透传」（对齐 mx-eval-lib.sh 头注分工纪律）。否决「simharness 侧再写一份 Python 度量器」——双实现必然口径漂移，违背规则单一事实源。
- **D2 只透传不进判据**：swarmCollab 是观测读数，退出码与 G4-E 判据零变化（与 V8.46 处置链／V8.48 读数面同款「先观察」纪律）。
- **D3 token 口径诚实降档**：MOR 与帕累托成本用消息字符数代理（源文铁律「Token 计数取 usage 字段」依赖 run-trace span 覆盖率，run22 实测仅 1 份冒烟 span）；读数内注明口径，token 精确口径挂账待 span 采集率达标。
- **D4 意图保真度落锚点口径**：以「任务 ID＋模块名在派发行中保持」为保真判据（可机械判、可回放）；嵌入向量余弦相似度需模型依赖且消息全文采集，挂账。
- **D5 criticality 为观察口径**：参与任务成功率 vs 缺席任务成功率的差分（观察性，非实验性）；源文的实验性 Leave-One-Out（按角色剥离重跑蜂群）成本一个数量级以上，挂账待专门 run。
- **D6 Shapley 为任务粒度近似**：v(S) 取观察数据中子团队的任务成功率，非全组合重放；小样本下如实输出覆盖的联盟数。
- **D7 拜占庭注入与混合动机场景挂账**：行为级注入（被污染 agent）与角色利益冲突注入都是场景级改造，本批不动 26 步主链（稳定资产）；社会病理学先以红队对抗样本落地面。
- **D8 回音壁倾向度用既有判词换算**：UAT 一致通过率＋G5 打回计数（打回＝批判性思维的直接证据，run22 十六轮打回即高批判性样本）；源文「对错误早期假设无条件同意概率」需专门诱饵实验，挂账。
- **D9 种子库版本化**：红队种子库 v1→v2（加向量改内容指纹，旧集自然退役；产品端无删集端点，集名版本化是 V8.48 已验证配方）。

## 验证

- overlay：`custom/server/delivery/__tests__/swarm-collab.test.ts`（run22 真实样本回放断言）＋ eval redteam-seed 向量数/任务数断言；vitest 全绿＋ts-node 全编。
- simharness：`tests/swarm-collab-integration.test.ts` 结构断言（eval-lib 采集行/summary 透传键/报告行三处在位）。
- web 走查：交付效能页第四区在浏览器端到端出数（8649 链路或临时 vite 预验）。

## 挂账（未落地，待裁定）

1. **实验性 Leave-One-Out 消融**：按角色剥离重跑（每个被消融角色一轮 run），依赖专门 run 预算。
2. **拜占庭行为级注入**：场景脚本注入 1-2 个被污染 agent（错误中间变量/噪声广播/分化暗示三模式），观察群体纠错与隔离——需场景级改造轮。
3. **混合动机场景**（竞标市场/供应链契约博弈/多方利益冲突蜂群）：新场景模板开发，不动现行主链。
4. **消息全文采集进 r18**：r18-collect dialog 模式已在但 run22 未启用；启用后意图保真度可升级全文相似度口径，MOR 可升级 token 口径（配合 run-trace span）。
5. **per-profile token 分桶**：obs-signals 现 byModel 无 byProfile；依赖 run-trace 插件 span 采集率。
