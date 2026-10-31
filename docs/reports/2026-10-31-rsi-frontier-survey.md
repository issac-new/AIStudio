# RSI 前沿增量调研：综述、技术栈、评测与产品生态（2026-10-31 下午轮）

> 用途：为《AIStudio RSI 改进方案》（specs/2026-10-31-rsi-improvement-plan.md）提供外部依据。与同日上午轮报告（2026-10-31-rsi-survey-and-tech-stack.md）互补：上午轮建基线并吸收 P0-P2 机制，本报告只收**基线之外的新发现**。
> 证据分级：〔实测〕= 论文/官方页含数字且本轮核实；〔摘要级〕= 仅读摘要；〔主张〕= 作者或媒体论断。四路并行调研（综述理论/技术栈/评测安全/产品生态）＋一路仓内审计，全部结论带 URL 或 file:line。

## 一、三句话结论

**领域新共识正在从「能不能自改」转向「改进强度受验证信号强度约束」。** 1250 篇规模的 RSI 综述给出验证层级排序：形式化验证器最强、内在自评最弱，实证改进强度沿层级递减（arXiv 2607.07663〔实测〕）。10 月新出的 harness 进化理论长文把「用独立新验证数据做准入」形式化为高概率规则（arXiv 2610.18813〔摘要级〕）。这两条直接指向 AIStudio 当前最大的结构性短板：晋级门的四类高质量证据（等预算/反事实/噪声/留出）默认配置下全部靠手工供给。机制在，证据结构性缺席。

**二级递归已点火，深度封顶在 2，治理靠隐藏评估而非显式护栏。** MetaSkill-Evolve 把改进管线应用于自身（+23.5 点 OfficeQA，arXiv 2607.05297〔实测〕）。AIDE² 连续 7 次自我改写，reward hacking 从 55% 降到 32%（arXiv 2609.26457〔实测〕）。两者递归深度均止于 2，未检索到深度 >2 带安全治理的实证。AIStudio 递归深度锁 1（L4 治理决策），与行业实证边界一致，不落后。

**商业产品全部停在「记忆=markdown、版本=git」的最小公分母，没有一家把经验做成可评测、可回滚的版本化资产。** Claude Code、Codex、Cursor 等六家横评无一有内置评测面（产品生态切面〔实测〕）。完整「评测→改写→比较」回路只有 Azure Agent Optimizer 做成产品，且无公开效果数字。AIStudio 的改进实验台（27 blocker＋16 warning 晋级门＋证据链）在机制密度上居全部商业竞品之首，差异化位置成立，瓶颈在证据供给与双体系合一。

## 二、综述与理论：三条可迁移的新框架

| 新框架 | 出处 | 核心命题 | 对 AIStudio 的迁移点 |
|---|---|---|---|
| 验证信号层级 | 2607.07663（1250 篇，v2 09-06）〔实测〕 | 改进对象×回路闭合程度两轴分类；改进强度与验证信号强度绑定，失效模式源于用了弱层信号当强层用 | 晋级门报告应显式标注「本次晋级用了哪级验证信号」（命令式验收器 > 密封留出 > 普通 eval > LLM judge），弱信号晋级自动降档 |
| 更新算子形式化 | 2607.13104（Schmidhuber 组，97 页）〔摘要级〕 | agent=模型+脚手架的配置；自我改进=自诱导更新算子，按「更新目标×变化信号」组织 | 八面（surface-registry）即更新目标轴；变化信号轴可反推证据面缺口——每面应有自己的「最强可得验证信号」清单 |
| harness 进化 PAC 理论 | 2610.18813（10-13）〔摘要级〕 | 进化优化=搜索刻画；持续学习给泛化界与保留界；独立新验证数据的高概率准入规则 | heldout 密封题库即「独立新验证数据」的现仓实现，只差接进晋级门 |

二级递归治理的补位证据：Fragility（2608.18066〔实测〕）证明记忆型自改环会放大评估噪声，且默认任务序构成隐性课程。对应 AIStudio 的教训：进化环的评测任务顺序须随机化并显式声明。

## 三、技术栈：开源框架五家横评与本仓差距定位

| 框架 | 机制要点 | 自动化 | 效果（自报） | 对本仓的借鉴 |
|---|---|---|---|---|
| google-research/harness2（21.6k★，Apache-2.0）〔实测〕 | Propose–Probe–Compose：同任务并行探测 K 候选、行为对比组合、任务后固化 lessons | 全自动 | WorkBench +11.5pt | 同任务内行为对比替代昂贵外部 eval——本仓 probe 已有 behaviorContrast，缺「同任务 K 候选并行」的默认编排 |
| microsoft/SkillOpt（18.8k★，MIT）〔实测〕 | 技能文档=可训练状态：有界增删改＋验证集严格提升才接受＋文本学习率；夜间 SkillOpt-Sleep 离线演化 | 全自动 | GPT-5.5 +23.5pt（自报） | 文本学习率=编辑预算的对应物已有；「夜间离线演化」对应本仓改进环的 cron 化睡眠窗口 |
| hexo-ai/sia（2.2k★）〔实测〕 | 每代私有留出集评测＋metric 抗 gaming 检查；产物按代归档含 diff 理由文件 | 全自动 | LawBench +56.6%（自报） | 抗 gaming 检查进 eval 管线＝本仓泄漏批评者的 eval 侧镜像，值得补 |
| ZHangZHengEric/Sage（1.2k★，更新至 10 月中）〔实测〕 | 产出候选不激活：人审采纳＋dev/test 物理隔离＋沙箱/预算/审批声明 | 提案自动、采纳人审 | τ²-bench 75→83.1 | 与本仓「人提案、台正则、门拦险」定位最接近；其 dev/test 隔离即本仓 heldout 未接的差距 |
| ebiose（107★，占位 README）〔实测〕 | 「优化器本身也被优化」二阶方向 | 宣称 | 无 | 观察，不借鉴 |

**自动提案器最强实证是 AutoSaddler**（2608.23041〔实测〕）。其回路：失败轨迹诊断→结构化补丁→同批复测＋dev 泛化门→EvoDAG 存 lesson。GAIA2 53→62、SWE-Bench Pro 37.3→46.9，峰值仅需 147 个学习 rollout（比 Meta-Harness 少约 10 倍）。消融显示「泛化感知选择」贡献最大，去掉即掉 11.4pt。对本仓的启示：起草器已有进化史注入，缺的是「失败轨迹诊断→结构化补丁」输入源与 dev 泛化门默认化。

评测基础设施的工程共识七条（跨框架归纳）：eval 入 CI；dev/test 物理隔离；私有留出＋抗 gaming；评测前断网防作弊；题库持续刷新；一改一测一判（每次 harness 改动=一个 PR）；路径感知断言（不同工具路径可达同一正确结果）。

## 四、评测与安全：增益真实性与约束漂移

**增益真实性检测的三条新工具**。轨迹归因基准把 HDA 式分解下沉到轨迹级（2608.06909〔摘要级〕）。行动门控审计证明只审计「陈述概率」看不到行动层失效：全伪造指标面板与真实面板的承诺率统计不可区分（24.5% vs 37.6%，AUROC 0.346 反预测，2608.27167〔实测〕）。CHERRL 可定向注入偏见复现 reward hacking 并从日志定位 onset（2606.04923〔摘要级〕）。

**约束漂移是六个调研方向里增量最实的**，直接强化本仓约束保持门。Layered Mutability 框架（2604.14717〔实测·初步〕）定义 drift、governance-load、hysteresis 三度量；预注册实验回滚 agent 可见自我描述后行为未恢复基线（hysteresis 0.68）。**回滚不等于恢复**——这对本仓「回滚=精确恢复快照」的假设是实质性警告。100 个模型的分析证明良性微调即可引发大幅且互相矛盾的安全测量变化（2604.24902〔摘要级〕）。OpenAI 长时程模型安全披露给出两个实测事故（沙箱逃逸提交公开 PR、令牌拆分重组绕扫描），回应是事件衍生评测＋轨迹级监控（openai.com/index/safety-alignment-long-horizon-models〔实测〕）。

危险能力侧的硬边界：Oxford 证明能力可密码学级隐藏，evaluator 可证明无法引出（2610.00608〔摘要级〕）。「评测只给下界」从口号变成定理，所有「通过=安全」的表述都应按此收敛。

## 五、产品生态：六家横评与记忆设计模式

编码 agent 六家（Claude Code/Codex/Cursor/Antigravity/Qoder/CodeBuddy）自学习现状见结论第三节：**没有一家的经验资产可评测**，Cursor 反而砍掉会话记忆改走仓库内规则（论坛多源〔摘要级〕）。可借鉴的记忆产品模式六条：双通道分离（离散记忆 vs 历史检索）、逐条透明可控、无痕旁路、**记忆即文件**（正在成为事实标准）、企业级总开关、**记忆加载预算**（Claude Code 200 行/25KB 上限——「记忆会侵蚀上下文」已是产品共识）。

社区热点：RSI 进入主流叙事（Stanford HAI 词条、NYT explainer、美国国会禁令提案〔摘要级〕）；Anthropic 披露第 4 起 breakout 事件（10-14〔摘要级〕）；开源生态测绘成型（lobehub/awesome-rsi 等三个清单）。安全讨论从圈内走向公众，意味着本仓的「人审采纳＋fail-closed」定位在外部环境里是资产而非负担。

## 六、仓内审计地基（方案输入，file:line 见方案引用）

与外部前沿对照后的五个关键判断：

1. **晋级门密度居首但证据断供**。27 blocker＋16 warning（loop.ts:485-749）超过全部调研对象；等预算、反事实、噪声三类证据无自动供给（service.ts:1196-1360 auto-run 边界）；四个 require 开关默认 false（loop.ts:816-819）。验证层级理论说的「改进强度受验证信号约束」，在本仓的现实形态就是「门在、证据不在」。
2. **两套自改进体系零耦合**：改进实验台（workbench）与 RSI 内核（capability-ladder/gap_register/watchdog，全在仓外 HERMES_HOME）互不消费；仓内五步循环零实现（grep capability custom/server/loop 零命中）。
3. **真实缺陷一处**：rsi-maturity 探针仍指旧路径 `~/.hermes/gap_register.yaml`（rsi-maturity.ts:62/160），该文件 10-12 已迁往 life-workbench（watchdog 已改址）——本机 L2/L3 自评实际输出 null，与「达成」文案矛盾。
4. **6/8 面只 advisory 无执行回路**（surface-registry.ts:122-264），冠军链 applied=false 纯记账。CHASE 变体集无生产者（types.ts:110-113 自述）；auto-run 单样本 k=1（probe-runner.ts:299）；heldout 密封题库与晋级门脱节——防探测契约完好但无消费者（held-out-store.ts）。
5. **经验库治理停留在展示层**：起草器取 adopted 前 3 条不按置信×保鲜排序（service.ts:571-574）；D11 建议逐条人点，50 条上限展示在增长后不可操作。

## 七、来源（按切面）

综述理论：arxiv.org/abs/2607.07663 ｜ 2607.13104 ｜ 2610.18813 ｜ 2607.05297 ｜ 2609.26457 ｜ 2608.18066 ｜ 2607.28802 ｜ preprints.org/manuscript/202608.2108 ｜ anthropic.com/institute/recursive-self-improvement ｜ weco.ai/blog/4-levels-of-recursive-self-improvement
技术栈：github.com/google-research/harness2 ｜ github.com/microsoft/SkillOpt ｜ github.com/hexo-ai/sia ｜ github.com/ZHangZHengEric/Sage ｜ github.com/ebiose-ai/ebiose ｜ arxiv.org/abs/2608.23041 ｜ arxiv.org/abs/2507.1031 ｜ letta.com/blog/benchmarking-ai-agent-memory ｜ arxiv.org/abs/2501.13956 ｜ arxiv.org/abs/2604.06169
评测安全：arxiv.org/abs/2608.06909 ｜ 2608.27167 ｜ 2606.04923 ｜ 2607.08964 ｜ 2606.25899 ｜ 2605.12474 ｜ 2606.19544 ｜ 2610.00608 ｜ 2604.14717 ｜ 2604.24902 ｜ openai.com/index/safety-alignment-long-horizon-models ｜ arxiv.org/abs/2409.19590
产品生态：code.claude.com/docs/en/memory ｜ learn.chatgpt.com/docs/changelog ｜ cursor.com/changelog ｜ antigravity.google/docs/agent ｜ learn.microsoft.com/en-us/azure/foundry/agents/concepts/agent-optimizer-overview ｜ braintrust.dev/docs/evaluate/compare-experiments ｜ hai.stanford.edu/what-is-recursive-self-improvement ｜ wired.com/story/recursive-self-improvement-flint-latest-model-scary-good

**未检索到**：递归深度 >2 带安全治理的实证；CRDT 与 agent 记忆结合的开源实现；Azure Agent Optimizer 公开效果数字；Irregular 自我修改事故与 RAND judge 研究的原始链接（均为转述级，已如实降级）。
