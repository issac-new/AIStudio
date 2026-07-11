## SwarmStudio 1.3.2

修复 Windows 下三个高频问题:终端无法打开、CreationDate.ticks 被杀软拦截、关闭后频繁自启动并抢占前台,以及首页不是 AI协作中心。

### 本次修复

#### 1. 首页不是"AI协作中心"(路由不匹配)
- **根因**:桌面 `mainRouteUrl()` 加载 `/hermes/chat`,但 overlay patch 071 已把路由改为 `/hermes/cockpit`(CockpitView)为父路由、`chat` 为其子路由(完整路径 `/hermes/cockpit/chat`)。顶层 `/hermes/chat` 路径已不存在且无 catch-all 重定向 → 路由匹配失败 → 空白页。
- **修复(patch 128)**:`mainRouteUrl()` 改为返回 `/hermes/cockpit`,桌面首页直接加载 AI协作中心。

#### 2. 关闭后频繁自启动、最大化抢占前台
- **根因 A**:`notify-completion` 通知 click 无条件调用 `showMainWindow()`(restore + show + focus),即使窗口已可见也重复拉到前台。
- **根因 B**:Web UI 服务端子进程(`SwarmStudio.exe` 以 Node 模式运行)未 `detached`,被杀软 kill 时连带主进程退出 → Electron 判定崩溃 → `bootstrap()` 重启 → `showWindowWithFade` 再次显示窗口。
- **修复(patch 128 + 130)**:
  - 通知 click 仅在窗口隐藏/最小化时才 `showMainWindow()`,避免已在前台时重复抢占焦点。
  - Web UI 服务端 spawn 加 `detached: true` + `unref()`,独立生命周期,子进程被杀不影响主进程。

#### 3. CreationDate.ticks 频繁调用被杀软拦截
- **根因**:`collectWindowsProcessMetrics` 每次调用都 spawn `powershell.exe` 执行 `Get-CimInstance Win32_Process`(枚举全系统进程表)。触发源:
  - `PerformanceView.vue` 性能页 5 秒自动刷新 → `/api/hermes/performance/runtime` → `collectProcessMetrics`。
  - `app.ts` 30 秒健康轮询 → `/health` → hermes-agent `get_running_pid` → `psutil.Process(pid).create_time()`(Windows 底层即 WMI `CreationDate.Ticks`)。
  - 杀软把"高频枚举全进程 + 读取进程创建时间"判定为进程监控类恶意行为。
- **修复(patch 129)**:
  - `collectWindowsProcessMetrics` 加 10 秒 TTL 缓存,同一 PID 集合在缓存有效期内共享一次 powershell 调用,避免并发轮询重复 spawn WMI 查询。
  - `PerformanceView` 自动刷新从 5 秒调到 15 秒,降低 WMI 调用频率 2/3。

### 影响面(全部在 overlay/ 内)
- `overlay/patches/128-desktop-fix-home-route-and-window-raise.patch`(新建)
- `overlay/patches/129-server-client-fix-wmi-polling.patch`(新建)
- `overlay/patches/130-desktop-webui-detached.patch`(新建)
- `overlay/patches/series`(追加 3 行)

### 验证
- inject:128/129/130 干净 apply / reverse(在 fresh tree 与真实 upstream 均验证)
- vitest:39 文件 / 404 测试全绿
- 构建:mac arm64 dmg + zip、win x64 zip 均成功;afterPack 钩子按目标裁剪 prebuilds(mac 保留 darwin-arm64、win 保留 win32-x64)
