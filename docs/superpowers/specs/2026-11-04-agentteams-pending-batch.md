# AgentTeams 对标吸收：挂账台账（N01-N03）

来源：AgentTeams 1.2.5 + Dashboard v1.3.1 源码级调研（2026-11-04，会话 agentteams-absorption）。
本轮裁定不实施、登记待后续批次。编号承接挂账台账化口径：锚点 / 根因层 / 验收判据 / 状态。

## 待办

### N01 Worker 环境变量编辑面

- 锚点：profiles 路由无 env 写入口（vendor/hermes-studio routes/profiles.ts:7 仅 CRUD/rename/restart/导入导出）；.env 仅建 profile 时生成（controllers/profiles.ts:740）。AgentTeams 对应面：worker_workspace_files / env 编辑（文章「Worker 环境变量编辑」）。
- 根因层：profile 生命周期里 env 是一次性产物，无受控变更通道。
- 验收判据：编辑任意 profile 的 env 键值 → 网关重启后该 profile 的 agent 进程 env 生效；审计留痕（键名级，值脱敏）。
- 状态：**已完成（2026-11-04，清偿批 `1a2cd9350`）**：userenv 域（脱敏回显 `***len=N***`、原子写+备份、审计不落值）＋AgentsView ProfileEnvPanel；spec `2026-11-04-agentteams-ledger-items.md`。

### N02 权限变更审计

- 锚点：updateManagedUser 只写库不留痕（vendor/hermes-studio studio/controllers/auth.ts:1150）；现有审计面（approval-log / provider 配置审计）不覆盖用户角色与 profile 授权变更。AgentTeams 对应面：「相关权限变更保留审计记录」。
- 根因层：用户/授权写路径无审计钩子。
- 验收判据：角色变更、user_profiles 授权增删各产生一条审计记录（who/what/when/prev→next）；查询端点可按用户过滤。
- 状态：**已完成（2026-11-04，清偿批 `1a2cd9350`）**：patch 740 中间件快照四端点＋`user-perms-audit.jsonl`＋查询端点 `GET /api/userperms/audit`；userperms 17 用例。

### N03 task-progress / project-participation 技能移植评估

- 锚点：AgentTeams manager/agent/hermes-worker-agent/skills/{task-progress,project-participation}——同 Hermes 底座的 worker 侧契约：进度日志（progress/YYYY-MM-DD.md 追加 + mc mirror 推送 + LRU task-history.json）、项目参与（读 ~/shared/projects/{id}/plan.md、git author=worker 名、完成 @mention 上报）。
- 根因层：AIStudio 的任务进度在 kanban task_runs/attachments 已结构化，但 worker 会话被复位后「最近在做什么」的自述恢复链路弱于其 progress 日志约定。
- 验收判据：评估报告一份——逐条判定三项约定（progress 日志 / task-history / git author 身份）在 AIStudio 是否已有等价物（task_runs.summary、~/.hermes 记忆、agent-identity 台账），缺的列出移植成本；不直接实施。
- 状态：**已完成（2026-11-04）**：评估结论三判定写入 `2026-11-04-agentteams-ledger-items.md` 附节（progress 日志部分等价有缺口／复位恢复等价物更强／git author 无等价低优先）。

## 已裁定不处置

- **Nacos Skill Registry 实接**：无实例，仅留 URI 形状（批四）。接真实 Nacos 属外部依赖引入，需单独裁决。
- **AgentTeams 项目 Room / Matrix 房间模型**：AIStudio 已有更完整的 Matrix 房间 + 看板联动，不吸收。
- **QwenPaw 运行时升级/回滚链**：AIStudio 走自己的 vendor+patches 版本线（VENDOR.md 台账），不引入第二套升级器。

## 计数

待办 0；不处置 3 项。N01-N03 已于 2026-11-04 清偿批 `1a2cd9350` 全部完成（本台账 2026-11-05 总收口批同步状态，与清偿事实对齐）。本台账随批一 spec（2026-11-04-agentteams-project-workflow.md）同批登记 A.1。
