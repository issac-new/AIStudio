# V8.48 评测子门新读数接线（京东评测体系吸收轮）

- 日期：2026-10-24
- 状态：已落地（feat/eval-v848-jd-readouts）
- 上游来源：overlay main 79c39a42/c208952d（京东吸收轮+立项批）；产品端 spec=overlay docs/superpowers/specs/2026-10-23-jd-eval-absorption.md 与 2026-10-23-eval-biz-signals.md
- 方案正本对应：overlay《2026-10-05-mux-v8-fullflow-plan.md》V8.48 增量（本批同轮落）

## 落地内容

1. **任务难度/角色标注进全流程评测集**（`mx-eval-lib.sh eval_ensure_set`）：t1/t2=P1+implementer（报告产出责任在执行者）、t3=P0+reviewer（红线把关责任在评审者）——难度/角色分桶读数在推演集里有真实数据。集名版本化 `-v2`：标注改变内容指纹，同名旧集会被幂等复用导致分桶缺席，改名让 v1 自然退役（产品端无删集端点）。
2. **新读数采集**（`eval_collect`）：`GET /eval/behavior-signals?days=7`（行为信号）与 `GET /eval/runs/:id/business-summary`（经营语言摘要），fail-soft 静默——缺席只不呈现，不记问题单。
3. **摘要透传**（`mx-eval-summary.py`）：payload 增 `run.byDifficulty/byRole/outputStability`（aggregates 透传）与顶层 `behaviorSignals/businessSummary`。**判据不变**（新读数先观察，与 V8.46 处置链同款「不改判据」纪律——G4-E 的 PASS/GAP/FAIL 判定面零变化）。
4. **报告呈现**（`mx-report-gen.py eval_summary_html`）：证据八表格补两行——「难度/角色分桶」「稳定性/行为信号/经营摘要」，缺席如实「未标注/未开启/未采集」。

## 决策记录

1. **D1 集名版本化而非删集重建**：产品端无删集端点；幂等键=集名，`-v2` 后缀让旧集自然退役，run23 起新集自动生效。
2. **D2 判据零变化**：V8.46 处置链先例——新增能力第一轮只采集观察，读数进报告证据面；是否改判留待 run23 实测后定（若分桶/稳定性读数证明稳定可判，再立 V8.49 判据增量）。
3. **D3 stabilityRetest 不在推演链开启**：全流程评测集三任务全部带 S0 规则断言，S1 不参与判定，开启 retest 只烧判定费不产读数（outputStability 结构性缺席，如实呈现「未开启」）。
4. **D4 行为信号窗口=7 天**：与 obsalerts 基线窗口对齐（近 24h vs 前 7 天）；推演是周级节奏，7 天窗口覆盖轮次间隔。

## 验证

- 新增结构断言 it（标注/采集/透传/呈现四层）+ 判据用例（带新读数 PASS；全缺席也 PASS 且字段 null）。
- simharness 全量 198 用例绿；bash -n / py_compile 三脚本过。
