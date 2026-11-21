# simharness — AIStudio 全流程推演 harness

让 15 个 AI 员工组成一家虚拟软件公司，从拿到需求单到功能上线全程自动跑一遍，中途采集证据，最后产出一份第三方可反查的 HTML 报告。本目录是这场"考试"的驱动与工具链，原为独立仓，2026-10-24 并入 AIStudio 单仓。**定性（2026-11-21 立法）：推演程序本质上是治理程序**——六道强制关卡、审计环、判词与证据链、净额度量、烧机收据不是「跑一遍看结果」的功能面，而是对 AI 组织实施治理的执行形态；判读正本在产品治理域（`custom/server/governance/`），本目录是治理的驱动与执行层，按治理正身对待（非脚手架、非临时配套）。**归宿（2026-11-21 立法，精确表述）：推演程序中的组织、治理、串联类功能＝研发治理和协作的能力**——组织（roster/角色/团队编排/board 围栏）、治理（六闸/审计/判词/台账/熔断）、串联（26 步主链/派单链/审批传输）三类脱离推演语境本身即产品能力，推演是其高强度验证场景；这些能力面按 P1-P4 路线图（spec 2026-11-21-sim-product-absorption-roadmap）逐批产品化，本目录最终收敛为薄执行层直至退役。环境供给/采集/场景数据＝推演设施，不属能力归类。

**P4 归档预备态（2026-11-21 P2-P4 收尾批）**：能力面已全部产品化——P1 对账（simrun 监督域三端点＋/app/sim 六面板＋graph-rest 全套）、P2/P3 本批（场景库＋拍摄位注册表 REST 投影，补丁 811）、驱动绑定在案（supervisor `spawnDriver` 直 spawn aipay-scenario.sh，产品端点 start→真实驱动）。**归档执行挂 SIM 重建端到端验证**（实体缺席，验收不可伪）；届时场景/capture-plan 数据随归档迁移，REST 端点按 fail-soft 空态语义继续可用。主驱动脚本按 26 步推进，六道强制关卡（G1 需求冻结到 G6 复盘）不过不放行，全部结论带代码提交号+任务卡号双凭证。

> **运行基面现状（2026-11-21 状态同步批）**：SIM 实体环境已随 2026-11-18 归档轮拆除（SIM_ROOT 仅剩 logs/，42 profile 与 agent-src 供给不在）；下次推演由 `mux/mx-setup.sh` 从零重建，重建即对齐宿主当前基面（hermes-agent v0.23.3＋runtime 清单 71 件，含 watchdog hostile-load 热修承载）。程序本体无需版本适配：4d config 盖章走产品自身 `migrate_config` 幂等迁移（版本自适应），agent 供给链 `deploy-agent-runtime --runtime` 独立于宿主安装树。

与产品本体的关系（2026-10-27 融合批）：六闸判读/判词/熔断/UAT/配对/台账阈值/评测判据/治理指标的计算正本在产品治理域（`custom/server/governance/lifecycle|run-metrics`、`custom/server/eval/e2e-verdict`），本目录经 `mux/governance-client.sh` 调用并落证据（fail-closed：服务不可达=空判词/缺件/阻断，不假过）；启动/脚手架自监测/导演串接/截屏/集群视野/报告撰写保留在此。产品源码在本仓根，`vendor/` 是钉版基线，`custom/` 与 `patches/` 是 AIStudio 二次开发。本目录只消费产品、不改动产品，隔离边界由 `tests/isolation-boundary.test.sh` 三断言看守。推演方案唯一正本=[《AIStudio 全流程推演方案》](../docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md)，26 步主链、六道关卡、验收标准都在那里，本 README 不重复。

## 前置

- macOS + bash 3.2 兼容（驱动内 `LC_ALL=C` 已焊死，勿改）
- python3、node（playwright 走系统 Chrome，channel:'chrome' 免下载缓存）
- 推演执行面 SIM_ROOT 挂载在 `/Users/cuishi/lab/ncwk-sim-mux`（运行态、runs/、creds/ 都在那里，不写宿主 `~/.hermes`）

## 快速上手

```bash
cd simharness
bash mux/mx-setup.sh                  # 环境供给：账号/看板/团队/记忆库/中央仓，可反复跑
bash mux/mx-up.sh                     # 起单 gateway(:8801) + 单 studio(:8802)
bash mux/mx-prelaunch-check.sh        # 开跑前三十四项核验，全绿才开跑
bash mux/mx-run.sh --run <轮次>       # 26 步一键推演（单入口＝监督器自愈＋驱动一体；勿裸跑 aipay-scenario.sh——熔断退出后无人续跑，run25 实锤 34min 断摆）
```

断点续跑 `START_STEP=<步名>`，区间上界 `UNTIL_STEP=<步名>`，换需求轮 `RFD_ID=RFD-00X`。0→1 清环境用 `bash mux/mx-clean.sh --apply --reset-central --reset-workspaces [--reset-memory]`。

## 目录导航

| 路径 | 是什么 |
|---|---|
| `aipay-scenario.sh` | 主驱动：26 步逐段推进、关卡判读、凭证核验、回灌打回 |
| `mux/` | 工具链：环境供给与清理（mx-setup/mx-up/mx-clean）、报告生成与审计（mx-report-gen/mx-report-audit/final-report-merge）、证据采集（r18-collect/r18-frames/capture-ui）、Harness 运行面快照（mx-harness-snapshot.sh）、帧拍摄位注册表（capture-plan.env）、术语词表（glossary.txt） |
| `materials/` | 需求单（RFD-001 收银台等，含 OCR 样张），换轮换单 |
| `tests/` | 守门套件：vitest 143 测（run-gates.sh 入口）+ 隔离边界三断言 |
| `mux/run13-lite-round-plan.md` | lite 回归轮设计正本（夹具三类与边界代价） |

## Harness 运行面证据（V8.42）

产品侧 2026-10-18 落地九层运行底座（工具契约/审计 v3/身份与委托/审批凭证/运行清单/
预算/沙箱/恢复判定/评测）。推演在两个时点固化证据：

```bash
# 开跑基线（驱动 smoke 步自动调用）与合规审计时点（驱动步 23 自动调用）
bash mux/mx-harness-snapshot.sh --out <run>/evidence/harness/harness-summary.json --token <JWT> --require
```

快照写 `harness-summary.json` + `harness-summary.md`，报告第 9 章「证据七：Harness 运行面」
引用；端点缺席如实标 ⬜ 并记问题单，不阻断主链。prelaunch ⑳ 检查生效 dist 是否含六个新端点。

## 新能力探测（2026-11-03 立；2026-11-04 扩组至十三组；同日 W4 扩至十四组，方案 §5.11）

只有 HTTP 面、无独立 UI 承载的新能力（主动性介入治理／交接质量账本／确定性验收断言／主张-回执核验／
组件库与多目标搜索／探测并发与调度面／派单容量准入，2026-11-04 增：四性四格判据／项目一级状态机
与拓扑／编码执行记录／环境变量编辑面／权限变更审计／技能导出三道限）截图采集位采不到，改用端点级
探测取证。驱动 testpass 步（2026-11-04 接线）对生效 studio 自动全量探测；手动补跑：

```bash
node mux/mx-capability-probes.mjs --base http://127.0.0.1:8802 --out <run>/evidence --token <JWT> --profile default
```

产物 `capability-probes.json`（十四组正例读数＋负例判决）；退出码非 0 即 G4 不通过（驱动当轮拦截，
不靠报告期追认）。负例是能力的存在理由——「不可判定不放行」「未引用判未验证」一旦静默放行，能力
即失效。第 4 组无证据台账、第 9 组无带 project_id 的未终结项目时只跑可得例并写明缺省理由（如实缺省
而非跳过）；状态机端点只打不落库的拒绝分支（探测纪律：只读不写业务数据）。
脚本自身守门：`tests/capability-probes.test.ts`（十三组齐、服务不可达时仍写产物并退 1）。

## 工作台 IA 与采集位（V8.44/V8.55）

产品工作台为「日常侧栏三组（常用/流程/专题）＋页脚系统设置＋六阶段页单层页签（37 签）＋全流程推演独立专区（七项：导演台/监督面板/运行监控/证据库/运行编排/业务地图/推演设置）＋顶部检索弹窗」，治理中心壳解体、`/app/gov/*` 除 settings/model-providers 两个实页外 redirect 到阶段页，IDE 任务工作区让文件树/终端/记忆/新会话跟随 kanban 任务根。2026-10-27 检索并入顶部统一弹窗，左侧常用组不再保留独立检索项；`/app/search` 只作兼容唤起，`r18-frames` 拍检索帧时会重开并断言弹窗可见。推演侧同步：

- `mux/capture-plan.env` 26 步拍摄位迁到阶段页规范 URL（`/app/stage/<阶段>?tab=<页签>`）；旧路由只作 redirect 兜底。
- `mux/steps_entry.py` 26 步入口表按左侧导航＋阶段页签重写。
- `mx-prelaunch-check` ⑲ 扩为左栏/阶段页签/全流程推演/检索四组标记，新增 ㉑ 任务工作区端点、㉒ 阶段页签与重定向矩阵。
- 新增 IA 面帧：左栏、阶段页签、全流程推演、检索、IDE 任务工作区（不占必采分母 15）。
- 对账正本=`../docs/superpowers/specs/2026-10-18-fullflow-v844-workbench-refactor.md`。

## 测试

```bash
bash tests/run-gates.sh              # 守门套件全量（每轮收尾前全绿是准入门槛）
bash tests/isolation-boundary.test.sh
```

## 深入阅读

- 推演方案（怎么考、怎么算过）：仓内 [《2026-10-05-mux-v8-fullflow-plan.md》](../docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md)
- 历史沿革与工程档案（历轮事故、补丁谱系、运维规范附录）：同目录 [《2026-10-05-mux-history-and-engineering-archive.md》](../docs/superpowers/specs/2026-10-05-mux-history-and-engineering-archive.md)
- 推演监控与断点续跑的运维手册：见工程档案附录 C
