"""Evidence-Preserving Reducer (SoL-Pi mechanism #4, fail-closed).

Large DIAGNOSTIC observations (build/test/log output) dominate context while carrying
few decision-relevant lines. This module delegates their condensation to a cheap
auxiliary model and lets the main model see only the receipt — UNDER TWO INVARIANTS
that make it evidence-preserving rather than evidence-destroying:

1. **Verbatim quotes only.** Every line the receipt presents as quoted evidence must
   match an exact line of the archived source (line-set membership). A paraphrasing
   or hallucinating reducer fails verification and the ORIGINAL passes through.
2. **Full fidelity outside the model's context.** The original is archived to the
   spillover store BEFORE reduction (``obs_recall`` can page it back), and the
   efficiency ledger records the decision either way.

Fail-through on ANY failure: disabled config, missing provider, API error, oversized
receipt, secret-looking content, unparseable output, quote mismatch — the caller's
string is returned unchanged. The mechanism is OFF by default and must be enabled
explicitly in ``cli-config.yaml``::

    evidence_reducer:
      enabled: true          # default false — fail-closed opt-in
      provider: openrouter   # any configured provider; omit to reuse the main provider
      model: <cheap-model>   # required when provider is set; otherwise main model
      threshold_chars: 4096  # results below this are never reduced
      max_receipt_chars: 2500
      timeout: 60

Governance note (SoL-Pi capability-floor rule): the reducer may only REMOVE content,
never INVENT it — receipt text outside verbatim quotes is confined to the fixed
scaffolding emitted here, and quote verification is mechanical (no model in the loop).
"""

import json
import logging
import re

logger = logging.getLogger(__name__)

# Tools whose oversized results are candidates: command/diagnostic emitters. File
# writes and searches keep their own compact result contracts.
DEFAULT_TARGET_TOOLS = frozenset({
    "terminal", "bash", "execute_code", "run_tests", "process_manage",
})

DEFAULT_THRESHOLD_CHARS = 4096
DEFAULT_MAX_RECEIPT_CHARS = 2500
DEFAULT_TIMEOUT_S = 60
_MAX_SOURCE_CHARS_TO_MODEL = 48_000  # head+tail window handed to the reducer model

_QUOTE_LINE_RE = re.compile(r"^\s*> ?(.*)$")

_RECEIPT_OPEN = "<reduced-observation>"
_RECEIPT_CLOSE = "</reduced-observation>"

_SYSTEM_PROMPT = (
    "You condense diagnostic logs for a coding agent. Produce a receipt with: "
    "(1) a one-paragraph '## Summary' of what happened; (2) a '## Evidence' section "
    "quoting the exact lines that matter, each on its own line prefixed with '> ' — "
    "quotes MUST be copied character-for-character from the input, no paraphrase, no "
    "truncation inside a quote; (3) a '## Verdict' line (pass/fail/flaky + which "
    "check). Do not invent lines. Do not add commentary outside these sections. "
    "Keep the whole receipt under 2000 characters."
)


class ReducerConfig:
    """Parsed ``evidence_reducer`` config block (defaults = disabled)."""

    __slots__ = ("enabled", "provider", "model", "threshold_chars",
                 "max_receipt_chars", "timeout", "target_tools")

    def __init__(self, raw: dict | None):
        raw = raw if isinstance(raw, dict) else {}
        self.enabled = bool(raw.get("enabled", False))
        self.provider = raw.get("provider") or None
        self.model = raw.get("model") or None
        self.threshold_chars = max(1, int(raw.get("threshold_chars", DEFAULT_THRESHOLD_CHARS)))
        self.max_receipt_chars = max(200, int(raw.get("max_receipt_chars", DEFAULT_MAX_RECEIPT_CHARS)))
        self.timeout = max(5, int(raw.get("timeout", DEFAULT_TIMEOUT_S)))
        tools = raw.get("target_tools")
        self.target_tools = frozenset(tools) if isinstance(tools, list) and tools else DEFAULT_TARGET_TOOLS


def load_reducer_config() -> ReducerConfig:
    """Read the block from cli-config (readonly loader is cached; never raises)."""
    try:
        from hermes_cli.config import load_config_readonly
        return ReducerConfig(load_config_readonly().get("evidence_reducer"))
    except Exception:  # noqa: BLE001 — config trouble means disabled, never a crash
        return ReducerConfig(None)


def _source_window(content: str, max_chars: int = _MAX_SOURCE_CHARS_TO_MODEL) -> str:
    """Head+tail window when the source exceeds what the reducer should read."""
    if len(content) <= max_chars:
        return content
    omitted = len(content) - max_chars
    return (content[:max_chars // 2]
            + f"\n[…{omitted:,} chars omitted — full archive retains them…]\n"
            + content[-max_chars // 2:])


def extract_quoted_lines(receipt: str) -> list[str]:
    """Lines the receipt presents as quoted evidence (``> …``), verbatim payloads."""
    out = []
    for line in receipt.splitlines():
        m = _QUOTE_LINE_RE.match(line)
        if m:
            out.append(m.group(1))
    return out


def verify_quotes(receipt: str, source_lines: set[str]) -> tuple[bool, int, int]:
    """Every quoted line must exist verbatim in the source. Returns
    ``(ok, quotes_total, quotes_verified)`` — ok is False the moment one misses."""
    quotes = extract_quoted_lines(receipt)
    if not quotes:
        return False, 0, 0
    verified = 0
    for q in quotes:
        if q in source_lines or q.strip() in source_lines:
            verified += 1
        else:
            return False, len(quotes), verified
    return True, len(quotes), verified


def _looks_secretish(receipt: str) -> bool:
    """Abort when the receipt would expose secret-shaped strings the source happened
    to carry (SoL-Pi's secret check). Reuses the runtime redactor when importable."""
    try:
        from agent.redact import redact_sensitive_text
        return redact_sensitive_text(receipt) != receipt
    except Exception:  # noqa: BLE001 — no redactor: conservative regex floor
        return bool(re.search(
            r"(sk-[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)",
            receipt))


def _call_reducer_model(content: str, cfg: ReducerConfig) -> str:
    """One auxiliary LLM call; raises on any failure (caller fail-throughs)."""
    from agent.auxiliary_client import call_llm, extract_content_or_reasoning

    response = call_llm(
        task="evidence_reducer",
        provider=cfg.provider,
        model=cfg.model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _source_window(content)},
        ],
        max_tokens=1200,
        timeout=cfg.timeout,
    )
    text = (extract_content_or_reasoning(response) or "").strip()
    if not text:
        raise ValueError("reducer model returned empty content")
    return text


def maybe_reduce_observation(content: str, tool_name: str, tool_call_id: str,
                             session_id: str | None = None,
                             config: ReducerConfig | None = None) -> str:
    """Reduce a large diagnostic observation to an evidence-verified receipt.

    Returns ``content`` unchanged whenever anything is off (the fail-through path IS
    the capability floor: an unavailable reducer must cost tokens, never correctness).
    Only a receipt whose every quoted line verifies against the archived source is
    wrapped in ``<reduced-observation>`` and returned in place of the original.
    """
    from tools.efficiency_ledger import record_efficiency_event

    cfg = config if config is not None else load_reducer_config()
    if not cfg.enabled or tool_name not in cfg.target_tools or not isinstance(content, str):
        return content
    if len(content) < cfg.threshold_chars:
        return content
    if tool_call_id and f'ref="{tool_call_id}"' in content[:200]:
        # Already a handle/receipt block: never reduce twice.
        return content

    # 1. Archive FIRST — full fidelity lives outside the model context whatever happens.
    archive_path = None
    try:
        from tools.tool_result_storage import _write_to_spillover, _safe_result_filename
        archive_path = _write_to_spillover(content, _safe_result_filename(tool_call_id))
    except Exception as exc:  # noqa: BLE001
        logger.debug("evidence_reducer archive step failed: %s", exc)

    def _ledger(outcome: str, **extra) -> None:
        record_efficiency_event("evidence_reduce", tool=tool_name, ref=str(tool_call_id),
                                outcome=outcome, chars_original=len(content),
                                archive=archive_path, session_id=session_id, **extra)

    # 2. Condense with the cheap model; any raise → pass-through.
    try:
        receipt = _call_reducer_model(content, cfg)
    except Exception as exc:  # noqa: BLE001
        logger.info("evidence_reducer passthrough (model call failed): %s", exc)
        _ledger("passthrough_model_error")
        return content

    # 3. Verify: size cap, secret check, verbatim quotes.
    if len(receipt) > cfg.max_receipt_chars:
        _ledger("passthrough_receipt_oversize", chars_receipt=len(receipt))
        return content
    if _looks_secretish(receipt):
        _ledger("passthrough_secret_check")
        return content
    source_lines = set(content.splitlines())
    ok, total, verified = verify_quotes(receipt, source_lines)
    if not ok:
        logger.info("evidence_reducer passthrough (quote verification failed at %d/%d)",
                    verified, total)
        _ledger("passthrough_quote_mismatch", quotes_total=total, quotes_verified=verified)
        return content

    _ledger("reduced", chars_receipt=len(receipt), quotes_total=total)
    ref_hint = (f"Result id for obs_recall: {tool_call_id}\n" if tool_call_id else "")
    archive_hint = (f"Full verbatim archive: {archive_path}\n" if archive_path else "")
    return (
        f"{_RECEIPT_OPEN}\n"
        f"Diagnostic output condensed by the evidence-preserving reducer; every quoted "
        f"line verified verbatim against the archived source ({verified} quote(s)).\n"
        f"{ref_hint}{archive_hint}"
        "Page the original with obs_recall (or read_file on the archive) when the "
        "receipt is not enough.\n\n"
        f"{receipt}\n{_RECEIPT_CLOSE}")
