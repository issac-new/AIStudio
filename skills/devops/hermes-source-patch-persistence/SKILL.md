---
name: hermes-source-patch-persistence
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
```

## 常见坑

- **自回环安全**：给收端消息 handler 加过滤时，确认 bot 自己发的消息在 sync 回环时先被 self-sender 检测拦下（检测点在 self-sender 过滤**之后**），否则 bot 会把自己发的带标记消息误拦。
- **mention 例外**：收端拦"机器生成"消息时，显式 mention 本 bot 的要放行——否则把合法跨机调用当噪声掐掉。
- **escape-drift**：`patch` 工具对含 `\\\"` 的 old/new_string 会报 escape-drift——重读文件拿精确内容再 patch，不要手写转义。
- **hardline 命令拦截**：超长 inline 命令（heredoc/one-liner）会被 hardline block，拆成多条独立小命令跑。
- **patch-vs-patch 重叠冲突（一个文件被多个 patch 改）**：当某 patch 把**不相关改动捆绑**进来（例：`weixin-adapter-noisefilter.patch` 在加 noise-filter 的同时还捆绑了 voice-STT 重写），而另一个 patch（`hermes-weixin-local.patch`）后来正常落了那份 STT 改动，旧 patch 就**永远应用不上**——它想改的代码已被另一 patch 以不同形式落地。watchdog 会报"无法干净应用，需人工重建"。**修复**：把该 patch 瘦身成只含本 feature 的 hunk（用 `scripts/extract-noisefilter-patch.py` 按 marker 过滤 `git diff -U1` 的 hunk，验证 `git apply --reverse --check` 通过后替换备份）。教训：**一个 patch 文件只装一个 feature，别把顺手改的不相关逻辑捆进去**。
- **陈旧 patch 的"自愈"是回归**：watchdog 的 `git apply` 对陈旧 patch "成功" ≠ 正确——它会把旧逻辑重打回去，覆盖掉后来正常落地的改动（例：watchdog 把旧 STT 重打，覆盖 `hermes-weixin-local.patch` 的现代 voice 处理）。**patch-check 和 grep 标记都测不出这种回归，必须加行为探针**（直接调用被改的函数断言真实输出，例：`python3 -c "from gateway.platforms.weixin import _extract_text; ..."`）。发现后：`git apply --reverse` 移除污染 hunk，并立刻更新备份 patch 防再次重打。
- **adapter 迁移后 patch 要跟随新路径**：上游大重构会把 adapter 整体挪走（例：commit 5600105478 把 matrix 等从 `gateway/platforms/matrix.py` 迁到 `plugins/platforms/matrix/adapter.py`）。`hermes update` 后旧路径文件直接消失，patch 无法应用。watchdog 检测时要 grep **新路径**，patch 头也要指向新路径。排历史遗留时先 `git log --all -- <old_path>` 找迁移 commit，再 `find . -path '*plugin*<name>*'` 定位新家。

## 参考文件

- `references/matrix-adapter-antiloop.md` — 完整实例：Matrix adapter 的 anti-loop 自标记 + noise-filter 改动落点、自回环安全性论证、单元测试
- `references/weixin-noisefilter-rebuild.md` — patch 重叠冲突 + 陈旧 patch 回归的完整处置实例（2026-09-03）：诊断、行为探针、瘦身重打、共享模块恢复
- `scripts/drift-check-template.sh` — 静默 watchdog 脚本骨架（默认 quiet + verbose 开关 + 三态退出码）
- `scripts/extract-noisefilter-patch.py` — 从 `git diff -U1` 按 swarm marker 提取纯单 feature hunk，生成 watchdog 可干净重打的瘦身 patch
