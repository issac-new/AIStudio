> **何时读我**：需求模糊需要结构化访谈（开发工作流 节点①）、写 spec 前定测试缝与防腐（节点②）、拆任务定纵切与阻塞边（节点③）、修缺陷建反馈回路（fix 任务路由）时。来源：mattpocock/skills（需求到任务链四协议 + 诊断回路）。

# mattpocock-skills 需求到任务方法论（访谈协议 / 测试缝 / 纵切拆分 / 诊断回路）

> 来源：[mattpocock/skills](https://github.com/mattpocock/skills)（Matt Pocock，MIT，v1.2.3 tag 6acc160，2026-08-06 源码实测；main d81f3a1 2026-09-29 已合并 release/v1.3 未出 tag，线上三新技能一并评估）。
> 形态：25 技能集合（engineering 17 + productivity 8），按**谁能触发**双轴分层——user-invoked 编排技能（仅人显式触发，`disable-model-invocation: true`）调用 model-invoked 纪律技能（人与模型都可触达，可复用原语）；user-invoked 不得互相调用。Claude Code 官方插件市场 + skills.sh 可编辑拷贝双渠道分发。
> 纪律：只吸收机制，装配叙事不纳入；不调上游安装链。守决策 27：不新增 `check_*`，门禁数 55 不变；登记为机制源定位（同 pua/semantica/dsh 先例），不进 FACT_RUNTIMES 分层计数。
> 适用场景：开发工作流 节点①（§一）、节点② spec（§二）、节点③ plan（§三）、fix 类任务（§四）；编排与上下文两条增量分别落 `subagent-orchestration.md` / `memory-persistence.md`（见 §五指针）。

## 一、结构化访谈协议（grilling：设计树与前沿）——节点① 需求理解

上游原语仅 22 行，被 5 个编排技能复用（`skills/productivity/grilling/SKILL.md`）。四机制：

1. **设计树**：每个决策分叉出悬挂其上的后续决策——访谈问题不是平铺清单，是依赖树。
2. **前沿轮次制**：前沿 = 前置决策已全部落定的问题集合。一轮问完整个前沿（逐题编号 + 每题附推荐答案），等用户回答后重算前沿再进下一轮。答案依赖本轮未决问题的，留到后续轮——不猜没听到的答案。
3. **事实自查、决策问人**：前沿问题需要环境事实（文件/工具/版本）时派子代理去查，不问用户任何自己查得到的事；不阻塞——探查中的事实视为未落定前置，只有它的下游问题等它，前沿其余照常问。决策才交给用户并等待。
4. **完成判据**：前沿为空 = 设计树每支都走到、无静默假设；用户确认达成共识前不动手。

**与既有载体的咬合**：三级分类（Mechanical/Taste/UserChallenge，decision-governance §2）管"哪类决策要不要停下"，本协议管"停下来之后问什么、按什么顺序问"；agent-skills §三假设清单是本协议的降级快照形态（无访谈余地时一次抛出待纠正）。

## 二、spec 纪律三条（to-spec）——节点②

1. **测试缝先行**：写 spec 先勾画测试缝（seam）——优先用既有缝、用尽可能高的缝、缝越少越好（理想数量是 1）；需要新缝须向用户确认。
2. **防腐规则**：spec 不写具体文件路径与代码片段（很快过时）；唯一例外是原型产出的**决策编码片段**（状态机、reducer、schema、类型形状——比散文更精确地固化决策），须注明来自原型并裁剪到决策密度，不带可运行的演示。
3. **综合不访谈**：spec 阶段明确"不访谈，只综合已讨论的内容"——访谈归节点①，spec 阶段二次访谈是流程倒退。

## 三、任务拆分纪律（to-tickets：tracer-bullet 纵切）——节点③ plan

1. **纵切四规则**：每张任务票纵切贯穿全部层（schema/API/UI/测试），不是横切单层；完成即可独立演示或验证；尺寸以一个新鲜上下文窗口装得下为准；预重构先行（"make the change easy, then make the easy change"）。
2. **阻塞边 + 前沿工作法**：每票声明阻塞它的票；无阻塞票立即可做；工作前沿 = 阻塞全落地的票——与 §一 frontier 同构（依赖图前沿）。
3. **宽改造 expand-contract 例外**：单一机械改动（改列名、改共享符号类型）波及全库时不硬塞纵切——先 expand（新形态与旧并存），再分批迁移调用点（按包/目录分批，批批 CI 绿，因为旧形态还在），最后 contract（无调用方剩余时删旧形态）；连分批都无法独立保绿时，保留该顺序但共享集成分支，绿只在最终整合票承诺。
4. **粒度确认三问**：粒度对吗（太粗/太细）/ 阻塞边真实吗（每票只依赖真正闸住它的票）/ 有该合并或再拆的吗——用户点头才发布任务。

## 四、诊断回路（diagnosing-bugs 六阶段）——fix 类任务

对 agent-skills §四 Prove-It 五步的深化：Prove-It 管"复现测试先行"，本节管"复现不出来的硬 bug 怎么造出复现"。

1. **反馈回路先行**：上游原话"这一步就是技能本身，其余都是机械操作"——没有一条**能对本 bug 变红**的命令信号前，禁止进入假设阶段。造回路十路按序尝试（失败测试 / curl 脚本 / CLI+快照 diff / 无头浏览器 / 回放捕获轨迹 / 一次性最小 harness / 性质模糊测试 / bisect harness / 新旧版本差分 / 人驱脚本）。造出来后继续**收紧**（更快、信号更尖、更确定）：30 秒还会抖的回路约等于没有，2 秒确定的回路是调试超能力。非确定 bug 的目标不是干净复现而是**提高复现率**——50% 闪现可调试，1% 不可。
2. **red-capable 四判据**（回路完成条件）：能对本症状变红（非"不报错"）/ 结果确定 / 秒级 / agent 可独立运行。若发现自己在该命令存在前就读代码建理论——停，"直接跳到假设正是本协议要防的失败"。
3. **最小复现**：逐项删（输入/调用方/配置/数据/步骤）逐次重跑，只留承重元素——删掉任何一个就变绿，即到最小。
4. **3-5 个排序可证伪假设**：单假设生成会锚定第一个 plausible 想法；每个假设必须带预测（"若 X 是因，改 Y 则 bug 消失 / 改 Z 则加重"），说不出预测的就是空想，弃掉或磨尖。测试前把排序清单展示给用户（领域知识可瞬间重排：'我们刚对第 3 条动了部署'），但不阻塞。
5. **一次一变量 + 标记日志**：每个探针对应一个预测；调试日志全部带唯一前缀（如 `[DEBUG-a4f2]`），收尾一条 grep 清光；性能回归不用日志——先建基线测量（计时 harness/性能分析器/查询计划）再 bisect。
6. **无正确缝 = 架构发现**：回归测试只写在正确的缝上（按真实触发链路测，而非浅缝单调用方——浅缝测试给假信心）。找不到正确缝本身就是发现：架构在阻止这个 bug 被锁死——记录并走问题沉淀通道（进清单/配方），修复完成后移交架构改进，而不是修完就散。

## 五、吸收边界（同构已覆盖）与指针

| 上游机制 | 既有同构 |
|---|---|
| 两轴 code review（Standards∥Spec 并行子代理互不污染） | review-methodology 两阶段审查（spec 合规+质量）+ 并行 specialist subagent |
| pr 模板 Merge Danger（单向门/影响半径） | decision-governance §2.4 可逆性三值（one-way 自动升 UserChallenge） |
| handoff 会话交接文档 | builder-journal compaction 续传 + session-restore（FACT_COMPACTION_JOURNAL=1） |
| retro 环境复盘（机械违规优先落确定性检查） | 问题沉淀通道 + mine-habits + 决策倾向"手动一次 vs 自动化" |
| CONTEXT.md 共享语言 + ADR 三条件（难逆/无上下文会困惑/真权衡才记） | 术语词典 + decisions.jsonl 决策留痕 |
| user-invoked/model-invoked 双轴分层 | 目标技能为单技能形态（SKILL.md+hooks），无多子技能分层需求；description 写作纪律见 agent-skills §一 |
| ask-matt 路由同步不变量（"说谎的路由"） | capability-map 双向对账（G25，孤儿零容忍）+ 四载体一致性 |

**指针**：任务图并行实现协议（来源 implement-spec）→ `subagent-orchestration.md`；阶段边界五选树 → `memory-persistence.md`；措辞三判据（no-op 判定/否定句失败模式/领头词）→ `context-engineering-layering.md` §十二。

## 六、已登记未实施

| 候选 | 评估 | 触发 |
|---|---|---|
| wayfinder 多会话决策地图（地图=索引非存储 / 雾区=问题还说不锐利 / 一票一会话 / 先认领后开工） | 与前沿同类的巨型规划形态；当前单项目单会话循环未到该尺度 | 出现真实"一个 spec 装不下"的多会话规划需求 |
| wizard 人机步骤向导（人类专属步骤生成交互 bash 引导） | 发布/凭据场景存在但低频 | 目标技能出现真实人工步骤重复解释成本 |
| teach / wait-what / to-questionnaire / triage 状态机 | 教学领域 / 会话内纠偏 / 问卷代询 / 工单分流——均在目标技能执勤面之外 | 不做 |

## 七、来源溯源

- 仓库：mattpocock/skills（MIT）。引用基线 v1.2.3（tag 6acc160，2026-08-06；`package.json` 与 `.claude-plugin/plugin.json` 双实核 1.2.3）；main d81f3a1（2026-09-29）合 release/v1.3 未出 tag，三新技能按 main 线评估：implement-spec 落 subagent-orchestration；pr / retro 见 §五吸收边界。
- 一手材料（2026-10-03 本机克隆精读，A 级证据）：`skills/productivity/grilling/SKILL.md`（前沿原语）/ `skills/engineering/{to-spec,to-tickets,diagnosing-bugs,implement}/SKILL.md` / `skills/engineering/ask-matt/SKILL.md` + `PHASE-BOUNDARIES.md` / `skills/productivity/writing-for-agents/SKILL.md` / `.agents/invocation.md` / `.claude-plugin/plugin.json`（promoted 25 skills）。
- 治理面注记：promoted 桶 ↔ README ↔ plugin.json skills 数组 ↔ docs 页 ↔ ask-matt 路由五处一致性不变量——与 swarm-yuan 四载体一致性同构，不另吸收。
