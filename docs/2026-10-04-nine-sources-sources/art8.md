---
title: "Self-Improvement、Self-Evolving、RSI，终于有人讲清楚了"
account: "上下文编织局"
publish_time: "2026/09/16 11:29:06"
url: "https://mp.weixin.qq.com/s/XnOhOoamoz-skU2Jmh2wSA"
---

# Self-Improvement、Self-Evolving、RSI，终于有人讲清楚了

一句话读懂这篇 Survey
**Self-Improvement** 是系统改变自己；**RSI** 则是系统连“以后如何改变自己”的机制也一起改变。

最近，**AutoResearch、Self-Improvement、Self-Evolving、Recursive Self-Improvement** 几个词经常混在一起使用。
只要 Agent 能反思、改 Prompt、写 Tool，甚至自动修改训练代码，就很容易被称为“自进化”；一个系统只要能循环跑实验，也容易被包装成 RSI。
但这些事情其实不在同一个层级。
一篇新的 Survey 给出了一个很清楚的划分：
`The Path to Recursive Self-Improving Agents`
https://self-improving-agent.com优化一次结果
→ 优化系统本身
→ 优化“系统如何优化自己”的机制这三步，分别对应了完全不同的能力。

## 1. 几个概念的严格边界
**第一层：结果变好。**
Agent 在一次任务中反思、重试、改答案，但任务结束后系统恢复原样。这只是 inference-time optimization，还不算严格意义上的 Self-Improvement。
**第二层：系统发生持久变化。**
Agent 把经验写入 Memory，更新 Prompt、Tool、Skill、Workflow，或者修改数据与训练配置，并在后续任务中继续使用。这才是 Survey 所定义的 **Self-Improvement**。
**第三层：改进机制本身也发生变化。**
系统不仅修改 Agent，还会修改“如何发现问题、提出候选、组织实验、评估结果、保留或回滚修改”这一整套机制。这才进入 **Recursive Self-Improvement（RSI）**。
会自我修改，不等于 RSI。真正的递归发生在“改进机制”也成为改进对象之后。
至于 **Self-Evolving**，它更像一个宽泛的上位表达，可以指系统长期演化，但本身并不能说明系统究竟处于哪一级。

## 2. 自进化的不只是 Prompt、Memory 和 Tool
这篇 Survey 另一个很重要的贡献，是重新定义了 Agent System 的系统边界。作者将时刻  的 Agent System 形式化为一个五元状态：

其中， 表示 Foundation Model， 表示 Agent Harness， 表示 Agent Data System， 表示 Agent Trainer， 表示驱动系统改进的 Improvement Mechanism。
因此，整个系统可以概括为：
Agent System = Model + Harness + Data + Trainer + Improvement Mechanism
- • **Model**：模型参数与基础能力；

- • **Harness**：Prompt、Memory、Tool、Skill、Workflow、Multi-Agent；

- • **Data**：Environment、Task、Trajectory、Verification、Curriculum；

- • **Trainer**：Reward、Loss、Optimizer、Hyperparameter、Training Infrastructure；

- • **Improvement Mechanism**：Diagnose、Propose、Evaluate、Integrate。

![img](https://mmbiz.qpic.cn/sz_mmbiz_png/41MLUK1a6aTL0F8RPTZc6Th78k2QiaYEsBMFWTFiaEjjsBk8KAOIAPunHpIV7TVmDlYA22X1pOTJyvdwL17n5eVicADZmE7W3n2t17SKd6YWzQ/640?wx_fmt=png&from=appmsg)

图 1：Unified Framework of Agent System Self-Improvement

这张图给出了全文的统一框架。 与  共同完成实际任务，交互产生的 trajectory 进入 ；Data System 负责组织 Environment、Task、Trajectory、Verification 与 Curriculum，随后由  将这些训练与评估信号转化为模型更新。位于中心的  则读取系统状态和实验反馈，通过 **Diagnose → Propose → Evaluate → Integrate** 形成闭环，并把验证有效的修改写回 Model、Harness、Data 或 Trainer。
普通 Self-Improvement 可以表示为：

此时，系统状态持续变化，但负责产生变化的  仍然固定。RSI 的关键是进一步出现：

也就是图中 Improvement Mechanism 内部最下方的递归箭头：系统不只输出新的能力状态，也开始修改产生下一代系统的改进机制。
过去谈 Agent 自进化，注意力往往集中在 Harness：改 Prompt、加记忆、造工具、搜工作流。
这篇 Survey 把 **Data System** 和 **Trainer** 也正式纳入了可进化状态。
数据不再只是训练前准备好的静态输入。系统可以根据当前 failure pattern 生成新任务、调整环境难度、构造 recovery trajectory、更新 verifier，并决定下一阶段最值得训练什么。
训练过程也不再是固定流水线。Reward、Loss、Optimizer、超参数、训练脚本和算力调度，都可以进入自动实验与持续优化的闭环。
自进化不只是“Agent 如何运行”发生变化，也包括“Agent 学什么”以及“Agent 如何被训练”发生变化。

## 3. AutoResearch 为什么通常还不是 RSI？
AutoResearch 已经可以自动完成：
修改训练代码
→ 运行实验
→ 评估结果
→ 保留有效修改
→ 进入下一轮这个闭环很强，但如果负责搜索的 runner、候选生成策略、评估方式和 promotion 规则始终固定，那么变化的只是训练系统，改进机制本身并没有变化。
按照 Survey 的分级，它通常仍是 **L3：Programmatic Self-Improvement**。
层级
系统能做什么

**L1：Manual Improvement**所有诊断、修改、验证与部署都由人完成

**L2：Assisted Improvement**Agent 可以诊断问题或提出修改，但关键验证与部署仍由人完成

**L3：Programmatic Self-Improvement**自动提出、执行和验证修改，但改进机制固定

**L4：Bounded Recursive Self-Improvement**连改进机制本身也能被修改，但改进范围仍受特定领域约束

**L5：General Recursive Self-Improvement**改进机制可以跨广泛且持续变化的领域迁移

如果进一步让 `runner.py` 不只搜索 `train.py`，还能够根据历史实验修改自己的搜索逻辑，系统才开始从 AutoResearch 走向 L4。

## 4. 距离 L5 General RSI，还缺什么？
Survey 判断，当前系统大多仍处于 **L3 或 bounded L4**。从局部、受限的递归改进走向 L5 General RSI，至少还需要解决四类问题。

### 1. Long-Horizon Evaluation
评估不能只看当前版本的 benchmark 分数是否上涨，还要观察多轮 self-modification 后系统能否持续进步、保留已有能力、从失败修改中学习，以及 Diagnose、Propose、Evaluate 本身是否也在变强。
换句话说，评估对象需要从 **Task Capability** 扩展到 **Improvement Capability**。

### 2. Observable & Modifiable Infrastructure
真正的 RSI 需要统一观察并修改 execution trace、experiment history、training state、code version、data pipeline 与 compute resource。当前这些信息往往分散在不同系统中，仍缺少统一、可复现、对 Agent 友好的表示与接口。

### 3. 从 Bounded RSI 到 General RSI
L4 只要求系统能在特定领域内修改自己的改进机制；L5 则要求这种 improvement capability 可以跨领域迁移。例如，一个擅长优化 Coding Agent 的 meta-improver，能否迁移到数学、机器人或科研任务，仍然是开放问题。

### 4. Governance & Safety
递归改进会让错误修改跨多轮累积，并进一步改变后续搜索分布。因此，validation gate、rollback、audit trail、provenance、canary test，以及受保护的 evaluator 或 safety anchor，都必须成为改进闭环的一部分。
RSI 不只需要回答“怎样产生更强的 successor”，还必须回答：**什么样的修改有资格被长期保留下来？**

## 结语
这篇 Survey 最有价值的地方，不是又创造了一套新名词，而是给混乱的讨论画出了一条边界：
Optimize Result：让这一次做得更好
Optimize System：让之后的自己变得更好
Optimize Improvement：让“变好的方法”本身也变得更好所以，AutoResearch 可以是 Self-Improvement，Self-Evolving 可以描述更大的系统演化趋势，但它们都不自动等于 RSI。
真正的 RSI，不只是系统能够改自己。
它还必须能够改写“自己将如何继续改自己”。

## 参考阅读

 

- • The Path to Recursive Self-Improving Agents：项目主页
    https://self-improving-agent.com

- • Survey 配套 GitHub 仓库 

-     https://github.com/D2I-ai/awesome-recursive-self-improving-agents
