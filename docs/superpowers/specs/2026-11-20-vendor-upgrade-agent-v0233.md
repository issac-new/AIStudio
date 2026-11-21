# 2026-11-20 vendor 升级批：hermes-agent v0.23.2 → v0.23.3

> 上游身份：v0.23.2 = `ae2a81ccc` → v0.23.3 = `caafe5389a`（上游 2026-11-19 发布），1675 提交 / 3948 文件 / +222,379 −96,154（规模仅次于 v0.23.2 轮 8154 提交）。主题分布：plugin-catalog ~460 提交（含 chore(catalog) 162）＋**state 层 breaking 大重构**（`be3d6affc8 refactor(state)!: remove the old session store`——根层 60+ `hermes_state_*.py` 族整删，合并为 `persistence/` 包＋`hermes_state.py`/`hermes_state_common.py`/`hermes_state_registry.py`/`hermes_state_loop_guard.py` 四根层件＋`persistence_assembly.py`/`session_keys.py` 等新根层模块）＋gateway 193 文件＋tests 面重组 2384 文件（新增 tests/contracts、tests/neutral、tests/persistence_sqlite、tests/session_rules）。探查证据：agent 面 109 枚补丁中 **59 枚目标文件与上游变更有交集**（重锚候选上界，实际以净基线重放实测为准）；**致死交集 1 枚**＝485（目标 `hermes_state_messages.py` 上游整删，内容未被吸收——`session_prefix_chain` 在 v0.23.3 零命中，需改写至 `persistence/sqlite/` 新家）；上游删除面 140 文件中其余与 agent 补丁零交集。

## 变更

1. **vendor/hermes-agent 基线换血**：vendor-sync 显式通道整树替换（worktree `feat/vendor-agent-0233` 内执行，起点=本地 main 992820191——origin/main 落后一个合并环，agnes 批补丁面必须包含），upstream/hermes-agent 缓存树同批 checkout 至 v0.23.3（pristine 规则）。`.gitignore` 误伤面（export* / electron `*.d.ts` 等）按 2026-11-02 复核批立规同规则 `git add -f` 补录。
2. **agent 面 109 枚补丁新基线落位**（探查交集 59 枚，实际手解数以逐失败迭代实测为准）：预期大头=state 层重构波及（485 改写）＋gateway/agent/hermes_cli 常规锚漂。手解配方沿用 v0232 批修正版：reject-apply 定位＋prefix A 快照先行（splice derived-A 丢段坑，2026-11-19 studio 批七枚中招教训）＋重生成切片统一 `+++ b/` 相对路径（v0232 批 ①坑）。
3. **路由前缀表扩展**：`persistence/` 加入 `HERMES_AGENT_PATCH_PREFIXES`（inject.mjs）——485 改写后首段为 `persistence/`，不扩则误路由 studio 硬死；shell 镜像 `scripts/aipay/aipay-agent-sync.sh` AGENT_PREFIXES 同批同步（2a02847 漏改先例）。上游 tests/ 重组若有补丁目标落入新测试子树（tests/contracts 等），按文件级条目先例补路由（实测确认后再加，不预加）。
4. **runtime 覆盖层重镜像**：与 vendor/hermes-agent 注入态的交集件从新注入态重镜像（v0232 批配方：正源=注入态非影子树）；对账口径 56 相同/0 差异/6 runtime 独有为 v0232 终态，本批以新基线重跑对账为准。**镜像前置判定**：若 runtime/ 件承载宿主热修无补丁承载（grep patches 零命中判据），按 D9 裁决保护不覆盖、挂账。
5. **载体链同批进位**（v0232 批八处口径）：`vendor/VENDOR.md`（表行＋dated 条目）、`AGENTS.md:29` vendor 行、`README.md` 组件表版本行、`team/VERSION`（→`v0.23.3-team.1`）、`team/version.json`、`team/README.md`（What changed 新节）、`RELEASE-MANIFEST.json`、`team/requirements.txt`（range `>=0.22.4,<0.24` 已覆盖 0.23.3 不动，仅注释）。
6. **投影面随批**：docs:sync 投影块重写；版本断言数组 `v0.23.2-team.1` → `v0.23.3-team.1`（守门测试同步）；A.1 三处登记。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 升级目标=正式 tag v0.23.3，canary 流不追 | 仓规惯例（v0230/v0231/v0232 批同口径；`v0.23.3+canary.20261120T064609Z` 存在但不追） |
| D2 | worktree 内迭代重放，不做 /tmp 预演 | v0232 批 D2 先例；worktree 本身隔离等价预演 |
| D3 | 失败补丁手解重生成，不走 3way 盲合 | v0227 批 D7 先例（silent semantic drift）；先归因再动手解（级联假阳性方法论：lane 级 block 掩盖后续真失败） |
| D4 | 宿主 `~/.hermes/hermes-agent` 部署面挂账不处置 | v0232 批 D4 先例；宿主树属运行热修域，须独立批带网关重启窗口；本批 deploy 走 worktree 影子（`.runtime-deploy-shadow/`）不触宿主 |
| D5 | SIM 42 profile 重盖章不随批做 | v0232 批 D5 先例；SIM 快照供给链吃宿主态 |
| D6 | 485 改写至 persistence/ 新家而非退役 | 会话指纹链表是复用优化地基（chain_head 增量推进），上游零吸收；上游 append_message 新家=`persistence/sqlite/conversation/_store/messages.py:316`；DDL 锚迁 `_schema_ddl.py` |
| D7 | merge 时带 `VENDOR_SYNC=1` 并抽验 merge 提交 vendor 面 diff 非零 | v0231/v0232 批实测 pre-commit 对 merge commit 也撤 vendor staged；清偿配方=main 上补普通提交（VENDOR.md 台账行曾被 merge 撤出四次） |
| D8 | 手册版本快照行随 RELEASE-MANIFEST 进位由 docs:sync 投影链处理，不手改 | v0232 批 D8 先例（双源摇摆坑） |
| D9 | runtime 热修保护判定前置 | v0232 批 D9 裁决延续：无补丁承载的宿主热修不镜像覆盖；有补丁承载（v0232 收口后 56/0/6 态）可全量重镜像 |

## 验证

- [x] upstream/hermes-agent 缓存树 checkout v0.23.3 后 status 干净（pristine，caafe5389a）。
- [x] 换血文件面 staged 3948 与上游 `diff --name-only` 精确吻合（含 140 删除件；`.gitignore` 误伤面 0 命中，旧 10 件补录件（d.ts/export*）全数延续 tracked）。
- [x] pristine blob 抽验 3/3（index blob 对 v0.23.3 tag：agent/conversation_loop.py / gateway/run.py / pyproject.toml 全一致）。
- [x] `.gitignore` 误伤面核验：见文件面对账条。
- [x] worktree 净基线 clean+inject 全量 **status=complete 489/489 零 FAIL**（agent 109＋studio 380；zcode 0——zcode-patches 独立 series）＋幂等二连双 complete。
- [x] rebase 集成轮（main 前进至 3c17cb04d：capability-pool 807 定号＋cognition 批二 809 落 main）：分支 rebase 为 239daf7eb（spec-receipts 按并集＋design-doc-index 重生成 730 解冲突），series 492 枚（806 扩段/807/809 三枚 main 侧新补丁）在 v0.23.3 锚上**零重锚直过**——clean+inject **492/492 complete**＋幂等二连双 complete；runtime 对账复跑 194 相同/0 差异/0 待收口（807/809 的 kanban 镜像 5 件天然一致）。
- [x] rebase 集成轮附带清偿：main 提交态设计索引（cognition 批二合并 3c17cb04d）残留未解冲突标记（761-767），gen-doc-indexes 重生成不清嵌套标记（已知坑）随批手工清——契约测试 22/22 复绿、--check 0 problem（730/277）。
- [x] 手解文件 py_compile/AST 全过（每枚重锚后即验；485 测试文件 AST 过）。
- [x] 拼合树 pytest（补丁自带测试集 62 文件清单）：批内 745 例 732 过/16 存量红/净红=0（两处真红已根治：followups.py 上游 API 适配 28/28 绿、696 NameError 清除 6/6 绿）；rebase 集成轮 750 例（含 807/809 新增测试）**734 过/14 存量红，与主检出同清单同红集（双向差集空），净红=0**，见挂账 N-5。
- [x] runtime 对账终局 **194 相同 / 0 差异 / 0 待收口**（清单 70＋补丁触碰 124；goals.py/followups.py 两件从注入态重镜像后 --apply --force 刷基线）。
- [x] 载体链一致性：team/VERSION＝version.json（base 0.23.3/upstreamCommit caafe5389a）＝RELEASE-MANIFEST＝VENDOR.md 表行＝AGENTS.md:29/README:119；release:check 四模块全绿（agent-teams=v0.23.3-team.1）。
- [x] 投影面：docs:sync 投影块重写＋docs:check 绿；手册断言数组进位 v0.23.3-team.1（6/6 绿）；design-document-guide 快照两行＋演示稿 meta 行＋数字总账 agent/teams 两行随批；gen-doc-indexes --write 后 --check 0 problem（724 specs/271 nov）。
- [x] `npm test` 全量：批内 **9596 过/1 红**（唯一红=承接清单注册表证据路径断链——上游把 `tools/checkpoint_manager.py` 迁 `agent/checkpoints/manager.py`、`hermes_state_rewind.py` 迁 `persistence/sqlite/conversation/_store/rewind.py`，config/coding-backend-absorption.json 14 组同型对全量迁移后复绿 7/7），零环境性红；rebase 集成轮 **9670 过/2 红/11 跳过**——①设计索引冲突标记＝main 存量（cognition 批二 3c17cb04d 带入，主检出同红实证）本批已清偿复绿；②overlay-pristine-replay clean 用例＝环境性（8647 端口被他会话 RSI 走查服务占用挡 clean 守卫，主检出同红同因实证），走查结束自愈，净红=0。
- [x] 独立审查（蓝军）总判 PASS-with-findings 零 P0/P1：整树 tree hash 与 `v0.23.3^{tree}` 字节级相等（27139 文件零差）、10 枚手解补丁新增行集合指纹全等（纯锚迁零语义漂移）、109 枚 agent 补丁干净 v0.23.3 副本独立重放 109/109、路由双源/版本八处/收据链/提交卫生/安全面全过；四条 P2 处置＝F2（team 正本底座口径行随批进位）＋F3（口头口径 16 处实为 14 组，spec 本就正确）＋F4（本节勾选随集成轮补齐）＋F1（挂账 N-6）。
- [x] merge 后 main 抽验（2630458c2）：vendor/hermes-agent 面 diff 非零（3982 文件/+224,826）✓；merge 树与分支树零差异（纯壳合并）——worktree clean+inject 492/492 幂等二连即本树的等价注入验证；主检出注入态重建（clean+inject）被 8647 端口在途 RSI 走查服务拦于 clean 守卫——agent 树已处纯 v0.23.3 基线态、studio 注入态未动，待走查结束 `npm run clean && npm run inject` 即重建（环境窗口，无技术阻塞）。

## 设计文档影响

DESIGN_SYNC: touched —— `vendor/VENDOR.md`（台账正本：表行 commit/版本＋dated 条目）、`AGENTS.md`（vendor 行版本）、`README.md`（组件表版本行）、`team/README.md`（What changed 节）、`team/VERSION`/`team/version.json`、`RELEASE-MANIFEST.json`（agent-teams.version＋vendorBaseline）、`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`（数字总账 hermes-agent 基线行＋agent teams 模块行）、`team/profiles/orchestrator/references/design-doc/hermes-complete-design-doc.md`（供应链现状段底座三件套口径 hermes v0.23.2→v0.23.3，审查 F2 随批清偿）；A.1 三处登记；scope.yaml 同批声明。

## 挂账（不处置清单）

| # | 项 | 处置建议 |
|---|---|---|
| N-1 | ~~宿主基线仍 v0.23.2 线~~ **已闭环**（2026-11-21 收口轮）：基线经他会话升 v0.23.3（describe 实证）；本轮补齐收口=热修错配修复（watchdog hostile-load／dispatcher _refusal_hint，SMOKE OK）＋两批热修回灌入库承载（0ea16f70e／589ce63b7 前身 4b793d39b，清单 71 件）＋deploy --apply --force complete（相同 194/差异 0）＋网关 kickstart 重启稳定 | 无剩余动作（config.py 热修引用面不入库——不在任何部署面天然幸存，如需补丁承载另立批） |
| N-2 | ~~SIM profile 基线盖章仍 v0.23.2 面~~ **对象已消失**（2026-11-21 实证：SIM_ROOT 仅剩 logs/，42 profile 与 var/agent-src.stamp 均随 11-18 归档轮拆除）| 下次 run 由 mx-setup 重建即 v0.23.3 全新面（自带 deploy 至 SIM agent 树＋migrate_config 盖章），无需独立批 |
| N-3 | ~~在途他批新补丁按属主 rebase 重锚~~ **已解**：807 号 capability-pool 定号、cognition 批二让号 809，两批先于本批合入 main；本批 rebase 集成轮实证 806 扩段/807/809 在 v0.23.3 锚零重锚直过（见验证节 rebase 集成轮条） | 无剩余动作 |
| N-5 | ~~原归因「上游 dispatch 重构漂移」已被推翻~~（2026-11-21 探因：真因=批二 unmarked_decision_tier=T2 立法时 dispatch 族测试未适配，missing_grant 拦派发，与基线无关）。**5 枚已清偿**（spec 2026-11-21-dispatch-tests-tier-adaptation：732/419 测试卡加 tier=T1，13/13 绿，全清单 14→9 净差精确）；余 9 枚（delegate/memory/followup/subagent/dreaming）为跨批存量不属本批范围 | 已闭环（5 枚）＋余量留跨批清偿 |
| N-6 | runtime/ 下 14 个 `.78619-*.tmp` 编辑器临时文件历史入库（59050a87d 原子写批量收口第八批引入，非本批面；审查 F1） | 独立卫生批清偿＋gitignore 补 `runtime/**/*.tmp`（须配对机制预算条目） |
