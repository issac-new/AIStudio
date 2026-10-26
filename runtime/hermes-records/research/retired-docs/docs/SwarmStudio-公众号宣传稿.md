# 一个驾驶舱，统御你的全部 AI 协作力 —— SwarmStudio 正式发布

> 当 AI Agent 多到需要被"管理"而不是"对话"时,你需要的是一个驾驶舱,不是又一个聊天框。

---

## 写在前面

**Hard times create human code, human code create AI times, AI times create weak men, and weak men create hard times.**

这是一个属于 AI 的时代。但当你在 5 个终端里同时跑着 Claude Code、在 3 个浏览器标签里开着不同模型、在 2 个项目里和人类伙伴协同推进——混乱就开始了。

**人类协作伙伴、本地 Agent 集群、人机协作**,这三类工作今天终于被统一在了一个桌面应用里。

它叫 **SwarmStudio**。

- 100% 由 AI 编写,不包含任何人类代码
- Apache 2.0 协议开源
- 基于成熟上游 hermes-studio 二次开发,上游源码始终保持纯净、可独立升级

---

## 它是什么

SwarmStudio 把「人 + Agent + 协作」三类工作,统筹进一个 **Cockpit(驾驶舱)**:

> 既有突出重点的全貌概览,又可针对具体任务接入,进行**补充 / 评估 / 决策 / 审批**。同时提供协作看板、Matrix 即时通讯、运行全过程可观测性等能力。

一句话:**满足 AI 协同的组织发展需要。**

---

## 六大工作区,一图一流

打开 SwarmStudio,登录后的首页就是 Cockpit。三段联动式布局:全貌 → 聚焦 → 处理。我们逐一走一遍。

### 💬 沟通区 —— 人类伙伴与 AI 在同一张画布上对话

![沟通区](https://github.com/user-attachments/assets/786c5b94-1d63-4179-82c3-8f9946ffa420)

左栏 Kanban 统筹入口按优先级聚合三类工作;中栏协作图用图谱画布呈现并行 / 派生 / 收敛;右栏是工作区重心,衔接 Claude Code 与提交。**重心始终在右栏**,注意力条只在需要你时轻轻提醒。

### ⌘ 编码区 —— 同一任务,多视角处理

![编码区](https://github.com/user-attachments/assets/85f568fe-57f4-4a49-83a9-48496b5aefa6)

模式切换是这个产品的灵魂之一:**⚡ 工作项 / 💬 协作 / ⌘ 编程**,同一件事可以切到不同视角推进。写代码时是 IDE 感,切到协作视角就是对话流,切到工作项视角就是看板卡。

### 🗂 工作区 —— 文件、表单、A2UI 一站式

![工作区](https://github.com/user-attachments/assets/71136468-70f8-4cb2-b7bb-c25978fdfb0a)

A2UI 表单 + 文件资源管理器,底部直接衔接 Claude Code / 提交。**不用在文件管理器和终端之间反复横跳了。**

### 📅 日程区 —— 把 AI 协作纳入时间轴

![日程区](https://github.com/user-attachments/assets/4827c359-09bb-4052-9eb1-2696061c3e2d)

日程不是孤立的待办列表,而是和任务、协作、Agent 运行轨迹联动的——某天的某个日程,背后可能挂着一个 agent 集群的完整运行证据。

### 📋 看板区 —— SwarmKanban 协作看板

![看板区](https://github.com/user-attachments/assets/bf5293b0-374a-4a7a-92a1-645d87775cbe)

独立路由 `swarm-kanban`,14 个自定义组件,与上游原生看板并存。看板列 / 任务卡 / 任务抽屉 / 任务表单 / 内联创建 / 批量操作栏 / 编排面板 / 诊断区,该有的都有。Markdown 渲染、附件管理、多租户隔离一应俱全。

### 🔭 观测区 —— RunTraceView,把聊天流重构成证据图

![观测区](https://github.com/user-attachments/assets/621e63d7-8e94-4e3e-ade2-f647e863020c)

**这是 SwarmStudio 最硬核的能力之一。**

线性聊天消息流被重构成 **Evidence Graph(证据图)**,多 agent 协作的并行 / 派生 / 收敛一目了然。证据分三层,遵循**不可伪造原则**:

| 层级 | 来源 | 可见性 |
|------|------|--------|
| **L1** | 前端事件流 | 实线,可靠可见 |
| **L2** | 运行时 hook 后补齐 | 虚线 + 推断标签 |
| **L3** | 分布式 trace propagation | 点线 + future 标签 |

ingress / workflow / agent / skill / tool 等 TraceNode 类型,skill 还能下钻展开内部「思维链 + 工具」交错编排。支持 live / replay 两种回放模式,导出对齐 **OpenTelemetry GenAI 语义约定**的 JSONL + Evidence Dossier。

> 第 1 层零运行时改动,纯前端消费已有 Socket.IO 事件流——这意味着你不需要改 agent 就能拿到可观测性。

---

## 视觉哲学:Pure Ink

SwarmStudio 严格遵循 **Pure Ink 黑白灰主题**,仅 status 用 error / warning / success 三色。**避免颜色过载**——在一个信息密度极高的驾驶舱里,每一抹颜色都必须有信息含义。

这不仅是审美选择,更是工程选择:**颜色是信号,不是装饰。**

---

## 完整的 Matrix 即时通讯客户端

不只是"集成了聊天"。SwarmStudio 内置了 **49 个组件**构成的完整 Matrix 客户端,作为 Cockpit 子路由动态注册:

- 房间列表 / 消息流 / 输入 / 上下文菜单 / 消息操作栏
- 文件面板 / 成员列表 / 成员信息 / 邀请 / 转发 / 导出 / 加入 / 离开 / 创建房间
- 群聊未读追踪、自动 join、日期分隔符
- 基于 `matrix-js-sdk`,经 Matrix homeserver 认证

配套的还有 Matrix 账号集成:Homeserver URL + MXID + 密码登录、Remember Me 持久化、本地降级、账号设置与用户管理。

**人类伙伴的消息和 Agent 的运行事件,在同一个界面里被同等对待。**

---

## 架构亮点:Overlay 注入系统

SwarmStudio 不是一个 fork 后大改的"分叉泥潭",而是一个**工程上极其克制的 overlay 二次开发层**。

### 核心原则

> 三个上游仓始终保持上游原状,`.git` 永不污染,可独立 `git pull` 升级;所有二次开发代码集中在 overlay 仓。

### A 类 + B 类混合注入

二次开发改动按「是否能纯新增」分两类:

| 类别 | 改动性质 | 接入机制 | 可逆性 |
|------|---------|---------|--------|
| **A 类** | 纯新增文件(组件/store/服务) | 构建期 alias 重定向 + entry shim + 运行时 registry | 零侵入上游 |
| **B 类** | 修改上游骨架(schema/config/路由) | `git apply`(构建期注入) | `git apply --reverse` 完全还原 |

**为什么不全用 A 类?** 因为 ~7 类改动改的是上游骨架(schemas 加列、config 加字段、vite 预打包等),属运行前置条件,无法运行时注册,必须转 patch。这种分类的诚实,正是工程成熟度的体现。

### 功能开关,按需开启

所有自定义功能用 `VITE_*` 环境变量控制,默认全开(向后兼容),可一键关闭:matrixChat / matrixAuth / kanbanEnhancements / branding / cockpit……

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vue 3 + Pinia + Vue Router + Vite + TypeScript |
| UI | Naive UI + Pure Ink 自定义主题 + ECharts |
| 通讯 | Matrix(matrix-js-sdk)+ Socket.IO |
| 后端 | Koa + SQLite |
| 桌面 | Electron |
| 测试 | Vitest(41 个测试文件) |
| Agent | hermes-agent(运行时下载,OpenTelemetry GenAI 语义对齐) |

---

## 规模数字

这不是一个玩具项目。一组数字说明它的成熟度:

- **73** 个 active B 类 patch(100% inject 通过率)
- **94** 个自定义 Vue 组件(Cockpit 27 / Matrix Chat 49 / Kanban 14 / 其他 4)
- **41** 个单测文件
- 上游基础:hermes-studio v0.6.20 / hermes-agent / element-web v1.12.22

---

## 架构与状态转移

如果你想深入理解它的设计,有两张图值得收藏。

**技术架构说明:**

![技术架构](https://github.com/user-attachments/assets/3e41bc6e-7afc-4c2b-b437-404e1f33c629)

**Hermes Agent Kanban 任务状态转移图:**

![状态转移图](https://github.com/user-attachments/assets/f5283991-2a8a-4679-bdf2-a6787f2cec11)

---

## 谁应该用 SwarmStudio

- **AI 协同密集型团队**:Agent 多到需要看板统筹,而不是终端切换
- **需要审计 AI 决策的场景**:Evidence Graph 让每一步 agent 推理都可追溯、可回放、可导出
- **Matrix 生态用户**:人类协作伙伴和 Agent 在同一个 IM 里
- **想体验"驾驶舱式"AI 协作的开发者**:三段联动布局,从全貌到处理一气呵成

---

## 快速开始

SwarmStudio 桌面端当前版本 **0.6.20**,已提供 macOS 与 Windows 两个版本构建物。

```bash
cd overlay

# macOS 版(arm64 DMG + zip)
npm run build:dmg:mac

# Windows 版(x64 exe + zip + msi)
npm run build:dmg:win
```

如果你只想运行上游原版,也可以直接用官方命令:

```bash
pip install hermes-agent[all]
npm install -g hermes-web-ui
hermes-web-ui start
hermes --tui
```

> 注:上述是上游官方用法。SwarmStudio 二次开发版需经 `npm run inject` 注入后从源码构建,详见仓库 README。

---

## 写在最后

我们正处在 AI 协作方式被重新定义的拐点。**工具的形态,决定了协作的效率。**

SwarmStudio 的答案很朴素:不要更多聊天框,要一个驾驶舱;不要更多终端,要一张证据图;不要更多切换,要一个多视角工作区。

**100% AI 编写,Apache 2.0 开源,从今天起,你的 AI 协作有了一个统一的家。**

---

📎 **项目地址**:基于 [hermes-studio](https://github.com/EKKOLearnAI/hermes-studio) 二次开发的 overlay 层
📖 **设计文档**:`docs/superpowers/`(specs + plans,覆盖 Cockpit、RunTraceView、Kanban、Matrix 集成、overlay 架构)
⚖️ **协议**:Apache 2.0(参考的上游项目运行时部署请遵守其各自授权)

*SwarmStudio —— 把人、Agent、协作,装进同一个驾驶舱。*
