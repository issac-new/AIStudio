# 厂商公告通道关闭（nodejs Brotli 安全通知下线）

- 日期：2026-10-25
- 状态：已落地（本轮）
- 来源：用户指示「我已经升级 nodejs 了 这个安全通知删掉吧」
- 关联正本：`custom/server/studio/announcement-filter.ts`（2026-09-22 版本感知过滤轮建立）

## 变更

客户端「安全通知」弹窗（nodejs Brotli 高危漏洞通告）来自厂商远程公告 API（`api.ekkostudio.xyz/api/studio/announcements`），由服务端 `/api/studio/announcements` 代理拉取、`StudioAnnouncementPrompt.vue` 展示；「知道了」仅在本浏览器按条目记忆，厂商更新时间戳后仍会再弹。本轮在该链路的 overlay 唯一收口点 `announcement-filter.ts` 加**通道开关**：缺省把下发 list 全量拦空（所有浏览器、所有账号零弹窗），`HERMES_STUDIO_ANNOUNCEMENTS=1` 显式恢复厂商通道（恢复后回到既有版本感知过滤行为）。

## 决策记录

- **D1 收口点选 overlay 过滤器而非三处替代**：①不点客户端组件（vendor 代码需新补丁，且只影响改过的构建）；②不点 vendor 服务 `fetchStudioAnnouncements`（vendor 正身须走补丁通道，而 overlay 已有同链路收口点）；③不用「知道了」本地记忆（按浏览器、厂商 bump updateTime 即复发）。过滤器是控制器下发前最后一步，一处生效于全部客户端。
- **D2 缺省关 + env 恢复（删除类可回滚）**：用户明确指示删除；SwarmStudio 为自托管形态，厂商面向其云端/桌面发行版的公告（含安全通告）与本部署相关性低。开关缺省关，`HERMES_STUDIO_ANNOUNCEMENTS=1` 可整通道恢复——未来若想重新接收厂商通告（如上游大版本发布）设 env 即可，无需改码。
- **D3 拦截面=全量 list**：含无版本号的维护/安全通告（Brotli 通知正是无版本号形态，版本感知过滤对它无效——这是它此前反复弹出的根因）；`ok/platform` 等协议字段原样透传，客户端拿空列表走静默分支零弹窗。
- **D4 服务端拉取与 TTL 缓存行为不变**：仍按 5 分钟 TTL 拉取厂商接口（既有 perf 补丁行为），仅响应面前拦空——不改 vendor 服务零补丁面。

## 验证

- `npx vitest run custom/server/__tests__/announcement-filter.test.ts`（既有版本感知用例全部改挂 env 开启态；新增缺省拦空/恢复两用例）
- 活体：合入后 serve-main 换新 tip 重启 8647，`GET /api/studio/announcements?locale=zh-CN` 应回 `list:[]`；8649 页面无安全通知弹窗（结果回填于下）。

## 验证结果（2026-10-25 收口实测）

- 守门测试 11/11 绿（既有版本感知 9 用例改挂 env 开启态保原行为 + 新增缺省拦空/恢复 2 用例）。
- 合入 main（merge 2d8d24e06）并换装 serve-main 重启 8647：`GET /api/studio/announcements?locale=zh-CN` 在 8647 直连与 8649 代理两路均回 `{"ok":true,"platform":"desktop","list":[],"serverTime":…}`。
- 浏览器实证：清除「已读记忆」localStorage 后整页复载 8649——安全通知/Brotli/知道了 三标记全不在页面（服务端拦空生效，非本地记忆压制），应用正常加载。
