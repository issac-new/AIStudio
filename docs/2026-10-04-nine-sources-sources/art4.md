---
title: "Claude Code Mods：界面与行为，由你定义"
account: "深夜开发者LND"
publish_time: "2026/10/02 16:31:08"
url: "https://mp.weixin.qq.com/s/TGkSiErwW1RqbmRys2PvjA"
---

# Claude Code Mods：界面与行为，由你定义

# Claude Code Mods：界面与行为，由你定义

![img](https://mmbiz.qpic.cn/sz_mmbiz_png/oIQL0FjlVPNl2VstibVaOgg5kAOIicpA7I4pOHrQt39uuYpRlf9cUshsqq6vqy0JgkHuRFPa1u9ZPSvyMKXqg6UJ5s03tIrD3fm20IGdFKdFk/640?wx_fmt=png&from=appmsg)

用 Claude Code 做 AI 编程时，你只让它改一个地方，它忙了一阵，说“完成了”。但它到底动了哪些文件，有没有顺手改到别处？
如果旁边有个小窗口，能把刚才的修改一条条列出来，检查起来就方便多了。
**发现工具缺一个小功能，不一定只能等官方更新。你可以把需求告诉 Claude，让它帮你做出来。**
Mods（模组），就是给 Claude Code 加功能的小程序，通过插件的方式加载。像给游戏装 Mod，增加道具、调整玩法，你也可以给这个助手加面板、加按钮，或在某一步操作前加一道检查。
Skills（技能）偏向提供办事方法；Mods 则能把你需要的显示和操作做进工具里。
先看一个开发者的动画案例，再看三个官方例子，判断自己用不用得上。想动手，后半篇再跟着做一个。本文依据 Anthropic 在 claude.dev 发布的 Mods 教程整理。配图包含官方页面截图与中文译注，社区视频为作者演示；本文尚未亲自实测。

## 把等待的小转圈，改成实时小动画
X上的开发者 Anshu 做了一个有趣的 Mod：把 spinner（等待动画）变成了像素小剧场。
作者介绍，他通过和AI对话写出了这个模组，让它观察主代理正在做什么，再用 Sonnet 5.5 把工作状态变成小动画。视频中，上方是读文件、排查问题的记录，下方的像素角色、场景和文字提示随过程变化。
**这比“加一个按钮”更直观：你可以按自己的想法，重新设计终端怎样展示工作过程。** 模型名称与实现方式来自作者自述，本文未复现。
Anshu的Spinner演示视频
作者演示，约1分51秒，无音轨。重点看下方动画如何跟着任务变化。

## 改完以后，一处一处看它动了哪里
开头说的小窗口，官方已经给了一个例子：Replay Theater，可以理解为“修改回放”。它记录这一轮的文件修改，让你按顺序查看：第一步改了哪里，原来是什么，现在变成了什么。
如果你的需求是“只改这个地方”，它能帮助你检查有没有改到别处。已经习惯原有代码对比工具的人，不必为了新鲜换一套。这里的“回放”是查看记录，不是自动撤销。

![img](https://mmbiz.qpic.cn/sz_mmbiz_png/oIQL0FjlVPNibSic2tLN34W6UN5ick9rS1icNvE3HS4WSlUDlpmicv8dVMueUZceAeUwtC4FjkWoeeGfJniaQhGlUPv06qAMbXaRZzEzibNoADk4I8/640?wx_fmt=png&from=appmsg)

看红绿两行：同一处调用从 greet 改为 welcome。

## 删文件之前，先把清单摆出来
屏幕上出现一串删除命令，你可能不知道点了“允许”后，哪些文件会消失。
官方的 Blast Radius，会在识别到某些删除、重置操作时先停下来，把可能受到影响的文件展示出来，再由你决定继续还是取消。
这就像确认付款前先看一遍账单。它更适合经常让 Claude 批量处理文件，却不熟悉命令的人：**先看清楚要动什么，再点确认。**
不过，官方也说明，这个例子只识别特定命令，藏在脚本里的操作可能漏掉。因此它只是多一道提醒，原来的权限设置仍要保留。

![img](https://mmbiz.qpic.cn/mmbiz_png/oIQL0FjlVPP8T6JYLG7Stke0nr5wMDkU3YlPbLLfuAGJs96whaJpsNc5AGPCU1aDmpWjliaW0S6ZotsbCL4y9DQMNzbnq1a69MMcfbODVZS8/640?wx_fmt=png&from=appmsg)

官方页面展示受影响文件列表，以及“继续”和“取消”两个选项。

## 给它装个仪表：这次对话带了多少资料
你让 Claude 读文件、连续聊几十轮，这些回答时一起参考的材料，占用的就是“上下文”。它像一张有容量限制的工作桌，资料越多，占用越高。
官方的 Token Weather，做的就是一个小仪表。它在输入框上方显示占用百分比，以及最近几轮增加了多少。随着占用上升，图标从晴天变成阴天、下雨。
长时间围绕一个项目工作、不断加文件时，它能提醒你留意材料是不是越堆越多，考虑先整理阶段结果。只问几个短问题，就未必需要它。
**数字显示的是占用多少，不代表 Claude 理解得有多好。** 不必看到某个百分比就急着重开对话。

![img](https://mmbiz.qpic.cn/sz_mmbiz_png/oIQL0FjlVPMKD2bTQlIv0wGcyhiaANFWockXOVcKFicylFaBLCvkStAWCVuNxoyJju3JXmu4J9UdBmmPTOFkk7AQSst0r1sKPBKCJuU9lUrBg/640?wx_fmt=png&from=appmsg)

看彩色状态行：81%对应161.1k / 200k；这些数字表示容量占用，不是回答质量。

## 想动手，再做一个上下文看板
上面三个官方例子，一个帮你查改动，一个帮你在执行前看清影响，一个让工作状态更直观。读到这里，已经可以判断 Mods 对自己有没有用。
想试着做一个，先选只显示信息的小仪表，容易检查效果。下面固定用 **Claude Code终端版，保存路径以macOS为例；**指令发给Claude Code，不是Claude网页聊天框。

![img](https://mmbiz.qpic.cn/mmbiz_png/oIQL0FjlVPNRdib6ibFukTOgy5ibtPTaqCRFMFqI2YaBk7Ur4GwLovv41KIaBRAQWoRZRXygE7R71DYZ6zicsJegoibp5C9WhPkTBV2HXFEv2dHY/640?wx_fmt=png&from=appmsg)

流程示意：先核对真实数据，保存后还要在新会话中重新加载。
**第一步，检查版本并启动。** 打开“终端”，执行：

claude --version
官方教程要求2.1.287或更新版本。版本不够，先按原来的安装方式更新；这一步以已有可用账户和环境为前提。然后输入 `claude，`进入对话。
**第二步，用提示词说清楚要做什么。** 把下面这段需求发给它：

> 请帮我做一个叫 token-weather 的 Claude Code Mod，作为上下文看板。
放在输入框上方，用一行显示上下文使用量、总容量、占用百分比，以及相对上一轮的变化。用中文标签，每轮回复结束后更新。
数据从当前版本的真实会话用量接口读取，不估算、不填演示数字。
只在独立的模组目录创建所需文件，不修改现有业务文件，不改变工具权限，不上传数据。先说明文件位置，再按官方方法临时加载。

按照官方快捷方法，Claude 会询问是否开启“热重载”，也就是改完自动更新，不用重启。确认这次要加载的模组后再允许；提示词里的限制也要落实到它实际创建的文件和代码中。
**第三步，检查结果。** 输入框上方应出现一行使用量和百分比。再聊一轮，让它说明读数来源，并给出本轮读到的原始数值，与看板对照；已有状态栏时，也可对照同一轮的数据。
两轮数字接近，可能只是显示时做了取整，不必直接判定失败。重点看有没有读取真实数据、单位是否一致，以及是否在每轮结束后刷新。如果没出现，把加载报错交给它修正。
**第四步，保存，下次继续用。** 临时模组之后可能被清理。确认满意后，继续告诉Claude：

> 把这个模组的完整目录复制到我的用户主目录下 claude-mods/token-weather，保留内部结构。如果目标目录已存在，先告诉我，不要覆盖。完成后给我实际保存路径，并检查它能否作为插件加载。

保存成功后，结束当前会话。下次在终端执行：

claude --plugin-dir "$HOME/claude-mods/token-weather"
`$HOME` 代表你的用户主目录。如果实际保存位置不同，就替换引号里的路径。这种方式每次启动时明确加载，不需要发布到插件市场。**新会话里再次出现看板，才说明“保存再用”这一步完成了。**

## 从一个问题开始就够了
Mods 更适合已经在用 Claude Code，而且能说出一个具体不顺手之处的人。原有功能够用，就不必加；新模组确实解决了问题，再考虑长期保留。
模组能接触工作内容和文件，来源要可信，工具更新后也可能需要跟着调整。
**先找到一个你反复觉得不顺手的地方，再让 Claude 帮你补一个小功能。** 它不只是在替你完成任务，也可以帮你把手里的工具改得更合用。

![img](https://mmbiz.qpic.cn/mmbiz_png/oIQL0FjlVPN8M4AxK3wLWIXd0FMxSVIxVQ2ia4ia1E5lkonEBhrMRfO45xmsc4t6jmF0lwlR5nfvibicJPU1oDRHZdllw2KBIUPlA1ujibxSPvd4/640?wx_fmt=png&from=appmsg)

使用判断示意：从一个具体问题开始，有用再保留。
如果这篇对你有用，点个赞，也欢迎关注「深夜开发者」。
我先踩坑，你少走弯路。后面继续聊这些 AI 工具怎么用到真实工作里。
