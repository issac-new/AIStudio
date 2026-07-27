# Orchestrator 认知增强集成指南

> **用途**：本文件将 cognition-lattice 知识库（1969条）映射到 orchestrator 的核心决策场景。
> 当 orchestrator 面临任务路由、分解、分配、优先级判定或跨团队协调决策时，
> 应先查阅本指南，找到对应的认知框架/思维模型，再读取对应 references 文件获取详细条目。

---

## 一、Orchestrator 决策点 ↔ 认知框架映射

| 决策场景 | 推荐框架 | 来源文件 | 条目示例 |
|----------|----------|----------|----------|
| 任务拆解（复杂需求→子任务） | MECE原则、第一性原理、功能分解 | thinking_frameworks.md | MECE, First Principles |
| 看板路由（swarm/hack 判定） | 模式识别、贝叶斯更新 | mental_models.md | Pattern Recognition, Bayesian Updating |
| Worker 分配（任务→最佳 agent） | 比较优势、能力圈 | mental_models.md | Comparative Advantage, Circle of Competence |
| 优先级判定（多任务排序） | 艾森豪威尔矩阵、帕累托法则 | mental_models.md | Eisenhower Matrix, Pareto Principle |
| 风险评估（安全路由判定） | 逆向思维、Pre-mortem | mental_models.md | Inversion, Pre-mortem |
| 跨看板协调（swarm↔hack 联动） | 系统思维、反馈循环 | mental_models.md | Systems Thinking, Feedback Loops |
| 任务质量审查 | 证伪主义、红队思维 | mental_models.md, interdisciplinary_tools.md | Falsificationism, Red Team |
| 团队瓶颈诊断 | 约束理论、瓶颈分析 | mental_models.md | Theory of Constraints |
| 变革推动（流程改进） | Kotter变革八步、PDCA | thinking_frameworks.md, management_thinking.md | Kotter 8-Step, PDCA |
| 决策偏差自检 | 确认偏误、锚定效应、规划谬误 | cognitive_biases.md | Confirmation Bias, Anchoring, Planning Fallacy |

---

## 二、任务拆解认知工具箱

### 2.1 MECE 原则（Mutually Exclusive, Collectively Exhaustive）

> **来源**：`thinking_frameworks.md` → 问题分析框架

**Orchestrator 应用**：将用户的高层需求拆解为子任务时，确保：
- **互斥**：子任务之间不重叠（一个 worker 的工作不与另一个 worker 冲突）
- **穷尽**：所有必要工作都被覆盖（没有遗漏的关键环节）

```
用户需求: "构建一个用户认证系统"
  ↓ MECE 拆解
├── [架构设计] → architect (设计认证方案、选型)
├── [后端实现] → worker-coder (API 开发、数据库)
├── [前端实现] → worker-coder (登录页面、Token 管理)
├── [测试验证] → worker-tester (单元测试、集成测试)
├── [部署运维] → worker-deployer (CI/CD、环境配置)
└── [文档编写] → worker-researcher (API 文档、使用说明)
```

### 2.2 第一性原理（First Principles Thinking）

> **来源**：`mental_models.md` → 创新与问题解决模型 / `interdisciplinary_tools.md` → 哲学工具

**Orchestrator 应用**：面对模糊或创新性需求时，不依赖类比，而是拆到最基本要素重新构建。

```
用户需求: "做一个像XXX但更好的产品"
  ↓ 第一性原理
├── XXX的核心价值是什么？（不是功能列表，而是解决的底层问题）
├── 用户真正需要什么？（剥离表层需求，找到本质痛点）
├── 从零开始的最佳方案是什么？（不受现有实现约束）
└── 哪些约束是真实的，哪些是假设的？
```

### 2.3 功能分解（Functional Decomposition）

> **来源**：`thinking_frameworks.md` → 问题分析框架

**Orchestrator 应用**：系统性拆解复杂系统为可管理的子系统。

```
复杂系统
├── 子系统A → 独立子任务 → worker-A
├── 子系统B → 独立子任务 → worker-B
├── 子系统C（依赖A和B） → 子任务 → worker-C (parents=[A, B])
└── 集成测试 → worker-tester (parents=[A, B, C])
```

---

## 三、看板路由认知工具箱

### 3.1 模式识别（Pattern Recognition）

> **来源**：`mental_models.md` → 学习与认知模型

**Orchestrator 应用**：在 §0.5 的安全关键词分类中，不应仅做字面匹配，而应识别消息的深层意图模式。

```
用户消息: "检查一下我们服务器的安全性"
  ↓ 表面: "检查" → 可能匹配 review 类
  ↓ 模式识别: "服务器安全" → 安全审计场景 → hack-auditor
  ↓ 路由: board="hack", assignee="hack-auditor"
```

### 3.2 贝叶斯更新（Bayesian Updating）

> **来源**：`mental_models.md` → 概率与统计模型

**Orchestrator 应用**：当消息内容模糊时，基于先验概率（历史路由分布）和当前证据（关键词）动态调整路由判定。

```
消息: "分析这个系统"
  ↓ 先验: 90% 的"分析"消息是研究/架构类 → swarm
  ↓ 证据: 消息上下文在安全群聊 → 调整概率
  ↓ 后验: 60% 安全审计 → hack-auditor, 40% 技术分析 → swarm
  ↓ 决策: 路由到 hack-auditor（triage=True，让人工确认）
```

### 3.3 奥卡姆剃刀（Occam's Razor）

> **来源**：`interdisciplinary_tools.md` → 哲学工具

**Orchestrator 应用**：当消息可以有多种解读时，选择假设最少的解读。

```
消息: "扫描目标"
  ↓ 复杂解读: 可能是代码扫描、安全扫描、文档扫描...
  ↓ 奥卡姆剃刀: 最简单解释 — 在技术上下文中"扫描"最常见含义
  ↓ 结合上下文判定: 安全群聊 → 安全扫描 → hack-recon
```

---

## 四、Worker 分配认知工具箱

### 4.1 比较优势（Comparative Advantage）

> **来源**：`mental_models.md` → 经济与商业模型

**Orchestrator 应用**：不把任务分给"最擅长"的 worker，而分给"机会成本最低"的 worker。

```
场景: 需要写一段简单的部署脚本
  ↓ 绝对优势: worker-coder 可能写得更好
  ↓ 但 worker-coder 正在处理复杂架构任务
  ↓ 比较优势: worker-deployer 的机会成本更低
  ↓ 决策: 分配给 worker-deployer
```

### 4.2 能力圈（Circle of Competence）

> **来源**：`mental_models.md` → 决策与判断模型

**Orchestrator 应用**：只在 worker 的能力圈内分配任务；能力边界外的任务进入 triage。

```
worker-coder 能力圈: Python, Rust, API, 算法
  ↓ 消息: "用 Go 写一个微服务"
  ↓ 不在能力圈内 → triage，或分配后标注"需要学习新语言"
```

### 4.3 瓶颈理论（Theory of Constraints）

> **来源**：`mental_models.md` → 系统与复杂性模型

**Orchestrator 应用**：识别多任务流水线中的瓶颈 worker，优化整体吞吐。

```
任务流水线: research → code → test → deploy
  ↓ 如果 worker-tester 积压了 5 个任务（瓶颈）
  ↓ 优化: 优先分配不经过测试的任务（如文档、研究）
  ↓ 或: 将部分测试任务路由到 worker-reviewer 临时承担
```

---

## 五、优先级判定认知工具箱

### 5.1 艾森豪威尔矩阵（Eisenhower Matrix）

> **来源**：`mental_models.md` → 决策与判断模型

**Orchestrator 应用**：多任务竞争资源时，按紧急/重要两个维度排序。

| | 紧急 | 不紧急 |
|---|---|---|
| **重要** | P0/P1 → 立即执行 | P2 → 计划执行 |
| **不重要** | P3 → 快速处理或委托 | — → 暂存或归档 |

### 5.2 帕累托法则（Pareto Principle / 80/20 Rule）

> **来源**：`mental_models.md` → 经济与商业模型

**Orchestrator 应用**：20% 的任务产生 80% 的价值——优先处理高影响力任务。

```
批量消息到达时:
  ↓ 识别哪些是"高价值"任务（影响生产、安全、核心功能）
  ↓ 优先路由和分配这些任务
  ↓ 低价值任务（闲聊、问候、非紧急咨询）延后或直接回复
```

---

## 六、风险评估认知工具箱

### 6.1 逆向思维（Inversion / Via Negativa）

> **来源**：`mental_models.md` → 决策与判断模型 / `interdisciplinary_tools.md` → 哲学工具

**Orchestrator 应用**：不问"这个路由是否正确"，而问"什么情况下这个路由会导致灾难"。

```
路由判定: 消息 → swarm 看板
  ↓ 逆向: 如果这实际上是安全事件但被路由到 swarm 会怎样？
  ↓ 后果: hack agent 不会看到，安全响应延迟
  ↓ 缓解: 模糊消息 → triage=True，让人工确认
```

### 6.2 Pre-mortem（事前验尸）

> **来源**：`mental_models.md` → 决策与判断模型

**Orchestrator 应用**：在任务分配前，假设任务失败，回推可能的失败原因。

```
分配方案: 将"渗透测试"分配给 hack-exploit
  ↓ Pre-mortem: "如果这个任务失败了，可能因为什么？"
  ├─ 目标范围不明确 → 在 body 中补充 scope
  ├─ 缺乏目标信息 → 先创建侦察子任务 (hack-recon)
  └─ 工具权限不足 → 标注 needs_input
```

---

## 七、决策偏差自检清单

> **来源**：`cognitive_biases.md` / `psychological_effects.md`

Orchestrator 在做路由/分配决策后，应快速自检以下偏差：

| 偏差 | 症状 | 纠正 |
|------|------|------|
| **确认偏误** (Confirmation Bias) | 只关注支持当前路由的证据 | 主动寻找反驳证据：这个消息是否可能是非安全类？ |
| **锚定效应** (Anchoring) | 被消息第一个词锚定（如"攻击"→hack） | 看完整条消息再判定，不只看开头 |
| **可得性启发** (Availability Heuristic) | 最近处理过安全任务 → 倾向路由到 hack | 用基率校准：90%消息是协作类 |
| **规划谬误** (Planning Fallacy) | 低估任务复杂度 → 分配给单个 worker | 预留 buffer，复杂任务拆子任务 |
| **沉没成本** (Sunk Cost) | 已分配的任务方向错了但不改 | 发现路由错误立即 reassign，不因已分配而坚持 |
| **框架效应** (Framing Effect) | 消息措辞影响判定（"入侵"vs"连接异常"） | 剥离情感色彩，只看技术实质 |
| **代表性启发** (Representativeness) | 消息看起来像安全事件 → 忽略基率 | 结合先验概率和当前证据做贝叶斯更新 |
| **过度自信** (Overconfidence) | 确信路由正确，不设 triage | 模糊场景一律 triage=True |

---

## 八、跨看板协调认知工具箱

### 8.1 系统思维（Systems Thinking）

> **来源**：`mental_models.md` → 系统与复杂性模型

**Orchestrator 应用**：swarm 和 hack 不是孤立的——安全事件可能触发协作任务，反之亦然。

```
安全事件: hack-recon 发现服务器漏洞
  ↓ 系统思维: 漏洞修复需要 hack + swarm 协作
  ├─ hack-exploit → 验证漏洞、开发补丁测试
  ├─ worker-coder (swarm) → 实施修复
  ├─ worker-tester (swarm) → 回归测试
  └─ hack-auditor → 修复后复测
  ↓ 创建跨看板子任务链，用 parents 连接
```

### 8.2 反馈循环（Feedback Loops）

> **来源**：`mental_models.md` → 系统与复杂性模型

**Orchestrator 应用**：任务完成后收集反馈，优化路由规则。

```
任务完成后:
  ↓ 正反馈循环: worker 反馈"这个任务应该是 hack 而非 swarm"
  ↓ 更新 §0.5 关键词表 → 下次类似消息路由更准确
  ↓ 负反馈循环: 某个 hack agent 频繁被错误分配任务
  ↓ 调整 assignee 映射 → 减少误分配
```

---

## 九、管理思维应用（Management Thinking）

> **来源**：`management_thinking.md`

### 9.1 情境领导（Situational Leadership）

Orchestrator 对不同成熟度的 worker profile 采用不同管理风格：
- **新 worker / 不熟悉任务类型** → 指导型：在 body 中写详细 spec、验收标准
- **熟练 worker** → 授权型：只给目标，让 worker 自行决定实现

### 9.2 OKR 思维

将用户的高层需求转化为可衡量的子目标：
```
用户目标: "提升系统安全性"
  ↓ O: 系统安全基线达标
  ├─ KR1: 完成全量漏洞扫描 (hack-auditor)
  ├─ KR2: 修复所有 P0/P1 漏洞 (worker-coder)
  └─ KR3: 建立持续监控 (hack-recon + worker-deployer)
```

### 9.3 Kotter 变革八步

推动团队流程改进时（如新看板路由规则上线）：
1. 制造紧迫感 → 说明当前 hack 看板无法接收任务的问题
2. 组建联盟 → 拉拢 architect、PM 支持
3. 制定愿景 → 双看板自动路由的完整设计
4. 沟通愿景 → 更新 SOUL.md 和 rules.md
5. 授权行动 → 移除阻碍（如硬编码 board="swarm"）
6. 创造短期胜利 → 先修路由规则，验证可用
7. 巩固成果 → 将规则推广到 email_kanban_rules.md
8. 制度化 → 写入版本 v5.0，成为标准

---

## 十、论证谬误检测（Argumentation Fallacies）

> **来源**：`argumentation_fallacies.md`

### Orchestrator 应用场景

当用户消息中包含论证性内容（如需求评审、技术方案辩论、代码审查讨论）时，orchestrator 可以：

1. **识别用户论证中的谬误**，在创建任务时标注：
   - "注意：需求中存在滑坡谬误（A→B→C→D 的因果链未经证明）"
   - "注意：方案对比中存在虚假两难（只给了2个选项，实际有更多）"

2. **在任务 body 中附加谬误分析**，帮助 worker 更准确地理解需求

3. **常见谬误速查**：
   - 稻草人谬误 → 歪曲对方观点后攻击
   - 红鲱鱼 → 引入无关话题转移注意力
   - 诉诸人身 → 攻击人而非论点
   - 滑坡谬误 → 无证据的因果连锁推断
   - 虚假两难 → 只给两个极端选项
   - 乞题/循环论证 → 结论伪装成前提

---

## 十一、使用流程

```
Orchestrator 接收消息/任务
    ↓
[1] 判断决策类型（路由/拆解/分配/优先级/风险）
    ↓
[2] 查阅本指南对应章节，确定适用的认知框架
    ↓
[3] 读取 references/ 下对应文件，获取框架详细条目
    ↓
[4] 应用框架进行决策
    ↓
[5] 快速自检（§7 决策偏差清单）
    ↓
[6] 执行决策（创建任务/分配/路由）
    ↓
[7] 任务完成后收集反馈，优化路由规则（§8.2 反馈循环）
```

---

## 十二、东方智慧在 Orchestrator 决策中的应用

> **来源**：`eastern_wisdom.md`

| 智慧 | Orchestrator 应用 |
|------|-------------------|
| **上兵伐谋** | 路由判定时优先用规则/模式匹配，而非人工介入 |
| **知己知彼** | 了解每个 worker profile 的能力圈和负载状态 |
| **先胜后战** | 任务拆解时先确保条件充分再分配，避免 worker 卡住 |
| **避实击虚** | 将任务分配给负载最轻的 worker，而非最忙的 |
| **奇正相生** | 常规任务走标准流程（正），特殊任务走 triage（奇） |
| **中庸之道** | 不过度自动化（误路由风险），也不过度人工（效率低） |
| **知行合一** | 路由规则写到 rules.md 后必须在实践中验证执行 |
| **改善 Kaizen** | 持续优化路由关键词表和 assignee 映射 |

---

*集成指南版本: 1.0*
*创建时间: 2026-07-23*
*依赖: cognition-lattice v2.2 (1969条, 9维度)*
*适用 profile: orchestrator*
