# RSI 递归自我改进数学吸收：收缩衰减、选择偏差与代理-真实背离诊断（2026-11-23）

> 状态：已实施（用户指令「继续深入调研 https://mp.weixin.qq.com/s/zzEywMh3iJRMCp2N0CPlrA 完善AIStudio」）
> 来源：《RSI 递归自我改进原理与公式推导详解：从改进系统到改进改进者》（青稞AI，2026-11-23；作者 Kevin，原文 https://zhuanlan.zhihu.com/p/2098557708416951446）。
> 采集精度：正文级。页面内嵌 MathJax 的 258 条公式按 `data-math-raw` 还原为 LaTeX 后再读，未用图片 OCR、未用二手摘要。

## 变更

### 调研结论（三个决定性发现）

1. **固定改进器必然几何衰减，天花板由改进器的不动点封死。** 原文 §1.3 在收缩假设 `|J(S_{t+1}) − J(S*)| ≤ γ|J(S_t) − J(S*)|`（`0 ≤ γ < 1`）下推出 `S_t = U^t(S_0)` 与 `|Δ_t| ≤ γ^t(1+γ)|J(S_0) − J(S*)|`。结论不是「方法变差」，而是「U 的表达能力有限」；突破封顶的唯一出路是让改进器本身可变（双循环 `S_{t+1}=U_t(S_t)`、`U_{t+1}=V(S_t,U_t,F_t)`）。仓内已有 `gainRetention`（跨分布保留率）与停滞/剪枝布尔信号，但没有跨轮收缩系数估计，也没有「收益衰减到噪声带＝到顶，应改 U」的判据。
2. **多候选择优是带噪声的最大值选择。** 原文 §4.1 以 `ε(a)=Ĵ(a)−J(a)` 推出 `E[J(a*)] = E[Ĵ(a*)] − E[ε(a*)]`，并指出候选池越大，被选中的越可能是「误差恰好为正」的幸运儿——与多重比较假阳性同机制，评估误差不随候选变多而摊薄。仓内有噪声带 `gain_within_noise` 门，但没有池大小、最优-次优间隔与留出缺口的选择偏差读数。
3. **代理分与真实读数会背离。** 原文 §4.2 给出 `D_opt` 过拟合机制与实证量级（三个前沿模型、五种 agent 配置下 73.8% 的 KernelBench 优化与 46.8% 的 ALE-Bench 优化提升了廉价代理指标、未提升真实目标）。仓内有单轮留出保留率门（Harmony）与 heldout 回归门，但没有连续轮次的「代理涨、真实不动或跌」判据。

第四项（Absolute Zero 的可学习性奖励 `r_propose = 0` / `1−p` 分段）**本轮不落地**：仓内没有任务级难度历史（probe 按题跑但不累计每题成功率 p），要落地须先建每题成功率的持久面。硬接一个假消费方等于装饰指标，违背「指标须登记它改变过哪个决策」的度量纪律。

### 交付

- `custom/server/harness/workbench/loop-theory.ts`（新）：纯函数诊断层——`expectedMaxZ`、`selectionBiasAudit`、`decayAudit`、`proxyDivergence`、`buildTheoryReport`。
- `types.ts`：`SelectionBiasAudit` / `DecayAudit` / `ProxyDivergenceAudit` / `RsiTheoryReport` 类型；`PromotionGateReport.selectionBias?` 与 `EvolutionReport.theory?` 可选字段（只读，不参与 `ok`/`blockers`）。
- `loop-report.ts`：晋级报告附选择偏差读数（池大小、最优-次优间隔、留出缺口、期望乐观值）。
- `loop-advice-evolution.ts`：进化报告附 `theory`（各面衰减读数＋代理-真实背离＋多候选提案审计）。
- 客户端：`governance/api/workbench.ts` DTO＋`HarnessImprovePanel.vue` 新增「RSI 数学体检」块＋i18n zh/en 成对键。
- 测试：`custom/server/harness/workbench/__tests__/loop-theory.test.ts`（纯函数边界＋两处集成）＋面板测试补一条。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 只做诊断，不新增 blocker/warning 门码 | 遵守 2026-11-01「机制扩展停止」裁定：判断规则不再增加，证据供给与可观测性归工作台；本批是「解释读数」不是「改判定」 | 给衰减/选择偏差加门（否决：新规则没有退役路径，阈值也未经验证） | 是 |
| D2 | γ 用过原点 AR(1) 估计，只取正增益轮并报剔除数 | 收缩模型本身假设正增益；把回退轮混进来会压低 γ、误判「到顶」 | 全量最小二乘或对数拟合（否决：非正值取不了对数，样本常少于 5 轮） | 是 |
| D3 | 选择偏差用两条可测口径：最优-次优间隔对噪声带；最优对留出读数。期望乐观值只在调用方显式给 σ 时计算 | 仓内噪声带是半极差不是 σ，硬换算会造一个假精度；留出缺口可测但混有分布迁移，必须显式声明混合解释 | 用 `δ/1.96` 当 σ（否决：半极差与 σ 无固定比例，随标定样本数变） | 是 |
| D4 | 代理-真实背离连续 2 轮计 `diverging`，单轮只 `watch` | 单轮背离可能是噪声或分布迁移；连续两轮才构成「倾向」 | 单轮即判（否决：误报率高） | 是 |
| D5 | 面板缺 `theory` 不渲染 | 旧载荷与旧服务端兼容，避免前端因新字段缺席报错 | 必填渲染（否决：破坏兼容） | 是 |
| D6 | 同一提案跨评测集的读数不混用（取众数集合） | 不同评测集的通过率不可比，混池会把「换集」误读成「候选差异」 | 全池混用（否决：同一提案的 probe 可能来自不同 setId） | 是 |
| D7 | 可学习性奖励 `r=1−p` 挂账不落地 | 仓内无每题成功率的持久面；强行接线只会产生装饰指标 | 强接 `schedule-policy`（否决：调度面选的是探测预算，不是题目难度，语义不符） | 是 |

## 验证

- `loop-theory.test.ts`（16 例）：`expectedMaxZ` 的 k=2 解析值 1/√π≈0.5642 与单调性；选择偏差全部分支（单候选/池内噪声/稳健/选择主导/留出确认/留出缺口）；衰减四态（样本不足/几何衰减/中度/不衰减）＋剔除非正增益＋到顶判定；背离四态；`evaluatePromotion` 与 `evolutionReport` 集成字段；跨评测集不混用。
- 目标测试：`npx vitest run custom/server/harness/workbench/__tests__/loop-theory.test.ts custom/client/ia2/__tests__/harness-improve-panel.test.ts`。
- 全量：`npm test`；类型：`npm run typecheck:harness`；机制预算：`node scripts/governance-lint.mjs --budget`；文档索引：`node scripts/maintenance/gen-doc-indexes.mjs --check`；合并不变量：`node scripts/merge-invariants.mjs --check`。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md` §4.8：补一段「改进环路读数的 RSI 数学解释」——几何衰减与到顶改 U、选择偏差两条口径、代理-真实背离连续两轮。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：§A 增三行（收缩衰减诊断、选择偏差诊断、代理-真实背离诊断）。
- `docs/manuals/aistudio-design-document-index.md`：`gen-doc-indexes --write` 机械登记（附录 A 已冻结）。
- `config/mechanism-budget.json`：`changes[]` 增一条（+0 门/脚本/账本；sunset 2027-02-23，`retireWhen`＝连续两轮推演无消费或阈值被证伪时并入 `loop-report` 或本 spec 附录）。

## 边界与未做

- 不含可学习性奖励（D7）。
- 不改变任何晋级判定：`ok`/`blockers`/既有门码完全不变。
- `realizedGap`（最优读数与留出读数之差）混合了选择乐观与分布迁移，只能作诊断，不能当因果归因。
- 选择偏差明细在 API 返回，面板只在进化报告聚合层展示（「多少多候选提案的留出未确认」），不逐提案上卡。
