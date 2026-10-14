---
name: bola-session-detection
description: "Use when hunting or verifying session-level BOLA/IDOR behavior (object-enumeration patterns) in logs/traffic — dedup-object-count + sequential-enumeration feature baseline that replaces unreliable IP throttling. Detection/analysis skill: works on recorded traffic, not live attack."
version: "1.0.0"
author: "platform-skill-miner (R2 staged proposal)"
license: "internal"
metadata:
  hermes:
    tags: [forensics, detection, bola, idor, session-baseline, artex]
    source: "T3 §5 R1; T2 §4.2; cybersecguru.md:42; T4 合并报告矩阵#9（P0）"
    target_profile: hack-forensics
    priority: "P0"
    staged: true
    staged_note: "已由 orchestrator 人审批准 mark-active，1.0.0 激活生效（2026-10-13，裁决：全部激活）"
---

# BOLA Session Detection — 会话级 BOLA/IDOR 检测基线

> 对照 T3 规则 R1：会话内去重对象数 + 顺序枚举特征，替代失效的 IP 限速。本技能是**检测分析规范**：对授权范围内已录制的流量做特征提取与基线判定。不做实时攻击、不绕过任何防护。

## 何时用（触发条件）

- 复盘授权测试或防守演练的录制流量时，需要机械判定「是否存在 BOLA/IDOR 枚举行为」
- 替代/校准 IP 限速告警（单 IP 多会话、代理池轮换都能绕 IP 限速）
- 给 SIEM 写伪查询基线时需要一个可参数化的判定模型

## 会话特征基线（判定模型）

对每条流量记录提取会话键 = `(session_cookie, user_agent, src_ip)` 三元组，按会话计算：

| 特征 | 判定阈值（可调参数） | 含义 |
|---|---|---|
| dedup_obj_count | ≥ `--min-objects`（默认 30） | 会话内去重对象 ID 数 |
| sequential_runs | ≥ `--min-sequential`（默认 3） | 长度 ≥5 的顺序/步进枚举段数（id=1,2,3,4,5 或 100,102,104；**按访问顺序**切分段，排序会把两条独立段粘成一条） |
| distinct_users_in_window | ≥ `--min-dup-users`（默认 3） | 时间窗内同对象被多身份访问（越权交叉特征） |

**判定**：`dedup_obj_count ≥ min-objects AND sequential_runs ≥ min-sequential` → `bola-suspect`；再叠加 `distinct_users_in_window` 命中 → `bola-confirmed`。只命中单特征 = 弱信号，只记 `watch`。

## 标准步骤

1. 准备录制流量 JSONL（字段：session, ua, ip, path, obj_id, user_id, ts）
2. 跑特征提取：`python3 scripts/bola_analyze.py --traffic traffic.jsonl --min-objects 30 --min-sequential 3`
3. 输出可疑会话清单（含命中特征值），交人工复核
4. 复核确认后写 SIEM 伪查询基线：`scripts/bola_analyze.py --emit-siem --thresholds ...`（输出伪查询文本，按你的 SIEM 方言改写）

## 陷阱

- 用 raw 请求数而非去重对象数 → 翻页/刷新的正常用户也会爆表。必须 dedup
- 顺序枚举只看连续整数 → 漏 `step=2` 步进。判定器同时认 `step ∈ {1,2,5,10}` 的等差段
- 阈值一刀切 → 业务不同基数不同。参数全部 CLI 可调，基线按业务校准后固化为该 engagement 参数
- 本判定器只做「录制流量分析」；线上实时判定用 `--emit-siem` 产物在你的 SIEM 侧实现，不在这里挂探针

## 验收命令（copy-paste，实跑 exit=0）

```bash
python3 ~/.hermes/skills/hack-team/bola-session-detection/scripts/accept_bola_session_detection.py
# 预期输出末行：ALL GREEN bola-session-detection acceptance exit=0
# 含 2 次预期 fixture 命中：
#   T1 顺序枚举会话（3 条独立段：step=1/2/5）被判 bola-confirmed（dedup=52, seq_runs=3）
#   T2 正常用户会话（翻页重复访问同 5 对象）不判嫌疑（dedup 后 dedup_obj_count=5）
```

## Exercised 记录

- 2026-10-13 本卡实跑 `accept_bola_session_detection.py`（mktemp 干净环境）：ALL GREEN exit=0。
- 真实命中 1（T1）：fixture 顺序枚举会话（3 条独立段 step=1/2/5）→ dedup_obj_count=52、sequential_runs=3、cross_user_objects=1 → `bola-confirmed`。
- 真实命中 2（T2）：正常翻页会话（raw 请求 60 条但仅 5 个去重对象）→ dedup_obj_count=5 < 30，**不误判**（raw 数 60 已超阈值，证明 dedup 是关键防线）。
- 开发期修正留痕：seq_runs 首版对排序后 id 切段，把两条独立枚举段粘成一条导致漏计；验收 fixture 真实拦住后改为「按访问顺序去重切段」——门生效的直接证据。

## 与既有机制关系

- 上游接 `poc-evidence-snapshot`（取证 blob 规范化）/ 录制流量来源
- 下游接 SIEM 伪查询（本技能产物），并可并入 `agentic-soc-defense` 防线规则集
- 与 `business-logic-vulnerabilities` 互补：那边是攻击侧知识，本技能是检测侧基线

## staged 状态

⚠️ **staged 提案态，未激活**：待晨报呈现 + mark-active 三关人审。请勿在未获批前作为既定流程引用。
