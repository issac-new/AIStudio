# Agnes Harness 吸收批一 a：晋级门收紧（字典序/n≥3/三向数据集）

> 状态：已批准实施（2026-11-20 用户批准「批准批一」；因 `ai-native-cognition-batch2` 在途占用注入链路区域，批一拆两段：本 spec 只覆盖 **1a 晋级门收紧**，1b（注入回执/效果归因/试用期）等该会话合并后另立 spec）。
> 外部吸收源与一手核验：见 `docs/superpowers/specs/2026-11-20-agnes-harness-absorption.md` §1.1（TTT 无实测、配对分不归因 harness、Sys1 非幻觉率低 18pp）。

## 1. 背景与目标

Agnes Harness 技术报告的治理链（governed RSI）有三件本仓晋级门没有的硬纪律：

1. **字典序目标**：安全 > 质量 > 成本——报告原文「trading safety or pass rate for speed is unconditionally rejected」。本仓现状：`evaluatePromotion` 的 blocker 平铺，`cost_unjustified`（RRSI 成本规则）与安全/质量 blocker 并列，理论上「质量 fail 但成本极省」的报告里成本项仍然参与 ok 判定，读报告的人要自己拼优先级。
2. **n=3 统计下限**：报告实测同任务 run-to-run 方差 12-19%，故 twin-sim n=3。本仓现状：`probeK` 默认 2，`k<2` 才 warning——两个样本区分不了运气与能力。
3. **Train/Eval/Sealed 三向隔离**：防「teaching to the test」。本仓现状：eval store 只有 sealed 布尔位，没有角色路由；晋级证据可以来自任何集（包括给进化过程读的集）。

### 目标

- 晋级裁决按 安全→质量→成本 字典序分层，报告带 `lexOrder` 三态读数。
- `k<3` 从 warning 升 blocker；预算受限走 `min_k` 显式豁免（actor+reason 留痕进提案历史）。
- `EvalSet` 增 `split: 'train'|'eval'|'sealed'` 三向角色；晋级证据引用 train 集直接拦。
- 自动探测默认 `probeK` 2→3。

### 非目标与反目标

- 不改多目标搜索本身：加权 Tchebycheff 仍用于搜索多样性（multi-objective.ts 不动），字典序只作用于**准入裁决**（evaluatePromotion 返回前）。
- 不新建豁免审批体系：豁免复用 promote 调用参数＋提案历史留痕，不走 approval-inbox（min_k 是统计风险承担声明，不是高危动作）。
- 不迁移存量集：已有集按推导规则落 `eval`（sealed=true→sealed），行为不变。
- 不做 1b 内容：注入回执、效果归因、试用期、自动回滚——等 `ai-native-batch2` 合并（它在做 column-dispatch 注入段与 exp-inject 同源选择器，同文件面单写属主）。

## 变更

- `custom/server/eval/types.ts`：`EvalSet.split?: 'train'|'eval'|'sealed'`（注释含语义与推导规则）。
- `custom/server/eval/store.ts`：
  - `splitOfSet()` 单一事实源推导（sealed 布尔恒胜出；显式 train→train；其余→eval）。
  - `createSet` 校验：非法 split 值拒；`split:'sealed'` 显式声明拒（密封由 sealSet 推导）；train+golden 拒（训练集服务调参，黄金配比属评测面）。
  - `sealSet`：train 集不可密封。
- `custom/server/harness/workbench/types.ts`：`PromotionWaiver{code:'min_k',actor,reason,at}`；`Proposal.waivers?`；`PromotionGateReport.lexOrder?`。
- `custom/server/harness/workbench/loop-report.ts`：
  - k 门：`k<3`（含 statisticallyInsufficient）→ blocker `statistical_insufficient`；带完整留痕的 min_k 豁免 → warning `statistical_insufficient_waived`。
  - 三向门：`evidenceSetSplits[setId]==='train'` → blocker `train_evidence`（含等预算基线/反事实集；表缺席不评估，向后兼容）。
  - 字典序：安全类（constraint_regression/benchmark_leakage）→ 质量类（其余非成本）→ 成本类（cost_unjustified/budget_exceeded/cost_missing）；高层 fail 时成本 blocker 暂缓为 warning，报告 `lexOrder` 三态。
- `custom/server/harness/workbench/loop-core.ts`：`PromotionGateInput.evidenceSetSplits?`。
- `custom/server/harness/workbench/service.ts`：`evidenceSetSplitsFor()`（读 eval store 收集探测/基线/等预算/反事实的 setId→split，fail-soft）；promote 接受 `waivers` 入参，豁免追加进提案历史（不可变）。
- `custom/server/harness/workbench/controller.ts`：`POST /proposals/:id/promote` 接受 `waivers:[{code:'min_k',reason}]`（reason 必填，空理由视同未提交）。
- `custom/server/harness/workbench/schedule-policy.ts`：`DEFAULT_SCHEDULE_POLICY.probeK` 2→3。
- 测试：既有夹具 k 2→3（loop/r6/workbench-http）；R4 断言更新（k=1/2 都拦、k=3 干净、豁免降 warning）；W6 棘轮 57→59（+statistical_insufficient_waived/train_evidence）；新增 `agnes-gate-hardening.test.ts`（9 例：字典序三分支/train_evidence 三分支/probeK/split 校验与密封推导）。

## 决策记录

1. **成本暂缓而不是删除**：安全/质量 fail 时成本 blocker 转 warning 保留信息（「先修什么」可见），ok 判定只看当轮该看的层；不是把成本从报告里抹掉。
2. **未列明 code 归质量层**：新 code 默认进最高优先层之一（质量），保守——宁可多暂缓成本裁决，不让新门被成本抵消。
3. **min_k 豁免走提案留痕而非审批收件箱**：豁免本质是「人工承担统计风险」的声明，随提案历史可审计即可；双签属高危动作面，不混用。
4. **splits 表由 service 注入而非 gate 自读**：保持 evaluatePromotion 纯函数可测（loop-report 无 IO 纪律），store 缺席 fail-soft 不阻断。
5. **sealed 显式声明拒绝**：角色标签与密封机制必须一致——`split:'sealed'` 而 `sealed:false` 是配置矛盾，推导层不容忍，建集口直接拒。
6. **probeK 3 的成本代价**：探测墙钟约 +50%（单提案），但 k=2 的晋级证据本过不了新门，默认值与新门一致才是诚实配置；机器/预算紧张场景仍可显式调档并接受 blocker。

## 验证

- `npx vitest run custom/server/harness/workbench custom/server/eval`：229 passed（含 9 例新增）。
- `npm run typecheck:harness` 绿。
- 关键用例：安全 fail 时 `budget_exceeded` 暂缓为 warning 且 `lexOrder={safety:fail,quality:pass,cost:pass}`；干净提案三层 pass 且 ok；k=1/k=2 blocker、k=3 无告警、豁免降 warning；train 证据拦截、eval/sealed 放行、表缺席兼容；缺省建集=eval、train 不可密封、train+golden 拒、split:'sealed' 显式声明拒。
- 合并前 `npm test` 全量（仓规）。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md` §进化实验台段（约 1299-1310 行）：新增字典序分层（安全>质量>成本、高层 fail 暂缓成本、反向不成立）、k=3 默认与 min_k 豁免语义、三向角色与 train 不可晋级/不可密封/不可黄金。
- `config/mechanism-budget.json`：新增批 1a 条目（delta=+1 blocker code 族与豁免字段/sunset 绑 1b）。
- 不触及数字总账、不新增补丁、不改 vendor。

## 未做/未验证

- 批 1b（注入回执/效果归因/试用期/自动回滚）：等 `ai-native-cognition-batch2` 合并后另立 spec 与 worktree。
- 存量宿主 `harness-schedule.json` 已落盘的 `probeK:2` 不被新默认覆盖（normalize 保留显式配置）；新档才用 3。已有提案在旧 k=2 证据上重晋级会被新门拦，需补跑探测或走豁免——这是收紧的预期行为，不是回归。
- 字典序分层对「质量未知（quality_unknown warning）」不升 blocker：维持既有人工复核语义，本批只重排 blocker 优先级，不新增质量门。
- **独立审查（2026-11-20，修复后可合并）已清偿**：P1-1 三向门从只查主证据扩到等预算基线/反事实/提案基线四个证据面（审查确认原实现与 spec 声称不符）；P1-2 豁免链路补 HTTP 集成测试（k=1 无豁免 409→带理由豁免 200 且留痕持久化→空理由过滤且 409 不留残留）；P2-3 豁免写回改显式追加语义（弃长度比较）；P2-5 service-auto-probe 过时注释同步 k=3；P2-6 listSets 元数据暴露推导 split；P2-7 机制预算 delta 措辞修正（statistical_insufficient_waived 是 warning）。
- 未采纳（记录理由）：P2-1 `constraint_unchecked` 等安全证据类仍归质量层——裁决行为等价（同样触发成本暂缓），只影响 lexOrder.safety 读数口径，留待 1b 统一安全 code 分类时一并处理；P2-2 lexOrder.cost 增设 deferred 态——信息已在 warnings 保留，三态读数的暂缓语义在类型注释里说明；P2-4 actor 缺省 'operator' 弱归属——与 champion.promotedBy 同款既有口径，不单批改。
