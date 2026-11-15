# 任务计划：超级智能体吸收批二（任务版本化＋分级验证）

spec：docs/superpowers/specs/2026-11-14-superagent-contract-batch2.md（已批准）
分支：feat/superagent-contract-b2（worktree superagent-contract-b2，立项 63e2f2966）

## 步骤

1. [x] 立项提交（spec+DESIGN 行+decisions D122）
2. [x] T1 schema：tasks.version/verification＋task_events 四列＋trg_tasks_version_bump 触发器（幂等迁移，connect 侧）
3. [x] T2 写路径：write_txn(envelope=) 上下文＋_append_event 四列＋complete/block expected_version CAS（事务内校验+UPDATE WHERE）
4. [x] T3 验证分级：_gate_verification_level 单点（standard 缺省零成本/strict:pr=pr_acceptance 事件 ok/independent=review_requested+verdict 时序）＋fail-closed＋拒绝落 verification_level_result 事件＋create_task(verification=) 校验
5. [x] CLI：complete/block --expected-version 透传（kanban_parser+kanban.py 两 cmd）
6. [x] T4 剩余：tools complete/block expected_version 透传＋两异常 worker 指引＋create verification；studio completeTasks/blockTask --expected-version＋controller expectedVersion/409 version_conflict（提交 944b35a）
7. [x] T5-a：runtime 六镜像同构（kanban_db/kanban_db_connect/kanban/kanban_parser/kanban_tools/kanban_tools_schemas）＋补丁 775/776 提取登记＋clean+pretest 重放 complete＋38/38 绿＋docs-ssot 29/29＋typecheck 0 错
8. [ ] T5-b 剩余：rebase origin/main（series 773/774 中插冲突＝上游逐字＋尾块重建解法）→全量 npm test＋点名 kanban 大集→变异探针→独立审查→用户裁合并

## 已验

- 新测试 22/22＋CLI/Block 回归＝38/38 绿（PYTHONPATH=vendor/hermes-agent:runtime 点名跑）
- 批量 84 文件 51 失败＝main 树同红（测试间状态泄漏，非本批引入——挂账测试基建债）

## 关键口径

- 触发器递归安全：recursive_triggers 默认 OFF，触发器内自增不再触发
- 判据只认 kanban 库内事件真值（pr_acceptance/review_requested+verdict），测试用直落事件模拟
- git add 禁 -A（批一 449 文件污染教训）；补丁 before=/tmp/b2-before-*（kanban_db_connect 快照在实施前手 cp，其余 git show HEAD:）
