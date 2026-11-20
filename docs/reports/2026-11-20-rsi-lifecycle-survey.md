# RSI 生命周期综述对账：环路×七阶段×三层验证（2026-11-20）

> 用途：本轮吸收（spec `2026-11-20-rsi-lifecycle-absorption.md`）的调研对账正本。
> 一手来源：论文《When, Where, and How Experience Becomes Structure: Mechanisms for Recursive Self-Improvement in LLM Agents》（中科院自动化所＋美团等 10 机构，alphaxiv 2611.recursive-self-improvement-llm-agentsv1，PDF 全文 2363 行已通读；本文行号锚指 pdftotext 提取稿）。公众号导读（模智空间 2026-11-20）为忠实摘要。
> 读毕应能回答：这篇综述给了什么判据、AIStudio 九格覆盖到哪、三个净缺口是什么。

## 一、论文框架（五件工具，全部带行号锚）

1. **三问**（paper:121-131）：When（交互证据何时触发更新/支持留存/ warrant 修订退役——三类证据：执行证据→考虑更新 paper:61-63、验证证据→接受/修改/拒绝 paper:67-68、后续证据→保留/修订/退役 paper:73-74）；Where（改 Prompt/Memory/Skill/Harness 单组件还是协同 paper:129-130）；How（经验如何转化为可复用修改/验证回归/整合后续使用 paper:130-131）。三问相互依赖（paper:132-134）：目标选择决定需要什么证据，验证反过来可能触发另一次干预或限制留存范围。
2. **四组件×五维度**（paper:375-415）：组件按「留存内容如何影响执行」划分而非存储介质（paper:106-108）——同一段文字写进系统提示是 Prompt、被检索是 Memory、组织成可执行流程是 Skill、实现于运行机制是 Harness（paper:393-396）。五维度：持久性/流程化程度/强制力/可编辑性/治理负担；维度相互作用（强制力越强测试越多、失值记忆仍留库、一处配置改动影响所有任务，paper:414-415）。
3. **七阶段生命周期**（paper:539-556）：Collect→Evaluate→Diagnose→Abstract→Update→Verify→Consolidate；Evaluate（检验已发生的执行）≠Verify（检验候选改动）——paper:551-554；「分析工具不是流水线」（paper:555-556，可合并/省略/先用后验）。Figure 5 矩阵（paper:559-682）实证：**Verify 缺失集中在 Memory/Skill 路线**（A-MEM/Mem0/ReasoningBank/AutoSkill/SkillRL/SkillForge 标 NR；paper:571-575、1144-1146、1197-1198），Prompt/Harness 列全报验证。NR＝未报告该操作≠无最终评估（paper:563-565）。
4. **三种留存模式**（paper:307-336）：答案修订（只改本次输出，无可继承更新）/持久经验（指令记录流程留存复用）/改进器更新（改动的流程本身被表示并被修订）。**递归依赖判据**（paper:283-287）：留存组件或更新过程必须进入后续改进周期并帮助产出进一步更新——**后续任务复用 alone 不证明递归依赖**。
5. **三层验证**（paper:1644-1702）：①当前任务变好（同任务前后）；②后续任务受益（组件贡献 with/without、跨任务/模型迁移）；③以往的改进帮助产生下一次改进（Table 7「Later updates with and without retained experience」paper:1699-1702）——第三层与递归自改进连接最直接。判伪：首末分数无法区分「更好组件/更多搜索/候选选择」（paper:1661-1670）；须等初始版本/等任务/等反馈/等搜索预算的继承组 vs 从头组（paper:206-208、1737-1738）。评测独立性：**候选筛选消耗测试独立性**（Self-Harness 留出分参与接受决策→不能当完全独立最终测试，paper:1709-1713）；评测器自身变更时分数随标准变，须同任务复查新旧版本（paper:1753-1756）。

三大挑战（paper:33-35）：跨组件归因/长期有效性/独立验证。成本对照：Terminal-Bench 相近预算下 Harness 进化未稳定超过并行采样/顺序修正，迁移有限（paper:1519-1524）——结构收益与搜索收益必须在评测设计上分离。

## 二、AIStudio 九格对账（三层验证×三留存×三挑战）

| 维度 | 综述判据 | AIStudio 机制（锚点） | 覆盖 |
|---|---|---|---|
| 验证①当前任务变好 | 同任务前后可测 | 晋级门增益+噪声 δ（loop-report.ts:110-137）；constraint_regression（:341-349）；烧机 digest verify-latest（mx-mechanism-receipt.py:242-259）；执行证迹 W1（execution-trace.ts） | 已覆盖 |
| 验证②后续任务受益 | 迁移/留出 | heldout 门（loop-report.ts:219-233）；gain_retention_low（:187-205）；快照召回留痕+effect 三态（ai-native-batch2 §四/§五，在途） | 已覆盖（对照面在途） |
| 验证③以往改进帮产生下一次改进 | 等预算继承 vs 从头 | D7 全历史注入+垫脚石（loop-advice-evolution.ts:26-92）；lessons 轮间沉淀（mx-retro-sink.sh）；经验 freshness（experience-freshness.ts）；**效果归因/试用期/自动回滚＝Agnes 批一在途未合** | 部分 |
| 留存①答案修订 | 单次修正留痕 | decisions/trace 哈希链；superseded 链（cognition-batch2） | 已覆盖 |
| 留存②持久经验 | 审核/版本化/退役 | 候选状态机+受控注入三前提（exp-inject.ts:1-22）；遗忘阶梯；KG 快照回滚 | 已覆盖 |
| 留存③改进器更新 | 流程本身被修订 | generator-self-gate CI（swarm-yuan.yml:48-95）；机制预算棘轮；复盘被复盘（retro-round2）；晋级门自收紧（agnes worktree） | 部分（有意收窄：递归深度锁 1，rsi-maturity.ts:155-183「安全取舍非能力缺口」） |
| 挑战①跨组件归因 | 拆算力/组件 | attributeGain（loop-core.ts:423-470）+等预算自动供给（service-auto-probe.ts:326-360）；editClass；反事实四变换；技能差分；九面隔离 | 已覆盖（单变量自动消融无） |
| 挑战②长期有效性 | 不随时间衰减 | 90 天半衰；sunset 强制复核；复发账本第 3 次升级评审；N 台账回写 | 已覆盖 |
| 挑战③独立验证 | 非自评 | 冷读协议 S1-S4+not-run 停机；audit-sample 固定 seed；六态证据仅 exercised 可 PASS；heldout 密封 | 已覆盖 |

## 三、三个净缺口（本批 A/B/C 的靶）

1. **七阶段缺口不可见**（→A rsi-lifecycle 审计器）：五条真实环路无一按七阶段审计；以 qgate-FAIL 经验回流为例，Collect/Abstract/Update 在（qgate-ingest.ts/三形态提取/curate），Verify 只有形式守门（reflection-guard 422 查陈述质量，不查效果）——与综述 ReasoningBank「写入前无逐条测试」同款（paper:571-573）；效果验证延迟到 R2 重测闸与在途 Agnes 批一。综述 Figure 5 是现成矩阵范式。
2. **留出集被晋级消费**（→B 证据角色披露）：heldout 门读数参与候选接受（loop-report.ts:227-233）＝Self-Harness 同款独立性消耗（paper:1709-1713）；仓内无「哪份证据在哪个决策角色被消费」披露。
3. **技能失败三分归因零覆盖**（→C 纯函数诊断）：综述 Figure 8 三分（选错技能→改路由 paper:1058-1065；照做跳步→Harness 完成检查；流程缺步→修 Skill 本体）；仓内运行时失败落不到「该改哪里」；SLIM 贡献审计（有/无技能差分决定退役，paper:1194-1198）只在 workbench skillDifferential，未接 skill-lifecycle 归档决策。

## 四、不做清单（边界）

- 不解锁递归深度/自动改写改进器——spec 硬边界（rsi-maturity L4）无新证据支持修改；综述 VERSE 结论（执行检查对优化器自演化起关键作用，非无限制自改 paper:1533-1556）反向支持现有「人批受治理」形态。
- 不新增正则化晋级规则——2026-11-01 机制扩展停止裁定；B 只做披露字段。
- 不替在途批（Agnes 批一/ai-native-batch2）定验收——只登记对照义务（spec「决策记录」D 节）。

## 五、核验边界

- 论文 PDF 为 alphaxiv v1（2026-11-20 抓取）；Figure 4/5 图片文本提取存在个别标签错位（官方口径 40 项研究/20 环路，提取稿 21 标签差 1 已按正文口径归一）；SWE-agent†/HarnessX‡ 脚注未随提取保留。
- 仓内对账以 2026-11-20 主检出（main f1f09ea3a）＋两在途 worktree 现状为准；「在途」两格（验证②对照面/验证③效果归因）合并后需复核。
- 本报告为调研产物：本轮未改运行时行为；A/B/C 的工程落点见 spec 文件清单。
