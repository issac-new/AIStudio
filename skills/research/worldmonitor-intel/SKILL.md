---
name: worldmonitor-intel
description: "情报分析算法：关键词突增/新闻聚类/地理汇聚/焦点实体/热度评分。触发：情报分析、调研突增检测、多源去重"
version: 1.1.0
---

# WorldMonitor 情报分析算法

> 算法移植自 koala73/worldmonitor (AGPL-3.0)，2026-08-21 从调研报告恢复重建。
> 完整调研：`~/hermes-docker-sandbox/workspace/worldmonitor-research-report.md`

## 五算法速查

| 命令 | 用途 | 核心参数 |
|------|------|---------|
| `spike "关键词" --stories s.json` | 新闻突增检测 | 2h 窗 vs 7d 基线，≥3 倍 + ≥2 来源 |
| `cluster --stories s.json` | 多源去重合并 | Jaccard 0.45 阈值 |
| `geo --events e.json` | OSINT 地理汇聚 | 同 cell 24h ≥3 不同领域 |
| `focal --mentions m.json` | 跨流焦点实体 | ≥3 流 elevated / ≥4 流 critical |
| `escalate --news --cii --geo --military` | 热度评分 | 35/25/25/15 权重，1-5 刻度 |

脚本：`scripts/intel-analysis.py`（数据格式见脚本头注释）
