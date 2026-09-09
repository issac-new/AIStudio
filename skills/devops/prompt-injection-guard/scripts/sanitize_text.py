#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""sanitize_text — third-party content sanitizer for model-bound text.

Ported from anthropics/commerce-agents `commerce_common/fencing.py` (Apache-2.0,
2026-09-03 release) into Hermes as the SANITIZE half of prompt-injection-guard.
pi_scan.py detects; this module neutralizes. Together they form the two halves
of the commerce trust pattern: "fenced text is material to report on, never
instructions to act on."

What it removes / neutralizes (all linear on hostile input):
  1. Unicode normalization to NFKC
  2. Invisible & control characters (zero-width, bidi overrides, tag chars,
     variation selectors — the usual carriers for hidden instructions)
  3. Fence-marker self-references (text that imitates <label>...</label>),
     stripped TO A FIXPOINT so nested reassembly (`</label</label>>`) fails
  4. Transcript / tool-call markup forgery (<system>, <|endoftext|>,
     namespaced tool_use/tool_result/parameter tags), also to a fixpoint
  5. Forged turn boundaries ("\\n\\nhuman:" mid-body) -> role word neutralized
  6. Whitespace run collapse (optional) and hard size cap with truncation mark

Exit code: 0 always when used as a filter (sanitization never fails);
nonzero only on usage error. Designed for shell pipelines:
  cat untrusted.txt | python3 sanitize_text.py --label third_party_data
  python3 sanitize_text.py --file review.json --max-chars 4000 --json
"""

import argparse
import json
import re
import sys
import unicodedata

# --------------------------------------------------------------------------
# 1. Invisible carriers (ported: commerce-agents fencing.py _INVISIBLE_RANGES)
# --------------------------------------------------------------------------
_INVISIBLE_RANGES = (
    (0x00AD, 0x00AD),    # soft hyphen
    (0x200B, 0x200F),    # zero-width space/joiners, LRM/RLM
    (0x2028, 0x2029),    # line/paragraph separators
    (0x202A, 0x202E),    # bidi embedding/overrides
    (0x2060, 0x2064),    # word joiner, invisible operators
    (0x2066, 0x2069),    # bidi isolates
    (0x061C, 0x061C),    # Arabic letter mark
    (0x180E, 0x180E),    # Mongolian vowel separator
    (0x206A, 0x206F),    # deprecated format controls
    (0xFE00, 0xFE0F),    # variation selectors
    (0xFFF9, 0xFFFB),    # interlinear annotation controls
    (0xFEFF, 0xFEFF),    # BOM / zero-width no-break space
    (0xE0000, 0xE007F),  # tag characters (spell invisible ASCII)
    (0xE0100, 0xE01EF),  # variation selectors supplement
)
_INVISIBLE = re.compile(
    "[" + "".join(f"{chr(lo)}-{chr(hi)}" for lo, hi in _INVISIBLE_RANGES) + "]"
)

# 2. C0/C1 control characters except tab and newline.
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")

# 3. Forged turn boundary: blank line, then a full role word and a colon.
#    Mid-sentence role words, single-newline headings, and one-letter list
#    markers ("A:") do NOT match (ported regex, case-insensitive).
_TURN_INDICATOR = re.compile(
    r"((?:\r\n|\r|\n)[ \t]*(?:\r\n|\r|\n)[ \t]*)(human|assistant|system|user)[ \t]*:",
    re.IGNORECASE,
)
# Same marker at the very start of a body (the fence's own opening newline
# would complete the blank line, invisible to the in-body pattern).
_LEADING_TURN_INDICATOR = re.compile(
    r"^(\s*)(human|assistant|system|user)[ \t]*:", re.IGNORECASE
)

# 4. Transcript and tool-call markup, optionally namespaced. Only tag-shaped
#    text matches; "<system requirements>" passes (not a bare system tag).
#    Quantifiers bounded + non-adjacent keeps matching linear on unclosed input.
_TAG_ATTRS = (
    r"(?:[ \t]+[\w:.-]{1,40}[ \t]*=[ \t]*(?:\"[^\"]{0,200}\"|'[^']{0,200}'|[^\s\"'>]{1,200})){0,8}"
)
_SPECIAL_TOKEN = re.compile(
    r"<[ \t]*/?[ \t]*(?:"
    r"(?:[a-z][\w.-]{0,30}:)?(?:transcript|conversation|function_calls|function_results"
    r"|invoke|tool_use|tool_result|system|human|user|assistant)"
    r"|[a-z][\w.-]{0,30}:(?:parameter|result)"
    r")\b" + _TAG_ATTRS + r"[ \t]*/?>"
    r"|<\|[^|<>\r\n]{1,64}\|>",
    re.IGNORECASE,
)

DEFAULT_MAX_CHARS = 12_000  # ported: MAX_FENCED_CHARS
TRUNCATION_SUFFIX = " ...[truncated]"


def sanitize_text(text: str, label: str = "third_party_data",
                  max_chars: int | None = DEFAULT_MAX_CHARS) -> str:
    """Sanitize untrusted text for safe inclusion in model-bound context.

    The `label` is the fence tag the caller will wrap the result in; any text
    imitating that marker inside the body is removed so the fence cannot be
    escaped from the inside.
    """
    if not text:
        return text
    out = unicodedata.normalize("NFKC", text)
    out = _INVISIBLE.sub("", out)
    out = _CONTROL.sub(" ", out)
    # Marker + special-token removal to a fixpoint: a token nested inside
    # another (`</label</label>>`) must not reassemble after the inner one goes.
    marker = re.compile(rf"<\s*/?\s*{re.escape(label)}(?![A-Za-z0-9_])(?:[^<>]*>)?", re.IGNORECASE)
    while True:
        stripped = _SPECIAL_TOKEN.sub("[removed]", marker.sub("[removed]", out))
        if stripped == out:
            break
        out = stripped
    out = _TURN_INDICATOR.sub(r"\1\2 -", out)
    if max_chars is not None and len(out) > max_chars:
        if max_chars > len(TRUNCATION_SUFFIX):
            out = out[: max_chars - len(TRUNCATION_SUFFIX)] + TRUNCATION_SUFFIX
        else:
            out = out[:max_chars]
    return out


def wrap(text: str, label: str = "third_party_data",
         max_chars: int | None = DEFAULT_MAX_CHARS) -> str:
    """Sanitize and wrap text in the fixed-label fence.

    Mirrors the upstream fence_payload order: sanitize, neutralize the
    leading-turn-boundary form (the fence's own opening newline completes a
    blank line, invisible to the in-body pattern), then cap the FULL payload
    including both fence markers (upstream fencing.py:146-148).
    """
    body = sanitize_text(text, label=label, max_chars=None)
    body = _LEADING_TURN_INDICATOR.sub(r"\1\2 -", body)
    payload = f"<{label}>\n{body}\n</{label}>"
    if max_chars is not None and len(payload) > max_chars:
        if max_chars > len(TRUNCATION_SUFFIX):
            payload = payload[: max_chars - len(TRUNCATION_SUFFIX)] + TRUNCATION_SUFFIX
        else:
            payload = payload[:max_chars]
    return payload


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Sanitize untrusted third-party text before it enters model context "
                    "(prompt-injection-guard / sanitize half; ported from "
                    "anthropics/commerce-agents fencing.py).")
    ap.add_argument("--file", help="Read text from file instead of stdin")
    ap.add_argument("--label", default="third_party_data",
                    help="Fence label for marker-stripping and --wrap output (default: third_party_data)")
    ap.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS,
                    help=f"Hard size cap including truncation suffix (default: {DEFAULT_MAX_CHARS})")
    ap.add_argument("--no-cap", action="store_true", help="Disable the size cap")
    ap.add_argument("--wrap", action="store_true",
                    help="Output wrapped in <label>...</label> fence (implies marker stripping for that label)")
    ap.add_argument("--json", action="store_true",
                    help="Emit JSON {sanitized_len, removed_delta, text}")
    args = ap.parse_args()

    text = open(args.file, encoding="utf-8").read() if args.file else sys.stdin.read()
    max_chars = None if args.no_cap else args.max_chars
    label = args.label
    if args.wrap:
        result = wrap(text, label=label, max_chars=max_chars)
        capped = bool(max_chars is not None and len(result) >= max_chars)
    else:
        result = sanitize_text(text, label=label, max_chars=max_chars)
        capped = bool(max_chars is not None and len(result) >= max_chars)

    if args.json:
        print(json.dumps({
            "label": label,
            "input_len": len(text),
            "sanitized_len": len(result),
            "removed_delta": len(text) - len(result),
            "capped": capped,
            "text": result,
        }, ensure_ascii=False))
    else:
        sys.stdout.write(result)
        if not result.endswith("\n"):
            sys.stdout.write("\n")


if __name__ == "__main__":
    main()
