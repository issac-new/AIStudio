# runtime 覆盖层重灌 v0.22.6 基底＋optional-mcps 部署链补位（2026-11-04）

来源：运行时台账刷新批（2026-11-03-runtime-deps-refresh.md）的遗留代办清偿。deploy-agent-runtime 报宿主 `~/.hermes/hermes-agent` 与 runtime/ 模板 20 件漂移；另 `hermes mcp install exa` 报 not in catalog。

## 变更

1. **runtime/ 覆盖层 16 件重灌至 v0.22.6 基底**（vendor 升级批 2026-11-03 的挂账：基线换血后覆盖层未随批重灌，模板停留在 0.22.5 基底），终态=三型处置：
   - **镜像换血 9 件**（直接取 vendor 注入态）：4 件零增强纯镜像（run_busy/subcommands-cron/tool_executor）＋5 件经符号三分定谳（run_inbound/platforms-base/toolsets/file_tools/tool_result_storage）——「模板独有段」逐符号 grep pristine v0.22.6 全部命中（细粒度 browser_* 被上游收窄为 browser_exec、LocalEnvironment 判定升级为 env_uses_host_filesystem 统一实现、busy 抢占/admission 路径上游原生），旧形态名回植=死名，镜像化即理想态。首版脚本对这 5 件的 3-way 静默无效（模板末次提交与 0.22.4 轮同一秒，`--before` 严格排除致 BASECOMMIT 空、`git show :path` 误取索引版当 base），符号定谳后换镜像法根治。
   - **3-way 重灌 6 件**（merge-file，11 冲突块手解三型）：并集型（hosted_rooms 签名 control_reserve×collab_event_id；cron.py _JOB_ARG_FIELDS 取 vendor 超集）、位置漂移去重（dispatcher 健康面段双现留 vendor 位）、增强保留（kanban_db estimate 三段/dispatch 双键+HumanGate 硬门/connect UDF 注释）。
   - **补吸收 1 件**：hosted_rooms 手解只并了签名，control_reserve 的 docstring 与 `allow_control=... or (control_reserve and ...)` 判定行（vendor:1004）后补——否则参数成 dead param，上游 control headroom 语义失效。
   - cron.py 终态镜像化（增强仅剩一行过时 Usage 文案，vendor 版含 cancel 子命令）；kanban_db 的「残留 1 行」为列序结构等价（estimate 列在 block_recurrences 后），dispatch 残留为模板双键增强对 vendor 单键旧实现的优势差——均无需再动。
   - 终态对账：20 件中 13 件与 vendor 注入态零差异、4 件纯增强保留（kanban_parser/schemas/session_kanban/connect）、3 件增强+微差（kanban_db/dispatch 结构与增强差、hosted_rooms 补齐后）。
2. **runtime-manifest.json 52→54 条**：新增 exa/semantica 两条 optional-mcps 部署映射。根因：patch 396/375 只注入 vendor 树，安装树 optional-mcps/ 目录从未有这两个自定义条目——catalog（读安装树）不识别、`hermes mcp install` 无门。正身仍是 runtime/{exa,semantica}/manifest.yaml 单一事实源，部署链补位后 catalog 即时可见。
3. 其余 4 件漂移（plugin.yaml/memory/main_agent_cmds/kanban_parser）无需改动：前三件模板==vendor 注入态（增强已被上游吸收），kanban_parser 为纯增强件（模板即理想态）。

## 决策记录

| # | 决策 | 依据 | 备选（否决理由） |
|---|---|---|---|
| D1 | 宿主无热修，漂移真因=模板未随 v0.22.6 重灌+宿主旧世代部署 | 20 件三方 hash/diff 定谳：宿主内容全部 ∈ {旧模板, vendor 态}，无一件宿主独有热修 | 回灌宿主到模板（否决：方向反了，宿主是旧的） |
| D2 | 5 件「模板独有段」经符号三分定谳后镜像化，不以 3way 强合并 | 模板末次提交与 0.22.4 轮同秒致 base 无法从 git 历史取到；独有段符号（browser_navigate/_hm_busy_preempt/_cleanup_cache_dir/LocalEnvironment 等）在 pristine v0.22.6 全部有新形态对应=上游已取代，回植旧形态=死名 | 空文件 base 硬 merge（已实测：产生 11-22 冲突块污染，弃） |
| D3 | 部署走 --force 全量覆盖宿主后重启网关 | 定谳 D1 宿主为旧世代拼合无热修；生效三层验收法要求树+进程都换血 | 不重启（否决：进程内旧模块缓存分裂态，inject.mjs 2026-10-14 立法先例） |
| D4 | exa 安装动作停在 catalog 可见，install 等 EXA_API_KEY | 全 profile .env 均无 EXA_API_KEY，install 必然 prompt 卡死；key 属用户资产不入库不代填 | 空 key 硬装（否决：装出 401 死工具） |

## 验证

- 语法：重灌 16 件全部 `ast.parse` 通过；全 runtime/ 无冲突标记残留。
- 功能：拼合树（worktree vendor 注入态+manifest 54 条覆盖+runtime/tests）`python3 -m pytest runtime/tests/` **94 passed**（此前三次红均为拼合环境搭建缺目录，非重灌问题：custom 软链、runtime/hermes_cli 补拷后一次全绿）。
- 部署：`--force --apply` 同步 9 件（.bak 时间戳备份在位可回滚）；复核 dry-run **54/54 相同、差异 0**。
- 活体：日常 profile gateway 无活进程（下次拉起自然吃新代码）；SIM 网关（PID 84770 在途轮）不擅自打断，SIM 面树新于进程的自动重启机制（dcf24c35a）自行处理。树层验证=宿主 14 重灌模块 `.venv` import 冒烟全过＋功能锚点断言过（cron `_JOB_ARG_FIELDS` 含 timezone；`append_event` 签名含 control_reserve×collab_event_id 并集）。
- catalog：`hermes mcp catalog` **exa/semantica 双条目 available**（部署链补位生效，2026-11-04 实测）；`hermes mcp install exa` 走通至 EXA_API_KEY getpass（无 key 被拒=通道畅通），key 为用户资产待用户从 dashboard.exa.ai 申请后一条命令安装。

## 设计文档影响

DESIGN_SYNC: none——runtime/README.md 的覆盖层职责与更新 SOP 未变（本批是既有 SOP 的执行与 manifest 清单扩展，无设计面变更）；A.1/设计索引同批登记本 spec。
