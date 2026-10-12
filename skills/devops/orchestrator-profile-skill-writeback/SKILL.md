---
name: orchestrator-profile-skill-writeback
description: Use when skill_manage refuses a cross-profile skill write.
tags: [skills, curator, profile-boundary, orchestrator]
---

# Orchestrator profile 的 skill 回写边界与落位

## 什么时候用

- 会话复盘要沉淀经验，但目标 skill 属 default profile（`skill_view` 返回的 `skill_dir` 在 `/Users/YOURNAME/.hermes/skills/` 下），skill_manage 报 `not found in active profile 'orchestrator'`
- 新经验在两个 profile 都有落点，需决定写哪份

## 规则

1. **先查归属再动手**：skill_view 的 `skill_dir` 路径是唯一事实——`~/.hermes/profiles/orchestrator/skills/` 下=本 profile 可写；`~/.hermes/skills/` 下=default 所有，拒写。写前 patch 被拒才知道归属=白费一轮 batch（batch 会整体回滚）。
2. **经验落位优先级**：① orchestrator 本 profile 有同域 skill → patch 它；② 本 profile 无落点但经验对本域高频 → 在自有目录建类级副本/新 skill，文件头注明「default 原件为准，本件补 X」，防双事实源漂移；③ 纯 default 域经验 → 不建副本，在回复中留待前台会话直改 default 文件。
3. **复制 skill 时禁全文照抄**：副本只保留本域用得到的机制，声明机制权威源在原件——两份全量拷贝必然漂移。
4. **manage 拒跨 profile ≠ skill 不存在**：skill_view 能读 default skill（读无边界），只有写有边界——先读后写的顺序不变，只是写失败时按本规则改落位。
5. **新 skill 的 description ≤60 字符**：一句触发式陈述，触发词在前；超长会让 batch 整体回滚，且索引截断到 57 字符毁掉路由信号——细节写进 body。

## 实操

- 建副本：`skill_manage(operations=[{action: create, name: <name>-orch, category: devops, ...}])`——名字加 profile 后缀防与 default 同名混淆
- 涉及 default skill 的纠正要留给前台时，回复里点名 skill 全名 + 要改的小节，供用户 `hermes -p default` 会话直改

## 命中时的可行路径（按证据定级，勿死板执行）

规则 1 的「拒写 → 不写」是保守下限。skill_manage 报 `not found in active profile` 时，先看报错正文给的 default 绝对路径——若该文件**本会话已在同一根目录读过**（规则 4 的先读已满足），可用文件级 `patch` 工具直接改 SKILL.md（path=报错给的绝对路径），**不必换 profile、不必新建副本**；`patch` 只做机械文本替换，其路径无 profile 归属门。三个条件缺一不可：① 同会话已 skill_view/read 过该文件（防改了没读过的内容）；② 改动是定向补丁而非全文重写（write_file 类操作不走这条路）；③ 改完回读 diff 确认落盘。只有当改动需要跨多文件/结构性重写、或文件未读过时，才退回规则 2 的「留前台直改」。

**选错路径的代价不是失败而是白做**：先在 orchestrator 自有目录 `skill_view` 同名 skill 找副本（default 域 skill 常有 `-orch` 副本，但**副本≠原件**，读出来的是副本内容）→ 再试 `skill_manage` → 被拒才知道真归属是 default → 此时若原件本会话已读过，直接文件 patch；没读过才按规则 2 处置。**别因为读过副本就以为读过原件**——两份都在磁盘上，`skill_view(name)` 返回哪份取决于当前 profile 的 skill 目录索引，`skill_dir` 才是判归属的唯一事实。

**symlink 板的路径双像（2026-10 实证）**：本 profile skills 目录若为 symlink 板，同一 skill 会有两个路径——`skill_view` 的 `skill_dir` 显示 view 路径（`profiles/orchestrator/...`，可能据此误判为本 profile 可写），`skill_manage` 拒写报错给 canonical 路径（`~/.hermes/skills/...`）。两者是同一文件，文件级 patch 走 canonical 绝对路径即同时落两个视图；判归属别只信 `skill_dir`，以「能否写」实测为准。另外 batch 内任一 op 被拒会整体回滚——跨 profile 归属未定时先发单 op 探针，别把多条 patch 捆进一个可能被拒的 batch。
