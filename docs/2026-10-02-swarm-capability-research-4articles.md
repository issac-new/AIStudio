# 四源文调研：动态本体 / 驾驭工程 / 无损换窗 × SwarmStudio 能力完善提案

- 主旨一句话：四篇外部文章（动态本体三部曲①②、信通院驾驭工程报告解读、DSH 无损换窗插件）各代表一个 SwarmStudio 尚未闭合的能力方向——KG 增量演化治理、驾驭工程量化治理面、上下文无损滚存。
- 受众及所需：需先批准方案再动工的开发决策者；读后应在编号菜单上做出"执行 / 选择 / 全做"裁决。
- 决定性发现（≤3 个）：
  1. SwarmStudio 的 KG 链（板级 KG + 决策图谱）已有增量幂等、冲突收件箱、快照回放，但**全部依赖手动 REST 触发，且板级 KG 无版本无回滚、合并无治理分级**——恰好是三部曲①②主题的空档。
  2. 信通院报告的"四大职能 / 六类能力 / L1-L5"里，治理闭环（审批/熔断/审计/PROV-O）SwarmStudio 已厚，但**能力目录三系并存无单一事实源、成本只有 token 一类、无量化成熟度自检**。
  3. 上下文管理现状是"shift 丢旧窗 / compact 靠 LLM 摘要"两极，**没有源文④主张的"旧窗 verbatim 归档可召回 + 机械交接锚点"无损路线**。

源文原始材料存于 `docs/2026-10-02-4articles-sources/`（三篇公众号全文 txt + 头条要点摘录；三部曲③全文 2026-10-03 补档为 `GrrESIILeQ2cxlF0-JKeaQ.txt`）。

---

## 落地与收口状态（2026-10-03 记档）

本文菜单 12 项已于 2026-10-02 全部落地（用户批"全做"；甲乙丙三组并行 worktree，patch 542-545，全量 3703 过 0 红；实弹证据与浏览器走查截图见 `evidence/20261002-swarm-capability-4articles/`）。2026-10-03 凌晨收口轮处置遗留四项：

| 遗留 | 结局 | 锚点 |
|---|---|---|
| ② merge-review 裁决不写 marker | **根治**：裁决台账 board-adjudicated-<slug>.json——keep-existing 裁决后管线豁免+marker 放宽（written∪keepDrops），修掉"幂等只挡未决→已裁决被重新追加"死循环；take-incoming 经 updates 自然闭环 | 0a3ffe32；守门三测 |
| ④ C1 首窗不可切分 | **根治（增量面）**：patch 546 压缩边界史表（追加式）+advance 按次切窗（缺表回落/防御兜底/boundarySource 溯源）；546 部署前存量首窗物理性丢失，firstObservation 如实保留 | e02550e3；守门三测 |
| ③ 499 干净树不可重放 | **实证已自愈**：hermes-agent 干净克隆 42 补丁全链重放一次全过；对账抓到活树 533 未重放漂移，已重建至 LIVE==REPLAY 逐字节等效 | 树级修复（无 overlay 提交） |
| ① 三部曲③未发布 | **已闭合（2026-10-03 午）**：③已发布并完成对照校准——质量门禁真缺口落地为 A5（86e9e248，失败自动回滚）、快照元数据 label 补齐、回滚哲学实证对齐、Neo4j 迁移判定无对应物（等价物=governance manual 档+裁决台账） | a14f7406 |

设计正本同步：V6 推演方案（`docs/superpowers/specs/2026-10-02-mux-v6-fullflow-plan.md`）第二章能力行/P18 行/§14.3 补丁清单已更新（patch 542-546）；过程记档入 V5 changelog-archive §十。

---

## 一、四篇源文讲了什么

### 源文① 动态本体三部曲①：触发 + 增量抽取（2026-09-29，AI砖家成长日记）

论点：一次性全量生成本体的成本随文档总量线性增长，增量演化的成本只取决于本次新增量。落地为 8 阶段流水线：触发 → 增量抽取 → 候选本体生成 → 相似度去重 → 冲突检测消解 → 治理分级 → 合并 →（③ 预告：质量门禁 / 版本快照回滚 / 下游 schema 迁移）。

关键机制：
- **攒批窗口**：`BATCH_SIZE=3` 或 `BATCH_WINDOW_SECONDS=5.0` 先到先触发；逐文件触发会让 LLM 成本被文件数放大、本体因频繁小批合并而震荡。
- 编排教训：通用 DAG 执行器（PipelineBuilder）因多阶段需多输入而被迫简化为普通函数顺序调用——治理阶段要同时拿去重结果和现有类数量，不是单线数据流。
- 实测：增量抽取复用 ingest → parse → normalize → extract 链路，候选本体只是"只看本批数据长什么样"，不直接合并。

### 源文② 动态本体三部曲②：去重 / 冲突 / 治理分级（2026-10-01，AI砖家成长日记）

论点：直接合并候选本体会"类爆炸"（Person/Individual、Organization/Company 同义不同名）。关键机制：
- **相似度三档**：≥0.85 自动别名、0.6–0.85 转人工、<0.6 真新类；阈值需按业务调参。已验证坑：class dict 的 `properties` 是字符串列表，相似度计算内部假设字典（`.keys()`），直接传会 `AttributeError`——比对前剔除该字段。
- **冲突消解**：value/type/temporal/logical 四类冲突按数据源可信度加权（如 official_filing 0.95 > news_article 0.5）；critical 级强制转人工。
- **诚实局限（与本项目直接相关）**：刻意构造的跨批次冲突实测**未检出**——ConflictDetector 依赖实体 `id` 完全一致，而各轮独立抽取的实体各自生成不同 id。结论：冲突检测的前提是跨批次实体消歧/实体链接，这层没做。
- **治理分级**：无父类叶子类自动合并（纯增量不碰结构）；涉 subClassOf/parent 的层级变更必须人工；单批新增类数超过现有类数 20% 熔断全转人工（防 LLM 抽风或脏数据污染本体）。
- 合并用 `overwrite=False` 只新增不覆盖。
- ③（质量门禁/版本快照回滚/Neo4j schema 迁移）**尚未发布**（2026-10-02 搜狗检索仅见①②）；本提案 A4 即按②结尾预告预判其主题。

### 源文③ 信通院《驾驭工程：赋能智能原生软件工程研究报告（2026年）》解读（2026-10-02，架构师之道）

论点：AI 从辅助写码走向自主干工程，需要"为智能体构建完整运行环境、约束规则与反馈闭环的系统工程方法"（驾驭工程），本质是给非确定性智能体建操作系统级控制面。报告原文：https://www.caict.ac.cn/kxyj/qwfb/ztbg/202609/P020260928603514637493.pdf

对 SwarmStudio 最有用的框架件：
- **六大设计原则**：机器可读性优先 / 渐进式信息披露 / 边界约束与行为收敛 / 闭环反馈 / 安全合规内生 / 动态适配与记忆沉淀。
- **六类技术能力**：连接（协议治理、能力目录、语义互通）/ 编排（任务边界、状态机、异常恢复、完成门控）/ 循环（自动触发、工作空间隔离、技能复用、子智能体分工）/ 效能（上下文预算、模型路由、缓存、Skill 复用）/ 安全治理（输入输出执行三侧联动、沙箱、审批、审计）/ 评估优化（执行、服务、资源、安全、业务五维评估）。
- **八工程原语**：任务、会话、状态、工具、记忆、权限、评估、审计——要有唯一标识、版本、生命周期、审计追溯。
- **L1–L5 成熟度**：L1 工具接入 / L2 运行底座 / L3 治理闭环 / L4 协同自治 / L5 规模生产。
- 作者（解读方）的落地建议与批评：L1–L5 缺量化口径（失败率、MTTR、越权拦截率、成本/任务、人工介入率、审计完整率），可当自检清单不可当认证勋章；**先做能力目录和接口契约**（每个工具/数据源/模型都有登记、权限、版本、审计）；**六类成本都要计量**（Token、人工干预、工具执行、等待时延、故障返工、安全治理）。

### 源文④ DSH 信息零丢失压缩插件（2026-10-01 分享，toutiao 2026-09-30 发布）

论点：宿主兜底的 AI 摘要压缩是"摘要幻觉"源头——几万字历史被浓缩成几段大意，细节丢失任务断裂。替代路线：**零摘要无损换窗**。关键机制（详见附录④）：旧窗原文归档 + 机械交接锚点（窗口号/任务/最近动作三行，零模型调用）+ ctx_notes 跨窗工作笔记（含新鲜度门 STALE 警示与"从未写笔记"诚实降级）+ ctx_history 归档召回 + 25/50/75% 分层水位提醒 + 强制换窗脱敏 + engine-state 可观测性探针。证据：Vitest 123 绿、真实模型 E2E、393 事件约 30.7 万 token 全量归档。

---

## 二、SwarmStudio 现状底座（对照锚点）

### 主题 A：知识图谱 / 本体（全在 overlay，upstream 无 KG 代码）

| 能力 | 现状 | 锚点 |
|---|---|---|
| 板级 KG 同步 | 读结案任务 → entity/relation，整板批量桥接（744 任务分钟级降秒级） | `custom/server/knowledge/board-graph.ts:182`（syncBoardGraph）、`:240`（syncAllBoardGraphs） |
| 增量幂等 | 每板 seen 任务 id marker 文件，已摄取跳过 | `board-graph.ts:165/171` |
| 冲突收件箱 | 同 entityId 的字段级冲突上报不覆盖，人工 keep-existing/take-incoming | `board-graph.ts:100/117/132`（take-incoming 经 bridge force 重写 `:139` 附近） |
| 决策图谱 | semantica ContextGraph 桥（entity/relation/record/similar/chain/snapshot 等 9 命令） | `custom/server/decisiongraph/semantica-bridge.py`、`semantica-client.ts:137-185` |
| 决策自动落账 | 派发/审批/升级/门禁四类决策 + 先例挂接 | `decision-recorder.ts:33/52/71/92` |
| 快照回放 | SNAP_MAX=50、5min 节流自动快照、按时间点只读回放 | `replay.ts:16/28/85` |
| 触发方式 | **仅 REST 手动**（POST /api/governance/knowledge-graph/sync），无事件/定时触发 | `governance-controller.ts:457` |
| 版本回滚 | 决策图谱只读回放无回滚；**板级 KG 无版本无回滚** | — |
| 合并治理 | 除字段冲突进收件箱外**全量自动合并**，无叶子/层级分级、无熔断 | — |

### 主题 B：会话 / 上下文管理

| 能力 | 现状 | 锚点 |
|---|---|---|
| upstream 压缩链 | tiktoken 计量 → 预清洗截断旧工具结果（无 LLM）→ SQLite 快照增量摘要 → 尾部 10 条 verbatim | `upstream/hermes-studio/packages/server/src/modules/studio/services/context-compressor/index.ts:1-14`、`chat-run/compression.ts:1-10` |
| coding agent 压缩 | 原生 auto-compaction 保持开启，只共享阈值；超限错误识别 + 会话重置 | `coding-agents/services/context-policy.ts:11-38`、`context-recovery.ts:14/25` |
| 换窗决策层 | shift（丢旧窗免摘要）/ prune（剪枝留骨架）/ compact（摘要）三策略纯函数；**只管选路，执行归各自域** | `custom/server/windowshift/window-shift.ts:8-36` |
| 90% 触发线 | minimax 语义：reserve = 输出预算 + limit×5%，under/soon/now 三级 | `custom/server/compactthreshold/compact-threshold.ts:24` |
| 会话归档/分叉/前缀复用 | Archived 筛选搜索 / 任意消息 fork 谱系 / 链式 sha1 前缀指纹只发 suffix | `server/sessionarchive/`、`server/sessionfork/`、`server/prefixreuse/` |
| token 计量 | /api/token-meter/project|zcode|cost + pricing 表 | `server/tokens/token-meter-controller.ts:38/73/90`、`pricing.ts:65/115` |

**关键差距**：现有两极是"shift 丢旧窗（不可召回）"与"compact 靠 LLM 摘要（源文④定义的幻觉源）"；没有"旧窗 verbatim 归档 + 可召回 + 机械锚点"这条无损路线，也没有跨压缩存续的工作笔记。

### 主题 C：治理 / 审计 / 成本（overlay 最厚的部分）

已有：治理中心 30+ 路由（overview/ledger/metrics/slo/cost-summary/audit-log/contracts/state-model/impact/org-diagnosis/decision-rules/dispatch-stats/registry，`governance-controller.ts:167-535`）；变更治理 L1-L4 SLA + 三级冻结 409 闸（`change-governance-controller.ts`，冻结窗口 `:111-138`）；SLO 错误预算熔断三模式（`governance-budget.ts`）；四源审计归一 + PROV-O 导出（`governance-audit.ts`、`prov-o.ts`，API `:451`）；审批/升级/抽查/风险分级（`server/approval/`、`server/approvals/`、`server/escalation/`）；QGate 12 执行器 + 16 门禁包（`custom/qgate/`）；Goal 三维预算（`server/goalbudget/`）。

差距（对源文③）：**成本只有 token 一类**（六类缺人工干预/工具执行/等待时延/故障返工/安全治理的归一账，返工工时其实已在 change-gov /implement 回填）；**无成熟度自检面**（L1-L5 框架 + 量化口径都没落）；八工程原语无统一对账视图（PROV-O 只映射 actor/activity/entity）。

### 主题 D：能力目录 / 工具注册

三系并存：MCP 目录化（`server/mcpcatalog/mcp-catalog.ts`，工具级禁用）、扩展市场（`server/extmarket/extension-market.ts`）、治理注册表（`server/governance/registry-admin.ts`，roster/app-registry/org，保存即 git 提交可回溯）。另有运行时暗能力只读代理（`server/runtimecaps/`，TTL 缓存 + 单飞锁）。**无统一 capability catalog 单一事实源**——正对源文③"先做能力目录和接口契约，别急着堆插件"。

---

## 三、差距矩阵（源文能力项 × 现状 × 提案号）

| # | 源文能力项 | SwarmStudio 现状 | 差距 | 提案 |
|---|---|---|---|---|
| 1 | 攒批触发窗口（①阶段1） | KG 同步仅手动 REST | 无自动触发/攒批 | A1 |
| 2 | 相似度三档去重（②阶段4） | 收件箱只接同 id 字段冲突 | 无同义候选判定（有 similar 命令可复用） | A2 |
| 3 | 跨批次实体消歧（②诚实局限） | 板级 KG 实体 id 机械派生（task:/agent: 前缀），天然稳定；决策图谱实体为决策记录无重名合并需求 | 弱差距（id 稳定性优于源文场景），仅类/标签层需去重 | 并入 A2 |
| 4 | 治理分级 + 20% 熔断（②阶段5） | 无分级全量自动并 | 缺分级与熔断 | A3 |
| 5 | 版本快照 + 回滚（②③预告） | 决策图谱有快照回放无回滚；板级 KG 无版本 | 板级 KG 版本回滚缺失 | A4 |
| 6 | 能力目录 + 接口契约（③） | 三系并存 | 无统一目录 | B1 |
| 7 | 六类成本计量（③） | 仅 token + 返工工时 | 四类缺账 | B2 |
| 8 | L1-L5 量化自检（③+作者批评） | 无 | 全缺（数据大多已在） | B3 |
| 9 | 八工程原语对账（③） | PROV-O 三类映射 | 原语台账缺失 | B4 |
| 10 | 旧窗 verbatim 归档可召回（④） | shift 丢 / compact 摘 | 无损路线缺失 | C1 |
| 11 | 机械交接锚点（④） | 无 | 缺 | C2 |
| 12 | 跨窗工作笔记（④） | 压缩后仅摘要+尾部 | 缺（注意与 memory/memscope 域整合） | C3 |
| 13 | 分层水位提醒（④） | under/soon/now 三级 + 90% 线 | 基本已有，可补 reminderObserved 观测 | 并入 C4 |
| 14 | 强制脱敏 + 换窗观测（④） | 无 | 缺 | C4 |

---

## 四、提案菜单（编号 + 一句代价，等裁决后动工）

### 甲组：动态本体——KG 演化治理（源文①②）

- **A1 KG 自动触发 + 攒批窗口**：任务结案事件或低频轮询 → 攒批（N 条或 T 秒先到先触发）自动 sync。代价：中——新增 trigger 接线（可挂 automations），须复用单飞锁先例防 CLI 风暴。
- **A2 相似度三档去重（含类层消歧）**：合并前对候选实体/类跑 bridge `similar`，≥0.85 自动别名、0.6–0.85 进收件箱、<0.6 新类；收件箱从"字段冲突"扩为"同义候选"。代价：中高——阈值调参 + 相似度对 class 形状适配（源文②已警示 properties 列表/字典坑，比对前剔除）。
- **A3 合并治理分级 + 熔断**：叶子类新增自动并 / 涉层级（subClassOf/parent）转人工 / 单批变更 >20% 熔断全转人工。代价：低中——sync 流程加分级纯函数 + 收件箱联动 + 守门测试。
- **A4 板级 KG 版本快照 + 回滚**：仿决策图谱 SNAP 机制 per-sync 快照 + 回滚 API + 治理中心 UI。代价：中——snapshot 命令已在 bridge，补版本链与回滚语义。

### 乙组：驾驭工程——治理面补齐（源文③）

- **B1 统一能力目录**：三系（mcpcatalog/extmarket/registry-admin）对齐为统一 capability registry，登记/权限/版本/审计四要素齐备。代价：高——三系数据模型对齐 + 迁移 + UI 收编。
- **B2 六类成本账**：token（有）/ 人工干预（审批+派发史）/ 工具执行（run trace）/ 等待时延（任务时间戳）/ 故障返工（change-gov 已回填）/ 安全治理（审计）归一聚合视图。代价：中——数据源大多已在，做归一投影。
- **B3 L1-L5 成熟度自检（量化版）**：报告分级为框架，指标用作者量化口径（人工介入率/审计完整率/单位任务成本/失败率/MTTR），输出自检清单而非认证分。代价：低中——指标从 dispatch-stats/SLO/audit 取数。
- **B4 八工程原语对账视图**：任务/会话/状态/工具/记忆/权限/评估/审计的唯一标识+版本+生命周期对账清单。代价：中——PROV-O 已有底，补原语维度。

### 丙组：无损换窗——上下文管理（源文④）

- **C1 旧窗 verbatim 归档 + 召回**：换窗/压缩时旧窗原文归档（零摘要），list/read/search 召回 API + 会话 UI 入口。代价：中高——动 upstream 压缩链需 patch（参照既有 400 compact 六段补丁先例）。
- **C2 机械交接锚点**：换窗时从最近事件机械生成"窗口 #N + 任务 + 最近动作"三行（零模型调用）。代价：低。
- **C3 跨窗工作笔记**：会话级持久笔记（写/增/读/检索），压缩换窗后保留，含新鲜度门与诚实降级。代价：中——先盘点 memory/memscope 域避免两套笔记。
- **C4 换窗可观测 + 强制脱敏**：换窗状态探针（触发/拒绝原因、水位、提醒观测计数）+ 强制换窗锚点行脱敏。代价：低中。

### 推荐顺序

1. **第一批（低代价、直接补弧线）**：A3 + A4 + C2——治理分级与版本回滚恰是三部曲③预告主题的预判落地，机械锚点是源文④反幻觉核心且零模型成本。
2. **第二批（数据现成、面板增益）**：B2 + B3——六类成本账与量化成熟度自检，多数取数点已在。
3. **第三批（中工程量）**：A1 + A2 + B4。
4. **单独裁决的大工程**：B1（三系统一）与 C1（动 upstream 压缩链）；C3 视 memory 域盘点结果再定。

## 五、验收口径（动工前先立标准）

- 每项提案：守门测试先行（分级函数/熔断阈值/锚点格式/成本归一投影各至少一条自动化断言），改动任一端当场红。
- KG 演化类（A 组）：以现有 744 任务板为基准，增量轮必须证明"成本只随新增量增长"（桥调用计数不随板规模放大）+ 熔断/分级轮各一次真实打回。
- 面板类（B 组）：数字须可对账到源 API（如人工介入率 = 审批决定数 / 派发数，口径写入 metrics-defs）。
- 换窗类（C 组）：归档完整性断言（事件数守恒）+ 锚点零模型调用断言；C1 须浏览器走查召回入口。
- 溯源：源文附录已入仓（`docs/2026-10-02-4articles-sources/`），结论与源文机制逐条可回查。
