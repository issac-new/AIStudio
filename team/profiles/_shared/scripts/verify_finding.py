#!/usr/bin/env python3
"""
verify_finding.py — 独立漏洞验证模块（执行级 PoC 复跑）

设计参照：VulnClaw `report/verifier.py` (vulnclaw/report/verifier.py:33-139)
核心信条：未经验证的漏洞 = 误报 = 不写入报告。每个 pending finding 生成
          确定性 PoC → 真跑（subprocess / python_exec 等价）→ 判定
          VERIFIED / REJECTED，仅 VERIFIED 允许进入最终报告。

与 hack-exploit SOUL 现有的"人工确认 + curl 复现（提示性纪律）"互补：
  本脚本把验证从"文字约定"升级为"可机械判定的独立验证环节"，
  对齐 YunkunSec `Verifier` 组件（候选发现验证和已验证结果管理）。

退出码：
  0 = 全部 VERIFIED
  1 = 存在 REJECTED / FALSE_POSITIVE
  2 = 输入/参数错误

用法：
  python3 verify_finding.py --target https://example.com \
      --findings findings.jsonl --poc-dir ./poc_out

findings.jsonl schema：
  {"id":"F1","vuln_type":"sql_injection","target_param":"id",
   "payload":"1' OR '1'='1","baseline_len":1234,
   "status":"pending|verified|rejected"}

PoC 模板对齐 verifier.py:103-303 的 POC_TEMPLATES（sql_injection / xss /
command_injection / lfi / sensitive_file / info_disclosure / generic）。
判定标记对齐： [CONFIRMED] / [POSSIBLE] / [REJECTED] / [ERROR]。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

# ── 判定枚举（对齐 verifier.py:33-57）─────────────────────────────────────
class VerificationStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


# ── PoC 模板（对齐 verifier.py:103-303；单花括号为 Python 语法，
#    仅 {target}/{payload}/{path}/{baseline_len} 由 str.replace 精确替换）
#    ⚠️ 不用 str.format，避免双花括号残留到生成代码中。
#    Python dict 用单层 {}，只有想保留字面量 {{ }} 才用双层。本模板全用单层 {}。
POC_TEMPLATES: dict[str, str] = {
    "sql_injection": '''
import requests
target = "{target}"
params = {"id": "{payload}"}
try:
    r = requests.get(target, params=params, timeout=10, verify=False)
    text = r.text.lower()
    sql_errors = ["sql syntax","mysql","sqlite","postgres","oracle",
                  "sqlstate","microsoft sql","odbc","you have an error in your sql"]
    for err in sql_errors:
        if err in text:
            print("[CONFIRMED] SQL注入漏洞: 检测到SQL错误特征 '%s'" % err)
            exit(0)
    print("[REJECTED] 未检测到SQL注入特征")
except Exception as e:
    print("[ERROR] %s" % e)
''',
    "xss": '''
import requests
target = "{target}"
payload = "{payload}"
try:
    r = requests.get(target, params={"q": payload}, timeout=10, verify=False)
    if payload in r.text:
        print("[CONFIRMED] XSS漏洞: payload原样反射")
        exit(0)
    print("[REJECTED] XSS payload未出现在响应中")
except Exception as e:
    print("[ERROR] %s" % e)
''',
    "command_injection": '''
import requests
target = "{target}"
params = {"cmd": "{payload}"}
try:
    r = requests.get(target, params=params, timeout=10, verify=False)
    text = r.text
    indicators = ["uid=","gid=","root:","/bin/bash","whoami"]
    for ind in indicators:
        if ind in text:
            print("[CONFIRMED] 命令注入漏洞: 检测到 '%s'" % ind)
            exit(0)
    print("[REJECTED] 未检测到命令注入特征")
except Exception as e:
    print("[ERROR] %s" % e)
''',
    "lfi": '''
import requests
target = "{target}"
payload = "{payload}"
try:
    r = requests.get(target, params={"file": payload}, timeout=10, verify=False)
    text = r.text.lower()
    indicators = ["root:", "/bin/bash", "/bin/sh", "[boot loader]", "windows"]
    for ind in indicators:
        if ind in text:
            print("[CONFIRMED] LFI漏洞: 检测到 '%s'" % ind)
            exit(0)
    print("[REJECTED] 未检测到LFI特征")
except Exception as e:
    print("[ERROR] %s" % e)
''',
    "sensitive_file": '''
import requests
target = "{target}"
path = "{path}"
try:
    r = requests.get(target + path, timeout=10, verify=False)
    if r.status_code == 200 and len(r.content) > 10:
        print("[CONFIRMED] 敏感文件可访问: %s (status=%s len=%s)" % (path, r.status_code, len(r.content)))
        exit(0)
    print("[REJECTED] 文件不可访问或为空: %s" % r.status_code)
except Exception as e:
    print("[ERROR] %s" % e)
''',
    "info_disclosure": '''
import requests
target = "{target}"
try:
    r = requests.get(target, timeout=10, verify=False)
    headers = {k.lower(): v.lower() for k, v in r.headers.items()}
    sensitive = {"x-powered-by": "技术栈信息", "server": "服务器信息", "x-aspnet-version": "ASP.NET版本"}
    found = []
    for h, desc in sensitive.items():
        if h in headers:
            found.append("%s: %s" % (h, headers[h][:50]))
    if found:
        print("[CONFIRMED] 信息泄露: %d个敏感header" % len(found))
        for item in found: print("  - %s" % item)
        exit(0)
    print("[REJECTED] 未明显信息泄露")
except Exception as e:
    print("[ERROR] %s" % e)
''',
}


@dataclass
class VerifiedFinding:
    original_id: str
    status: VerificationStatus = VerificationStatus.PENDING
    poc_code: Optional[str] = None
    poc_output: str = ""
    result: str = ""
    rejection_reason: str = ""
    suggested_severity: str = ""


def generate_poc(vuln_type: str, target: str, payload: str = "", path: str = "", baseline_len: int = 0) -> str:
    vt = (vuln_type or "").lower().replace(" ", "_")
    template = POC_TEMPLATES.get(vt) or POC_TEMPLATES.get("sql_injection")  # fallback 统一用 sql 模板结构
    replacements = {
        "{target}": target,
        "{payload}": payload,
        "{path}": path,
        "{baseline_len}": str(baseline_len),
    }
    for ph, val in replacements.items():
        template = template.replace(ph, val)
    return template


def run_poc(poc_code: str, timeout_s: int = 20) -> tuple[int, str]:
    """在临时文件里真跑 PoC，返回 (returncode, stdout)。对齐 verifier.py 的 python_execute。"""
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(poc_code)
        path = fh.name
    try:
        proc = subprocess.run(
            [sys.executable, path],
            capture_output=True, text=True, timeout=timeout_s,
        )
        return proc.returncode, (proc.stdout + proc.stderr).strip()
    except subprocess.TimeoutExpired:
        return 124, "[TIMEOUT] PoC 执行超时"
    except Exception as exc:  # noqa
        return 1, f"[ERROR] {exc}"
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def parse_result(output: str) -> tuple[VerificationStatus, str]:
    if "[CONFIRMED]" in output:
        return VerificationStatus.VERIFIED, "vuln_confirmed"
    if "[REJECTED]" in output:
        return VerificationStatus.REJECTED, "no_response_diff_or_false_positive"
    if "[ERROR]" in output or "[TIMEOUT]" in output:
        return VerificationStatus.REJECTED, "execution_error"
    return VerificationStatus.REJECTED, "inconclusive"


def verify_one(f: dict, target: str, poc_dir: str) -> VerifiedFinding:
    vf = VerifiedFinding(original_id=f.get("id", "?"))
    vt = f.get("vuln_type", "")
    poc = generate_poc(
        vt,
        target=target or f.get("target", ""),
        payload=f.get("payload", ""),
        path=f.get("path", ""),
        baseline_len=int(f.get("baseline_len", 0) or 0),
    )
    vf.poc_code = poc
    if poc_dir:
        os.makedirs(poc_dir, exist_ok=True)
        with open(os.path.join(poc_dir, f"{vf.original_id}.py"), "w", encoding="utf-8") as fh:
            fh.write(poc)
    rc, out = run_poc(poc)
    vf.poc_output = out
    vf.status, vf.result = parse_result(out)
    if vf.status == VerificationStatus.REJECTED:
        vf.rejection_reason = out[:200]
    return vf


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="独立漏洞验证模块 (PoC 执行级复跑)")
    ap.add_argument("--target", required=True, help="目标 URL/主机")
    ap.add_argument("--findings", required=True, help="findings JSONL（每行一个 finding）")
    ap.add_argument("--poc-dir", default="./poc_out", help="生成 PoC 文件目录")
    ap.add_argument("--timeout", type=int, default=20, help="单个 PoC 超时秒")
    ap.add_argument("--out", default=None, help="验证结果 JSONL 输出路径（默认打印）")
    args = ap.parse_args(argv)

    findings: list[dict] = []
    try:
        with open(args.findings, "r", encoding="utf-8") as fh:
            for ln, line in enumerate(fh, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    findings.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    print(f"[ERROR] findings 第 {ln} 行 JSON 解析失败: {exc}", file=sys.stderr)
                    return 2
    except OSError as exc:
        print(f"[ERROR] 无法读取 findings: {exc}", file=sys.stderr)
        return 2

    results: list[VerifiedFinding] = []
    for f in findings:
        if (f.get("status") or "pending") in ("verified", "rejected"):
            continue  # 已确认/已驳回的跳过
        results.append(verify_one(f, args.target, args.poc_dir))

    verified = [r for r in results if r.status == VerificationStatus.VERIFIED]
    rejected = [r for r in results if r.status == VerificationStatus.REJECTED]
    print(f"[SUMMARY] {len(verified)} verified / {len(rejected)} rejected / {len(results)} total")

    out_lines = [
        json.dumps(
            {
                "id": r.original_id,
                "status": r.status.value,
                "result": r.result,
                "poc_output": r.poc_output[:300],
                "rejection_reason": r.rejection_reason,
            },
            ensure_ascii=False,
        )
        for r in results
    ]
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write("\n".join(out_lines) + "\n")
        print(f"[OK] 写入 {args.out}")
    else:
        for line in out_lines:
            print(line)

    return 0 if not rejected else 1


if __name__ == "__main__":
    sys.exit(main())