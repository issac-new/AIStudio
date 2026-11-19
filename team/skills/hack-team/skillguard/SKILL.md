---
name: skillguard
description: "AI Agent Skill 安全扫描器 — 三扫描面：Skill 文件（SG 15 规则，映射 OWASP Agentic Skills Top 10 + Lethal Trifecta 组合检测）/ MCP manifest（MP 6 规则）/ 全局指令与启动器 prompt adware（PA 4 规则）。零依赖纯 stdlib，支持 SARIF 输出。Vendor 自 obielin/skillguard。"
version: 1.3.0
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

## 全局指令/启动器 Prompt Adware 扫描（prompt_adware_scan，2026-11-11 增配）

SG 规则管 SKILL.md、MP 规则管 MCP manifest，第三条投毒通道是**第三方"增强/越狱/配置"捆绑包对 agent 全局指令文件与安装启动器的改写**。命名来源：Check Point Research 2026-11-03 披露 Haiou 越狱捆绑包（GitHub haiou-codex，403 star/77 fork，另捆绑进 Codex-X GUI 工具分发）对 OpenAI Codex 实施 **prompt adware**——改写全局指令文件（00-identity.md）注入触发式广告导流作者 LLM 网关、AES-256-GCM 密钥内嵌启动脚本加密 payload.pkg 抗静态扫描、"受保护基础设施"条款禁止 agent 测试作者域名、拒绝抑制 persona 模块越狱。`prompt_adware_scan.py` 补齐该面，4 条 PA 规则：

```bash
cd ~/.hermes/skills/hack-team/skillguard/scripts

# 内置自测试（复现 Haiou 4 机制，全部本地无网络）
python3 -m prompt_adware_scan selftest

# 扫描第三方捆绑包/全局指令目录（*.md *.txt 走 PA-001/002/004；*.sh *.py *.js *.ts 走 PA-003）
python3 -m prompt_adware_scan scan /path/to/bundle-or-dir --json
```

退出码：0 干净 / 1 存在 CRITICAL|HIGH / 2 仅 MEDIUM|LOW / 3 自测试失败（CI 门禁用 exit 1 fail-closed）。

| 规则 | 严重度 | 检测目标 |
|------|--------|----------|
| PA-001 | CRITICAL | 触发式广告注入：问候/激活词枚举 +「只回这一行」精确回复锁 + 推广 URL；无触发词的精确锁+URL 变体同样命中（覆盖推荐偏向类隐蔽操纵） |
| PA-002 | HIGH | 攻击者资产自保护指令：「即使授权/CTF 也不许测试 X 域名」——agent 信任锚点操纵 |
| PA-003 | HIGH | 不透明加密载荷启动器：脚本内嵌对称密钥解密 payload → 内容对静态扫描不可审计 |
| PA-004 | MEDIUM | 拒绝抑制/越狱 persona 签名（≥2 信号：拒绝黑名单 / CTF reframe / 不打断模式 / 护栏绕过） |

适用对象：①第三方捆绑包安装前整目录扫描；②安装后对 `AGENTS.md`/`CLAUDE.md`/全局 instructions 目录的漂移复扫。跨 agent 防御差异实证（同载荷 Sonnet 5 识别注入并拒绝、Codex 版存活）说明模型层注入识别仍是最后一道闸，静态扫描管住供应链入口。接入统一准入门 `skill-admission-scan.py` 为待办（登记 `research/hermes-cluster-pending-and-gap.md`）。

## Related Skills

- `pentest-methodology-fusion` — 渗透方法论融合
- `owasp-security` — OWASP 安全最佳实践
- `security-auditor` — 安全审计

## 修订记录

- 1.1.0 (2026-10-14): 增补供应链检测规则 SG-013（注释内嵌指令）/SG-014（工具描述-代码行为一致性）/SG-015（Rug-Pull 条件分支），来源 G-A2（腾讯朱雀 AIG 分类法对照，裁决矩阵 A2 行）；新增回环 fixtures 于 scripts/skillguard/tests/fixtures/。
- 1.2.0 (2026-10-14): SG-013 误报降噪（G-A2b 双端标定）——L1 签名收窄（移除 jailbreak/DAN 等裸词，保留 ignore-instructions 家族），L2 改双路径共现（数据移动动词+数据目标 / 工具调用动词+工具目标，各含命令词），新增防御性语境全文豁免（CVE/CIS/OWASP/SG-/渗透红队等强标记×弱词汇共现门，签名段永不豁免）。四目标基线 20 误报→0，恶意 fixtures 3/3 检出不变，其余规则 findings 逐目录守恒。
- 1.3.0 (2026-11-11): 新增第三扫描面 `prompt_adware_scan.py`（PA-001 触发式广告注入 / PA-002 攻击者资产自保护指令 / PA-003 加密载荷启动器 / PA-004 拒绝抑制 persona），来源 gap-20261103-022（Check Point Haiou「prompt adware」一手回源 + THN 2026-11 转述 + arXiv 2604.08407 网关风险）。效力实证：selftest 4 机制全检出；devops 60+ 技能良性语料零误报（exit 0）；模拟安装后捆绑包目录 E2E 检出 PA-001+PA-003（exit 1）。接入 `skill-admission-scan.py` 统一准入门待办（登记 research/hermes-cluster-pending-and-gap.md）。
