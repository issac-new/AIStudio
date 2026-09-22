# Windows x64 部署与开发环境指引

> 2026-09-22 win-x64 兼容排查轮配套文档。适用:在 Windows 10/11 x64 主机上搭建
> SwarmStudio overlay 的开发/构建/打包环境。桌面应用(安装包)本身的运行时兼容
> 由上游保证(Electron 42 + node-pty/sharp/sherpa-onnx 均有 win32-x64 prebuilt、
> N-API 免 rebuild),此前断点集中在 overlay 的注入/构建编排层,本轮已根治。

## 一、前置要求

| 项 | 要求 | 说明 |
|---|---|---|
| Node.js | ≥ 23(推荐 24 LTS)x64 官方 installer | `node -v` 验证 |
| Git for Windows | 任意近期版本 | 提供 git 与 Git Bash |
| VS Build Tools | **不需要** | 三个原生模块(node-pty/sharp/sherpa-onnx)全部带 win32-x64 prebuilt,`npmRebuild: false` 是 electron-builder 显式配置 |
| 管理员/开发者模式 | **不需要** | overlay→upstream 的目录链接已改用 junction(免特权) |

**Git 配置(重要,patch 应用依赖)**:

```powershell
# 三个上游仓 + overlay 仓都建议关闭 autocrlf,保持 LF 检出(patch 上下文是 LF)
git config --global core.autocrlf false
```

若检出时已是 CRLF:`inject` 会在 win32 自动加 `--ignore-whitespace` 容差套用,
并打印告警;要恢复严格匹配,设 `core.autocrlf false` 后重新检出即可。

## 二、首次搭建(从零到 dev 起跑)

```powershell
# 1. 目录布局(与 macOS 一致):ncwk 根下 overlay/ + upstream/
git clone <overlay-repo> ncwk/overlay
cd ncwk
git clone https://github.com/EKKOLearnAI/hermes-studio upstream/hermes-studio
git clone https://github.com/NousResearch/hermes-agent   upstream/hermes-agent
cd upstream/hermes-studio
git checkout v0.7.23            # 与 overlay 当前基线一致的稳定 tag

# 2. 先装上游依赖(此时 package.json 未被 patch,lock 同步,干净安装)
npm install --no-audit --no-fund --ignore-scripts
mkdir dist                      # 防止(万一执行的)prepare 触发全量构建

# 3. 注入 patches + 建 junction 链接 + 生成派生 vite config
cd ../../overlay
npm run inject

# 4. 二次安装:inject 给上游 package.json 加了 overlay 依赖(matrix-js-sdk/
#    three/echarts/cron-parser/lunar-typescript/pg/proper-lockfile),
#    重跑 install 补齐 node_modules(lock 同步 patch 落地后本步幂等)
cd ../upstream/hermes-studio
npm install --no-audit --no-fund --ignore-scripts
cd ../../overlay

# 5. 启动(两个终端)
npm run serve                   # 后端 :8647(serve-server.mjs,跨平台;旧 .sh 版仍可用)
npm run dev                     # 前端 :8649(vite HMR,已用 cross-env)
```

验证:浏览器开 `http://localhost:8649`,后端 `http://127.0.0.1:8647` 健康检查通过。

## 三、日常开发

| 命令 | 用途 | Windows 可用性 |
|---|---|---|
| `npm run serve` | 后端(ts-node 直跑 TS 源码) | ✅ 本轮新增 node 版脚本 |
| `npm run dev` | 前端 vite :8649 | ✅ cross-env |
| `npm test` | overlay vitest 全量 | ✅ |
| `npm run inject` / `clean` | patch 注入/还原 | ✅ 本轮加固 |
| `npm run build:full` | client+server 完整构建 | ✅ 本轮改直指包内 JS 入口 |
| `npm run build:dmg:win` | Windows 安装包 | ✅ **必须在 Windows 主机构建**(见下) |
| `npm run sync` | 上游升级 | ⚠️ 需 Git Bash + gh;python3 已带 python 回退 |
| `npm run catalog-check` | ZCode 词表守门 | ❌ macOS 专属(读 /Applications/ZCode.app),非 Windows 会明确退出 |

## 四、打包 Windows 安装包(zip + nsis)

```powershell
cd overlay
npm run build:dmg:win       # 编排:clean → inject → build:full → desktop tsc → electron-builder --win
```

产物:`upstream/hermes-studio/packages/desktop/release/SwarmStudio-<版本>-x64.zip`(及 nsis exe)。

**为什么必须在 Windows 主机构建**:sharp 的平台二进制(`@img/sharp-win32-x64`)
只在 Windows 宿主上安装;mac 交叉构建的 win 包缺该二进制,Windows 上 sharp 必挂
(after-pack 只裁剪不补装)。上游 CI 同样用 windows-latest 原生 runner。

签名:项目惯例无签名。Windows 首次运行会有 SmartScreen 提示,选「仍要运行」。

## 五、首次启动下载 hermes 运行时(桌面安装包场景)

桌面应用首次启动会从 `download.ekkolearnai.com` 下载 hermes 运行时(约 543MB,
含 Python/Git/Node/hermes-agent 源码,win-x64 资产已验证在线)。**注意**:当前
`packages/desktop/build/runtime-release.json` pin 的 `hermes-0.21.4-runtime`
若尚未发布,首次启动会弹下载失败——部署机可显式指回已发布版本:

```powershell
# 用户级环境变量(任选其一)
setx HERMES_DESKTOP_RUNTIME_RELEASE_TAG hermes-0.21.3-runtime
# 或直链资产
setx HERMES_DESKTOP_RUNTIME_URL https://download.ekkolearnai.com/hermes-0.21.3-runtime/hermes-runtime-hermes-agent-0.21.3-win-x64.tar.gz
```

Windows 下 `uv.exe`/未签名 exe 可能被 Defender 误报隔离,hermes-agent 官方
README 有加白名单指引。

## 六、已知边界(未在代码层修复,如实记录)

1. **loop 数据落点**:dev 态 loop 数据(`.loop/`)落 server cwd;打包态 cwd 只读时
   自动降级 `~/.hermes-web-ui/loop`(带告警),可用 `HERMES_LOOP_DIR` 显式指定。
2. **Docker 路线**:overlay 根的 `docker-compose.yml`(Matrix 六服务编排)当前
   是非法 YAML 且引用的 Dockerfile 不存在,任何平台都起不来;如需容器跑 agent
   网关,用 hermes-agent 官方 `docker-compose.windows.yml`(Docker Desktop)。
3. **Element Web 参考仓**与 `scripts/sim|fleet|aipay` 多用户推演脚本为 macOS
   本机工具,不在 Windows 部署面内。
4. **runtime pin 0.21.4 未发布**是发布流程事项(需构建上传 runtime release),
   非本仓代码可修;用第五节环境变量绕行。

## 七、本轮修复清单(锚点)

- inject 链:配置生成路径 JSON 转义 / junction 链接 / patch 引号 / win32
  `--ignore-whitespace` + autocrlf 告警 —— `scripts/inject.mjs`、`scripts/ensure-injected.mjs`
- 构建:`scripts/build.mjs` 直指包内 JS 入口(win32 `.bin` 是 sh shim)
- 跨平台后端:`scripts/serve-server.mjs` + `npm run serve`
- loop 数据根/命令执行/hermes 调用:`custom/server/loop/paths.ts`、
  `custom/server/runtime/{platform-exec,hermes-invocation}.ts` 及接入点
- IDE worktree 建/绑路径分叉:`custom/server/controllers/ide/worktree.ts`
- 附件文件名 Windows 非法字符:patch 013/111 + `KanbanAttachments.vue`
- 守门测试:`custom/server/**/__tests__/windows-compat-*.test.ts` ×4
