---
name: shared-workspace-git-commit
description: Use when committing deliverables to the shared git repo.
version: 1.2.0
metadata:
  hermes:
    tags: [devops, git, workspace, orchestrator]
    related_skills: [design-doc-sync-audit, open-source-skill-fusion-v2]
---

# 共享 Workspace 入库收尾（shared-workspace-git-commit）

> 来源：2026-09-04 commerce-agents 融合收官入库实测。共享 workspace（多 agent 并行 kanban worker 同写一个 git 仓库）的 commit 环节有三类专属坑，与单人仓库的 git 习惯不同。

## When to Use

- 融合/调研/文档任务收官，用户说「入库」「一并入库」「commit 掉」
- 长会话产出多个文件后需要一次性提交
- git add/commit 在共享 workspace 报 exit 128 或 status 意外出现新修改

## 工作流（七步）

### ⓪ 先画版本覆盖地图（用户说 commit 后、动手前，判「commit 掉」落到哪个仓）

交付物 → 仓库映射先于一切 add/commit；不在任何 git 管辖的文件要如实披露并给选项，不静默当作「已提交」。

```bash
# 逐仓核对：交付物落在哪个仓、该仓当前脏不脏
for d in <候选仓库根>; do git -C "$d" status --short | head; done
# profile 资产镜像仓漂移——注意 --diff 比的是镜像 worktree vs HEAD，不先重跑 rsync，
# 源侧已漂移时仍会报「一致」（实测 --diff 报一致 2 分钟后 --sync 卷入 278 文件）。
# 真要预览漂移直接跑 --sync：幂等，无变化时输出 ok: no changes，有变化即自动版本化
python3 ~/.hermes/scripts/soul_git_sync.py --sync
```

覆盖面事实（soul_git_sync 白名单扩改前成立，扩了同步改此处）：
- `profiles/_shared`：自有 git 仓，收治理协议 md
- `~/.hermes/backup/soul-integrity-git`：`soul_git_sync.py --sync` 白名单镜像，收 SOUL.md / rules.md / `profiles/_shared` 的 .md+.yaml / `skills/**.md` / `profiles/*/references/**.md` / `profiles/*/config.yaml` / `shared/research/**.md+**.json` / `shared/capability-graph.yaml`（config.yaml 与 research 为后期扩入：api_key 须为 PROXY_MANAGED/截断显示形态才准入；html/raw 大文件刻意不收防仓膨胀）
- 扩白名单后首批 `--sync` 会一次性卷入存量（数百文件）——属预期首批行为；sync commit 是日期 message，语义锚点靠事后 `git commit --allow-empty` 补，与 sync 提交分离
- 仍不在任何仓：`~/.hermes/scripts|bin|services` 的脚本本体——commit 时如实披露并给选项（扩白名单 or 移入 _shared 仓），禁静默当作已提交
- 镜像仓 `--sync` 是全 fleet `rsync --delete`：一次 commit 卷入全库漂移（数百文件增删）是镜像的正常行为，非事故，不要 panic 回滚

### ① add 前侦察（防巨型文件/敏感内容/工具状态误入）

```bash
cd $workspace && git status --short
# 体积大头排序
du -sh <候选目录> | sort -rh | head -10
find <候选目录> -type f -size +5M | head
# 敏感抽查（空=干净）
grep -rln "api_key\|apikey" <候选目录> | head -3
# .gitignore 红线段核对（有无用户声明的排除清单）
sed -n '1,30p' .gitignore
```

判定规则：
- **本地工具状态目录**（如 `.zcode/`）= 非内容资产 → 不入库，建议用户加进 .gitignore
- **大体积原始抓取产物**（实测 37M）在 size-pack ~100M 的仓库可整体入库，不必逐文件纠结
- 敏感命中 → 单独排除并告知用户

### ② add + 出 message 预览待批

**用户纪律：改/入库后提示 commit + 附 message 预览，不自动 git。** 出一版结构化 commit message（变更清单 + 来源）等用户批准（用户裁决风格=选项编号快速定夺，「一并入库」即批）。

仓内挂着大量非本轮的历史累积改动时，`git add` 只点名本轮文件路径——`add -A`/`add .` 会把并行会话与历史改动一并卷进本次 commit。commit 后 numstat 对账是兜底，点名 add 是第一道门。

### ③ 陈旧 index.lock 恢复

```bash
ls -la .git/index.lock 2>/dev/null        # 看时间戳
ps aux | grep "[g]it " | head -3           # 确认无活跃 git 进程
date                                        # 与锁时间对比
```

锁存在 + 时间差大（实测 2 小时，并行会话崩溃遗留）+ 无活跃 git 进程 → `rm .git/index.lock` 后重试 add。三者缺一不删，先排查。

### ④ commit（多行 message 用 `git commit -m "<多行字符串>"`）

经 execute_code/脚本跑 commit 时用 argv 列表形式：`subprocess.run(["git", "commit", "-m", msg], cwd=repo)`。禁把多行 message 塞进 `bash -c "..."`——引号嵌套直接 `unexpected EOF` 语法炸；message 内容永远不该过 shell 解释层。

### ⑤ commit 后复查（必做，非可选）

```bash
git status --short && git log --oneline -3
```

add/commit 报 `nothing to commit`：先 `git log --oneline -3 -- <文件>` 查是否已被定时 auto-backup 提交收编（见 Pitfall 5），不要判 add 失败盲目重试；status 里 submodule 的 `modified (modified content, untracked content)` 条目是仓库固有噪音，与本轮无关，不动。

并行 worker 常在主 commit 前后又写文件（实测 data-governance.md 主 commit 后又出现 +111 行修改）→ 补一个「收尾」commit，不要反复 chase。终态允许已知工具状态目录保持 `??` 未跟踪。

### ⑥ push 政策

push 属不可逆外发动作，**永不自动执行**；报告领先/落后计数，用户明示才推。

push 目标是**公开仓库**（对外发布资产）时不适用本 skill——扫描面和门禁严格得多，走 `public-repo-release` skill（含 syt_/@im.bot/家庭隐私/嵌套 .git 等扩展扫描模式与 leak 修复流程）。

#### ⑥.1 push 前先看 ahead/behind，分清四种分叉形态

`git status -sb` 的「ahead N」与「behind N」二选一就够 push；**同时存在 `ahead N, behind M`** 才是分叉形态，必须先选整合策略再 push。整合方式按场景：

| 形态 | ahead | behind | 选法 | 禁选 |
|---|---|---|---|---|
| 纯本地领先 | N | 0 | 直接 `git push` 快进 | — |
| 纯远端领先 | 0 | M | `git pull` 后再 push | — |
| 分叉但本地超集 | N | M（远端 M 个内容已含在本地链里） | `git merge origin/<branch>` 取本地解冲突，再 push | `--force` |
| 分叉且体积/形状悬殊 | N | M（远端 M 个 = 大体积 Auto-backup 链，与本地找回链内容重叠但 hash 不同） | 仅推**本轮独有的 commit**（新分支 / cherry-pick）；无法纯 fast-forward 时**报告物理限制**让用户定夺，不要 `--force-with-lease` 推全链 | 大体积 merge 后整链 push（撞 GitHub 隐式 size limit） |

判分叉是否本地超集：本地 HEAD 树 vs 远端 HEAD 树关键文件 `diff -q`，关键文件存在且 diff 零或仅含本轮新增 → 本地超集；否则不能纯 fast-forward。

#### ⑥.2 push 前扫密钥高信号（outgoing diff）

推送前对 `git diff origin/<branch>..HEAD` 跑一次密钥高信号 grep——`AKIA[0-9A-Z]{16}` / `sk-[a-zA-Z0-9]{20}` / `ghp_[a-zA-Z0-9]{36}` / `-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY` / `xoxb-[0-9]` / `api[_-]?key.{0,5}[=:].{0,5}[a-zA-Z0-9]{16}`。命中后**先分类再决定 push**：

- **截断形态**（`sk-xxx...r6Mt`、`sk-f9d...8956`、`sk-6da...6d15`）：用户消息截断显示，非完整 key → 可推
- **示例/fixture 形态**（`ghp_16...abcd`、`AKIAIO...MPLE`、`xoxb-1...cdef`）：扫描器文档示例 → 可推
- **完整真实 key 未轮换**（如 `ark-<uuid>-<suffix>示例形态`）：先查 `git grep -c <key> origin/<branch> -- <file>`——若 origin 已有该 key，**本次 push 不新增暴露**（仅位置移动），但**记录待轮换**到本轮交付的下文，不阻塞 push；若 origin 无，**停 push 走密钥轮换流程**
- **完整真实 key 已轮换**（值为 `__ROTATED-YYYYMMDD__` 占位）：本轮改写干净，可推

#### ⑥.3 push 真实状态验证（杜绝矛盾的「Everything up-to-date」）

push 进程因网络中断/服务端 timeout/进程被杀退出时，git 偶尔会打印矛盾的「Everything up-to-date」。**判 push 真实成败的权威源是远端 ref，不是 git 的 stdout**：

```bash
git ls-remote <remote> <branch>    # 真实远端 HEAD
git rev-parse HEAD                  # 本地 HEAD
```

两者一致 → 推送已成功；本地 ahead 计数 > 0 → 推送失败需重试或换整合方式。**不要仅凭 git 输出文字判成功**。

#### ⑥.4 巨型 push 失败的工程现实

当本地领先链体积撞大（>10MB / 数百 commit）时，git send-pack 可能在网络层卡死 20+ 分钟无日志输出——这不是「还在传输」，是 server-side 处理或 TCP 层丢包。处置三步：

1. 等 5 分钟无变化 → 怀疑卡死
2. 验证进程仍在 + 看 CPU 占用；如 idle/低 CPU → 确认卡死
3. `kill <pid>` 后换方案：选 ⑥.1 表里的「仅推本轮独有 commit」路径（cherry-pick 到远端 / 新建 PR 分支）

**不要**反复重试整链 push，每次失败都要重传整 pack，浪费时间且会继续撞 limit。

## Pitfalls

1. **exit 128 ≠ add 语法错**：共享仓库里第一反应查 index.lock，不是查路径拼写。
2. **一次侦察不等于永远干净**：侦察→预览→批准→commit 之间隔了用户往返，并行 worker 可能已写入新文件；commit 后复查（⑤）才是最终事实。
3. **`.git/index.lock` 是正常文件不是 bug**：删除前必须验证「无活跃进程 + 时间差大」，活跃会话的锁删了会损坏 index。
4. **skill_manage 从 orchestrator 拒写 default 共享板 skill**：devops/ 下技能（如 open-source-skill-fusion-v2、design-doc-sync-audit）属 default profile，本 skill 故落 orchestrator 自有目录；共享板 skill 更新须前台会话直接改文件。
5. **共享仓有定时 auto-backup 提交者，用户批准的 commit 会被抢先收编**：workspace 仓有 Auto-backup cron 定时全量提交（log 中「Auto-backup: <日期>」条目），轮到本 skill 的 commit 时可能已被它先行提交——`nothing to commit` ≠ add 失败。核实：`git log --oneline -3 -- <文件>` 定位收编提交 + `git show <sha> -- <文件>` 核对新增行恰为本轮改动（防顺带夹带无关漂移）。代价：语义 message 丢失（只剩日期），内容 grep 可查、按 message 搜不可查；用户在意语义可检索的历史时补 `git commit --allow-empty` + 语义 message。
