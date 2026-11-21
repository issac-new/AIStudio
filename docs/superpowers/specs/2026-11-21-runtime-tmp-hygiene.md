# 2026-11-21 runtime 临时文件卫生批（换血批 N-6 清偿）

> 背景：hermes-agent v0.23.3 换血批（spec 2026-11-20-vendor-upgrade-agent-v0233）独立审查发现 F1/挂账 N-6——`runtime/` 下 14 个 `.78619-*.tmp` 编辑器临时文件历史入库。本批清偿。来历定谳：`59050a87d`（原子写批量收口第八批）引入 14 件；先例批 `e8a3e616f`（2026-10-28）已立 `**/.*-*.tmp` 忽略规则并清理当时可见的 1 件（f618f04b3122），但漏删这 14 件已跟踪件——gitignore 只挡 untracked，tracked 件被 index 短路（`git check-ignore` 默认模式 exit=1、`--no-index` 命中 .gitignore:64 的实证差异）。故规则早已在位且有效，本批零 .gitignore 改动。

## 变更

1. `git rm` 删除 `runtime/` 下 14 个 `.78619-*.tmp` 已跟踪临时文件（atomicWriteText 异常路径残留，无任何代码/脚本/配置引用——全仓 grep `78619-` 唯一命中=换血批 spec 挂账行本身）。git 历史=天然存档，可随时 revert 回滚。
2. 无其他改动：不新增 .gitignore 规则（`**/.*-*.tmp` 已覆盖该形态，最小实验仓验证匹配子目录与根两层；删除后 untracked 新生 tmp 自动被挡）、不动 runtime/ 正本、不动宿主。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 纯 git rm，不新增忽略规则 | 规则 e8a3e616f 已在位且实证有效；tracked 短路才是根因，删件即根治。仓规「单一事实源」——重复立规=第二事实源 |
| D2 | 不配对机制预算条目 | 仓规第 13 条枚举的新增对象=门/钩子/脚本/账本；本批零新增机制（无删除类以外的行为变化），.gitignore 亦未动 |
| D3 | 走独立卫生批而非并入换血批 | 换血批 8553dadd2 已收口（N-6 挂账设计即如此）；独立小批可独立回滚 |

## 验证

- [x] `git ls-tree -r HEAD -- runtime/ \| grep '\.tmp$'` 计数 14 → 合并后为 0。
- [x] 全仓引用扫描 `git grep '78619-'` 除 spec 叙事外零命中（提交前在 worktree 树验）。
- [x] 删除后 `git status` 无新增 untracked tmp 回流（规则兜底实证：touch 同形态文件不出现在 status）。
- [x] `node scripts/governance-lint.mjs --budget` 过（零新增机制，预算面不动）。
- [x] `node scripts/merge-invariants.mjs --check` 过。
- [x] runtime 守门面抽验：`runtime/.gitignore` 不存在（不误删嵌套规则）；deploy 清单对账不受影响（tmp 非清单成员——文件名非 .py 且不在 deploy-agent-runtime 清单）。

## 设计文档影响

DESIGN_SYNC: none 附理由——纯仓内卫生批：删除编辑器临时产物，无能力/契约/版本面变化，不触及任何设计正本与整合文档。换血批 spec 的 N-6 挂账行由本批闭环（其「不处置清单」语义=不在该批处置，非永不处置）。
