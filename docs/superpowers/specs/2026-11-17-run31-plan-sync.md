# 2026-11-17 run31 开跑前方案程序同步批（五批能力吸收＋开跑门衔接）

## 变更

run30 后五个产品批（main 52ec7f384 proactive 清偿／950655d05 超级智能体批二／6dab0115a Ekko UI Surface／40d1affc8 Always-on 五组件／b1312b8aa LoopForge 可信 SOP 执行地板）已各自随批 DESIGN_SYNC 落 `docs/DESIGN.md`，但推演侧的正本与程序未吸收。本批四件：

1. **方案正本新增 §5.15**（`2026-10-05-mux-v8-fullflow-plan.md`）：五批能力面进推演验收与判读口径——Always-on 三 watcher 运行态取证与 dreaming sunset 判据、proactive/always-on/kanban version 探针组（§5.11 表新增行，组号以 `mx-capability-probes.mjs` 落地序为准）、complete 语义新口径（expected_version 409＋verification 档位 fail-closed）、LoopForge 完成判读口径（archived 不算成功／DryRun 仅显式 shadow）、Ekko autoinject 对 fleet 托管 MCP 装配面的取证、studio preload 安全加固随 N31-4 重烧。
2. **数字总账刷新**（`2026-10-23-swarmstudio-design-ledger.md`）：§C 七行随载体真值进位（studio v0.8.21／Ycode 3.18.2／驾驶舱 0.8.20-studio.3／teams v0.23.1-team.3／yuan v2.100.4／整体包 1.0.16-overlay，核实日 2026-11-17）＋§A 新增「卡级验证三档」行（批二契约）。
3. **VENDOR.md zcode 表行补正**（VENDOR_SYNC=1 通道）：11-13 双升级批将 zcode 同步至 `fec97590`（包版本 3.18.2），台账行在 merge 环节被 pre-commit 撤出漏入（同型坑第四次，b8b6202c0 补正只救回 studio 行）——本批补 zcode 行。
4. **开跑门衔接**：N31-4（重烧收据 verify-latest pass）＋N31-5（起跑窗 09:00-11:00）确认为 run31 开跑硬门；N31-1/2/3 为收官回写项不阻塞开跑（台账 `2026-11-14-run31-pending-batch.md` 口径不变）。

## 决策记录

1. **Mechanical·Always-on 必须进推演验收面**：三 watcher（followup 15s／dreaming 1800s／deferred 10s）在 gateway 进程内常驻，推演起服即在跑；dreaming 的机制预算 sunset 判据是「连续两轮推演零 dream 产出即退役」（`2026-11-16-always-on-agents-absorption.md`）——不进验收面则退役裁决永远无法执行。落法：起跑后与收官各取证一次（evidence/always-on-watchers 件）＋outbox/run-outcome REST 进探针组＋报告必带 dream 产出计数（缺席如实记 0）。
2. **Mechanical·run31 任务书不强制 verification 档位卡**：卡级 verification 三档的 fail-closed 路径已有单测与探针负例覆盖；在交付任务书强制 independent/strict 档会给验收环叠加新依赖（完成卡需二次验证），拖 G2 风险大于收益。档位卡活体留 run32 可选标定项；值守与审计判读「旧快照写回 409」为新正确行为不计缺陷。
3. **Mechanical·LoopForge 判读口径以 graph 新语义为准**：archived 不算成功（DONE_STATUSES 收窄）、DryRun 仅显式 shadow 可注入、RunSpawner/ShadowRunner 维持 legacy-unpinned 兼容态——run31 缺省 preset 派发（§5.14 第 6 条），遇 422/409 稳定码按新口径解读。
4. **Mechanical·总账 §C 滞后清偿**：核实日停在 2026-11-09（v0.8.20/1.0.15 时代），设计导读已先于总账本体指向 v0.8.21——按维护规则 3「先载体后本表」本批随载体真值对齐，并在核对尾注记录 zcode 台账行补正的来龙去脉。
5. **UserChallenge·范围确认**：用户 2026-11-17 指令「根据近期设计及实现变化，更新整体设计、全流程推演方案及推演程序，然后启动下一轮全流程推演（设置定时轮询值守）」——整体设计面经查五批已随批同步无欠账（本批仅总账滞后与 VENDOR.md 漏行），无需改 `docs/DESIGN.md` 正文。

## 验证

- 方案正本：§5.15 落节后 grep 锚点自检（run31/§5.14 第 6 条/N31-4/N31-5 交叉引用在位）。
- 总账：§C 七行与载体文件逐行对读（`vendor/VENDOR.md`／`RELEASE-NOTES.md`／`team/VERSION`／`skills/swarm-yuan/CHANGELOG.md`／`package.json`／`vendor/zcode/package.json` 实测值即本表值）。
- VENDOR.md：zcode 行与 `vendor/zcode/package.json`（3.18.2）及 11-13 批 spec（fec97590）三方对读。
- 索引一致性：`node scripts/maintenance/gen-doc-indexes.mjs --check` 过（本 spec 新增随批 --write）。
- 批级：本批为纯文档批，无代码测试面；批次整体验证=合并前 `npm test` 全量（与批 M/P 同窗收口）。

## 设计文档影响

DESIGN_SYNC: touched。修订点：`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md` §C 版本基线七行随载体进位（v0.8.21／3.18.2／v1.0.16 族，核实日 2026-11-17）＋§A 新增「卡级验证三档」行。整合正本与另两份设计 spec 经查五批已各自随批同步（Always-on §3.6.1／Ekko 能力域／§6.4 图执行可信地板行均在位），本批不动其正文；vendor 台账 zcode 行为独立账本，走 VENDOR_SYNC=1 通道随批第二笔提交。
