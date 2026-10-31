# 驾驶舱三区全量回归轮——房间列表竞态根治＋回归资产修复批（2026-10-31）

## 变更

Playwright 自动化回归覆盖三区（顶部栏及次级功能 / 日常工作区 /app 族 / IDE 工作区 /app/ide / 全流程推演 /app/sim*）全量页面与增删改查操作面后，本批落两类修复：

1. **产品修复（A 类，custom/）**：`custom/client/matrix-chat/stores/matrix-room.ts` 房间列表回填竞态根治。roomList 此前仅由事件总线（matrixEventBus.onRoomListChange）回填；matrix-room 模块是懒加载 chunk，晚于 matrix client 的 Sync 状态转换装载时，订阅前的 PREPARED/SYNCING 事件已被 `?.()` 静默吞掉，静默 homeserver 无后续房间事件 → roomList 恒空 → 深链房间页（#/app/s/room/:id）中栏停在「正在同步会话…」直至 15s watchdog 判不可达（2026-10-31 回归实录：7 次深链 4 次完全不挂载）。修复＝事件之外补两条主动快照：store 创建时 client 已在则立即快照；`watch(() => clientStore.client)` 后到位即快照。
2. **回归资产修复（scripts/regression/，测试工具面）**：
   - `walk-shell.mjs`：视图切换器/栏控 testid 更新至现名（`ia-workspace-ide` 等 / `ia-col-{left,center,right}-{max,popout}`；旧 `ia-view-toggle`/`ia-col-*-fold` 已随 2026-10-20 视图切换与 10-23 栏控统一轮退役），消除 6 条假缺陷；切换器步骤改真实点击（evaluate 合成点击在全脚本上下文偶发不触发路由——隔离复刻 3/3 过、脚本内 2/4 失败，同批二段修正）。
   - `daily-workbench-walkthrough.mjs`：B3 六阶段导航断言改 span 点击＋hash 校验（现渲染为非 `<a>`）；B4 语言往返改用 `ia-locale-toggle` testid（按钮文字定位误点）；E4 行内建卡提交改普通点击（`force:true` 在板面高频重渲染下打空＝零 POST 假红）；H2 检索关键词改「任务」（本环境语料无「看板」命中，检索功能本身通）＋结果断言兼容「全部N」计数格式。
   - `ide-workspace-verify.mjs`：抽屉/深链断言等窗从 8-12s 放宽到任务解析实测 P95（冷启动轮 20s）；文件树切根/Git 断言加 super_admin 前提——非 super_admin（admin 角色）走只读回落 storeRoot 不锚定任务根为设计内行为，无 token 时跳过该两项并在结果行标注 `skip(role)`。
   - `walk-writes.mjs`：登录通道加 matrix 桥接回落（admin:dev-bootstrap 口令在本环境不存在——用户库实态 walkadmin/swarm，swarm 无口令走 matrix-login 换 JWT）；建卡 assignee 从硬编码 `admin` 改为动态取板内 assignees 端点首项（assignee 域=profile 名而非 studio 用户名：填用户名 swarm 会被认领围栏按 profile 白名单正确 403——同批二段实录订正，硬编码属 dist 环境假设）。

## 决策记录

1. **房间列表竞态用「初始快照＋client watch」而非轮询**：轮询治标且引入常驻定时器；快照＋watch 与现有「SDK 事件驱动重快照」架构同构（roomList 本就是快照式 ref，注释明确「re-snapshot on SDK events」），两条主动快照只在 store 创建与 client 引用变化时触发，零常驻开销。
2. **403 available-models?profile=orchestrator 定性为设计内 fail-soft，不修**：App 全局 ProviderConfigurationPrompt 按网关 orchestrator profile 查询，swarm（admin）不在该 profile 白名单 → 服务端 403（users-store userCanAccessProfile 显式映射表）；客户端 `catch` 已 fail-soft（弹窗不出现），仅剩浏览器控制台网络噪声。放宽该端点权限＝削弱安全边界，拒绝。
3. **walk-writes 登录桥接只作回落不替换**：保留 WALK_LOGIN 口令通道（dist 验证环境 8655 仍用），口令失败才走 gateway-credentials＋matrix-login 桥接，两环境同一脚本可跑。
4. **并行上限处置**：开工时已有 3 个在途 worktree；`full-regression`（今晨、分支已合入 main、工作树 0 脏文件＝收口未清尾态）走 `git worktree remove` 释放槽位；`docs-aistudio-training-manual`（10-28、394 脏文件）超 24h 但有未提交工作，留待用户裁决不清理。
5. **本批不修项如实挂账**：六阶段侧栏条目为非链接元素（span，无键盘可达性）——现状设计（2026-10-17 旅程重构）不改，仅在本 spec 记录观察；IDE 深链任务解析 5-8s 延迟（跨板 detail-first 解析链）为性能观察项，功能正确。

## 验证

- 新增守门测试 `custom/client/matrix-chat/__tests__/matrix-room-initial-snapshot.test.ts`：①store 创建时 client 已在 → roomList 立即含 client.getRooms() 结果；②client 后到位（watch 路径）→ roomList 回填；③无 client → roomList 置空不炸。运行 `npx vitest run custom/client/matrix-chat/__tests__/matrix-room-initial-snapshot.test.ts`。
- 行为验证（活体）：修复分支起临时 vite（8651），深链房间页连续 8 轮全部挂载（修复前 4/7 卡死）；工单对照见交付说明。
- 脚本验证：`walk-shell.mjs`、`daily-workbench-walkthrough.mjs`、`ide-workspace-verify.mjs`、`walk-writes.mjs` 修复后全量复跑，台账 defect 清零（已知 fail-soft 噪声除外）。
- 回归面：三区全量复跑（shell/daily/ide/sim 四基线＋写回路＋推演交互 7 页）。

## 设计文档影响

DESIGN_SYNC: none——matrix-room 房间列表回填机制属 custom/client 实现细节，整合正本/数字总账无对应章节；本 spec 即该机制的事实记录。触及面经查不在正本登记范围（matrix-chat store 内部时序），无需同步。
