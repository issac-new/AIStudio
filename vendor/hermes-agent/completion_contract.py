"""完成契约（DoD）的派生、校验与证据重算。

设计边界（2026-10-31 模型波动加固 A 层）：
- 契约来自任务 body 的 ``AC-n`` 行或 ```dod JSON 块；派发时由 dispatcher 写入
  ``HERMES_KANBAN_DOD_CONTRACT`` 并锁定契约源哈希，worker 改卡面无法削弱契约。
- 回执只做确定性重算：路径存在性、sha256/字节数、TAP/JUnit 计数与失败数。
  不执行验证命令（复跑属独立验证层），因此完成门本身不产生副作用。
- 无 AC 且无 dod 块的卡 ``mode=off``，行为与加固前一致；有声明但声明畸形时
  ``mode=enforce`` + ``invalid``，完成被拒而不是静默放行。
"""
from __future__ import annotations

import fnmatch
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

CONTRACT_ENV = "HERMES_KANBAN_DOD_CONTRACT"
SOURCE_SHA_ENV = "HERMES_KANBAN_DOD_SOURCE_SHA256"
VERSION = 1

MAX_SOURCE_BYTES = 64 * 1024
MAX_RECEIPT_BYTES = 256 * 1024
MAX_REPORT_BYTES = 8 * 1024 * 1024
MAX_CRITERIA = 64
MAX_EVIDENCE = 64
MAX_ARTIFACTS = 128
MAX_VERIFICATIONS = 32
MAX_PATH_LEN = 512
MAX_STATEMENT_LEN = 500
MAX_COMMAND_LEN = 500

ALLOWED_MODES = {"off", "warn", "enforce"}
ALLOWED_REQUIREMENTS = {"evidence", "artifact", "test", "command", "doc"}
ALLOWED_STATUS = {"pass", "fail", "na"}
ALLOWED_FORMATS = {"tap", "junit", "text"}
ALLOWED_KINDS = {"artifact", "test_report", "command", "doc", "other"}

_AC_LINE = re.compile(r"^\s*(?:[-*+]\s+)?(AC[-_ ]?\d+)\b[^\n]*$", re.IGNORECASE | re.MULTILINE)
_DOD_FENCE = re.compile(r"```dod[ \t]*\r?\n(.*?)```", re.IGNORECASE | re.DOTALL)
_DOD_COMMENT = re.compile(r"<!--\s*dod:\s*(\{.*?\})\s*-->", re.IGNORECASE | re.DOTALL)
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_AC_PREFIX = re.compile(r"^[-*+\s]*AC[-_ ]?\d+\s*[:：.\-–]?\s*", re.IGNORECASE)


class ContractViolation(ValueError):
    """回执不满足契约。消息直接面向 worker，必须写明改法。"""


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _norm_ac_id(raw: str) -> str:
    digits = re.search(r"\d+", raw or "")
    return f"AC-{digits.group(0)}" if digits else (raw or "").strip().upper()


def _ac_statements(body: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for match in _AC_LINE.finditer(body or ""):
        cid = _norm_ac_id(match.group(1))
        if not cid or cid in seen:
            continue
        seen.add(cid)
        line = match.group(0).strip()
        statement = _AC_PREFIX.sub("", line).strip()
        out.append({"id": cid, "statement": statement[:MAX_STATEMENT_LEN]})
    return out


def _extract_dod(body: str) -> Any:
    for pattern in (_DOD_FENCE, _DOD_COMMENT):
        matches = pattern.findall(body or "")
        if matches:
            raw = matches[-1].strip()
            try:
                return json.loads(raw)
            except Exception as exc:  # noqa: BLE001 - 组合成可行动的 invalid 原因
                return {"__invalid__": f"dod JSON 解析失败：{exc}"}
    return None


def contract_source(body: str) -> str:
    """契约源的正规范化文本：只含 AC 行与 dod 块，正文其它改动不改变哈希。"""
    canonical = {
        "acs": _ac_statements(body),
        "dod": _extract_dod(body),
    }
    return json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def contract_source_sha256(body: str) -> str:
    return _sha256_bytes(contract_source(body).encode("utf-8"))


def _safe_glob(value: str) -> bool:
    if not value or len(value) > 256 or "\x00" in value:
        return False
    if value.startswith(("/", "\\")) or re.match(r"^[A-Za-z]:", value):
        return False
    return ".." not in Path(value.replace("\\", "/")).parts


def _normalize_contract(raw: dict[str, Any]) -> dict[str, Any]:
    mode = str(raw.get("mode") or "enforce").strip().lower()
    if mode not in ALLOWED_MODES:
        raise ContractViolation(f"contract.mode 必须是 {sorted(ALLOWED_MODES)}，收到 {mode!r}")

    criteria_raw = raw.get("criteria") or []
    if not isinstance(criteria_raw, list) or len(criteria_raw) > MAX_CRITERIA:
        raise ContractViolation(f"contract.criteria 必须是数组且不超过 {MAX_CRITERIA} 条")
    criteria: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(criteria_raw):
        if not isinstance(item, dict):
            raise ContractViolation(f"contract.criteria[{index}] 不是对象")
        cid = str(item.get("id") or "").strip()
        if not cid or len(cid) > 64 or cid in seen:
            raise ContractViolation(f"contract.criteria[{index}].id 为空/超长/重复：{cid!r}")
        seen.add(cid)
        require_raw = item.get("require") or ["evidence"]
        if not isinstance(require_raw, list) or not require_raw:
            raise ContractViolation(f"{cid}.require 必须是非空数组")
        require: list[str] = []
        for value in require_raw:
            key = str(value).strip().lower()
            if key not in ALLOWED_REQUIREMENTS:
                raise ContractViolation(f"{cid}.require 含未知项 {key!r}（允许 {sorted(ALLOWED_REQUIREMENTS)}）")
            if key not in require:
                require.append(key)
        criteria.append({
            "id": cid,
            "statement": str(item.get("statement") or "")[:MAX_STATEMENT_LEN],
            "require": require,
        })

    min_tests = raw.get("minTests") or 0
    if not isinstance(min_tests, int) or isinstance(min_tests, bool) or not (0 <= min_tests <= 100000):
        raise ContractViolation("contract.minTests 必须是 0..100000 的整数")

    globs_raw = raw.get("artifactGlobs") or []
    if not isinstance(globs_raw, list) or len(globs_raw) > 16:
        raise ContractViolation("contract.artifactGlobs 必须是不超过 16 条的数组")
    globs: list[str] = []
    for value in globs_raw:
        text = str(value).strip().replace("\\", "/")
        if not _safe_glob(text):
            raise ContractViolation(f"artifactGlobs 非法（不得绝对路径/含 ..）：{value!r}")
        globs.append(text)

    source_sha = str(raw.get("sourceSha256") or "")
    if source_sha and not _SHA256.match(source_sha):
        raise ContractViolation("contract.sourceSha256 不是 64 位十六进制")
    invalid = raw.get("invalid")
    out: dict[str, Any] = {
        "version": VERSION,
        "mode": mode,
        "criteria": criteria,
        "minTests": min_tests,
        "artifactGlobs": globs,
        "sourceSha256": source_sha,
    }
    if invalid:
        out["invalid"] = str(invalid)[:1000]
    return out


def derive_contract(body: str) -> dict[str, Any]:
    """从任务 body 派生契约。畸形声明返回 enforce+invalid（不静默关闭）。"""
    body = body or ""
    if len(body.encode("utf-8")) > MAX_SOURCE_BYTES:
        body = body.encode("utf-8")[:MAX_SOURCE_BYTES].decode("utf-8", "ignore")
    source_sha = contract_source_sha256(body)
    acs = _ac_statements(body)
    dod = _extract_dod(body)

    if isinstance(dod, dict) and dod.get("__invalid__"):
        return {
            "version": VERSION, "mode": "enforce", "criteria": [], "minTests": 0,
            "artifactGlobs": [], "sourceSha256": source_sha,
            "invalid": str(dod["__invalid__"]),
        }
    if dod is not None and not isinstance(dod, dict):
        return {
            "version": VERSION, "mode": "enforce", "criteria": [], "minTests": 0,
            "artifactGlobs": [], "sourceSha256": source_sha,
            "invalid": "dod 块必须是 JSON 对象",
        }
    if dod is None and not acs:
        return {
            "version": VERSION, "mode": "off", "criteria": [], "minTests": 0,
            "artifactGlobs": [], "sourceSha256": source_sha,
        }

    raw: dict[str, Any] = dict(dod or {})
    criteria = raw.get("criteria")
    if not isinstance(criteria, list) or not criteria:
        criteria = [{"id": ac["id"], "statement": ac["statement"], "require": ["evidence"]} for ac in acs]
    else:
        # dod 块不得漏掉 body 里已声明的 AC：缺的按默认要求补回。
        declared = {str(item.get("id") or "") for item in criteria if isinstance(item, dict)}
        for ac in acs:
            if ac["id"] not in declared:
                criteria.append({"id": ac["id"], "statement": ac["statement"], "require": ["evidence"]})
    raw["criteria"] = criteria
    raw["mode"] = raw.get("mode") or "enforce"
    raw["sourceSha256"] = source_sha
    try:
        return _normalize_contract(raw)
    except ContractViolation as exc:
        return {
            "version": VERSION, "mode": "enforce", "criteria": [], "minTests": 0,
            "artifactGlobs": [], "sourceSha256": source_sha, "invalid": str(exc),
        }


def parse_contract(raw: str) -> dict[str, Any]:
    if not raw or not raw.strip():
        raise ContractViolation("完成契约为空")
    try:
        value = json.loads(raw)
    except ValueError as exc:
        raise ContractViolation(f"完成契约不是合法 JSON：{exc}") from None
    if not isinstance(value, dict):
        raise ContractViolation("完成契约必须是 JSON 对象")
    if value.get("version") != VERSION:
        raise ContractViolation(f"完成契约 version 必须是 {VERSION}")
    return _normalize_contract(value)


def _resolve_under(root: Path, rel: str, *, field: str) -> Path:
    text = str(rel or "").strip()
    if not text or len(text) > MAX_PATH_LEN or "\x00" in text:
        raise ContractViolation(f"{field} 路径为空/超长/含 NUL")
    if Path(text).is_absolute():
        raise ContractViolation(f"{field} 必须相对 workspace：{text}")
    target = (root / text).resolve()
    if target != root and root not in target.parents:
        raise ContractViolation(f"{field} 越出 workspace：{text}")
    if not target.is_file():
        raise ContractViolation(f"{field} 文件不存在：{text}")
    return target


def _file_fingerprint(path: Path, expected_sha: str | None, *, field: str) -> dict[str, Any]:
    data = path.read_bytes()
    actual = _sha256_bytes(data)
    if expected_sha:
        expected = str(expected_sha).strip().lower()
        if not _SHA256.match(expected):
            raise ContractViolation(f"{field} sha256 不是 64 位十六进制")
        if actual != expected:
            raise ContractViolation(f"{field} sha256 不匹配：声明 {expected}，实际 {actual}")
    return {"sha256": actual, "bytes": len(data)}


def _normalize_evidence(root: Path, item: Any, *, field: str) -> dict[str, Any]:
    if isinstance(item, str):
        kind, rel, expected_sha = "artifact", item, None
    elif isinstance(item, dict):
        kind = str(item.get("kind") or "artifact").strip().lower()
        if kind not in ALLOWED_KINDS:
            raise ContractViolation(f"{field}.kind 未知：{kind!r}")
        rel = item.get("path")
        expected_sha = item.get("sha256")
        if not isinstance(rel, str):
            raise ContractViolation(f"{field}.path 必须是字符串")
    else:
        raise ContractViolation(f"{field} 必须是路径字符串或对象")
    path = _resolve_under(root, str(rel), field=field)
    fingerprint = _file_fingerprint(path, expected_sha if isinstance(expected_sha, str) else None, field=field)
    return {"kind": kind, "path": Path(str(rel)).as_posix(), **fingerprint}


def _parse_tap(text: str) -> tuple[int, int]:
    tests = failures = 0
    for line in text.splitlines():
        stripped = line.strip()
        if re.match(r"^ok\b", stripped):
            tests += 1
        elif re.match(r"^not ok\b", stripped):
            tests += 1
            failures += 1
    if tests == 0:
        raise ContractViolation("TAP 报告没有任何 ok/not ok 行，不能作为测试证据")
    return tests, failures


def _parse_junit(text: str) -> tuple[int, int]:
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise ContractViolation(f"JUnit XML 解析失败：{exc}") from None
    if root.tag == "testsuite":
        suites = [root]
    elif root.tag == "testsuites":
        suites = root.findall("testsuite")
    else:
        suites = list(root.iter("testsuite"))
    if not suites:
        raise ContractViolation("JUnit 报告没有 testsuite 节点")
    tests = failures = 0
    for suite in suites:
        try:
            tests += int(suite.get("tests") or 0)
            failures += int(suite.get("failures") or 0) + int(suite.get("errors") or 0)
        except ValueError:
            raise ContractViolation("JUnit testsuite 的 tests/failures/errors 不是整数") from None
    if tests == 0:
        raise ContractViolation("JUnit 报告 tests=0，不能作为测试证据")
    return tests, failures


def _infer_format(report: Path, declared: str | None) -> str:
    if declared:
        fmt = str(declared).strip().lower()
        if fmt not in ALLOWED_FORMATS:
            raise ContractViolation(f"verification.format 必须是 {sorted(ALLOWED_FORMATS)}")
        return fmt
    suffix = report.suffix.lower()
    if suffix in (".tap",):
        return "tap"
    if suffix in (".xml", ".junit"):
        return "junit"
    head = report.read_bytes()[:512].decode("utf-8", "ignore").lstrip()
    if head.startswith("<?xml") or head.startswith("<testsuite") or head.startswith("<testsuites"):
        return "junit"
    if re.search(r"^(ok|not ok)\b", head, re.MULTILINE):
        return "tap"
    return "text"


def _match_any(path: str, globs: list[str]) -> bool:
    normalized = path.replace("\\", "/")
    return any(
        fnmatch.fnmatchcase(normalized, glob) or fnmatch.fnmatchcase(Path(normalized).name, glob)
        for glob in globs
    )


def validate_receipt(contract: dict[str, Any], receipt: Any, workspace: str | Path) -> dict[str, Any]:
    """校验回执并返回可落库的规范化结果；违规抛 ContractViolation。"""
    contract = _normalize_contract(contract)
    if contract["mode"] == "off":
        return {"ok": True, "skipped": "off", "contractSha256": _sha256_bytes(json.dumps(contract, sort_keys=True).encode())}
    if contract.get("invalid"):
        raise ContractViolation(
            f"任务的完成契约声明无效：{contract['invalid']}。修正卡面 AC/dod 块后由派发方重新下发契约，"
            "不要伪造回执。"
        )
    if not isinstance(receipt, dict):
        raise ContractViolation(
            "缺少结构化回执。请在 kanban_complete 的 receipt 参数中提供："
            '{"version":1,"criteria":[{"id":"AC-1","status":"pass","evidence":[{"path":"..."}]}],'
            '"verifications":[{"command":"...","exitCode":0,"report":"...","format":"tap|junit"}]}'
        )
    if receipt.get("version") != VERSION:
        raise ContractViolation(f"receipt.version 必须是 {VERSION}")
    encoded = json.dumps(receipt, ensure_ascii=False).encode("utf-8")
    if len(encoded) > MAX_RECEIPT_BYTES:
        raise ContractViolation(f"receipt 超过 {MAX_RECEIPT_BYTES} 字节，请只保留可核验证据")

    root = Path(workspace).expanduser().resolve()
    if not root.is_dir():
        raise ContractViolation(f"workspace 不是目录，无法核验证据：{root}")

    criteria_contract = {item["id"]: item for item in contract["criteria"]}
    receipt_criteria = receipt.get("criteria")
    if not isinstance(receipt_criteria, list):
        raise ContractViolation("receipt.criteria 必须是数组")
    seen: set[str] = set()
    validated: list[dict[str, Any]] = []
    for index, item in enumerate(receipt_criteria):
        if not isinstance(item, dict):
            raise ContractViolation(f"receipt.criteria[{index}] 不是对象")
        cid = str(item.get("id") or "").strip()
        if cid not in criteria_contract:
            raise ContractViolation(f"receipt 含契约外 criterion：{cid!r}（允许 {sorted(criteria_contract)}）")
        if cid in seen:
            raise ContractViolation(f"receipt 重复声明 criterion：{cid}")
        seen.add(cid)
        status = str(item.get("status") or "").strip().lower()
        if status not in ALLOWED_STATUS:
            raise ContractViolation(f"{cid}.status 必须是 {sorted(ALLOWED_STATUS)}")
        if status == "fail":
            raise ContractViolation(f"{cid} 自报 fail——失败项不能用于完成；修复后重新提交，或 kanban_block 说明阻塞")
        note = str(item.get("note") or "").strip()
        if status == "na" and not note:
            raise ContractViolation(f"{cid} 标记 na 必须写 note 说明为何不适用")
        evidence_raw = item.get("evidence") or []
        if not isinstance(evidence_raw, list) or len(evidence_raw) > MAX_EVIDENCE:
            raise ContractViolation(f"{cid}.evidence 必须是不超过 {MAX_EVIDENCE} 条的数组")
        if status == "pass" and not evidence_raw:
            raise ContractViolation(f"{cid} 标记 pass 但没有任何 evidence（路径/报告），不能作为通过依据")
        evidence = [
            _normalize_evidence(root, value, field=f"{cid}.evidence[{position}]")
            for position, value in enumerate(evidence_raw)
        ]
        require = criteria_contract[cid]["require"]
        kinds = {entry["kind"] for entry in evidence}
        if "artifact" in require and not evidence:
            raise ContractViolation(f"{cid} 要求 artifact 证据，但 evidence 为空")
        if "doc" in require and "doc" not in kinds:
            raise ContractViolation(f"{cid} 要求 doc 证据，但 evidence 未提供 kind=doc 的条目")
        validated.append({
            "id": cid,
            "status": status,
            "note": note[:MAX_STATEMENT_LEN],
            "evidence": evidence,
        })

    missing = sorted(set(criteria_contract) - seen)
    if missing:
        raise ContractViolation(f"回执缺少契约要求的 criterion：{', '.join(missing)}")

    artifacts_raw = receipt.get("artifacts") or []
    if not isinstance(artifacts_raw, list) or len(artifacts_raw) > MAX_ARTIFACTS:
        raise ContractViolation(f"receipt.artifacts 必须是不超过 {MAX_ARTIFACTS} 条的数组")
    artifacts = [
        _normalize_evidence(root, value, field=f"artifacts[{position}]")
        for position, value in enumerate(artifacts_raw)
    ]
    if contract["artifactGlobs"]:
        if not any(_match_any(item["path"], contract["artifactGlobs"]) for item in artifacts):
            raise ContractViolation(
                f"契约要求至少一个产物匹配 {contract['artifactGlobs']}，回执 artifacts 均不匹配"
            )

    verifications_raw = receipt.get("verifications") or []
    if not isinstance(verifications_raw, list) or len(verifications_raw) > MAX_VERIFICATIONS:
        raise ContractViolation(f"receipt.verifications 必须是不超过 {MAX_VERIFICATIONS} 条的数组")
    verifications: list[dict[str, Any]] = []
    total_tests = total_failures = 0
    machine_evidence = False
    for index, item in enumerate(verifications_raw):
        if not isinstance(item, dict):
            raise ContractViolation(f"verifications[{index}] 不是对象")
        command = str(item.get("command") or "").strip()
        if not command or len(command) > MAX_COMMAND_LEN:
            raise ContractViolation(f"verifications[{index}].command 为空或超长")
        exit_code = item.get("exitCode")
        if not isinstance(exit_code, int) or isinstance(exit_code, bool):
            raise ContractViolation(f"verifications[{index}].exitCode 必须是整数")
        if exit_code != 0:
            raise ContractViolation(f"verifications[{index}] 退出码 {exit_code}≠0，不能作为通过证据")
        report_raw = item.get("report")
        if report_raw is None or str(report_raw).strip() == "":
            fmt = str(item.get("format") or "text").strip().lower()
            if fmt != "text":
                raise ContractViolation(f"verifications[{index}] 声明 {fmt} 但未提供 report 路径")
            verifications.append({"command": command, "exitCode": exit_code, "format": "text",
                                  "tests": None, "failures": None})
            continue
        report = _resolve_under(root, str(report_raw), field=f"verifications[{index}].report")
        size = report.stat().st_size
        if size > MAX_REPORT_BYTES:
            raise ContractViolation(f"verifications[{index}].report 超过 {MAX_REPORT_BYTES} 字节")
        text = report.read_text(encoding="utf-8", errors="replace")
        fmt = _infer_format(report, item.get("format") if isinstance(item.get("format"), str) else None)
        if fmt == "text":
            verifications.append({"command": command, "exitCode": exit_code, "format": "text",
                                  "path": Path(str(report_raw)).as_posix(), "tests": None, "failures": None,
                                  "sha256": _sha256_bytes(report.read_bytes())})
            continue
        tests, failures = _parse_tap(text) if fmt == "tap" else _parse_junit(text)
        if failures > 0:
            raise ContractViolation(
                f"verifications[{index}] 报告有 {failures} 个失败，不能作为通过证据"
            )
        machine_evidence = True
        total_tests += tests
        total_failures += failures
        verifications.append({
            "command": command, "exitCode": exit_code, "format": fmt,
            "path": Path(str(report_raw)).as_posix(), "tests": tests, "failures": failures,
            "sha256": _sha256_bytes(report.read_bytes()),
        })

    if contract["minTests"] > 0 and total_tests < contract["minTests"]:
        raise ContractViolation(
            f"契约要求至少 {contract['minTests']} 个测试，回执可重算的测试数为 {total_tests}"
        )
    needs_test = any("test" in item["require"] for item in criteria_contract.values())
    if needs_test and not machine_evidence:
        raise ContractViolation("至少一条 criterion 要求 test 证据，但回执没有 TAP/JUnit 可重算报告")

    contract_sha = _sha256_bytes(
        json.dumps(
            {key: contract[key] for key in ("version", "mode", "criteria", "minTests", "artifactGlobs", "sourceSha256")},
            ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        ).encode("utf-8")
    )
    return {
        "ok": True,
        "version": VERSION,
        "contractSha256": contract_sha,
        "sourceSha256": contract.get("sourceSha256") or None,
        "criteria": validated,
        "artifacts": artifacts,
        "verifications": verifications,
        "totals": {"tests": total_tests, "failures": total_failures},
    }
