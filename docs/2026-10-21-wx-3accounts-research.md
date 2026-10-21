# 三公众号深调研与 SwarmStudio 吸收（2026-10-21）

> 主旨一句话：把壹号讲狮（本体/运营本体）、AI变革见证（Agent 工程 DDD）、银翼AI评测室（Agent 评测方法论）三个公众号的全量文章调研清楚，对账 SwarmStudio 现状，落地六项能力补齐，并把全部借鉴项留档成编号清单供后续轮次取用。
> 受众：本仓库的开发与评审者。读完能知道：三家方法论各主张什么、我们缺什么、本轮补了什么（file 锚点）、还欠什么（编号挂账）。
> 语料：295 篇全文（枚举/抓取方式与缺口见 §1）；逐篇精读笔记在 [wx-research-20261021-digests/](./wx-research-20261021-digests/)。

---

## 1. 调研范围与语料

| 公众号 | 作者署名 | 主题 | 枚举数 | 正文到手 | 主要缺口 |
|---|---|---|---|---|---|
| 壹号讲狮 | 本体智能 | Palantir/本体/运营本体/FDE 交付 | 262（palantir 合集 258 + 合集外 4） | 259 | 3 篇反复抓取失败疑已删（WAIC 14 家厂商、富士通出海、第 19 大上市公司） |
| AI变革见证 | AI变革见证 | Agent 工程实战连载（19 篇合集） | 20 | 20 | 特斯拉 Roadster、腾讯 Octop 两篇合集外评论未补到（搜狗限流） |
| 银翼AI评测室 | 银翼 | AI 评测方法论连载 + 技术拆解系列 | 10（连载合集 8 + 合集外 2） | 16（另 6 篇拆解经链接解析补入） | 入职第一天/OpenAI 撤回/Meta Scale AI/DeepSeek 宕机等 4-5 篇新闻评论未补到 |

枚举方法：微信合集（album）API 全量分页（主通道）+ 搜狗微信搜索多关键词扫荡（补合集外）+ k/h 参数解析搜狗中间链接（反爬绕过）+ 正文站内互链爬取（结果为空，正文不互引）。缺口均如实标注，未获取的文章不作内容臆测。

**决定性发现（≤3）**：
1. 三家方法论恰好覆盖 SwarmStudio 的三大空白：**可执行本体（Action 层）**、**统一任务生命周期（Instruction 实体）**、**评测的相对闸与裁判校准**——三家互相独立地指向同一结论：生产级 Agent 平台的分界线不在模型层，而在执行治理层。
2. 壹号讲狮 258 篇是一条完整认知演化链（2022 读彼得蒂尔 → 2026 FDA/Agent 接管 FDE），其「业务理解→决策计算→执行治理」三环节框架是全局坐标系。
3. 银翼的核心警告直指评测惯性问题：精确匹配一致率平均虚高 38.6 个百分点——裁判验收必须看 κ 不看裸一致率（本轮已按此落地）。

## 2. 三家思想体系速览

### 2.1 壹号讲狮：本体是 Agent 时代的操作系统
- **五条本体路线**（2026-10-20 文）：①开放语义标准（Apache Ossie，可交换≠可执行）②平台原生语义（Snowflake/Databricks，强分析弱执行）③指标即代码（dbt/Cube，口径工程化）④知识图谱（OWL/SHACL，关系推理≠运营）⑤可操作对象模型（Palantir：Object+Link+Function+Action+权限）。五条非阶梯可组合，按业务任务选型；SwarmStudio 定位=路线⑤。
- **三环节框架**：业务理解（对象/口径/关系）→ 决策计算（Logic/模型/优化器）→ 执行治理（Action/权限/审批/审计）。Data→Ontology→Model→Agent→Action 任何一层断链都不产生业务价值。
- **Action 是唯一写通道**：Function 封装「读—算—判」，Action 是受治理的「写」；LLM 只能触发预定义 Action，不能直接 UPDATE——推理与执行切成两个可审计阶段。
- **FDE 方法论**（16 篇系列）：Human Backpropagation（现场=损失函数，误差信号回传产品）、Bootcamp（压缩的是认知周期不是开发周期）、产品回流机制（Field Problem→Solution→Pattern→Primitive→Platform，考核 Reuse Ratio）、Problem→Ontology（不信需求文档，Object 从 Workflow 长出）。
- **MVO**：一次建全企业本体=瀑布复辟；起点是任务不是数据，边界=业务闭环；企业本体是 MVO 复用生长出来的。
- **趋势判断**：模型越强 Ontology+Harness 价值越大；Ontology 与 Harness 必然合流；企业软件基本单元从 App 转向 Object+Action+Skill+Agent。

### 2.2 AI变革见证：Agent 工程的 DDD 收口
- **五层递进**：认知选型 → 单 Agent 引擎（记忆三层/ReAct/断点续传）→ 容错运维（异步/人工卡点/重试/降级/可观测/评测）→ 多 Agent 协作（A2A+MCP 上下层搭档）→ DDD 收口。
- **领域模型六件套**：Session 聚合根 + Instruction（指令实体，带 PENDING→PLANNING→EXECUTING→VERIFYING→DONE/REJECTED 生命周期）+ Message（senderType/messageType 五枚举分类）+ Tool/ToolCallRecord 分离（定义=能力契约，记录=执行流水）+ AgentState（只存结构化四件套：memorySnapshot/variableMap/nextStepHint/checkpointVersion）。
- **铁律**：一步一存；幂等三级；临时与永久错误分治、降级由业务规则预定义不交给 LLM；流水与快照分治（流水是事实源）；权限前置拦截且只收缩不放大（指令⊆基线、子授权⊆父授权）；熔断按资源隔离、OPEN 期间禁重试。
- **判断**：「没有 Instruction 实体，你就没法做任务超时提醒、取消、重派、委派失败回滚——这是生产 Agent 与 Demo Agent 最核心分界线」。

### 2.3 银翼AI评测室：评测是对抗退化的基础设施
- **四层全链路**：L1 业务生成质量（客观量化+主观盲测+BadCase 库）→ L2 Agent 底层能力（安全/成本/鲁棒性/编排轨迹）→ L3 端云交互 → L4 业务合规运维对抗。四层都绿才叫可上线。
- **五条贯穿主线**：BadCase 库是基础设施不是报表（最小失败证据五要素/去重准入/版本化）；评测器本身也要被评测（Meta-Evaluation，κ 校准/漂移告警/裁判降级）；机械判据优先 LLM 裁判补位（零判据不许通过）；评测与发布联动（指标退化禁上线/灰度回滚）；长尾靠回流不靠枚举（「已知未覆盖」入报告）。
- **裁判可靠性**：kappa 通胀 38.6pp；四大偏置（位置/啰嗦/自我偏爱/权威宽大）；五守则=换序双跑、回避制+陪审团、κ 校准后上岗、能机械判不劳裁判、防刷分。
- **厂商横评**：淘系四层归因+Meta-Eval、字节离线/在线双时点+回流纪律、腾讯 Harness 内建评测+安全独立赛道、美团四档判分+Data Loopback、百度「评估器即回报函数」、理想世界模型考场+错题库进水口保护。

## 3. 对账：SwarmStudio 现状 × 三家主张

基线盘点（Explore 代理全锚点）结论：本体 T-Box 完整（FIBO 五要素/版本链/provenance/三格式导出）但 **Action 层空白**；任务状态散在 5 套局部状态机 **无统一生命周期**；工具契约有副作用/超时/重试/幂等但 **缺 Schema/authRule**；**无通用 LLM/MCP 限流熔断**；评测域厚（七维/考卷快照/同卷复评/回流/红队）但 **缺 judge×人工一致率、主观盲测、相对退化闸**。

## 4. 本轮落地六项（全部测试绿 + typecheck rc=0）

| # | 能力 | 来源主张 | 主锚点 |
|---|---|---|---|
| 1 | **本体可执行 Action 层**：ActionType（targetTypes/kind 四级 read·recommend·write·execute/inputSchema/outputSchema/preconditions 引公理/approval 三级缺省 mandatory/permissionTags 写面必填/幂等声明）；校验四道闸；JSON-LD/Turtle 导出 | 壹号讲狮五条路线⑤+权限即上下文 | `custom/server/ontology/ontology-types.ts`（ActionType）、`ontology-validate.ts`（spec:action-* 四码）、`ontology-export.ts`（core:Action） |
| 2 | **工具契约 Schema/authRule/限速**：ToolParamSchema 子集+validateToolCallArgs 机械校验；authRule 三模式（none/permission-tag/approval-bound）+authzAllowed；TOOL_CONTRACT_VERSION→2026-10-21.1 | AI变革见证 16/18 篇 | `custom/server/toolcontract/contract.ts` |
| 3 | **callgate 调用闸域**：熔断三态（CLOSED→OPEN→HALF_OPEN 按资源隔离）+滑窗限流（并发+每分钟双限）+准入次序（熔断>速率>并发排队）+降级阶梯五档（预定义不交给 LLM）+重试×熔断互斥（OPEN 禁重试/半开只放探测） | AI变革见证 19 篇 | `custom/server/callgate/callgate.ts`；观测面 `GET /api/harness/callgate` |
| 4 | **裁判×人工一致率（κ）+盲测面板**：Cohen's κ+裸一致率对照+混淆矩阵+假通过/假失败点名（复用既有 previousValue 机判基线，只加聚合层）；盲测截尾均值（去最高最低/并列各截一/不足 5 人不给分）+背靠背盲选 | 银翼 κ 通胀+盲测准入 | `custom/server/eval/human-agreement.ts`、`blind-review.ts`；端点 `GET /runs/:id/agreement`、`POST /blind-reviews/trimmed-mean` |
| 5 | **指标退化禁发闸**：候选 run vs 基线 run（最近稳定版）三项数值对比（成功率跌幅/P99 比升幅/降级率升幅），越线即 hold；无基线如实 no_baseline 不虚报；绝对闸（releaseGate）与相对闸并联 | 银翼四层 L4+AIP Evaluations | `custom/server/eval/release-hold.ts`；端点 `GET /runs/:id/release-hold?baselineRunId=` |
| 6 | **统一任务生命周期账本**：五源（kanban 列/A2A 六态/pipeline 六阶段/matrix phase/mention）映射到 pending·planning·executing·verifying·done·rejected·cancelled；映射不上返回 null 不猜；终态锁定（DDD 聚合不变性）；JSON 账本 upsert | AI变革见证 13 篇 Instruction 实体 | `custom/server/taskledger/taskledger.ts`、`taskledger-store.ts`；端点 `GET/POST /api/harness/taskledger` |

测试：`custom/server/{ontology,toolcontract,callgate,eval,taskledger,harness}` 合计 41 文件 393 用例全绿；`npm run typecheck:harness` rc=0（新文件已入白名单）。

## 5. 未落地挂账（编号清单，供后续轮取用）

以下为 126 条借鉴项中本轮未实施的高价值项（完整清单见 digests 附录各「三、可借鉴清单」节）：

1. **本体属性类型扩展**（壹号 A4-P1）：时序/向量/地理/文档四类字段类型（最小可行先做向量+文档两类，直接服务 RAG）。
2. **Action 执行运行时**（壹号 A3-P1/A2-P1）：Proposal 对象（生成→待审→批准/驳回→已执行）+审批域联动+写回本体实例；本轮只落了 T-Box 契约层。
3. **MVO 场景映射视图**（壹号 A1-P1）：「推演场景→所需对象/Action 集」映射与依赖影响分析。
4. **指标口径单一事实源**（壹号 A1-P1）：metric-registry×kanban metricsDefs×BPA KPI 三处口径合一并与本体 DataProperty 挂接。
5. **权限即上下文注入**（壹号 A2-P1）：派发前按身份编译可见对象/属性/工具清单注入上下文（编译期过滤而非运行时拦截）。
6. **AgentState 结构化四件套重构**（AI变革见证 P1）：图检查点 state 负载按 memorySnapshot/variableMap/nextStepHint/checkpointVersion 重构。
7. **委派统一回执账本增强**（AI变革见证 P1）：TaskLedger 已立骨架，待 mention/matrix/A2A 派发入口实际接线写入。
8. **租户隔离主体面**（AI变革见证 P1）：tenantId 贯穿 Session/Quota/Policy/Claim。
9. **独立 BadCase 库实体**（银翼 P1）：五要素 schema+按型去重准入+版本管理（现有回流即入回归集，缺独立实体与线上自动采集）。
10. **判据突变验证门禁**（银翼 P2）：新判据上线前注入已知违规的变异测试，杀不死变异体不许上岗。
11. **四档判分改造 S1**（银翼 P2）：红线/完美/无效三个二分类裁定器并行+冲突上仲裁。
12. **七种逻辑块词表**（壹号 A4-P1）：推演编排节点对齐 Use LLM/Apply action/Execute function/Transform/Conditionals/Loops/Create variable，AI 步骤与确定性步骤显式分离。
13. **FDE 式交付方法论**（壹号 A1/A3）：Bootcamp 工作坊包+产品回流考核（Reuse Ratio/Time to Second Deployment）——流程与组织面，不入代码。
14. **callgate 执法接线**（本轮只给观测面）：LLM 客户端与 MCP 网关消费 check/settle 后才真正执法。

## 6. 语料与复现

- 语料库（295 篇 markdown）：`/tmp/wx-research/corpus/`（会话级；如需长期保存应移 NVMe 归档）。
- 索引：`docs/wx-research-20261021-digests/corpus-index.json`（三号全量标题+日期）。
- 精读笔记：`docs/wx-research-20261021-digests/{A_壹号讲狮_block1-5,B_AI变革见证,C_银翼AI评测室}.md`（逐篇+体系总览+可借鉴清单三节）。
- 抓取配方：合集 API `mp.weixin.qq.com/mp/appmsgalbum?action=getalbum&__biz=<biz>&album_id=<id>&count=20&f=json`（begin_msgid 翻页）；搜狗中间链接 k/h 解析（`url+'&k='+b+'&h='+url[a+4+21+b]` + SNUID cookie）。
