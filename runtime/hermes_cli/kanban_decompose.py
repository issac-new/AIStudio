"""Kanban decomposer — fan a triage task out into a graph of child tasks.

Invoked by ``hermes kanban decompose [task_id | --all]`` and the gateway
dispatcher's auto-decompose path. Reads the profile roster (with
descriptions), asks the auxiliary LLM for a task graph in JSON, then
atomically creates the children, links them under the root, and flips the
root ``triage -> todo``. The root stays alive as parent of every leaf child so
it wakes back up when the graph completes and its assignee (the orchestrator
profile) can judge completion and add more work.

Mirrors ``kanban_specify`` (lazy aux import, lenient parse, never raises on
expected failures). ``fanout=false`` collapses to the ``specify`` behaviour
(tighten + promote, no children), making ``decompose`` a strict superset.
Unknown assignees are rewritten to ``default_assignee`` — a child NEVER ends
up with ``assignee=None``.

OVERLAY DELTA (team-parallel phase 3, 2026-10-09): parallel granularity
enforcement per ``overlay/docs/superpowers/specs/2026-10-09-parallel-capability-foundation-spec.md``
§3 — every child carries ``estimate_days`` (person-days, 0.25–1.0 enforced);
oversized children (>1 person-day) trigger ONE re-plan round with explicit
feedback, then clamp-with-audit as last resort; estimates persist via
``kanban_db.set_estimate`` so dispatch-time workload ordering
(``_reorder_ready_by_workload``) sees them immediately. Base: upstream
hermes-agent ``hermes_cli/kanban_decompose.py`` (v0.7.3x era); upgrade rounds
re-apply this delta via migrate-patches.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

from hermes_cli import kanban_db as kb
from hermes_cli.kanban_db_graph import decompose_triage_task
from hermes_cli import kanban_db_connect as kbc
from hermes_cli import profiles as profiles_mod
from hermes_cli.kanban_specify import (
    _call_aux, _extract_json_blob, _load_triage_task, _task_prompt_fields, _title_body,
)
from hermes_cli.kanban_specify import _profile_author as _specify_author

logger = logging.getLogger(__name__)


_SYSTEM_PROMPT = """You are the Kanban decomposer for the Hermes Agent board.

A user dropped a rough idea into the Triage column. Your job is to break it
into a small graph of concrete child tasks and route each one to the best-
matching profile from the available roster.

You will be given:
  - The original task title and body
  - The list of available profiles (each with name + description)
  - The fallback "default_assignee" used when no profile fits

Output a single JSON object with this exact shape:

  {
    "fanout": true,
    "rationale": "<one sentence on why this decomposition>",
    "tasks": [
      {
        "title": "<concrete task title, imperative voice, <= 80 chars>",
        "body":  "<detailed spec for the worker on this child task>",
        "assignee": "<profile name from the roster, or null for default>",
        "parents": [<int>, ...],
        "estimate_days": <number>
      },
      ...
    ]
  }

Rules:
  - "parents" is a list of INDICES (0-based) into this same "tasks" list,
    expressing actual data dependencies. Tasks with no parents run in
    PARALLEL. Tasks with parents wait until every parent completes.
  - Prefer parallelism. If two tasks can be done independently, give them
    no parents so the dispatcher fans them out at once.
  - Use 2-6 tasks for normal work. Don't create 20 tiny tasks. Don't
    cram everything into 1 task.
  - PARALLEL GRANULARITY: every child MUST be small enough for ONE worker
    in at most 1 person-day. Set "estimate_days" between 0.25 and 1.0
    (0.25 = a quarter day, 0.5 = half a day, 1.0 = a full day). If a piece
    of work needs MORE than 1 person-day, SPLIT it into multiple smaller
    sibling tasks with honest dependencies instead of one big task.
  - Pick assignees from the roster by matching the task to the profile's
    DESCRIPTION (not just the name). When nothing matches well, use null
    and the system will route to the default_assignee.
  - Each child task body is what a fresh worker will read with no other
    context — be specific about goal, approach, and acceptance criteria.

When the task is genuinely a single unit of work (no useful decomposition),
return:

  {
    "fanout": false,
    "rationale": "<one sentence>",
    "title": "<tightened title>",
    "body":  "<concrete spec for a single worker>",
    "assignee": "<profile name from the roster, or null for default>",
    "estimate_days": <number>
  }

In that case the task stays as one work item, just with a tightened spec and
a concrete assignee. If no profile fits, use null and the system will route
to the default_assignee.

No preamble, no closing remarks, no code fences. Output only the JSON object.
"""


_USER_TEMPLATE = """Task id: {task_id}
Title: {title}
Body:
{body}

Available profiles (assignees you may pick from):
{roster}

Default assignee (used when no profile fits a task): {default_assignee}"""

_REPLAN_TEMPLATE = """

RE-PLAN REQUIRED (parallel granularity): your previous plan gave tasks
{oversize_idx} estimates above 1 person-day. Produce a NEW plan in which EVERY
task is at most 1 person-day ("estimate_days" 0.25–1.0): split the oversized
tasks into smaller siblings, keep dependencies honest (parents indices), and
keep the rest of the plan. Same output format as before."""


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

# Parallel granularity envelope (spec §3: children are fan-out units of
# <=1 person-day; hard clamp bounds keep malformed LLM numbers harmless).
_ESTIMATE_MIN = 0.25
_ESTIMATE_MAX = 2.0
_ESTIMATE_CAP = 1.0
_ESTIMATE_DEFAULT = 1.0


@dataclass
class DecomposeOutcome:
    """Result of decomposing a single triage task."""

    task_id: str
    ok: bool
    reason: str = ""
    fanout: bool = False
    child_ids: list[str] | None = None
    new_title: Optional[str] = None
    clamped: int = 0  # children force-clamped down to the 1-person-day cap


def _profile_author() -> str:
    """Mirror of ``hermes_cli.kanban._profile_author``."""
    return _specify_author("decomposer")


def _resolve_profile_from_cfg(cfg: dict, key: str, *, fallback: Optional[str] = None) -> str:
    """``kanban.<key>`` if it names an existing profile, else ``fallback``
    (the root task's own assignee) if that does, else the active default
    profile — so a task is never stranded for lack of an owner.
    ``orchestrator_profile`` owns the root after fan-out; ``default_assignee``
    catches children the decomposer can't route.

    The root's assignee sits before the active profile because the decomposer
    runs inside whatever profile hosts the dispatcher — an operator's
    credential-less incognito profile, say — and that profile must never
    silently become the owner of work the card was assigned away from (#114294).
    """
    kanban_cfg = cfg.get("kanban", {}) if isinstance(cfg, dict) else {}
    explicit = (kanban_cfg.get(key) or "").strip()
    for candidate in (explicit, (fallback or "").strip()):
        if candidate:
            try:
                if profiles_mod.profile_exists(candidate):
                    return candidate
            except Exception:
                pass
    try:
        return profiles_mod.get_active_profile_name() or "default"
    except Exception:
        return "default"


def _build_roster() -> tuple[list[dict], set[str]]:
    """``(roster_for_prompt, valid_assignee_names)``; entries are
    ``{name, description, has_description}``."""
    try:
        all_profiles = profiles_mod.list_profiles()
    except Exception as exc:
        logger.warning("decompose: failed to list profiles: %s", exc)
        return [], set()
    roster = []
    for p in all_profiles:
        desc = (p.description or "").strip()
        roster.append({
            "name": p.name,
            "description": desc or f"(no description; profile named {p.name!r})",
            "has_description": bool(desc),
        })
    return roster, {p.name for p in all_profiles}


def _format_roster(roster: list[dict]) -> str:
    if not roster:
        return "  (no profiles installed — decomposer cannot route work)"
    return "\n".join(
        f"  - {entry['name']}{'' if entry['has_description'] else ' ⚠ undescribed'}: {entry['description']}"
        for entry in roster
    )


def _normalize_assignee_choice(assignee: object, *, default_assignee: str, valid_names: set[str]) -> str:
    """A valid assignee, else ``default_assignee`` — promoted work is never
    left unassigned."""
    if not isinstance(assignee, str) or not assignee.strip():
        return default_assignee
    chosen = assignee.strip()
    return chosen if chosen in valid_names else default_assignee


def _normalize_estimate(value: object) -> tuple[float, bool]:
    """``(days, over_cap)`` — coerce an LLM-supplied estimate into the
    ``[_ESTIMATE_MIN, _ESTIMATE_MAX]`` envelope. Non-numeric/nonsense falls
    back to a conservative 1.0 (same default the workload reorder uses for
    unestimated tasks). ``over_cap`` flags entries above the 1-person-day
    parallel cap (pre-clamp) so the caller can trigger the re-plan round."""
    try:
        days = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return _ESTIMATE_DEFAULT, False
    if days <= 0 or days != days:  # negative or NaN
        return _ESTIMATE_DEFAULT, False
    clamped = min(max(days, _ESTIMATE_MIN), _ESTIMATE_MAX)
    return round(clamped, 2), days > _ESTIMATE_CAP


@dataclass
class _Routing:
    """Config-derived routing context for one decomposition."""

    orchestrator: str
    default_assignee: str
    auto_promote: bool
    roster: list[dict]
    valid_names: set[str]


def _load_routing(*, root_assignee: Optional[str] = None) -> _Routing:
    from hermes_cli.config import load_config_readonly
    try:
        cfg = load_config_readonly()
    except Exception:  # decompose_task promises ok=False, never a raise, on config trouble
        cfg = {}
    kanban_cfg = cfg.get("kanban", {}) if isinstance(cfg, dict) else {}
    roster, valid_names = _build_roster()
    return _Routing(
        orchestrator=_resolve_profile_from_cfg(cfg, "orchestrator_profile", fallback=root_assignee),
        default_assignee=_resolve_profile_from_cfg(cfg, "default_assignee", fallback=root_assignee),
        auto_promote=bool(kanban_cfg.get("auto_promote_children", True)),
        roster=roster,
        valid_names=valid_names,
    )


def _apply_single(task: kb.Task, parsed: dict, routing: _Routing, author: str) -> DecomposeOutcome:
    """``fanout=false``: single-task spec promotion (same effect as specify)."""
    title_val, body_val = _title_body(parsed)
    assignee_val = None
    if not task.assignee:
        assignee_val = _normalize_assignee_choice(
            parsed.get("assignee"), default_assignee=routing.default_assignee, valid_names=routing.valid_names,
        )
    if title_val is None and body_val is None:
        return DecomposeOutcome(task.id, False, "decomposer returned fanout=false with no title/body")
    with kbc.connect_closing() as conn:
        ok = kb.specify_triage_task(
            conn, task.id, title=title_val, body=body_val, assignee=assignee_val, author=author,
        )
        days, _ = _normalize_estimate(parsed.get("estimate_days"))
        try:
            kb.set_estimate(conn, task.id, days, {"source": "decompose"})
        except Exception:  # estimate is advisory metadata; never block promotion on it
            logger.warning("decompose: estimate persist failed for %s", task.id, exc_info=True)
    if not ok:
        return DecomposeOutcome(task.id, False, "task moved out of triage before promotion")
    return DecomposeOutcome(task.id, True, "single task (no fanout)", fanout=False, new_title=title_val)


def _clean_children(task_id: str, raw_tasks: list, routing: _Routing) -> tuple[list[dict], str]:
    """Validate/normalise the LLM's ``tasks`` list; ``(children, "")`` or ``([], reason)``.
    Unknown assignees route to the default; never assignee=None."""
    children: list[dict] = []
    for idx, entry in enumerate(raw_tasks):
        if not isinstance(entry, dict):
            return [], f"tasks[{idx}] is not an object"
        title = entry.get("title")
        if not isinstance(title, str) or not title.strip():
            return [], f"tasks[{idx}].title is missing or empty"
        body = entry.get("body")
        assignee = entry.get("assignee")
        chosen = _normalize_assignee_choice(
            assignee, default_assignee=routing.default_assignee, valid_names=routing.valid_names,
        )
        if isinstance(assignee, str) and assignee.strip() and assignee.strip() not in routing.valid_names:
            logger.info(
                "decompose: task %s child %d picked unknown assignee %r — "
                "routing to default_assignee %r",
                task_id, idx, assignee, routing.default_assignee,
            )
        parents = entry.get("parents") or []
        if not isinstance(parents, list):
            parents = []
        days, over_cap = _normalize_estimate(entry.get("estimate_days"))
        if over_cap:
            logger.info(
                "decompose: task %s child %d estimate %r over 1-person-day cap — re-plan round pending",
                task_id, idx, entry.get("estimate_days"),
            )
        children.append({
            "title": title.strip()[:200],
            "body": body.strip() if isinstance(body, str) else "",
            "assignee": chosen,
            # Drop non-int, out-of-range and self parent indices.
            "parents": [p for p in parents if isinstance(p, int) and 0 <= p < len(raw_tasks) and p != idx],
            "estimate_days": days,
            "over_cap": over_cap,
        })
    return children, ""


def _oversize_feedback(children: list[dict]) -> str:
    idxs = ", ".join(str(i) for i, c in enumerate(children) if c.get("over_cap"))
    return _REPLAN_TEMPLATE.format(oversize_idx=idxs or "several")


def _persist_child_estimates(task_id: str, child_ids: list[str], children: list[dict]) -> int:
    """Write each child's estimate (own txn each, mirrors ``--persist`` path;
    every set emits an ``estimate_set`` audit event). Returns how many were
    force-clamped to the cap after the re-plan round."""
    clamped = 0
    with kbc.connect_closing() as conn:
        for cid, child in zip(child_ids, children):
            days = child["estimate_days"]
            if child.get("over_cap"):
                days = _ESTIMATE_CAP
                clamped += 1
            try:
                kb.set_estimate(conn, cid, days, {"source": "decompose", "graph_root": task_id})
            except Exception:
                logger.warning("decompose: estimate persist failed for child %s", cid, exc_info=True)
    return clamped


def _apply_fanout(task_id: str, parsed: dict, routing: _Routing, author: str) -> DecomposeOutcome:
    raw_tasks = parsed.get("tasks") or []
    if not isinstance(raw_tasks, list) or not raw_tasks:
        return DecomposeOutcome(task_id, False, "decomposer returned fanout=true with empty tasks list")
    children, reason = _clean_children(task_id, raw_tasks, routing)
    if reason:
        return DecomposeOutcome(task_id, False, reason)
    try:
        with kbc.connect_closing() as conn:
            child_ids = decompose_triage_task(
                conn,
                task_id,
                root_assignee=routing.orchestrator,
                children=children,
                author=author,
                auto_promote=routing.auto_promote,
            )
    except ValueError as exc:
        return DecomposeOutcome(task_id, False, f"DB rejected graph: {exc}")
    except Exception as exc:
        logger.exception("decompose: DB error on task %s", task_id)
        return DecomposeOutcome(task_id, False, f"DB error: {type(exc).__name__}")
    if child_ids is None:
        return DecomposeOutcome(task_id, False, "task already decomposed or moved out of triage")
    clamped = _persist_child_estimates(task_id, child_ids, children)
    note = f"decomposed into {len(child_ids)} children"
    if clamped:
        note += f" ({clamped} clamped to 1.0d after re-plan round)"
    return DecomposeOutcome(
        task_id, True, note, fanout=True, child_ids=child_ids, clamped=clamped,
    )


def _call_decompose_llm(
    task, routing: _Routing, *, feedback: str = "", timeout: Optional[int] = None,
) -> tuple[Optional[dict], Optional[str]]:
    """One aux round; ``feedback`` non-empty switches to the re-plan prompt."""
    raw, reason = _call_aux(
        "decompose", task.id, aux_task="kanban_decomposer", system=_SYSTEM_PROMPT,
        user=_USER_TEMPLATE.format(
            **_task_prompt_fields(task),
            roster=_format_roster(routing.roster),
            default_assignee=routing.default_assignee,
        ) + feedback,
        max_tokens=4000, timeout=timeout or 180, log=logger,
    )
    if raw is None:
        return None, reason
    parsed = _extract_json_blob(raw, _FENCE_RE)
    if parsed is None:
        return None, "LLM returned malformed JSON"
    return parsed, None


def decompose_task(
    task_id: str,
    *,
    author: Optional[str] = None,
    timeout: Optional[int] = None,
) -> DecomposeOutcome:
    """Decompose a triage task into a graph of child tasks. Expected failures
    (not in triage, no aux client, API error, malformed/empty reply) surface
    as ``ok=False``.

    Parallel granularity (overlay delta): when the first plan contains
    children over 1 person-day, ONE re-plan round runs with explicit
    feedback; if the re-plan still oversizes (or fails), those children are
    clamped to 1.0d with audit and the fan-out proceeds — dispatch weighting
    still sees honest totals via the estimate events."""
    task, reason = _load_triage_task(task_id)
    if task is None:
        return DecomposeOutcome(task_id, False, reason)

    routing = _load_routing(root_assignee=task.assignee)
    parsed, reason = _call_decompose_llm(task, routing, timeout=timeout)
    if parsed is None:
        return DecomposeOutcome(task_id, False, reason or "LLM returned malformed JSON")

    # Granularity re-plan round: at most one, only for fan-out plans with
    # over-cap children. The retry reuses the same prompt plus explicit
    # feedback naming the oversized tasks.
    if parsed.get("fanout"):
        raw_tasks = parsed.get("tasks") or []
        if isinstance(raw_tasks, list) and raw_tasks:
            children, _ = _clean_children(task_id, raw_tasks, routing)
            if children and any(c.get("over_cap") for c in children):
                logger.info(
                    "decompose: %s first plan oversize (%d over cap) — re-plan round",
                    task_id, sum(1 for c in children if c.get("over_cap")),
                )
                reparsed, r2 = _call_decompose_llm(
                    task, routing, feedback=_oversize_feedback(children), timeout=timeout,
                )
                if reparsed is not None and reparsed.get("fanout"):
                    rt = reparsed.get("tasks") or []
                    if isinstance(rt, list) and rt:
                        re_children, _ = _clean_children(task_id, rt, routing)
                        if re_children and not any(c.get("over_cap") for c in re_children):
                            parsed = reparsed  # re-plan landed inside the envelope
                        else:
                            logger.info(
                                "decompose: %s re-plan still oversize — clamping to 1.0d", task_id,
                            )

    audit_author = author or _profile_author()
    if not parsed.get("fanout"):
        return _apply_single(task, parsed, routing, audit_author)
    return _apply_fanout(task_id, parsed, routing, audit_author)


def list_triage_ids(*, tenant: Optional[str] = None) -> list[str]:
    """Return task ids currently in the triage column."""
    with kbc.connect_closing() as conn:
        rows = kb.list_tasks(conn, status="triage", tenant=tenant, limit=1000)
    return [row.id for row in rows]
