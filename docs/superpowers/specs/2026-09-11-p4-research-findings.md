# P4 调研发现与设计校准（2026-09-11）

> 定位：`2026-09-09-loop-graph-aihub-redesign-design.md` §7B（角色习惯整合）的**外部世界复核**。
> 调研时点：P4 开工同日；方法：三路并行调研（项目管理工具语义 / AI 编码代理介入模式 / 画布编辑器范式），每条结论带来源。
> 用途：已落地实现的对照锚点 + 远期台账的候选项池。不改变 §7B 已拍板的设计。

## 一、§7B 设计的外部世界校验结论

| §7B 设计 | 外部对照结果 | 判定 |
|---|---|---|
| plan 节点「批准即定下游档位」+ 计划可编辑 | 2026 年仅 Claude Code exit-plan 一家实现三选一绑定后续档位（auto-accept / clear-context auto-accept / manually approve / keep planning） | **超前对齐**，方向被业界唯一实现验证 |
| Best-of-N fan-out（分叉 N 实现→人选/谓词收敛） | Codex 无官方实现，社区靠多 worktree 手动并行 + 人选 | **业界空白**，图式编排的差异化卖点成立 |
| 审批卡可编辑入参（改完再跑） | Copilot coding agent 官方流程无可编辑 prompt 环节，运行中介入仅 PR 评论 follow-up | **超前于 Copilot** |
| Always allow 按操作类型记忆 | Junie Action Allowlist 最完整：按类型分档 + Terminal 正则约束（可排除 `; \| & < >` 防注入）+ "Check Command" 命中预检 | 本实现按节点类型粒度收敛（简化版）；正则约束/命中预检列入远期 |
| peek/attach 两级介入 | Claude Agent view（Needs input/Working/Completed 三态 + 行级 peek）一致 | 已对齐 |
| Automations 收件箱两态 | Codex Automations 无显式两态审批（靠 unread 徽标 + Mark all read），任务默认 `approval_policy="never"` | 本实现更完整 |
| Jira condition/validator/post function 三分法 | condition=转换前评估"谁可执行"（失败则按钮不显示）；validator=校验输入（失败停在原状态、副作用不执行）；post function=转换后固定顺序副作用链 | gate 节点双语义（validator/post function）已覆盖；**condition 语义启示：不可达档位出口应不渲染而非点击后报错**（编辑器 UI 层面） |
| JSM 审批（进入状态即 Approve/Decline） | 审批步骤配在状态上；**该状态恰好只有两条外发转换时 Approve/Decline 被强制**，超过两条即可绕过；拒绝走专用转换并用 post function 设 resolution | 审批三元组已覆盖；**新增结构校验启示：审批节点出口应收敛为恰好两条**（见 §三） |
| 禅道按轮次测试（testtask）+ 失败用例一键转 Bug | 测试单绑定测试版本、每轮一单、报告按单自动生成；失败用例转 Bug 自动拼装重现步骤 | gate=测试轮次已覆盖；**失败产物带执行上下文一键转 repair issue** 列入远期 |
| Linear Triage | 处置动作 = Accept / Decline / **Snooze（定时重现）** / **Mark duplicate（并入后 Cancel）** + 值班人轮换 | 本实现只有批准/拒绝；**Snooze / 去重两个轻量出口**是 PM 真实习惯，列入台账 |

来源：[Atlassian 高级工作流](https://support.atlassian.com/jira-cloud-administration/docs/configure-advanced-issue-workflows/)、[JSM 审批（Server）](https://confluence.atlassian.com/spaces/SERVICEDESKSERVER/pages/939926369/Setting+up+approvals)、[JSM 审批（Cloud）](https://support.atlassian.com/jira-service-management-cloud/docs/add-an-approval-to-a-workflow/)、[Jira Automation 禁用策略](https://support.atlassian.com/cloud-automation/docs/enable-and-disable-jira-automation-rules/)、[Automation branch 作用域](https://confluence.atlassian.com/spaces/automation112/pages/1688902136/Branch+automation+rules+to+perform+on+related+issues)、[禅道执行用例提交 Bug](https://www.zentao.net/book/zentaopms/127.html)、[禅道测试报告](https://www.zentao.net/book/zentaopms/testreport-1723.html)、[Linear Triage](https://linear.app/docs/triage)、[Claude Code plan mode 讨论](https://github.com/anthropics/claude-code/issues/33225)、[Claude needs-input 徽标](https://github.com/anthropics/claude-code/issues/61421)、[What is Plan Mode（lucumr.pocoo.org）](https://lucumr.pocoo.org/2025/12/17/what-is-plan-mode/)、[Codex Automations](https://learn.chatgpt.com/docs/automations)、[Codex git worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)、[Junie Action Allowlist](https://junie.jetbrains.com/docs/action-allowlist.html)、[Junie rollback 吞人工改动问题 JUNIE-2018](https://youtrack.jetbrains.com/issues/JUNIE-2018)、[Copilot coding agent 博客](https://code.visualstudio.com/blogs/2025/07/17/copilot-coding-agent)。

## 二、画布编辑器范式（vue-flow 实现要点）

- **容器分组**：vue-flow 原生 `parentNode`/`extent` 机制（子节点相对父定位 + 拖出边界约束）——P4 loop 容器的「序列化元数据 + 画框渲染」方案与 vue-flow 嵌套机制兼容，将来若要"拖动容器整体移动"可直接切 parentNode 实现，GraphSpec 序列化层不变。（[vue-flow nesting](https://vueflow.dev/examples/nodes/nesting.html)、[node guide](https://vueflow.dev/guide/node.html)）
- **Dify 容器节点惯例**：loop/iteration 是画布上的容器节点，内部有独立 start/end 节点对；loop=轮间带状态，iteration=数组批处理。（[Dify Loop](https://docs.dify.ai/en/cloud/use-dify/nodes/loop)、[Dify Iteration](https://docs.dify.ai/en/cloud/use-dify/nodes/iteration)）——本实现的守卫回边环语义更贴近执行内核，容器仅是可视化分组，取舍已记录于计划文档。
- **校验呈现惯例**（n8n/Node-RED 社区问题反推）：警告级问题在画布上持续可见（边标色/节点角标），错误级在保存/执行前拦截——与 analyzeGraphSpec（警告级）+ validateGraphSpec（错误级）双层设计一致。

## 三、新增台账候选（远期，不进 P4）

1. **审批双出口结构校验**：审批节点（human/plan/validation 审批 interrupt）的出边应恰好两条（批准/拒绝去向），多于两条时编辑器警告「审批可被绕过」（JSM 语义）。
2. **Always allow 规则强化**：参数约束（正则白名单，排除 shell 元字符）+ 命中预检按钮（Junie Check Command 对应物）。
3. **Triage 轻量出口**：介入中心分诊卡增加 Snooze（定时重现）与「并入已有 run」两动作（Linear 语义）。
4. **gate 失败一键转 repair issue**：失败证据（exitCode/日志锚点/coverage）自动拼装为打回 issue 正文（禅道失败用例转 Bug 对应物）。
5. **节点级 rollback 的 diff 边界隔离**：回滚只撤销 agent 产生的变更，保护用户手动改动（JUNIE-2018 的教训前置规避）。
6. **needs-input 陈旧态清扫**：run 列表的 awaiting-input 徽标需「已读/清除」终态转换（Claude #61421 会话结束徽标无法消除的教训）。

## 四、执行环境备忘（本日实证）

- rtk 汇总的 `git status` 可能漏报未跟踪/未暂存文件——判断基线一律 `rtk proxy git status --porcelain=v1`。
- 共享 checkout 双会话并行：靠「提交间隔 + 文件 mtime + 进程 cwd」三信号判定对方回合状态；接管前必须先固定基线提交，避免把对方在途文件卷入自己的提交（本次用显式文件名 add 规避）。
- clean 脚本在「手改过注入态上游树」后会 reverse 失败——恢复路径 = 两棵上游树各自 `git checkout -- . && git clean -fd` 后直接 inject。
- i18n patch 生成规程：inject 后的 locale 快照为 base → 叠加键 → `git diff --no-index base 当前` + sed 修 a/ b/ 前缀 → series 追加 → clean+inject 重放验证。
