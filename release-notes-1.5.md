## SwarmStudio 1.5 — Loop Engineering 循环工程管理

基于 hermes-studio 0.6.28 + hermes-agent 0.18.2，新增完整的 Loop Engineering 功能系统。

### 本次更新

#### Loop Engineering — 循环工程管理（覆盖 issue #1）

把"人逐条 prompt agent"升级为"系统驱动 agent 循环"。用户定义一个递归目标（loop），系统按 cadence 或事件触发，自动经历 **发现→交接→验证→持久化→调度** 五阶段循环，直到满足可验证的停止条件。

##### 三层架构（自适应，零配置）

| 层 | 场景 | State 机制 | 触发条件 |
|---|---|---|---|
| 个人 | 单人本地自驱 | 本地文件（STATE.md 脊柱） | 默认（零依赖） |
| 团队 | Matrix 消息渠道协作 | Matrix 房间状态事件 | 检测到 Matrix 凭证 |
| SaaS | 多租户对外服务 | PostgreSQL + RLS | 检测到 DATABASE_URL |

系统启动时自动探测环境能力，选择最佳适配器——**无需手动配置环境变量**。探测优先级：SaaS（PostgreSQL）> Matrix > Local（文件系统）。显式覆盖仍可通过 `LOOP_STATE_ADAPTER` 环境变量。

##### 五阶段循环

1. **发现（Discovery）**：GitHub issues / CI 失败 / 本地 git / 通用 webhook 四路数据源自动扫描，产出可操作的任务契约
2. **交接（Handoff）**：每个契约绑定 detached-HEAD git worktree（隔离并行），派发制造者子代理实现修复
3. **验证（Validation）**：三路验证——Programmatic（test/lint 命令）+ Judge（独立模型族评 rubric）+ Human（人工签批），按 L1/L2/L3 自治级短路
4. **持久化（Persistence）**：通过验证的契约提交 PR + 写入 STATE.md 脊柱 + 更新 Kanban
5. **调度（Scheduling）**：独立小模型检查停止条件；cron / webhook / 7 命名 pattern 模板

##### 调研吸收的最佳实践

- **Loom 模式**：agent 不拥有工作流——"请求→读声明→写产物→提交→被校验"
- **looper 三类验证**：Programmatic/Judge/Human，拒绝"全凭感觉验证"，judge 用不同模型族
- **Codex `/goal`**：每轮后独立小模型查完成，非执行 agent 自评
- **cobusgreyling 7 pattern**：Daily Triage / PR Babysitter / CI Sweeper / Dep Sweeper / Changelog Drafter / Post-Merge Cleanup / Issue Triage
- **OpenHands StuckDetector**：4 信号检测（max-attempts / no-output / validation-loop / agent-silent）
- **AgentGuard 费用闸门**：throw/notify/kill 三模式 + 80% 预警
- **Claude Code hook 生命周期**：12 个 hook 点（pre-tick / post-validation / on-stuck 等）
- **LangGraph fork-from-checkpoint**：从任意检查点分叉不丢原史，治理解债

##### 治理"理解债"

- **STATE.md 人可读脊柱**：不用问 agent 也能知道"系统在干什么"，可 git diff/blame
- **L1→L2→L3 渐进自治**：L1 仅报告先理解 loop 发现什么；L2 每次需 Human gate；L3 充分理解后才自动
- **fork-from-checkpoint**：从任意历史检查点分叉新 loop，鼓励"动手理解"

##### 技术细节

- 8 个 B-class patch（导航注入、路由、Socket.IO namespace、cron-parser/proper-lockfile/pg 依赖、i18n en/zh）
- 完整 i18n（中英双语），无硬编码字符串
- CSS 变量化，无硬编码颜色
- 自适应 State Store 工厂（SaaS > Matrix > Local 自动探测）
- 26 个测试文件，85 个测试用例
- 全量回归 65 文件 / 489 测试通过
