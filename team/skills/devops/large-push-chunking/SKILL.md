---
name: large-push-chunking
description: "Use when git push 大历史超时(408/hung up)：测真实字节后按拓扑分块推."
tags: [git, push, github, recovery]
---

# 大体积分叉史的远端 push：分块推程序

触发面：push 到 GitHub 报 HTTP 408 / "remote end hung up" / 长时间零进展断线，
且待推历史含大量对象（恢复链、备份仓、迁移合流后的 16M 行级内容）。
归档找回侧的完整链路（回链 merge、冲突决策表）见 default profile 的
archive-migration-commit-recovery；本 skill 只管「推回远端」一段。

## Procedure

### 1. 先测真实净上传量（决定走不走分块）

```bash
printf '%s\n^%s\n' HEAD origin/main | git pack-objects --revs --stdout --thin | wc -c
```

- `--disk-usage` 对 thin 包报 0MB，不可信——必须真打包数字节。
- 净上传 <50MB 直接 push；>100MB 且上行 <1MB/s 时单包必超 GitHub RPC 窗口
  （报 408 / disconnect），调 `http.postBuffer` 无效，直接走分块。
- 通道选择：有 SSH key 优先 SSH（无 RPC 超时窗口），先 `ssh -T git@github.com`
  验通；无 key 留在 HTTP 分块路线，不硬切。

### 2. 按图拓扑分块（不是按 commit 数均分）

- 逐段测增量体积找「胖段」：多数 commit 打包后 0MB，少数批量内容 commit
  独占 100-200MB——胖段单独成段，瘦段可 4-8 个合一段。

```bash
prev=<已推到的 sha>   # 起点取远端分支当前头，逐段前移
for c in <候选段点>; do
  sz=$(printf '%s\n^%s\n' "$c" "$prev" | git pack-objects --revs --stdout --thin | wc -c)
  echo "${c:0:7}: $((sz/1024/1024))MB"; prev=$c
done
```

- 待推历史含 merge commit 时：先把旁支链（merge 的第二父系）分段推到专用
  分支 `"${c}:refs/heads/<restore-branch>"`，旁支对象全部落地后再推含 merge
  的主干——merge 段就只剩轻量对象。
- 主干序必须 `git rev-list --first-parent`；默认拓扑序会把旁支 commit 排进
  主干段，推出 non-fast-forward。
- 每段推前验基准：`git merge-base --is-ancestor <远端分支头> <段点>` 非零即停，
  说明前序段没真正落到远端，继续推必然被拒。

### 3. 后台串行推 + 终推 main

- 后台脚本逐段 fast-forward 推专用分支：每段 3-6 次重试 + 20s 退避；脚本用
  `if git push ...; then` 直判 exit code；完成/卡死通知，不逐分钟轮询烧注意力。
- 全部对象落地后 `git push origin <终sha>:refs/heads/main` 秒级快进收尾。
- **连续 force-push 场景（历史重写后重推）定位用本地游标，不回读远端**：
  逐段 `ls-remote` 读回 staging 位置再定下一段——在 GitHub 多前端节点间 refs
  传播不一致时，读回值会随机滞后几百块，游标被反复拉回、永远追不平
  （日志特征：每块都成功但位置序列锯齿回跳 + 大量 forced update）。
  正确做法：本地计数器从 1 顺次推到 N（`git rev-list --reverse main` 取段点），
  只在终推 main 前做一次远端校验。尾块反复 HTTP 408 时减半块大小手推。
- **循环脚本防双实例**：`mkdir lock; trap rmdir EXIT`（macOS 无 `flock`，
  flock 报 command not found 后脚本静默失效）。两个实例并发对同一 staging
  force-push 会互相覆盖回跳，症状与 refs 滞后同形——先查实例数再怀疑 GitHub。

## Pitfalls

- **zsh 裸 `$c:refs/heads/x` 被 `:r` 修饰词吃掉**：报
  `src refspec <sha>efs/heads/... does not match any`——refspec 一律写
  `"${c}:refs/heads/x"` 括号隔离。
- **push 成败靠 grep 输出推断会反逻辑**：`git push | grep error && retry || ok`
  在 grep 无命中时 rc=1 走「成功」分支，失败被吞；必须 `if git push ...; then`
  直判 exit code。
- **清挂死传输先核 pid 范围**：`pkill -f "git push"` 杀不到 `send-pack`/
  `git-remote-https` 子进程，它们存活继续占连接；`pkill -9 -f send-pack`
  范围过宽又会误杀当前健康传输（重试循环能自愈，但胖段白烧一轮带宽）——
  先 `ps -o pid,etime,time` 找 CPU 近零的挂死进程点名杀。
- **挂死 vs 慢传用 CPU 累计时间区分**：send-pack CPU 近零 = 纯等网络 IO；
  CPU 高 = 本地 packing。零 CPU 且远端 ref 长时间不动 → 换策略，不是继续等。
- **远端真实进度看 `ls-remote` 的 ref 位置**，不信本地跟踪 ref（fetch 失败时它
  停在旧时点），也不信 push 的 stderr（disconnect 后可能误报 up-to-date）。
- **用户问「还要多久」用「剩余字节 ÷ 实测上行速率」回答**：按胖段列耗时并
  声明方差来源（断线重试一轮≈翻倍）；远端 ref 位置是唯一可信完成点。