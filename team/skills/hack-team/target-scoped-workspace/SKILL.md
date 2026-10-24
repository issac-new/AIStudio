---
name: target-scoped-workspace
description: "目标范围工作区规范 — 每个安全评估必须遵循 reports/<TARGET_SLUG>/{findings,pocs,evidence} 目录结构。借鉴 Cybermes v2.0.0。"
version: 1.0.0
author: Hermes Agent (inspired by Cybermes)
license: Apache-2.0
metadata:
  hermes:
    tags: [workspace, reporting, evidence-management, target-scoped, cybermes]
    source: "https://github.com/Zyrexnn/Cybermes"
---

# 目标范围工作区规范

> 每个目标评估必须遵循严格的目录结构，确保报告可追溯、可聚合、可审计。

## 目录结构

`TARGET_SLUG` 命名规则：`example.com` → `example_com`，`127.0.0.1:8888` → `127_0_0_1_8888`

```
reports/<TARGET_SLUG>/
├── SUMMARY.md            # Executive Summary & Findings Matrix（自动聚合生成）
├── metadata.json         # 结构化 JSON 指标（自动聚合生成）
├── findings/             # 仅确认的漏洞（low/medium/high/critical）
│   ├── critical_auth_bypass.md
│   ├── high_idor_documents.md
│   └── medium_xss_reflected.md
├── pocs/                 # 独立可复现 PoC 脚本
│   ├── poc_auth_bypass.py
│   └── poc_idor_documents.py
└── evidence/             # 原始证据、侦察观察、信息性发现
    ├── recon_notes.md    # 所有信息性观察、缺失头、负测试矩阵
    ├── login_trace.json  # 原始 HTTP 请求/响应
    └── screenshots/      # 截图证据
```

## 文件命名规则

### findings/ 目录

- **格式**：`<severity>_<vuln_name>.md`
- **severity**：`low` / `medium` / `high` / `critical`
- **vuln_name**：snake_case，无方括号 `[...]`，无特殊字符
- **示例**：`high_idor_orders.md`、`critical_auth_lockout.md`

**禁止**：
- ❌ 在 `findings/` 放信息性观察（missing headers、version disclosure）
- ❌ 在 `findings/` 放负测试矩阵（negative test tables）
- ❌ 使用方括号或 shell 特殊字符

### evidence/ 目录

- **recon_notes.md**：所有信息性观察、缺失安全头、版本信息、负测试结果
- ***.json / *.log**：原始工具输出、HTTP 请求/响应 trace
- **screenshots/**：浏览器截图、PoC 证明截图

### pocs/ 目录

- **格式**：`poc_<vuln_name>.py`
- **要求**：自包含、最小影响、可复现
- **示例**：`poc_idor_documents.py`

## 信息隔离原则

| 内容类型 | 存放位置 | 原因 |
|----------|----------|------|
| 确认的漏洞（有 PoC + 证据） | `findings/` | 需要客户/管理层关注 |
| 信息性观察（missing headers 等） | `evidence/recon_notes.md` | 技术细节，非漏洞 |
| 负测试（401/403 正确响应） | `evidence/recon_notes.md` | 证明安全控制有效 |
| 原始工具输出 | `evidence/` | 证据链完整性 |
| PoC 脚本 | `pocs/` | 可复现验证 |

## 自动聚合

完成测试后运行：

```bash
aggregate_reports <TARGET_SLUG>
```

生成：
- `SUMMARY.md`：Executive Summary + Findings Matrix + 统计图表
- `metadata.json`：结构化数据（漏洞数量、severity 分布、CVSS 分数）

## 与现有工具的集成

### 与 scope_gate 集成

```bash
# 创建目标工作区前验证 scope
TARGET_SLUG="example_com"
python3 ~/.hermes/skills/hack-team/scope-gate/scripts/scope_gate.py check "echo $TARGET_SLUG"

# 创建目录结构
mkdir -p reports/$TARGET_SLUG/{findings,pocs,evidence/screenshots}
```

### 与 evidence gate 集成

```bash
# 每个 finding 必须引用 evidence
# 在 finding.md 中引用 evidence/ 目录下的文件
```

### 与 aggregate_reports 集成

```bash
# 完成测试后自动聚合
aggregate_reports $TARGET_SLUG

# 或批量聚合所有目标
aggregate_reports --all
```

## 示例工作流

```bash
# 1. 定义目标
TARGET="https://example.com"
TARGET_SLUG="example_com"

# 2. 验证 scope
python3 scope_gate.py check "nmap $TARGET"

# 3. 创建工作区
mkdir -p reports/$TARGET_SLUG/{findings,pocs,evidence/screenshots}

# 4. 侦察（输出到 evidence/）
nmap -sV $TARGET | smart_pipe --target $TARGET_SLUG --tool nmap

# 5. 漏洞验证（发现确认后写入 findings/）
# ... 测试过程 ...
cat > reports/$TARGET_SLUG/findings/high_idor_documents.md << 'EOF'
# IDOR in Document Access

## Severity: High
## CVSS: 7.5

## Evidence
- Request: evidence/idor_request.json
- Response: evidence/idor_response.json
- PoC: pocs/poc_idor_documents.py
EOF

# 6. 信息性观察（写入 evidence/）
cat >> reports/$TARGET_SLUG/evidence/recon_notes.md << 'EOF'
## Missing Security Headers
- X-Frame-Options: Not set
- X-Content-Type-Options: Not set
- Content-Security-Policy: Not set
EOF

# 7. 聚合报告
aggregate_reports $TARGET_SLUG
```

## 目标档案 7 件套（Engagement 档案，跨会话连续）

> 来源：bface-agent L2 认知档案层（github.com/gmeier909/bface-agent，README 蒸馏于
> 2026-09-09，原始证据：workspace/websec-tools-survey/raw/tools/bface-agent_README.md）。
> bface-agent 核心理念「认知架构 > 工具堆砌」：目标记忆不散落在对话里，而是结构化档案，
> 跨会话连续。本节把该档案约定嫁接到 `reports/<TARGET_SLUG>/` 体系——`findings/ pocs/
> evidence/` 管「报告侧」，`engagement/` 管「作战侧」，两者互补不互替、归位不迁移。

### 档案目录（含目录树模板）

TARGET_SLUG 命名规则不变（`example.com` → `example_com`）。7 件套位于
`reports/<TARGET_SLUG>/engagement/`，骨架直接复制本 skill 的 `templates/engagement/`：

```
reports/<TARGET_SLUG>/
├── SUMMARY.md / metadata.json      # （原有）聚合报告
├── findings/ pocs/ evidence/       # （原有）报告侧，仅 Confirmed 入 findings/
└── engagement/                     # （新增）作战侧档案 7 件套
    ├── target.md                   # ① 目标档案：标识/授权/资产/攻击面台账
    ├── credentials.md              # ② 凭据档案：获得的凭据/密钥及有效性
    ├── vulnerabilities.md          # ③ 漏洞账本：三态（Theoretical/Candidate/Confirmed）
    ├── attack-graph.md             # ④ 攻击图：mermaid 节点+边，随验证更新
    ├── footholds.md                # ⑤ 突破口：已获得的访问点及可用性
    ├── loot.md                     # ⑥ 战利品：拿到的数据/权限及影响证明
    └── timeline.md                 # ⑦ 时间线：全事件 append-only（跨会话恢复入口）
```

### 使用纪律

1. **开工即建**：创建目标工作区时同步
   `mkdir -p reports/$TARGET_SLUG/engagement/` 并从 `templates/engagement/`
   复制 7 件骨架；缺件即视为 workspace 不完整，不得开测。
2. **append-only 时间线**：`timeline.md` 只追加不修改，每条事件带 UTC 时间戳 +
   操作 + 结果 + 证据指针；新会话开工先读 timeline 尾部恢复上下文（跨会话连续的核心）。
3. **账本唯一**：漏洞状态以 `engagement/vulnerabilities.md` 为唯一作战台账；
   `findings/` 只收 Confirmed。三态判据以 `pentest-methodology-fusion` §4
   Finding Confirmation Protocol 为单一事实源，本 skill 不另立定义；
   Candidate→Confirmed 的唯一晋级凭据是 `fp-check` 六门全 PASS。
4. **攻击图随动**：每确认一条新边（凭据→主机→数据）立即更新 `attack-graph.md`
   的 mermaid 图并追加 timeline；`aggregate_reports` 前先核对图与账本一致。
5. **归位不迁移**：已有 findings/pocs/evidence 内容不搬入 engagement/；
   engagement 条目用相对路径引用 `evidence/` 文件作为证据锚点，反向亦然。

---

## Source

Inspired by: https://github.com/Zyrexnn/Cybermes/blob/main/AGENTS.md §3

## Related Skills

- `scope-gate` — 确定性 scope 门禁
- `cybermes-tools` — smart_pipe / aggregate_reports
- `incident-response` — 证据采集规范
- `fp-check` — 漏洞六门验证；Candidate→Confirmed 的唯一晋级凭据
- `pentest-methodology-fusion` — 三态判据（Confirmed/Candidate/Theoretical）单一事实源 §4
