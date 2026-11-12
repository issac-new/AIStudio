# Windows x64 部署与开发环境指引

本文面向在 Windows 10/11 x64 上使用 AIStudio 的开发与部署人员。当前版本如下；历史版本只保留在文末实录中。

| 组件 | 当前版本 |
|---|---|
| AIStudio 整体 | 1.0.16-overlay |
| agent teams | v0.23.0-team.2 |
| hermes-agent 上游底座 | 0.23.0 |
| yuan | v2.100.1 |
| Ycode | 3.17.2 |

## 一、当前形态与边界

1. **当前是单仓布局。** 上游钉版基线已经在仓内 `vendor/`，正常开发不需要再克隆 `upstream/hermes-studio` 或 `upstream/hermes-agent`。
2. **`OVERLAY_UPSTREAM_ROOT` 只是显式覆盖入口。** 未设置时使用仓内 `vendor/`；只有明确要改用另一套上根基线时才设置它。它不是 Windows 安装的必填项，也不要求恢复历史多仓目录。
3. **Windows 离线包是 Web 模式。** 它包含源码、agent 快照和安装链，不包含 Electron 桌面壳、Windows 桌面安装包或桌面运行时。
4. **“离线”不等于完全断网、零依赖。** 目标机仍需预装 Node.js、Python、Git，并能访问可用的 pip/npm 镜像。完全气隙环境必须提前把完整依赖同步到内部镜像或本地源，并另行验收。
5. **`simharness/` 是独立推演 harness。** 单仓整合或设置 `OVERLAY_UPSTREAM_ROOT` 都不会因此把它自动加入 Electron 桌面包；源码快照中的 harness 源文件也不等于桌面运行时组件。

## 二、当前单仓开发环境

### 2.1 前置要求

| 项 | 要求 | 说明 |
|---|---|---|
| Node.js | ≥ 23，推荐 24 LTS，x64 | `node -v` 验证；npm 随 Node.js 提供 |
| Git for Windows | 近期版本 | 提供 `git apply` 与 Git Bash |
| Python | 离线包/agent 安装需 3.14 | `py -0p` 或 `python --version` 验证 |
| pip/npm 镜像 | 离线镜像包安装时必须可达 | 由目标机已有环境变量或配置提供，安装脚本不改写 registry |

建议在检出前关闭自动换行转换，保持补丁所需的 LF 上下文：

```powershell
git config --global core.autocrlf false
```

### 2.2 首次搭建

```powershell
# 1. 克隆单仓；不需要另建 upstream/ 目录
git clone <AIStudio-repo> AIStudio
cd AIStudio

# 2. 注入 patches、生成派生配置并建立链接
npm run inject

# 3. 安装 hermes-studio 依赖
cd vendor/hermes-studio
npm install --no-audit --no-fund --ignore-scripts
New-Item -ItemType Directory -Force dist | Out-Null
cd ../..
```

在两个 PowerShell 终端分别启动后端和前端：

```powershell
# 终端 A：后端 :8647
npm run serve
```

```powershell
# 终端 B：前端开发服务 :8649
npm run dev
```

验证：浏览器打开 `http://localhost:8649`；后端地址为 `http://127.0.0.1:8647`。修改补丁后，先执行 `npm run clean && npm run inject`，再重启服务。

如确需使用外部上根基线，应在运行注入或构建命令的同一终端显式设置 `OVERLAY_UPSTREAM_ROOT`。未设置时不要按文末历史实录创建外置 `upstream/`。

## 三、Windows 离线镜像包（Web 模式）

这里的“离线”指安装过程不依赖 GitHub、官方 CDN 或公共 npm/PyPI 站点，**仍依赖目标机运行时与可达的 pip/npm 镜像**。

### 3.1 在联网开发机打包

```powershell
npm run offline:package
```

产物为 `dist/offline/aistudio-offline-<full版>-win64.zip`；当前整体版本对应 `aistudio-offline-1.0.16-overlay-win64.zip`。包内包含全仓源码快照、本机 hermes-agent 工作树快照、脱敏 env/zcode 模板和 PowerShell 安装链。hermes-agent 快照的实际基线与本地改动量以当次生成的 `HERMES-AGENT-SNAPSHOT.md` 和 `local-mods.patch` 为准，不使用固定文件数。

### 3.2 在 Windows 目标机安装

前置条件：Node.js ≥ 23（建议 24）、Python 3.14、Git for Windows，以及可达的 pip/npm 镜像。解压后双击 `install\install-windows.bat`，或在包根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File install\install-windows.ps1
```

安装完成后按手册填写密钥和模型配置，再运行 `npm run serve`。完整步骤、开关和排障见随包手册，模板正本为 `scripts/offline-template/install/README-windows.md`。

本通道只交付 Web 模式。它不会生成 Electron 桌面包，也不会把 `simharness/` 变成桌面运行时组件。

## 四、Electron 桌面包（独立通道）

Electron 桌面构建不属于上述离线 Web 包。如需单独构建 Windows 桌面包，应在 Windows 主机的单仓根目录执行：

```powershell
npm run build:dmg:win
```

默认使用仓内 `vendor/` 时，产物位于 `vendor/hermes-studio/packages/desktop/release/`；显式设置 `OVERLAY_UPSTREAM_ROOT` 时，以对应上根基线的构建输出为准。具体文件名以当次构建输出为准。桌面运行时版本和下载地址以当次注入后的 `packages/desktop/build/runtime-release.json` 为准；文末 0.21.x 记录不是当前 pin，也不是当前安装指引。

Windows 桌面构建、桌面运行时下载和 Windows 离线 Web 安装是不同通道，不能由其中一项成功推定其他项已验证。

## 五、验证口径

当前 Windows 产品回归、最新离线包实机安装验收、完全气隙验收是三组独立证据，必须分别记录环境、包版本、命令和结果。本文是部署说明，不是这三项的通过报告；不将既有产品回归外推为最新安装或气隙验收通过，也不宣称三组验证已经全部完成。只有各组分别具备当次记录，才能分别声明通过。

镜像探测成功也不代表每个依赖都有 win32-x64 wheel 或预编译包。缺包、需要源码构建或桌面运行时不可达时，应按实际错误单独处理，不把 Web 模式写成完全断网自足。

## 附录：历史多仓实录（隔离说明）

> 以下内容是 2026-09-22 win-x64 兼容排查轮的配套实录，撰写于多仓布局时期（overlay 仓 + 外置 `upstream/`）。当时桌面应用运行时兼容性依赖上游 Electron 42 与 win32-x64 prebuilt，排查重点是 overlay 的注入和构建编排。
>
> **隔离说明：** 2026-10-24 起已整合为 AIStudio 单仓，上游基线进入 `vendor/`。以下所有 `overlay/`、`upstream/` 路径、0.7.24/0.21.x 版本、运行时下载绕行和“本轮”字样只描述当时排查，不是当前单仓的安装步骤、版本或验收结论。当前操作只看第一至五节。

### 1. 历史前置要求

| 项 | 要求 | 说明 |
|---|---|---|
| Node.js | ≥ 23（推荐 24 LTS）x64 官方 installer | `node -v` 验证 |
| Git for Windows | 任意近期版本 | 提供 git 与 Git Bash |
| VS Build Tools | **当时判断不需要** | 三个原生模块（node-pty/sharp/sherpa-onnx）全部带 win32-x64 prebuilt，`npmRebuild: false` 是当时 electron-builder 配置 |
| 管理员/开发者模式 | **当时不需要** | overlay→upstream 的目录链接已改用 junction（免特权） |

当时的 Git 配置建议（patch 应用依赖）：

```powershell
# 三个上游仓 + overlay 仓都建议关闭 autocrlf，保持 LF 检出（patch 上下文是 LF）
git config --global core.autocrlf false
```

若检出时已是 CRLF：当时的 `inject` 会在 win32 自动加 `--ignore-whitespace` 容差套用并打印告警；要恢复严格匹配，设 `core.autocrlf false` 后重新检出。

### 2. 历史首次搭建（多仓布局，勿按当前执行）

```powershell
# 1. 当时目录布局：ncwk 根下 overlay/ + upstream/
git clone <overlay-repo> ncwk/overlay
cd ncwk
git clone https://github.com/EKKOLearnAI/hermes-studio upstream/hermes-studio
git clone https://github.com/NousResearch/hermes-agent   upstream/hermes-agent
cd upstream/hermes-studio
git checkout v0.7.24            # 当时 overlay/package.json 对应的上游段

# 2. 先装上游依赖
npm install --no-audit --no-fund --ignore-scripts
mkdir dist

# 3. 注入 patches + 建 junction 链接 + 生成派生 vite config
cd ../../overlay
npm run inject

# 4. 二次安装：inject 给上游 package.json 加了 overlay 依赖
cd ../upstream/hermes-studio
npm install --no-audit --no-fund --ignore-scripts
cd ../../overlay

# 5. 当时启动方式（两个终端）
npm run serve                   # 后端 :8647
npm run dev                     # 前端 :8649
```

当时验证方式：浏览器开 `http://localhost:8649`，后端 `http://127.0.0.1:8647` 健康检查通过。

### 3. 历史日常开发命令

| 命令 | 当时用途 | 当时 Windows 可用性记录 |
|---|---|---|
| `npm run serve` | 后端（ts-node 直跑 TS 源码） | 当轮新增 node 版脚本 |
| `npm run dev` | 前端 vite :8649 | cross-env |
| `npm test` | overlay vitest 全量 | 当轮记录可用 |
| `npm run inject` / `clean` | patch 注入/还原 | 当轮加固 |
| `npm run build:full` | client+server 完整构建 | 当轮改直指包内 JS 入口 |
| `npm run build:dmg:win` | Windows 安装包 | 必须在 Windows 主机构建 |
| `npm run sync` | 上游升级 | 需 Git Bash + gh；python3 已带 python 回退 |
| `npm run catalog-check` | ZCode 词表守门 | macOS 专属，非 Windows 明确退出 |

### 4. 历史 Windows 桌面包构建记录

```powershell
cd overlay
npm run build:dmg:win       # 当时编排：clean → inject → build:full → desktop tsc → electron-builder --win
```

当时产物：`upstream/hermes-studio/packages/desktop/release/SwarmStudio-<版本>-x64.zip`（及 nsis exe）。

当时要求必须在 Windows 主机构建：sharp 的平台二进制（`@img/sharp-win32-x64`）只在 Windows 宿主上安装；mac 交叉构建的 win 包缺该二进制，Windows 上 sharp 会失败（after-pack 只裁剪不补装）。上游 CI 当时使用 windows-latest 原生 runner。

签名：当时项目惯例无签名。Windows 首次运行会有 SmartScreen 提示。

### 5. 历史首次启动下载 hermes 运行时（0.21.x 记录）

当时桌面应用首次启动会从 `download.ekkolearnai.com` 下载 hermes 运行时（约 543MB，含 Python/Git/Node/hermes-agent 源码）。当时 `packages/desktop/build/runtime-release.json` pin 的 `hermes-0.21.4-runtime` 若尚未发布，首次启动会下载失败；当时记录的环境变量绕行如下，**不是当前推荐配置**：

```powershell
setx HERMES_DESKTOP_RUNTIME_RELEASE_TAG hermes-0.21.3-runtime
setx HERMES_DESKTOP_RUNTIME_URL https://download.ekkolearnai.com/hermes-0.21.3-runtime/hermes-runtime-hermes-agent-0.21.3-win-x64.tar.gz
```

当时还记录了 Windows 下 `uv.exe` 或未签名 exe 可能被 Defender 误报隔离的情况。

### 6. 历史已知边界

1. **loop 数据落点**：当时 dev 态 loop 数据（`.loop/`）落 server cwd；打包态 cwd 只读时自动降级 `~/.hermes-web-ui/loop`（带告警），可用 `HERMES_LOOP_DIR` 显式指定。
2. **Docker 路线**：当时本仓不提供可运行的容器编排。历史根目录的 `docker-compose.yml` 只是旧多仓 aipaydev 推演期占位声明，2026-10-28 已下线；当时建议需要容器跑 agent 网关时使用 hermes-agent 官方 `docker-compose.windows.yml`。
3. **Element Web 参考仓**与 `scripts/sim|fleet|aipay` 多用户推演脚本当时是 macOS 本机工具，不在 Windows 部署面内。
4. **runtime pin 0.21.4 未发布**当时是发布流程事项，用上一节环境变量绕行；该结论不沿用到当前版本。

### 7. 历史修复清单（当轮锚点）

- inject 链：配置生成路径 JSON 转义 / junction 链接 / patch 引号 / win32 `--ignore-whitespace` + autocrlf 告警——`scripts/inject.mjs`、`scripts/ensure-injected.mjs`
- 构建：`scripts/build.mjs` 直指包内 JS 入口（win32 `.bin` 是 sh shim）
- 跨平台后端：`scripts/serve-server.mjs` + `npm run serve`
- loop 数据根/命令执行/hermes 调用：`custom/server/loop/paths.ts`、`custom/server/runtime/{platform-exec,hermes-invocation}.ts` 及接入点
- IDE worktree 建/绑路径分叉：`custom/server/controllers/ide/worktree.ts`
- 附件文件名 Windows 非法字符：patch 013/111 + `KanbanAttachments.vue`
- 守门测试：`custom/server/**/__tests__/windows-compat-*.test.ts` ×4
