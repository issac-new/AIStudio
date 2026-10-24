# vendor/ 上游基线台账

AIStudio 单仓整合轮（2026-10-24）落库。vendor/<tree> 是钉版的上游基线快照：**git 跟踪 pristine 基线，inject 在工作树上打补丁（脏态=预期注入态），基线变更只走 `npm run vendor:sync` 显式通道**。树内**禁止**建 `.git`（会让外仓记成 gitlink、文件不可跟踪）。

| 树 | commit | 版本 | upstream remote | 提取方式 |
|---|---|---|---|---|
| hermes-studio | `04e5d9aa7` | v0.7.38 | https://github.com/EKKOLearnAI/hermes-studio.git | `git archive HEAD \| tar -x`（干净 HEAD，排除工作树注入态与 node_modules/dist） |
| hermes-agent | `4d04303818` | v0.22.4 | https://github.com/NousResearch/hermes-agent.git | 同上 |
| zcode | `3c5b2276` | v3.16.1 系列（见下） | （闭源底座仓，upstream/zcode 本地树） | 同上 |

## zcode 基线差一提交说明（2026-10-24 实测记录）

`zcode-patches/series` 头声明基线 `origin/main @ 0a1fc56 (v3.16.1, 2026-10-19)`；实际外置树 HEAD 为 `3c5b2276`（0a1fc56 之后又一个 `chore: sync ZCode source` 提交）。vendor 落库取 `3c5b2276`，依据：**7 条活跃补丁在 3c5b2276 pristine 快照上全量重放实测通过**（见 specs/2026-10-24-aistudio-single-repo-integration.md 验证门①）。series 头注释与台账此处的差一提交事实并存，后续升级轮统一对齐。

## 升级流程（vendor:sync）

1. 外置升级源树（gitignored `upstream/<tree>`，保留各自 `.git`）`git pull` / checkout 目标 tag。
2. `git -C upstream/<tree> archive HEAD | tar -x -C vendor/<tree>`（整树替换前先 `git rm -r --cached` 旧基线亦可，替换后 `git add vendor/<tree>`）。
3. `npm run inject` 重放补丁；补丁冲突在 patches/ 内修复后重放。
4. 通过验证门后走显式提交（`VENDOR_SYNC=1` 允许提交 vendor/**，见 pre-commit 钩子）。

## node_modules 策略

不入库（产物）。`vendor/hermes-studio/node_modules`：主检出 `npm ci` 一次；worktree 检出由 inject 自动软链共享主检出实例（inject.mjs `mainCheckoutVendorNodeModules`）。`vendor/zcode`：`node scripts/zcode-engine.mjs ensure`（pnpm install + build，幂等）。`vendor/hermes-agent`：运行时经 `runtime-manifest.json` 部署到 `~/.hermes/hermes-agent`，无构建依赖。
