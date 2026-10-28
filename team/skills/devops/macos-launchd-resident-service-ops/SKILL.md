---
name: macos-launchd-resident-service-ops
description: 停用/恢复 launchd 常驻服务：bootout+disable 防自启，enable+bootstrap 恢复。
tags: [launchd, macos, ops, resident-service]
---

# macOS launchd 常驻服务停用与恢复

## 何时用

- 用户要求关停某个常驻后台服务（决策服务/网关/看门狗等本机 LaunchAgent）
- 停用后要防重启/重登录自启复活，或要恢复先前停用的服务

本 skill 管 launchd 层的通用停启程序与验证。具体服务的身份核查/变体运维归
default profile 的领域 skill（如决策服务=`decision-service-ops`，本 profile 只读
可 skill_view）；launchd job 启动报 EX_CONFIG 78 归 `launchd-external-volume-gotchas`。

## 停用程序（停进程 + 防复活，缺一不可）

1. 定位 label 与全部变体：
   `launchctl list | grep -i <词根>` 加 `ls ~/Library/LaunchAgents/ | grep -i <词根>`。
   同一服务常有多个变体 plist（新旧代、不同权重变体）——**对每个 label 都执行停用**；
   只处理当前加载的那个，未加载的 plist 下次登录照样复活。
2. 停进程：`launchctl bootout gui/$(id -u)/<label>`。label 未加载时报错可忽略。
3. 持久禁用：`launchctl disable gui/$(id -u)/<label>`。只 bootout 不 disable，
   重启后 launchd 会按 plist 重新拉起；disable 记在 launchd 数据库里跨重启有效。
4. 复验三件，全部实测，不信任单条命令退出码：
   - `ps aux | grep <真实进程名>` 进程清零
   - `lsof -i :<端口> -sTCP:LISTEN` 端口释放
   - `launchctl print-disabled gui/$(id -u) | grep -i <词根>` disable 生效
   plist 文件保留在 ~/Library/LaunchAgents/ 不删——它就是恢复入口。

## 恢复程序

```bash
launchctl enable gui/$(id -u)/<label> && \
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<label>.plist
```

## 部署/更新常驻 job（停用的反向程序）

1. 抄同目录最邻近的兄弟 plist 作模板（Label/ProgramArguments/日志路径全套同构，
   只改子命令参数与注释）——同构保证 StartInterval/日志目录等约定不漂移。
2. `plutil -lint <plist>` 过语法才继续。
3. 幂等加载：`launchctl bootout gui/$(id -u)/<label> 2>/dev/null; launchctl bootstrap
   gui/$(id -u) ~/Library/LaunchAgents/<label>.plist`——先 bootout 清旧实例，防新旧双跑。
4. 复验：`launchctl list | grep <label>` 退出码列为 0；再查 StandardOutPath 首跑日志。
   巡检类 job 无输出+rc=0 = 巡检静默通过，不是没跑。

## 从 gateway 进程内注册 launchd job 的唯一通道

`launchctl bootstrap/bootout/submit` 在 gateway 进程内被 lifecycle guard 一刀切拒绝
（不检查目标任务是否独立于 Hermes，防间接网关重启循环）；连写一个内容含这些命令的
脚本文件、cron `--script` 包装、osascript 开 Terminal 全部被拦。正确动作不是穷举绕路：

1. 机器侧做完一切能做的：plist 就位（`plutil -lint` 过）、脚本在位（`bash -n` 语法过）、
   `launchctl enable gui/$(id -u)/<label>`（enable 不在拦截名单）。
2. 备一键修复脚本（bootout→bootstrap→验证→语法检查，输出落 /tmp 日志）。
3. 向用户交代一句外部 Terminal 命令，验收凭据：`launchctl print gui/$(id -u)/<label>`
   显示 job 脱离 `uninitialized` + `print-disabled` 显示 enabled。

判据：`job state = uninitialized`（从未注册）≠ `disabled` ≠ `not running`（已注册等触发）
——三态含义不同，uninitialized 的 plist 再完美也不会执行。

## 坑

- **别名对不上进程表**：用户常用别名称呼服务（如 slux），别名不出现在进程串、
  launchd label、plist 文件名里——按别名本词 grep 三处全空，易误判「没在跑」。
  按服务真名词根模糊搜，拿 PID 后 `ps -p <pid> -o command` 看完整命令行确认身份。
- **验证批次混入可能挂起的 CLI**：把可能交互/挂起的命令（如 `hermes cron list`）
  与验证命令捆一个批次——一个挂起吃掉整批超时，同批已打印的证据跟着报废。
  慢/险命令单独跑并给短超时。
- **bootout 报错≠失败**：目标 label 本就未加载时 bootout 报错，继续走 disable 即可。
- **skill_dir 判归属不可靠**：symlink 板下 skill_view 显示 orchestrator 视图路径，
  实际归 default——写前先发单 op 探针，细节见 `orchestrator-profile-skill-writeback`。
