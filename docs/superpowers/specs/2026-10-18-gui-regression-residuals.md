# 回归轮残留与观察项收尾（2026-10-18）

- 上游正本：`2026-10-17-gui-regression-round2.md`（本轮收尾其 §三/§五 残留清单）
- 环境：vite 8649 + serve 8647（源码树）；swarm（@swarm:matrix.test，role=admin）

## 修复项

### R1 仿真「分支交付」503（SIM_BRANCHES_REPO 缺省）
- `serve-server.mjs`：OBS_SIM_ROOT 设定后，若 `<SIM_ROOT>/central/aipaydev` 存在则缺省填 `SIM_BRANCHES_REPO` 与 `SIM_ANCHOR_REPO`（中央仓 = 分支新鲜度与 commit 锚共用仓；mx-clean/mx-prelaunch-check 同一路径事实源）。显式 env 尊重不动；目录缺席仍 fail-closed。
- 复验目标：`GET /api/hermes/sim/branches?run=…` 200；运行总览「分支交付」区出数据。
- 注：dispatcher-health / sleeping-workers 两端点在 dev 保持 503——正身 CLI 子命令只随 SIM agent 快照存在（host `hermes kanban` 无 sleeping-workers，实测），属产品 fail-closed 语义，不改。

### R2 /matrix 首屏空列表误导 + mautrix 定性
- 复核：swarm 在 synapse 实有 1 已加入房间（joined_rooms API 实查）；页面能列出并进入房间（7 条系统事件渲染）。此前「暂无房间」为首屏同步未完成时截图过早。
- 修复：`MatrixRoomList` 同步中（syncState 未达 PREPARED/SYNCING）且列表为空时显示「正在同步房间…」（新词条 `matrixChat.syncing` zh/en，patch 653），不再一片空白。
- mautrix 定性：23:23 的 `No module named 'mautrix'` 来自**装机版 SwarmStudio.app** 的 dist server（pid 17712）cron 投递，非 dev 链路；host venv（~/.hermes/hermes-agent/.venv）`import mautrix` 实测通过，当前日志无复发。不在 overlay 修。

### R3 插件页后端警告直出（patch 652）
- 根因：plugins service 把 CLI stderr 整段并入 `warnings`，页面逐条渲染成横幅；其中两条是已知无害噪音（更新器横幅 `→ Restarting gateway…`/`⚠ Paused gateway…`；manifest kind 未识别兜底告警 `unknown kind … treating as 'standalone'`——加载器已按 standalone 正常处理）。
- 修复：按行过滤这三类后并入；真错误（traceback 等）原样保留。

### R4 仿真锚点抽屉常驻 0×0 role=dialog
- `SimAnchorDrawer` 改为 `v-if="open"` 关闭即卸载（原 aria-hidden 不足以出 ARIA 树）；收起动画退役换语义洁净。sim-atoms 守门同步改为「关闭态不存在」。

### R5 英文在线明细单复数（'1 people · 1 machines'）
- SitlineBar/SitDetailPanel 英文 locale 下按各计数变形（1 person/2 people…）；中文走原词条。测试环境 i18n mock 无 locale 的防御式读取。

### R6 在线徽章「看得见点不开」
- 实证：页头六阶段导航占 487px 后态势胶囊被压到 179px，在线 chip（171px 宽）右半被胶囊 overflow 裁掉，可点区只剩 32px 圆点段；点击中段落在页头空白上。
- 修复：`.sit` 设 `container-type: inline-size` + `@container (max-width: 340px)` 收起 `.sit__sm` 副注文本——chip 本体完整可点，明细保留在 title 悬浮与展开面板。

### R7 IDE 深链空简报抽屉盖住右栏页签
- 根因：`?task=` 直达自动开抽屉；任务 404/全板无此卡时空抽屉常开（z-index 90）盖住右栏「查看文件/Git」页签。
- 修复：跨板解析完成仍无任务（briefingMiss）时自动收起；解析慢期间仍保持展开（原「不因解析慢而收起」语义不变）；手动经导轨钮打开的空态不受影响。新增守门测试。

### R8 旧看板性能复测（空载）
- 见验证节实测；并发 10 agent 时的 16s 定性为负载态，非本轮缺陷。

## 决策记录

- R1 与 OBS_SIM_ROOT 同策略：dev 启动脚本给「工作区内置事实源」缺省，生产缺席 fail-closed 不变。
- R3 过滤而非修 manifest：lcm 插件 manifest 在 host 安装树（~/.hermes），overlay 不越界改宿主；且 unknown-kind 告警是上游 CLI 的兜底行为，按行为降噪即可。
- R6 容器查询而非重排页头：页头各簇（六阶段导航/搜索/用户）都有产品语义，重排牵连广；容器查询把挤压自适应收敛在态势条内部，窄时只牺牲副注文本。
- R7 只对「深链 + 确认无任务」收起：区分解析慢（保持开）与任务不存在（收起），不动手动开合权。
### 二修（2026-10-18 同日）：R6 容器查询方案撤换
- 初版 `container-type: inline-size` 实测触发 size containment——态势条固有宽塌 0、胶囊缩至 6px、chip 溢出被页头后续按钮（changelog/日程）盖住不可点，属修复引入的回归。
- 改为 `@media (max-width: 1439px)` 收起 `.sit__sm` 副注（视口媒体查询零尺寸副作用）；≥1440 视口页头有余量显全明细。sitline/header 测试 10/10。
- 三修（同日）：媒体查询挡不住**按语言**的 chip 宽度漂移（EN 态 Tasks/Online chip 更宽，1280 视口复现半裁不可点）。根治=`.cockpit-top__sit` 改 `flex-shrink: 0`（胶囊永不半裁），挤压由搜索框（shrink 2/min 120）与 spacer 吸收；媒体查询保留为 ≥1440 显全明细的开关。
- R7 提速（同日二修）：GUI 实测 ghost 深链要等逐板 listTasks 串行 CLI（16 板近分钟）才收起——前置一发 `getTask(id)`（服务端快 404 闸毫秒级判死活），404 即收起；存在则走原逐板流程。两测试文件 mock 补 getTask，慢解析用例改为悬挂 Promise 验证「不因慢收起」。

### 追加（2026-10-18 晨）：R8 复测揪出的旧看板 403（patch 654）
- 现象：/hermes/kanban 多数重载弹全局「你没有权限访问该资源」且列表区空（叠加 kanban.db-wal 瞬时只读窗——宿主权限环境问题，chmod 后自愈）。
- 定位：临时 400 访问日志（用后即撤）实锤 `GET /api/hermes/kanban/search-sessions?task_id=…&profile=orchestrator → 403`。根因=canUseProfile 对空 user_profiles 集仍逐 profile 拒绝——477 的「空映射=admin 不限制」豁免只加在列表过滤，未覆盖 profile 定向读。
- 修复：654 补丁 canUseProfile 空集放行（`allowed.size === 0` 视为不限制），与 477 语义对齐。

## 验证（终态，2026-10-18 晨）

- 单测：sitline/ia-shell-header-sit 10/10、sim-atoms（关闭态改断言）、matrix-chat 全套 40/40、briefing-deeplink 4/4（含 R7 快判死）、briefing-cross-board 4/4；server tsc 0 错、client vue-tsc 0 错；clean→inject 全系列 000-654 RC=0。
- GUI 复验（swarm，重启 8647/8649 后）：
  - R1 ✓ branches 200（16 分支三态）；运行总览「分支交付（已推 origin feat）」区渲染（t150）。
  - R2 ✓ /matrix 房间列出并可进入（7 条系统事件）；同步中词条已入 locale（瞬态难截屏，代码路径+key 已验）。
  - R3 ✓ /api/hermes/plugins warnings=[]；页面无 unknown kind/重启横幅（t153）。
  - R4 ✓ 仿真页关闭态 role=dialog 计数 0（t150 期实测）。
  - R5 ✓ EN 面板头「1 person · 2 agents · 1 machine」（t152）。
  - R6 ✓ 在线徽章中点可点、面板展开在线树（zh/en 双语各验一次，t151/t152）。
  - R7 ✓ ghost 深链抽屉自动收起、Git 页签恢复可点（t154；并行会话再补 404-only 收紧 76f0546c）。
  - R8 定性：同机 10 个 SIM agent + SIM 网关共享 hermes CLI/看板库，/api/hermes/kanban 冷回源实测 ~7s（读缓存命中毫秒级）；旧看板页偶发长载为队列竞争，非代码缺陷。叠加发现并处置两件环境事：①~/.hermes/kanban.db-wal 瞬时只读（chmod 自愈）；②旧看板 403 toast=GlobalPendingActions 对跨 profile 任务检索 search-sessions?profile=… 被围栏拦截——按设计生效（swarm 仅映射 default），654 已把空映射集语义对齐；**待用户裁决**：swarm 作为主管账号是否应映射全部 agent profiles（账户配置项，未擅改）。
- 提交链：35598bba（七件套）→ 553c0833（R6 二修）→ 9c1ec3dd（R6 三修）→ ec197f54（R7 提速）→ 93268f5e（654）；均经 worktree 合入 main，worktree/分支已清。
