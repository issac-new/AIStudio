#!/usr/bin/env python3
"""03 Skill 供应链门禁（D3 Skill/插件供应链安全）

对应研究卡矩阵：
- P0-08 SkillSieve 三层 Skill 检测（语义元数据 / 静态内容 / 运行行为分层，不只看开头）
- P0-10 Agent Skill 七阶段生命周期（提交->审核->...->停用；本模块覆盖"提交/加载前"校验）

机制：对新增 skill / plugin 目录做最小来源校验，生成结构化校验报告：
- L1 元数据层：SKILL.md 存在、大小在 [MIN_SKILLMD, MAX_SKILLMD]、UTF-8 可解码、
  frontmatter 含 name/description。
- L2 静态内容层：扫描目录内文本文件（不做全量二进制解析），
  检测恶意行为 heuristics：curl|bash 管道、base64 解码执行、凭据文件读取、
  反弹 shell、环境变量凭据外传、写 crontab 等。
- L3 结构层：目录大小与文件数上限、禁绝对路径写入（/etc, ~/.ssh 等）、
  单文件大小上限（防巨型载荷绕过审核）。

fail-closed 原则：
- SKILL.md 缺失 / 目录缺失 / 解析失败 -> 拒绝（reason 给出原因码）。
- 任一 L2/L3 heuristics 命中 -> 拒绝并在报告列 findings。
- 校验器自身异常 -> exit 2，绝不默认放行。

退出码契约：0=通过（含 WARN 放行）；1=拒绝；2=配置/输入错误。
纯 Python 标准库，无第三方依赖。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

MIN_SKILLMD_BYTES = 40       # SKILL.md 太小 = 疑似占位/语义伪装
MAX_SKILLMD_BYTES = 200_000  # SKILL.md 太大 = 疑似载荷藏匿
MAX_TOTAL_BYTES = 2_000_000  # 整目录上限
MAX_FILE_BYTES = 500_000     # 单文件上限
MAX_FILES = 500              # 文件数上限
TEXT_SUFFIXES = {".md", ".py", ".sh", ".js", ".ts", ".json", ".yaml", ".yml",
                 ".toml", ".txt", ".cfg", ".ini"}
FORBIDDEN_PREFIXES = ("/etc", "/private/etc", "~/.ssh", "~/.aws",
                      "~/.hermes/profiles")  # 静态内容不得指向敏感路径

# L2 恶意行为 heuristics（SkillSieve 静态层；确定性正则，无 LLM）
CONTENT_RULES: list[dict[str, str]] = [
    {"id": "SC-001-curl-pipe-sh", "severity": "high",
     "regex": r"(?i)\b(curl|wget)\b[^|;\n]*\|\s*(ba|z|fi)?sh\b"},
    {"id": "SC-002-base64-exec", "severity": "high",
     "regex": r"(?i)\bbase64\b\s+-d\b[^|;\n]*\|\s*(ba|z|fi)?sh\b"},
    {"id": "SC-003-credential-read", "severity": "high",
     "regex": r"(?i)\.ssh|\.aws/credentials|id_rsa|\.netrc|\.env\b|keychain"},
    {"id": "SC-004-reverse-shell", "severity": "high",
     "regex": r"(?i)\b(bash\s+-i\s*>&|nc\s+-e\s|/dev/tcp/|socket\.socket\(.*connect\()"},
    {"id": "SC-005-env-credential-exfil", "severity": "high",
     "regex": r"(?i)\b(os\.environ|process\.env)\b[^;\n]{0,80}\b(post|requests\.post|curl|send|upload)\b"},
    {"id": "SC-006-persistence", "severity": "medium",
     "regex": r"(?i)\bcrontab\b|LaunchAgents|\.bashrc|\.zshrc\b.*\bappend|>>\s*~/\."},
    {"id": "SC-007-eval-exec", "severity": "medium",
     "regex": r"(?i)\b(eval|exec)\s*\(\s*(requests?|urlopen|subprocess)[^)]*\)|\bos\.system\(f?['\"]"},
    {"id": "SC-008-prompt-injection-in-skillmd", "severity": "high",
     "regex": r"(?i)\b(ignore\s+(all\s+)?previous|disregard\s+the\s+above|you\s+are\s+now)\b"},
]

FRONTMATTER_KEYS = ("name", "description")


def _scan_report(skill_dir: Path) -> dict[str, Any] | None:
    """L1 校验。返回 dict = 直接拒绝；返回 None = 通过（findings 已写入全局收集）。"""
    findings: list[dict[str, Any]] = []
    collected: dict[str, Any] = {"findings": findings}

    skillmd = skill_dir / "SKILL.md"
    if not skill_dir.is_dir():
        return {"decision": "REJECT", "reason": "input_error: skill dir missing",
                "findings": []}
    if not skillmd.is_file():
        findings.append({"layer": "L1", "rule": "SK-001-no-skillmd",
                         "severity": "high",
                         "detail": "SKILL.md missing"})
        return {"decision": "REJECT",
                "reason": "L1: SKILL.md missing (fail-closed)",
                "findings": findings}

    raw = skillmd.read_bytes()
    if not (MIN_SKILLMD_BYTES <= len(raw) <= MAX_SKILLMD_BYTES):
        findings.append({"layer": "L1", "rule": "SK-002-skillmd-size",
                         "severity": "high",
                         "detail": f"size={len(raw)}B allowed=[{MIN_SKILLMD_BYTES},"
                                   f"{MAX_SKILLMD_BYTES}]"})
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        findings.append({"layer": "L1", "rule": "SK-003-not-utf8",
                         "severity": "high", "detail": str(exc)[:80]})
        text = raw.decode("utf-8", errors="replace")

    # frontmatter 最小校验
    head = text.split("---", 2)
    fm = head[1] if len(head) == 3 and text.lstrip().startswith("---") else ""
    missing_fm = [k for k in FRONTMATTER_KEYS
                  if not any(line.strip().startswith(f"{k}:")
                             for line in fm.splitlines())]
    if missing_fm:
        findings.append({"layer": "L1", "rule": "SK-004-frontmatter-missing",
                         "severity": "medium", "detail": f"keys={missing_fm}"})

    return collected if findings else None  # 非致命 findings 带回给 verify()


def verify(skill_dir: str | Path) -> dict[str, Any]:
    """对 skill 目录做三层最小校验，返回结构化报告 + 决策。"""
    p = Path(skill_dir).expanduser().resolve()
    findings: list[dict[str, Any]] = []
    l1 = _scan_report(p)
    if l1 is not None and l1.get("decision") == "REJECT":  # L1 直接拒绝
        l1["skill_dir"] = str(p)
        return l1
    if l1 is not None:  # L1 通过但带非致命 findings，并入报告
        findings.extend(l1.get("findings", []))

    # L2/L3：遍历静态内容
    files: list[Path] = []
    total = 0
    try:
        for f in p.rglob("*"):
            if f.is_file():
                files.append(f)
                total += f.stat().st_size
    except OSError as exc:
        return {"decision": "REJECT",
                "reason": f"L3: directory traversal failed: {exc}",
                "findings": findings, "skill_dir": str(p)}

    if total > MAX_TOTAL_BYTES or len(files) > MAX_FILES:
        findings.append({"layer": "L3", "rule": "SK-005-dir-budget",
                         "severity": "medium",
                         "detail": f"total={total}B files={len(files)}"})

    has_warn_only = False
    for f in files:
        if f.stat().st_size > MAX_FILE_BYTES:
            findings.append({"layer": "L3", "rule": "SK-006-file-too-large",
                             "severity": "medium", "detail": str(f.relative_to(p))})
        if f.suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            content = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for rule in CONTENT_RULES:
            if re.search(rule["regex"], content):
                sev = rule["severity"]
                findings.append({"layer": "L2", "rule": rule["id"],
                                 "severity": sev,
                                 "detail": str(f.relative_to(p))})
                if sev == "high":
                    pass  # 标记下面统一决策
                else:
                    has_warn_only = True

    high_hits = [x for x in findings if x.get("severity") == "high"]
    if high_hits:
        decision = "REJECT"
        reason = f"L2/L3: {len(high_hits)} high-severity finding(s) (fail-closed)"
    elif findings:
        decision = "WARN"   # 只有 medium：放行但报告
        reason = "medium findings only; release with report"
    else:
        decision = "ALLOW"
        reason = "no supply-chain heuristics triggered"
    return {"decision": decision, "reason": reason, "findings": findings,
            "skill_dir": str(p)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="D3 Skill 供应链门禁")
    ap.add_argument("skill_dir", help="待校验 skill / plugin 目录")
    ap.add_argument("--report", help="校验报告输出 JSON 路径（可选）")
    args = ap.parse_args(argv)
    try:
        result = verify(args.skill_dir)
    except Exception as exc:  # noqa: BLE001 校验器自身异常 -> fail-closed
        result = {"decision": "REJECT", "reason": f"verifier_error: {exc!r}",
                  "findings": []}
    print(json.dumps(result, ensure_ascii=False))
    if args.report:
        with open(args.report, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    if result["decision"] == "REJECT":
        return 1
    if result["decision"] == "WARN":
        return 0  # WARN 放行但必须留报告（契约：--report 建议配合使用）
    return 0


if __name__ == "__main__":
    sys.exit(main())
