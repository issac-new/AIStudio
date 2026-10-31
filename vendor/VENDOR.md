# vendor/ 上游基线台账

AIStudio 单仓整合轮（2026-10-24）落库。vendor/<tree> 是钉版的上游基线快照：**git 跟踪 pristine 基线，inject 在工作树上打补丁（脏态=预期注入态），基线变更只走 `npm run vendor:sync` 显式通道**。树内**禁止**建 `.git`（会让外仓记成 gitlink、文件不可跟踪）。

| 树 | commit | 版本 | upstream remote | 提取方式 |
|---|---|---|---|---|
| hermes-studio | `f67b587b9` | v0.8.0 | https://github.com/EKKOLearnAI/ekko-studio.git（旧名 `hermes-studio` 为重定向别名；2026-10-31 实测 full_name=ekko-studio） | `git archive HEAD \| tar -x`（干净 HEAD，排除工作树注入态与 node_modules/dist） |
| hermes-agent | `bf0203a794` | v0.22.5 | https://github.com/NousResearch/hermes-agent.git | 同上 |
| zcode | `3c5b2276` | 包版本 3.16.2（谱系 v3.16.1 系列；**同步口径=上游 main 变更，不看版本 tag**，2026-10-25 用户裁定） | （闭源底座仓，upstream/zcode 本地树） | 同上 |

> 2026-10-31 升级轮：hermes-studio 基线已升 v0.8.0（本批，44 失败件重生成/2 退役/4 条迁位，重放零失败）；补丁 329 esp32 段随上游迁移改指 `packages/mcu/esp32-*`。hermes-agent 仍 v0.22.5（main 领先 3087c）。zcode 上游 main 到 v3.17.1 线（`a60ba6a7`）待独立轮；zcode 活跃补丁 8 条（002-009）。

## zcode 基线差一提交说明（2026-10-24 实测记录）

`zcode-patches/series` 头已于 2026-10-25 升级轮对齐为 `3c5b2276`（当时 7 条活跃补丁在该 pristine 快照上全量重放实测通过，依据 specs/2026-10-24-aistudio-single-repo-integration.md 验证门①；差一提交的历史事实见 git 历史）。2026-10-31 复核：series 现为 8 条活跃补丁（002-009），RELEASE-MANIFEST 的 activePatchCount=8 与之一致。

## 升级流程（vendor:sync）

1. 外置升级源树（gitignored `upstream/<tree>`，保留各自 `.git`）`git pull` / checkout 目标 tag。
2. `git -C upstream/<tree> archive HEAD | tar -x -C vendor/<tree>`（整树替换前先 `git rm -r --cached` 旧基线亦可，替换后 `git add vendor/<tree>`）。
3. `npm run inject` 重放补丁；补丁冲突在 patches/ 内修复后重放。
4. 通过验证门后走显式提交（`VENDOR_SYNC=1` 允许提交 vendor/**，见 pre-commit 钩子）。

## node_modules 策略

不入库（产物）。`vendor/hermes-studio/node_modules`：主检出 `npm ci` 一次；worktree 检出由 inject 自动软链共享主检出实例（inject.mjs `mainCheckoutVendorNodeModules`）。`vendor/zcode`：`node scripts/zcode-engine.mjs ensure`（pnpm install + build，幂等）。`vendor/hermes-agent`：运行时经 `runtime-manifest.json` 部署到 `~/.hermes/hermes-agent`，无构建依赖。

## 双锁与缓存树卫生（2026-10-24 供应链治理轮）

- `vendor/zcode` 自带 npm+pnpm 双锁为上游形态原样保留（与 upstream/zcode 同文件逐字一致）；构建只走 pnpm（scripts/zcode-engine.mjs），npm 侧 package-lock.json 是上游历史残留、不参与任何流程，删除即基线漂移，故保留立档。
- `upstream/<tree>` 是升级缓存树，保持 pristine（HEAD 与 vendor 钉版同 commit）。**禁止在其工作树手改 package.json/lock**——overlay 需要的新依赖一律走 patches/ 补丁在 vendor 注入态入册（manifest 先例：017 matrix-js-sdk、080 echarts、103 lunar、136 cron-parser、137 proper-lockfile、138 pg、573 playwright-163；锁收口：687）。2026-10-24 实测发现 upstream/hermes-studio 工作树存在 6 项手改脏态（影子双源），已还原 pristine，锁由补丁 687 正身承载。
