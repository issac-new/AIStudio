---
name: agentic-tool-fingerprint
description: "Use when hunting autonomous/agent attack-tool presence in logs or host telemetry — IOC category library of self-update UAs, default port pairs, custom session headers, relay domains, and HTML title fingerprints (ARTEX-style tooling). Detection knowledge skill."
version: "1.0.0"
author: "platform-skill-miner (R2 staged proposal)"
license: "internal"
metadata:
  hermes:
    tags: [forensics, detection, ioc, fingerprint, agentic, artex]
    source: "T3 §1/§5 R3; cmd/artex/main.go:55-57, selfupdate/github.go:101, web/src/config/app-config.ts:10; T4 合并报告矩阵#10"
    target_profile: hack-forensics
    staged: true
    staged_note: "已由 orchestrator 人审批准 mark-active，1.0.0 激活生效（2026-10-13，裁决：全部激活）"
---

# Agentic Tool Fingerprint — agentic 攻击工具指纹 IOC 类别库

> 对照 T3 规则 R3 + 第 1 节工具侧检测特征（ARTEX 事件实测）。本技能是**检测知识库 + 匹配器**：把 agentic 攻击工具的可 hunt 特征组织成 IOC 类别，供日志狩猎与告警规则引用。

## 何时用（触发条件）

- 狩猎日志/流量/主机遥测时，判断是否存在自主渗透工具（agentic pentest console 类）的活动痕迹
- 为 SOC 建告警规则，需要「agentic 工具」的 IOC 类别清单与匹配优先级
- 评估自家基础设施暴露面（自家服务是否被误指纹、或存量指纹是否已轮换）

## IOC 类别库（五类）

| # | 类别 | 示例特征（ARTEX 实测） | 数据源 | 说明 |
|---|---|---|---|---|
| 1 | 自更新 UA | `artex-selfupdate`（`selfupdate/github.go:101`）、`artex-enrich/1.0` | HTTP 访问日志 / Egress DNS | 工具自更新与资产富化请求的固定 UA；极低误报 |
| 2 | 默认端口对 | `:8787` / `:8788`（`cmd/artex/main.go:55-57`） | 主机监听扫描 / 流量目的端口 | 默认 Web/API 端口对；单端口弱信号，成对命中强信号 |
| 3 | 自定义会话头 | 非标准 `X-Session-*` 运营头（对照 `agent/provider.go:79-86` SessionHeaderKey 模式） | 反向代理日志 / WAF | LLM 中转站链路的自定义头模式 |
| 4 | 中转站域名/基础设施 | 事件实证域名 xcai.pro；模式 = 高频 POST 到 LLM API 路径 + 非主流 ASN 托管 | DNS / 代理日志 | 需结合类别 3/5 交叉确认，单域名告警易过期 |
| 5 | HTML title 指纹 | `ARTEX — Autonomous Penetration Testing Console`（`web/src/config/app-config.ts:10`） | 资产测绘 HTTP 抓取 | 控制台默认 title；命中=暴露面已部署（自家环境则为配置漂移告警） |

**匹配优先级**：类别 1/5 是强指纹（命中即可立案）；类别 2/3/4 是弱指纹（需 ≥2 类交叉）。

## 标准步骤

1. 准备待狩猎日志 JSONL（字段：ua / port / header_names / domain / title —— 有什么给什么）
2. 跑类别匹配：`python3 scripts/fp_match.py --events events.jsonl --rules rules.json`（内置默认 rules；强指纹单命中即 `match-strong`，弱指纹需双类交叉 `match-cross`）
3. 强命中逐条人工复核；交叉命中按组合评估
4. 新工具特征入库：往 `rules.json` 追加类别条目（schema 见文件内注释），并注明证据来源

## 陷阱

- 单弱指纹直接告警 → 端口对重合、UA 仿冒都会误报。机械层强制交叉逻辑
- 指纹库当一次性快照 → 工具改 UA/换端口后过期。rules.json 带 `last_verified` 字段，狩猎前先查时效
- title 指纹依赖明文 HTTP 抓取 → 内网 TLS 化后失效。内网用端口对+进程名补充
- 本类别库只含检测特征（IOC），不含任何「如何运行该类工具」的信息

## 验收命令（copy-paste，实跑 exit=0）

```bash
python3 ~/.hermes/skills/hack-team/agentic-tool-fingerprint/scripts/accept_agentic_tool_fingerprint.py
# 预期输出末行：ALL GREEN agentic-tool-fingerprint acceptance exit=0
# 含 3 次预期判定（fixture 全合成）：
#   T1 强指纹（自更新 UA）单事件 → match-strong
#   T2 双弱指纹交叉（端口对+自定义头）→ match-cross
#   T3 单弱指纹（仅端口）→ below-threshold（不告警）
```

## Exercised 记录

- 2026-10-13 本卡实跑 `accept_agentic_tool_fingerprint.py`（mktemp 干净环境）：ALL GREEN exit=0。
- 真实命中 1（T1）：合成事件 UA=`artex-selfupdate/1.0` → 强指纹单命中 `match-strong`。
- 真实命中 2（T2）：合成事件端口 8787 + header 含 `x-session-key` → 双弱交叉 `match-cross`。
- 真实拦截 3（T3）：仅端口 8787 的合成事件 → `below-threshold`，验证单弱指纹不放行。

## 与既有机制关系

- 并入 `agentic-soc-defense` 防线⑥（该防线缺 agentic 工具指纹类别，本技能补此维度）
- 下游可接 SIEM 伪查询产物（同 bola-session-detection 的输出模式）

## staged 状态

⚠️ **staged 提案态，未激活**：待晨报呈现 + mark-active 三关人审。请勿在未获批前作为既定流程引用。
