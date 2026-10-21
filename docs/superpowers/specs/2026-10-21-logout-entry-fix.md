# 设置面板补登出入口（2026-10-21 立查立改）

> 背景：swarm 账号登录走查时发现全 UI 无可达登出入口——旧 `SidebarAccountControls`
> 的登出键随 `PageSidebarFooter` 挂载页（HistoryView/WorkflowView 页脚）在早年
> 补丁中退役，0.7.38 重建后无任何渲染点；浏览器会话只能靠手清存储退出。
> 用户裁定：是缺陷，立刻修复。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 登出行落设置侧栏（账号徽标打开的面板）底部恒显 | 账号徽标是当前 IA 壳层的账户入口心智位；底部页脚形态承接旧侧栏交互惯例，不新增页面 |
| D2 | 登出语义逐行复刻原 SidebarAccountControls.handleLogout | 清主题背景缓存→设 `hermes_manual_logout` 闸门（防网关自动登录拉回）→`localStorage.clear()`→整页重载回登录页；不发明新语义 |
| D3 | 文案用既有词表键 `sidebar.logout`（零新增 i18n） | 键在上游词表长期在档（中=退出登录）；与组件「直书文案仅限品牌名」的既定规约一致 |
| D4 | 守门测试断言渲染恒在+闸门+凭据清空；重载副作用不入单测 | jsdom 的 `location.reload` 不可 spy（non-configurable）；语义核心是闸门与凭据，重载只是落地动作 |

## 验证

- `ia-settings-sidebar.test.ts` 6/6（含新登出用例）。
- 活体：8649 浏览器点账号徽标→面板底部「退出登录」→回登录页→可再以 swarm 登录。
