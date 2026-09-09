---
name: kanban-workspace-durability
description: Use when picking kanban workspace_path. Ban /tmp outputs.
version: 1.0.0
platforms: [macos, linux]
environments: [kanban]
metadata:
  hermes:
    tags: [kanban, workspace, durability, orchestration]
    related_skills: [orchestrator-kanban-tracing, delegation-brief-format, rd-process-export]
---

# Kanban Workspace Durability（产物持久性纪律）

> 血泪教训（2026-08-25）：527 页全书 OCR + 4 篇精读笔记放 `/tmp/soc_ocr`，被 macOS 定期清理 /tmp **静默全删**。
> 中间产物全灭；仅最终交付物（恰好写了 default_workdir）幸存。原证丢失导致蓝军 WARNING 无法回查原文。

## 核心规则（一句话）

**kanban 任务的 workspace_path 及一切需要跨任务/跨会话存活的产物，绝不放 `/tmp`、`$TMPDIR`、`/var/folders` 等易失路径——一律落 default_workdir 或专用持久目录。**

## 为什么

- macOS 会**无警告**清理 `/tmp`（默认 ~3 天未访问即删，重启也清）；Linux tmpwatch/systemd-tmpfiles 同理。
- kanban 流水线是**多 worker、跨小时/天**的：上游产物是下游 worker 的"必读 context"，放易失路径 = 依赖断裂。
- 原证（中间笔记/语料）是**审查回查 + 抗辩蓝军 WARNING** 的依据——丢了就只能保守估算，无法精确复核。

## 选址决策

| 产物类型 | 落点 |
|---|---|
| 跨任务依赖的中间产物（笔记/语料/导出） | `default_workdir/<project>/` 或 `~/.hermes/data/`（持久） |
| 最终交付物 | `kanban_complete(artifacts=[...])`（kernel 存为附件） |
| 纯一次性 scratch（确认用完即弃） | `workspace_kind="dir"` 持久目录，**仍避开 /tmp** |

## 与既有纪律的关系（不重复定义，只加指针）

- `workspace_kind="scratch"` **本就禁用**（`output-contract.md` 红线：完成即删）。本 skill 补的是另一面：**`dir`/`worktree` 也可能指向易失路径**（如 `dir @ /tmp`）——`dir` 不等于持久，路径必须另行判断。
- 默认 `workspace_kind="worktree"`（git 仓库时）天然持久，优先用。

## 操作

```bash
# default_workdir（持久，推荐作为产物根）
echo $HOME/hermes-docker-sandbox/workspace   # 或读 config.yaml default_workdir

# kanban_create 选 dir 时：指向 default_workdir 下的持久子目录，不是 /tmp
#  ✅ workspace_path="$HOME/hermes-docker-sandbox/workspace/research/ocr-<topic>"
#  ❌ workspace_path="/tmp/<anything>"
```

## Pitfalls

1. **`dir` ≠ 持久**：`workspace_kind="dir"` 只是"共享目录模式"，路径仍由你指定——指向 `/tmp` 一样会丢。
2. **PDF/大语料重跑成本高**：OCR 全书 ~10 min、爬取数小时——重跑代价越大，越要落持久路径并纳入 `artifacts`。
3. **事后补救**：发现产物在易失路径，立即 `cp -r` 到 default_workdir 并在 kanban_comment 记录新路径，别等系统清理。
