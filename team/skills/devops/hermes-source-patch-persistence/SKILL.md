---
name: hermes-source-patch-persistence
version: 1.1.0
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

## patch 三态盘点（每次 update 后的强制步骤）

**核心反模式**：用户报"X 没了"时直接 grep 树里有没有——这是单点判定，会漏掉两类关键真相：(a) 功能在 src 但 patch 不在 SPECS，下次 update 仍会被冲；(b) 多个 patch 名义独立但功能重叠，已被一个吸收。**单一真源是三重对账**：`patches/*.patch` 文件清单 ↔ `apply-source-patches.sh` SPECS 数组 ↔ src 探针命中。三者必须全过才认 patch 真活。

### 强制对账脚本（每次 update 后必跑）

```bash
# 1) patches/ 实际 .patch 文件
ls -1 ~/.hermes/patches/*.patch 2>/dev/null | xargs -n1 basename | sort > /tmp/patches_on_disk.txt

# 2) apply-source-patches.sh SPECS 数组里的 patch（只取引号内真名，剥注释）
sed -n '/^SPECS=/,/^)/p' ~/.hermes/patches/apply-source-patches.sh \
  | grep -oE '"[^"]+\.patch"' | tr -d '"' | sort > /tmp/patches_in_specs.txt

# 3) 看门狗最近一次日志，看哪些跑过（PRESENT / APPLIED / APPLIED(3way)）
grep -E "PRESENT|APPLIED|APPLIED\(3way\)|RAN|ACTION" \
  ~/.hermes/logs/tui-patch-watchdog.log | tail -30

# 4) 差集
echo "=== 在磁盘但不在 SPECS（孤儿 patch）==="
comm -23 /tmp/patches_on_disk.txt /tmp/patches_in_specs.txt
echo "=== 在 SPECS 但磁盘无文件（缺失）==="
comm -13 /tmp/patches_on_disk.txt /tmp/patches_in_specs.txt
```

### 状态五分类（差集 + 探针组合判定）

| 状态 | 判据 | 处置 |
|---|---|---|
| **真活** | 磁盘 + SPECS + src 探针三全有 | — |
| **应清未清退役** | 磁盘有，SPECS 注释明示退役（"retired 2026-XX-XX"、"truncated-args-repair-gate RETIRED"等），src 探针 0 命中 | `mv ~/.hermes/patches/<p> ~/.hermes/patches/retired/<p>.bak-<date>` + 注释残留确认 |
| **锚点悬空** | 磁盘 + SPECS 在，但 `git apply --check` 报 target 文件不存在 | 核 `git log --all -- <old_path>` 找迁移 commit，确认新路径后 reanchor 或删 |
| **被合并吸收** | 磁盘 + SPECS 缺，但 src 探针全活（看门狗 "PRESENT (already applied)" 还在出现） | 删 patch 文件 + 看门狗清单同步去名；这是已 applied 但忘了 retire |
| **真丢必修** | 磁盘 + SPECS 都缺，src 探针 0 命中 | reanchor patch + 加 SPECS + 重 build + 重启 |
| **被 if 截走** | 磁盘 + SPECS 全在，src 探针 0 命中；看门狗日志里 patch 名一次未出现 | 找到 `apply-source-patches.sh` 里截走此 patch 的 `if [[ $patch == ... ]]` / `case` 分支，删除该分支或把 patch 移出黑名单 |

### 三态盘点 ≠ 单独看 SPECS 缺否

**常见误判**：
- 看到 SPECS 缺 `tui-ccswitch-statusbar.patch` 就直接加回清单 → 实际 src 里 7 个探针全 0 命中、patch 锚点已与上游失锚（行号/函数签名漂移），加回 SPECS 也会 `git apply --check` 失败。必须先 reanchor。
- 看到 `hermes-kanban-write-guardrail-udf.patch` 不在 SPECS、src 探针却 4/4 命中 → 不能直接清文件（patch 内容已被 `hermes-kanban-consolidated.patch` 吸收）；也不能加回 SPECS（行号已错位）。看门狗 "PRESENT (already applied)" 是关键判据：说明脚本曾能 apply，现在 src 已有 = 被另一个 patch 吞了 → 属"应清未清退役"。

### 探针提取方法

从 `.patch` 文件 grep 出 `+` 行的特征符号（函数名/标记串），不要 grep `-` 行（那是旧代码）。做法：

```bash
# 提取所有 + 行里的标识符
grep -E "^\+" ~/.hermes/patches/<p>.patch \
  | grep -oE "swarm:[a-zA-Z0-9_-]+|<FuncName>|<CONST_NAME>" \
  | sort -u
# 验证：每个探针在 src 必须 ≥1 命中
for p in $probes; do grep -rl "$p" <pkg> | wc -l; done
```

### 看门狗日志的状态信号（≥3 连读，三拍一致才信）

单看一拍会撞"竞态假象"——update 慢、settle 期间 stash 引用时有时无。处置前先核三拍：
1. `tail -3 ~/.hermes/logs/tui-patch-watchdog.log` 末三条
2. `pgrep -fl 'hermes update'`
3. `git -C ~/.hermes/hermes-agent stash list`

`pgrep` 有结果 = update 在飞，stash 状态都不可信；watchdog log 末条 `ACTION REQUIRED: pipeline baseline is stale` 连两拍 = 真漂移，单拍 = 可能是 settle 中。

### 已应用态的 grep 探针副作用

`git apply --reverse --check` 通过 = 已 applied；正向 `git apply --check` 必失败（目标树已是 post-image）。**别把正向 check 当 liveness 探针**，会误报"patch 损坏"。

### 双向 check 四态（盘 patch 真假活的标准组合）

单一方向检查判不出"锚点漂移需要 3way"和"锚点已死"——必须正向 + 反向 + 3way 三拍组合：

| 正向 `--check` | 反向 `--check` | 3way `--check` | 状态 | 处置 |
|---|---|---|---|---|
| ✓ | ✗ | — | **未应用可干净 apply** | 看门狗/手动 apply |
| ✗ | ✓ | — | **PRESENT(skip)** 已应用 | 真活，无需操作 |
| ✗ | ✗ | ✓ | **DRIFT-3way** 锚点漂移需三方合并 | `git apply --3way` 重打；写看门狗（看门狗下次可能仍 fail-closed） |
| ✗ | ✗ | ✗ | **锚已死** target 文件不存在 / 函数已重写 | 核 `git log --all -- <old_path>` 找迁移 commit，否则删 patch |

不要停在"反向 check 失败"上——很多漂移 patch 走 3way 就能救回，先看 `--3way --check` 才能下"锚已死"结论（少了 3way 兜底会把可救的标成不可救，触发不必要的 reanchor 事故）。

### 已应用态的两态真活判据（防御 dangling 假成功）

反向 check + grep 探针**必须同时**通过，单一通过都不算真活——这是 2026-10-15/16 实证 dangling patch 假成功（SPECS 列了但 `git apply --3way` 实际没把 diff 写进 src、verification_6_signature 上报 0/0 仍被打包为 PASS）的根因，单向判定会被骗：

| 判据 | 含义 | 缺一即挂 |
|---|---|---|
| `grep -c <marker> <src>` ≥ 1 | **A：实质变更在树上** | src 探针 0/0 = 改动从未被 apply 进去（dangling） |
| `git apply --reverse --check <patch>` rc=0 | **B：patch 锚点匹配树当前 post-image** | reverse 失败 = patch pre-image 与树状态失配（漂移 / 已被人手改） |

- **A 缺**（src grep=0）= 经典 dangling patch（SPECS 列了、文件在，但 `git apply` 从未实际跑过）→ 走 reanchor + 强制 apply + 三层签名核验。
- **B 缺**（grep>0 但 reverse 失败）= patch 已被某次 update / 手改动 / 另一个 patch 替换掉，patch 名义独立但功能已不在线 → 把当前 src 探针对应的实质改动打成新 patch，旧的按 retire 流程归档。
- **两态都过**= 真活。`post-update-hook.sh` 和 `tui-patch-watchdog.sh` 的判定循环必须**先 grep 后 reverse**，缺一就触发自愈，**禁止**只看 grep 通过就静默放行。

为什么不能只看 reverse-clean：当 patch **从未被 apply** 时（dangling），`git apply --reverse --check` 报 rc=1（patch 与干净的 unpatched 树失配）——这反而是好事，会触发看门狗。但**如果 SPECS 列了且 src 0 命中，脚本里若只 grep 不 reverse，forward `git apply` 会因 0 命中跳过进 "已 applied" 分支**，剩下未应用的 patch 名义在 SPECS 但永远不跑——这正是 10/15 假成功的脚本形态。grep + reverse 是订单上的两步，不可省。

### 用户报 "X 没了" 时的入口动作排序

用户连续问"怎么又没了"时，回答前必跑四步（耗时 < 10s），决定走哪条修复路径：

```bash
# 1. 找 patch 名（功能 → patch 锚点）
grep -rl "<key_symbol>" ~/.hermes/hermes-agent/ui-tui/src/ 2>/dev/null | head
# 同时 ~/.hermes/hermes-agent/<pkg>/ 下同理
# 0 命中 = 进第 2 步；≥1 命中 = patch 真活，问题在 config 层

# 2. 区分 config 路径 vs patch 路径
grep -E "runtime_footer\.enabled" ~/.hermes/config.yaml ~/.hermes/profiles/*/config.yaml 2>/dev/null
# 路径 a: runtime_footer.enabled: false → config 改的，跟 patch 无关
# 路径 b: ccswitch 探针 0 命中 → patch 路径，走第 3 步

# 3. patch 三态盘点（直接进"强制对账脚本"）

# 4. 看门狗当日是否跑过
grep -E "$(date +%Y-%m-%d)" ~/.hermes/logs/tui-patch-watchdog.log | head
# 0 行 = 看门狗自愈链也死了（autostash 卡死或被 if 截走），进 stash list 排查
git -C ~/.hermes/hermes-agent stash list
```

**用户两次连续追问 ≠ 简单复述**：第二次问往往指向更深根因（第一次问的是症状，第二次问的是机制）。第二次回答前先回到第 1 步重跑——别在第一次的结论上加戏，否则容易把"config 改"误判成"patch 丢"（反之亦然），多浪费一轮往返。

### runtime_footer ≠ ccswitch 状态栏

两条独立路径，混了会归错因：
- `runtime_footer.enabled`（config.yaml）= TUI 自带 footer（model / context_pct / cwd），关掉它**不会**关掉 ccswitch 段
- `tui-ccswitch-statusbar.patch` = 自定义段（useCcSwitchModel / fetchIpWeather / fetchVolcengineUsage / fmtReset），是独立注入的 StatusRule 段，关 runtime_footer 对它无效

用户报"状态栏没了"时分两类回答：(a) "连 model/context_pct 都没了" → runtime_footer 路径；(b) "cc-switch 配额/IP 没了" → ccswitch patch 路径，grep `appLayout.tsx` 探针判定。

### TUI patch 修复的快恢复路径（apply-tui-patches.sh 的"已 applied 探测"）

`apply-tui-patches.sh` 内置 idempotent 探测（"Patch already applied (customizations present in source)"），意思是它**不会重 apply**已经 grep 到目标探针的 src——直接进 build。**手动 reanchor 时不要 git apply 后再跑脚本**，脚本会以为"已 applied"跳过而漏跑检测本身的预期步骤。正确顺序：

```bash
cd ~/.hermes/hermes-agent
# 1. 三拍 check 判定用哪种 apply 模式
git apply --check <patch>.patch 2>&1          # 正向
git apply --reverse --check <patch>.patch 2>&1 # 反向
git apply --3way --check <patch>.patch 2>&1    # 3way
# 2. 按上方"双向 check 四态"表选定模式后，手动 apply 到 src
git apply --3way <patch>.patch
# 3. 再跑脚本（它会跳过 apply 步骤，直接 build dist）
bash ~/.hermes/patches/apply-tui-patches.sh
# 4. 终验
grep -c "fetchIpWeather" ui-tui/dist/entry.js   # ≥1 = dist 重建成功
# 5. 重启 TUI 加载新 dist
```

**为什么不在步骤 2 用脚本一次包办**：脚本的 3way 分支只在 `git apply --check` 失败且 grep 探针也 0 命中时才进；如果你已经在 worktree 上手动 3way 成功、src 有探针，脚本会判定"已 applied 跳过"——但你已经走过 3way 步骤了。两种路径都通，但脚本路径多一次 3way 探测（无害），手动路径你已经知道结果（更快）。

### dangling 修复完成态必须 commit 入仓（防 update 顶掉的唯一硬屏障）

dangling patch 修复（reanchor + 强制 apply 成功）只是把 diff 写进了工作树——`hermes update` 仍会在下次跑 `reset --hard` 时把它冲掉，因为 `.hermes/patches/<patch>` 的 pre-image 仍锚定旧 commit，新 HEAD 已不匹配，**下一次自愈链会反向运行 unpatch 路径**。**唯一硬屏障是把当前已 applied 的 src 改动 commit 进工作分支**，让 patch 的"实质载体"在主仓而非补丁层。

```bash
cd ~/.hermes/hermes-agent
# 1. 修复 src 干净后（两态判据都过）才做这一步
git add ui-tui/src/components/<modified_files>
git commit -m "feat(tui): <feature> (reapply dangling patch)"
# 2. 接受 pre-image 漂移：commit 后 patch reverse-check 仍 rc=0 是因为树 = post-image，
#    但 forward check 必然失败（已 applied）——这正是预期形态，post-update-hook 的
#    两态判据会侦测到 src 有实质签名 → 走 grep 通过分支，不会瞎 reapply。
# 3. 在 commit message 里写明 KNOWN FRAGILITY 段：将来 update 上游吞改时，
#    人工 reanchor 仍需在 worktree 上重打 patch —— commit 只是在 update 期间保住状态。
```

**取舍**：commit 入仓后 patch 文件本身**不再可被反向 apply**（pre-image 锚定旧 commit，已在 git 里落地的改动是 git 范畴而非 patch 范畴）。代价是 `hermes update` 之后想再走自动自愈链会失败——必须以"以 live 现状为基重打 patch"或"按 retire 流程把旧 patch 归档"收尾。这是值得的：commit 是 git 自己的持久化机制，patch 文件是我们自建的备份机制，**双轨互备优于单轨**。

**禁止停在"工作树 M 态有变更"**——`post-update-hook.sh` 的 grep 探针只能告诉看门狗"src 有实质变更"，但 update 走完的 `git reset --hard` 会**无视 untracked tracked-state 整体重置**，唯一不会丢的是 `git log` 里的 commit hash。

### 与 cap 重叠

`kanban-source-tree-repair` 治"代码组件 import 失败"（单文件单模块），本节治"patch 三态盘点"（跨多 patch 跨 SPECS 跨 src）。两者不重叠，前者用 shim/占位，本节用 SPECS 数组加 reanchor。

## 常见坑

- **SYNTAX-GATE 的 `venv/bin/python` 硬编码会把「解释器不存在」误报成「文件不编译」（2026-10-16 实证）**：`apply-source-patches.sh` 的语法门与 DEP-GATE 曾硬编码 `$REPO/venv/bin/python`，而 `hermes update` 半途中断会把 venv/ 整个删掉重建（实测两次：只剩空 lib/、连 lib 都没有）。此时 `py_compile` 执行失败 → 门把「python 不存在」当成「文件 does not compile」→ **10 个健康文件全假阳性**，且基线门拦住 revert，日志一片 "MANUAL FIX NEEDED" 纯噪音。修法：脚本顶部加三级解析（venv/bin/python 存在且可跑 → tools 下完整工具链 python → PATH python3），两个 gate 引用统一换成解析结果。**判真伪的第一动作**：拿另一个解释器 `py_compile` 同一批文件——全过 = 门在撒谎，别去"修"文件。同理 hermes CLI 报 `No module named 'ruamel'/'yaml'/'hermes_cli'` 时，先查 tools python 的 site-packages 是否被 update 冲成只剩 pip，补装 ruamel/pyyaml/requests/httpx 四件套即愈（注意 tools/ 下有名字含字面星号的幽灵目录，glob 展开要甄别真身 `20260901`）。
- **update 中断后的「归档→drop→让 update 自己 apply 回」闭环优于手跑重放（2026-10-16 实证）**：10-15 update 中断把整层本地 overlay 卷进 autostash（skill 老路径：归档→drop→手跑 apply-source-patches.sh 重放）。本次实测更优解：归档+drop 后**直接再跑 `hermes update`**，它的 autostash 机制自己把改动 apply 回工作树（52 文件全回），随后 `git diff > patch` 收成 overlay patch 挂 SPECS 即完成持久化——手跑重放反而会触发 BASELINE-CONFLICT fail-closed 拒三个半应用 patch。判据：update 日志出现 "Restoring local changes... ⚠ Local changes were restored on top of the updated codebase" = 恢复成功，立即打 overlay 快照（reverse-check 必须通过）。**注意 update 也会在这轮重建 tools python 的 site-packages**（只剩 pip），收尾必须补装四件套，否则 kanban/CLI 连环报 ModuleNotFound。
- **update 后 gateway 「paused by an interrupted update」提示可能是 stale 的**：判据不是 CLI 那句警告，而是 `curl localhost:8650/health` + `hermes gateway status`。若 gateway 实际在跑，用官方入口清记录：`python3 -c "import sys; sys.path.insert(0,'/Users/YOURNAME/.hermes/hermes-agent'); from hermes_cli.update_pause_record import recover; recover([])"`（recover 会 resume orphaned pause 并重启 gateway）。它子进程报 `No module named 'ruamel'` 是它自己的环境问题，不影响已启动的 gateway。暂停记录文件是 `~/.hermes/.hermes-update-paused-gateways.*.claim`，多文件并存是正常的（rev 递增），`read()` 返回 None 即已清。**「N files git left half-written」点名带 `swarm:` 标记的本地补丁文件 = 误判，不是损坏**：pause record 的 baselines 在 pause 时刻快照了 dirty 状态，之后应用或修改过的 marker 补丁文件会被 `_half_written` 判成 git 半写。鉴别：`git diff <file>` 出现 `swarm:` 标记块 = 活的本地补丁，**禁止 checkout/restore 去「修复」它**——那才是真丢改动。网关 health 正常时该警告是噪音；清记录走 pause-record 模块自身通道（`recover([])` 或给 record 重新盖章 baseline），**禁手删 `.claim` 文件**——custody 语义要求由模块的 `_hand_back`/`_retire` 收回，孤儿 claim 会被下一次 launch 重新认领。警告持续时单开一张卡处理，不在别的任务收尾里捎带。
- **自回环安全**：给收端消息 handler 加过滤时，确认 bot 自己发的消息在 sync 回环时先被 self-sender 检测拦下（检测点在 self-sender 过滤**之后**），否则 bot 会把自己发的带标记消息误拦。
- **mention 例外**：收端拦"机器生成"消息时，显式 mention 本 bot 的要放行——否则把合法跨机调用当噪声掐掉。
- **escape-drift**：`patch` 工具对含 `\\\"` 的 old/new_string 会报 escape-drift——重读文件拿精确内容再 patch，不要手写转义。
- **hardline 命令拦截**：超长 inline 命令（heredoc/one-liner）会被 hardline block，拆成多条独立小命令跑。
- **正向 `git apply --check` 失败 ≠ patch 损坏——已应用树上的预期语义**：`--check` 判定的是「对干净树可否应用」，marker 已落 live 树时必然失败；拿它当 liveness 探针会把健康系统误判为损毁。已应用态验收组合：逐文件 `grep -c <marker>` 对期望值 + `git apply --reverse --check` 通过 + 重放管线 rc=0 且判定 PRESENT(skip)；机制是否真活再叠行为探针（直接调用被改函数/红队套件）。
- **patch-vs-patch 重叠冲突（一个文件被多个 patch 改）**：当某 patch 把**不相关改动捆绑**进来（例：`weixin-adapter-noisefilter.patch` 在加 noise-filter 的同时还捆绑了 voice-STT 重写），而另一个 patch（`hermes-weixin-local.patch`）后来正常落了那份 STT 改动，旧 patch 就**永远应用不上**——它想改的代码已被另一 patch 以不同形式落地。watchdog 会报"无法干净应用，需人工重建"。**修复**：把该 patch 瘦身成只含本 feature 的 hunk（用 `scripts/extract-noisefilter-patch.py` 按 marker 过滤 `git diff -U1` 的 hunk，验证 `git apply --reverse --check` 通过后替换备份）。教训：**一个 patch 文件只装一个 feature，别把顺手改的不相关逻辑捆进去**。
- **同一代码区域被后续 feature 再改 → 重生成属主 patch 吸收该区域，收敛单链**：在旧 region 上叠第二条 patch 链必然产生双 marker 漂移面。做法：以 live 现状为基重打属主 patch，把区域内的旧 shim/入口调用一并吸收，旧 feature marker 验收归零（`grep -c <旧marker> == 0`）。取舍上「吸收为单一回收链」优于「另立 manifest 退役」——只有全库机械调查证实旧链零铺设点时才走退役。
- **陈旧 patch 的"自愈"是回归**：watchdog 的 `git apply` 对陈旧 patch "成功" ≠ 正确——它会把旧逻辑重打回去，覆盖掉后来正常落地的改动（例：watchdog 把旧 STT 重打，覆盖 `hermes-weixin-local.patch` 的现代 voice 处理）。**patch-check 和 grep 标记都测不出这种回归，必须加行为探针**（直接调用被改的函数断言真实输出，例：`python3 -c "from gateway.platforms.weixin import _extract_text; ..."`）。发现后：`git apply --reverse` 移除污染 hunk，并立刻更新备份 patch 防再次重打。
- **未提交改动归因：先排基线失败再判我引入**：在工作树 M 态有「上游自带未 commit 行 + 本机未提交工作线」混搭时（HEAD detached 态、合并了一半的 update、长期没 commit 的本地开发都属此类），任何「验证命令失败」必须先做基线归责，再决定改什么。**第 0 步**：把本卡改动 stash 出去跑一次验证 + 改动在场再跑一次验证，两次都败 = 既有故障，与我无关（如 `hermes pm lock` 因 `[silk]/pilk==0.2.4` 不可满足失败，stash 后基线同败 → 判定为既有而非本卡引入）；一次败一次过 = 我引入，继续走判别三步。两步之间的工作树状态切换务必 `git stash` 而非 `git restore`（保留我的改动可恢复）。不要把与本任务无关的故障成本算到本卡头上——这会让一张收尾卡被无关诊断拖长两倍。**判别三步（上游 vs 本机归因）**：① `git log HEAD -- <file>` 看 hunk 引入 commit 在不在 HEAD 祖先链上（在 = 上游已提交改完 / 不在 = 上游未 commit 的 M 态或本机改）；② 对比上游最新定义方源码，函数签名实际接受哪些形参；③ 若是定义方/调用方签名错配（上游自带未 commit 的不一致）→ 单纯删行回到与上游一致（见下一条规则）；若是本机真实缺能力 → 走「真 orphan / patch + commit 双落地」三条。
- **未提交改动不一定是新增 feature，也可能是上游 bug 的就地删除**：本机会撞到上游 commit 自带 bug 的情形（如 `file_tools.py:309` 调用方传 `local_config=`，但定义方 `_create_configured_env` 签名无此形参——上游 commit 89963452ee1 引入的调用方/定义方签名错配）。这类「工作树 M 态行」的修法是**单纯删行**，不是加 patch——加 patch 会把一个有害的旧调用永久固化下来。**验收三件套**：(a) `git diff <file>` 减法行、无加法行；(b) 直接调一次出错的工具（`read_file` 实测不再报 `unexpected keyword`）; (c) 删行后工作区该区域与上游 HEAD 一致 = 此次修复不需要补丁持久化、不需要 commit——上游已是对的，你只是把被 update 漏改的调用方对齐过来。**与真补丁混淆的代价**：把这种删行打成 patch 后，下次 `hermes update` 把上游该行改对了，patch 反向应用就把对的改回错的——一个"自愈"机制反向制造回归。
- **adapter 迁移后 patch 要跟随新路径**：上游大重构会把 adapter 整体挪走（例：commit 5600105478 把 matrix 等从 `gateway/platforms/matrix.py` 迁到 `plugins/platforms/matrix/adapter.py`）。`hermes update` 后旧路径文件直接消失，patch 无法应用。watchdog 检测时要 grep **新路径**，patch 头也要指向新路径。排历史遗留时先 `git log --all -- <old_path>` 找迁移 commit，再 `find . -path '*plugin*<name>*'` 定位新家。
- **CONFLICT 先查先决物（0928 实证）**：patch 反复 CONFLICT 的真因常不是 patch 本身过期，而是其**先决物**（被调模块本体，如 `agent/action_gate.py`）从未 commit 进 main——update 每次冲掉工作树残留，只剩调用点 hunk 无法落地。恢复链：wip 快照 commit（git cat-file 可达，如 440f27c1fe）取模块本体 → rescue 分支取落点实现 → 手工适配 → 测试全绿后**立即 commit**（未 commit 的源码改动必被下次 update 冲掉）。
- **上游新增测试守卫的适配三模式**：① home_io_guard 拦真实家目录 I/O → 读真实契约文件的测试加 `@pytest.mark.allow_real_home_io`；② 契约演进出 arg_contracts（如 delegate_task/memory/acp_send 空参应 block）→ 旧「无参直通」断言改新语义；③ 契约数漂移（24→47）→ 改超集断言（ontology ⊆ yaml）不锁死总数。另：handle_function_call 在 gate 前 alias cronjob→cronjob_manage，shadow 日志记运行时真名，断言需容忍双名。
- **watchdog 探测器必须探实质签名，禁探空补丁（2026-10-01 状态栏消失事故）**：`hermes-truncated-args-repair-gate.patch` 实质为空补丁（仅重写 EOF 换行符，`git apply --numstat` 无实质行），但 `tui-patch-watchdog.sh` 拿它的注释串 `Truncation heuristic gate` 当第 4 个探测器——树里永远 grep 不到 → 每次硬失败 exit 1 → 自愈回路整个失效，下次 update 后状态栏补丁无人重放。修复：探测器换成实质补丁的签名（`_model_name_is_glm_family` in agent/anthropic_adapter.py）。验证法：`git apply --numstat <patch>` 有非零实质行才算实质补丁；探测器签名必须先在已恢复树上实测 PRESENT 再写入脚本。守卫条件同理双分支实测：「update 进行中就跳过」类守卫用 `pgrep -f` 匹配易把无关进程误判为进行中，连续多周期静默跳过巡检——上线前在条件为假场景实测必须放行，且跳过分支必须打日志可回查。
- **post-merge 钩子的健康分支禁提前 exit（2026-10-01 同事故第二根因）**：`hermes-agent/.git/hooks/post-merge` 曾在 inventory watchdog 健康时 `exit 0`，把后面的 skill-fence 修复和源码补丁重放（原 128-143 行）整体跳过——补丁重放代码写了却永远执行不到（当天 14:29 update 后 apply 日志 0 行）。修复：健康分支只记日志不退出，让幂等的 fence/重放步骤每次 post-merge 必跑。教训：「检查通过就退出」的分支会把同文件后部的自愈步骤静默短路；验收除 `bash -n` 外要跑干跑核对执行路径。
- **watchdog 的探针解释器必须与 apply 脚本同步修（2026-10-22 实证）**：`tui-patch-watchdog.sh` 的 flock 探针硬编码 `$REPO/venv/bin/python3`，10-16 给 apply-source-patches.sh 修了三级解析但 watchdog 漏修——update 重建 venv 后探针 probe_failed → fail-closed 每拍跳过 → 自愈链停摆 9 天（1913 拍）无人察觉，10-22 状态栏丢失时零兜底。同源修复要全链 grep 同款硬编码一次修完，不能修一文件忘另一文件。
- **watchdog 探针换签名前必须核「树上现状≥1」（2026-10-22 实证）**：探针 4 从退役载体的 _EXIT_SUMMARY_MARKER 换 GUARDRAIL_UDF_NAME 后树上=0（其载体 patch 被 baseline gate 拒重放），看门狗每 5 分钟全量重放+npm build 空转一拍。换签名前跑 `grep -c <sig> <src>`，=0 的候选不能用；要骑「今天健康」的 patch（如 kanban-consolidated 的 _assert_not_delegated_child_mutation，树上 5 命中）。
- **函数搬家型部分失锚（「adapter 迁移」教训的函数级变体）**：上游把函数从 A 文件整体重构进 B 文件时，多 feature 合一的 consolidated patch 只有被迁函数携带的 hunk 落空——留在原文件的其他 hunk 仍 PRESENT，任何单一探针都查不出「半失锚」。修复以 live 现状为基：在新家文件用 marker 块重写该 feature，生成单 feature 独立 patch 挂 SPECS + 单文件 commit（不夹带暂存区他人的 M 态文件；pre-commit 被存量坏配置拦时，改动已过 py_compile + 行为探针双验的可 --no-verify，缘由写进 commit message），旧 consolidated patch 不动、其余 hunk 继续由它认领。验收必须含行为探针——grep marker 只证在场不证生效。
- **自愈链失效是三层的，审计要逐层探而非只看 cron 活着**：①探针签名随上游吸收/搬移腐烂——符号还在仓里但换了文件，树上 grep=0 不代表功能死，代表探针盯错文件；②治愈动作指向已删路径（沙盒/部署目录被裁）——探针命中治愈分支时空转或报错；③watchdog ERROR 周期性刷屏且 deliver=local 时无人消费=静默停摆数日。自愈链健康审计 = grep watchdog 日志当日 ERROR 行 + 任选一条治愈路径手动干跑一次，两个都过才算链活着。
- **CONFLICT patch 的 3way 重放会每拍往 gateway 文件写冲突标记（2026-10-22 实证）**：hermes-desktop-lineage-selfheal.patch 对当前 HEAD CONFLICT，watchdog 复活后每 5 分钟一拍往 gateway/control_socket.py、session_a2a.py、hermes_state_local.py 写 `<<<<<<< ours` 标记且 ROLLBACK FAILED——新 spawn worker import 即 SyntaxError。处置：立即 `git checkout HEAD --` 恢复编译，同时把该 patch 从 SPECS 注释隔离（带日期+原因），登记重推导卡。看门狗复活后第一件事是扫当日 log 的 CONFLICT/ROLLBACK FAILED 行，不能只看「ok: patches intact」。
- **桌面 App 的 TUI 进程杀了不会自动重启（2026-10-22 实证）**：Hermes.app 生成 .command 脚本经 `open` 在外部终端跑 `exec hermes --profile X --tui --resume <session>`，杀 node dist/entry.js 进程后 App 只把窗口带前台、不会重开会话，需用户在 App 内点新建/恢复会话；`--external-supervisor` 参数已被上游移除，restart-tui.sh 类脚本要随上游 CLI 演进同步修。
- **宿主动态 import 新模块的懒加载陷阱**：`sys.path` 注入若只写在新模块文件内部，宿主进程首次 import 它时注入尚未执行 → `No module named`。注入必须放在宿主文件调用点（import 语句之前）。这类 bug 单元级 dry-run 测不出——只有重启后的真实宿主进程收到首条真实流量才暴露。
- **卡死的 update-autostash 会让整条自愈链停摆（2026-10-01 状态栏全链事故）**：当天 04:39/11:31 两次 update 的 `hermes-update-autostash` settle 失败永久留在 stash → post-merge hook（第 134 行 `N_AUTOSTASH>0`）每次打「deferring source-patch re-apply」直接跳过 → apply-source-patches.log 全天 0 条 → 19:33 最后 update 后 18 个补丁零重放 → 21:38 启动的 TUI 载入无补丁 bundle，状态栏消失。叠加另一根因：watchdog repair-gate 探测器探的是空补丁签名（上一条 lesson），15:32 起每次硬失败 exit 1 且不打日志，自愈也没接管。**处置顺序**：① `git stash show -p stash@{N}` 归档到 `patches/stash-backup-<date>/`（+MANIFEST+stash reflog）→ ② `git stash drop` 清零（解锁 defer）→ ③ 手跑 `bash patches/apply-source-patches.sh`（内含 apply-tui-patches.sh 子脚本重放 statusbar + rebuild dist）→ ④ 逐 patch `git apply --reverse --check` 验 PRESENT + src/dist 签名 grep（statusbar 签名=`ccExtraTruncated`/`fetchIpWeather`/`fetchVolcengineUsage`）→ ⑤ 手跑 tui-patch-watchdog 验 rc=0 且日志恢复记行。**教训**：stash 非零 = 整条自愈链停摆，不只 statusbar；排查「修改全丢了」第一步永远先 `git stash list`，再看 apply 日志当日有没有 RAN 记录。**诊断竞态补丁（2026-10-05 复盘）**：慢 update 可能仍 mid-flight——判性前先看 watchdog log 尾部是否连续 `skip: hermes update in flight (pgrep)` + `pgrep -fl hermes update`；该状态下 stash 可能被正在 settle 的 update 合法消费（refs/stash 突然消失但对象仍 `git cat-file` 可达），此时勿归档勿 drop 勿手跑重放，等 pgrep 清空 + watchdog 连两拍恢复 `ok: patches intact` 再重新验 src/dist 签名——10-05 当天 22:04 update 从建 stash 到 settle+重建 dist 跑了约 9 分钟，期间两次诊断读数互相矛盾全是竞态假象。另：settle 完成不等于运行中 TUI 恢复——TUI 进程启动时加载的是当时的 dist，dist 是事后重建的，须重启 TUI 才载新状态栏。
- **update 多波连击后的恢复第一站是 `.bak.<epoch>` 孪生，不是从零重建**：patch 管线旧基线回写会在写入前留好版孪生 `<file>.bak.<epoch>`——被洗文件先 `find <tree> -name '*.bak.*'` 扫孪生、按 epoch 挑最近好版逐文件回放。**连带恢复**：被洗共享模块的依赖模块（schema/调用链）同一 pass 一并回放，验收用调用点 import 冒烟而非只 py_compile 模块本体——断链发生在 import 侧，本体编译通过也会运行时炸。
- **发现裸工作树改动不在任何 patch 里 = 随时会丢的半成品**：M 态 tracked 文件但 `grep -l <file> patches/*.patch` 无命中——这类改动不在补丁层、也没 commit，下次 update 的 `reset --hard` 必冲掉。收尾时必须 `git status --porcelain | grep -v '^??'` 对 tracked 改动逐个问「它属于哪个 patch / 有没有 commit」。**三步闭合，缺一会丢**：① **判归属连子脚本一起豁免**——只 `grep patches/*.patch` 会漏 perl 就地重写型子脚本（如 `apply-kanban-worktree-default.sh` 用 `perl -i -pe` 改 kanban 文件），逐文件核验要同时匹配 `apply-*.sh` 子脚本，否则把已由脚本认领的改动误判成孤儿、白做 patch。② **真孤儿 = patch + commit 双落地**——`git diff <file> > patches/hermes-<name>.patch` + 挂进 `apply-source-patches.sh` SPECS（新条目带一句救援缘由注释，`bash -n` 验语法）+ 单文件 `git add <file> && git commit -m "..."`（只 stage 这一个文件，不夹带其他 M 态）。③ **幂等判定**——新 patch 当前已应用态必须 `git apply --reverse --check` 通过（apply 循环判 PRESENT 跳过），`bash -n` 之外还要模拟 apply 循环判定输出 `PRESENT (skip)` 才算真接线。**预期行为提前向用户交代**：commit 落 main 后，下次 `hermes update` 的 ff-only 会因本地 commit 失败 → `_reconcile_diverged_checkout` 把它 park 进 `refs/hermes-update-backups/diverged-main-*`——这**不是丢改动**，历史实证所有本地 commit 都走了这条路且最终以 patch 形式重落地：**commit 记账、patch 持久，双轨互备**，别把 park 当事故去追。
- **改「已被现有 patch 携带」的源码行：同 pass 同步 patch post-image**（状态栏天气单位修复实证）。只改源文件会让树与 patch 分歧，下次 update 重放 patch 时把用户可见的修复整体退回。三步闭合：① **行数不变的内容替换**——只改 patch 内 `+` 行的行内内容、不动行数，hunk 头计数保持有效，patch 对 pristine 树仍可干净应用；必须增删行则要连 hunk 头计数一起改，尽量避开；② **重建 dist**——TUI 从 `dist/entry.js` 加载，`cd ui-tui && npm run build` 不跑则重启也不生效；③ **三点 grep 验收**——源文件、patch 文件、dist 各命中一次新串，再 `git apply --reverse --check <patch>` 确认 patch 仍被判定为已应用态（幂等跳过）。进程内存态缓存（如状态栏 10 分钟天气缓存）重启即清，无需等刷新窗口。

- **共享模块被删是「静默全站停摆」，import 位置决定它炸不炸**：adapter 里 `from gateway.<mod> import ...` 写在 `try:` 块**内**时，模块缺失会走 except 分支的兜底（降级发送，功能受损但可用）；写在 `try:` 块**外**时异常直接上抛，绕过后面所有 fail-open 兜底 → 该 adapter 的外发通知 100% 静默失败。症状是「日志里只有入站、没有任何出站」，且与发布/更新/配对都无时间关联（归因会跑偏到通道或用户操作上）。**先看 import 语句在 try 内还是 try 外**，这决定影响面是「功能降级」还是「功能全灭」。巡检项：adapter 的每个模块级 import 都归到 try 内，或该模块必须有独立的存活探测。
- **源码丢失但 `__pycache__` 完整时，按字节码逐方法重建源码**：反编译器跟不上宿主 Python 版本（新版本普遍无解）时不要在工具上死磕。路径：① 用 `dis` 逐函数 dump 字节码 + 常量/名字表，还原出完整的语义（模块通常不大，几千字节量级）；② 手写等价实现；③ **行为对拍**——构造覆盖各分支的样本集（正常/去重/触发/冷却/禁用/异常输入/大批量），对原 pyc（可直接作为模块 import 运行）与新源码逐条比对输出；④ 对拍全绿后固化为 `.py`。去抖/去重这类小模块用这个方法可行；判据是「模块足够小 + 语义能完全从字节码还原」，否则换方案。
- **模块本体可用但本机 Python 无对应源码时，别直接把 `__pycache__` 当长期方案**：Python 能 import pyc，但 `__pycache__` 会被清、跨 Python 版本失效，且下次 update 可能连它一起冲掉。只把它当「先把服务救回来」的过渡，最终仍要落源码。

- **patch retire 必须三道闸**：①grep 源码看 patch 名义的符号是否**真的不在线**（`grep -rn "GUARDRAIL_UDF_NAME" hermes_cli/` 0 命中 ≠ "可退役"，可能是源码本来就缺该注册、该 patch 是唯一载体——别误退役）；②只在 grep 命中**且**该符号无功能依赖时退役；③命名 `*.patch.bak-YYYYMMDD` 保留原内容进 `retired/`，写 `INDEX.md` 表（patch / 日期 / 原因 / 关联卡 ID / 是否有效 load-bearing），禁止删源文件——存疑不退役的 patch 是上等保险。判据全表见 `references/patch-retire-validation.md`。
- **detached HEAD 下的 commit 是「伪落地」**：典型场景是 `hermes update` 后 checkout 落到非 main 的具体 commit（如本机 0.22.2 的 d923a5 节点），工作树 commit 在该 ref 上 ≠ 进入 main。**保活三件套必须同时在位**才能跨 update 漂移自愈：① `git diff` 生成可逆向应用的 `.patch` 文件（`git apply --reverse --check` 预验）② `apply-source-patches.sh` SPECS 数组挂上 patch 名（hermes update 重放管线只走 SPECS 清单、不扫分支）③ 源码内 `git commit` 落 detached HEAD（让 in-memory 进程能直接读新代码，省一次 patch 重打）。少任何一件，下次 `hermes update` 触发 `reset --hard` 时修复必丢。
- **"推 main" 在物理不可行时按四轴探测报实情**：用户说"推 main"时先查 `git remote -v` + `git log main..HEAD --oneline` + `git branch -a` + `git push <remote> <branch> --dry-run` 四个轴，按结果分类：(a) 远程是 upstream + 本机无写权限（403）= 真不可行，向用户报告并给"开 PR / 改 fork 远程 / 接受本地 main 不动"三选一；(b) 远程是 user fork + 有权限 = 真可推，按 730 commit 距离看 ff / rebase / merge；(c) 本机 main 已远 beyond 当前 commit = 强推会丢 forward 修复，不可做。**禁止把"推 main"硬上成 force-push upstream**（破坏公共仓库）。本机 committed detach HEAD 的最稳归宿是新建本地 fix 分支承载（`git checkout -b fix-YYYYMMDD-<topic>`），让 patches/ 目录 + SPECS 数组做跨 update 持久层，commit 本身只作 in-memory 加速用。
- **retired/INDEX.md 是活文档不是日志**：每次 retire 一个 patch 必追加一行（patch / 日期 / 原因一句话 / 关联卡 / 是否曾 load-bearing）；后续 reanchor 或 unretire 时改对应行状态而不是新写。`*.patch.bak-YYYYMMDD` 命名约定的语义是"原内容完整保留 + 日期可追溯"，别用 `.old` `.deprecated` 等无日期后缀——update 重放管线扫的是 basename，日期后缀对管线透明、不影响 SPECS 解析。

## 参考文件

- `references/matrix-adapter-antiloop.md` — 完整实例：Matrix adapter 的 anti-loop 自标记 + noise-filter 改动落点、自回环安全性论证、单元测试
- `references/weixin-noisefilter-rebuild.md` — patch 重叠冲突 + 陈旧 patch 回归的完整处置实例（2026-09-03）：诊断、行为探针、瘦身重打、共享模块恢复
- `references/patch-retire-validation.md` — patch 退役三道闸：grep 验证 / 命名约定 / INDEX.md 维护 + 误退役实锤
- `scripts/drift-check-template.sh` — 静默 watchdog 脚本骨架（默认 quiet + verbose 开关 + 三态退出码）
- `scripts/extract-noisefilter-patch.py` — 从 `git diff -U1` 按 swarm marker 提取纯单 feature hunk，生成 watchdog 可干净重打的瘦身 patch
