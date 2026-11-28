# 吸收总账

> 三类对象（AIStudio、hermes 智能体团队、swarm-yuan）乘四类材料（文章、论文、报告；代码仓；技能包；上游版本差量）的唯一查重、挂账与回看账本。规程正本：`team/skills/devops/article-methodology-fusion/SKILL.md` 的「跨对象总规程」一节；入口规则：仓规第 15 条；守门：`custom/__tests__/absorption-ledger.test.ts`。
> 取值：深度＝源码级、全文级、摘要级；裁决词＝吸收、收缩吸收、等效印证、记档待定、不吸收；成色＝语义、机制、效力；默认行为变更＝有、无。计数写成以斜杠分隔的非负整数，裁决计数五段、成色计数三段，顺序同上。来源档没写的事实记「未声明」，没有外来材料可裁的轮次记「不适用」。
> 用法：吸收轮开工先在表一按来源查同源；收口在表一加一行，记档待定项逐条进表二；下一次吸收轮读出表里已到回看日的行并汇报。表二的「提出处」写提出它的轮次编号；治理类事项写规格的仓内路径，或只写规格文件名（不带目录时按规格目录 `docs/superpowers/specs/` 去找），行号写在「事项」里。本账只收 AIStudio 仓内发起的轮次；hermes 夜间自主跑的轮次不入账，其裁决记录留在宿主 `~/.hermes/shared/research/`。
> 回填口径（L001 到 L022，2026-10-24 至 2026-11-27）：深度与默认行为变更只取来源档明文写出的档位，来源档没有用这几个词表述的一律记未声明；裁决计数与成色计数因来源档没有按统一词表给出计数，记未声明，其中 L017、L022 没有外来材料，记不适用。各轮实际做了什么、验证到什么程度，以来源档为准，本账不做转述。

## 一、轮次

| 编号 | 日期 | 来源 | 深度 | 对象 | 裁决计数 | 成色计数 | 默认行为变更 | 来源档 | 回看日 |
|---|---|---|---|---|---|---|---|---|---|
| L001 | 2026-10-24 | 《多 Agent 群体协作的评测基准设计方法》（微信公众号文章） | 未声明 | AIStudio | 未声明 | 未声明 | 未声明 | `docs/superpowers/specs/2026-10-24-swarm-eval-benchmark-absorption.md` | 2026-12-23 |
| L002 | 2026-10-25 | 《AI Agent 数据飞轮：让每个 Bad Case 自动长成资产》（微信公众号文章） | 未声明 | AIStudio | 未声明 | 未声明 | 有 | `docs/superpowers/specs/2026-10-25-agent-data-flywheel-absorption.md` | 2026-12-24 |
| L003 | 2026-10-26 | 《京东零售技术架构负责人贺岩：企业级AI研发闭环体系的搭建与实战》（演讲实录文章） | 未声明 | AIStudio | 未声明 | 未声明 | 未声明 | `docs/superpowers/specs/2026-10-26-joyai-closed-loop-absorption.md` | 2026-12-25 |
| L004 | 2026-10-27 | kimi-code 2.3.3 等上游版本差异 | 未声明 | AIStudio | 未声明 | 未声明 | 有 | `docs/superpowers/specs/2026-10-27-version-diff-absorption.md` | 2026-12-26 |
| L005 | 2026-10-30 | HelixHarness（两篇微信公众号文章，加 GitHub didi/helixharness 源码 1.0.0） | 源码级 | AIStudio、swarm-yuan | 未声明 | 未声明 | 有 | `docs/superpowers/specs/2026-10-30-helixharness-absorption.md` | 2026-12-29 |
| L006 | 2026-10-30 | ub-mode（GitHub unclebob/ub-mode 技能包） | 未声明 | swarm-yuan | 未声明 | 未声明 | 无 | `docs/superpowers/specs/2026-10-30-swarm-yuan-ub-mode-absorption.md` | 2026-12-29 |
| L007 | 2026-10-31 | RSI 论文 14 篇，另核对三棵 vendor 树的版本 | 摘要级 | AIStudio | 未声明 | 未声明 | 有 | `docs/superpowers/specs/2026-10-31-daily-research-absorption.md` | 2026-12-30 |
| L008 | 2026-11-03 | addyosmani/agent-skills、mattpocock/skills、pstack 三套技能包 | 源码级 | swarm-yuan | 未声明 | 未声明 | 有 | `docs/superpowers/specs/2026-11-03-swarm-yuan-absorption-pstack-evals.md` | 2027-01-02 |
| L009 | 2026-11-05 | 《AI Native 工程体系》五篇（赞恩的AI工坊） | 全文级 | AIStudio、hermes 智能体团队 | 未声明 | 未声明 | 有 | `docs/superpowers/specs/2026-11-05-ainative-absorption.md` | 2027-01-04 |
| L010 | 2026-11-05 | arXiv 四篇：Harness²、Evo²、RRSI、OO-Harness（其中两篇有开源仓） | 源码级 | AIStudio | 未声明 | 未声明 | 有 | `docs/superpowers/specs/2026-11-05-four-rsi-papers-absorption.md` | 2027-01-04 |
| L011 | 2026-11-07 | Ponytail、Headroom 两个代码仓 | 源码级 | swarm-yuan | 未声明 | 未声明 | 有 | `docs/superpowers/specs/2026-11-07-ponytail-headroom-absorption.md` | 2027-01-06 |
| L012 | 2026-11-11 | zcode 上游 v3.18.0 与 Qwen Code 1.0 | 源码级 | AIStudio | 未声明 | 未声明 | 有 | `docs/superpowers/specs/2026-11-11-zcode-3180-sync-and-qwen-absorb.md` | 2027-01-10 |
| L013 | 2026-11-12 | 《AI Agent 手册》aliyun/ai-agent-handbook 第 03 到 24 章 | 未声明 | AIStudio、hermes 智能体团队 | 未声明 | 未声明 | 无 | `docs/superpowers/specs/2026-11-12-ai-agent-handbook-absorption.md` | 2027-01-11 |
| L014 | 2026-11-16 | 《Building always-on agents》中文拆解稿 | 未声明 | AIStudio、hermes 智能体团队 | 未声明 | 未声明 | 有 | `docs/superpowers/specs/2026-11-16-always-on-agents-absorption.md` | 2027-01-15 |
| L015 | 2026-11-20 | Agnes Harness（量子位文章，加论文 21 页、报告 5 页、README 三份一手材料） | 未声明 | AIStudio | 未声明 | 未声明 | 无 | `docs/superpowers/specs/2026-11-20-agnes-harness-absorption.md` | 2027-01-19 |
| L016 | 2026-11-20 | RSI 生命周期综述（论文加公众号导读） | 全文级 | AIStudio | 未声明 | 未声明 | 无 | `docs/superpowers/specs/2026-11-20-rsi-lifecycle-absorption.md` | 2027-01-19 |
| L017 | 2026-11-21 | 无外来材料：推演融入产品的定性与路线图（用户立法） | 不适用 | AIStudio | 不适用 | 不适用 | 未声明 | `docs/superpowers/specs/2026-11-21-sim-product-absorption-roadmap.md` | 2027-01-20 |
| L018 | 2026-11-23 | RSI 递归理论的知乎解读文章 | 全文级 | AIStudio | 未声明 | 未声明 | 无 | `docs/superpowers/specs/2026-11-23-rsi-recursive-theory.md` | 2027-01-22 |
| L019 | 2026-11-25 | zcode 4.0 能力对照报告 | 未声明 | AIStudio | 未声明 | 未声明 | 未声明 | `docs/superpowers/specs/2026-11-25-zcode-400-capability-absorption.md` | 2027-01-24 |
| L020 | 2026-11-26 | Trustworthy RSI 综述 arXiv 2610.35193（82 页）；L007 的同源第二轮 | 全文级 | AIStudio | 未声明 | 未声明 | 有 | `docs/superpowers/specs/2026-11-26-trustworthy-rsi-fulltext.md` | 2027-01-25 |
| L021 | 2026-11-26 | Palantir 自我改进架构（公众号文章，加四篇官方文档） | 全文级 | AIStudio | 未声明 | 未声明 | 有 | `docs/superpowers/specs/2026-11-26-palantir-self-improvement-architecture.md` | 2027-01-25 |
| L022 | 2026-11-27 | 无新材料：Palantir 批七项待裁决事项的用户裁决（L021 的接续轮） | 不适用 | AIStudio | 不适用 | 不适用 | 未声明 | `docs/superpowers/specs/2026-11-27-palantir-rulings-followup.md` | 2027-01-26 |
| L023 | 2026-11-27 | 《人类员工与AI员工协作下的组织管理研究报告（讨论稿）》（课题研究组 2026-11；总账建立前 2026-11-06 执行单元责任台账轮为其同源前轮） | 全文级 | AIStudio | 9/0/8/4/3 | 1/12/3 | 有 | `docs/superpowers/specs/2026-11-27-workunit-framework-align.md` | 2026-12-28 |
| L024 | 2026-11-16 | 《腾讯开源 LoopForge：把 Coding Agent 编成研发团队工作流，告别团队内耗》（微信公众号文章），加 GitHub Tencent/LoopForge 源码；总账建立前执行的同源首轮，2026-11-28 回填 | 未声明 | AIStudio | 未声明 | 未声明 | 未声明 | `docs/superpowers/specs/2026-11-16-loopforge-sop-trust.md` | 2026-12-28 |
| L025 | 2026-11-28 | 《用 LoopForge 迭代 LoopForge：手把手搭一套 24 小时运转的 AI 研发工作台》（微信公众号文章，加 GitHub Tencent/LoopForge 源码 fd039e5）；L024 的同源第二轮 | 源码级 | AIStudio | 3/0/12/9/3 | 0/0/0 | 无 | `docs/superpowers/specs/2026-11-28-loopforge-scheduled-tasks-absorption.md` | 2026-12-28 |

## 二、记档待定

| 编号 | 提出处 | 事项 | 回看日 | 处置 |
|---|---|---|---|---|
| P001 | L008 | `ROUTING_MIN_RANK1` 初值 90，待对生成物实测后调整 | 2027-01-02 | 记档待定 |
| P002 | L009 | 上下文开销比的 token 口径（现为字符代理比值） | 2027-01-04 | 记档待定 |
| P003 | `docs/superpowers/specs/2026-10-19-harness2-improvement-workbench.md` | OO-Harness 的 base、specialized、router 骨架（首提于该正本第 322 行，2026-10-19；L010 二次挂账） | 2026-12-18 | 记档待定 |
| P004 | L013 | LLM 硬准入 | 2027-01-11 | 记档待定 |
| P005 | L013 | 手册批 5（资产登记册与 Agent Release） | 2027-01-11 | 记档待定 |
| P006 | L014 | `evaluateFourMode` 接入执行链 | 2027-01-15 | 记档待定 |
| P007 | L023 | 派单门是否也查户口（现只作准入门槛；已准入存量单元权限范围为空仍可接单）——规格「实施回填·未做」 | 2026-12-28 | 记档待定 |
| P008 | L023 | 第五级协作前提现为「任一判定通过的 AL5 配置」，按单元对应须改自治刻度配置模型 | 2026-12-28 | 记档待定 |
| P009 | L023 | 可靠性检验读数全仓无生产者（stabilityRetest 读数未接就绪度），该项恒为未知 | 2026-12-28 | 记档待定 |
| P010 | L023 | 三级风险档接执行层（三级只出计划不动手、二级结果复核后生效）＝报告方案 3 范围 | 2026-12-28 | 记档待定 |
| P011 | L023 | 后果自动判定（风险档由人选定，未做自动定级） | 2026-12-28 | 记档待定 |
| P012 | L023 | 存量已绑定且未声明类型的执行单元需补声明类型后方可继续接新派单（运营动作） | 2026-12-28 | 记档待定 |
| P007 | L015 | Agnes 快路径未经真实流量验证 | 2027-01-19 | 记档待定 |
| P008 | L015 | Agnes `TOOL_OUTCOME_UNKNOWN` 一次性许可 | 2027-01-19 | 记档待定 |
| P009 | L015 | Agnes 会话级插件 pinning | 2027-01-19 | 记档待定 |
| P010 | L018 | 可学习性奖励 `r=1−p` | 2027-01-22 | 记档待定 |
| P011 | L019 | zcode 4.0 能力吸收 P2（设计插件试用） | 2027-01-24 | 记档待定 |
| P012 | L017 | SIM 重建后的端到端验证 | 2027-01-20 | 记档待定 |
| P013 | `docs/superpowers/specs/2026-11-27-absorption-regime-unify.md` | hermes 侧技能 `fusion-evidence-commit-hygiene` 是否退役（入站引用 0 处） | 2026-12-27 | 记档待定 |
| P014 | `docs/superpowers/specs/2026-11-27-absorption-regime-unify.md` | hermes 侧技能 `kanban-heavy-fusion-playbook` 是否退役（入站引用 0 处） | 2026-12-27 | 记档待定 |
| P015 | `docs/superpowers/specs/2026-11-27-absorption-regime-unify.md` | hermes 侧技能 `delta-research-dispatch` 是否退役（入站引用 1 处） | 2026-12-27 | 记档待定 |
| P016 | `docs/superpowers/specs/2026-11-27-absorption-regime-unify.md` | hermes 侧技能 `fusion-field-to-skill-flywheel` 是否退役（入站引用 1 处） | 2026-12-27 | 记档待定 |
| P017 | `docs/superpowers/specs/2026-11-27-absorption-regime-unify.md` | hermes 侧技能 `incremental-repo-research` 是否退役（入站引用 1 处） | 2026-12-27 | 记档待定 |
| P018 | `docs/superpowers/specs/2026-11-27-absorption-regime-unify.md` | hermes 侧技能 `local-skill-fusion-routing` 是否退役（入站引用 1 处） | 2026-12-27 | 记档待定 |
| P019 | `docs/superpowers/specs/2026-11-27-absorption-regime-unify.md` | hermes 侧技能 `upstream-agent-skill-fusion` 是否退役（入站引用 1 处） | 2026-12-27 | 记档待定 |
| P020 | `docs/superpowers/specs/2026-11-27-absorption-regime-unify.md` | 附录 B（历史索引，自述目录数量不滚动维护）是否退役 | 2026-12-27 | 记档待定 |
| P021 | `docs/superpowers/specs/2026-11-27-absorption-regime-unify.md` | swarm-yuan 状态机归档阶段的提示仍指向已退役的 spec-archive 脚本（`skills/swarm-yuan/assets/state-machine.sh`）；随 swarm-yuan 下次发版删除该提示 | 2026-12-27 | 记档待定 |
| P022 | L025 | 自动化产出的刹车：建卡查重、队列水位、「本轮无事可做」结果（看板域只有派发去重；2026-11-28 读数＝标题归一后重复多出的卡 50/2748、未完成卡 68） | 2026-12-28 | 记档待定 |
| P023 | L025 | 流程节点打回携带产物并从指定节点重跑（图只有恢复、分叉、重放三个入口；首轮规格第 171 行已延后） | 2026-12-28 | 记档待定 |
| P024 | L025 | 评审与执行环节分别指定模型和执行器（流程图节点类型与评审策略配置都没有模型字段） | 2026-12-28 | 记档待定 |
| P025 | L025 | `custom/server/autosched/automation-schedule.ts` 的「到期自停＋无人值守授权」判定没有生产调用点：接线还是按域退役判据处理 | 2026-12-28 | 记档待定 |
| P026 | L025 | 「假重构改了行为」与安全类隐患两条审查机检 | 2026-12-28 | 记档待定 |
| P027 | L025 | 日常维护类定时任务：在途工作树巡检、补单测的存量基线、架构守护 | 2026-12-28 | 记档待定 |
| P028 | L025 | 定时任务的排班总览与单次执行成本读数 | 2026-12-28 | 记档待定 |
| P029 | L025 | 夜间循环按单一职责拆分（对象是 hermes 智能体团队，须在 `team/` 正本裁决） | 2026-12-28 | 记档待定 |

记档待定项的退役判据沿用域退役判据：多轮确认人与智能体都不用才退役，入站引用数只是静态证据。

## 三、规程地图

| 路径 | 所属侧 | 角色 | 说明 |
|---|---|---|---|
| `team/skills/devops/article-methodology-fusion/SKILL.md` | 三侧共用 | 规程 | 规程正本：跨对象总规程（五步、五判定、三档成色）加文章源 6 步流程 |
| `team/skills/devops/harness-fusion-patterns/SKILL.md` | hermes 智能体团队 | 规程 | 代码仓源的融合工作流；判定词与成色指向规程正本 |
| `team/skills/devops/fusion-landing-audit/SKILL.md` | hermes 智能体团队 | 规程 | 回看程序：原子粒度对账与复盘报告 |
| `team/skills/devops/research-ledger-reconciliation/SKILL.md` | hermes 智能体团队 | 规程 | 季度对账程序：历史调研全量对账 |
| `team/skills/devops/tech-component-ledger-refresh-orch/SKILL.md` | hermes 智能体团队 | 规程 | 组件版本轴的台账刷新程序（方法论类材料不入组件表） |
| `skills/swarm-yuan/docs/design-evolution.md` | swarm-yuan | 规程 | 决策 36、39、46：吸收物处置、证据分级、入库前两问 |
| `team/shared/research/absorption-ledger.md` | 三侧共用 | 真值 | 本总账：轮次与记档待定 |
| `team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md` | 三侧共用 | 真值 | 技术组件台账终态单文件 |
| `skills/swarm-yuan/references/capability-map.md` | swarm-yuan | 真值 | 方法论与运行时登记，G25 双向对账 |
| `skills/swarm-yuan/docs/upstream-baseline.md` | swarm-yuan | 真值 | 上游运行时的版本基线与漂移状态 |
| `skills/swarm-yuan/docs/research/2026-10-20-absorption-ledger-and-capability-inventory.md` | swarm-yuan | 已冻结 | 2026-10-20 的派生视图，10-24 后停更，文件头已标冻结 |
| `docs/superpowers/specs/registry/` | AIStudio | 已退役 | 规格按域登记机制：2026-11-05 立，2026-11-28 退役；目录冻结保留，脚本见 git 历史 |
