# 终端 PTY 泄漏事故复盘（2026-08-28）

严重级别：P0（系统级故障——macOS 全机 PTY 池耗尽）
分支：`fix/terminal-pty-leak`（合入 main）
影响版本：SwarmStudio ≤ 2.8（三个终端组件的 WebSocket 生命周期缺陷为 upstream 原生）

## 事故时间线

- 08-27 09:52 开机，SwarmStudio 随登录启动（PID 735，server 子进程 PID 1489）。
- 08-27 09:53 → 08-28 09:26：PTY 逐步泄漏累积至 252 个（平均约每 5.6 分钟 +1）。
- 08-28 09:26:49：macOS PTY 池（511）触顶。此后每次终端重连 `posix_spawnp failed`，
  客户端每 3.0s 重连一次，服务端日志 1431 条 `Failed to create session` + 
  `Connection closed, all sessions killed`（09:26:49–10:38:34 连续 3s 间隔）。
- 08-28 ~10:38：泄漏源进程被回收（PTY 随进程释放），系统恢复。

## 根因

服务端每条 `/api/hermes/terminal` WebSocket 连接建立时**自动创建一个 PTY session**，
连接关闭时全部 kill。泄漏 = 客户端产生的"孤儿连接"（建立了、永不关闭）。

三个终端组件共享同一个缺陷模式：

```js
ws.onclose = () => { ws = null; scheduleReconnect() }   // 无条件
// ...
onUnmounted(() => { ws?.close(); ws = null })           // close() 是异步的
```

`ws.close()` 的 `close` 事件在清理函数**返回之后**才触发：

1. **卸载后僵尸重连（主因）**：组件卸载 → close 事件迟到 → onclose 触发
   `setTimeout(connect, 3000)` → 3 秒后新建无人认领的 WebSocket → 服务端为其建 PTY →
   **永不释放**。每次进出终端模式 / 主题切换 / 组件销毁重建泄漏一个。
2. **旧 socket 迟到事件误杀新连接**：dispose+init 重启路径中，旧 socket 的 onclose
   无条件 `ws = null`（此时变量可能已指向新 socket）+ 重连 → 双活连接、其一成孤儿。

## 修复（patch 192/193/194 + overlay 直改）

| 层 | 修复 | 位置 |
|---|---|---|
| CockpitTerminalPane | `disposed` 标志；socket 身份守卫（`ws !== sock` 的迟到事件直接忽略）；dispose 时**先摘除全部事件处理器再 close()**；`scheduleReconnect` 检查 disposed | overlay 直改 |
| TerminalView | 同上三件套；顺带删除重复的 `ws.onopen` 赋值 | patch 192 |
| TerminalPanel | 重连 timer 可取消（unmount 清除）；`destroyed` 守卫；socket 身份守卫；unmount 摘除 handler | patch 193 |
| 服务端兜底 | 全局并发 PTY 上限 100（`liveSessions` Set 计数，超限拒绝并报错）——客户端再出 bug 也只报"Terminal session limit reached"，不再耗尽系统池 | patch 194 |

关键原则：**主动关闭路径不重连，只有"当前 socket 的意外断开"才重连**；
身份守卫保证旧 socket 的任何迟到事件都无法触碰新连接。

## 回归测试

- `custom/client/cockpit/__tests__/cockpit-terminal-pane.test.ts`（+4）：
  卸载后 10s 零新连接；卸载前捕获的旧 onclose 闭包被身份守卫拦截；
  意外断线仍正常重连（功能不回归）；工具切换重启路径无多余连接。
- `custom/client/__tests__/upstream-terminal-ws-lifecycle.test.ts`（+3，直接挂载
  patch 后的 upstream TerminalView）：同口径验证。
- 门禁：vitest 69 文件 / **518 通过 / 6 跳过 / 0 失败**；vite build ✓；server tsc ✓。

## 遗留与建议

- 修复未打包发布（叠在 2.8 之上，与 cockpit 终端多工具功能同待下个版本）。
- 运行中的旧版 app 仍有此 bug：重启 SwarmStudio 可清空已泄漏 PTY；升级后根治。
- 服务端 cap=100 触发时客户端表现为静默重连（cockpit pane 不显示 error），
  可后续在 pane 的 error 控制消息上补 UI 提示。
