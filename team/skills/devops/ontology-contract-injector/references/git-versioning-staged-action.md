# Git 版本化 + Staged Action for ontology.md

> 来源：2026-08-29 P7 完成：`~/.hermes/profiles/_shared` 纳入 git 子仓，ontology.md 获 temporal provenance

## 背景
共享契约 `~/.hermes/profiles/_shared/ontology.md` 是全集群单一事实源。2026-08-28 前**无任何版本控制**（`~/.hermes` 非 git 仓），契约变更无 temporal provenance。

## 实施模式

### 1. 子仓/Subtree 方案选择
```bash
# 方案 A：独立 git 子仓（推荐，最小侵入）
cd ~/.hermes/profiles/_shared
git init
git add .
git commit -m "chore: initial ontology.md v1.8 + shared contracts"
# 在 hermes-agent 主仓添加 submodule 或 subtree
cd /path/to/hermes-agent
git subtree add --prefix=profiles/_shared ~/.hermes/profiles/_shared main --squash
```

### 2. Staged Action 协议（ontology.md 演进必走）
```markdown
## Staged Action Proposal
**动作**: ontology.md 新增/修改 object type / property / link / action / marking
**意图**: 补齐 G1/G4/G5/G9/G10/G11 差距
**影响范围**: 
- 所有 27 profile SOUL.md 引用
- kanban_complete metadata 字段名
- clearance_gate/marking-rules 校验
- platform-ontology-curator 审计脚本
**回滚**: `git -C ~/.hermes/profiles/_shared checkout HEAD~1 -- ontology.md`
**预计后果**: 破坏性变更需迁移路径 + 影响 profile 清单
```

### 3. 执行流程
1. `kanban_comment` 提交 `<staged-action-proposal>`（含 diff、影响、回滚）
2. `kanban_block(kind=needs_input)` 等 orchestrator 确认
3. 确认后：ACP 委托写入或直接 `write_file`（仅 _shared 文件）
4. `git add + commit`（commit message 含变更摘要 + 关联 task_id）
5. `git log -- ontology.md` 验证 temporal provenance

### 3. 验收标准
- [ ] `git -C ~/.hermes/profiles/_shared rev-parse` 成功
- [ ] `git log -- ontology.md` 可见首个 commit（如 `5abf80c`）
- [ ] 后续演进每次变更有 commit 记录
- [ ] 破坏性变更有迁移路径 + 影响 profile 清单

## 关键约束
- **仅 _shared 进 git**，各 profile SOUL.md 只引用不进 git
- **每次演进 = 一次 commit**，不可批量积压
- 破坏性变更（删除/重命名 object type）需附迁移指南 + 影响 profile 清单
- commit message 格式：`feat/fix/chore: <摘要> (ref: t_xxx)`

## 实战要点
- P7 完成后，P1/P3/P5 等依赖 ontology.md 版本化的任务可真实生效
- 子仓方式最小侵入，不破坏既有 symlink/引用
- hermes-agent 主仓可用 subtree 同步，保持独立历史