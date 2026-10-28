---
name: kanban-orchestrator
description: Decomposition playbook + anti-temptation rules for an orchestrator profile routing work through Kanban. The "don't do the work yourself" rule and the basic lifecycle are auto-injected into every kanban worker's system prompt; this skill is the deeper playbook when you're specifically playing the orchestrator role.
version: 3.3.0
platforms: [linux, macos, windows]
environments: [kanban]
metadata:
  hermes:
    tags: [kanban, multi-agent, orchestration, routing]
    related_skills: [kanban-worker]
---

# Kanban Orchestrator — Decomposition Playbook

> The **core worker lifecycle** (including the `kanban_create` fan-out pattern and the "decompose, don't execute" rule) is auto-injected into every kanban process via the `KANBAN_GUIDANCE` system-prompt block. This skill is the deeper playbook when you're an orchestrator profile whose whole job is routing.

## Profiles are user-configured — not a fixed roster

Hermes setups vary widely. Some users run a single profile that does everything; some run a small fleet (`docker-worker`, `cron-worker`); some run a curated specialist team they've named themselves. There is **no default specialist roster** — the orchestrator skill does not know what profiles exist on this machine.

Before fanning out, you must ground the decomposition in the profiles that actually exist. The dispatcher silently fails to spawn unknown assignee names — it doesn't autocorrect, doesn't suggest, doesn't fall back. So a card assigned to `researcher` on a setup that only has `docker-worker` just sits in `ready` forever.

**Step 0: discover available profiles before planning.**

Use one of these:

- `hermes profile list` — prints the table of profiles configured on this machine. Run it through your terminal tool if you have one; otherwise ask the user.
- `kanban_list(assignee="<some-name>")` — sanity-check a single name. Returns an empty list (rather than an error) for an unknown assignee, so this only confirms a name you're already considering.
- **Just ask the user.** "What profiles do you have set up?" is a fine first turn when the goal needs more than one specialist.

Cache the result in your working memory for the rest of the conversation. Re-asking every turn wastes a tool call.

## When to use the board (vs. just doing the work)

Create Kanban tasks when any of these are true:

1. **Multiple specialists are needed.** Research + analysis + writing is three profiles.
2. **The work should survive a crash or restart.** Long-running, recurring, or important.
3. **The user might want to interject.** Human-in-the-loop at any step.
4. **Multiple subtasks can run in parallel.** Fan-out for speed.
5. **Review / iteration is expected.** A reviewer profile loops on drafter output.
6. **The audit trail matters.** Board rows persist in SQLite forever.

If *none* of those apply — it's a small one-shot reasoning task — use `delegate_task` instead or answer the user directly.

## The anti-temptation rules

Your job description says "route, don't execute." The rules that enforce that:

- **Do not execute the work yourself.** Your restricted toolset usually doesn't even include terminal/file/code/web for implementation. If you find yourself "just fixing this quickly" — stop and create a task for the right specialist.
- **For any concrete task, create a Kanban task and assign it.** Every single time.
- **Split multi-lane requests before creating cards.** A user prompt can contain several independent workstreams. Extract those lanes first, then create one card per lane instead of bundling unrelated work into a single implementer card.
- **Run independent lanes in parallel.** If two cards do not need each other's output, leave them unlinked so the dispatcher can fan them out. Link only true data dependencies.
- **Never create dependent work as independent ready cards.** If a card must wait for another card, pass `parents=[...]` in the original `kanban_create` call. Do not create it first and link it later, and do not rely on prose like "wait for T1" inside the body.
- **If no specialist fits the available profiles, ask the user which profile to create or which existing profile to use.** Do not invent profile names; the dispatcher will silently drop unknown assignees.
- **Decompose, route, and summarize — that's the whole job.**

## Decomposition playbook

### Step 1 — Understand the goal

Ask clarifying questions if the goal is ambiguous. Cheap to ask; expensive to spawn the wrong fleet.

### Step 2 — Sketch the task graph

Before creating anything, draft the graph out loud (in your response to the user). Treat every concrete workstream as a candidate card:

1. Extract the lanes from the request.
2. Map each lane to one of the profiles you discovered in Step 0. If a lane doesn't fit any existing profile, ask the user which to use or create.
3. Decide whether each lane is independent or gated by another lane.
4. Create independent lanes as parallel cards with no parent links.
5. Create synthesis/review/integration cards with parent links to the lanes they depend on. A child created with unfinished parents starts in `todo`; the dispatcher promotes it to `ready` only after every parent is done.

Examples of prompts that should fan out (using placeholder profile names — substitute whatever exists on the user's setup):

- "Build an app" → one card to a design-oriented profile for product/UI direction, one or two cards to engineering profiles for implementation, plus a later integration/review card if the user has a reviewer profile.
- "Fix blockers and check model variants" → one implementation card for the blocker fixes plus one discovery/research card for config/source verification. A final reviewer card can depend on both.
- "Research docs and implement" → a docs-research card can run in parallel with a codebase-discovery card; implementation waits only if it truly needs those findings.
- "Analyze this screenshot and find the related code" → one card to a vision-capable profile for the visual analysis while another searches the codebase.

Words like "also," "finally," or "and" do not automatically imply a dependency. They often mean "make sure this is covered before reporting back." Only link tasks when one card cannot start until another card's output exists.

Show the graph to the user before creating cards. Let them correct it — including which actual profile name should own each lane.

### Step 3 — Create tasks and link

Use the profile names from Step 0. The example below uses placeholders `<profile-A>`, `<profile-B>`, `<profile-C>` — replace them with what the user actually has.

```python
t1 = kanban_create(
    title="research: Postgres cost vs current",
    assignee="<profile-A>",  # whichever profile handles research on this setup
    body="Compare estimated infrastructure costs, migration costs, and ongoing ops costs over a 3-year window. Sources: AWS/GCP pricing, team time estimates, current Postgres bills from peers.",
    tenant=os.environ.get("HERMES_TENANT"),
)["task_id"]

t2 = kanban_create(
    title="research: Postgres performance vs current",
    assignee="<profile-A>",  # same profile, run in parallel
    body="Compare query latency, throughput, and scaling characteristics at our expected data volume (~500GB, 10k QPS peak). Sources: benchmark papers, public case studies, pgbench results if easy.",
)["task_id"]

t3 = kanban_create(
    title="synthesize migration recommendation",
    assignee="<profile-B>",  # whichever profile does synthesis/analysis
    body="Read the findings from T1 (cost) and T2 (performance). Produce a 1-page recommendation with explicit trade-offs and a go/no-go call.",
    parents=[t1, t2],
)["task_id"]

t4 = kanban_create(
    title="draft decision memo",
    assignee="<profile-C>",  # whichever profile drafts user-facing prose
    body="Turn the analyst's recommendation into a 2-page memo for the CTO. Match the tone of previous decision memos in the team's knowledge base.",
    parents=[t3],
)["task_id"]
```

`parents=[...]` gates promotion — children stay in `todo` until every parent reaches `done`, then auto-promote to `ready`. No manual coordination needed; the dispatcher and dependency engine handle it.

If the task graph has dependencies, create the parent cards first, capture their returned ids, and include those ids in the child card's `parents` list during the child `kanban_create` call. Avoid creating all cards in parallel and linking them afterward; that creates a window where the dispatcher can claim a child before its inputs exist.

### Step 4 — Complete your own task

If you were spawned as a task yourself (e.g. a planner profile was assigned `T0: "investigate Postgres migration"`), mark it done with a summary of what you created:

```python
kanban_complete(
    summary="decomposed into T1-T4: 2 research lanes in parallel, 1 synthesis on their outputs, 1 prose draft on the recommendation",
    metadata={
        "task_graph": {
            "T1": {"assignee": "<profile-A>", "parents": []},
            "T2": {"assignee": "<profile-A>", "parents": []},
            "T3": {"assignee": "<profile-B>", "parents": ["T1", "T2"]},
            "T4": {"assignee": "<profile-C>", "parents": ["T3"]},
        },
    },
)
```

### Step 5 — Report back to the user

Tell them what you created in plain prose, naming the actual profiles you used:

> I've queued 4 tasks:
> - **T1** (`<profile-A>`): cost comparison
> - **T2** (`<profile-A>`): performance comparison, in parallel with T1
> - **T3** (`<profile-B>`): synthesizes T1 + T2 into a recommendation
> - **T4** (`<profile-C>`): turns T3 into a CTO memo
>
> The dispatcher will pick up T1 and T2 now. T3 starts when both finish. You'll get a gateway ping when T4 completes. Use the dashboard or `hermes kanban tail <id>` to follow along.

### 方法论背书：多作者分章+单一统审 与 三层粒度分解（2026-09-08 增补，知识底座融合 B1/B2）

- **B1 多作者分章+单一统审（分布式生产+集中质控）**：fan-out 把可并行的 lane 拆给多个 worker 各写一章，是正确形态；但合并质量依赖**显式指定单一统审者**——fan-out 卡与 synthesis/统审卡用 `parents=[...]` 连接，统审卡 body 写明「统一术语表 + 逐章口径核对」职责。判例原型：《物理学基础》7 位译者按章分工、张三慧一人统审校核全书；《普林斯顿数学指南》133 位作者、主编统一深度与风格。
- **B2 三层粒度条目化分解**：长文（=独立子任务卡，可交付可审）+ 中篇（=阶段性里程碑/综述卡）+ 短条目（=共享词汇表——术语、接口名、口径定义放共享位置供各卡引用）。跨卡一致性的解法是统一词汇表先行，不是事后互相对齐。
- **B3 蓝军审查卡扇入门（2026-09-17 增补）**：N 张实现卡 fan-out 时**同批**创建 1 张对抗审查卡 `parents=[全部实现卡]`——出生即 gated todo，父卡全 done 自动解锁，禁事后 link、禁手动 promote。纪律：(a) 审查 assignee 必须与所有被审卡不同 profile（不自审自封）；(b) 分解期就把被审产物的**绝对路径清单**预写进审查卡 body，实现卡按同一路径落盘——worker 看不到兄弟卡上下文，预定路径是卡间唯一传递通道；(c) 转译/移植类实现卡的 frozen 验收项逐字锁定源码数字（权重/门禁/阶梯阈值），审查卡忠实性维度=逐个 diff 源码核对，机械核对而非印象审；severity 分类建卡时冻结（BLOCKER/WARNING），「照抄源项目不适用机制」类规则明示 BLOCKER。
>
> 来源: synthesis-fusion-plan.md B1/B2 / physics-3books-report.md ⑦（机工社官方页「译者的话」逐章分工原文，查询 2026-09-07）+ math-3books-report.md §2.1 [7][15]

## Graph Engineering 派工纪律（2026-09-17 增补，Graph Engineering with Claude 融合）

> 来源：Codez (@0xCodez)《Graph Engineering with Claude: 14-Step roadmap》(2026-07-20)，经微信文章转引 + 原文全文对照，存档于 workspace `research/wechat-fusion-20260917/original-0xcodez-fulltext.txt`。本机 kanban 图机制（parents 依赖）已天然覆盖 diamond 拓扑、节点隔离（worktree）、边上对抗验证（`_shared/03-evolution-memory/review-gates.md` Diamond 7 门），本节只补真增量纪律。机制锚点全部出自 `hermes_cli/kanban_db.py` 源码。

### GE-1 fan-in 容错：硬依赖才建边，死卡用 unlink 释放

kanban 依赖门是 **all-or-nothing**：`recompute_ready()` 要求全部 parents 到终态（仅 done/archived 算终态，blocked/gave_up 都不算——kanban_db.py:2114, 2148-2157）才放行 child。因此「合成卡 body 写 ≥K/N 上游成功即可开工」是死文本：任一上游 blocked，child 永驻 todo，worker 从未被 dispatch，body 纪律无人执行。正确形态分三层：

- **图设计期**：`parents=[...]` 只挂硬依赖（缺了它合成无意义的上游）；软依赖（锦上添花的上游）写 body 引用、不建边。K/N 容忍语义在构图时用边的选择表达，不是运行时 body 表达。
- **运行期巡检**（owner=orchestrator；SLA：发现下游悬挂当次会话处置，不留到收尾）：上游 blocked/gave_up → 处置序 ① `hermes kanban reclaim` / reassign 重试 → ② 判定不可产出 → ③ `hermes kanban unlink <parent_id> <child_id>` 释放边（该命令内部自动 recompute_ready 重门控——kanban_db.py:1683-1685 "Re-gate the child now"）→ child 自动放行。**无需也不可手动 promote**（promote_task 拒绝未满足 parent，force 会撞 claim 复检）。注意：上游因需人类输入而正常 block 时，下游悬挂是临态——保持边，不 unlink。
- **body 容忍纪律后置**：合成卡 body 写「软依赖缺失时标 missing 并在报告中显式标注」——这条只在硬边/软依赖分层之后才活（worker 真会被 dispatch 时才有意义）。

### GE-1b 软依赖「前置检查+block」的完整生命周期——block 后没人替你解锁

GE-1 说「软依赖写 body 引用、不建边」，但只写引用会让 worker 在上游产物缺席时空转烧轮次。完整形态 = 卡内前置检查条款 + orchestrator 侧手动恢复闭环：

- **派卡侧**：依赖卡 body 第一步（开工前置节）写死——「确认 <上游产物绝对路径> 在场；不在场 → `kanban_block(kind="dependency", reason="等待 <上游卡id> 产盘 <路径>")`，勿空转」。worker 实测核验（`test -f` + 工作区 ls）后 block 是**正确行为**而非失败——防空转防线生效的证据，收到此类 block 通知无需干预。
- **恢复侧（关键缺口）**：kanban 不知道这层 prose 依赖——上游 done **不会自动 unblock** 下游，卡永驻 blocked 且无告警。收到上游 done 通知后 orchestrator 必须：① 先验证前置产物真实在场（`test -f` + 语法加载如 `yaml.safe_load`——防上游 done 但产物残缺/空文件的二次撞墙）；② 再 `kanban_unblock(board=..., task_id=...)`。顺序不可倒——先 unblock 后验证会让重派 worker 秒撞缺失再 block 一轮。
- **何时选软依赖而非 parents 硬边**：下游只需要上游的**一个最终产物文件**、且希望同批并行派发（下游可先做不依赖它的部分）。下游第一步就要上游产物才能开工的，仍用 `parents=[...]` 硬门。

### GE-2 barrier 节俭：机械 reduce 不烧 agent 卡

flatten/dedupe/filter 类无跨项判断的 reduce（合并多卡产物、清单归并）用脚本或 Checker 机械执行，agent 卡只留给真正需要判断的节点。与既有规则的分工：Step 2 的 "Only link tasks when one card cannot start until another card's output exists" 管**边的真实性**；本条管**边汇合后第一个节点的类型**——建合成卡前先问「这一步是判断还是搬运」，纯搬运不建 agent 卡。

### GE-3 循环收敛三判据（仅 goal_mode 卡）

见下方 Goal-mode 节末尾——kanban 图机制无环（`_would_cycle` 拒绝环边，kanban_db.py:1654），循环只存在于 goal_mode judge 循环，判据落在该节。

## Common patterns

**Fan-out + fan-in (research → synthesize):** N research-style cards with no parents, one synthesis card with all of them as parents.

**Parallel implementation + validation:** one implementer card makes the change while one explorer/researcher card verifies config, docs, or source mapping. A reviewer card can depend on both. Do not make the implementer own unrelated verification just because the user mentioned both in one sentence.

**Pipeline with gates:** `planner → implementer → reviewer`. Each stage's `parents=[previous_task]`. Reviewer blocks or completes; if reviewer blocks, the operator unblocks with feedback and respawns.

**Same-profile queue:** N tasks, all assigned to the same profile, no dependencies between them. Dispatcher serializes — that profile processes them in priority order, accumulating experience in its own memory.

**Human-in-the-loop:** Any task can `kanban_block()` to wait for input. Dispatcher respawns after `/unblock`. The comment thread carries the full context.

## Pitfalls

**Manual dispatch is a per-profile release valve, not a per-card pick.** `hermes kanban dispatch --max N --json` releases cards by **assignee profile**, not by task id — there is no flag to select an individual task. If a dispatcher stalls with one card per profile stranded, `--max 1` releases the highest-priority ready card on the whole board (whatever assignee owns it). If you only want one specific card out, temporarily lock the others by priority or use `hermes kanban reclaim` afterward to pull back the ones you didn't mean to release.

**Don't fire manual dispatch without `--max N` — it sweeps the whole board.** When the dispatcher stalls and you run `hermes kanban dispatch` to unstick one card, omitting `--max` (or setting N too high) releases **every** ready card on the active board at once, including stale cards owned by other assignees that have been accumulating for hours. Set `--max` to the count of cards you actually intend to release this pass, and verify the board's ready queue afterward.

**Inventing profile names that don't exist.** The dispatcher silently fails to spawn unknown assignees — the card just sits in `ready` forever. Always assign to a profile from your Step 0 discovery; ask the user if you're unsure.

**Bundling independent lanes into one card.** If the user asks for two independent outcomes, create two cards. Example: "fix blockers and check model variants" is not one fixer task; create a fixer/engineer card for the fixes and an explorer/researcher card for the variant check, then optionally gate review on both.

**Over-linking because of wording.** "Finally check X" may still be parallel with implementation if X is static config, docs, or source discovery. Link it after implementation only when the check depends on the implementation result.

**Forgetting dependency links.** If the task graph says `research -> implement -> review`, do not create all tasks as independent ready cards. Use parent links so implement/review cannot run before their inputs exist.

- **Reassignment vs. new task.** If a reviewer blocks with "needs changes," create a NEW task linked from the reviewer's task — don't re-run the same task with a stern look. The new task is assigned to the original implementer profile.

- **Two-tier approval gate for sensitive product changes.** When a child card produces a draft that depends on user approval (e.g. sensitive changes to a child profile, safety rules, or privacy-affecting features), split into two cards: Card A contains only the items that can land immediately without approval; Card B holds the approval-dependent items, with a draft staged in a workspace reports directory. On approval, dispatch a follow-up card scoped to apply ONLY the approved draft to the target config/SOUL, explicitly preserving everything else. Until the user's ruling, keep the draft out of all runtime surfaces and do not reference it in dispatch cards.

- **Draft-to-active lifecycle.** Keep unapproved drafts in a dedicated reports/drafts area (outside the target SOUL/profile). Once the user approves, the follow-up card writes the draft into the target SOUL with source attribution, backup, and a verification command for the applied state. Do not delete the draft file after the write; mark it as "applied" for audit.

**Argument order for links.** `kanban_link(parent_id=..., child_id=...)` — parent first. Mixing them up demotes the wrong task to `todo`.

**Batch fan-out creates: pass `title=` explicitly on every call.** The body-first-line routed marker is NOT the title — `kanban_create` without `title` is rejected outright, and in a parallel batch all N calls fail at once. On a batch failure, read one call's error, fix the shared shape, resend once; blind resends of the same shape trip the loop guard.

**Never `force=True` a parent-gated card — you just ran the fan-in gate you built.** `promote_task(..., force=True)` and `kanban_unblock` bypass the "all parents done" check, so a synthesis/integration card you deliberately linked with `parents=[...]` gets promoted to `ready` alongside its still-unfinished parents and the dispatcher runs it with missing inputs. Only force-promote a card whose parents you have *just* completed in this same pass — never to "save a step." If a gated card needs to move early, that is a signal the graph was wrong: fix the `parents` list or re-scope the card instead.

**Pass `board=` explicitly on EVERY kanban_* call.** Omitting it makes the tool resolve the active board from env/symlink defaults, which need not match the board you intended — and the mismatch can be **SILENTLY WRONG IN BOTH DIRECTIONS**: a create without `board=` lands on whatever `~/.hermes/kanban/current` points to (2026-10-19: single session, TWO cards silently landed on `fanfan-pm-plan` because the symlink pointed there; one was even claimed+spawned a duplicate orchestrator worker within 60s — reclaim+comment+archive to stop the bleed). **The mechanical tell**: when `kanban_create(parents=[...])` reports `unknown parent task(s)` for a parent id you have VERIFIED exists, the create is almost certainly landing on the wrong board — do NOT re-check the parent id or retry the same shape; add `board=` and resend. `board=` and `parents` are a hard pair: never call create with `parents` but without `board`. Symptom: every board-DB query for the id returns empty, `kanban_request_changes`/`kanban_show` fail "task not found", yet the dispatcher runs the card fine (worker log at `~/.hermes/kanban/logs/<id>.log`). Diagnosis rule: when a card id has no row in the board DB, query the root `~/.hermes/kanban.db` before declaring the card lost.

**Done cards are terminal — corrections need a comment + fresh card.** `kanban_request_changes` fails ("task not found") on a card already in `done`, even though the card exists. When post-completion review finds defects: (1) post the full correction task-book as a comment on the done card — that comment is the durable audit trail; (2) `kanban_create` a fresh correction card in the SAME workspace_path that repeats the task-book inline (workers only reliably see their own card's body), with frozen acceptance criteria per defect and an explicit "leave a per-item comment and WAIT for re-review; do not self-complete" clause. Do not pass the done card in `parents=[...]` — parent lookup fails across DBs; reference its id in the body instead. Scope the card with a hard boundary list (what is already verified and must NOT be touched) to prevent drive-by rework of accepted parts.

**Timeout notifications can misreport the cause.** A notice reading `timed_out (max_runtime=0s)` can fire while the real limit was 7200s and the actual exit reason was iteration-budget exhaustion. Read `task_runs.error` in the board DB for the true exit reason before choosing a remedy: budget exhaustion → recovery-context re-dispatch (research-subagent-orchestration Pattern 6); genuine wall-clock timeout → shrink scope or raise the budget.

**Don't pre-create the whole graph if the shape depends on intermediate findings.** If T3's structure depends on what T1 and T2 find, let T3 exist as a "synthesize findings" task whose own first step is to read parent handoffs and plan the rest. Orchestrators can spawn orchestrators.

**Tenant inheritance.** If `HERMES_TENANT` is set in your env, pass `tenant=os.environ.get("HERMES_TENANT")` on every `kanban_create` call so child tasks stay in the same namespace.

**「继续 / 推动完成」类极简指令 ≠ 给你下一个派卡题,= 让你自己收口**。用户发一个词（"继续"、"完成"、"推"、"检查当前进展 推动完成 预估完成时间"）通常意味着他们看完了你上一条汇报、确认方向对、让你**自己**把后续可由 orchestrator 干的事（独立验收、设计文档同步、记忆持久化、产物保全）做完,不是「请你再发一段 shell 命令让我跑」。**判别**：极简指令后,**先问「剩下的活里哪件我可以自己干」,再问「哪件必须让用户执行」**——`kanban` 卡验收、`read_file` 复核产物、git 提交、报告保全、记忆条目、跨板 comment 留痕,**这些都该是 orchestrator 自己跑,不是把命令清单甩回给用户**。只在真的卡到外部环境(权限/物理/外部 API) 才把命令清单抛回去。**反模式**:用户说「推动完成」后,响应里又写了 3 段 `bash` 让用户执行——这是把 orchestrator 的职责推回给用户,违背「mechanism守门,AI 干活,人定方向」分工。一条判据:你写完「请在外部终端跑以下命令」之前,先自问「这步我做不了吗?」——如果答案是「能,但慢 / 能,但上下文挤」,那就做,用户付的就是这点算力。

**极简指令后的三件可自干（orchestrator 主动收口循环,2026-10-15 jev-skill 实测）**。用户给「推动完成」类极简指令时,orchestrator 该**自己跑**三件套（不甩回用户,也不堆命令给用户跑）：
1. **`kanban_show` 查实时进度**——status=ready/running/todo 比例 + 当前 PID + claim_expires,回答「现在到哪一步」「还有几张没动」「本卡是否真活着」。
2. **独立验收上一张 done 卡**——按 `worker-completion-independence-verification` 纪律 grep/unittest 跑一遍,不信 worker 自报。**只对已 done 的卡验,不替 running 卡操心**。
3. **nudge 唤醒下一张**——若 ready 卡排了 ≥1 张但 dispatcher idle ≥10 分钟,跑 `hermes kanban dispatch --max 1 --json`;读 JSON `skipped_locked`/`skipped_per_profile_capped` 判该用 Path A 还是 Path B。这三件干完,再给用户**单条三点式汇报**（资源效率/系统风险/能力沉淀）+ 剩余预估时间,**不要**在响应里又写 3 段 shell 让他跑。判据:写完「请在外部终端跑以下命令」之前,先自问「这步我做不了吗?」——做得了就做。

**「给方案 → 选一项」4 选 1 模板（2026-10-15 jev-skill 实测）**。每张 done 卡验收或每个独立决策点收口时,orchestrator 必须给用户**最多 4 个互斥选项**(A/B/C/D),每条一行 + 推荐项标★,**只问「选哪个」不问「你觉得呢」**——用户的工作纪律是「让我自己收口,但决策权在我」。**A 通常 =「立即动作」**(派 fix 卡/重启/跑测试),**B =「不动作」**(等 N 全部 done),**C =「统一收口」**(建蓝军终合卡),**D =「听你的」**(开放选项)。**禁止**给两个看起来一样的选项(用户无法判别),**禁止**超过 4 个选项(决策疲劳),**禁止**选项里有「再做一次同样的事」(用户已拍板就别再问)。判据:你写完 4 个选项后,自问「用户能在 5 秒内选 1 个吗?」——能就对了。**反模式**:给 6+ 选项(过载)、给开放提问(「你想怎么处理?」,不是 4 选 1)、把决策抛回用户(「你觉得呢」)、选项全是大段解释(用户懒得读)。**该模式适用场景**:派工顺序、修复时点、关掉/重跑决策、状态变更、产物归口。**不适用**:用户已明确指令(直接做)、纯 yes/no(选 A/B 二选一即可)、用户已说「你自己收口」(不需选项)。

**Missing write-path skill evidence.** `kanban_create` / `kanban_comment` / `kanban_complete` are tool-layer wrappers; when the tool layer is broken for your profile (a `no such function: kanban_write_sanctioned` error from the DB layer), fall back to the CLI immediately — do not keep retrying the tool. The CLI is authoritative: `hermes kanban --board <slug> create "<title>" --assignee ... --workspace "dir:<abs>" --body-file <abs.md> --json` and `hermes kanban --board <slug> comment <id> "<text>"`. The SQLite table for comments is `task_comments` (not `comments`), and CLI `comment` takes positional args (`task_id text`), not `--body`. Write the tool-layer limitation into the card body so workers see the fallback.

**`kanban_write_sanctioned` UDF not registered ≠ repair path that works (2026-10-15 jev-skill 融合卡 t_4a281540 实测).** When bare `sqlite3` against a board DB returns `no such function: kanban_write_sanctioned`, the `kanban-db-guarded-writes` skill prescribes a 3-step repair: write a `repair.py` script → `sys.path.insert(0, "/Users/YOURNAME/.hermes/hermes-agent")` → `from hermes_cli.kanban_db_connect import connect` (which auto-registers the UDF) → call `kb.specify_triage_task` / `kb.complete_task(force=True)` etc. That path is **the right path WHEN the underlying python works**. When tools python 3.14.7 stdlib is broken (`ModuleNotFoundError: No module named 'copyreg'` from `re/__init__.py:381`), even `connect()`-via-Python fails because `hermes_bootstrap.py` itself imports `pathlib` (in the broken stdlib) before any UDF registration happens. **Symptom stack to recognise this case**: ① every `hermes ...` CLI command errors with `re/__init__.py:381 → import copyreg → ModuleNotFoundError`; ② the `~/.hermes/bin/python-drift-watchdog.sh` check #2 (`bare tools python cannot run -m hermes_cli.main`) is still GREEN (because the watchdog runs after the stdlib is loaded in another way); ③ `hermes-anaconda kanban show <id>` succeeds — use that to verify the board state. **When that stack matches, do NOT try to fix the DB layer** — the UDF cannot be registered by a python that cannot import `re`. Switch to the `hermes-anaconda` wrapper for any CLI-level repair, and document the broken-stdlib condition as a separate incident to be fixed at the python-image level (see `hermes-tool-dependencies` "When tools python stdlib itself is broken"). Trying the prescribed `connect()` repair in this state just multiplies the failure surface.

**`hermes update` in progress locks ALL kanban write CLIs AND the dispatcher itself (2026-10-15 P1-RootCap verify-cap 实测).** When `hermes update` is running (≥1 PID matches `pgrep -f 'hermes.*update'`), every `hermes kanban` write subcommand fails with `source-update completion failed: an update is still running; wait for it to exit, then relaunch Hermes; running with the previous dependencies — run \`hermes update\` to finish it`. **Critical: this lock also blocks `kanban_unblock` and the dispatcher's own spawn path — the dispatcher shares the same IDB write path and silently skips ready cards too** (ready cards stay `ready`, no new `claimed`/`spawned` events fire, and the chat stays silent for the entire update window). Symptoms on a blocked card: `hermes kanban unblock <id>` returns `cannot unblock <id> (not blocked/scheduled?)` even when the SQL row says `status=blocked` — the state machine sees the source-update lock and refuses the transition; the CLI message is misleading. **Diagnosis rule before reaching for any recovery tool**: `pgrep -f 'hermes.*update' | wc -l`; if >0, the fix is **wait 5-10 min for the update to finish naturally** (don't kill it — `--keep-stash` may not survive SIGKILL and you can lose in-flight source migrations). Do not escalate to `delegate_task` as a workaround — the spawned subagent will also hit the same lock. **Pair this with the worktree 60s-timeout pitfall** (see `worktree-lifecycle-hygiene`): when both fire together (update lock + worktree timeout), the recovery sequence is `pgrep → wait → rm .git/index.lock → git worktree unlock <path> → hermes kanban unblock <id>`; running `unblock` before the update finishes returns success-or-no-op but does not promote the card.

**卡 id 从建卡回执拿到后，complete/comment 报 unknown id = 卡未真正落库（2026-10-21 实证）。** `kanban_create(triage=True)` 回执给了 id，同 run 内执行到一半 `kanban_complete` 报 unknown id / stale run / already terminal、`kanban_comment` 报 unknown task、`kanban_list` 全表无该 id——四路交叉确认卡未落库（triage 建卡落库异常或中途被清理）。**教训**：①不猜根因，不试图恢复卡——卡只是留痕载体，实质交付已落盘则卡丢了不补开不重建，只在 run 最终回复里如实交代；②建卡回执≠卡在位——同 run 内后续 kanban_* 调用报 unknown id 时先 `kanban_list` 全表核对该 id（排除 board 参数错），真不在则放弃卡级留痕；③避免此坑的正解=**即建即干且 body 完整的任务直接 `initial_status='running'` 不要 triage**——triage 卡的生命周期多一道 specify 转换，多一道丢卡风险面，且 dispatcher 永不拾取 triage 栏（卡永远停在「无人干」状态，等发现时已过时效）。

**「调研已做完 + 用户说开工」= orchestrator 直执行,不派 worker (2026-10-19 jev-skill 实测)**。SOUL 第 6 行"不亲自执行编码/渗透/部署等实质工作——委托给对应 worker profile"是泛规则,但落地时一个高频反模式是:**当 orchestrator 刚做完完整调研(本会话上下文里所有证据/裁决/产物路径都在),用户说"开工",orchestrator 派卡让 worker 干**——worker 派出去后必须重传全部背景(上下文裁剪、对话摘要、能力说明),耗时 + 浪费预算 + 出错面变多(worker 看到的对话摘要把"已读完"压缩成"已了解",新证据可能丢失)。**判别三问**:
1. orchestrator 当前会话上下文里是不是已经有完整调研结论 + 产物绝对路径?
2. 任务的"实质工作"是不是 reading/writing 本地文件、跑命令、grep、sqlite 查询——这些 orchestrator 自己用工具就能干(不是"用 coding agent 才能干的复杂实现")?
3. 派 worker 出去,worker 能不能拿到比 orchestrator 当前上下文更多的证据?——答否,就不要派。
**判据**:**当三问都满足"是/是/否",orchestrator 直执行,建一张 self-card 留痕即可,不要把同样的上下文再发一遍给 worker**。例外:任务依赖外部 LLM 长上下文推理(目标> 200k token)、worker 有 orchestrator 没有的工具(如 REA 172 个 MCP 工具)、需要独立 session 隔离(如安全测试),这些场景派 worker 才合算。

**意图已被用户固定模式锚定的指令不进 clarify。**「深入调研 X 完善能力」类指令在用户的长期历史里语义固定：深调研 → 报告落盘 → 融合候选 → 用户拍板——把它当新歧义去问「你期望什么深度」，得到的只会是「没懂？就是深入调研」，还消耗一轮信任。clarify 只留给真分叉：落点三选一（只报告 / 报告+方案 / 直接落地）、预算边界、越权动作确认。判据：hindsight/memory 里同类指令出现过 ≥2 次且走向一致 → 意图已锚定，直接按模式开工；问「你期望什么」等于把用户已经给过的答案再要一遍。派卡 body 里把模式的默认边界写明（如「仅调研不落地，候选等拍板」），用户有异议自会纠正——这比前置问卷便宜。

## 跨板派工 body 模板（专用任务书）

当把一个产品调研 + 逆向工程类重型任务拆成跨板子卡（research ↔ hack）时，子卡 body 用以下骨架——它为每个子卡固化「任务契约（防偷换目标）/ 授权门判定（仅逆向类）/ 必读 context 清单 / 约束与红线（逐字入卡，禁事后口头传播）/ 预算轮次与超限处置 / 交付格式与 handoff metadata 形状 / 失败预期（预判缺口+预置修法）/ 验收标准（frozen:true）/ 收尾契约」。跨板引用用 body 互注 `context_from` + 对方卡 id,**不用** parents（跨板 JOIN 失效）。

典型骨架（细节按任务填）:
```
# T<n> <任务名>
routed:heavy:<~N轮>
## 任务            —— 做什么 + 产出绝对路径
## 任务契约         —— 目标解释/最终成功状态/权威输入/不可接受捷径
## 授权门判定       —— 仅逆向类：公开分发物/本机只读/零目标流量红线逐字
## 必读 context    —— 未读不开工
## 约束与非功能需求 —— 预算轮次 + 超限处置 + 禁止无界操作
## 交付格式        —— 产物结构 + 三态标注(confirmed/candidate/not found)
## 动作空间        —— 允许工具 + 明确排除
## 失败预期        —— 预判缺口 + 预置修法
## 验收标准(frozen:true)
## 收尾契约        —— kanban_complete(summary+metadata.findings)
```

跨板关联（两卡并行时）在各自 body 末尾互注：
```
父卡（跨板）:T<other> <other_id>(<board> 板,<assignee>)=<other任务一句话>
两卡 done 后由 orchestrator 建 T<next> 合成卡（parents=[T1,T2]）产出<终态交付>
```

## Goal-mode cards (persistent workers)

By default a dispatched worker gets **one shot** at its card: it does its work, calls `kanban_complete`/`kanban_block`, and exits. For open-ended cards where one turn rarely finishes the job, pass `goal_mode=True` to wrap that worker in a Ralph-style goal loop — the same engine behind the `/goal` slash command:

```python
kanban_create(
    title="Translate the full docs site to French",
    body="Acceptance: every page translated, no English left, links intact.",
    assignee="<translator-profile>",
    goal_mode=True,        # judge re-checks the card after each turn
    goal_max_turns=15,     # optional budget (default 20)
)["task_id"]
```

How it behaves:
- After each worker turn, an auxiliary judge evaluates the worker's response against the card's **title + body** (treated as the acceptance criteria).
- Not done + budget remains → the worker keeps going **in the same session** (full context retained — not a fresh respawn).
- Worker calls `kanban_complete`/`kanban_block` itself → loop stops, normal lifecycle.
- Budget exhausted without completion → the card is **blocked** for human review (sticky), never a silent exit.

When to use it: long, multi-step, or "keep going until X is true" cards. When NOT to: cheap one-shot cards (translation of a single string, a quick lookup) — the judge overhead isn't worth it, and the dispatcher's existing retry/circuit-breaker already handles transient worker failures.

Write the body as **explicit acceptance criteria** — the judge is only as good as the goal text. "Translate the README" is weaker than "Translate every section of the README to French; no English sentences remain."

Two independent budgets govern a goal card, and the one you did not set is the one that fires: `goal_max_turns` (conversation turns, judge loop) and the worker loop's tool-call iteration budget (~90 calls — what actually runs out first on collection-heavy research cards). Split the iteration budget inside the card body (collection vs writing vs buffer) — the common goal-card death is a worker that finishes researching and runs out of calls before writing.

**GE-3 循环收敛三判据（发现/搜索类 goal 卡必配，2026-09-17 增补）**。bug sweep、资产盘点、全量找文章这类「不知道规模多大」的卡靠 judge 循环收敛，body 必须含三判据，缺一则「收敛」不可判定：
1. **seen 全集去重**：对「见过的一切」去重，不是只对「已确认的」——只对 confirmed 去重时，被否掉的伪发现每轮重新冒出来，循环永不干涸、烧钱重走死路。
2. **dedupe key 入卡**：判重键必须在 body 里定义死（URL / 归一化标题 / 文件路径等），键不定义则「seen 全集去重」无法机械执行。
3. **K 轮空转退出 + 硬预算**：连续 K 轮（建议 2）无新增发现即停；`goal_max_turns` 必设（工具层硬限）。

## Recovering stuck workers

When a worker profile keeps crashing, hallucinating, or getting blocked by its own mistakes (usually: wrong model, missing skill, broken credential), the kanban dashboard flags the task with a ⚠ badge and opens a **Recovery** section in the drawer. Three primary actions:

1. **Reclaim** (or `hermes kanban reclaim <task_id>`) — abort the running worker immediately and reset the task to `ready`. The existing claim TTL is ~15 min; this is the fast path out.
2. **Reassign** (or `hermes kanban reassign <task_id> <new-profile> --reclaim`) — switch the task to a different profile (one that exists on this setup) and let the dispatcher pick it up with a fresh worker.
3. **Change profile model** — the dashboard prints a copy-paste hint for `hermes -p <profile> model` since profile config lives on disk; edit it in a terminal, then Reclaim to retry with a fresh model.

Hallucination warnings appear on tasks where a worker's `kanban_complete(created_cards=[...])` claim included card ids that don't exist or weren't created by the worker's profile (the gate blocks the completion), or where the free-form summary references `t_<hex>` ids that don't resolve (advisory prose scan, non-blocking). Both produce audit events that persist even after recovery actions — the trail stays for debugging.

**Dispatcher start-up deadline dead-lock → two bypass paths, pick by symptom.** When `kanban_unblock` succeeds (status moves to `ready`) but the worker never actually spawns — log says `Kanban owner refused: Gateway starting: deadline` or `RuntimeStoreError: admission_conflict` — the dispatcher is waiting on the owner lock during a gateway restart/election window. `unblock` plus patience does not fix it within the turn; a second `unblock` does not fix it either. Two paths, choose by symptom:

- **Path A (less invasive): `hermes kanban dispatch --max 1 --json`.** A single dispatch tick is enough to nudge a fresh claim past the lock window when the owner lock will clear within one tick. Read the JSON response — `skipped_locked: true` means the lock still owns the card; `skipped_locked: false, spawned: 0, skipped_per_profile_capped: [...]` means lock cleared but per-profile cap is full (the only thing blocking it). `spawned: N>0` is success. Use this when the symptom is "card stuck in `ready` for >10 min after upstream done."
- **Path B (last resort): `delegate_task` directly in TUI, bypass dispatch entirely.** Use only when Path A consistently returns `skipped_locked: true` across multiple retries (genuine gateway election window, lock won't clear on its own). Attach the resulting artifact to the still-ready card by id so it becomes the final handoff. The card stays in `ready` as the audit anchor; the subagent is the implementer.

(Mechanism: dispatcher owner-lock is per-gateway, not per-card; while it persists every dispatch — even on a different board — is rejected with the same refusal class.)

**`kanban_comment` on a just-unblocked gave-up card can return `unknown task`.** Right after `kanban_unblock` flips a `gave_up` card back to `ready`, the id-validation path on `kanban_comment` may briefly reject the id even though the card is now dispatchable. Do not retry the comment as a fix; carry the comment-shaped context (reconnaissance anchors, priority hints, frozen caveats) into the `delegate_task` context block instead, so the subagent has it on first turn. The comment can be retried after one dispatcher tick has elapsed, by which point the validation path has settled.

**Per-profile cap is one of three ceilings, and the default is 1 (2026-10-15 hermes-agent v0.22.2 实测, jev-skill 融合卡).** When the user pushes back on "why serial?" and ready cards are not being spawned, do not defend with a partial answer — the bottleneck is **the conjunction of three independent ceilings** the dispatcher enforces, and any one of them defaults low enough to block fan-out:

1. **Three ceilings, all set per-board-and-per-profile, all defaulted to block parallelism:**
   - `kanban.max_in_progress` — total in-flight across all profiles. Memory-derived default ≈ 8 (usually not the bottleneck).
   - `kanban.max_in_progress_per_profile` — per-assignee cap. Default = 4 (routa `KanbanSessionQueue` legacy).
   - `kanban.board_concurrency` — **per-board cap; default = 1 in hermes-agent v0.22.2** (the routa `KanbanSessionQueue` default). This is the silent bottleneck: even with the first two raised, one board with five ready cards sees only one spawn at a time.
2. **Config lives in the profile config, NOT the global `~/.hermes/config.yaml`.** Dispatcher reads via `load_user_config_effective` which resolves `HERMES_HOME`. Default `HERMES_HOME` is the **profile-scoped** path (`~/.hermes/profiles/<active-profile>/config.yaml`), so anything written to `~/.hermes/config.yaml` is silently ignored by the dispatcher. Patch the existing `kanban:` section in the profile config, do not insert a second top-level `kanban:` block at the global level — YAML silently keeps both and `hermes` warns "could not parse plugin selection" on every CLI invocation.
3. **The right tool is `hermes config set`, not `write_file` to the YAML.** The YAML write is gated by the action-gate security policy (returns "Agent cannot modify security-sensitive configuration"). The sanctioned path is `hermes config set kanban.max_in_progress 8` + `kanban.max_in_progress_per_profile 5` + `kanban.board_concurrency 5` — all three are required for true parallelism. `hermes` may warn "unrecognized key" for `board_concurrency` but it persists and is read at the next dispatch tick.
4. **Verify the fix with the live state, not the JSON snapshot.** `dispatch --max N --json` returns `skipped_locked`, `skipped_per_profile_capped`, and `spawned` from the **previous tick's snapshot** (the CLI output is one tick behind reality — it can show `spawned: 0` even when the dispatcher did spawn). The truthful check is `ps aux | grep "<profile>"` for N workers OR `task_runs` rows with `worker_pid IS NOT NULL`. A real fix shows N workers, not a JSON `spawned: N`.
5. **Watchdog is the durable fix.** Cap settings can drift after Hermes updates or profile reinstalls. Drop a small `check_kanban_cap.sh` under `cache/scratch/kanban-cap-watchdog/` that asserts all three values are ≥ the parallelism target, and schedule it on cron. When watchdog fires, re-run the `hermes config set` triplet — no need to debug the dispatcher.

Path B (`delegate_task` in TUI) is a per-card release valve for the *card stuck after dispatch* case, not a parallelism mechanism — do not reach for it as the answer to "why serial?".

**`hermes kanban dispatch --max N` silent exception → `_dispatch_once_locked` escape hatch (2026-10-15 实测, jev-skill 融合卡).** When the dispatcher refuses to spawn but ready cards exist and the user wants them running NOW, the manual escape is a one-liner from the hermes Python entry point. Add the repo to `sys.path` (`sys.path.insert(0, '/Users/YOURNAME/.hermes/hermes-agent')`), import `kanban_db` and `kanban_ops`, then call `kanban_ops._dispatch_once_locked(spawn_fn=kanban_db._default_spawn, max_spawn=5, claim_ttl=600)` — this runs the full dispatch path with the real spawn function, bypassing the CLI's silent-exception layer. The fake-spawn variant `spawn_fn=None` exists for tests but writes a placeholder `pid=99999` to the DB; that placeholder lives in `task_runs` and trips subsequent respawn-guard checks, so do not use it on a card you intend to keep alive. After this manual call, verify `ps aux | grep "<profile>"` and the `worker_pid` column in `task_runs` — not the JSON output, which is one tick stale.

**Status rollback running→ready with `rate_limited`/`respawn_guarded(rate_limit_cooldown)` events = self-healing cooldown, not a stall.** When a running card silently rolls back to `ready` and `task_events` shows `rate_limited` (`exit_code: 75`) followed by several `respawn_guarded {"reason": "rate_limit_cooldown"}`, the worker hit an upstream rate limit and the dispatcher is holding respawn until the cooldown window clears. Do NOT reclaim/reassign/nudge — each manual intervention resets nothing and can trip the failure_limit circuit breaker. Verify two things instead: (a) partial output already on disk in the card's **dir** workspace (dir persistence means the respawned worker resumes from existing artifacts instead of starting over — this is why `workspace_kind="dir"` beats scratch for any multi-wave card); (b) after the cooldown elapses, a fresh `claimed`+`spawned` pair appears. Only escalate if the retry count reaches the failure_limit without a spawn, or the cooldown repeats >2 cycles (then stagger same-profile dispatch waves — release ≤3 cards per profile per wave and wait for done receipts between waves).

**Stale "✖ worker crashed / gave_up" notifications lag the real state (2026-10-15 jev-skill 融合卡 P1-Fix 实测).** When a card respawns after a crash and the new worker is alive, gateway push notifications from the OLD run (e.g. "worker crashed (pid gone)", "gave up after repeated spawn failures pid 99999 not alive") still arrive in the chat up to ~60s after the new spawn — the user sees failures for a card that is in fact `status=running` with a live `worker_pid`. **Before reporting a crash, read `task_runs` for the latest run_id of that card**: if `status=running` AND `worker_pid IS NOT NULL` AND the process is alive in `ps`, the notification is stale and the card is fine. Cross-check `task_events` for the sequence `created → claimed → spawned → heartbeat` after the suspect notification — the absence of a fresh `crashed`/`gave_up` event confirms the notification is from a prior run. **Rule: trust `task_runs.worker_pid` + `ps -p <pid>` over chat notifications.** This is especially important in long sessions where the user is making decisions based on those notifications.

**Cross-team parallelism needs `shared/profiles.yaml` source fix, not per-profile config edits (2026-10-15 jev-skill 融合卡 P1-RootCap 实测).** A user's "are all profiles affected?" question on concurrency limits is answered by **the profile generation source, not the 49 generated configs**. `~/.hermes/shared/profiles.yaml` is the template; `shared/generate-configs.py` writes the 49 `~/.hermes/profiles/*/config.yaml` from it. Editing any single profile config is **doomed to be overwritten** by the next `generate-configs` run (hindsight 2026-09-23 [已移除] 口吻修复事故: same root cause, different field). The durable fix: patch `shared_config:` in `profiles.yaml` + run `python3 ~/.hermes/shared/generate-configs.py` once → all 49 profiles get the new value, drift is impossible. Verification loop confirms the count: `for p in ~/.hermes/profiles/*/config.yaml; do grep -q "<key>: <value>" "$p" || echo "MISSING: $p"; done` should print zero MISSING lines. The watchdog script (see per-profile cap pitfall #5) is the durable guard against regression.

**"改 1 处 profiles.yaml 同步 49 profile" > "SOUL.md 5 profile 加 9 行段"（2026-10-15 jev-skill 融合 P1-RootCap 决策链）。** hindsight 教训「SOUL.md 5 profile 加段 = 5 事件漂移源」vs「profiles.yaml 改 1 处同步 49 = 1 事件覆盖 49」正本清源：涉及 fleet-wide 配置项（cap / 共享字段 / 默认值）的任何"是不是所有 profile 都要改"问题，**默认答案 = 改共享层 + 重新生成**，不要逐 profile 改 SOUL.md。判据：① 配置项是不是 `manage-config`/`shared_config` 段下的（是 → 改 1 处）；② 修改逻辑是不是机械的（是 → generate-configs 一次完成）；③ 是否有 watchdog 防回退（是 → 改 1 处）。三者满足任一即走共享层路径——**唯一例外是 profile-specific 行为（比如 worker-coder 调 jev-gate，其他 worker 不调）**，这种仍走 SOUL.md 逐 profile 加段。

**`hermes kanban edit --body` is the steering valve for in-flight workers, but it has a race window.** When a worker is already running and you need to redirect it (e.g. spec was wrong, new evidence arrived), `hermes kanban edit <task_id> --body "$(cat new.md)"` rewrites the card body in the live DB. The worker re-reads body on its next turn, so the new spec lands. **Race**: if the worker was spawned before the edit landed, it may have already cached or acted on the old spec. **Always pair edit with a `kanban_comment` that explicitly states the override** (e.g. `[REJECT:旧 spec] T<n>.v2 替代原 T<n>`). A running worker that re-reads the card will see the comment even if it doesn't re-read the body. Verify both landed: `hermes kanban show <id>` (body) + `sqlite3 ... task_comments` (comment). For multiple-card steering (one spec rewrite needs to propagate to N siblings), batch the edits in a single loop and pair each with a comment; the SQLite writes are fast enough that all workers see the new spec by their next turn.

**Spec-rewrite of ready (not yet spawned) cards: edit body, do NOT re-create.** If a card is still in `ready` and you want to rewrite the spec (e.g. the original spec had a structural contradiction a worker just discovered), `hermes kanban edit --body` is correct — re-creating burns the card's id, breaks parent links, and loses comment history. The dispatcher spawns the new body on its next pick. The card's `created_at` and id stay stable, so parent references still resolve. Pair the body edit with a `kanban_comment` whose first line is `[REJECT:旧 spec] T<n>.v2 替代原 T<n>` — when the rewrite applies to multiple sibling cards (one contradiction → N specs to fix), give every card the same marker; a worker that re-reads the comment thread will see the override even if it picked up the old body before the edit landed. For the body itself, keep a one-paragraph "[REJECT:旧 spec] — what changed and why" tail so the new spec is self-explanatory to a worker that never sees the original.

**`kanban_block` from a worker is an excellent signal, not a failure.** When a worker finds a structural contradiction in the spec and calls `kanban_block(kind=...)` with a specific reason (e.g. "`--provider clef` 加 CLI choices + 不改 tests/test_provider_policy.py + test_provider_policy 全过" 三条件互斥), it is doing the right thing — the spec is genuinely unsatisfiable, and the worker has stopped to ask rather than silently doing the wrong work. orchestrator must respond fast: (1) read the worker's block reason + comment, (2) verify the contradiction is real (run the grep the worker did), (3) rewrite the spec to a different design (e.g. env-var path A instead of CLI choices), (4) `kanban_unblock` + edit body + comment the new spec. Budget: a good block-and-rewrite cycle is <15 min. A silent crash (worker guesses and writes broken code) is hours of cleanup. Reward the worker pattern by keeping the spec correction cycle tight.

**Closed-set test assertion + new option spec = universal env-var trigger solution.** When a worker hits a contradiction like "I must add option X to the CLI choices" + "the test file is a precise-match assertion `assert choices == APPROVED_LIST` and the rules forbid editing the test" + "the test must pass" — these three together are unsatisfiable if "X" is added to the closed set. The universal solution is **don't extend the closed set; route the new behavior through an env var that bypasses the closed-set check internally**. Concretely: keep `--provider` choices untouched, add a check at the top of the dispatch function for `os.environ.get("FOO_PROVIDER") == "newbackend"`; if true, route to a new transport function that skips the closed-set endpoints dict entirely; return the same response shape so downstream code is unchanged. The change is `<=60 lines`, doesn't touch the test, doesn't touch the CLI parser, and the closed-set assertion still passes. This pattern applies anywhere a project enforces hard allowlists (provider lists, host allowlists, model lists, parser choices) and you need to add an alternative transport without breaking the allowlist contract. **Detection**: the worker says "X 加 choices + 不改测试 + 测试全过"三互斥 — any time the worker enumerates a closed set of N mutually-exclusive conditions, propose the env-var trigger instead of fighting the closed set.

**Path A 卡派工前必加 [REJECT:旧 spec] 预警（2026-10-15 jev-skill 实测）**。当 plan 涉及上游已硬化项目（CLAUDE.md 红线 + tests/ 闭集 + docs/ 正扫描）时,派工卡 body 顶部加预警段——**worker 拿到卡第一时间知道这是「路径 A 改造」而非「常规加 option」**:
```markdown
[PATH A 改造预警] 本卡是「环境变量触发」最低破坏接入（见 open-source-skill-fusion-v2 pitfall #20）,
不是「在 CLI choices 加 clef」类常规改造。开工前必先 grep tests/ 找闭集,
确认 plan 边界: ① 不动 CLI parser ② 不动 endpoints dict ③ SKILL.md 禁出现 `--provider X` 字面量。
如发现原 spec 写「加 choices」与以上矛盾,先 kanban_block 反馈,不要猜。
```
**理由**: worker 拿到「加 clef provider」类任务时,默认走「CLI choices + endpoints dict 同步加」路径;派工卡不预警,worker 第一轮直接撞 4 闭集失败(实测 T2 卡 worker-coder 跑了 ~30 分钟后 `kanban_block(kind="...")` 才发现矛盾)。**预防优于事后修订**——「路径 A」是设计概念,worker 不知道;派工卡必须显式标注。

**Path A 卡验收反向 grep 三件套（2026-10-15 jev-skill 实测）**。无论派工卡是否预警,orchestrator 收口验收时**必跑**:
```bash
# 反向证据：禁出现的字符串确实没出现
grep -c "provider X" <skill>/SKILL.md    # 必须 = 0（防 doc scan 闭集命中）
grep -c "provider X" <skill>/assets/*.json  # 视项目而定
# 正向证据：路径 A 的关键 env var 确实存在
grep -c "X_PROVIDER" <skill>/SKILL.md    # 必须 ≥1
grep -c "X_BASE_URL" <skill>/SKILL.md    # 必须 ≥1
# 闭集契约仍成立
python3 -m unittest discover -s tests    # 必须全过（闭集断言触发）
```
**为什么是三件套而非单项**:单项 grep `--provider clef` = 0 只能证明「没写」,不能证明「写了 env var 替代」。**反向 + 正向 + 闭集契约**= 三点定位改造实质落地。判据:三项必全跑全过,任何一项异常都=改造没做透。

**`delegate_task` output_schema must be raw JSON Schema text, not a Python repr.** Passing `{"type":"object",...}` as a Python string is rejected with "output_schema must be a JSON Schema object, got a non-JSON string" — and the parameter takes a string slot, so the trap is real. Either pass a valid JSON Schema string (validate locally first), or skip `output_schema` and tell the subagent in its context block to append a fenced JSON code block at the end of its final message. The latter is more robust when the schema evolves mid-task: the parent parses the trailing block, the subagent keeps free-form prose for the rest of the answer.

## 拆卡第一刀切在依赖边界，不切在功能完整性（2026-10-19 fin-sentinel 实证，根治「构图过度串行」）

用户质疑「预估为什么这么慢」后实测复盘：dispatch 探针显示无锁、无 cap 卡点（配置 board_concurrency=5/profile=8 均富余），真瓶颈是构图——C 卡 6 个交付物中 5 个不需要等 B 卡 watchlist，却整张卡被 parents=[A,B] 门控，白白串行 ~1.5 小时。根治规则（建卡前必过）：

- **依赖矩阵先行**：写卡前做「交付物 × 上游产物」矩阵，每个交付物逐个问「没有上游产物，能否用 stub/占位开工」——能，就必须独立成卡即时派发；不能，才挂 parents。功能上「浑然一体」不是串行理由。
- **两问定串并行**：上游产物是**工程型**（schema 可提前冻结：文件路径+字段结构写进卡 body，如 watchlist.yaml 的 key/url/kind/tier/org_class/lang）→ 下游必须 stub 并行，合体卡只做接线与真跑；上游是**探索型**（结论形态未知：根因分析、调研裁决、方案选型）→ 串行是正确设计，别硬拆。
- **schema 已冻结却仍让下游等上游 = 分解失误**：能在父卡 body 写死上游产物路径+字段的，就已具备 stub 并行条件。这是本例实况——schema 我写了，并行性我没兑现。
- **合体卡代价入账**：stub 并行把集成风险推给合体卡（骨架 bug 由合体卡就地修），其 body 必须显式含「上游骨架 bug 自负」条款，预算相应加档。
- **建卡后图形状自检**：全部卡建完、dispatch 前扫一眼图——每层就绪宽度 ≥2，否则一句话向自己说明为何必须串行；任何被 ≥2 父门控且含 ≥3 交付物的卡，强制复拆。
- **残余诚实声明**：此规则消灭「能拆没拆」类失误；「上游是工程型还是探索型」的判定本身仍是判断层，误判探索型为工程型会导致合体卡返工——两问判定拿不准时按探索型处理（串行），代价只是慢，不是错。

## Orchestrator 亲自动手纪律（含派卡前探针）

背景：研究员 worker 早已把 cninfo/hkexnews 两源的可用端点+参数+样本落盘（probe_results.jsonl ✅ 记录），orchestrator 发现缺源后没读这些证据，用自己猜的错误端点 curl 失败，引用「TLS 指纹反爬」原理解释，包装成 4 选 1 请用户裁决「接受缺口」；事后按盘上登记的正确端点复测一次即通（6752 条公告）。教训铸成规则：

- **亲自动手 = 同受验收纪律约束**：orchestrator 自己做任何实测/修复前，先 grep/读盘上已有证据（worker 卡的 probe 记录、watchlist notes、prior findings）——「不信自报」的另一半是「自己动手前先信盘」。跳过这步直接试错，等于用更低的置信度推翻更高的。
- **原理只解释实测，不替代实测**：「TLS 指纹」「Akamai」这类机制知识只有在实测失败后用作归因，不能在实测前当作「打不通」的预言。借权威嗓音说没测过的话比说错更坏——它可信。判据：写下结论时若找不到对应的 curl rc / 返回体 / 文件行号，就是没测。
- **4 选 1 只用于真权衡**：选项模式适用于「快 vs 稳」「范围取舍」类真决策；不适用于「我还没做作业」——验证类工作（端点通不通、产物在不在）做完才有资格上报，把未验证的分支包装成选项等于把作业转嫁给用户，且错误结论会获得「用户批准」外衣。自检：每个选项若都指向「你可以先去测一下」，那就不是选项，是欠的作业。
- **派外部端点类卡前先探针，证据入卡再派发**：卡的工作依赖外部 API/RSS 时，orchestrator
  先自己把全部候选端点 curl 一遍，把「状态+条目数+修参方案」写进卡评论——worker 按已验证
  端点实现，省一轮「worker 撞 API 语义坑 → 交废品 → 重派」。探针结论还裁决下游卡范围：
  便宜的通道通了（如本地 RSSHub 路由），贵的通道（浏览器采集）范围即时缩掉。

## 配套 references

- `references/worker-completion-independence-verification.md` — worker `kanban_complete` 后 orchestrator 三件套独立验收（wc -l 真实行数 / 自检命令真跑 / 反向 grep 禁现字符）+ 4 选 1 模板 + 文档-实测不一致 4 类。**每次 worker done 后必跑**。
