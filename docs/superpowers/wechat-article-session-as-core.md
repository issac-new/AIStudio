# 别再只堆Agent了：清华团队把Session重新做成了多智能体系统的核心

**公众号**: 量子位  
**作者**: 关注前沿科技  
**发布时间**: 2026/06/16 17:39:03  
**原文链接**: https://mp.weixin.qq.com/s/OL_i_ozTipjUc0cYSYMrPQ

---

**Agent越来越多，Session却越来越乱。**

这是几乎所有人把多智能体系统真正跑大之后，都会撞上的一堵墙。

demo跑得挺好，可当系统扩到几十上百个Agent，调试、复现、编排全部开始失控。

来自**清华大学、中山大学和香港中文大学**的Rath Team把他们的解法开源了，叫**OpenRath**：一个像PyTorch的多智能体、多会话运行时。它的主张是：

别再围着Agent转了。真正该被当成**一等公民**的，是Session。

![图片](https://mmbiz.qpic.cn/mmbiz_png/A6fTew8FFGHibopRFBNfvGus6fCf9wKKTFJob1hIA75UtLH6F5unQoZUQ7WPlY9bhZfQVrQDQjoktZPuogicAicheRYrfTIcicvBcLRwvY7MDps/640?wx_fmt=png&from=appmsg)

目前OpenRath已在PyPI发布到v1.2.1，pip install openrath即可安装，BSD-3-Clause协议，官网、文档、博客、GitHub一应俱全。

## Agent动了手，证据该存在哪

第一代大模型应用，可以概括成「提示词进、回答出」。Agent系统改变了这条边界。

一个有用的Agent不只产出文本。它会检索、规划、调用工具、读文件、写代码、查API、跑测试、操作浏览器，有时还会改动外部状态。从ReAct让推理和行动在一个循环里交替，到Toolformer让模型学会何时调用工具，再到Model Context Protocol把工具变成协议级的边界——这条线一直在往前走。

可一旦Agent真的对世界动了手，一个运行时层面的问题就冒出来了：**这些动作的证据，到底存在哪？**

如果一次工具调用读了文件，我们需要它的参数和结果；如果它改了仓库，我们需要diff；如果它跑在某个沙箱里，我们需要沙箱的身份；如果它失败重试了，我们需要那条失败路径；如果有人批准或否决了某个动作，我们需要那个校验信号。一份聊天记录顶多**叙述**这些事，却不足以**还原**这些事。

举个具体例子。一个软件任务：研究Agent读了issue、检索了笔记；编码Agent改了仓库；沙箱跑了测试；校验Agent否决了第一版补丁，于是工作流分叉；记忆后端记下这次失败，免得以后重犯。如果这些事件散落在各自的日志里，那么**最终答案几乎是最不重要的产物**，真正有价值的，是那条「工作如何一步步推进」的证据链。

这就是OpenRath的出发点：把Session当成**证据的载体**，而不只是聊天历史。

## 为什么是Agent Cluster

早期一个Agent基本够用：接收输入、理解任务、调用工具、返回结果，像个增强版聊天机器人。但真实任务很快超出单个Agent的边界。

一个像样的软件工程任务，往往要拆成需求理解、资料检索、架构设计、代码实现、测试验证、结果审查。不同环节要的能力并不一样——有的擅长规划，有的擅长写码，有的擅长挑错。继续让一个Agent全包，它就会膨胀成一个巨大的prompt和一个越来越混乱的上下文窗口。

于是有了**Agent Cluster**：让Planner、Researcher、Coder、Reviewer、Executor、Memory Agent各司其职，围绕一个复杂目标协作。多个专业Agent围绕共享的Session协作：各自读取当前状态、完成局部任务、把结果写回，供下一个Agent接力。

可一旦真把它跑起来，难题就冒出来了：这些Agent怎么共享上下文？某个结论到底来自哪个Agent、哪条分支、哪次工具调用？一个Agent出了错，能不能回滚到对应分支重来？

说白了，Agent Cluster真正的挑战，从来都不在「造更多Agent」——难的是**管住这些Agent之间的状态怎么流动**。

![图片](https://mmbiz.qpic.cn/mmbiz_png/A6fTew8FFGEZBRl8NfZmjic1QN5AmHibic8gbuYic9heOp11vz7QLDTI91WURH3VMGBtDZX6BkpCTF7N2M908Q2sOeG4fkdwsoENSthM7dJEYws/640?wx_fmt=png&from=appmsg)

## 和AutoGen、LangGraph比，OpenRath多问了一句

多智能体这个词，常让人想到一个群聊：一个Agent提议，一个批评，一个执行，一个主管决定什么时候收尾。这个模式有用，但不够。

这条路上已经有不少工作：**AutoGen**把多Agent对话做成了一个实用的编程模型；**CrewAI**把Agent团队和更结构化的流程分开；**LangGraph**用图状态和supervisor节点来表达路由与控制。它们都解决了**Agent之间怎么说话**。

OpenRath接着往下问了一句：**Agent们说完话之后，谁来拥有这份工作的状态？**

一个生产级的Agent Cluster，需要决定：当前这个Session该交给哪个Agent、它该看到什么上下文、读了哪些记忆、下一条命令在哪个沙箱跑、继续之前需要什么校验信号。这些都是**控制平面**的问题，靠往群聊里再加一个角色是解决不了的。

OpenRath的答案是：让Session成为路由的单位，让Session Graph成为那张控制平面——Agent、工具、工作流、记忆、沙箱位置，都在这张图上交汇。

一句话：**Agent集群不是群聊，而是建立在持久Session状态之上的运行时控制平面。**

从**Agent数量×Session数量**两个维度看，多智能体系统会分成四象限：单Agent单Session是ChatGPT式聊天；多Agent单Session是子代理协作；单Agent多Session是OpenClaw式分支扇出；而**多Agent多Session（MAMS）**，正是OpenRath面向的方向。

它的判断很干脆：真正需要被fork（分叉）、merge（合并）、复用、追踪的，是整条Session数据流——而非某个Agent内部那份各自维护的消息列表。

换个说法：**大多数框架攒的是一屋子聪明的工人，OpenRath先把工位、工单和流水线建好。** 用官方那句话说就是——Agent是工人，Session才是工作本身。

![图片](https://mmbiz.qpic.cn/mmbiz_png/A6fTew8FFGF6EluarcdFDCd5GqAdEsic5jzIwHDg1aWatG6c7t1ic8hKR0rPpfTvXWw2QgzicbznoU7jDwJn2Bo9o5vDCjCqlVgcTwEW8dAknQ/640?wx_fmt=png&from=appmsg)

## 像PyTorch一样搭Agent集群：从深度学习借来的三招

OpenRath最聪明的一步，是把深度学习开发者最熟的那套抽象，整套搬到了Agent系统上。

PyTorch为什么好用？因为它把复杂计算拆成了清晰的积木：Tensor是流动的数据，Module/Layer是变换这份数据的可组合单元，device决定算在哪，而整张计算图是**跑起来才长出来的**。OpenRath给Agent系统做了几乎一一对应的映射：

核心映射：Tensor→Session、Module/Linear→Workflow/Agent、Device→Sandbox/Backend、Parameter→Memory、Function→Tool、控制流→Selector。

![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/A6fTew8FFGET6G8QpxJUwf7lfzbYhYCpR9aCic5TXde4ZoczFeWFIXVoAZjdZDzBibic1c1rZr4VsicVFtZzSnwXjep5kBxoxtL2zbox5JrJfCY/640?wx_fmt=png&from=appmsg)

#### 支柱一：Agent是变换层，不是全能助手

PyTorch里，nn.Linear不是一个应用，它只是一层变换：吃进一个Tensor，吐出一个Tensor。

OpenRath把Agent设计成了同一种东西。Agent就是Session上的一层变换，核心就是一条forward(session) -> session的路径：进来一个Session，出去一个Session。

变换层不止一种。同样是forward(session) -> session这个形状，可以装下完全不同的活儿：

- 一个Agent调工具、改workspace里的文件，把执行结果写回Session
- 一个Compressor把跑了几十轮的长会话压缩成一条精简消息
- 一个Agent在跑之前recall记忆、跑之后commit记忆，相当于给这次会话做了一次「索引与归档」
- 你也可以写一个只做摘要、只做校验、只做改写的Agent

它们对外都是同一个接口，于是能像神经网络的层一样**任意堆叠、任意嵌套**。这正是Workflow（对应nn.Module）的意义：子类只要实现一个forward(session) -> session，里面就能串联多个Agent、fork Session、压缩上下文、调用工具、分发到子工作流。

**管上百个Agent，于是从拼提示词变成了搭模块。** Layer不持有数据，数据是Tensor；Agent也不持有状态，状态是Session。

至于工具本身，OpenRath抽象成了FlowToolCall：一手攥着给模型看的name/description/JSON schema，一手攥着真正在Python里执行的行为，让**工具长什么样**和**工具干什么**始终待在一起。内置了文件、shell、代码执行工具，stdio的MCP工具也能直接适配进同一个循环。

#### 支柱二：Sandbox与Memory是可插拔后端

PyTorch第二个聪明的地方，是把「算在哪」从「算什么」里剥了出来。同一份模型代码，.to("cuda")就上GPU，换个后端就换块卡，计算逻辑一行不用动。

OpenRath把这个思想用在了两个最容易被写死的地方：**执行环境**和**长期记忆**。

**Sandbox（对应Device）——工具到底在哪运行。** 很多框架把「对话历史」和「工具实际执行的位置」分开管，模型以为自己还在某个工作区，shell或容器其实早就切走了。OpenRath把Sandbox绑在Session上：工具跑在Session当前的backend上，返回的Session会记住自己的执行位置，不会悄悄漂移。

它真正的巧思，是**把Sandbox做成了可插拔的backend**：本地进程始终可用（session.to("local", spec="./")），容器化的OpenSandbox是可选项（pip install "openrath[opensandbox]"），未来任何第三方执行后端，只要接到同一套Session placement模型后面就能用。

**Memory（对应Parameter）——跨运行保留的记忆。** 它是独立的一层持久状态，能绑定到Agent、运行前recall、运行后commit；既不像工具结果那样用完即弃，也不只是塞进prompt的几行文本。基础安装自带零依赖的本地后端，把数据存在.openrath/memory/，不用LLM也能做BM25词法检索；配了embedding就能用向量排序；想要更强的，可以接OpenViking这类外部记忆服务。

这一招对**自带本地状态**的团队尤其友好：你已经有自己的容器调度、有自己的向量库或知识库，不必推倒重来，只要把它包成一个backend接进去，就能复用OpenRath的整套Session/Workflow抽象。

#### 支柱三：Session Graph是动态图，完全为Agent Cluster而生

PyTorch还有第三个让人上瘾的设计：**动态图（define-by-run）**。它不要求你先把整张计算图画死再喂数据，而是代码跑到哪、图就长到哪。控制流就是普通的Python if/for，灵活到可以在运行时根据中间结果改变走向。

OpenRath的Session Graph，是同一个性格的东西。先看Session长什么样——它远不止一串聊天记录，而是一张结构化的**chunk表**：

![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/A6fTew8FFGFB5WQuq3iaLibKC4ICibYTnCB7hrwyXknMKiaaQGhP9ob2sglZPyqvSEibyRGtO3rfzeSfA0e1hR3E6ic6pjlibWoiajARRW7LPJXjy7w/640?wx_fmt=png&from=appmsg)

它能fork出分支，能detach切断父链，能merge合并，还能序列化成JSONL直接交给下一个Workflow。而这张由fork/merge织出来的图，是Agent们跑起来、一步步演化出来的，并非事先画死的剧本——这正是「动态图」的含义。

为什么这件事对Agent Cluster是决定性的？因为集群规模一大，你迟早要回答：这个结论到底是哪个Agent、走哪条分支、调哪次工具、在哪个workspace产出的？散落的日志答不了，一张带血缘的动态图能答。Session Graph于是从**实现细节**升格成了集群的**可观测层与控制层**：路由、复现、回滚、审计，全在同一张图上做。

![图片](https://mmbiz.qpic.cn/mmbiz_png/A6fTew8FFGHD58d3rBDog9y6bDxWJGyiceLKwzpRew8wSW7eibqaFymR2gpQ3BrOPHnhCm8Jrq6ygThnEMnuKa2fIfntJZEy0xygN48sqcs3g/640?wx_fmt=png&from=appmsg)

## 几十行，把这套东西跑通

抽象讲再多，不如看一段能跑的代码。下面这个最小例子（取自官方README），把Session、Sandbox、Tool、Agent、Memory、Workflow、Compressor一次性串了起来：

![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/A6fTew8FFGHcyicMVL0HCghFRsFY8URQRWllEVXP2djelrXpqYia59EWBjYqBRWu20xXibZeqG5XMNlWXlCKGEibI0iaZ4sAia6eLg7WAh72vdKkA/640?wx_fmt=png&from=appmsg)

读这段代码，三根支柱全在里面：数据是Session，执行位置由.to()决定（支柱二），agent和compressor是两层不同的变换叠起来（支柱一），而它们怎么串、串几层，是forward里用普通Python写出来的（支柱三）。每一步进出，都是同一个Session。

## 真正动态的地方：Selector

上一节的forward是写死的顺序。但真实任务往往要等跑起来才知道该往哪拐——这时候就轮到动态图的「运行时路由」登场。

很多框架的做法是把流程提前编排死：if走A，else走B。OpenRath的答案是**Selector**：一个由大模型驱动的路由器。它在若干个「会自我描述」的Workflow之间做选择，返回下一个该跑的Workflow，任务结束就返回一个空操作。妙处在于——它让Agent之间的if/while，依然是普通的Python：

selector = flow.Selector(provider)while not isinstance(nxt := selector.forward(session, triage, tech, wrapup), flow.EmptyWorkflow):session = nxt(session)

**把流程写进提示词，是把不确定性焊死；交给Selector，才是让系统学会拐弯。** 这也正是官方把OpenRath称为「dynamic multi-agent workflow」的底气：流程从写死的剧本，变成了运行时才定下来的路由——和PyTorch动态图里「代码跑到哪、图就长到哪」是同一种自由。

## 它现在到底能不能用

最能说明问题的是它的example/目录——一条编号递进的学习阶梯，每个脚本只讲一个概念，前一个的产出正好是后一个的输入：

- 01_hello_agent最小程序，构造Agent、在Session上调用、流式输出
- 02_session_lineage用fork分叉、detach切断血缘、查看session graph、导出JSONL
- 03_sandbox_backend把同一个Session放到local或opensandbox，看工具在哪执行
- 04_tools_builtin / 05_custom_tool / 06_mcp_tool：内置工具、自定义工具、借用MCP工具
- 07_streaming / 08_compress / 09_memory / 10_provider_variation流式、上下文压缩、记忆、换模型厂商
- 11_dynamic_selector用Selector做if分支和while循环

从「先让一个Agent跑起来」到「让一群Agent动态协作」，11步走完，OpenRath的核心也就理解透了。安装分层：

基础pip install openrath

要容器沙箱加[opensandbox]

要外部记忆加[openviking]

模型则走OpenAI兼容的环境变量或~/.openrath/config.json

更值得说的是这套example的设计取向：官方强调，例子的目标是产出一份「证据档案」，而不是一张截图。一个软件任务跑完，理想的产物不该只停在一句「成功了」，而该是一整份可回溯的卷宗——

issue原文→Session Graph→调了哪些工具→副作用落在哪个sandbox→被否决的那条分支→最终采纳的补丁→测试结果→这次往Memory里写了什么。

这份卷宗，正是「一个demo」和「一个能拿来做技术报告的运行时」之间的区别。按团队自己的说法，他们在内部已经用OpenRath组织起接近Transformer结构的Agent Workflow——不过这更偏系统能力验证，还不是公开benchmark，这点他们说得很坦白。

## 从持久Session，到Agent Cluster

把视野拉远一点：OpenRath的版本演进本身就是一条干净的线。

v1.1解决「持久」——如果一个Agent的工作是跨时间展开的，凭什么唯一被保存的只有最终答案？于是有了持久Session，把干活的证据完整留下。

v1.2再抬高一层：让Session从「单个Agent事后可查的记录」，升级成「**能在多个Agent和工作流之间被路由的对象**」。一行代码就概括了这个转变：

session = workflow.forward(session)

它意味着，工作的单位从一个prompt、一个答案或一个Agent角色，挪到了一份**持久、可路由的Session状态**上。

## 从Prompt工程，走向系统工程

OpenRath的意义，不只是「又一个Agent框架」。

它真正想解决的是：当Agent Cluster成为主流形态，开发者能不能像写深度学习那样，获得一套可组合、可追踪的工程体验。这正是它借PyTorch之名的底气——同一套直觉迁移了过来：**层是变换（Agent），device可插拔（Sandbox/Memory backend），图是动态的（Session Graph）**。

在PyTorch里，你定义Module，让Tensor在网络中流动；在OpenRath里，你定义Agent和Workflow，让Session在系统中流动。剩下的——血缘记录、工具调度、沙箱绑定、长期记忆、动态路由——交给框架。

如果说过去的Agent框架面向的是「一个智能助手」，那么OpenRath面向的是「一个智能体系统」。

而这件事的起点，朴素得有点反直觉——

**不是再多造一个Agent，而是先把Session当回事。**

官网：https://www.openrath.com/文档：https://docs.openrath.com/博客：https://blog.openrath.com/GitHub：https://github.com/Rath-Team/OpenRath

**一键三连**「点赞」「转发」「小心心」

**欢迎在评论区留下你的想法！**

— 完 —

我们正在招聘一名眼疾手快、关注AI的**学术编辑实习生** 🎓

****

**🌟 点亮星标 🌟**

