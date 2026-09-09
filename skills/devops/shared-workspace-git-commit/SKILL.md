---
name: shared-workspace-git-commit
description: Use when committing deliverables to the shared git repo.
version: 1.0.0
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

## 工作流（六步）

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

### ③ 陈旧 index.lock 恢复

```bash
ls -la .git/index.lock 2>/dev/null        # 看时间戳
ps aux | grep "[g]it " | head -3           # 确认无活跃 git 进程
date                                        # 与锁时间对比
```

锁存在 + 时间差大（实测 2 小时，并行会话崩溃遗留）+ 无活跃 git 进程 → `rm .git/index.lock` 后重试 add。三者缺一不删，先排查。

### ④ commit（多行 message 用 `git commit -m "<多行字符串>"`）

### ⑤ commit 后复查（必做，非可选）

```bash
git status --short && git log --oneline -3
```

并行 worker 常在主 commit 前后又写文件（实测 data-governance.md 主 commit 后又出现 +111 行修改）→ 补一个「收尾」commit，不要反复 chase。终态允许已知工具状态目录保持 `??` 未跟踪。

### ⑥ push 政策

push 属不可逆外发动作，**永不自动执行**；报告领先/落后计数，用户明示才推。

## Pitfalls

1. **exit 128 ≠ add 语法错**：共享仓库里第一反应查 index.lock，不是查路径拼写。
2. **一次侦察不等于永远干净**：侦察→预览→批准→commit 之间隔了用户往返，并行 worker 可能已写入新文件；commit 后复查（⑤）才是最终事实。
3. **`.git/index.lock` 是正常文件不是 bug**：删除前必须验证「无活跃进程 + 时间差大」，活跃会话的锁删了会损坏 index。
4. **skill_manage 从 orchestrator 拒写 default 共享板 skill**：devops/ 下技能（如 open-source-skill-fusion-v2、design-doc-sync-audit）属 default profile，本 skill 故落 orchestrator 自有目录；共享板 skill 更新须前台会话直接改文件。
