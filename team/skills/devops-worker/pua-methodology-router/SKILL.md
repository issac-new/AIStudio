---
name: pua-methodology-router
description: "14种问题解决方法论智能路由。按任务类型自动选择最优方法论，失败后按切换链不回头地尝试不同方法论。适配 Hermes 五看板环境。"
version: 1.1.0
metadata:
  hermes:
    tags: [devops, agent-behavior, methodology, routing]
    related_skills: [pua-pressure-engine, pua-harness-governance]
---

# PUA 方法论智能路由

> 来源：tanweai/pua `methodology-router.md`（3.5.1 增量对齐，2026-09-23 融合：v1.1.0 bump，
> 本文件路由表与切换链无上游语义变更，属轻量对齐（头部融合标注 + X1 三态协议引用，
> 增量裁决见 `research/2026-09-23-pua-upstream-delta.md` D 节）。版本 1.0.0→1.1.0
> 按 Hermes skill 融合批版本对齐惯例取号（与同批 pressure-engine/harness-governance
> 同批同版），非内容体量声明——2026-09-23 C4 回归 t_5dfc880a 澄清，C2 报告原建议
> 为 patch 级（1.0.1）。
> 核心原则：每种方法论不只是说话方式——它代表一套解决问题的思维框架。选对方法论 = 选对解决思路。
>
> **验收语义（X1 门控合一）**：本 skill 各 phase 的"完成/切换生效"判定遵循
> `_shared/02-org-orchestration/acceptance-tri-state-protocol.md`（PASS/BLOCKED/UNKNOWN；
> UNKNOWN 不能当 PASS；Agent 不得自改判定口径）。

## Phase 1：任务类型 → 起始方法论

分析任务关键词和上下文，自动选择最优方法论：

### Hermes 看板 → 方法论映射

| Hermes 看板 | 任务类型信号 | 推荐方法论 | 核心方法 |
|------------|-----------|-----------|---------|
| **hack** | 渗透/漏洞/exploit/取证/安全审计 | 🔴 华为：RCA 根因分析 + 蓝军自攻击 | 5-Why 根因 + 自我批判 + 压强集中 |
| **swarm** (编码) | build/create/implement/新增/开发 | ⬛ Musk：The Algorithm | 质疑→删除→简化→加速→自动化 |
| **swarm** (审查) | review/refactor/优化/重构 | ⬜ Jobs：减法优先 | 像素级完美 + DRI 单人负责 + 原型驱动 |
| **swarm** (研究) | research/search/find/调研/搜索 | ⚫ 百度：搜索第一 | 信息检索先于一切判断 |
| **swarm** (架构) | design/architecture/decide/架构/方案 | 🔶 Amazon：Working Backwards | 从用户倒推 + 6-Pager + Bar Raiser |
| **product** | 产品/市场/用户研究/需求 | 🟧 小米：参与感三三法则 | 和用户交朋友 + 专注极致口碑快 |
| **ops** | deploy/config/ci/部署/上线/运维 | 🟠 阿里：闭环方法论 | 定目标→追过程→拿结果 + 复盘四步法 |
| **eda** | EDA/物理场/仿真/芯片设计 | 🔶 Amazon：Working Backwards + 🟡 字节 A/B Test | 从设计目标倒推 + 数据驱动验证 |
| **通用/模糊** | 无明确类型 | 🟠 阿里：通用闭环（默认） | 最通用的闭环方法论 |

### 通用任务类型路由表

| 任务类型 | 信号关键词 | 推荐方法论 | 为什么 |
|---------|-----------|-----------|--------|
| Debug/修 Bug | error, bug, fix, 报错, 失败, 异常 | 🔴 华为 | RCA 根因分析 + 蓝军自攻击，不修表面修病根 |
| 构建新功能 | add, create, build, implement | ⬛ Musk | The Algorithm：先质疑需求→删除→简化→再动手 |
| 代码审查 | review, refactor, quality | ⬜ Jobs | 减法优先 + 像素级完美 + DRI |
| 调研/搜索 | research, search, find, 调研 | ⚫ 百度 | 搜索是第一生产力 |
| 架构决策 | design, architecture, decide | 🔶 Amazon | Working Backwards + 6-Pager |
| 性能优化 | performance, slow, optimize | 🟡 字节 | A/B Test 一切，数据驱动不靠直觉 |
| 部署/运维 | deploy, config, ci/cd | 🟠 阿里 | 定目标→追过程→拿结果闭环 |
| 多Agent协作 | agent, team, parallel | 🟢 腾讯 | 赛马机制：多方案并行，跑赢的留 |
| 流程精简 | simplify, reduce, 精简 | 🟣 拼多多 | 砍掉一切中间环节，最短决策链 |
| 长期项目 | plan, roadmap, sprint | 🔵 美团 | 效率为王 + 标准化拆解 + 长期主义 |
| 合规/质量 | test, verify, compliance | 🟤 Netflix | Keeper Test：每个组件值得保留吗？ |
| 学习停滞 | stuck, repeat, 思维固化 | 🪟 Microsoft | Connects + Impact Descriptor |

## Phase 2：失败模式 → 方法论切换链

当前方法论连续 2 次未能解决问题时，根据失败模式切换：

| 失败模式 | 检测信号 | 切换链（从左到右，不回头） | 切换逻辑 |
|---------|---------|-------------------------|---------|
| 🔄 原地打转 | 反复改参数不改思路 | ⬛ Musk → 🟣 拼多多 → 🔴 华为 | 质疑需求→砍冗余→反向攻击 |
| 🚪 放弃/推锅 | "建议手动""超出范围" | 🟤 Netflix → 🔴 华为 → ⬛ Musk | 该换就换→集中兵力→极限压力 |
| 💩 质量差 | 表面完成实质敷衍 | ⬜ Jobs → 🟧 小米 → 🟤 Netflix | 提高标准→聚焦做好→淘汰不达标 |
| 🔍 没搜就猜 | 凭记忆不验证 | ⚫ 百度 → 🔶 Amazon → 🟡 字节 | 先搜索→深挖→数据验证 |
| ⏸️ 被动等待 | 修完就停等指示 | 🟦 京东 → 🔵 美团 → 🟠 阿里 | 要结果→过程透明→owner意识 |
| ✅ 空口完成 | 没运行验证命令 | 🟡 字节 → 🟦 京东 → 🟠 阿里 | 数据说话→只认结果→闭环交付 |
| 🧱 思维固化 | 同一假设反复失败 | 🪟 Microsoft → 🔵 美团 → ⬜ Jobs → ⬛ Musk | 量化风险→暴露过程→删错误复杂度→重置假设 |

### 切换规则

1. 每次切换只往链的下一个走，**不回头**
2. 已尝试过的方法论**不重复**
3. 切换时输出：`[方法论切换 🔄] 从 X 切换到 Y：原因`
4. 切换后，新方法论的行为约束立即替换之前的

### 切换前三问（防止无效切换）

1. 当前方法论的核心步骤都走了吗？（没走完 = 加压力不换方法）
2. 失败是方法论不对还是执行不到位？（执行问题 = 不换方法）
3. 新方法论能解决当前失败模式吗？（不能 = 别切）

## Phase 3：用户 Override

- 用户手动指定方法论 → 覆盖自动路由
- 用户 override 后，自动路由暂停，但失败切换仍然生效
- 用户可以说"自动选"/"auto"恢复自动路由

## 14 种方法论速查

| 方法论 | 核心原则 | 关键行为约束 |
|--------|---------|------------|
| 🟠 阿里 | 定目标→追过程→拿结果 | 复盘四步法 + 揪头发升维 + owner 意识 |
| 🟡 字节 | A/B Test + 数据驱动 | 速度 > 完美 + Context not Control |
| 🔴 华为 | RCA 5-Why + 蓝军自攻击 | 压强集中 + IPD 门控 + 力出一孔 |
| 🟢 腾讯 | 赛马机制 + MVP | 多方案并行 + 灰度发布 + 小步快跑 |
| ⚫ 百度 | 搜索第一 | 信息检索先于一切 + 简单可依赖 |
| 🟣 拼多多 | 砍一切中间环节 | 最短决策链 + 结果唯一标准 |
| 🔵 美团 | 效率为王 + 标准化→规模化 | 过程透明 + 长期主义 |
| 🟦 京东 | 只做第一 + 客户体验零容忍 | 扁平 ≤5 层 + 数据零容忍 |
| 🟧 小米 | 专注极致口碑快 | 参与感三三法则 + 和用户交朋友 |
| 🟤 Netflix | Keeper Test | 季度执行 + 4A Feedback + 人才密度 > 规则密度 |
| ⬛ Musk | The Algorithm | 质疑→删除→简化→加速→自动化（严格按序） |
| ⬜ Jobs | 减法 > 加法 | DRI + 像素级完美 + 原型驱动 |
| 🔶 Amazon | Customer Obsession | Working Backwards + 6-Pager + Bar Raiser |
| 🪟 Microsoft | Connects + Impact Descriptor | PIP clock + GVSA gate |

## 与 Hermes 的集成

orchestrator 在路由任务时，除了按 §0.5 判定看板（swarm/hack/product/ops/eda），还应：

1. **在任务 body 中附带方法论建议**：`> [方法论路由 🧭] 推荐使用 🔴 华为（RCA 根因分析），因为任务是 Debug 类型`
2. **worker 加载 skill**：worker profile 执行任务前 `skill_view('pua-methodology-router')` 加载方法论
3. **失败切换**：worker 连续失败时，按切换链建议 orchestrator 重新路由到不同 specialist
