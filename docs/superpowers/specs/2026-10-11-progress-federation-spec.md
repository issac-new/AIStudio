# 跨机进度联邦（progress federation）设计短档

2026-10-11 用户问答立项："真实环境不同用户及其 agent 分布在多台电脑上，彼此能知道进度吗？"——此前不能：进度事实（卡状态/里程碑/git 在途/审计行）只落本机文件，唯一跨机同步点是共享 git 远端与消息服务器。裁定"现在就动"，当日落地（overlay 3e5b1e51）。

## 三步件

1. **事件上行**（`custom/server/progress/federation.ts`）：本机进度聚合（复用 `/api/progress/tasks` 的台账×会话×里程碑聚合）压缩成一条 `[progress:event] {v:1,machine,ts,type:tasks|heartbeat,activeAgents,tasks[]}` 消息发进联邦 Matrix 房；60 秒心跳，端点首次命中惰性启动（unref 定时器）。
2. **聚合**（`federation-controller.ts` + `/api/progress/machines`）：拉联邦房近期消息（30s 节流）解析入内存机器注册表（≤64 机×每机 20 条事件，24h 可见窗）；端点透出全局机器视图（本机保底条目+各机 lastSeen/在途任务/静默分钟/任务快照）；`/tasks` 应答附 `machinesSummary`。
3. **跨机巡检**（clusterinspector D8 `machine.silent`）：巡检官快照注入联邦注册表；机器"24h 内有心跳但静默>15 分钟且最近上报带在途任务"即报 warn，附差分参照行（其余 N/M 台机器 15 分钟内有心跳）——空闲机器（0 在途）静默不报，零误报纪律。

## 配置

| 变量 | 语义 | 缺省 |
|---|---|---|
| `MX_FEDERATION_ROOM` | 联邦房号 | 未配=未接线（faces `ok:false`，D8 空转） |
| `MX_FEDERATION` | `off` 显式关 | 开 |
| `MX_FEDERATION_MACHINE_ID` | 机器名覆盖 | `os.hostname()` |
| 凭据 | 复用网关 Matrix 环境链（`readGatewayMatrixEnv`） | — |

## 限制（如实）

- 单房间轮询（非长连接）；消息量 = 机器数 × 1 条/分钟；无多租户鉴权（房间访问权即边界）。
- 任务 ID 跨机不合并（各机快照独立呈现，`machineId` 区分）——同组织同任务跨机协同的合并视图留后续需求。
- 共享通道选型 = Matrix 房：消息服务器本就部署在网络侧、结论行广播是该形态的雏形；事件总线（Kafka 类）形态留规模化后再议。
