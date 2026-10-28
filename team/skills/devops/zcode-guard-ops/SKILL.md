---
name: zcode-guard-ops
description: Use when 调整或排障 zcode 守护脚本阈值与挂起.
---

# zcode 守护脚本运维（model-peak-guard.sh）

单一事实源：`~/.zcode/scripts/model-peak-guard.sh`，一个脚本多子命令（peak/offpeak/check/disk-guard/goal-budget/goal-resume/disk-resume/status）。launchd 入口 `~/Library/LaunchAgents/com.zcode.disk-guard.plist`（StartInterval 300s，调 `disk-guard` 子命令）。参数、子命令、关键路径速查见 `references/model-peak-guard-map.md`（改参后同步更新该表默认值列）。

## 调参流程（改阈值/预算/冷却参数）

1. **消歧定位**：本机有两个名字相近的 launchd 磁盘任务——`com.zcode.disk-guard`（管 zcode 置顶任务挂起）与 `com.cuishi.disk-space-guard`（普通磁盘告警，`~/bin/disk-space-guard.sh`，6h 一次）。改前必须读 plist 的 ProgramArguments 确认脚本与子命令，不要按 label 关键词猜目标。
2. **查覆盖源**：参数均为 `${VAR:-默认值}` 形态。先确认 plist 未用 EnvironmentVariables 覆盖该变量——有覆盖改 plist，没覆盖改脚本默认值。
3. **全源盘点**：`grep -n '<旧值>' ~/.zcode/scripts/model-peak-guard.sh ~/Library/LaunchAgents/com.zcode.disk-guard.plist`。阈值同时出现在赋值行、头部注释、help 文本、plist 注释共 4 处，按值 grep 才能抓全（按变量名 grep 会漏注释）。
4. **备份**：`cp model-peak-guard.sh model-peak-guard.sh.bak-<目的>-<YYYYMMDD>`。
5. **同批改齐**：赋值行 + 全部注释/help/plist 注释一次改完；迟滞量随动（见下方规则）。
6. **静态验证**：`bash -n` 脚本；动过 plist 则 `plutil -lint`。
7. **动态验证**：`DRY_RUN=1 bash ~/.zcode/scripts/model-peak-guard.sh disk-guard`（应 rc=0）；`bash ~/.zcode/scripts/model-peak-guard.sh status` 尾部打印生效阈值与各卷水位，用来确认新值已生效。
8. **旧值清零**：对旧值（数字与 GB 文案两种写法都查）再 grep 一遍，无命中才算收尾。

## 规则

- **迟滞随动**：改 `DISK_WARN_MB` 时 `DISK_RESUME_MB` 保持 = warn + 4096（4GB 防抖），除非用户明说。只改 warn 不改 resume，进程树会在新阈值附近反复挂起/恢复。
- **reload 判定**：launchd 每次触发都重新执行脚本路径，改脚本无需重载；plist 只改注释同样无需重载；改 ProgramArguments/StartInterval 等 key 必须 `launchctl bootout gui/$(id -u) <plist>` 后 `launchctl bootstrap` 重载。
- **排障入口**（置顶任务莫名停摆）：先 `status` 看挂起进程与水位 → 状态文件 `~/.zcode/scripts/.disk-guard-state.json`（paused_pids）→ 手动恢复 `bash ~/.zcode/scripts/model-peak-guard.sh disk-resume`（忽略水位）。日志 `~/Library/Logs/zcode/zcode-disk-guard.log`。
- **调低挂起阈值先报安全余量**：disk-guard 的存在背景是消息风暴曾半小时写掉 13GB 系盘余量；调低阈值等于压缩止血反应窗。改完向用户点一句缓冲变薄的事实，不拦不拖。
