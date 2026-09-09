# Orchestrator Agent Rules for Matrix → Kanban001
# 本文件定义了 orchestrator profile 接收 Matrix 消息后的处理规则
# 放置位置: ~/.hermes/profiles/orchestrator/orchestrator_rules.md
# 
# 生效方式: 在 orchestrator profile 的 config.yaml 中通过 agent.environment_hint 引用
# 或在 orchestrator agent 的系统提示中注入此规则
#
# ⚠️ 适用范围: 本规则仅对 **Matrix Gateway** 消息生效。
#    来自 TUI/CLI 的消息不走 Kanban，由 orchestrator 直接执行（见 SOUL.md 平台路由规则）。

---

## 全局强制规则：编码开发必须通过 ACP 调用 Claude Code

> 详见 `~/.hermes/profiles/_shared/03-evolution-memory/action-risk.md`（2026-08-21 勘正：SOUL.md 顶部无此章节，正文在共享文件）。本节不再重复，以下仅保留故障处理补充。

### 故障处理
ACP 连续两次故障 → `kanban_block(kind="dependency", reason="ACP provider 持续故障")` 并退出。

---

---

## 0. 平台路由规则

> 详见 `SOUL.md`「Platform routing rules」和「TUI/CLI routing」。以下仅补充 rules 特有内容。

### 0.1 Email 全局规则

> ⚠️ **最高优先级**: orchestrator **不自动处理、不自动回复**两个邮箱的邮件，除非用户明确要求。

- `your@example.com` — IMAP channel（gateway 原生 email adapter）
- `your-bot@example.com` — agently-cli（agent.qq.com OAuth）

**"明确要求"判定**：
- ✅ 用户在 TUI/CLI/Matrix 中直接说"检查邮件""读邮件""回复xxx的邮件""发邮件给xxx"
- ❌ cron job 触发、邮件到达通知、其他 agent 转发的邮件摘要 — **不构成明确要求**

详见 `email_kanban_rules.md`。

### 0.2 智能路由规则（所有 Gateway 平台）

> ⚠️ **口径镜像**：本节分级数字是 SOUL.md「智能路由留痕」表的镜像——**正典在 SOUL**，改阈值只改 SOUL，然后同步本表（`routing_threshold_check.py` 会机械校验两处一致，漂移即报警）。

> **适用**: 所有 Gateway 渠道 — Matrix、Weixin、API Server、Email
> **不适用**: TUI/CLI（始终直接执行，不创建看板任务）

> ⚠️ **与 SOUL.md 顶部强制规则联动**: SOUL.md 顶部的「智能路由留痕」强制规则定义了**量化触发条件**（工具调用次数/文件写入次数），本节定义路由判定标准和留痕方式。两者共同构成完整的智能路由执行链。**量化触发条件优先于下表的主观判定标准**。

#### 路由判定标准

| 复杂度 | 判定标准 | 处理方式 |
|--------|---------|---------|
| **轻量** | 工具调用 ≤2 且 文件写入 =0 | 直接执行，不创建看板任务 |
| **中等** | 工具调用 3-5 或 文件写入 1-2 | 直接执行 + 轻量留痕（§0.2.1） |
| **重型** | 工具调用 ≥6 或 文件写入 ≥3 或 涉及研究/编码/安全/部署 | 走完整看板流程：§0.5 board 路由 → `kanban_create(triage=True)` |

#### 0.2.1 轻量留痕机制

对"中等"复杂度的消息，执行完成后**立即**:

1. `kanban_create(title=<10-20字摘要>, assignee="orchestrator", board="swarm", initial_status="running", tenant=<platform tenant>)` — 创建任务
2. `kanban_complete(summary=<1-2句执行摘要>, metadata={"platform": "<platform>", "action": "<操作类型>"})` — 立即标记完成

**效果**: board 上显示 `done`，有完整追踪记录（时间、内容、结果），不引入 triage/dispatch 延迟。

#### 0.2.2 Tenant 格式（全平台统一语义）

所有 Gateway 平台使用统一六段式 tenant，**六段语义跨平台严格对齐**：

```
<chat_name>:<topic>:<user_id>:<chat_id>:<session_id>:<platform>
```

**平台字段映射表**:

| 段 | 语义 | Matrix | Weixin | API Server | Email |
|----|------|--------|--------|------------|-------|
| 1 chat_name | 会话/上下文名称 | 群聊显示名；DM 留空 | 群聊名；私信用 OpenID 前缀 | API 路径或客户端标识 | 发件人显示名；无则用邮箱 |
| 2 topic | 话题/主题 | `**Channel Topic:**` | 群聊话题；无则留空 | 请求路径摘要 | 邮件主题（去 `Re:`/`Fwd:` 前缀） |
| 3 user_id | 发送者标识 | `@user:homeserver` | OpenID 或 weixin user id | API key 名称 / 调用者标识 | 发件人邮箱地址 |
| 4 chat_id | 会话标识 | room_id（**去 homeserver 后缀**） | 群聊 ID；私信用 `weixin-dm` | 请求 ID / 会话 ID | 收件人邮箱地址 |
| 5 session_id | 消息标识 | event_id / thread_id | msg_id | request_id | message_id（agently `msg_xxx` / IMAP UID） |
| 6 platform | 固定后缀 | `matrix` | `weixin` | `api_server` | `email` |

**提取规则**:
- 段 1-2：从 `**Source:**` 和 `**Channel Topic:**` 提取；**无则留空**，严禁从消息内容推断
- 段 3：从 `**User:**` 或 `**User ID:**` 行提取，**严禁**从消息体或 `msg=...` 前缀解析
- 段 4：从 `**Source:**` 中提取会话标识并做平台特定处理（Matrix 去 homeserver 后缀）
- 段 5：各平台消息/事件唯一标识
- 段 6：固定平台后缀

**DM（私聊）场景统一格式**:
```
<platform>-dm::<user_id>:<chat_id>:<session_id>:<platform>
```
- 段 1（chat_name）和段 2（topic）在 DM 场景均留空
- 适用于 Matrix 私聊、Weixin 私信、API Server 单调用、Email 单对单

**群聊场景统一格式**:
```
<群聊名>:<话题>:<user_id>:<chat_id>:<session_id>:<platform>
```

**各平台示例**:

| 平台 | 场景 | Tenant 值 |
|------|------|-----------|
| Matrix | 群聊（有名+有话题） | `跨团队协作群01:记忆服务讨论:@testuser3:!<matrix-room-id>:$<event-id>:matrix` |
| Matrix | 群聊（有名+无话题） | `跨团队协作群01::@testuser3:!<matrix-room-id>:$<event-id>:matrix` |
| Matrix | 私聊 | `matrix-dm::@testuser3:@testuser3:$eventId:matrix` |
| Weixin | 群聊 | `技术交流群:API重构讨论:oWxn4S1uW3:gh_abc123:msg_001:weixin` |
| Weixin | 私信 | `weixin-dm::oWxn4S1uW3:weixin-dm:msg_001:weixin` |
| API Server | 调用 | `chat/completions:summary-request:api-key-prod:req_abc123:req_001:api_server` |
| Email | 收到邮件 | `张三:项目报告:zhangsan@example.com:your@example.com:msg_xxx:email` |
| Email | DM 本质 | `email-dm::zhangsan@example.com:your@example.com:msg_xxx:email` |

#### 0.2.3 重型任务路由

判定为"重型"时，按 §0.5 Board 路由规则确定 board（swarm/hack/product/ops），然后:

```python
kanban_create(
    title=<消息摘要>,
    body=<完整任务描述>,
    board=<§0.5 判定结果>,
    tenant=<platform tenant>,
    workspace_kind="worktree",
    triage=True
)
```

回复用户: "已创建任务到 {board}: [task title]。任务完成后会在此收到通知。"

**gate 读取义务（2026-08-22，融合自 Anthropic AI-Native SDLC Playbook L532-540）**：
- orchestrator 分解前**必读卡 body 全文**（含验收标准 frozen 段 + 技能路由决策段）——"下一阶段以读取上一产物开始"，不读卡就分解 = 违规
- 重型任务要求 worker 开工时落 plan.md（四节结构见 dod-checklist），Proof 节在完成时并入 kanban_comment 验证段

---

## 0.5 Board 路由规则（七看板统一调度：swarm/hack/product/ops/[已移除]/platform/[已移除]，2026-08-21 对齐实机）

### 域景

系统当前有七个业务看板（swarm/hack/product/ops/[已移除]/platform/[已移除]，另有 default/kanban001 遗留非业务板），由 orchestrator 统一路由；实机 27 profile（2026-08-21 对齐）：

| 看板 | slug | 用途 | profile_scope |
|------|------|------|---------------|
| **协作看板** | `swarm` | 常规软件开发、架构设计、测试、部署（RA/architect/PM/deployer/reviewer 已降级为 skill） | orchestrator, worker-coder, worker-researcher, worker-tester |
| **Hack看板** | `hack` | 网络安全攻击/防御事件专用（C2/weapons 已合并到 exploit） | orchestrator, hack-recon, hack-exploit, hack-forensics, hack-auditor |
| **产品看板** | `product` | 产品管理、用户研究（prioritizer/feedback 已合并到 manager） | orchestrator, product-manager, product-researcher |
| **运维看板** | `ops` | SRE、事件响应、DevOps自动化、评估（exec-summary 已降级为 skill） | orchestrator, ops-sre, ops-incident-commander, ops-devops, ops-eval |
| **[已移除]看板** | `[已移除]` | 电子设计自动化：AI模型、IP核、物理建模、工具链（multiphysics/optics 已合并到 physics） | orchestrator, [已移除], [已移除], [已移除], [已移除] |
| **平台看板** | `platform` | 平台双螺旋：skill 挖掘、ontology 维护（tool-builders 已合并到 miner） | orchestrator, platform-skill-miner, platform-ontology-curator |
| **[已移除]教育看板** | `[已移除]` | 特级家庭教师团队：儿童教育、学科启蒙、品格培养 | [已移除]-orchestrator, [已移除], [已移除], [已移除], [已移除], [已移除], [已移除] |（2026-08-21 补 [已移除]，与实机 6 师一致）
| **支付看板** | `pay` | 支付清算域：报文标准、清算架构、金融科技合规（2026-09-03 上线） | pay-orchestrator, pay-infra, pay-clearing, pay-fintech |
| **AI前沿研究看板** | `aiteam` | AI 前沿研究：架构（Transformer/SSM/Mamba/MoE）、多模态、具身智能、训练工程、情报监测（2026-09-03 上线） | aiteam-orchestrator, aiteam-architecture, aiteam-multimodal, aiteam-embodied, aiteam-training, aiteam-scout |（2026-09-04 接线）

### 0.5.0 能力组合判定（2026-08-21，融合自麦肯锡能力配置框架）

**路由决策前，先做能力组合判定**（不只是"派给谁"，而是"需要什么组合"）：

1. **拆解任务为能力需求**：这个任务需要什么能力？（编码/调研/安全/部署/评审/外部算力）
2. **判定组合模式**（四选一）：
   - **单 worker**：能力需求单一且某 profile 完全覆盖 → 直接 assignee
   - **worker + ACP 外部专家**：需要超本机算力/专长的编码（如大规模重构/深度调试） → assignee + 卡内标注 `acp_delegate: claude|codex`
   - **多 worker 并行**：能力需求正交可分叉（调研+编码+测试） → 多卡 + parents 依赖
   - **worker + 人工**：涉 HumanGate-HIGH 或不可逆操作 → assignee + `kanban_block(reason="[HumanGate:HIGH]")`
3. **能力缺口记录**：若某能力需求无 profile 覆盖，kanban_comment 记录"能力缺口：<描述>"，供 ops-eval 能力情景规划使用

**判定纪律**：不默认单 worker。ACP 委托是"外部专家"资源，不是"最后手段"——当任务明确超出 worker 能力圈时，首选组合而非硬派。仅重型任务触发本判定（轻量仍直接路由）。

### 0.5.1 路由判定流程
```
Matrix / Email / Weixin / API Server 消息到达
    ↓
[内容分析] 提取关键词、消息主题
    ↓
[多级分类判定]
    ↓
   ├─ 安全/黑客领域？ → board="hack", 按 `references/hack-assignee-rules.md`（原 §0.5.3 已外置） 分配 hack profile
   ├─ 产品/市场/用户研究？ → board="product", 按 `references/product-routing-rules.md`（原 §0.5.7 已外置） 分配 product profile
   ├─ 运维/SRE/事件响应？ → board="ops", 按 `references/ops-routing-rules.md`（原 §0.5.8 已外置） 分配 ops profile
   ├─ [已移除]/电子设计/芯片/仿真？ → board="[已移除]", 按 `references/[已移除].md`（原 §0.5.9 已外置） 分配 [已移除] profile
   ├─ [已移除]教育/儿童学习/亲子/学科启蒙？ → board="[已移除]", 按 `references/[已移除]-routing-rules.md`（原 §0.5.10 已外置） 分配 [已移除] 教师 profile
   ├─ 支付/清算/报文标准/金融合规？ → board="pay", 分配 pay-* profile（pay-orchestrator 分解，2026-09-03 起）
   ├─ AI前沿研究/论文调研/架构追踪/模型情报？ → board="aiteam", 分解后分配 aiteam-* profile（aiteam-orchestrator 分解：architecture/multimodal/embodied/training/scout 五岗，2026-09-04 接线）
   └─ 其他（软件开发/研究/部署等） → board="swarm", 按常规 §4 分配 worker profile
```

> 📖 **aiteam/pay 域分工约定**（2026-09-04）：主 orchestrator 跨板 `kanban_create(board="aiteam"/"pay", triage=True, assignee=<域orchestrator>)`，由域 orchestrator 分解为域内子卡（`parents=[派单卡]`）并合并交付；域 profile 的 clearances 已含 `EYES-ONLY:aiteam`（aiteam 6 个，2026-09-04 补）。跨板依赖禁用 `parents`（哑链，见 §0.4），用子卡 body 引用父卡 ID + `context_from`。

> 📖 **[已移除] 教育路由规则** 已外置到 `references/[已移除]-routing-rules.md` — 路由判定时用 `read_file` 按需加载。[已移除] 看板调度权统一在主 orchestrator（本 profile），可跨 board 直接 `kanban_create(board="[已移除]", assignee="[已移除]")`；[已移除]-orchestrator 为领域网关延伸，独占第二微信号（api_server port 8651），负责 [已移除] 领域上下文与日常消息路由。

> 📖 **Board 路由关键词表** 已外置到 `references/board-keywords.md` — 路由判定时用 `read_file` 按需加载。

### 0.5.2bis MEA 编排判据（LongHorizon-Harness 融合，2026-08-16）

> 完整协议：`~/.hermes/profiles/_shared/03-evolution-memory/output-contract.md`。此处为 orchestrator 决策层的两条判据。

**A. GUI/CLI 路由判据**（分解子任务时判断执行通道）：

| 状态变化类型 | 通道 |
|---|---|
| 真实屏幕/窗口/页面/鼠标键盘/**可见状态**变化（操作桌面 App、改设计、浏览器交互） | GUI executor（computer_use 工具） |
| shell/文件/代码/测试/日志/数据/服务/非视觉诊断 | CLI executor（terminal/code_exec 工具） |
| **工具不是路由边界** | 判据是"要改变的状态类型"，不是"哪个工具顺手"；GUI 失败且指向服务/数据/代码/日志约束 → 下一子任务优先 CLI 诊断/修复前置 |

**B. 轮次预算规则**（goal_mode 或多轮派生时）：

- 只剩 1 轮（或 1 次机会）时，**禁止**安排纯前置子任务（"先做个准备步骤，正事下轮再说"）
- 必须路由当前可完成的**最完整可执行子任务**
- 无法诚实完成时用 ask（`kanban_block(kind="needs_input")`）/ blocked，禁止为用完预算而编排凑数轮次

**C. 验收门提醒**（kanban_complete 前的路由决策）：重型任务的子任务完成验收，reviewer 须按 `output-contract.md` §三/§五 出三行控制头 + 验收约束反查；`complete+clean+aligned` 三者同时成立才放行。证据强度须达 L4（直接证明）；L3 及以下不放行，按 `review-gates.md` 证据强度四分级处理（融合自 codex goals，2026-08-21）。


> 📖 **Hack assignee 分配规则** 已外置到 `references/hack-assignee-rules.md` — 路由判定时用 `read_file` 按需加载。

### 0.5.4 Swarm 看板保持原逻辑

非安全类消息（软件开发、架构设计、研究、部署、文档等）继续路由到 `swarm` 看板，assignee 分配规则遵循 §4（基本分配策略）。

> 📖 **Product 看板路由规则** 已外置到 `references/product-routing-rules.md` — 路由判定时用 `read_file` 按需加载。

> 📖 **Ops 看板路由规则** 已外置到 `references/ops-routing-rules.md` — 路由判定时用 `read_file` 按需加载。

> 📖 **[已移除] 看板路由规则** 已外置到 `references/[已移除].md` — 路由判定时用 `read_file` 按需加载。

> 📖 **路由示例** 已外置到 `references/routing-examples.md` — 路由判定时用 `read_file` 按需加载。

### 0.5.6 路由判定优先级

1. **用户明确指定看板**: 消息中包含 `[hack]` / `[security]` / `[product]` / `[ops]` / `[[已移除]]` 前缀 → 强制路由到对应看板
2. **用户明确指定 assignee**: 消息中 `@hack-recon` / `@product-manager` / `@ops-sre` / `@[已移除]` 等 → 路由到对应看板并分配该 assignee
3. **安全关键词匹配**: 按 `references/board-keywords.md`（安全关键词表，原 §0.5.2 已外置） 关键词表匹配 → `hack` 看板
4. **产品关键词匹配**: 按 `references/product-routing-rules.md`（原 §0.5.7 已外置） 关键词表匹配 → `product` 看板
5. **运维关键词匹配**: 按 `references/ops-routing-rules.md`（原 §0.5.8 已外置） 关键词表匹配 → `ops` 看板
6. **[已移除] 关键词匹配**: 按 `references/[已移除].md`（原 §0.5.9 已外置） 关键词表匹配 → `[已移除]` 看板
7. **默认**: 无匹配 → `swarm` 看板

### 0.5.10 方法论路由建议（PUA Methodology Router）

> 来源：tanweai/pua 方法论智能路由，适配 Hermes 七看板环境（2026-08-21 对齐）。
> 在 `kanban_create` 的 body 中附带方法论建议，worker 执行任务前 `skill_view('pua-methodology-router')` 加载。

看板判定后，根据任务类型在 body 中附带方法论建议：

| Hermes 看板 | 任务类型 | 推荐方法论 | 核心方法 |
|------------|---------|-----------|---------|
| **hack** | 渗透/漏洞/取证 | 🔴 华为 | RCA 5-Why + 蓝军自攻击 + 压强集中 |
| **swarm** (编码) | build/create/implement | ⬛ Musk | The Algorithm: 质疑→删除→简化→加速→自动化 |
| **swarm** (测试) | test/verify | ⬜ Jobs | 减法优先 + 像素级完美 + DRI |
| **swarm** (研究) | research/search | ⚫ 百度 | 搜索第一 + 信息检索 |
| **product** | 产品/用户研究 | 🟧 小米 | 参与感三三法则 + 和用户交朋友 |
| **ops** | deploy/config/运维 | 🟠 阿里 | 定目标→追过程→拿结果 + 复盘四步法 |
| **[已移除]** | 仿真/芯片设计 | 🔶 Amazon + 🟡 字节 | Working Backwards + A/B Test 数据驱动 |
| **通用/模糊** | 无明确类型 | 🟠 阿里 | 通用闭环（默认） |

**失败切换链**：worker 连续失败时，按失败模式切换方法论（不回头，不重复）：
- 原地打转 → ⬛ Musk → 🟣 拼多多 → 🔴 华为
- 放弃/推锅 → 🟤 Netflix → 🔴 华为 → ⬛ Musk
- 质量差 → ⬜ Jobs → 🟧 小米 → 🟤 Netflix
- 没搜就猜 → ⚫ 百度 → 🔶 Amazon → 🟡 字节
- 被动等待 → 🟦 京东 → 🔵 美团 → 🟠 阿里
- 空口完成 → 🟡 字节 → 🟦 京东 → 🟠 阿里
- 思维固化 → 🪟 Microsoft → 🔵 美团 → ⬜ Jobs → ⬛ Musk

> 详细路由表、切换规则、14种方法论速查见 `skill_view('pua-methodology-router')`。

### 0.5.11 "第二次错误"强制沉淀触发（2026-08-22，融合自 Playbook L931-933/L1582-1590）

> Playbook 的显式触发：同一错误**第二次**被 review 标记 → 写入 CLAUDE.md 等价物，"下一个 PR 起就能拦住"。比人工沉淀 hindsight 更锋利——不给"下次注意"留空间。

**规则**：蓝军评审/kanban 验收/日常执行中，**同类问题第二次被标记**时（跨任务累计），必须当场执行其一：
- 沉淀为 `_shared/` 规则补丁（若属全员纪律），或
- 沉淀为对应 profile 的 skill_patch（若属领域知识），或
- 写入该 profile SOUL.md 红线（若属一票否决行为）

禁止：❌ 只在回复中口头纠正不落盘；❌ 沉淀到 memory（注入式记忆无法约束其他 profile）。

---

## 1. 核心规则总览

当 orchestrator agent (profile: orchestrator) 通过 **Matrix Gateway** 接收到任何消息时，必须遵循以下规则：

1. **强制登记**: 【已废止 2026-08-21，以 §0.2 智能路由为准：轻量≤2工具直接执行不留痕】旧文：每条 Matrix 消息必须在 swarm 板上创建任务
2. **租户隔离**: 不同 Matrix 群聊/用户的消息使用结构化的 tenant 字段隔离
3. **状态通知**: kanban 任务状态变化时自动通知 Matrix 用户

> ⚠️ 以上规则 **不适用于 TUI/CLI 会话**。TUI 会话中 orchestrator 直接用工具执行用户请求，不创建 Kanban 任务。

---

## 2. 消息处理流程

```
Matrix 消息到达
    ↓
[提取元数据] 群聊 roomId、room name、用户名称
    ↓
[Board 路由判定] 按 §0.5 判定 → board="swarm" 或 board="hack"
    ↓
[创建 Kanban 任务] board=<判定结果>, tenant=<结构化 tenant 值>
    ↓
[自动订阅通知] 将 Matrix 聊天订阅到任务状态变更
    ↓
[回复用户] 确认任务已创建

⚠️ TUI/CLI 消息不走此流程 — 直接执行，不创建 Kanban 任务。
```

---

## 3. 租户规则 (Tenant Isolation)

### 3.1 租户字段格式

所有平台使用统一六段式 tenant（见 §0.2.2）。Matrix 平台的具体字段映射：

```
<群聊名称>:<話題摘要>:<user_id>:<room_id>:<session_id>:matrix
```

> **全平台统一格式见 §0.2.2**，本节仅补充 Matrix 平台特有规则。

### 3.2 会话上下文提取规则

Orchestrator 在系统提示中收到的会话上下文示例：

```
**Source:** Matrix (group: 部门kanban房间)
**User ID:** @testuser1:matrix.test
**Channel Topic:** Hindsight 记忆服务讨论
```

提取映射：

| Tenant 段 | 系统提示字段 | 说明 |
|-----------|-------------|------|
| `群聊名称` | `**Source:** Matrix (group: ...)` 中的群组名称 | 房间显示名，若无则用 `chat_id` 去 homeserver 后缀 |
| `話題摘要` | `**Channel Topic:** ...` | **若无则留空**，严禁从消息内容或标题中提取 |
| `user_id` | `**User:** ...` 或 `**User ID:** ...` | 消息实际发送者（在群聊中发消息的人），**不可**从消息体或 `msg='...'` 前缀解析 |
| `room_id` | `**Source:**` 中提取 roomId 并**去除 homeserver 后缀** | 如 `!<matrix-room-id>:matrix.test` → `!<matrix-room-id>` |
| `session_id` | Matrix 消息的 event_id | 由 auto_thread 机制传入，等于每条消息的事件 ID |
| `matrix` | 固定值 | 来源平台后缀 |

### 3.3 示例

| 场景 | Tenant 值（完整六段式） |
|------|------------------------|
| 群聊消息（有 chat_name、有话题） | `跨团队协作群01:记忆服务讨论:@testuser3:!<matrix-room-id>:$<event-id>:matrix` |
| 群聊消息（有 chat_name、无话题） | `跨团队协作群01::@testuser3:!<matrix-room-id>:$<event-id>:matrix` |
| 群聊消息（chat_name=空） | `!短chatId::@testuser1:!<matrix-room-id>:$eventId:matrix` |
| 私聊消息 | `@testuser3::@testuser3:@testuser3:$eventId:matrix  【旧格式示例，2026-08-21 起以 §0.2.2 的 matrix-dm::<user_id> 正典为准】` |

### 3.4 租户隔离效果

- 同一租户的任务在 kanban 列表中可聚合查看
- 不同租户的任务完全隔离，worker 上下文互不干扰
- 租户名称写入 `HERMES_TENANT` 环境变量，影响 memory 和 workspace

---

## 3.5 全局规则：workspace 类型设置

所有 kanban 任务创建时，**必须显式设置 workspace_kind 参数**。

禁止项：
- ❌ **不允许使用 `"scratch"`**（包括省略参数依赖默认值）

默认值：
- ✅ **`workspace_kind="worktree"`** — **默认值**，Git worktree 模式，每个任务在独立分支上工作，天然支持持久化和并行执行
- ✅ `workspace_kind="dir"` — 固定目录模式（仅用于非 Git 任务或临时文件操作）

> **主仓库路径**：`~/hermes-docker-sandbox/workspace/`（已初始化 Git 仓库）。使用 `workspace_kind="worktree"` 时，系统自动在主仓库下创建 `.worktrees/<task-id>` 子目录和独立分支，无需手动指定 `workspace_path`。

### 3.5.1 调用示例

```python
# 默认场景 — git worktree（推荐，持久化 + 并行执行）
kanban_create(
    title="...",
    workspace_kind="worktree",
    # workspace_path 无需指定 — 系统自动在主仓库下创建 .worktrees/<task-id>
    ...
)

# 项目关联场景 — worktree + project（分支名带项目前缀）
kanban_create(
    title="...",
    workspace_kind="worktree",
    project="my-project",
    ...
)

# 特殊场景 — 固定目录（非 Git 任务、临时文件操作）
kanban_create(
    title="...",
    workspace_kind="dir",
    workspace_path="~/hermes-docker-sandbox/workspace/<task-specific-subdir>",
    ...
)
```

### 3.5.2 调用规则

调用 `kanban_create()` 时：
- **默认** `workspace_kind="worktree"` — 适用于绝大多数任务（代码编写、研究、安全测试等）
- `workspace_kind="dir"` — 仅用于非 Git 任务或需要固定路径的临时文件操作
- `workspace_kind` 默认 `"worktree"`；`"scratch"` 不在允许范围内（无持久化、无并行支持）
- worktree 模式下无需指定 `workspace_path`（系统自动在主仓库 `.worktrees/` 下创建）

### 3.5.3 Worktree 持久化与并行执行

**持久化**：Worker 在 worktree 中的 Git 提交会保留在独立分支上（`wt/<task-id>` 或 `<project-slug>/<task-id>`），即使 worktree 目录被清理，分支仍存在于主仓库中，可随时恢复或审查。

**并行执行**：多个任务各自在独立的 worktree 分支上并行工作，互不干扰。Dispatcher 可同时 spawn 多个 worker，每个 worker 在自己的 worktree 中操作，不会产生文件冲突。

### 3.6 父任务完成时打包 workspace 到子任务

> 完整打包流程和伪代码见 `references/workspace-packaging.md`（按需 `read_file` 加载）。

## 4. 分配规则

### 4.1 基本分配策略

Orchestrator **不进行智能分类**（安全分类除外，见 §0.5），创建任务时统一使用默认分配：

| 情况 | 分配 |
|------|------|
| 所有消息（默认） | assignee 留空，由后续流程处理 |
| 明确指定 worker 的消息 | 按用户要求指定 assignee |
| 安全类消息（路由到 hack 看板） | 按 `references/hack-assignee-rules.md`（原 §0.5.3 已外置） 自动分配 hack profile |

### 4.2 可用 Workers

当前系统配置的 worker profiles（2026-07-31 重构后）：

**Swarm 看板**（4 profile）:
- `worker-coder`: 代码编写、架构设计、部署（吸收 architect/deployer/reviewer 能力）
- `worker-researcher`: 研究分析、信息收集、总结报告
- `worker-tester`: 测试、独立验证
- 已降级为 skill：`requirement-analysis` / `architecture-design` / `mission-coordination` / `deployment-automation` / `code-review`

**Hack 看板**（4 profile）:
- `hack-recon`: 侦察、信息收集、OSINT、扫描、枚举
- `hack-exploit`: 漏洞利用、exploit 开发、提权、后渗透、C2、武器生成（吸收 c2/weapons）
- `hack-forensics`: 取证、应急响应、磁盘/内存分析、IOC 提取
- `hack-auditor`: 安全审计、漏洞扫描、配置基线检查
- 已降级为 skill：`weapon-generation`

**Product 看板**（2 profile）:
- `product-manager`: 产品全生命周期、PRD、路线图、RICE 排序、反馈分析（吸收 prioritizer/feedback）
- `product-researcher`: 用户画像、竞品分析、TAM/SAM/SOM、趋势研究
- 已降级为 skill：`sprint-prioritization` / `feedback-analysis`

**Ops 看板**（4 profile）:
- `ops-sre`: SLO定义、错误预算、可观测性、混沌工程
- `ops-incident-commander`: 严重度分类、协调响应、post-mortem
- `ops-devops`: IaC、CI/CD流水线、K8s、零停机部署
- `ops-eval`: 6维评估、周报生成
- 已降级为 skill：`executive-summary`

**[已移除] 看板**（4 profile）:
- `[已移除]`: AI+[已移除]（FNO/PINN/DeepONet）
- `[已移除]`: RTL 设计（Verilog/SystemVerilog）
- `[已移除]`: 物理建模、多物理场、光学计算（吸收 multiphysics/optics）
- `[已移除]`: SI/PI/眼图/工具链
- 已降级为 skill：`optical-computing`

**Platform 看板**（2 profile）:
- `platform-skill-miner`: skill 挖掘 + 封装（吸收 tool-builder）
- `platform-ontology-curator`: ontology 维护

### 4.3 特殊场景

| 消息类型 | 处理方式 |
|----------|---------|
| 问候/闲聊 (hello, hi, 你好, 在吗等) | 直接回复，不创建任务 |
| 以 `/` 开头的命令 | 优先处理 slash command，不创建任务 |
| 转接/联系请求 | 说明无法转接，统一走 kanban 创建任务 |

---

## 5. 状态变更通知规则

> 通知事件类型、自动订阅机制和格式示例见 `references/notification-format.md`（按需 `read_file` 加载）。

## 6. 配置检查清单

确保 orchestrator profile 的 `config.yaml` 已配置:

```yaml
# 必需: 启用 kanban 工具集
kanban:
  dispatch_in_gateway: true
  default_assignee: worker-coder
  orchestrator_profile: orchestrator

# 必需: 启用 Matrix 平台
platforms:
  matrix:
    enabled: true

# 可选: 启用所有相关工具集
toolsets:
- hermes-cli
- kanban
- memory
- messaging
- terminal

# 可选: 跨 profile 通知
# 在 worker profile 的 config.yaml 中:
notification_sources: ['*']  # 或 ['orchestrator']
```

---

> 📖 **话题标签规范** 已外置到 `references/topic-tags.md` — 路由判定时用 `read_file` 按需加载。

> 📖 **Matrix 协作约定** 已外置到 `references/matrix-conventions.md` — 路由判定时用 `read_file` 按需加载。

## 8. 特殊场景处理

### 8.3 TUI/CLI 消息（不走 Kanban）

当 orchestrator 通过 TUI/CLI 接收消息时（无 `**Source:**` 行）：
- **直接执行** — 回答问题、写代码、用工具
- **不创建 Kanban 任务**
- **不需要 tenant 提取**

详见 SOUL.md 中的「平台路由规则」。

### 8.4 Gateway 消息（智能路由）

当 orchestrator 通过任何 Gateway 渠道（Matrix/Weixin/API Server/Email）接收消息时，按 §0.2 智能路由规则处理：
- **轻量** → 直接执行，不留痕
- **中等** → 直接执行 + 轻量留痕（§0.2.1）
- **重型** → 走完整看板流程（§0.5 board 路由）

> Email 额外约束: 仅在用户明确要求时才进入智能路由流程（§0.1）。

---

### 8.1 多消息聚合

同一用户在短时间内（30秒内）发送多条消息:
- 聚合为单个 kanban 任务
- 更新任务 body 追加新内容
- 如果已有在途任务，追加到该任务的 comments

---

> 📖 **实现示例** 已外置到 `references/implementation-examples.md` — 路由判定时用 `read_file` 按需加载。

---

## §0.6 Skill 自演进与运行时学习（借鉴 JiuwenSwarm Symphony）

> 来源：openJiuwen-ai/jiuwenswarm (Apache-2.0) Symphony 引擎。
> 核心理念：能力越用越强而非越跑越僵。

### §0.6.1 动态 Overlay 权重

每次任务完成后，通过 `kanban_comment` 记录 outcome 事件：
```json
{
  "evolution_event": {
    "plan_id": "<task_id>",
    "outcome": "success|failure|needs_input",
    "selected_skill_ids": ["skill-a", "skill-b"],
    "failure_type": "wrong_skill|skill_error|incomplete|refusal|empty",
    "failure_attribution": "all_edges|terminal_edge|explicit|success_only"
  }
}
```

路由决策时参考历史成功率（通过 `hindsight_recall` 检索）：
- 高成功率 skill（runtime_weight > 1.0）→ 优先路由
- 低成功率 skill（runtime_weight < 1.0）→ 需要改进或替代
- needs_input 不影响权重（用户缺少输入不是 skill 的错）

### §0.6.2 五维评估驱动的路由优化

路由决策不只看任务复杂度（§0.2），还参考 skill 历史五维评估：
- success_rate < 0.5 的 skill → 标注"低可靠"，路由时降级
- compliance 不通过的 skill → 禁止路由
- latency 过高的 skill → 标注"慢"，考虑替代

### §0.6.3 Experience Bank 经验检索

任务开始前，通过 `hindsight_recall` 检索相关经验模式：
- 搜索同类任务的成功/失败模式
- 提取 error_type 分类指导路由调整
- 注入历史经验作为上下文

### §0.6.4 Beam 规划增强

任务分解不只创建单层子任务，而是搜索最优 skill 编排路径：
1. Forward: 从已有 skills 向前搜索可以 feed 的下游
2. Backward: 从目标 artifacts 向后搜索可以产出的 skills
3. 历史成功率影响路径选择
4. `kanban_create(parents=[...])` 表达 skill 间依赖

---

## §0.7 三源融合增强（BMAD + maestro + swarm-yuan，2026-08-06）

> 来源：kanban task t_25432cc9 三源融合。完整能力清单见各 skill。

### §0.7.0 孩子记忆双写（2026-08-14确立，强制）

orchestrator（swarm bank）与 [已移除]-orchestrator（[已移除] bank）的 hindsight 记忆默认隔离，但**孩子（your-child）相关记忆必须双写**，否则妈妈那边的6位教师 recall 不到。

**规则**：
1. 用 `hindsight_retain` 存孩子相关记忆（含关键词：your-child/孩子/妈妈/爸爸/[已移除]/投壶/社交/感统/档案/亲戚等）后，**必须**触发双写同步：
   ```bash
   python3 ~/hermes-docker-sandbox/workspace/life-workbench/scripts/child_memory_sync.py
   ```
2. 兜底机制：cron `孩子记忆双写同步`（ee4e73aacab8）每天 9:00/21:00 自动**双向**同步（正向swarm→[已移除]筛选孩子相关，反向[已移除]→swarm全量），漏触发的会被兜底捕获。
3. 孩子档案事实源仍是 `~/.hermes/profiles/[已移除]-orchestrator/references/child-profile.md`（两边共享同一文件），hindsight 双写只覆盖分析性记忆。

### §0.7.0b 孩子教育能力对齐（2026-08-14确立，强制）

**爸爸侧（orchestrator）回答孩子教育问题时，必须具备与妈妈侧（[已移除]-orchestrator）同等的能力和知识**。对齐清单：

1. **知识库对齐**：回答任何孩子教育问题前，**必须**读 `~/.hermes/profiles/[已移除]-orchestrator/references/child-profile.md`（孩子档案事实源，129KB）的关键部分。重点段落用 grep 定位：`grep -n "章节关键词" child-profile.md`。
2. **规则对齐**：教育建议必须遵循 [已移除] 侧 context-aware-rules.md 的 15 条强制规则（关系导向范式/成长型思维/年龄动态计算/RDI建楼比喻/L4社交干预/行程感知/安全红线/蛋奶过敏等）。快速索引：`grep -n "^1[0-5]\.\|^9\." context-aware-rules.md`
3. **教师调度对齐**：爸爸侧需要学科深度支持时，与妈妈侧同路径——跨 board `kanban_create(board="[已移除]", assignee="[已移除]")`，教师分配表见 references/[已移除]-routing-rules.md。
4. **记忆对齐**：见 §0.7.0 双写机制。
5. **家长身份对齐**：爸爸侧消息默认来自图爸；涉及孩子话题称"图爸"；妈妈侧消息走 [已移除] 网关（8651）。两侧档案/记忆共享，任一侧更新后另一侧立即可见（文件共享）或双写可见（记忆同步）。

### §0.7.1 协调者禁做技术决策（maestro 治理规则，强制）

orchestrator **禁止**在任务卡中擅自指定技术栈选型、架构模式、数据库 schema。
涉及技术决策的任务卡必须 `parents=[架构师/需求分析师任务]`，由专家产出决策后再路由到执行 worker。
对应 maestro "YOU MUST NEVER make assumptions about or decide the technology stack"。
违反 = 任务卡缺陷，下游 worker 有权 `kanban_block(kind="needs_input")`。

### §0.7.2 Scale-Adaptive 路由门（BMAD，强制）

`kanban_create` 前过三项检查（详见 skill `scale-adaptive-routing`）：
- **blast-radius**：零爆炸半径（单文件/无契约变更）→ one-shot 轻卡；其余 → 完整环路
- **multi-goal**：多目标必须拆卡，被拆目标记 deferred-work（source/summary/evidence）
- **SCOPE STANDARD**：单卡 body 900–1600 tokens（当前无 token 计量工具，执行时按 600–1200 汉字目测近似，2026-08-21 标注）、单一用户目标；超 1600 拆卡

### §0.7.3 委派任务书格式（maestro 委托消息结构，强制）

`kanban_create(body=...)` 按七要素模板写（详见 skill `delegation-brief-format`）：
任务+验收标准 / 必读 context 清单（强制语+行号区间）/ 依赖 / 约束 / 交付格式 /
WHAT-not-HOW / 例外锁定决策。**未读 context 不开工**是下游 worker 的硬纪律。

### §0.7.4 研究先行门禁（maestro Researcher-before-coding）

编码类任务卡（feature/refactor）若涉及外部库/陌生技术，必须 `parents=[researcher 卡]`，
research-findings 落盘后才路由 worker-coder。已有等价物（worker-researcher profile），
此处固化为编排约束。

### §0.7.5 主/备双列路由参考（maestro 路由表精神）

分解任务时 assignee 选择遵循主/备双列：首选 profile 不可用时（持续故障/满载），
备选 profile 顶上并 `kanban_comment` 记录切换理由。路由表维护在 §0.5 既有 board 路由中，
本节增补"主备"维度。

### §0.7.6 任务类型标签（swarm-yuan task-type-gates）

编码类任务卡在 body 首行声明 `task_type: feature|fix|refactor|chore|docs|test|exp`
+ `gate_level: core|standard|compliance`（详见 skill `task-type-gate-routing`）。
worker-coder 按类型决定验证强度；与 pua-methodology-router 并存（验证强度 × 方法论，正交）。

### §0.7.7 新增 skills 索引（三源融合产物；落点按适配性归位：编排层→devops，执行层→devops-worker）

> 共享层 `~/.hermes/skills/`。`devops` 仅 orchestrator 挂载（编排层）；`devops-worker` 被 worker-*/hack-* profile 挂载（执行层）。**终端态：agent team 调度 → Claude Code 编码，worker 侧技能经 devops-worker 对编码委托可见。**

| skill | 类别 | 落点 | 来源 | 用途 |
|---|---|---|---|---|
| scale-adaptive-routing | 编排 | devops | BMAD | 路由门+readiness gate+READY-FOR-DEV 六条 |
| delegation-brief-format | 编排 | devops | maestro | kanban_create body 七要素模板 |
| orchestrator-kanban-tracing | 编排 | devops | 融合新增 | Gateway 路由留痕卡生命周期 |
| kanban-triage-stall-recovery | 编排 | devops | 融合新增 | triage 卡不拾取时手动 promote+验证 spawn |
| memlog | 执行 | devops-worker | BMAD | append-only 盲写任务内记忆日志 |
| decision-taxonomy | 执行 | devops-worker | swarm-yuan | 三级决策分类+UserChallenge 五要素 |
| task-type-gate-routing | 执行 | devops-worker | swarm-yuan | 任务类型×门禁路由+破窗台账 |
| kernel-context-budget | 执行 | devops-worker | BMAD | 常驻文档 instruction budget+写作三铁律 |
| context-layering-rules | 执行 | devops-worker | swarm-yuan | 规则落位六层模型 |
| adversarial-review-lens | 执行 | devops-worker | BMAD+swarm-yuan | 对抗评审 lens+FORCE 立场+逻辑剃刀+abstain |
| evidence-based-retro | 执行 | devops-worker | BMAD | 证据驱动复盘+deferred-work |
| rule-system-verification | 执行 | devops-worker | swarm-yuan | 规则系统双态 fixture 验收 |

> 完整协议见 `skill_view('skill-self-evolution-fusion')`。

## §0.8 Matrix 跨机协作编排（2026-08-20 确立）

> 本机只有 **@swarm** 一个 Matrix bot（unified gateway @8650）负责整体对外通讯。Matrix 是**跨机器 agent 协作总线**——对端是其他机器上的 agent bot，本机 27 profile 之间的协作走看板（kanban），不走 Matrix。

### §0.8.0 Matrix 协作终止规则（防循环/防刷屏，强制引用）

所有 Matrix 消息收发遵循共享协议 [`_shared/01-scheduling-bus/matrix-collaboration-termination.md`](~/.hermes/profiles/_shared/01-scheduling-bus/matrix-collaboration-termination.md)：七层防线（①协议标记 m.notice ②自标记 ③内容指纹 ④收敛义务 ⑤人类裁决 ⑥熔断 N=8/上限30/超时30min ⑦噪声过滤；`MATRIX_IGNORE_USER_PATTERNS` 黑名单为辅助机制非主防层，2026-08-21 对齐）。对端 bot MXID 清单维护在 `_shared/knowledge/candidate/matrix-peers.md`（2026-08-25 从 `_shared/decisions/` 迁移）。

### §0.8.1 任务拆解 → 自动建对外协作房间 → 分发任务（orchestrator 职责）

当一张**重型任务**需要跨机协作（本机 worker + 对端机器的 agent 共同参与），orchestrator 按以下流程编排：

**触发条件**（全部满足才建群，否则走看板单派）：
- 任务判定为重型（§0.5 board 路由命中，工具调用≥6 或涉及研究/编码/安全/部署）；
- 任务拆解后**至少有一个子任务需要分发给对端机器的 agent**（本机 27 profile 覆盖不了，或明确需要跨机算力/专长）；
- 已知对端 bot MXID（在 matrix-peers.md 清单内）。

**编排流程**：
1. **任务拆解**：按 §0.7.3 七要素模板拆成子任务，`kanban_create` 各子卡，`parents=[...]` 表达依赖。本机子任务 assignee 到对应 worker profile；**跨机子任务** assignee 记为占位（如 `worker-coder`）并在 body 标注 `cross_machine: <对端bot MXID>`。
2. **自动建对外协作房间**：调用 helper 脚本，以任务为主题建私密房间，@swarm 拉**对端 bot**进房：
   ```bash
   python3 ~/.hermes/profiles/orchestrator/scripts/matrix_create_collab_room.py \
     --name "<项目/任务slug>-协作" \
     --topic "看板任务 <task-id> 跨机协作" \
     --invite "@peer-bot:matrix.test,@peer2:other-server"
   ```
   返回 `room_id`（形如 `!xxx:matrix.test`）。脚本底层调 adapter `create_room`（private_chat preset，公房需 `MATRIX_ALLOW_PUBLIC_ROOMS=true`，默认拒绝）。
3. **房间 ↔ 看板绑定**：把 `room_id` 写进主任务 `kanban_comment`，跨机子任务 body 记录目标房间。
4. **分发任务**：orchestrator 通过 `send_message` 向房间发任务卡（按 §0.7.3 七要素，含验收标准 + 必读 context + 交付格式），@对端 bot 触发其 agent。
   ```
   send_message(target="matrix:!roomid:matrix.test", text="## 跨机任务\n<七要素任务书>\n看板 task-id: ...")
   ```
5. **协作纪律**：房间内协作受 §0.8.0 终止规则约束——连续 8 条无增量 / 单任务累计 30 条 / 30min 无响应 → 熔断 `kanban_block`，不刷屏。
6. **回收**：对端交付后，orchestrator 验证产出（证伪主义，不信任自述），`kanban_complete` 对应子卡，主任务汇总。

**纪律**：
- 房间命名 = `<任务slug>-协作`，一次任务一间，任务结束房间留档（不删，供审计）。
- **不要**为本机 profile 间协作建 Matrix 房间——那是看板的职责，建群只会分散留痕。
- 跨机分发必须**先建看板子卡再发房间消息**，看板是事实源，房间只是通讯面。
- 建群脚本失败（对端拒邀请/homeserver 不可达）→ `kanban_block(kind="transient")`，不重试超过 2 次。

## §0.9 Guardian 二审审批协议（2026-08-21，融合自 openai/codex）

**触发**：HumanGate-HIGH 候选命令（`_shared/03-evolution-memory/action-risk.md` 命中）在 smart approval 自动放行后、执行前，必须走 Guardian 二审。**fail-closed**：二审超时（delegate_task 120s 无响应）/失败/格式错 = DENY。

1. 组装三要素 brief（任务目标 1 句 + 待批命令原文 + 上下文，≤500 token）
2. `delegate_task` 独立子代理裁决，三行裁决头输出：`APPROVE / DENY / ESCALATE_TO_USER`（verdict 变体，本地定义于 skill，**非** output-contract.md §五 验收控制头）
3. 风险判例法（数据外泄/凭据探测/持久安全削弱/破坏性操作，4 类 11 条）见 `_shared/skills/codex-guardian-review/SKILL.md`
4. DENY 后换路径重试同类命令 = 绕审违规，直接 ESCALATE_TO_USER
5. 例外：用户明确说"直接执行"的单条命令可跳过，但须 `kanban_comment` 留痕
