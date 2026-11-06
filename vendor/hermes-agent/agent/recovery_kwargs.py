"""Recovery kwarg filter: the one decision chat-turn recovery makes about *what* it forwards.

Why a separate module (2026-11-02 mechanism-governance batch):

``run_turn_runner`` builds the recovery call as
``agent.run_conversation(nudge, conversation_history=<prior>, **_rec_kwargs)``.
Anything already present in ``_rec_kwargs`` under a name the call site also passes
explicitly raises ``TypeError: got multiple values for keyword argument`` — and the
caller's broad ``except`` turns that into a single "chat turn recovery skipped"
warning. run25 (2026-11-02 19:57, the secops turn during a provider outage) showed
exactly that: recovery died in the outage scenario it exists for (725 introduced
the filter, 726 patched one leak).

Two rules follow, both learned the hard way:

* every explicitly-passed argument must be denied here, not popped ad hoc later;
* this decision must be testable without an agent, a provider or a turn.

Hence: a pure function with no imports beyond ``typing``, no module state, no I/O.
Behaviour tests import it directly (see simharness/tests/mechanism-behavior.test.ts).
Keep it that way — if this file ever needs an import of ``agent`` or a logger, the
design has drifted.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional

# Names the recovery call site passes explicitly (``conversation_history``) or that
# must never be replayed into a recovery turn (persistence side effects would
# duplicate the user message; ``prelude``/``moa_config`` are turn-setup inputs).
# Everything here is a *hard* deny: a duplicate keyword kills recovery silently.
_DENY_EXACT = frozenset({
    "conversation_history",   # passed explicitly by the recovery call site
    "title_user_message",     # already consumed by the first turn
    "prelude",
    "moa_config",
})
# Persistence side effects: the user message was already stored by the original
# turn; replaying them would duplicate it in history.
_DENY_PREFIXES = ("persist_",)


def filter_recovery_kwargs(kwargs: Optional[Mapping[str, Any]]) -> dict[str, Any]:
    """Return the subset of ``kwargs`` safe to forward to a recovery turn.

    Pure: no side effects, no logging, no module state, no dependency on ``agent``.
    ``None`` and empty mappings yield ``{}``. Keys are matched as ``str(key)`` for
    the deny rules but returned with their original objects and order preserved.
    """
    if not kwargs:
        return {}
    out: dict[str, Any] = {}
    for key, value in kwargs.items():
        name = str(key)
        if name in _DENY_EXACT:
            continue
        if any(name.startswith(prefix) for prefix in _DENY_PREFIXES):
            continue
        out[key] = value
    return out
