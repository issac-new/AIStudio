# Fleet 命令审批 live 缺口（2026-09-28 已修复 · 垂直闭环实证）

> **状态更新（同日 13:40）**：按下方"修复方向"落地——patch 490（unattended deny 前
> 先走 operator 已选审批传输）+ studio-file-approval 传输插件 + studio 收件箱文件
> 队列源（root + 全 profile home 扫描）。E2E 实证：worker 撞 `rm -rf /tmp/pay-live-demo`
> → 请求入队 → 收件箱 UI 可见（2 pending）→ 人点「批准」→ 响应文件回写（request_id+
> digest 绑定）→ worker 放行执行 → **目录真实删除、任务 done（t_26da796a）**。
> 启用/撤销脚本 `scripts/aipay/mux/mx-enable-file-approval.sh`（幂等；DEENABLE=1 回
> builtin）。以下为修复前的实证排查记录（保留存档）。

## 现象
kanban spawn 的 worker（unattended/single-query 模式）撞危险命令时**硬 block**，
不把审批请求送进 studio bridge（/api/approvals/pending 恒空）。评审卡审批闭环
（review 域）已实证，命令审批（fleet 域）live 演示因此不可得。

## 实锤证据（三次独立 agent 会话，独立任务）
| 任务 | worker 行为 | 证据 |
|---|---|---|
| t_d5eeaccb 清理构建产物 | rm -rf 被 BLOCKED 三次变体（rm/find -delete/shutil），自行绕 | logs/t_d5eeaccb.log，cache 保留 |
| t_2e434264 删日志 | 同 block，agent 明言「config allows approvals 吗」 | logs/t_2e434264.log |
| t_b04473ea 清缓存 | block 于 single-query mode，直言「无 user present to approve」 | logs/t_b04473ea.log，session cache 保留 |

## 根因（代码级）
- kanban dispatcher spawn 的 worker 以 `hermes --single-query`（无 TTY）跑危险命令：
  `kanban_db_dispatch.py` 的 spawn 子进程 stdin=DEVNULL，无人可应答。
- 危险命令在 agent 侧即被 hardline blocklist 拦截（`terminal_approval_batch.py` 的
  batch 模式只在交互式 TTY 下走 `_gateway_queues` 审批队列）。
- studio 的 `respondFleetApproval` 只桥接 chat-run 会话（`fleet-tap.ts` registerChatRunSocket），
  kanban worker 会话不在该桥内 —— `kanban_db.py:2826` 的 dispatch 不走 chat-run。

## 修复方向（下轮立项）
1. kanban spawn worker 增加 `HERMES_APPROVAL_TRANSPORT=matrix`：危险命令请求路由到
   matrix 房间（!approve 机制已有），审批结果回写 worker。
2. 或 studio 侧起命令审批队列的 REST 面（与 /api/approvals 同构），kanban worker 经
   gateway 事件总线上报 pending → /api/approvals/pending 可见可批。

## 数据现场（演示后已清理）
- /tmp/pay-demo-{build-cache,stale-logs,session-cache}：已 rm
- fanfan-pm-plan 板的 3 张演示卡（t_d5eeaccb/t_2e434264/t_b04473ea）：blocked 状态，
  供下轮复跑对照。
