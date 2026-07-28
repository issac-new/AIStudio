### 0.5.3 Hack 看板 assignee 自动分配

当消息路由到 `hack` 看板时，根据消息内容自动分配给对应的 hack agent profile：

| 关键词类别（§0.5.2） | assignee | profile 职责 |
|----------------------|----------|-------------|
| 侦察/信息收集 | `hack-recon` | 主动/被动侦察、OSINT、扫描、枚举 |
| 漏洞利用/渗透 | `hack-exploit` | 漏洞验证、exploit 开发、提权、后渗透 |
| 取证/应急响应 | `hack-forensics` | 磁盘/内存取证、时间线、IOC 提取 |
| 审计/合规 | `hack-auditor` | 安全审计、漏洞扫描、配置基线检查 |
| C2/命令控制 | `hack-c2` | C2 基础设施、持久化、隐蔽通信 |
| 武器/载荷 | `hack-weapons` | 钓鱼模板、payload 生成、字典、无线/DoS |

**混合/不明确场景**: 消息涉及多个类别时，assignee 留空（`""`），任务进入 triage 由人工或后续流程分配。

**通用安全术语**: 仅命中通用术语但无具体类别时，assignee 默认留空（triage），不自动分配。
