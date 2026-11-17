---
name: domain-team-dispatch
description: Use when 派发 aiteam/pay/data 三域任务。三域域网关已并入主 orchestrator。
version: 1.0.0
metadata:
  hermes:
    tags: [domain-dispatch, aiteam, pay, data, orchestrator-merge]
    related_skills:
      - devops/kanban-orchestrator
      - devops/delegation-brief-format
---

# 三域直派手册（aiteam / pay / data）

> 背景：2026-11-17 用户裁决，aiteam-orchestrator / pay-orchestrator / data-orchestrator
> 三 profile 退役，分解权收归主 orchestrator。本 skill 是三域 SOUL 的蒸馏残留
> （全文存 references/，冷归档在 <cold-archive>/archive/20261117-orch-merge/）。
> k12edu-orchestrator 不在合并范围（隐私隔离+独立微信通道）。

## 派发速查

### pay（金融支付清算，board=pay）

| 关键词/场景 | 直派 | 说明 |
|---|---|---|
| 支付网关/收银台/收单/POS/条码、账户体系/分账/账务、快捷/协议/代扣代付、备付金/断直连 | pay-infra | 支付接入与通道 |
| 外卡收单/Visa/MC/双信息/拒付/DCC/3DS | pay-infra 为主 + pay-fintech 合规面 | 专题：shared/domain-knowledge/pay/waika-shoudan-analysis.md |
| 清算/结算/轧差/对账/差错、RTGS/DNS/HVPS/BEPS/CIPS、CCP/DvP/冲正/退单/挂账 | pay-clearing | 清算核心与央行系统 |
| 牌照/监管/AML/KYC、数字人民币/稳定币/跨境、支付数据安全 | pay-fintech | 监管合规与前沿 |

**pay 纪律**：引用任何限额/阈值/版本/份额数据前，必查
`~/.hermes/shared/domain-knowledge/pay/standards/known-conflicts.md` 冲突裁决表。
知识库总入口 `~/.hermes/shared/domain-knowledge/pay/pay-knowledge-index.md`
（陈天宇宙 50 篇全文 + 两书 40 万字 + 内核框架，任务前读 chentianyu-kernel-frameworks.md）。

### data（实时数仓，board=data）

| 关键词/场景 | 直派 | 说明 |
|---|---|---|
| 数仓分层/ODS/DWD/DWS、Paimon/Fluss 表设计、维表建模 | data-arch | 数仓与湖仓建模 |
| Flink SQL/DataStream、CDC/binlog 同步、checkpoint/反压/exactly-once | data-flink | 流式计算与同步 |
| Docker/compose 集群、数据卷/备份、Dinky 运维、MySQL/Redis 参数 | data-infra | 环境与平台运维 |
| Doris 湖仓/向量检索/写回、多模态列(BLOB/VECTOR/VARIANT) | data-arch(建模)+data-flink(管道) | Agentic 数据闭环 |

**data 纪律**：①版本以 `~/.hermes/shared/domain-knowledge/data/version-lock.md`
为唯一权威（worker 禁凭记忆改版本，冲突先 block）；②部署拓扑见同目录
docker-topology.md，数据卷一律外挂禁匿名卷；③湖仓运维职责（告警四级定级/
SLO 编排/治理卡把关/事故取证编排，正本 alert-triage-rules.md + data-governance.md §8）
由主 orchestrator 编排、三专家执行；④数据出境/`down -v` 删卷 = HumanGate，
必须 kanban_block 请示。

### aiteam（AI 前沿研究，board=aiteam）

| 关键词/场景 | 直派 | 说明 |
|---|---|---|
| 模型架构/Transformer/SSM/MoE/长上下文/推理效率 | aiteam-architecture | 架构域 |
| 多模态/VLM/omni-modal/benchmark 判读侧 | aiteam-multimodal | 多模态域 |
| 具身智能/VLA/世界模型/GR00T/OpenVLA | aiteam-embodied | 具身域 |
| AI training/RL 对齐/safety/alignment/训练框架(Megatron/DeepSpeed/vLLM/verl) | aiteam-training | 训练域（safety 兜底） |
| 情报监测/benchmark 污染/工具侧评测 | aiteam-scout | 情报域 |

**aiteam 纪律**：调研类子卡验收必须可机械验证（来源锚点≥2 独立源交叉）；
合并报告结构 = 执行摘要/关键发现(带子卡id+锚点)/冲突与取舍/建议/附录。

## 通用分解规则（三域同构）

1. 跨板子卡 body 引父卡 ID + `context_from`，禁跨板 `parents`；板内依赖用 `parents`。
2. 每张子卡自带完整 context（目标/验收标准 frozen/必读材料/交付物路径），
   worker 看不到兄弟卡上下文。
3. 命名/格式/口径在派单前定死写进卡 body，禁止两张子卡各自决策同一问题。
4. 收卡不信自述：抽验产出物路径存在 + 验收命令退出码。
5. 整库同步入湖类跨领域任务：arch 出表设计 → flink 写作业 → infra 保环境，
   `parents=[...]` 串行。

## Related Skills
- `devops/kanban-orchestrator` — 分解 playbook 全量
- `devops/delegation-brief-format` — 派卡 body 格式
