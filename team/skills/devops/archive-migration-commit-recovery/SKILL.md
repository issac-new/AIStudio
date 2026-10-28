---
name: archive-migration-commit-recovery
description: "Use when 归档迁移后现仓落后/记录值超实际/commit 查无：回链 merge 找回丢失提交。"
tags: [git, recovery, archive, merge, orchestrator]
---

# 归档迁移丢 commit 的回链 merge 找回

> 分工边界：default 侧 `cold-archive-before-delete` 管归档动作本身（SHA256 门/删源纪律），
> `shared-workspace-git-commit` 管常规提交纪律，`design-doc-sync-audit` 管文档同步五件套。
> 本 skill 只管一类事：**迁移/清理后发现现仓丢了尾部 commit，用 git merge 把它们找回**。

## When to Use

- 磁盘清理把工作区冷归档到外置盘后，现仓与归档仓分叉（迁移搬了文件没搬 commit）
- 丢失信号：记忆/台账记录的版本号、行数或 commit sha 超过/查无于现仓实际
- 任何「双仓同源、一侧领先、需要无损合流」的场景

## Procedure

### 1. 锚定丢失面（先证实再动手）

```bash
# 记录值 vs 实际值对照：记录的章节号/行数/版本超现仓实际 = 丢失信号
grep -oE '^### [0-9]+\.[0-9]+' <主文档> | tail        # 实际最大节号
git log --oneline -5 | grep <记录中的 sha> || echo 查无   # 记录 sha 不在现仓
# 归档仓侧领先多少：
git -C <归档区>/<name>/files log --oneline -5
git remote add <label> <归档区>/<name>/files && git fetch <label>
git merge-base main <label>                            # 分叉点
```

### 2. merge 前封存脏工作区

现仓有未提交改动（含 ignored 混合态）时先快照成 commit（`git add -f` 强制封存）——
不封存则未跟踪新文件与冲突区混在一起，解错不可回退。

### 3. merge + 冲突决策表

`git merge --no-commit <label>`，冲突按形态选边：

| 冲突形态 | 决策 |
|---|---|
| 计数/口径数字 | 取 mtime 新的一侧，随即按**当场实测**统一刷新（两侧多半都已过时，别只选边） |
| 章节撞号（两侧各写了同号节） | 找回的旧节保号在前，后写的那节重编号接尾，同步改正文对它的 § 引用 |
| 台账/清单尾部双侧各追加 | 求并集；一侧零独有条目时直接取对侧超集 |
| add/add 同名文件 | 取 mtime 新的一侧 |

多文件多处冲突用 Python 按冲突标记逐块选边（regex 扫 `<<<<<<< HEAD` / `=======` / `>>>>>>> label`），
禁手编——手编必漏块。

### 4. 机械终验

- 全文冲突标记零残留（`grep -cE '^(<<<<<<<|>>>>>>>|=======)$'`）
- 章节号序列逐号递进无重复
- 代码围栏数为偶（mermaid 未破）
- 关键找回物 grep 在位（记录中的章节名/gap id/sha 对应内容）

### 5. 收尾审计卷入面（merge 专属坑）

解 merge 冲突收尾必须 `git add -A`，会卷入同仓的源码快照（tarball 解包/upstream clone/
演示嵌套仓）：
- `adding embedded git repository` 警告对应的 gitlink 160000 条目内容不会真入库
- add 后立即审计目录分布：
  `git show --name-only --format="" HEAD | awk -F/ '{print $1"/"$2}' | sort | uniq -c | sort -rn`
- 发现快照类目录 → `git rm -r --cached <dir>` + `git commit --amend`，
  并在 .gitignore 补排除规则防再犯（磁盘保留快照本体供复验）

### 6. 汇报口径

merge commit 的 `git show --stat` 是**双 parent 合计口径**，不是净增量——据此汇报必虚高。
真实账目用两条定向 diff：`git diff --stat HEAD^1 HEAD`（现仓侧视角）、
`git diff --stat HEAD^2 HEAD`（合入侧视角）。

## Pitfalls

- **新节接号前不与权威记录对账**：给文档写新节前先 `grep -oE '^### N\.[0-9]+' <doc> | tail`
  取实际最大号，与记忆/台账记录值对照——实际值偏小说明尾部 commit 已丢，先走本 skill
  找回再接号；直接接号必与找回的旧节撞号（前置防线远便宜于事后解撞号）。
- **迁移工具只搬文件不搬 .git 尾部 commit**：冷归档/清理迁移后默认怀疑 commit 丢失面，
  别信任「文件都在=无损」——git 历史是独立资产，HEAD 落后才是丢失事实。
- **两侧数字冲突选边后不重测**：选了 mtime 新的一侧就停，会把过时数字当真相定格；
  选边只是解冲突，口径必须再按当场实机值刷新一遍。
- **手编冲突块**：11 处冲突手编必漏；regex 逐块选边 + 终验零残留才是完整闭环。
