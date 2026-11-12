# 2026-11-12 CI 跑产品全量测试（P1-7）

> 决策事实源。来源：2026-11-12 全仓设计复盘 P1-7「CI 跑产品测试」。
> 现场病：`.github/workflows/governance.yml` 注释明说「全量 npm test 依赖本地注入态
> vendor 树，CI 不可复现」——于是「推到 main 的提交都没有自动化测试记录」，唯一执行点
> 是本机 pre-push（L0 快门）＋合并前人工全量。事实上注入链是可复现的：vendor/ 是 git
> 跟踪的 pristine 基线，`ensure-injected` 只需要 git＋node（fresh worktree 实测 20s
> 一次走通，N-4 根治后不再有 zcode 双跑坑）。

## 变更

### 1. 新增 `.github/workflows/product-tests.yml`

链路（每步都可复现，无本机形态依赖）：

1. `checkout fetch-depth: 0`（inject 重放类测试建临时 worktree，需要历史）；
2. node 24＋npm 缓存（key=vendor studio lock 哈希）＋Playwright 浏览器缓存；
3. `vendor/hermes-studio` 下 `npm ci --ignore-scripts`（README 快速上手配方）；
4. `node scripts/ensure-injected.mjs`：补丁全量重放＋根 `node_modules` 软链＋runtime
   部署（CI 是普通克隆非 worktree，落 `~/.hermes/hermes-agent`＝runner 隔离 HOME，无
   共享树问题）；
5. `npx playwright install chromium`（diagram PNG 导出等真实浏览器用例）；
6. `npx vitest run --no-file-parallelism --reporter=junit`——与 `engineering.basic-check`
   门同配方（串行文件是仓内定谳的防并行污染口径）；
7. junit 恒上传（14 天），失败也留证据。

触发面：push 到 main＋PR，`paths-ignore` 排除纯文档/技能/团队目录改动；同 ref 新推送
取消旧运行。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 独立工作流，不并入 governance.yml | 治理静态门（<1min）与全量（30min 级）时效差一个量级；分开才能让静态门保持快速反馈、全量失败不拖静态门结论 |
| D2 | 与 basic-check 同配方（--no-file-parallelism） | 仓内 2026-11-07 定谳：并行模式 vite:esbuild 假红 exit 1 而 junit 零失败；CI 首落地取保守配方，提速留给后续证据 |
| D3 | npm ci 而非 npm install | lock 在库（vendor/hermes-studio/package-lock.json），ci 可复现且更快；README 的 install 面向开发者本地 |
| D4 | 保留本地 pre-push L0 门不动 | CI 是底线不是替代：push 前的快速反馈仍靠本地；两者判据同源（同一 junit 口径） |
| D5 | paths-ignore 收窄而非全跑 | 文档/技能批占近期提交约半数；对它们跑 30 分钟全量只有成本没有信息量。若后续出现「docs 改动炸产品」的实例再收窄排除面 |

## 验证

- YAML 解析通过（Hash 结构）。
- 链路各步与本仓既成事实对齐：npm ci 配方=README 快速上手；注入=fresh worktree 实测
  20s/complete；playwright=studio devDeps `@playwright/test ^1.63.0` 在 lock 内。
- 首次 push main 后以 Actions 运行记录为准（本 spec 落地时 CI 首跑未发生，如实声明：
  工作流未在本机外验证过，首次运行可能暴露环境差异——届时按失败清单修，不放宽配方）。

## 设计文档影响

DESIGN_SYNC: none

理由：四正本未改。本批是 CI 执行面补位（「验证与证据」原则的自动化），不新增机制语义；
governance.yml 的「全量不入 CI」注释随本批语义过时，由本工作流的头注替代说明分工。
