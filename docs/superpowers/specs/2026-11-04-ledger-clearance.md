# 台账清偿批：N02/N03/N05/N06/N07/N09/N10/N11 清账（2026-11-04）

## 变更

用户令「完成未做台账，也要确保落地到 AIStudio 产品能力中」。逐项以 run26 实测证据判定后清偿：

| 编号 | 处置 | 落点 |
|---|---|---|
| N02 审批台账 | **产品能力加固**：`GET /api/approvals/history` 新增 `targetId` 精确过滤（过滤先于截断，台账增长不再把目标行挤出窗口）；驱动侧改按 targetId 反查，未命中时**幂等重放一次 decide** 再判，瞬时态自愈；新增产品 HTTP 用例（真 koa 挂 `/api/approvals` 前缀：创建→裁决→按 targetId 反查命中、缺席返回 0） | `custom/server/approval-inbox/approval-log.ts`、`pending-controller.ts`、`__tests__/pending-controller.test.ts`、`simharness/mux/mx-scenario-lib.sh` |
| N03 发布门台账 | **已工作**（run26 `release-gate-ledger` 零出现）；补**文件级断言**：approve 后 `runs/<run>/evidence/release-gate.jsonl` 真实存在且含带锚 approve 行（原测试只 GET 回读） | `custom/server/simcenter/__tests__/release-uat-state.test.ts` |
| N04 评测通道 | 已在本轮前批部分完成（load-probe 接线）；读数待 run27 | — |
| N05 报告两节 | **产品能力消费**：驱动在工作管理步调产品巡检器 `POST /api/hermes/cluster-inspector/run`，取 `completion.zero-delivery` 的 `detail`（candidates＝研发/待分诊，governanceNoAnchor＝治理类合法无锚）落 `evidence/zero-delivery.json`；报告新增「零交付逐卡分类（研发卡／治理卡）」与「交付物缺件清单」两节（后者复用 8.6 矩阵实解析）；审计新增查 20 机械核验两节在位＋产品分类计数与节内一致 | `simharness/aipay-scenario.sh`、`mux/mx-report-gen.py`、`mux/mx-report-audit.py` |
| N06 DISP 闭环 | **已闭环**：run26 issues.log ISSUE 唯一键 30 / DISP 唯一键 30（覆盖 100%），收尾链 `tri-disp-backfill.py` 自动归桶在位 | 证据：run26 issues.log |
| N07 r18 op 记录 | **观察通过**：run26 `r18-op-register-failed` 零出现 | 证据：run26 issues.log |
| N08 纪律硬断言 | **裁定：维持黄标不升 FAIL**（理由见决策 3）；可见性由 N11 注册进逐步问题单＋N05 两节兜底 | `mx-report-gen.py`（N11 表） |
| N09 悬空引用 | 守门从「三文件硬编码」扩为**全活跃面扫描**（simharness/custom/scripts/config/registries＋docs/manuals；代码面禁旧方案名与归档目录引用，读者面只禁旧方案名——设计索引收录 archive 属职责） | `simharness/tests/mechanism-behavior.test.ts` |
| N10 派发重试 | `dispatch_in_room` 对 SEND-FAILED 退避 5s 重试一次；仍失败落 `dispatch-send-failed` 单（原先只留一行日志等人工发现） | `simharness/mux/mx-scenario-lib.sh` |
| N11 台账键注册 | 新增集中表 `ISSUE_KEYS_BY_STEP`（按方案 §2.4 步号语义，覆盖 run26 全部 27 个表外键），与按轮叙事 `issue_keys` 取并集——骨架兜底轮不再全表空渲染 | `simharness/mux/mx-report-gen.py` |

### 附：用户质询「截图与内容不符／markdown 未渲染」同批处置

1. **markdown 未渲染（已修）**：QGate 证据块与治理证据块原把 `.md` 原文塞 `<pre>`，报告出现 `# 标题`、`| --- |` 源码。改走既有 `art_md_to_html` 渲染（内容不改，只做形式渲染）；审计查 21 增加机械判据（`<pre class="art-code">` 内出现标题/表格分隔即 FAIL）。
2. **帧未核验（根因已修）**：`frame-verify.py` 早已实现「期望词＋空白态」OCR 判据，但①驱动从未调用；②脚本两处硬缺陷使其一跑就崩（`SIM_ROOT` 硬编码无 env 覆盖；`subprocess text=True` 遇非 UTF-8 stderr 抛 UnicodeDecodeError）。已全部修复并在驱动收尾接线：偏差落 `frame-content-mismatch`＋`frame-verify.json`。
3. **实测结论（必须记在案）**：对 run26 的 32 帧跑核验，**通过 20 / 偏差 12**——偏差含 plan_done「还没有已排期的任务」空态、room_done「未选择对象」、评测/准出/审计/复盘/发布/收件箱 6 个末段页未命中期望词、3 个键缺帧；另有 14 组操作前后两帧完全相同。**根因不在渲染层，在采集层页面态**：拍摄位 URL 只到阶段页签，页面默认子页签/未选中本轮工件，于是拍到壳页（中间一次把「暂无阻塞」顶栏当成空态的误判已修正为只认整页未推进措辞）。
4. **补录为正确内容（用户 2026-11-04 指令）**：偏差步不再只打标签——用**可核实物三源补录**替换空壳：状态键时间戳（state.env）、交付物实物与 commit 锚（ARTIFACT_VIEWS 解析）、该步对话摘录（r18 载荷），渲染为「补录证据（采集偏差按实物补全，非截图）」。run26 报告已按此重生成：final-report 678KB，补录卡 5 处、偏差折叠 6 处、逐帧徽章（已核验 93 处/未核验 7 处），审计四查全过。偏差帧仍进折叠区（保留可查），但明确「不作实拍证据」。逐帧徽章（✓已核验／未核验／内容不符／跨步同图／前后无可见变化）；报告页首声明改为「逐帧标注核验态」，不再宣称全部为真实截图；审计查 21 对跨步同图直接 FAIL、对偏差与未核验给 WARN 并点名。
5. **未做（N13 立项，不装作已修）**：采集层页面态对齐（每步需等待/选择正确子页签与本轮工件，或在产品侧提供按 run 定位的深链）尚未实现——本批只保证「不把错帧冒充证据」与「下次一采就能发现」。

## 决策记录

1. **N02 修在「查询语义」与「驱动自愈」，不改闸判据**：端点本身可用（本轮实证 register→decide→history 全链 200）；run26 的缺口是窗口查询误判＋一次瞬时失败无重放。按 targetId 反查是产品能力（对所有消费方都有用），重放 decide 是驱动韧性，两者都不放宽「历史必须在案」的验收口径。
2. **N03 只补证据面**：run26 零出现说明通道已通；但「GET 能读到」不等于「台账文件有行」，故补文件级断言，防未来回归成只记问题单不落行。
3. **N08 维持黄标（不升 FAIL）**：`g3-local-gate-missing`（run26 ×4）与 `split-evidence-missing`（×1）属「执行纪律类证据缺口」，其可接受性依姿态（standard 允许代偿记账）。升 FAIL 会把文档细节变成硬闸，产生「为过闸补材料」的反向激励；维持黄标＋进入逐步问题单＋报告分节呈现，满足「可见、可追、可处置」而不新增拆闸风险。判据记录于此，run27 若同类复发加倍升格再议。
4. **N05 分类判据留在产品**：不把 classifyCard 复制进 harness——报告只消费产品判定（单一事实源），harness 缺席时如实声明「分类缺席」，不猜。
5. **N11 用集中表而非逐轮文件**：按轮叙事文件（narrative_runXX.py）只有真叙事轮才写，骨架兜底轮永远没有 issue_keys；集中表按步号语义固定，两类轮都生效，且按轮注册仍可追加覆盖。

## 验证

- 产品用例：`npx vitest run custom/server/approval-inbox/__tests__/pending-controller.test.ts` → **16/16**（含 N02 新增 targetId 反查）；`release-uat-state.test.ts` → **12/12**（含 N03 文件级断言）。
- 报告链沙箱实跑：`AIPAY_SIM_ROOT=/tmp/rg26 python3 mux/mx-report-gen.py --run 20261103-v8-run26` → 正常生成 536KB，两节 id 在位；`report-truth-findings.json` 的 `unregistered_ledger_keys` 由 **27 → 0**（`step_registered_keys` 10 步）。
- 守门：`npx vitest run tests/mechanism-behavior.test.ts` → **27/27**（新增 N09 全活跃面扫描、N11 27 键全覆盖＋`report_truth` 同判据复核、N05 三件接线断言）。
- simharness 全量 `tests/run-gates.sh` 与仓库全量 `npm test`：合并后执行，结果回填。
- 帧核验实测（run26 真帧）：`frame-verify.py` 32 帧 → **通过 20／偏差 12**（见附节）；报告重生成后：补录卡 5、偏差折叠 6、徽章已核验 93／未核验 7；`.md` 源在 `<pre>` 内残留从 1 处降为 0（`.txt` 日志按原文保留，data-art 标注作用域）；审计四查全过。

## 设计文档影响

DESIGN_SYNC: none。理由：本批是台账清偿与产品查询能力加固（history 过滤、报告两节、注册表、派发重试），不改整合正本架构、六闸判据、数字总账口径与版本基线；报告新增两节属呈现面扩展，设计索引/方案条款无冲突。产品端点签名向后兼容（新增可选 query 参数）。
