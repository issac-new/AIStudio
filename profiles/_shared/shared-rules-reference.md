# Shared Rules Reference（_shared/ 规则索引）

> 用途：批量落地新 `_shared/` 规则后在此登记，否则「规则存在但索引不含」（harness-fusion-patterns Pitfall #4）。
> 纪律：本文件是**指针索引**，不是规则正文——每条只写「文件 + 一句话定位」，正文单一事实源在各文件本体。
> 重建记录：LongHorizon P0 融合（2026-08-16）曾建过本索引，hermes update 空壳化事故（2026-09-08）中丢失；2026-09-17 GE 融合时重建并回填现存规则。

## 01-scheduling-bus/（调度总线）
| 文件 | 定位 |
|---|---|
| matrix-collaboration-termination.md | Matrix 多 agent 协作终止规则（防循环聊天） |
| dynamic-workflow-protocol.md | YAML 工作流定义 → kanban 卡链执行引擎；§九 工作流沉淀闭环（2026-09-17 GE 融合） |
| forward-deployed-protocol.md | 前置部署协议 |

## 02-org-orchestration/（组织编排）
| 文件 | 定位 |
|---|---|
| ontology.md | 本体契约（SOUL 三段契约注入源） |
| marking-rules.md | 跨 board 派工 markings 继承与 clearance 校验 |
| alert-triage-rules.md | 告警分诊规则 |
| mandatory-privacy.md | 强制隐私红线 |
| four-lenses-charter.md | 四论四问认知自检宪章 |
| language-standard.md | 对外输出语言规范 |
| acceptance-tri-state-protocol.md | 验收三态协议（PASS/BLOCKED/UNKNOWN 判据 + WAIVED 豁免出口六字段，2026-09-23 QGate 融合 v1.1） |

## 03-evolution-memory/（进化记忆）
| 文件 | 定位 |
|---|---|
| output-contract.md | 统一报告骨架 + 失败签名分类学（sig-*） |
| review-gates.md | Diamond 7 门 + 干预追踪 + 申诉协议（L4 合并版） |
| action-risk.md | 动作风险分级（standard/normal 变更授权） |
| exit-protocol.md | 收尾契约 |
| memory-governance.md | 记忆治理：读写边界/批判-重构召回/遗忘阶梯 |
| structure-evolution-rollback.md | 结构性变更六步闭环（信用分配→重测闸→牵连面→快照→三验→回滚） |

## 04-pro-capability/（专业能力）
| 文件 | 定位 |
|---|---|
| committee-review.md | 3-reviewer 对抗评审协议（L4 机制层补强） |

## 05-eng-execution/（工程执行）
| 文件 | 定位 |
|---|---|
| drift-comparison-template.md | 漂移对照模板 |
| fault-localization-protocol.md | 故障定位：沿依赖链追溯首个决定性偏离点 |

## 06-observability/（观测治理）
| 文件 | 定位 |
|---|---|
| risk-register.md | 风险台账 |
| outbound-guard.md | 外发守卫 |
| cost-governance.md | 成本治理：harness 先行归因、动作空间收窄 |
| agent-task-size-v1.md | 任务规模估算 v1（预算轮次推导依据） |
| swarm-studio-contract.md | SwarmStudio 投影契约 |
| skill-catalog.md | 目标 skill 生成状态目录 |

## 派工纪律（skill 载体，索引防漏）
| skill | 定位 |
|---|---|
| devops/kanban-orchestrator §Graph Engineering 派工纪律 | fan-in 容错硬边/软依赖 + barrier 节俭 + 循环收敛三判据（2026-09-17 GE 融合） |
| devops/delegation-brief-format §交付格式 | Node Contract 双路径 schema（delegate 真强制 / kanban advisory） |

## 树外过程资产（~/.hermes/delivery/，2026-09-17 登记）
| 文件 | 定位 |
|---|---|
| ~/.hermes/delivery/README.md | 软件开发交付标准工作模板入口（工具无关；六阶段×六门禁；CMMI 实践域映射） |
| ~/.hermes/delivery/01-lifecycle.md | 六阶段（需求→设计→实现→验证→发布→复盘）× G1–G6 门禁 × 看板/9 节点对照 × 裁剪三档 |
| ~/.hermes/delivery/02-roles.md | 角色章程矩阵（代理团队模式 ↔ 单工具模式） |
| ~/.hermes/delivery/03-gates.md | G1–G6 门禁索引（执法锚点指向本目录 review-gates/action-risk/committee-review 等） |
| ~/.hermes/delivery/04-metrics.md | 八项交付指标（公式/数据源/阈值；M6 源 capability-graph，M3 源本目录 evals/） |
| ~/.hermes/delivery/05-improvement.md | 复盘三段式 + CAR 触发条件 + 改进提案管道（OPM） |
| ~/.hermes/delivery/templates/ | PRD/设计/发布计划/发布说明/评审记录/复盘/度量台账模板（补齐本目录 templates/ 缺口） |
| ~/.hermes/delivery/adapters/ | claude-code/codex/zcode/dsh/hermes 接入块与说明 |
| ~/.hermes/delivery/workflows/delivery-flow.yaml | 标准交付动态工作流建议稿（provisional，二次复用后按协议 §九沉淀至本目录 workflows/） |
| ~/.hermes/delivery/install-into-repo.sh | 将标准包快照注入任意 repo（AGENTS.md/CLAUDE.md/GEMINI.md 托管块，幂等可逆） |
| ~/.hermes/delivery/iso27001/ | ISO 27001 补充包 v1.0.0（11 模板：ISMS 范围/风险评估/SoA/分级/访问控制/事件登记/IRP/BCP/供应商/内审/网安；锚定本目录 marking-rules/mandatory-privacy 与 ops-incident-commander SOUL，不重建） |
| ~/.hermes/delivery/itil/ | ITIL 补充包 v1.0.0（13 模板：服务目录/SLA/CMDB/事件/问题/变更/发布/可用性/能力/连续性/知识/服务请求/战略；覆盖 ITIL 4 三十四实践的 30 项，锚定 ops 域 SOUL） |
