# hermes-agent v0.20.0 kanban 能力迁移 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 hermes-agent v0.19.0→v0.20.0 的 5 个 kanban 新功能（A 单卡 model/provider 钉选、B reasoning_effort、C board project、D effort estimate、E 运行中 worker 评论提示）迁移到 overlay 的「Swarm kanban」与「AI 协作中心」。

**Architecture:** 7 阶段顺序推进：P1 hermes-agent CLI 动词（patch 178/179）→ P2 TS service（patch 180）→ P3 controllers+routes（patch 181/182）→ P4 client API+store（patch 183/184）→ P5 Swarm UI（custom 组件）→ P6 cockpit+i18n（custom + patch 185/186）→ P7 全量验证 + release notes。每阶段一个 feat 分支，顺序收口。

**Tech Stack:** overlay patch 体系（unified diff + `npm run inject`，支持路由 hermes-agent patch）、Vue 3 + Pinia + TS、Koa、vitest、Python argparse CLI。

**参考 spec**：`docs/superpowers/specs/2026-08-04-hermes-agent-020-kanban-migration-design.md`（含对账表、数据结构、偏差清单）

## Global Constraints

- **只改 `overlay/`**：upstream 禁直接改；hermes-agent 变更也走 patch（先例 117/118，inject.mjs:53-77 路由 + 容错 WARN）。
- **hermes-agent patch 必须注入成功**：inject 对其失败仅 WARN 跳过，P1 验证时必须确认 WARN 数为 0（CLI 冒烟兜底）。
- **向后兼容**：TS 新字段 optional/nullable；CLI patch 纯 additive（新 flag/verb）。
- **patch 序号**：下一可用 178；按 phase 占用至 186。
- **worktree 规则**：每 phase 一个 feat 分支，≤3 并行（本计划全串行，实际 ≤1），顺序收口。
- **不自动 push github**（项目规则 2026-06-29）；**构建产物不上传**（2026-07-21）。
- **patchTask controller 无需改**：`controllers/hermes/kanban.ts:1056` 已 `{ ...body, board }` 透传，service 加字段即通。

**前置事实**（已核对）：
- `hermes_cli/kanban.py:373-381` create 已有 `--model`/`--provider`（dest model_override/provider_override）；`:1475 _cmd_create` 透传二者但**未传 reasoning_effort**（`kanban_db.create_task` 已收参，`:2901`）。
- `hermes_cli/kanban.py:482-497` `set-model` verb；`:1052` dispatch 表 `"set-model": _cmd_set_model`；`:1802 _cmd_set_model` 为 set-reasoning 的复刻模板。
- `hermes_cli/kanban.py:1189-1206` boards dispatch if-chain；`:1258 _cmd_boards_create` 调 `kb.create_board`（已收 `project_id`，`:775`）；`:1360 _cmd_boards_set_default_workdir` 为 set-project 模板。
- `kanban_db.write_board_metadata(board, project_id=, default_workdir=)` `:723`；`read_board_metadata` 已含 `project_id`（`:704`），`boards list --json` 已携带。
- `kanban_db.set_reasoning_effort(conn, task_id, effort)` `:3486`；`VALID_REASONING_EFFORTS = (minimal, low, medium, high, xhigh, max, ultra)` + `"none"`。
- estimate 核心 `plugin_api.py::_run_estimate` `:1826`、系统提示词 `_ESTIMATE_SYSTEM_PROMPT` `:1786`；`agent.auxiliary_client.call_llm(task=..., messages=..., temperature=0.0, max_tokens=300, timeout=60)`。
- `projects_cmd.py`：命令名 `project`；`p_list` `:57` 无 `--json`；`_cmd_list` `:219` 纯文本输出；`projects_db.get_project(conn, ref)` 支持 id/slug。
- TS service：`patchTask` `:838` 尾部 return 前为接入点；`createTask` `:569` args 构建；`listBoards/createBoard` `:213/:237`；`KanbanBoard` `:133`；`KanbanTaskPatchOptions` `:827`。
- routes `:38` `GET /api/hermes/kanban` 在 `GET /:id`（`:41`）前——新 `GET /projects` 必须插在 `:38` 之前。
- client：`KanbanTaskPatch` `:545-554`；`KanbanBoard` `:134`；store `createBoard` `:330`（内联类型）、`patchTask` `:624` 透传。

---

## Task 1: P1 — hermes-agent CLI 动词补全（patch 178/179）

**分支**：`feat/wp-kanban20-p1-cli-verbs`

**Files:**
- Create: `overlay/patches/178-agent-kanban-cli-verbs.patch`
- Create: `overlay/patches/179-agent-projects-list-json.patch`
- Modify: `overlay/patches/series`

**Interfaces:**
- Produces: `hermes kanban create --reasoning`、`set-reasoning`、`estimate`、`boards create --project`、`boards set-project`、`hermes project list --json`。P2 全部依赖。

### Step 1.1: worktree

- [ ] `cd overlay && git worktree add .claude/worktrees/wp-kanban20-p1 -b feat/wp-kanban20-p1-cli-verbs main`

### Step 1.2: patch 178（kanban.py 5 处 hunk）

- [ ] **hunk 1 — create 加 `--reasoning`**：锚点 `p_create.add_argument("--provider", ...)` 块（:379-381）之后：

```python
    p_create.add_argument("--reasoning", default=None, dest="reasoning_effort",
                          metavar="LEVEL",
                          help="Pin the worker's thinking depth for this task "
                               "(one of minimal/low/medium/high/xhigh/max/ultra, "
                               "or 'none' for thinking off). Omit to use the "
                               "assignee profile's agent.reasoning_effort.")
```

- [ ] **hunk 2 — `_cmd_create` 透传**：锚点 `provider_override=getattr(args, "provider_override", None),` 之后加 `reasoning_effort=getattr(args, "reasoning_effort", None),`。

- [ ] **hunk 3 — 新 verb parser**（`set-model` parser 块 :482-497 之后）：

```python
    # --- set-reasoning (per-task reasoning effort override) ---
    p_set_reasoning = sub.add_parser(
        "set-reasoning",
        help="Set or clear a task's reasoning effort override "
             "(takes effect on the next dispatch)",
    )
    p_set_reasoning.add_argument("task_id")
    p_set_reasoning.add_argument(
        "effort", nargs="?", default=None,
        help="minimal/low/medium/high/xhigh/max/ultra, or 'none' to pin "
             "thinking off, or 'clear' to inherit the profile default",
    )

    # --- estimate (auxiliary-model effort estimate) ---
    p_estimate = sub.add_parser(
        "estimate",
        help="Rough token + complexity estimate via the auxiliary model",
    )
    p_estimate.add_argument("task_id", nargs="?", default=None,
                            help="Existing task id; omit to estimate raw --title/--body")
    p_estimate.add_argument("--title", default=None)
    p_estimate.add_argument("--body", default=None)
    p_estimate.add_argument("--json", action="store_true")
```

- [ ] **hunk 4 — dispatch 表**：`"set-model": _cmd_set_model,` 后加 `"set-reasoning": _cmd_set_reasoning,` 与 `"estimate":   _cmd_estimate,`。

- [ ] **hunk 5 — handlers**（`_cmd_set_model` 函数结束后，`_cmd_reclaim` 之前）：

```python
def _cmd_set_reasoning(args: argparse.Namespace) -> int:
    effort = args.effort
    if effort is not None and effort.lower() in {"clear", "-", "null", ""}:
        effort = None
    try:
        with kb.connect_closing() as conn:
            ok = kb.set_reasoning_effort(conn, args.task_id, effort)
    except (ValueError, RuntimeError) as exc:
        print(f"kanban: {exc}", file=sys.stderr)
        return 2
    if not ok:
        print(f"no such task: {args.task_id}", file=sys.stderr)
        return 1
    if effort:
        print(f"Set reasoning effort on {args.task_id}: {effort} "
              "(applies on next dispatch)")
    else:
        print(f"Cleared reasoning effort on {args.task_id} "
              "(worker uses its profile default)")
    return 0


_ESTIMATE_SYSTEM_PROMPT = (
    "You estimate how much work an autonomous coding agent will spend on a "
    "kanban task. Given the task title and description, respond with STRICT "
    "JSON only (no prose, no code fence):\n"
    '{"est_tokens": <integer total tokens across the whole run>, '
    '"complexity": "S"|"M"|"L", '
    '"rationale": "<one short sentence>"}\n'
    "Base the token figure on a realistic multi-turn agent run (reading files, "
    "tool calls, edits, retries) — not a single reply. S≈small/localized, "
    "M≈multi-file, L≈broad or ambiguous. Be honest that this is a rough guess."
)


def _run_estimate(title: str, body: Optional[str]) -> dict:
    """Mirror of plugins/kanban/dashboard/plugin_api.py::_run_estimate.

    Kept self-contained (no plugin import) to avoid pulling FastAPI into the
    CLI. Never raises — a bad config / parse / API error becomes
    ``{"ok": False, "reason": ...}`` so callers can render it inline.
    """
    if not (title or "").strip():
        return {"ok": False, "reason": "a title is required to estimate"}
    try:
        from agent.auxiliary_client import call_llm
    except Exception:
        return {"ok": False, "reason": "auxiliary client unavailable"}

    def _cap(s, n):
        s = (s or "").strip()
        return s if len(s) <= n else s[:n] + "…"

    user_msg = f"Title: {_cap(title, 400)}\n\nDescription:\n{_cap(body, 4000) or '(none)'}"
    try:
        resp = call_llm(
            task="kanban_estimator",
            messages=[
                {"role": "system", "content": _ESTIMATE_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.0,
            max_tokens=300,
            timeout=60,
        )
    except Exception as exc:
        return {"ok": False, "reason": f"LLM error: {type(exc).__name__}"}
    try:
        raw = (resp.choices[0].message.content or "").strip()
        model = getattr(resp, "model", None)
    except Exception:
        raw, model = "", None
    parsed = None
    try:
        import re as _re
        blob = raw
        if not blob.lstrip().startswith("{"):
            m = _re.search(r"\{.*\}", blob, _re.DOTALL)
            blob = m.group(0) if m else blob
        obj = json.loads(blob)
        if isinstance(obj, dict):
            parsed = obj
    except Exception:
        parsed = None
    if not parsed:
        return {"ok": False, "reason": "could not parse an estimate from the model"}
    try:
        est_tokens = int(parsed.get("est_tokens") or 0)
    except (TypeError, ValueError):
        est_tokens = 0
    complexity = str(parsed.get("complexity") or "").strip().upper()
    if complexity not in {"S", "M", "L"}:
        complexity = None
    rationale = str(parsed.get("rationale") or "").strip() or None
    return {"ok": True, "est_tokens": est_tokens, "complexity": complexity,
            "rationale": rationale, "model": model}


def _cmd_estimate(args: argparse.Namespace) -> int:
    title, body = args.title, args.body
    if args.task_id:
        with kb.connect_closing() as conn:
            task = kb.get_task(conn, args.task_id)
        if task is None:
            print(f"no such task: {args.task_id}", file=sys.stderr)
            return 1
        title, body = task.title, task.body
    result = _run_estimate(title or "", body)
    if getattr(args, "json", False) or True:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("ok") else 1
```

> `get_task` 返回 Task 对象还是 dict 需核对（`kanban_db.get_task`）；若 dict 则 `task["title"]`。实施时确认。

- [ ] **hunk 6 — boards create `--project`**：`b_create.add_argument("--default-workdir", ...)` 块后加：

```python
    b_create.add_argument("--project", default=None,
                          help="Scope the board to a project (id or slug): "
                               "default_workdir mirrors the project's primary "
                               "folder and new tasks inherit the project")
```

`_cmd_boards_create` 中 `meta = kb.create_board(...)` 调用前插入 project 解析 + 调用加 `project_id=...`：

```python
    project_id = None
    project_path = None
    if getattr(args, "project", None):
        from hermes_cli import projects_db as pdb
        with pdb.connect_closing() as pconn:
            proj = pdb.get_project(pconn, args.project.strip())
        if proj is None:
            print(f"kanban boards create: project {args.project!r} does not exist", file=sys.stderr)
            return 2
        project_id = proj.id
        project_path = proj.primary_path or None
```
`create_board` 调用改为 `default_workdir=args.default_workdir or project_path, project_id=project_id,`。

- [ ] **hunk 7 — `boards set-project` verb**：`b_set_wd` parser 块后加 parser；boards dispatch if-chain `if sub == "set-default-workdir":` 后加 `if sub == "set-project": return _cmd_boards_set_project(args)`；handler 复刻 set-default-workdir 模式，解析 project（空/`none` = 清除，`write_board_metadata(slug, project_id="")`）。

### Step 1.3: patch 179（projects_cmd.py）

- [ ] `p_list.add_argument("--json", action="store_true")`；`_cmd_list` 在循环前加：

```python
    if getattr(args, "json", False):
        print(json.dumps([
            {"id": p.id, "slug": p.slug, "name": p.name,
             "primary_path": p.primary_path or "", "icon": p.icon or "",
             "color": p.color or "", "archived": bool(p.archived)}
            for p in projs
        ], indent=2, ensure_ascii=False))
        return 0
```

> `Project` 有无 `icon`/`color` 属性需核对 `projects_db.py`；`json` import 确认。

### Step 1.4: series 追加 + inject + CLI 冒烟

- [ ] series 追加 178/179；`npm run inject` — **确认无 hermes-agent patch WARN**
- [ ] CLI 冒烟：
```bash
cd upstream/hermes-agent
python -m hermes_cli.kanban create "smoke" --reasoning high --json   # 或直接 hermes bin
hermes kanban set-reasoning <id> medium
hermes kanban set-reasoning <id> clear
hermes kanban estimate --title "smoke" --json
hermes kanban boards create smoke-board --project <proj> 
hermes kanban boards set-project smoke-board none
hermes project list --json
```

### Step 1.5: commit + 收口

- [ ] commit `feat(kanban): hermes-agent 补 v0.20 CLI 动词 — patch 178/179`
- [ ] merge --no-ff 回 main，清理 worktree

---

## Task 2: P2 — TS service 接入（patch 180）

**分支**：`feat/wp-kanban20-p2-ts-service`

**Files:**
- Create: `overlay/patches/180-server-service-kanban-v020.patch`
- Modify: `overlay/patches/series`

**Interfaces:** Consumes P1 CLI 动词；Produces service 函数供 P3 controller 用。

### Step 2.1: worktree（从含 P1 的本地 main 起）

### Step 2.2: patch 180 hunks（`services/hermes/hermes-kanban.ts`）

- [ ] `KanbanTask` 接口（`model_override?: string | null` 行后）：`provider_override?: string | null`、`reasoning_effort?: string | null`
- [ ] `KanbanBoard` 接口：`project_id?: string | null`、`default_workdir?: string | null`
- [ ] `KanbanBoardCreateOptions`：`project?: string`、`defaultWorkdir?: string`；`createBoard` args 透传 `--project`/`--default-workdir`
- [ ] `KanbanTaskPatchOptions`：`model_override?/provider_override?: string | null`、`clear_model_override?/clear_reasoning_effort?: boolean`、`reasoning_effort?: string | null`
- [ ] `patchTask` return 前插入：

```ts
  if (patch.clear_model_override || patch.model_override !== undefined) {
    const model = patch.clear_model_override ? 'none' : (patch.model_override || 'none')
    const args = [...boardArgs(board), 'set-model', taskId, model]
    pushOptional(args, '--provider', patch.provider_override)
    await execKanbanMutation(args, 'Hermes CLI: kanban set-model failed', 'Failed to set model override')
  }
  if (patch.clear_reasoning_effort || patch.reasoning_effort !== undefined) {
    const effort = patch.clear_reasoning_effort ? 'clear' : (patch.reasoning_effort || 'clear')
    await execKanbanMutation(
      [...boardArgs(board), 'set-reasoning', taskId, effort],
      'Hermes CLI: kanban set-reasoning failed', 'Failed to set reasoning effort',
    )
  }
```

- [ ] `createTask` opts + `model?/provider?/reasoning?: string` → push `--model/--provider/--reasoning`
- [ ] 文件末尾新增：

```ts
export interface KanbanEstimateResult {
  ok: boolean
  est_tokens?: number
  complexity?: 'S' | 'M' | 'L' | null
  rationale?: string | null
  model?: string | null
  reason?: string
}

export async function estimateTask(taskId: string, opts?: KanbanBoardOptions): Promise<KanbanEstimateResult> {
  const { stdout } = await execHermes([...boardArgs(opts?.board), 'estimate', taskId, '--json'], { maxBuffer: 1024 * 1024, timeout: 90000, ...execOpts })
  return JSON.parse(stdout.trim())
}

export async function estimateText(title: string, body?: string, opts?: KanbanBoardOptions): Promise<KanbanEstimateResult> {
  const args = [...boardArgs(opts?.board), 'estimate', '--title', title, '--json']
  pushOptional(args, '--body', body)
  const { stdout } = await execHermes(args, { maxBuffer: 1024 * 1024, timeout: 90000, ...execOpts })
  return JSON.parse(stdout.trim())
}

export interface KanbanProject {
  id: string; slug: string; name: string
  primary_path: string; icon: string; color: string; archived: boolean
}

export async function listProjects(): Promise<KanbanProject[]> {
  const { stdout } = await execHermes(['project', 'list', '--json'], { maxBuffer: 5 * 1024 * 1024, timeout: 30000, ...execOpts })
  const parsed = JSON.parse(stdout.trim() || '[]')
  return Array.isArray(parsed) ? parsed : []
}

export async function setBoardProject(slugInput: string, projectRef: string | null): Promise<void> {
  const slug = normalizeBoardSlug(slugInput)
  const args = ['kanban', 'boards', 'set-project', slug]
  if (projectRef) args.push(projectRef)
  await execHermes(args, { maxBuffer: 1024 * 1024, timeout: 30000, ...execOpts })
}
```

> 注意 `estimate` 的 board 作用域：`kanban estimate` 在 board_scope 内，boardArgs 前置位置与 create 一致，实施时按现有 `boardArgs` 用法核对参数顺序。

### Step 2.3: series + inject + typecheck

### Step 2.4: commit + 收口

---

## Task 3: P3 — controllers + routes（patch 181/182）

**分支**：`feat/wp-kanban20-p3-routes`

**Files:**
- Create: `overlay/patches/181-server-controllers-kanban-v020.patch`
- Create: `overlay/patches/182-server-routes-kanban-v020.patch`
- Modify: `overlay/patches/series`

### Step 3.1: worktree

### Step 3.2: patch 181（controllers/hermes/kanban.ts 末尾追加）

```ts
export async function estimateTask(ctx: Context) {
  try {
    const result = await kanbanCli.estimateTask(ctx.params.id, { board: ctx.query.board as string | undefined })
    ctx.body = result
  } catch (err: any) { ctx.status = 500; ctx.body = { error: err.message } }
}

export async function estimateText(ctx: Context) {
  try {
    const body = (ctx.request.body as any) || {}
    const result = await kanbanCli.estimateText(String(body.title || ''), body.body)
    ctx.body = result
  } catch (err: any) { ctx.status = 500; ctx.body = { error: err.message } }
}

export async function listProjects(ctx: Context) {
  try {
    ctx.body = { projects: await kanbanCli.listProjects() }
  } catch (err: any) { ctx.status = 500; ctx.body = { error: err.message } }
}

export async function patchBoard(ctx: Context) {
  try {
    const body = (ctx.request.body as any) || {}
    if ('project_id' in body) {
      await kanbanCli.setBoardProject(ctx.params.slug, body.project_id || null)
    }
    ctx.body = { ok: true }
  } catch (err: any) { ctx.status = 500; ctx.body = { error: err.message } }
}
```

- [ ] `create` controller 透传 `model/provider/reasoning`（读现 controller create 确认字段白名单；若已整体展开 body 则免改）
- [ ] `createBoard` controller 透传 `project/defaultWorkdir`（同上核对）

### Step 3.3: patch 182（routes/hermes/kanban.ts）

- [ ] `POST /api/hermes/kanban/estimate` + `GET /api/hermes/kanban/projects` 插在 `kanbanRoutes.get('/api/hermes/kanban', ctrl.list)`（:38）**之前**
- [ ] `POST /api/hermes/kanban/:id/estimate` 与既有 `/:id/comments` 并列
- [ ] `PATCH /api/hermes/kanban/boards/:slug` 与 boards 组并列

### Step 3.4: series + inject + typecheck + commit + 收口

---

## Task 4: P4 — client API + store（patch 183/184）

**分支**：`feat/wp-kanban20-p4-client-api`

**Files:**
- Create: `overlay/patches/183-client-api-kanban-v020.patch`
- Create: `overlay/patches/184-client-store-kanban-v020.patch`
- Modify: `overlay/patches/series`

### Step 4.1: worktree

### Step 4.2: patch 183（client api/hermes/kanban.ts）

- [ ] `KanbanTask` + `provider_override?/reasoning_effort?`
- [ ] `KanbanBoard` + `project_id?/default_workdir?`；`KanbanBoardCreateRequest` + `project?/defaultWorkdir?`
- [ ] `KanbanCreateRequest` + `model?/provider?/reasoning?`
- [ ] `KanbanTaskPatch` + `model_override?/provider_override?/clear_model_override?/reasoning_effort?/clear_reasoning_effort?`
- [ ] 新类型 + wrapper：

```ts
export interface KanbanEstimateResult { ok: boolean; est_tokens?: number; complexity?: 'S'|'M'|'L'|null; rationale?: string|null; model?: string|null; reason?: string }
export interface KanbanProject { id: string; slug: string; name: string; primary_path: string; icon: string; color: string; archived: boolean }

export async function estimateTask(taskId, opts?) // POST /:id/estimate
export async function estimateText(title, body?)  // POST /estimate
export async function listProjects()              // GET /projects → res.projects
export async function patchBoard(slug, patch: { project_id?: string | null }) // PATCH /boards/:slug
```

### Step 4.3: patch 184（stores/hermes/kanban.ts）

- [ ] `createBoard` action 内联类型 + `project?/defaultWorkdir?` 透传
- [ ] 新 actions：`estimateTask/estimateText/listProjects/patchBoard`（thin wrapper，复数调用方共用）；projects 缓存 `projects = ref<KanbanProject[]>([])`

### Step 4.4: series + inject + typecheck + vitest + commit + 收口

---

## Task 5: P5 — Swarm kanban UI（custom 组件）

**分支**：`feat/wp-kanban20-p5-swarm-ui`

**Files:**
- Modify: `overlay/custom/client/kanban/components/KanbanTaskForm.vue`
- Modify: `overlay/custom/client/kanban/components/KanbanTaskDrawer.vue`
- Modify: `overlay/custom/client/kanban/components/KanbanToolbar.vue`

### Step 5.1: worktree

### Step 5.2: KanbanTaskForm.vue

- [ ] formData + `model/provider/reasoning`（reasoning NSelect：'' Profile default / minimal/low/medium/high/xhigh/max/ultra / none）
- [ ] payload 透传三字段
- [ ] 「Estimate」NButton（quaternary，form 底部）：`store.estimateText(title, body)` → 行内 `~{{compactTokens}} tok · {{complexity}}` + rationale tooltip + `ok:false` 时 muted reason；`compactTokens` 3 行 formatter（<1000 原值 / <1M `xx.xk` / 否则 `x.xM`）

### Step 5.3: KanbanTaskDrawer.vue

- [ ] 读现组件找 model_override 展示位；加「Model」行：未设显示 `Profile default`，已设显示 `provider: model · effort`；编辑（NInput 两个 + reasoning NSelect）→ `store.patchTask(id, { model_override, provider_override })` / 清除 → `{ clear_model_override: true }`；reasoning 单独保存 → `{ reasoning_effort }` / `{ clear_reasoning_effort: true }`
- [ ] 「Estimate」按钮：`store.estimateTask(id)` 行内显示
- [ ] 评论区（找 comment 输入）：任务 `running` 时输入框下方 muted 文案 `t('kanban.liveCommentHint')`（E 功能提示）

### Step 5.4: KanbanToolbar.vue

- [ ] boardForm + `project`；建板对话框加 project NSelect（`store.projects`，mount 时 `store.listProjects()`，可清除）；option label `name (slug)`；emit createBoard 透传；hint：选中后 default_workdir 镜像 project 主目录

### Step 5.5: vitest + dev 巡检 + commit + 收口

---

## Task 6: P6 — AI 协作中心 + i18n（custom + patch 185/186）

**分支**：`feat/wp-kanban20-p6-cockpit-i18n`

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitWorkspace.vue`
- Create: `overlay/patches/185-kanban-v020-i18n-en.patch`
- Create: `overlay/patches/186-kanban-v020-i18n-zh.patch`
- Modify: `overlay/patches/series`

### Step 6.1: worktree

### Step 6.2: CockpitWorkspace.vue

- [ ] `workflowMeta` computed 补 `provider: t.provider_override ?? null`、`reasoning: t.reasoning_effort ?? null`；模板 workflow 行在 model 后追加 `· {{ workflowMeta.reasoning }}`
- [ ] 评论/操作区加 running 时 muted hint `t('cockpit.liveCommentHint')`（实施时找评论输入锚点；若无评论输入则加在 Worker Log 区段标题行右侧）

### Step 6.3: i18n patch 185/186

- [ ] `kanban.*` 新增（en/zh 对照）：
  - `form.model` Model / 模型；`form.provider` Provider / 提供商；`form.reasoning` Thinking depth / 思考深度；`form.profileDefault` Profile default / 跟随 Profile
  - `estimate` Estimate / 估算；`estimateDisclaimer` Rough guess via auxiliary model / 辅助模型粗略估算；`estimateFailed` 估算失败原因前缀
  - `liveCommentHint` Notes are delivered to the running worker within seconds / 评论将在数秒内送达运行中的 worker
  - `board.project` Project / 所属项目；`board.projectHint` ...镜像提示
- [ ] `cockpit.liveCommentHint` en/zh

### Step 6.4: series + inject + typecheck + vitest + commit + 收口

---

## Task 7: 全量验证 + release notes

- [ ] `npm run inject`（178-186 全 applied，**无 hermes-agent WARN**）→ `npm run typecheck` → `npm test`
- [ ] CLI 冒烟四动词 + dev 巡检清单（spec §8）
- [ ] `RELEASE-NOTES.md` 追加 2.0 节（5 功能 + patch 清单 + 偏差记录）
- [ ] commit `docs: release notes 2.0 — hermes-agent v0.20.0 kanban 能力迁移`

---

## 自检清单

- [ ] spec §5.1 A+B：model/provider/reasoning 全链路（CLI→service→routes→client→store→UI）
- [ ] spec §5.2 C：board project（CLI→service→routes→client→Toolbar）
- [ ] spec §5.3 D：estimate（CLI→service→routes→client→Form/Drawer，ok:false 降级）
- [ ] spec §5.4 E：live comment hint（Drawer + cockpit，纯文案）
- [ ] spec §6 偏差：model 自由文本、board settings 仅 API、repair 不做 —— release notes 记录
- [ ] spec §7 兼容：无 breaking；CLI patch additive；inject 无 WARN
