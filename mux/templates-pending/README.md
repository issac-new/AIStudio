# templates-pending — 中央仓交付物模板待迁区

**为什么存在**：中央仓 aipaydev 是在跑推演轮（run11+）的活数据源。推演进行中改 templates/ 会污染当轮（零污染铁律 §4.3-25c）。公文技法修订后的模板在此暂存，当轮收官后迁入。

## 当前清单（2026-10-08，13 张）

统一口径：字段说明用判断句。判据可机械核对（存在性/正则/计数/时间锚）。处置词用台账三态（已修/观察/延后）。另带「填表人三问」总注与「机械核对判据」表。

迁移状态分两批：prd/review-record/release-plan/release-notes 四张已按步 20 约定**前置迁入中央仓**（commit `0b694cc` @ origin/main，2026-10-08，DISP 锚入 run11 issues.log）；其余八张与 design.md 修订稿待 run11 收官后迁入。

| 文件 | 对应环节（§2.7 行） | harness 同步位（迁移时双向同步） |
|---|---|---|
| design.md | 概设定稿（14/G2） | 已修订在案（三问总注/三态词对齐/编号断档修复/§1.1 判据提示）；收官后迁入 |
| prd.md | 需求上锁前置（7/G1） | **已迁入**；aipay-scenario.sh 步 7 reqgate 段。判据=mx-scenario-lib.sh `reqgate_judge` 五条 |
| freeze.md | 需求上锁（7/G1） | aipay-scenario.sh 步 7 冻结 heredoc（补五项缺字段：需求名/背景/范围外/影响面/提交指纹） |
| tasklist.md | 系分拆分（11） | aipay-scenario.sh 步 10 派发词字段规格 |
| schedule.md | 排期（17） | aipay-scenario.sh 步 15 派发词字段规格 |
| test-report.md | 测试报告（19/G4） | aipay-scenario.sh 步 17 派发词字段规格；§8 评测与运行时指标节=方案 V8.22 §2.6.3 落点（Eval Studio 导出面为数字源，生成器 _ART_V2_BY_STEP 同步核对） |
| release-plan.md | 发布准出（20/G5） | **已迁入**；aipay-scenario.sh 步 20 派发词七项 |
| release-notes.md | 发布准出（20/G5） | **已迁入**；aipay-scenario.sh 步 20 派发词第六项 |
| review-record.md | G2/G5 评审卡 body | **已迁入**；aipay-scenario.sh 步 15/步 20 派发词 |
| acceptance.md | 验收（21） | aipay-scenario.sh 步 22 验收书 heredoc |
| audit-opinion.md | 审计（23） | aipay-scenario.sh 步 25 意见书 heredoc |
| retrospective.md | 复盘治理（24/G6） | aipay-scenario.sh 步 23 复盘 heredoc |
| work-report.md | 工作台账（22） | mx-scenario-lib.sh `work_report_gen` 输出契约 |

## 迁移口径（收官后执行，一句一动作；四张已前置迁入，本口径管剩余九张）

1. `cd <central>/aipaydev && git checkout main && git pull`。
2. 逐文件显式拷贝：`cp <simharness>/mux/templates-pending/<文件> templates/<文件>`。禁 `git add -A`。
3. 提交：`git commit -m "docs(templates): 交付物模板公文技法修订（剩余九张）"`。
4. `git push origin main`。记 DISP 锚入当轮 issues.log（补件带 provenance 纪律）。
5. 按上表「harness 同步位」逐处同步 scenario 内嵌 heredoc/派发词与 mx-scenario-lib.sh 生成函数。改完跑守门测试并同批更新（步 20 约定：模板与产物双向同步，只修一边=下次复发）。

## 缺失告警（2026-10-08 已解除）

中央仓 main 的 templates/ 曾在 10-08 02:14 mx-clean 历史截断后仅剩 design.md，步 7 `templates/prd.md`、步 15 `review-record.md`、步 20 `release-plan.md`/`release-notes.md` 四张派发词引用实体全部缺席。当日已按方案 §2.7 步 20 约定前置补件：四张修订稿迁入 origin/main（commit `0b694cc`），run11 步 20 到时模板库在位。

## 词表与 lint 口径（族内约定）

- 「核对」为族词：核对项/核对单/机械核对判据。派发词与方案旧称「检查单/检查项」随迁移统一改称。本节即更名映射。scenario 步 15/20「检查项×证据×结论」改称「核对项×证据×结论」。方案步 24 口径名「检查单缺项」改称「核对单缺项」。
- 本域术语白名单（方案锚定，lint hype-word 豁免）：闭环、沉淀、对齐。出处依次是「缺陷闭环/闭环治理」「G6 复盘与知识沉淀」「三态词对齐」。
- `<!-- -->` 填写提示行触发 lint exclaim 误报。族内样板 design.md 同样触发，属已知机械误报，不改动。
- 体检命令：`python3 ~/.zcode/skills/gongwen-bifa/scripts/gongwen-lint.py mux/templates-pending/<文件>`。12 张新模板除上述三类白名单外零硬违规（2026-10-08 实测）。

## 报告侧修订（2026-10-08，mx-report-gen.py，报告链纪律内改动已登记）

四处修订：第 9 章结论块手编计数「16 个」改实算（n_issue_keys/n_issue_open + 六闸落键），未成立走诚实分支。证据二/证据三当轮叙事入按轮注册表 `_GOV_EVIDENCE_BY_RUN`，未登记轮兜底文案指真实数据源。卡点引言「九个」改 `len(CHECKPOINTS)` 实算。页脚重复句去重。

审计锚与守门钉死字面量一律未动。验证：py_compile 过、vitest 78/78 过、夹具渲染「闭环成立/未成立」双分支实测正确。

## 评测指标节（2026-10-13，腾讯评测体系轮）

test-report.md 增 §8「评测与运行时指标」（原机械判据节顺延为 §9 并加判据 8-10；2026-10-13 续批：QPS 行改 mx-load-probe 可执行口径）：发布门禁六行阈值表（工具成功率 ≥99%/P99 ≤2×/降级率 <0.5% 照抄腾讯 ADP 公开清单，TTFT/响应分档/QPS 三行如实「证据缺口」）+ 过程双指标/六环节分段/异常分桶三行。数字单一来源=Swarm Studio Eval Studio 运行报告导出（/app/eval），禁手抄改写；本轮未发起评测如实写明并记问题单 eval-not-run（观察态）。同步位四处：本目录模板、mux/spec-params.env `EVAL_GATE_*` 阈值组、mx-prelaunch-check.sh 第 14 项（三方一致性核对）、mx-report-gen.py `_ART_V2_BY_STEP` 步 19 核对正则——守门测试 `tests/eval-metrics-template-sync.test.ts` 断言四处同步（只修一处=下次复发）。

## 评测治理扩展（V8.45，2026-10-19 百度评测轮）

test-report.md §8 追加七行：指标治理（接线/未接线/装饰候选）、评估器三角（严格 vs 保守反事实、误杀/假通过候选）、四层指标金字塔（模型/应用/Agent/线上）、能力维度覆盖（n/7 + 未标注）、评测集锚点（revision/setHash/contentHash/漂移）、安全红队（逃逸率/良性误报/S1 未接线声明）、线上证据回填（QPS/分档）；§9 判据扩到 15 条（11-15 为评测治理面）。数字单一来源=evidence/evals/eval-summary.json（`mx-eval-summary.py` 机械判定），禁手抄。同步位新增：`mux/mx-eval-lib.sh`（接线）、`mux/mx-eval-summary.py`（判据）、`mux/mx-lib.sh`（EVAL_STORE/REDTEAM_STORE/HELDOUT_STORE/EVAL_TRACE_DIR 隔离）、`aipay-scenario.sh`（G4-E `eval_flow`）、`mux/mx-report-gen.py`（证据八）、`mux/final-report-merge.py`（PART1 评测行）、prelaunch ㉓；守门测试同 `eval-metrics-template-sync.test.ts` 与新增 `eval-fullflow-integration.test.ts`。

## 后续批量项（挂账，列清单待批）

- §2.7 其余行模板候选：analysis.md（系分稿）、app-registry.md、org.md、governance-report.md、completeness-check.md。编码行（步 18）交付物=分支+执行输出原文，无可模板化结构，不立模板（原文不得修饰，模板化反而诱导粉饰）。
- ~~mux/tests/r18-capability.test.sh 陈旧断言 FAIL~~（2026-10-08 已修：断言对齐生成器/审计器现行文案，测试意图不变，三段全过）。
