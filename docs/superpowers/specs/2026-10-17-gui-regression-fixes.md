# SwarmStudio 全功能回归测试缺陷修复（2026-10-17）

- 轮次：GUI 全功能回归（matrix swarm 账号，vite 8649 热更新链路，IAB 浏览器真人模拟）
- 范围：六阶段导航/看板/IDE/搜索/通知/左栏/右抽屉/gov/sim 家族/bpa/ontology/skillgov/顶栏交互，约 40 个测试点
- 缺陷清单与截图证据：`/Users/cuishi/lab/ncwk/gui-test-screenshots/DEFECTS.md`

## 修复项

### D1 [P1] 退出登录后被 C2 自动登录立即拉回（patch 644）
- 现象：点「退出登录」→ token 被清（swarm→admin 新 iat 实证 reload 发生）→ LoginView 挂载即 autoLoginFromGateway 免密直入 gateway 账号 → 用户视角「退不掉」，手动登录表单不可达。
- 修复：登出路径（SidebarAccountControls.handleLogout / authStore.logout）写 `sessionStorage hermes_manual_logout` 标记；LoginView 检测到标记跳过 autoLoginFromGateway；matrix/local 手动登录成功后清除标记。新标签页不受影响（sessionStorage 会话域）。
- 验证：登出 → 登录页手动表单完整呈现 → swarm 账号 GUI 表单登录成功进入 #/app。

### D2 [P2] ledger 503 前端裸端点呈现 + 「读取中……」滞留
- 现象：ORGLOOP_LEDGER_TSV 未配置（服务端 fail-closed 503）时，④开发/⑥治理/清算签直接渲染 `/api/hermes/orgloop/ledger → 503`；ClearancePanel 错误行与「读取中……」并存（v-else-if="!ledger" 不看 loadError）。
- 修复：gatekeeper getJson 非 2xx 优先透出服务端 body.error（人话原因）；ClearancePanel 读取中条件改 `!ledger && !loadError`。
- 验证：治理页显示「清偿台账未配置（ORGLOOP_LEDGER_TSV 缺席=fail-closed）」，无裸端点、无滞留。

### D4 [P2] sitpanel 无 ARIA 语义（自动化与读屏双盲区）
- 现象：cockpit-top__sitpanel 为纯 div（无 role），态势徽章无 aria-expanded——ARIA 快照不可见，测试与辅助技术均为盲区（本轮实测曾致误判）。
- 修复：容器补 role=dialog + aria-modal + data-testid；遮罩补 aria-hidden；SitlineBar 两徽章补 :aria-expanded。
- 验证：dialog 节点入 ARIA 树（含完整任务列内容）；aria-expanded false→true 翻转正确。

### 不修项（如实记录）
- D3 看板双链归属不一致：CLI 单板链 default 板读 `boards/default/` 历史残根库（9 任务）而非根库（122 任务）；聚合快道口径正确（终态「全部」视图 done=1004 实证）。残根目录清理涉及宿主数据裁决，挂账待用户拍板。
- 插件/模型/hermes 看板加载 5-9s：目录扫描与数据量所致，非缺陷。
- vite ws proxy EPIPE 后 HTTP 代理同死：dev 工具链稳定性，重启恢复。

## 决策记录

- 2026-10-17 用户指令「swarm studio 的所有功能都做一下回归测试……摸排bug缺陷并进行修复」授权本轮测试+修复。
- D1 修复选 sessionStorage 一次性闸门而非移除 C2 自动登录：保留 dev 形态免密便利（新标签页照常自动登录），仅在本标签页刚手动登出时回落表单——业界标准 logout 语义。
- D3 不清 `boards/default/` 残根目录：数据删除类操作风险大于收益，留用户裁决（AGENTS.md 删除类纪律：先存档再删，可回滚优先）。
- 测试身份用 swarm（@swarm:matrix.test）：用户指定；会话经服务端正规登录链预置（synapse 密码登录→/api/auth/matrix-login 换 JWT），因当时 C2 自动登录挡住手动表单（D1 修复后此预置不再必要）。
