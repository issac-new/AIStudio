---
name: autonomous-godmode-hunter
description: "端到端自动化安全研究与全表面漏洞狩猎引擎。6 阶段 pipeline：被动侦察→主动发现→攻击面排序→深度漏洞假设→受控利用验证→证据捕获报告。借鉴 Cybermes autonomous-godmode-hunter。"
version: 1.0.0
author: Hermes Agent (inspired by Cybermes)
license: Apache-2.0
metadata:
  hermes:
    tags: [autonomous-hunting, bug-bounty, full-pipeline, recon-to-report, cybermes]
    source: "https://github.com/Zyrexnn/Cybermes/blob/main/skills/autonomous-godmode-hunter/SKILL.md"
---

# Autonomous God-Mode Bug Hunter

> 端到端自动化安全研究与全表面漏洞狩猎引擎。从目标定义到报告生成的完整 pipeline。

## 核心原则

1. **显式授权**：scope.yaml 或对话中指定的目标即视为授权，直接开始 aggressive 验证
2. **非破坏性**：速率控制（生产目标 5-10 req/s），禁止 DoS/数据修改
3. **零误报**：无可复现 HTTP 证据/浏览器日志/执行证明 = 不确认漏洞

## 6 阶段 Pipeline

```
[ Target Defined in scope.yaml ]
            │
    ┌───────┴───────┐
    ▼               ▼
[ Phase 1 ]     [ Phase 2 ]
Passive Recon   Active Discovery
- subfinder     - httpx probe
- assetfinder   - tech detect
- gau (wayback) - katana SPA crawl
    │               │
    └───────┬───────┘
            ▼
    [ Phase 3: Attack Surface Ranking ]
- ffuf / feroxbuster (content fuzzing)
- parameter mining (burp-parameter-names)
- JS secret & endpoint extraction
            │
            ▼
    [ Phase 4: Deep Vulnerability Hypothesis ]
- Auth & session handling (dual-account matrix)
- IDOR / BOLA / mass-assignment
- Injection vectors (SQLi, SSTI, CMDi)
- Client-side flaws (DOM XSS, CORS, CSRF)
- SSRF & OOB interaction
            │
            ▼
    [ Phase 5: Controlled Exploit Validation ]
- Replay & mutate requests
- Isolate root cause flaw
- Generate minimal-impact PoC (Python)
            │
            ▼
    [ Phase 6: Evidence Capture & Reporting ]
- Raw HTTP request/response proofs
- CVSS v3.1 structured markdown report
- Write to reports/<TARGET_SLUG>/
```

## 各阶段详细命令

### Phase 1: Passive Recon

```bash
# 子域名枚举
subfinder -d $TARGET -silent > recon/$TARGET_SLUG/subfinder.txt
assetfinder --subs-only $TARGET > recon/$TARGET_SLUG/assetfinder.txt

# 历史 URL 挖掘
gau $TARGET --threads 5 > recon/$TARGET_SLUG/gau.txt

# 合并去重
cat recon/$TARGET_SLUG/*.txt | sort -u > recon/$TARGET_SLUG/all_subs.txt
```

### Phase 2: Active Discovery

```bash
# HTTP 探测 + 技术栈识别
httpx -l recon/$TARGET_SLUG/all_subs.txt -silent -status-code -title -tech-detect > recon/$TARGET_SLUG/httpx.txt

# SPA/JS 爬虫
katana -u $TARGET -silent -depth 3 -js-crawl > recon/$TARGET_SLUG/katana.txt

# 智能过滤（只显示高信号）
cat recon/$TARGET_SLUG/httpx.txt | smart_pipe --target $TARGET_SLUG --tool httpx
```

### Phase 3: Attack Surface Ranking

```bash
# 内容发现
ffuf -u $TARGET/FUZZ -w tools/wordlists/common.txt -mc 200,301,302,403 | smart_pipe --target $TARGET_SLUG --tool ffuf

# 参数挖掘
ffuf -u $TARGET/page?FUZZ=1 -w tools/wordlists/burp-parameter-names.txt -mc 200 | smart_pipe --target $TARGET_SLUG --tool params

# JS 端点提取
cat recon/$TARGET_SLUG/katana.txt | grep -E '\.js$' | while read js; do
  curl -s "$js" | grep -oE '"/[a-zA-Z0-9_/]+"' | sort -u
done > recon/$TARGET_SLUG/js_endpoints.txt
```

### Phase 4: Deep Vulnerability Hypothesis

```bash
# 双账户矩阵测试（IDOR/BOLA）
# Account A: researcher_user_a
# Account B: researcher_user_b
# 测试 A 的资源能否被 B 访问

# 注入向量测试
sqlmap -u "$TARGET/api/users?id=1" --batch --level=3 --risk=2

# XSS 测试
dalfox url $TARGET --silence

# 客户端测试（Puppeteer MCP）
# 使用 puppeteer_navigate / puppeteer_evaluate 检测 DOM XSS
```

### Phase 5: Controlled Exploit Validation

```bash
# 生成最小影响 PoC
cat > reports/$TARGET_SLUG/pocs/poc_idor_documents.py << 'EOF'
#!/usr/bin/env python3
"""Minimal-impact IDOR PoC — read-only verification"""
import requests
import sys

TARGET = sys.argv[1] if len(sys.argv) > 1 else "https://example.com"
headers = {"User-Agent": "Cybermes-Security-Auditor/1.0"}

# Test: Access document ID 1 as user B (should fail if secure)
resp = requests.get(f"{TARGET}/api/documents/1", headers=headers, timeout=10)

if resp.status_code == 200:
    print("[+] IDOR confirmed: Accessible without authorization")
    print(f"    Response preview: {resp.text[:200]}")
else:
    print(f"[-] Secure: {resp.status_code}")
EOF

chmod +x reports/$TARGET_SLUG/pocs/poc_idor_documents.py
```

### Phase 6: Evidence Capture & Reporting

```bash
# 保存原始证据
cp raw_http_trace.json reports/$TARGET_SLUG/evidence/
cp screenshot.png reports/$TARGET_SLUG/evidence/screenshots/

# 生成 finding 报告
cat > reports/$TARGET_SLUG/findings/high_idor_documents.md << 'EOF'
# IDOR in Document Access API

## Severity: High
## CVSS v3.1: 7.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)

## Description
The document access API endpoint `/api/documents/{id}` does not validate user authorization, allowing unauthenticated access to arbitrary documents.

## Evidence
- HTTP Request: evidence/idor_request.json
- HTTP Response: evidence/idor_response.json
- PoC Script: pocs/poc_idor_documents.py
- Screenshot: evidence/screenshots/idor_proof.png

## Reproduction
```bash
python3 pocs/poc_idor_documents.py https://example.com
```

## Remediation
Implement proper authorization checks on all document access endpoints.
EOF

# 聚合报告
aggregate_reports $TARGET_SLUG
```

## 与 Hermes 现有工具的集成

### 与 scope_gate 集成

```bash
# Phase 0: 验证 scope
python3 scope_gate.py check "subfinder -d $TARGET"
```

### 与 smart_pipe 集成

```bash
# 所有工具输出通过 smart_pipe 过滤
<sub_command> | smart_pipe --target $TARGET_SLUG --tool <tool_name>
```

### 与 secret_scan 集成

```bash
# Phase 3 后自动扫描下载的 JS 文件
secret_scan recon/$TARGET_SLUG/js_files/
```

### 与 search_knowledge 集成

```bash
# Phase 4 前搜索相关漏洞知识
search_knowledge "idor bola" --limit 3
search_knowledge "sql injection bypass" --limit 3
```

## 安全与合规

- **速率限制**：生产目标 ≤10 req/s
- **非破坏性**：只读操作，禁止数据修改
- **证据脱敏**：报告中的密钥/token 必须 `[REDACTED]`
- **授权边界**：严格在 scope.yaml 定义的范围内

## Source

Inspired by: https://github.com/Zyrexnn/Cybermes/blob/main/skills/autonomous-godmode-hunter/SKILL.md

## Related Skills

- `target-scoped-workspace` — 目录结构规范
- `cybermes-tools` — smart_pipe / secret_scan / search_knowledge / aggregate_reports
- `scope-gate` — 确定性 scope 门禁
- `pentest-methodology-fusion` — 渗透方法论
