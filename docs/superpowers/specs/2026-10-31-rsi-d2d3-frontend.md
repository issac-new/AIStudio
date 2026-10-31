# RSI 二批：CHASE 反事实门（D2）＋垫脚石档案（D3）＋约束/归因/反事实前端录入面（2026-10-31）

日期：2026-10-31
状态：implemented
来源：`docs/reports/2026-10-31-rsi-survey-and-tech-stack.md` §六缺口表 P1 两项＋前批（`2026-10-31-daily-research-absorption.md`）留下的「约束/归因无前端录入面」挂账；用户指示「完成未做和挂账」。

## 变更

1. **D2 CHASE 反事实门**（`custom/server/harness/workbench/`）
   - `types.ts`：`CounterfactualEvidence { runId, setId, passAt1 }` 挂 `ProbeMetrics.counterfactual`；本层只消费运行读数，变体集由评测域产出（任务 id/文件名/返回格式变换），不在此生成。
   - `loop.ts` 晋级门：原始增益>0 时——变体缺席默认 warning `counterfactual_missing`（`HARNESS2_RSI_REQUIRE_COUNTERFACTUAL=1` 升 blocker）；变体增益 ≤ 噪声带 δ → blocker `counterfactual_gain_collapse`（协议级捷径：增益绑定原协议可利用面，未迁移到同义任务）；读数缺 passAt1/基线缺 passAt1 → warning `counterfactual_unreadable`。
   - `service.ts`：`RecordProbeInput.counterfactualRunId`——必须是 explicit 真实运行、不得与候选探测复用同一运行；`controller.ts` 透传。
2. **D3 垫脚石档案**（DGM/ADAS 档案采样思想）
   - `loop.ts` 纯函数 `proposalArchive(proposals, surfaceKey?)`：把被拒/回滚提案投影为 `ArchiveSteppingStone{proposalId, surfaceKey, title, hypothesis, status, bestPassAt1, bestDelta, updatedAt}`（时间倒序）；`service.ts` overview 暴露 `archive` 字段——纯爬山丢低分祖先，提案端可据此在新假设里显式引用/改造旧分支。只读投影不改状态。
3. **前端录入面**（补前批挂账：D5 约束、D1 等预算此前只有 REST 无 UI）
   - `governance/api/workbench.ts`：`recordWorkbenchConstraints()`、`ArchiveSteppingStoneDto`、`recordWorkbenchProbe` 扩 `equalBudgetBaselineRunId/counterfactualRunId`。
   - `HarnessImprovePanel.vue`：探测录入行新增「等预算基线运行 id / 反事实变体运行 id」两输入（`hi-eq-budget-input`/`hi-counterfactual-input`）；新增约束断言录入行（`hi-constraints-input`，每行 `id | statement | pass/fail/unknown | evidenceRef`，前端解析校验非法状态行）；进化区新增垫脚石档案折叠列表（`hi-archive`）。
   - `improve-i18n.ts`：类型+zh+en 三段成对补 11 键。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 反事实增益对比口径=变体 passAt1 − 原始基线 passAt1 | 候选 harness 在「语义保持、协议变换」集上应至少保住原基线水平；变体基线另行跑会双倍评测成本，且 CHASE 判据是「增益崩塌」非「绝对分」 | 同时强制变体基线运行（否决：成本翻倍，留待高价值面手动补） | 是 |
| D2 | D2/D3 只消费读数、不自动生成变体集 | 变体生成（协议变换器）属评测域能力（需保持语义校验），跨域硬造会造假捷径检验 | 在 workbench 内嵌变换器（否决：语义保持校验缺失会造无意义变体） | 是 |
| D3 | D3 为只读投影而非「保留 rejected 作父代的采样器」 | 本台坚持「人提案、台正则、门拦险」——档案把垫脚石显性化交提案端引用，即论文 archive 语义的人类提案版 | 自动父代采样（否决：越过人工发起权边界，RRSI 吸收轮 D 决策先例） | 是 |
| D4 | 约束录入行内做格式/状态前端校验 | 坏行在入网前拦下，服务端 400 双保险 | 只靠服务端校验（否决：行级错误定位体验差） | 是 |
| D5 | 两运行 id 输入放探测录入行（每 probe） | 等预算/反事实天然是「该次探测」的证据，非提案级 | 提案级表单（否决：一提案多候选各自探测，证据属探测级） | 是 |

## 验证

- `npx vitest run custom/server/harness/workbench/__tests__/loop.test.ts` = 44/44（新增 4 例：missing 升档 env／增益崩塌 blocker 与迁移放行／不可读 warning／D3 过滤与读数）。
- `npx vitest run custom/server/harness/workbench/__tests__/workbench-http.test.ts` = 25/25（新增 1 例：origin 拒／复用拒／成功 evidence 可见＋overview.archive 可见）。
- `npx vitest run custom/client/ia2/__tests__/harness-improve-panel.test.ts` = 18/18（新增 3 例：两输入透传／约束合法解析与非法拦截／档案渲染与缺省不渲染）。
- `npm run typecheck:harness` 0 错；全量 `npm test` = 971 文件 / 7074 用例通过、11 跳过、0 失败；docs-ssot 6/6（附录 A 426）。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§7.7 调研台账段 RSI 二批补记（D2/D3/前端面落码）。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记（计数 +1）。
- `docs/reports/2026-10-31-rsi-survey-and-tech-stack.md` §六缺口表两项标「已落地（本批）」。
