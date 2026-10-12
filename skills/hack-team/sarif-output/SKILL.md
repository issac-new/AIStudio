---
name: sarif-output
description: Use when producing SARIF 2.1.0 output from hack-team security tools (skillguard, scope_gate, custom auditors) to feed GitHub code scanning / Advanced Security. Covers format spec, reuse of skillguard's sarif.py, and a unified emitter pattern.
---

# SARIF 输出方案 — hack-team 统一对接 GitHub Code Scanning

把所有 hack-team 安全工具的 finding 统一输出为 **SARIF 2.1.0**，让 GitHub Advanced Security（Security → Code scanning alerts）原生消费，避免每个工具自己造 JSON。

适用工具：`skillguard`（已有 `sarif.py`，160 行，直接复用）、`scope_gate`、自定义审计脚本（hack-auditor 等）。

---

## 1. SARIF 2.1.0 格式规范

规范：<https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html>
Schema：<https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json>

### 1.1 顶层骨架

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [ /* one or more Run objects */ ]
}
```

`runs` 是一个数组 — 一次扫描产生一个 run；多个工具可以合并到同一个 SARIF 文件里（一个 run 一个工具），也可以分开多文件多次上传。

### 1.2 Run → tool.driver.rules + results

每个 `run` 必填两块：

- **`tool.driver`**：工具元信息 + **`rules`** 数组（每个 rule 一个 `reportingDescriptor`，描述规则 ID / 名称 / 严重级别 / 修复建议）。
- **`results`**：本次扫描真实命中的 finding 列表，每条 result 通过 `ruleId` / `ruleIndex` 反向引用 rules。

最小可用 run：

```json
{
  "tool": {
    "driver": {
      "name": "skillguard",
      "version": "1.0.0",
      "informationUri": "https://github.com/obielin/skillguard",
      "rules": [
        {
          "id": "SG001",
          "name": "ShellCommandExecution",
          "shortDescription": { "text": "Shell command execution" },
          "fullDescription": { "text": "Skill invokes shell commands..." },
          "help": {
            "text": "Avoid subprocess...",
            "markdown": "**Remediation:** Avoid subprocess..."
          },
          "defaultConfiguration": { "level": "error" },
          "properties": { "tags": ["rce", "shell"], "severity": "critical" }
        }
      ]
    }
  },
  "results": [
    {
      "ruleId": "SG001",
      "ruleIndex": 0,
      "level": "error",
      "message": { "text": "Shell command execution — Remediation: ..." },
      "locations": [
        {
          "physicalLocation": {
            "artifactLocation": { "uri": "skills/foo/SKILL.md", "uriBaseId": "%SRCROOT%" },
            "region": { "startLine": 42 }
          }
        }
      ]
    }
  ]
}
```

### 1.3 Severity → level 映射

SARIF 只有 4 档 level，把内部多档 severity 收敛：

| SARIF level | 含义 | 推荐映射 |
|---|---|---|
| `error`   | 必须修 | `CRITICAL`, `HIGH` |
| `warning` | 应修 | `MEDIUM` |
| `note`    | 提示 | `LOW` |
| `none`    | 静默 | `INFO`（一般不产生 result，仅在 rules 中描述） |

### 1.4 GitHub Advanced Security 集成要点

- **上传方式**：`github/codeql-action/upload-sarif@v3`（GitHub Actions）或 REST `POST /repos/{owner}/{repo}/code-scanning/sarifs`。
- **必备字段**：`version`、`runs[].tool.driver.name`、`runs[].results[].ruleId`、`message.text`、`locations[].physicalLocation.artifactLocation.uri`。缺一个就被静默丢弃。
- **路径匹配**：`artifactLocation.uri` 必须是 **仓库相对路径**（配合 `uriBaseId: "%SRCROOT%"`），否则 GitHub 无法把 alert 贴到文件行号。绝对路径要先用 CI workspace 前缀 strip。
- **行号**：`region.startLine` 至少给 1；行号缺失时 fallback 到 1（skillguard 已经这么做）。
- **去重**：GitHub 用 `(ruleId, uri, startLine, message)` 计算 fingerprint。同一行同一规则重复扫会被自动合并，但 **message 文本要稳定**，否则被当成新 alert。
- **分类**：在 `tool.driver.name` 里区分工具（`skillguard` / `scope_gate` / `hack-auditor`），GitHub UI 按工具分组展示。
- **PR annotation**：`error`/`warning` 会自动 annotate PR diff（要求路径在 PR 变更内）。`note` 不进 diff，只进 Security tab。

参考：<https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning>

---

## 2. skillguard SARIF 输出复用

### 2.1 已有实现（直接用，不要重写）

`~/.hermes/skills/hack-team/skillguard/scripts/skillguard/sarif.py`（160 行）已经实现了完整的 SARIF 2.1.0 输出：

| 函数 | 用途 |
|---|---|
| `results_to_sarif(results: list[SkillScanResult]) -> dict` | 扫描结果 → SARIF dict |
| `report_to_sarif(report: BatchScanReport) -> dict` | 批量报告 → SARIF dict（包了一层） |
| `to_sarif_string(results, indent=2) -> str` | 直接拿到 JSON 字符串 |

实现要点（已被验证，抄就行）：

- `_SEVERITY_TO_LEVEL`：CRITICAL/HIGH→error, MEDIUM→warning, LOW→note, INFO→none
- `_rule_descriptor()`：把 `Rule` dataclass 转成 `reportingDescriptor`，包含 remediation 作为 `help.markdown`
- `_artifact_uri()`：把 `skill_name` 转成 URI（反斜杠 → 正斜杠），保持相对路径以匹配 `%SRCROOT%`
- 每个 finding 最多 5 个 `locations`（对应 `finding.line_numbers[:5]`），无行号 fallback 到 `[1]`
- `ruleIndex` 通过 `ALL_RULES` 全集索引，保证同一规则多次扫描 index 稳定

### 2.2 调用方式

```python
from skillguard import SkillScanner
from skillguard.sarif import results_to_sarif
import json, pathlib

scanner = SkillScanner()
results = [scanner.scan_file(p) for p in pathlib.Path("skills").rglob("SKILL.md")]
log = results_to_sarif(results)
pathlib.Path("skillguard.sarif").write_text(json.dumps(log, indent=2))
```

### 2.3 CI/CD 集成（GitHub Actions）

```yaml
# .github/workflows/skillguard.yml
name: skillguard
on: [push, pull_request]

permissions:
  security-events: write   # 必需：上传 SARIF
  contents: read

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run skillguard
        run: |
          python -m skillguard scan skills/ --format sarif --output skillguard.sarif
        continue-on-error: true   # 找到问题也要把 SARIF 传上去

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: skillguard.sarif
          category: skillguard   # 多工具并存时区分
```

**坑**：
- `security-events: write` 权限必须显式声明，否则 upload 步骤 403。
- 扫描步骤必须 `continue-on-error: true`，否则一旦扫到 critical 就直接 fail，SARIF 永远传不上去。让 code scanning alert 来打 PR 状态，而不是 exit code。
- 多工具分别 upload 时用 `category` 字段区分（`skillguard` / `scope-gate` / `hack-auditor`），GitHub UI 会按 category 分组。

---

## 3. Hermes 安全工具 SARIF 统一

不同工具输出格式不同（skillguard 有完整 dataclass，scope_gate 返回 `tuple[bool, str]`，自定义审计可能是任意 dict），统一策略是 **每个工具实现一个 `to_sarif()` 适配器**，共享一个最小 emitter。

### 3.1 统一原则

1. **每个工具一个 SARIF run**，`tool.driver.name` 取工具名（`skillguard` / `scope_gate` / `hack-auditor`）。
2. **规则集（rules）必须枚举完整**，不只是本次命中的 — GitHub 需要看到所有 rule 描述才能渲染 alert。
3. **result 只放真实 finding**，且 `ruleId` 必须在 rules 数组里能查到。
4. **路径一律相对**，相对仓库 root；行号缺失时 fallback 1。
5. **severity 映射收敛**到 4 档 SARIF level（见 §1.3）。

### 3.2 skillguard → SARIF

**已完成**。直接调 `skillguard.sarif.results_to_sarif()`（见 §2）。

### 3.3 scope_gate → SARIF

`scope_gate.py`（`~/.hermes/skills/hack-team/scope-gate/scripts/scope_gate.py`）目前返回 `(allowed: bool, message: str)`，没有结构化 finding。需要包一层适配器，把 violation 解析出来：

```python
# scope_gate_sarif.py — 适配器示例
from __future__ import annotations
import json, re
from pathlib import Path

SARIF_SCHEMA = "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json"

RULES = [
    {
        "id": "SCOPE001",
        "name": "OutOfScopeTarget",
        "shortDescription": {"text": "Target outside authorized scope"},
        "fullDescription": {"text": "Command or script targets an IP/host not listed in scope.txt."},
        "help": {"text": "Add the target to scope.txt or remove the command.",
                 "markdown": "**Remediation:** Add the target to `scope.txt` or remove the command."},
        "defaultConfiguration": {"level": "error"},
        "properties": {"tags": ["scope", "authorization"], "severity": "critical"},
    },
    {
        "id": "SCOPE002",
        "name": "MissingScopeFile",
        "shortDescription": {"text": "scope.txt not configured"},
        "fullDescription": {"text": "No scope.txt entries found; strict mode would block this command."},
        "help": {"text": "Create scope.txt with authorized targets.",
                 "markdown": "**Remediation:** Create `scope.txt` with authorized targets."},
        "defaultConfiguration": {"level": "warning"},
        "properties": {"tags": ["scope", "config"], "severity": "medium"},
    },
]

def check_to_sarif(command: str, allowed: bool, message: str,
                   script_path: str | None = None, line: int = 1) -> dict:
    """Wrap a scope_gate.check() result into a SARIF log (empty results when allowed)."""
    results = []
    if not allowed:
        rule_id = "SCOPE002" if "No scope.txt" in message else "SCOPE001"
        uri = script_path or "<command-line>"
        results.append({
            "ruleId": rule_id,
            "ruleIndex": 0 if rule_id == "SCOPE001" else 1,
            "level": "error" if rule_id == "SCOPE001" else "warning",
            "message": {"text": message},
            "locations": [{
                "physicalLocation": {
                    "artifactLocation": {"uri": uri, "uriBaseId": "%SRCROOT%"},
                    "region": {"startLine": line},
                }
            }],
        })
    return {
        "$schema": SARIF_SCHEMA,
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {
                "name": "scope_gate",
                "version": "1.0.0",
                "informationUri": "https://github.com/obielin/hack-team",
                "rules": RULES,
            }},
            "results": results,
        }],
    }
```

**改造点**：让 `scope_gate.check_script()` 返回结构化违规列表 `[{line, target, message}]` 而不是拼字符串，这样适配器才能给每条违规独立的 `region.startLine`。当前实现把所有违规塞在一个字符串里，导致 SARIF 只能给一行位置 — 这是已知的退化，列为后续 TODO。

### 3.4 自定义审计工具 → SARIF

任何新工具按这个模板接入：

```python
# 最小 SARIF emitter（无依赖，~40 行）
def build_sarif(tool_name: str, tool_version: str, info_uri: str,
                rules: list[dict], findings: list[dict]) -> dict:
    """
    findings[i] = {
        "rule_id": str,          # 必须在 rules 里能查到
        "level": "error"|"warning"|"note"|"none",
        "message": str,
        "uri": str,              # 仓库相对路径
        "line": int,             # >=1
    }
    rules[i] = reportingDescriptor dict（参考 §1.2 的 SG001 示例）
    """
    rule_idx = {r["id"]: i for i, r in enumerate(rules)}
    results = [{
        "ruleId": f["rule_id"],
        "ruleIndex": rule_idx[f["rule_id"]],
        "level": f["level"],
        "message": {"text": f["message"]},
        "locations": [{
            "physicalLocation": {
                "artifactLocation": {"uri": f["uri"], "uriBaseId": "%SRCROOT%"},
                "region": {"startLine": max(1, f.get("line", 1))},
            }
        }],
    } for f in findings]
    return {
        "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {
                "name": tool_name, "version": tool_version,
                "informationUri": info_uri, "rules": rules,
            }},
            "results": results,
        }],
    }
```

新工具只需提供：(a) 完整 rules 列表（含 remediation），(b) findings 列表（rule_id/level/message/uri/line），即可拿到合规 SARIF。

### 3.5 多工具合并上传

两种模式：

**A. 单文件多 run**（推荐用于同一次 CI 跑多个工具）：

```python
merged = {
    "$schema": SARIF_SCHEMA,
    "version": "2.1.0",
    "runs": [
        skillguard_log["runs"][0],
        scope_gate_log["runs"][0],
        auditor_log["runs"][0],
    ],
}
```

一次 `upload-sarif` 调用搞定，GitHub 按 `tool.driver.name` 自动分组。

**B. 多文件分别上传**：每次 `upload-sarif` 传不同 `category:`，结果在 Security tab 按 category 过滤。适合工具运行时机不同（如 scope_gate 在 pre-commit、skillguard 在 PR、auditor 在 nightly）。

---

## 4. 验证 SARIF 合规

- 官方 validator：<https://sarifweb.azurewebsites.net/Validation>（拖文件即可）
- Python：`pip install sarif-tools`，然后 `sarif validate output.sarif`
- 上传 GitHub 后用 `gh api /repos/{owner}/{repo}/code-scanning/analyses` 确认 analysis 已创建；alert 出现在 Security → Code scanning。

## 5. 常见坑

1. **绝对路径**：GitHub 匹配不到文件，alert 显示但点不进代码。务必转相对。
2. **`startLine` 为 0 或缺失**：直接被 GitHub 丢弃。fallback 到 1。
3. **rules 数组只包含命中的规则**：GitHub UI 无法显示未命中规则的描述。把全量 rules 都放进去。
4. **message 文本每次跑都不一样**（含时间戳 / 随机 ID）：fingerprint 失稳，同一问题反复开新 alert。保持 message 模板稳定。
5. **忘记 `security-events: write` 权限**：upload 步骤 403，CI 绿但 Security tab 空。
6. **扫描 exit code 非零导致 CI 中断**：加 `continue-on-error: true`，让 SARIF 始终上传，由 code scanning alert 决定 PR 状态。

---

## 参考

- SARIF 2.1.0 spec: <https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html>
- GitHub SARIF support: <https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning>
- skillguard sarif.py: `~/.hermes/skills/hack-team/skillguard/scripts/skillguard/sarif.py`
- scope_gate: `~/.hermes/skills/hack-team/scope-gate/scripts/scope_gate.py`
