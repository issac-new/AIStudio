# 2026-11-04 vendor 升级批：hermes-agent v0.22.6 → v0.22.7

> 定稿（换血轮实测回填）。预演证据：/tmp/agent-v0227-prep/{report.tsv,repo}；重生成现场：/tmp/agent-v0227-prep/regen-{408,470,593}.patch。
> 上游身份：v0.22.6 = `f0d94882e` → v0.22.7 = `b200f5bc6`，589 提交 / 554 文件 / +24012 −3144（主题：room lead 路由、plugin-catalog 重 pin、webapp 状态修复、append_event payload 延迟解析重构）。

## 变更

1. **vendor/hermes-agent 基线换血**：vendor-sync 显式通道整树替换（worktree 内执行，555 文件提交含 spec），upstream/hermes-agent 缓存树同批 checkout 至 v0.22.7（pristine 规则）。`.gitignore` 误伤面核验：本轮零命中（2 个 D 为上游真删除，d.ts/export 无变更）。
2. **agent 面 85 枚补丁新基线重放：82 direct＋3 枚手解重生成**：
   - `408-agent-tool-model-overrides`：上游在 `_load_tools` 插入 `_tool_snapshot_selection` 赋值并删空行，插入块上下文漂移——并集保留插入块，重生成。
   - `470-hosted-rooms-collab-event-id`：上游把 `append_event` 的 payload 重构为事务内延迟解析（callable + `resolve(conn)` + walrus isinstance）——collab_event_id 并集改包装 resolve（dict 并入锚点、非 dict 直通保上游 HostedRoomError 路径），签名位 3way 自合。
   - `593-agent-per-tool-allowlist`：上游在 cache key 尾部新增 `check_fn_cache_epoch()`——hunk1 追加位后移手补；hunk2/3 原样落位。补丁 index 行 a-side blob（8566c62842）在主仓对象库亦不可达（gc），3way 无从借力，全部手解。
   - 重生成方法：预演仓按 series 序分支定位前驱提交（408←407 / 470←417 / 593←592）→ 手解 → `git diff HEAD~1` 出补丁正身 → 装回 patches/ → **pristine v0.22.7 全量重放复验 85/85 direct 零冲突**。
3. **载体链八处同批**：`vendor/VENDOR.md`（表行＋dated 条目）、`AGENTS.md:27`、`README.md:117`、`team/VERSION`（→`v0.22.7-team.1` 扩展序归 1）、`team/version.json`（version/base/upstreamCommit 三键）、`team/README.md`（Current＋What changed＋0.22.6 段归档）、`RELEASE-MANIFEST.json`（version/notes/vendorBaseline）、`team/requirements*.txt`（注释引用两处；range `>=0.22.4,<0.23` 覆盖 0.22.7 不动）。
4. **runtime 覆盖层 5 条目镜像化重灌＋宿主定向部署**：模板 vs v0.22.7 注入态三方对照（旧模板/主检出旧注入/worktree 新注入）定谳 17 件漂移分两组——**B 组 5 件**（cron.py/hosted_rooms.py/platforms/base.py/toolsets.py/tool_executor.py，模板==旧注入纯镜像）镜像化复制新注入＋py_compile 过＋按 deploy 脚本 .bak 约定定向部署宿主（manifest 62：相同 34（+5）/差异 28）；**A 组 12 件**（kanban 族等，模板含 99~153 行不在任何 vendor 注入态的内容=并行会话 dispatch-debt 在途 739 的双载体预置面）**不碰**。宿主 `~/.hermes/hermes-agent` 当日已被先行 checkout 至 v0.22.7（升级冲掉了部分 overlay，34/62 存续），本轮 5 件对齐=消除「0.22.7 基线跑 0.22.6 overlay」的回退态。
5. **在途兼容预判**：并行会话未合入的 `739-agent-dispatch-chain-backport` 在 v0.22.7+存量补丁末位 3way 全清（5 个 kanban 文件 cleanly），升级与其互不阻断。
6. **顺修批一放置缺陷（pre-existing）**：`runtime/tests/hermes_cli/test_project_pause.py` 镜像自 vendor 树但共享夹具不随行，拼合树配方下 5 例 setup ERROR（v0.22.6/v0.22.7 同型红，与本轮换血无因果）——新增 `runtime/tests/hermes_cli/conftest.py` 单夹具再导出（单一事实源=vendor conftest，autouse 族不引入防作用面外溢），runtime/tests 141+5→146/0 全绿。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 预演先行、席位空后换血（用户裁决 C 案；后用户确认仅一会话活动即开工） | patches/vendor 席位 2/2 被 739/740 占用，分层上限禁止第 3 任务；只读预演不占席位（AGENTS.md §0/§1.0） |
| D2 | 不为 0.22.7 新增补丁号 | 85 枚存量覆盖面完整，升级只重生成存量 3 枚，无新行为面 |
| D3 | 739 兼容性预判放行：3way 全清 | 预演末位附测实证；合并顺序任一方先走摩擦均低 |
| D4 | simharness 与 docs/manuals 的 0.22.6 字面引用不随批改 | final-report-merge.py:598 / mx-lib.sh:948,970 / design-document-index:5 为历史叙事与快照记录（来历归 git） |
| D5 | runtime A 组 12 件漂移不碰、不整树 --force 部署 | 模板独有内容=并行会话在途域（739 预置面）；--force 会踩踏在途工作＋覆盖宿主侧可能领先态（AGENTS.md 部署规则默认保留差异件） |
| D6 | 宿主 28 件既有差异不在本轮清偿 | 与本轮换血无因果（主检出 dry-run 同数 33→28 为证），属并行会话 manifest 52→62 扩容后的宿主滞后，待其属主批收口 |
| D7 | 补丁重生成一律手解不走 3way 借力 | 593 的 a-side blob 主仓亦不可达；且手解可顺便核语义并集（470 的 resolve 包装即手解产物），3way 盲合有 silent semantic drift 风险 |
| D8 | 批一 runtime 镜像测试夹具缺陷当轮顺修（新增件零碰撞） | 定谳法=主检出 v0.22.6 拼合树同红 5 例证 pre-existing；修法=新 conftest 单夹具再导出，不触批一既有文件、与 dispatch-debt WIP 无文件交集 |

## 验证

- [x] 预演：85 枚 agent 补丁路由镜像 `resolvePatchTargetRoot`（首 ---/+++ 目标＋全前缀清单），pristine v0.22.7 顺序重放 82 direct / 3 conflict。
- [x] 重生成后全量重放：**85/85 direct 零冲突零 threeway**（/tmp/agent-v0227-prep/dryrun.sh 复跑）。
- [x] 净基线单跑：worktree `npm run clean && npm run inject` 全量 **0 条真告警**（WARN/SKIP/ERROR 前缀严格匹配；「fail/error」字样命中 5 条均为同名补丁的成功日志）。
- [x] 语法门：手解 3 文件＋重灌 5 模板 py_compile/ast 全过。
- [x] runtime 部署复核：清单 62 ｜ 相同 34 ｜ 差异 28（既有漂移，与本轮无因果）；5 件定向部署带 .bak 可回滚。
- [x] 台账一致性：VENDOR.md 基线 commit = upstream/hermes-agent HEAD = `b200f5bc6`。
- [x] `npm test` 全量：**7633 passed / 0 failed / 11 skipped**（1038 文件，113.5s）。
- [x] `release:check`：四模块对账全绿（cockpit=1.0.9-studio.9 **agent-teams=v0.22.7-team.1** ycode=3.17.2 yuan-skill=v2.99.1）。
- [x] 拼合树 pytest：runtime/tests **146 passed / 0 errors**（v0226 轮配方；批一夹具缺陷顺修后 141+5→146）。vendor 全树 hermes_cli 面在裸 python3.14 环境缺 prompt_toolkit 等三方依赖不可收集（v0.22.6 同型环境限制，非本轮回归，行为面由 runtime/tests＋vendor 树补丁重放覆盖）。

## 设计文档影响

DESIGN_SYNC: touched —— `vendor/VENDOR.md`（vendor 台账正本，本批修订）、`AGENTS.md`（vendor 行版本）、`team/README.md`（版本方案叙述）随批；A.1 三处登记（附录索引计数 526→527＋机械索引行；receipts 由 L2 钩子随提交落）。数字总账面无涉（team 版本真源=team/VERSION，随批）。
