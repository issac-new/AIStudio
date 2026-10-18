# simharness — SwarmStudio 全流程推演 harness

让 15 个 AI 员工组成一家虚拟软件公司，从拿到需求单到功能上线全程自动跑一遍，中途采集证据，最后产出一份第三方可反查的 HTML 报告。本仓是这场"考试"的驱动与工具链：主驱动脚本按 26 步推进，六道强制关卡（G1 需求冻结到 G6 复盘）不过不放行，全部结论带代码提交号+任务卡号双凭证。

与 [overlay](../overlay) 的关系：overlay 是产品本体仓（SwarmStudio 二次开发），本仓只消费产品、不改动产品——隔离边界由 `tests/isolation-boundary.test.sh` 三断言看守。推演方案唯一正本=[《Swarm Studio 全流程推演方案》](../overlay/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md)（26 步主链、六道关卡、验收标准都在那里，本 README 不重复）。

## 前置

- macOS + bash 3.2 兼容（驱动内 `LC_ALL=C` 已焊死，勿改）
- python3、node（playwright 走系统 Chrome，channel:'chrome' 免下载缓存）
- 推演执行面 SIM_ROOT 挂载在 `/Users/cuishi/lab/ncwk-sim-mux`（运行态、runs/、creds/ 都在那里，不写宿主 `~/.hermes`）

## 快速上手

```bash
cd simharness
bash mux/mx-setup.sh                  # 环境供给：账号/看板/团队/记忆库/中央仓，可反复跑
bash mux/mx-up.sh                     # 起单 gateway(:8801) + 单 studio(:8802)
bash mux/mx-prelaunch-check.sh        # 开跑前二十二项核验，全绿才开跑
RUN_ID=<轮次> bash aipay-scenario.sh  # 26 步一键推演
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

## 工作台 IA 与采集位（V8.44）

产品 2026-10-18 把工作台改为「左侧导航五组（常用/流程/整轮/专题/管理）＋六阶段页单层页签（29 签）＋全流程推演独立专区（6 签）＋检索页」，治理中心壳解体、`/app/gov/*` 全部 redirect 到阶段页，IDE 任务工作区让文件树/终端/记忆/新会话跟随 kanban 任务根。推演侧同步：

- `mux/capture-plan.env` 26 步拍摄位迁到阶段页规范 URL（`/app/stage/<阶段>?tab=<页签>`）；旧路由只作 redirect 兜底。
- `mux/steps_entry.py` 26 步入口表按左侧导航＋阶段页签重写。
- `mx-prelaunch-check` ⑲ 扩为左栏/阶段页签/全流程推演/检索四组标记，新增 ㉑ 任务工作区端点、㉒ 阶段页签与重定向矩阵。
- 新增 IA 面帧：左栏、阶段页签、全流程推演、检索、IDE 任务工作区（不占必采分母 15）。
- 对账正本=`overlay/docs/superpowers/specs/2026-10-18-fullflow-v844-workbench-refactor.md`。

## 测试

```bash
bash tests/run-gates.sh              # 守门套件全量（每轮收尾前全绿是准入门槛）
bash tests/isolation-boundary.test.sh
```

## 深入阅读

- 推演方案（怎么考、怎么算过）：overlay 仓《2026-10-05-mux-v8-fullflow-plan.md》
- 历史沿革与工程档案（历轮事故、补丁谱系、运维规范附录）：同目录《2026-10-05-mux-history-and-engineering-*.md》
- 推演监控与断点续跑的运维手册：见工程档案附录 C
