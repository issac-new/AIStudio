# AIStudio 设计文档导航

> 本页只承担导航，不保存第二份设计事实。
> 命名层级（2026-10-28 对账定口径）：**AIStudio** = 仓库名与产品主名（以此为准）；**SwarmStudio** = 桌面发行物命名（DMG/安装身份/产物文件名）与历史体系名的兼容标识，不作主名；**NCWK** = 单仓整合前的旧仓名，仅历史档案。历史文档不改写，冲突时以本行为准。

## 现行设计

| 文档 | 职责 | 读者 |
|---|---|---|
| [AIStudio 终态设计文档](2026-10-23-swarmstudio-integrated-design.md) | 统一说明理念、产品、架构、核心机制、工程实施与验证边界 | 所有人 |
| [设计事实与容量基线](2026-10-23-swarmstudio-design-ledger.md) | 保存稳定设计参数、参考部署和版本快照 | 架构、运维与审计 |
| [全流程推演方案](2026-10-05-mux-v8-fullflow-plan.md) | 定义推演步骤、质量门、责任和运行判据 | 推演与测试人员 |
| [AIStudio 使用指南](../../USAGE.md) | 提供启动、使用、重启和排障步骤 | 用户与评估者 |

## hermes agent 运行面事实源

| 文档 | 职责 |
|---|---|
| [Hermes Agent 集群设计文档](../../../team/profiles/orchestrator/references/design-doc/hermes-complete-design-doc.md) | agent teams 的组织、机制、治理与实现载体正本 |
| [Hermes Agent Architecture](../../../vendor/hermes-agent/website/docs/developer-guide/architecture.md) | 上游 AIAgent、入口、工具、会话和 gateway 内部架构 |
| [候选知识库规则](../../../team/profiles/_shared/knowledge/candidate/README.md) | 团队决策从 CANDIDATE 到 OFFICIAL 的流转规则 |
| [runtime 同步副本与源位置说明](../../../runtime/hermes-records/MANIFEST.md) | 决策注册表、研究和评测记录的源映射与脱敏边界 |

终态正本按统一主题整合 hermes：设计公理归第 2 章，组件与组织归第 4 章，
岗位、调度、验证和决策归第 5 章，数据与治理归第 6 章。
外部文档只承担原始凭证、详细配置和后续变更记录，不设独立素材分卷。

## 索引附件

| 附件 | 内容 |
|---|---|
| [附录 A](2026-10-21-swarmstudio-appendix-a-spec-index.md) | specs 全量索引、角色分类与跨域来源关系 |
| [附录 B](2026-10-21-swarmstudio-appendix-b-plans-research.md) | 实施计划、研究和复盘档案索引 |
| [附录 C](2026-10-21-swarmstudio-appendix-c-capability-corpus.md) | swarm-yuan 方法论、决策史与研究索引 |
| [附录 D](2026-10-21-swarmstudio-appendix-d-lessons-rules.md) | 历史事故、已证伪的假设、否决项与工作规则 |

附件保存独立索引和历史语料，不是第二套设计正文。
当前能力层数字以 `skills/swarm-yuan/assets/facts.conf` 为准。

## 需求与历史档案

[《SwarmStudio 需求分析》](2026-10-16-swarmstudio-requirements-analysis.md)
是 14R+8N 的原始冻结件。后续设计稿中的需求摘要不能覆盖它。

| 档案 | 保留价值 | 当前角色 |
|---|---|---|
| [三中心重构候选设计](2026-10-16-swarmstudio-final-design.md) | 理念来源、候选方案与重审过程 | 历史档案 |
| [NCWK 设计正本](2026-10-21-ncwk-design-spec.md) | 旧架构快照、文档治理决策与事故索引 | 历史档案 |
| [NCWK 产品正本](2026-10-21-ncwk-product-spec.md) | 旧产品结构与当时状态 | 历史档案 |
| [SwarmStudio 完整设计](2026-10-21-swarmstudio-complete-design.md) | 需求历史镜像、用户决策全表与演进史 | 历史证据库 |
| [退役拼接册](2026-10-23-ncwk-complete-design-compilation.md) | 旧汇编的兼容跳转 | 退役指针 |

历史文件保留原文和决策关系，不再指导新实现。
旧稿正文中可能仍保留当时的“设计正本”自述，那是历史原文，
角色以本页为准。
需要修改当前设计时，只修订终态正本及对应专题 spec。
