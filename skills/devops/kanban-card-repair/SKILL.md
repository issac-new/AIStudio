---
name: kanban-card-repair
description: "Use when 修复 crashed/gave_up 的 kanban 卡或修复 hermes 源码运行时故障。"
version: "1.0.0"
metadata:
  hermes:
    tags: [devops, kanban, repair, triage, evidence]
    related_skills: [orchestrator-scheduling-audit, orchestrator-worker-failure-triage, orchestrator-profile-skill-writeback]
---

# Kanban 卡与运行时故障修复（证据优先）

> 适用：worker crashed / gave up / blocked 卡要救、hermes-agent 源码级故障要修。
> 深层分类表在 default profile 的 `orchestrator-worker-failure-triage` 与
> `orchestrator-scheduling-audit`（本 profile 不可写，只引用）；本 skill 承载
> **本域自有的两类修复 + 不可跳过的证据纪律**。

## 铁律：修复结论只能来自修复动作之后的实时读

- 任何「已修复 / 已 unblock / 已恢复」的说法，证据必须是**动作之后**重新读到的行
  （sqlite 行、CLI 输出、退出码），不能是动作本身返回的布尔值。
- 空操作（`rows affected: 0`、返回 `False`、目标已是终态）**不是成功**——意味着
  dispatcher 或他人已先一步动作，你的修复根本没生效。看到 0 行：立即停止后续动作，
  重新读真实状态并改报真实状态。
- 卡已是 `running` 且 `consecutive_failures=0` 时，正确产出是**状态复核结论**，
  不是再跑一遍修复。

## 卡状态手术：读实时行 → 再写

```bash
sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db \
  "SELECT id,status,consecutive_failures,last_failure_error FROM tasks WHERE id='<id>'"
```

1. 先读行再动。dispatcher 每 ~60s 一 tick，你与它存在真竞态。
2. 手工 SQL / 脚本写完立刻回读同一行核对；未核对不汇报。
3. `hermes_cli.kanban_db.unblock_task` 签名只接 `(conn, task_id)` 两个位置参数，
   无 `actor` 关键字，多传即 `TypeError`；调用前 `inspect.signature` 确认。
4. 诊断 SQL 先裸跑一次确认 exit=0（`2>/dev/null` 会吞 schema 错误，造出伪健康）。

## 源码级修复：`cannot import name ... partially-updated install`

指纹：worker last output 是 `ImportError: cannot import name '<fn>' from 'tools.<mod>' ...
This looks like a partially-updated install`，几秒内 crashed → gave up；卡定义、provider、
assignee 全无异常。与 `ModuleNotFoundError: No module named 'hermes_cli'` 相反——包在，
但符号被删。

根因：`hermes update` 中途被打断，源码树出现「调用方已刷新、被调模块未刷新」的版本不一致。
**变体（2026-10-03 实证）**：另一个 agent 会话的 patch 管线用旧基线批量回写主树（同秒 mtime 成批刷 + 留 `<file>.py.bak.<unix_ts>` 快照孪生），制造「函数在 git HEAD、文件里却没有」的坏窗口；worker 在窗口内 spawn 即崩。可用性判定三态：① import 报 ModuleNotFoundError → 模块整个缺；② 报 cannot import name → 先 grep 文件本体：函数在=循环导入半初始化，函数不在=文件被回退（走③）；③ 文件被回退 → 同时间戳 `.bak.<unix_ts>` 孪生是**写入前的好版本**（写入者先快照后覆写），直接 `cp` 恢复，比 git checkout 快且不碰 index.lock。

定序（先验证再动手）：
1. `grep -n 'def <fn>' <install>/tools/<mod>.py` 确认符号是否真缺；到 `git show HEAD~:<path>`
   或 update 前备份比对，「备份有、当前无」= 版本回退而非本地误删。
2. 若当前已存在该函数（update 可能已补齐），先跑 import 冒烟再决定要不要改：
   `cd <install> && venv/bin/python3 -c "from tools.<mod> import <fn>; print('ok')"`
3. 必须本地补时用 patch 改回定义，`py_compile` + import 冒烟双验，
   `git diff --numstat` 确认只动了目标文件。
4. **改源码前先确认 `hermes update` 进程已退出**——update 在跑时 patch 会被回写覆盖，
   这就是「补了又缺」的根因；先查进程再改。
5. **恢复前先查竞争写手**：`grep '<session_id>' <profile>/logs/agent.log` 找活跃 agent
   会话（patch/docsync/复盘管线都可能写主树）；恢复后必须观察**稳定窗**（`find <tree>
   -newermt <恢复时刻>` 持续为空）再解阻卡——否则恢复被竞争写手再次覆盖，解阻卡二次
   回 blocked 白烧派工轮次。git index.lock 反复出现/消失 = 有活跃 git 写手的直接证据。
6. **批量解阻后必须抽样回读拾取态**（90s 后 status→running + 新 pid）：dispatcher
   不自动复活 blocked，解阻≠恢复，拾取才是。跨板解阻用 `hermes kanban --board <slug>
   unblock t_x t_y ...`（CLI 收多 id，一次一板）。
7. **claimer 端口鉴僵尸派工器**：task_runs.metadata 的 claimer（如 `host:2178`）对应
   网关监听端口；崩卡 claimer 端口已无进程持有 = 死网关遗留派工循环的牺牲品，新网关
   不接管旧 claim，需人工解阻。

## 日志报错 ≠ 根因仍在：先辨磁盘与进程内存

- 长驻进程（gateway/dispatcher）日志里重复刷的报错，证据是**进程内存**；grep 源文件测的是
  **磁盘**。修复已落盘而报错仍在刷 = 进程滞后，不是根因未除——先比对 `stat -f '%Sm' <file>`
  与 `ps -p <pid> -o lstart=`（文件 mtime 晚于进程启动 = 修复落在进程起后），再
  `hermes gateway restart` 统一，勿按「根因仍在」把已修好的东西再修一遍。
- 判别顺序：报错的符号/字段在文件里 grep 得到 → 磁盘是好的，走重启；grep 不到 → 真缺，
  走上面的源码级修复流程。
- restart 会先 drain 在途 run（数十秒到分钟级）；重启后等新 tick 出现再回读日志，
  确认无新报错才收口。

## Pitfalls

1. 修完源码只是「下一次 import 不再报错」，worker 仍需 dispatcher 重派才会真跑起来——
   修源码与救卡是两步，汇报时分开陈述，勿合并成一句「已恢复」。
2. update 修复优先于本地 patch：能补齐整棵树的版本漂移就不要手改单文件，否则下次 update
   再次覆盖，本地改动全部白做。
3. 卡库位置判据：`kanban_create(board=X)` 落的卡后续操作必须带同参 `board=X`；
   中央根库卡显式带 board 反而报 unknown id。报 unknown id 先判卡在哪个库，勿改写 id 重试。

## 收尾契约

完成后在卡上留 comment 写清：根因一句话 + 验证证据（命令+退出码或 DB 行）+ 卡当前真实状态。
不写「已修复」而无证据的 comment——下游 worker 会当既成事实继承。
