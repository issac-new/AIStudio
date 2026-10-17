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

## 验证

- 单测：sitline 5/5、ia-shell-header-sit、sim-atoms（关闭态改断言）、matrix-chat 全套 40/40、briefing-deeplink 新增 R7 用例 4/4、briefing-cross-board 3/3。
- 待 GUI 复验（重启 8647/8649 后）：branches 200、插件页无噪音横幅、EN 单复数、在线徽章开面板、深链 ghost 任务抽屉自收、sim 关闭态 dialog=0、/matrix 正常、旧看板空载耗时。
