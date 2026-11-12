# 2026-11-12 worktree 宿主写入隔离（设计复盘 P0 第 4 项）

> 决策事实源。来源：2026-11-12 全仓设计复盘的 P0-4「worktree 建链」。执行中发现 N-4 已由
> `a8002fd55`（handbook-debt 批）根治，建链脚本不再需要；但注入链暴露了一个更实的问题——
> linked worktree 的 `inject`/`npm test` 会写共享宿主运行时树。本批处理这一项。

## 变更

### 1. `deploy-agent-runtime.mjs`：linked worktree 默认写检出内影子目录

- 判定：当前检出是 linked worktree（`git rev-parse --git-dir` 与 `--git-common-dir` 解析不同）
  且未显式指定目标（无 `--runtime`、无 `RUNTIME_DEPLOY_TARGET`）。
- 行为：`dstRoot` 重定向为 `<检出>/.runtime-deploy-shadow/`（gitignored），stderr 打一条提示。
  宿主 `~/.hermes/hermes-agent` 不被触碰；inject 预检以影子为基准，不会 partial 死锁。
- 确需把本次改动部署到宿主：`RUNTIME_DEPLOY_ALLOW_WORKTREE=1`。
- 演练/测试要指定任意隔离目标：`--runtime <dir>` 或 `RUNTIME_DEPLOY_TARGET`。
- 新增 `--explain-worktree`：打印判定输入（overlayRoot/dstRoot/linked/shadowMode/两个开关）。
- `RUNTIME_DEPLOY_LINKED_WORKTREE=1|0` 是测试注入面：CI 在普通克隆上无法自然构造 linked 判定；
  生产路径不读该变量。

### 2. `.gitignore` 增 `/.runtime-deploy-shadow/`

影子目录是运行态，不入库（与 `runs/`、`dist/` 同级纪律）。

### 3. AGENTS.md 规则 3 补 worktree 开工口径

三步开工；fresh worktree 直接 `npm test`（pretest 自动注入，N-4 已根治）；runtime 写宿主
默认重定向到影子，显式 `RUNTIME_DEPLOY_ALLOW_WORKTREE=1` 才达宿主。

### 4. 不再新建 worktree 建链脚本（P0-4 原案作废）

`a8002fd55` 修掉 `ensure-injected` 的 zcode 预自愈双跑后，新 worktree 的
`node scripts/ensure-injected.mjs` 一次走通（本批实测 20.3s，`status=complete`，
`node_modules` 由 `inject.mjs` 的 `ensureNodeModulesSymlink` 自动链到主检出共享实例）。
原计划的 rsync 配方与独立 bootstrap 脚本都不需要——少一个机制。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 默认「重定向到影子目录」，不默认「拒绝写入」 | 先实现过 fail-closed：worktree 里任何有 runtime 差异的 `npm test`/pristine 重放都会红（实测 overlay-pristine-replay 两用例被拦），把隔离变成了阻塞。影子重定向既不触宿主也不打断合法流程；宿主写入改为显式意图（ALLOW=1） |
| D2 | 影子放检出内、gitignored | 放检出外要新临时目录生命周期与清理机制；放检出内天然随 worktree 删除消失，且 `dstInsideCheckout` 让后续判断简单 |
| D3 | 保留 `--runtime` / `RUNTIME_DEPLOY_TARGET` 作为显式隔离面 | 测试与演练需要「目标可控」；env 面让 spawn 注入链无需改 argv |
| D4 | 守卫实现内联在 deploy 脚本，不新建模块 | `scripts/*.mjs` 计数已顶格 137/137；为可测性新增 helper 必须抬预算，正是复盘批评的「补账抬位」。用 `--explain-worktree` + 测试注入面覆盖 |
| D5 | P0-4 建链脚本作废 | N-4 已根治，标准路径 20s 可用；再造脚本是重复机制 |

## 验证

- `node --check scripts/deploy-agent-runtime.mjs`：语法通过。
- `--explain-worktree`（本 worktree）：`linkedWorktree:true, shadowMode:true`，`dstRoot` 指向
  `.runtime-deploy-shadow`。
- 三态实测：linked 默认 → 影子（退出 0，stderr 含提示）；linked＋ALLOW=1 → manifest 目标；
  非 linked → manifest 目标。
- `npx vitest run scripts/__tests__/deploy-agent-runtime.test.ts`：8 用例全过（原 5＋新增 3：
  影子重定向/显式放行/非 linked）。
- `npx vitest run scripts/__tests__/deploy-patch-touched.test.ts`：10/10 过。
- `npx vitest run scripts/__tests__/overlay-pristine-replay.test.ts`：提交后跑（该回归门自引用
  HEAD，未提交的修复它看不到），预期两用例绿。
- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts`：随批登记后 7/7 过。

## 设计文档影响

DESIGN_SYNC: none

理由：本批只改部署执行面的默认写入位置（worktree 场景），不改变 DESIGN_DOCS 四正本中的
机制定义与契约（runtime 部署仍是 manifest 驱动、保留宿主差异、partial 不冒充成功）。
正本如已描述「runtime 部署到宿主」，本批是同一语义下的并发安全默认值调整。
