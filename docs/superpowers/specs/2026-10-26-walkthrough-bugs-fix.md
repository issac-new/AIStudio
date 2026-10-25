# 2026-10-26 重启走查三缺陷修复（i18n 两族缺键 + clusterinspector 归档目录噪音）

## 变更

2026-10-26 重启双端（8647/8649）后全量走查：121 次路由访问（89 顶层 + 32 修正前缀复扫）、20 个数据密集页 API 状态采集（零 4xx/5xx）、3 项交互抽检（看板卡抽屉/搜索/IDE 工作区）全部通过。识别 3 项缺陷并随批修复：

1. **`ia2.flow` 六键缺失（zh+en）**——508 号补丁（ia2.flow 六键：chatSection/newChat/newAgentChat/newGroupChat/newMatrixRoom/deleteGroup）在 series 中被临时跳过（series:326，473 跳过后 locale 基线失配），注释承诺的「末批键合并统一迁移」从未落地。首轮活体验证在消掉 newChat 告警后揭出同族 chatSection 告警，全族对账（组件用键 vs 语言包在键）确认：现用三处 `ia2.flow.chatSection`（FlowNavPanel.vue:141，无兜底）、`ia2.flow.deleteGroup`（:272 tooltip，无兜底）、`ia2.flow.newGroupChat`（WorkbenchView.vue:794 抽屉标题，无兜底）会在对应交互态裸显键名；newChat（FlowNavPanel.vue:341）有内联兜底只发告警。修复：补丁 689 整族清偿六键——newChat 取组件兜底文案「新建聊天/New chat」，其余五键逐字取 508 原文（聊天/Agent 单聊/Agent 群聊/Matrix 房间/删除群聊）。
2. **`ide.landing` 五键族缺失（zh+en）**——IdeLandingHero.vue 全部五处 t() 调用（title/sub/empty/board/enter，行 23/24/39/41/44）从未注册，逐次活体验证逐键揭出（告警相互掩盖，title/sub 修复后 empty 显形）。修复：五键全族入 locale——zh 取组件内联兜底逐字，en 配套翻译。附带对账结论：IDE 域其余 ~50 个 `ide.*` 键（git.*/terminal.*/briefing.engine* 等）走 IDE_LOCAL_TEXT 本地字典、有意不进上游 locale（sidepane-tabs-i18n.test.ts:31 立法），静态 grep 命中属误报，控制台零告警佐证，不动。
3. **clusterinspector expectedWorkCards 采集把归档目录当板扫**——`~/.hermes/kanban/boards/` 下的 `_archive`/`_archived` 是带时间戳副本的归档容器（kanban.db 为 0 字节空文件），collectors 枚举时按「一切子目录=板」处理，每轮巡检 console.error「no such table: tasks」。修复：cluster-inspector-controller.ts 板枚举过滤 `_` 前缀目录（归档/系统容器约定），消除每 tick 噪音与两次空 DB 打开。

走查中证伪的项（非缺陷，记录备查）：/hermes/browser 在 web 态 404=上游桌面桥条件注册的桌面专属设计（ia2/routes.ts:495）；/app/collab 与 /app/s/chat 空态为合法首次使用态；30 条裸路径（sim/gov/accounts…）为 /app 相对子路由，正确 URL 带 /app 前缀。

## 决策记录

- **补丁号 689**：现役最高 688（686/687/688 已占），689 未被占（创建时 series 与 patches/ 目录核验）。单补丁同修两族 i18n 键，避免两号双撞风险；clusterinspector 属 custom/server 正身，不走补丁。
- **只补 zh/en 两语言**：遵循 series:324 既有立法「ia2.flow 六键 zh/en 成对」——其余 9 语言按上游缺键回落 en 的兜底链处理，不为走查告警扩面。
- **文案取组件内联兜底**：ide.landing 二键文案逐字取 IdeLandingHero.vue 既有 fallback，保证修复前后显示零变化（本修复只消告警与治理裸键，不改任何用户可见文案——ia2.flow.newChat 例外：508 号原意「新建聊天/新 chat」与现兜底「新建聊天/New chat」一致，逐字对齐）。
- **clusterinspector 过滤规则用 `_` 前缀**：现网仅 _archive/_archived 两容器且均为 `_` 前缀；按前缀过滤比按名字黑名单稳（未来新增归档容器自动覆盖）。data/ 等无 `_` 前缀目录不受影响（实测 26 板仅此二者失败）。

## 验证

- 守门（worktree 实测）：`npx vitest run custom/client/__tests__/i18n-message-compile-gate.test.ts custom/client/__tests__/ia2-i18n-coverage.test.ts` 3/3 绿；`cluster-inspector.test.ts` 39 过 + 1 跳（.real 环境门，既有行为）；i18n-upstream-keys-gate 3 跳（条件门，既有行为）。
- 补丁可应用性（worktree 实测）：vendor 重置 pristine → 取 serve-main 注入态 zh.ts/en.ts 为基线 → `git apply --check --directory=vendor/hermes-studio` 689 号通过 → 应用后 zh/en 二十二键（ia2.flow 六键×2 语言、landing 五键×2 语言）全部在位。
- serve-main 活体复验：差量补套 689 + clusterinspector 热更后，/ide、/app/collab 控制台 intlify 告警清零、后端日志 clusterinspector 行不再出现 `_archive` 失败（随批回填）。
- 回归面：修复点+相邻路径（locale 编译门、ia2 覆盖门、clusterinspector 全套检测器测试）。

## 挂账（本轮发现、不在本轮修）

- **clean 反放残留**：worktree 全清（inject --clean）后仍有 21 个 vendor 文件脏（auth.ts/users-store.ts/desktop 三件/locale 九件等，多补丁累积触碰面），inject 因脏拒绝重放。本轮走「pristine+差量补套」通道完成验证；clean→inject 全净态重放在 0.7.39 基线上的可复现性缺口待专项清偿。
