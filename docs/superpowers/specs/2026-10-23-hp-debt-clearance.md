# HarnessPro 吸收轮挂账清偿（2026-10-23）

## 背景

上轮《HarnessPro×Harness 十一坑双文吸收轮》（spec: 2026-10-23-harnesspro-harness-pitfalls-absorption.md，
main 72fd2978）落地七机制后挂账四项 + 一项文档同步。用户指令「完成挂账」。本 spec 即清偿批。

| # | 挂账项（上轮决策记录原文） | 本轮落点 |
|---|---|---|
| G1 | 合成测试生成器（论文四 Agent 之一，需真实判定端联调） | `eval/synthesize.ts`：经既有 clef choice 通道（clefAskMixed）让判定端为指定考卷任务**提案 S0 确定性规则**（regex/threshold/required_tools/no_loop/redundant_ratio 白名单），结构化校验后返回草稿——不自动并入考卷，人工经既有 rubric 修订端点采纳（与红队种子同一人工闸纪律）。fail-open：判定端离线/响应不可解析 → ok:false 如实返回，不造数。端点 `POST /sets/:id/tasks/:taskId/synthesize`（密封集拒绝）。采纳后的校准读数由上轮 HP-6 judgeCalibration（失败召回）承接，不重复建 |
| G2 | 动态路由五档分类器（任务分发路径改造） | `goalbudget/task-router.ts` 纯函数：TaskFacts（有界性/不确定项数/本地判定源强度/可分辨假设数/多源重建/源不可达/单次评估代价等结构化事实）→ 按 HarnessPro profile_rubric 门序（compact→research→deep→lean→standard，证据规则逐门拷贝）选档；PROFILE_PRESETS 给五档 reasoningEffort+阶梯阈值（比例旋钮，接上轮 stage-ladder）。**不做自由文本分类**（rubric 本就是证据门序，不是文本理解）；端点 `POST /api/harness/task-router` 供分发侧/SIM 复用 |
| G3 | 企业级约束评测场景（误区十一） | `eval/enterprise-seed.ts`：三轴种子库（权限边界/长周期交互/行业合规）×各 3 任务，可机械判的配 S0（敏感路径 regex/PII 特征/required_tools），语义级留 S1；幂等建集端点 `POST /sets/enterprise-seed`（红队种子同款）。附 `axesCoverage()` 纯函数：按任务→轴映射出三轴覆盖读数（缺轴如实列 gap），供集健康检查复用 |
| G4 | Harness 组件退役检测（误区九「拆墙」侧） | `workbench/loop.ts` `retirementCandidates()` 纯函数：进化时间线上「采纳时增益 ≤0 且成本上涨」的冠军轮，且其后 ≥2 个已采纳轮未被纠正 → 列退役候选（advisory，人裁决——零触发≠无用，只提示复核）；EvolutionReport 新增 `retirementCandidates` 段；面板进化区新增提示行 |
| G5 | 设计总账 specs 计数未同步 | swarmstudio-design-ledger.md 数字按 `ls docs/superpowers/specs/*.md | wc -l` 实测重算并注明口径 |

## 设计决策

1. **G1 提案不自动生效**：合成产物是 S0 规则草稿（带 rationale 与被拒原因），采纳走既有
   `POST /sets/:id/tasks/:taskId/rubric` 修订路径（人工+改版留痕）——评测集是资产
   （百度轮 B1 纪律），LLM 只提案不改卷。反偏置延续：合成问句只带断言文本不带 expect。
2. **G1 校验面**：断言 id 必须在考卷内；规则 kind 白名单六种；regex 必须可编译且 ≤512 字符
   （防灾难回溯长模式）；threshold op/值域、ratio (0,1] 逐项校验；不可解析条目进 rejected
   留痕，不静默丢弃。
3. **G2 只做事实→档位，不做文本理解**：HarnessPro rubric 的本质是「可观测任务特征」的
   门序决策（其 classifier 也是 rubric 驱动），本仓以结构化 TaskFacts 承接，调用方
   （分发侧/探针）负责从任务描述归纳米成事实——诚实边界，不宣称自动理解自然语言。
4. **G2 预设是本仓实例化**：论文未公开各 profile 阈值全表（仓库 TB2 medium 恰有五档完整
   表，本仓按其比例关系实例化为 stage-ladder 分数旋钮，文档标注来源与实例化性质）。
5. **G3 内容纪律**：任务 problem/expectedBehavior 全部写可验证的具体场景（非口号）；
   risk 断言 expect='no' 复用既有红线校验；三轴各至少 1 条 S0 机械判。轴覆盖函数按
   显式映射表（种子模块导出 ENTERPRISE_TASK_AXES），不做关键词臆断。
6. **G4 advisory 而非 blocker**：退役判定语义上是「值得人复核」，零触发可能是守卫在
   起作用——只列证据（采纳增益/成本变化/后续轮数），不自动回滚不硬拦。
7. **门禁与回归**：全部新增代码进 typecheck:harness 清单；G1/G3 端点遵循既有 controller
   错误形制（400/404/{ok:false,problems}）。

## 验证计划

- `synthesize.test.ts`：问句形状（含任务契约、不含 expect）、choice 应答解析（裸 JSON/
  围栏/坏 JSON）、规则校验六 kind 全分支（合法/越界/坏 regex/未知断言/未知 kind）、
  fail-open（JudgeUnavailableError → online:false）。
- `task-router.test.ts`：五档门序命中（compact 视觉隐藏态/research 多源/deep 强 oracle+
  假设空间/lean 有界双不确定内/standard 兜底与 costlyEvaluations 降档）、预设阈值合法
  （复用 thresholdsValid）。
- `enterprise-seed.test.ts`：任务数与三轴齐备、每轴 ≥1 条 S0、risk 断言 expect 全 'no'、
  axesCoverage（全轴覆盖/缺轴 gap）、幂等建集。
- workbench 测试：retirementCandidates（增益≤0∧成本涨∧后续≥2 轮命中/增益>0 不命中/
  轮数不足不命中）、evolutionReport 新段透出、面板提示行渲染。
- 全量：受影响域 vitest + typecheck:harness rc=0 + ts-node 起服 + 8649 走查
  （synthesize 端点 fail-open 形态 / 面板退役提示缺省不渲染）。

## 决策记录

- 2026-10-23 挂账清偿批立项：用户指令「完成挂账」。G1-G5 全做；上轮 spec 决策记录中
  挂账四项全部收口。在途 worktree 已达 3 上限，依用户显式指令放宽新建（§0.1 优先级）。
- G1 复用 clef choice 通道承载结构化生成（uioracle 先例），不新开判定协议。
- G2 五档阈值以 HarnessPro 仓库 TB2 medium policy.json（唯一公开全表）的比例关系实例化，
  已在模块头标注。
