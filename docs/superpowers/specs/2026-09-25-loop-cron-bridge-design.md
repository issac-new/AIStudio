# loop 调度降级 hermes cron 桥接设计（T3b）

日期：2026-09-25
状态：已实施（默认关闭，`LOOP_SCHEDULER=cron` 启用）
姊妹篇：《三系统能力边界设计》（§6-T3b）、《调度负载唯一登记台账》（L4 行）

## 0. 三句话主旨

GRAPH_ENGINE=on 时 studio 的 RunSpawner 内部 30 秒轮询与 gateway cron 是两套 timer，违反"一负载一登记处"。本设计用 hermes cron 的 no-agent 脚本任务作为唯一 timer：每分钟回调本进程公开段 tick 端点驱动 `spawner.poll()`，桥接模式下本进程不再起内部 interval。读毕应能回答：怎么启用、安全模型是什么、粒度损失多少、坏了怎么发现。

## 1. 动机与非目标

动机：调度负载唯一登记（边界设计 §2 调度行）。双 timer 的实际风险是同一 loop 负载被两处登记（gateway cron job 与 RunSpawner 轮询各自驱动）时序互踩。

非目标：不做 gateway 侧 cron provider 插件（把 studio tick 塞进 gateway 进程——增加耦合面）；不改 legacy Scheduler 路径（GRAPH_ENGINE=legacy 维持原状）；不做跨机调度（单机拓扑前提，见边界设计 §6.2）。

## 2. 结构与流程

```
启用（四个 env；后三个合同均经真 CLI 冒烟实测 2026-09-25）：
  LOOP_SCHEDULER=cron            # 桥接开关（缺省关闭，行为零变化）
  LOOP_CRON_BRIDGE_PORT=<studio端口>
  LOOP_CRON_BRIDGE_TOKEN=<随机串>  # fail-closed：不设即 401
  LOOP_CRON_BRIDGE_HOME=<profile家> # 多 profile 环境必配（如 ~/.hermes/profiles/<active>）；
                                   # 缺省 ~/.hermes 仅适用 default 单 profile

流程：
  graph-assembly.start()
    ├─ 桥接开 → 不调 spawner.start()（无内部 interval）
    │          setCronBridgeTick(() => spawner.poll())
    │          ensureLoopTickCronJob()（幂等）：
    │            1) 写 <home>/scripts/loop-cron-bridge.sh（600，curl 本进程 tick）
    │            2) exec hermes cron create 1m --no-agent --script loop-cron-bridge.sh
    │               --name loop-cron-bridge --deliver local（env 钉 HERMES_HOME=<home>）
    └─ 桥接关 → spawner.start()（原行为）

  hermes cron（唯一 timer，60s 粒度）
    └─ 每分钟执行脚本 → POST /api/loop/cron-bridge/tick（x-loop-bridge-token）
         └─ 公开段路由（patch 472）：token 校验+loopback 限源 → tickFn = spawner.poll()

真 CLI 合同（冒烟实测，v0.21.5+2168）：
  ① --script 只收相对 <home>/scripts/ 的文件名——绝对路径被 create 直接拒绝；
  ② cron 任务落在"活动 profile 家"（issue #18594）——exec 必须显式钉 HERMES_HOME
    且与写脚本的家一致（LOOP_CRON_BRIDGE_HOME）；
  ③ create/list/remove 以 --name 为键，全链 rc=0 实证通过。
```

## 3. 安全模型

1. 路由仅在 `LOOP_SCHEDULER=cron` 时非 404；默认部署零新增面。
2. token fail-closed：`LOOP_CRON_BRIDGE_TOKEN` 未配置 → 恒 401（宁可拒绝也不裸奔）。
3. loopback 限源：`ctx.ip` 非 127.0.0.1/::1 → 403。
4. token 只进脚本文件（600）与内存比对，不落日志；脚本自动生成勿手改。
5. webhook 与手动 tick 路径不受桥接影响（事件驱动，非 timer）。

## 4. 已知代价（用户知情项）

- 粒度粗化：内部轮询 30s → cron 最小粒度 60s，到期 loop 最多多等 30s。
- 配置缺失的失败是**可观测的**：PORT/TOKEN 未配置时大声记日志（"loop 到期判定无 timer 驱动"），不静默降级。
- cron 任务注册是每 studio 实例一个（同名幂等）；多实例部署时各自注册、各自回调本机端口。

## 5. 验证与守门

- 单测 6 例（cron-bridge.test.ts）：开关、脚本内容、404/401/403/503/204 全路径、幂等注册（600 权限、create 参数含相对脚本名、二跳跳过）。
- 集成测试 2 例（cron-bridge.integration.test.ts，hermetic）：真 node:http 端点 × 真脚本执行——token 正确 → 204 且 poll 执行；token 错误 → 端点 401 且 poll 不执行（脚本 `|| true` 吞错属设计：cron 不因 tick 失败报错）。
- 真 CLI 冒烟（2026-09-25，部署运行时 v0.21.5+2168，profile 家钉住）：create（rc=0）→ list 可见 → remove（rc=0）→ list 清零，全链通过；顺带实测出 §2 的三条合同（修复了初版传绝对路径、未钉 HERMES_HOME 两处缺陷）。
- 台账 L4 行更新：RunSpawner 内部 30s（默认）或 hermes cron 桥接（LOOP_SCHEDULER=cron）——同一时刻只有一个生效。
- **活火观察（2026-09-25 完成，spec 最后一项收口）**：真 gateway（:8650，orchestrator 多路复用，v0.21.5）cron 调度器真实触发——注册真实任务后 72.6 秒内（约一个 tick 拿起 + 一个 60s 周期）脚本 curl 打到真 node:http 端点得 204 并记点；任务与脚本即用即清（list 归零）。复现手续：起真端点（挂 registerLoopCronBridgeRoutes + LOOP_CRON_BRIDGE_TOKEN）→ 在活动 profile 家 `hermes cron create 1m --name <job> --no-agent --script <相对名> --deliver local`（env 钉 HERMES_HOME）→ 观察 ≤200s → `hermes cron remove <job>`。

## 6. 关联

- patch 472（routes.ts 公开段挂载）；overlay 件 cron-bridge.ts + graph-assembly 门控。
- run-trace/事件日志侧的 eid 锚点（T4b）与本桥接正交。
