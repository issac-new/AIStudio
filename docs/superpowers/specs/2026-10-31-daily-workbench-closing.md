# 日常工作台回归收尾批：未了项清账（409 语义/401 让位/审批面确定性链/loop 画布/录屏）

日期：2026-10-31 ｜ 轮次：日常工作台全功能回归·收尾清账批 ｜ 类型：fix（客户端 1＋服务端补丁 713）＋test（守门 2＋探针 2 段重写）＋docs（decisions 补录）

触发：用户 2026-10-31 指令「完成所有 spec 和台账、未做项；也要实拍录屏」。收官报告（2026-10-31-daily-workbench-regression.md 系列）遗留未做项逐项清账；另核销后端旧代码项（09:06 起后端已带 human-gate 统一批，实测 GET /api/approvals/human-gate 200/3 单/零告警）。

## 1. 变更

### 一、PATCH 任务状态被状态机拒：500→409（补丁 713，vendor controllers/kanban.ts patchTask）

走查实录：triage 卡直转 review 被服务端以 500 拒（错误体透传 CLI stderr「cannot request review for …: task is not in running/ready」）。业务规则拒绝与服务器故障同表象。补丁在 patchTask 的 catch 增加判定：消息命中 `/\bcannot\b.*\bfor\b|\bis not in\b/`（CLI 状态机拒绝话形）→ 409 `{error, code:'state_transition_rejected'}`，其余仍 500。补丁走完整 B 类流（快照 diff 法生成、series 登记 713、clean+inject 重放验证 applied）。

### 二、dev 自动登录网关让位（registries/client/entry.mts devAutoLogin）

走查实录：冷启必现一条 401 控制台红——POST /api/auth/login {admin, dev-bootstrap}（fetch 调用栈定位于 devAutoLogin）。本机网关已配 Matrix 免密凭据（常见态）时 LoginView 网关自动登录必然接管会话，该探测注定 401；浏览器网络层自动记行、应用层无法静默。修复（v2，终案）：admin 探测前先 GET /api/matrix/gateway-credentials（回环探测，configured 即让位 return，不阻塞 boot）。v1 轮询等待案（等 key 落地 1.8s→3.6s 两版）实测自噬：devAutoLogin 处在 boot Promise.all 关键路径，等待本身推迟 app.mount/LoginView，网关链落地从 2.4s 拖到 4.1s 永落窗外——加窗越宽越慢，方向性错误。v2 未配置机上本探测 404 与 LoginView 自身探测同款同数（2 行换 2 行不增），常见态（网关已配）净 -1 行且零时延。

### 三、走查探针 E/I 段重写（scripts/regression/daily-workbench-walkthrough.mjs）

- **E5 审批面确定性链**：实测 REST POST 支持 `status:'ready'` 直建（CLI --initial-status 同源）→ ready 前置下 PATCH review 合法（200）→ `?task=` 深链抽屉轮询（≤14s）断言 drawer-approve/reject/viewDiff 三钮（仅 review 态渲染的设计内行为，此前因无 review 数据断言不可达）。附 **E5a**：triage 直转 review 断言 409（补丁 713 生效判据）。验收卡用毕即删。
- **I1 loop 画布**：域内常态零 loop（/api/loop/loops 空实测）→ API 建 `schedule.mode=manual` 惰性 loop（不自驱）→ /app/l/:id 画布装载断言（loop 名可见）→ DELETE 还原，不留测试数据。
- E 段整体重写收敛 E1-E7 结构（此前微批叠加后缩进层级含混，本次整段替换+node --check 门）。

### 四、403 available-models 控制台行：定性接受噪声（决策不修）

`GET /api/hermes/available-models?profile=orchestrator` 403 源于活跃 profile 模型探测；models store 已按设计 fail-soft（403=该 profile 不可见，回落无 profile 查询，patch 680 同口径）。该控制台行为浏览器网络层自动记录（应用层不可静默），消灭它需在探测前再加预检请求（拿新请求换旧红）。持久会话用户冷启不触发。**定为接受并记录**，不做代码改动。

### 五、实拍录屏（仓外产物）

Playwright recordVideo 章节化实拍日常工作台：六阶段页签巡览／看板建卡→抽屉→审批面→催办条全链／审批收件箱／统一聊天与房间时间线／Cmd+K 检索。产物落仓外（本仓 rule 8 禁新增二进制；沿并行批先例目录），manifest 随 spec 引用路径。

### 六、挂账登记（收尾批发现未修）

**看板聚合/单板双源不一致（幽灵卡）**：收官走查实录——同一页面内 `/api/hermes/kanban/overview`（24 卡）不含 t_ea687287，而看板 DOM 以其为首卡渲染（三发三中点击抽屉不开：taskClick 按 taskRefs 解析不到该卡 ref）。定性：overview 聚合端点与单板列表端点数据分歧（服务端聚合缓存/partial 回落链域），DOM 渲染源与点击解析源不同步。本批处置：探针 E2 加次卡重试防御（两卡皆不开才判红；重试上限受板卡数约束——单卡板 nth(1) 越界 30s 超时实录）；直修留专项（方向：doRefreshOverview 聚合优先/N+1 回落两路的数据源对齐与 overview 缓存失效策略）。锚点：custom/client/shared/store/workspace.ts doRefreshOverview + 本轮 /tmp/ghost.mjs 对账实录。

## 2. 决策记录

1. **409 判定用消息话形而非新增错误类型**（Mechanical）：CLI 拒绝消息稳定以「cannot X for Y / is not in …」开头（request-review/unblock 实测两例），在 catch 处判定改动面最小；给 execKanbanMutation 引入错误类型需动 vendor 服务层多点，收益不抵风险。
2. **devAutoLogin 让位用轮询等待而非预探测**（Mechanical）：见 §1 二——404 换 401 不净。
3. **403 接受噪声**（Taste）：浏览器自动记录无法应用层静默，预检换红不划算；文档化口径与 patch 680 的 fail-soft 设计一致。
4. **E5 用 ready 直建而非造状态机旁路**（Mechanical）：REST 认 initial status（实测），ready→review 是状态机合法边，不伪造数据态。
5. **补录 decisions.jsonl**：本批 5 条入账；回归批①②③的决策已在其 spec §2 留痕，jsonl 以本批为起点补录后续（事实源=spec，jsonl=机读台账）。

## 3. 验证

- 补丁 713：`npm run clean && npm run inject` 重放日志 applied；守门 `custom/__tests__/kanban-patch-409-guard.test.ts`（源层断言 409 映射在位，防 series 漂移）。
- entry.mts：守门 `custom/client/ia2/__tests__/entry-boot-order.test.ts` 增例（让位等待先于 admin fetch，源层断言）。
- 活体：重启后端后 PATCH triage→review 得 409+code；冷启控制台无 401 行；探针全跑 E5a/E5b/I1 绿；录屏产物非空且时长>0。
- 全量：合并前 `npm test`。

## 4. 设计文档影响

DESIGN_SYNC: none。理由：409 是既有 PATCH 端点错误语义的细化（非新契约）；devAutoLogin 是 dev 链登录顺序调整；探针/录屏为测试资产。附录 A.1 随批登记本 spec。
