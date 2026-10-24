---
name: public-repo-release-addendum
description: "暂存件：public-repo-release 同名冲突锁定期间的发布新教训，解锁后折叠回原件并删除本件"
version: 1.0.0
tags: [devops, github, publishing, privacy, staging]
---

# 公开发布增量补丁（暂存件，待折叠）

> **状态**：暂存件。`devops/public-repo-release` 原件因同名副本冲突被 skill 工具双重锁定（view 拒 ambiguous / manage 双拒），本轮新教训暂存于此。冲突解除后按「折叠清单」逐条并入原件对应小节，然后删除本件——长期保留两份=双事实源漂移。

## 折叠清单（逐条 → 原件落点）

1. → 原件「常驻规则 4」末尾：**错误日志截断不是脱敏**——`last_error`/`last_delivery_error` 类字段截到 120 字符仍带 room-id/token 前缀，先把 ID 模式替换成占位符再截断。
2. → 原件「常驻规则」新增一条：**发布仓的脱敏只存在于发布仓，live 源从未脱敏**——全量重同步会把上一版已脱敏文件覆盖回未脱敏版，每次发布（尤其重同步）整套重跑脱敏。拿不准某 ID 既往怎么处理，以已发布 HEAD 为基线：`git show HEAD:<path>` 看上次发布形态（全形 ID→占位符；省略形文档示例可保留）。
3. → 原件「①圈定发布面」：运行态排除清单追加 `matrix_threads.json`（房间线程 ID 清单）、`desktop/`（sessions.json 含真实会话标题历史）。排除 glob 用前缀式 `.bak*`、`*.new`——后缀式 `*.bak` 匹配不到 `.bak-<日期>`、`.md.new` 变体。排除清单修订后 rsync 必须 `--delete` 或清空目标目录重跑——rsync 不删目标端已有多余文件，第一轮带进来的杂质会一直留在工作树。
4. → 原件「②保密扫描」：树大（skills 库上万文件）先 `git add -A` 再扫 git index，比全树 grep 快几个量级；**`--cached` 必须写在 pattern 之前**，写在后面被当 pathspec、静默返回空——空结果被误读成「清洁」。模式清单新增：Matrix 房间 ID `![A-Za-z0-9_-]{16,}:<homeserver>` → `<matrix-room-id>`；事件/会话 ID `\$[A-Za-z0-9_-]{30,}` → `<event-id>`（30+ 位避开 `${VAR}` 占位符）。扫描正则的排除行自身也是命中源（README 脱敏说明行含原词），复核时先排除文档自述行。
5. → 原件「④安装器与文档一致性」：多语言 README（README/README_zh）不保证同代——逐个核对名册口径与版本号，停更旧代的整体重写，别打增量补丁。
6. → 原件 `references/secret-scan-patterns.md`：模式表加房间/事件 ID 两行；杂质 find 加 `matrix_threads.json`、`sessions.json`；jobs.json 节加「保留 job 的错误日志字段先占位符化再截断」。

## 同名冲突解锁步骤（前台会话执行）

- 冲突源：`profiles/orchestrator/skills/public-repo-release/`（根级副本）与 `profiles/orchestrator/skills/devops/public-repo-release/`（categorized 正本）frontmatter 同名。保留 categorized 正本，根级副本改名（目录+frontmatter name 一起改）或归档删除。
- 同样冲突的还有 archify、hermes-source-patch-persistence、kanban-db-guarded-writes 三件，一并处理。
- 解锁验证：`skill_view('public-repo-release')` 不再报 ambiguous → 折叠本件 → 删除本件。

## 检测命令

```bash
grep -rh '^name:' ~/.hermes/profiles/orchestrator/skills/ --include=SKILL.md | sort | uniq -d
```