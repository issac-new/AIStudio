# 2026-11-10 vendor 升级批：hermes-agent v0.23.0 → v0.23.1

> 上游身份：v0.23.0 = `2bd378ed1` → v0.23.1 = `3b4215785`（上游 2026-11-10 发布），2604 提交 / 2781 文件 / +151,690 −62,595（史上最大单版差量，主题=plugin-catalog 子系统大改 238 feat＋telegram 流预览修复流 173 fix＋gateway/desktop/groups 修复流）。预演证据：/tmp/agent-v0231-prep-{a..h}/＋/tmp/agent-v0231-final/（replay-final.mjs 终局 91/91 direct 零 threeway）；重生成正身 regen-612/regen-722 两枚。

## 变更

1. **vendor/hermes-agent 基线换血**：vendor-sync 显式通道整树替换（worktree `feat/vendor-agent-v0231` 内执行），upstream/hermes-agent 缓存树同批 checkout 至 v0.23.1（pristine 规则）。换血文件面 1094A+59D+1616M+12R=2781 与上游 `diff --name-status` 精确吻合；pristine 抽验 3/3（conversation_loop.py/run.py/pyproject.toml blob hash 与 v0.23.1 tag 一致）。`.gitignore` 误伤面 12 命中（get-windows.d.ts、p5js export-*2、web 字体 woff2×7、plugin.runtime.js、userStories.json）全为旧基线历史补录件，`git add -f` 同规则补录——本轮无新增吞文件类。
2. **agent 面 91 枚补丁新基线全量 direct（零重试零 3way）**：89 枚原样 direct＋**2 枚手解重生成**：
   - `612-agent-observation-pack-recall`：hunk#2 插入锚漂移——上游在 `generate_preview` 与 `_pageable_text` 之间新增 `_tool_metadata_block`/`_pageable_tool_json` 两函数并重写 `_pageable_text` docstring。手解：`generate_tail_excerpt` 插到 `generate_preview` 之后、上游新函数 `_tool_metadata_block` 之前（语义=预览族聚拢，与上游 metadata/分页族无交叉）。4 文件段（tool_result_storage.py＋3 新文件）重生成。
   - `722-agent-emptystream-ladder-classify`：verdict 赋值行上游改 walrus 双捕获形态（`stage, verdict = next(((s, v) for s in _STAGES if (v := s(c)) is not None), ...)`）且其后新增 `_shape_context` extra 合并块。手解：EmptyStreamError override 插到 extra 合并块之后、`message = _extract_message(error, body)` 之前——保持「override 为最终 verdict」语义（v0.23.0 形态下 override 即最终；v0.23.1 若插在 extra 前会被 stage verdict 的 error_context 污染后再被整体替换，等价但语义次序更清晰）。
   - **741/750 初判失配系级联假阳性**（预演判读方法论沉淀）：741 失败根因=`tools/efficiency_ledger.py: No such file or directory`（该文件由 612 创建，612 失败→文件缺席）；750 失败根因=import 区上下文含 `import math`（由 741 加入，741 未应用→math 缺席）。612 重生成后 741/750 原样 direct——**series 内补丁链依赖（新文件供给/锚供给）会让根失败向下游传染，失配分析须先归因再动手解**。
3. **runtime 覆盖层 12 交集件镜像化重灌**：manifest 62 条与上游变更交集 12 条（cron.py/hosted_rooms.py/run_busy.py/run_inbound.py/platforms/base.py/test_max_concurrent_sessions.py/toolsets.py/tool_result_storage.py/tool_executor.py/kanban_watchers_dispatcher.py/locales/en.yaml/locales/zh.yaml）从新注入态重镜像；重灌后全量对账 53 一致＋1 存量漂移（plugin_api.py，见 D4）＋8 runtime 独有件（ENOENT 对照法不适用）。py_compile 9 件全过。
4. **载体链八处同批**：`vendor/VENDOR.md`（表行＋dated 条目）、`AGENTS.md:29`、`README.md:117` 版本行、`team/VERSION`（→`v0.23.1-team.1` 底座升级扩展序归 1）、`team/version.json`（version/base=0.23.1/extN=1/upstreamCommit=3b4215785 四键）、`team/README.md`（Current＋What changed 新节＋v0.23.0-team.1 段归档）、`RELEASE-MANIFEST.json`（agent-teams.version）、`team/requirements.txt`（注释 v0.23.1；range `>=0.22.4,<0.24` 已覆盖 0.23.1 不动）。
5. **worktree 验证与宿主隔离**：worktree 内 clean+inject 全量 461/461 applied（agent 91/studio 362/zcode 8）零失败，幂等二连 complete；inject 出口部署经 `RUNTIME_DEPLOY_MANIFEST` 重定向至 `~/.hermes/host-sim-v0231`（62/62 同步零差异）——**宿主真树 `~/.hermes/hermes-agent` 未动**（v0.23.0+4 会话在途热修提交 9ac9c6f..9e744c3，属他会话在途域，AGENTS.md 规则 12），部署面挂账 N-2。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 预演先行、正式批走 worktree | v0230 批 D1 先例；预演定谳根失败仅 2 枚（初判 4 枚中 2 枚为级联假阳性），手解成本最低的一版 |
| D2 | 2 枚冲突补丁手解重生成，不走 3way | v0227 批 D7 先例（3way 盲合有 silent semantic drift 风险）；722 的插入位次序选择（extra 合并后 vs 前）即手解产物 |
| D3 | 不为 v0.23.1 新增/退役补丁号 | 91 枚覆盖面完整（预演 91/91 direct 实证），上游零文件删除（对补丁触碰面），无孤儿无缺口 |
| D4 | plugin_api.py 存量漂移不随批修 | runtime 侧 2026-11-08 docstring 中文改写（避开安全门拼接正则的 `+`），vendor 注入态仍英文原文——**本批前已存在的有意分叉**，属主域（安全门 docstring 修复未回灌 patches/），本批顺修=越域；列清单待批 |
| D5 | 宿主部署面挂账不做 | 宿主树 4 热修提交（409 structure pack/tui 色层/weixin noise-filter/kanban_gates 恢复，最新 13:42）为他会话在途域；基线升级（checkout v0.23.1+热修重锚）须属主会话协调或用户明示；v0230 批 D10「生效三层验收法」先例（已合 main✓/已落运行树✓/宿主=待协调） |
| D6 | worktree 验证用 RUNTIME_DEPLOY_MANIFEST 重定向 host-sim | executor 预检 partial 即中止注入（零写入），不重定向则宿主 29 kept 差异会拦住注入或污染宿主；该 env 为部署器文档化隔离通道（测试隔离/多 profile 面） |
| D7 | SIM 面（simharness 42 profile v52 盖章）不随批做 | sim-v0230-alignment 先例=SIM 对齐独立批；SIM 快照供给链吃宿主态，宿主升级（D5）未落地前 SIM 重盖章无意义 |
| D8 | team/requirements-tools.txt 的 v0.23.0 字样不动 | 该注释=钉版工具清单的实测来源记录（宿主 venv 实测），来历叙事不改（v0230 批 D6 先例） |

## 验证

- [x] 预演终局：/tmp/agent-v0231-final pristine v0.23.1 按 series 序（planner.routePatchTarget 口径）全量重放 **91/91 direct 零 threeway 零 STOP**（镜像补丁目录含 regen-612/regen-722）。
- [x] 级联归因实证：612 失败→efficiency_ledger.py 缺席→741 FAIL（No such file）→math import 缺席→750 FAIL（上下文失配）；612 regen 后 741/750 原样 direct（终局重放实证）。
- [x] 手解 2 文件 py_compile 过＋语义直测过：722 `classify_api_error(EmptyStreamError())` → `reason=timeout/retryable=True`（v0.23.1 ClassifiedError 对象新返回形态下 override 正确流入 `ClassifiedError(**{**base, **verdict})`）；612 `generate_tail_excerpt` 尾摘行为正确（新锚位=上游 `_tool_metadata_block` 前）。
- [x] worktree 净基线单跑：`npm run clean && npm run inject` 全量 **461/461 applied**（agent 91/studio 362/zcode 8）零 FAIL 零 SKIP；幂等二连 noop+complete；manifest v2 补丁状态分布 `{applied:461}`。
- [x] 换血面精确吻合：1094A+59D+1616M+12R=2781=上游 diff 文件数；pristine blob 抽验 3/3。
- [x] `.gitignore` 误伤面：12 命中全为旧基线补录件（`git ls-files --others --ignored` 对照 HEAD 在库），`git add -f` 同规则补录，零新增吞文件类。
- [x] runtime 重灌对账：53 一致＋1 存量（D4）＋8 独有；py_compile 9 件过。
- [x] 拼合树 pytest：`PYTHONPATH=vendor/hermes-agent:runtime python3.14 -m pytest runtime/tests` **152 passed / 0 failed**（v0230 批 152 基线持平）；补丁自带测试抽验 test_observation_pack_recall+test_max_concurrent_sessions **18 passed**。
- [x] 载体链一致性：team/VERSION=v0.23.1-team.1＝version.json 四键＝RELEASE-MANIFEST agent-teams＝VENDOR.md 表行＝AGENTS.md/README 版本行。
- [x] `npm test` 全量：**8652 passed / 4 failed / 11 skipped**（1134 文件，252s）＋2 vitest-worker RPC 超时（负载型）。4 红当批清偿定谳——①docs-ssot-guard：全量跑先于本批 A.1 登记动作，登记后单跑 7/7 过；②interactive-training-manual：同因（机械覆盖断言新 spec 名），登记后 18/18 过；③overlay-pristine-replay（真管线重放守门）：宿主 29 kept 差异致部署预检 partial 中止注入（环境性，非补丁面缺陷）——`RUNTIME_DEPLOY_MANIFEST=/tmp/runtime-manifest-hostsim.json` 重定向 host-sim 后**单跑 1/1 过（49s 三 lane 真管线 v0.23.1 全链验证）**，宿主隔离面见 D6；④route-manifest：**本批引入真漂移**（RELEASE-MANIFEST team 进位 vs 培训手册投影块旧值）——`npm run docs:sync` 重写投影块后复测绿；三件套（route+training+ssot）复跑 29/29。

## 设计文档影响

DESIGN_SYNC: touched —— `vendor/VENDOR.md`（vendor 台账正本：表行 commit/版本＋dated 条目）、`AGENTS.md:29`（vendor 行版本）、`README.md:117`（组件表版本行）、`team/README.md`（版本方案叙述＋What changed 节）、`team/VERSION`/`team/version.json`（agent-teams 版本真源/机读载体）、`RELEASE-MANIFEST.json`（agent-teams.version）、`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`（数字总账 hermes-agent 基线行 v0.23.1＋agent teams 模块行 v0.23.1-team.1）；A.1 三处登记（附录索引计数＋机械索引行＋design 索引两清单）；scope.yaml 同批声明。

## 合入 main 实录（2026-11-10 17:45-18:10，终态 origin/main ad5b400bf）

并发窗口 main 新增 4 提交（记忆统一/IDE 面板收窄/记忆 M1 收口）。处置链：
1. worktree rebase main：4 文件冲突全并集解（receipts 台账/scope 登记块/附录 A 计数 609→610＋代登记 IDE 批未登项（608→609）＋三行 A.1 表/机械索引链接三行＋计数 617→619）。
2. **pre-commit 钩子 merge commit 误伤 pristine 基线变更（新坑）**：a6c23d199 的 vendor/hermes-agent 面变更=0——「inject 注入态不入提交」撤出规则对 merge commit 也生效，把分支带来的 pristine 基线换血整面撤出。修复=main 上 git rm + archive + add 后普通提交 3f9089c00（VENDOR_SYNC=1，2781 文件与上游 diff 精确吻合）。**后续 vendor 基线批 merge 后必须抽验 merge 提交 vendor 面 diff 非零**。
3. VENDOR.md 台账漏入（git rm 目录时未 add 台账，M 状态残留随 stash/rebase 漂移）→6129cf932 补齐＋3dcce1215 合并。
4. 培训手册投影块 121↔122 三方摇摆：056d3de33 误信 docs:sync 瞬时输出写 122；main/worktree 双树真链复测均 121（page 80/redirect 41）→ad5b400bf revert 056d3de33 归位真值。**IDE 面板收窄批的 docs:sync 属主域已闭环（其原提交状态在册），本批 revert 只归位真值**。
5. main 验证终态：clean+inject 461/461 applied complete（sim 重定向）；拼合树 pytest 152/0；release:check 四模块全绿；merge-invariants 五项全过；pre-push qgate L0 门集全过；推送 2f31b492b..ad5b400bf。
6. main npm test 全量 8655 过/2 失败/11 跳过——两失败=overlay-replay（宿主 29 kept 预检中止，sim 重定向单跑 1/1 过 56s）＋route-manifest（测试期 121↔122 摇摆窗口，推送态 release:check 绿）。

## 挂账（不处置清单）

| # | 项 | 处置建议 |
|---|---|---|
| N-1 | `~/.hermes/host-sim-v0231` 验证残留目录 | 下次宿主升级部署时以真树为准后可清（非 git 通道物，属临时验证面） |
| N-2 | 宿主 `~/.hermes/hermes-agent` 基线仍 v0.23.0+4 在途热修 | 属主会话收口后：宿主 checkout v0.23.1＋热修重锚（reanchor）→ 真树 deploy --apply（149 触碰面＋62 overlay）→ 网关重启生效（launchd KeepAlive 自愈，v0227 批「换血=精确 kill+同命令重启」配方视需要）；须用户或属主会话明示 |
| N-3 | SIM 42 profile 基线盖章仍 v0.23.0（v52） | 宿主升级（N-2）落地后独立批重盖章（sim-v0230-alignment 配方：mx_provision_agent_src 快照重供给＋mx_apply_agent_patches 32 守卫全绿） |
| N-4 | plugin_api.py runtime↔vendor 注入态 docstring 有意分叉（2026-11-08 安全门热修未回灌 patches/） | 属主域清偿：docstring 中文版回灌为补丁或回退 runtime 侧，恢复镜像纪律零例外 |
