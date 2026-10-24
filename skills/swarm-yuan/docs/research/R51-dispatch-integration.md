# R51 整合轮（续 R50）：反向分派面诊断与方法论分派表

> 2026-09-25，同一目标（"吸收很多第三方运行时组件和设计理念但没整合成一个整体，优化重构"）完成审计后复验未过，本轮补 R50 未覆盖的反向分派面。
> 证据分级：诊断断言全部 A 级（grep/awk 机械实测）。
> 结论：R50 闭合了正向接线（档→消费节点台账），但任务→方法论的反向分派缺失（task-methodology-router 名实不符）；修复=§方法论分派表（14 任务类型×方法论档，13 方法论全覆盖）+ G25 ⑤ 分派零落档断言。v2.23.0。

## 一、完成审计：目标判据 → R50 覆盖情况

| 判据（"整合成一个整体"） | R50 状态 | R51 处置 |
|------------------------|---------|---------|
| ① 吸收物统一台账可对账 | ✅ capability-map + G25 | 补正反对偶说明 |
| ② 任务→方法论分派整合 | ❌ **未覆盖**（本轮核心） | §方法论分派表 + G25 ⑤ |
| ③ 工作流消费节点接线 | 🟡 capability-map"消费节点"列是断言，消费侧无实载 | template-spec 单源指针 + 分派表按节点序 |
| ④ 概念体系不重不漏 | ✅ 弧线表/三表分工 | 不变 |
| ⑤ 运行时接线一致 | ✅ capability-map §三 | 不变 |
| ⑥ 以上机器可检 | 🟡 G25 只守正向 | +分派零落档 |

**实锤缺口（A 级）**：task-methodology-router.md 标题自称「任务类型 × 方法论路由表」，但正文只路由"节点序列+门禁聚焦"；13 篇 `*-methodology.md` 中仅 lazy-generation/togaf 两篇被提及（grep 实测）；流B 七类任务（feature/fix/refactor/chore/docs/test/exp，task-type-gates.conf:8-9 权威集）无任何方法论档分派面。

## 二、修复设计

**反向索引（决策 43）**：capability-map 正向（档→消费节点）↔ task-methodology-router §方法论分派表 反向（任务→档）互为对偶。分派表 14 行 = 流B 七类 + 七横切场景（架构设计/前端 UI/安全/治理机制设计/发布运维/验收交付/记忆沉淀），每行按流B 消费节点序给【必】/【按】分级档单；13 篇方法论全覆盖（机器断言）；行为档（gsd-patterns/logic-razor/cognitive-bias/governance-agents/mcp-governance/code-graph-tools/claude-code-capabilities/context-engineering-layering/domain-knowledge）按场景补充到达；安全合规族（crypto-spec/cwe/security-certification/standards-compliance/行业八档）显式声明不走任务分派——`--security`/`--industry`/compliance 档门禁条件加载，分工边界写死。

**机器执法（G25 ⑤）**：`references/*-methodology.md` 每档 basename 必须出现在 task-methodology-router.md——新增方法论档不进分派表即 warn。吸收层闭环定局：**建档必接线（G25 ①）+ 接线必可达（G25 ⑤）**。

**合一收敛**：template-spec"方法论整合"行不扩清单，加单源指针指向分派表（防两处漂移）；分派序与 capability-map 消费节点序一致（两表语义同源）。

## 三、预算处置（逐例登记第十次）

- 三件套（SKILL.md/exploration-guide/template-spec）：187886B ≤ 188416B，template-spec 指针 +~120B 余量内（剩 530B）——不登记。
- UNIVERSAL 认知面（含 task-methodology-router 随发）：实测 332672B 超 327680B 预算 4992B——FACT_ARTIFACT_BYTES_BUDGET 第十次登记 327680→336896（320KiB→329KiB），成因=分派表+三维度+对偶行 +5136B 功能本体（吸收层操作入口，随发执勤侧），非注记膨胀；不构成先例。

## 四、过程教训

worktree 创建前 shell cwd 被静默重置到 swarm-yuan/ 子目录，`git worktree add .claude/worktrees/...` 相对路径建到 swarm-yuan/swarm-yuan/.claude/（记忆 darwin-zsh-pitfalls 已有此坑，本轮踩后立即以绝对路径复合命令重建并清理）——多 worktree 写操作一律 `cd <绝对根> && <复合命令>`。

## 五、验证清单

- [x] G25 五断言实测全绿（孤儿零/幽灵零/互指在/分派零落档 0）
- [x] 13 篇 *-methodology.md 逐篇 grep 在分派表命中（机器断言同口径）
- [x] self-check --check-only 全绿（FACT_REFERENCES=47、认知面 332672B≤336896B、三件套 187886B≤188416B、版本三面一致）
- [x] 相关测试（context-surface/template-lexical-consistency/spec-template-gating）
- [x] 决策 43 入 design-evolution；本报告即证据链
