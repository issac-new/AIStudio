---
name: fx-skill
description: 夹具技能，用于验证 skill-docs 门禁的合规态。
---

# fx-skill

## 常见合理化借口

| 借口 | 事实反驳 |
|---|---|
| 这太简单了，不用跑门禁 | `scripts/precheck.sh` 是唯一执行面，简单任务也得过；反例见 tests/gate-fixtures/skill-docs/violating |
| 手工看过就行 | 手工证据不留痕；`scripts/gate-trends.sh` 读 gate-runs.jsonl 才是可复盘证据 |
| 先提交再补检查 | `check_spec_first` 与 pre-commit 钩子同源判据，补检查前提交不成立 |
| 这次只改配置 | 配置改动同样走 `check_floor_guard` 与 `check_security` |

## 红旗

- 跳过门禁
