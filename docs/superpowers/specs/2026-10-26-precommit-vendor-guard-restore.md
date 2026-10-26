# pre-commit vendor 挡护还原 + 模板↔产物同步守门

- 日期：2026-10-26
- 背景：2026-10-25 收口补遗批（spec 2026-10-25-local-artifacts-ignore-rules.md D4）发现 AGENTS.md 所称「pre-commit 自动撤出 vendor 脏态」在现行钩子中不存在。本批根治。

## 变更

1. `.swarm-yuan/hooks/pre-commit`：由「仅 spec-first 委托」还原为**两条职责**形态——①委托技能内 spec-first 脚本（缺席 fail-open 降级）；②vendor/** 挡护：暂存面含 vendor/ 且未设 `VENDOR_SYNC=1` 时 `git reset -q HEAD -- vendor/` 自动撤出并提示，放行其余暂存。
2. `skills/swarm-yuan/scripts/generate-skill.sh` Step R101 装配模板：同步回移上述两条职责（heredoc 内 `\$` 转义保持产物字面量），消除「重生成即丢挡护段」的结构性缺口。
3. 新增守门测试 `custom/__tests__/precommit-vendor-guard.test.ts`：断言垫片与模板双方都含挡护三要素（`VENDOR_SYNC` 逃生 / `git diff --cached --name-only -- vendor/` 探测 / `git reset` 撤出），锁「模板↔产物双向同步」。

## 决策记录

- **D1 语义取「自动撤出」而非「拦截」**：忠实还原 2026-10-24 单仓整合轮首装版（b7aef6874:.swarm-yuan/hooks/pre-commit）——`git reset -q HEAD -- vendor/` 撤出暂存后放行剩余提交；与 AGENTS.md「不入提交（pre-commit 自动撤出）」文字一致。若提交全由 vendor 文件构成，撤出后由 git 自身的「nothing to commit」收口，钩子提示已先行说明原因。
- **D2 丢失根因与防复发**：首装版自带「挂账：本改动须回移 generate-skill.sh 装配模板」但未执行；次日 aistudio-dev 全量重生成（ed382ccfa）从未同步的模板重写垫片，挡护段即丢。故本批三层齐改（模板→产物→守门测试），测试断言双方同步，重生成再丢会当场红。
- **D3 挡护归属垫片层而非 spec-first 脚本**：vendor 立法是仓规（AGENTS.md/VENDOR.md），spec-first 脚本是通用四层拦截件（L1-L4 同源判据），不掺仓特定逻辑；与首装版「两条职责」分层一致。
- **D4 SF 路径沿用绝对路径烘焙**：垫片 exec 主检出 `.claude/skills/aistudio-dev/scripts/spec-first-pre-commit.sh`（.claude/ 不入库，worktree 无此目录）；全新克隆形态走 `[ -f ]` 缺席 fail-open，L1/L3 门禁仍在。
- **D5 逃生通道语义不变**：`VENDOR_SYNC=1` 跳过撤出（scripts/vendor-sync.sh 指引的基线替换唯一显式通道）；垫片退出码链：spec-first 非零即透传拦截，否则恒 0。

## 验证

- 语法：`bash -n` 垫片与生成器双绿。
- 行为实测（worktree 内直跑垫片）：①暂存单个 vendor 临时文件→自动撤出（回到未跟踪）+提示+exit 0；②同态 `VENDOR_SYNC=1`→不撤出、exit 0；③仅暂存非 vendor 文件→不动、exit 0。
- 守门测试：`npx vitest run custom/__tests__/precommit-vendor-guard.test.ts` 全绿。
- 主树活体：合并后主检出实测同三态，随后真实提交（本批）经新垫片收口。
