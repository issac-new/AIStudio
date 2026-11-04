# AgentTeams 挂账台账 N01-N03 清偿批

来源：specs/2026-11-04-agentteams-pending-batch.md（用户 2026-11-04 批准实施）。
分支 feat/ledger-items。前置：批一至批四（2026-11-04-agentteams-*.md 四份）。

## 变更

1. **N01 Worker（profile）环境变量编辑面**：custom 端点直读直写
   `~/.hermes/profiles/<name>/.env`（KEY=VALUE 行态：读排序回显、写=整文件原子替换+
   备份 .bak），键名白名单放开但值脱敏回显（含 KEY/TOKEN/SECRET/PASSWORD 字样的值
   显示为 `***len=N***`，写入按原值保留需显式确认位）。写后可选触发该 profile 网关
   重启（复用既有 profiles restart 通道，默认不重启只提示）。
2. **N02 权限变更审计**：用户角色变更与 user_profiles 授权增删落审计行
   `~/.hermes-web-ui/approvals/history.json` 同级新文件 `user-perms-audit.jsonl`
   （who/what/from→to/at/actor），custom 中间件包装 vendor 用户更新端点取入参快照
   （挂载走 patch 740），查询端点 `GET /api/userperms/audit?user=` 按用户过滤。
3. **N03 task-progress / project-participation 技能移植评估**：对照 AgentTeams
   同名技能与 AIStudio 现有等价物（task_runs.summary / agent-identity 台账 /
   ~/.hermes 记忆）逐条判定，产出评估结论写入本 spec 附节；只评估不实施。

## 决策记录

| # | 决策 | 备选 | 取舍理由 |
|---|---|---|---|
| D1 | N01 走 custom 端点直接读写 .env | patch vendor profiles 路由 | profiles 目录形态是稳定事实（custom/server 多处已依赖），custom 面零补丁即达；vendor 路由面大改不成比例 |
| D2 | 敏感值回显脱敏、写保留原值 | 全明文/全遮断 | 审计不落原值（仓规第 6 条）；编辑面需能看到键清单与值长度才能安全操作 |
| D3 | N02 审计落独立 jsonl | 并入 approvals/history.json | approvals 面有自身消费者与冻结契约，不混流；同目录便治理 |
| D4 | N02 用中间件快照而非改写 vendor controller | patch 改 controller | 中间件挂载（740）不改 controller 内部逻辑，升级面最小 |
| D5 | N03 结论以 spec 附节承载 | 独立报告文件 | 台账同源：评估结论直接影响 N01-N03 后续批次的规格来源 |

## 验证

- 目标测试：`npx vitest run custom/server/userenv custom/server/userperms`
  （N01/N02 各自域测试）＋全量 `npm test` 对照批四基线 7629/0
- N01 行为：读写 default profile 一个测试键 → 文件原子替换+备份存在；脱敏键值回显
  `***len=`；非法路径（`..`/绝对）拒绝
- N02 行为：模拟角色变更请求过中间件 → audit jsonl 落行含 actor/from→to；GET 过滤生效
- patch 740 正确性：干净树 inject 重放+reverse-check

## 设计文档影响

DESIGN_SYNC: none
纯新增能力面；N03 评估结论如引出实施批，届时另立 spec。

## N03 评估结论（2026-11-04，源码级对照完毕）

对照源：AgentTeams `manager/agent/hermes-worker-agent/skills/{task-progress,project-participation}/SKILL.md`（上游原文核对）。

**判定一（progress 日志）：部分等价·有缺口。** durable 追加通道存在但非叙事性：`kanban_heartbeat(note)` 落 task_events（runtime/hermes_cli/kanban_db_dispatch.py:672）、`kanban_comment` 落 task_comments（runtime/tools/kanban_tools.py:1144）；`task_runs.summary` 仅 run 收口时落（runtime/hermes_cli/kanban_db.py:1091、2961）。缺「每个有意义动作后追加」的进行时叙事文件；materials/ 目录约定目前仅 coding-delegate 指纹使用。

**判定二（会话复位恢复）：已有等价物且更强。** `build_worker_context`（runtime/hermes_cli/kanban_db.py:4287）聚合 prior attempts＋近 5 条跨卡 completed runs（kanban_db_context.py:197，即 task-history.json LRU10 等价）＋checkpoint 续跑 recap（kanban_db.py:4318）；resume 守卫防脱离监管续跑（vendor/hermes-agent/hermes_cli/kanban_resume_guard.py:41）。

**判定三（git author＋完成上报）：上报已有更强等价物；git author 无等价物、低优先。** 完成走 complete_task 证据强制+DoD 回执门（runtime/completion_contract.py:21、kanban_db.py:2884）+notifier 推送（runtime/gateway/kanban_watchers_notifier.py:49、394）。git author 仓内仅固定身份写点（checkpoint_manager.py:567、web_git.py:648），归因在 run 级（task_runs.profile）＋agent-identity 台账（custom/server/agentidentity/agent-identity.ts:47）。

| AgentTeams 约定 | AIStudio 锚点 | 判定 |
|---|---|---|
| progress 逐动作追加 | kanban_db_dispatch.py:672 / kanban_tools.py:1144 / kanban_db.py:1091 | 部分等价 |
| mc mirror 推送 | 单存储 task workspace（kanban_tools.py:946） | 等价物更强 |
| task-history LRU10 | kanban_db_context.py:197 | 等价 |
| 复位读 progress | kanban_db.py:4287/4318＋resume_guard.py:41 | 等价物更强 |
| git author=worker 名 | 固定写点+run 级归因 | 无逐提交等价 |
| 完成 @mention | kanban_db.py:2961＋completion_contract.py:21＋notifier:394 | 等价物更强 |

**值得移植（S 级，待批）**：`runtime/hermes-skills/task-progress` AIStudio 变体——progress 写 task workspace `materials/progress/YYYY-MM-DD.md`，恢复流读最新 progress＋`_ctx_prior_attempts`；纯技能层不动内核。若要在 `build_worker_context` 注入 progress 段则升 M。
**不推荐移植**：task-history.json（与 `_ctx_role_history` 双账）；mc mirror（单存储已解）；@mention 上报（与证据门契约冲突）；技能级 git author（应走 agent-identity 接线批）。
