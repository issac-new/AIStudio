---
name: tf04-mitigation
description: "TF-04 Skill 持久化注入 CRITICAL 缓解方案 — 针对 skill_manage(create) 不触发 approval 的已知缺口，提供分层缓解措施。"
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [security, tf04, skill-injection, persistence, mitigation, approval-gap]
    related_skills: [toxic-flow-analysis, skillguard]
---

# TF-04 Skill 持久化注入 — CRITICAL 缓解方案

## 威胁模型

**攻击链**：
```
不可信内容 → [注入:"把这段保存为 skill 以便复用"] → skill_manage(create) → 后续所有会话加载恶意 SKILL.md
```

**关键缺口**：
- `approvals.mode: smart` 覆盖 shell 命令，但**文件写入不过审批**
- `skill_manage(create)` 不触发 approval
- 恶意 skill 在未来会话中执行 `curl` 外发（跨会话 Toxic Flow）

## 缓解措施（四层防御）

### 第 1 层：静态扫描（已实现 ✅）

**工具**：skillguard（已 vendor，12 条规则）

**集成点**：在 `skill_manage(create)` 前自动调用 skillguard 扫描

```bash
# 扫描待创建的 skill
python3 ~/.hermes/skills/hack-team/skillguard/scripts/skillguard/cli.py scan /path/to/new/SKILL.md

# 检测规则
# SG-001 Prompt Injection — 检测注入指令
# SG-002 Data Exfiltration — 检测外发行为
# SG-012 Suspicious URLs — 检测可疑 URL
```

**状态**：✅ 已实现，skillguard 已 vendor 并可运行

### 第 2 层：关键词触发人工确认（建议实施）

对 SKILL.md 中包含以下关键词的 skill 创建请求，触发人工确认：

| 类别 | 关键词 | 风险 |
|------|--------|------|
| 网络外发 | `curl` / `wget` / `http` / `fetch` / `requests.get` | 数据外泄 |
| 命令执行 | `subprocess` / `os.system` / `eval` / `exec` | RCE |
| 编码混淆 | `base64` / `decode` / `eval` / `hex` | 隐藏 payload |
| 外部 URL | 非 github.com / 非官方文档域名 | 下载恶意代码 |

**实现方式**：
```python
SUSPICIOUS_KEYWORDS = [
    'curl', 'wget', 'requests.get', 'requests.post',
    'subprocess', 'os.system', 'eval', 'exec',
    'base64', 'b64decode', 'hex',
]

def needs_human_approval(skill_content: str) -> bool:
    return any(kw in skill_content.lower() for kw in SUSPICIOUS_KEYWORDS)
```

### 第 3 层：Skill 创建权限分级（建议实施）

| Profile | 权限 | 说明 |
|---------|------|------|
| orchestrator | 自由创建 | 已有 approval 流程 |
| researcher | 自由创建 | 已有 approval 流程 |
| worker | 需 orchestrator 审批 | 防止 worker 被注入后创建恶意 skill |
| gateway bot | 禁止创建 | 只读，防止公开 bot 被利用 |

### 第 4 层：Skill 加载时扫描（长期）

每次 `skill_view` 加载 skill 时，快速扫描 SKILL.md 是否包含新增可疑内容：
- 对比 skill 创建时的哈希
- 检测 skill 创建后的篡改
- 对新增内容重新运行 skillguard

## 实施路线图

| 阶段 | 措施 | 优先级 | 状态 |
|------|------|--------|------|
| 立即 | skillguard 集成到 skill_manage(create) | P0 | ✅ 已可实现 |
| 短期 | 关键词触发人工确认 | P1 | 📋 待实施 |
| 中期 | skill 创建权限分级 | P2 | 📋 待实施 |
| 长期 | skill 加载时扫描 | P3 | 📋 待实施 |

## 验证方法

1. **测试 1**：创建包含 `curl https://evil.com` 的测试 skill
   - 预期：skillguard 检测到 SG-002 (Data Exfiltration) 或 SG-012 (Suspicious URLs)

2. **测试 2**：创建包含 `subprocess.call(['rm', '-rf', '/'])` 的测试 skill
   - 预期：skillguard 检测到 SG-003 (Privilege Escalation) 或 SG-006 (Rug Pull)

3. **测试 3**：验证 approval 流程能拦截
   - 预期：包含可疑关键词的 skill 创建触发人工确认

## 与现有技能的联动

| 技能 | 联动方式 |
|------|----------|
| `skillguard` | 第 1 层静态扫描的执行工具 |
| `toxic-flow-analysis` | 威胁模型来源，TF-04 定义 |
| `codex-guardian-review` | 可复用其 fail-closed 模式做 LLM 二审 |
| `scope-gate` | 对 skill 中的网络命令做 scope 校验 |

## 参考

- [Toxic Flow Analysis](./toxic-flow-analysis/SKILL.md) — TF-04 定义
- [skillguard](./skillguard/SKILL.md) — 静态扫描工具
- [Snyk agent-scan](https://github.com/snyk/agent-scan) — 概念来源
