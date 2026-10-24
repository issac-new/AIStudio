---
name: llm-egress-governance
description: "Use when auditing or hunting LLM API egress from managed hosts — detect non-standard base_url, relay-station domains, custom session headers, and standalone proxy egress. Governance/detection skill: reads config/log records, no live probing."
version: "1.0.0"
author: "platform-skill-miner (R2 staged proposal)"
license: "internal"
metadata:
  hermes:
    tags: [forensics, governance, llm-egress, relay, base-url, artex]
    source: "T3 §1.5/§4.3; agent/provider.go:79-86,179,181; 事件 xcai.pro; T4 合并报告矩阵#8"
    target_profile: hack-forensics
    staged: true
    staged_note: "已由 orchestrator 人审批准 mark-active，1.0.0 激活生效（2026-10-13，裁决：全部激活）"
---

# LLM Egress Governance — LLM API 出口治理检测

> 对照 ARTEX 事件：渗透工具经 xcai.pro 中转站接 DeepSeek，任意 `base_url` + 独立 socks5 代理 + 自定义会话头（`agent/provider.go:79-86,179,181`）。本技能定义**出口检测维度清单 + 记录审计器**：对主机上 LLM 客户端配置/代理日志做离线审计，不做实时探针、不连任何外部目标。

## 何时用（触发条件）

- 审计托管主机是否有未登记 LLM 出口（影子 AI 使用 / 工具中转站接入）
- 狩猎已录制代理/DNS 日志中的 LLM 中转站特征
- 出合规报告时给「LLM 出口」维度一个可机检的基线

## 检测维度（三维）

| # | 维度 | 信号 | 数据源 | 强度 |
|---|---|---|---|---|
| D1 | 非标准 base_url | 客户端配置的 api_base / OPENAI_BASE_URL / provider base_url 不在组织白名单（官方域名清单） | 主机配置文件（inventory 清单） | 强 |
| D2 | 中转站域名 + 自定义会话头 | 高频 POST /v1/chat/completions 到非白名单域名；请求带非标准会话头（x-session-* 等） | 代理日志 / WAF 记录 | 强（双信号交叉）/ 弱（单信号） |
| D3 | 独立代理出口 | LLM 流量走非系统默认代理（socks5 / 独立 http_proxy） | 进程环境 / 配置 | 弱（需 D1/D2 交叉） |

**判定**：D1 单独命中 = `egress-nonstandard`；D2 双信号或 D1+D2/D3 交叉 = `egress-relay-suspect`（立案）；D3 单独 = `watch`。

组织白名单默认：api.openai.com / api.anthropic.com / api.deepseek.com / api.moonshot.cn / api.mistral.ai / generativelanguage.googleapis.com / api.moonshot.ai / openai.app.msh.team（cc-switch 本地代理）/ api.zcode.dev（如配置）。白名单走 `rules.json`，可覆盖。

## 标准步骤

1. 收集主机 LLM 客户端配置清单（inventory JSON：base_url、env、proxy 字段）
2. 审计：`python3 scripts/egress_audit.py --inventory inv.json --rules rules.json` → 逐主机判定
3. 代理日志侧：`python3 scripts/egress_audit.py --traffic traffic.jsonl --rules rules.json` → 逐事件判定
4. 判定 `egress-relay-suspect` 的记录逐条人工复核后登记

## 陷阱

- base_url 白名单当硬编码常量 → 组织接入新官方通道后误报风暴。白名单外置 `rules.json`，变更走评审
- 本地代理（cc-switch 等 127.0.0.1）被误报 → 白名单内置本地代理条目；审计器对 `127.0.0.1`/`localhost` 自动豁免 D3
- 只看域名不看头 → 中转站可以挂合法域名下。D2 要求双信号或交叉
- 本审计器只读清单与录制日志；禁止任何「验证某域名是否可达」的主动探测

## 验收命令（copy-paste，实跑 exit=0）

```bash
python3 ~/.hermes/skills/hack-team/llm-egress-governance/scripts/accept_llm_egress_governance.py
# 预期输出末行：ALL GREEN llm-egress-governance acceptance exit=0
# 含 3 次预期判定（fixture 全合成）：
#   T1 非白名单 base_url（xcai.pro 类）→ egress-nonstandard / relay-suspect
#   T2 白名单内官方 base_url → clean
#   T3 仅独立代理（localhost 豁免 / 远端 socks5 交叉判）→ watch / relay-suspect
```

## Exercised 记录

- 2026-10-13 本卡实跑 `accept_llm_egress_governance.py`（mktemp 干净环境）：ALL GREEN exit=0。
- 真实命中 1（T1）：合成配置 `base_url=https://relay.example-cdn.com` → `egress-nonstandard`。
- 真实命中 2（T2）：`base_url=https://api.openai.com` → `clean`（白名单生效）。
- 真实命中 3（T3）：远端 socks5 + 非白名单域名交叉 → `egress-relay-suspect`；localhost 代理 → 豁免不误报。

## 与既有机制关系

- 并入 `agentic-soc-defense` 层⑥出口治理节（T4 矩阵#8 裁决为叠加项）
- 与 `agentic-tool-fingerprint` 类别 3/4（自定义会话头/中转站域名）共享特征空间，可互相引用 rules

## staged 状态

⚠️ **staged 提案态，未激活**：待晨报呈现 + mark-active 三关人审。请勿在未获批前作为既定流程引用。
