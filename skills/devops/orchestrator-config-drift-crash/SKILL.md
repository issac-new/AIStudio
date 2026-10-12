---
name: orchestrator-config-drift-crash
description: "Use when 单卡 worker 反复 exit 78 秒死：profile fallback 残留."
version: 1.0.0
metadata:
  hermes:
    tags: [orchestrator, provider, config-drift, kanban, troubleshooting]
    related_skills: [orchestrator-worker-failure-triage, cc-switch-provider-troubleshooting]
---

# fleet 裁决后的配置残留崩溃（fallback_providers 扫雷）

> 机制权威源：default profile `orchestrator-worker-failure-triage`（三分类决策表 + 熔断风暴修复序列）。
> 本件补其未覆盖的类：**单卡**配置残留型崩溃（非集体熔断波）。

## 定性特征（与熔断风暴区分，勿混治）

- 熔断风暴：**多卡**同一时间窗集体死，cc-switch provider_health 异常
- 配置残留：**单卡**秒死（无集体信号，极易漏判），provider_health **全绿**——毒源在 hermes profile config 的 `fallback_providers` 链（worker 继承 profile 配置，主调用一失败即切进残留死上游），不在 cc-switch。指纹：403「额度不足 0.000000」确定性错误。

## 修复序列（顺序敏感）

1. 定位毒源：`grep -A2 'fallback_providers' ~/.hermes/profiles/<profile>/config.yaml`
2. 备份：`cp config.yaml{,.bak-fb-<简因>}`
3. **字段级清除**：只把 `fallback_providers` 清为 `[]`。按 provider 名全文替换 = 误删既定设计（同名 provider 在 `auxiliary.*` 是夜间免费通道，是两回事）——字段级 patch，勿全文梭哈。
4. 写回风险检查：grep cron 库与批量配置脚本，确认无作业会重写该字段；有则先退役写回源再收工，否则修复被静默冲掉。
5. 冒烟：worker 同款 `hermes --profile <p> --toolsets terminal chat -q "回复ok"` → EXIT_RC=0 才算通。
6. comment 留判定性证据链（403 原文 + diff + 冒烟 rc）→ unblock 重派。
7. 存活复验：读心跳（60s/拍）确认新 run 持续命中——单卡秒死无集体信号可比，心跳连续是唯一真判据。

## 预防

- fleet 模型/供应商裁决落地时**同 pass 扫全部 profile 的 fallback_providers**——裁决只改主模型不扫 fallback，残渣会在主调用首次失败时把 worker 送进死上游。
- 单卡秒死 ≠ 任务定义问题：先查配置残留，勿 debug 单个 worker。
