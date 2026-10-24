---
name: longhorizon-harness-research
description: "LongHorizon-Harness 调研存档：MEA 循环、任务契约守卫、审计反查与工作区快照防伪。"
version: 1.0.1
author: orchestrator
license: MIT
metadata:
  hermes:
    tags: [devops, research, agent-behavior, architecture, reference]
    related_skills: [deepseek-harness-research, open-source-skill-fusion-v2, pua-harness-governance, adversarial-review-lens]
---

# LongHorizon-Harness (LHH) 调研存档

## When to Use

- 执行融合方案 P0-P3（起草 `_shared/task-contract-guard.md`、patch 审查类 skill、写 workspace 快照脚本）前，先读本存档附录的协议原文
- 用户再提 LongHorizon-Harness / MEA 循环 / 任务契约 / arXiv:2608.01964 / AMAP-ML 时
- 调研同类 harness/loop-engineering 项目（DeepSeek Harness、JiuwenSwarm 等）时作对比基线
- 设计 kanban 审查协议、goal_mode 判官输出格式时借鉴三行控制头与验收反查

> 调研日期：2026-08-16。来源：PaperAgent 公众号文章《DeepSeek Harness刚开源，阿里长程Harness也来了》+ arXiv:2608.01964 + GitHub 源码全读（codeload tarball，1450 文件）。
> 状态：**P0-P3 已执行并经蓝军对抗审查（4 WARNING 全部闭环）+ 端到端 smoke test 通过（2026-08-16）**。产物：`_shared/task-contract-guard.md` + adversarial-review-lens v1.1.0（含 workspace_audit.py）+ delegation-brief-format v1.1.0 + orchestrator_rules §0.5.2bis + shared-rules-reference 索引登记。smoke test：leaf 子代理凭任务卡指引独立走完 读协议→快照→只读审查→diff→三行控制头+反查 全流程，/tmp/lhh 1712 records 快照 diff clean（exit 0），七项验收约束逐项 verified。可见性：P0 协议 27/27 profile 经 shared-rules-reference 可达；两个 patched skill 按角色补链（worker-coder/worker-researcher/[已移除]/[已移除]-orchestrator→delegation-brief-format，product-manager→adversarial-review-lens）。

## 转译忠实性 pitfalls（蓝军审查抓到的，写协议文档时必读）

1. **近形字概念腐化**：把源码「待验证假设」写成「常验证假设」——一字之差语义反向。
   协议文档落盘后必须对照源码逐词校对关键术语，不能只校对结构条数。
2. **门效果等价 ≠ 忠实**：缺控制头时源码注入的是 `blocked/suspect/unknown`，
   不是 `invalid`（两者都阻断 complete，但语义不同；reviewer 会照抄错值）。
3. **行号引用会漂移**：文档里写的 `file.py:120-195` 实际函数体可能是 105-198，
   引用行号时留 ±15 行余量意识，别把行号当精确断言。
4. **参数阈值要声明改动**：源码 digest 阈值 4MB→融合版 8MB 属等价改动，
   但自称"对齐源码"就必须注明差异，否则忠实性审查打回。

## 仓库基本信息

| 维度 | 数据 |
|------|------|
| 全名 | `AMAP-ML/LongHorizon-Harness`（阿里高德 AMAP-ML 团队） |
| 论文 | arXiv:2608.01964（HF Daily Papers 2026-W32 周榜 #1），MIT |
| 安装 | `uv tool install lh-harness`；Python ≥3.10；后端需 claude/codex/dsh 之一在 PATH |
| 定位 | **Loop Engineering 层**：包在 Claude Code / Codex / dsh 外面的长程任务状态管理 harness，不替换后端 agent loop |
| 基准 | WeaveBench 51.8→80.7（Qwen3.7-Plus）；OSWorld 2.0 2.8→8.3（3×）；Terminal-Bench 2.1 69.7→77.2 且省 24% token；Opus 4.7 子集 20.0→34.3 |

## 核心理念：长程任务 = 任务状态管理问题

- **MEA 循环**：Manager（不碰环境，持状态）→ Executor（每轮全新上下文，轨迹丢弃只留报告）→ Auditor（只读+篡改检测）→ 状态更新 → `execute/done/blocked/ask`
- **铁律**：Executor 自我声明不改持久状态；只有干净审计证据支持才能标 completed
- 三角色是**实现边界**不是三个独立 agent；每角色可独立配模型/后端/预算（manager 600s / executor 1800s / auditor 600s，`[run.roles.*]` 配置链 gui_executor→executor→[run]）
- 任务状态三类记录：Requirement / Artifact / Fact，标记 completed/pending/blocked/untrusted 并保留审计证据引用（如 `round_003`）

## 源码级实现要点（文章没写、读码才能拿到的）

1. **三行控制头协议**（auditor_agent.py:25-35）：Auditor 前三行强制 `Status: complete|incomplete|blocked` / `Integrity: clean|suspect|violation` / `Contract audit: aligned|unknown|needs_revision|invalid`；缺头 harness 拒绝解析并合成 repair 信号——宁 unknown 不猜
2. **任务契约 12 项 checklist**（prompt_texts.py TASK_CONTRACT_RULES）：目标解释校准/已验证事实/待验证假设/最终成功状态/验收约束/状态载体/权威输入闭包/状态产生流程/提交持久化边界/候选选择与污染边界/可接受证据/不可接受捷径
3. **最终状态语义守卫 5 条**（FINAL_STATE_SEMANTIC_GUARD）：完成必须落在真实被消费的载体；权威输入闭包；状态产生流程（禁伪造完成标记）；提交/持久化边界（"预览正确/草稿ready"≠完成）；候选污染（错误候选文件必须被真实流程清理）
4. **验收约束反查**（AUDITOR_CONTRACT_BACKCHECK）：不默认契约正确，从原题独立重建约束清单→逐项标 verified/unknown/violated/not_applicable→任何 blocking unknown 强制 incomplete；契约自述和 executor 自述不算独立证据
5. **证据时间范围规则**（审计克制条款）：缺完整轨迹≠篡改证据；不可观察的历史否定=非阻断残余风险，除非原题明确要求过程保证
6. **工作区快照 diff**（claude_permissions.py:120-195）：Auditor 运行前后 scandir 全量扫描（含 symlink/mtime_ns/小文件 digest），任何 added/changed/deleted/type_changed → `integrity violation`，报告作废。纯代码层，不靠提示词
7. **角色权限矩阵**：Manager/FinalResponse 禁 Bash+Write+Agent+MCP；Auditor 禁 Write+Agent 且 workspace 只读；仅 Executor 挂 computer-use MCP
8. **轮次预算规则**：剩 1 轮禁安排纯前置子任务，必须路由最完整可执行子任务或诚实 ask/blocked；Manager 输出 done 但最近 auditor 三行不全绿 → harness 打回（合成 invalid_completion 反馈回灌下一轮）
9. **GUI/CLI 路由判据**：可见状态（屏幕/窗口/页面/鼠标键盘）→GUI；shell/文件/代码/测试/日志/服务诊断→CLI；**"工具不是路由边界"**
10. **AgentAdapter / Environment 协议**：adapter 保留后端原生 loop，harness 只控输入上下文/工具/权限/预算/报告；Environment = exec/screenshot/upload/download 四方法 Protocol

## token 分配（论文数据）

Manager 仅占 2.0-8.1%，Auditor 占 19-38%（框架主要新增成本）；每任务输出 token 28.9K→104K 但任务级上限被抬高。Qwen 基线 ≤0.04 的 6 任务全部恢复到 0.30-0.92——**框架主要抬失败下限**。Qwen+LHH(0.733) > Opus+原版 Claude Code(0.680)。收益最大：需跨长轨迹保存/检查/修订多个相互依赖状态的任务；收益小：瓶颈在单步能力（视觉/数学/算法）的任务。

## 对 Hermes 基线去重矩阵（2026-08-16 快照）

| LHH 机制 | Hermes 现状 | 判定 |
|---------|-----------|------|
| MEA 三角色拓扑 | orchestrator→worker→审查 delegate | 已有，映射即可 |
| 每轮失忆 Executor | kanban 每次新会话 | 已覆盖 |
| Next:ask 澄清通道 | kanban_block(needs_input) | 已覆盖 |
| 四权分离 | pua-harness-governance | 已覆盖 |
| 任务契约 12 项 | delegation-brief-format 仅部分项 | **缺口 → P0** |
| 最终状态守卫 5 条 | 无 | **缺口 → P0** |
| 证据时间范围规则 | 无 | **缺口 → P0** |
| 验收反查协议 | adversarial-review-lens 有 lens 无结构化协议 | 半缺口 → P1 |
| 三行控制头 | goal_mode 判官无输出协议 | 半缺口 → P1 |
| 工作区快照 diff | 无 | **缺口 → P2（可脚本化）** |
| 轮次预算规则 | goal_max_turns 有预算无此规则 | 小补 → P3 |
| GUI/CLI 路由判据 | 无显式规则 | P3 |

## 融合方案（已提出、**待验收、未执行**）

- P0：`~/.hermes/profiles/_shared/task-contract-guard.md`（契约12项+守卫5条+反查协议+证据时间范围规则，四合一）
- P1：`adversarial-review-lens` 补三行控制头+逐项反查输出格式；`delegation-brief-format` 升级 12 项契约模板
- P2：`workspace_audit.py` 快照 diff 脚本（照抄算法：scandir+symlink+mtime_ns+digest，~100行）
- P3：orchestrator_rules.md 补 GUI/CLI 路由判据+轮次预算规则

## 调研方法与坑

- 微信文章：curl(浏览器 UA) → `og:title` meta + `js_content` div regex 提正文；**mmbiz 图片必须带 `Referer: https://mp.weixin.qq.com/` + 浏览器 UA 才能下载**（直接把原始 URL 给 vision 工具会 400 防盗链）
- 本机 git clone 大仓库易被 conda git 包装器劫持/超时：降级链 `/usr/bin/git --depth 1` → codeload tarball；tar 报 `truncated gzip input` = curl --max-time 截断下载（90s 只下 29MB/100MB），加长时限完整重下
- 深入阅读路径：manager.py(2241L 主循环+human gate) / prompt_texts.py(全部协议原文) / auditor_agent.py(859L 解析+完整性) / claude_permissions.py(角色权限+快照diff) / types.py(预算+数据结构)
- ⚠️ skill_manage 坑（本次实测）：`create` 可写 devops 软链共享树，但后续 `patch`/`write_file` 按 profile 归属解析 name 会拒绝（"not found in active profile"）；如需补 references 文件须在 default profile 会话操作或文件工具 cross_profile

## 附录：协议原文（中译，P0 起草直接素材）

### A1. 任务契约规则（TASK_CONTRACT_RULES）

- 任务契约是跨轮维护的语义锚点，把原始任务落成真实可执行、可验证的目标状态；不是执行计划，也不能改写成更容易的替代目标。
- 必须保留原始任务中的精确对象、文件名、字段、账户、路径、时间、格式、应用位置、用户角色、素材来源和交付物形态。
- 第一轮可写目标假设，但桌面/文件/网页/应用/服务的当前事实必须标为待验证；只有 auditor 或真实环境证据确认后才是已验证事实。
- 目标状态、权威输入或最终状态载体不清楚时，优先派探索/读取/观察/等待/询问用户的子任务，不要提前修改最终对象来押注某个解释。
- 验收约束必须从原始任务和真实环境事实直接推出，逐条写清：原题依据、必须成立的条件、验证方式、阻断条件。执行计划/模型猜测/更容易的替代目标不能充当验收约束。
- 限制词必须进验收约束："不要改变/保持不变/只使用/必须保存/同一目录/精确文件名/不要遗漏/不要多做/其它部分不变"；修饰性放宽只能放宽它实际修饰的部分，不能吞掉另一个独立硬约束。
- 每条限制校准到正确的证据时间范围。"最终不要留下额外文件"不能被加强成"历史上从未发生任何临时动作"；只有原题明确要求"任何时刻都不得"/全过程监控/安全/合规/来源追踪时，历史过程才是 blocking。
- 不能把事后无法完成的历史否定证明设为前置条件。确需过程保证应在执行前规划可观察证据（权威事务日志/监控）；否则验证持久化最终状态，把不可观察的历史可能性记为非阻断残余风险。

### A2. 最终状态语义守卫（FINAL_STATE_SEMANTIC_GUARD，5 条）

1. **最终状态载体**：完成必须落在用户/目标应用/下游流程真实消费的状态载体上（应用保存状态、profile/session、数据库、工程文件、导出文件、服务状态、目标文件）；自然语言说明、过程截图、临时日志、手写替代文件不能替代。
2. **权威输入闭包**：给定文件/邮件/网页/用户回答/session/数据库初始状态必须来自真实环境或明确来源；缺失、冲突、不足时先澄清/恢复/报阻塞，不能生成相似输入、默认值或替代素材。
3. **状态产生流程**：关键状态由真实应用操作、官方 API/CLI、正常文件编辑、服务配置或用户确认产生；不能伪造应用完成标记、手写日志、直接 patch 只有应用流程才应产生的状态。
4. **提交/持久化边界**：Save/Submit/Apply/Export/Send/Finish、创建记录、配置生效或文件写出的任务，"字段已填/预览正确/草稿 ready/文件已打开"都不是完成；必须确认真实应用已保存/提交/导出/发送/应用/持久化。
5. **候选污染**：可能存在旧文件、错误导出、草稿、旧记录、多个 tab/origin/session、相似路径或多个候选产物时，必须证明最终被消费的是正确候选；错误候选应被真实流程清理、覆盖、撤回、失效，或证明不会被消费。

### A3. Manager 协议（MANAGER_INSTRUCTIONS 要点）

- 职责仅任务拆解+下一步调度；不执行、不改文件、不点 GUI、不跑命令。
- 输入=原始任务+稳定任务契约+上轮当前任务状态+全部历史 auditor 报告原文（auditor 报告是可信中间状态的权威来源）。
- 状态规则：每轮写 `Current task state:`（Completed/Incomplete/Blockers·Risks/Untrusted·Do not reuse），每条事实引用 auditor 轮次（如 round_003），无审计证据标 unverified，**绝不提升 executor 未审计的自称**。
- 依赖规则：路由前写 `Dependency assessment:`（目标状态/状态创造者 GUI·CLI·CLI+GUI/已满足前置/未满足前置/路由理由）；只有已审计的前置算满足；有未满足前置时子任务先解决最重要的前置而非最终交付物。
- 完成条件：仅当最近 auditor 前三行为 `Status: complete` + `Integrity: clean` + `Contract audit: aligned` 且正文支持所有原始要求时才能输出 done（harness 会机械校验，否则打回）。
- 输出纯自然语言非 JSON，固定节序：`Current task state:` → `Task contract:` → `Dependency assessment:` → 恰好一个路由 `Next: gui|cli|ask|done|blocked`。
- gui/cli 需带 `Task:` / `Acceptance criteria:` / `Related audit reports:`（轮次id+理由）/ `Boundaries:`。

### A4. Auditor 三行控制头 + 报告节

前三非空行必须严格是：
```
Status: complete|incomplete|blocked
Integrity: clean|suspect|violation
Contract audit: aligned|unknown|needs_revision|invalid
```
随后：审计事实、证据、缺口、下一步、可信/不可信产物、`Acceptance-constraint backcheck:`、`State update for manager:`。
只读约束：不创建/修改/移动/删除任务文件；Read/Glob/Grep + 少量受控只读 shell；Computer Use 仅观察/截图，绝不点击输入滚动拖拽；发现伪造产物只报告，绝不修复移动删除。GUI auditor 额外校验截图 `.meta.json` 的 `capture_source=real_screen`。
Harness 机械层：缺有效控制头 → 拒绝猜测，合成 invalid_header 反馈回灌；检测到 auditor 期间 workspace 变更 → integrity violation，报告作废。

### A5. 验收约束反查（AUDITOR_CONTRACT_BACKCHECK）

- 不默认契约正确；审计执行结果前先从原始任务独立重建并挑战验收约束。
- `Contract conclusion:` 只能 aligned/needs_revision/invalid/unknown 且与第三控制行一致；只有 aligned 允许 complete。
- `Original constraint inventory:` 覆盖：最终消费者/状态载体、权威输入、候选选择、字段值、文件/路径/附件、保存/提交/持久化、格式/样式/精确文本/单位/精度、不能改变/不能遗漏/不能多做、非目标保持、禁止捷径。
- `Per-constraint backcheck:` 每条写约束内容、原题依据、是否 blocking、独立证据、verified/unknown/violated/not_applicable。**契约自述和 executor 自述不是独立证据**。
- 任何 blocking unknown → 契约结论 unknown；任何 blocking violated → needs_revision 或 invalid。存在阻断约束或契约审计非 aligned 时，即使局部子任务成功也必须 incomplete。
- 证据时间范围规则：区分持久化最终状态约束/可观察过程约束/安全合规来源约束；缺 executor 完整 transcript 本身不是篡改证据，不能单独导致 suspect；不可观察的历史否定=非阻断残余风险（除非原题明确列为重要条件或契约执行前安排了权威监控）；不得仅为证明不可观察的历史"未发生"而要求重复执行——过程证据重要时建议前置监控，否则独立验证当前持久化状态、候选身份、精确值、无持久化污染。

### A6. 工作区快照 diff 防伪（claude_permissions.py 算法，供 P2 脚本化照抄）

- 审计 episode 前后各做一次全量扫描：os.scandir 遍历（跳过 harness 自有目录），每路径记录 (类型, mode, size, mtime_ns, digest[小文件], symlink 目标)。
- diff 出 added/changed/deleted/type_changed → `verifier_workspace_mutation_detected=True` → integrity violation，该 auditor 报告不能支撑任何 completed。
- 角色权限（Claude 后端 deny-list 实现）：manager/final_response 禁 Bash+Write/Edit/NotebookEdit+Agent+mcp__*；auditor 禁 Write/Edit/NotebookEdit+Agent，workspace 只读；仅 executor 挂 computer-use MCP。
