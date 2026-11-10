# AIStudio 离线安装手册（Windows amd64 · Web 模式）

> 当前配套版本：AIStudio **1.0.15-overlay**；agent teams **v0.23.1-team.2**；hermes-agent 上游底座 **0.23.1**；yuan **v2.100.3**；Ycode **3.17.2**。
>
> 本包是 **Web 模式**的源码与安装链，**不含 Electron 桌面壳、Windows 桌面安装包或桌面运行时**。
>
> 环境要求：Windows 10/11 x64，**Node.js ≥23（建议 24）＋ Python 3.14 ＋ Git for Windows 已预装**，pip/npm 可用且镜像可达。镜像由目标机已有环境变量或配置提供，本安装不写、不覆盖 registry。这里的“离线”指不访问 GitHub、官方 CDN 或公共 npm/PyPI 站点，**不是完全断网、零依赖**；除已配置的镜像和本地资源外不访问其他网络。

当前源码为单仓布局，默认使用包内 `aistudio\vendor\` 的钉版基线。只有显式需要另一套上根基线时才设置 `OVERLAY_UPSTREAM_ROOT`，它不是安装必填项，也不要求另建历史 `upstream\` 目录。`simharness\` 是独立推演 harness；单仓整合或设置该变量都不会把它自动加入 Electron 桌面包。

## 一、安装（一条命令）

解压本包到任意目录（如 `C:\aistudio-offline`），双击 `install-windows.bat`，或：

```powershell
powershell -ExecutionPolicy Bypass -File install\install-windows.ps1
```

脚本幂等可重入：每步先探测是否已完成（SKIP），失败即停并提示，修复后直接重跑。开关：`-SkipTeams`（不装 SwarmTeam profiles/skills）、`-SkipZcode`、`-SkipSmoke`（跳过 8647 冒烟）、`-Python <python.exe 路径>`（自动探测 3.14 失败时显式指定）。

安装步骤一览（与 spec D1-D13 对应）：

| 步 | 内容 | 产物/验证 |
|---|---|---|
| S0 | doctor 体检（node/python/pip/npm/git/pnpm＋镜像连通探测） | 任一 FAIL 即停 |
| S1 | `hermes-agent-src\` → `%USERPROFILE%\.hermes\hermes-agent`（已有则备份 `.bak-<ts>`） | 本机改过官方的全量源码落位 |
| S2 | venv.py314 → `pip install uv` → `uv pip install -e .[all]` → `hermes setup --skip-model` | `hermes.exe` 可用 |
| S2b | SwarmTeam v0.23.0-team.2 全量：profiles（跳过 `_*`）＋44 skills＋`_shared` 六层＋plugins＋patches＋工具钉版区 4 件 | `hermes profile list` 可验 |
| S3 | 模板落位（只在文件不存在时）：`.env` / `config.yaml` / `%USERPROFILE%\.zcode\AGENTS.md` | 已存在则 SKIP＋人工合并提示 |
| S4 | `npm run inject` → `vendor\hermes-studio` 内 `npm install --ignore-scripts`＋建 `dist\` → `npm run serve` 冒烟探活 :8647 | 浏览器开 `http://localhost:8647` |
| S5 | `npm run zcode:ensure` → `node scripts\zcode-engine.mjs install-cli` | Ycode 3.17.2 部署到 `%USERPROFILE%\.hermes\ycode\zcode.cjs` |
| S6 | 汇总报告＋下一步指引 | — |

## 二、装完之后

1. 填密钥：`notepad %USERPROFILE%\.hermes\.env`（每个变量的用途见 `env\env-vars.md`；`API_SERVER_KEY` 可用 PowerShell 生成 64 位随机串）。
2. 模型接入：`config.yaml` 的 `model` 段按目标机实际 provider 改（模板默认指向本机代理样式，见 `env\config.example.yaml` 头注）。
3. 起服务：`cd <包>\aistudio && npm run serve`（生产后端 :8647）；可选 `npm run dev`（前端开发 :8649）。
4. 验证 agent：`%USERPROFILE%\.hermes\hermes-agent\venv.py314\Scripts\hermes.exe profile list`。
5. zcode 桥：需要 ACP 编码引擎的消费方设 `ZCODE_BIN=%USERPROFILE%\.hermes\ycode\zcode.cjs`。

## 三、排障

| 症状 | 处置 |
|---|---|
| S2 `uv pip install` 失败 | 看是否镜像缺个别 win32 wheel：`venv.py314\Scripts\uv.exe pip install --python venv.py314\Scripts\python.exe -e ".[cron,pty,mcp,acp,web]"` 砍 extras 重试；仍失败把缺失包名报给镜像管理员 |
| S4 `npm install` 个别包 404 | 镜像缺 win32 平台包（如 `sherpa-onnx-node-win32-x64`）：`npm view <包名>` 核对镜像元数据后补镜像 |
| S4 inject 报 patch 冲突 | 确认 S0 里 git 存在（`git apply` 依赖）；重跑前 `npm run clean` 再 `npm run inject` |
| S5 pnpm install 卡在 electron 下载 | 本不应发生（脚本内置 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`）；若手动跑过 pnpm，删除 `vendor\zcode\node_modules` 后重跑 S5 |
| 8647 起不来 | 手动 `npm run serve` 看报错；端口占用 `netstat -ano | findstr 8647` |
| 工具参考区包要装（torch/vllm 等） | `pip install <包名>`（按 `team\requirements-tools.txt` 参考区口径：先 `pip index versions` 确认版本再钉版装） |

## 四、已知限制（如实声明）

- **验证证据不得互相替代**：当前 Windows 产品回归、最新离线包实机安装验收、完全气隙验收是三组独立验证。本手册是安装说明，不是这三项的通过报告；不能以既有产品回归推定最新安装或气隙验收通过，也不宣称三组验证已经全部完成。只有各组分别留下当次环境、包版本、命令和结果记录，才能分别声明通过。
- **完全气隙不能只靠复制本 zip**：必须预装上述运行时，并提前把完整 pip/npm 依赖树同步到内部镜像或本地源；该场景需要单独验收。
- **Electron 桌面线不在本包**：需要另捆 electron win32-x64 二进制和桌面运行时，并在 Windows 主机构建，属于独立交付与验证通道。源码包中的 `simharness\` 也不是桌面运行时组件。
- `node-pty` 若镜像上的版本不含 win32 预编译，终端类功能在离线机不可用（Web 主功能不受影响）；打包报告会记录实测结论。
- 离线模板按 hermes-agent **0.23.0** 口径配套。`hermes-agent-src` 是打包时刻的本机工作树快照，本地修改、新增和删除文件数由打包器**动态统计**，追溯见 `local-mods.patch`＋`HERMES-AGENT-SNAPSHOT.md`；它与包内 `aistudio\vendor\hermes-agent`（钉版 0.23.0 上游基线）是**两棵树**，studio 运行时消费的是 `%USERPROFILE%\.hermes\hermes-agent` 这棵。
- 隐私口径：包内不含任何密钥/token/会话状态库（打包口脱敏扫描 fail-closed）；`.env`/`config.yaml` 模板只含键名；`~/.zcode` 只取配置面（技能/规则/脚本），会话库（cli/ 8.8G）、插件缓存、桌面运行态（v2/）、macOS 专属 app 均不入包。
- zcode 技能的 mac 编译产物（bin/dist）已剔除（D16）；gstack browse/make-pdf/design 等工具以 **TS 源码形态**随包（src/＋package.json 全在），目标机进对应目录 `npm install`（走镜像源）后可从源码运行——编译链未在 Windows 实测；zcode 市场插件缓存（cli/plugins）未随包，离线机装新插件受镜像可达性限制。

## 五、包结构

```
aistudio-offline-<版本>-win64\
├── aistudio\            全仓源码快照（git archive；含 vendor 三树/patches/custom/team/runtime）
├── hermes-agent-src\    本机改过官方的 hermes agent 全量源码（剔除 venv/.git/node_modules/缓存）
│   ├── HERMES-AGENT-SNAPSHOT.md   基线 commit＋改动量＋采集时间
│   └── local-mods.patch           上游基线→本机改动的完整补丁（含新增文件）
├── env\                 dot-env.example / config.example.yaml / env-vars.md
├── zcode\               ~/.zcode 配置面：AGENTS/CLAUDE 脱敏正本＋skills(85,符号链已解引用)＋scripts/workflows/vendor
├── thirdparty-src\      不可经 npm/pip 装的三方源码：superpowers/ralph-loop/github 插件源形态＋ECC 技能族（gstack 随 zcode 面）
├── install\             本手册＋install-windows.ps1/.bat
└── SHA256SUMS.txt       包内文件摘要（解压后可校验完整性）
```
