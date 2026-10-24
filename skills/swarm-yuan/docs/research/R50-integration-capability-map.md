# R50 整合轮：吸收层碎片化诊断与 capability-map 接线台账

> 2026-09-24，用户指令触发：「swarm yuan 调研吸收了非常多的第三方运行时组件和设计理念，但是没有很好的整合起来形成一个整体，帮我优化重构下」。
> 证据分级：诊断断言全部 A 级（本机机械扫描 grep/awk 实测）；档位用途核实为逐篇档头精读。
> 结论：碎片化根因是**接线台账缺席**而非档位冗余——修复=capability-map 单一事实源（46 档+19 运行时）+ SKILL.md 第六层路由表化 + self-check G25 双向对账；零合并、零归档、门禁 55 守恒。v2.22.0。

## 一、诊断：三裂缝（机械实测）

**裂缝① 路由断层（承诺 vs 现实）**：
- 全部 46 档档头承诺「路由表见 SKILL.md」，但按 basename 精确匹配，SKILL.md 仅按名引用约三分之一（12/46）；
- 第六层为散文泛列举（「方法论→各 *-methodology.md（cordis-composability / mea-loop / … 等）」）——被泛称带过的档与完全未提的档无从区分；
- 未按名出现的高价值档：claude-code-capabilities（56KB 宿主能力全量）、memory-persistence（29KB 记忆工具族）、review-methodology（37KB 审查方法论）、gsd-patterns、cognition/cognitive-bias/logic-razor、行业八档、codex/dsh/codex-security 三运行时档等；
- README 侧仅按名提 7 档。

**裂缝② 孤岛（零同伴引用）**：10 档在 references/ 内零被引（排除自引）：ai-process-records、canary-monitoring、crypto-spec、quality-management-standards、four-theories-methodology、codex-methodology、codex-security-methodology、knowledge-lifecycle-methodology（R49 新生属正常）、行业 6 档（--industry 参数加载，情有可原）。逐篇核实消费点全部正当（canary=check_canary 降档保留+setup-loop --verify 消费；ai-process-records=GB/T 8566 留痕口径+standards-compliance §B 联动；crypto-spec=check_crypto 判定依据；quality-management-standards=认证过程资产）——**是接线不可见，不是死档**。

**裂缝③ 无台账**：13 运行时（FACT_RUNTIMES 分层计数）／19 行 upstream-baseline（供给侧：许可证/版本/drift）／46 references（需求侧）三者零对账关系；"这个能力从哪来、在哪个节点被消费、降级链是什么"散在各档叙事，无单点可查。

## 二、修复设计（沿仓库既定裁决）

| 裁决来源 | 应用 |
|---------|------|
| 决策 38（账实对账必须机器执法） | G25 断言：孤儿零容忍/幽灵零容忍/两级互指 |
| 决策倾向表（多份并存 vs 合一） | 合一收敛=台账合一（不合并档文件）；弧线表/capability-map/upstream-baseline 三表各守一面（概念/档级/供应链），粒度互补 |
| R13 终态（防复胖） | 补协议不加结构：零新目录、零档合并、零归档；SKILL.md 第六层净增约 0.6KB（认知面余量内） |
| 决策 27（门禁 55 守恒） | G25 为 self-check 断言（warn-only，同 G13-G17 族），非 precheck check_* |

**五族整合视图**（回答"如何构成一个整体"）：吸收物按总闭环段归位——①生成主干（流A）11 档／②拼装与知识消费（流B ②⑤）9 档／③编排与治理（流B 全程）9 档／④验证与过程资产（⑥⑦⑧⑨）4 档／⑤安全合规与行业立法（门禁）13 档 = 46。

**G25 解析协议**：地图表格首列纯档名行（`^\| [a-z0-9][a-z0-9-]* +\|`）awk 机械提取，实测精确命中 46 行；CJK 首列表行（运行时表/视图表）天然跳过。

## 三、方案备选记录（为何不这么做）

- **B 全量目录重组**（references/ 按主题分目录）：改名涟漪面大（46 档头互指+UNIVERSAL_FILES+facts.conf+弧线表），且 R13 去抽象化已定终态结构，主题分族由地图虚拟承载即可，成本收益倒挂。
- **C 档级合并**（重叠主题合一）：诊断显示重叠档粒度不同不互斥（memory-persistence=工具族细节/knowledge-lifecycle=四段协议/context-engineering-layering=分层规则），地图"触发"列已显式辨析；合并是破坏性动作，留给台账现形真冗余后再裁。
- **D 纯叙事重写**（只改 README/SKILL.md 讲法）：无机器对账=下次吸收复发，违背根治倾向。

## 四、验证清单

- [x] G25 断言实测：awk 解析 46 行精确；孤儿扫描 0；幽灵扫描 0；SKILL.md 互指在
- [x] self-check --check-only 全绿（含 FACT_REFERENCES=47 口径）
- [x] 认知面三件套预算实测（map 不入三件套，第六层净增在余量内）
- [x] 相关测试（context-surface/template-lexical/spec-template-gating）
- [x] 同族残留：README 附录 B 13 份→47 篇、附录 D 310KB→320KiB 修正；grep 无 "13 份"/"310KB" 残留
- [x] 决策 42 入 design-evolution；本报告即证据链
