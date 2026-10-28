"""Shared library for the skill-market-index trio (build / query / selftest).

stdlib-only on purpose: no yaml, no third-party deps. Upstream anchors
(dsh v0.2.1-rc.2 snapshot, 2026-10-18 delta research):
- packages/boot/plugin-market/src/search.ts  -> search_terms / fuzzy / scoring
- packages/util/plugin-market-index/src/types.ts -> index entry shape
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import unicodedata

# ---------------------------------------------------------------- tokenizer

# Approximation of upstream CJK class \p{scx=Han|Hira|Kana|Hang} with stdlib.
_CJK_RANGES = (
    (0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xF900, 0xFAFF),  # Han (+compat)
    (0x3040, 0x309F),  # Hiragana
    (0x30A0, 0x30FF),  # Katakana (incl. prolonged sound mark U+30FC)
    (0xAC00, 0xD7A3), (0x1100, 0x11FF), (0x3130, 0x318F),  # Hangul
    (0x20000, 0x2A6DF),  # CJK Ext B
)


def _is_cjk(ch: str) -> bool:
    cp = ord(ch)
    return any(lo <= cp <= hi for lo, hi in _CJK_RANGES)


def _is_letterish(ch: str) -> bool:
    return unicodedata.category(ch) in {
        "Lu", "Ll", "Lt", "Lm", "Lo", "Mn", "Mc", "Me", "Nd", "Nl", "No",
    }


def search_terms(text: str) -> list[str]:
    """Port of upstream search.ts searchTerms(): NFKC-normalize, then split
    into runs; a CJK run yields overlapping character pairs plus its last
    character (bigram tokenization so CJK matches without segmentation),
    any other letter run yields one term. Not lowercased here."""
    runs: list[str] = []
    buf: list[str] = []
    buf_cjk = False
    for ch in unicodedata.normalize("NFKC", text or ""):
        if _is_cjk(ch) or _is_letterish(ch):
            if buf and (buf_cjk != _is_cjk(ch)):
                runs.append("".join(buf))
                buf = []
            buf_cjk = _is_cjk(ch)
            buf.append(ch)
        elif buf:
            runs.append("".join(buf))
            buf = []
            buf_cjk = False
    if buf:
        runs.append("".join(buf))
    terms: list[str] = []
    for run in runs:
        if not _is_cjk(run[0]):
            terms.append(run)
            continue
        chars = list(run)
        for i in range(1, len(chars)):
            terms.append(chars[i - 1] + chars[i])
        terms.append(chars[-1])
    return terms


def _edit_distance(a: str, b: str, cap: int = 3) -> int:
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        best = i
        for j, cb in enumerate(b, 1):
            v = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb))
            cur.append(v)
            best = min(best, v)
        if best > cap:
            return cap + 1
        prev = cur
    return prev[-1]


def fuzzy_allows(term: str) -> int:
    """Upstream: fuzzy = term.length >= 4 ? 0.2 : false, maxFuzzy 2 ->
    allowed distance = min(round(len*0.2), 2), at least 1, only for len>=4."""
    if len(term) < 4:
        return 0
    return max(1, min(round(len(term) * 0.2), 2))


def term_match_score(query_term: str, doc_term: str) -> float:
    """exact 1.0 / prefix 0.85 / fuzzy 0.6 — 0.0 when no match."""
    if query_term == doc_term:
        return 1.0
    if doc_term.startswith(query_term):
        return 0.85
    allow = fuzzy_allows(query_term)
    if allow and _edit_distance(query_term, doc_term, allow) <= allow:
        return 0.6
    return 0.0


FIELD_BOOST = {"name": 3.0, "tags": 2.0, "description": 1.0, "category": 1.0}


def match_score(query_text: str, doc: dict) -> float:
    """AND semantics like upstream combineWith:'AND': every query term must
    match in at least one field, else the doc does not match at all."""
    qterms = [t.lower() for t in search_terms(query_text)]
    if not qterms:
        return 0.0
    doc_terms: dict[str, list[str]] = {}
    for field in FIELD_BOOST:
        raw = doc.get(field) or ""
        if isinstance(raw, list):
            raw = " ".join(str(x) for x in raw)
        doc_terms[field] = [t.lower() for t in search_terms(str(raw))]
    total = 0.0
    for q in qterms:
        best = 0.0
        for field, boost in FIELD_BOOST.items():
            fb = max(
                (term_match_score(q, dt) for dt in doc_terms[field]),
                default=0.0,
            )
            best = max(best, fb * boost)
        if best == 0.0:
            return 0.0  # AND: one unmatched term disqualifies the doc
        total += best
    return total / len(qterms)


# ------------------------------------------------------------ frontmatter

class FrontmatterError(ValueError):
    pass


def _frontmatter_block(text: str) -> tuple[str | None, str | None]:
    """Return (block, None) or (None, reason)."""
    if not text.startswith("---"):
        return None, "missing-frontmatter"
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None, "missing-frontmatter"
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return "\n".join(lines[1:i]), None
    return None, "missing-frontmatter"


def _unquote(v: str) -> str:
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
        return v[1:-1]
    return v


def _inline_list(v: str) -> list[str] | None:
    v = v.strip()
    if not (v.startswith("[") and v.endswith("]")):
        return None
    inner = v[1:-1].strip()
    if not inner:
        return []
    parts, buf, quote = [], "", None
    for ch in inner:
        if quote:
            buf += ch
            if ch == quote:
                quote = None
        elif ch in "'\"":
            quote = ch
            buf += ch
        elif ch == ",":
            parts.append(buf)
            buf = ""
        else:
            buf += ch
    parts.append(buf)
    return [p.strip().strip("'\"") for p in parts if p.strip()]


def _strip_comment(v: str) -> str:
    out, quote = [], None
    for ch in v:
        if quote:
            out.append(ch)
            if ch == quote:
                quote = None
        elif ch in "'\"":
            quote = ch
            out.append(ch)
        elif ch == "#":
            break
        else:
            out.append(ch)
    return "".join(out).strip()


def _parse_mapping(lines: list[str], i: int, indent: int) -> tuple[dict, int]:
    """Indentation-aware mini-parser for the frontmatter subset: nested
    mappings, block lists ('- item'), folded/literal blocks, inline scalars.
    Returns (mapping, next_index)."""
    mapping: dict = {}
    while i < len(lines):
        raw = lines[i]
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            i += 1
            continue
        cur = len(raw) - len(raw.lstrip(" "))
        if cur < indent:
            break
        if cur > indent:  # stray deeper line without an owner key
            i += 1
            continue
        if stripped.startswith("- "):
            break  # list item belongs to the caller's key
        key, _, val = stripped.partition(":")
        key = key.strip()
        val = _strip_comment(val).strip()
        i += 1
        if val in ("|", ">", "|-", ">-"):  # block scalar marker (not a value)
            parts: list[str] = []
            while i < len(lines):
                nxt = lines[i]
                ns = nxt.strip()
                ni = len(nxt) - len(nxt.lstrip(" "))
                if ns and ni > cur:
                    parts.append(ns)
                    i += 1
                else:
                    break
            mapping[key] = " ".join(parts).strip()
            continue
        if val:
            inline = _inline_list(val)
            mapping[key] = inline if inline is not None else _unquote(val)
            continue
        # empty value: nested mapping / block list / null
        if i < len(lines):
            nxt = lines[i]
            ns = nxt.strip()
            ni = len(nxt) - len(nxt.lstrip(" "))
            if ns.startswith("- ") and ni > cur:  # block list
                items: list[str] = []
                while i < len(lines):
                    li = lines[i]
                    ls = li.strip()
                    lind = len(li) - len(li.lstrip(" "))
                    if ls.startswith("- ") and lind > cur:
                        items.append(ls[2:].strip())
                        i += 1
                    else:
                        break
                mapping[key] = [_unquote(x) for x in items]
                continue
            if ni > cur:  # nested mapping
                sub, i = _parse_mapping(lines, i, ni)
                mapping[key] = sub
                continue
        mapping[key] = None
    return mapping, i


def _dotted(mapping: dict, dotted: str):
    """Walk a dotted path through nested mappings."""
    cur: object = mapping
    for part in dotted.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def _norm_tags(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    text = _unquote(str(value).strip())
    if not text:
        return []
    inline = _inline_list(text)
    if inline is not None:
        return inline
    return [t.strip().strip("'\"") for t in text.split(",") if t.strip()]


def extract_fields(text: str) -> dict:
    """Extract the fields the index needs from a SKILL.md frontmatter:
    name, version, description, tags, engines_hermes. Supports the shapes
    actually present in ~/.hermes/skills: flat keys, nested mappings
    (metadata.hermes.tags, engines.hermes), inline [a, b] and block
    "- item" lists, folded |> description blocks, dotted keys."""
    block, reason = _frontmatter_block(text)
    if block is None:
        raise FrontmatterError(reason or "missing-frontmatter")
    top, _ = _parse_mapping(block.splitlines(), 0, 0)

    fields: dict = {"tags": [], "engines_hermes": None}
    for f in ("name", "version", "description"):
        v = top.get(f)
        fields[f] = _unquote(v.strip()) if isinstance(v, str) and v.strip() else None
    tags = _norm_tags(top.get("tags"))
    if not tags:
        tags = _norm_tags(_dotted(top, "metadata.hermes.tags"))
    if not tags and "metadata.hermes.tags" in top:  # literal dotted key
        tags = _norm_tags(top["metadata.hermes.tags"])
    fields["tags"] = tags
    eng = _dotted(top, "engines.hermes")
    if eng is None and "engines.hermes" in top:  # literal dotted key
        eng = top["engines.hermes"]
    fields["engines_hermes"] = _unquote(str(eng).strip()) if eng else None
    return fields


# ------------------------------------------------------------ engines gate

_SEMVER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$")


def parse_version(v: str) -> tuple | None:
    m = _SEMVER_RE.match((v or "").strip().lstrip("v"))
    return tuple(int(x) for x in m.groups()[:3]) if m else None


def _cmp_ok(op: str, have: tuple, want: tuple) -> bool:
    if op == ">=":
        return have >= want
    if op == ">":
        return have > want
    if op == "<=":
        return have <= want
    if op == "<":
        return have < want
    return have == want  # '=' or bare


_TOKEN_RE = re.compile(r"^(>=|<=|>|<|=|\^|~)?\s*v?(\d+)\.(\d+)(?:\.(\d+))?") 


def _token_ver(m: re.Match) -> tuple:
    return (int(m.group(2)), int(m.group(3)), int(m.group(4) or 0))


def range_satisfied(rng: str, version: str) -> bool | None:
    """Evaluate the engines.hermes subset: >= <= > < = ^ ~ *, whitespace-AND,
    '||'-OR, comma treated as space. Returns None when syntax is invalid
    (upstream: an empty or invalid range is refused)."""
    rng = (rng or "").strip()
    if not rng:
        return None
    have = parse_version(version)
    if have is None:
        return None
    any_clause = False
    for clause in rng.split("||"):
        clause = clause.strip()
        if not clause:
            continue
        any_clause = True
        ok = True
        for tok in clause.replace(",", " ").split():
            if tok == "*":
                continue
            m = _TOKEN_RE.match(tok)
            if not m:
                return None
            op = m.group(1) or "="
            want = _token_ver(m)
            if op == "^":
                top = (want[0] + 1, 0, 0) if want[0] > 0 else (0, want[1] + 1, 0)
                if not (want <= have < top):
                    ok = False
                    break
            elif op == "~":
                if not (want <= have < (want[0], want[1] + 1, 0)):
                    ok = False
                    break
            elif not _cmp_ok(op, have, want):
                ok = False
                break
        if ok:
            return True
    if not any_clause:
        return None
    return False


def current_hermes_version() -> str | None:
    try:
        out = subprocess.run(
            ["hermes", "--version"], capture_output=True, text=True, timeout=20
        ).stdout
    except Exception:
        return None
    m = re.search(r"v?(\d+\.\d+\.\d+)", out or "")
    return m.group(1) if m else None


def check_engines(entry: dict, version: str) -> tuple[int, str]:
    """Trust-gate verdict for one index entry. (exit_code, message).
    Undeclared engines.hermes -> warning, not refusal (upstream semantics:
    an absent engines field falls back to legacy rules)."""
    compat = entry.get("compat")
    rng = (compat or {}).get("engines", {}).get("hermes") if compat else None
    if not rng:
        return 0, (
            f"warning: {entry['name']} declares no engines.hermes; "
            "treating as compatible (absent-engines semantics)"
        )
    verdict = range_satisfied(rng, version)
    if verdict is None:
        return 1, f"refuse: {entry['name']} invalid engines.hermes range {rng!r}"
    if verdict:
        return 0, f"ok: {entry['name']} engines.hermes {rng!r} satisfied by {version}"
    return 1, (
        f"refuse: {entry['name']} requires engines.hermes {rng!r}, "
        f"runtime is {version}"
    )


# ------------------------------------------------------------------ index

def load_index(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def atomic_write_if_changed(path: str, content: str) -> bool:
    """Deterministic write discipline (upstream generator): rewrite only when
    content changes. Returns True when the file was written."""
    try:
        with open(path, encoding="utf-8") as fh:
            if fh.read() == content:
                return False
    except FileNotFoundError:
        pass
    tmp = f"{path}.tmp{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(content)
    os.replace(tmp, path)
    return True
