# Eval Studio：SwarmStudio 全量评测工作台设计

日期：2026-10-07
原文存档：`specs/assets/wx-articles-2026-10-07/`（1.txt 全文 + 1.html 原始 HTML + metadata.json）
状态：**方案已批准（用户裁决 A 档全量），M1-M4 按里程碑推进**；本文件是唯一设计正本
上游方案族：`2026-10-06-five-article-research-and-capability-plan.md`（P2 校准集 / P5 A/B 验收 / run12 图执行推演均以本域为底座）

## 0. 结论

美团把近 200 个评测指标跑在真实业务上（人机一致率 99%），支撑它的不是某个聪明的裁判模型，而是一整套工程范式。对 SwarmStudio 的诊断是：**评测的原料已全部就位（轨迹三层、成本表、本地判定后端、密封题库契约、门禁框架），但从未被组织成"评测"**——轨迹被采集但从未被评分，成本被记录但从未进报告，闸门判词只在推演 harness 侧而非产品内。

本方案新建评测域（`custom/server/eval/` + `custom/client/eval/`），全量落地文章 8 条启示：评测集工程（E2E+Process 双轨）、Rubric 二元化（含 unknown 诊断）、四步判分管线（S0 规则→S1 并行二元判定→冲突仲裁→聚合）、Pass@k 统计门禁、四层报告（Result/Trajectory/Efficiency/Risk）、归因双 Loop（Agent Loop + Rubric Loop，防 reward hacking）、环境终态校验器（产品化 simharness verify_done_evidence）、LLM-as-Oracle UI 测试（KuiTest 两阶段）、CI 门禁集成（qgate gate pack）。

## 1. 文章核心提炼

来源：《美团 Agent 评测体系技术拆解：从答案评测到行为评测的工程范式》（银翼AI评测室，2026-10-07）。

**问题定义**：Agent 评测对象是耦合系统 `System = Model + Prompt + Skill/Tool + Memory + State + Business Flow`，单一输入输出具随机性（采样/工具非确定/上下文漂移），"单跑一次比对 ground truth"在统计上不成立。评测目标四层：

| 层 | 评估对象 | 典型信号 |
|---|---|---|
| Result | 端到端交付物 | 任务完成率、交付物可用性 |
| Trajectory | 执行过程 | 规划合理性、步骤稳定性、Tool 调用序列 |
| Efficiency | 资源消耗 | Latency、Token、步数、成本 |
| Risk | 安全与越权 | 越权操作、数据泄露、红线触发（一票否决） |

两个终态都"正确"的 Agent，一个路径收敛可复现、一个靠暴力采样命中，在 Result 层不可区分、Trajectory 层差异巨大——这是 Trajectory Evaluation 取代 Response Evaluation 的根本动因。

**一致性工程**：独裁者+背靠背标注；Rubric 下钻与二元化（连续评分拆成二值断言集 [是/否/未知]，每断言 κ 可单独监控；unknown 占比是 Rubric 定义不充分的诊断信号）；阈值：人人一致率 ≥85%、人机 ≥90%（美团实测 99%；Beam 业务二元化后 62%→92%）。

**评测集工程**：`Task = (Problem, Reference, Metric & Rubric)`；长程阶段 Reference 从可逐字比对字符串迁移为 Expected Behavior，评测依据 = Transcript（轨迹）+ Outcome（环境终态）；**Outcome 以环境终态为准**——输出"已预订"不算通过，数据库存在记录才算。E2E 集（任务级，拉警报）与 Process 集（模块级，定位责任方）双轨互补，Process 拆解由真实故障驱动而非设计期完备性驱动。

**在线评测**：影子→AB→巡检三阶段灰度；Availability/Cost/Behavioral 三类指标联合判读（单看任何一类都会误判归因方向）；归因双路径：Bad Case 沿 Trace 归因后分叉，Agent Loop 修系统、Rubric Loop 校裁判——只走 Agent Loop 的系统会拟合评测分布（reward hacking）。

**WOWService 四步判分管线**（arXiv:2510.13291）：四档评分（-1 红线/0 不满意/1 满意/2 优秀）；序数回归拆成并行二分类（任务降维，每个 judge 决策边界更清晰）；红线独立判别；冲突才仲裁（控人工抽检成本）。

**长程评测基建七项**：全链路回放 / Case 管理 / 分层执行沙箱 / Rubric 驱动评测引擎 / 报告与归因 / 版本回归 / 准入准出门禁。

**KuiTest**（ICSE 2025）：LLM 当 GUI 测试 Oracle，两阶段分解（直接端到端判 bug 不可靠）——Stage 1 组件可供性预测（截图+View Hierarchy+SoM 标记+OCR+图标库→组件功能+预测点击后状态）；Stage 2 交互响应验证（**像素 diff 前置**：无变化→"UI 无响应"；再 LLM 判实际 vs 预测）。两阶段准确率 86%/召回 85%，三阶段反而下降。

**8 条工程启示**：①Rubric 二元化是人机一致的前提 ②Pass@k 是统计基线，单跑不可作门禁 ③E2E+Process 必须双轨 ④归因双路径防 reward hacking ⑤环境终态判定（文本声明≠完成）⑥LLM-as-Oracle 要任务分解（预测→验证+像素 diff 前置）⑦门禁必须嵌入 CI/CD ⑧冷启动按最小闭环（观测 L1+评测集 L1+回测 L1）。

## 2. 现状对照（锚点为 2026-10-07 代码态，全部已核实）

| 启示 | SwarmStudio 现状 | 判定 |
|---|---|---|
| ① Rubric 二元化 | JEV 有 choice/score 问题（11 个集成）但无二元化纪律、无 unknown 诊断 | **缺** |
| ② Pass@k | 无（推演单跑闸门；heldout 只回单次 passRate） | **缺** |
| ③ 双轨评测集 | 无评测集概念（heldout 是密封题库非评测集工程） | **缺** |
| ④ 归因双 Loop | review 域三裁决≈Agent Loop；无 Rubric Loop | **半缺** |
| ⑤ 环境终态 | simharness `verify_done_evidence`（mx-scenario-lib.sh:545-595，结论行 commit 必须真在 origin、tree 必含工件）成熟，但只在 harness 侧 | **半有** |
| ⑥ LLM-as-Oracle | 上游 browser-verify JEV 集成（services/browser/jev.ts:108 "judge visible evidence…met/not met/unknown"）是雏形；无预测→验证分解 | **缺** |
| ⑦ CI 门禁 | qgate 六态+vitest+harness:check 在；无行为/模型回归门禁位 | **半有** |
| ⑧ 冷启动闭环 | 观测 L1 已超额（见下）；评测集 L1 雏形；回测 L1 无 | **半有** |

**可复用地基**（评测四层数据与执行件的现状）：

- **Trajectory 层原料**：L1 messages 表（role/content/tool_calls JSON/run_marker，upstream schemas.ts:194-211）；L2 run-trace 插件（`~/.hermes/traces/<session>.jsonl`，span 级 llm/tool/subagent，overlay/custom/hermes-agent-plugins/run-trace/）；L3 trace API + cockpit RunTrace 家族视图（custom/controllers/hermes/trace.ts:555）。**轨迹已完整采集但从未被评分**。
- **Efficiency 层原料**：run_usage 表（tokens 六种/cache_hit_rate/cost_usd/model_duration/tool_duration/tokens_per_second，schemas.ts:41-63）。
- **判定后端**：clef-flash-4bit 本地主力（:8000，实测 287tok 3.3-3.6s）+ 27B 备件（:8001，异步低频）；clef-4bit 含视觉塔、clef_mlx 支持图片 data URL（五文方案 §4.5 已注明"解锁条件=明确的截图/图像判定需求"——本方案 UI Oracle 即该解锁点）；runtime/clef/ 运行手册齐备。
- **判定工程先例**：JEV sidecar（预算/幂等 attempt：input_hash+config_hash 唯一/决策落库）已在 workflow_run_quality_evaluations（schemas.ts:417）、gc_summary_reviews（:1134）两处验证；toolresultguard 域（P1a 已合 main）验证了 S0 规则预筛+S1 判定+τ 门控+TTL 缓存+熔断+JSONL 审计全链。
- **密封契约先例**：held-out-store.ts（listSets 只回元数据/score 只回聚合/每调用方每集 3 次上限/答案按 index 对齐不回显——防探测四契约，测试逐条锁定）。
- **门禁框架**：qgate 六态（PASS/FAIL/CONDITIONAL/INCONCLUSIVE/WAIVED/NOT_APPLICABLE；证据三级仅 exercised 可支撑 PASS；INCONCLUSIVE 绝不冒 PASS）+ gate-packs 16 域 + Profile 四档。
- **UI 回归原料**：scripts/regression/ 30 个 Playwright 探针（含 pixel-truth 像素真值）、observatory 观测台脚本。
- **overlay 域标准模式**：自包含 JSON store（tmp+rename 原子写、ENOENT 才按空账、_useStoreDirForTests 隔离、契约测试）。

**结论**：本域不新建任何判定基础设施，全部拼装既有稳定单元——这正是"美团范式 × SwarmStudio 零件"的拼装式开发。

## 3. 总体架构与里程碑

```
custom/server/eval/
  store.ts        数据模型 + JSON store（heldout 同模式）
  judge.ts        四步判分管线（S0/S1/仲裁/聚合）
  runner.ts       回放判分 / 密封评分 / k 次采样
  outcome.ts      环境终态校验器注册表
  uioracle.ts     M3：两阶段 UI Oracle
  controller.ts   HTTP 路由（/api/hermes/eval/*）
  __tests__/      域单测（mock 判定端，封闭测试）
custom/client/eval/
  views/          EvalSetsView / EvalRunsView / EvalReportView / EvalOracleView
  stores/eval.ts  Pinia store
  index.ts        A 类注册（路由 /app/eval + 导航）
```

里程碑（每里程碑独立分支 + 验证 + 合 main，与 run10/11 推演并行不抢工）：

| 里程碑 | 分支 | 内容 | 验收 |
|---|---|---|---|
| M1 | feat/eval-core | store/judge/runner/outcome + 域单测 | 单测全绿；全量 vitest 不回归；tsc 0 错 |
| M2 | feat/eval-workbench | client 四页 + ia2 挂载 + 11 语言 i18n + 路由 patch | dev 走查四页可用；i18n 键齐 |
| M3 | feat/eval-ui-oracle | uioracle 两阶段 + 采集链 + S0 diff + 视觉 S1 | 端到端一条用例走通预测→验证 |
| M4 | feat/eval-gates | qgate gate pack + test:eval + harness:check + RELEASE-NOTES | 门禁序列可跑；注册检查过 |

## 4. 详细设计

### 4.1 数据模型（store.ts）

store 落 `~/.hermes-web-ui/eval/eval-store.json`（env `EVAL_STORE` 可重定向，测试隔离用）。`EvalSet`/`EvalTask`/`Rubric`/`EvalRun`/`RubricIterationLog`/`UiOracleCase` 六实体，终态字段一步到位：

```ts
type Track = 'e2e' | 'process'
interface EvalSet { id; name; track: Track; module?: string; sealed: boolean; createdAt; createdBy }
interface EvalTask {
  id; setId; problem: string            // 题干/触发条件
  expectedBehavior: string              // Reference：期望行为描述（非逐字比对）
  rubric: RubricAssertion[]             // Metric：二元断言集
  outcome?: OutcomeCheckDecl            // 环境终态校验声明（可选）
  sessionId?: string                    // 回放判分时的被评 session
}
interface RubricAssertion {
  id; text: string                      // 断言文本（可判"是/否"的疑问句）
  expect: 'yes' | 'no'                  // 期望答案（expect=no 即"不应发生"，红线即此类）
  kind: 'result' | 'trajectory' | 'risk'  // 四层归属（Risk 断言一票否决）
  s0?: S0Rule                           // 可编程断言（正则/JSON 路径/阈值）——有则零判定费
}
interface EvalRun {
  id; setId; target: { profile?; model?; version? }; k: number
  attempts: Attempt[]                   // taskId × sampleIdx 平铺
  aggregates: { passAt1; passAtK; byLayer: {result;trajectory;efficiency;risk}; unknownRatio }
  status: 'running' | 'done' | 'failed'
}
interface Attempt {
  taskId; sampleIdx: number             // 1..k
  sessionId?: string
  verdicts: Array<{ assertionId; value: 'yes'|'no'|'unknown'; source: 's0'|'s1'|'human'; conflict?: boolean }>
  outcome?: { verifier: string; ok: boolean; detail?: string }
  efficiency?: { tokens; costUsd; steps; durationMs }   // run_usage 同源取数
  judgeMeta?: { backend; latencyMs; cached }
}
interface RubricIterationLog { id; runId; taskId; assertionId; verdictAtTime; finding: 'judge_wrong'|'rubric_ambiguous'; revision; createdAt; rerunRunId? }
```

防探测纪律继承 heldout：密封集（sealed=true）对外只回元数据与聚合分。

### 4.2 判分管线（judge.ts，四步对齐 WOWService）

1. **S0 确定性规则先行**：断言带 `s0` 规则（`{type:'regex', pattern}` / `{type:'json_path', path, op, value}` / `{type:'threshold', metric, op, value}`——metric 从 attempt 的 efficiency/transcript 派生）时直接机判，零判定费。S0 与 toolresultguard S0 同构：只回答"值不值得付一次判定"。
2. **S1 并行二元判定**：无 s0 的断言逐条构造判定问句（断言文本 + 期望方向 + 证据上下文：transcript 摘录/轨迹 span/终态详情），送 clef SystemOne（noul 形态：是/否/未知）。缓存键=state 指纹+问句集（toolresultguard TtlCache 模式）。**unknown 占比 > 阈值（默认 0.2）→ 聚合层产出"Rubric 下钻提示"**（文章：unknown 多说明边界模糊，继续下钻）。
3. **冲突仲裁**：S0 与 S1 同断言皆有结论且相反 → conflict 标记 + source 记双方；conflict/unknown 断言可人工裁决（`source:'human'`）。
4. **聚合**：attempt 通过 = 非红线断言全对且红线零命中且（如有）outcome 校验通过；task 级 pass@k = 任一 sample 通过即计（k 次采样统计基线，文章启示②）；run 级 pass@1/pass@k + byLayer 分层率 + unknownRatio。**Risk 层一票否决：任一 risk 断言命中（value=expect）→ 该 attempt 与整个 run 判 FAIL。**

降级：clef 不在线（/health 探活失败）→ 无 s0 的断言全部 unknown，管线不阻塞（fail-open），报告标注"判定后端离线，S0-only"。**离线态不产生门禁结论**（qgate 侧映射 INCONCLUSIVE）。

### 4.3 运行器（runner.ts）

- **回放判分**（v1 主形态，零 agent 增量调用）：输入 taskId→sessionId 映射，从 messages 表（transcript+tool_calls）与 trace L2 JSONL 取证据，逐断言走判分管线；Efficiency 从 run_usage 同源取数。补上"轨迹被评分"的最后一环。
- **密封集评分**：sealed 集复用 heldout 契约（每调用方每集尝试上限、只回聚合）。
- **k 次采样**：同 task 提交 k 个 sample（v1=人工指定 k 个 session/重复判定）；live 触发 agent 重跑（chat-run 面触发）后置——回放形态先行，接口按 k 设计不锁死。
- 单跑结果不产生门禁结论（启示②）：`aggregates` 在 k<2 时标注 `statisticallyInsufficient: true`。

### 4.4 Outcome 校验器（outcome.ts，注册表模式）

```ts
interface OutcomeCheckDecl { verifier: 'file_exists'|'content_contains'|'repo_commit_on'|'kanban_card_status'; params: Record<string, string> }
```

- `file_exists` / `content_contains`：safe-file-store 白名单内路径（安全面沿用既有 allowlist 机制）。
- `repo_commit_on`：移植 simharness `repo_has`（origin/main 存在性 + 新鲜度窗口 ≥ run startedAt，防旧稿假真值）与 `branch_fresh`（branch_fresh 语义：tip 时间 ≥ 起跑时刻）。
- `kanban_card_status`：经 studio kanban API 查卡状态字段。
- 注册表开放扩展；run12 图执行推演的六闸后续可迁此（推演模式=产品模式路线）。

### 4.5 归因双 Loop（防 reward hacking 的结构性机制）

报告页 bad case 两键归因：「Agent 问题」→ 既有 review 域流程；「Rubric 判错」→ 写 RubricIterationLog（finding=judge_wrong/rubric_ambiguous + 修订）→ 修订后同集重跑 → runId 关联对比。**管线约束：带 conflict/unknown 的 attempt 未走 Rubric Loop 确认前，其断言修订不可合入 sealed 集**（防止"改题凑分"——这正是只走 Agent Loop 会拟合评测分布的结构性阻断）。

### 4.6 LLM-as-Oracle UI 测试（uioracle.ts，M3，对齐 KuiTest 两阶段）

- **Stage 1 可供性预测**：输入=截图（PNG data URL）+ DOM/a11y 树文本投影 + SoM 序号标记（复用 scripts/regression/ 截图链，Playwright `locator` 枚举打标）→ clef 视觉判定输出：目标组件功能描述 + 预测交互后 UI 状态（结构化 JSON）。
- **Stage 2 响应验证**：执行动作→**像素 diff 前置**（帧差为零→"UI 无响应"缺陷，零判定费）→ DOM 态 diff（S0：元素树/文本/aria 变化集）→ clef 视觉判定"实际响应 vs 预测响应"（S1，两帧图片 data URL 对照）。
- 判定接入复用上游 browser-verify JEV 模式（met/not met/unknown 三态）。
- **内存纪律**：视觉判定走 flash 档；图片输入按需、单帧 ≤4k token 等价；不与 27B 并跑（五文方案 §6 纪律继承）；clef 离线→S0-only（像素/DOM diff）+ 预测阶段 unknown，fail-open。

### 4.7 CI 门禁集成（M4，启示⑦）

- qgate gate pack `behavior/eval-regression.yaml`：指定评测集（默认回归集）在门禁序列执行，pass@k ≥ 阈值→PASS；< 阈值→FAIL；判定后端离线或 k<2→INCONCLUSIVE（绝不冒 PASS）。
- `npm run test:eval`：跑默认回归评测集（离线回放形态，CI 友好）。
- **落地偏差（M4 收口记录）**：原计划"注册进 scripts/harness-check.mjs 检查清单"——该脚本是 upstream 资产（扩展须新增 B 类 patch），按 A 类优先纪律收敛为 **qgate 链内注册**：gate pack 入库（behavior.* 通配自动纳管 feature-close/high-assurance 两 profile）+ 回归门观察面测试（含红线负例守门）+ 观察文件证据链。评测域自带回归测试 44 例即为"新能力必须带回归测试"契约的满足面。

### 4.8 工作台前端（M2）

- 路由 `/app/eval`（ia2 家族，registerRoute/registerNavEntry A 类注册；features.ts 加 `eval` 开关默认关，`VITE_CUSTOM_EVAL=true` 再开）。
- **评测集页**：双轨（E2E/Process）列表、新建/导入导出 JSON、二元 rubric 编辑器（断言增删、expect 方向、risk 标记、s0 规则挂载）、unknown 诊断徽章（历史 unknownRatio）。
- **运行中心页**：发起运行（选集+target+k+session 映射）、进度、pass@k 聚合。
- **报告页**：四层卡（Result/Trajectory/Efficiency/Risk，Risk 一票否决显式呈现）+ 断言级明细（verdict 来源徽章 S0/S1/人工/conflict）+ 归因双 Loop 双按钮 + Rubric 迭代历史。
- **UI Oracle 页**（M3）：用例管理 + 两阶段结果（预测 vs 实际对照帧 + 像素/DOM diff 高亮）。
- i18n：模块内独立词条文件（zh/en 双表 + 组件按 locale 选表）——governance 域同款先例，不动 patch 473 的 locale 单一事实源面；其余 locale 经 vue-i18n en 兜底。M2 落地口径（原计划"11 语言 add-i18n-keys"据此收敛，键齐平由测试锁定）。
- server 路由挂载走 1 条 patch（patch 452/558 既有挂载模式：bootstrap/routes.ts 追加 controller）。

## 5. Non-goals（本可做但不做）

- **在线三阶段灰度（Shadow/AB）**：单机桌面产品无真实流量分层；Probe 巡检形态由 M4 的回归评测集定时回测近似。
- **κ 标注者间一致性监控**：需多人标注数据；单机先留 unknown 诊断（文章同源信号），κ 后置。
- **自动 Rubric 下钻生成**：下钻是人的判断，自动生成断言后置。
- **live k 次重跑触发**（chat-run 面触发 agent 重跑）：接口按 k 设计，实现后置。
- **跨仓评测集市场/共享**：不做。
- **美团基准矩阵（AJ-Bench 等）接入**：外部 benchmark 的本地化接入不在本轮，评测集 schema 兼容导入即可。

## 6. 风险

- **patch 面**：series 已 494 行，本域新增 1-2 条（路由挂载+可能的 nav），按 A 类优先原则控制。
- **判定后端依赖**：clef 版本三元组锁定纪律继承（mlx 0.32.3/mlx-vlm 0.7.6/快照日期，升级须过样本回归）；离线降级 S0-only 且门禁映射 INCONCLUSIVE。
- **内存共存**：flash 常驻 7-8.6GB；UI Oracle 视觉输入按需；不与 27B 并跑；不新增本地模型。
- **取数同源**：Efficiency 必须从 run_usage/messages 同源取（P3 治理面板同此约束，run9 报告一致性残余 P17-P22 教训——另起炉灶会对不上账）。
- **测试封闭性**：判定端 mock/关闭端口，不依赖真端点存活（五文方案 §6 当晚实锤教训）；shell 管道吞退出码的坑用显式 `$?` 核验。
- **"改题凑分"**：Rubric Loop 的结构性约束（§4.5）必须有测试锁定。

## 7. 执行纪律

每里程碑：overlay 仓 main 拉分支（feat/eval-*）→ 实现 → 域单测 + 全量 vitest 不回归 + tsc 0 错 → `npm run dev`（:8649）热更新走查（不装机）→ 合回 main → RELEASE-NOTES 记轮。M4 收口后按 qgate 门禁序列全量复跑。
