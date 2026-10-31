# prelaunch 新增 ⑩b：中央仓轮次工件跨轮残留硬门（run24 污染根治批）

日期：2026-10-31 ｜ 类型：test（harness 开跑前置检查扩展）

触发：run24 污染事故（用户裁定 A 停跑清场重开）。起跑流程未清场＋prelaunch 无对应检查——run23 遗留的 `docs/analysis/AN-*.md` 四份系分与 `docs/design/RFD-001-architecture-design.md` 概设稿令 run24 假真值：驱动「仓库出现 AN-XX ✓」真值锚命中旧文件、系分段被跳过、值守连续两轮误报「系分齐/概设落仓」（误信驱动日志未核 git 归属）。run15 ⑩ 已根治分支面（feat/DEV-* 残留），工件面是同类坑的未泛化面——一个问题进来，一类问题出去。

## 1. 变更

1. `simharness/mux/mx-prelaunch-check.sh` 新增 ⑩b（插于 ⑩ 分支检查后）：判据=`origin/main` tip 的轮次工件七目录（requirements/analysis/design/plan/test/delivery/acceptance）零文件；环境豁免 `PRELAUNCH_ALLOW_CROSSRUN_RESIDUE=1`（同轮续跑显式声明，声明式优于猜测式——prelaunch 本体无轮次上下文，不做自动首跑判定）。计数同步「三十项」→「三十二项」。
2. 判定面刻意排除九个跨轮基础目录（admin/architecture/governance/issues/materials/release/runs/security/test-design）——mx-clean 清空提交（309f101 实录）设计内保留的公司资产（架构基线等），首轮绿测误红（architecture/overview.md）后修正。
3. 计数同步四处：`simharness/README.md`、方案正本 §4.1 prelaunch 行、`tests/harness-gate-integrity.test.ts:1380`、`tests/v846-governance-closure.test.ts`（2 处）——「三十项」→「三十二项」。

## 2. 决策记录

| # | 决策 | 理由 | 否决的备选 |
|---|---|---|---|
| D1 | 判定面=七目录而非全 docs/ | mx-clean 设计内保留九个跨轮基础目录（architecture=架构基线等公司资产）；绿测实测误红后收敛 | 全 docs 除 admin（否决：漏豁免 architecture 等八个基础目录，干净态误红） |
| D2 | 环境豁免而非自动判定首跑 | prelaunch 本体无 RUN_ID 上下文；断点续跑场景显式声明优于脚本猜测 | 自动检测 state.env 步键（否决：prelaunch 与 run 目录耦合，改变其轮次无关语义） |
| D3 | 检查项落在 prelaunch 而非驱动 smoke 步 | prelaunch 是「开新轮前核验」唯一收口位；驱动内加=混淆执行与准入 | 驱动内检查（否决：职责错位） |
| D4 | 计数文案全链同步（六处） | 单一事实源纪律：检查项数在 prelaunch/README/方案/两测试出现即须同批对齐 | 只改 prelaunch（否决：守门测试断言「三十项」当场红） |

## 3. 验证

- `bash -n` 过。
- 绿测：当前清场后干净态（origin/main=309f101 清空提交+本轮 M1/M2 admin 产物）七目录零文件 → 判定 PASS（实测）。
- 红测：以清场前 tag `mx-clean-20261031-212740^{commit}~1` 模拟污染态 → 正确检出 `docs/acceptance/RFD-001-acceptance.md`（实测）。
- 事故链实测：清场时 mx-clean 自身回读「九目录零残留＋历史截断深度=1」＋分支 SHA 保底 tag（mx-clean 既有输出，非本批新增）。

## 4. 设计文档影响

DESIGN_SYNC: touched——方案正本 §4.1「开跑前三十项核验」行随批改「三十二项」并含 ⑩b 描述；本文件即其 spec。闸名/26 步/判据数值零改动。
