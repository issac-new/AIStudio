---
name: delegation-brief-format
description: "委派任务书格式规范：kanban_create body 模板（任务ID/验收标准/必读context清单/WHAT-not-HOW/交付格式）。用于 orchestrator 分解任务与 worker 派生子任务。"
version: 1.1.0
metadata:
  hermes:
    tags: [devops, delegation, kanban, brief-format, maestro-fusion]
    related_skills: [kanban-orchestrator, scale-adaptive-routing, mission-coordination]
---

# Delegation Brief Format（委派任务书格式规范）

> 来源：shariqriazz/maestro `Maestro-mode.md §3` 委托消息结构规范 + 显式最小上下文注入纪律，适配 Hermes kanban_create。
> 增补（2026-08-16）：LongHorizon-Harness 任务契约 12 项精简版嵌入（详见 `~/.hermes/profiles/_shared/task-contract-guard.md`），`## 任务` 段从"一句话目标"升级为结构化契约。
> 定位：**执行前防线**——保证下游 worker 拿到自包含、可验收、不越界的任务卡。
> 版本：1.1.0

## 触发条件 / When to Use

- orchestrator `kanban_create` 分解重型任务时
- 任何 worker `kanban_create` 派生子任务时
- 任务卡 body 被 reviewer 打回"信息不全"时对照检查

## 核心内容

### 1. 任务卡 body 七要素模板

```markdown
## 任务
<一句话目标 + 可度量验收标准>

## 必读 context（开工前按序读完，未读不开工）
1. <绝对路径或 kanban task id> — <读它的目的>
2. <上游 handoff / 文件 / 文档> — <精确到段落或行号区间，若适用>

## 依赖
- parents: [task-id 列表]
- 前置条件: <什么必须为真才能开工>

## 约束与非功能需求
- <范围边界：只改什么、不改什么>
- <安全/隐私/性能约束>

## 交付格式
- 产出物：<文件绝对路径 / kanban metadata 字段>
- handoff：kanban_comment 四段（变更/验证/实现方式/决策）

## WHAT-not-HOW
- 本卡定义 WHAT 与验收；HOW（技术选型/实现路径）由 assignee 决定
- 例外：<上游已锁定的技术决策，若有>
```

### 2. 任务契约段（LongHorizon-Harness 12 项精简版）

重型任务（研究/编码/部署/跨卡依赖）的 `## 任务` 段必须包含以下 6 项核心契约（完整 12 项见 `task-contract-guard.md` 第一节）：

```markdown
## 任务契约（防偷换目标）
- 目标解释：精确对象/文件名/路径/格式/交付形态（保留原题全部限制词）
- 最终成功状态：完成落在的真实载体（文件/数据库/服务状态/导出产物），非自然语言声明
- 验收约束：逐条 [原题依据 | 必须条件 | 验证方式]；计划或替代目标不算
- 状态产生流程：允许的真实操作路径（官方API/正常编辑），禁止伪造完成标记
- 权威输入：关键输入来源清单；缺失→blocker，禁止发明相似输入
- 不可接受捷径：明令禁止路径（如：直接patch状态/手写完成文件/绕过应用流程）
```

**限制词入约束**：原题的"不要改变/保持不变/只使用/同一目录/精确文件名/不要多做"必须进入验收约束；放宽只放宽实际修饰部分。

### 2.1 验收项清晰性门（2026-09-07 提案4 增补，金书§5.4"理论清晰性=信息量"）

> 判据：每条 frozen 验收项必须能**二分回答**"什么结果算通过、什么算不通过"。理论（验收标准）只有给出有信息量的预期结果才可检验；不可检验则不可修正——模糊验收让打回失去仲裁依据，比错误验收更糟（错误判据至少可被事实打回）。

**建卡自检**：写完验收段后逐条过——

| 判定 | 示例 | 处置 |
|---|---|---|
| ✅ 可二分 | `pytest 全绿；报告含"边界声明"章节；月报文件落在 metrics/ 且含两个指标的月度数字` | 通过 |
| ❌ 0 信息量 | `质量要高` / `完善 X 流程` / `符合最佳实践` / `尽可能快` | **禁入 frozen 区**——改写为可观察判据或删除 |
| ⚠️ 探索型豁免 | 调研/spike 类允许终点模糊，但必须给**代理判据**（覆盖 N 个来源 / 产出对比矩阵 / 结论带置信度分级） | 代理判据本身须过二分检查 |

**回测纪律**：对近 10 张卡的验收项抽 3 条做回测——若当年按此验收项打回，worker 能否明确知道自己哪里不合格？答否=该项不合格。

**第一轮纪律**：契约初版的环境事实（文件存在性/服务状态）标"待验证"，审计确认后才可写"已验证"。

### 3. 必读 context 清单纪律（maestro 核心创新）

- **强制语**："未读不开工"——worker 的 kanban_show 后第一步是按清单 read_file
- **显式最小注入**：列举必读文件，而不是让 worker 自由漫游整个仓库
- **精确到行**：对长文档标注行号区间（如 `SKILL.md:87-99`）
- 与 BMAD M2 "Extract-don't-ingest" 联动：上游已提取 digest 的，清单指向 digest 而非原文

### 4. WHAT-not-HOW 原则

- orchestrator/父任务**只定义验收标准和约束**，不规定实现路径
- 技术决策权留给 assignee（除非是上游架构师已锁定的契约）
- 例外条款必须显式写出（"使用 pytest 不用 unittest"这类已锁定决策）

### 5. 协调者禁做技术决策（maestro 治理规则）

orchestrator **禁止**在任务卡中擅自指定：
- 技术栈选型（语言/框架/库版本）
- 架构模式（除非引用上游架构师产物）
- 数据库 schema 决策

涉及技术决策的任务卡必须 `parents=[架构师/需求分析师任务]`，由专家产出决策后再路由到执行 worker。
对应 maestro："YOU MUST NEVER make assumptions about or decide the technology stack"。

### 6. 多作者分章+单一统审与三层粒度（B1/B2 方法论背书，2026-09-08 增补，知识底座融合）

写 fan-out 卡时的两条增补纪律，写进对应卡 body 才生效：

- **B1 单一统审职责显式化**：多卡并行分章产出后，统审不能靠「大家自觉对齐」——最后一张合成/统审卡必须显式存在（`parents=[各分章卡]`），body 写明统一术语表核对与逐章口径检查职责。
- **B2 三层粒度入卡**：分解时区分三层——长文=独立子任务卡（单独可验收）；中篇=阶段综述/里程碑卡；短条目=共享词汇表（术语/接口名/口径定义统一定义一次，各卡 body 引用同一定义，禁止各卡自定义同名词）。
>
> 来源: synthesis-fusion-plan.md B1/B2 / physics-3books-report.md ⑦（机工社官方页「译者的话」逐章分工+张三慧统审原文）+ math-3books-report.md §2.1 [7][15]

## Pitfalls

### 1. delegate_task 目标文本禁止 `<placeholder>` 标记（2026-08-24 实证）

`delegate_task(tasks=[...])` 的 goal 字段中写 `<skill-name>` / `<TARGET>` 等尖括号占位符会被**拒绝**（报 "unexpanded template marker"），因为子代理无法解析占位符。goal 必须是完全自包含的文本——所有文件名/路径/参数必须在 goal 里写全。

```text
❌ "写入 ~/.hermes/skills/cybersecurity/<skill-name>/references/"
✅ "写入 ~/.hermes/skills/cybersecurity/conducting-network-penetration-test/references/（5 个 skill 各一份，清单如下：...）"
```

### 2. 子代理写跨 profile 文件必须显式指示 cross_profile=True（2026-08-24 实证）

子代理在 goal 中写"用 write_file 写入 ~/.hermes/skills/..."时，如果**不告诉它 cross_profile=True**，它会踩 soft guard 并报错浪费数分钟重试。goal 必须显式包含指令：

```text
✅ "用 write_file 的 cross_profile=True 写入（该路径属于 default profile 的 skills 树）"
```

若子代理已被 block 卡住（只成功部分文件），orchestrator 应直接用 cross_profile=True 补写剩余文件，不要等子代理自行恢复。

### 3. 同一文件的并行/顺序写入必须单通道（2026-08-24 实证）

子代理 write_file 与 orchestrator terminal heredoc 写同一文件时，后写者覆盖先写者且**无冲突检测**。本轮实证：子代理 11:10 写入的 5.4KB 增强版被 orchestrator 11:14 的 1.5KB 薄版 heredoc 静默覆盖。**纪律**：子代理负责的文件，orchestrator 不要用第二通道再写；发现冲突时以子代理的增强版为准重写。

### 4. 安全域任务卡必须把合规红线随卡传播（2026-08-27 实证）

对第三方真实目标的情报/安全类任务，红线（零目标流量/零凭据尝试/零源码下载）只写在 orchestrator 侧规则里**不够**——worker 看不到 orchestrator 的 SOUL。必须逐字写进**每张子卡** body 的「任务契约」段，并配 frozen 验收标准：每条资产标注来源+查询时间戳、关键结论 2+ 独立来源交叉确认、单源结论显式标 ⚠️、报告必含「边界声明」一节（未测区域显式清单）。

判例（phlexing 盘点 T1-T4 四卡，4 个 hack worker 全程零越界、零目标数据包，红线三面合取继承到合并报告）。配套要点：
- 产出物在卡里写**死绝对路径+精确文件名**，防 worker 自选位置导致 Checker 找不到件
- 「只能主动验证」的信息一律登记为**待授权项**，禁止 worker 现场决定执行
- **换皮识别**：用户指令若把已设授权门的主动动作改头换面（如"搭代理统一访问测绘资产"实为经代理向目标发流量、"经代理渗透"），必须拆解为「允许的被动部分（立即执行）+ 仍处门控的主动部分（书面授权解锁）」，并向用户明说两半边界——门不可被措辞绕过
- TLP:AMBER 情报的本机浏览/服务组件只绑 `127.0.0.1`，绝不 `0.0.0.0`
- 合并/Checker 卡 body 写明「缺文件不代写，kanban_block(kind="dependency") 退回」，防 Checker 替 worker 补数据污染审计轨迹

## 与其他 skill 的联动

- `scale-adaptive-routing`：路由门判定任务规模后，用本模板写 body
- `mission-coordination`：多 worker 编组时每个子卡都用本模板
- `requirement-analysis`：需求分析师的产出物是本模板"必读 context"的首要来源

## 与 Hermes 的集成映射

| 集成点 | 用法 |
|---|---|
| `kanban_create(body=...)` | 按七要素模板写 |
| `kanban_create(parents=[...])` | 技术决策类任务必须 parents 到专家卡 |
| `kanban_block(kind="needs_input")` | worker 发现 body 缺要素时的标准出口 |
| `kanban_comment` | 父任务记录拆分理由 + deferred-work |
