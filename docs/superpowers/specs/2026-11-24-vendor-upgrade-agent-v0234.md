# 2026-11-24 vendor 升级批：hermes-agent v0.23.3 → v0.23.4

> 上游身份：v0.23.3 = `caafe5389a` → v0.23.4 = `8fc0374447`（上游 2026-11-23 发布，tag 与 rc.2-v0.23.4 同点。2026-11-25 勘误：本批原记 `3ac54e1012` 是 annotated tag 对象哈希，不是提交哈希，下文同此更正；勘误批 spec 2026-11-25-manual-sync-host-v0234），1143 提交 / 1316 文件 / +96,873 −6,703（中等规模，仅次于 v0.23.2/v0.23.3 两轮大差量）。主题分布：cron 晨报链修复（morning-brief 只读化＋保留 blueprint skills）＋gateway session prompt 钩子（pending prompt 表惰性快照＋owner scope 参数脱敏）＋profiles 平台适配器不重建已删 profile＋插件运行期间宿主 profile 互斥＋shared-metrics 日快照（群聊计数＋宿主标识）＋模型目录 Gemini 4 Carbon/Neon/Hydrogen＋matrix operator recovery-key 越界修复＋desktop 修复群（本地 GPU 渲染/Linux 通知/presence 回退）＋plugin-catalog bump（loreconvo 0.12.1 等）。探查证据：series 500 枚（agent 面 114＋studio 面 386，零缺文件）；agent 面 **21 枚目标文件与上游变更有交集**（重锚候选上界，实际以净基线重放实测为准）；**致死交集 0 枚**（上游删除面仅 3 文件，与 agent 补丁目标零交集）；上游无新增顶层目录，`HERMES_AGENT_PATCH_PREFIXES` 无需扩展（`persistence/` 已于 v0233 批入表，本轮实测确认）。

## 变更

1. **vendor/hermes-agent 基线换血**：vendor-sync 显式通道整树替换（worktree `chore/vendor-upgrade-agent-v0234` 内执行，起点=origin/main `a3aa9b675`——本地 main `55c719f2e` 领先两个 docs 提交，收口 rebase 集成），upstream/hermes-agent 缓存树同批 checkout 至 v0.23.4（pristine 规则）。`.gitignore` 误伤面（export* / electron `*.d.ts` 等）按 2026-11-02 复核批立规同规则 `git add -f` 补录。
2. **agent 面 114 枚补丁新基线落位**（交集 21 枚；热点=`hermes_cli/kanban_db_dispatch.py`×5、`gateway/run.py`×5、`agent/tool_executor.py`×4，实际手解数以逐失败迭代实测为准）。手解配方沿用 v0233 批修正版：reject-apply 定位＋prefix A 快照先行（splice derived-A 丢段坑）＋重生成切片统一 `+++ b/` 相对路径（v0232 批 ①坑）；净基线重放为逐失败迭代制（lane 级 block 掩盖后续真失败）。
3. **runtime 覆盖层重镜像**：与 vendor/hermes-agent 注入态的交集件从新注入态重镜像（正源=注入态非影子树）；对账口径以新基线重跑为准（v0233 终态 194 相同/0 差异/0 待收口）。**镜像前置判定**：若 runtime/ 件承载宿主热修无补丁承载（grep patches 零命中判据），按 D9 裁决保护不覆盖、挂账。
4. **载体链八处口径进位**：`vendor/VENDOR.md`（表行＋dated 条目）、`AGENTS.md` vendor 行、`README.md` 组件表版本行、`team/VERSION`（→`v0.23.4-team.1`）、`team/version.json`、`team/README.md`（What changed 新节）、`RELEASE-MANIFEST.json`、`team/requirements.txt`（range `<0.24` 已覆盖 0.23.4 不动，仅注释）。
5. **投影面随批**：docs:sync 投影块重写；版本断言数组 `v0.23.3-team.1` → `v0.23.4-team.1`（守门测试同步）；A.1 三处登记；数字总账 hermes-agent 基线行随批。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 升级目标=正式 tag v0.23.4，canary 流不追 | 仓规惯例（v0230~v0233 批同口径） |
| D2 | worktree 内迭代重放，不做 /tmp 预演 | v0233 批 D2 先例；worktree 本身隔离等价预演 |
| D3 | 失败补丁手解重生成，不走 3way 盲合 | v0227 批 D7 先例（silent semantic drift）；先归因再动手解（级联假阳性方法论） |
| D4 | 宿主 `~/.hermes/hermes-agent` 部署面挂账不处置 | v0232/v0233 批 D4 先例；宿主树运行热修域，须独立批带网关重启窗口；本批 deploy 走 worktree 影子（`.runtime-deploy-shadow/`）不触宿主 |
| D5 | SIM 重盖章不随批做 | v0233 批 N-2 终态：SIM profile 已随归档轮拆除，下次 run 由 mx-setup 重建即新面 |
| D6 | 路由前缀表不预扩 | v0233 批先例「实测确认后再加，不预加」；本轮探查零新增顶层目录，重放实测为准 |
| D7 | merge 时带 `VENDOR_SYNC=1` 并抽验 merge 提交 vendor 面 diff 非零 | v0233 批 D7 实测 pre-commit 对 merge commit 也撤 vendor staged；清偿配方=main 上补普通提交 |
| D8 | 手册版本快照行随 RELEASE-MANIFEST 进位由 docs:sync 投影链处理，不手改 | v0233 批 D8 先例（双源摇摆坑） |
| D9 | runtime 热修保护判定前置 | v0233 批 D9 裁决延续：无补丁承载的宿主热修不镜像覆盖；有补丁承载可全量重镜像 |

## 验证

- [x] upstream/hermes-agent 缓存树 checkout v0.23.4 后 status 干净（pristine，8fc0374447）。
- [x] 换血文件面 staged 与上游 `diff --name-only` 精确吻合（1317=1317 双向差集空）；`.gitignore` 误伤面核验（436 新文件批量 check-ignore 零命中；旧补录件延续 tracked）。
- [x] pristine blob 抽验 3/3（agent/conversation_loop.py、gateway/run.py、pyproject.toml 对 v0.23.4 tag 全一致）。
- [x] worktree 净基线 clean+inject 全量 status=complete **511/511 applied 零 FAIL**（agent 114＋studio 386＋zcode 11，注入日志计数）＋幂等二连双 complete。
- [x] 手解文件 py_compile 全过（391/612/732/741/786 五枚重锚的目标文件＋新增测试文件，重锚后即验）。
- [x] 拼合树 pytest（补丁自带测试集 63 文件）：**772 过/8 红/3 跳**，存量归因见下条。
- [x] 存量归因：8 红与主检出 v0.23.3 注入态**同清单同红集逐字节相同**（两树各 772 过/8 红/3 跳；红族=runaway_guard vocabulary_frozen＋kanban_verification_levels StrictPr/Independent 三枚＋delegate_handoff_phrase＋followup_tool missing_session＋memory_consolidate external_drift＋subagent_source_marks run_batch——均在案跨批存量族）＝**净红 0**。
- [x] runtime 对账终态：清单 72＋补丁触碰 125＝**197 相同/0 差异/0 待收口**（--apply --force 刷 shadow 后 dry-run complete）；30 交集件从注入态重镜像＋**D9 承载件四还原**（`shutdown_watchdog` hostile-load 热修／`file_tools` 陈旧会话拒写守卫（_check_stale_repo_write 移植新 precheck 链首）／`test_kanban_verification_levels` 结果交付批逐条 AC 版（note 明载替换 patch 775 旧版）／`test_project_pause` tier=T1 适配版）＋注释三处回植（session_kanban/run_inbound 审查 P0-1 门面路线注）；**三轮扫描收口**（关键词→宽特征词→删除行代码级 164 行逐一定性：kanban_db_dispatch infrastructure_cooldown 上游已重构演进、kanban_output 注释新态更优、RuntimeStoreError 别名过时）；py-runtime 面 **276/276 全绿**。
- [x] 载体链一致性：team/VERSION＝version.json（base 0.23.4/upstreamCommit 8fc0374447/extN 1）＝RELEASE-MANIFEST＝VENDOR.md 表行＝AGENTS.md/README；**release:check 四模块全绿（agent-teams=v0.23.4-team.1）**；requirements range `<0.24` 已覆盖仅注释。
- [x] 投影面：docs:sync 投影块重写＋docs:check 绿；手册断言数组进位 v0.23.4-team.1；team/README（en/zh）现状行与 What changed 新节随批；design-document-guide 快照＋数字总账（基线行/teams 行/2026-11-24 核对段）随批；gen-doc-indexes --write 后 --check 0 problem（761/761/308）＋冲突标记扫描零命中。
- [x] `npm test` 全量：**9941 过/2 红→0 红**（两红=手册族版本字面量断言：training-manual HTML meta 行＋operations-reference 模块版本行＋design-document-guide 快照两行滞留 v0.23.3-team.2，随批进位后 28/28 复绿；根因=版本传播面清单漏列三手册文件，本轮已全量 grep 扫尾）＋12 跳过，零环境性红。
- [x] 独立审查（蓝军）总判 **PASS-with-findings 零 P0/P1 可合并**（agent 审查 7 项全过＋主会话复跑核验树三元组 27,571 行零差异）：基线纯净性（ls-tree 三元组=tag 逐行等＋blob 抽验 5/5）、五枚手解纯锚迁/正确消费新 API（612 _Pageable 新消费/741 kanban_launch_policy 门面化语义等价/786 尾上下文含 _status_reporter）、注入面组合反向逐字节相等（612 反向还原=pristine；conversation_loop 四补丁链、dispatch 七补丁链合成=注入态）、载体链八处全绿、runtime D9 四还原实证（hostile 12/守卫 precheck 首行调用/AC 报告版/tier=T1）＋镜像面 11 差异全有账、提交卫生（vendor 面 name-status 1316 行逐行等=零注入态＋临时文件零命中＋收据无 drift）、投影面 release:check/docs:check 复跑绿。P2 两条：①培训手册 SVG 总览图残留三旧版本标签（存量债，挂账 N-4）②文件面计数口径 1317(name-only)/1316(name-status) 自洽备注。
- [x] merge 后 main 抽验：vendor/hermes-agent 面 diff 非零；merge 树与分支树零差异（纯壳合并）；主检出注入态重建。（2026-11-25 回填，三项均已于合并当晚实测：merge 08f45b786 的 vendor/hermes-agent 面 1316 文件非零；merge 树与分支树 diff 为空；主检出 clean+inject 重建后 manifest treeOid cd90ec2c 与 HEAD 树一致。）

## 设计文档影响

DESIGN_SYNC: touched —— `vendor/VENDOR.md`（台账正本：表行 commit/版本＋dated 条目）、`AGENTS.md`（vendor 行版本）、`README.md`（组件表版本行）、`team/README.md`（What changed 节）、`team/VERSION`/`team/version.json`、`RELEASE-MANIFEST.json`（agent-teams.version＋vendorBaseline）、`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`（数字总账 hermes-agent 基线行＋agent teams 模块行）；A.1 三处登记；scope.yaml 同批声明。

## 挂账（不处置清单）

| # | 项 | 处置建议 |
|---|---|---|
| N-1 | ~~宿主 `~/.hermes/hermes-agent` 部署面收口后滞留 v0.23.3+热修融合态~~ **2026-11-25 实测更正**：宿主基线已到 v0.23.4（HEAD 8fc0374447，11-24 22:28 checkout），但覆盖层 31/194 件未跟上——18 件仍是纯基线、本仓补丁未生效，7 件停在升级前旧模板，6 件为中间态或带宿主本地块；网关 23:36 启动后无导入类错误 | 仍开放。明细与处置建议转 spec 2026-11-25-manual-sync-host-v0234 挂账 H-1；是否开独立收口批待用户裁决 |
| N-2 | SIM 盖章 | 对象已拆除（v0233 N-2 终态），下次 run mx-setup 重建即 v0.23.4 面，无需独立批 |
| N-4 | ~~培训手册 SVG 总览图残留旧版本标签（0.8.20-studio.2／v0.23.1-team.2／3.18.0，父提交存量非本批引入；守门只正向断言拦不住旧值残留）~~ **已清偿**（2026-11-25 手册同步批：总览图三个标签与附录模块表两行同步到当前版本；守门改为"标签必须等于发布清单"的结构断言，不再硬编码版本号） | 无剩余动作（spec 2026-11-25-manual-sync-host-v0234） |
| N-3 | 在途他批 rebase 集成 | 收口 fetch 实测：main 前进至 b63e5e2d（ycode 依赖安全刷新 zcode-patch 013＋docs 两笔）；agent 面零新补丁（013 属 zcode 树），预期 agent 重放零重锚；已知冲突面=spec-receipts（并集按 at）/design-document-index（重生成）/RELEASE-MANIFEST（两侧异区域自动并） |
