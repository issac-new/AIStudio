## SwarmStudio 1.3.1

Windows 终端修复版本。修复 AI协作中心(AI Collaboration Center)终端在 Windows 下无法打开的问题。

### 问题

Windows 系统下"AI协作中心"的 terminal 无法正常打开终端：进入终端模式后面板空白、无 PowerShell 会话创建。

### 根因

`overlay/patches/041-desktop-rebrand-swarmstudio-config.patch` 把 upstream 的动态 `!(${platform}-${arch})` node-pty prebuild 排除规则,改成了 3 条静态排除:

```yaml
- "!node_modules/node-pty/prebuilds/win32-*/**"
- "!node_modules/node-pty/prebuilds/linux-*/**"
- "!node_modules/node-pty/prebuilds/darwin-x64/**"
```

这 3 条位于顶层 `extraResources` 过滤器,对所有构建目标生效。其中 `win32-*/**` 把 Windows x64 构建自身的 `win32-x64` 原生二进制也排除了 → Windows 包内 `resources/webui/node_modules/node-pty/prebuilds/win32-x64/` 缺失 → Windows 运行时 `require('node-pty')` 抛错 → `terminal.ts` 里 `pty=null` → `setupTerminalWebSocket()` 早退(不注册 `/api/hermes/terminal`)→ `server/index.ts` 兜底 upgrade handler 销毁客户端 WS 升级请求 → 终端打不开。

electron-builder 25.1.8 的 `${platform}` 宏展开为**宿主机** `process.platform`(macOS 上为 `darwin`),而非构建目标,无法用于跨平台构建的"按目标动态排除"。

### 修复

#### Patch 041(修改):移除静态按平台排除
从 `041-desktop-rebrand-swarmstudio-config.patch` 的 extraResources 过滤器中删除 3 行静态按平台排除(`win32-*/**`、`linux-*/**`、`darwin-x64/**`)。保留 `build/**`、`third_party/**`、`deps/**`、`src/**` 排除(源码/构建产物,node-pty 运行时只需 `lib/` + `prebuilds/`,与平台无关,静态排除安全)。删除后所有平台 prebuilds 都会被拷入暂存目录,再由 afterPack 钩子按目标裁剪。

#### Patch 127(新增):afterPack 钩子按构建目标裁剪 prebuilds
- `packages/desktop/electron-builder.yml`:顶层 `asarUnpack` 与 `mac:` 之间新增 `afterPack: "./scripts/after-pack-prune-node-pty.cjs"`。
- `packages/desktop/scripts/after-pack-prune-node-pty.cjs`(新建):afterPack 钩子,在 `copyFiles(extraResources)` 之后(app-builder-lib `platformPackager.js:240-245`)按 `context.electronPlatformName`(目标平台 nodeName: `win32`/`darwin`/`linux`)+ `context.arch`(目标架构枚举)删除非目标平台的 prebuilds 目录,只保留目标平台原生二进制(如 Windows x64 构建保留 `win32-x64/`,删除 `darwin-*`/`linux-*`/`win32-arm64`)。CommonJS(`.cjs`),与 desktop package.json 无 `type:module` 一致。
- 导出 `computeKeepDir` / `listPruneTargets` / `resolvePrebuildsDir` 纯函数供测试。

#### 测试(新增)
`overlay/custom/desktop/__tests__/node-pty-prebuild-prune.test.ts`:校验 `computeKeepDir('win32',1)==='win32-x64'`、`('darwin',3)==='darwin-arm64'`、`('linux',1)==='linux-x64'`,及真实 prebuilds 目录命名约定(`win32-x64`/`darwin-arm64` 存在)。钩子文件未注入(inject 未跑)时 6 项跳过,注入后全部通过(9/9)。

### 影响面
- `overlay/patches/041-desktop-rebrand-swarmstudio-config.patch`(删 3 行)
- `overlay/patches/127-desktop-node-pty-prebuilds-prune.patch`(新建)
- `overlay/patches/series`(追加 1 行)
- `overlay/custom/desktop/__tests__/node-pty-prebuild-prune.test.ts`(新建)

### 验证
- inject:041(修改后)+ 127 干净 apply / reverse(在 fresh tree 与真实 upstream 均验证)
- vitest:`node-pty-prebuild-prune.test.ts` 9/9 通过
- patch forward/reverse:041 → 127 与 127 → 041 双向均干净
