# 任务契约守卫协议（Task Contract Guard）

> 来源：LongHorizon-Harness（arXiv:2608.01964，AMAP-ML，MIT）MEA 循环融合，2026-08-16。
> 源码验证：`manager.py` / `prompt_texts.py` / `auditor_agent.py` / `claude_permissions.py`。
> 定位：**任务卡与验收的语义层防线**——防止“任务被改写成更容易完成的替代目标”与“看起来完成了”。
> 适用范围：所有 team 的重型任务（kanban_create 时写契约；kanban_complete 前跑反查）。

## 零、一页速览

```
写卡时（orchestrator）: 12 项契约 checklist → 任务卡 body
执行时（worker）:       状态标记 completed/pending/blocked/untrusted + 证据引用
验收时（reviewer）:     三行控制头 + 验收约束反查 + 工作区快照 diff
完成门:                三行控制头全部合格才允许 kanban_complete
```

## 一、任务契约 12 项 Checklist（kanban_create 时）

把原始用户请求落成**真实可执行、可验证的目标状态**。契约是跨轮稳定的语义锚点，不是执行计划，更不允许把任务改写成更容易完成的替代目标（“简化版”“只做前端”“先做个 demo”都是契约违规）。

| # | 项 | 必须写清 |
|---|---|------|
| 1 | 目标解释校准 | 原始请求的精确对象/文件名/字段/账户/路径/时间/格式/应用位置/用户角色/素材来源/交付物形态，逐项保留 |
| 2 | 已验证环境事实 | 第 1 轮的桌面/文件/网页/应用/服务事实标“待验证”，只有审计者或直接环境证据确认后才可写“已验证” |
| 3 | 待验证假设列表 | 保持显式列表，未确认前标"待验证"，禁止把假设混入事实 |
| 4 | 最终成功状态 | 用户/目标应用/下游流程会**真实消费**的状态形态 |
| 5 | 验收约束 | 逐条写：原题依据、必须成立的条件、验证方式、阻断条件。计划/模型猜测/更容易的替代目标**不是**验收约束 |
| 6 | 状态载体 | 完成落在哪个真实载体：保存的应用状态/数据库/工程文件/导出文件/服务状态/目标文件 |
| 7 | 权威输入闭包 | 任务给定文件/邮件/网页/用户回答等关键输入的明确来源；缺失→澄清或 blocker，禁止发明相似输入/默认值/替代素材 |
| 8 | 状态产生流程 | 关键状态由真实应用操作/官方 API/正常文件编辑/用户确认产生；禁止伪造完成标记、手写替代文件 |
| 9 | 提交/持久化边界 | Save/Submit/Export/Send/Finish 类任务，“字段已填/预览正确/草稿 ready/文件已打开”≠完成；必须确认真实持久化 |
| 10 | 候选污染边界 | 存在旧文件/错误导出/草稿/多 tab 等候选时，必须证明被消费的是正确候选；错误候选需真实流程清理/覆盖/失效 |
| 11 | 可接受证据 | 什么算证据（测试输出/构建退出码/file:line/数据库行/真实应用截图） |
| 12 | 不可接受捷径 | 明令禁止的路径（例：直接 patch 状态、伪造日志、手写“完成”文件、绕过应用工作流） |

**限制词入约束**：原始请求中的“不要改变/保持不变/只使用/必须保存/同一目录/精确文件名/不要遗漏/不要多做/其它部分不变”必须进入验收约束；放宽只能放宽实际修饰的部分，不能吞掉另一个独立硬约束。

**第一轮纪律**：契约初版可根据请求写目标假设，但环境事实必须标“待验证”。

## 二、最终状态语义守卫 5 条（验收时）

1. **最终状态载体**：完成必须落在用户/目标应用/下游流程会真实消费的状态载体上（保存的应用状态、profile/session、数据库、工程文件、导出文件、服务状态、目标文件）。自然语言声明、过程截图、临时日志、手写替代文件**不能**替代最终状态。
2. **权威输入闭包**：关键输入必须来自真实环境或明确来源。缺失/冲突/不足→澄清、恢复或报 blocker；不能发明相似输入、默认值、替代素材。
3. **状态产生流程**：关键状态由真实应用操作、官方 API/CLI、正常文件编辑、服务配置或用户确认产生；不能伪造应用完成标记、直接 patch 只有应用流程才应产生的状态。
4. **提交/持久化边界**：涉及 Save/Submit/Apply/Export/Send/Finish、创建记录、配置生效或文件写出的任务，不能停在“字段已填、预览正确、草稿 ready、文件已打开”；必须确认真实持久化发生。
5. **候选污染**：存在旧文件、错误导出、草稿、旧记录、多个 tab/origin/session、相似路径或多个候选产物时，必须确认最终被消费的是正确候选；错误候选应被真实流程清理、覆盖、撤回、失效，或证明不会被消费。

## 三、验收约束反查协议（reviewer 完成门）

> 核心立场：**不默认任务契约正确**。审计前先从原始任务独立重建并挑战验收约束。

reviewer 输出必须包含 `验收约束反查:` 段，含：

1. `契约结论:` aligned / needs_revision / invalid / unknown —— 只有 aligned 允许 complete
2. `原题约束清单:` 至少覆盖最终消费者/状态载体、权威输入、候选选择、字段值、文件/路径/附件、保存/提交/持久化、格式/样式/精确文本/单位/精度、不能改变/不能遗漏/不能多做、非目标保持、禁止捷径
3. `契约覆盖检查:` 指出遗漏、弱化、写歪或矛盾
4. `逐项反查:` 每条约束写：约束内容、原题依据、是否 blocking、独立证据、verified / unknown / violated / not_applicable。**契约自述和 worker 自述不是独立证据**
5. `阻断约束:` 列出所有 blocking 且 unknown/violated 的约束，没有则写“无”
6. `可能评分风险:`、`过窄或错误解释:`、`建议契约修订:`

裁决规则（机械）：
- 任何 blocking unknown → 契约结论 unknown
- 任何 blocking violated → needs_revision 或 invalid
- 存在阻断约束或契约结论 ≠ aligned → 即使局部子任务成功也必须输出 incomplete

## 四、证据时间范围规则（防审计膨胀）

> 目的：审计要严，但**严在正确的时间维度上**，不能把审计变成不可能任务。

| 规则 | 内容 |
|---|---|
| 约束分三类 | 持久化最终状态约束 / 可观察过程约束 / 安全合规来源约束，分别校准证据范围 |
| 不得加强措辞 | “最终不要留下额外文件”不能被加强成“必须证明历史上从未发生任何临时动作” |
| 缺轨迹≠篡改 | 缺少 worker 完整命令记录**本身不是**篡改证据，不能单独导致 integrity suspect；只有正面矛盾、来源冲突、伪造证据、意外产物或禁用动作的直接证据才用 suspect/violation |
| 不可观察的历史否定 | 默认非阻断残余风险；只有原题明确要求该过程保证或契约执行前安排了权威监控时才可设 blocking |
| 禁追溯性重复执行 | 不得仅为证明“历史上未发生”而要求重复执行；过程证据重要→建议前置监控，否则独立验证当前持久化状态 |
| 审计者自加要求无效 | reviewer/manager 自行增加、但无法从原题推出的谨慎要求，不能制造新的 blocking 条件 |

## 五、三行控制头协议（reviewer 输出格式）

reviewer 验收报告**前三行必须严格是**（缺头=harness 拒绝解析，不接受正文补救）：

```
状态: complete | incomplete | blocked
完整性: clean | suspect | violation
契约审计: aligned | unknown | needs_revision | invalid
```

裁决矩阵（机械，无 LLM 判断）：
- `状态: complete` 且 `完整性: clean` 且 `契约审计: aligned` → 允许 kanban_complete
- `完整性: violation` 或 `契约审计 ≠ aligned` 时报 complete → **强制降级 incomplete**（`auditor_agent.py:279` 同款逻辑）
- 缺前三行控制头 → harness 注入合成报告（`_invalid_control_header_report`，控制头为 blocked/suspect/unknown），按 unknown 处理
- `状态: blocked` → `kanban_block(kind="needs_input")`
- `状态: blocked` 且原因是能力不足 → `kanban_block(kind="capability")`

## 五b、轮次预算规则（manager/orchestrator）

只剩 1 轮（或 1 次机会）时：
- 禁止安排纯前置子任务（“先做个准备步骤，正事下轮再说”）
- 必须路由当前可完成的**最完整可执行子任务**
- 无法诚实完成时用 ask / blocked，禁止为了用完预算而编排凑数轮次

## 五c、GUI/CLI 路由判据（orchestrator）

| 判据 | 路由 |
|---|---|
| 真实屏幕/窗口/页面/鼠标键盘/可见状态变化 | GUI executor（computer_use） |
| shell/文件/代码/测试/日志/数据/服务/非视觉诊断 | CLI executor（terminal/code） |
| **工具不是路由边界** | 判断依据是“状态变化的类型”，不是“哪个工具顺手” |

GUI 失败且指向服务/数据/代码/profile/日志/回调约束 → 下一轮优先 CLI 诊断/修复前置。

## 六、Hermes 集成映射

| 集成点 | 用法 |
|---|---|
| `kanban_create` | 重型任务 body 按第一、二节写契约（可引用本文件而不全文粘贴） |
| worker 执行中 | `Current task state:` 段维护 completed/pending/blocked/untrusted 四态 + 证据引用（file:line / 测试输出 / kanban comment id） |
| `kanban_complete` 前 | reviewer 按第三节跑反查 + 按第五节出三行控制头 |
| `adversarial-review-lens` | lens 输出加挂三行控制头 + 反查段 |
| `pua-harness-governance` | 四权分离中"评分权"的证据标准 = 本文件第二节守卫 |
| `workspace_audit.py` | 审查任务跑快照 diff，机械检测 added/changed/deleted/type_changed |
| `delegation-brief-format` | 七要素模板升级：`## 任务` 段 = 12 项契约的 6 项核心精简版 |

## 七、源码出处（溯源）

| 机制 | 文件:行 |
|---|---|
| 契约规则正文 | lh_harness/prompt_texts.py TASK_CONTRACT_RULES（en/zh 全文） |
| 最终状态守卫 | lh_harness/prompt_texts.py FINAL_STATE_SEMANTIC_GUARD |
| 反查协议 | lh_harness/prompt_texts.py AUDITOR_CONTRACT_BACKCHECK |
| 三行控制头解析 | lh_harness/auditor_agent.py:22-44 正则 + :279 强制降级 |
| 轮次预算规则 | lh_harness/role_prompts.py build_role_manager_prompt |
| GUI/CLI 路由判据 | lh_harness/prompt_texts.py MANAGER_INSTRUCTIONS 第4条 |
| 工作区快照 diff | lh_harness/adapters/claude_permissions.py:120-195 |
