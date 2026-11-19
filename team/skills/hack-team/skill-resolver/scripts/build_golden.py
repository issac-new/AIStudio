#!/usr/bin/env python3
"""W1-C 黄金集构建器：以人工审定后的期望为准，逐条实测校验一致后才落盘 golden.json。
期望值来源：probe_round2/3/4 三轮实测 + 人工逐条确认（本轮内完成）。
"""
import importlib.util
import json
import os

RESOLVER = os.path.expanduser("~/.hermes/profiles/_shared/scripts/resolver_cli.py")
ROUTING = os.path.expanduser("~/.hermes/profiles/_shared/scripts/skill_routing.json")
OUT = os.path.expanduser("~/.hermes/skills/hack-team/skill-resolver/scripts/golden.json")

spec = importlib.util.spec_from_file_location("resolver_cli", RESOLVER)
rc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rc)

# (id, hint, expect_primary, expect_supports_contains, expect_abstain, explicit_skill, note)
CASES = [
    # ── 注入/执行类（web）──
    ("sqli-en", "Test SQL injection on https://target.com/api/users, union based injection point, mysql backend", "redteam-sqli", ["owasp-security"], False, None, "typed: exploit+web+api; alias union; fmt injection-point"),
    ("sqli-cn", "对 http://shop.example.com 做sqli报错注入，mysql数据库注入点测试", "redteam-sqli", None, False, None, "中文混合英文token：sqli/mysql 可命中；纯中文'注入'词不进 vuln 维（词典镜像缺失，见findings）"),
    ("sqli-blind", "blind sqli time-based oracle 测试 cookie 参数注入点", "redteam-sqli", None, False, None, "vuln: sqli+time-based… 实际命中 sqli; fmt injection-point"),
    ("xss-reflected", "XSS 测试 https://chat.example.com/search?q= 反射型XSS，尝试 CSP bypass", "redteam-xss", None, False, None, "vuln xss + tech csp + fmt reflection-point"),
    ("xss-stored", "stored XSS in comment field, angular application dom-xss", "redteam-xss", None, False, None, "vuln xss/stored/dom; tech angular"),
    ("ssti-jinja2", "SSTI 模板注入测试 jinja2 {{7*7}} payload 验证", "redteam-ssti", None, False, None, "vuln ssti; tech jinja2; fmt template-input"),
    ("ssti-twig", "twig 模板注入 template-injection 检测", "redteam-ssti", None, False, None, "别名路径：alias ssti/template-injection/jinja2 类"),
    ("ssrf-metadata", "SSRF 测试 http://169.254.169.254/ 云元数据访问拿临时凭据", "redteam-ssrf", None, False, None, "vuln ssrf + cloud metadata; task cloud-metadata"),
    ("ssrf-blind", "blind ssrf oob 检测 dnslog 回显", "redteam-ssrf", None, False, None, "alias blind-ssrf"),
    # ── 认证/授权/业务逻辑 ──
    ("auth-jwt", "jwt none 算法混淆攻击 oauth 授权码劫持测试", "redteam-auth", None, False, None, "tech jwt+oauth2; fmt auth-endpoint"),
    ("auth-kerberoast", "kerberoast 攻击域控 kerberos 服务账户票据", "redteam-auth", None, False, None, "vuln kerberoast + target ad(kerberos)"),
    ("blv-idor", "idor 与业务逻辑漏洞测试：api 价格篡改 竞态条件，按 swagger 规格逐接口攻击", "business-logic-vulnerabilities", None, False, None, "vuln idor; target api; fmt api-spec(swagger)"),
    ("blv-price-tamper", "测一下下单接口的价格篡改和 race condition 业务逻辑", "business-logic-vulnerabilities", None, False, None, "中文vuln词(价格篡改/竞态)在词典但metadata用price-tamper/race-condition连字符形——仅 alias race 路径可达"),
    ("bola-detect", "bola 越权检测：web 流量日志中找会话级对象级授权缺陷", "bola-session-detection", ["business-logic-vulnerabilities"], False, None, "vuln bola; blv 作 support（35%门槛内）"),
    # ── 门禁/方法论/编排 ──
    ("scope-gate", "scope-check 授权校验：执行渗透命令前先确认目标在授权 scope 清单内", "scope-gate", None, False, None, "alias scope-check/scope; fmt command; phase exploit——纯scope词会abstain（门禁忽略alias，见findings）"),
    ("methodology", "渗透测试方法论 playbook pentesterflow 流程", "pentest-methodology-fusion", None, False, None, "broad知识库: phase exploit + alias×2 胜出"),
    ("owasp-top10", "OWASP Top 10 web 安全评估 owasp asvs top10", "owasp-security", None, False, None, "broad: alias owasp/top10/asvs + target web"),
    ("audit-orchestration", "并行编排多路扫描加权评分：scope 范围内统一汇总交付", "audit-orchestration", None, False, None, "broad间平局→id字典序裁决链（锁平局行为）；audit-team alias 因含audit子串反致误路由（见findings）"),
    ("fp-check", "复核 finding 是否误报：false-positive review-gate 六门审查后交付", "fp-check", None, False, None, "phase report + alias×2; 注意 fmt 'findings'复数与FORMAT字典'finding'单数错配（见findings）"),
    ("sarif", "把扫描结果导出 SARIF 报告上传 github code scanning", "sarif-output", None, False, None, "phase report + task report + tech github + alias sarif/code-scanning"),
    # ── LLM/Agent 安全 ──
    ("llm-redteam", "LLM prompt injection jailbreak 测试，大模型红队评估", "llm-redteam", None, False, None, "target llm + vuln jailbreak"),
    ("llm-owasp", "OWASP LLM Top 10 assessment for our chatbot, data leakage", "llm-redteam", None, False, None, "英文表述; target llm/ai/api"),
    ("llm-egress", "llm-egress 排查：检测网络出口的 relay-detection 转发链路", "llm-egress-governance", None, False, None, "phase 'defense'不可产出（见findings），仅 target network + alias 可达；避用'内网'(→post)与'url'子串(→web)"),
    ("skillguard", "skillguard 扫描 skill 目录：审计技能包是否藏 lethal trifecta 工具投毒", "skillguard", None, False, None, "alias+fmt skill-dir；'lethal trifecta'空格形与metadata连字符形错配（见findings）；避用'prompt'词(→target llm)"),
    ("toxic-flow", "toxic-flow 分析：审计这个智能体 config 的工具组合风险", "toxic-flow-analysis", None, False, None, "alias + fmt agent-config(智能体) + phase audit"),
    ("tf04", "tf04 缓解审计 skill-security 技能加固方案", "tf04-mitigation", None, False, None, "alias tf04/skill-security + fmt skill-dir + phase audit"),
    # ── 供应链/代码审计 ──
    ("supply-chain", "供应链安全审计：typosquatting 恶意依赖检测 requirements.txt 依赖扫描", "supply-chain-security", None, False, None, "vuln typosquatting; fmt package-lock(requirements.txt); phase audit"),
    ("supply-npm", "npm 供应链 排查 dependency-confusion typosquatting sbom", "supply-chain-security", None, False, None, "tech npm + alias×4；中文'供应链'在词典但metadata无此token（见findings）"),
    ("sast", "Python 代码安全审计 SAST secret-scan 密钥扫描 IaC 审计", "security-auditor", None, False, None, "tech python; fmt source-code; alias sast/secret-scan"),
    ("iac-terraform", "terraform IaC 配置审计 iac-scan 基线检查", "security-auditor", None, False, None, "tech terraform"),
    ("wih-js", "wih js分析：目标 https://shop.example.com 的 js chunk 里找 ak泄露 密钥泄露 敏感信息", "wih-secret-hunter", None, False, None, "vuln js chunk/ak泄露/密钥泄露（词典↔metadata全对齐的正例）+ alias wih"),
    # ── 逆向/知识索引 ──
    ("rea-macho", "用 rea reap 逆向分析 mach-o 固件样本", "rea-reverse-engineering", None, False, None, "中文alias(逆向)+rea/reap; tech mach-o"),
    ("rea-apk", "android apk 逆向反编译分析签名校验", "android-apk-hunt", None, False, None, "CK-Fusion T5 重锚(t_26d0efb0)：android-apk-hunt 注册后 typed 命中 target mobile+binary + tech android+apk(12.0) 压过 rea(4.0)，APK 专用狩猎技能比通用 RE 工具箱更贴合，rea 降为 support；旧名 android-security-audit/apk-reversing/asc-fast-hunt 进其 aliases 保历史路由"),
    ("eco-index", "逆向成果检索 侦察 awesome-reverse-engineered re_index 查现成客户端逆向", "reverse-ecosystem-index", None, False, None, "知识类: phase recon + target binary + alias re_index/awesome-reverse-engineered"),
    # ── 攻击链/执行/狩猎 ──
    ("exploit-chain", "多步利用链编排：先拿 web getshell，再串行推进 serial-chain", "exploit-chain-runner", None, False, None, "phase exploit + target web + alias serial-chain；避用'chain-runner'('chain'含'ai'→target llm，见findings)"),
    ("payload-escalation", "WAF 绕过 payload 升级 l0-l4 cloudflare modsecurity", "exploit-payload-escalation", None, False, None, "tech waf/cloudflare/modsecurity×3 + alias waf-bypass? 实际alias l0-l4/waf-bypass"),
    ("godmode", "全自动 web 端到端渗透 godmode full-surface 自动化", "autonomous-godmode-hunter", None, False, None, "broad但分数压制: phase exploit + target web + alias godmode"),
    ("stun-c2", "stun检测：Cling 僵尸网络流量的 C2 协议伪装威胁狩猎", "stun-c2-detection", None, False, None, "tech stun + task hunt(威胁狩猎) + target network + alias×N"),
    ("agent-fingerprint", "tool-fingerprint：判断这批网络流量是否出自 autonomous agent 工具，提取 ua-fingerprint 时序特征", "agentic-tool-fingerprint", None, False, None, "仅alias可达（phase 'defense'死维）; target network"),
    # ── 证据/台账/工作区 ──
    ("poc-evidence", "PoC 证据快照 evidence-snapshot：sha256 内容寻址，网络资产利用留痕归档", "poc-evidence-snapshot", None, False, None, "phase exploit+target network + alias evidence-snapshot"),
    ("deadend-index", "侦察阶段先查 dead-end-index 死路台账，避免重复踩坑", "failure-trace-index", None, False, None, "phase recon + alias dead-end-index；'failure-ledger/what-failed'含'ai'子串会误触llm（见findings）"),
    ("workspace", "建 target workspace 工作区目录结构 侦察阶段 workspace 规范", "target-scoped-workspace", None, False, None, "phase recon + alias workspace/target-workspace + fmt target-slug(目录)"),
    ("resolver-self", "审计前 skill 选型：resolver routing 确定性派单", "skill-resolver", None, False, None, "自指: phase audit + alias resolver/routing"),
    ("incident-ir", "应急响应 取证 事件响应 playbook ir 遏制", "incident-response", None, False, None, "task ir(取证/应急) + alias playbook"),
    ("cybermes", "cybermes smart-pipe 输出过滤 secret-scan 报告汇总工具", "cybermes-tools", None, False, None, "alias cybermes/smart-pipe/secret-scan + phase report"),
    ("attack-path", "attack-graph 攻击路径图谱：从 recon notes 推导横向 pivot 路径", "attack-path-graph", None, False, None, "phase post(横向) + task pivot + fmt recon-notes + alias attack-graph"),
    ("asset-topo", "asset-graph 资产拓扑图：整理侦察阶段发现的资产清单 dual-graph", "asset-topology-graph", None, False, None, "phase recon(侦察/资产发现) + alias asset-graph/dual-graph"),
    # ── 显式调用（--task-json explicit 通道）──
    ("explicit-invocation", "例行检查一下", "skillguard", None, False, "skillguard", "explicit 显式调用短路：五维全空但 explicit 非空不 abstain"),
    # ── abstain（非渗透输入）──
    ("abstain-speech", "帮我写一份婚礼致辞演讲稿", None, None, True, None, "五维全空→abstain"),
    ("abstain-books", "推荐几本适合孩子读的绘本", None, None, True, None, "五维全空→abstain"),
    ("abstain-errand", "明天早上提醒我去邮局寄包裹", None, None, True, None, "五维全空→abstain"),
    ("abstain-recipe", "这道红烧肉的做法步骤是什么", None, None, True, None, "五维全空→abstain"),
]

rows = []
mismatch = []
for cid, hint, ep, esc, ab, expl, note in CASES:
    explicit = {"skill": [expl]} if expl else None
    r = rc.resolve(hint, ROUTING, explicit=explicit)
    got = r["primary"]["id"] if r["primary"] else None
    sup = [s["id"] for s in r["supports"]]
    ok = (got == ep) and (not esc or set(esc) <= set(sup)) and (got is None) == ab
    if not ok:
        mismatch.append((cid, ep, got, sup))
    rows.append({
        "id": cid, "hint": hint,
        "expect_primary": ep,
        "expect_supports_contains": esc,
        "expect_abstain": ab,
        **({"explicit_skill": expl} if expl else {}),
        "note": note,
    })

print(f"cases={len(rows)} mismatch={len(mismatch)}")
for m in mismatch:
    print("  MISMATCH:", m)
prims = sorted({r["expect_primary"] for r in rows if r["expect_primary"]})
print(f"distinct primaries={len(prims)}")
print(f"abstain cases={sum(1 for r in rows if r['expect_abstain'])}")
if not mismatch:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("golden.json written:", OUT, os.path.getsize(OUT), "bytes")
