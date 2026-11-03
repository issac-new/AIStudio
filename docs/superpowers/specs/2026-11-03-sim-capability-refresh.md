# 推演工装刷新：方案 §5.11 新能力验证面＋探测脚本＋模板判据 18（含审计器执法）

日期：2026-11-03
状态：implemented
触发：用户「更新全流程推演方案、推演程序及报告模版」。2026-11-03 一天内落了七组新能力（主动性介入治理／交接质量账本／确定性验收断言／主张-回执核验／组件库与多目标搜索／探测并发与调度面／派单容量准入），但推演侧三件（方案条款、取证程序、报告模板）仍停在 run25 口径——能力没人验就是新存量债。

## 变更

- **方案正本**（`2026-10-05-mux-v8-fullflow-plan.md`）：新增 §5.11「新能力验证面（七组）」——七组能力的正例判据、必红负例、证据形态与准出规则；§5.3 G4 行补判据 ⑪（`capability-probes.json` 在场且 `failed=0`）。
- **推演程序**：新增 `simharness/mux/mx-capability-probes.mjs`（端点级探测，正例取读数、负例判决，写 `capability-probes.json`，失败退出 1）；`simharness/README.md` 增「新能力探测」节。
- **报告模版**：`templates-pending/test-report.md` 增 §8.1 新能力探测小节＋§9 判据 18；`templates-pending/acceptance.md` 机械判据补第 6 条。
- **执法器**：`simharness/mux/mx-report-audit.py` 增查 19（`RUN_ID ≥ 20261103` 适用：证据缺席 WARN、`failed>0` FAIL、组不齐 WARN）——遵循 run24 教训「立法必须有执法器」。
- **守门测试**：新增 `simharness/tests/capability-probes.test.ts`（真起 Koa 跑脚本，七组全绿＋服务不可达时仍写产物退 1）。
- **顺带修一处产品缺陷**：`custom/server/handoff/handoff-controller.ts` 的 `/quality` 原先把参数校验放在数据源解析**之后**——看板根缺席时 `windowHours=0` 返回 200 `available:false`，把「参数错」掩盖成「数据源缺」。已前移校验（参数错一律 400），由探测脚本负例守住。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 七组能力用**端点级探测**取证，不进 `capture-plan.env` 截图采集位 | 这些能力没有独立 UI 承载，截图采不到；端点探测能取读数还能判负例 | 加 UI 采集位（否决：无 UI 可采，造帧=造假） | 是 |
| D2 | 负例必须是「必红」而不是「可选」 | 这些能力的存在理由就是拒绝（不可判定不放行/未引用判未验证）；负例转绿=能力失效 | 只验正例（否决：验了个空壳） | 是 |
| D3 | 探测脚本按组输出 `byGroup` 并断言七组齐 | 少跑一组会静默缩小验证面；组名齐备是最小充分条件 | 只报总数（否决：缺组也能全绿） | 是 |
| D4 | 审计器只对新轮次（`RUN_ID ≥ 20261103`）执法，缺证据先 WARN | 能力未落地的轮次允许不跑，但必须在报告写明理由；历史轮次不回填 | 全轮次 FAIL（否决：历史 run 无法补救） | 是 |
| D5 | 第 4 组（主张-回执）允许只跑负例并在报告写明 | 正例需要真实证据台账，推演早期可能还没有；如实缺省优于造数据 | 造一条假证据（否决：造假） | 是 |

## 验证

- `simharness/tests/capability-probes.test.ts`：七组全绿（真起 handoff/proactivity/workbench 三路由）＋服务不可达仍写产物退 1（2 例）。
- `npx vitest run simharness/tests/{eval-metrics-template-sync,v846-governance-closure,mechanism-behavior,capability-probes}.test.ts` → 36 passed。
- `python3 -c "import ast; ast.parse(open('simharness/mux/mx-report-audit.py').read())"` 语法过。
- 全量 `npm test` 与 `npm run typecheck:harness`。

## 设计文档影响

DESIGN_SYNC: none

本批只改推演工装（方案条款/取证脚本/报告模板/审计器）与一处控制器参数校验顺序，不改产品架构、跨域契约、阈值或数字总账；新能力本身的设计依据见各自 spec（2026-11-03-proactive-intervention-governance / -harmony-multiobjective / -handoff-quality-ledger / -acceptance-checks / -claim-receipts-and-dispatch-capacity / -component-library）。
