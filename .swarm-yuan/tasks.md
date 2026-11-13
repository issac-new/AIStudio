# 任务计划：超级智能体吸收批一（交接合同与证据完整性）

spec：`docs/superpowers/specs/2026-11-13-superagent-contract-closure.md`（已批准）
完整实施计划（步骤级）：`docs/superpowers/plans/2026-11-13-superagent-contract-closure-plan.md`
分支：feat/superagent-contract-p0（worktree superagent-contract-p0）

## 步骤

1. [ ] Task 1 看板写授权一致化（补丁 769）：三 handler 接 authorizeTaskIds+requestBoard；隐藏 profile 404 零副作用；requestBoard 400
2. [ ] Task 2 证据压缩归档 fail-through（runtime 正本＋补丁 770）：归档失败即 passthrough，模型零调用，ledger 记 passthrough_archive_error
3. [ ] Task 3 delegate 严格 output_schema（补丁 771）：每任务 strict 布尔，失败关闭；终止原因优先级不覆盖；默认宽松字节级不变
4. [ ] Task 4 预算/设计文档/spec 验证随批＋全量回归（inject/typecheck/npm test/runtime pytest）＋变异探针三连
5. [ ] Task 5 独立审查（review-record）→ 用户确认 → --no-ff 合入 main → worktree git 通道收口

## 关键口径

- 补丁策略：追加 769/770/771，不回写 013/614（防折叠历史载体、保独立回滚）
- 第二批（版本化迁移/分级验证/调度接线）不在本批，另立 spec
