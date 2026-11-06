# 2026-11-06 vendor 升级批：hermes-agent v0.22.7 → v0.23.0

> 上游身份：v0.22.7 = `b200f5bc6` → v0.23.0 = `2bd378ed1`（上游 2026-11-05 发布），808 提交 / 1223 文件 / +42,358 −11,117。预演证据：/tmp/agent-v0230-prep/（replay.mjs 终局复验 90/90 direct 零 threeway）；重生成正身 regen-*.patch 六枚。

## 变更

1. **vendor/hermes-agent 基线换血**：vendor-sync 显式通道整树替换（worktree 内执行），upstream/hermes-agent 缓存树同批 checkout 至 v0.23.0（pristine 规则）。`.gitignore` 误伤面核验沿 v0227 批配方（d.ts/export 规则）。
2. **agent 面 91 枚补丁 → 90 枚新基线全量 direct**：84 枚原样 direct＋**6 枚手解重生成**＋**742 退役**（移出 series，原件 .archived-patches/）：
   - `400-agent-compact-six-segment-handoff`：hunk#3 脱敏段上游新增 `EPISTEMIC_STANCE_RULE` 拼接，上下文行失配——并集保留上游新段＋我方 [UNVERIFIED] 诚实标注句，落位 3975 行区。
   - `408-agent-tool-model-overrides`：v0.23.0 删 `agent.tools` 赋值与 `agent.valid_tool_names` 之间空行（v0.22.7 批 `_tool_snapshot_selection` 漂移的延续），插入块上下文失配——新形态落插入块。
   - `410-agent-source-marks-recap`：`_run_children_parallel` 尾部结构变（`executor.shutdown` 与 `results.sort` 间新增 unstarted-child 释放块），模块级函数插入锚漂移——插入块落 `results.sort` 后、`_execute_and_aggregate` 前。
   - `470-hosted-rooms-collab-event-id`：**v0.23.0 上游已原生吸收本补丁主体**（`room.assignment`/`room.context_set` 事件类型、`_KIND_INDEX` 索引、`resolve` callable 机制全在）——重生成后仅存我方独有内容 `collab_event_id` 参数族（签名＋锚点 resolve 包装，1 段 32 行）。
   - `593-agent-per-tool-allowlist`：cache key 元组尾上游在 `check_fn_cache_epoch()` 后无变化，`_profile_tool_filter()` 追加位直接落尾。
   - `602-agent-session-telemetry`：`_hmwa_add_failed_turn_notice` 条件上游新增 `and automatic_notices_allowed(source)`，插入块上下文失配——新条件形态落 telemetry 侧车调用。
   - `742-agent-v0227-runtime-resync` **退役**（207 先例：上游已原生实现，保留即冗余）：5 个文件的目标内容全被 v0.23.0 吸收——cron.py `room:<room_id>` 交付语法、base.py `typing_metadata_for_turn` import/`failure_notice_sent` 守卫、toolsets.py `tool_selection_key`、tool_executor.py `_tool_search_scoped_names` memo 化、helpers.py `typing_metadata_for_turn` 全函数（与上游逐字一致；保留会在 helpers.py 造成重复定义）。
3. **载体链八处同批**（v0227 批口径）：`vendor/VENDOR.md`（表行＋dated 条目）、`AGENTS.md:27`、`README.md` 版本行、`team/VERSION`（→`v0.23.0-team.1` 底座升级扩展序归 1）、`team/version.json`（version/base=0.23.0/upstreamCommit=2bd378ed1 三键）、`team/README.md`（Current＋What changed＋0.22.7 段归档）、`RELEASE-MANIFEST.json`（agent-teams.version）、`team/requirements*.txt`（注释引用两处＋**range 提界 `>=0.22.4,<0.23`→`<0.24`**——原上界不覆盖 0.23.0，spec 初稿「range 覆盖 0.23.0」系臆断，落载体时实测纠正）。
4. **runtime 覆盖层对照重灌**：预演对照结论——runtime 镜像 5 件中 toolsets.py/subcommands/cron.py/tool_executor.py 与 v0.23.0 注入态逐字同（742 内容已被上游吸收所致，模板无须动）；base.py/hosted_rooms.py 需对照预演终态重灌（hosted_rooms.py 含 470 重生成版 collab_event_id）。宿主部署沿 v0227 批定向部署配方（.bak 可回滚），manifest 差异件按属主域分野（并行会话在途域不碰）。

5. **推演程序同步更新（用户 2026-11-06 指令「推演程序记得同步更新」）**：SIM 链三层落位——①`mx_provision_agent_src` 快照源=宿主工作态，宿主基线已 v0.23.0＋overlay 62/62，快照重供给 key=`2bd378ed1+5187ef4f3b94+pc764b18fcd10`；②`mx_apply_agent_patches` 32 枚运行时补丁**守卫全绿 32/32 零 FAIL**（含 601 此前卡点半应用态，见 D9）；③SIM wrapper venv（借宿主 .venv）`psutil/rule_heartbeat/hosted_rooms` 导入验证过（psutil 为 v0.23.0 上游新增依赖，宿主 venv 已装）。simharness 源面无功能性版本断言（mx-lib.sh 965/987 的 0.22.6 字样为历史事故注释，D6 先例不动）。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 预演先行、正式批走 worktree | v0227 批 D1 先例；预演不占席位已完成（90/90 direct），发版轮 v1.0.13 在途占 chore 域不占 patches/vendor 席，本轮 1 席合规 |
| D2 | 742 退役不重生成 | 上游全吸收（5 文件目标内容逐字在位，helpers 段与上游重复定义）；207 先例；series 留退役注释行 |
| D3 | 6 枚冲突补丁手解重生成，不走 3way 借力 | v0227 批 D7 先例（3way 盲合有 silent semantic drift 风险，手解可核语义并集——470 判定「上游已吸收、仅存 collab_event_id」即手解产物） |
| D4 | 不为 0.23.0 新增补丁号 | 90 枚覆盖面完整，升级只重生成存量 6 枚＋退役 1 枚，无新行为面 |
| D5 | team 载体链进 v0.23.0-team.1（扩展序归 1） | team/VERSION 注释立法「底座升级时底座段跟进、扩展序归 1」；与发版轮 v1.0.13 在途的 team.3（0.22.7 基线）撞面，合并序无论谁先，终态以底座升级规则为准，冲突属主解（AGENTS.md 规则 12） |
| D6 | simharness 与 docs/manuals 的 0.22.7 字面引用不随批改 | v0227 批 D4 先例（历史叙事与快照记录，来历归 git） |
| D7 | runtime 宿主部署定向覆盖 kanban_db.py 单件、不整树盲 force | 终态差异仅 1 件且方向明确（宿主旧态，vendor 注入态与模板一致）；原「在途域」依据随 739/741 合入消失 |
| D8 | 推演同步采用「宿主补丁态→SIM 快照」既有链（不绕行直拷 vendor） | mx-lib 供给链单一事实源；宿主=补丁态权威（守卫注释明文），先补宿主再重供给即全链收敛 |
| D9 | 宿主 601 接线缺口当轮手工同步 149 文件根治，机制面缺口（manifest 只收新文件、不含补丁对既有文件的修改）挂账 | 守卫 fail 暴露的真存量缺陷（v0.22.7 时代即缺，非本批引入）；手工同步=预演仓 `git diff v0.23.0..HEAD` 触碰文件集逐件 copy（含补丁删除文件的同步删除），同步后守卫 32/32 全绿实证；manifest 语义扩面涉 runtime-manifest.json 设计变更，须单独立项 |
| D10 | 宿主网关重启不随批做、挂账 | launchd KeepAlive 自愈在位（kill 即拉新代码）；但重启中断产品面通道，双活会话纪律下不擅动；v0227 批「生效三层验收法」先例（已合 main✓/已落运行树✓/已进运行进程=待重启） |

## 验证

- [x] 预演终局：/tmp/agent-v0230-prep pristine v0.23.0 按 series 序（planner.routePatchTarget 口径）全量重放 **90/90 direct 零 threeway 零 STOP**（镜像补丁目录含 6 regen＋742 移除）。
- [x] 预演口径修正留痕：首轮 firstTarget 只认 `--- a/` 漏筛 4 枚纯新文件补丁（457 等 `--- /dev/null` 形态），终局改 import planner.routePatchTarget 单一事实源（`---`/`+++` 双头回退 diff --git 行）。
- [x] 手解 6 文件 py_compile/ast 语法全过（预演仓内）。
- [x] worktree 净基线单跑：`npm run clean && npm run inject` 全量 **agent 90＋studio 370 全应用、WARN/SKIP 零条、幂等二连 rc=0**（首次 rc=1 系 deploy-agent-runtime 对宿主 33 差异件的 partial 报告，非补丁链告警；二连后宿主同步完成）。
- [x] `.gitignore` 误伤面核验：`git ls-files --others --ignored --exclude-standard vendor/hermes-agent` **零命中**（v0.23.0 无新增 export*/d.ts 类被吞文件）。
- [x] 台账一致性：VENDOR.md 基线 commit = upstream/hermes-agent HEAD = 宿主 ~/.hermes/hermes-agent HEAD = `2bd378ed1`。
- [x] `release:check` 四模块对账全绿（cockpit=1.0.9-studio.12 **agent-teams=v0.23.0-team.1** ycode=3.17.2 yuan-skill=v2.99.3）。子项 docs:check 在 worktree 红（路由计数 121 vs 122）定谳=**worktree 环境伪象非本批漂移**：vite-node 经 node_modules 软链跨树解析回主检出致真注册链收集不全（直接跑 route-manifest.ts 报跨树 Cannot find module 实证）；main 干净 HEAD 同检查绿；本批改动面不触及路由载体（registries/custom/client/features）。合并后在 main 复跑兑现。
- [x] 拼合树 pytest runtime/tests：**152 passed / 0 failed**（v0227 批 146 基线＋6 新例；配方=PYTHONPATH=vendor/hermes-agent:runtime）。首跑 13 例失败定谳=裸 python3.14 缺 `psutil`（v0.23.0 上游 kanban_owner_recovery.py 新增 import）＋缺 `python-dotenv`（1 例收集错）——补装二包后全绿，环境限制非行为回归。
- [x] SIM 推演同步：`mx_apply_agent_patches` **32/32 在位零 FAIL**；SIM wrapper venv 关键模块导入过（agent/rule_heartbeat＋gateway/hosted_rooms＋psutil）。
- [x] 宿主补丁态接线根治：601 卡点定谳=存量缺口（runtime-manifest 仅收新文件，补丁对既有文件如 agent_init.py 的接线从未进部署面，v0.22.7 时代即如此）——预演仓触碰文件集（149 件）同步宿主后守卫全绿；机制面挂账 N-1。
- [x] runtime 宿主部署：dry-run 终态 **清单 62 ｜ 相同 62 ｜ 差异 0 ｜ RESULT complete**；kanban_db.py 一处宿主旧态（`workspace_kind: str = "worktree"` 不属任何现役补丁，且 D5「在途域」依据已随 739/741 合入消失）定向覆盖对齐（.bak 备份在宿主 hermes_cli/）。宿主基线 HEAD 已在 v0.23.0（换血窗口内先行就位）。
- [x] `npm test` 全量：**8491 passed / 27 failed / 11 skipped**（1114 文件，299s）＋1 vitest-worker RPC 超时（负载型）。27 例红**定谳 pre-existing 非本批引入**： cognition P0 批（283e3f0e1，origin/main 已含）验证窗仅 7 文件 44 例未跑全量，其 inject.mjs/ensure-injected.mjs 重构遗留三族债——①源码级断言族（`isHermesAgentPatchPath(` 在 ensure-injected.mjs:68 真实调用残留，P0 测试已禁止该形态＝P0 未收完的尾巴）；②真跑主链族（inject-clean-v2/inject-executor/delta-guard/absent-tree/serve-server/zcode-guard/verify-dist-runtime，对仓态与环境双敏感，主检出 283e3f0e1 干净态同 9 文件复跑 26 红＝本批基点前已红）；③vite-node 真注册链族（route-manifest/eval-gaps，worktree 跨树 node_modules 解析伪象同 docs:check 根因）。**按边界纪律列清单待批不本批顺修**（cognition 域清偿批处置）；本批改动面行为已由预演 90/90＋幂等二连零告警＋pytest 152/0＋release:check 全绿四方覆盖。合并后在 main 完整复跑终验（见收口）。

## 设计文档影响

DESIGN_SYNC: touched —— `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`（数字总账 hermes-agent 基线/agent teams 模块两行随批修齐 v0.23.0/v0.23.0-team.1；总账 agent 两行自 v0.22.7 批起滞后两版，本批一并清偿——驾驶舱模块行 studio.9 滞后属发版轮域不动、留痕待其属主批）；`vendor/VENDOR.md`（vendor 台账正本，本批修订）、`AGENTS.md`（vendor 行版本）、`team/README.md`（版本方案叙述）随批；A.1 三处登记（附录索引计数 575→576＋机械索引行＋design 索引两清单）；scope.yaml 同批声明。数字总账面无涉（team 版本真源=team/VERSION，随批）。

## 挂账（不处置清单）

| # | 项 | 处置建议 |
|---|---|---|
| N-1 | runtime-manifest.json 只收补丁新增文件、不含补丁对既有文件的修改（601/605 接线类依赖宿主 git 工作态而非 manifest 到达） | 单独立项：manifest 增加「patchTouchedFiles」派生面或部署器改读 inject manifest |
| N-2 | 宿主网关进程（14:29 起）仍跑换血前代码，重启后才加载 v0.23.0＋149 件接线 | launchd KeepAlive 在位，空闲窗 kill 网关进程即自愈拉新 |
| N-3 | npm test 27 例 pre-existing 红（cognition P0 批验证窗外债：ensure-injected.mjs:68 `isHermesAgentPatchPath` 残留等三族） | cognition 域清偿批处置，本批按边界纪律不顺修 |
