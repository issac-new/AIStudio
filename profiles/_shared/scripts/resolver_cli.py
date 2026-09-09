#!/usr/bin/env python3
"""
resolver_cli.py — 确定性 Skill Resolver CLI（纯函数，无 LLM）

读取 skill_routing.json，对输入任务描述做五维信号归一化 + 打分，
产出 1 primary + ≤2 supports，输出 JSON，便于 orchestrator/kanban 派单前调用。

对齐：VulnClaw skills/resolver.py (445 行) + 本机 skill-resolver skill 设计文档
权重：W_TYPED=3.0, W_ALIAS=1.0, W_FORMAT=1.5, SUPPORT_THRESHOLD=0.35, MAX_SUPPORTS=2

用法：
  python3 resolver_cli.py "对 https://target.com 做 SQL 注入测试" --json
  python3 resolver_cli.py --task '{"text":"...","phase":"exploit","target_type":"web"}'
  echo '{"text":"..."}' | python3 resolver_cli.py --stdin
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from typing import Any

DEFAULT_ROUTING_PATH = os.path.join(
    os.path.dirname(__file__), "skill_routing.json"
)

# ── 关键词词典（确定性，仅词典命中，无 LLM）───────────────────────────────
PHASE_KWS = {
    "recon": ["侦察", "recon", "osint", "子域", "被动", "资产发现", "指纹", "识别"],
    "enum": ["枚举", "enum", "目录爆破", "参数", "版本", "服务识别", "爬虫", "spider"],
    "exploit": ["利用", "exploit", "注入", "sqli", "xss", "ssrf", "rce", "命令执行", "payload", "攻击", "渗透", "getshell"],
    "privesc": ["提权", "privesc", "权限提升", "sudo", "kernel", "内核"],
    "post": ["后渗透", "post", "横向", "持久化", "内网", "凭据", "c2", "数据窃取"],
    "report": ["报告", "report", "汇总", "交付", "sarif", "导出"],
    "audit": ["审计", "audit", "代码审计", "配置审计", " sast", "sca", "秘钥", "密钥", "威胁建模"],
}
TARGET_TYPE_KWS = {
    "web": ["web", "网站", "http", "https", "url", "网页", "站点"],
    "api": ["api", "rest", "graphql", "接口", "endpoint", "swagger", "openapi"],
    "ad": ["ad", "active directory", "域控", "ldap", "kerberos", "windows域"],
    "cloud": ["cloud", "云", "aws", "azure", "gcp", "k8s", "kubernetes", "容器", "docker"],
    "network": ["network", "网络", "内网", "端口", "服务", "smb", "rdp", "ssh"],
    "binary": ["binary", "二进制", "逆向", "逆向工程", "ida", "ghidra", "反编译"],
    "mobile": ["mobile", "移动", "android", "ios", "apk", "ipa"],
    "llm": ["llm", "ai", "大模型", "rag", "agent", "prompt"],
}
TECH_KWS = {
    # 常见技术栈，仅做词典命中，不追求全
    "wordpress", "drupal", "joomla", "magento", "php", "laravel", "thinkphp",
    "django", "flask", "fastapi", "spring", "springboot", "struts",
    "node", "express", "nest", "next", "nuxt", "react", "vue", "angular",
    "mysql", "postgres", "mssql", "oracle", "sqlite", "redis", "mongodb",
    "nginx", "apache", "iis", "tomcat", "jetty", "weblogic", "websphere",
    "jenkins", "gitlab", "github", "git", "ci", "cd",
    "terraform", "ansible", "helm", "kubernetes", "k8s", "docker",
    "aws", "azure", "gcp", "ec2", "s3", "lambda", "rds",
    "jwt", "oauth2", "saml", "oidc", "keycloak", "okta",
    "csp", "waf", "cloudflare", "akamai", "modsecurity",
}
VULN_KWS = {
    "sqli", "sql注入", "xss", "ssrf", "csrf", "idor", "bola", "rce", "命令执行",
    "lfi", "rfi", "文件包含", "xxe", "ssti", "模板注入", "反序列化", "deserialization",
    "auth bypass", "认证绕过", "jwt confusion", "token replay", "oauth flaw", "mfa bypass",
    "kerberoast", "as-rep-roasting", "dcsync", "golden ticket", "silver ticket",
    "race condition", "竞态", "price tamper", "价格篡改", "privilege escalation", "越权",
    "workflow bypass", "业务逻辑", "logic flaw", "path traversal", "目录遍历",
    "upload bypass", "文件上传", "csp bypass", "waf bypass", "cloud metadata", "元数据服务",
    "supply chain", "供应链", "typosquatting", "dependency confusion", "malicious package",
    "prompt injection", "jailbreak", "data leakage", "agentic attack", "tool abuse",
    "lethal trifecta", "toxic flow", "untrusted input", "private data", "exfiltration",
}
TASK_TYPE_KWS = {
    "scan": ["扫描", "scan", "漏洞扫描", "nuclei", "nessus", "openvas"],
    "brute": ["爆破", "brute", "暴力破解", "密码喷射", "credential stuffing"],
    "ctf": ["ctf", "夺旗", "flag"],
    "audit": ["审计", "audit", "代码审计", "配置审计"],
    "pivot": ["横向", "pivot", "内网穿透", "跳板"],
    "hunt": ["狩猎", "hunting", "威胁狩猎", "threat hunting"],
    "compliance": ["合规", "compliance", "等保", "cmc", "iso27001"],
    "ir": ["ir", "应急", "事件响应", "取证", "forensics"],
    "methodology": ["方法论", "playbook", "流程", "coverage", "持续学习"],
    "report": ["报告", "report", "sarif", "导出", "格式化"],
}
# alias：skill 级别的简短关键词，用于 +1.0 加分（来自 skill_routing.json 的 aliases）
FORMAT_KWS = {
    "target-url": ["http://", "https://"],
    "target-scope": ["scope", "授权", "范围", "targets", "目标"],
    "target-slug": ["slug", "目录", "workspace", "目标名"],
    "recon-notes": ["recon", "侦察", "notes", "笔记"],
    "finding": ["finding", "漏洞", "发现"],
    "api-spec": ["swagger", "openapi", "api文档", "spec"],
    "auth-endpoint": ["登录", "auth", "认证", "oauth", "jwt"],
    "injection-point": ["注入点", "参数", "injection"],
    "url-parameter": ["url参数", "query", "query参数"],
    "template-input": ["模板", "template", "ssti", "jinja2", "twig"],
    "reflection-point": ["反射", "回显", "xss"],
    "source-code": ["源码", "代码", "source", "repo", "git"],
    "package-lock": ["package-lock", "package.json", "requirements.txt", "pom.xml", "go.mod", "cargo.lock"],
    "incident-alert": ["告警", "alert", "事件", "incident"],
    "llm-endpoint": ["llm", "ai接口", "openai", "anthropic"],
    "agent-config": ["agent", "智能体", "config"],
    "skill-dir": ["skill", "技能", "插件"],
    "command": ["命令", "command", "执行", "terminal"],
    "task-desc": ["任务", "task", "描述"],
    "raw-output": ["输出", "output", "日志", "log"],
}

def _detect(keywords: dict[str, list[str]], text: str) -> list[str]:
    tl = text.lower()
    return [k for k, v in keywords.items() if any(kw in tl for kw in v)]

def _detect_set(kws: set[str], text: str) -> list[str]:
    tl = text.lower()
    return sorted(k for k in kws if k in tl)

def normalize_task(task_text: str, explicit: dict = None) -> dict:
    tl = task_text.lower()
    # 显式技能
    explicit_skills = explicit or {}
    explicit_list = explicit_skills.get("skill", []) if explicit_skills else []
    return {
        "phase": _detect(PHASE_KWS, tl),
        "target_type": _detect(TARGET_TYPE_KWS, tl),
        "technologies": _detect_set(TECH_KWS, tl),
        "vuln_hints": _detect_set(VULN_KWS, tl),
        "task_types": _detect(TASK_TYPE_KWS, tl),
        "keywords": set(re.findall(r"[a-z0-9._-]{2,}", tl)),
        "explicit": set(explicit_list),
        "formats": _detect(FORMAT_KWS, tl),
    }

@dataclass
class SkillEntry:
    id: str
    name: str
    routing: dict
    aliases: list[str]
    is_broad_knowledge: bool
    input_format: str

def load_skills(path: str) -> list[SkillEntry]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    skills = []
    for sk in data.get("skills", {}).values():
        skills.append(SkillEntry(
            id=sk["name"],
            name=sk["name"],
            routing=sk,
            aliases=sk.get("aliases", []),
            is_broad_knowledge=sk.get("is_broad_knowledge", False),
            input_format=sk.get("input_format", ""),
        ))
    return skills

W_TYPED, W_ALIAS, W_FORMAT = 3.0, 1.0, 1.5
SUPPORT_THRESHOLD = 0.35
MAX_SUPPORTS = 2

def score_skill(skill: SkillEntry, sig: dict) -> tuple[float, str]:
    # 显式调用：直接 inf
    if skill.id in sig["explicit"]:
        return float("inf"), "explicit-invocation"
    s = 0.0
    reasons = []
    # 1) typed routing: phase/target_type/technologies/vuln_hints/task_types
    for dim in ("phase", "target_type", "technologies", "vuln_hints", "task_types"):
        hits = set(skill.routing.get(dim, [])) & set(sig[dim])
        if hits:
            gain = W_TYPED * len(hits)
            s += gain
            reasons.append(f"{dim}:{sorted(hits)}+{gain:.1f}")
    # 2) alias
    alias_hits = set(skill.aliases) & sig["keywords"]
    if alias_hits:
        gain = W_ALIAS * len(alias_hits)
        s += gain
        reasons.append(f"alias:{sorted(alias_hits)}+{gain:.1f}")
    # 3) format
    if skill.input_format and skill.input_format in sig["formats"]:
        s += W_FORMAT
        reasons.append(f"format:{skill.input_format}+{W_FORMAT:.1f}")
    return s, "; ".join(reasons)

def resolve(task_text: str, routing_path: str, explicit: dict = None) -> dict:
    skills = load_skills(routing_path)
    sig = normalize_task(task_text, explicit)
    # 非渗透门禁：五维全空 且 无 alias 且 无 explicit -> abstain
    pentest_dims = (
        sig["phase"], sig["target_type"], sig["technologies"],
        sig["vuln_hints"], sig["task_types"]
    )
    if not any(pentest_dims) and not sig["explicit"]:
        return {
            "primary": None, "supports": [], "confidence": 0.0,
            "reason": "non-pentest input, abstain",
            "provenance": {"sig": {k: sorted(v) if isinstance(v, set) else v for k, v in sig.items()}}
        }
    scored = []
    for sk in skills:
        sc, reason = score_skill(sk, sig)
        if sc > 0:
            scored.append((sc, reason, sk))
    if not scored:
        return {
            "primary": None, "supports": [], "confidence": 0.0,
            "reason": "no skill scored above zero",
            "provenance": {"sig": {k: sorted(v) if isinstance(v, set) else v for k, v in sig.items()}}
        }
    # 排序：分数降序 -> 非 broad 优先 -> typed 命中维度数多者优先 -> id 字典序
    def typed_hit_count(sk):
        cnt = 0
        for dim in ("phase", "target_type", "technologies", "vuln_hints", "task_types"):
            cnt += len(set(sk.routing.get(dim, [])) & set(sig[dim]))
        return cnt
    scored.sort(key=lambda t: (
        -t[0],
        t[2].is_broad_knowledge,
        -typed_hit_count(t[2]),
        t[2].id,
    ))
    p_score, p_reason, primary = scored[0]
    supports = []
    for sc, r, sk in scored[1:]:
        if sc >= SUPPORT_THRESHOLD * p_score and len(supports) < MAX_SUPPORTS:
            supports.append({"id": sk.id, "score": sc, "reason": r})
    confidence = min(p_score / 15.0, 1.0)
    return {
        "primary": {"id": primary.id, "score": p_score, "reason": p_reason},
        "supports": supports,
        "confidence": round(confidence, 3),
        "reason": p_reason,
        "provenance": {
            "sig": {k: sorted(v) if isinstance(v, set) else v for k, v in sig.items()},
            "evaluated": len(scored),
        }
    }

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="确定性 Skill Resolver CLI")
    ap.add_argument("task", nargs="?", help="任务描述文本（位置参数）")
    ap.add_argument("--json", action="store_true", help="输出完整 JSON（含 provenance）")
    ap.add_argument("--task-json", dest="task_json", help="完整任务 JSON 字符串（含 explicit skill 等）")
    ap.add_argument("--stdin", action="store_true", help="从 stdin 读取任务文本")
    ap.add_argument("--routing", default=DEFAULT_ROUTING_PATH, help="skill_routing.json 路径")
    ap.add_argument("--primary-only", action="store_true", help="仅输出 primary id")
    args = ap.parse_args(argv)

    # 读取任务文本
    if args.task_json:
        task_obj = json.loads(args.task_json)
        task_text = task_obj.get("text", "")
        explicit = {k: v for k, v in task_obj.items() if k != "text"}
    elif args.stdin:
        task_text = sys.stdin.read().strip()
        explicit = {}
    elif args.task:
        task_text = args.task
        explicit = {}
    else:
        ap.error("需要 task 文本、--task-json 或 --stdin")

    result = resolve(task_text, args.routing, explicit)

    p = result["primary"]

    if args.primary_only:
        print(p["id"] if p else "none")
        return 0

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        if p:
            print(f"primary: {p['id']} (score={p['score']:.1f}) — {p['reason']}")
        else:
            print("primary: none")
        for s in result["supports"]:
            print(f"  support: {s['id']} (score={s['score']:.1f}) — {s['reason']}")
        print(f"confidence: {result['confidence']:.3f}")

    # provenance 写入（追加）
    prov_path = os.path.join(os.path.dirname(args.routing), "resolver-provenance.jsonl")
    try:
        with open(prov_path, "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "task_hash": __import__("hashlib").sha256(task_text.encode()).hexdigest()[:16],
                "selected": {
                    "primary": p["id"] if p else None,
                    "supports": [s["id"] for s in result["supports"]]
                },
                "reason": result["reason"],
                "confidence": result["confidence"],
            }, ensure_ascii=False) + "\n")
    except OSError:
        pass

    return 0 if result["primary"] else 1


if __name__ == "__main__":
    sys.exit(main())