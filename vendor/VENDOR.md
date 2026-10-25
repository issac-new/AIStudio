# vendor/ 上游基线台账

AIStudio 单仓整合轮（2026-10-24）落库。vendor/<tree> 是钉版的上游基线快照：**git 跟踪 pristine 基线，inject 在工作树上打补丁（脏态=预期注入态），基线变更只走 `npm run vendor:sync` 显式通道**。树内**禁止**建 `.git`（会让外仓记成 gitlink、文件不可跟踪）。

| 树 | commit | 版本 | upstream remote | 提取方式 |
|---|---|---|---|---|
| hermes-studio | `8f215f59d3a` | v0.7.39 | https://github.com/EKKOLearnAI/hermes-studio.git | `git archive HEAD \| tar -x`（干净 HEAD，排除工作树注入态与 node_modules/dist） |
| hermes-agent | `bf0203a794a` | v0.22.5 | https://github.com/NousResearch/hermes-agent.git | 同上 |
| zcode | `3c5b2276` | v3.16.1 系列（见下） | https://github.com/zai-org/zcode.git | 同上；按 origin/main 变更对账（不按 tag） |

## 2026-10-25 升级轮

- hermes-studio v0.7.38 → **v0.7.39**（24 提交 / 212 文件）；hermes-agent v0.22.4 → **v0.22.5**（261 提交 / 804 文件）。
- zcode 按用户口径以 **origin/main** 对账：当前 main = `3c5b2276`，与基线零移动。
- 补丁重放：397 个 studio/agent 补丁 + 7 个 zcode 补丁全量可贴，17 个冲突补丁已语义重定基（详见 `docs/superpowers/specs/2026-10-25-upgrade-studio-0739-agent-0225.md`）。
- research 组件随 agent 基线升级：`skills/research`、`optional-skills/research` 在 v0.22.4→v0.22.5 零 diff；`team/skills/research` 部署副本保持一致（grounded-citations 本地补丁与 worldmonitor-intel 本地件保留）。

## zcode 基线差一提交说明（2026-10-24 实测记录）

`zcode-patches/series` 头声明基线 `origin/main @ 0a1fc56 (v3.16.1, 2026-10-19)`；实际外置树 HEAD 为 `3c5b2276`（0a1fc56 之后又一个 `chore: sync ZCode source` 提交）。2026-10-25 用户裁定：**zcode 以 origin/main 变更对账，不按版本 tag**；当前 origin/main = `3c5b2276`，与 vendor 基线一致，7 条活跃补丁在该 pristine 快照上全量重放通过。series 头注释保留历史声明，升级轮以 main 对账为准。

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
