# RSI 首批执行方案：R1/R4/R8/R12a 四件（2026-10-31）

日期：2026-10-31
状态：plan-approved-pending-execution（执行实施方案；对应总方案 `2026-10-31-rsi-improvement-plan.md` 的批次 A/D/C 摘出件）
来源：用户指示「哪些可以落地实施，制定下方案」。从 R1-R12 中按可落地性筛出**无外部依赖、S 规模、当轮可收口**的四件为首批；其余分第二/三批（本 spec 第二节）。

## 变更

### 一、首批四件实施细节（落点已核到 file:line）

#### R1 rsi-maturity 探针修复（真缺陷，最高优先）

- **缺陷**：`countCapabilityGaps()` 与探针都读 `hermesPath('gap_register.yaml')`（rsi-maturity.ts:62/160），该文件 2026-10-12 已迁往 `/Users/cuishi/hermes-docker-sandbox/workspace/life-workbench/gap_register.yaml`（592KB 在位、10-30 活跃；watchdog 自身已改址，watchdog L42）。当前本机 L2/L3 自评输出 null，与「达成」文案矛盾。
- **实施**：路径解析改三级序——env `GAP_REGISTER_PATH` → life-workbench 新址（常量，与 watchdog 同源）→ 旧 `~/.hermes` 路径兜底。探针缺席时 L2/L3 输出维持「无法判定=null」但 gap 描述如实写「探针失效（三址均缺）」。
- **验收**：本机 `GET /api/harness/rsi-maturity` 恢复 L1-L3 达成；`GAP_REGISTER_PATH=/nonexistent` 时 L2=null 且描述含「探针失效」；三态测试（新址/env 失效/文件不可读）三例。

#### R4 探测多样本 k≥2（D4 匹配预算 pass@k）

- **落点**：`probe-runner.ts` spawn 循环加 `k` 参数（默认 2，预算允许时；probe-runner.ts:260-312 逐题 spawn 处）；`ProbeMetrics.k` 已有字段如实记录（types.ts:154）；晋级门（loop.ts:524-527 `statistical_insufficient` 语义收紧：k=1 时恒 warning）＋新增 warning `pass_at_k_divergence`（pass@1 上升而 pass@K 下降＝靠运气而非能力，两读数齐全才判）。
- **验收**：k=2 全链测试（两样本聚合）；divergence 构造用例（p1=0.8/pk=0.4 告警；p1=0.7/pk=0.7 放行）；k=1 时 statistical_insufficient 必现。

#### R8 经验加权检索＋批量复核（D11 执行面可操作化）

- **检索侧**：`suggestProposal` 经验选取（service.ts:571-574 现取 adopted 前 3）改加权排序——`score = confidenceScore（freshness 现算）×（surfaceKey 匹配 1.0 / 跨面 0.5）×（domain 匹配 1.0 / 异域 0.7）`，取 top-3；stale 经验在起草 prompt 附「建议引用以刷新」清单（D11 revalidate 建议的消费通道）。
- **复核侧**：memoryPolicy 折叠块加两操作（HarnessImprovePanel.vue:1015 区）——「批量退役孤儿」（勾选集→逐条调既有 `setWorkbenchExperienceStatus`，前端串行）与「引用 stale 到新提案」（勾选集→写入 createForm.experienceIds）。REST 不新增（复用既有端点），只加前端批量编排＋确认框。
- **验收**：加权选取单测（同置信 fresh 优先、面域匹配优先、stale 附刷新清单）；批量操作组件测试（勾选→确认→N 次调用）；100 条规模渲染冒烟。

#### R12a 验证信号分级（tier 推导＋晋级留痕＋面板列）

- **推导**（纯函数，loop.ts）：`verificationTierOf(proposal)` 从选中探测证据类型推导——`command`（命令式验收器运行）> `heldout`（R6 后接，暂缺席）> `regression`（普通 eval 回归集）> `judge`（LLM 判分主导），取本次晋级实际用到的**最强层**；无探测=`none`。
- **留痕**：`PromotionRecord` 加 `verificationTier?: 'command'|'heldout'|'regression'|'judge'|'none'`（types.ts:244-252），晋级时写入 store。
- **面板**：进化表（HarnessImprovePanel evolution 区）每轮加 tier 徽标；连续 ≥3 轮 tier≤judge 触发 warning `weak_verification_streak`（进化健康度）。
- **验收**：tier 推导单测全覆盖（命令式>回归>判分的排序、无探测=none）；PromotionRecord 写读往返；面板徽标渲染＋streak 告警用例。**R12b（约束单层消融）后置第二批**——需运行时对照探测支撑，不与本件捆绑（总方案 §五已注明）。

### 二、后续批次排期（不属本批执行面）

| 批次 | 项目 | 前置 |
|---|---|---|
| 第二批 | R3 CHASE 变换器 → R2 三类证据自动跑（反事实档）；R6 heldout 门；R5 gap 桥；R12b 约束消融 | R3 先行（R2 反事实档消费其产物）；R5 依赖的仓外文件已确认在位 |
| 第三批 | R7 advisory 执行回路（memory/tool_guidance）；R9 技能差分（依赖 R2 runner）；R10 任务族；R11 SQLite 持久化 | R7 最大涉人审应用通道；R11 独立迁移需隔离窗 |

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 首批只取四件 S 规模件 | 无外部依赖、纯 custom、当轮可收口——快速兑现总纲「证据与治理先行」且控制回归面 | 首批带 R3/R2（否决：M 规模依赖链会拖长首批周期） | 是 |
| D2 | R1 路径解析三级序而非硬编码新址 | env 覆盖保测试与多机；旧址兜底防他机未迁移 | 只写死 life-workbench 路径（否决：他机/CI 必坏） | 是 |
| D3 | R4 默认 k=2 而非可配置默认 1 | D4 机制的核心就是多样本；k=1 保留为预算不足时的自动降级而非默认 | 默认 k=1 需手动开（否决：机制形同虚设） | 是 |
| D4 | R8 批量操作走前端串行复用既有端点 | 不新增 REST 面＝不扩攻击面；N 条规模（≤百）串行足够 | 新增批量 REST（否决：为省前端循环扩服务端接口不值） | 是 |
| D5 | R12 拆 a/b，消融后置 | 消融需「每约束独立贡献」的运行时对照测量（每约束跑一次带/不带探测），成本与 R2 runner 耦合 | 与 tier 捆绑首批（否决：把 M 规模件混进 S 批） | 是 |
| D6 | R12a 的 heldout 层暂列枚举但不判 | R6 未落地前该层无证据可判；枚举先占位避免 R6 落地后改类型 | 现在就接 heldout（否决：无消费者） | 是 |

## 验证

- 每件独立 vitest 套件（上列验收）；`npm run typecheck:harness`；全量 `npm test` 收口。
- R1 需本机活体验证（真 gap_register 文件在位）。
- 本 spec 为实施方案文档批：gongwen-lint＋docs-ssot（附录 A 登记）。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-31-rsi-improvement-plan.md`：§二批次表补「首批=R1/R4/R8/R12a，见执行 spec」指针。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记（计数 +1）。
