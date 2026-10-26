# JVM 远程调试（JDWP 经堡垒机隧道）

> **何时读我**：任务命中本文档主题时按需读取（路由表见 SKILL.md）。首行：# JVM 远程调试（JDWP 经堡垒机隧道）。

## 定位

存量项目修 bug（fix 任务）时，日志与数据只能回答"发生了什么"，回答不了"为什么走到这条分支"。远程调试把研发环境 JVM 的执行现场拉到本机 IDE 断点下：变量值、调用栈、条件分支走向，一次断点全看到。本文档承载从开 JDWP 到证据回写的全链路，流水线位置见 [bugfix-runbook.md](bugfix-runbook.md) 第③步。

## 前置条件（缺一发不动的三件）

1. **服务端 JVM 开 JDWP**。启动参数追加：
   ```
   -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=127.0.0.1:5005
   ```
   - `server=y`：JVM 侧监听，IDE 主动 attach（反之 IDE 等 JVM 连来，不适合本场景）。
   - `suspend=n`：不等调试器 attach 再启动——研发环境有真实流量，`suspend=y` 会把服务冻在启动点。
   - `address=127.0.0.1:5005`：只绑目标机本地回环。**绝不写 `0.0.0.0` 或 `*`**，理由见安全边界。
   - 改服务端启动参数需要运维/环境负责人配合——AI 改不了远端启动脚本，这一步只能提需求给人。
2. **堡垒机隧道已建**。`scripts/tunnel.conf` 加一条 `jdwp:15005:<目标机>:5005`，然后 `bash scripts/tunnel.sh up`、`bash scripts/tunnel.sh doctor` 确认本地 `127.0.0.1:15005` 通。
3. **本机 IDE 调试配置**（见下）。

## 安全边界（先读这段再动手）

**JDWP 协议本身没有认证、没有加密、没有权限模型**：谁能连上这个端口，谁就能在 JVM 里读写任意字段、调用任意方法。所以它只能活在隧道里，且绑定恒为回环地址——`tunnel.sh` 的 `LOCAL_BIND` 已锁 `127.0.0.1`，服务端 `address` 也必须写 `127.0.0.1`，两端都不过网。堡垒机（跳板机）是唯一的通道门槛，别用端口直开替代。

## IDE 接入

**IntelliJ IDEA**：Run → Edit Configurations → + → Remote JVM Debug → Host 填 `127.0.0.1`，Port 填隧道本地端口（如 `15005`），"Use module classpath" 选当前项目模块 → Debug 启动。要点：本机代码须与研发环境部署版本同 commit，否则断点行号对不上——先 `git checkout <部署的 commit>` 再 attach。

**VS Code**：`launch.json` 增：
```json
{ "type": "java", "request": "attach", "name": "研发环境(经隧道)", "hostName": "127.0.0.1", "port": 15005 }
```

## 断点纪律（调试会话只读取证）

- 允许：条件断点（按 traceId/订单号过滤）、断点处查看变量与调用栈、只读求值表达式。
- 禁止：在断点处执行写操作（Evaluate 里改字段、调写方法）、HotSwap 改代码继续跑——调试器能做不等于该做，研发环境是共享资源，取证阶段一切写操作按 [bugfix-runbook.md](bugfix-runbook.md) 只读纪律走人审通道。
- 断点尽量少而准：研发环境有真实流量，每个命中的断点都暂停服务线程；用条件断点把命中面收窄到目标请求。

## 证据回写

断点命中即取证：记录断点位置（类:行）、触发条件、关键变量值、调用栈摘要，写进 fix spec 的证据段（简化档 spec 见 `assets/task-type-gates.conf` 的 fix 条目：§1-§4 + §5.5 + §12）；会话动作按节点留痕 `bash scripts/trace-log.sh --node 测试 --actor 本机IDE --tool 'jdwp attach 127.0.0.1:15005'`。断点证据与日志证据、数据库证据至少两样互相印证，根因才算定论（见 runbook 第④步）。

## 无 JDWP 时的降级路径

服务端开不了 JDWP（无运维配合窗口/版本不支持）时，退一级取证，并在 spec 里明示"未做断点级验证"：

1. 日志加密度：按 traceId 拉全链路日志（[mcp-tools.md](../assets/mcp-tools.md) 的 ELK 段）。
2. JVM 现场三件（经 `ops-readonly-guard.sh` 判定后执行）：`jstack <pid>`（线程栈，定位死锁/阻塞）、`jstat -gcutil <pid> 1000`（GC 曲线，定位内存问题）、`jinfo -sysprops <pid>`（生效配置，定位配置未生效类缺陷）。
3. 仍不足则写"复现路径推测+证据缺口清单"，请用户决策是否申请开 JDWP 窗口。
