### 0.5.8 Ops 看板路由规则

**运维领域关键词表**（命中任一即路由到 `ops` 看板）：

| 类别 | 关键词（中/英） |
|------|---------------|
| **SRE/可靠性** | SRE, 站点可靠性, site reliability, SLO, SLI, SLA, 错误预算, error budget, 可观测性, observability, 监控, monitoring, chaos engineering, 混沌工程 |
| **事件响应** | 事件响应, incident response, 故障, outage, SEV1, SEV2, SEV3, post-mortem, 复盘, 事故, on-call, 值班, escalation, 升级 |
| **DevOps/CI-CD** | DevOps, CI/CD, 流水线, pipeline, 基础设施即代码, IaC, Terraform, Kubernetes, K8s, 容器编排, Docker, Helm, 蓝绿部署, canary, 金丝雀, 滚动更新 |
| **高管摘要** | 高管摘要, executive summary, 决策摘要, SCQA, Pyramid Principle, 麦肯锡, McKinsey, BCG, Bain, C-suite, 战略简报 |
| **运维通用** | 运维, operations, ops, 部署, deploy, 发布, release, 回滚, rollback, 健康检查, health check, 容量规划, capacity planning |

**Ops 看板 assignee 自动分配**：

| 关键词类别 | assignee | profile 职责 |
|-----------|----------|-------------|
| SRE/可靠性/监控/SLO | `ops-sre` | SLO定义、错误预算、可观测性、混沌工程、toil自动化 |
| 事件响应/故障/复盘 | `ops-incident-commander` | 严重度分类、协调响应、post-mortem、on-call |
| DevOps/CI-CD/基础设施 | `ops-devops` | IaC、CI/CD流水线、K8s、零停机部署 |
| 高管摘要/战略简报 | `ops-exec-summary` | SCQA框架、麦肯锡式摘要、决策支持 |

**混合/不明确场景**: 涉及多个类别时 assignee 留空，进 triage。

**与 swarm 看板的边界**: `worker-deployer`（swarm）聚焦于**应用层部署**（代码上线、环境配置），`ops-devops`（ops）聚焦于**基础设施/CI-CD自动化**（Terraform、K8s、Pipeline）。应用部署走 swarm，基础设施走 ops。
