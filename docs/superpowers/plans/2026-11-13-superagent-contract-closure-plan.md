# 超级智能体吸收批一：交接合同与证据完整性 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 看板三个写入口统一 profile 授权、证据压缩归档失败保真、delegate 显式严格 output_schema——三项独立可测的合同闭环。

**Architecture:** 三项互不依赖，各自"失败测试→实现→独立补丁"推进。授权修复复用注入态控制器既有 `authorizeTaskIds`/`requestBoard`；reducer 修复落在 runtime 正本并以补丁镜像 vendor；严格 schema 以每任务布尔标志贯通"参数校验→child 附着→结果状态判定"，默认行为字节级不变。

**Tech Stack:** TypeScript/Koa/Vitest（studio 面）、Python 3.14/pytest（hermes-agent 面）、patches/series 注入链。

**Spec:** `docs/superpowers/specs/2026-11-13-superagent-contract-closure.md`（已批准；§3.4 补丁策略=追加 770/771/772，不回写 013/614）

**Worktree:** `.claude/worktrees/superagent-contract-p0`，分支 `feat/superagent-contract-p0`。

## Global Constraints

- 宽松默认不变：`strict_output_schema` 缺失/false 时结果形状与状态语义与现状字节级一致；schema-less 调用不新增任何键。
- 终止原因优先级：`interrupted`/执行错误/`max_iterations` 不被 `output_schema_invalid` 覆盖；预算耗尽时 `exit_reason=max_iterations`、`truncated=true`。
- 授权复用 `authorizeTaskIds`+`requestBoard`，不改 super_admin 快路径（无 profile 限制身份不额外预读任务）。
- vendor 不直改提交：行为改动全部经 770/771/772 补丁＋series 登记；pre-commit 自动撤注入态。
- 不新增门/钩子/脚本/账本/npm script/依赖；`config/mechanism-budget.json` 补 changes 条目并按 series 实算抬位。
- 本批不实施第二批：不动任务表 schema、done 状态机、orchestrator 调度。
- 注释中文、标识符英文；补丁路径前缀必须 `a/packages/...`（studio）/`a/tools/...`（agent），防双重前缀坑。

## Review Focus（spec 隐含、无任务测试就会咬人的五类输入）

1. 隐藏 profile 任务经 PATCH/DELETE/decompose 仍触达 CLI（水平越权）→ Task 1 三 handler × 隐藏 404 且 CLI 零调用。
2. board 缺省/非法在三入口被静默当 default 或 500 → Task 1 `requestBoard` 400 且零副作用。
3. 归档返回 None/抛异常仍生成 receipt 替换原文 → Task 2 两变体＋摘要模型零调用断言。
4. 严格 schema 掩盖中断/执行错误/预算耗尽的真实原因 → Task 3 终止优先级三用例。
5. `strict_output_schema` 缺 schema/非布尔在子代理启动后才失败或被静默忽略 → Task 3 pre-spawn 校验用例（错误在 spawn 前返回）。

---

### Task 1: 看板写授权一致化（补丁 771）

**Files:**
- Modify（经补丁）: `vendor/hermes-studio/packages/server/src/modules/hermes/controllers/kanban.ts` 的 `deleteTask`/`patchTask`/`decomposeTask`（注入态约 :1180-1225）
- Create: `custom/server/services/hermes/__tests__/kanban-mutation-access.test.ts`
- Create: `patches/770-server-kanban-mutation-authorization.patch`；Modify: `patches/series`

**Interfaces:**
- Consumes: 控制器内既有 `requestBoard(ctx): string | null`、`authorizeTaskIds(ctx, board, ids, allowedStatuses?, action?): Promise<boolean>`。
- Produces: 三 handler 副作用前 `board=requestBoard(ctx)`＋`authorizeTaskIds(ctx, board, [ctx.params.id], undefined, 'delete'|'patch'|'decompose')`；不可见 404 / 非法 board 400 / 授权过走原 CLI。

- [ ] **Step 0: 注入并取基线**（worktree 是 pristine 树）
  ```bash
  cd /Users/cuishi/lab/AIStudio/.claude/worktrees/superagent-contract-p0
  npm run pretest   # ensure-injected 全量注入＋node_modules 软链（约 20s）
  npx vitest run custom/__tests__/kanban-admin-scope-guard.test.ts custom/__tests__/kanban-patch-409-guard.test.ts
  ```
  预期：全绿（注入态基线）。

- [ ] **Step 1: 写失败测试** `kanban-mutation-access.test.ts`
  mock 面（先例 `custom/server/services/hermes/__tests__/overview-access.test.ts:9-18`）：`vi.mock` kanban-service（`normalizeBoardSlug` 透传、`getTask`/`deleteTask`/`patchTask`/`decomposeTask` 为 spy）与 `studio/public/users` 的 `listUserProfiles`。用例：
  1. admin/user 可见集 `['alice-agent']` × 任务 assignee `'bob-agent'` → 三个 handler 各返回 404 且对应 CLI spy `not.toHaveBeenCalled()`；
  2. 同 profile（assignee `'alice-agent'`）→ 2xx 且 CLI 各被调一次；
  3. super_admin → 授权直过、CLI 被调；任务不存在时 `getTask` 未被预读、CLI 抛错映射 500（锁定"无额外预读"）；
  4. `query.board='  '` → 400 且 CLI 零调用。

- [ ] **Step 2: 跑测试确认失败**
  ```bash
  npx vitest run custom/server/services/hermes/__tests__/kanban-mutation-access.test.ts
  ```
  预期：隐藏 profile 用例 FAIL（当前无授权，CLI 被调）。

- [ ] **Step 3: 实现三个 handler 接线**（直接改注入态 vendor 文件）
  每个 handler 头部插入：`const board = requestBoard(ctx); if (!board) return` ＋ `if (!await authorizeTaskIds(ctx, board, [ctx.params.id], undefined, '<action>')) return`；原 `ctx.query.board` 改用该 `board`。不动 catch 映射。

- [ ] **Step 4: 跑测试确认通过**（同 Step 2 命令＋两个守门旧测试）

- [ ] **Step 5: 提取补丁并登记**
  ```bash
  git -C vendor/hermes-studio diff --relative -- packages/server/src/modules/hermes/controllers/kanban.ts > patches/770-server-kanban-mutation-authorization.patch
  head -3 patches/770-*.patch   # 必须 a/packages/...（双重前缀=错）
  git checkout -- vendor/hermes-studio/packages/server/src/modules/hermes/controllers/kanban.ts
  ```
  series 尾部追加注释块＋`770-server-kanban-mutation-authorization.patch`；然后：
  ```bash
  npm run clean && npm run inject
  ```
  验证：inject 0 FAILED；`rg -n "authorizeTaskIds" vendor/hermes-studio/.../kanban.ts` 三 handler 命中；重跑 Step 2 全绿。

- [ ] **Step 6: Commit**
  ```bash
  git add custom/server/services/hermes/__tests__/kanban-mutation-access.test.ts patches/770-server-kanban-mutation-authorization.patch patches/series
  git commit -m "feat(kanban): PATCH/DELETE/decompose 三写入口接入 authorizeTaskIds——隐藏 profile 404 与 complete/block 同权（补丁 771）"
  ```

### Task 2: 证据压缩归档 fail-through（runtime 正本＋补丁 771）

**Files:**
- Modify: `runtime/tools/evidence_reducer.py:161-228`（`maybe_reduce_observation`）
- Create: `runtime/tests/test_evidence_reducer_archive.py`
- Create: `patches/771-agent-evidence-reducer-archive-failthrough.patch`；Modify: `patches/series`

**Interfaces:**
- Consumes: 既有 `_write_to_spillover`、`_ledger`、`_call_reducer_model`。
- Produces: 归档步骤后 `if not archive_path: _ledger("passthrough_archive_error"); return content`（`_ledger` 定义需上移到归档块之前）。

- [ ] **Step 1: 写失败测试** `runtime/tests/test_evidence_reducer_archive.py`
  fixture 先例 `vendor/hermes-agent/tests/tools/test_evidence_reducer.py:17-30`（`set_hermes_home_override` 隔离）。用例：
  1. `_write_to_spillover` mock 返回 `None` ＋ `_call_reducer_model` mock → 返回值 `is BIG` 且 `model.assert_not_called()`；
  2. `_write_to_spillover` mock `side_effect=RuntimeError` → 同上；
  3. 账本：变体 1 后 `ledger_path()` 内 `evidence_reduce` 事件 `outcome == "passthrough_archive_error"`。

- [ ] **Step 2: 确认失败**
  ```bash
  PYTHONPATH=runtime:vendor/hermes-agent python3.14 -m pytest runtime/tests/test_evidence_reducer_archive.py -q
  ```
  预期：FAIL（现状归档失败仍调模型、receipt 替换原文）。

- [ ] **Step 3: 实现**（runtime 正本）：`_ledger` 定义上移到归档 try 块之前；归档 try/except 后加空路径短路返回。同步把同一 diff 应用到 `vendor/hermes-agent/tools/evidence_reducer.py`（注入态）。

- [ ] **Step 4: 跑测试确认通过**（Step 2 命令＋回归）
  ```bash
  PYTHONPATH=vendor/hermes-agent:runtime python3.14 -m pytest vendor/hermes-agent/tests/tools/test_evidence_reducer.py vendor/hermes-agent/tests/tools/test_tool_result_storage.py -q
  ```

- [ ] **Step 5: 提取补丁并登记**
  ```bash
  git -C vendor/hermes-agent diff --relative -- tools/evidence_reducer.py > patches/771-agent-evidence-reducer-archive-failthrough.patch
  git checkout -- vendor/hermes-agent/tools/evidence_reducer.py
  ```
  series 登记 770；`npm run clean && npm run inject`；vendor 树 grep `passthrough_archive_error` 命中；Step 2/4 命令重跑全绿。

- [ ] **Step 6: Commit**
  ```bash
  git add runtime/tools/evidence_reducer.py runtime/tests/test_evidence_reducer_archive.py patches/771-agent-evidence-reducer-archive-failthrough.patch patches/series
  git commit -m "fix(runtime): evidence_reducer 归档失败即 passthrough——无全文不摘要，模型零调用（补丁 772）"
  ```

### Task 3: delegate 严格 output_schema（补丁 772）

**Files:**
- Modify（经补丁）: `vendor/hermes-agent/tools/delegate_tool.py`（schema 通告＋`_build_children` 附着＋校验接线）
- Modify（经补丁）: `vendor/hermes-agent/tools/delegate_tool_tasks.py`（新增校验器）
- Modify（经补丁）: `vendor/hermes-agent/tools/delegate_tool_child_run.py:644-656`（状态判定）
- Create（经补丁）: `vendor/hermes-agent/tests/tools/test_delegate_strict_output_schema.py`
- Create: `patches/772-agent-delegate-strict-output-schema.patch`；Modify: `patches/series`

**Interfaces:**
- Produces: `_validate_strict_flags(task_list, task_schemas) -> Optional[str]`（delegate_tool_tasks；strict 非 bool／strict=true 无 schema → 错误串，spawn 前返回）。
- Produces: `child._delegate_strict_output: bool`（`_build_children` 在附着 `_delegate_output_schema` 同点设置；签名加可选 `task_strict: Optional[list[bool]] = None`）。
- Produces（child_run 结果判定）：`strict and usable_summary and schema.valid is False` 时 `status="failed"`；`result.completed` 为真才 `exit_reason="output_schema_invalid"`，否则保留 `max_iterations`（`truncated` 随之 True）；`entry["error"]` 写明"summary 为未验证原文"。
- Consumes: 既有一次 bounded retry（`_validate_child_output_schema`）、`DELEGATE_TASK_SCHEMA.tasks.items.properties`。

- [ ] **Step 1: 写失败测试** `test_delegate_strict_output_schema.py`（stub 复制 `test_delegate_output_schema.py:117-163` 的 `_StubChild/_StubParent/_run` 模式）：
  1. strict 两次不合格 → `status=="failed"`、`exit_reason=="output_schema_invalid"`、summary=原始 prose、`schema_valid is False`、`schema_retries==1`、`len(child.calls)==2`；
  2. strict 一次纠正后合格 → `completed`＋`schema_valid is True`、无 error；
  3. strict＋预算耗尽（stub `completed=False`）→ `failed`＋`exit_reason=="max_iterations"`＋`truncated is True`＋`schema_valid is False`；
  4. strict＋interrupted → `status=="interrupted"`，无 `output_schema_invalid`；
  5. 无 strict（默认）两次不合格 → 原宽松行为（`completed`＋raw summary＋`schema_note`），与既有用例互证；
  6. `_validate_strict_flags`：`[{"strict_output_schema": True}]`×schemas `[None]` → 错误；`"yes"` → 类型错误；`False`/缺省 → `None`；
  7. `DELEGATE_TASK_SCHEMA` tasks items 含 `strict_output_schema` boolean 通告。

- [ ] **Step 2: 确认失败** `PYTHONPATH=vendor/hermes-agent:runtime python3.14 -m pytest vendor/hermes-agent/tests/tools/test_delegate_strict_output_schema.py -q` → FAIL（无 strict 支持）。

- [ ] **Step 3: 实现**（注入态 vendor 三文件＋新测试文件）：
  - delegate_tool.py：schema 加 `strict_output_schema` 属性描述；`delegate_task` 在 `_coerce_task_schemas` 后调 `_validate_strict_flags`，错误即返回（spawn 前）；`_build_children` 加 `task_strict` 参数并在 schema 附着点同设 `_delegate_strict_output`（grep `_build_children(` 确认唯一调用点并传入）。
  - delegate_tool_tasks.py：实现校验器（bool 检查＋strict⇒schema 存在）。
  - delegate_tool_child_run.py：按 Interfaces 改 `else:` 分支与 error 字段；interrupted/failed 分支不动。

- [ ] **Step 4: 跑测试确认通过**（Step 2 命令＋宽松回归）
  ```bash
  PYTHONPATH=vendor/hermes-agent:runtime python3.14 -m pytest vendor/hermes-agent/tests/tools/test_delegate_output_schema.py vendor/hermes-agent/tests/tools/test_delegated_output_redaction.py -q
  ```

- [ ] **Step 5: 提取补丁并登记**
  ```bash
  git -C vendor/hermes-agent add -N tests/tools/test_delegate_strict_output_schema.py
  git -C vendor/hermes-agent diff --relative -- tools/delegate_tool.py tools/delegate_tool_tasks.py tools/delegate_tool_child_run.py tests/tools/test_delegate_strict_output_schema.py > patches/772-agent-delegate-strict-output-schema.patch
  git -C vendor/hermes-agent checkout -- tools/delegate_tool.py tools/delegate_tool_tasks.py tools/delegate_tool_child_run.py
  rm vendor/hermes-agent/tests/tools/test_delegate_strict_output_schema.py   # 补丁产物，随 inject 重放
  ```
  series 登记 771；`npm run clean && npm run inject`；注入树重跑 Step 2/4 全绿。

- [ ] **Step 6: Commit**
  ```bash
  git add patches/772-agent-delegate-strict-output-schema.patch patches/series
  git commit -m "feat(agent): delegate_task 每任务 strict_output_schema——显式严格合同失败关闭，默认宽松不变（补丁 772）"
  ```

### Task 4: 机制预算、设计文档与全量回归

**Files:**
- Modify: `config/mechanism-budget.json`（changes 条目＋`limits.patches` 按实算）
- Modify: `docs/DESIGN.md` 能力边界表（批一立项提交已随 spec 同批落行；Task 4 只在措辞需勘误时微调）
- Modify: spec 验证段回填实测数字

- [ ] **Step 1: 预算登记**：changes 加 `+3 patches（770/771/772）`条目（reason=spec 路径；pairedRemovals=第二批迁移 envelope 落地时与 770 合并估计收编、reducer sunset 触发时 614/771 一并退役）；`node scripts/governance-lint.mjs --budget` 过（超限则按 series 实测抬位）。
- [ ] **Step 2: 文档同步**（上列两文档＋spec 回填）。
- [ ] **Step 3: 全量回归**
  ```bash
  npm run clean && npm run inject          # 0 FAILED
  npm run typecheck:harness
  npm test                                  # 全量 vitest
  PYTHONPATH=runtime:vendor/hermes-agent python3.14 -m pytest runtime/tests -q
  ```
  新增红=本批引入必须清零；main 既有红如实记录。
- [ ] **Step 4: 变异探针**（逐项：注释授权调用／归档短路／strict 赋值 → 对应新测试变红 → 恢复重绿）。
- [ ] **Step 5: Commit** `chore(docs): 超级智能体吸收批一——预算/设计文档/spec 验证随批`.

### Task 5: 独立审查与合入（需用户确认）

- [ ] **Step 1**: 派发独立审查子代理（分支全 diff vs origin/main：授权正确性、宽松兼容字节级、终止原因优先级、补丁可重放）。
- [ ] **Step 2**: review-record 落 `docs/superpowers/specs/2026-11-13-superagent-contract-closure-review.md`；问题回修。
- [ ] **Step 3**: 用户确认后收口：worktree 内 rebase origin/main → 主树 ff-only 快进 → `git merge --no-ff feat/superagent-contract-p0` → push → `git worktree remove`＋删分支。

## 完成检查表

- [ ] 三补丁 series 登记且 clean+inject 重放 0 FAILED
- [ ] 定向 vitest＋三组 pytest 全绿；宽松既有用例原义通过
- [ ] npm test／typecheck／runtime pytest 全量达标（新增红清零）
- [ ] 变异探针三连有效（测试真能抓回退）
- [ ] mechanism-budget／DESIGN／design-ledger／spec 验证段同步
- [ ] 独立审查留痕；合并经用户确认；worktree 走 git 通道清理
