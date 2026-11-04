# Windows 离线回归 P1 修复批（files 403 提示 / 外部端点超时治理 / locked-ips 权限说明 / 回归判定口径固化）

来源：2026-11-04 Windows 10.0.19042 离线环境全功能回归（65 路由 + 49 API）最终报告。报告定谳 P0=无、真实功能缺陷 0，遗留 P1 四项，本批全量落地；P2 性能与 Windows 本地脚本项挂账（见 `2026-11-04-win-regression-pending-batch.md`）。

## 变更

### A. 服务端补丁（743-745，改 vendor 走 patches/）

1. `743-server-announcements-offline-hardening.patch`
   - `services/notifications/announcements.ts`：外部公告拉取超时 `AbortSignal.timeout(10_000) → 6_000`。
   - `controllers/announcements.ts`（续作补丁 531 的 TTL 缓存）：新增**失败负缓存 60s**——离线环境首次失败后 60s 内直接回 502，不再每次等满超时；成功缓存仍 5min；502 响应体 `{ ok:false, error:'announcement_fetch_failed' }` 结构不变。
2. `744-server-preview-tags-timeout.patch`
   - `services/update/version-preview-manager.ts`：`git ls-remote` 超时 `8_000 → 4_000`、GitHub API `AbortSignal.timeout(15_000) → 6_000`（原两级串行叠加即回归实测 20.9s 的根因）；tags 拉取失败**负缓存 60s**，离线时 version-preview 页不再长时间 PageLoading 遮挡。
3. `745-server-petdex-offline-hardening.patch`
   - `controllers/petdex.ts`：manifest 补 try/catch，失败返回 `502 { ok:false, error:'petdex_fetch_failed' }`（消灭原裸 500 纯文本、无 JSON 体的缺陷）。
   - `services/pets/petdex.ts`：`FETCH_TIMEOUT_MS 15_000 → 6_000` + 失败负缓存 60s（成功仍 5min，`?force=1` 仍绕过缓存）。

### B. 客户端补丁（746-748）

4. `746-client-files-open-permission-hint.patch`
   - `FileList.vue` 双击与铅笔按钮、`FilesView.vue` `?file=` 深链的 `openEditor` 链加 catch：403 时明确提示「打开文件需要超级管理员权限」（新增 i18n 键 zh/en），消除 admin 点文件静默无操作——回归唯一用户可感知缺陷。
   - **不放开服务端 `files/read` 权限**（见决策 D1）。
5. `747-client-accountsettings-lockedips-permission-note.patch`
   - `AccountSettings.vue` `loadLockedIps` 捕获 403（经 `API Error 403` 消息识别）置 `locksForbidden` 态：403 时显示「仅超级管理员可查看锁定 IP」权限说明，替换误导性的「0 个 IP 被锁定 / 暂无锁定 IP + 重试」；非 403 失败保留重试按钮。
6. `748-client-petdex-offline-ux.patch`
   - `PetdexView.vue` 错误分支显示离线友好文案（离线或宠物清单服务不可达）；error 态隐藏误导性「没有符合当前筛选的宠物」空态与筛选行。

### C. custom/ 直改

- `custom/client/ide/views/IdeFilesPane.vue`：`openEntry → openPreview` 链加 catch，403 复用该组件既有「需要管理员权限…重试不会改变权限」降级文案模式；对应测试补失败态断言。
- `custom/client/ia2/routes.ts`：`/hermes/petdex` 路由挂 `features.pet` 门（关闭时深链重定向，不挂 PetdexView、不发 manifest 外部请求），仿 gov-settings-registry 既有 featureGate 模式。

### D. 回归判定口径固化（scripts/regression/）

- `route-manifest.ts`：新增 `EXPECT_BY_NAME` 映射（仿 `CANONICAL_PAGES`），路由条目携带 `expect: ('roleGate'|'failClosed'|'negative404'|'offline')[]`。
- `walk-routes.mjs`：失败请求白名单链加 per-visit 分支（与既有 9 类 URL 模式并联，全局模式保留）；权限回退分支泛化到 `visit.expect`。
- 新增 `scripts/regression/api-expected.mjs`：URL→expected 分类表 + `judgeApi()` 判定函数，口径=回归报告九章（expected：角色门 401/403、fail-closed 503、负向 404、离线外部 5xx；FAIL：非预期 5xx/空白/崩溃；WARN：可达但 >5s 或文案不友好）；`api-probe.mjs` 接入输出判定行。该模块零依赖，Windows 侧回归脚本可直接复制复用。
- `route-manifest.test.ts` 补 expect 枚举合法性断言；新增 `api-expected.test.mjs`（判定函数纯函数测试）。

## 决策记录

- **D1 files/read 保持 super_admin 门禁，只修 UX**（报告六-1 二选一）：实测被拦的正是 `security.yaml` 这类敏感配置，403 属安全边界正常工作；放开 read 给 admin 违反仓规「不削弱既有安全边界」。选项②（显式提示+保持门禁）落地。
- **D2 超时取值**：announcements 6s、preview-tags git 4s + API 6s（总上限 ~10s）、petdex 6s，均在报告建议 5-8s 窗内；**失败负缓存统一 60s**（成功缓存维持既有 5min），理由：离线环境 60s 内重复请求不再等满超时，且不长时间掩盖恢复后的网络。常量就地定义（与 vendor 既有 `AbortSignal.timeout` 惯例一致），单一事实源=本 spec 决策段。
- **D3 petdex 失败状态码用 502**（上游网关类失败语义）+ JSON 体 `{ok:false,error:'petdex_fetch_failed'}`，与 announcements 502 形态对齐；不引入新 code 字典。
- **D4 回归口径固化落本仓而非 Windows 本地脚本**：`E:\AIS\regression` 脚本不在仓内无法直接改；本仓 walk-routes 已有 9 类白名单等价物，按报告口径补 per-route expect 声明面 + 新增 API 判定模块，Windows 侧复制 `api-expected.mjs` 即可对齐。
- **D5 P2 性能项与 Windows 本地脚本项挂账**（pending-batch N01 起），本批不做：Monaco 首挂/journey 剖析/骨架屏/pageLoading 上限属独立性能专项；GBK 编码、opaque-origin 采集过滤等只影响 Windows 采集脚本自身。

## 验证

实测（2026-11-04 本轮真实采集）：

- 目标测试全绿：`npx vitest run custom/__tests__/win-regression-patches-guard.test.ts custom/__tests__/patches-series-guard.test.ts custom/__tests__/docs-ssot-guard.test.ts scripts/regression/api-expected.test.ts scripts/regression/route-manifest.test.ts custom/client/ide/__tests__/files-pane-perm-fallback.test.ts` → **6 文件 33 用例全过**（含 guard 断言 `petdex_fetch_failed`/`6_000` 超时常量/`locksForbidden`/`petdex.offline` 存在于注入后 vendor 树、api-expected 十项判定口径、route-manifest expect 枚举合法性、files-pane 5 例含 openEntry 403/非 403 失败态）。
- 注入回路：vendor 重置 pristine → `npm run inject` **452 枚全量重放干净**（446 既有＋743-748 新增全部 applied，尾行 `[inject] done`）；重放态树上复跑目标测试仍 33/33。
- 合并前全量 `npm test`（结果见合并说明）。
- 未验证项（如实声明）：① 离线端点（api.ekkostudio.xyz / GitHub / assets.petdex.dev）运行时失败路径未在本机模拟（需断网/域名阻断），以 guard 测试＋代码评审覆盖；② UI 三面（files 403 提示 / settings 权限说明 / petdex 深链门）未做浏览器活体走查——组件级行为由 files-pane 测试覆盖，vendor 组件改动由补丁标记 guard 覆盖，待下轮全功能回归活体复核。

## 设计文档影响

DESIGN_SYNC: none。理由：本批不改对外契约、路由表、阈值定义面与数据格式——失败负缓存与超时常量为端点内部实现细节（值记入本 spec 决策段 D2 作为事实源）；files/read 权限模型不变（仅补提示）；api-expected 为测试工装不入产品面文档。
