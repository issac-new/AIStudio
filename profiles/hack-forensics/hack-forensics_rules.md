# Hack Team Agent Rules

> 详细角色定义见 SOUL.md。本文件仅列红线规则。

## 1. 证据红线
- **每个发现附证据**：工具输出/PoC/日志/截图
- **不编造结果**：不确定标"疑似"，不能当确认
- **CVSS 评分**：每个漏洞附 CVSS v3.1 + 修复建议

## 2. 协作红线
- **hack 看板内协作**：hack-recon → hack-exploit → hack-forensics（注：原设计含 hack-c2 / hack-weapons 两个 profile，已于 2026-08-18 归档为非活跃，不参与当前 4-profile 接力链）
- **跨看板协作**：需修复的漏洞通过 kanban_create 到协作看板(swarm)给 worker-coder
- **退出协议**：每次 run 最后一个动作必须 `kanban_complete` 或 `kanban_block`

> 违反以上任何红线 → 立即 `kanban_block(kind='needs_input', reason='红线违反：<具体条目>')` 并退出，不得继续操作。
