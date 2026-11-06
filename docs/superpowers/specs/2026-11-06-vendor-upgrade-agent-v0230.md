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

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 预演先行、正式批走 worktree | v0227 批 D1 先例；预演不占席位已完成（90/90 direct），发版轮 v1.0.13 在途占 chore 域不占 patches/vendor 席，本轮 1 席合规 |
| D2 | 742 退役不重生成 | 上游全吸收（5 文件目标内容逐字在位，helpers 段与上游重复定义）；207 先例；series 留退役注释行 |
| D3 | 6 枚冲突补丁手解重生成，不走 3way 借力 | v0227 批 D7 先例（3way 盲合有 silent semantic drift 风险，手解可核语义并集——470 判定「上游已吸收、仅存 collab_event_id」即手解产物） |
| D4 | 不为 0.23.0 新增补丁号 | 90 枚覆盖面完整，升级只重生成存量 6 枚＋退役 1 枚，无新行为面 |
| D5 | team 载体链进 v0.23.0-team.1（扩展序归 1） | team/VERSION 注释立法「底座升级时底座段跟进、扩展序归 1」；与发版轮 v1.0.13 在途的 team.3（0.22.7 基线）撞面，合并序无论谁先，终态以底座升级规则为准，冲突属主解（AGENTS.md 规则 12） |
| D6 | simharness 与 docs/manuals 的 0.22.7 字面引用不随批改 | v0227 批 D4 先例（历史叙事与快照记录，来历归 git） |
| D7 | runtime 宿主部署只定向 base.py/hosted_rooms.py 两件方向待对照、不整树 --force | AGENTS.md 部署规则默认保留差异件；并行会话在途域（manifest 差异 28 件族）不碰 |

## 验证

- [x] 预演终局：/tmp/agent-v0230-prep pristine v0.23.0 按 series 序（planner.routePatchTarget 口径）全量重放 **90/90 direct 零 threeway 零 STOP**（镜像补丁目录含 6 regen＋742 移除）。
- [x] 预演口径修正留痕：首轮 firstTarget 只认 `--- a/` 漏筛 4 枚纯新文件补丁（457 等 `--- /dev/null` 形态），终局改 import planner.routePatchTarget 单一事实源（`---`/`+++` 双头回退 diff --git 行）。
- [x] 手解 6 文件 py_compile/ast 语法全过（预演仓内）。
- [ ] worktree 净基线单跑：`npm run clean && npm run inject` 全量 0 条真告警（WARN/SKIP/ERROR 前缀严格匹配）。
- [ ] `.gitignore` 误伤面核验（d.ts/export 无新增命中）。
- [ ] 台账一致性：VENDOR.md 基线 commit = upstream/hermes-agent HEAD = `2bd378ed1`。
- [ ] `npm test` 全量（合并前门）。
- [ ] `release:check` 四模块对账（agent-teams=v0.23.0-team.1）。
- [ ] 拼合树 pytest runtime/tests（v0227 批配方 146 例基线）。

## 设计文档影响

DESIGN_SYNC: touched —— `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`（数字总账 hermes-agent 基线/agent teams 模块两行随批修齐 v0.23.0/v0.23.0-team.1；总账 agent 两行自 v0.22.7 批起滞后两版，本批一并清偿——驾驶舱模块行 studio.9 滞后属发版轮域不动、留痕待其属主批）；`vendor/VENDOR.md`（vendor 台账正本，本批修订）、`AGENTS.md`（vendor 行版本）、`team/README.md`（版本方案叙述）随批；A.1 三处登记（附录索引计数 575→576＋机械索引行＋design 索引两清单）；scope.yaml 同批声明。数字总账面无涉（team 版本真源=team/VERSION，随批）。
