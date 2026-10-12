---
name: cybermes-tools
description: "Cybermes 4 个 Go 原生安全工具：smart_pipe 输出过滤/secret_scan 密钥扫描/search_knowledge 知识库搜索/aggregate_reports 报告聚合。Vendor 自 Zyrexnn/Cybermes v2.0.0。"
version: 1.0.0
author: Hermes Agent (vendored from Zyrexnn/Cybermes)
license: Apache-2.0
metadata:
  hermes:
    tags: [security-tools, smart-pipe, secret-scan, knowledge-search, report-aggregator, go-native]
    source: "https://github.com/Zyrexnn/Cybermes"
    vendored: true
---

# Cybermes Tools — 4 个 Go 原生安全工具

> Vendor 自 Cybermes v2.0.0（https://github.com/Zyrexnn/Cybermes），Apache 2.0 许可证。

## 工具清单

| 工具 | 功能 | 性能特点 |
|------|------|----------|
| **smart_pipe** | 流式输出过滤器 | 70-85% token 压缩，Shannon entropy 评分 |
| **secret_scan** | 密钥扫描器 | 48 模式，JSON Lines 输出 |
| **search_knowledge** | 知识库搜索 | 毫秒级，5 个知识库 |
| **aggregate_reports** | 报告聚合器 | 自动生成 SUMMARY.md + metadata.json |
| **generate_pdf.py** | PDF/HTML 报告生成器 | Playwright Chromium，执行级排版 |

## 工具路径

```
~/.hermes/skills/hack-team/cybermes-tools/
├── bin/
│   ├── smart_pipe
│   ├── secret_scan
│   ├── search_knowledge
│   └── aggregate_reports
└── scripts/
    └── generate_pdf.py
```

## 使用方法

### smart_pipe — 输出过滤器

```bash
# 过滤工具输出，只显示高信号行
nmap -sV TARGET | smart_pipe --target <SLUG> --tool nmap

# 限制显示行数（默认 40）
katana -u URL | smart_pipe --target <SLUG> --tool katana --limit 20

# 原始输出自动保存到 recon/<SLUG>/<tool>_raw.txt
```

**评分规则**：
- 静态资源（.png/.css/.js）→ 0 分（过滤）
- 关键标记（[critical]/CVE/RCE/SQLi）→ +80 分
- 秘密标记（.env/.git/password）→ +60 分
- HTTP 状态码（200/401/403）→ +15-25 分
- 参数（?key=value）→ +20 分
- 高 entropy（>3.0）→ +30 分

### secret_scan — 密钥扫描器

```bash
# 扫描文件
secret_scan /path/to/file.txt

# 扫描目录（多线程）
secret_scan /path/to/dir/

# 从 stdin 扫描
cat file.txt | secret_scan

# 输出 JSON Lines
{"pattern":"AWS_ACCESS_KEY","severity":"critical","category":"aws","match":"AKIA...","source":"file.txt","line":42}
```

**检测模式**（48 个）：
- AWS / GCP / GitHub / Stripe / Slack
- SendGrid / Mailgun / Twilio
- JWT / Private Key / Generic Secret

### search_knowledge — 知识库搜索

```bash
# 搜索知识库
search_knowledge "sql injection bypass"

# 限制结果数
search_knowledge "xss" --limit 5

# 指定知识库
search_knowledge "idor" --source payloads
```

**知识库**：
- PayloadsAllTheThings
- hacktricks
- Claude-BugHunter
- strix-skills
- hack-skills

### aggregate_reports — 报告聚合器

```bash
# 聚合单个目标报告
aggregate_reports <TARGET_SLUG>

# 聚合所有目标
aggregate_reports --all
```

**输出**：
- `reports/<SLUG>/SUMMARY.md` — Executive Summary + Findings Matrix
- `reports/<SLUG>/metadata.json` — 结构化数据

### generate_pdf.py — PDF/HTML 报告生成器

```bash
# 生成 HTML + PDF 报告（需要 venv 含 markdown/jinja2/playwright）
python3 ~/.hermes/skills/hack-team/cybermes-tools/scripts/generate_pdf.py <TARGET_SLUG>

# 仅 HTML（跳过 PDF）
python3 ~/.hermes/skills/hack-team/cybermes-tools/scripts/generate_pdf.py <TARGET_SLUG> --no-pdf

# 批量生成所有目标
python3 ~/.hermes/skills/hack-team/cybermes-tools/scripts/generate_pdf.py --all
```

**依赖**（建议 venv）：
```
pip install markdown jinja2 playwright
playwright install chromium
```

**输出**：
- `reports/<SLUG>/report.html` — 交互式 HTML dashboard
- `reports/<SLUG>/REPORT.pdf` — 执行级 PDF 报告（Playwright Chromium 渲染）

## 与 Hermes 集成

### smart_pipe 集成到 terminal

```python
# 在 hack team SOUL.md 中建议
# 所有安全工具输出通过 smart_pipe 过滤
alias nmap="nmap | smart_pipe --target \$TARGET --tool nmap"
alias katana="katana | smart_pipe --target \$TARGET --tool katana"
```

### secret_scan 集成到 hack-recon

```bash
# 侦察阶段自动扫描泄露密钥
secret_scan /path/to/downloaded/files/
```

### search_knowledge 集成到 skill_view

```python
# 在 skill 中引用知识库
# 先搜索相关知识
search_knowledge "<vuln_type>" --limit 3
```

## 注意事项

1. **smart_pipe 需要 AGENTS.md 定位项目根目录**——在 Hermes workspace 中运行时会自动找到
2. **search_knowledge 需要知识库文件**——默认搜索 Cybermes 的 knowledge/ 目录
3. **aggregate_reports 需要 reports/ 目录结构**——参考 Cybermes 的目标范围工作区规范

## Source

- Repository: https://github.com/Zyrexnn/Cybermes
- Version: v2.0.0
- License: Apache 2.0
- Build: Go 1.22+（darwin/arm64）

## Related Skills

- `skillguard` — Skill 安全扫描（静态分析）
- `scope-gate` — 确定性 scope 门禁
- `incident-response` — 应急响应 playbook
