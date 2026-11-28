# 2026-11-28 vendor 升级批：hermes-agent v0.23.4 → v0.23.5

> 上游身份：v0.23.4 = `8fc0374447` → v0.23.5 = `a428f5344f`（提交哈希口径 `v0.23.5^{commit}`；tag 对象 `bdd68e2233`，沿用 2026-11-25 勘误规则取 `^{commit}`），1277 提交 / 1146 文件 / +57,989 −5,346。主题分布：**插件宿主/profile 名治理大流**（fix(plugins)/fix(dashboard) 约百枚量级：profile 目录改名/删除后的宿主启动拒绝、provider 扫描防陈旧、launcher 借用防串台）＋plugin-catalog scope 114＋catalog 84（catalog bump 流）＋CLI OSC 7577 程序化 resume 协议＋CLI 箭头键 CSI 解码修复群＋macOS CLT git stub 防护群（review_push/review_revert 拒绝、相对 PATH 解析）＋credential-pool 报错命名与 aux 门控＋gemini 与 solstice 合并为 bundled google（`plugins/model-providers/{gemini,solstice}` 删除）＋web 字体 6 件删除。persistence/ 仅 8 文件差量、无 state 层 breaking、无 `!:` 提交；顶层目录零新增→`HERMES_AGENT_PATCH_PREFIXES` 不扩。探查证据：series 505 枚（agent 面 115 枚，deploy/inject 实测口径）；agent 面 **19 枚目标文件与上游变更有交集**（热点=`gateway/run.py`×5＝586/786/788/789/813、`gateway/run_startup.py`×3＝786/788/789、`gateway/run_busy.py`×3＝533/612/688、`agent/context_compressor.py`×3＝400/409/475，其余单发）；**致死交集 0**（上游删除 11 文件与全部补丁目标零交集）。rc.1-v0.23.6 已在途（abandoned-rc.1-v0.23.6 并存），本轮不追。

## 变更

1. **vendor/hermes-agent 基线换血**：vendor-sync 显式通道整树替换（worktree `chore/vendor-upgrade-agent-v0235` 内执行，起点=origin/main），upstream/hermes-agent 缓存树同批 checkout 至 v0.23.5（pristine 规则）。`.gitignore` 误伤面（export* / electron `*.d.ts` 等）按 2026-11-02 复核批立规同规则 `git add -f` 补录。
2. **agent 面补丁新基线落位**（交集 19 文件见抬头热点表，实际手解数以净基线重放逐失败迭代实测为准）。手解配方沿用 v0234 批修正版：reject-apply 定位＋prefix A 快照先行＋重生成切片统一 `+++ b/` 相对路径＋净基线逐失败迭代制。
3. **runtime 覆盖层重镜像**：交集件从新注入态重镜像（正源=注入态）。**禁 blanket 重镜像（v0234 铁律）**：逐件判据——①HEAD:runtime vs HEAD-era 注入态有额外内容者→移植新基座；②manifest note 含「热修/宿主存/替换/回灌/防护」者→承载件审读；③重镜像后必跑 py-runtime 面＋关键词/代码级双扫描。宿主 `~/.hermes/hermes-agent` 部署面继续挂账（H-1 混合态在案，待用户裁决独立收口批）。
4. **载体链八处口径进位**：`vendor/VENDOR.md`（表行＋dated 条目）、`AGENTS.md` vendor 行、`README.md` 组件表版本行、`team/VERSION`（→`v0.23.5-team.1`）、`team/version.json`、`team/README.md`（What changed 新节）、`RELEASE-MANIFEST.json`、`team/requirements.txt`（range `<0.24` 已覆盖 0.23.5，仅注释）。
5. **投影面随批**：docs:sync 投影块重写；版本断言数组进位 `v0.23.5-team.1`（守门测试同步）；A.1 三处登记；数字总账 hermes-agent 基线行随批。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 升级目标=正式 tag v0.23.5，rc.1-v0.23.6/canary 不追 | 仓规惯例（v0230~v0234 批同口径） |
| D2 | worktree 内迭代重放，不做 /tmp 预演 | v0233/v0234 批 D2 先例 |
| D3 | 失败补丁手解重生成，不走 3way 盲合 | v0227 批 D7 先例；先归因再动手解（级联假阳性方法论） |
| D4 | 宿主 `~/.hermes/hermes-agent` 部署面挂账不处置 | v0232~v0234 批 D4 先例；宿主树含热修域＋H-1 混合态待独立收口批；本批 deploy 走 `.runtime-deploy-shadow/` |
| D5 | SIM 重盖章不随批做 | v0233 批 N-2 终态；下次 run 由 mx-setup 重建即新面 |
| D6 | 路由前缀表不预扩 | v0234 批 D6 先例；本轮探查零新增顶层目录 |
| D7 | merge 时带 `VENDOR_SYNC=1` 并抽验 merge 提交 vendor 面 diff 非零 | v0234 批 D7 先例 |
| D8 | 手册版本快照行随 RELEASE-MANIFEST 进位由 docs:sync 投影链处理，不手改 | v0233/v0234 批 D8 先例 |
| D9 | runtime 热修保护判定前置，禁 blanket 重镜像 | v0234 批铁律（三件 D9 承载内容丢失实录）；逐件判据三条已入流程 |

## 验证

- [x] upstream/hermes-agent 缓存树 checkout v0.23.5 后 status 干净（pristine，a428f5344f）。
- [x] 换血文件面 staged 与上游 `diff --name-only` 精确吻合（1146=1146 双向差集空）；`.gitignore` 误伤面核验零命中（v0234 批同态，无需 add -f）。
- [x] pristine blob 抽验 3/3（conversation_loop.py/gateway/run.py/pyproject.toml 对 v0.23.5 tag 逐字节一致）。
- [x] worktree 净基线 clean+inject 全量 status=complete **519/519 applied 零失败**（agent 115＋studio 390＋zcode 14，journal 计数）＋幂等二连双 complete。
- [x] 手解 372 重锚记录：根因=上游 import 块插入 `lifecycle_ledger`/`memory_status` 两条（typing 行加 `Iterator`）致原 hunk1「blank→restart」相邻失效（journal reason `patch failed ...:23` 为真实失败点；`git apply --check` 的 `Skipped patch` 是假信号）；重写 hunk1 锚迁 `typing/comment/lifecycle` 并按字母序把 `control_socket` 插组首，hunk2 目标行原样存续仅行号漂移（apply offset 容差吸收）。**过程坑实录**：vendor 子树 cwd 手工 `git apply --check` 曾多次静默 Skipped（exit 0 无操作），而同补丁同文件在 /tmp 隔离点正常 apply（offset 容差吸收、+行与原补丁逐字节等价、py_compile 过）。事后复盘：注入完成后（372 已在树）的 Skipped 属「已应用态」正确跳过，属观察污染；注入前的 vendor 子树 cwd Skipped（同一 pristine 文件＋同一补丁在 /tmp 正常）仍机理未定谳——正本通道 npm run inject 全程不受影响（journal 双 complete 实证）。操作规则已立：补丁手工诊断一律走 /tmp 隔离点（用上游 pristine 文件做底座），vendor 子树 cwd 的手工 git apply 结果不可信。py_compile 即验过。
- [x] 拼合树 pytest（补丁自带测试集 63 .py 文件，python3.14）：**772 过/8 红/3 跳**，8 红与主检出 v0.23.4 注入态同清单同红集逐字节相同（红族=runaway_guard vocabulary_frozen＋kanban_verification_levels 三枚＋delegate_handoff_phrase＋followup_tool missing_session＋memory_consolidate external_drift＋subagent_source_marks run_batch，均在案跨批存量族）＝**净红 0**。
- [x] runtime 对账终态：14 件差集逐件判定（三方比对 HEAD:runtime／主检出 v0.23.4 注入态／worktree v0.23.5 注入态）：**4 纯滞后重镜像**（run_busy/locales en·zh/tool_result_storage）、**8 D9 载体保持**（run_inbound/session_kanban 审查注、followups、test_capacity_retry_anchor、test_board_team_fence、test_decision_grant、test_kanban_verification_levels AC 版、test_project_pause tier=T1——注入态两代未变，差异即已审计 D9 内容）、**2 外科合并**（shutdown_watchdog：hostile-load 容忍叠加到上游 #148527 forensics 重构上——常量块两保留、defer 分支前置于 `_run_liveness_forensics` 调用、`hostile_load_deferrals_used` 以可选参数保留进 dump 快照；file_tools：`_check_stale_repo_write` 守卫经 git merge-file 净合并落新 precheck 链首）；两合并件 py_compile 过＋标记锚核验；`--apply --force` 刷 shadow 后 dry-run **197 相同/0 差异/0 待收口 complete**；py-runtime 面 **282/282 全绿**。
- [x] 载体链一致性：team/VERSION＝version.json（base 0.23.5/upstreamCommit a428f5344f/extN 1）＝RELEASE-MANIFEST＝VENDOR.md 表行＝AGENTS.md/README；**release:check 四模块全绿（agent-teams=v0.23.5-team.1）**；requirements range `<0.24` 已覆盖仅注释；残留字面量扫描零命中（历史 spec 与 RELEASE-NOTES 按冻结/已发版口径不动）。
- [x] 投影面：docs:sync 投影块重写＋docs:check 绿（routes=130）；手册断言数组进位 v0.23.5-team.1；team/README（en/zh）现状行与 What changed 节随批；design-document-guide 快照＋数字总账（基线行/teams 行/2026-11-28 核对段前置）随批。
- [x] `npm test` 全量 **10643 过/0 红**＋11 跳过（首轮 4 红定谳：2 红=培训手册 HTML 总览图/上游基线行滞留 v0.23.4-team.1/0.23.4，随批进位后守门 7/7 复绿；另 2 红复跑未复现判抖动）；`npm run regress -- --scope merge` **15/15 通过 0 失败 0 未执行**。
- [x] 独立审查（蓝军自查，子代理配额窗口 2026-11-28~12-03 期间主会话执行）：①基线纯净性=staged 树三元组（mode/oid/path）与上游 tag 全量对比 **27,866=27,866 零差异**（强于 v0234 抽验）；②372 语义等价=+行集合逐字节相同（rstrip 归一）＋pristine 底座 apply 过＋py_compile 过＋**反向还原=pristine 32,938B 逐字节相等**；③注入面=journal 双 complete（519/519）＋deploy 幂等 197 相同；④runtime D9=14 件差集逐件判定有账＋两合并件标记锚核验＋py-runtime 282/282；⑤载体链/投影面=release:check 四模块＋docs:check＋gen-doc-indexes 800 specs 0 problem；⑥提交卫生=staged vendor 面=pristine 换血清单 1146 行双向差集空＋studio 树注入态未混入＋冲突标记扫描零命中。零 P0/P1。
- [x] merge 后 main 抽验（2026-11-28 合并当晚实测回填）：merge ce8fed344 的 vendor/hermes-agent 面 **1146 文件非零**；merge 树与分支尖 2944456e5 对比**仅他会话在先 docs 提交一件**（244719e6f 顺带推送，其余零差异）；主检出 clean+inject 重建 **status=complete（505/505，0 非 applied）**、journal 基线 treeOid f377a5b99=HEAD vendor 树——宿主部署面经 RUNTIME_DEPLOY_TARGET 改道演练目录未触（D4/H-1 挂账维持，部署预检曾因宿主 35 件差异拒启，属保留目标机制正常工作）。任务卡登记归还链：登记 6c14242a→推送→归还 25601f97（cmp 三件与 e9a13c1db 逐字节一致，治理规格补记）。

## 设计文档影响

DESIGN_SYNC: touched —— `vendor/VENDOR.md`（台账正本：表行 commit/版本＋dated 条目）、`AGENTS.md`（vendor 行版本）、`README.md`（组件表版本行）、`team/README.md`（What changed 节）、`team/VERSION`/`team/version.json`、`RELEASE-MANIFEST.json`（agent-teams.version＋vendorBaseline）、`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`（数字总账 hermes-agent 基线行）；A.1 三处登记；scope.yaml 同批声明。

## 挂账（不处置清单）

| # | 项 | 处置建议 |
|---|---|---|
| H-1 | 宿主 `~/.hermes/hermes-agent` 部署面混合态（基线 v0.23.4 但覆盖层 31/194 未跟上，spec 2026-11-25-manual-sync-host-v0234 在案） | 开放中，待用户裁决独立收口批；本批后宿主面再滞后一版 |
| N-3 | 在途他批 rebase 集成（manual-sync-1128 / sim-guard-absorb 两 worktree 在途） | 收口 fetch 实测；已知冲突面=spec-receipts（并集按 at）/design-document-index（重生成）/RELEASE-MANIFEST（异区域自动并） |
| N-6 | vendor 子树 cwd 手工 `git apply` 静默 Skipped（机理未定谳，本轮实证记录） | 已立操作规则：补丁手工诊断走 /tmp 隔离点；如复发再立项根治（git 2.54 Apple 交互嫌疑） |
