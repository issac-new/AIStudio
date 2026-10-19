# 全流程推演 V8.46：SwarmStudio 最新能力接入与 run22 前置准备

> 状态：已实现，待 run22 首验。前置版本=V8.45（评测治理层）。本文是 V8.46 的变更正本；方案主文档 `2026-10-05-mux-v8-fullflow-plan.md` 只保留版本锚与消费位指针。
>
> 结论先行：V8.45 只把评测栈接进了 26 步主链；2026-10-18/19 落地的评审治理、观测信号与基线告警、Harness² 改进实验、评测处置链、G5 发布门台账、UAT 判定台账、G6 闸键统一七件事还没有被推演消费。V8.46 把它们接成「治理结果层」，新增报告证据九与 prelaunch ㉔-㉚，并修掉 run21 暴露的三处采集缺口。run22 尚未启动。

## 一、范围与判据

本版只做三件事：

1. **接线**：把已落地的产品能力接进 26 步主链、六闸、报告与审计；不新建产品能力。
2. **补证**：修 run21 实证的采集缺口（步 23 delivery 载荷错登、步 13 skill 过程帧无拍摄位、R15 审计先于合并）。
3. **前置**：把 run22 开跑前的核验从 23 项扩到 30 项，所有新项可机械核对。

明确不改：26 步名称与顺序、G1-G5 判据、G4-E 三态（PASS/GAP/FAIL）语义、R18 必采分母 15 项。

## 二、七件能力对账

| # | 能力 | 产品单一事实源 | run22 消费位 | 状态 |
|---|---|---|---|---|
| 1 | G6 闸键统一 | `custom/client/ia2/views/sim/steps-registry.ts`（G6=retro_done@步 24） | 运行总览六闸、报告闸卡 | 本版已改 |
| 2 | 评测处置链 | `POST /api/hermes/eval/runs/:id/remediations`、`POST /api/hermes/eval/remediations/:id/verify`、`POST /runs/:id/rerun` | G4-E `eval_flow` 内失败样本建单→同卷复评→机械关闭；`evidence/evals/remediations.json` | 本版已接 |
| 3 | 线上证据回填（B7） | `POST /api/hermes/eval/runs/:id/live-evidence`；数据源 `mx-load-probe.py --json` | G4-E 自动回填 QPS；响应分档无源时如实 no_data | 本版已接 |
| 4 | G5 发布门台账 | `POST/GET /api/hermes/sim/release-gate` → `evidence/release-gate.jsonl` | 步 20 G5 通过写 `approve`；报告证据九与审计查 16 读 | 本版已接 |
| 5 | UAT 判定台账 | `POST/GET /api/hermes/sim/uat-verdict` → `evidence/uat-verdicts.jsonl` | 步 21 逐条 AC 写 pass/conditional/reject；报告证据九与审计查 16 读 | 本版已接 |
| 6 | 观测信号与基线告警 | `GET /api/harness/obs-signals`、`GET /api/harness/obs-alerts` | 步 24 `mx-closure-snapshot.sh` 落 `evidence/governance-closure/`；报告证据九 | 本版已接 |
| 7 | 评审治理 / 改进实验 | `GET /api/review/gov/metrics`、`GET /api/harness/workbench/overview|experiences` | 同上；只作治理读数，不改 G5 判据 | 本版已接 |

### 2.1 G6 闸键统一（影响面最大）

产品六闸此前把 G6 映射到 `report_done`（步 26），而审计器、叙事、`demo-kit-gen.py` 全部用 `retro_done`（步 24）。后果是「复盘已过、报告未出」时 G6 灯不亮，报告与产品口径分裂。本版改为：

```ts
{ id: 'G6', key: 'retro_done', step: 24 }
```

`report_done` 仍是步 26 的完成键与「本轮已结束」判据（`OpsPanel.vue` 保留），不再承担闸语义。

### 2.2 评测处置链（V8.45 未接完的一半）

V8.45 的 `eval_flow` 只建集、运行、红队、采集、判分；失败样本没有处置记录，G4-E 的 FAIL/GAP 与复盘之间断链。本版在 `mx-eval-lib.sh` 增加：

- `eval_live_evidence <runId>`：读 `evidence/load-probe.jsonl` 最后一行，映射为 `qpsProbe` 后回填；探针缺席记问题单、不阻断。
- `eval_remediation_flow <runId>`：从 `eval-run.json` 取 `attempts[].passed === false`，发起同卷复评（`/runs/:id/rerun`，样本构造与首次运行同源 `eval_samples_obj`），逐条建处置单并 `verify`；结果落 `evidence/evals/remediations.json`。未关项记 `eval-remediation-open`，不改变评测门禁判据。

## 三、主链增量（只列变化步）

| 步 | 增量 | 证据 |
|---|---|---|
| 13 系统分析（四路） | skill 过程帧无产品拍摄位，如实登记 `r18-collection-missing|step-13`；技能使用读数走 `/api/harness/tool-audit` | `aipay-scenario.sh` 步 13 段 |
| 19 独立验证（G4） | G4-E 增加线上证据回填与处置链；FAIL 仍不置 `g4_pass` | `mx-eval-lib.sh:eval_flow` |
| 20 发布准出（G5） | G5 通过写发布门台账 `approve`；台账写失败只记问题单，不阻断 G5 | `aipay-scenario.sh` G5 finalize 段 |
| 21 UAT 验收 | 逐条 AC 写判定台账；三态映射 通过→pass／有条件通过→conditional／不通过|未见→reject | `aipay-scenario.sh` UAT 判词循环 |
| 23 合规审计 | delivery 灯帧改按 `deliver` 载荷登记（run21 错登 `op` 致矩阵恒缺） | `aipay-scenario.sh` 步 23 尾 |
| 24 复盘（G6） | 治理结果快照（观测/告警/评审治理/改进实验/发布门/UAT/处置链）落 `evidence/governance-closure/`；失败端点如实计数 | `mx-closure-snapshot.sh` |
| 26 报告 | 报告第 9 章新增「证据九：治理结果」；审计在合并前后各跑一次，R15 从 WARN 变真断言 | `mx-report-gen.py`、`aipay-scenario.sh` 报告段 |

## 四、报告与审计

**证据九：治理结果**（`mx-report-gen.py:closure_evidence_html`）七行：快照采集、观测信号、基线漂移告警、评审治理、改进实验、发布门台账、UAT 判定台账、评测处置链。数据源只有两类：`mx-closure-snapshot.sh` 搬运的产品端点原文，以及驱动步 20/21 写入的 append-only 台账。端点失败按 `summary.failed` 逐项呈现，禁止写成「全部通过」。

**审计新增两查**（`mx-report-audit.py`）：

- 查 15 评测结果一致性：`eval-summary.json` 的 verdict 与 state 的 `g4_eval_pass/g4_eval_gap/g4_eval_blocked` 同源；报告含「证据八」；处置链未关项只 WARN；run22 起摘要缺席=FAIL。
- 查 16 治理结果证据九：快照缺席 run22 起=FAIL；端点缺口 WARN；报告含「证据九」；`g5_ready` 无发布门台账、UAT 已判无判定台账均 WARN。

**审计时点**：报告生成后先审计一次（早失败，避免白等合并），`final-report-merge.py` 后再审计一次。run21 的 R15「载体未生成」WARN 由此消失。

**R18 必采**：`deliver_gate` 按 `deliver --step 23` 登记；`eval_done` 仍不占 15 项分母（V8.45 D8 不变）；skill 过程帧如实登记降级，不拿页面帧冒充两类过程。

## 五、程序与脚本改动

| 文件 | 改动 |
|---|---|
| `aipay-scenario.sh` | 步 13 降级登记；步 20 发布门台账；步 21 UAT 台账；步 23 deliver 登记；步 24 治理快照；步 26 合并后复跑审计 |
| `mux/mx-eval-lib.sh` | `eval_samples_obj`（首跑/复评同源）、`eval_live_evidence`、`eval_remediation_flow`；`eval_flow` 接入 |
| `mux/mx-closure-snapshot.sh`（新） | 治理结果九端点快照 + 台账计数 + `summary.json`，fail-soft |
| `mux/mx-report-gen.py` | 新增 `closure_evidence_html()` 并挂第 9 章 |
| `mux/mx-report-audit.py` | 查 15/16；run22 起接线缺口 FAIL、端点缺口 WARN |
| `mux/mx-prelaunch-check.sh` | ㉔-㉚ 七项；计数 23→30；`OV` 支持 `MX_OVERLAY_ROOT` |
| 模板五张 | test-report/release-plan/acceptance/retrospective/audit-opinion 增 V8.46 字段与判据 |
| `tests/v846-governance-closure.test.ts`（新） | 结构门禁：G6 键、预检七项、驱动接线、报告证据九、审计两查、模板同步、脚本语法 |

## 六、run22 前置检查（prelaunch 30 项）

原 23 项保留，新增：

| # | 检查 | 失败含义 |
|---|---|---|
| ㉔ | G6 键=retro_done@步 24 | 产品口径未更新 |
| ㉕ | 治理结果端点编入生效 dist | 旧构建，证据九会整段缺席 |
| ㉖ | 治理快照与证据九接线（脚本/驱动/报告/审计四处） | 只改一处=下次复发 |
| ㉗ | 评测处置链与线上证据接线 | G4-E 仍只打分不接处置 |
| ㉘ | G5/UAT 台账写入接线 | 报告无 append-only 证据 |
| ㉙ | R18 交付灯帧与 skill 降级登记 | 步 23 矩阵恒缺或步 13 静默缺证 |
| ㉚ | 阶段页签 31（reviewGov/improve）且正本不再写 29 | 文档与产品事实不符 |

开跑顺序不变：`mx-clean`（如需 0→1）→ `mx-setup` → `mx-up` → `mx-prelaunch-check`（全绿）→ `aipay-scenario.sh`。**本版不启动 run22。**

## 七、明确排除（run22 不做，如实挂账）

1. **评审治理接入 G5 主判据**：`/api/review/gov/*` 的案例域服务代码评审，G5 是发布准出，两者不是同一条判据链。本版只把 metrics 作为治理读数，不替换 G5 评审卡与 HumanGate。理由：替换会改写 G5 判据，超出「接线」范围。
2. **skill 过程帧补拍**：产品技能治理页只有目录/供给/能力发现，没有「生成/调用过程」界面；补拍只能拿同一组页面帧冒充两类过程。本版选择如实登记降级，并把技能使用读数交给 `/api/harness/tool-audit`。
3. **报告 PNG 图产物流程**：diagram-design 的 `export-png` 已可用，但报告生成器当前只消费真实 UI 帧与交付物原文；把图产物接进 docx 衍生链是独立工程，run22 不做。
4. **改进实验的晋级/回滚主链化**：`workbench` 需要先有批准的评测运行与回归集；run22 只采 overview/experiences 读数，不把提案晋级当主链证据。

## 八、决策记录

| # | 决策 | 理由 | 回退 |
|---|---|---|---|
| D1 | 六闸 G6 取 `retro_done`（步 24） | 复盘门在步 24 写入，步 26 是报告交付动作；旧键导致产品灯与审计/叙事口径分裂 | 改回 `report_done` 并同步测试 |
| D2 | 评测处置链在 `eval_flow` 内自动建单并同卷复评 | V8.45 只判分不处置，失败样本与复盘断链；同卷复评复用首次运行的样本构造 | 设 `EVAL_REMEDIATION=off` 时只建单不复评（实现留待后续） |
| D3 | 发布门/UAT 台账写失败只记问题单，不阻断 G5/UAT | 台账是证据增强，不是判据；写失败不应制造第二套放行语义 | 改判据需整轮推演验证，不在本版 |
| D4 | 治理结果快照 fail-soft，端点失败进 `summary.failed` | 端点未起是环境缺口，报告应如实呈现，不能把缺口写成「通过」 | 若改为硬拦，须先保证九端点稳定 |
| D5 | 报告审计在合并前后各跑一次 | R15 载体 `final-report.html` 在首次审计时必然未生成，只能 WARN | 只跑合并后一次（但失去早失败） |
| D6 | R18 步 23 改 `deliver` 登记；步 13 skill 如实降级 | run21 错登 `op` 导致矩阵恒缺；产品无生成/调用过程界面，补拍只能拿页面帧冒充 | 产品补技能过程界面后恢复 skill 采集 |
| D7 | 评审治理与改进实验只作治理读数，不进 G5 主判据 | 两者服务代码评审/改进实验，与发布准出不是同一条判据链 | 若未来合并，须单独立项改 G5 |
| D8 | prelaunch 23→30 项 | 新增七项均为可机械核对的接线断言，不依赖人工判断 | 可按项回退，但会失去对应口径保护 |

## 九、验证账

- `bash -n`：`aipay-scenario.sh`、`mx-prelaunch-check.sh`、`mx-eval-lib.sh`、`mx-closure-snapshot.sh` 全过。
- `python3 -m py_compile`：`mx-report-gen.py`、`mx-report-audit.py`、`mx-eval-summary.py`、`mx-narrative-skeleton.py` 全过。
- simharness 全量门禁 `tests/run-gates.sh`：rc=0，jargon-source-gate HARD=0。
- 定向用例：`v846-governance-closure` 7/7、`eval-fullflow-integration` 8/8、`eval-metrics-template-sync` 6/6、`harness-gate-integrity` 128/128。
- 产品侧 `sim-overview-panel` 21/21（G6 键断言已更新）；`nx run build` rc=0，`verify-dist` 通过。
- `mx-prelaunch-check.sh` 实测 **30 过 / 0 败**（2026-10-19 20:10，SIM 8801/8802 在跑）。
- SIM `product-dist` 已刷新到 overlay `b060fc4e`，六个治理端点标记全部在位。
- 宿主 8647/8649 已重启；G6 改动在 serve-main 54539c65 生效。
- run22 未启动；本文件与 `simharness/docs/2026-10-19-run22-prelude.md` 是起跑前的操作口径。
