---
name: hermes-source-patch-persistence
version: 1.0.0
description: "Persist Hermes source patches against update overwrites."
---

# Hermes 源码改动的持久化（防 hermes update 冲掉）

直接改 `~/.hermes/hermes-agent/` 下的源码（gateway adapter、plugin、platform 文件）会被 `hermes update` 覆盖丢失。本 skill 是把这类改动**做成可漂移自愈**的标准三件套：标记区块 → git-diff patch → 静默 watchdog cron。

> 触发场景：给 gateway adapter 加过滤/标记/开关、改 plugin 行为、任何对 `hermes-agent/` 源码树的手工 patch。典型实例：Matrix adapter 的 anti-loop 自标记与 noise-filter（见 `references/matrix-adapter-antiloop.md`）。

## 核心原则

0. **🔴 完成即 commit——patch 三件套是补丁层，不是免 commit 牌**（2026-08-25 F2/F3/F4 整组丢失教训）。worker 在 hermes-agent 主仓工作树改了源码但从未 commit，gateway 重启/`--replace`/上游 git pull 直接把未提交改动整体冲掉——三张「done 已核验」的卡一夜回到解放前。**任何对主仓源码的改动，kanban_complete 的验收必须包含「git log 可见对应 commit」**，只看工作树 diff 不算数。orchestrator 核验清单四要素：git log 有 commit + grep 见机制块 + 测试通过 + 基线对比。未 commit 的工作树改动 = 随时可以消失的半成品。
1. **能用配置/行为层解决就不改源码**。改源码是最后手段——因为每次 `hermes update` 都可能冲掉。先确认配置项、环境变量、SOUL 规则能不能达到目的。
2. **默认不破坏现有行为**。新机制用环境开关控制，默认保守值（如默认 off / 默认保持原 msgtype），用户显式开启才改变行为。
3. **可观测 + 可回退**。每次拦截/改判打 `logger.debug`（含原因），并提供总开关 + 分类开关，误伤时单类关闭。

## 三件套流程

### 1. 标记区块包裹改动

所有源码改动用成对的明确标记包裹，便于 update 后 grep 定位 + 机械校验是否被冲掉：

```python
# >>> swarm:<feature> >>>
# ... 改动（带注释说明为什么、哪个开关控制） ...
# <<< swarm:<feature> <<<
```

标记名全小写带 `swarm:` 前缀，一个 feature 一对。**验证数量**：`grep -c "swarm:<feature>" <file>`，写进文档作为期望值。

### 2. 改前备份 + 改后 git-diff 生成 patch

```bash
# 改前备份（留 pristine 副本）
cp <source_file> ~/.hermes/profiles/_shared/decisions/<name>.bak-pre-<feature>

# 改后用 git diff 生成标准格式 patch（a/ b/ 前缀，可 patch -p1 应用）
cd ~/.hermes/hermes-agent
git diff <relative_source_path> > ~/.hermes/profiles/_shared/decisions/<name>.patch

# 验证 patch 格式有效（逆向 dry-run）
cd ~/.hermes/hermes-agent && patch --dry-run -p1 -R < ~/.hermes/profiles/_shared/decisions/<name>.patch && echo "✓ 可应用"
```

⚠️ 用 `git diff` 而非 `diff -u`——前者生成带 `a/ b/` 前缀的标准格式，`patch -p1` 能干净应用；后者路径需手工修正。

### 2b. 新建共享模块（untracked 文件）的 patch 生成

当改动是**新建一个被多处 import 的共享模块**（如 `gateway/noise_filter.py` 被两个 adapter 依赖），它是 untracked 新文件，`git diff` 默认抓不到。用 intent-to-add 使其可 diff：

```bash
cd ~/.hermes/hermes-agent
git add -N <new_file>          # intent-to-add，让 untracked 文件进入 git diff 视野
git diff <new_file> > ~/.hermes/profiles/_shared/decisions/<name>-module.patch
```

⚠️ 共享模块是**单点故障**——它被多个 adapter import，一旦被 `hermes update` 冲掉（或删除），所有依赖它的 adapter 都会 import 失败。watchdog 必须单独检测它的存在性（`[ -f <module> ]`），不能只检测 adapter 里的标记。

### 2c. 多文件改动的 watchdog：一处漂移单独重打

当一次改动横跨多个文件（如两个 adapter + 一个共享模块），watchdog 要**逐文件检测标记 + 逐文件重打对应 patch**，而不是"任一缺失就全量重打"。每个文件一个 patch 文件，检测脚本用 case 匹配缺失项单独重打。这样上游只冲掉一个文件时，不会误重打其他未漂移的文件。

### 3. 静默 watchdog cron 自愈

写一个 drift-check 脚本，grep 标记是否存在，缺失则自动重打 patch，无法干净应用则告警人工。**关键约定：cron 的 `no_agent=True` 下「Empty stdout = silent」**——所以脚本**默认静默**（健康时无输出 exit 0），`--verbose` 才打印。

脚本骨架见 `scripts/drift-check-template.sh`。要点：
- 默认 quiet（健康静默），`--verbose` 交互模式打印 ✓
- 退出码：`0`=正常（静默） `1`=已自动重打（告警，提示人工复核+重启 gateway） `2`=需人工（patch 缺失或无法干净应用）
- 脚本放 `<profile>/scripts/`（cron `script` 相对路径解析到 profile 的 `HERMES_HOME/scripts/`）

建 cron job：

```
cronjob action=create no_agent=true script=<name>.sh schedule="0 9 * * 1" deliver=local \
  prompt="<一句话说明检测什么、被冲掉怎么办>"
```

## 验证清单（改完必跑）

```bash
# 1. 语法编译
python3 -m py_compile <source_file> && echo PASS

# 2. 标记区块数量符合预期
grep -c "swarm:<feature>" <source_file>

# 3. patch 存在且可应用
cd ~/.hermes/hermes-agent && patch --dry-run -p1 -R < ~/.hermes/profiles/_shared/decisions/<name>.patch && echo "✓"

# 4. watchdog 脚本：默认静默 exit 0 / verbose 打印
OUT=$(bash <script>); echo "stdout=[$OUT] exit=$?"   # 健康应 stdout空 + exit 0
bash <script> --verbose                              # 应打印 ✓

# 5. 端到端 cron run 一次确认 last_status: ok
cronjob action=run job_id=<id>

# 6. 网关类 patch：重启网关后验证「运行中进程已载新码」——进程加载的是启动时的代码，
#    commit 落地 ≠ 进程生效。源文件 mtime 必须早于网关进程 lstart，
#    对应 __pycache__/*.pyc mtime 必须晚于 lstart（重编译过），再加 health 端点探活
ls -la <source_file> <pkg>/__pycache__/
curl -s -m 15 http://127.0.0.1:8650/health
```

## 常见坑

- **自回环安全**：给收端消息 handler 加过滤时，确认 bot 自己发的消息在 sync 回环时先被 self-sender 检测拦下（检测点在 self-sender 过滤**之后**），否则 bot 会把自己发的带标记消息误拦。
- **mention 例外**：收端拦"机器生成"消息时，显式 mention 本 bot 的要放行——否则把合法跨机调用当噪声掐掉。
- **escape-drift**：`patch` 工具对含 `\\\"` 的 old/new_string 会报 escape-drift——重读文件拿精确内容再 patch，不要手写转义。
- **hardline 命令拦截**：超长 inline 命令（heredoc/one-liner）会被 hardline block，拆成多条独立小命令跑。
- **正向 `git apply --check` 失败 ≠ patch 损坏——已应用树上的预期语义**：`--check` 判定的是「对干净树可否应用」，marker 已落 live 树时必然失败；拿它当 liveness 探针会把健康系统误判为损毁。已应用态验收组合：逐文件 `grep -c <marker>` 对期望值 + `git apply --reverse --check` 通过 + 重放管线 rc=0 且判定 PRESENT(skip)；机制是否真活再叠行为探针（直接调用被改函数/红队套件）。
- **patch-vs-patch 重叠冲突（一个文件被多个 patch 改）**：当某 patch 把**不相关改动捆绑**进来（例：`weixin-adapter-noisefilter.patch` 在加 noise-filter 的同时还捆绑了 voice-STT 重写），而另一个 patch（`hermes-weixin-local.patch`）后来正常落了那份 STT 改动，旧 patch 就**永远应用不上**——它想改的代码已被另一 patch 以不同形式落地。watchdog 会报"无法干净应用，需人工重建"。**修复**：把该 patch 瘦身成只含本 feature 的 hunk（用 `scripts/extract-noisefilter-patch.py` 按 marker 过滤 `git diff -U1` 的 hunk，验证 `git apply --reverse --check` 通过后替换备份）。教训：**一个 patch 文件只装一个 feature，别把顺手改的不相关逻辑捆进去**。
- **同一代码区域被后续 feature 再改 → 重生成属主 patch 吸收该区域，收敛单链**：在旧 region 上叠第二条 patch 链必然产生双 marker 漂移面。做法：以 live 现状为基重打属主 patch，把区域内的旧 shim/入口调用一并吸收，旧 feature marker 验收归零（`grep -c <旧marker> == 0`）。取舍上「吸收为单一回收链」优于「另立 manifest 退役」——只有全库机械调查证实旧链零铺设点时才走退役。
- **陈旧 patch 的"自愈"是回归**：watchdog 的 `git apply` 对陈旧 patch "成功" ≠ 正确——它会把旧逻辑重打回去，覆盖掉后来正常落地的改动（例：watchdog 把旧 STT 重打，覆盖 `hermes-weixin-local.patch` 的现代 voice 处理）。**patch-check 和 grep 标记都测不出这种回归，必须加行为探针**（直接调用被改的函数断言真实输出，例：`python3 -c "from gateway.platforms.weixin import _extract_text; ..."`）。发现后：`git apply --reverse` 移除污染 hunk，并立刻更新备份 patch 防再次重打。
- **adapter 迁移后 patch 要跟随新路径**：上游大重构会把 adapter 整体挪走（例：commit 5600105478 把 matrix 等从 `gateway/platforms/matrix.py` 迁到 `plugins/platforms/matrix/adapter.py`）。`hermes update` 后旧路径文件直接消失，patch 无法应用。watchdog 检测时要 grep **新路径**，patch 头也要指向新路径。排历史遗留时先 `git log --all -- <old_path>` 找迁移 commit，再 `find . -path '*plugin*<name>*'` 定位新家。
- **CONFLICT 先查先决物（0928 实证）**：patch 反复 CONFLICT 的真因常不是 patch 本身过期，而是其**先决物**（被调模块本体，如 `agent/action_gate.py`）从未 commit 进 main——update 每次冲掉工作树残留，只剩调用点 hunk 无法落地。恢复链：wip 快照 commit（git cat-file 可达，如 440f27c1fe）取模块本体 → rescue 分支取落点实现 → 手工适配 → 测试全绿后**立即 commit**（未 commit 的源码改动必被下次 update 冲掉）。
- **上游新增测试守卫的适配三模式**：① home_io_guard 拦真实家目录 I/O → 读真实契约文件的测试加 `@pytest.mark.allow_real_home_io`；② 契约演进出 arg_contracts（如 delegate_task/memory/acp_send 空参应 block）→ 旧「无参直通」断言改新语义；③ 契约数漂移（24→47）→ 改超集断言（ontology ⊆ yaml）不锁死总数。另：handle_function_call 在 gate 前 alias cronjob→cronjob_manage，shadow 日志记运行时真名，断言需容忍双名。
- **watchdog 探测器必须探实质签名，禁探空补丁（2026-10-01 状态栏消失事故）**：`hermes-truncated-args-repair-gate.patch` 实质为空补丁（仅重写 EOF 换行符，`git apply --numstat` 无实质行），但 `tui-patch-watchdog.sh` 拿它的注释串 `Truncation heuristic gate` 当第 4 个探测器——树里永远 grep 不到 → 每次硬失败 exit 1 → 自愈回路整个失效，下次 update 后状态栏补丁无人重放。修复：探测器换成实质补丁的签名（`_model_name_is_glm_family` in agent/anthropic_adapter.py）。验证法：`git apply --numstat <patch>` 有非零实质行才算实质补丁；探测器签名必须先在已恢复树上实测 PRESENT 再写入脚本。守卫条件同理双分支实测：「update 进行中就跳过」类守卫用 `pgrep -f` 匹配易把无关进程误判为进行中，连续多周期静默跳过巡检——上线前在条件为假场景实测必须放行，且跳过分支必须打日志可回查。
- **post-merge 钩子的健康分支禁提前 exit（2026-10-01 同事故第二根因）**：`hermes-agent/.git/hooks/post-merge` 曾在 inventory watchdog 健康时 `exit 0`，把后面的 skill-fence 修复和源码补丁重放（原 128-143 行）整体跳过——补丁重放代码写了却永远执行不到（当天 14:29 update 后 apply 日志 0 行）。修复：健康分支只记日志不退出，让幂等的 fence/重放步骤每次 post-merge 必跑。教训：「检查通过就退出」的分支会把同文件后部的自愈步骤静默短路；验收除 `bash -n` 外要跑干跑核对执行路径。
- **宿主动态 import 新模块的懒加载陷阱**：`sys.path` 注入若只写在新模块文件内部，宿主进程首次 import 它时注入尚未执行 → `No module named`。注入必须放在宿主文件调用点（import 语句之前）。这类 bug 单元级 dry-run 测不出——只有重启后的真实宿主进程收到首条真实流量才暴露。
- **卡死的 update-autostash 会让整条自愈链停摆（2026-10-01 状态栏全链事故）**：当天 04:39/11:31 两次 update 的 `hermes-update-autostash` settle 失败永久留在 stash → post-merge hook（第 134 行 `N_AUTOSTASH>0`）每次打「deferring source-patch re-apply」直接跳过 → apply-source-patches.log 全天 0 条 → 19:33 最后 update 后 18 个补丁零重放 → 21:38 启动的 TUI 载入无补丁 bundle，状态栏消失。叠加另一根因：watchdog repair-gate 探测器探的是空补丁签名（上一条 lesson），15:32 起每次硬失败 exit 1 且不打日志，自愈也没接管。**处置顺序**：① `git stash show -p stash@{N}` 归档到 `patches/stash-backup-<date>/`（+MANIFEST+stash reflog）→ ② `git stash drop` 清零（解锁 defer）→ ③ 手跑 `bash patches/apply-source-patches.sh`（内含 apply-tui-patches.sh 子脚本重放 statusbar + rebuild dist）→ ④ 逐 patch `git apply --reverse --check` 验 PRESENT + src/dist 签名 grep（statusbar 签名=`ccExtraTruncated`/`fetchIpWeather`/`fetchVolcengineUsage`）→ ⑤ 手跑 tui-patch-watchdog 验 rc=0 且日志恢复记行。**教训**：stash 非零 = 整条自愈链停摆，不只 statusbar；排查「修改全丢了」第一步永远先 `git stash list`，再看 apply 日志当日有没有 RAN 记录。**诊断竞态补丁（2026-10-05 复盘）**：慢 update 可能仍 mid-flight——判性前先看 watchdog log 尾部是否连续 `skip: hermes update in flight (pgrep)` + `pgrep -fl hermes update`；该状态下 stash 可能被正在 settle 的 update 合法消费（refs/stash 突然消失但对象仍 `git cat-file` 可达），此时勿归档勿 drop 勿手跑重放，等 pgrep 清空 + watchdog 连两拍恢复 `ok: patches intact` 再重新验 src/dist 签名——10-05 当天 22:04 update 从建 stash 到 settle+重建 dist 跑了约 9 分钟，期间两次诊断读数互相矛盾全是竞态假象。另：settle 完成不等于运行中 TUI 恢复——TUI 进程启动时加载的是当时的 dist，dist 是事后重建的，须重启 TUI 才载新状态栏。
- **update 多波连击后的恢复第一站是 `.bak.<epoch>` 孪生，不是从零重建**：patch 管线旧基线回写会在写入前留好版孪生 `<file>.bak.<epoch>`——被洗文件先 `find <tree> -name '*.bak.*'` 扫孪生、按 epoch 挑最近好版逐文件回放。**连带恢复**：被洗共享模块的依赖模块（schema/调用链）同一 pass 一并回放，验收用调用点 import 冒烟而非只 py_compile 模块本体——断链发生在 import 侧，本体编译通过也会运行时炸。
- **发现裸工作树改动不在任何 patch 里 = 随时会丢的半成品**：M 态 tracked 文件但 `grep -l <file> patches/*.patch` 无命中——这类改动不在补丁层、也没 commit，下次 update 的 `reset --hard` 必冲掉。收尾时必须 `git status --porcelain | grep -v '^??'` 对 tracked 改动逐个问「它属于哪个 patch / 有没有 commit」。**三步闭合，缺一会丢**：① **判归属连子脚本一起豁免**——只 `grep patches/*.patch` 会漏 perl 就地重写型子脚本（如 `apply-kanban-worktree-default.sh` 用 `perl -i -pe` 改 kanban 文件），逐文件核验要同时匹配 `apply-*.sh` 子脚本，否则把已由脚本认领的改动误判成孤儿、白做 patch。② **真孤儿 = patch + commit 双落地**——`git diff <file> > patches/hermes-<name>.patch` + 挂进 `apply-source-patches.sh` SPECS（新条目带一句救援缘由注释，`bash -n` 验语法）+ 单文件 `git add <file> && git commit -m "..."`（只 stage 这一个文件，不夹带其他 M 态）。③ **幂等判定**——新 patch 当前已应用态必须 `git apply --reverse --check` 通过（apply 循环判 PRESENT 跳过），`bash -n` 之外还要模拟 apply 循环判定输出 `PRESENT (skip)` 才算真接线。**预期行为提前向用户交代**：commit 落 main 后，下次 `hermes update` 的 ff-only 会因本地 commit 失败 → `_reconcile_diverged_checkout` 把它 park 进 `refs/hermes-update-backups/diverged-main-*`——这**不是丢改动**，历史实证所有本地 commit 都走了这条路且最终以 patch 形式重落地：**commit 记账、patch 持久，双轨互备**，别把 park 当事故去追。
- **改「已被现有 patch 携带」的源码行：同 pass 同步 patch post-image**（状态栏天气单位修复实证）。只改源文件会让树与 patch 分歧，下次 update 重放 patch 时把用户可见的修复整体退回。三步闭合：① **行数不变的内容替换**——只改 patch 内 `+` 行的行内内容、不动行数，hunk 头计数保持有效，patch 对 pristine 树仍可干净应用；必须增删行则要连 hunk 头计数一起改，尽量避开；② **重建 dist**——TUI 从 `dist/entry.js` 加载，`cd ui-tui && npm run build` 不跑则重启也不生效；③ **三点 grep 验收**——源文件、patch 文件、dist 各命中一次新串，再 `git apply --reverse --check <patch>` 确认 patch 仍被判定为已应用态（幂等跳过）。进程内存态缓存（如状态栏 10 分钟天气缓存）重启即清，无需等刷新窗口。

## 参考文件

- `references/matrix-adapter-antiloop.md` — 完整实例：Matrix adapter 的 anti-loop 自标记 + noise-filter 改动落点、自回环安全性论证、单元测试
- `references/weixin-noisefilter-rebuild.md` — patch 重叠冲突 + 陈旧 patch 回归的完整处置实例（2026-09-03）：诊断、行为探针、瘦身重打、共享模块恢复
- `scripts/drift-check-template.sh` — 静默 watchdog 脚本骨架（默认 quiet + verbose 开关 + 三态退出码）
- `scripts/extract-noisefilter-patch.py` — 从 `git diff -U1` 按 swarm marker 提取纯单 feature hunk，生成 watchdog 可干净重打的瘦身 patch
