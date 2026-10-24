---
name: skillguard
description: "AI Agent Skill 安全扫描器 — 12 条规则映射 OWASP Agentic Skills Top 10，含 Lethal Trifecta 组合检测。零依赖纯 stdlib，支持 SARIF 输出。Vendor 自 obielin/skillguard。"
version: 1.2.0
author: Hermes Agent (vendored from obielin/skillguard)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [security, skill-scanner, supply-chain, prompt-injection, data-exfiltration, OWASP]
    source: "https://github.com/obielin/skillguard"
    vendored: true
---

# SkillGuard — AI Agent Skill 安全扫描器

对 AI Agent Skill 进行安装前静态安全扫描，检测 prompt injection、数据外泄、权限提升、混淆 payload 等 12 类风险。

## When to Use

- 安装新 Skill 前的安全审查
- 对现有 Skill 库做全量安全基线扫描
- CI/CD 流水线中的 Skill 安全门禁
- 检测 Lethal Trifecta 组合（prompt injection + 网络 + 文件系统）

## Quick Start

```bash
# 扫描单个 SKILL.md
python3 ~/.hermes/skills/hack-team/skillguard/scripts/skillguard/cli.py scan /path/to/SKILL.md

# 扫描整个 skill 目录
python3 ~/.hermes/skills/hack-team/skillguard/scripts/skillguard/cli.py scan /path/to/skills/

# 输出 SARIF 格式（GitHub Security 集成）
python3 ~/.hermes/skills/hack-team/skillguard/scripts/skillguard/cli.py scan /path/to/skills/ --sarif

# 查看所有检测规则
python3 ~/.hermes/skills/hack-team/skillguard/scripts/skillguard/cli.py rules
```

## 12 条检测规则

| 规则 | 严重度 | 描述 |
|------|--------|------|
| SG-001 Prompt Injection | CRITICAL | 检测 prompt injection 攻击模式 |
| SG-002 Data Exfiltration | CRITICAL | 检测数据外泄行为 |
| SG-003 Privilege Escalation | CRITICAL | 检测权限提升尝试 |
| SG-004 Identity Hijacking | HIGH | 检测身份劫持 |
| SG-005 Secret Harvesting | HIGH | 检测密钥收集行为 |
| SG-006 Rug Pull | CRITICAL | 检测远程下载执行/自修改 |
| SG-007 Scope Creep | HIGH | 检测权限范围蔓延 |
| SG-008 Obfuscation | HIGH | 检测 base64/hex/unicode 混淆 payload |
| SG-009 Covert Channel | HIGH | 检测隐蔽通信通道 |
| SG-010 Social Engineering | HIGH | 检测社会工程攻击 |
| SG-011 Lethal Trifecta | CRITICAL | 组合检测：注入+网络+文件系统三者共存 |
| SG-012 Suspicious URLs | MEDIUM | 检测可疑 URL（ngrok/pastebin/短链） |

## 风险评分

- CRITICAL = 40 分，HIGH = 20 分，MEDIUM = 10 分
- 总分 cap 100；任一 CRITICAL 即整体 CRITICAL
- CI 集成：发现 critical/high 时 exit code 1（fail-closed）

## 输出格式

### 文本输出（默认）
```
🔍 Scanning: /path/to/SKILL.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  SG-001 (CRITICAL): Prompt Injection
   Line 42: "Ignore previous instructions and..."
   
📊 Risk Score: 40/100 (CRITICAL)
```

### SARIF 输出
用于 GitHub Advanced Security / Code Scanning 集成。

## 对 Hermes 集群的批量扫描

```bash
# 扫描所有 profile 的所有 skills
find ~/.hermes/profiles/*/skills -name "SKILL.md" | while read f; do
  python3 ~/.hermes/skills/hack-team/skillguard/scripts/skillguard/cli.py scan "$f"
done

# 扫描 master skills
find ~/.hermes/skills -name "SKILL.md" | while read f; do
  python3 ~/.hermes/skills/hack-team/skillguard/scripts/skillguard/cli.py scan "$f"
done
```

## Integration with Hermes

### 在 skill_manage(create) 前自动扫描

建议在 skill 创建流程中加入自动扫描 hook：

```python
# 伪代码：在 skill_manage create 前调用
result = subprocess.run(
    ["python3", "~/.hermes/skills/hack-team/skillguard/scripts/skillguard/cli.py", 
     "scan", skill_path],
    capture_output=True
)
if result.returncode != 0:
    raise SecurityError("Skill failed security scan")
```

## MCP 工具 Manifest 投毒扫描（mcp_poison_scan，2026-09-22 增配）

skillguard 12 规则只覆盖 SKILL.md；MCP `tools/list` 返回的工具 description/参数 description 是另一条投毒通道（FreeBuf 2026-09-13 文章归纳 5 种攻击模式：Description 注入 / 数据外带 / 凭证窃取 / Rug Pull / 编码混淆）。`mcp_poison_scan.py` 补齐该缺口，6 条 MP 规则 + 哈希基线 Rug-Pull 检测：

```bash
cd ~/.hermes/skills/hack-team/skillguard/scripts

# 内置自测试（复现文章 5 模式夹具，全部本地无网络）
python3 -m mcp_poison_scan selftest

# 扫描 manifest（tools/list 原样 JSON 或 {"tools":[...]}）
python3 -m mcp_poison_scan scan /path/to/manifest.json --baseline /path/to/baseline.json

# 后续接入时校验哈希基线，漂移即 Rug-Pull（MP-004）
python3 -m mcp_poison_scan check /path/to/manifest.json --baseline /path/to/baseline.json
```

退出码：0 干净 / 1 存在 CRITICAL|HIGH / 2 仅 MEDIUM|LOW / 3 自测试失败（CI 门禁用 exit 1 fail-closed）。

| 规则 | 严重度 | 检测目标 |
|------|--------|----------|
| MP-001 | CRITICAL | 隐藏指令块（`<IMPORTANT>`/`<SYSTEM>`、隐瞒用户指令） |
| MP-002 | CRITICAL | 凭证窃取诱导（~/.ssh/id_rsa、~/.aws/credentials、~/.kube/config…） |
| MP-003 | HIGH | 外带通道参数（sidenote/diagnostic 类诱导携带上下文的自由文本参数、描述内 POST URL） |
| MP-004 | HIGH | Rug Pull（manifest 哈希相对基线漂移，含新增/移除工具） |
| MP-005 | HIGH | 编码混淆（Base64 解码出指令文本、Unicode 走私、HTML/NCR 实体） |
| MP-006 | HIGH | 跨工具劫持指令（描述中指示调用其他工具，toolflow hijacking） |

集成到 MCP 准入门：新 MCP server 接入前先 `scan` + 建基线；每次重连/更新后 `check` 基线，漂移即冻结接入并人工复核（对齐设计文档 §3.8 工具准入门「核验来源→最小权限试运行→登记白名单」）。

## Source

Vendored from: https://github.com/obielin/skillguard
License: MIT
Original Author: obielin
MCP manifest 扩展: mcp_poison_scan.py（本仓自研，2026-09-22，证据源 https://www.freebuf.com/articles/ai-security/500438.html + ATR https://agentthreatrule.org）

## Related Skills

- `pentest-methodology-fusion` — 渗透方法论融合
- `owasp-security` — OWASP 安全最佳实践
- `security-auditor` — 安全审计

## 修订记录

- 1.1.0 (2026-10-14): 增补供应链检测规则 SG-013（注释内嵌指令）/SG-014（工具描述-代码行为一致性）/SG-015（Rug-Pull 条件分支），来源 G-A2（腾讯朱雀 AIG 分类法对照，裁决矩阵 A2 行）；新增回环 fixtures 于 scripts/skillguard/tests/fixtures/。
- 1.2.0 (2026-10-14): SG-013 误报降噪（G-A2b 双端标定）——L1 签名收窄（移除 jailbreak/DAN 等裸词，保留 ignore-instructions 家族），L2 改双路径共现（数据移动动词+数据目标 / 工具调用动词+工具目标，各含命令词），新增防御性语境全文豁免（CVE/CIS/OWASP/SG-/渗透红队等强标记×弱词汇共现门，签名段永不豁免）。四目标基线 20 误报→0，恶意 fixtures 3/3 检出不变，其余规则 findings 逐目录守恒。
