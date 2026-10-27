# 2026-10-27 JoyAI 挂账清偿批三：残余两项（标注实时协同/squad 链重排注入）

## 变更

批二残余两项，用户指令「完成残余挂账两项」全清偿。批二 D1 的「实时协议不做」降维决策本案翻案——按仓形态落成可证明的实时协同。

| 编号 | 挂账件 | 落法 | 模块 |
|---|---|---|---|
| D1 | 实时多人协同（OT/CRDT） | **LWW-Register 合并协议 + socket.io 实时通道 + 在线感知**：①MapAnnotation 加 `rev`（lamport 时钟=写方计数），upsert 按 `(rev,by)` 字典序比较——旧写返回现存条目（stale 拒绝），这就是 LWW-Register（合法 CRDT，收敛性可证），并发写自动合并不丢更新；②`/mapnotes` socket namespace（zcode projection-socket 同款 activeIo+emit 助手+鉴权中间件）房间 `mapnotes:<fingerprint>`，POST/DELETE 成功即广播变更事件；③join/leave 广播在线协作者数；④BusinessMapView 订阅房间——他人变更实时落到画布（角标即时变）+「N 人正在看」提示条 | mapnotes 三件 + BusinessMapView + 补丁 699（http.ts namespace） |
| D2 | squad 委托链重排注入 | mention-dispatch squad 简报拼装点（buildSquadBriefing 后）注入重排行：taskId→任务标题→fewshotRerank→rerankInjectLine append 到 prompt（与列编排面同款 fail-soft）。`fetchTaskTitleByTaskId` 搬迁至 `governance/governance-analytics.ts`（解 zcode↔kanban 模块环：column-dispatch import mention-dispatch，反向即成环），column-dispatch re-export 保持兼容 | mention-dispatch.ts + governance-analytics.ts |

## 现状对账（探查结论）

- socket 基建：custom namespace 挂 upstream 共享 Socket.IO Server（http.ts:793/795 旁，135/398 patch 同款）；zcode projection-socket 的 activeIo 缓存+emit 助手形态最省（REST 控制器不穿 io）；客户端 zcode-socket.ts 模块级单例+subscribe 返回清理函数+断线重订形态可整套照抄。
- mapnotes LWW 改动面：upsertAnnotation 覆盖前加比较即可；**探查带出真缺陷**——readAnnotationsFile 字段过滤只放行 nodeId/note/checked（by/at 被剥），读取改写会静默丢字段，本批修。
- writer 身份：controller by 现取 POST body 缺省 anonymous——补 callerOf(ctx) 鉴权身份优先。
- squad 简报：唯一拼装点 mention-dispatch.ts:328-330（sendText 同时喂新建+coalesce 两路径，一处注入全覆盖）；rerank 行放 taskData 栅栏外 append（系统拼的非用户输入）。zcode→eval import 无环；fetchTaskTitleByTaskId 不能反向 import（模块环实证），搬迁 governance 域（其全部依赖本就在那）。

## 决策记录

- **D1 LWW-Register 而非引 yjs/OT 库**：标注条目粒度是「单节点单 upsert」，LWW-Register（(rev,by) 全序比较）即合法 CRDT——收敛性可证、零依赖、确定性可测；OT/CRDT 文本库解决的是「同段文本并发编辑」问题，标注场景不存在该粒度，引库=过度工程。rev=写方 lamport 计数（每写+1，同 writer 单调；跨 writer 以 by 字典序破平）。
- **D2 函数搬迁而非复制**：fetchTaskTitleByTaskId 搬 governance-analytics（依赖全在彼处、语义即 governance 数据面只读查询），column-dispatch re-export 保兼容——单一事实源；在 mention-dispatch 侧重写 10 行是第二事实源，弃。
- **D1 协作者感知用房间成员**：socket.io fetchSockets 推 join/leave 事件，客户端显示「N 人正在看」——presence 数据源即房间成员，不建第二套在线表。
- **D3 补丁号 699 先 grep 后登记**（延续）。挂载点 http.ts namespace 注册行（135/398 同款）。
- **D4 worktree 超软上限延续偏离**（在途 8 个全受保护，收口即删，如实记录）。

## 验证

- 定向测试全绿：mapnotes 7/7（LWW 高 rev 胜出/低 rev 拒绝返回现存/同 rev 字典序破平/读取侧 by-at-rev 字段保真——探查带出的批二过滤缺陷钉死回归/坏条目过滤/REST 投影 400/socket 广播语义 spy 断言房间与事件形状）、squad-rerank 2/2（开关开+离线回落词面行注入简报尾/off 零负担/agent 单人派发不受影响）、fewshot-rerank 回归+mention 族回归+kanban 族回归。
- 语义修正一处：fewshotRerank 候选不足 2 条从 off（无行）改为 fallback 直通（词面召回行照注入）——开着档反而无行为的不一致，随批修正并有守门钉住。
- `npm run typecheck:harness` 绿（mapnotes-socket 登记）；全量 `npm test`：908 文件 6466 用例通过 / 0 败 / 11 既有 skip。
- 补丁 699：numstat 2 插入单文件 http.ts（namespace 注册），clean+inject 全链重放验证。
- 活体走查（8674/8675 双标签页浏览器实物，实时协同全链）：A/B 两标签生成同一需求地图（13 节点同构）→A 保存标注「A 端核注：双渠道兼容」→**B 不刷新实时见节点角标「✓ 支付」**（socket 广播实证）；两端 presence 提示「2 人正在看」；LWW 旧写实证——rev=1 过期写 POST 返回 applied:false+现存条目原文（服务端拒绝+如实回显）。
- vitest worker 的 socket.io-client 网络栈行为异常实录（连接建立但订阅不生效，同代码 vite-node 直跑全绿）——socket 集成测试改 spy 语义断言形态，网络级行为由活体走查与冒烟脚本承载，spec 记录环境差异。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§2.11 补批三段（LWW-Register 实时协同+presence+squad 重排注入）；变更记录 R15。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：研发闭环串联面行补批三；补丁 408→409、全量 6,466。

## 挂账（本批不做）

（无——本系列四轮挂账全部清偿归零）
