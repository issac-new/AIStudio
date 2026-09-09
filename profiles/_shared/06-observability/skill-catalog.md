# Skill Catalog — Hermes 集群技能目录

> 版本：v1.0 (2026-09-07)
> 定位：skill 库单一事实源。每 skill 一行：`skill-name | 架构层 | 触发场景 | 适用 profile | 状态`
> 规则：新增 skill 必须先在此登记；归档 skill 标注 archived 并注明原因。

---

## 一、架构层映射

| 层级 | 目录 | 对应 skill 数 |
|------|------|--------------|
| 01-scheduling-bus | 调度总线 | 3 |
| 02-org-orchestration | 组织编排 | 8 |
| 03-evolution-memory | 进化记忆 | 6 |
| 04-pro-capability | 专业能力 | 12 |
| 05-eng-execution | 工程执行 | 15 |
| 06-observability | 观测治理 | 3 |

---

## 二、Skill 目录（active）

### 调度总线层 (01)
| Skill | 触发场景 | 适用 profile | 状态 |
|-------|---------|-------------|------|
| matrix-cross-machine-collab | Matrix 跨机 agent 协作 | orchestrator | active |
| inter-agent-communication-architecture | 选 kanban/Matrix/A2A | orchestrator | active |
| dynamic-workflow-protocol | YAML 工作流→kanban 卡链 | orchestrator | active |

### 组织编排层 (02)
| Skill | 触发场景 | 适用 profile | 状态 |
|-------|---------|-------------|------|
| kanban-orchestrator | 任务分解 playbook | orchestrator | active |
| kanban-worker | worker 执行 lifecycle | 所有 worker | active |
| orchestrator-kanban-tracing | triage 自卡 lifecycle | orchestrator | active |
| orchestrator-team-hierarchy | 领域网关层级 | orchestrator | active |
| orchestration-skill-routing | 复杂度→skill 路由 | orchestrator | active |
| security-domain-delegation | hack 团队派工 | orchestrator | active |
| scale-adaptive-routing | blast-radius 判定 | orchestrator | active |
| delegation-brief-format | 任务书格式规范 | orchestrator | active |

### 进化记忆层 (03)
| Skill | 触发场景 | 适用 profile | 状态 |
|-------|---------|-------------|------|
| memory-consolidation | 记忆收敛/清理 | 所有 profile | active |
| routine-self-reflect | 任务后反思+经验提取 | 所有 profile | active |
| evidence-labeled-research | 调研打证据标签 | researcher | active |
| grounded-citations | 引用可溯源 | researcher | active |
| llm-wiki | LLM Wiki 知识库 | researcher | active |
| cognition-self-check | 8项偏差+压力升级 | 所有 profile | active |

### 专业能力层 (04)
| Skill | 触发场景 | 适用 profile | 状态 |
|-------|---------|-------------|------|
| deep-research-workflow | 多源深度调研 | researcher | active |
| research-subagent-orchestration | 并行调研子代理 | orchestrator | active |
| open-source-architecture-research | 开源仓库源码级调研 | researcher | active |
| open-source-skill-fusion-v2 | 开源项目融合 | researcher/orchestrator | active |
| fusion-field-to-skill-flywheel | FDE 融合飞轮 | orchestrator | active |
| committee-review | 对抗评审 3-reviewer | 所有重型任务 | active |
| adversarial-review-lens | 多 lens 并行批判 | 所有重型任务 | active |
| code-review | 独立代码审查 | coder | active |
| requesting-code-review | 提交前审查 | coder | active |
| security-architecture-evaluation | 安全架构评估 | hack-auditor | active |
| docx / pdf / powerpoint / xlsx | Office 文档生产 | 通用 | active |
| executive-summary | SCQA 高管摘要 | 通用 | active |

### 工程执行层 (05)
| Skill | 触发场景 | 适用 profile | 状态 |
|-------|---------|-------------|------|
| devops-rd (8 子skill) | RD 8 阶段链路 | coder/tester/ops | active |
| verify-prd | PRD 完整性检查 | researcher | active |
| verify-requirement | 编码前契约检查 | coder | active |
| rd-apply | 按 requirement 实现 | coder | active |
| rd-validate | 需求-实现-测试对账 | tester | active |
| code-review (devops-rd) | 编码后质量检查 | coder | active |
| release-plan | 发布前检查 | ops | active |
| test-driven-development | TDD | coder | active |
| systematic-debugging | 4阶段根因调试 | coder | active |
| spike | 快速验证想法 | coder | active |
| dogfood | Web app 探索 QA | tester | active |
| swarm-yuan-componentization | 五阶段组件化生产（survey→distill→assemble→gate-check→register） | orchestrator/coder | active |
| architecture-design | 需求→技术方案 | coder | active |
| deployment-automation | 安全交付 | ops | active |
| mermaid-pdf-report / html-to-pdf-charts | 报告生成 | 通用 | active |

### 观测治理层 (06)
| Skill | 触发场景 | 适用 profile | 状态 |
|-------|---------|-------------|------|
| swarm-studio-contract-verify | 契约测试 | ops/coder | active |
| acceptance-routing-metrics | 路由覆盖率月报 | orchestrator | active |
| meta-watchdog | 6h 互检 | orchestrator | active |

### 知识资产层（S5 融合产物）
| Skill | 触发场景 | 适用 profile | 状态 |
|-------|---------|-------------|------|
| shidianguji-classics-access | 访问识典古籍平台查典籍元数据/接入路径 | worker-researcher / [已移除] | active（2026-09-08 新增，F5 红线首段；矩阵见 research/cluster-knowledge-fusion-20260907/） |

---

## 三、归档 / 合并 Skill（✅ 2026-09-07 已执行）

### ✅ 已归档（→ `~/.hermes/skills/archive/single-fix/`）
| Skill | 原因 | 替代 | 状态 |
|-------|------|------|------|
| hermes-update-revert-forensics | 单点 update 回滚排查 | update-drift-remediation + update-time-inventory-self-healing | ✅ archived |
| hermes-source-patch-recovery | 单点 patch 恢复 | hermes-source-patch-persistence | ✅ archived |
| hermes-patch-watchdog | 单点 TUI patch 自愈 | hermes-source-patch-persistence | ✅ archived |
| tui-patch-persistence | 单点 TUI 保护 | hermes-source-patch-persistence | ✅ archived |
| moa-bigmodel-401-fix | 单点 401 修复 | hermes-moa-configuration | ✅ archived |
| macos-home-disk-cleanup | 单点磁盘清理 | macos-disk-cleanup | ✅ archived |
| macos-default-app-management | 单点默认应用 | （低频，归档） | ✅ archived |
| apikey-image-gen / grok-image-to-video / minimax-image-to-video | 按需恢复 | — | ⏸️ 保留主库（顶层独立目录，低频不碍事） |

> 注：原清单中 hermes-tui-customization/hermes-moa-configuration 实为主 skill 保留，已修正归属。

### ✅ 已合并（被合并方 → `~/.hermes/skills/archive/merged/`）
| 主 skill（保留） | 被归档方 | 状态 |
|----------------|---------|------|
| cc-switch-failover-ops | cc-switch-provider-troubleshooting, ccswitch-failover-queue-management | ✅ merged |
| cc-switch-monitoring | cc-switch-proxy-monitoring, cc-switch-widget, cc-switch-throughput-benchmarks | ✅ merged |
| cc-switch-stats-analysis | cc-switch-usage-analytics | ✅ merged |
| ccswitch-native-responses-schema | ccswitch-role-model-routing | ✅ merged |
| hermes-tui-customization | tui-status-bar-merge, tui-source-edit-build-verify | ✅ merged |
| hermes-moa-configuration | moa-mixture-of-agents-setup | ✅ merged |
| hindsight-model-configuration | hindsight-backend-model-config | ✅ merged |
| hindsight-fleet-operations | hindsight-cluster-audit, hindsight-fleet-audit, hindsight-fleet-cleanup | ✅ merged |
| hermes-skill-installation | hermes-skill-bulk-install, hermes-skills-update-protection | ✅ merged |
| [已移除]-observation-archiving | [已移除] | ✅ merged |
| wechat-article-research | wechat-batch-discovery | ✅ merged |

**执行摘要**：devops 分类 12 组合并 → 净减 16 个 skill；7 个单点修复归档。归档区含 README（恢复方式 + 主 skill 映射）。
cc-switch 家族 12→5（failover/monitoring/analytics/integration/codex-mgmt + internals），hindsight 家族 7→3。

### 🟢 保留（核心能力）
见上方目录。特别保留：
- **cognition-lattice** — 认知知识库（10万条知识条目）
- **devops-rd** — RD 全链路（8子skill）
- **kanban-orchestrator / kanban-worker** — 看板生命周期
- **hindsight-fleet-operations** — 记忆集群运维
- **codex-harness-patterns / deepseek-harness-research / longhorizon-harness-research** — Harness 调研存档（知识资产）

---

## 四、Skill 分布统计（按 profile）

| Profile | Skill 数 | 主要类别 |
|---------|---------|---------|
| orchestrator | 47 (主库) | 全域路由/编排/治理 |
| [已移除]-orchestrator + 6 教师 | ~15 | 教学/育儿 |
| worker-coder | ~10 | 编码/测试/调试 |
| worker-researcher | ~12 | 调研/引用/开源融合 |
| ops-devops | ~8 | 部署/运维/发布 |
| hack-recon / exploit / auditor / forensics | ~12 | 安全测试 |
| data 团队 (4 profile) | ~6 | Flink/Paimon/MinIO |
| aiteam 团队 (6 profile) | ~8 | 模型架构/训练 |
| pay 团队 (3 profile) | ~4 | 支付/清算 |

---

## 五、治理规则

1. **新增 skill 必须先在本目录登记**，标注架构层 + 触发场景 + 适用 profile
2. **归档 skill 移入 `~/.hermes/skills/archive/`**，在本目录标注 archived + 原因
3. **每季度审计一次**：扫描 skill 数量 vs 目录行数，漂移 > 5% 即触发整理
4. **合并原则**：同主题 ≤ 3 个 skill；超过则合并为单一 skill，原 skill 归档并留 redirect 注释
5. **禁止**：为单一 bug 创建长期 skill；修复后应回写到主 skill 的「常见坑」章节

---

> 本目录是 skill 库的**单一事实源**。任何 skill 增删改必须同步更新本文档。