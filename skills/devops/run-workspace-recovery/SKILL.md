---
name: run-workspace-recovery
description: "Use when runtime workspace drift breaks workers."
tags: [run-workspace, update-drift, dispatcher, crash, orchestrator]
---

# 运行时 workspace 漂移恢复

## 铁律：卡 rc=0 ≠ 实际完成

接收到 worker 退出 rc=0 且卡片卡在 triage/blocked 状态时，首要怀疑的是 **dispatcher 挂载的 workspace 仍是 update 时刻的冻结快照**：源码 HEAD 已应用补丁，但运行时环境从未看到更新。

## 诊断序列

1. **核对源码事实**：
   ```bash
   git log -1 --oneline -- hermes_cli/kanban_gates.py
   git show HEAD:hermes_cli/kanban_gates.py >/dev/null && echo "HEAD 有文件" || echo "HEAD 缺失"
   ```
   确认修复确实在 HEAD。

2. **检查运行时副本齐备性**：
   ```bash
   for w in ~/.hermes/installs/*/environments/*/workspace; do
     [ -d "$w/hermes_cli" ] && {
       [ -f "$w/hermes_cli/kanban_gates.py" ] && echo "OK $w" || echo "MISS $w"
     }
   done
   ```
   - 多个 gateway 挂载的 workspace 可能版本不一致
   - `MISS` 表示该路径的 dispatcher 从未更新

3. **排查 dispatcher 进程挂载的 workspace**：
   ```bash
   ps eww $(pgrep -f 'dispatcher') | tr ' ' '\n' | grep -o '/[^ ]*workspace'
   ```
   确认 worker 实际使用的 workspace 路径。

## 修复序列（快路径优先）

1. **同步 workspace**：将 HEAD 的文件复制到所有活跃的 install workspace：
   ```bash
   for w in $(find ~/.hermes/installs -path "*/workspace/hermes_cli/kanban_gates.py" -exec dirname $(dirname {}) \; | uniq); do
     cp hermes_cli/kanban_gates.py "$w/hermes_cli/"
   done
   ```

2. **重启受影响的 gateway processes**：
   - 找到冻结的进程：`ps eww $(pgrep -f 'dispatcher') | grep -o 'PID=[0-9]*'`
   - `kill -TERM <pid>` 让 dispatcher 在下次 tick 自动拉取更新的 workspace

3. **冒烟验证**：
   ```bash
   hermes -p <worker-profile> --cli --accept-hooks chat -q "回复ok"
   # 期望: EXIT_RC=0，不报 ImportError
   ```

4. **链路验证**：建一张 canary 卡，完成从 `ready` → `done` 的全流程，确保 workspace 同步、dispatcher 拾取、worker 成功执行、卡片结束。

## 防御性措施

- **update 后检查**：`hermes update` 完成后跑一次 workspace 检查脚本，防止下次再遇。
- **gateway 重启规范**：每次修改关键模块（如 kanban_gates.py、main.py）后，重启 gateway 而非依赖 dispatcher retries。

## 红线

- 卡 rc=0 退出 ≠ 任务完成；必须以卡 `done` 状态和 task event 交叉验收。
- 勿把文件 `cp` 扩散到未确认的 install 目录；先用 `ls` 核对目录结构。