# R86 新运行时纳入轮：mattpocock/skills 源码级调研与机制吸收

> 2026-10-03，用户指令触发：「深入进行源码级别的调研 https://github.com/mattpocock/skills ，将其作为 research 目录下新增的运行时，吸收完善 swarm yuan skill」。
> 证据分级：本轮全部断言为 **A 级**（本机克隆精读——v1.2.3 tag 全量 25 技能 + 治理层 + main 线三新技能）。
> 结论：登记进 upstream-baseline（19→20 行），`FACT_RUNTIMES=13` 分层口径不变（机制源定位，同 pua/semantica/dsh 先例）；四协议入新档 + 三档增节，六同构不吸收。

## 一、形态与版本线

mattpocock/skills（MIT）——Matt Pocock（Total TypeScript / AI Hero）的日常工程技能集："skills for real engineers, not vibe coding"，明确与 GSD/BMAD/Spec-Kit 的"接管流程"路线划界（小而可改、可组合、不夺控制权）。

- **基线 v1.2.3**（tag 6acc160，2026-08-06；`package.json` 与 `.claude-plugin/plugin.json` 双实核 1.2.3）。
- **main d81f3a1**（2026-09-29）已合并 release/v1.3，tag 未出线（75 commits 领先 v1.2.3）：新增 implement-spec / pr / retro 三技能；既有技能仅标点风格统一（em-dash→colon），无语义变化。本轮以 v1.2.3 为登记基线、main 为评估面。
- **结构**：skills/{engineering(17), productivity(8), misc, in-progress, deprecated}。engineering+productivity 为 promoted 桶（plugin.json skills 数组恰好 25）。
- **双轴分层**：user-invoked（`disable-model-invocation: true` + `agents/openai.yaml policy.allow_implicit_invocation: false`，仅人触发、description 面向人、无触发词）与 model-invoked（人与模型可触达、description 面向模型带触发分支）；**user-invoked 可调 model-invoked，绝不调另一个 user-invoked**（`.agents/invocation.md`）。
- **可复用原语模式**：grilling（22 行）被 grill-me/grill-with-docs/triage/wayfinder/improve-codebase-architecture 五个编排技能复用——"提取技能的理由是复用，但复用不是保持 model-invoked 的判据"。
- **治理面**：CLAUDE.md 五处一致性不变量（promoted 桶 ↔ README ↔ plugin.json ↔ docs 页 ↔ ask-matt 路由——"a router that lies"）；changesets 版本 + `claude plugin validate --strict`；`scripts/link-skills.sh` 软链分发（dev-only，自述非受支持安装器）。
- **分发**：Claude Code 官方插件市场（`claude plugins install mattpocock-skills`）+ skills.sh 可编辑拷贝（`npx skills add`）双渠道，互斥安装警示。

## 二、吸收（过决策 46 两问：哪个环节缺 / 谁消费）

### A. 新档 `references/mattpocock-skills-methodology.md`（FACT_REFERENCES 47→48，随技能分发）

| 协议 | 上游锚点 | swarm-yuan 缺口 | 消费方 |
|---|---|---|---|
| **结构化访谈协议**（设计树/前沿轮次/事实自查决策问人） | `skills/productivity/grilling/SKILL.md` | 节点①原为"复述+假设清单+一次确认"，无问题依赖结构与轮次纪律 | 开发工作流 节点①（feature 路由行【按·需求模糊】） |
| **spec 纪律三条**（测试缝先行/防腐规则/综合不访谈） | `skills/engineering/to-spec/SKILL.md` | §19 测试左移有内容无"缝经济学"（最高缝/缝越少越好）；spec 无防腐规则 | 节点② + template-spec 节点说明 |
| **任务拆分纪律**（纵切四规则/阻塞边+前沿/expand-contract 例外/粒度三问） | `skills/engineering/to-tickets/SKILL.md` | 节点③原引 OpenSpec tasks+writing-plans bite-sized（步幅纪律），无切片拓扑（纵切/阻塞/宽改造例外） | 节点③ plan 拆分 |
| **诊断回路六阶段**（反馈回路先行+十路+收紧/red-capable 四判据/最小复现/3-5 排序可证伪假设/一次一变量+标记日志/无正确缝=架构发现） | `skills/engineering/diagnosing-bugs/SKILL.md` | Prove-It 五步管"复现测试先行"，无"复现不出来的硬 bug 怎么造出复现" | fix 路由行【按·硬 bug】 |

### B. 三档增节（机制落其主题家族，来源注记随节）

1. **subagent-orchestration.md「任务图并行实现协议」**（main 线 `implement-spec/SKILL.md`）：任务图前沿为扇出单位 / 实现者子代理各持基于集成分支的 worktree / 合并者子代理与实现者分离 / 子代理间只传上下文指针不复制内容——补 workflow 节点⑤"复杂变更并行扇出"的执行形态（此前只说扇出，没说以什么为单位、合到哪里）。
2. **memory-persistence.md「阶段边界五选树」**（`ask-matt/PHASE-BOUNDARIES.md`）：继续/清空/交接/子代理/压缩五选有序判定，"除继续外每个动作都把一手源换成二手源"——补"什么时候切上下文"的判定协议（此前只有"切了丢什么怎么补"）；与 ECC phase-boundary compaction 行、R57 半收口教训同族。
3. **context-engineering-layering.md「措辞三判据」**（`productivity/writing-for-agents/SKILL.md`）：no-op 判定（跑了文档行为会不会变，跑文档裁决不辩论）/ 否定句失败模式（正向表述）/ 领头词经济学（先找预训练已有词再造词）——补六层模型之外"每句写下去值不值"的判据；与 R53 术语词典咬合。

### C. 六同构不吸收（拓扑已存在，防重复吸收）

| 上游机制 | 既有同构 |
|---|---|
| 两轴 code review（Standards∥Spec 并行子代理不互染不重排） | review-methodology 两阶段审查（spec 合规+质量）+ 并行 specialist subagent |
| pr 模板 Merge Danger（单向门/影响半径） | decision-governance §2.4 可逆性三值（one-way 自动升 UserChallenge，gsd-core 来源） |
| handoff 交接文档 | builder-journal compaction 续传 + session-restore（FACT_COMPACTION_JOURNAL=1） |
| retro 环境复盘（机械违规优先落确定性检查） | 问题沉淀通道 + mine-habits + 决策倾向"手动一次 vs 自动化" |
| CONTEXT.md 共享语言 + ADR 三条件 | 术语词典（R53）+ decisions.jsonl 决策留痕 |
| user-invoked/model-invoked 双轴 | 目标技能单技能形态（SKILL.md+hooks），无多子技能分层需求 |

### D. 已登记未实施（新档 §六）

- **wayfinder 多会话决策地图**（地图=索引非存储/雾区判据=问题还说不锐利/一票一会话/先认领后开工）——触发：真实"一个 spec 装不下"的多会话规划需求。
- **wizard 人机步骤向导**（人类专属步骤生成交互 bash）——触发：目标技能出现真实人工步骤重复解释成本。
- teach/wait-what/to-questionnaire/triage——执勤面之外，不做。

## 三、口径影响

- upstream-baseline：19→20 行（机制源定位，`baseline_status=synced`）。
- `FACT_RUNTIMES=13` 不变；`FACT_REFERENCES=48`；`FACT_UNIVERSAL_FILES=85`（+新档随技能分发，对齐 G25 ⑥ 可达必分发）。
- G25 链：capability-map 族②行 + task-methodology-router feature/fix 行 + UNIVERSAL_FILES 行三处同步（新档四步清单：map 行/路由行/分发行/两处计数）。
- 门禁数 55 不变（决策 27：吸收优先于新增门禁）；无新 FACT 机制键（四协议均为流程纪律非机器执法）。
- 预算：随技能分发体积第十九次登记（实测见 CHANGELOG）。

## 四、复核与回归

- 版本/许可核实：v1.2.3 = `package.json:5` + `.claude-plugin/plugin.json:5`（双实核）；MIT = LICENSE。A 级。
- 回归：run-sweep.sh 全量（tests/test-*.sh + 三条 e2e + verifier all + self-check --check-only），见 CHANGELOG v2.49.0。
- 镜像对账：research/ 克隆物化为 research/mattpocock-skills @ v1.2.3 checkout（gitignored 本地缓存）。
