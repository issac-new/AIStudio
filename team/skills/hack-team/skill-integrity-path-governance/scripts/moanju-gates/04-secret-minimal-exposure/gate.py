#!/usr/bin/env python3
"""04 secret 最小暴露 redactor（D4 运行时隔离与数据保护）

对应研究卡矩阵：
- P0-14 环境权限清理与范围化 Token（默认无密钥、凭据不进 ambient 环境）
- 与模块 05 执行轨迹日志配合：日志/输出落盘前先过本 redactor

机制：扫描文本/日志/模块输出，识别硬编码凭据类 pattern（API key、token、
password 赋值、私钥块、连接串内嵌凭据、AWS/GitHub/Slack 等常见 key 格式），
以 redact 占位符替换。pattern 列表可配置（--patterns-json 覆盖）。

fail-closed 原则：
- 无法判断是否凭据的长随机串默认按凭据处理（高熵启发式，宁误脱敏不漏脱敏）。
- patterns JSON 非法 -> exit 2，不静默用空规则。
- 退出码契约：0=无命中（输出原文）；1=有命中（输出已脱敏文本）。
- 本模块自身绝不打印原始命中值（报告只含 redacted 预览与 span）。
纯 Python 标准库，无第三方依赖。
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from typing import Any

# 默认凭据 pattern（id, regex, redact 保留前缀可见字符数）
# 演示用占位值仅匹配 fixture 样例格式；不包含任何真实凭据。
DEFAULT_PATTERNS: list[dict[str, Any]] = [
    {"id": "SEC-01-assignment", "label": "credential-style assignment",
     "regex": r"(?i)\b(password|passwd|pwd|secret|token|api[_-]?key|"
              r"access[_-]?key|auth[_-]?token|private[_-]?key)\b['\"]?"
              r"\s*[:=]\s*['\"]?([^\s'\"]{6,})['\"]?",
     "keep": 3},
    {"id": "SEC-02-bearer", "label": "bearer/authorization header",
     "regex": r"(?i)\b(bearer|basic)\s+([A-Za-z0-9._+/=-]{10,})",
     "keep": 3},
    {"id": "SEC-03-aws-access-key", "label": "AWS access key id",
     "regex": r"\b(AKIA[0-9A-Z]{16})\b", "keep": 4},
    {"id": "SEC-04-aws-secret", "label": "AWS secret access key",
     "regex": r"(?i)\baws.{0,20}?['\"]([A-Za-z0-9/+=]{40})['\"]", "keep": 3},
    {"id": "SEC-05-github-token", "label": "GitHub token",
     "regex": r"\b(gh[pousr]_[A-Za-z0-9]{36,})\b", "keep": 5},
    {"id": "SEC-06-private-key-block", "label": "PEM private key",
     "regex": r"-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----",
     "keep": 0},
    {"id": "SEC-07-connection-string", "label": "URL-embedded credential",
     "regex": r"\b([a-z][a-z0-9+.-]*://)([^\s:/@]+):([^\s/@]{4,})@",
     "keep": 0},
]

# 高熵启发式：>=16 字符混合字母数字长串，熵值 >=3.3 视为疑似凭据
# （宁误脱敏不漏）。阈值 3.3 实测覆盖 18 字符级弱熵 secret；覆盖
# output_summary 截断长度（120），摘要里的长 secret 也必被兜底命中。
_HIGH_ENTROPY = re.compile(r"\b([A-Za-z0-9_/+-]{16,})\b")
_ENTROPY_THRESHOLD = 3.3


def _entropy(s: str) -> float:
    if not s:
        return 0.0
    freq: dict[str, int] = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    n = len(s)
    return -sum((v / n) * math.log2(v / n) for v in freq.values())


def _mask(value: str, keep: int) -> str:
    if keep <= 0 or len(value) <= keep:
        return "[REDACTED]"
    return value[:keep] + "...[REDACTED]"


def scan(text: str, patterns: list[dict[str, Any]] | None = None
         ) -> tuple[str, list[dict[str, Any]]]:
    """返回 (redacted_text, findings)。findings 不含原始凭据值。"""
    compiled = [(p["id"], p.get("keep", 0), re.compile(p["regex"]))
                for p in (patterns or DEFAULT_PATTERNS)]
    redacted = text
    findings: list[dict[str, Any]] = []

    for pid, keep, rx in compiled:
        def _sub(m: re.Match, _pid=pid, _keep=keep) -> str:
            whole = m.group(0)
            # 选"最像凭据"的组：SEC-07（scheme://user:pass@）固定选最后一组
            # （密码体），其余规则取最长捕获组。
            groups = [g for g in m.groups() if g]
            if _pid == "SEC-07-connection-string" and groups:
                target = groups[-1]
            elif groups:
                target = max(groups, key=len)
            else:
                target = whole
            findings.append({
                "rule": _pid,
                "span": [m.start(), m.end()],
                "preview": _mask(target, _keep),
            })
            return whole.replace(target, _mask(target, _keep))
        redacted = rx.sub(_sub, redacted)

    # 高熵启发式兜底（跳过已脱敏区域附近文本；对整段再扫一遍）
    for m in _HIGH_ENTROPY.finditer(redacted):
        tok = m.group(1)
        if "[REDACTED" in tok or "..." in tok:
            continue
        has_digit = any(c.isdigit() for c in tok)
        has_alpha = any(c.isalpha() for c in tok)
        if has_digit and has_alpha and _entropy(tok) >= _ENTROPY_THRESHOLD:
            masked = _mask(tok, 4)
            findings.append({"rule": "SEC-08-high-entropy-heuristic",
                             "span": [m.start(), m.end()],
                             "preview": masked})
            redacted = redacted.replace(tok, masked)
    return redacted, findings


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="D4 secret 最小暴露 redactor")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--text", help="待扫描文本")
    g.add_argument("--file", help="待扫描文件路径")
    g.add_argument("--stdin", action="store_true", help="从 stdin 读")
    ap.add_argument("--patterns-json", help="自定义 pattern JSON（覆盖默认）")
    ap.add_argument("--out", help="脱敏结果写出路径（默认 stdout）")
    args = ap.parse_args(argv)

    patterns = None
    if args.patterns_json:
        try:
            with open(args.patterns_json, encoding="utf-8") as f:
                patterns = json.load(f)
            if not isinstance(patterns, list) or not patterns:
                raise ValueError("patterns must be a non-empty list")
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            print(json.dumps({"error": f"config_error: {exc}"},
                             ensure_ascii=False))
            return 2

    try:
        if args.text is not None:
            text = args.text
        elif args.file is not None:
            with open(args.file, encoding="utf-8") as f:
                text = f.read()
        else:
            text = sys.stdin.read()
    except OSError as exc:
        print(json.dumps({"error": f"input_error: {exc}"}, ensure_ascii=False))
        return 2

    redacted, findings = scan(text, patterns=patterns)
    report = {"matched": bool(findings), "findings": findings}
    print(json.dumps(report, ensure_ascii=False))
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(redacted)
    else:
        sys.stderr.write("--- redacted ---\n" + redacted + "\n")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
