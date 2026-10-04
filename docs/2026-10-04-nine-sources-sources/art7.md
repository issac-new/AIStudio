---
title: "清华大学提出 RSI 全景综述：404篇文献拆解AI递归自我改进"
account: "MindChain.AI"
publish_time: "2026/10/03 12:00:00"
url: "https://mp.weixin.qq.com/s/E_QB9eFTkLVnKuh36I2PJg"
---

# 清华大学提出 RSI 全景综述：404篇文献拆解AI递归自我改进

![img](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWDqMk9nia4qB7Bq0rZ7uWvraCoTq5yUlQyCdKpAotDdCIwHc8cQcldnkMC1efYRia8YQFXCiaERP5Ufw7gh0Q6ZuvAZ2U4k3NbVgE/640?wx_fmt=png&from=appmsg)

![img](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWAnqElcrOEuyCibCaEMVqvrPngY2313uUuH7QxzvDTqP1TrWkUa4SoZCfPicoDgPWybYwK1gJHVU7B9cj6IKhbqCLDYJn1kZN7jA/640?wx_fmt=png&from=appmsg)

PAPER · 论文信息
**标题**Recursive Self-Improvement in AI: A Survey
**作者**Hao Wu1、Fan Xu2、Fan Zhang3、Zhipeng Xu1、Yongheng Zhang1、Yinghui Li1、Yizhou Zhao4、Penghao Zhao5、Weiran Yao6、Zengxiang Li7、Yuan Gao1、Zhangyang Gao8、Hanbin Wang5、Ruihan Tao9、Wenjie Wang10、Qi Li11、Junfeng Fang12、Xingjun Ma13、Qiankun Li14、Xiao Luo15、Yefeng Zheng16、Zhiwei Liu17、Stephen Wang18、Kun Wang14、Yang Liu14、Yugang Jiang13、Liang Wang11、Nan Liu7、Philip S. Yu19、Caiming Xiong17、Qiang Yang20、Qingsong Wen21†
**机构**1清华大学；2Shenzhen Loop Area Institute；3香港中文大学；4卡内基梅隆大学；5北京大学；6actAVA.ai；7杜克—新加坡国立大学医学院（新加坡国立大学）；8上海人工智能实验室；9加利福尼亚大学伯克利分校；10华中科技大学；11中国科学院自动化研究所；12新加坡国立大学；13复旦大学；14新加坡南洋理工大学；15威斯康星大学麦迪逊分校；16西湖大学；17Recursive；18Abel.ai；19伊利诺伊大学芝加哥分校；20香港理工大学；21松鼠Ai
**原文**https://www.preprints.org/manuscript/202609.2680/v1

INSIGHT · 核心洞察

“
AI 能自己改代码、写训练数据，甚至修改负责改进自己的程序。这篇综述给出一个有用的判断框架：**追踪本轮留下的变化，是否让下一轮更容易产生有效改进**。这直接决定我们该保存什么经验、开放哪些修改权限，以及怎样检验“自我进化”。

一次代码修复让程序通过了测试；如果修复经验还改变了 Agent 的诊断策略，下一次它可能更会修。**从解决当前问题走向改善后续学习过程**，正是递归自我改进关注的路径。

这篇综述按作者统计汇集 404 项独立工作，把自训练、记忆、Agent 设计和自修改代码放进同一框架。它是叙述性综述、尚未经同行评审；**文献规模用于描绘研究版图，具体能力判断仍要落到被检验的配置上**。

📌 一句话总结　本文梳理 Recursive Self-Improvement（RSI），围绕系统状态如何被继承、改进过程如何被更新，区分**任务增益、能力保留与改进器增益**三类证据。

01
BACKGROUND

### 研究背景：改进如何形成递归

论文首先把系统拆成两种功能：负责完成任务的 S，以及负责诊断、提案、搜索和选择更新的 I。同一模型或同一段代码可以兼任两者；**区分角色，是为了看清变化流向哪里**。图 1 的上方回路保留任务系统，下方回路则把改进过程的变化带入下一轮。

![img](https://mmbiz.qpic.cn/sz_mmbiz_png/pZDxT91EqWDlOUP7Bx8Sj2cKbuE57IV2GDDkvzsrkAZRBNNzs6IMa57qswBwXXMKHRG0R3xkdpfmD6aXuB2RUAIgLgwlAdEVGxibG0OU8kqI/640?wx_fmt=png&from=appmsg)

— 图 1｜任务系统与改进过程的两条继承路径；外部目标、独立评测与预算界定更新范围。
沿着这个回路，作者划出两个相互重叠的工程目标：设计新的训练流程、Agent 工作流和算法，以及修复或优化现有系统。图 2 将原文九章串起，**两条路线最终都要回答“本轮成果怎样帮助后续改进”**。一个工作流可以同时是新设计，也是对既有失败的修复。

![img](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWCOtcS0KVjwliaso7OvBy8YsfYBxq1Nmq7ialyU7PLgkm6kGvXVWX0CqJpR2vaWNmrtib6HTfMJYvfsSneumS0gHyNqt0cRpD3qZg/640?wx_fmt=png&from=appmsg)

— 图 2｜原文结构：从定义和分类出发，进入基础设施设计、系统修复与共同的评测框架。
1.1六条路线，围绕同一个回路

把研究按更新对象展开，图 3 得到权重、任务、记忆、程序、反馈和改进过程六个扇区。STaR 把推理轨迹用于训练，Voyager 保存可执行技能，STOP 则允许改进程序修改自身。**相同的“自我改进”标签，可能对应完全不同的持久状态**；一个方法也可以跨越多个扇区。

![img](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWDj6nP1naanjiaF7r4slNWH6VmSaJzUdmaApgx1A5uf9wYr8z09zoOV0WVHDYFm6AWVTsibPaPzKxJUDTibChB9soHtubaFVyOSbQ/640?wx_fmt=png&from=appmsg)

— 图 3｜六类更新对象及代表工作；图中位置表示机制关联，不表示已实现持续递归增益。
这些路线有共同的历史基础。图 4 将 45 篇代表性方法放入六条研究路线，另列 Gödel Machine、学习型优化器和 POET 三个历史参照。**自动搜索、学习更新规则、任务与求解器共同演化，早于今天的大模型 Agent**。图中的分支用于归类，不能据此推断技术继承关系或能力等级。

![img](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWCIbr3ZxW6BxchVaARYBfJEnrwFnWgYCFmibDF6ibeLDa8FZqrxBs1uichATvENeE7fIODRnibJQibcJEuILwzhvTv5rSsVfkbxteSw/640?wx_fmt=png&from=appmsg)

— 图 4｜代表方法的历史路线；年份与机构标记沿用综述所核对的来源。
1.2这篇综述增加了什么视角

相关综述已从生命周期、组件和递归闭环等角度整理这一领域（图 5）。本文的切入点是把工程目标、保留的状态和已验证的贡献连起来：**方法属于哪一类，要与它究竟证明了什么分开判断**。这让记忆系统与代码自修改系统有了共同的比较语言。

![img](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWAawibBHeHJgez85NwBM2HfNvC7l4nWfcicKg37ibVkoMt9xFhZfukHaYVGtE9sUNsV0C4Vv6dMaj8MpvA8ecMQTVyIjN7HtsQVGA/640?wx_fmt=png&from=appmsg)

— 图 5｜生命周期、组件与递归闭环三种互补视角。
表 1 用九个维度比较既有综述，覆盖更新范围、保留边界、改进器与评判器变化，以及独立测试、归因、成本、长期行为和配对检验。它表达的是作者对覆盖范围的判断，**不能把勾选数量当作论文质量或系统能力的分数**。

![img](https://mmbiz.qpic.cn/sz_mmbiz_png/pZDxT91EqWDFRKltGfF06MeYtTRCHU4VxNc14YGTPvUGoW0BehWPvp6SOc3VjDztTR9wvU2j4l13Gib8T92CDRG4Xwqhns5hVg7FjPx19VEk/640?wx_fmt=png&from=appmsg)

— 表 1｜既有综述的覆盖维度；✓、△、—分别表示系统讨论、部分讨论和未系统覆盖。
更细的表 2 对照了十篇综述与路线图。例如，生命周期视角关注不同阶段如何更新，本文进一步追问这些更新怎样影响下一轮。部分条目仅核对摘要，其他条目核对了选定全文段落；**比较依据的深浅也被显式保留**。这为后面的机制分析设定了清楚的证据边界。

![img](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWArntXa91uUg662fKia5V8x9cwmfzwiaoJfsrUg3iaBsQsMm0LicHJU6bDIf5UMHDFwibUqPQqfIjhOqCmKCicDCQG7PFAibIDmWB0mNk/640?wx_fmt=png&from=appmsg)

— 表 2｜十篇相关综述与路线图的范围、评测重点及本文关注点。
02
MECHANISMS

### 机制解析：让改进进入下一轮

2.1先看什么被留下

要判断递归路径，先看系统从前一轮继承了什么。表 3 把 AutoML、元学习、程序搜索、工具 Agent 与自修改联系起来：它们都可能积累搜索历史、参数或程序。**外层算法固定，并不意味着内部搜索状态不变**；进一步的检验是，这些变化能否在相同成本下改善后续设计。

![img](https://mmbiz.qpic.cn/sz_mmbiz_png/pZDxT91EqWCl1ZNfhyqmuyrFP35A4Zo6uIQkicQ28jSYd3sgUXqJlNIWwznIEBunkw1JGJ3W0ydH5F3KYFOQSsxlWegmQkZhsBNdGPeSZMPE/640?wx_fmt=png&from=appmsg)

— 表 3｜RSI 与既有研究传统的联系；最右列是需要额外回答的实证问题。
设计与修复的验收方式也不同。设计要检验产物能否迁移到新任务或新训练运行；修复还必须检查原有正确行为有没有退化。**一次更新同时受到收益、保留能力和预算的约束**。作者给出的目标函数是分析模板，并非声称所有方法都实际优化同一个目标。

图 6 把状态跨轮保留的方式分成四种：答案修改只影响当前任务；记忆留给后续任务；训练把经验写进参数；改进器更新则改变以后怎样生成更新。**持久化的对象和它承担的角色，决定了递归发生在哪一层**。四种方式可以共存，不能排成从低到高的智能阶梯。

![img](https://mmbiz.qpic.cn/sz_mmbiz_png/pZDxT91EqWA53eWr8BLqxNtBKnupZdrq8JTEWsRO2Z1vrl1fVXOPoNRtxichyYjxmhcuA8Bok2LPhAwM8aY8PRWbAYUEhc0Dao73OaYm1ejw/640?wx_fmt=png&from=appmsg)

— 图 6｜局部修订、记忆保留、参数学习与改进器更新；虚线区分当前处理与后续复用。
由此，论文分开定义三类可测主张：任务成绩相对初始系统的变化；学过的能力在后续轮次的保留及迁移；新改进器相对旧改进器产生后继系统的优势。**“后继系统更好”与“更擅长制造后继系统”需要不同实验**。后者要求把新旧改进器放在相同起点、反馈权限和预算下比较。

表 4 将这一判断应用到十类机制。递归搜索可以始终使用固定规则，自训练可以更新模型却保留训练流程，记忆增加也可以不改变记忆管理策略。**方法名称不足以说明递归能力，必须追踪具体配置中的更新与保留边界**。形式化自修改理论的结论还依赖其公理和效用条件，不能直接移用到经验式 Agent。

![img](https://mmbiz.qpic.cn/sz_mmbiz_png/pZDxT91EqWBf73icvV7LiakmpoC1CZla19Kibvmu05VZW88q3f0ogZG7x2K6WbLKNKbKH5hJHpuzOEWp6bkfNaTrvAbKUvhicHwibnwTthUaaY1M/640?wx_fmt=png&from=appmsg)

— 表 4｜十类相邻概念的更新对象与 RSI 边界；末列是待检验问题。
2.2从生成数据到设计 Agent

基础设施设计首先要决定学习什么。STaR 筛选推理轨迹用于训练；Absolute Zero 同时学习提出任务与求解任务，但执行器和训练规则仍由外部提供。**任务应当既能产生可靠反馈，又能带来新的学习机会**。持续提高题目难度，如果使任务无法验证或无法学会，也不会自动带来能力增长。

另一条路线直接搜索 Agent 的组织方式。ADAS 搜索 Agent 程序，GEPA 利用执行轨迹和文字诊断修改提示，AlphaEvolve 保留程序候选并通过可执行评估进行选择。**被发现的工作流、提示或算法，是可复用的设计产物**；要验证设计者也进步了，还需把继承的变化带入新的搜索任务。

自动科研把这一流程延长到假设、实现、实验和解释。这里应当继承的包括可执行发现、验证证据和适用条件。**实验成功运行，只完成了科学证据链的一部分**；后续研究还需要知道哪些假设被推翻、哪些结论能独立复现，才能利用已有经验。

2.3从维护经验到修改改进器

系统修复可以发生在参数、记忆、技能、提示或代码上。Reflexion 留下反思，ExpeL 抽取经验，Voyager 积累技能代码；这些状态即使不改模型权重，也能改善后续执行。**存入更好的经验，与学会更好的经验管理方式，是两种干预**。同时删除内容和管理器的消融，无法分别解释二者的贡献。

反馈本身也可以更新。Self-Rewarding 用模型偏好训练模型，Meta-Rewarding 进一步训练判断行为。生成答案与评分可能共享权重，**评判器更偏爱当前答案，不等于答案在独立标准下更好**。因此，答案质量、判断校准和反馈带来的后续收益，需要分别测量。

改进器层面有三种值得区分的路径：Promptbreeder 演化生成变异的提示；STOP 允许改进程序重写自身；Metan 保持元操作 Ω 固定，让它处理不断积累的代码、轨迹和上下文。**递归既可以来自程序自修改，也可以来自被继承材料的变化**；是否有效，要看下一轮的实测收益。

DGM 保持基础模型冻结，让编码 Agent 修改自身代码，并用档案保存不同分支；Hyperagents 把任务 Agent 与元 Agent 放入可编辑程序。**可编辑范围仍有明确边界**：DGM 的外层驱动固定，Hyperagents 的主要实验保留手工设计的父代选择，不能概括为整套系统都在自主改写。

表 5 汇总 16 种代表配置。前半部分从 STaR 的数据和权重，到 ADAS、GEPA、AlphaEvolve 的程序与提示，展示了不同的继承载体。**固定改进流程也能产生有价值的系统更新**，这些更新是理解更复杂递归系统的基础。

![img](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWAiaCqEiaOVkibqB8o6ugO5ccGQd8OtuUEpo88wMwWvEvwnPxnDKvHvAPGqBnBbib8Fvnk0PcjGVibib5jojgNvV6gFw60vUicGzGDtys/640?wx_fmt=png&from=appmsg)

— 表 5｜代表配置的保留状态、反馈来源、更新过程及运行范围（前半部分）。
表 5 的续页进一步列出可编辑提示、程序和递归上下文。STOP 的迁移研究采用 4 轮更新，DGM 报告 80 次迭代；这些数字各有单位，**不能把训练步、提示迭代和演化代数当成统一的递归深度**。比较必须转向相同条件下的实际产出。

![img](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWCDwGKXiaGIOpY10Cjhhf52OYl5dvEzicllTGCzStYm609lHaPKxxtDPDrKf2icU9sHoxfat5bnYHnyJFqRNY4K8PiccVagiaoWkMso/640?wx_fmt=png&from=appmsg)

— 表 5（续）｜代表配置的后半部分；运行长度沿用各论文单位，代码栏“—”表示未记录。
03
EVIDENCE

### 证据解析：怎样证明改进有效

3.1把更新闭环与独立测试分开

沿着前面的机制，综述提出图 7 的评测协议。候选先经过验证，决定接受、回滚或归档；所有运行结束后，再由固定评估器检查预先约定的检查点。**密封测试的分数不能反过来指导更新、停止或挑选检查点**，否则独立测试也会逐渐成为搜索信号。

![img](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWDAVqPJCSeibnw5LxcafTicclWoj7xpy4rmYfU4fUicPFvibiccGAMs8Wh7yO9djKPSrxBtK3riaG1FQOwWuE7tebQYF9MlG6DlaJgKQ/640?wx_fmt=png&from=appmsg)

— 图 7｜作者综合提出的评测协议：多轮更新、独立审计、预算对照与改进器消融。
图 7 的下半部分给出两种关键比较。完整循环与冻结改进器、无持久更新的搜索共享起点和预算；进一步把新旧改进器应用到相同的未见过的求解器状态。**后继系统的收益差，才直接回答改进器是否更强**。如果两种角色共享不可分的代码或权重，就需要更窄的消融，并保留这种耦合的解释。

基准也必须匹配被修改的对象（表 6）。SWE-bench 可以检验修复结果，MLE-bench、AI4AI-Bench 可以检验设计产物，持续任务流用于观察保留与迁移。**普通任务基准需要加上更新历史，才能承载 RSI 的评估**；科研场景还要检查独立复现与结论证据。

![img](https://mmbiz.qpic.cn/sz_mmbiz_png/pZDxT91EqWC4u9q34Dt4hRVnxic9hMBs3KcGop6tjUAsrFQoAzdmy9bo9Q6ooZdiavWdf2VHrWGibUiaD9ucYNaZratNiccZJ6YXJh20bCjPZYF4/640?wx_fmt=png&from=appmsg)

— 表 6｜工程目标与评测匹配：任务终点之外，还需检查更新历史、保留边界和独立证据。
成本要包含提案、训练、验证、执行，以及被拒候选和失败重试。不同方法即使限制相同 rollout 数，也可能消耗不同 token、模型调用或工具时间。**比较应落到共同成本节点上的质量，并另报部署开销**。无法合理换算的 GPU 时间、API 费用和物理实验资源，应分别列出。

3.2将机制覆盖与能力证据分开读

图 8 左侧给 20 项工作标注更新对象，右侧只对其中 8 项工作检查评测协议。实心与半实心标记区分明确更新和共享角色，右侧则关注独立测试、预算控制及改进器迁移。**更新了哪些部件，与这些更新获得了怎样的验证，是两张不同的表**。

![img](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWAcv5ibLw8UcIpwsVibXqgtjJWicAIE1MalhQoYtbqzPdJTG2UfySG3oETqzuM663A8iclIqzwHyn60gMrH35lC0icvkJwfLdUyqEWE/640?wx_fmt=png&from=appmsg)

— 图 8｜20 项工作的更新对象与 8 项工作的协议证据；NR 仅指所核对材料中未报告。
这组样本用于解释机制与证据的关系。其余 12 项工作没有在这里完成协议编码，空白或 NR 都不能推导为普遍缺失。**表 7 的八种协议也没有组成一个统一排行榜**：ADAS、GEPA 主要测试固定优化器产生的设计，STOP 检验改进程序，Metan 检验递归上下文与辅助代码。

![img](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWDRS9yIt5NsVHfhshIUXLcs80kdJIAFC4FkD309bd6LS9lia8HibchkqwGK0SNFSNhH64iar2NQESyQbIaLdDnolFPW9AytHG3wpo/640?wx_fmt=png&from=appmsg)

— 表 7｜八种代表协议的测试边界、预算与对照、选择方式及其支持的结论。
3.3数字要与测试对象一起读

先看系统产物的进步。综述转述 DGM：80 次迭代后，200 题 SWE-bench Verified 子集成绩从 20.0% 提高到 50.0%，即增加 30 个百分点。**这是该子集上的明确成绩变化**；评估包含搜索用题目，不能直接视作完全独立的泛化增益。Polyglot 的 50 题子集为 14.0%→38.0%，全量基准则为 14.2%→30.7%，两种测试群体需分开读。

同一个方法，选择什么对象也会改变结论。Metan 在 Gemma 4 的 CO-Bench 配置中，档案按任务择优为 0.851±0.014，最佳单链为 0.782±0.016，OpenEvolve 为 0.814±0.022。**档案择优高于对照，单条链的均值却低于对照**；这组 ± 是三次种子的标准差，数值本身不能建立显著性判断，也不能把档案结果当成单个可部署 Agent。

更直接的改进器证据来自 STOP：它在 50 个未见过的带噪奇偶学习实例上运行五次，并把选出的演化改进器迁移到另外五种效用设置。**部分配置显示了可迁移的改进能力**；GPT-4 配置在早期获得提升，而被测试的 GPT-3.5、Mixtral 配置可能退化，收益并非逐轮必然增长。

Hyperagents 将演化后的任务 Agent 和元 Agent 一起迁移到数学评分任务，冻结迁移来的元 Agent，再运行 50 次新迭代。验证集选出的 Agent 报告测试分数 0.630，置信区间为 0.540–0.630，初始分数为零。**结果支持该配置下有用的后继生成能力**；起始评分器存在格式无效问题，且任务 Agent 状态同时变化，不能把全部收益单独归给元 Agent。

在原领域对比中，DGM-H 相对 DGM-custom 的增益未达到原论文采用的显著性阈值，而相对冻结自我改进过程的对照达到了阈值。**比较对象不同，能支持的归因就不同**。这也是综述坚持保留完整配置，而不只摘取最终最高分的原因。

反馈学习同样需要拆开看。Meta-Rewarding 四轮后在 AlpacaEval 2 的长度控制胜率为 39.44%，长度控制的 Self-Rewarding 基线为 35.49%，增加 3.95 个百分点。**答案偏好成绩上升，与评判器持续变好是不同观察**：独立判断测试中，早期与人类排序相关性的提升并未在所有后续轮次保持。

Metan 还在两个提示任务上补充等 token 对照，支持这些设置中的收益不能完全由额外 token 解释。**这种预算证据属于被测试的具体配置**，并不自动覆盖其他任务或全部开发成本。综述据此支持有边界的系统与改进器进步，尚未建立无限持续或可靠加速的自我改进结论。

3.4把结论转成可执行的检验

由这些结果出发，图 9 把后续检验落到六个变量：反馈是否可靠、哪些经验值得保留、更新能否稳定继承、评估能否保持独立、搜索与验证怎样分配成本，以及改进能力能否迁移。**每个问题都对应可以改变一个条件来验证的实验**，图中给出的是研究问题和测试方案，并非已经实现的效果。

![img](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWASXRwdrGAjvq0P7YCcIgHWBECXWaSUGWkSUOqLV9d4TykRyEHcuqc9lygff3y93d3E6iawJic1WXiafZq0ofqibZCISzW74XlJvFc/640?wx_fmt=png&from=appmsg)

— 图 9｜六组问题及对应检验：反馈、经验、稳定性、评估完整性、计算预算和迁移。
例如，评判器变化时对照固定外部标准；经验库更新时同时重测旧任务与新任务；提示、工具和技能共同变化时，保留完整依赖并比较回滚策略。**外部反馈、失败记录和恢复过程，也都是改进机制的一部分**。它们让后续系统继承可验证的经验，而不只是成功样例。

04
TAKEAWAY

### 总结：把改进能力作为产物

这篇综述把自训练、记忆维护、程序搜索和可编辑改进器接到一条清晰的链上：产生候选、验证、保留，再让被保留的变化参与下一轮。**RSI 的核心研究对象，是当前能力怎样反过来改善后续更新的生产过程**。这让不同技术路线可以围绕共同问题积累证据。

对设计 Agent 的读者，一个可借鉴的出发点是：在保存成功工具、记忆或工作流时，同时明确它会怎样影响下一次诊断与搜索；评估时，再让新旧改进过程从相同起点竞争。**把“更会改进”本身作为可交付、可迁移、可测量的产物**，就能更具体地设计系统，也更准确地理解自我进化的进展。

END

我是 MindChain.AI。
如果你觉得今天这篇有收获，欢迎**关注**、**点赞**、**转发**、**喜欢**四连，我们下篇见。
