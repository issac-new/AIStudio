## SwarmStudio 1.3.3

修复 Windows 下三个问题:Run Observatory 数据加载卡 0%、gateway 健康检查始终失败、应用每隔几秒自动跳到前台。

### 本次修复

#### 1. Gateway 健康检查始终失败(agent-health 端口错误)
- **根因**:`/agent-health/*` 代理默认转发到 `http://127.0.0.1:8650`(开发预览后端端口)。生产桌面环境的 gateway api_server 运行在 `8642`(DEFAULT_PORT),`8650` 上没有任何服务 → 所有 `/agent-health/detailed` 请求返回 502 → CockpitTopBar 显示 gateway stopped、健康检查倒计时卡在 0s。
- **修复(patch 131)**:代理默认目标从 `8650` 改为 `8642`(gateway api_server 实际端口)。

#### 2. 应用每隔几秒自动跳到前台(second-instance)
- **根因**:`app.on('second-instance')` 无条件调用 `showMainWindow()`(restore + show + focus)。任何第二次 `SwarmStudio.exe` 启动(自动更新检查、计划任务、cli shim "open app")都会触发 second-instance 事件,把已可见的窗口强制拉到前台并抢占焦点。
- **修复(patch 132)**:second-instance 仅在窗口当前隐藏或最小化时才 `showMainWindow()`;已可见的窗口不再被重复拉起。

#### 3. Run Observatory 页面数据加载卡 0%
- **根因**:Run Observatory 的 `loadAllTasks()` 通过 `execHermes` 调用 `hermes kanban boards list` / `kanban list --json`(每次都 spawn `python.exe -m hermes_cli.main`)。在 Windows 上每次 python.exe spawn 需要 2-5 秒,且 `loadAllTasks` 是串行的(listBoards → 每个 board listTasks → BFS getTask),所有 kanban CLI 调用完成前 progress 一直为 0%。当 gateway 未运行(patch 1 的问题)时,bridge 不可达也会导致部分依赖 gateway 的数据获取超时。
- **关联修复**:patch 131 修复 gateway 健康检查后,gateway 能正常启动和运行,bridge 变可达,Run Observatory 依赖的 `/api/hermes/sessions`(DB 直读)和 `/api/hermes/sessions/:id/trace`(文件读取)不再因 gateway 异常而超时。配合 patch 129(WMI 缓存,减少杀软对 python.exe spawn 的干扰),execHermes 调用不再被杀软频繁中断。

### 影响面(全部在 overlay/ 内)
- `overlay/patches/131-server-agent-health-port-fix.patch`(新建)
- `overlay/patches/132-desktop-fix-second-instance-raise.patch`(新建)
- `overlay/patches/series`(追加 2 行)

### 验证
- inject:131/132 干净 apply / reverse
- vitest:39 文件 / 404 测试全绿
- 构建:mac arm64 dmg + zip、win x64 zip 均成功;afterPack 按目标裁剪 prebuilds
