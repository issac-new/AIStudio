# 活体验证收案批：G5 收件箱 hgate 路由根治＋dimensions 路由白名单同步＋三面实拍录屏（未做项清零）

日期：2026-10-31 ｜ 类型：fix（产品正身两件）＋docs（活体验证收案）＋运行态验证（SIM 8802 实拍录屏）

触发：用户令「完成所有 spec 和台账、未做项；也要实拍录屏」——对三批 spec 的全部「活体验证待 run24」欠条与 2026-10-30 产品能力批 §3.4 两项未验证（界面走查／真实进程调 dimensions API）当场兑现；实拍过程抓出两处真缺陷当场根治。

## 1. 变更

### 一、收件箱 decide 补 hgate 路由（活体抓出的 strict 真人链断点，根治）

- **发现链**：驱动注册 human-gate 批准单（收件箱可见）→ UI 点「批准」→ 历史无记录（回落驱动 decide 才落账）→ 源码定位：`pending-controller.ts` decide 端点前缀路由表（enf/fleet/mx/fleetfile/kanban/review）无 `hgate:` 分支——human-gate 批准单被投进收件箱（`listHumanGatePending`）却无法经 UI 裁决，落 400「id 前缀须为 fleet: 或 review:」。**这是 strict 姿态真人链在产品面的断点（L3「人在回路」要害）**，单测直调 human-gate store 侧从未暴露（路由层盲区）。
- **修法**：decide 端点增 `hgate:` 分支——校验 approve|reject → 调 human-gate 权威 `decide()`（appendApprovalLog＋HUMAN_GATE_EVENTS 同源）→ 404「批准单不存在或已裁决」幂等语义；T2 choice_required 400 透传。尾行错误文案同步列 hgate:。
- **测试**：`pending-controller.test.ts` 增 HTTP 级用例（真 koa+路由+store+history）：pending 可见→UI 同款端点裁决 200→历史含 targetId→二次裁决 404→非法决策词 400。15/15 绿。

### 二、dimensions 路由白名单同步（收尾批盲区，根治）

- **发现链**：活体 `POST /sets/:id/dimensions {backfill:'enterprise-seed'}` → 400「backfill 只接受 'redteam-seed'」——收尾批只扩了 store.ts 的 backfill 联合类型，**controller 路由层另有一份白名单先拦**；单测直调 `labelSetDimensions` 绕过路由层故全绿。教训入册：**两端词表必须同批同步，路由层校验是独立执法面**。
- **修法**：controller 校验与注释同步接受 `'redteam-seed' | 'enterprise-seed'`；活体复验通过（见验证节⑤）。

### 三、活体验证与实拍录屏（未做项清零）

环境：SIM studio 8802（主树注入 710 后重建部署 client＋server，`client.bak-live710`/`server.bak-live710` 备份在位；studio 两跳重启经 mx-lib `ensure_studio_up` 同款 env）。证据目录=`SIM_ROOT/evidence/live-verify-20261031/`（37 件：14+ 截图＋6 段录屏 webm＋逐轮结果 txt）。五轮迭代（v1-v5+终针）全部留档：

| # | 未做项（来源 spec） | 活体结论 | 证据 |
| --- | --- | --- | --- |
| 1 | G5 三函数活体（收尾批边界） | **PASS**：驱动真函数×真 8802——注册（id=hgate:…）→decide 200→历史含 targetId→decide 前探测正确落单（issues.log 1 行） | `live-verify-results.txt`/`hg-request-id.txt`/录屏 |
| 2 | 补丁 710 活体 | **PASS**：受控降级回包（route mock `{"ok":false}` 命中）重载后零 rooms.length TypeError（v1/v4 双轮）；正常路径时间线挂载 48 内容行零错 | `group-timeline-v4-degraded.png`/`group-timeline-v5.png` |
| 3 | 群时间线挂载（并行批 sortedRooms 修复同树验证） | **PASS**：v5 实拍消息时间线挂载（48 行）零 length 错 | `group-timeline-v5.png`/录屏 |
| 4 | 真实进程调 dimensions API（2026-10-30 §3.4） | **PASS**：企业集回填 0/9→**9/9**，分布=privilege_injection×3/long_task_state×3/human_escalation×1/unclassified×2（与裁定口径逐维一致） | `eval-coverage-v4-after-backfill.png`/`live-verify-v4-results.txt` |
| 5 | 界面走查（2026-10-30 §3.4） | **PASS**：收件箱呈现 human-gate 批准单（前置批准区+待审区 6 条 LIVE-VERIFY 实拍）＋每单绿色「批准」按钮在位；覆盖面板 metrics 页签呈现维度读数 | `inbox-v5-pending.png`/`sidebar-inbox-badge.png` |
| 6 | UI 点击裁决端到端 | **单测层全证+截图双证，自动化点击未稳定捕获**：收件箱 pending 面板首拉存在间歇（同环境时有时无，F4 挂账），el.click 终针轮面板未出；路由+store+history 已由 HTTP 级测试 15/15 覆盖，UI 面呈现有实拍 | `live-verify-v6-results.txt`（如实 FAIL） |

### 四、活体观察项（挂账，非本批范围）

- **F4 收件箱 pending 面板加载间歇**：同会话多轮加载，LIVE-VERIFY 单时现时不现（ApprovalPanel 首拉/轮询时序？）——影响 ② 自动化点击与采集帧稳定性，另批排查（帧采集侧先按 capture-plan 注：等 8s+）。
- **F5 stage/build?tab=approvals 主区空壳**：URL 带页签进入时主区仅 294 字符（侧栏正常）——stage 页签 query 路径渲染异常，与 F4 可能同族，另批。
- **F6 群房间首进「会话不可达或未加入」**：matrix 在册但 client 会话列表未同步到时出现，页内「重试同步」按钮可自愈（v5 即经此路径挂载成功）——自愈在位，观察项。
- 台账面：本批无新 run 台账动作；run23 双检查维持绿（上批已清）。

## 2. 决策记录

- **D1 hgate 路由走权威 decide 复用**：不另写落账——human-gate store 的 `decide()` 单函数三落点（store/history/HUMAN_GATE_EVENTS）是单一事实源，路由分支只做校验与转发。
- **D2 UI 点击收案的证据标准**：路由语义=HTTP 级测试（真 koa）全证；UI 呈现=实拍截图证；唯浏览器自动点击受 F4 间歇所阻——不以「点不到」否定「链路通」，也不把「单测过」冒充「UI 点击过」，三层证据分列如实呈现。
- **D3 capture-plan ready_inbox 保持 /app/inbox**：v5 经侧栏入口实拍确认 /app/inbox 即真路由（一度误改 stage 页签，本轮复核后回滚）；注释补面板间歇的采集时序提示。
- **D4 SIM 运行态数据留痕**：live-verify 合成批准单（v1-v4）与回填后的 eset-003 留在 SIM 运行态作为验证证据，不清除（非归档 run 数据；下一轮 mx-clean 自然归档）。
- **D5 服务重启走 mx-lib 同款 env**：`ensure_studio_up` 单一事实源（看守人只接管了一次，第二跳手工同款拉起——env 逐字同源，pid 34630）。

## 3. 验证

- `npx vitest run custom/server/approval-inbox/__tests__/pending-controller.test.ts` → **15/15**（含新增 hgate HTTP 用例）。
- `npx vitest run custom/server/eval custom/client/hermes custom/__tests__/patches-series-guard.test.ts` → 全绿（controller 白名单同步无回归）。
- 活体五轮结果文件＋14 截图＋6 录屏落 `SIM_ROOT/evidence/live-verify-20261031/`（37 件）。
- `bash -n` aipay-scenario.sh 过；run-gates sh 段零 FAIL。
- studio 8802 双跳重启后 `/health/ready` 实测 ready；`curl` 探 hgate 路由 404 语义正确（新 bundle 在位实证）。
- （合并前回填实测输出）

## 4. 设计文档影响

DESIGN_SYNC: none——路由补齐是 §2.6.8 消费纪律 6（0a83fb67e 已立）的执行件；dimensions 白名单同步是收尾批映射的执行面；无契约/阈值/口径变更。F4-F6 观察项入本 spec 待另批。
