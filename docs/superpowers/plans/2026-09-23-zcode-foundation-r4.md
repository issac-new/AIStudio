# R4 实施计划——统筹级 service：hermes ↔ zcode 引擎通道

spec：`specs/2026-09-23-zcode-foundation-design.md` §4 R4。地基已实证（evidence/20260923-zcode-r4/SPIKE-WS.md：WS 握手/v4 协议握手/createSession/双 topic 订阅全通）。

## 架构决策（基于嵌接调研）

- **接入方式**：vendor `@zcode/rpc` 最小面（buffer/foundation/serialization/protocol/channelClient/proxy-channel 约 6 文件，零运行时依赖）进 hermes server 侧 + `ws` 包；channel 名硬编码 `"zcode-agent"`（channels.ts:97），不依赖 @zcode/client/@zcode/services（ESM+TS 源不可直连，调研 §6 结论）。
- **连接形态**：hermes 服务端进程内常驻单连接（`ws://127.0.0.1:3030/ws?token=`，token 取 ZCODE_SERVER_AUTH_TOKEN 可空）；断线重连 + `onAgentRuntimeRestarted` 后重订阅。
- **写路径**：v4 `sendConversationCommandV4`（sendText 命令），不用已废弃的 sendPrompt。
- **事件面**：`onDynamicConversationFrame`/`onDynamicSessionsIndexFrame`（wire 帧 complete/fragment，fragment 需 TopicWireFrameAssembler 重组——首批只消费 complete 帧，fragment 重组列第二批）。

## 分批

| 批 | 内容 | 验收 |
|---|---|---|
| P1 通道基建 | vendored rpc（patch 380 新文件）+ `custom/server` 或 patch 侧 bridge 模块（connectZCodeEngine：连接/握手/重连/单例）+ 健康面 | 单测 mock ws 断言握手序；隔离实例启动时引擎在线则通道就绪日志 |
| P2 会话投影 | sessions-index/conversation 订阅 → 统筹级事件总线（第一批吸收 #1 dispatch reason code 词表落此：订阅/派发失败路径的 reason 枚举透传） | 订阅会话列表变更推送到 cockpit 数据面（现有 socket.io 房间） |
| P3 派单链 | 驾驶舱看板/会话输入 @mention 解析 → createSession + sendText → run 可追溯（#7 @mention A2A 总线最小面） | @agent 派单产生可订阅 run，看板列动即事件 |
| P4 看板门禁 | 列级门禁四件套（#8）+ 认领四围栏（#2） | 门禁拒绝路径有 reason code；同人双跑被围栏拦截 |

P1/P2 不依赖模型请求（infra 层），可先行；P3 端到端依赖 R3 遗留的账号恢复。

## 风险

- vendored rpc 的许可（Apache-2.0 + NOTICE）随 patch 携带出处标注。
- v4 protocolVersion=3 是当前值，握手校验失败要显式报错不静默。
- hermes server 是 ts-node/CJS：vendored 文件改写为 CJS 兼容（源码为普通 TS，去 ESM import 语法或走 esbuild 预编译——按 P1 实测定）。
