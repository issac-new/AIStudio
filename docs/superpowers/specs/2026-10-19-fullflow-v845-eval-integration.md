# 全流程推演 V8.45：评测治理层接入 26 步/G4/报告（2026-10-19）

> 状态：已实现（overlay `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md` V8.45 + simharness `feat/eval-fullflow`）。
> 调研正本：银翼AI评测室《百度 Agent 评测体系技术拆解》（2026-10-19 09:21）。产品侧已落三批：B1-B5 回报函数五件套、B6-B7 红队扩产与线上证据、评测治理六件（指标注册表/三角/红队引擎/维度覆盖/证据点击/EvalOps）。
> 前置版本：V8.44（2026-10-18 工作台 IA 重构，26 步/六闸/STEPS 键零改动）。

## 主旨三句话

唯一主旨：把 SwarmStudio 最新的评测治理能力接进全流程推演的 26 步主链、G4 关卡与报告证据链，让「评测」从产品里的一个工作台变成每轮推演的必经证据面。
受众：全流程推演的方案维护者、simharness 脚本维护者、下一轮推演的值班与复盘人员。
读完促成：按本文件的 G4-E 判据与脚本映射执行，测评数据能自动落档、报告能自动引用，不再靠人手工把评测数字抄进测试报告。

## 1. 现状缺口（盘点结论，带锚点）

方案 V8.44 的评测部分停在腾讯轮七面（六环节/过程双指标/异常分桶/发布门禁/坏题回流/A-B/Skill 治理），**没有**百度轮的能力。simharness 侧更严重：

1. **完全没有评测接入**：`aipay-scenario.sh` 无任何 `/api/hermes/eval` 调用；步 19 只要求测试报告模板里有评测节，数字靠人填。
2. **库未隔离**：Studio 以 `HERMES_WEB_UI_HOME=$SIM_ROOT/webui` 启动（`mux/mx-lib.sh:554`），但 eval/redteam/heldout 使用各自的 `homedir()` 默认路径，落宿主 `~/.hermes-web-ui`，跨轮继承且 `mx-clean` 不清。
3. **trace 目录未接**：评测 runner 读 `EVAL_TRACE_DIR`，采样器读 `HERMES_TRACES_DIR`；sim 的轨迹在 `$HERMES_ROOT/traces`，两边都没设，证据端点必报「trace 不存在」。
4. **报告不消费评测**：`mx-report-gen.py` 只在步 19 核对模板字符串，第 9 章无评测证据面；`final-report-merge.py` 的 PART1 度量表只有流程/关卡/问题单/测试成效。
5. **清理不重置**：`mx-clean.sh` 不清 eval/redteam/heldout，0→1 轮会带着旧评测集、红队历史与留出题库尝试预算。

## 2. 设计决定与理由

- **G4-E 作为 G4 子门，而不是新增第七闸**：26 步与六闸名称保持冻结（与 V8.44 的承诺一致），评测作为 G4 的第 ⑨ 项判据。PASS 置 `g4_eval_pass`；GAP 记单放行（缺口如实呈现，不拿基础设施缺席冒充通过）；FAIL 不置 `g4_pass`，G5 的 `gate_blocked` 自然拒入。这样「评测不过不放行」有机械执行面，同时保留「证据缺口记单可审」的既有治理语义。
- **评测运行基于测试报告证据，不重放 agent**：全流程轮没有稳定的 agent 重放通道；用测试报告原文作 inline evidence，对三条断言（REPORT-DONE 结论行、用例/回归结论、无密钥泄露）做 S0 机械判分，k=2。诚实边界：这是对「测试证据」的评测，不是对 agent 行为的端到端评测；报告与 spec 都写明。
- **红队走产品引擎而非另造**：`POST /redteam/runs` 的 S0 检测器与生产 ToolResultGuard 同源；种子库/变体同时建（24+114），红队运行取 3 代×20 个体。逃逸率只作观测，硬阈值只保留良性误报 ≤20%。
- **库隔离放启动 env，不放脚本临时导出**：`ensure_studio_up` 是 Studio 启动 env 的单一事实源（mx-up 也调用它）；在 `mx-lib.sh` 统一注入 `EVAL_STORE/REDTEAM_STORE/HELDOUT_STORE/EVAL_TRACE_DIR/HERMES_TRACES_DIR`，避免每个调用点各写一遍。
- **判据集中在 Python 汇总器**：`mx-eval-summary.py` 读六个 JSON，输出 PASS/GAP/FAIL + 原因 + 报告用摘要。Bash 只负责调用与落 state；这样判据可单测（fixture 三态）、可复算、报告与门禁同源。
- **报告只读 eval-summary.json**：第 9 章证据八、PART1 评测行、叙事骨架槽位全部消费同一文件，禁止各自解析运行报告。
- **评测帧单独登记**：`eval_done` 挂步 19/20，URL `/app/eval`，动作点击「指标治理」页签；不占 §5.6 必采 15 项分母，作为 G4-E 的操作证据。
- **不设自造阈值**：红队逃逸率、维度覆盖、装饰指标数、金字塔层状态只作审计/复盘观测；硬阈值仅 unknown ≤10%、红队良性误报 ≤20%、线上证据（QPS 达成 ≥90%、错误率 <1%、p99/p50 ≤2；简单 p95 ≤5s、复杂 ≤15s）。理由：没有历史水位就定及格线等于编数。

## 3. 实现映射

### 3.1 方案正本（overlay）

`docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md` 升 V8.45：

- 版本段 + 词表新增 13 个术语 + §2.3 评测治理层指针。
- §2.6.3 增第 11 条并修正「成效口径四」笔误。
- 新增 §2.6.7 评测治理层：七件机制表、B1-B7 配套、三处命名边界、四条消费纪律。
- §2.5 评测面、§3.3 评测键（不新增步）、§4.4 表三 6 行、§5.2 步 19/20/24/26、§5.3 G4 ⑨/G5 ⑧、§5.4.4 评测治理面七件、§5.5 评测治理面验收、§5.7.1 设计期基线、§5.8.3 六行、§5.8.4 阈值归属、纪律 79/80。

### 3.2 程序与脚本（simharness）

| 文件 | 变更 |
| --- | --- |
| `mux/mx-lib.sh` | `ensure_studio_up` 注入五个评测环境变量（三库 + 双 trace 目录） |
| `mux/mx-eval-lib.sh`（新） | `eval_api/eval_json_get/eval_report_text/eval_ensure_set/eval_ensure_run/eval_ensure_redteam/eval_collect/eval_summary/eval_flow/evalops_snapshot` |
| `mux/mx-eval-summary.py`（新） | 读六 JSON → 三态判据 + `eval-summary.json` |
| `aipay-scenario.sh` | source 评测库；步 20 调 `eval_flow` + 两次采集；FAIL 不置 `g4_pass`；步 24/26 调 `evalops_snapshot` |
| `mux/mx-clean.sh` | 归档并清空 `webui/{eval,redteam,heldout}` |
| `mux/mx-prelaunch-check.sh` | 新增 ㉓ 评测接线（库存在/G4 子门/报告消费/语法）；计数 22→23 |
| `mux/spec-params.env` | 新增 G4-E/unknown/红队误报/进化规模/相似度/维度覆盖 6 行 |
| `mux/templates-pending/test-report.md` | §8 增七行；§9 判据 11-15 |
| `mux/mx-report-gen.py` | 新增 `eval_summary_html()`（证据八）+ 步 19 五条正则 |
| `mux/final-report-merge.py` | 读 eval-summary，PART1 增四行 + 六个 `{{eval_*}}` 槽 |
| `mux/mx-narrative-skeleton.py` | PART1 增评测子门槽位 |
| `mux/capture-plan.env` + `mux/r18-collect.py` | `eval_done` 采集位与步号 19 |
| `tests/eval-metrics-template-sync.test.ts` | V8.45 同步断言（模板/参数/生成器/预检） |
| `tests/eval-fullflow-integration.test.ts`（新） | 结构守门 + 汇总器三态 fixture（PASS/FAIL/GAP） |
| `tests/harness-gate-integrity.test.ts` | prelaunch 计数 23 |

## 4. 验证账

- simharness：`MX_OVERLAY_ROOT=/Users/cuishi/lab/ncwk/overlay bash tests/run-gates.sh` → **rc=0，189/189 通过**（含新 integration 8 例与更新后的 sync 6 例）；shell gates 全 PASS。
- 新增 fixture 三态：PASS（全门禁项通过）/ FAIL（红线、unknown 超限、锚点漂移）/ GAP（覆盖 0/7、红队缺席、线上证据未回填）均按预期退出 0/1/2。
- 方案正本：21 处定向编辑全部命中锚点；新增 §2.6.7/§5.7.1/纪律 79/80；§5.3 G4 ⑨、G5 ⑧；报告证据八与 PART1 行。
- 未做：真实 SIM 栈（synapse/gateway）下的端到端 `eval_flow` 实跑——本机当前跑的是产品开发服务，不是推演 SIM 栈；该链路需在下一轮推演开跑时首验（prelaunch ㉓ 已把接线缺陷前置拦截）。如实登记，不冒充已验证。

## 5. 决策记录

- **D1**：新增 G4-E 子门而非第七闸——保持 26 步/六闸名称冻结，评测作为 G4 的第 ⑨ 项判据；FAIL 阻断、GAP 记单放行。
- **D2**：评测样本用测试报告原文（inline evidence），不重放 agent——当前无稳定重放通道；诚实标注「测试证据评测」。
- **D3**：红队用产品 `/redteam/runs` 引擎（S0 与生产护栏同源），不另写检测器；种子/变体同时落库。
- **D4**：三个评测库与两个 trace 目录在 `ensure_studio_up` 统一隔离到 SIM_ROOT；`mx-clean` 归档三库。
- **D5**：判据单一源=`mx-eval-summary.py`；Bash 只调用与落 state，便于 fixture 单测与复算。
- **D6**：报告只读 `evidence/evals/eval-summary.json`；证据八/PART1/叙事槽同源。
- **D7**：硬阈值只保留 unknown ≤10%、红队良性误报 ≤20%、线上证据三项；逃逸率/覆盖/装饰数不设及格线。
- **D8**：评测帧 `eval_done` 不占必采 15 项分母，作为 G4-E 操作证据。
- **D9**：prelaunch ㉓ 把「库存在/G4 子门/报告消费/语法」四件前置拦截，旧树开跑即红。
- **D10**：真实 SIM 栈端到端未执行，留待下一轮推演首验；不在本轮冒充完成。

## 6. 边界

- 不做 agent 重放评测、不接 S1 裁判到红队、不做检索切片级归因、不做 CI 自动触发（与产品侧边界一致）。
- 不设红队逃逸率/维度覆盖的硬阈值；待三轮后按 §5.8.4 控制线用实测水位建立。
- 评测集内容不进报告（只进聚合读数）；密封集证据端点 403，报告只能看聚合。
- 本轮的 `eval_flow` 失败会把 G4 卡住；运维处置=修环境后重跑该段（`eval_flow` 幂等：同名集/重复运行可复用）。
