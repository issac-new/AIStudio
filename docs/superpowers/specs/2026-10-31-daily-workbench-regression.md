# 日常工作台全功能回归轮：收件箱 500 根治＋房间画布挂载清偿＋建卡深链收窄＋走查探针沉淀

日期：2026-10-31 ｜ 轮次：日常工作台（/app 家族）全功能回归 ｜ 类型：fix（服务端 1＋客户端 2）＋test（守门 4 例）＋probe（走查探针 1 件）

触发：用户 2026-10-31 指令「日常工作区的所有功能进行完整回归测试，完成所有功能的 UI 使用，修复排查到的问题」。走查面=manifest 派生 27 个 /app 页＋37 个阶段页签深链＋22 个并入 /hermes 功能页＋看板/收件箱/沟通/搜索四组交互流；首轮 64 项检查 58 过 6 待查，取证后定谳 3 个产品缺陷（D1/D2/D4）、1 个探针缺陷（D5）、2 个非缺陷记录（D3 搜索为探针关键词不命中、E2 RACI 区为数据条件渲染）。

## 1. 变更

### 一、D1 human-gate 收件箱 500：取证定谳＋移交并行会话（本批零代码改动）

走查实录：GET /api/approvals/human-gate 500（审批收件箱 /app/inbox 与阶段页审批切片双双打穿）。根因定谳：`~/.hermes/approvals/human-gate.json` 内存在 2 行裸 grant 形态（`{scope, board, grant}`，2026-10-27 hexstrike 管线授权的带外写入，无 id/runId/cardId 信封字段），而 `ensureLoaded` 的行级校验 `rows.some(r => !isRequest(r))` 对任一非信封行整体抛错。同文件的另一读者 `runtime/tools/kanban_tools.py _read_task_grants` 对该形态宽容（取 row.grant），形成一文件两 schema 的读者分裂。

本批一度在本 worktree 完成修复（行级容错＋裸 grant 迁移信封＋GET warnings 出口＋4 例守门），收口时发现并行会话 `fix-humangate-unify`（2026-10-31 08:27 起，spec=2026-10-31-humangate-store-unify.md）正以独立 worktree 承接同一缺陷的同一解法。按「禁同文件双写、B 依赖 A 时等 A 合入再 rebase」纪律，本批让出该文件面：human-gate.ts 与其测试全部回退到 main HEAD 原样，修复与守门归 fix-humangate-unify 批承载。给该批的取证馈赠（本批实测锚点）：迁移须保持 python 读者契约（信封行顶层保留 scope='task'＋grant 原样内嵌，`_read_task_grants` 按 `row.scope==='task' && isinstance(row.grant, dict)` 提取即继续命中）；本机 2 行裸 grant 均为已过期授权（expiresAt=1793203597249），迁移后保持 inert。

### 二、D2 房间画布 `rooms` 悬空引用根治（custom/client/matrix-chat/components/MatrixRoomCanvas.vue:56）

走查实录：/app/s/room/:roomId 页 pageerror `TypeError: Cannot read properties of undefined (reading 'length')`，时间线 0 条消息（run23 挂账「群时间线间歇不挂载第二根源（TypeError rooms.length，因果未定）」在本轮复现并定谳）。根因：cd2742a8f（run23 复盘批）为治 PREPARED-only 窗口补的第二条兜底 watcher 写作 `watch(() => roomStore.rooms.length, …)`，而 matrix-room store 只导出 `roomList`/`sortedRooms`，无 `rooms` 键——watcher 建立即求值 `undefined.length`，setup 抛错、画布不挂载。修复：改引 `sortedRooms`（列表变化语义与 selectRoom/activeRoom 同源），兜底自愈路径恢复工作。

### 三、D4 建卡深链自动收窄唯一板（custom/client/kanban/views/SwarmKanbanView.vue）

走查实录：/app/board?new=1 直开行内建卡器，但默认聚合态（全板勾选）下提交必被唯一板守卫拦截（toast「勾选唯一看板后可就地新建任务」），深链直达体验半残。守卫本身设计内不动；按用户 2026-10-31 裁决补到达时收窄：`autoOpenCreate`（TasksView ?new=1 传入）为真且勾选板非唯一且日常板清单已装载时，自动收窄到 default 板（缺席回落首个日常板）＋message.info 告知；每挂载至多收窄一次（标志位防板刷新后重收窄覆盖用户手动放宽）。

### 四、D5 走查探针修复＋沉淀（scripts/regression/daily-workbench-walkthrough.mjs）

首轮探针三处假红/漏检：B 节 settle 2.3s 不足以等 IaSideNav 冷装载（实测 5s 内 testid 齐）；语言往返钮误定位（正身=单钮 `ia-locale-toggle`，zh 态显示 EN、en 态显示 ZH，非「中」字）；H 节关键词「看板」不命中任何任务标题/会话名（搜索 hay=title/id/workspace/assignee），误报全 0。修复：B 节等待 testid 就位＋语言钮走 testid 双击往返；H 节关键词改为数据派生（先从 overview 取一张任务标题片段再检索）；C/D 节页面断言从「正文前 60 字」升级为「正文≥15 字＋页名锚点抽样」。探针随批入库为日常工作台回归的常驻走查入口。

## 2. 决策记录

1. **human-gate store 行级异常由 fail-closed 整体抛错改为「跳过＋告警＋原行保留」**（Mechanical→Taste 级）：依据仓库三条不变量之「fail-soft 不造假：审计失败可见但不阻断业务」——行级脏数据打穿整个审批收件箱属「阻断业务」，且既有 fail-closed 注释保护的对象（不可读权威记录不被空表覆盖）在 JSON 损坏路径上原样保留。安全边界不削弱：python 侧授权判定（authorize_task_execution）只消费 grant 内容（tier/revision/expiry 校验），信封化迁移不改变其可读行集合；无法识别的行既不出现在收件箱也不被删除。
2. **裸 grant 行迁移而非删除**：文件中 2 行均为 2026-10-27 真实裁决留痕（已过期），删行丢审计；信封化保留全部原始 grant 字段，历史可查。
3. **D4 收窄时机取「到达时」而非「提交时」**（用户裁决）：提交时自动改板会让用户在无感知下建错板；到达时收窄＋toast 告知，用户可立即手动放宽改选。
4. **D3（搜索全 0）与 E2（drawer-raci 缺席）定性为非缺陷不修**：前者为探针关键词不命中可检索字段（同流程 t_/hello 关键词分别命中 6 任务/1 会话）；后者为 RACI 区数据条件渲染（该卡无 RACI 数据），属设计内。
5. **D1 同题撞面移交**（并行协调）：收口时发现 fix-humangate-unify 会话正承接同一缺陷修复，按「禁同文件双写」让出文件面（决策详见 §1 一）；本批对 D1 的贡献=根因定谳＋python 契约锚点＋过期态实据。

## 3. 验证

- 守门测试（vitest）：`npx vitest run custom/client/matrix-chat custom/client/kanban scripts/regression`——MatrixRoomCanvas watcher 引用静态断言 3 例；SwarmKanbanView 收窄 2 例（深链收窄／非深链不收窄；一次性标志分支由活体走查承担）。
- 活体复验（合并后主树）：重跑 `node scripts/regression/daily-workbench-walkthrough.mjs`——B 节侧栏/语言往返、E 节建卡→抽屉→验收区→催办 UI→删卡清理、G 节房间页时间线非零；F 节收件箱 500 属 D1，待 fix-humangate-unify 批合入后转绿（本批不冒充）。
- 提交前目标测试＋合并前全量 `npm test`。

## 4. 设计文档影响

DESIGN_SYNC: none。理由：本批均为缺陷修复（D1 为取证移交不落码）——房间画布 watcher 是引用修正；?new=1 收窄是既有 UX 裁决 E 的体验收口非新交互契约。整合正本（2026-10-23-swarmstudio-integrated-design.md）经 grep 无房间画布 watcher 表述，无需 touched。附录 A.1 随批登记本 spec（标题计数随合并序对齐）。
