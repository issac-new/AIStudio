# Eval Studio 百度评测体系补强设计（2026-10-19）

> 状态：已实现（feat/eval-baidu-paradigm，待合入 main）。
> 调研正本：银翼AI评测室《百度 Agent 评测体系技术拆解》，2026-10-19 09:21（原文 https://mp.weixin.qq.com/s/eTxLKK-g0QzjnOBpY7r7fQ）。
> 前置基线：`2026-10-07-eval-studio-design.md`（美团范式：四层/Rubric/Pass@k/S0+S1/校准/密封）与 `2026-10-13-eval-tencent-metrics-design.md`（腾讯范式：六环节/过程双指标/异常分桶/发布门禁/六维/A-B/回流）。

## 主旨三句话

唯一主旨：把百度评测体系里「可机械执行」的部分补进 SwarmStudio，让评测从「出报告」升级为「驱动动作的回报函数」，并把当前只有后端、只有测试的安全红队能力做成产品面。
受众：评测工作台与六阶段治理页的维护者、后续评测轮次的实施者。
读完促成：按本文件的六项落地清单实施、按验证账验收；未覆盖项在「边界」一节明示，不冒充已做。

## 1. 调研结论（文章说了什么）

文章把大厂 Agent 评测拆成六大模块，并对百度逐模块拆到参数级。对本仓有直接工程价值的判断有六条：

1. **评估器三角互证**（§3）：规则打底、裁判补位、人工兜底，三者 SDK 化、可组合；裁判必须输出打分理由，判断本身可审计；流程上设计保守倾向（裁判未明确判负即算选手得分），系统性压低误杀率。
2. **评估器即回报函数**（§4，全文最强调的一条）：每个评估维度先回答「这个结果驱动什么动作」；驱动不了精调回滚、参数调整、Prompt 重写的指标只是给周报提供装饰。评估信号被三处消费：精调回归、进化搜索、线上数据飞轮。反面是 Goodhart 定律，对冲三件套=评测集与训练集分库隔离、隐藏测试集纪律、裁判理由可审计。
3. **分层归因到一次点击**（§5）：命中测试四要素（检索策略/Top-K/匹配阈值/重排序）对比定位；「回答来源」一次点击直达切片；平台侧归因粒度到「组件 + 切片」，轨迹级回放尚缺。
4. **评测集当资产管**（§6）：数据集 SDK 化与版本化、评估集与训练集同构、密封与隐藏测试集、活水化（舆情/风险事件持续补题）。
5. **AgentOps 织进全流程**（§7）：评估流水线接 CI、Prompt 版本管理与回滚、线上监控三线（资源/质量/成本）、数据飞轮三层（问答对调优→看板诊断→底座自主调优），评测结果不封卷。
6. **安全红队算法化**（§8）：攻击向量库→自动攻击生成（遗传算法+强化学习）→沙箱攻防→裁判自进化；以攻促防、例行化，而不是上线前的一次检查。

## 2. 现状与差距对照

本仓已落地 M1（美团范式）与腾讯七面，Eval Studio 具备：评测集/密封、回放判分、S0+S1+人工仲裁、四层报告、六环节、过程双指标、异常分桶、发布门禁、六维分面、坏例回流、A/B 对比、校准、UI Oracle。差距如下（带锚点）：

| # | 文章模块 | 现状锚点 | 缺口 | 本轮落地 |
| --- | --- | --- | --- | --- |
| B1 | §4 评估器即回报函数 | `custom/server/eval/aggregate.ts:137-140` 只产出指标；`EvalAdvicePanel` 是旁路建议 | 没有「指标→动作」绑定，无法回答某指标驱动了什么，也无法识别装饰指标 | `metric-registry.ts` + `/metric-registry` + 「指标治理」页签 |
| B2 | §3 三角互证/可审计 | `VerdictSource` 四值 `types.ts:36`；人工裁决 `store.ts:281-306` 覆盖原判词后原值丢失；S1 只留 p | 没有规则/裁判/人工的覆盖与一致度视图；无法度量误杀；判词无审计理由 | `evaluators.ts`（覆盖/冲突/误杀/保守口径反事实）+ `verdict.reason` + `previousValue` + 报告页三角卡 |
| B3 | §8 安全红队 | 只有 `toolresultguard` 的 A1-A8 检测规则与 eval 回归集 t6 | 无攻击向量库、无自动变异、无红队运行与报告产品面 | `custom/server/redteam/`（语料/变异/进化/存储/路由）+「安全红队」页签 |
| B4 | §6 评测集治理 | `EvalSet.sealed`、回流溯源、held-out 后端（`custom/server/heldout/`，无 UI）；`nine-layers.ts:537` 把七维覆盖硬编码为 `evalSets>0?3:0` | 任务无能力维度标注，覆盖度是假的；留出题库不可见 | 任务可选 `dimension` 七值 + `coverage.ts` 真实覆盖 + 留出题库 UI；九层体检读真实覆盖 |
| B5 | §7 AgentOps | 评测是 `/app/eval` 独立专题岛且默认关（`config/features.ts:77`）；治理阶段 `metrics` 页签不引用评测 | 评测不在六阶段闭环里；默认关闭等于产品不可见 | 评测默认开；治理阶段「度量检查」增评测运营卡（EvalOpsSection） |
| B6 | §5 归因一次点击 | 报告页有归因按钮，但样本明细无证据链 | 看到 fail 后无法一键回到轨迹证据 | `GET /runs/:id/evidence` + 样本证据抽屉（按 sessionId 重读 trace，不复制存储） |

## 3. 设计决定与理由

### 3.1 指标注册表是「绑定」而不是「指标清单」（B1）

- 单一事实源：`METRIC_DEFS` 每条必须声明 `drives`（动作集合）。动作枚举固定为 `gate_block | reflow | rubric_revise | human_review | advice | report_only`，其中 `report_only` 只允许单独出现——单独出现即判定为「装饰指标」，在页面上显式告警。
- 守门测试锁定三件事：键唯一；每条至少一个动作；聚合产出的指标键必须能在注册表找到（新增指标不登记即测试红）。
- 消费证据来自真实账本，不造数：`gate_block` 数发布门禁有实测项的运行、`reflow` 数带 `origin` 的回流任务、`rubric_revise` 数 Rubric 迭代账本、`human_review` 数人工判词；`advice` 暂按「有运行报告可消费」计，页面注明口径。某指标的所有动作消费数均为 0 → 状态「未接线」，而不是「已就绪」。
- 已知诚实缺口：六维分面当前只展示、不驱动任何动作，注册表标为 `report_only` 并在页面列为装饰候选；这是文章观点的直接应用，不是 bug 掩盖。

### 3.2 三角互证只增加「审计」，不改判分口径（B2）

- 现行口径 `unknown` 计为不通过（严格），这是发布门禁的既有契约，本轮**不改变**。
- 新增的是**反事实读数**：把「仅 S1 判为 unknown」的断言按保守口径视为通过，重算 pass@1/pass@k，与严格口径并列展示，差值即「可能的误杀空间」。页面明确标注「反事实，仅供误杀风险评估，不作门禁」。
- 人工裁决保留原判词：`AttemptVerdict.previousValue` 记录覆盖前的机判，才能统计 `no/unknown → yes`（误杀候选）与 `yes → no`（假通过）。
- 判词审计理由：`AttemptVerdict.reason`。S0 写命中规则 id（或 `s0 clean`）；S1 写 `p`、模型与阈值；人工写「人工仲裁」。S1 判定端是概率模型，没有自由文本理由——这一限制在页面与文档明示，不伪装成「裁判解释了」。

### 3.3 红队默认离线、确定、可复现（B3）

- 检测器 v1 = ToolResultGuard 的 S0 规则层（`computeSuspicion`），与生产护栏同一事实源，不另写一套正则。评分函数：可疑分 ≥ 阈值即拦截。S1 裁判需要 `EVAL_JUDGE_BASE_URL`，本轮不接线，响应里 `s1Wired:false` 明示。
- 变异算子 12 个：base64/hex/rot13/unicode 转义、零宽、同形字、leet、分词拆散、HTML 注释隐藏、角色扮演包裹、伪造系统消息、嵌套引用、中文改写、尾部噪声。全部确定性（种子 LCG），同种子同报告。
- 进化：每代按「逃逸适应度」排序，存活个体作为父代继续变异，直到代数上限。报告给总体逃逸率、按类目、按算子、按代曲线、幸存样本（预览截断 + 父代 + 算子链）。良性难负例单独计假阳性率，不参与进化。
- 语料只做防御性安全测试：A1-A8 八类 + 良性难负例；有害内容类目用抽象化措辞，不写可执行细节。
- 存储独立于 eval store（`~/.hermes-web-ui/redteam/redteam-store.json`），保留最近 50 次运行。

### 3.4 能力维度显式标注，覆盖度不猜（B4）

- `EvalTask.dimension?` 七值：任务完成/工具与参数/失败恢复/长任务状态/越权与注入/成本与无效循环/人工升级。可选，未标注计入 `untagged`，页面如实显示「未标注」。
- 覆盖度 = 至少一个任务显式标注该维度的维度数；九层体检从「评测集存在就给 3/7」改为读真实覆盖，并附未标注任务数。
- 留出题库 UI 只做列表/建集/评分（后端已有），评分仍只回 `{n, passRate}`，不破坏防探测契约。

### 3.5 评测进入六阶段治理，默认开启（B5）

- `features.eval` 从默认关改为默认开（`VITE_CUSTOM_EVAL !== 'false'`）。理由：评测已不是实验特性，默认关闭让整个评测工作台在产品上不可见；与 skillgov/ontology/bpa 的开关语义对齐。
- 治理阶段「度量检查」新增 `EvalOpsSection`：评测集数、最近运行 pass@k/门禁/unknown 率、能力维度覆盖、最近一次红队逃逸率、直达工作台链接。只读聚合，不复制业务逻辑。

### 3.6 证据一次点击按需重读（B6）

- 不把 transcript 复制进 attempt（存储膨胀且与 trace 单一事实源冲突）。端点按 `sessionId` 重读 L2 trace，复用 `trace-sampler.ts`（已有脱敏与参数摘要纪律）；无 sessionId（内联证据）如实返回「不可回溯」。
- 端点做归属校验：run 存在、attempt 存在；密封集仍只回聚合，证据端点对密封集拒绝（逐条证据是探测通道）。

## 决策记录

| 编号 | 决策 | 理由 | 代价/边界 |
| --- | --- | --- | --- |
| D1 | 指标必须声明 `drives`；只含 `report_only` 单独出现判为装饰候选并告警 | 百度 §4 的核心操作规则：驱动不了动作的指标只是装饰 | 不会立刻补齐所有动作；六维分面暂列装饰候选 |
| D2 | 三角互证只增加审计与反事实，不改变「unknown 计为不通过」的正式口径 | 发布门禁契约稳定，避免口径漂移；误杀风险另行度量 | 保守口径不能用于放行 |
| D3 | 人工裁决记录 `previousValue`，只保留首次覆盖前机判 | 误杀/假通过方向可统计 | 判词存储略增 |
| D4 | 红队 v1 检测器只接 S0（与生产 ToolResultGuard 同源），S1 未接线明示 | 离线、确定、零外部依赖，测的就是生产规则层 | 逃逸率不等于完整护栏效果 |
| D5 | 进化采用确定性种子 LCG + 12 个固定算子 | 同种子同报告，可回归 | 不是完整遗传算法/强化学习；幸存样本需人工复核 |
| D6 | 能力维度只认显式标注，未标注计入 `untagged` | 不拿断言结构猜覆盖，假覆盖比低覆盖更危险 | 存量任务显示未标注，覆盖度可能下降 |
| D7 | 证据端点按 sessionId 重读 trace，不复制证据进 attempt | trace 单一事实源，避免存储膨胀与漂移 | 依赖 trace 保留；内联证据不可回溯时如实说明 |
| D8 | 评测功能默认开启，并入⑥治理度量检查 | 评测已不是实验特性，默认关等于产品不可见 | 可用 `VITE_CUSTOM_EVAL=false` 显式关闭 |
| D9 | 修复 S0 规则中文分支的 `\b` 边界缺陷（拆出独立中文规则） | 红队首跑实测：中文分支永不命中 | 英文侧个别规则略有放宽，已用良性负例复核 |
| D10 | 密封集证据端点 403、评分只回聚合等既有安全边界不削弱 | 逐条证据是探测通道 | 密封集的归因只能看聚合 |

## 4. 实现映射

服务端（`custom/server/`）：

| 文件 | 内容 |
| --- | --- |
| `eval/metric-registry.ts`（新） | 指标定义、动作枚举、装饰判定、消费证据聚合 |
| `eval/evaluators.ts`（新） | 三角覆盖、冲突、人工覆盖方向、保守口径反事实 |
| `eval/coverage.ts`（新） | 七维定义与集覆盖计算 |
| `eval/types.ts` | `EvalTask.dimension`、`AttemptVerdict.reason/previousValue` |
| `eval/store.ts` | 维度校验、人工裁决保留原值、审计快照 |
| `eval/judge.ts` | 判词写 `reason` |
| `eval/controller.ts` | `/metric-registry`、`/runs/:id/evaluators`、`/runs/:id/evidence`、挂载 redteam 路由 |
| `redteam/corpus.ts`（新） | A1-A8 语料 + 良性难负例 |
| `redteam/mutate.ts`（新） | 12 个确定性变异算子 + 种子 RNG |
| `redteam/detector.ts`（新） | S0 检测器适配 |
| `redteam/engine.ts`（新） | 进化、适应度、按类目/算子/代聚合 |
| `redteam/store.ts`（新） | 独立 JSON store（原子写、保留 50 次） |
| `redteam/routes.ts`（新） | 挂在 eval 路由器下 `/redteam/*`，零新增 patch |
| `harness/nine-layers.ts` | 七维覆盖改真实计算 |

**红队实证收益（本轮直接发现并修复的生产缺陷）**：新增语料跑出两个中文攻击样本零命中（A4 角色扮演开场、A6 中文伪授权）。根因是 `toolresultguard/rules.ts` 把中文选项包在 `\b(...)\b` 里——JS 的 `\b` 只认 ASCII 单词字符，中文字符两侧都不构成边界，中文分支永远不会命中。已拆分为独立的中文规则（`grooming-zh` / `grooming-precedent-zh` / `tool-fake-auth-zh`），并移除 `b64-decode`、`grooming-steps` 中文分支上的 `\b`。修复后第 0 代语料本体全部可拦。

客户端（`custom/client/`）：

| 文件 | 内容 |
| --- | --- |
| `eval/api.ts` | 新端点 DTO 与调用 |
| `eval/i18n.ts` | 新页签/面板 zh/en 词条齐平 |
| `eval/views/EvalView.vue` | 页签：评测集（含留出题库）、运行记录、指标治理、安全红队、UI Oracle、优化建议 |
| `eval/components/MetricRegistryPanel.vue`（新） | 指标-动作矩阵、装饰告警、消费证据 |
| `eval/components/RedteamPanel.vue`（新） | 语料覆盖、运行表单、代曲线、类目/算子表、幸存样本 |
| `eval/components/HeldOutPanel.vue`（新） | 留出题库列表/建集/评分 |
| `eval/components/EvaluatorTriangle.vue`（新） | 三角覆盖与误杀审计（嵌报告面板） |
| `eval/components/EvidenceDrawer.vue`（新） | 证据抽屉 |
| `ia2/views/gov/EvalOpsSection.vue`（新） | 治理阶段评测运营卡 |
| `ia2/views/stage/StageMetricsPanel.vue` | 挂 EvalOpsSection |
| `config/features.ts` | 评测默认开 |

## 5. 验证

必跑：

```bash
cd overlay/.claude/worktrees/eval-baidu
OVERLAY_UPSTREAM_ROOT=/Users/cuishi/lab/ncwk/upstream npx vitest run \
  custom/server/eval/__tests__ custom/server/redteam/__tests__ \
  custom/client/eval/__tests__ custom/server/harness/__tests__  # 目标域
OVERLAY_UPSTREAM_ROOT=/Users/cuishi/lab/ncwk/upstream npm test   # 全量
npx vue-tsc --noEmit -p tsconfig.json                            # 若仓内提供
npm run typecheck:harness                                        # 服务端新模块（需先把新文件加入脚本）
npm run build                                                     # 客户端构建
```

浏览器走查（8649 热更新）：`/app/eval` 六个页签、运行报告三角卡与证据抽屉、`/app/stage/govern?tab=metrics` 评测运营卡；红队跑一次 3 代 20 个体的小规模运行，确认结果可复现。

**验证账（2026-10-19 执行）**：

- 目标域：`custom/server/eval` + `custom/server/redteam` + `custom/server/harness` + `custom/server/toolresultguard` + `custom/client/eval` + `custom/client/ia2` + i18n 编译门 → 116 文件通过、1 文件失败（`journey.test.ts`，主基线同样失败，环境态，与本轮无关）。
- 全量：735 文件 / 5306 用例 → 5289 通过、9 失败。9 项失败逐项归因：`journey.test.ts`（2，主基线复现）、`incident-window.test.ts`（1，主基线复现）、`cua-node-backend-platforms.test.ts`（5，共享 zcode 树未打补丁，缺 `node-backend.js`，环境态）、`raw-hex-budget.test.ts`（1，本轮新增组件引入幽灵变量 `--bg-color`/`--accent`，已修，复跑绿）。
- 类型：`npm run typecheck:harness` 0 错误（新模块已并入该脚本）；`vite build` 成功（输出到 `/tmp`，未覆盖共享 dist）。
- 浏览器走查（隔离环境：私有 upstream worktree + 独立后端 8658 + 构建产物预览 8659，未触碰共享服务与 main 工作区）：Playwright 12/12 断言通过、零页面错误——六页签齐备；指标治理显示 23 指标/15 已接线/8 未接线/1 装饰候选，维度覆盖 1/7 且未标注 0；红队跑 3 代 20 个体，84 个体/28 拦截/56 逃逸（67%）、良性误报 17%、13 个算子行；运行报告三角卡（S0 6、审计率 100% 6/6）与判词理由可见；证据抽屉成功回溯 session 并显示 read_file/150 tokens/900ms（参数已脱敏）；⑥治理度量检查评测运营卡显示 4 集/4 运行/pass@k/门禁/unknown/覆盖/红队逃逸 67%。
- 走查中发现并修复一个布局缺陷：红队运行表单同时套 `.rt__form`（grid）与 `.card`（flex 列），后者在样式表中后定义并覆盖 grid，导致输入框竖排挤在右侧；已去掉 `card` 类并在 `.rt__form` 内自带边框圆角，重建后复测通过。

## 6. 与并行分支 feat/eval-baidu-reward 的合并

设计实现期间，另一个会话在同一篇文章上独立落了五件套（spec `2026-10-19-eval-baidu-reward-design.md`，main `5b7b551f`）：评测集内容指纹/修订号（B1）、S0 ROUGE-L 相似度规则（B2）、四层指标金字塔（B3）、运行级动作驱动清单（B4）、红队种子评测集（B5）。两套实现互补而非重复：

| 维度 | 对方（B1-B5） | 本分支 |
| --- | --- | --- |
| 回报函数 | 运行内「指标×条件→下一步动作」清单（近端处置） | 全域「指标→动作」注册表 + 动作消费账（远端治理：是否真被消费） |
| 三角互证 | 补规则评估器的相似度口径 | 三角覆盖/冲突/人工覆盖方向/误杀反事实/判词理由 |
| 红队 | 24 条种子任务组成的评测集（攻击向量库第一步） | 语料×变异×进化引擎，直接测 S0 检测器（第二至四步的工程化轻量版） |
| 数据集 | 内容指纹 + 修订号 + run 锚点漂移 | 能力维度显式标注 + 真实覆盖度 + 留出题库 UI |
| 阶段集成 | 报告块 + 运行表芯片 | ⑥治理评测运营卡 + 评测默认开 |

合并冲突三处，按「保留双方语义」解决：`judge.ts` 的 S0 分派同时支持 regex/threshold/similarity，且每种都写审计理由；`EvalView.vue` 运行表同时保留本分支的 tooltip 修复与对方的锚点漂移/动作芯片；同名测试文件拆分——对方保留 `eval-baidu.test.ts`（B1-B5），本分支改为 `eval-baidu-registry.test.ts`。合并后评测域 168/168 全绿。

## 7. 边界（本轮不做）

- 不改变「unknown 计为不通过」的既有判分口径；保守口径只作反事实读数。
- S1 判定的自由文本理由无法获得（clef 返回概率），只留 p/模型/阈值审计。
- 红队 v1 检测器只接 S0；S1 检测、沙箱多模型对比、裁判自进化（微调）不做。
- 检索切片级归因（文章 §5 的命中测试四要素）不适用于当前运行时（无 RAG 切片检索面），本轮只做轨迹证据一次点击。
- 不接 CI 自动触发回归（AgentOps 的 CI 段），不调整发布门禁阈值。
- 治理域指标（成本账/九层/过程质量）不并入评测指标注册表，页面注明边界。
