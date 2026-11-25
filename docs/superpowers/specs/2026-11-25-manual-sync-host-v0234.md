# 2026-11-25 手册同步批：宿主 hermes-agent v0.23.4 后的培训手册与载体勘误

> 缘起：用户告知宿主已升级到 0.23.4，要求培训手册同步。探查以实测为准，三项事实：①**宿主基线已到、覆盖层未跟上**——`~/.hermes/hermes-agent` 的 HEAD 为 `8fc0374447`（tag v0.23.4 所指提交，11-24 22:28 checkout）；部署面 194 件（清单 72＋补丁触碰补位 122）中 163 件与仓内正确产物一致，**31 件不一致、0 件缺失**（明细见挂账 H-1）。网关 11-24 23:36 启动后连续运行，启动后日志零导入类错误。②**手册版本陈述过期**——`docs/manuals/aistudio-complete-training-manual.html` 第 05 幕总览图三个模块标签与附录模块表两行、`docs/manuals/aistudio-design-document-guide.md:189` 上游基线行。③**上一批（2026-11-24 v0.23.4 换血）的哈希口径错误**——`3ac54e1012` 是 annotated tag 对象哈希，不是提交哈希（`git cat-file -t 3ac54e1012` = tag；`git rev-parse v0.23.4^{commit}` = `8fc0374447`），却被写进 commit 口径位；历史各批记的都是提交哈希（`caafe5389a`、`ae2a81ccc` 经 `cat-file -t` 均为 commit）。手册里的"宿主"一词均指技能发现、插件安装通道等义，没有任何一处陈述宿主部署版本，故本批不新增宿主状态叙述，只把实测现状记入台账。

## 变更

1. **培训手册版本陈述同步**（`aistudio-complete-training-manual.html`）：第 05 幕总览图三个标签——驾驶舱 `0.8.20-studio.2→0.8.30-studio.2`、组织控制 `v0.23.1-team.2→v0.23.4-team.1`、Ycode `3.18.0→4.0.0`；附录模块表上游基线行——`hermes-studio 0.8.20→0.8.30`、`hermes-agent 0.23.1→0.23.4`；Ycode 行——基线 `v3.18.0 b95ebaff→4.0.0 a4b44451`、活跃补丁 `10 枚（002—011）→12 枚（002—013）`、补丁描述补 012（Android JDK 主版本校验）与 013（生产依赖安全刷新）。清偿 v0234 批挂账 N-4。
2. **设计导读上游基线行**（`aistudio-design-document-guide.md:189`）：`hermes-agent 为 v0.23.3、caafe5389a→v0.23.4、8fc0374447`（上一批扫描漏网）。
3. **提交哈希口径勘误**（`3ac54e1012→8fc0374447`）：`vendor/VENDOR.md`（表行 commit 列＋2026-11-24 dated 条目）、`team/version.json` 的 `upstreamCommit`、`team/README.md` 本批节、数字总账 2026-11-24 核对段、v0234 spec 三处。
4. **v0234 spec 台账更正**（`SPEC_REBIND=1` 显式重绑）：提交哈希勘误；挂账 N-1 由"滞留 v0.23.3"更正为宿主实测现状；N-4 标注已清偿；"merge 后 main 抽验"项回填（上一批已实测未勾）。
5. **守门测试补结构断言**（`custom/__tests__/aistudio-complete-training-manual.test.ts`）：总览图四个版本标签必须等于 `RELEASE-MANIFEST.json` 四模块版本；附录模块表上游基线行必须等于 studio 包版本与 `team/version.json` 的 `base`；Ycode 行必须等于发布清单的 `baselineCommit` 与 `activePatchCount`。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 手册只同步版本与基线陈述；附录里的计数类内容（swarm-yuan 框架规则 81、运行时与方法 76、研究档案 106、吸收批次 12 个）不核不改 | 这些数字对应各自成文时点的盘点，重核是独立工作量；未核实就改等于造假。挂账 H-2 |
| D2 | 两份 swarm-yuan 指南里的 `v2.100.1` 不动 | 属技能自身版本维度，与 hermes-agent v0.23.4 无关；该页自述"数字以 facts.conf 为准"，改版本号须同步重核全部数字。挂账 H-3 |
| D3 | 宿主覆盖层 31 件不一致本批不处置 | 动宿主是生产运行面（在跑的 agent 团队），须独立批带冒烟与网关重启窗口；且 `hermes_cli/kanban_db.py` 在 11-25 09:54、10:05 仍被修改，宿主有在途操作者，贸然部署会抹掉在途内容。只记台账，处置交用户裁决（挂账 H-1） |
| D4 | 已合入的 v0234 spec 走 `SPEC_REBIND=1` 重绑 | 改动限于事实订正（哈希口径、挂账现状、已实测未勾的验证项），不触碰决策记录；收据机制对已合入 spec 的改写要求显式重绑并留痕 |
| D5 | 守门用"标签等于载体"的结构断言，不用硬编码旧值黑名单 | 黑名单只拦已知旧值，且会误伤合法的历史叙述（如设计导读里"前进到 0.8.20-studio.2"的史实句）；结构断言对任意未来版本成立，版本只在发布清单一处定义 |
| D6 | 基线哈希一律记提交哈希 | 与历史各批口径一致；annotated tag 用 `git rev-parse <tag>` 得到的是 tag 对象，取提交须用 `<tag>^{commit}`。本次错误的直接原因就是用了前者 |

## 验证

- [x] 两份手册守门测试绿：`aistudio-complete-training-manual` 7 例＋`interactive-training-manual` 22 例，合计 **29/29**。
- [x] 变异探针：把手册改回四种旧值——总览图组织控制标签、Ycode 标签、附录补丁数（12→10）、上游基线行——逐一让新用例变红且**每次只有它一条红**；还原后文件哈希一致（191f3e812e68）、7/7 复绿。新断言不是恒真。
- [x] `npm run release:check` 绿（`docs:check` routes=129；四模块对账 cockpit=0.8.30-studio.2／agent-teams=v0.23.4-team.1／ycode=4.0.0／yuan-skill=v2.103.0）。
- [x] 载体对账：`team/version.json` 的 `upstreamCommit`、`vendor/VENDOR.md` 表行、设计导读基线行均为 `8fc0374447`，等于 `git rev-parse v0.23.4^{commit}`；仓内残余的 `3ac54e1012` 只出现在勘误说明里。
- [x] `gen-doc-indexes --write` 后 `--check` 0 problem（767/767/314），冲突标记零命中。
- [x] `npm run regress -- --scope merge`：**14 面 14 通过，0 失败，0 未执行**。
- [x] 独立审查——**未取得独立第三方结论**：审查子代理启动后因模型用量上限中止（13:56 重置），未产出报告。以下为实现者自查，不等于独立审查：①手册全目录复扫（按旧值族×历史语境过滤），hermes-agent／hermes-studio／驾驶舱／agent teams／Ycode 五个维度零残留，旧值只出现在明确的历史叙述里；swarm-yuan 维度另得三份过期（见 H-3）。②内存推演六种"载体已变、手册没跟"（series 少一条、驾驶舱版本前进、team base 升、studio 包版本升、ycode 基线提交变、yuan 版本前进）全部会被新断言拦下，基线不误报；`zcode-patches/series` 解析对注释行、空行、行内注释稳健，当前文件无 CRLF、条目行均以 `.patch` 结尾。③手册 HTML 结构计数（section 17／svg 12／table 1／tr 13／td 26／text 236）与改前全等，行数 686 不变。④新增的 012、013 描述与补丁登记核对：013 补丁对 `package.json` 新增 39 行、删除 1 行，被删行是 `react-dom` 同值补尾逗号，净增 38 条，与登记一致。⑤改动范围未越出声明（非 vendor 改动 9 件）；`git diff --check` 仅报 vendor 注入态两处（工具产物，不在本批）。**未核查**：对已合入 v0234 spec 更正的逐处越界判断、宿主 31 件分类的独立复算，只有实现者单方结果。

## 设计文档影响

DESIGN_SYNC: touched —— `vendor/VENDOR.md`（表行 commit 列勘误＋dated 条目）、`team/version.json`（`upstreamCommit`）、`team/README.md`、`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`（2026-11-24 核对段哈希勘误）、`docs/manuals/aistudio-design-document-guide.md`（上游基线行）、`docs/superpowers/specs/2026-11-24-vendor-upgrade-agent-v0234.md`（勘误与挂账更正）。

## 挂账

| # | 项 | 处置建议 |
|---|---|---|
| H-1 | **宿主覆盖层未跟上基线**：31/194 件与仓内正确产物不一致。(a) 纯 v0.23.4 基线、本仓补丁未生效 18 件：`gateway/hosted_rooms.py`、`gateway/kanban_watchers_common.py`、`gateway/kanban_watchers_notifier.py`、`gateway/run_busy.py`、`gateway/run_inbound.py`、`hermes_cli/kanban_boards.py`、`hermes_cli/kanban_db_boards.py`、`hermes_cli/kanban_decompose.py`、`hermes_cli/kanban_parser.py`、`hermes_cli/main_agent_cmds.py`、`hermes_cli/skills_hub.py`、`hermes_cli/subcommands/cron.py`、`hermes_cli/subcommands/memory.py`、`hermes_cli/plugins_manifest.py`、`plugins/platforms/matrix/plugin.yaml`、`tests/gateway/test_max_concurrent_sessions.py`、`tests/hermes_cli/test_plugin_manifest_v2.py`、`tools/tool_result_storage.py`；(b) 等于升级前旧模板 7 件：`hermes_cli/cron.py`、`hermes_cli/kanban_output.py`、`locales/en.yaml`、`locales/zh.yaml`、`plugins/kanban/dashboard/plugin_api.py`、`tools/file_tools.py`、`toolsets.py`；(c) 中间态或带宿主本地块 6 件：`agent/tool_executor.py`、`gateway/session_kanban.py`、`hermes_cli/kanban_db.py`（带 `swarm:cq16_handoff_normalize` 块，11-25 仍在改）、`hermes_cli/kanban_db_dispatch.py`、`tests/tools/test_outcome_policy.py`、`tools/kanban_tools_schemas.py`。成因未采集（仓内无这次宿主升级的记录；22:29 的写入未留部署备份） | 待用户裁决。独立收口批：先与宿主在途操作者对齐并做热修考古回灌，再部署 194 件、导入冒烟、网关重启窗口、194/194 对账。不做则宿主持续缺这批补丁功能 |
| H-2 | 培训手册附录模块表的计数类内容未核（swarm-yuan 规则/运行时/研究档案数、"12 个吸收批次"） | 独立的手册内容盘点批 |
| H-3 | 三份文件的 swarm-yuan 版本落后（当前 v2.103.0）：`aistudio-swarm-yuan-guide.html`（四处 `v2.100.1`，含"当前版本："）、`aistudio-interactive-training.html:554`（`v2.100.1`）、`aistudio-swarm-yuan-developer-guide.md:5`（**"当前版本：v2.100.3"**，自称当前的过期陈述） | 随技能版本同步，须按 `facts.conf` 重核各页全部数字；可把 `v2.100.1`／`v2.100.3` 列入下一次手册盘点批的首批核对项 |
| H-4 | 网关启动后 `gateway.error.log` 有 343 条 Traceback（00:14—09:53），全部是 hindsight 插件调外部服务失败：500×224、超时×96、401×16、504×2、取消×5 | 与本次升级无关，外部服务或凭据侧问题，通报 |
