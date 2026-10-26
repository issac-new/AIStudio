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

XSS 判定分级（执行级验证，t_fa06c2e7 / gap-20261007-006，对齐 Google
PageBreak 纪律「反射 ≠ 可利用」）：
  [CONFIRMED] = 执行级证据：headless 浏览器真实加载注入 URL 后脚本执行
                （window.__xss_poc==1 或 alert dialog 触发）→ VERIFIED
  [REFLECTED] = 仅反射级证据：payload 原样回显但未执行（CSP/sanitizer/
                上下文转义阻断），或无浏览器引擎 fail-safe → REFLECTED
                状态（Candidate 级，不得计入 VERIFIED / 最终报告）
  [REJECTED]  = payload 未出现在响应中 → REJECTED
  DOM XSS 不在本模板范围（需 source→sink 审计，见 redteam-xss SKILL.md）。

环境变量：
  VF_XSS_PLAYWRIGHT  Node playwright 包目录覆盖（默认依次探测
                     ./node_modules/playwright 与
                     ~/.hermes/hermes-agent/node_modules/playwright）；
                     置 "0" 强制禁用浏览器（反射命中即输出 REFLECTED）。

退出码：
  0 = 全部 VERIFIED（REFLECTED 不改变退出码，仅降级状态）
  1 = 存在 REJECTED / FALSE_POSITIVE
  2 = 输入/参数错误
  --selftest 模式：0 = 全部场景通过，1 = 存在失败

用法：
  python3 verify_finding.py --target https://example.com \
      --findings findings.jsonl --poc-dir ./poc_out

findings.jsonl schema：
  {"id":"F1","vuln_type":"sql_injection","target_param":"id",
   "payload":"1' OR '1'='1","baseline_len":1234,
   "status":"pending|verified|rejected"}
  XSS 额外支持 "param"（覆盖 target_param，缺省 q）。

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

# ── 判定枚举（对齐 verifier.py:33-57；REFLECTED 为 XSS 执行级分级新增，
#    t_fa06c2e7：仅反射 ≠ 可利用，不得计入 VERIFIED）───────────────────────
class VerificationStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REFLECTED = "reflected"  # Candidate 级：反射命中但无执行级证据（XSS 专用）
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
import json, os, shutil, subprocess, tempfile, urllib.parse
import requests
target = "{target}"
payload = "{payload}"
param = "{param}"

def _join_url(base, qs):
    return base + ("&" if "?" in base else "?") + qs

full = _join_url(target, urllib.parse.urlencode({param: payload}))
probe_url = _join_url(target, urllib.parse.urlencode({param: '<svg onload="window.__xss_poc=1;alert(1)">'}))

NODE_JS = r"""
const {chromium} = require(process.env.VF_PW_PATH);
(async () => {
  const b = await chromium.launch({headless: true});
  const p = await b.newPage();
  const st = {dialogs: []};
  p.on('dialog', async d => { st.dialogs.push(d.type() + ':' + String(d.message())); try { await d.dismiss(); } catch (e) {} });
  let resp = null;
  try { resp = await p.goto(process.env.VF_URL, {waitUntil: 'load', timeout: 15000}); }
  catch (e) { try { resp = await p.goto(process.env.VF_URL, {waitUntil: 'domcontentloaded', timeout: 10000}); } catch (e2) {} }
  await p.waitForTimeout(1500);
  let marker = false;
  try { marker = (await p.evaluate(() => window.__xss_poc)) === 1; } catch (e) {}
  console.log('VF_EXEC_JSON ' + JSON.stringify({executed: marker || st.dialogs.length > 0, marker: marker, dialogs: st.dialogs, http_status: resp ? resp.status() : null}));
  await b.close();
  process.exit(0);
})().catch(e => { console.log('VF_EXEC_ERR ' + String(e).slice(0, 300)); process.exit(3); });
"""

def _find_engine():
    override = os.environ.get("VF_XSS_PLAYWRIGHT", "").strip()
    if override == "0":
        return None
    cands = []
    if override:
        cands.append(override)
    cands.append(os.path.join(os.getcwd(), "node_modules", "playwright"))
    cands.append(os.path.expanduser("~/.hermes/hermes-agent/node_modules/playwright"))
    for c in cands:
        if c and os.path.isfile(os.path.join(c, "package.json")):
            return c
    return None

def _exec_check(engine, url):
    if shutil.which("node") is None:
        return None
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as fh:
        fh.write(NODE_JS)
        jpath = fh.name
    try:
        env = dict(os.environ, VF_PW_PATH=engine, VF_URL=url)
        proc = subprocess.run(["node", jpath], capture_output=True, text=True, timeout=60, env=env)
        for ln in (proc.stdout + proc.stderr).splitlines():
            if ln.startswith("VF_EXEC_JSON "):
                return json.loads(ln[len("VF_EXEC_JSON "):])
        return None
    except Exception:
        return None
    finally:
        try:
            os.unlink(jpath)
        except OSError:
            pass

try:
    r = requests.get(full, timeout=10, verify=False)
    csp = r.headers.get("content-security-policy", "")
    if payload not in r.text:
        print("[REJECTED] XSS payload未出现在响应中")
        exit(0)
    engine = _find_engine()
    if engine is None:
        print("[REFLECTED] XSS反射级确认（执行级未验证：无可用浏览器引擎，设 VF_XSS_PLAYWRIGHT 指向 Node playwright 目录）" + ("；CSP=" + csp[:120] if csp else ""))
        exit(0)
    res = _exec_check(engine, full)
    if res and res.get("executed"):
        print("[CONFIRMED] XSS执行级确认: " + json.dumps(res, ensure_ascii=False))
        exit(0)
    observable = ("alert(" in payload) or ("confirm(" in payload) or ("prompt(" in payload) or ("__xss_poc" in payload)
    if not observable:
        pres = _exec_check(engine, probe_url)
        if pres and pres.get("executed"):
            print("[CONFIRMED] XSS执行级确认(规范探针): 报告payload无alert/标记信号，规范探针在同一反射点执行 " + json.dumps(pres, ensure_ascii=False))
            exit(0)
    blocker = []
    if csp:
        blocker.append("CSP: " + csp[:160])
    if res:
        blocker.append("engine_result: " + json.dumps(res, ensure_ascii=False))
    else:
        blocker.append("engine_no_result: 浏览器引擎执行失败或 node 不可用")
    print("[REFLECTED] XSS反射级确认（执行级未通过，Candidate）" + ("；" + "；".join(blocker) if blocker else ""))
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


def generate_poc(vuln_type: str, target: str, payload: str = "", path: str = "", baseline_len: int = 0, param: str = "") -> str:
    vt = (vuln_type or "").lower().replace(" ", "_")
    template = POC_TEMPLATES.get(vt) or POC_TEMPLATES.get("sql_injection")  # fallback 统一用 sql 模板结构
    if vt == "xss":
        # XSS payload 常含引号/反斜杠/换行（如 " autofocus onfocus=alert(1) x="），
        # 注入前转为 Python 字面量安全形式，防止生成代码语法错误（t_fa06c2e7）
        def _pylit(s: str) -> str:
            return (s.replace("\\", "\\\\").replace('"', '\\"')
                     .replace("\n", "\\n").replace("\r", "\\r"))
        target_v, payload_v, param_v = _pylit(target), _pylit(payload), _pylit(param or "q")
    else:
        target_v, payload_v, param_v = target, payload, param
    replacements = {
        "{target}": target_v,
        "{payload}": payload_v,
        "{path}": path,
        "{param}": param_v,
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
    if "[REFLECTED]" in output:
        # XSS 执行级分级（t_fa06c2e7）：反射命中但无执行证据 = Candidate，不计入 VERIFIED
        return VerificationStatus.REFLECTED, "xss_reflected_candidate"
    if "[REJECTED]" in output:
        return VerificationStatus.REJECTED, "no_response_diff_or_false_positive"
    if "[ERROR]" in output or "[TIMEOUT]" in output:
        return VerificationStatus.REJECTED, "execution_error"
    return VerificationStatus.REJECTED, "inconclusive"


def verify_one(f: dict, target: str, poc_dir: str, timeout_s: int = 20) -> VerifiedFinding:
    vf = VerifiedFinding(original_id=f.get("id", "?"))
    vt = f.get("vuln_type", "")
    poc = generate_poc(
        vt,
        target=target or f.get("target", ""),
        payload=f.get("payload", ""),
        path=f.get("path", ""),
        baseline_len=int(f.get("baseline_len", 0) or 0),
        param=f.get("param", "") or f.get("target_param", "") or "q",
    )
    vf.poc_code = poc
    if poc_dir:
        os.makedirs(poc_dir, exist_ok=True)
        with open(os.path.join(poc_dir, f"{vf.original_id}.py"), "w", encoding="utf-8") as fh:
            fh.write(poc)
    rc, out = run_poc(poc, timeout_s=timeout_s)
    vf.poc_output = out
    vf.status, vf.result = parse_result(out)
    if vf.status in (VerificationStatus.REJECTED, VerificationStatus.REFLECTED):
        vf.rejection_reason = out[:200]
    return vf


def _selftest() -> int:
    """本机回环 fixture 回归（127.0.0.1，零外网）。

    场景矩阵（t_fa06c2e7）：
      XSS-S1 执行级命中：payload 原样回显且可执行 → CONFIRMED/VERIFIED
      XSS-S2 反射未执行：回显但 HTML 编码阻断 → REFLECTED（不计 VERIFIED）
      XSS-S3 引擎禁用 fail-safe：VF_XSS_PLAYWRIGHT=0 → REFLECTED
      XSS-S4 无回显 → REJECTED
      XSS-S5 非可观测 payload 规范探针路径（marker 探针执行）→ CONFIRMED
      其余模板回归：sql/command/lfi/sensitive_file/info_disclosure 行为不变
    """
    import http.server
    import threading
    import urllib.parse

    payload_exec = '<svg onload="window.__xss_poc=1;alert(1)">'
    payload_plain = "xss7q"  # 无 alert/标记信号的报告 payload

    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):  # 静音访问日志
            pass

        def send_response(self, code, message=None):
            # 不发 Server/Date header（否则 info_disclosure 模板会因 basehttp
            # 默认 Server header 误判，fixture 无法充当"无特征"基线）
            self.log_request(code)
            self.send_response_only(code, message)

        def do_GET(self):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            q = qs.get("q", [""])[0]
            mode = qs.get("mode", ["x"])[0]
            if mode == "vuln":
                body = f"<html><body>hello {q}</body></html>"
            elif mode == "csp":
                body = f"<html><body>hello {q}</body></html>"
            elif mode == "encoded":
                import html as _h
                body = f"<html><body>hello {_h.escape(q, quote=True)}</body></html>"
            else:
                body = "<html><body>not found</body></html>"
                data = body.encode()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            data = body.encode()
            self.send_response(200)
            if mode == "csp":
                self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'none'")
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 18923), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:18923/"

    def finding(vid, mode, payload, param="q"):
        return {
            "id": vid,
            "vuln_type": "xss",
            "target": f"{base}?mode={mode}",
            "target_param": param,
            "payload": payload,
            "status": "pending",
        }

    xss_cases = [
        ("XSS-S1", finding("XSS-S1", "vuln", payload_exec), VerificationStatus.VERIFIED, None),
        ("XSS-S2", finding("XSS-S2", "csp", payload_exec), VerificationStatus.REFLECTED, None),
        ("XSS-S4", finding("XSS-S4", "none", payload_exec), VerificationStatus.REJECTED, None),
        ("XSS-S5", finding("XSS-S5", "vuln", payload_plain), VerificationStatus.VERIFIED, None),
    ]
    # XSS-S3 引擎禁用 fail-safe：进程级环境变量注入，单独跑
    passed, failed = [], []
    for name, f, expect, _ in xss_cases:
        vf = verify_one(f, target=f["target"], poc_dir="", timeout_s=120)
        ok = vf.status == expect
        (passed if ok else failed).append(name)
        print(f"[SELFTEST] {name}: {vf.status.value} (期望 {expect.value}) {'PASS' if ok else 'FAIL'} :: {vf.poc_output[:160]}")

    s3 = dict(finding("XSS-S3", "vuln", payload_exec))
    old = os.environ.get("VF_XSS_PLAYWRIGHT")
    os.environ["VF_XSS_PLAYWRIGHT"] = "0"
    try:
        vf = verify_one(s3, target=s3["target"], poc_dir="", timeout_s=120)
    finally:
        if old is None:
            os.environ.pop("VF_XSS_PLAYWRIGHT", None)
        else:
            os.environ["VF_XSS_PLAYWRIGHT"] = old
    ok = vf.status == VerificationStatus.REFLECTED
    (passed if ok else failed).append("XSS-S3")
    print(f"[SELFTEST] XSS-S3: {vf.status.value} (期望 reflected) {'PASS' if ok else 'FAIL'} :: {vf.poc_output[:160]}")

    # 非 XSS 模板回归：fixture 返回不含特征 → 行为不变（REJECTED，非 CONFIRMED）
    regress = [
        ("REG-SQL", "sql_injection"),
        ("REG-CMD", "command_injection"),
        ("REG-LFI", "lfi"),
        ("REG-FILE", "sensitive_file"),
        ("REG-INFO", "info_disclosure"),
    ]
    for vid, vt in regress:
        f = {"id": vid, "vuln_type": vt, "target": base, "payload": "probe", "path": "/x", "status": "pending"}
        vf = verify_one(f, target=base, poc_dir="", timeout_s=60)
        ok = vf.status == VerificationStatus.REJECTED  # static 页无任何特征 → 必须保持 REJECTED
        (passed if ok else failed).append(vid)
        print(f"[SELFTEST] {vid}: {vf.status.value} (期望 rejected) {'PASS' if ok else 'FAIL'} :: {vf.poc_output[:120]}")

    server.shutdown()
    print(f"[SELFTEST-SUMMARY] {len(passed)} passed / {len(failed)} failed / {len(passed) + len(failed)} total")
    return 0 if not failed else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="独立漏洞验证模块 (PoC 执行级复跑)")
    ap.add_argument("--target", help="目标 URL/主机（--selftest 模式忽略）")
    ap.add_argument("--findings", help="findings JSONL（每行一个 finding）")
    ap.add_argument("--poc-dir", default="./poc_out", help="生成 PoC 文件目录")
    ap.add_argument("--timeout", type=int, default=20, help="单个 PoC 超时秒（XSS 含浏览器执行，建议 ≥60）")
    ap.add_argument("--out", default=None, help="验证结果 JSONL 输出路径（默认打印）")
    ap.add_argument("--selftest", action="store_true", help="本机回环 fixture 回归（零外网）")
    args = ap.parse_args(argv)

    if args.selftest:
        return _selftest()

    if not args.target or not args.findings:
        ap.error("--target 与 --findings 必填（或使用 --selftest）")

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
            continue  # 已确认/已驳回的跳过（reflected/pending 会被复跑）
        results.append(verify_one(f, args.target, args.poc_dir, timeout_s=args.timeout))

    verified = [r for r in results if r.status == VerificationStatus.VERIFIED]
    reflected = [r for r in results if r.status == VerificationStatus.REFLECTED]
    rejected = [r for r in results if r.status == VerificationStatus.REJECTED]
    print(
        f"[SUMMARY] {len(verified)} verified / {len(reflected)} reflected(candidate) / "
        f"{len(rejected)} rejected / {len(results)} total"
    )

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