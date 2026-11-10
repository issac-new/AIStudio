"""Embedded kanban dispatcher: settings resolution and per-tick board work.

``GatewayKanbanWatchersMixin._kanban_dispatcher_watcher`` owns the loop,
the singleton lock and the health telemetry; everything that only needs the
``kanban_db`` module and the resolved settings lives here.
"""

from __future__ import annotations

import contextlib
import os
import sqlite3
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional

from gateway.kanban_watchers_common import _board_slugs, _positive_int_setting, logger


def _kbc():
    from hermes_cli import kanban_db_connect
    return kanban_db_connect


def _kbd():
    from hermes_cli import kanban_db_dispatch
    return kanban_db_dispatch

_CORRUPT_DB_MARKERS = ("file is not a database", "database disk image is malformed")


@dataclass
class _DispatcherSettings:
    """``kanban.*`` dispatch settings, read once at boot (restart to apply)."""

    interval: float
    max_spawn: Any
    max_in_progress: Optional[int]
    failure_limit: int
    stale_timeout_seconds: int
    reconcile_orphans: bool
    default_assignee: Optional[str]
    max_in_progress_per_profile: Optional[int]


def _resolve_dispatcher_settings(kanban_cfg: dict, kb: Any) -> _DispatcherSettings:
    """Parse and log the dispatcher settings in their established order."""
    try:
        interval = float(kanban_cfg.get("dispatch_interval_seconds", 60) or 60)
    except (ValueError, TypeError):
        logger.warning("kanban dispatcher: invalid dispatch_interval_seconds=%r, using default 60",
                       kanban_cfg.get("dispatch_interval_seconds"))
        interval = 60.0
    interval = max(interval, 1.0)  # sanity floor — tighter than this is a footgun

    max_spawn = kanban_cfg.get("max_spawn")
    if max_spawn is not None:
        logger.info("kanban dispatcher: max_spawn=%s", max_spawn)

    # Cap simultaneously running tasks so slow workers don't pile up and time
    # out. Explicit config wins; otherwise a memory-derived default (unbounded
    # fan-out swap-thrashes small hosts), or None where total memory can't be read.
    max_in_progress = _positive_int_setting(kanban_cfg, "max_in_progress")
    effective_max_in_progress = _kbd().resolve_max_in_progress(max_in_progress)
    if max_in_progress is None and effective_max_in_progress is not None:
        logger.info(
            "kanban dispatcher: kanban.max_in_progress unset; using "
            "memory-derived default max_in_progress=%d "
            "(set kanban.max_in_progress in config.yaml to override)",
            effective_max_in_progress,
        )

    raw_failure_limit = kanban_cfg.get("failure_limit", kb.DEFAULT_FAILURE_LIMIT)
    try:
        failure_limit = int(raw_failure_limit)
    except (TypeError, ValueError):
        logger.warning("kanban dispatcher: invalid kanban.failure_limit=%r; using default %d",
                       raw_failure_limit, kb.DEFAULT_FAILURE_LIMIT)
        failure_limit = kb.DEFAULT_FAILURE_LIMIT
    if failure_limit < 1:
        logger.warning("kanban dispatcher: kanban.failure_limit=%r is below 1; using default %d",
                       raw_failure_limit, kb.DEFAULT_FAILURE_LIMIT)
        failure_limit = kb.DEFAULT_FAILURE_LIMIT

    # 0 disables stale detection.
    raw_stale = kanban_cfg.get("dispatch_stale_timeout_seconds", 0)
    try:
        stale_timeout_seconds = int(raw_stale or 0)
    except (TypeError, ValueError):
        logger.warning("kanban dispatcher: invalid kanban.dispatch_stale_timeout_seconds=%r; "
                       "disabling stale detection", raw_stale)
        stale_timeout_seconds = 0

    # Fallback profile for tasks created without an assignee (e.g. via the
    # dashboard). Empty (the schema default) keeps skipping them.
    # When set, the dispatcher applies it to unassigned ready tasks instead of skipping them indefinitely
    # (#27145). Empty string (the schema default) means "no fallback, keep skipping" — backward-compatible
    # with existing installs.
    default_assignee = (kanban_cfg.get("default_assignee") or "").strip() or None
    if default_assignee:
        logger.info("kanban dispatcher: default_assignee=%r (unassigned ready tasks "
                    "will route to this profile)", default_assignee)

    return _DispatcherSettings(
        interval=interval,
        max_spawn=max_spawn,
        max_in_progress=effective_max_in_progress,
        failure_limit=failure_limit,
        stale_timeout_seconds=stale_timeout_seconds,
        # Requeue 'running' cards with broken claim bookkeeping (zombie-card
        # reconciliation); false keeps orphans frozen for manual forensics.
        reconcile_orphans=bool(kanban_cfg.get("reconcile_orphans", True)),
        default_assignee=default_assignee,
        # Per-profile concurrency cap: no single profile's local model / API
        # quota / browser pool gets overwhelmed by a fan-out.
        max_in_progress_per_profile=_positive_int_setting(kanban_cfg, "max_in_progress_per_profile"),
    )


class _KanbanDispatcher:
    """Per-tick board work for the embedded dispatcher (runs in worker threads).

    Boards are enumerated every tick so a board created mid-run is picked up
    without a restart. Corrupt-looking board DBs are quarantined per
    fingerprint and retried after ``CORRUPT_BOARD_RETRY_AFTER_SECONDS``:
    transient WAL/open races can look like "malformed" for one tick.
    """

    CORRUPT_BOARD_RETRY_AFTER_SECONDS = 300

    def __init__(self, kb: Any, settings: _DispatcherSettings) -> None:
        self.kb = kb
        self.settings = settings
        self.disabled_corrupt_boards: dict[str, tuple[tuple[str, int | None, int | None], float]] = {}

    def _board_slugs(self) -> list:
        return _board_slugs(self.kb)

    def board_db_fingerprint(self, slug: str) -> tuple[str, int | None, int | None]:
        from hermes_cli import kanban_db as _kb
        with _kb.pin_first_board_resolution():
            path = self.kb.kanban_db_path(slug)
        try:
            resolved = str(path.expanduser().resolve())
        except Exception:
            resolved = str(path)
        try:
            stat = path.stat()
        except OSError:
            return (resolved, None, None)
        return (resolved, stat.st_mtime_ns, stat.st_size)

    def is_corrupt_board_db_error(self, exc: Exception) -> bool:
        if isinstance(exc, _kbc().KanbanDbCorruptError):
            return True
        return isinstance(exc, sqlite3.DatabaseError) and any(m in str(exc).lower() for m in _CORRUPT_DB_MARKERS)

    def _quarantine_lifted(self, slug: str, fingerprint: tuple) -> bool:
        """Return False while *slug* stays quarantined; lift (and log) otherwise."""
        disabled_entry = self.disabled_corrupt_boards.get(slug)
        if disabled_entry is None:
            return True
        disabled_fingerprint, disabled_at = disabled_entry
        age = time.monotonic() - disabled_at
        if disabled_fingerprint == fingerprint and age < self.CORRUPT_BOARD_RETRY_AFTER_SECONDS:
            return False
        if disabled_fingerprint == fingerprint:
            logger.info("kanban dispatcher: board %s database fingerprint unchanged "
                        "after %.0fs quarantine; retrying dispatch", slug, age)
        else:
            logger.info("kanban dispatcher: board %s database changed; retrying dispatch", slug)
        self.disabled_corrupt_boards.pop(slug, None)
        return True

    def tick_once_for_board(self, slug: str) -> Optional[object]:
        """Run one dispatch_once for a specific board.

        The per-board DB is opened explicitly so boards never share a
        connection or claim across each other.
        """
        conn = None
        fingerprint = self.board_db_fingerprint(slug)
        if not self._quarantine_lifted(slug, fingerprint):
            return None
        kwargs = {k: v for k, v in asdict(self.settings).items() if k != "interval"}
        try:
            # No explicit init_db(): connect() runs the migration once per
            # process (see the matching note in the notifier collector).
            # Pin-first: the tick is machine flow — on a box whose env pins
            # HERMES_KANBAN_DB every enumerated slug must resolve to the pinned
            # file, or the dispatcher reads per-slug DBs nobody writes.
            from hermes_cli import kanban_db as _kb
            with _kb.pin_first_board_resolution():
                conn = _kbc().connect(board=slug)
                return _kbd().dispatch_once(conn, board=slug, **kwargs)
        except Exception as exc:
            if self.is_corrupt_board_db_error(exc):
                self.disabled_corrupt_boards[slug] = (fingerprint, time.monotonic())
                logger.error(
                    "kanban dispatcher: board %s database %s is not a valid "
                    "SQLite database; pausing dispatch for this board until "
                    "the file changes, the gateway restarts, or the "
                    "quarantine timer expires. Move or restore the file, "
                    "then run `hermes kanban init` if you need a fresh board.",
                    slug, fingerprint[0],
                )
                return None
            logger.exception("kanban dispatcher: tick failed on board %s", slug)
            return None
        finally:
            if conn is not None:
                with contextlib.suppress(Exception):
                    conn.close()

    def tick_once(self) -> list[tuple[str, Optional[object]]]:
        """Run one dispatch_once per board. Returns (slug, result) pairs."""
        results = [(slug, self.tick_once_for_board(slug)) for slug in self._board_slugs()]
        _record_tick(_log_spawn_results(results))
        return results

    def ready_nonempty(self) -> bool:
        """Is there a ready+assigned+unclaimed task on ANY board the dispatcher would spawn for?

        Control-plane lanes (e.g. ``orion-cc``) are pulled by terminals via
        ``claim_task`` and never spawnable — a queue full of those is
        "correctly idle", not "stuck". The review column is probed only when
        review dispatch is on (same gate as the dispatcher): a task waiting
        for a human reviewer is idle, not stuck.
        """
        kbd = _kbd()
        _review_probe = kbd.review_dispatch_enabled()
        from hermes_cli import kanban_db as _kb
        with _kb.pin_first_board_resolution():
            for slug in self._board_slugs():
                conn = None
                try:
                    conn = _kbc().connect(board=slug)
                    if kbd.has_spawnable_ready(conn) or (_review_probe and kbd.has_spawnable_review(conn)):
                        return True
                except Exception:
                    continue
                finally:
                    if conn is not None:
                        with contextlib.suppress(Exception):
                            conn.close()
        return False

    def auto_decompose_tick(self, auto_decompose_per_tick: int) -> int:
        """Auto-decompose up to N triage tasks across all boards into ready workgraphs.

        Runs before dispatch fans out; the per-tick cap keeps a bulk triage
        load from burst-spending the aux LLM. Returns the number decomposed.
        """
        try:
            from hermes_cli import kanban_decompose as _decomp
            from hermes_cli.kanban_db import scoped_current_board
        except Exception as exc:  # pragma: no cover
            logger.warning("kanban auto-decompose: import failed (%s); skipping", exc)
            return 0
        attempted = 0
        successes = 0
        # overlay[732] 项目暂停拦机器派单：存在 paused 项目时，paused 项目的
        # triage 卡本 tick 不进分解计数（按住新卡孵化面，不动已有卡面）。
        from hermes_cli.kanban_projects_pause import paused_project_ids
        paused_projects = paused_project_ids()
        from hermes_cli import kanban_db as _kb
        with _default_profile_secret_scope(), _kb.pin_first_board_resolution():
            for slug in self._board_slugs():
                if attempted >= auto_decompose_per_tick:
                    break
                # The decomposer connects with no board kwarg. Pin the board for this context only: an
                # env pin is process-wide, so for the whole aux-LLM call every gateway turn, kanban tool
                # and spawned subprocess that names no board would resolve this one instead.
                with scoped_current_board(slug):
                    try:
                        triage_ids = _decomp.list_triage_ids()
                    except Exception as exc:
                        logger.debug("kanban auto-decompose: list_triage_ids failed on board %s (%s)", slug, exc)
                        triage_ids = []
                    triage_ids = _filter_paused_triage(slug, triage_ids, paused_projects)
                    for tid in triage_ids:
                        if attempted >= auto_decompose_per_tick:
                            break
                        attempted += 1
                        successes += self._decompose_one(_decomp, slug, tid)
        return successes

    @staticmethod
    def _decompose_one(_decomp: Any, slug: str, tid: str) -> int:
        """Decompose one triage task; returns 1 on success, 0 otherwise."""
        try:
            outcome = _decomp.decompose_task(tid, author="auto-decomposer")
        except Exception:
            logger.exception("kanban auto-decompose: decompose_task crashed on %s", tid)
            return 0
        if not outcome.ok:
            # Common no-op reasons (no aux client) must not spam logs every tick.
            logger.debug("kanban auto-decompose [%s]: %s skipped: %s", slug, tid, outcome.reason)
            return 0
        if outcome.fanout and outcome.child_ids:
            logger.info("kanban auto-decompose [%s]: %s → %d children", slug, tid, len(outcome.child_ids))
        else:
            logger.info("kanban auto-decompose [%s]: %s → single task (no fanout)", slug, tid)
        return 1


def _filter_paused_triage(slug: str, triage_ids: list, paused_projects: frozenset) -> list:
    """732：从 triage 待分解清单中滤掉 paused 项目的卡。

    只在存在暂停项目且清单非空时才开连查库（其余情况零开销，行为与现状
    逐字节等价）；一句 ``SELECT id, project_id FROM tasks WHERE status='triage'``
    与 triage_ids 求交，比逐卡一查省。读库任何异常都按不过滤返回
    （fail-open：暂停判定故障不拖垮 auto-decompose 主链路）。"""
    if not paused_projects or not triage_ids:
        return triage_ids
    conn = None
    try:
        conn = _kbc().connect(board=slug)
        rows = conn.execute(
            "SELECT id, project_id FROM tasks WHERE status = 'triage'"
        ).fetchall()
    except Exception as exc:
        logger.debug(
            "kanban auto-decompose: paused-project filter failed on board %s (%s); dispatching unfiltered",
            slug, exc,
        )
        return triage_ids
    finally:
        if conn is not None:
            with contextlib.suppress(Exception):
                conn.close()
    paused_ids = {row["id"] for row in rows if row["project_id"] in paused_projects}
    if not paused_ids:
        return triage_ids
    kept = [tid for tid in triage_ids if tid not in paused_ids]
    logger.info(
        "kanban auto-decompose [%s]: %d triage task(s) held back by paused projects",
        slug, len(triage_ids) - len(kept),
    )
    return kept


@contextlib.contextmanager
def _default_profile_secret_scope():
    """Install the gateway launch profile's secret scope while multiplexing is on.

    The tick runs via ``_to_thread_process_service`` in a fresh context, so no
    per-turn scope exists and ``get_secret`` fails closed. The decomposer's aux
    LLM reads ``auxiliary.*`` from ``get_hermes_home()``, so its credentials come
    from that same home. No-op for single-profile gateways.
    """
    from agent.secret_scope import is_multiplex_active, reset_secret_scope, set_secret_scope
    from hermes_constants import get_hermes_home
    from tui_gateway.launch_profile_policy import owner_secret_scope

    if not is_multiplex_active():
        yield
        return
    token = set_secret_scope(owner_secret_scope(Path(get_hermes_home())), profile_home=str(get_hermes_home()))
    try:
        yield
    finally:
        reset_secret_scope(token)


def _log_spawn_results(results: Optional[list]) -> bool:
    """Log per-board spawn summaries; returns whether any board spawned."""
    any_spawned = False
    for slug, res in (results or []):
        if res is not None and getattr(res, "spawned", None):
            any_spawned = True
            # Quiet by default: an idle gateway stays silent.
            logger.info(
                "kanban dispatcher [%s]: spawned=%d reclaimed=%d "
                "crashed=%d timed_out=%d promoted=%d auto_blocked=%d",
                slug, len(res.spawned), res.reclaimed,
                len(res.crashed) if hasattr(res.crashed, "__len__") else 0,
                len(res.timed_out) if hasattr(res.timed_out, "__len__") else 0,
                res.promoted,
                len(res.auto_blocked) if hasattr(res.auto_blocked, "__len__") else 0,
            )
    return any_spawned


# ---------------------------------------------------------------------------
# 723（2026-11-01 run24 根治·诊断面）：0 spawn 但 ready 非空的拒绝原因显形。
#
# 触发背景（run24 铁证）：网关日志从 2026-11-01 01:25 起连续 196+ 个 tick 打出
#   "kanban dispatcher stuck: ready queue non-empty for 196 consecutive ticks but
#    0 workers spawned."
# 而这行既没有 "Last tick held back: ..." 后缀（describe_suppression() 为空），也没有
# 任何逐卡线索。复盘定谳（干跑复现）：spawn 被 _dispatch_lane_task 的
#   profile_exists(assignee) is False 分支整批拒掉，落进 DispatchResult.skipped_nonspawnable
# ——该桶既不在 describe_suppression 的计数里，_log_spawn_results 又在 spawned 为空时
# 完全静默，于是「拒绝原因」这条链路上三个出口全是黑的。
#
# 误设的配置项与期望值（run24 实证）：
#   * board.json（<kanban_home>/kanban/boards/<board>/board.json）的
#     `profiles` / `profile_scope` 团队表 —— patch 391 board-team-fence 的围栏来源，
#     spawn 路径按它 fail-closed 判否（cards 的 assignee 不在表内即 skipped_nonspawnable）。
#     run24: board `qi-test-pay` 团队表=['qi-tester','hu','lin','chen','xiao']，
#     而该板 ready 卡的 assignee 是子编制 'chen-csw-pay-core' / 'lin-csw-channel-alipay' /
#     'qi' —— 一个都不在表内，8 小时零 spawn。期望值：团队表必须覆盖派发面实际使用的
#     assignee 全名（子编制要逐条列出，不能只写基名 'chen'/'lin'），或整键删除以关闭围栏。
#   * 遥测口径（同因）：has_spawnable_ready()/has_spawnable_review() 调
#     _profile_exists_fn() 时不带 board（历史 fail-open 口径），所以「遥测说 ready 非空、
#     派发说全部不可 spawn」。本补丁不改这个口径（改口径=改行为），只把不一致喊出来。
#   * kanban.max_spawn / kanban.max_in_progress：可配成 <= 已在跑数量而让 tick 在
#     进入逐卡循环前就 return（这类零 spawn 连桶都不会有，本补丁记作 unattributed）。
#     期望值：两者为 null（不限）或 >= 当前 running 总数 + 1。
#
# 本补丁只显形，不改任何 spawn 行为：每 tick 把 DispatchResult 的拒绝桶聚合计数，
# stuck 期间每 300s 打一行 "spawn refusals by reason={...}"，并在每段 stuck 的
# 首次聚合额外打一行 actionable hint（点名上表的配置项与期望值）。
# ---------------------------------------------------------------------------

# 逐卡拒绝桶：值都是 task id 列表（skipped_per_profile_capped 是三元组，单独处理）。
_REFUSAL_ID_BUCKETS = ("skipped_unassigned", "skipped_nonspawnable", "auto_blocked", "rate_limited")


def _spawn_refusal_reasons(results: Optional[list]) -> dict[str, int]:
    """Aggregate one tick's per-reason refusal counts from the dispatch buckets.

    Returns ``{reason: count}`` where every count is a number of task ids (or
    tick-level holds) the tick refused. Empty dict means the tick refused
    *something* the buckets cannot attribute (budget refusal before the row
    loop, a lost claim race, or a spawn/workspace failure already recorded on
    the card) — the caller then counts it as ``unattributed``.
    """
    counts: dict[str, int] = {}

    def _bump(reason: str, n: int = 1) -> None:
        if n > 0:
            counts[reason] = counts.get(reason, 0) + int(n)

    for _slug, res in (results or []):
        if res is None:
            continue
        for bucket in _REFUSAL_ID_BUCKETS:
            ids = getattr(res, bucket, None)
            if ids:
                _bump(bucket, len(ids))
        for _task_id, _assignee, _running in (getattr(res, "skipped_per_profile_capped", None) or ()):
            _bump("skipped_per_profile_capped")
        # respawn guard 原因保持细分（blocker_auth / recent_success / active_pr）。
        for _task_id, reason in (getattr(res, "respawn_guarded", None) or ()):
            _bump(f"respawn_guard:{reason}")
        if getattr(res, "skipped_locked", False):
            _bump("skipped_locked")
        pressure = getattr(res, "memory_pressure", None)
        if pressure:
            _bump(f"memory_pressure:{pressure}")
    return counts


def _board_team_of(kb: Any, slug: str) -> Optional[list]:
    """board.json 的团队表（patch 391 围栏来源）；键缺席返回 None（= 无围栏）。"""
    meta = kb.read_board_metadata(slug)
    if not isinstance(meta, dict):
        return None
    for key in ("profiles", "profile_scope"):
        raw = meta.get(key)
        if raw is None:
            continue
        if isinstance(raw, (list, tuple)):
            return [str(n) for n in raw]
        return [part.strip() for part in str(raw).split(",") if part.strip()]
    return None


def _fenced_out_assignees(kb: Any, slug: str, task_ids: list) -> tuple[list, Optional[list]]:
    """(该板被围栏拒掉的 assignee 去重表, 团队表)；读失败返回 ([], None)。"""
    if not task_ids:
        return [], None
    from hermes_cli import kanban_db as _kb

    conn = None
    try:
        with _kb.pin_first_board_resolution():
            conn = _kbc().connect(board=slug)
            placeholders = ",".join("?" for _ in task_ids)
            rows = conn.execute(
                f"SELECT DISTINCT assignee FROM tasks WHERE id IN ({placeholders})",
                tuple(task_ids),
            ).fetchall()
    except Exception:
        return [], None
    finally:
        if conn is not None:
            with contextlib.suppress(Exception):
                conn.close()
    assignees = [str(r[0]) for r in rows if r[0]]
    team = _board_team_of(kb, slug)
    if not team:
        # 围栏键缺席却仍被判否 —— 拒绝原因不在团队表上，原样回报 assignee 供人工判读。
        return sorted(set(assignees)), team
    norm = {name.strip().lower() for name in team}
    return sorted({a for a in assignees if a.strip().lower() not in norm}), team


def _refusal_hint(kb: Any, settings: _DispatcherSettings, results: Optional[list]) -> str:
    """One actionable line naming the config key and its expected value.

    Best-effort and read-only: every probe is wrapped, an unreadable board
    answers with the generic hint instead of raising into the dispatcher loop.
    """
    try:
        boarded: dict[str, list] = {}
        for slug, res in (results or []):
            if res is None:
                continue
            ids = list(getattr(res, "skipped_nonspawnable", None) or ())
            if ids:
                boarded.setdefault(slug or "", []).extend(ids)
        # 第一优先：板级团队表把整板 ready 卡围栏在外（run24 定谳现场：两块板同时中招）。
        fenced: list[str] = []
        for slug, ids in sorted(boarded.items()):
            try:
                excluded, team = _fenced_out_assignees(kb, slug, ids[:32])
            except Exception:
                continue
            if excluded:
                fenced.append(f"{slug!r} team={team or []} excludes {excluded}")
        if fenced:
            return (
                "board.json team fence (HERMES_CUSTOM board-team-fence) is refusing whole "
                "boards: " + "; ".join(fenced) + ". Expected: board.json `profiles` lists "
                "EVERY assignee the dispatcher must spawn (sub-profiles like "
                "'chen-csw-pay-core', not just the base 'chen'), or the key is removed to "
                "disable the per-board fence. Note the health probe (has_spawnable_ready) is "
                "board-unfenced, so it keeps reporting 'ready non-empty' while dispatch "
                "refuses — the two readings disagree by design."
            )
        if boarded:
            return (
                "cards were refused as nonspawnable (assignee is not a live profile): "
                "check `hermes kanban list --status ready` assignees against "
                "`hermes profile list`."
            )
        # 无桶：tick 在逐卡循环前就被预算挡下，或 claim/spawn 腿失败。
        return (
            "no per-card refusal was recorded: this tick was suppressed before the row "
            f"loop (kanban.max_spawn={settings.max_spawn!r}, "
            f"kanban.max_in_progress={settings.max_in_progress!r}, "
            f"kanban.max_in_progress_per_profile={settings.max_in_progress_per_profile!r} — "
            "expected null (uncapped) or >= current running count + 1) or a claim/spawn "
            "attempt failed on the card; check `hermes kanban tail` for spawn_failed events."
        )
    except Exception:  # pragma: no cover - diagnostics must never break dispatch
        logger.debug("kanban dispatcher: refusal hint unavailable", exc_info=True)
        return ""


# ── 派发器健康面（PR-1 最小面，V8.29 治理轮）──
# run12/run19 实锤：ready 卡滞留数小时零孵化且根因未明——先让病可见，根治用本
# 数据面开展。消费方：cluster-inspector/哨兵/studio 运行中心（import 本模块调
# dispatcher_health_snapshot()）；报警阈值 env DISPATCHER_STALL_ALARM_TICKS（缺省
# 60 拍）。根因未明前不自动重排队列（识别不干预），只报警留痕。
_HEALTH = {"last_spawn_ts": 0.0, "stall_ticks": 0, "last_tick_ts": 0.0, "total_ticks": 0}


def _record_tick(any_spawned: bool) -> None:
    now = time.time()
    _HEALTH["last_tick_ts"] = now
    _HEALTH["total_ticks"] += 1
    if any_spawned:
        _HEALTH["last_spawn_ts"] = now
        _HEALTH["stall_ticks"] = 0
    else:
        _HEALTH["stall_ticks"] += 1
    try:
        threshold = int(os.environ.get("DISPATCHER_STALL_ALARM_TICKS", "60"))
    except ValueError:
        threshold = 60
    if _HEALTH["stall_ticks"] == threshold:
        logger.warning("kanban dispatcher stall alarm: %d ticks with zero spawns (ready may be stuck); snapshot=%s",
                       _HEALTH["stall_ticks"], dispatcher_health_snapshot())


def dispatcher_health_snapshot() -> dict:
    """只读健康快照：ready 在场板清单/距最近孵化秒数/连续零孵化拍数/总拍数。
    不写任何库；板级 ready 判定与 ready_nonempty() 同源（spawnable+assigned）。"""
    boards_with_ready: list[str] = []
    try:
        kbd = _kbd()
        from hermes_cli import kanban_db as _kb
        disp = _KanbanDispatcher(None, _resolve_dispatcher_settings({}, None))
        with _kb.pin_first_board_resolution():
            for slug in disp._board_slugs():
                conn = None
                try:
                    conn = _kbc().connect(board=slug)
                    if kbd.has_spawnable_ready(conn):
                        boards_with_ready.append(slug)
                except Exception:
                    continue
                finally:
                    if conn is not None:
                        with contextlib.suppress(Exception):
                            conn.close()
    except Exception:
        pass
    now = time.time()
    last = _HEALTH["last_spawn_ts"]
    return {
        "boards_with_ready": boards_with_ready,
        "ready_nonempty": bool(boards_with_ready),
        "seconds_since_last_spawn": round(now - last, 1) if last else None,
        "stall_ticks": _HEALTH["stall_ticks"],
        "total_ticks": _HEALTH["total_ticks"],
    }
