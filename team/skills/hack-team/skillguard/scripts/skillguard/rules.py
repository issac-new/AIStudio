"""
Detection rules for skillguard.
Each rule is a dataclass with a name, severity, description, and match function.
Zero external dependencies -- pure Python stdlib.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Callable


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


@dataclass
class Rule:
    id: str
    name: str
    severity: Severity
    description: str
    remediation: str
    pattern: re.Pattern | None = None
    check_fn: Callable[[str], list[str]] | None = None
    check_dir_fn: Callable[["Path"], list[str]] | None = None
    tags: list[str] = field(default_factory=list)

    def match(self, text: str) -> list[str]:
        """Return list of matched snippets (empty = no match)."""
        if self.pattern:
            return [m.group(0) for m in self.pattern.finditer(text)]
        if self.check_fn:
            return self.check_fn(text)
        return []

    def match_dir(self, path: "Path") -> list[str]:
        """Directory-context variant of match(); returns [] unless check_dir_fn is set.

        `path` is the file being scanned; rules that need sibling-context
        (e.g. SKILL.md statements vs scripts in the same directory) use it.
        """
        if self.check_dir_fn is None:
            return []
        try:
            return self.check_dir_fn(path)
        except Exception:
            return []


# ── SG-001: Prompt Injection ───────────────────────────────────

_PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+instructions?",
    r"disregard\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+instructions?",
    r"forget\s+(?:everything|all)\s+(?:above|you|i|before)",
    r"you\s+are\s+now\s+(?:a\s+)?(?:different|new|another|free)",
    r"act\s+as\s+(?:if\s+)?(?:you\s+(?:have\s+)?no\s+restrictions?|an?\s+unfiltered)",
    r"(?:new|updated|override)\s+system\s+prompt",
    r"jailbreak",
    r"DAN\s+mode",
    r"developer\s+mode\s+enabled",
    r"pretend\s+(?:you\s+)?(?:have\s+no\s+)?(?:restrictions?|rules|guidelines)",
    r"(?:bypass|override|disable)\s+(?:your\s+)?(?:safety|content|ethical)\s+(?:filter|check|guardrail|policy)",
]

RULE_PROMPT_INJECTION = Rule(
    id="SG-001",
    name="Prompt Injection",
    severity=Severity.CRITICAL,
    description=(
        "The skill contains text that attempts to override, ignore, or bypass "
        "the agent's system prompt or safety guidelines. This is the primary "
        "technique used in the ClawHavoc campaign (341 malicious skills, Jan 2026)."
    ),
    remediation=(
        "Remove all instruction-override language. Legitimate skills never need "
        "to modify the agent's base instructions or identity."
    ),
    pattern=re.compile("|".join(_PROMPT_INJECTION_PATTERNS), re.IGNORECASE | re.MULTILINE),
    tags=["injection", "clawhavoc", "owasp-asi01"],
)


# ── SG-002: Data Exfiltration ──────────────────────────────────

_EXFIL_PATTERNS = [
    r"(?:send|post|upload|exfiltrate|transmit|forward|relay)\s+(?:all\s+)?(?:user\s+)?(?:data|files?|documents?|secrets?|keys?|tokens?|credentials?)",
    r"(?:http[s]?://|curl\s|wget\s|requests?\.)(?:[^\s]{0,200})\s*(?:\+|\.format|f['\"])",
    r"webhook\s*(?:url|endpoint|\.send|\.post)",
    r"(?:base64|b64)\.(?:encode|decode)\s*\(.*(?:send|post|upload)",
    r"(?:os\.environ|env\[|getenv)\s*\(['\"](?:API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)",
    r"open\s*\(\s*['\"](?:/etc/passwd|/etc/shadow|~/.ssh|\.env|secrets)",
    r"subprocess\.(?:run|call|Popen).*(?:curl|wget|nc\s|ncat)",
    r"socket\.(?:connect|send)\s*\(",
]

RULE_DATA_EXFIL = Rule(
    id="SG-002",
    name="Data Exfiltration",
    severity=Severity.CRITICAL,
    description=(
        "The skill contains patterns consistent with data exfiltration -- "
        "sending user files, secrets, or environment variables to an external endpoint. "
        "Snyk ToxicSkills found 1,467 skills with malicious exfiltration payloads."
    ),
    remediation=(
        "Legitimate skills do not make outbound requests with user data. "
        "If network access is required, it must be scoped, documented, and user-consented."
    ),
    pattern=re.compile("|".join(_EXFIL_PATTERNS), re.IGNORECASE | re.MULTILINE),
    tags=["exfiltration", "data-theft", "owasp-asi02"],
)


# ── SG-003: Privilege Escalation ──────────────────────────────

_PRIV_ESC_PATTERNS = [
    r"sudo\s+(?:-[a-z]+\s+)*(?:rm|chmod|chown|bash|sh|python|curl|wget)",
    r"chmod\s+(?:777|\+x|a\+rwx|0777)",
    r"(?:eval|exec)\s*\(\s*(?:input|request|user|os\.popen|subprocess)",
    r"__import__\s*\(\s*['\"]os['\"]",
    r"os\.system\s*\(",
    r"shell\s*=\s*True",
    r"(?:escalat|privesc|root\s+access|admin\s+access|superuser)",
    r"(?:disable|bypass)\s+(?:uac|selinux|apparmor|gatekeeper|sip)",
]

RULE_PRIV_ESC = Rule(
    id="SG-003",
    name="Privilege Escalation",
    severity=Severity.CRITICAL,
    description=(
        "The skill attempts to gain elevated system privileges, execute arbitrary "
        "shell commands, or disable OS security controls."
    ),
    remediation=(
        "Skill code must never execute shell commands with sudo or request "
        "privilege elevation. Use least-privilege principles throughout."
    ),
    pattern=re.compile("|".join(_PRIV_ESC_PATTERNS), re.IGNORECASE | re.MULTILINE),
    tags=["privilege-escalation", "rce", "owasp-asi03"],
)


# ── SG-004: Identity Hijacking ─────────────────────────────────

_IDENTITY_PATTERNS = [
    r"you\s+(?:must|should|will)\s+(?:always\s+)?(?:claim|say|pretend|act)\s+(?:to\s+be|you\s+are)\s+(?!an?\s+(?:AI|assistant|language\s+model))",
    r"(?:impersonate|pose\s+as|masquerade\s+as)\s+(?:a\s+)?(?:human|person|user|admin|support|employee)",
    r"never\s+(?:reveal|admit|disclose|say)\s+(?:you\s+are\s+)?(?:an?\s+)?(?:AI|bot|assistant|language\s+model|artificial)",
    r"(?:hide|conceal|mask)\s+(?:your\s+)?(?:AI|bot|assistant|artificial)\s+(?:nature|identity|origin)",
    r"tell\s+(?:users?|humans?|people)\s+you\s+are\s+(?:a\s+)?(?:human|real\s+person)",
]

RULE_IDENTITY_HIJACK = Rule(
    id="SG-004",
    name="Identity Hijacking",
    severity=Severity.HIGH,
    description=(
        "The skill instructs the agent to impersonate a human, conceal its AI nature, "
        "or claim to be an entity it is not. This violates EU AI Act Article 52 "
        "transparency requirements."
    ),
    remediation=(
        "AI agents must always be willing to identify themselves as AI when sincerely "
        "asked. Remove any identity-concealment instructions."
    ),
    pattern=re.compile("|".join(_IDENTITY_PATTERNS), re.IGNORECASE | re.MULTILINE),
    tags=["identity", "transparency", "eu-ai-act-art52"],
)


# ── SG-005: Secret Harvesting ──────────────────────────────────

_SECRET_PATTERNS = [
    r"(?:api[_\s]?key|secret[_\s]?key|access[_\s]?token|auth[_\s]?token|bearer[_\s]?token)\s*[=:]\s*['\"][a-zA-Z0-9_\-]{16,}['\"]",
    r"(?:password|passwd|pwd)\s*[=:]\s*['\"][^'\"]{8,}['\"]",
    r"(?:aws|gcp|azure)[_\s]?(?:access|secret|key)[_\s]?(?:id|key)?\s*[=:]\s*['\"][A-Z0-9]{16,}['\"]",
    r"sk-[a-zA-Z0-9_\-]{32,}",
    r"ghp_[a-zA-Z0-9]{36}",
    r"(?:private[_\s]?key|-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----)",
]

RULE_SECRET_HARVEST = Rule(
    id="SG-005",
    name="Hardcoded Secret / Credential",
    severity=Severity.HIGH,
    description=(
        "The skill contains what appears to be a hardcoded API key, token, password, "
        "or private key. This indicates either a credential leak or an attempt to "
        "harvest credentials from the user's environment."
    ),
    remediation=(
        "Never hardcode secrets in skill files. Use environment variables or a "
        "secrets manager. Rotate any exposed credentials immediately."
    ),
    pattern=re.compile("|".join(_SECRET_PATTERNS), re.IGNORECASE | re.MULTILINE),
    tags=["secrets", "credential-leak", "supply-chain"],
)


# ── SG-006: Rug Pull / Self-Modification ──────────────────────

_RUG_PULL_PATTERNS = [
    r"(?:update|modify|overwrite|replace)\s+(?:this\s+)?(?:skill|tool|plugin|instruction)\s+(?:file|definition|spec)",
    r"(?:delete|remove|uninstall)\s+(?:all\s+)?(?:other\s+)?(?:skills?|tools?|plugins?)",
    r"(?:download|fetch|pull|git\s+pull)\s+(?:and\s+)?(?:execute|run|eval|install)\s+(?:from\s+)?(?:http|https|url)",
    r"urllib\.request\.urlopen.*exec",
    r"requests?\.get.*eval\s*\(",
    r"__file__.*(?:write|open.*['\"]w['\"])",
]

RULE_RUG_PULL = Rule(
    id="SG-006",
    name="Rug Pull / Remote Code Execution",
    severity=Severity.CRITICAL,
    description=(
        "The skill attempts to modify itself, disable other skills, or download and "
        "execute remote code. This is the 'rug pull' pattern -- a skill that changes "
        "behaviour after install by fetching malicious payloads from remote URLs."
    ),
    remediation=(
        "Skills must be static and self-contained. Any self-modification or "
        "remote code execution is grounds for immediate removal."
    ),
    pattern=re.compile("|".join(_RUG_PULL_PATTERNS), re.IGNORECASE | re.MULTILINE),
    tags=["rug-pull", "rce", "supply-chain", "clawhavoc"],
)


# ── SG-007: Scope Creep ────────────────────────────────────────

_SCOPE_PATTERNS = [
    r"(?:read|access|open|list)\s+(?:all\s+)?(?:files?|directories?|folders?)\s+(?:on\s+(?:the\s+)?(?:system|disk|computer|machine|filesystem))",
    r"(?:scan|enumerate|discover)\s+(?:the\s+)?(?:entire\s+)?(?:network|subnet|ip\s+range)",
    r"(?:access|read|query)\s+(?:all\s+)?(?:databases?|tables?|collections?)\s+(?:without|ignoring)\s+(?:permission|auth|restriction)",
    r"(?:forward|intercept|capture)\s+(?:all\s+)?(?:network\s+)?(?:traffic|packets|requests?|responses?)",
    r"(?:install|download)\s+(?:additional\s+)?(?:packages?|libraries?|dependencies?)\s+(?:without|without\s+asking|silently)",
]

RULE_SCOPE_CREEP = Rule(
    id="SG-007",
    name="Scope Creep / Excessive Permissions",
    severity=Severity.HIGH,
    description=(
        "The skill requests access significantly beyond its stated purpose -- "
        "reading all files, scanning networks, or accessing all database tables. "
        "This violates the principle of least privilege."
    ),
    remediation=(
        "Define the minimum required access in the skill manifest. Any access "
        "beyond explicit user consent should be flagged and denied."
    ),
    pattern=re.compile("|".join(_SCOPE_PATTERNS), re.IGNORECASE | re.MULTILINE),
    tags=["scope-creep", "least-privilege", "owasp-asi05"],
)


# ── SG-008: Obfuscation ────────────────────────────────────────


def _check_obfuscation(text: str) -> list[str]:
    matches = []
    # Base64 encoded blocks (>100 chars of b64 chars)
    b64_re = re.compile(r"[A-Za-z0-9+/]{60,}={0,2}")
    for m in b64_re.finditer(text):
        matches.append(m.group(0)[:80] + "...")

    # Hex encoded blocks
    hex_re = re.compile(r"(?:0x[0-9a-fA-F]{2},?\s*){20,}")
    for m in hex_re.finditer(text):
        matches.append(m.group(0)[:80] + "...")

    # Unicode escape sequences in bulk
    uni_re = re.compile(r"(?:\\u[0-9a-fA-F]{4}){10,}")
    for m in uni_re.finditer(text):
        matches.append(m.group(0)[:80] + "...")

    # ROT13 / Caesar markers
    rot_re = re.compile(r"(?:rot13|caesar|chr\(\d+\)\s*\+\s*){5,}", re.IGNORECASE)
    for m in rot_re.finditer(text):
        matches.append(m.group(0))

    return matches


RULE_OBFUSCATION = Rule(
    id="SG-008",
    name="Obfuscated Payload",
    severity=Severity.HIGH,
    description=(
        "The skill contains heavily obfuscated content -- base64 blobs, hex encoding, "
        "or unicode escape sequences that conceal the actual instructions from "
        "human reviewers. Snyk found obfuscation in 23% of flagged ToxicSkills."
    ),
    remediation=(
        "All skill instructions must be human-readable. Obfuscated content "
        "should be decoded and audited, or the skill should be rejected."
    ),
    check_fn=_check_obfuscation,
    tags=["obfuscation", "evasion", "supply-chain"],
)


# ── SG-009: Covert Channel ────────────────────────────────────

_COVERT_PATTERNS = [
    r"(?:steganograph|stego|hidden\s+(?:in|within|inside)\s+(?:image|file|metadata))",
    r"(?:dns\s+(?:tunnel|exfil)|(?:tunnel|exfil)\s+(?:via|over|through)\s+dns)",
    r"(?:timing\s+(?:attack|channel)|covert\s+channel)",
    r"(?:comment|whitespace|invisible\s+char|zero-width)\s+(?:encod|hidd|embed)",
    r"(?:encode|embed|hide)\s+(?:data|message|payload)\s+in\s+(?:whitespace|spaces?|tabs?|newlines?)",
]

RULE_COVERT_CHANNEL = Rule(
    id="SG-009",
    name="Covert Channel",
    severity=Severity.HIGH,
    description=(
        "The skill appears to use covert communication channels -- steganography, "
        "DNS tunnelling, timing attacks, or whitespace encoding -- to hide "
        "communications from monitoring systems."
    ),
    remediation=(
        "Skills must communicate through declared, inspectable channels only. "
        "Any covert channel usage warrants immediate rejection."
    ),
    pattern=re.compile("|".join(_COVERT_PATTERNS), re.IGNORECASE | re.MULTILINE),
    tags=["covert-channel", "evasion", "steganography"],
)


# ── SG-010: Social Engineering ────────────────────────────────

_SOCIAL_ENG_PATTERNS = [
    r"(?:urgently?|immediately|right\s+now|without\s+delay)\s+(?:click|share|send|provide|give|enter)\s+(?:your\s+)?(?:password|credentials?|code|token|otp|verification)",
    r"(?:your\s+account\s+(?:will\s+be\s+)?(?:suspended|deleted|banned|locked)|you\s+will\s+lose\s+access)",
    r"(?:verify|confirm)\s+(?:your\s+)?(?:identity|account|details?)\s+(?:by\s+(?:clicking|entering|providing))",
    r"(?:free|won|prize|congratulations|selected|chosen)\s+.{0,50}(?:click|enter|provide|send)",
    r"(?:IT\s+support|help\s+desk|security\s+team|administrator)\s+(?:needs?|requires?|requests?)\s+(?:your\s+)?(?:password|access|credentials?)",
]

RULE_SOCIAL_ENG = Rule(
    id="SG-010",
    name="Social Engineering",
    severity=Severity.HIGH,
    description=(
        "The skill contains social engineering language designed to manipulate "
        "users into providing credentials, clicking malicious links, or taking "
        "urgent unplanned action under false pretences."
    ),
    remediation=(
        "Legitimate skills never create artificial urgency or ask users to "
        "provide passwords or credentials through the skill interface."
    ),
    pattern=re.compile("|".join(_SOCIAL_ENG_PATTERNS), re.IGNORECASE | re.MULTILINE),
    tags=["social-engineering", "phishing", "owasp-asi04"],
)


# ── SG-011: Lethal Trifecta ───────────────────────────────────


def _check_lethal_trifecta(text: str) -> list[str]:
    """
    The 'Lethal Trifecta' (Snyk ToxicSkills): skill has all three of:
    1. Prompt injection to override safety
    2. Network access to exfiltrate
    3. File system access to harvest data

    Each alone is medium risk. Together = critical supply chain attack.
    """
    has_injection = bool(RULE_PROMPT_INJECTION.match(text))
    has_network = bool(
        re.search(r"(?:http[s]?://|requests?\.|urllib|socket\.|curl|wget)", text, re.IGNORECASE)
    )
    has_fs = bool(
        re.search(
            r"(?:open\s*\(|os\.(?:listdir|walk|scandir|read)|pathlib\.Path|glob\.glob|shutil\.)",
            text,
            re.IGNORECASE,
        )
    )
    if has_injection and has_network and has_fs:
        return [
            "LETHAL TRIFECTA: Prompt injection + network access + file system access "
            "detected together. This combination is the hallmark of ClawHavoc-style "
            "supply chain attack skills."
        ]
    return []


RULE_LETHAL_TRIFECTA = Rule(
    id="SG-011",
    name="Lethal Trifecta (Supply Chain Attack Pattern)",
    severity=Severity.CRITICAL,
    description=(
        "The skill combines all three components of the ClawHavoc supply chain "
        "attack pattern: prompt injection to override the agent, file system access "
        "to harvest data, and network access to exfiltrate it. This combination "
        "is the definitive signature of a malicious skill."
    ),
    remediation=(
        "Immediately reject and report this skill. Do not install it under any "
        "circumstances. File an issue with the skill marketplace if applicable."
    ),
    check_fn=_check_lethal_trifecta,
    tags=["lethal-trifecta", "clawhavoc", "critical", "supply-chain"],
)


# ── SG-012: Suspicious URLs ───────────────────────────────────


def _check_suspicious_urls(text: str) -> list[str]:
    url_re = re.compile(
        r"https?://[^\s\"'<>]{10,}",
        re.IGNORECASE,
    )
    suspicious_patterns = [
        re.compile(r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"),  # raw IP
        re.compile(
            r"(?:ngrok|tunnel|webhook\.site|requestbin|pipedream|burpcollaborator)", re.IGNORECASE
        ),
        re.compile(r"(?:pastebin|hastebin|ghostbin|rentry\.co)", re.IGNORECASE),
        re.compile(r"(?:bit\.ly|tinyurl|t\.co|rb\.gy|is\.gd|ow\.ly)/"),
        re.compile(r"\.(?:xyz|tk|ml|ga|cf|gq|top)\b"),
    ]
    matches = []
    for url_match in url_re.finditer(text):
        url = url_match.group(0)
        for pat in suspicious_patterns:
            if pat.search(url):
                matches.append(url)
                break
    return list(set(matches))


RULE_SUSPICIOUS_URLS = Rule(
    id="SG-012",
    name="Suspicious URL",
    severity=Severity.MEDIUM,
    description=(
        "The skill references URLs associated with data exfiltration infrastructure: "
        "raw IP addresses, tunnelling services (ngrok), URL shorteners, pastebin sites, "
        "or high-abuse TLDs (.xyz, .tk). These are commonly used as C2 endpoints."
    ),
    remediation=(
        "Verify all URLs in the skill. Legitimate skills should reference well-known "
        "domains with clear business purposes, never raw IPs or tunnel endpoints."
    ),
    check_fn=_check_suspicious_urls,
    tags=["urls", "c2", "exfiltration"],
)


# ── SG-013: Embedded Instructions in Comments ─────────────────


_HTML_COMMENT = re.compile(r"<!--(.*?)-->", re.DOTALL)
_MD_FENCED_BLOCK = re.compile(r"```[^\n]*\n(.*?)```", re.DOTALL)
_SH_COMMENT = re.compile(r"^\s*#(.*)$", re.MULTILINE)
_C_STYLE_COMMENT = re.compile(r"^\s*//(.*)$", re.MULTILINE)


# L1: prompt-injection signatures (bilingual). Deliberately narrow: only
# agent-directed instruction-override phrasing. Bare topical words
# (jailbreak/DAN/developer-mode) are NOT signatures -- defensive security
# documents use them as analysis objects; SG-001 already scans full text
# for those. Topical mentions inside a defensive context never reach here.
_INJ_SIGNATURES = re.compile(
    r"(?:(?:ignor\w*|disregard\w*)\s+(?:all\s+|any\s+|the\s+|your\s+|these\s+|those\s+|"
    r"(?:previous|prior|above|earlier|existing|old|original|system|base|initial|user)\s+)*"
    r"(?:previous|prior|above|earlier|existing|old|original|system|base|initial|user\s+)?"
    r"(?:instructions?|prompts?|rules?|directives?|guidelines?|guardrails?)\b"
    r"|you\s+are\s+now\b"
    r"|act\s+as\s+(?:if\s+)?(?:you\s+(?:have|had)\s+no\s+restrictions?|an?\s+(?:unfiltered|uncensored))"
    r"|(?:new|updated|override[n]?|replace[d]?)\s+(?:the\s+)?system\s+prompt"
    r"|(?:do\s+not|never)\s+(?:tell|reveal|mention|disclose|inform)\b"
    r"|忽略(?:之前|以上|先前|上面|所有|全部|任何)?(?:的)?(?:所有|全部)?(?:系统)?(?:指令|提示词|规则|约束)"
    r"|无视(?:之前|以上|先前|上面|所有|全部|任何)?(?:的)?(?:所有|全部)?(?:系统)?(?:指令|提示词|规则|约束)"
    r"|以上内容(?:全部)?作废|你现在是|从现在开始你是|你没有?任何限制"
    r"|(?:新的?|覆盖|替换)(?:系统提示|系统指令)"
    r"|(?:不要|禁止)(?:告诉|透露|提及|泄露))",
    re.IGNORECASE,
)

# L2 path A: data movement -- move-verb + data target + imperative commit word.
_MOVE_VERBS = re.compile(
    r"(?:\b(?:send|upload|post|exfiltrate|transmit|forward|curl|wget)\b"
    r"|上传|发送|外发|传输)",
    re.IGNORECASE,
)
_DATA_TARGETS = re.compile(
    r"(?:\b(?:files?|credentials?|tokens?|secrets?|passwords?|keys?|env(?:ironment)?|"
    r"history|clipboard|ssh|browser|cookies?|database|wallet)\b"
    r"|凭据|凭证|密码|密钥|令牌|文件|历史记录|剪贴板|环境变量|浏览器|数据库|钱包|ssh|cookie)",
    re.IGNORECASE,
)
# L2 path B: tool invocation -- invoke-verb + tool-like target + commit word.
# Requires BOTH; a bare "tool"/"agent" mention with no invocation verb is
# documentation language (e.g. "工具调用日志"), not an instruction.
_INVOKE_VERBS = re.compile(
    r"(?:\b(?:call|invoke|execute|run)\b|调用|执行|运行)",
    re.IGNORECASE,
)
_TOOL_TARGETS = re.compile(
    r"(?:\b(?:tool|MCP|server|agent|assistant|daemon|browser|terminal|shell|CLI)\b"
    r"|工具|服务器|智能体|终端|命令行)",
    re.IGNORECASE,
)
_COMMIT_WORDS = re.compile(
    r"(?:\b(?:must|should|always|now|immediately|ensure|make\s+sure)\b"
    r"|必须|务必|一定要|立即|记得|请)",
    re.IGNORECASE,
)

# Defensive-context markers: a file whose FULL TEXT carries these is likely a
# security-analyis artifact (audit checklists, detection rules, pentest
# runbooks, standards quotes) whose comments describe threats rather than
# issue them. Strong = near-unambiguous security-documentation signals;
# weak = supporting vocabulary. Exemption is applied per-blob and NEVER to
# L1 signature blobs (an injection signature is actionable regardless of
# surrounding defensive prose).
_DEFENSIVE_STRONG = [
    re.compile(r"CVE-\d{4}", re.IGNORECASE),
    re.compile(r"\b(?:CIS|OWASP|MITRE|ATT&CK|NIST)\b"),
    re.compile(r"\bSG-\d{2,3}\b"),
    re.compile(r"RFC\s?\d{3,4}"),
    re.compile(r"渗透|红队|蓝队|靶场|测试用例|威胁情报|取证|溯源|应急响应"),
]
_DEFENSIVE_WEAK = [
    re.compile(
        r"\b(?:check|audit|detect|forensic|vulnerab\w*|malware|exploit|phish\w*|"
        r"decoy\w*|honeypot|threat|sandbox|regression)\b",
        re.IGNORECASE,
    ),
    re.compile(r"检测|审计|体检|防御|威胁|攻击面|漏洞|对抗|诱饵|沙箱|隔离|回归|校验"),
    re.compile(
        r"\b(?:kill\s+chain|least\s+privilege|deny-all|indicators?\s+of\s+compromise)\b",
        re.IGNORECASE,
    ),
]


def _is_defensive_context(text: str) -> bool:
    """True when the file reads as a defensive-security document.

    Gated on marker co-occurrence (strong>=2, or strong>=1 plus weak>=2) so a
    single stray keyword cannot exempt an arbitrary file.
    """
    n_strong = sum(1 for pat in _DEFENSIVE_STRONG if pat.search(text))
    if n_strong >= 2:
        return True
    if n_strong >= 1:
        n_weak = sum(1 for pat in _DEFENSIVE_WEAK if pat.search(text))
        return n_weak >= 2
    return False


def _truncate(s: str) -> str:
    return s if len(s) <= 120 else s[:120] + "..."


def _check_embedded_instructions(path: Path) -> list[str]:
    """
    Detect natural-language instructions embedded in comments (AIG 'ghost
    instructions'): HTML `<!-- -->` and code comments carrying prompt-injection
    signatures (L1), or one of two imperative co-occurrence patterns (L2):
    data movement (move verb + data target) or tool invocation (invoke verb +
    tool target), each requiring an imperative commit word. Human-language
    prose outside comments is never scanned. Non-signature blobs in files
    whose full text reads as defensive security documentation (audit
    checklists, detection rules, pentest runbooks, standards quotes) are
    exempt: that vocabulary describes threats, it does not issue them.
    """
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    suffix = path.suffix.lower()

    # Defensive-context gate: computed once per file on FULL text (not just
    # the hit blob) -- security-analysis artifacts spread their vocabulary
    # across the whole document.
    defensive = _is_defensive_context(text)

    if suffix in (".md", ".html", ".htm", ".xml"):
        # 1) HTML comments anywhere in the file.
        comment_blobs = [m.group(1) for m in _HTML_COMMENT.finditer(text)]
        # 2) `#` lines inside fenced code blocks only (markdown headings
        #    outside fences are prose, not comments).
        for block in _MD_FENCED_BLOCK.finditer(text):
            comment_blobs.extend(m.group(1) for m in _SH_COMMENT.finditer(block.group(1)))
    elif suffix in (".py", ".sh", ".bash", ".yaml", ".yml", ".toml"):
        comment_blobs = [m.group(1) for m in _SH_COMMENT.finditer(text)]
    elif suffix in (".js", ".ts"):
        comment_blobs = [m.group(1) for m in _C_STYLE_COMMENT.finditer(text)]
        comment_blobs.extend(m.group(1) for m in _SH_COMMENT.finditer(text))
    else:
        # Unknown type: fall back to HTML comments only (unambiguous marker).
        comment_blobs = [m.group(1) for m in _HTML_COMMENT.finditer(text)]

    matches: list[str] = []
    for blob in comment_blobs:
        # L1: prompt-injection signature inside a comment -> high confidence,
        # never exempted (an injection signature is actionable regardless of
        # surrounding defensive prose).
        if _INJ_SIGNATURES.search(blob):
            matches.append(_truncate(blob.strip()))
            continue
        # Defensive-context exemption: in files that read as security
        # analysis/audit documents, non-signature comment blobs are
        # description-of-threat language, not issued instructions.
        if defensive:
            continue
        # L2 path A: data movement (move verb + data target + imperative).
        n_move = len(_MOVE_VERBS.findall(blob))
        n_data = len(_DATA_TARGETS.findall(blob))
        n_commit = len(_COMMIT_WORDS.findall(blob))
        if n_move >= 1 and n_data >= 1 and n_commit >= 1:
            matches.append(_truncate(blob.strip()))
            continue
        # L2 path B: tool invocation (invoke verb + tool target + imperative).
        # Requires BOTH sides of the pair -- a bare "tool"/"agent" mention is
        # documentation language, not an instruction.
        n_invoke = len(_INVOKE_VERBS.findall(blob))
        n_tool = len(_TOOL_TARGETS.findall(blob))
        if n_invoke >= 1 and n_tool >= 1 and n_commit >= 1:
            matches.append(_truncate(blob.strip()))

    # De-duplicate while preserving order.
    seen: set[str] = set()
    return [m for m in matches if not (m in seen or seen.add(m))]


RULE_EMBEDDED_INSTRUCTIONS = Rule(
    id="SG-013",
    name="Embedded Instructions in Comments",
    severity=Severity.CRITICAL,
    description=(
        "Natural-language instructions are embedded inside HTML or code comments. "
        "Humans skimming the page see harmless prose, but an LLM agent reading the "
        "raw file ingests the hidden instructions (AIG 'ghost instructions' / "
        "comment-embedded injection)."
    ),
    remediation=(
        "Remove instruction-bearing comments. Comments are for humans; any text "
        "that directs agent behaviour must be visible, reviewed content."
    ),
    check_dir_fn=_check_embedded_instructions,
    tags=["injection", "ghost-instructions", "comment", "supply-chain", "aig"],
)


# ── SG-014: Description / Behaviour Mismatch ──────────────────


_DECLARATION_PAT = re.compile(
    r"(?:read[- ]only|只读|仅?(?:用于)?(?:读取|分析|查看)"
    r"|no\s+(?:network|network\s+access|outbound|network\s+calls?|side\s+effects?)"
    r"|does\s+not\s+(?:make|perform|require)\s+(?:any\s+)?(?:network|outbound)"
    r"|never\s+(?:writes?|sends?|uploads?|modifies?|executes?)\b"
    r"|offline\s+only|离线(?:运行|使用|执行)?|无网络|不联网|零副作用|无副作用|不会?(?:联网|外发|写入|上传))",
    re.IGNORECASE,
)

_NETWORK_CALL = re.compile(
    r"(?:urllib\.request\.urlopen\s*\(|requests\.(?:get|post|put|patch|delete)\s*\("
    r"|http\.client\.HTTP(?:Connection|SConnection)\s*\("
    r"|socket\.socket\s*\(|curl\s+[^|;\n]*https?://|wget\s+https?://"
    r"|fetch\s*\(\s*['\"]https?://|axios\.(?:get|post|put|delete)\s*\()",
    re.IGNORECASE,
)

_CRED_CALL = re.compile(
    r"(?:\.ssh[/\\]|\.aws[/\\](?:credentials|config)|\.netrc|\.npmrc|\.kube[/\\]config"
    r"|\.git-credentials|id_rsa|\b[\w./-]*\.pem\b)",
    re.IGNORECASE,
)

_SENSITIVE_WRITE_CALL = re.compile(
    r"(?:open\s*\([^)\n]*['\"][^\n]*\.(?:ssh|aws|env|netrc|gitconfig|bashrc|zshrc|profile)\b"
    r"|os\.environ\s*\[[^\]\n]+\]\s*=|\.write_text\s*\()",
    re.IGNORECASE,
)

_SHELL_NET = re.compile(
    r"(?:\b(?:curl|wget|scp|nc|ncat|netcat)\b[^|;\n]*https?://"
    r"|\b(?:nc|ncat|netcat)\s+[-0-9a-zA-Z. ]+\s*\d+)",
    re.IGNORECASE,
)
_SHELL_CREDS = re.compile(
    r"(?:\b(?:cat|cp|mv|tar|base64|gpg|chmod)\b[^|;\n]*(?:~|/)(?:\.ssh|\.aws|\.netrc|\.npmrc|\.kube)\b"
    r"|\b(?:cat|cp|tar|base64)\b[^|;\n]*\.env\b|id_rsa)",
    re.IGNORECASE,
)
_SHELL_WRITE = re.compile(
    r"(?:>{1,2}\s*\S*(?:\.ssh|\.aws|\.env|\.netrc|\.bashrc|\.zshrc|\.gitconfig)\b"
    r"|\btee\s+(?:-a\s+)?\S*(?:\.ssh|\.aws|\.env|\.netrc|\.bashrc)\b)",
    re.IGNORECASE,
)

_SCRIPT_SUFFIXES = {".py", ".sh", ".bash", ".js", ".ts"}


def _iter_dir_scripts(directory: Path):
    try:
        for p in sorted(directory.iterdir()):
            if p.is_file() and p.suffix.lower() in _SCRIPT_SUFFIXES:
                yield p
    except OSError:
        return


def _check_desc_behaviour(path: Path) -> list[str]:
    """
    Compare what SKILL.md declares with what sibling scripts actually do
    (feature-word comparison, not sandboxing). Fires when the doc claims
    read-only / no-network / no-side-effects AND a sibling script contains
    network-egress, credential-access, or sensitive-write call shapes.
    """
    doc = path.parent / "SKILL.md"
    try:
        doc_text = doc.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    if not _DECLARATION_PAT.search(doc_text):
        return []

    for script in _iter_dir_scripts(path.parent):
        try:
            body = script.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        flags = []
        if _NETWORK_CALL.search(body) or _SHELL_NET.search(body):
            flags.append("network egress call")
        if _CRED_CALL.search(body) or _SHELL_CREDS.search(body):
            flags.append("credential file access")
        if _SENSITIVE_WRITE_CALL.search(body) or _SHELL_WRITE.search(body):
            flags.append("sensitive-file write")
        if flags:
            return [
                f"{script.name}: declares read-only/no-side-effects in SKILL.md "
                f"but script contains {' + '.join(sorted(set(flags)))}"
            ]
    return []


RULE_DESC_BEHAVIOUR = Rule(
    id="SG-014",
    name="Description / Behaviour Mismatch",
    severity=Severity.HIGH,
    description=(
        "The SKILL.md claims a narrow behaviour (read-only analysis, no network, "
        "no side effects) while sibling scripts contain network-egress, "
        "credential-access, or sensitive-write call shapes. The documentation "
        "and the code disagree -- the trust anchor is false (AIG Agent Skill "
        "audit: SKILL.md vs code consistency)."
    ),
    remediation=(
        "Align the description with actual behaviour. A skill that needs network "
        "or write access must say so plainly; documentation used to bypass "
        "review is a supply-chain red flag."
    ),
    check_dir_fn=_check_desc_behaviour,
    tags=["description-mismatch", "consistency", "supply-chain", "aig"],
)


# ── SG-015: Rug-Pull Conditional Trigger ───────────────────────


_CONFIRM_TOKEN = re.compile(
    r"(?:--yes|approv|confirm|authoriz|批准|授权|确认|同意)",
    re.IGNORECASE,
)
_AUTO_SOURCE = re.compile(
    r"(?:os\.environ(?:\.get)?\s*\(|getenv\s*\(|sys\.argv|args\.\w+"
    r"|--yes\b|\s-y\b|skip[-_]?confirm|non[-_]?interactive|\bforce\b"
    r"|\$\{?[A-Z][A-Z0-9_]{2,}\}?"
    r"|['\"][A-Z0-9_]{4,}['\"]\s*==|==\s*['\"][A-Z0-9_]{4,}['\"])",
    re.IGNORECASE,
)
_DANGER_CALL = re.compile(
    r"(?:requests?\.(?:post|put|patch)\s*\(|urlopen\s*\(|curl\s+[^|;\n]*https?://"
    r"|wget\s+https?://|socket\.send\b"
    r"|\brm\s+-[a-z]*r[a-z]*f|shutil\.rmtree\s*\(|os\.(?:remove|unlink)\s*\()",
    re.IGNORECASE,
)
_DATA_SUFFIXES = {".md", ".yaml", ".yml", ".json", ".txt", ".xml", ".html", ".csv", ".toml"}


def _check_rug_pull(path: Path) -> list[str]:
    """
    Detect 'rug pull' conditional branches: a gate line carrying BOTH an
    approval/confirmation token AND an automated source (environment
    variable, CLI flag, hardcoded constant comparison), where a nearby
    window contains network-egress or destructive calls. Purely interactive
    gates (input()/getpass/read -p on the gate line) carry no automated
    source and never match -- no full-file exemption, so a stray input()
    cannot disarm the rule.
    """
    if path.suffix.lower() in _DATA_SUFFIXES:
        return []
    try:
        body = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    lines = body.splitlines()
    for i, line in enumerate(lines):
        if not (_CONFIRM_TOKEN.search(line) and _AUTO_SOURCE.search(line)):
            continue
        lo = max(0, i - 10)
        hi = min(len(lines), i + 11)
        window = "\n".join(lines[lo:hi])
        if _DANGER_CALL.search(window):
            return [_truncate(line.strip())]
    return []


RULE_RUG_PULL_CONDITIONAL = Rule(
    id="SG-015",
    name="Rug-Pull Conditional Trigger",
    severity=Severity.HIGH,
    description=(
        "A conditional branch checks for an approval/confirmation marker from an "
        "automated source (environment variable, CLI flag, hardcoded constant) "
        "and only then performs high-risk operations (network egress, file "
        "deletion). The benign path passes review while the approved path "
        "activates the payload -- the classic 'rug pull' staged pattern. "
        "Heuristic: the gate line must carry both an approval token and an "
        "automated source, so purely interactive prompts do not trigger; "
        "matches are a signal for manual review."
    ),
    remediation=(
        "High-risk operations must not be gated on machine-readable approval "
        "flags that review tooling cannot see. Require genuine interactive "
        "consent and keep the dangerous path inspectable."
    ),
    check_dir_fn=_check_rug_pull,
    tags=["rug-pull", "conditional", "approval-gate", "supply-chain", "aig"],
)


# ── All rules ──────────────────────────────────────────────────

ALL_RULES: list[Rule] = [
    RULE_LETHAL_TRIFECTA,  # Check composite first
    RULE_PROMPT_INJECTION,
    RULE_DATA_EXFIL,
    RULE_PRIV_ESC,
    RULE_IDENTITY_HIJACK,
    RULE_SECRET_HARVEST,
    RULE_RUG_PULL,
    RULE_SCOPE_CREEP,
    RULE_OBFUSCATION,
    RULE_COVERT_CHANNEL,
    RULE_SOCIAL_ENG,
    RULE_SUSPICIOUS_URLS,
    RULE_EMBEDDED_INSTRUCTIONS,
    RULE_DESC_BEHAVIOUR,
    RULE_RUG_PULL_CONDITIONAL,
]
