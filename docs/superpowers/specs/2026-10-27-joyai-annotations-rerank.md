# 2026-10-27 JoyAI 挂账清偿批二：新挂账三项（标注持久化/LLM 重排/mention 泳道）

## 变更

上批（2026-10-26-joyai-debts-clearance.md）残余挂账三项，用户指令「继续完成」全清偿。

| 编号 | 挂账件 | 落法 | 模块 |
|---|---|---|---|
| C1 | 画布协同编辑/在线标注 | **标注持久化+异步协同**（降维落地：不做实时多人协议）：标注={nodeId,note,checked,by,at} 按**需求指纹**（sha1(title+description)，服务端随 impact 响应下发）存服务端 JSON（ctxnotes 同款原子写）；画布节点点击弹标注面板，节点带已标注角标；多用户读写同一存储=异步协同（最后写胜出），实时 OT 协同仍不做 | `custom/server/mapnotes/`（新域）+ BusinessMapView + 补丁 698 挂载 |
| C2 | fewshot LLM 重排档 | 派发链**并行预取**（不动 experienceLinesForDispatch 同步签名）：dispatchColumnTransition 在 taskTitle 预取处 `Promise.all` 并行跑 `fewshotRerank`（词面 top-5 候选→LLM choice 问句排序→限时 3s race→fail-open 回落词面序），重排结果作独立行传入 stepBrief；env `FLYWHEEL_FEWSHOT_RERANK=1` 选通，ColumnDispatchResult 透出 rerank 留痕 | `custom/server/eval/fewshot-rerank.ts`（新）+ column-dispatch |
| C3 | lane_session 非派发摄取源 | @mention 手动派发通道：mention-dispatch `dispatchLocked` **queued 收口点**（会话创建成功处）+ coalesced 复用会话分支，taskId 存在即写一条 lane_session 证据（evidenceId=`lane-<taskId>-mention-<sessionId>` 确定性幂等，artifactType='mention'，review-store 落账纪律） | custom/server/zcode/mention-dispatch.ts |

## 现状对账（探查结论）

- 标注存储先例：ctxnotes（notes-store.ts 原子写/env 重定向/坏文件空态 + controller CRUD 形态）整体可套；挂载须新 patch（545 同款）。
- 重排通道：clefAskMixed 自带 AbortController 超时（judgeTimeoutMs 默认 12s 太长——重排独立限时 3s race）；questions type 窄类型需 as never 过渡（synthesize/uioracle 同款）；跨域 import eval 域有 exp-inject 先例。
- mention 泳道落点：dispatchLocked L413-415 queued 收口（sessionId 局部变量+params.taskId 可得）最准；zcode 域引 evidence-store 是新跨域依赖（review 域先例支持）；消费端零改（panorama 泳道面自动摄取新源）。

## 决策记录

- **D1 C1 降维为「持久化标注+异步协同」**：实时多人协议（OT/CRDT+WebSocket）在单人桌面场景收益存疑且工程量失控；持久化标注已覆盖「人工修正留痕/跨会话保留」核心价值，多用户经同一存储异步协同（最后写胜出），如实声明边界不装「实时协同」。
- **D2 需求指纹服务端算**：客户端无 hash 基建，sha1Of（eval/clef.ts）现成；指纹随 impact 响应下发，标注 key 用指纹——同需求重推演拿到同一份标注（title/description 改动=新地图新标注，语义正确）。
- **D3 C2 重排独立限时 3s**：judgeTimeoutMs 12s 对派发链太长（派发者等不起）；3s race 超时回落词面序，clef 默认离线（连接拒绝秒失败）零负担。重排行独立于词面召回行（两行并存，来源各自标注）。
- **D4 C3 落 mention-dispatch 而非 engine-controller**：controller 落点改动面小但只覆盖 REST 面；dispatchLocked 收口点覆盖所有调用方（REST/column-dispatch/squad）且是「会话创建成功」的最准语义点。command_rejected 分支不写（命令被拒=会话未投入使用）。
- **D5 补丁号 698 先 grep 后登记**（撞号史延续）。
- **D6 worktree 超软上限第 6 个**（延续前两批偏离，收口即删）。

## 验证

- 定向测试全绿（含回归）：mapnotes 7/7（指纹净化防穿越/upsert 最后写胜出/坏文件空态/HTTP 400）、fewshot-rerank 5+2（parseOrder 解析/off 直通/离线回落词面序/注入行标注）、mention-lane 2+既有 mention-dispatch 9（幂等/无 taskId 边界/拒绝态不落）、dispatch-lane/context/idempotency 回归、impact/workitem 回归——合计 24/24。
- 守门闸：route-manifest stageTabs 36→37（sim/map 真增量随批登记）+ raw-hex + 路由快照 8/8 绿。
- `npm run typecheck:harness` 绿（fewshot-rerank/mapnotes 两域已登记清单）。
- 全量 `npm test` 复跑：905 文件 6460 用例通过 / 0 败 / 11 既有 skip（首轮 2 败=manifest 计数与测试 import 深度，修复后全绿）。
- 补丁 698：numstat 5 插入 0 删除单文件，clean+inject 全链重放验证。
- 活体走查（worktree 8672/8673，浏览器实物）：标注全链——生成地图 13 节点→点支付节点出标注面板（nodeId=ent-fibo-term-Payment）→填备注+勾选已核实→保存回执「标注已保存」→**重推演同需求标注回读+节点角标「✓ 支付」**；指纹端点活体（fingerprint 下发+POST/GET 标注回读 1 条）。
- 走查实录：vue-flow nodeClick 钩子在 nodeDragThreshold=1 且零位移点击时被 d3 链 distance!==0 条件吞掉——产品侧以 canvas 容器 capture 原生监听兜底（已注释锚定根因），IAB CUA 坐标点击在部分窗口态不达页面（工具坑，冒泡 dispatch 验证产品链路全绿）。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§2.11 清偿段补第二批（标注/重排/mention 泳道）。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：研发闭环串联面行更新（+map-annotations 端点+重排档+mention 泳道源）；补丁/路由数随批。

## 挂账（本批不做）

1. 实时多人协同（OT/CRDT）——D1 降维声明。
2. C2 重排的 squad 委托链注入（现只覆盖列编排派单面）。
