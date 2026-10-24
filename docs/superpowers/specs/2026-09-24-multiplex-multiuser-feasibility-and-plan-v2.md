# 全流程推演方案 V2.0：单 gateway 多路复用多用户拓扑（可行性分析与调整）

写给：推演导演与 SwarmStudio 产品/架构决策者。本文回答三件事：单 gateway 多路复用模拟多用户是否可行（第二章：可行，缺口三处）、全流程推演方案怎么调整（第三章：20 步业务流不变，拓扑与账号口径重写）、本轮落地什么（第四章：三个 patch + mux harness + 冒烟实测）。

本文取代 `2026-09-22-aipaydev-multiuser-sim-design.md` 的 §4（实例与端口）与 §7 步骤 1-5 的拓扑口径；20 步业务流本身沿用 V1。每用户 11 gateway 的旧拓扑定性为过渡实现（用 `--force` 绕开主机守卫），本方案是 `gateway-host-ownership.md` §三.3 预告的"multiplex 迁移"立项落地。

## 1. 结论

**可行，按目标形态落地。** 一个 `hermes gateway run` 进程多路复用全部用户是上游原生形态（`upstream/hermes-agent/gateway/host_rendezvous.py:5`：每主机"exactly ONE `hermes serve` and ONE `hermes gateway run`，each multiplexing every profile"），每用户 Orchestrator profile 只留账号与配置、其余共享，与上游设计逐条吻合。每用户多 kanban、每 kanban 挂 agent teams 亦有原生底座（一板一库 + assignee 派生）。需要开发的缺口只有三处：

1. **patch 390**：orchestrator 会话的默认板钉住（现状板解析是进程级，单 gateway 下会串板）。
2. **patch 391**：板↔agent teams 硬绑定（派发认领按板围栏，现状只有 per-home 粒度）。
3. **patch 392**：studio matrix-login 授权收敛（现状自动建号即 super_admin + 全 profile 授权，多用户下必须收敛为本账号）。

三项都是小刀口（单文件 15-40 行级），无架构级改动。20 步业务流不需要改形。

## 2. 可行性分析

### 2.1 目标形态拆解

目标用户模型：**每个独立用户 = matrix 账号 + 账号下的多个独立 kanban + 各 kanban 下的 agent teams**。一台机器、一个 gateway，matrix 账号即分布式集群里的"用户"。逐项映射到实现要素：

| 目标要素 | 实现映射 |
|---|---|
| matrix 账号 | 24 账号编制不变（12 人类 + 12 `-agent` 机器人），每用户 profile 的 `.env` 钉自己 `-agent` 的 token |
| 用户的 Orchestrator profile（仅账号和配置独立，其他完全一样） | 单 hermes root 下 `profiles/<u>/`，内容只有 `config.yaml` + `.env`；技能、模板等一律共享同构副本 |
| 账号下的多个独立 kanban | hermes 多板原生：一板一库（`<root>/kanban/boards/<slug>/kanban.db`），板间互不可见 |
| 各 kanban 下的 agent teams | 每用户专职研发 agent 落为真实 profile（`<u>-<agent-id>`，如 `chen-csw-pay-core`），板↔team 绑定落 registry + 围栏 |
| 分布式集群模拟 | 单 gateway 多路复用 + matrix 互联；协作面（群、私信、回执）全部走真实 Matrix |

### 2.2 能力支撑度矩阵

| # | 能力 | 支撑度 | 锚点 |
|---|---|---|---|
| 1 | 单 gateway 进程挂 N 个 profile | 原生 | `gateway/run.py:3502-3513`（`_profile_adapters` 多档案适配器表）、`gateway/run_adapters.py:864-919`（逐 profile 逐凭据启动 secondary 适配器）；`multiplex_profiles` 默认开启（`gateway/config.py:599-606`、`hermes_cli/gateway_multiplex_mode.py:228-258`） |
| 2 | 每 profile 仅账号和配置独立 | 原生 | 每 profile 独立 `config.yaml`/`.env`/secret scope（`gateway/config.py:160-166`、`agent/secret_scope.py:372-390`）；`state.db`/sessions/memory/日志每 home 一份（`hermes_state.py:168-191`、`gateway/config.py:584`、`gateway/run.py:1724-1740`） |
| 3 | matrix 每账号通道路由 | 原生 | 适配器按作用域凭据绑定（`plugins/platforms/matrix/adapter.py:838-845`，注释明言"secondary 的凭据绝不能发去错误的 homeserver"）；入站事件钉 `RoutingIdentity`（`gateway/session_identity.py:42-81`），会话键按 profile 分域（`gateway/session.py:644-653`）；同 token 双占仲裁（`gateway/run_adapters.py:921-935`） |
| 4 | 一个账号下多个独立 kanban | 原生 | 板=独立 SQLite 文件，"a worker on one board never sees another"（`hermes_cli/kanban_db.py:1-9`）；`hermes kanban boards create/switch/list`（`hermes_cli/kanban_boards.py`）；全部 kanban 工具带 `board` 参数（`tools/kanban_tools_schemas.py:24-40`） |
| 5 | 派生 worker 与板硬隔离 | 原生 | dispatcher 派生时把 `HERMES_KANBAN_DB/BOARD/workspaces_root` 钉到认领板（`hermes_cli/kanban_db_dispatch.py:2764-2830`，注释："so workers cannot see other boards"），越界写由 `agent/delegation_context.py:124` 拒绝 |
| 6 | agent teams 派生执行 | 原生 | 卡片 `tasks.assignee` = profile 名，dispatcher `hermes -p <assignee> chat -q` 派生（`hermes_cli/kanban_db_dispatch.py:2764` `_default_spawn`）；worker 以 `HERMES_SESSION_SOURCE=kanban` 独立会话执行 |
| 7 | orchestrator 默认板钉住 | **缺口** | 板解析链是进程级：`board=` 参数 > `HERMES_KANBAN_BOARD` env > `<root>/kanban/current` 文件 > `default`（`hermes_cli/kanban_db.py:421-449`），且 `HERMES_KANBAN_*` 在全局 env 白名单（`agent/secret_scope.py:163-166,184`，"per-board, not per-profile-secret"）——单 gateway 里 12 个用户的板级工具调用不带 `board=` 会落同一块板 → **patch 390** |
| 8 | 板↔team 认领硬围栏 | **缺口** | 认领白名单 `kanban.dispatch_profiles` 只有 per-home 粒度（`hermes_cli/kanban_db_dispatch.py:1650-1696`），单 gateway 单 home 下无法表达"板 A 只许 team A 认领" → **patch 391** |
| 9 | 一 studio 服务多 matrix 账号 | 原生 + 种子化 | `POST /api/auth/matrix-login` 以 token 换 JWT（`upstream/hermes-studio/.../controllers/auth.ts:650`）；用户↔profile ACL（`repositories/users-store.ts:27-45`，`listUserProfiles` 过滤 kanban/模型/档案面：`hermes/controllers/kanban.ts:28-52,54-60`）；管理面 `PUT /api/auth/matrix-users/:id` 可改 role 与授权（`routes/auth.ts:30-35`）。注意：matrixLogin 自动建号路径是 super_admin + 全 profile 授权（auth.ts 末段 `replaceUserProfiles(user.id, allProfiles, ...)`）→ **patch 392** |
| 10 | 单 gateway 合规启动 | 原生 | 主机守卫认一主机一 gateway（`gateway/host_rendezvous.py:1-16`），单 gateway 下不再需要旧拓扑的 11×`--force`；与真机 orchestrator（:8650）共存走 `HERMES_GATEWAY_LOCK_DIR` 隔离锁目录（`gateway/status.py:308-324`） |

### 2.3 三个缺口的设计

**patch 390（agent 侧，`hermes_cli/kanban_db.py`）**：`get_current_board()` 解析链在 env 之后、`current` 文件之前插入 per-home 用户配置 `kanban.default_board`（经 `load_user_config_effective` 读当前作用域 home 的 `config.yaml`——多路复用下即每用户配置）。效果：用户 U 的 orchestrator 板级调用不带 `board=` 时落 U 的默认板；dispatcher/worker 路径不受影响（env 钉板优先级更高，`dispatch_once` 逐板显式传 `board=slug`，见 `gateway/kanban_watchers_dispatcher.py:188-189`）。配置键落每用户 `config.yaml`，正是"仅账号和配置独立"允许的差异面。

**patch 391（agent 侧，`hermes_cli/kanban_db.py` + `hermes_cli/kanban_db_dispatch.py`）**：`board.json` 元数据增加 `profiles`（team 白名单，字符串数组）；派发认领谓词从 per-home 白名单下沉到 per-board：卡的 assignee 必须 ∈ 该板 `profiles`（缺省=不限制，向后兼容）。效果：板 A 的卡只能被 team A 的 agent profile 认领，跨用户/跨板误派发被 fail-closed 拒绝（落 `skipped_nonspawnable` 桶可观测）。板↔team 绑定的事实源就是 board.json（随板走，备份/迁移天然携带）。

**patch 392（studio 侧，`modules/studio/controllers/auth.ts`）**：matrixLogin 自动建号从 `role='super_admin' + 全 profile 授权`收敛为 `role='admin' + 仅本账号同名 profile`（localpart 对 profile 名，找不到则只授 default）。管理面 REST 原样保留（`updateMatrixUser` 仍可调整），harness 另做一次幂等种子化兜底。

### 2.4 风险与边界（如实声明）

1. **multiplex 上游未闭合缺口**（`hermes_cli/gateway_multiplex_mode.py:31-39` 自认 shim）：per-profile stop/restart、WhatsApp bridge/relay on secondaries、dashboard scoping。推演不依赖这三个面（用 matrix + api_server；停机按整 gateway 重启），不影响本方案，长期跟随上游收敛。
2. **进程级共享面**：MCP 发现/工具注册是进程级（`multiplexing-gateway.md:299-309`，上游 #67605 追踪）；推演技能面为纯 skill 文件，无 MCP 依赖。state.db 读池有进程级上限（`hermes_state_readpool.py:37-45`，#98573），12+ profile 并发读高峰可能降级，列为观察项。
3. **历史教训**：多 profile 隔离曾被击穿过（`gateway/session.py:809-822` #88532 写错库；`hermes_state_profile_repair.py:109` 未盖 routed 标记）。冒烟门禁 G2 的串板/串库哨兵即为此设。
4. **cc-switch 限速前科**（SRK 打光 403、MGLM 令牌过期事故）：多账号并发派发保留错峰节流，模型预检保留。
5. **双树漂移**：agent 侧 patch 必须经 `aipay-agent-sync.sh` 落到安装树 `~/.hermes/hermes-agent`（inject 只打进 workspace 树）；部署时 `git apply --check` 幂等校验，冲突不强打。
6. **kanban 列表 API 单板作用域**（`upstream/hermes-studio/.../api/hermes/kanban.ts:329-351`）：跨板聚合用 overlay 已有的 `/api/hermes/kanban/overview`（`overlay/custom/server/services/hermes/kanban-overview.ts`），场景脚本不再手工逐板循环。

### 2.5 拓扑选型裁决

| 选项 | 内容 | 代价 |
|---|---|---|
| **A（采纳）** | 1 gateway + 1 studio 多账号 | studio 层多用户隔离靠 ACL（需 patch 392 + 种子化） |
| B | 1 gateway + 11 studio（保留每用户"电脑"） | 进程×11 的重复部署与"其他内容完全一样"目标相悖；且单 root 下 studio 的 profile 可见性同样要收敛，实际省不了开发 |

裁决理由：目标用户模型重定义为"matrix 账号 + kanban + agent teams"，不含"机器"；"其他内容完全一样"指向共享应用层。A 与"通过 matrix 账号模拟分布式集群多用户"直接对应，B 是旧拟物的残留。studio 端口收敛为一个后，场景脚本的 `studio_port(u)` 间接层也一并消失，harness 反而变简单。

## 3. 全流程推演方案调整（V1 → V2）

### 3.1 拓扑对照

| 维度 | V1（2026-09-22） | V2（本方案） |
|---|---|---|
| gateway | 11 个（每用户一个，`--force` 绕守卫） | **1 个多路复用**（无 `--force`，锁目录隔离共存真机 :8650） |
| studio | 11 个实例（8701+i） | **1 个实例多账号**（矩阵登录 + ACL） |
| HERMES_HOME | 每用户独立 root（`users/<u>/.hermes`） | **单 root + `profiles/<u>`**，profile 只含 config.yaml/.env |
| kanban | 每用户 1 个库（11×kanban.db） | **每账号 N 个独立板**（一板一库），挂 team 围栏 |
| agent | manifest 声明 csw-*（无加载器消费，人代行） | **真实 profile**（`<u>-<agent-id>`），dispatcher 实派生 |
| matrix 账号 | 24 账号 | 不变 |
| 用户定义 | 一台"电脑"（studio+gateway+workspace） | **matrix 账号 + 多 kanban + agent teams** |
| 端口 | 8701+i / 8721+i 共 22 对 | gateway 1 个 + studio 1 个 |
| 技能/模板 | 2×11 份拷贝 | 共享同构副本（每 profile 一份，内容逐字节同） |
| 仓库工作区 | 11 个全量 clone | 每板 worktree（board.json `default_workdir`） |

### 3.2 数据布局与命名

```
SIM_ROOT=/Volumes/nvme2230/lab/ncwk-sim-mux      # 与 ncwk-sim-aipay 隔离
├── hermes/                      # 单 hermes root（gateway 的 HERMES_HOME）
│   ├── config.yaml              # default profile：只承载 gateway 宿主角色，无 matrix
│   ├── kanban/boards/<slug>/    # 一板一库（default 板留空当哨兵）
│   └── profiles/
│       ├── fanfan/              # Orchestrator：config.yaml + .env（@fanfan-agent token）
│       │   ├── kanban.default_board=fanfan-req …（写在 config.yaml）
│       │   ├── machine-manifest.json   # 账号级声明（兼容 capability-report 技能）
│       │   └── hindsight/config.json   # 家族共享记忆 bank（2026-09-25 用户裁决：
│       │                                 同用户各 kanban 及其 agents 共一仓，
│       │                                 bank=hermes-<mac12>-<用户名>，见 runbook §2.1）
│       ├── fanfan-sys-analyst/  # 研发专职 agent profile（无 matrix 凭据）
│       └── …
├── fleet-manifest.json          # 事实源：users → matrix 账号 / boards[] / teams{board:[profiles]}
├── creds/  pids/  logs/  state.env  evidence/
└── central/aipaydev             # 导演克隆（真值反查）
```

- **板命名**：`<user>-<workstream>`（slug 规则 `^[a-z0-9][a-z0-9\-_]{0,63}$`），每账号 ≥2 块板（"多个独立 kanban"）。
- **agent profile 命名**：`<user>-<agent-id>`（继承 V1 编制：orchestrator/researcher/csw-*/tester…），profile 名规则 lowercase（`hermes_cli/profiles.py:246-260`）。
- **team 绑定**：`board.json.profiles`（patch 391）+ fleet-manifest.json 双写，前者供派发围栏消费，后者供导演/技能读取（单一事实源=board.json，fleet-manifest 为其生成物）。
- **machine-manifest**：按账号落 `profiles/<u>/machine-manifest.json`，`kanbanEndpoint` 指向单 studio 的 `/api/hermes/kanban?board=<slug>`。

### 3.3 20 步口径修订

二十步全流程的完整 V2 版（每步动作/真值/闸门逐条展开）见运行手册 `2026-09-25-mux-v2-fullflow-runbook.md`；本节保留口径差异对照。

20 步业务流与 V1 §7 完全一致，以下仅列口径变化（"实例/本机"→"账号/板"）：

| 步 | V1 口径 | V2 口径 |
|---|---|---|
| 1 账号分配 | setup 注册 24 账号 | 不变；roster 增补"账号↔profile↔板↔team"映射 |
| 2 gateway 配置 | 每用户 profile config.yaml/.env ×11 | **单 gateway** + `profiles/<u>` 只写账号与配置；每账号建板与 team 绑定 |
| 3 登录 | 每实例两种登录 | 每**账号** matrix-login 入单 studio；ACL 收敛核验（只能见本账号板） |
| 4 功能就绪 | 每实例 /health + kanban API | 单 gateway /health + 单 studio /health + **24 账号路由冒烟** + 板隔离哨兵 |
| 5 profiles | 各实例 bootstrap | 核对 `profiles/<u>` 清单与 team 围栏装载（G1-G3 门禁） |
| 6-20 | （BA→IDE 全链路） | 业务动作不变；跨机措辞改跨账号板："你能访问本机 kanban" → "你能访问本账号的板；其他账号的由你发 matrix 通知其 owner-agent 更新"（步骤 17 派单文本） |
| 导演核验 | "card 须在 fanfan 本机看板可查" | "card 须在 fanfan 账号的对应板可查"（`verify_done_evidence` 改板寻址） |

### 3.4 验收门禁

| 门 | 内容 | 判据 |
|---|---|---|
| G0 构建 | 三个 patch 可重放 | `npm run clean && npm run inject` 零冲突；agent-sync 落安装树 `git apply --check` 干净 |
| G1 路由 | matrix 账号↔profile 一对一 | 24 账号 whoami 全通；A 账号发消息只有 A 的 profile 会话响应，异账号零串扰（消息计数断言） |
| G2 板隔离 | 每账号板独立 | A 的板 B 账号 API 不可见（ACL 403/空列表）；worker 只动钉板（`default` 板全程空置=串板哨兵）；`kanban.default_board` 钉板生效（不带 board= 的调用落本账号板） |
| G3 team 围栏 | 各板只挂自身 team | 板外 assignee 卡片被拒（`skipped_nonspawnable`），板内 assignee 实派生执行到 done |
| G4 派发执行 | agent teams 真实工作 | 每账号抽 1 板建卡→team agent 认领→产物落板→done，产物真值可反查 |
| G5 共存 | 真机 orchestrator 不受影响 | 推演起止时 :8650 健康；推演 gateway 不带 `--force` 启动成功 |

## 4. 落地实施清单

**P0（本轮实施）**

1. `overlay/patches/390-agent-kanban-default-board.patch` — per-home `kanban.default_board` 钉板（2.3 节设计）。
2. `overlay/patches/391-agent-kanban-board-team-fence.patch` — board.json `profiles` + 按板认领围栏。
3. `overlay/patches/392-studio-matrix-login-scoped-grant.patch` — matrix-login 授权收敛。
4. `overlay/scripts/aipay/mux/` harness 套件：
   - `mx-lib.sh`（路径/端口/manifest/板与 team 生成函数）、`mx-setup.sh`（幂等准备：24 账号复用、单 root、profiles、板、team 围栏、ACL 种子）、`mx-up.sh` / `mx-down.sh`（单 gateway + 单 studio，host-ownership 合规，无 `--force`）、`mx-smoke.sh`（G1-G5 逐门执行取证）。
   - `aipay-agent-sync.sh` 默认清单加入 390/391。
5. 实测：`ncwk-sim-mux` 全新起环境，冒烟 G1-G5 全绿取证入 `evidence/`。

**P1（紧随其后）**【已完成 2026-09-25：da04f5a / main fc4068f，UNTIL_STEP=smoke 实跑步骤 1-5 全绿】

6. 场景脚本迁移：`aipay-scenario.sh/2.sh` 的 kanban 原语改板寻址 + 单 studio 端口（3.3 节口径表逐条），`verify_done_evidence` 断言改"账号板"。已落地为 `mux/mx-scenario-lib.sh` 单一事实源（板寻址 account_boards/board_of_task + 账号板断言 + `UNTIL_STEP` 上界闸门），两场景脚本引用；跨机措辞已按口径表迁移。
7. 12 账号全编制 provisioning + 步骤 1-5 实跑（即冒烟升格为正式推演上半场入口）。已完成：`UNTIL_STEP=smoke bash aipay-scenario.sh` 于 ncwk-sim-mux 全绿（24 账号 / 单 gateway+单 studio / 11 账号 matrix-login+账号板可达 / 每板 team 围栏装载）。

**P2（后续轮）**

8. 步骤 6-20 全流程推演重跑（导演会话执行），交付 V2 推演报告与问题台账。

**明确不做**：旧 `aipay-*.sh` 套件本轮不动（`ncwk-sim-aipay` 历史状态与常驻 `aipay-approver.sh` 进程仍在引用）；待 P2 完成后按"合一收敛"归档退役。
【2026-09-25 用户裁决更新：旧 V1 服务全停服清理，以本方案（V2）为准——已执行：V1 gateway×3/studio×1/kanban watch×2/MCP 孤儿×7 全停，8701-8732 端口清零；**随后"彻底归档删除"：ncwk-sim-aipay（3.8G）与前轮 ncwk-sim（61M）已 tar 归档至 `_archive/sim-legacy-20260925/`（49569 项逐一校验一致）后删除；V1 专用脚本套件（aipay-lib/setup/up/down/evidence/approver/model-route）已从 overlay main 移除（4ad29b8），aipay-agent-sync 自包含化。V2 (:8801/:8802) 与真机 :8650 为唯一在跑面】

## 5. 实施顺序

patch 390/391/392（含单测）→ inject + agent-sync 双树部署 → mx-setup 起环境 → mx-smoke 逐门取证 → P1 场景迁移。每一步按第 5 节门禁验收，任何一门不绿如实报失败，不以"结构看起来对"替代实测。
