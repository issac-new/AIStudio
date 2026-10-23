# 守门卫生批：kanban 催办词条清偿 + 收件箱守门人裸 hex 换 token

- 日期：2026-10-23
- 状态：已落地（feat/hygiene-gates）
- 背景：京东评测体系吸收轮全量回归时定性的两处 main 既有守门失败（非该批引入），本批清偿。

## 落地内容

1. **patch 677（kanban i18n 欠账）**：676 催办挂载批（9c06d2c2）给 KanbanBulkBar 加了「催办」按钮但漏了 `kanban.action.nudge` / `kanban.action.nudgeHint` 双语词条，kanban-i18n-coverage 守门自该批起红。修法=在既有 `kanban.action` 段（`nudgeDispatcher` 行后）补两键——不能新开 action 段，JS 对象字面量同名键后位覆盖前位，前者静默失效（本批实测踩过）。zh/en 成对，patch 677 登记入 series。
2. **GatekeeperSection 裸 hex 换 token**：`.gk__btn--approve/--reject` 两处硬编码色值（#2e7d32/#b71c1c）是 raw-hex 预算闸 ia2 域超预算（2>0）的来源（3aa34d31 栏控统一批遗留）。换 `var(--success)/var(--error)` + `rgba(var(--success-rgb/--error-rgb), 0.5)`（IdeReplayTheater 既有先例形态），视觉语义不变（同绿/红语义 token）。

## 决策记录

1. **D1 词补在既有 action 段内**：新开同名段会被对象字面量后位键覆盖（实测验证）；正确锚点=nudgeDispatcher 行（带尾逗号修正）。
2. **D2 hex 修复不提预算**：预算闸是 ratchet（只降不升）语义，提预算=放宽守门；换语义 token 才是根治。
3. **D3 locale patch 走 series 登记**：ensure-injected 差量补套依赖 series-manifest 差集，不登记则新 patch 永不注入且无告警（series 头注释实证）。

## 运维教训（写进本 spec 备查）

- **upstream 注入树的 locale 文件禁 `git checkout --`**：zh.ts/en.ts 的注入态=473 全链终态基线+640/674 后续单补（早期 i18n patch 已移存归档不单独应用）；checkout 会全撤且 ensure-injected 不重放（它只处理 series-manifest 差量）。恢复配方=按 series 序 `git apply --include=zh.ts --include=en.ts` 重放 473→640→674（本批实测三连全过）。本批过程中误 checkout 过一次，已按此配方完整恢复（readonlyJump/nudgeDispatcher 复验在位）。

## 验证

- kanban-i18n-coverage + raw-hex-budget 两守门 3/3 绿。
- ia2 域全量 741 测试绿（含 GatekeeperSection 两个测试文件）。
- patch 677 已应用到共享注入树并登记 series；serve-main 换装后 ensure-injected 会把它纳入正式差量集。
