# vendor/ 上游基线台账

AIStudio 单仓整合轮（2026-10-24）落库。vendor/<tree> 是钉版的上游基线快照：**git 跟踪 pristine 基线，inject 在工作树上打补丁（脏态=预期注入态），基线变更只走 `npm run vendor:sync` 显式通道**。树内**禁止**建 `.git`（会让外仓记成 gitlink、文件不可跟踪）。

| 树 | commit | 版本 | upstream remote | 提取方式 |
|---|---|---|---|---|
| hermes-studio | `dad736a93` | v1.0.9（tag 与包版本脱钩：该 tag 的 package.json=0.8.11；台账以 tag 为准） | https://github.com/EKKOLearnAI/ekko-studio.git（旧名 `hermes-studio` 为重定向别名；2026-10-31 实测 full_name=ekko-studio） | `git archive HEAD \| tar -x`（干净 HEAD，排除工作树注入态与 node_modules/dist） |
| hermes-agent | `f0d94882e` | v0.22.6 | https://github.com/NousResearch/hermes-agent.git | 同上 |
| zcode | `a60ba6a7` | 包版本 3.17.1（谱系 v3.16.1 系列；**同步口径=上游 main 变更，不看版本 tag**，2026-10-25 用户裁定） | （闭源底座仓，upstream/zcode 本地树） | 同上 |

> 2026-10-31 升级轮：hermes-studio 基线已升 v0.8.0（本批，44 失败件重生成/2 退役/4 条迁位，重放零失败）；补丁 329 esp32 段随上游迁移改指 `packages/mcu/esp32-*`。hermes-agent 仍 v0.22.5（main 领先 3087c）。zcode 已于 2026-10-31 同步批升 `a60ba6a7`（v3.17.1 线，8 条活跃补丁重放零失败，002/006 重生成、引擎构建绿）；同步 spec 见 `2026-10-31-zcode-3171-sync.md`。

> 2026-11-02 升级批：hermes-studio 基线升 **v1.0.9**（`dad736a93`，上游 2026-11-01 发布；v0.8.0→v1.0.9 为 13 提交/100 文件）。studio 侧 351 补丁净基线全量重放零失败：023 上下文重生成、042 上下文行校准（0.8.0→0.8.11）、718 installer.nsh hunk 上下文校准、**207 退役**（上游已原生 pin hermes-agent 0.22.5/v0.22.5/bf0203a7，与本仓 agent 钉版一致，保留即降级；原件 .archived-patches/）。hermes-agent 维持 v0.22.5（上游最新稳定仍此版）。spec 见 `2026-11-02-vendor-upgrade-studio-v109.md`。

> 2026-11-02 复核批（同日晚，spec `2026-11-02-agent-debt-recheck.md`）：升级批曾记「agent 80 补丁 pristine 重放必败存量债」，**证伪**——真 pristine（bf0203a794 archive）与 git 基线树上 80/80 全绿；升级批观察到的 80 WARN 系 final inject 重跑在已部分注入 agent 树上的伪象（git apply 无幂等，已应用补丁连锁报错）。主检出 agent 态已验算=基线+80 补丁完全可再生（clean+inject 即重建）。真实小债=7 项上游文件被 `vendor/hermes-agent/.gitignore`（上游自带，随基线入库）的 `export*` 与 `apps/desktop/electron/**/*.d.ts` 规则误伤未入库，本批 `git add -f` 补录；**后续 vendor-sync 重建 agent 基线时同规则补录**。另：升级批的 VENDOR.md 台账更新曾被 pre-commit 的 vendor/** 撤出规则静默退栈（未带 VENDOR_SYNC=1），改动随 worktree 删除丢失，本批一并补齐——**vendor/ 下任何入库变更（含本台账）都须 VENDOR_SYNC=1 提交**。

> 2026-11-03 升级批（spec `2026-11-03-vendor-upgrade-agent-v0226.md`）：hermes-agent 基线升 **v0.22.6**（`f0d94882e`，上游 2026-11-02 发布；v0.22.5→v0.22.6 为 3482 提交/4316 文件）。agent 面 82 补丁新基线重放：**17 枚上下文失配全数重生成**（14 枚 3way 自动合；450/470/725 手解——上游新增 timezone/grace_minutes/catch_up、control_reserve、silence_allowed 包裹分别与我方 base_url/collab_event_id/回合恢复块并集）；clean+inject 全量 434 补丁零 WARN。`.gitignore` 误伤面（electron `*.d.ts`）核验已在位。
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
