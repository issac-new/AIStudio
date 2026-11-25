# 2026-11-25 N34 挂账清偿批二：真实数据清理、首帧竞态根治、建会话命令路径与 clientMismatch 归一

> 状态：已收口（2026-11-26 状态行回填；合入 main 81824d5d9）
> 承接：`2026-11-24-zcode-400-pending-batch.md`（N34-1、N34-2、N34-3、N34-5、N34-12、N34-13）

## 变更

用户令「完成未做及挂账（按建议执行）」：清偿上一批交付说明列出的全部剩余项。本规格是这批工作的决策事实源；台账文件只保留状态与编号，机制细节以本规格为准。

### 1. N34-5：真实库历史测试任务清理

真实 ZCode 库（`~/.zcode/cli/db/db.sqlite`）里有 25 条 `verify-import` 历史测试任务与对应的 QA 项目及其根目录行，属测试残留。执行流程：先 `sqlite3 .backup` 全量备份到 NVMe 归档目录；再在副本库上演练同一条清理语句并核完整性；最后对真实库执行——任务行 2032→2007，25 个孤儿会话文件归档后移除，`PRAGMA integrity_check` 通过。备份与演练副本留在仓外归档目录（`/Volumes/nvme2230/lab/archive/aistudio-n34-cleanup-20261125/`），可回滚。

### 2. N34-12：派单台账测试数据清理＋根治第二道防线

真实台账 `~/.hermes-web-ui/overlay/dispatch-ledger.jsonl` 3507 行中 3056 行是 `/w/anywhere` 测试写入。先整文件备份到归档目录，再原子重写（临时文件＋rename），451 行真实推演记录全保留。另查明修复后新增的 22 行来自其他会话工作树（该分支尚未含本修复），非修复漏洞。

根治：`dispatch-ledger.ts` 的 `dispatchLedgerPath()` 增加自判——vitest 进程未显式指定 `GOVERNANCE_DISPATCH_LEDGER` 与 `HERMES_WEB_UI_HOME` 时，落进程内一次性临时文件（首取生成、同进程稳定）。此前隔离只在全局 `custom/client/test/setup.ts`，别的入口直接 import 本模块时会漏；现在隔离下沉到解析函数本身，是第二道防线（`custom/server/__tests__/zcode-engine-controller.test.ts` 有两个用例锁行为）。

### 3. N34-13：定谳——宿主桥接首帧竞态（不是引擎问题）

上一批台账写的「建会话被拒后引擎不应答握手」是错误归因。本轮对照实验证明：稳定态下新连接握手本身就交替失败（隔离引擎各 200 次新连接：等 `open` 后再挂 `message` 监听＝失败 20 次，且失败的全部是「打开瞬间首帧已到达」、成功的全部是「尚未到达」；创建连接时即挂监听＝失败 0 次）。旧构建（4.0 换血前）同样出现，与建会话、与 4.0 回归均无关。

根因：`connectZCodeEngine` 原先等 WebSocket `open` 之后才构造 `SocketProtocol`（挂监听），而引擎在连接建立的同一拍就发出 RPC 初始化帧；两帧合并到达时初始化帧在监听挂上之前被派发而丢失，`ChannelClient` 停在未初始化态，此后所有请求排队不发——表现是握手超时。

改法：创建 `ws` 后立即构造 `ChannelClient`／`SocketProtocol` 与两个通道代理，再等 `open`；失败分支先 `client.dispose` 再 `ws.terminate()`。守门：`custom/server/__tests__/zcode-engine-bridge-open-race.test.ts`——假连接复刻最坏时序（`open` 后同一拍派发初始化帧），真 `ChannelServer` 做对端；断言「打开那一拍监听已挂好」且握手成功。真实引擎修复后连续新建连接 60/60、30/30 成功。

### 4. N34-2 第二步：建会话必须走 v4 建会话命令；路径形态逐字约束；clientMismatch 归一

三个在隔离引擎上实测定谳的缺陷（前两个是上一批合并进主干时引入/遗留的，本批修复并如实记录）：

- **路径形态回归**（上一批 P2-4 引入）：`ensureEngineProject` 做了 realpath 改写再登记，而派单建会话用原始路径，引擎按「项目根目录 === 会话工作区」逐字校验（`project.cwd-not-in-roots`）拒绝。改法：去掉改写，查找与登记一律沿用调用方给定路径字符串（新增符号链接回归用例，先红后绿）。代价（头注写明）：同一目录的不同写法会各得一个项目。
- **旧 RPC 建会话无法执行回合**：`agent.createSession` 建出的会话发文本稳定报 `fault.command.executionFailed`（FOREIGN KEY constraint failed，子进程会话库里没有会话行），三次实测一致。改法：新增 `cas-command.ts` 的 `buildCreateSessionEnvelope`／`createEngineSession`，经 v4 建会话命令创建（`payload.workspaceId`＝工作区路径，`sessionId: null`）；服务端转发前按 clientId＋commandId 预留任务并绑定项目。未获接受（或回执结果类型不符）即抛错带出状态与原因码。
- **clientMismatch**：引擎连接作用域对 `terminal-client` 角色（默认）校验每条命令的 `envelope.clientId` 必须等于握手登记值（`zcodeAgentConnectionScope.ts` `sendConversationCommandV4` → `fault.command.clientMismatch`）。宿主三个入口各写死了标识：派单服务 `'swarmstudio-mention-bus'`、`/fork` `'swarmstudio-ide'`、`/checkpoint/recover` `'swarmstudio-checkpoint'`，而握手标识是持久化的 `hermes-…`——建会话能成功、发文本必被拒（隔离引擎实测）。改法：单一事实源＝`bridge.clientId`。派单 `sendCommand` 端口发送前归一信封 clientId；`/fork` 与 `/checkpoint/recover` 改经 `withBridge` 取 `bridge.clientId` 构造信封。`session-mode-controller` 本就用的 `bridge.clientId`，不受影响。`MentionDispatchService` 的 `clientId` 构造参数保留（单测契约），不再到达引擎。

### 5. N34-1：真实引擎补验证

隔离引擎＋本机 OpenAI 兼容模拟服务（流式/非流式 `/v1/chat/completions`、占位密钥），宿主真实桥接：`switchCollaborationMode` accepted×2、`forkAssistant` accepted（返回子会话）、`editUserQuery`（仅对话）accepted；`applyFileRewind`（仅代码）在回退之后对同一目标发回 `stale/proto.staleTarget`——引擎正确应答。旧信封对照：ISO 字符串 `issuedAt`、缺基线均被拒。宿主生产路径整链实测（临时探针，已删）：登记项目→v4 建会话→发文本→模拟模型调用→对话行 complete→`/fork` accepted→检查点仅对话 ok、仅代码 `guard.actionUnavailable`（全新会话无可回退文件，引擎正确拒）。

### 6. N34-3：4.0 差量对照（聚焦版）

报告落盘仓外 `/Volumes/nvme2230/lab/research/zcode-4000-delta-assessment-20261125/report.md`（84 行）。结论：契约面稳定（命令类型 39→39、宿主复制的 RPC 面零差异、服务通道 46→46、引擎服务方法 139→141 仅新增两个、本仓直接调用的方法实现零改动）；两处运行行为变化（只读命令白名单扩充＝已兼容；上游配置合并存量缺陷＝本仓与本机未用 zcode 权限列表，无影响，记设计约束）；四项可吸收能力（预装文档工具＋离线适配、工作区插件信任通道、设计插件、上下文微压缩）吸收与否交用户裁决；13 条补丁全部仍必要。

### 任务卡

#### 完成条件

1. N34-5：真实库 25 条测试任务与孤儿会话文件清理完成；备份与演练副本在仓外归档目录；库完整性通过；任务总数 2032→2007。
2. N34-12：真实台账 3056 行测试数据移除、451 行真实记录全保留；有备份；台账写入的测试隔离不依赖全局设置文件（第二道防线用例锁死）。
3. N34-13：归因改写进台账（宿主桥接首帧竞态，非引擎问题）；确定性回归用例在（修复绿、变异红）；真实引擎握手 30/30、60/60。
4. N34-2：v4 建会话命令路径有守门（信封过引擎 `parseCommandEnvelope`、未获接受即抛错）；路径形态回归用例在（符号链接目录）；三入口 clientMismatch 归一有守卫断言；隔离引擎整链实测通过。
5. N34-1：带基线命令在真实引擎拿到 accepted；旧信封被拒如实记录。
6. N34-3：对照报告落盘并回填台账；四项可吸收能力逐条列明待裁决。
7. 回归矩阵合并档通过；台账各条状态回填；规格收据与文档索引重生成。

#### 输入与来源

N34 台账各条的锚点与验收判据；隔离引擎与模拟供应商配方（仓外脚本与日志）；纯净 4.0 树契约（`command.ts`、`zcodeAgentConnectionScope.ts`、`remote-policy.ts`）；真实库与真实台账的只读核对结果。

#### 工作流边界

只改本仓的 `custom/`、`docs/`；真实用户数据（ZCode 库、派单台账）只在本批指定清理项内动，先备份、原子重写；不动他会话的 worktree 与服务；隔离引擎只连本机回环、用完即停；模拟密钥用占位串。

#### 工具与副作用

`dispatchLedgerPath()` 在 vitest 进程内多一次环境自判（非 vitest 进程行为逐字不变）；`ensureEngineProject` 不再做 realpath 改写，同一目录不同写法会各建一个项目（每次新建留日志）；派单端口发命令前多一次信封 clientId 归一（字段改写，无额外调用）。

#### 结果与证据

见「验证」。

#### 异常与恢复

真实库与台账的清理均可从仓外归档目录回滚（备份文件在）；首帧竞态修复可通过反向提交恢复；v4 建会话路径失败时派单如实回报 `engine_unreachable`，不产生半建会话。

#### 验收反例

- N34-13：回归用例的变异形态（等 `open` 后再挂监听）必须红，且红的信息就是生产症状（握手超时）。
- N34-2：撤掉 clientId 归一后，控制器测试里三处守卫断言（派单端口／fork／检查点恢复）必须红。
- N34-2：路径形态用例在恢复 realpath 改写后必须红（`project.cwd-not-in-roots`）。
- N34-12：删掉解析函数自判后，「不依赖全局设置文件」用例必须红。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | N34-13 归因改写为宿主桥接首帧竞态 | 对照实验 20/200 vs 0/200，失败的全部是「打开瞬间首帧已到达」；修复后 0 失败且真实引擎 60/60 | 引擎缺陷／4.0 回归（否决：旧构建同样出现、与建会话无关） |
| D2 | 建会话走 v4 建会话命令，不再用旧 RPC `createSession` | 旧 RPC 建出的会话发文本稳定 FK 失败（子进程会话库无会话行），三次实测一致；v4 命令路径整链通过 | 修旧 RPC 路径（否决：4.0 的实际创建路径就是命令，RPC 是遗留 facade） |
| D3 | 项目登记路径逐字沿用调用方给定字符串，不做 realpath | 引擎按「项目根目录 === 会话工作区」逐字校验（`project.cwd-not-in-roots`）；改写后两者对不上必拒 | 登记与建会话各自做归一化（否决：校验是逐字的，两端各做归一化仍可能产生第三种地写法，不如直接沿用给定字符串） |
| D4 | 命令信封 clientId 单一事实源＝桥接持久化 id，发送点归一 | 连接作用域对 terminal-client 逐命令校验 clientId＝握手登记值；三个写死标识全部被真实引擎拒 | 按入口保留业务标识并申请引擎放宽（否决：校验是安全边界，防伪造 clientId；且宿主本来就该用同一身份） |
| D5 | N34-5／N34-12 真实数据先备份、副本演练、再执行 | 删除类操作先存档再删是红线；演练暴露过语句问题（副本先行验证） | 直接清理（否决：不可回滚） |
| D6 | N34-3 四项新能力不在本批吸收 | 吸收需要离线适配方案等额外决策，属新工作不是清偿 | 顺手吸收（否决：范围蔓延，且预装文档工具涉及离线包口径须用户裁决） |

## 验证

各条实测（2026-11-25，隔离引擎＋本机模拟供应商，宿主数据根全部隔离）：

- **N34-5**：备份 49M 一致性快照；副本演练通过；真实库执行后任务 2032→2007、`integrity_check ok`；25 个会话文件归档后移除。
- **N34-12**：台账 3507→451 行（移除 3056 行测试行）；原子重写前整文件备份；读写台账的 12 个测试文件 129 例绿；真实台账修复后保持 451 行。
- **N34-13**：对照实验 200 次×2（20 失败 vs 0 失败）；确定性用例修复绿、变异红；真实引擎握手 60/60＋30/30；相关测试面 87 例绿。
- **N34-2**：路径形态用例先红后绿（符号链接目录）；建会话信封过引擎 `parseCommandEnvelope`；控制器测试 25 例绿（含三处 clientId 守卫）；相关十面 101 例绿；隔离引擎整链实测——派单 queued×2、对话行 complete（模型调用 4 次）、`/fork` accepted、检查点仅对话 ok／仅代码 `guard.actionUnavailable`。
- **N34-1**：`switchCollaborationMode` accepted×2、`forkAssistant` accepted、`editUserQuery` accepted；旧信封（ISO 时间戳、缺基线）被拒。
- **回归矩阵**：合并档结果收口时回填。

## 设计文档影响

DESIGN_SYNC: none。本批是缺陷修复（把实现校正回既有设计意图：桥接能握手、派单能送达、建会话能执行回合）与真实数据清理，未改变任何设计承诺的形态与数值，不触及整合正本与数字总账。引擎桥接的行为契约（v4 握手＋命令写路径）在设计正本中的表述不受影响。
