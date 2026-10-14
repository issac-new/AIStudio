#!/usr/bin/env python3
"""accept_failure_trace_index.py — 独立验收（mktemp 干净环境，全绿 exit=0）

含 2 次预期真实拦截：
  T1 无「因为」根因的 claim 被 ft_add 拒绝
  T2 关键词检索精确命中写入的死路条目
"""
import json, os, shutil, subprocess, sys, tempfile

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    ws = tempfile.mkdtemp(prefix="ft-accept-")
    try:
        for f in ("ft_add.py", "ft_search.py", "ft_stats.py"):
            shutil.copy(os.path.join(SKILL_DIR, "scripts", f), ws)
        ledger = os.path.join(ws, "failures.jsonl")

        def run(*args):
            return subprocess.run([sys.executable] + [os.path.join(ws, a) if a.endswith(".py") else a for a in args],
                                  capture_output=True, text=True)

        # T1 无根因 claim 被拒（真实拦截 #1）
        r = run("ft_add.py", "--ledger", ledger, "--card", "t_a", "--engagement", "demo",
                "--category", "dead-end", "--claim", "MSSQL 枚举不通")
        assert r.returncode == 1 and "BLOCKED" in r.stderr, "T1 no-root-cause claim NOT blocked"
        assert not os.path.exists(ledger), "T1 rejected entry must not be written"
        print("T1 OK 无根因 claim 被拒绝 exit=1（真实拦截 #1）")

        # T2 写入三条 fixture，检索 saml 精确命中（真实拦截 #2 验证命中精度）
        triples = [
            ("t_b", "saml", "SAML 端点枚举失败，因为 目标 IdP 只允许 SP 发起登录，IdP 元数据端点 403"),
            ("t_c", "waf", "sqlmap 直跑被拦，因为 目标 WAF 指纹为长亭雷池且默认规则集拦截 UNION 注入"),
            ("t_d", "smb", "SMB 空会话枚举无结果，因为 目标域控禁用匿名枚举（Restrict Anonymous=1）"),
        ]
        for card, cat, claim in triples:
            r = run("ft_add.py", "--ledger", ledger, "--card", card, "--engagement", "demo",
                    "--category", "dead-end", "--claim", claim, "--context", f"fixture {cat}")
            assert r.returncode == 0, f"add {card} failed: {r.stderr}"
        r = run("ft_search.py", "--ledger", ledger, "--query", "saml")
        assert r.returncode == 0 and r.stdout.count("\n") >= 1, "search failed"
        lines = [l for l in r.stdout.splitlines() if l.startswith("fail-")]
        assert len(lines) == 1 and "SAML" in lines[0], f"T2 expected exactly 1 saml hit, got: {lines}"
        print("T2 OK 关键词 saml 精确命中 1/3 条 fixture（真实拦截 #2=命中精度验证）")

        # T3 统计
        r = run("ft_stats.py", "--ledger", ledger)
        assert r.returncode == 0 and "total=3" in r.stdout, "stats failed"
        print("T3 OK 统计输出 total=3")
        print("ALL GREEN failure-trace-index acceptance exit=0")
        return 0
    finally:
        shutil.rmtree(ws, ignore_errors=True)

if __name__ == "__main__":
    raise SystemExit(main())
