# 统一身份聊天窗口（五轮 B）

- 日期：2026-10-23
- 版本：v1.1（五轮 C/D：403 降级根治 patch 684 + @身份扇出与 Matrix 群聊 relay，分支 feat/at-identity-unified-chat；v1=批 1 本机身份）
- 需求：用户五轮裁定原话「1、需要新增，通过 matrix 发送消息给对应 gateway 去获取（和"在线"同理）；2、目前同一台机器上多账号是模拟不同机器的集群（复用的同一个网关），不用做聚合；3、加上（来源标签）；4、我想要的是在一个聊天窗口中统一，可以和所有身份进行聊天会话」。

## 交付（批 1）

- 服务端 `custom/server/controllers/ia2/identity-chat.ts`（原生 koa 中间件，防 koa-router 新路由 404 缺陷——engine-models 先例）：
  - `GET /api/ia2/identities`：身份全集=目录枚举 `~/.hermes/profiles/*`（排 `_` 前缀；与网关 Cron tick 同一全集）；在线态=`/health/detailed` platforms 键 `<profile>:<platform>` 前缀投影（与「在线」同源理念，fail-soft：网关不可达→全部离线态照常返回）。
  - `POST /api/ia2/identity-chat/:profile/chat`、`GET .../messages`：**网关 peer dm 协议代理**（协议正本=hermes-agent `hermes peer dm`，peer.py）：ensure Bot Chat（title 找回→mint→冲突兜竞态）→ chat 同步等回（60s）→ 超时/queued 转客户端轮询语义（不重发——peer.py 同款防双发）。多 profile 走 `/p/<profile>/` 前缀。鉴权同 upstream agent-health 代理（API_SERVER_KEY，~/.hermes/.env 回读）。
- 客户端：`identity-chat.ts`（API 层）+ `IdentityChatCanvas.vue`（身份选择器〔过滤/在线点〕+对话流+queued 轻轮询 8s×8）。入口=工作台左栏「＋新聊天」菜单第四项「身份对话…」→ `#/app/collab?idc=<profile>`；中栏在 overview 旁挂画布（不进对象选择轴）。
- 实测（2026-10-23）：worker-coder mint→chat roundtrip 回「身份链路通」；49 身份列出、orchestrator/[已移除]-orchestrator 在线。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 1 | 本机身份通道=网关 peer dm 协议（Bot Chat），不自建会话管道 | 网关原生支持「与任一 profile 会话」（`hermes peer dm` 即此通道的 CLI 形态）；每身份一个持续 Bot Chat，与该身份的 Desktop/TUI 会话同池 | 自建 per-profile 会话表（否决：与网关会话权模型冲突——api_server_bot_chat.py 明拒第二写入方） | 是 |
| 2 | 身份全集=profiles 目录枚举，非 /health/detailed 的 served_profiles | 实测该端点无 served_profiles 键；目录=网关 Cron tick 50 profile 同一全集（gateway.log 实证） | served_profiles 投影（否决：键不存在恒空） | 是 |
| 3 | 超时=queued 转轮询，不重发 | peer.py 协议语义：消息已入 FIFO，重发=双跑 | 超时报错让用户重试（否决：双跑风险） | 是 |
| 4 | 出口用原生 koa 中间件精确匹配 | 真进程 koa-router 部分新路由 404（routes.ts 注释与 engine-models/native-routes 先例；本端点实测 404 后改中间件即通） | koa-router prefix（否决：实测不生效） | 是 |
| 5 | 入口挂「＋新聊天」菜单+query 路由（?idc=），不进三聊天列表 | 用户裁定「在一个聊天窗口中统一」——身份会话是**新轴**（非房间/群聊/agent 会话的第四类混排对象）；独立窗口承载选择器+会话 | 混进左栏聊天列表（否决：用户四点明示否定旧做法） | 是 |
| 6 | 批 1 仅本机网关身份；Matrix 远程身份（用户第 1 点）为批 2 | 远程获取需 Matrix 通道约定（对应 gateway 的 peer 注册与消息封装），独立设计面；本批先把窗口/协议/标签骨架立起 | 一次做全（否决：远程协议无正本可引，盲约风险高） | 是 |

## 验证证据

- 服务端守门 `identity-chat.test.ts` 4/4：目录全集+在线投影（fail-soft）、非匹配放行、chat ensure→转发→回执投影（profile 前缀断言）。
- 活体：8647 三端点全通（identities n=49/在线 2；chat roundtrip 回复正确）。
- 受影响回归：workbench-flow / flow-adapter（FlowNavPanel 加菜单项）等 ia2 目录全量绿后合入。

## 五轮 C/D 补录（同日）

- **C·403 修复（用户报修「你没有权限访问该资源」）**：根因=Matrix 登录账号（非 super_admin）打开会话页时模型选择器按活跃 profile（orchestrator）查 `/api/hermes/available-models`，`resolveUserProfile` 判无 profile 授权 403 → client 全局 toast。修复（patch 684）：models store 403 回落无 profile 查询（服务端合并该用户可见 profiles）+ 该端点入 client 静默降级名单（run13 先例）。
- **D·@身份统一聊天（用户裁定「聊天窗口内@对应身份，扩展 matrix 群聊支持 bot/matrix/单个或多个本机及远程 agent」）**：
  - IdentityChatCanvas：消息内 `@<身份>` 命中身份清单即扇出（≤5，无 @ 发当前选中）；回复行带身份发言人标签（from）。
  - Matrix 群聊（MatrixMessageInput）：本机身份进 @ 补全（「身份」标签区分）；发送后 relay——消息内 @本机身份 经 peer dm 转发，回复以 `[身份] 回复` 形式回房；queued 发「生成中」提示。bot/matrix 成员/远程网关（矩阵成员）走原生 mention（远程 gateway 的响应由其网关矩阵平台原生处理——用户第 0 点映射：每 Matrix 成员=一个真实网关）。

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 7 | 403 回落而非放开服务端权限 | resolveUserProfile 的 profile 隔离是既定权限模型；目录查询降级无敏感面（合并可见 profiles 已是该用户可见数据） | 服务端放行任意 profile（否决：击穿 profile 授权面） | 是 |
| 8 | 群聊 relay=客户端发送侧（composer 后置转发），非服务端桥 | 会话发送链已在客户端（matrix-js-sdk），零新增服务面；回复即时回房 | 服务端房间监听桥（否决：需网关侧矩阵凭据与监听常驻，批 2 再议） | 是 |
| 9 | 远程身份（矩阵成员=远程网关）走原生 mention 不 relay | 用户第 0 点：每 matrix 成员对应真实网关——其网关矩阵平台原生响应房间消息；客户端 relay 反而双跑 | 远程也走 dm 封装（否决：与网关矩阵平台职责重复） | 是 |

| 10 | patch 684 按「001-683 已应用态」快照前后 diff 重生成 | 首版在部分应用树上生成，行号在完整序列注入态偏移不适用（inject 实测 024/684 双失败复盘）；快照法保证上下文=真实注入序列态 | 手写行号（否决：已实证漂移） | 是 |

## 残留与移交（批 2）

- Matrix 远程身份获取（用户第 1 点）：需定「对应 gateway」的 peer 发现约定（矩阵房间成员→网关 peer 注册表映射），另立 spec。
- 身体来源标签：画布已挂「身份」kind 标签+在线点；批 2 加远程身份时扩 kind: 'matrix-remote' 双标签。
- queued 轮询为固定 8s×8 次；批 2 可换 SSE（网关有 /chat/stream）。
