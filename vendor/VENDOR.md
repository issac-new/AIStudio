# vendor/ 上游基线台账

AIStudio 单仓整合轮（2026-10-24）落库。vendor/<tree> 是钉版的上游基线快照：**git 跟踪 pristine 基线，inject 在工作树上打补丁（脏态=预期注入态），基线变更只走 `npm run vendor:sync` 显式通道**。树内**禁止**建 `.git`（会让外仓记成 gitlink、文件不可跟踪）。

| 树 | commit | 版本 | upstream remote | 提取方式 |
|---|---|---|---|---|
| hermes-studio | `cedaceaef` | v0.8.20（**tag 命名说明**：上游 v1.0.9 的 package.json 本就是 0.8.11，此后回归 0.8.x 线连发 v0.8.12~v0.8.20；v1.0.9→v0.8.20 谱系前进 63 提交非降级，台账以 git ancestry 为准） | https://github.com/EKKOLearnAI/ekko-studio.git（旧名 `hermes-studio` 为重定向别名；2026-10-31 实测 full_name=ekko-studio） | `git archive HEAD \| tar -x`（干净 HEAD，排除工作树注入态与 node_modules/dist） |
| hermes-agent | `2bd378ed1` | v0.23.0 | https://github.com/NousResearch/hermes-agent.git | 同上 |
| zcode | `a9fe401e` | 包版本 3.17.2（谱系 v3.16.1 系列；**同步口径=上游 main 变更，不看版本 tag**，2026-10-25 用户裁定） | （闭源底座仓，upstream/zcode 本地树） | 同上 |

> 2026-10-31 升级轮：hermes-studio 基线已升 v0.8.0（本批，44 失败件重生成/2 退役/4 条迁位，重放零失败）；补丁 329 esp32 段随上游迁移改指 `packages/mcu/esp32-*`。hermes-agent 仍 v0.22.5（main 领先 3087c）。zcode 已于 2026-10-31 同步批升 `a60ba6a7`（v3.17.1 线，8 条活跃补丁重放零失败，002/006 重生成、引擎构建绿）；同步 spec 见 `2026-10-31-zcode-3171-sync.md`。

> 2026-11-02 升级批：hermes-studio 基线升 **v1.0.9**（`dad736a93`，上游 2026-11-01 发布；v0.8.0→v1.0.9 为 13 提交/100 文件）。studio 侧 351 补丁净基线全量重放零失败：023 上下文重生成、042 上下文行校准（0.8.0→0.8.11）、718 installer.nsh hunk 上下文校准、**207 退役**（上游已原生 pin hermes-agent 0.22.5/v0.22.5/bf0203a7，与本仓 agent 钉版一致，保留即降级；原件 .archived-patches/）。hermes-agent 维持 v0.22.5（上游最新稳定仍此版）。spec 见 `2026-11-02-vendor-upgrade-studio-v109.md`。

> 2026-11-02 复核批（同日晚，spec `2026-11-02-agent-debt-recheck.md`）：升级批曾记「agent 80 补丁 pristine 重放必败存量债」，**证伪**——真 pristine（bf0203a794 archive）与 git 基线树上 80/80 全绿；升级批观察到的 80 WARN 系 final inject 重跑在已部分注入 agent 树上的伪象（git apply 无幂等，已应用补丁连锁报错）。主检出 agent 态已验算=基线+80 补丁完全可再生（clean+inject 即重建）。真实小债=7 项上游文件被 `vendor/hermes-agent/.gitignore`（上游自带，随基线入库）的 `export*` 与 `apps/desktop/electron/**/*.d.ts` 规则误伤未入库，本批 `git add -f` 补录；**后续 vendor-sync 重建 agent 基线时同规则补录**。另：升级批的 VENDOR.md 台账更新曾被 pre-commit 的 vendor/** 撤出规则静默退栈（未带 VENDOR_SYNC=1），改动随 worktree 删除丢失，本批一并补齐——**vendor/ 下任何入库变更（含本台账）都须 VENDOR_SYNC=1 提交**。

> 2026-11-03 升级批（spec `2026-11-03-vendor-upgrade-agent-v0226.md`）：hermes-agent 基线升 **v0.22.6**（`f0d94882e`，上游 2026-11-02 发布；v0.22.5→v0.22.6 为 3482 提交/4316 文件）。agent 面 82 补丁新基线重放：**17 枚上下文失配全数重生成**（14 枚 3way 自动合；450/470/725 手解——上游新增 timezone/grace_minutes/catch_up、control_reserve、silence_allowed 包裹分别与我方 base_url/collab_event_id/回合恢复块并集）；clean+inject 全量 434 补丁零 WARN。`.gitignore` 误伤面（electron `*.d.ts`）核验已在位。

> 2026-11-03 同步批（spec `2026-11-03-runtime-deps-refresh.md`）：zcode 基线升 **v3.17.2**（`a9fe401e`，a60ba6a7→a9fe401e 为 1 提交/203 文件）。8 条活跃补丁（002-009）净基线重放零失败零重生成，clean→inject 幂等二连验证过；upstream/zcode 缓存树同批治理 checkout 至新基线（原 HEAD 3c5b2276 违反 pristine 规则）。同批 exa-mcp-server 3.4.1→3.4.3（npm latest 实测，runtime/exa 正身+patch 396 重生成）。

> 2026-11-04 升级批（spec `2026-11-04-vendor-upgrade-agent-v0227.md`）：hermes-agent 基线升 **v0.22.7**（`b200f5bc6`，上游 2026-11-03 发布；v0.22.6→v0.22.7 为 589 提交/554 文件，主题=room lead 路由/plugin-catalog 重 pin/webapp 状态修复）。agent 面 85 补丁新基线重放：**3 枚上下文失配重生成**（408 `_tool_snapshot_selection` 插位致插入块漂移、470 `append_event` payload 延迟解析重构与 collab_event_id 并集改 resolve 包装、593 cache key 追加位上游新增 `check_fn_cache_epoch()` 后移），其余 82 枚 direct；净基线 clean+inject 零 WARN。runtime 覆盖层 5 条目镜像化重灌（cron.py/hosted_rooms.py/platforms/base.py/toolsets.py/tool_executor.py）＋宿主定向部署（宿主基线当日已先行 checkout v0.22.7，overlay 5 件回退态对齐）；manifest 其余 28 件宿主差异为并行会话在途域未动。`.gitignore` 误伤面核验：本轮无新增命中（d.ts 存续、export 无变更）。team 载体链随批进位 v0.22.7-team.1。
> 2026-11-06 升级批（spec `2026-11-06-vendor-upgrade-agent-v0230.md`）：hermes-agent 基线升 **v0.23.0**（`2bd378ed1`，上游 2026-11-05 发布；v0.22.7→v0.23.0 为 808 提交/1223 文件）。agent 面 91 枚补丁新基线落位：**6 枚手解重生成**（400 脱敏段并集 EPISTEMIC_STANCE_RULE/408 空行漂移/410 并行尾块漂移/470 上游吸收主体仅存 collab_event_id/593 追加位/602 条件漂移）＋**742 退役**（5 文件目标内容全被上游吸收，helpers 段与上游逐字一致保留即重复定义；207 先例；原件 .archived-patches/）；净 90 枚 clean+inject 零 WARN。`.gitignore` 误伤面核验：零命中。team 载体链进位 v0.23.0-team.1（扩展序归 1）＋requirements range 提界 <0.24（原上界 <0.23 不覆盖 0.23.0）。

> 2026-11-07 升级批（spec `2026-11-07-vendor-upgrade-studio-v0817.md`）：hermes-studio 基线升 **v0.8.17**（`35a7158a1`，上游 2026-11-05 发布；v1.0.9→v0.8.17 为 53 提交/1354 文件，主题=Person 任务流/群聊迁移公告/opencode 子进程环境；**上游 081b9393f「清空旧测试并精简 CI」删除 1140 个旧测试文件（−268K 行），本仓测试面补丁大面积孤儿化**；依赖零变化——lock 仅 2 行差，主检出 node_modules 免重装）。studio 面补丁处置：**8 枚纯测试补丁退役**（037/038/039/175/176/235/585/641，目标文件被上游整删，原件 .archived-patches/）＋**7 枚混合补丁剥除已删测试段**（322/323/329/640/642/690/718）＋失配补丁重锚（000/110 上下文校准等，见 spec）。hermes-agent 维持 v0.23.0（无新稳定 tag，main +216 canary 不追）；zcode 维持 `a9fe401e`（main 同步）。

> 2026-11-09 升级批（spec `2026-11-09-runtime-deps-refresh.md`）：hermes-studio 基线升 **v0.8.20**（`cedaceaef`，上游 2026-11-07~09 连发 v0.8.18/v0.8.19/v0.8.20 三 tag；v0.8.17→v0.8.20 为 10 提交/84 文件 +3691/−458，主题=Person 会话置顶/Hermes 0.23 运行时兼容收尾/系统指令并入聊天信封/DSH 升级守卫与 Antigravity 配置/authorized providers 恢复/实时语音重放防护；vendor-sync 文件面与上游 diff 精确吻合、pristine 抽验 3/3）。studio 面补丁失配处置见 spec 验证段。hermes-agent 维持 v0.23.0（无新稳定 tag，canary 流不追）；zcode 维持 `a9fe401e`（main 同点）；exa-mcp-server 3.4.3=npm latest。

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
