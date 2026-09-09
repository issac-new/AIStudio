#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""prompt-injection-guard — deterministic Prompt Injection scanner.

Reads text from stdin (or --file / --tool-def / --tool-def-file), scans for known
PI signal patterns (keyword + structure), emits a report with per-hit confidence
and an overall verdict. No LLM. No network. No filesystem writes.

This is the FRONTEND deterministic filter net. It does NOT replace
`codex-guardian-review` (LLM second-review) — the two are complementary:
this catches known, high-signal patterns with zero latency/token cost;
guardian catches subtle, context-dependent attempts via LLM judgment.

Verdict vocabulary (canonical, matches task spec):
  clean      -> flag=False  (no meaningful signal; safe to pass through)
  suspicious -> flag=False  (one or more MEDIUM signals, carrying a score;
                             do NOT auto-execute if it will drive an action —
                             escalate to codex-guardian-review)
  blocked    -> flag=True   (HIGH signal, or >=2 distinct categories;
                             hard stop — never execute the flagged content as
                             instruction; route to human or codex-guardian-review)

Exit code: 0 if verdict != blocked, 1 if verdict == blocked (CI/`set -e` friendly).

Usage:
  echo "..." | python3 pi_scan.py
  python3 pi_scan.py --file tool_output.txt
  python3 pi_scan.py --deep                 # decode base64/rot13/hex then re-scan
  python3 pi_scan.py --tool-def "..."       # scan a tool DESCRIPTION for injected instructions
  python3 pi_scan.py --json                  # pure JSON for pipelines
"""

import argparse
import base64
import codecs
import json
import re
import sys

# --------------------------------------------------------------------------
# Signal catalog
# Each entry: (category, confidence, compiled_regex)
#   confidence: HIGH  = hard PI signal
#               MEDIUM = suspicious but ambiguous
#               LOW    = weak signal, logged only, never flags
#
# Categories (mirrors OpenHuman detector.rs 5-class taxonomy):
#   override        — instruction override / 指令覆写
#   system_embed    — embedded <system> spoof / 系统提示伪造
#   encoded         — encoded-obfuscation inducement / 编码混淆诱导
#   role            — role impersonation / 角色冒充
#   exfil           — data-exfiltration inducement / 数据外泄诱导
#   weak            — LOW weak signals (roleplay/pretend/hypothetically)
# --------------------------------------------------------------------------

PATTERNS = [
    # 1. override — 指令覆写
    ("override", "HIGH", re.compile(r"(?i)\bignore (?:the )?(?:previous|prior|above|preceding|all prior|earlier)\b")),
    ("override", "HIGH", re.compile(r"(?i)\bdisregard (?:the )?(?:previous|prior|above|preceding|all|these)\b")),
    ("override", "HIGH", re.compile(r"(?i)\b(?:forget|ignore|override|disregard)[^\n]{0,20}?(?:instructions|system prompt|your (?:rules|prompt|directives|guidelines))\b")),
    ("override", "MEDIUM", re.compile(r"(?i)\byou are now\b")),
    ("override", "MEDIUM", re.compile(r"(?i)\bfrom now on\b")),
    ("override", "MEDIUM", re.compile(r"(?i)\bnew (?:set of )?instructions\b")),
    ("override", "HIGH", re.compile(r"(?iu)忽略(上述|以上|上文|前面的|之前的|以前的)")),
    ("override", "HIGH", re.compile(r"(?iu)(?:无视|绕过|覆盖|推翻)[^\n]{0,12}?(?:指令|提示|规则|设定)")),
    ("override", "HIGH", re.compile(r"(?iu)忘记(?:你(?:的)?)?(?:指令|提示词|规则|设定)")),
    ("override", "MEDIUM", re.compile(r"(?iu)你(?:现在|已经是|此刻是|接下来是)")),

    # 2. system_embed — 嵌入 system prompt 伪造
    ("system_embed", "HIGH", re.compile(r"(?i)<\s*system\s*>")),
    ("system_embed", "HIGH", re.compile(r"(?i)\[\s*system\s*\]")),
    ("system_embed", "HIGH", re.compile(r"(?i)\bsystem message\b")),
    ("system_embed", "MEDIUM", re.compile(r"(?i)\bsystem\s*:")),
    ("system_embed", "MEDIUM", re.compile(r"(?i)(?:your|the|implement|here is)[^\n]{0,20}?system prompt")),
    ("system_embed", "HIGH", re.compile(r"(?iu)<\s*系统\s*>")),
    ("system_embed", "MEDIUM", re.compile(r"(?iu)系统(?:提示|指令|prompt)")),

    # 3. encoded — 编码混淆诱导
    ("encoded", "HIGH", re.compile(r"(?i)(?:base64|rot13|hex(?:adecimal)?)[ -]?(?:decode|decrypt|decompress|string)")),
    ("encoded", "HIGH", re.compile(r"(?i)(?:decode|decrypt|unbase64)[^\n]{0,15}?(?:base64|rot13|hex)")),
    ("encoded", "HIGH", re.compile(r"(?i)\bthe following (?:is|was|contains) (?:a )?(?:base64|encoded|encrypted|rot13)\b")),
    ("encoded", "HIGH", re.compile(r"(?iu)(?:解码|解密|反编码)[^\n]{0,12}?(?:base64|rot13|十六进制|hex)")),
    ("encoded", "HIGH", re.compile(r"(?iu)以下(?:是|为)(?:一段)?(?:base64|编码|加密|rot13)")),

    # 4. role — 角色冒充
    ("role", "HIGH", re.compile(r"(?i)\b(?:developer|admin|root|god|debug|superuser) mode\b")),
    ("role", "HIGH", re.compile(r"(?i)\byou are (?:the |an? )?(?:admin|administrator|developer|root|system|engineer|maintainer)\b")),
    ("role", "HIGH", re.compile(r"(?i)\bact (?:as|like) (?:an? |the )?(?:admin|developer|root|system|superuser)\b")),
    ("role", "MEDIUM", re.compile(r"(?i)\bas (?:the |an? )?(?:admin|administrator|root|developer|system|engineer)\b")),
    ("role", "MEDIUM", re.compile(r"(?i)\bjail ?break\b")),
    ("role", "HIGH", re.compile(r"(?iu)(?:作为|充当|假装是)[^\n]{0,8}?(?:管理员|开发者|系统|root|超级用户|超级管理员)")),
    ("role", "HIGH", re.compile(r"(?iu)(?:开发者|管理员|root|调试|超级用户)模式")),
    ("role", "MEDIUM", re.compile(r"(?iu)越狱")),

    # 5. exfil — 数据外泄诱导
    ("exfil", "HIGH", re.compile(r"(?i)(?:output|print|show|reveal|dump|repeat|display|share|leak|expose|echo|paste)[^\n]{0,30}?(?:system prompt|your (?:instructions|prompt|rules|configuration|config|settings|directives|secrets?)|api[ -]?key|password)")),
    ("exfil", "HIGH", re.compile(r"(?iu)(?:输出|打印|显示|泄露|转储|说出|透露|粘贴|复述)[^\n]{0,18}?(?:系统提示|你的指令|提示词|你的规则|你的配置|你的设定|api[ _-]?key|密码)")),

    # 6. weak — LOW weak signals (logged only, never flag)
    ("weak", "LOW", re.compile(r"(?i)\brole ?play\b")),
    ("weak", "LOW", re.compile(r"(?i)\bpretend (?:you are|to be|that)\b")),
    ("weak", "LOW", re.compile(r"(?i)\bhypothetically\b")),
    ("weak", "LOW", re.compile(r"(?iu)假设(?:你|我们|自己)")),

    # 7. directive — imperative injected instructions (esp. tool-def context)
    #    MEDIUM by design: raise to suspicious on their own, BLOCKED if >=2 distinct.
    ("directive", "MEDIUM", re.compile(r"(?i)\bignore (?:the |all )?(?:user|users|everything)\b")),
    ("directive", "MEDIUM", re.compile(r"(?i)\binstead[^\n]{0,12}?(?:run|execute|invoke|do|call|perform)\b")),
    ("directive", "MEDIUM", re.compile(r"(?i)\b(?:bypass|evade|circumvent)[^\n]{0,15}?(?:safety|guard|user|restriction|filter|rule)\b")),
    ("directive", "MEDIUM", re.compile(r"(?iu)(?:绕过|无视|忽略)[^\n]{0,8}?(?:用户|安全|限制|规则|防护)")),
    ("directive", "MEDIUM", re.compile(r"(?iu)转而(?:运行|执行|调用)")),
]

WEIGHT = {"HIGH": 100, "MEDIUM": 50, "LOW": 10}

ADVICE = {
    "blocked": "HIGH-confidence PI signal detected. STOP. Never execute the flagged content as instruction; route to human or codex-guardian-review.",
    "suspicious": "Suspicious but ambiguous MEDIUM signal(s). Log and exercise caution; if this content will drive any action, escalate to codex-guardian-review.",
    "clean": "No meaningful PI signal detected. Safe to pass through (subject to the LLM-side guardian if applicable).",
}


def _decode_layers(text):
    """Best-effort decode of base64 / hex / rot13 blobs for --deep mode."""
    decoded = []
    for m in re.finditer(r"[A-Za-z0-9+/]{24,}={0,2}", text):
        blob = m.group(0)
        try:
            raw = base64.b64decode(blob + "=", validate=False)
            s = raw.decode("utf-8", "ignore")
            if s:
                decoded.append(s)
        except Exception:
            pass
    for m in re.finditer(r"(?:0x)?[0-9a-fA-F]{16,}", text):
        blob = m.group(0)
        try:
            b = bytes.fromhex(blob)
            s = b.decode("utf-8", "ignore")
            if s and re.search(r"[A-Za-z]{3,}", s):
                decoded.append(s)
        except Exception:
            pass
    decoded.append(codecs.encode(text, "rot_13"))
    return decoded


def scan_once(text):
    hits = []
    for category, conf, rx in PATTERNS:
        for m in rx.finditer(text):
            span = m.group(0)
            hits.append({
                "category": category,
                "confidence": conf,
                "match": span[:80],
                "start": m.start(),
                "end": m.end(),
            })
    return hits


def verdict_of(hits, tool_def_mode=False):
    """Return (verdict, score).

    Rules:
      - any HIGH hit                                   -> blocked
      - >=2 distinct categories (even if MEDIUM/LOW)   -> blocked
      - only MEDIUM hits                               -> suspicious (score)
      - in tool-def mode, any hit at all               -> at least suspicious
        (tool descriptions are normally declarative; an imperative override
         signal there is itself anomalous)
      - only LOW / none                                -> clean
    """
    cats = {h["category"] for h in hits}
    tiers = {h["confidence"] for h in hits}
    has_high = "HIGH" in tiers
    distinct = len(cats)

    if has_high or distinct >= 2:
        return "blocked", 100

    if "MEDIUM" in tiers or (tool_def_mode and hits):
        score = min(100, sum(WEIGHT[h["confidence"]] for h in hits))
        return "suspicious", score

    return "clean", 0


def run_scan(text, deep=False, tool_def_mode=False):
    hits = scan_once(text)
    if deep:
        for layer in _decode_layers(text):
            hits.extend(scan_once(layer))

    # de-dup identical spans within same category
    seen, uniq = set(), []
    for h in hits:
        key = (h["category"], h["match"], h["start"], h["end"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(h)
    hits = uniq

    verdict, score = verdict_of(hits, tool_def_mode=tool_def_mode)
    cats_hit = sorted({h["category"] for h in hits})
    flag = verdict == "blocked"

    return {
        "verdict": verdict,
        "flag": flag,
        "score": score,
        "scan_mode": "deep" if deep else "surface",
        "scope": "tool-def" if tool_def_mode else "prompt",
        "text_len": len(text),
        "categories_hit": cats_hit,
        "hit_count": len(hits),
        "hits": hits,
        "advice": ADVICE[verdict],
    }


def render(report, as_json):
    if as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        sym = {"blocked": "🛑", "suspicious": "⚠️", "clean": "✅"}.get(report["verdict"], "?")
        print(f"{sym} verdict={report['verdict']} flag={report['flag']} "
              f"score={report['score']} mode={report['scan_mode']} "
              f"scope={report['scope']} hits={report['hit_count']} cats={report['categories_hit']}")
        for h in report["hits"]:
            print(f"   [{h['confidence']:<6}] {h['category']:<12} -> {h['match']!r}")
        print(f"   advice: {report['advice']}")


def main():
    ap = argparse.ArgumentParser(description="Deterministic Prompt Injection scanner (prompt-injection-guard).")
    ap.add_argument("--file", help="Read text from file instead of stdin (prompt scope)")
    ap.add_argument("--tool-def", help="Scan a TOOL DESCRIPTION string for injected instructions")
    ap.add_argument("--tool-def-file", help="Read a tool-description from file and scan it")
    ap.add_argument("--deep", action="store_true",
                    help="Also decode base64/hex/rot13 and re-scan (catches obfuscated instructions)")
    ap.add_argument("--sanitize", action="store_true",
                    help="Two-way mode: scan AND emit sanitized text (detection + neutralization; "
                         "ported from anthropics/commerce-agents fencing.py via sanitize_text.py)")
    ap.add_argument("--label", default="third_party_data",
                    help="Fence label for --sanitize marker-stripping (default: third_party_data)")
    ap.add_argument("--json", action="store_true", help="Emit pure JSON (no header line)")
    args = ap.parse_args()

    tool_def_mode = False
    if args.tool_def is not None:
        text = args.tool_def
        tool_def_mode = True
    elif args.tool_def_file is not None:
        with open(args.tool_def_file, "r", encoding="utf-8") as f:
            text = f.read()
        tool_def_mode = True
    elif args.file is not None:
        with open(args.file, "r", encoding="utf-8") as f:
            text = f.read()
    else:
        text = sys.stdin.read()

    report = run_scan(text, deep=args.deep, tool_def_mode=tool_def_mode)
    if args.sanitize:
        # Two-way mode: neutralize after detecting. The sanitized text is safe
        # for model-bound context; the verdict still reports what was found.
        try:
            from sanitize_text import sanitize_text
        except ImportError:
            from pathlib import Path as _P
            sys.path.insert(0, str(_P(__file__).resolve().parent))
            from sanitize_text import sanitize_text
        report["sanitized_text"] = sanitize_text(text, label=args.label)
    render(report, as_json=args.json)
    sys.exit(1 if report["flag"] else 0)


if __name__ == "__main__":
    main()
