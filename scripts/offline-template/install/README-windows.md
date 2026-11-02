# AIStudio 离线安装手册（Windows amd64 · web 模式）

> 环境要求：Windows 10/11 x64，**Node.js ≥23（zcode 建议装 24）＋ Python 3.14 ＋ Git for Windows 已预装**；npm/pip 镜像已由目标机环境变量配好（本安装不写、不覆盖任何 registry 配置）。除 pip/npm 镜像外**全程无网络**。

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
| S2b | SwarmTeam 全量：profiles（跳过 `_*`）＋44 skills＋`_shared` 六层＋plugins＋patches＋工具钉版区 4 件 | `hermes profile list` 可验 |
| S3 | 模板落位（只在文件不存在时）：`.env` / `config.yaml` / `%USERPROFILE%\.zcode\AGENTS.md` | 已存在则 SKIP＋人工合并提示 |
| S4 | `npm run inject` → `vendor\hermes-studio` 内 `npm install --ignore-scripts`＋建 `dist\` → `npm run serve` 冒烟探活 :8647 | 浏览器开 `http://localhost:8647` |
| S5 | `npm run zcode:ensure` → `node scripts\zcode-engine.mjs install-cli` | `%USERPROFILE%\.hermes\ycode\zcode.cjs` |
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

- **本安装链未在真实 Windows 实机验证过**（打包机为 macOS）；以 S0 doctor＋每步失败回执补偿。首次安装请完整看一遍输出。
- Electron 桌面线（DMG/MSIX）不在本包：需要另捆 electron win32-x64 二进制（约 120MB）＋桌面运行时（约 543MB，官方 CDN 离线不可达）＋必须在 Windows 主机构建，属于后续单独批次。
- `node-pty` 若镜像上的版本不含 win32 预编译，终端类功能在离线机不可用（web 主功能不受影响）；打包报告会记录实测结论。
- `hermes-agent-src` 是打包时刻的本机工作树快照（含 154 文件本地改动，追溯见 `local-mods.patch`＋`HERMES-AGENT-SNAPSHOT.md`）；与包内 `aistudio\vendor\hermes-agent`（钉版 0.22.5 基线）是**两棵树**，studio 运行时消费的是 `~\.hermes\hermes-agent` 这棵。
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
