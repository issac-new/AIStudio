# hermes-agent v0.20.0 kanban 能力迁移 设计文档

日期：2026-08-04
对照基线：`docs/superpowers/specs/2026-07-24-hermes-agent-019-kanban-migration-design.md`（v0.19.0 对账）
目标版本：hermes-agent `v0.20.0`（tag `v2026.8.3`，release commit `3c27eb623`）

---

## 1. 背景与对账方法

上一次迁移覆盖到 v0.19.0（tag `v2026.7.20`）。本次对账区间 `v2026.7.20..v2026.8.3`，以 `git log --grep=kanban` + `git diff --stat -- '*kanban*'` 扫描，逐 commit 甄别出 5 个用户可见新功能 + 1 个运维 CLI（不做项）。

对账的关键结构性事实：

- hermes-studio TS server **只 shell 调 `hermes` CLI**（`execHermes`/`execKanbanMutation`），**不直连 SQLite**（无 better-sqlite3 依赖）。
- v0.20.0 的 5 个新功能中，只有「单卡 model/provider 钉选」和「运行中 worker 评论注入」有 CLI 动词；reasoning_effort、estimate、board project 三项**只有 plugin REST、无 CLI 动词**。
- overlay inject 体系（`scripts/inject.mjs:53-77`）已支持把 patch 路由到 `upstream/hermes-agent`（先例：patch 117/118），且 hermes-agent patch 失败容错跳过。因此**补 CLI 动词走 overlay patch 是合规且低成本的路径**——这比在 TS server 新增 sqlite 依赖或反向代理 plugin 网关更稳。

## 2. v0.20.0 kanban 新功能清单（对账结果）

| # | 功能 | 关键 commit | Python REST | CLI 动词 | 迁移决策 |
|---|---|---|---|---|---|
| A | 单卡 Model + Provider 钉选（board 上选模型） | `602fc5f9f`、`f0ed0aebb`、`c1b0f6f3c` | PATCH/create 承载 `model_override`/`provider_override`/`clear_model_override` | ✅ `create --model/--provider`、`set-model` | **迁移**（CLI 全通） |
| B | 单卡 reasoning_effort（思考深度钉选） | `0b69a6ac0`、`f0ed0aebb` | PATCH 承载 `reasoning_effort`/`clear_reasoning_effort`；DB 新列 | ❌ 无 CLI 动词 | **迁移**：hermes-agent patch 补 `create --reasoning` + `set-reasoning` 动词 |
| C | 看板挂到 project（board 作用域） | `027ef381a` | `GET /projects`；board create/patch/list 承载 `project_id`+name | ⚠️ `project list` 无 `--json`；board 设 project 无动词 | **迁移**：patch 补 `project list --json` + `boards set-project` + `boards create --project` |
| D | effort estimate（辅助模型估算 token + 复杂度） | `346149c4f` | `POST /estimate`、`POST /tasks/{id}/estimate` | ❌ 无 CLI 动词 | **迁移**：patch 补 `kanban estimate` 动词（复刻 `_run_estimate`，调 `auxiliary_client.call_llm`） |
| E | 与运行中 worker 对话（评论即时注入，无需重启） | `901205420` | 复用 POST comments（worker 轮询 `list_comments_after` 注入 live turn） | ✅ 复用 `comment` | **迁移**：后端零改动，仅 UI 提示文案 |
| F | `hermes kanban repair` | `60cfa1113` | — | `repair` | **不做**（运维 CLI，同上次纪律） |

其他同区间 kanban 变更（notify 投递可靠性、session 打标、worktree 隔离、WAL checkpoint、REINDEX 自愈等）为 agent 内部策略/修复，TS 层无表面对应，不做。

## 3. 上游新数据结构（已核对）

### 3.1 `kanban_db.py` Task dataclass 新增字段（相对 v0.19 迁移后）

| 字段 | 类型 | 语义 |
|---|---|---|
| `provider_override` | `Optional[str]` | `model_override` 所属 provider；dispatcher 传 `--provider <name>`；单独 provider 被拒绝 |
| `reasoning_effort` | `Optional[str]` | `VALID_REASONING_EFFORTS = (minimal, low, medium, high, xhigh, max, ultra)` + `"none"`（关思考）；NULL = 跟随 profile |

board 元数据（`board.json` / `read_board_metadata`）新增 `project_id`（`boards list --json` 已携带）。

### 3.2 已存在可直接复用的 Python API

- `kanban_db.set_model_override(conn, task_id, model, provider=None)` — v0.19 已迁字段，本次接写入路径。
- `kanban_db.set_reasoning_effort(conn, task_id, effort)` — v0.20 新增。
- `kanban_db.create_task(..., reasoning_effort=, project_id=)` — 已收参，CLI 未透传。
- `kanban_db.create_board(..., project_id=)` / `write_board_metadata(board, project_id=, default_workdir=)` — 已收参。
- `projects_db.list_projects(conn, include_archived=False)` / `get_project(conn, ref)`。
- `plugins/kanban/dashboard/plugin_api.py::_run_estimate(title, body)` — estimate 核心，CLI 动词复刻其逻辑（系统提示词为模块常量 `_ESTIMATE_SYSTEM_PROMPT`，直接 import 该模块会拉 FastAPI，故 patch 内自包含复刻）。

## 4. 迁移架构

```
┌───────────────────────────── overlay ─────────────────────────────┐
│                                                                   │
│  P1 hermes-agent patch（CLI 动词补全，patch 178/179）              │
│    kanban.py: create --reasoning · set-reasoning · estimate       │
│               boards create --project · boards set-project        │
│    projects_cmd.py: project list --json                           │
│                                                                   │
│  P2 TS service（patch 180）                                        │
│    hermes-kanban.ts: KanbanTask +2 字段 / KanbanBoard +2 字段     │
│    patchTask 接 model/provider/reasoning → set-model/set-reasoning│
│    createTask 接 --model/--provider/--reasoning                   │
│    estimateTask/estimateText/listProjects/setBoardProject         │
│                                                                   │
│  P3 TS controllers + routes（patch 181/182）                       │
│    POST /estimate · POST /:id/estimate · GET /projects            │
│    PATCH /boards/:slug · create/createBoard 字段透传              │
│                                                                   │
│  P4 client API（patch 183/184）                                    │
│    kanban.ts 类型 + wrapper；store 透传（patch 184）              │
│                                                                   │
│  P5 Swarm kanban UI（custom 组件，无 patch）                       │
│    TaskForm: model/provider/reasoning + Estimate                  │
│    TaskDrawer: model 行(显示/改/清) + reasoning + Estimate        │
│                + 运行中评论即时送达提示(E)                        │
│    Toolbar: 建板 project 选择器                                   │
│                                                                   │
│  P6 AI 协作中心（custom CockpitWorkspace.vue）                     │
│    workflowMeta 行补 provider/reasoning 显示 + 评论即时送达提示   │
│                                                                   │
│  P7 i18n（patch 185/186 en/zh）                                    │
└───────────────────────────────────────────────────────────────────┘
```

## 5. 各功能详细设计

### 5.1 A+B：单卡 model/provider/reasoning 钉选

**hermes-agent patch 178**（`hermes_cli/kanban.py`，additive）：

1. `p_create.add_argument("--reasoning", dest="reasoning_effort", metavar="LEVEL")`；`_cmd_create` 透传 `reasoning_effort=getattr(args, "reasoning_effort", None)`。
2. 新 verb `set-reasoning <task_id> [effort]`（`none`/缺省/`clear` = 清除），handler 复刻 `_cmd_set_model` 模式调 `kb.set_reasoning_effort`；dispatch 表加 `"set-reasoning": _cmd_set_reasoning`。
3. 新 verb `estimate [task_id] [--title T --body B] --json`：
   - 有 task_id → 从 board DB 读 title/body；无 → 用 --title/--body。
   - 复刻 `_run_estimate`：`call_llm(task="kanban_estimator", messages=[...], temperature=0.0, max_tokens=300, timeout=60)`，容错 JSON 提取，输出 `{ok, est_tokens, complexity, rationale, model}`，永不 raise（失败 `{"ok": false, "reason": ...}`）。
   - dispatch 表加 `"estimate": _cmd_estimate`。
4. `boards create --project REF`：`_cmd_boards_create` 解析 project（`projects_db.get_project`，id 或 slug），传 `project_id=` + 未给 `--default-workdir` 时镜像 primary_path。
5. 新 verb `boards set-project <slug> [ref]`（缺省/`none` = 清除）：解析后 `write_board_metadata(slug, project_id=..., default_workdir=...)`；boards dispatch 表注册。

**projects_cmd.py patch 179**：`p_list.add_argument("--json")`；`_cmd_list` 支持 JSON 输出 `[{id, slug, name, primary_path, icon, color, archived}]`。

**TS service patch 180**（`services/hermes/hermes-kanban.ts`）：

- `KanbanTask` + `provider_override?: string | null`、`reasoning_effort?: string | null`。
- `KanbanBoard` + `project_id?: string | null`、`default_workdir?: string | null`。
- `KanbanBoardCreateOptions` + `project?: string`、`defaultWorkdir?: string`；`createBoard` 透传 `--project`/`--default-workdir`。
- `KanbanTaskPatchOptions` + `model_override?: string | null`、`provider_override?: string | null`、`clear_model_override?: boolean`、`reasoning_effort?: string | null`、`clear_reasoning_effort?: boolean`；`patchTask` 尾部按序接：
  - `clear_model_override || model_override !== undefined` → `set-model <id> <model|'none'> [--provider p]`
  - `clear_reasoning_effort || reasoning_effort !== undefined` → `set-reasoning <id> <effort|'none'>`
- `createTask` opts + `model?/provider?/reasoning?` → `--model/--provider/--reasoning`。
- 新函数：
  - `estimateTask(taskId, board?)` → `kanban estimate <id> --json`
  - `estimateText(title, body?)` → `kanban estimate --title --body --json`
  - `listProjects()` → `project list --json`
  - `setBoardProject(slug, ref | null)` → `boards set-project <slug> [ref|'none']`
- `KanbanEstimateResult`/`KanbanProject` 类型。

**P3 controllers/routes patch 181/182**：

- controller `patchTask` 不变（body 展开透传）。
- `create` controller 透传 `model/provider/reasoning`（核对现 controller 字段白名单）。
- 新 controller `estimateTaskCtl`/`estimateTextCtl`/`listProjectsCtl`/`patchBoard`。
- routes：`POST /api/hermes/kanban/estimate`（须在 `POST /api/hermes/kanban/:id` 之前？无冲突——`:id` 是 PATCH/GET；POST `/:id/estimate` 与既有 POST `/:id/xxx` 并列）、`POST /api/hermes/kanban/:id/estimate`、`GET /api/hermes/kanban/projects`（须在 `GET /api/hermes/kanban/:id` 之前注册，避免被 `:id` 吞）、`PATCH /api/hermes/kanban/boards/:slug`。

**P4 client patch 183/184**：`KanbanTask`/`KanbanBoard`/`KanbanCreateRequest`/`KanbanTaskPatch` 加字段；新 wrapper `estimateTask/estimateText/listProjects/patchBoard`；store（patch 184）透传 + actions。

**UI（P5）**：
- TaskForm：`model`/`provider` 自由文本（hermes-studio 无 SDK model picker，model-options 也无 CLI 动词——偏差记录，见 §6）、`reasoning` NSelect（Profile default/minimal/low/medium/high/xhigh/max/ultra/none）、Estimate 按钮（title/body → estimateText，行内显示 `~15k tok · M` + 理由）。
- TaskDrawer：model 行显示 `provider: model · effort`，可编辑/清除；Estimate 按钮（既有卡）；评论框在任务 running 时显示「评论将在数秒内送达运行中的 worker」提示（E）。
- Toolbar 建板表单：project NSelect（listProjects），选中后提示 default_workdir 将镜像 project 主目录。

### 5.2 C：board project（AI 协作中心不涉及，仅 Swarm kanban）

见 5.1 各层。既有 board 的 project 修改走 `PATCH /boards/:slug`（toolbar 暂不加 settings 对话框，偏差记录；建板时可选）。

### 5.3 D：estimate

见 5.1。结果非 HTTP error（`ok:false` 也 200），UI 行内降级显示 reason。

### 5.4 E：运行中 worker 评论注入

后端零改动（comments POST 已通，worker 端 v0.20 自动轮询注入）。仅 UI 提示文案 + cockpit 评论提示。i18n：`kanban.liveCommentHint` / `cockpit.liveCommentHint`。

### 5.5 P6 AI 协作中心（CockpitWorkspace.vue）

- `workflowMeta` computed 补 `provider`/`reasoningEffort` 展示（复用既有行，不新增行）。
- 评论区（如有 comment 输入）加 live hint；无则在 worker log 区上方加 muted 文案。实施时读当前组件确认锚点。

## 6. 偏差与不做项（对照上游明示）

| 项 | 上游做法 | 本次决策 | 理由 |
|---|---|---|---|
| model 下拉选器 | 桌面端复用 composer SDK picker + `GET /model-options` | 自由文本 + provider 文本 | hermes-studio 无 SDK picker；`model-options` 无 CLI 动词，另补动词成本高收益低 |
| board settings 对话框（改既有板 project） | 桌面 board-switcher「Board settings…」 | 仅 API + 建板时可选 | swarm 无 settings 对话框；建板覆盖主路径 |
| estimate 的 compactNumber 格式化 | SDK 导出 | 前端自写 3 行 formatter | 不值得引 SDK |
| `hermes kanban repair` | CLI | 不做 | 运维 CLI，同 v0.19 纪律 |
| notify/session/WAL 修复 | agent 内部 | 不做 | TS 无表面对应 |

## 7. 向后兼容与风险

- 所有 TS 接口新字段 optional/nullable；wrapper 纯 additive；CLI patch 纯 additive（新 flag/verb，不改既有行为）。
- hermes-agent patch 注入失败时 inject 仅 WARN 跳过（`inject.mjs:75-77`）——TS 调用新动词会报错，故 P2 的 `estimateTask/setBoardProject` 等失败信息原样冒泡给 UI message.error，可观测。
- `set-reasoning`/`estimate`/`set-project` 均读写完即关连接（`connect_closing`），与现有 CLI 一致，无长事务。
- estimate 走 auxiliary model，配置缺失时 `{"ok": false, "reason": "auxiliary client unavailable"}`，UI 降级，不阻断建卡。

## 8. 验证方案

1. `npm run inject`：178-186 全部 applied，无失败（hermes-agent patch 必须成功——WARN 即视为失败，需修 hunk）。
2. CLI 冒烟：`hermes kanban set-reasoning <id> high`、`hermes kanban estimate --title "x" --json`、`hermes kanban boards set-project <slug> <ref>`、`hermes project list --json`。
3. `npm run typecheck` 0 errors。
4. `npm test`（vitest）全绿；必要时为 store actions 补测试。
5. dev 巡检：建卡选 model/provider/reasoning + Estimate；drawer 改/清 override；建板选 project；running 任务发评论确认 hint；AI 协作中心确认 workflowMeta 行显示 reasoning。
6. RELEASE-NOTES 追加 2.0 节。
