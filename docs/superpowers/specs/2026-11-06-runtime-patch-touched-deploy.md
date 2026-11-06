# 2026-11-06 挂账清偿批：runtime deploy 补丁触碰面派生（N-1 根治）

> 来源：v0230 换血批挂账 N-1（spec `2026-11-06-vendor-upgrade-agent-v0230.md`）——runtime-manifest.json 只收补丁**新增**文件，补丁对既有文件的修改（601 agent_init 接线、470 collab_event_id 等）从未进部署面，宿主接线历史上依赖「谁记得谁手工同步」（v0230 批 14:44 手工 149 件、发版批 9b4ad890f 8 件回灌都是此缺口的事故级补丁）。本批根治为机制：deploy 器动态派生补丁触碰面，随 inject 出口自动到达宿主。

## 变更

1. **新增纯函数库 `scripts/platform/deploy/patch-touched.mjs`**：`deriveAgentPatchTouchedFiles(patchDir, seriesText)` —— series（planner.parseSeriesText 同口径）逐枚补丁 routePatchTarget 判 agent 面，解析 `diff --git a/X b/Y` 头取触碰文件（Y=/dev/null 记 deleted 不参与同步），返回 `{ files, deleted, agentPatches }`。单一事实源=planner 路由＋series，不引入第二份清单。
2. **`scripts/deploy-agent-runtime.mjs` 接线**：默认清单模式（无 `RUNTIME_DEPLOY_MANIFEST` 覆盖）且 manifest 未显式 `agentPatchSync:false` 时，把派生面（源根=`vendor/hermes-agent` 注入态、与 manifest.files 按 dest 去重）并入同步循环，走同一 diff→copy→backup→保留语义；汇总行增「补丁触碰 N」段；测试隔离面（env 覆盖 manifest）零行为变化。
3. **守门测试 `scripts/__tests__/deploy-patch-touched.test.ts`**：纯函数三形态（改/增/删）＋studio 补丁不入集＋真仓断言（agent_init.py/hosted_rooms.py ∈ 集合，742 退役不在，规模 >100）＋deploy 器接线源码级断言。
4. **顺偿 v0230 批 N-2/N-3 收口记录**（见验证节）：N-3 由并行批 fix-platform-restore（06fd2a1e2）根治、本批验收复跑；N-2 网关重启完成＋途中根治两个拦路事故（launchd 域 pytest 污染 job 隔离；宿主 hostile_load 半套热修 3 文件存档还原——均为仓外运行态事故，存档 /tmp/v0230-stray-quarantine/）。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 派生式（读 series 现算）而非静态清单（manifest 加 patchTouchedFiles 数组） | 静态清单必随补丁增删漂移（v0230 批 N-1 处置建议已预判）；派生式单一事实源=series，补丁变即变零维护 |
| D2 | 同步源=vendor/hermes-agent **注入态**（非 pristine 非 runtime/ 模板） | 触碰面语义=「补丁把文件改成了什么」，只有注入态承载该真值；runtime/ 模板仅 manifest.files 62 件的镜像面，职责不混 |
| D3 | 默认启用、`agentPatchSync:false` 显式关断；env 隔离面（RUNTIME_DEPLOY_MANIFEST）不启用 | 根治的意义=不依赖人记得；测试隔离面必须稳定（deploy 测试夹具无 patches/ 上下文） |
| D4 | 删除态文件（补丁删了上游文件）不同步删除目标，仅统计报告 | 宿主树是 git checkout＋工作态，删文件属 git 域；deploy 只做文件级同步，不做树形管理（越界=新机制） |
| D5 | 纯函数独立模块而非 deploy 器内联导出 | deploy-agent-runtime.mjs 顶层执行无 main() guard，import 即副作用；独立库测试零成本（planner.mjs 先例） |
| D6 | 主检出 9 件手工回灌让位并行批正本（9b4ad890f，8 件+T3 颤振嫁接） | 并行发版批同窗踩同一预检死锁且内容更全（新行为面）；本批工作树回灌未提交，无合并冲突，直接弃 |

## 验证

- [x] N-3 验收：npm test 全量 **8518 passed / 0 failed / 11 skipped**（v0230 批 27 红全清；根因=cognition 合入回退事故，由 fix-platform-restore 06fd2a1e2 根治，本批独立复跑确认）。
- [x] N-2 网关重启：宿主网关 PID 59117（15:16:53 起）加载 v0.23.0＋149 件接线，完整启动序列（dispatcher/cron 50 profile/housekeeping）走完稳定运行；launchd KeepAlive 域（ai.hermes.gateway 正本 job）恢复常压。
- [x] 途中事故一（launchd 污染）：`ai.hermes.gateway-c59eda72` job 的 plist 文件内容为 pytest 夹具命令（/private/tmp/pytesttree 指向）——测试污染用户域遗留，bootout＋plist 移隔离区。
- [x] 途中事故二（半套热修）：宿主工作树 14:18 被（来源不明）写入 hostile_load 消费端（config.py/run_startup.py import）而定义端（shutdown_watchdog.py）缺失→网关 ImportError 死循环；3 文件存档后 git checkout 还原 v0.23.0 基线，网关即起。热修正身待其属主补全定义端或走补丁正道（若属仓外第三方热修，建议入 patches/）。
- [x] 守门测试 **10/10**（纯函数三形态/夹具树/真仓断言 601·470·759 锚点/接线源码级/预检死锁防回归）；实现中实测定谳：git 删除文件头 b 侧仍是文件名（/dev/null 只在 +++ 行），段式解析修正。
- [x] dry-run 三语义：未注入检出（触碰跳过 47/待收口 46）仍 **complete 不卡 inject 预检**；独立 --apply 触**降级哨兵**（源缺失>0 跳过整个触碰面防 pristine 覆盖宿主接线）＋警示；完整链路（先注入后部署）哨兵放行。
- [x] worktree 全链 inject：**469 applied（90+759 agent／370 studio／8 zcode）、759 direct、出口 deploy 清单 62＋触碰 94｜相同 155｜收口 1（shutdown_watchdog.py，恰为 N-2 途中人工还原件——机制自动收口实证）｜RESULT complete**；宿主接线面经此链全对齐注入态。
- [x] 全量 `npm test`（合并前门）：8523 passed / 5 failed——5 例定谳＝2 例本批漏登记（新 spec 未进 A.1/design 索引，守门当场拦下，补登记后定向复验 34/34）＋3 例 route-manifest（worktree vite-node 跨树解析伪象，main 上绿，前批已定谳同型）。

### 收编 759（变更 5）

T3 颤振嫁接收编入链：发版批 9b4ad890f 以 runtime 模板/宿主直改形态交付 runaway `file_edit_thrash`（40 行纯增量单文件）未落 patches/——触碰面收口会将其冲掉（宿主行为变更必须落补丁链的仓规执法面）。本批以预演仓注入态 diff 生成 **759-agent-runaway-file-edit-thrash.patch** 入 series（agent 补丁 90→91），正身在预演仓（90 补丁尾）direct 验证。

## 设计文档影响

DESIGN_SYNC: none —— 纯 scripts/ 部署器增强＋测试，无设计文档载体面变更（runtime-manifest.json schema 加可选键 `agentPatchSync` 属向后兼容 additive，正本注释随代码；无整合正本/数字总账触及）。
