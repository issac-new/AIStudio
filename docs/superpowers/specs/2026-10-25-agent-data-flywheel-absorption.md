# AI Agent 数据飞轮吸收轮（Bad Case → 三种资产 → 通过率门）

- 日期：2026-10-25
- 状态：已落地（本轮）
- 源文：《AI Agent 数据飞轮：让每个 Bad Case 自动长成资产》——银翼AI评测室，2026-10-25
  https://mp.weixin.qq.com/s/LNuVNow63FTwls8RJZhM9Q
- 关联正本：`2026-10-21-production-trace-eval-reflow.md`（失败回流主干）、`2026-10-19-review-governance.md`（合入门）、eval 域设计 `2026-10-07-eval-studio-design.md`

## 变更

源文主张一套四环飞轮：捕获网（三卡点断言+上下文快照+双裁判）→ 资产提炼（回归用例/动态 Few-shot 记忆/反事实合成变体）→ CI 红线（k 次采样容忍度+三类变更全量回放+一票否决）→ 文化转向（错误转化率考核）。逐环对账后，本轮只落**仓内确有缺口**的三件：

1. **坏例五要素自动提炼**（`custom/server/eval/badcase-distill.ts`）：失败 attempt → 根因分类 → 禁忌动作 → 步数红线（失败步数+2）→ 组装成可二值裁决的回归任务，一键入回归库（幂等）。此前回流转题需人工写全题面/rubric（trace-reflow 的 `task` 字段由调用方给全）。
2. **反事实五维变体扩产**（`custom/server/eval/badcase-variants.ts`）：以回归库坏例为蓝本，按源文五维（同义口语化/噪声注入/边界突破/隐式意图/多意图混杂）确定性改写，每蓝本 10 变体，幂等追加。此前变体基建（redteam-variants）父本全是红队种子，从未服务过生产坏例。
3. **飞轮读数与通过率退化门**（`custom/server/eval/flywheel.ts`）：独立台账登记提炼/变体记录；转化漏斗读数（捕获→回流→变体→修复关闭）；对回归库最新 run 按「任务粒度 k 次采样通过率<80% 判历史 Bug 复现」出一票否决门——补上仓内只有 pass@k 宽容口径、无阈值执法口径的缺口。

配套：eval controller 三个新端点（`POST /badcase/distill`、`POST /badcase/variants`、`GET /flywheel`，零新 patch，挂进已挂载 controller）；metric-registry 登记 `error_conversion_rate`、`badcase_pass_rate_gate`；Eval Studio 新增「数据飞轮」页签（漏斗+根因分布+门读数+变体批量扩产按钮）。

## 现状对账（源文机制 × 仓内既有能力）

| 源文机制 | 仓内现状 | 本轮处置 |
|---|---|---|
| 工具调用前断言（非法 JSON/危险 SQL/越界路径） | 越界路径/危险命令/敏感外发成链（enforce-gate/sequence-guard/secguidance）；schema 校验器写好未接线 | 不动（属工具管线域，非本轮） |
| 检索生成后相关性断言 | 基本空白 | 不动（检索非主链路，挂账） |
| 死循环熔断（8 轮无进展/两工具横跳） | runaway_guard 六信号全覆盖+loop 熔断 | 已有，不动 |
| 拦截瞬间上下文快照 | run-trace error-full 全量保留+incident 17 要素 | 已有，不动 |
| 双重裁判（硬断言+LLM 分段打分，失败放行） | eval 四步管线+toolresultguard 三段 τ，fail-open 三处齐备 | 已有，不动 |
| 回归用例自动提炼（五要素+根因+步数红线） | 回流需人工写全题面 | **本轮落地（件 1）** |
| 动态 Few-shot 向量记忆（相似度召回） | 无向量库基建；expcandidates 受控注入（时间序封顶 3 条） | 挂账（无 embedding 基建，不造） |
| 反事实五维变体 | 变体基建齐全但父本全是红队种子 | **本轮落地（件 2）** |
| k 次通过率<80% 判退化 | pass@k「任一通过即过」；stabilityRetest 只测判分端 | **本轮落地（件 3 门部分）** |
| 三类变更触发全量回放 | EvalRunTarget 三锚齐全、无触发器 | 挂账（CI 焊接点，另轮） |
| 一票否决 | riskVeto 评测侧已强 | 件 3 的门与 riskVeto 同语义并列 |
| 错误转化率考核 | 无该指标 | **本轮落地（件 3 读数部分）** |

## 决策记录

- **D1 提炼器零 LLM**：源文用裁判模型做归因；仓内落地为确定性根因分类器（判词证据→根因标签），与 eval 域「能跑规则的绝不叫裁判」S0 哲学一致。LLM 归因挂账。
- **D2 五要素映射**：纯净 Query=原任务题面（生产路径 reflow 时已定，不二次改写）；环境快照=origin 引用（只存引用不存原文，既有纪律）；失败轨迹=判词+工具序列摘要（进台账供审计，不进题面）；禁忌动作=继承原断言+新增机器可执行 S0 规则；通过判定=二值断言集（attempt 全 unknown 或已通过 → 拒绝提炼，模糊判定不进仓库）。
- **D3 步数红线=失败步数+2**（源文口径），挂 S0 threshold 规则（steps `<=` 红线）。失败步数取 `efficiency.steps ?? toolCalls.length`；两者皆缺席 → 红线缺席，台账如实标注，不造 0。
- **D4 根因分类优先序**：risk_violation > action_loop（同签名连续≥2）> budget_exhausted（steps/tokens 超限判词）> outcome_mismatch > trajectory_defect > result_defect；先命中先归。分类只消费已有判词/工具序列，不引入新判定调用。
- **D5 变体五维确定性**：模板改写、同输入同输出（可复现可审计）；变体继承父题 rubric、不引入新 S0 regex（红队拒答回声纪律）；expectedBehavior 追加维度说明；exceptionType 只标语义对应维度（syn→user_rephrase、implicit→ambiguous_intent），其余不标（宁缺毋滥）。
- **D6 根因台账独立 JSON**（`flywheel-ledger.json`，与 eval-store 同目录同原子写模式）：不动 EvalTask 类型与指纹语义；提炼/变体记录登记在册，读数全派生、无数据 null 不造数（fail-soft）。
- **D7 通过率门口径**：回归库最新 run、任务粒度 `passed/样本数`；通过率<0.80 且样本数≥3 → 该任务判「历史 Bug 复现」，任一复现 → gate=fail（一票否决）；k<2 → insufficient（单跑不作门禁既有纪律）；无 run → no_data。阈值 env 可覆盖（`FLYWHEEL_GATE_MIN_PASS_RATE`/`FLYWHEEL_GATE_MIN_SAMPLES`）。
- **D8 捕获与转化口径**：捕获分母=全库 runs 中失败 attempt 数（task×sample 粒度）；转化率=回流任务数/失败 attempt 数，截顶 1（同任务多样本回流幂等去重使分子可能小于分母中该任务的重复计数，截顶防>1 假读数）；0 分母 → null。
- **D9 指标动作绑定**：`error_conversion_rate` drives=[dataset_curate, advice]（运营考核面，不机械阻断）；`badcase_pass_rate_gate` drives=[gate_block]（执法面）。注册表既有消费通道直接复用，不加新 MetricAction。
- **D10 客户端最小面**：飞轮页签=只读读数（漏斗/根因分布/门）+一个「批量扩产变体」动作（幂等）；单例提炼入口走 API（runs 报告页按钮挂账下轮）。
- **D11 端点挂载**：三端点全部加进已挂载的 eval controller（`custom/server/AGENTS.md` 关键约定：新路由优先加进已挂载 controller），零新 patch、零 series 变更。

## 验证

- `npx vitest run custom/server/eval/__tests__/badcase-distill.test.ts custom/server/eval/__tests__/badcase-variants.test.ts custom/server/eval/__tests__/flywheel.test.ts custom/server/eval/__tests__/flywheel-http.test.ts`
- `npx vitest run custom/client/eval/__tests__/flywheel-panel.test.ts`
- 回归面：`npx vitest run custom/server/eval custom/client/eval`（eval 域全量）
- `npm run typecheck:harness`（新文件已追加进清单）
- 指标注册表守门：`npx vitest run custom/server/eval/__tests__/eval-baidu-registry.test.ts`（新增两键不破唯一性/drives 断言）
- 结果见本 spec 尾部「验证结果」段（收口时回填）。

## 验证结果（2026-10-25 收口实测）

- 新增四文件：40/40 绿（distill 15 + variants 8 + flywheel 10 + http 7）。
- 服务端 eval 域全量：30 文件 296/296 绿（含既有全部守门）。
- 客户端 eval 域全量：8 文件 33/33 绿（含 i18n 中英成对守门与组件冒烟 4 用例）。
- `npm run typecheck:harness` 出口 0（三个新服务端文件已入清单）。
- 指标注册表守门（eval-baidu-registry）随域全量通过。

## 挂账（本轮不做，已立账）

1. 动态 Few-shot 向量记忆（秒级疫苗）：仓内无 embedding/向量库基建，expcandidates 受控注入是时间序非相似度召回——待向量基建立项后把「触发场景/错误示范带签名/正确示范」三元组接召回门。
2. CI 焊接点：三类变更（Prompt/模型/编排）自动触发回归库全量回放并接合入阻断——需接真实 git/PR 通道，与 reviewgov mergeReadiness 同批立法。
3. LLM 归因：提炼器根因分类当前纯确定性（D1）；裁判模型归因可作为第二轮复核并联，不替换 S0。
4. 检索生成后相关性断言（捕获网卡点②）：检索非当前主链路，待检索域扩展时一并立。
5. distill 单例 UI 入口：runs 报告页失败样本行的「提炼入库」按钮（当前 API 面 + 飞轮页批量变体入口已可用）。
