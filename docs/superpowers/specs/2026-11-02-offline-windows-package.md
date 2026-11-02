# 2026-11-02 离线安装包（Windows amd64）：源码＋安装脚本＋本机 hermes-agent 快照

- 日期：2026-11-02｜状态：design（待用户批准后进 plan）
- 关联：`2026-10-27-release-packages.md`（4+1 源码包形态）、`docs/windows-x64-setup.md`（win 兼容面）、`team/install-windows.ps1`（pip+npm 先例）
- 用户裁决（2026-11-02）：web 模式；目标机 Node≥23＋Python 3.14 齐备；镜像地址由目标机已配好的环境变量接管（脚本不碰 registry）；zcode 进离线范围；另要求含全部相关环境变量与本机改过官方的 hermes-agent 全量源码，且不含环境隐私数据。

## 背景

目标 Windows amd64 机器仅 pip/npm 镜像可达、不可联网。现有交付链（GitHub Release 4+1 源码包＋README 四步安装）已在干净环境实测装通，但前提是能直连 `registry.npmjs.org`：仓内三份 lock（vendor/hermes-studio 1077 条、vendor/hermes-agent 1372 条、vendor/zcode 47 条）的 `resolved` 全部锚官方源（2026-10-24 供应链轮刻意归一，`.npmrc:1` 同），agent 侧 `team/install-windows.ps1:54` 走的是 pip 装**官方发布包**——装不到本机改过的 154 文件版本。两块都需要一条离线镜像链。

## 变更

新增（A 类，全部落在 `scripts/`＋仓内模板目录，不动 vendor）：

1. `scripts/make-offline-package.mjs`——打包入口，产出 `dist/offline/aistudio-offline-<full版>-win64.zip`（dist 不入库）。
2. `scripts/offline-template/`——安装脚本与模板正本（单一事实源）：
   - `install/install-windows.ps1`＋`install-windows.bat`（主安装脚本＋双击 shim）
   - `install/README-windows.md`（离线安装手册：前置/步骤/排障/已知限制/桌面线补捆绑清单）
   - `env/dot-env.example`（变量名＋用途注释，值全空）
   - `env/env-vars.md`（变量×用途×消费点 file:line 表）
3. `scripts/__tests__/make-offline-package.test.ts`——脱敏扫描器与包结构守门测试。
4. `custom/__tests__/windows-compat-scripts-guard.test.ts` 增补静态断言：`install-windows.ps1` 不得写死/覆写 registry（禁 `npm config set registry`、`pip config set index-url`）、不得依赖 bash/WSL；`scripts/offline-template/zcode/AGENTS.md` 不得含本机绝对路径（`/Users/`、`/Volumes/`）。
5. 文档接线：`README.md` 安装段加一行离线包指引；`docs/windows-x64-setup.md` 补「离线安装」小节指向新手册。

包内 hermes-agent 快照与 env 模板在打包时动态采集（见设计），模板正本里的变量清单是人工维护的脱敏正本，打包时与 `~/.hermes/.env` 实际键名对账（多出的键名告警入包报告，值永不入包）。

## 设计

### 包结构

```
aistudio-offline-<full版>-win64/
├── aistudio/                    # 全仓源码快照：git archive HEAD（full 口径=RELEASE-MANIFEST fullPackage）
├── hermes-agent-src/            # 本机 ~/.hermes/hermes-agent 工作树快照（含 154 本地改动）
│   ├── <源码树>                 # 剔除 venv*/__pycache__/*.egg-info/.git/logs/node_modules
│   ├── HERMES-AGENT-SNAPSHOT.md # 基线 commit＋改动文件数＋采集时间＋与仓内 vendor 基线的关系说明
│   └── local-mods.patch         # git diff 留证（上游基线→本机工作树，供追溯与再升级）
├── env/
│   ├── dot-env.example          # 23+ 变量名（API_SERVER_KEY/HERMES_GATEWAY_TOKEN/各 provider KEY 名…）＋用途
│   ├── config.example.yaml      # 由 team/config.yaml（脱敏正本）派生＋头注「按目标机调整 model/provider」
│   └── env-vars.md
├── zcode/
│   └── AGENTS.md                # ~/.zcode/AGENTS.md 脱敏正本（去除本机路径/凭证位置/项目名，2026-11-02）
├── install/
│   ├── install-windows.ps1
│   ├── install-windows.bat
│   └── README-windows.md
└── SHA256SUMS.txt               # 包内全文件摘要（不含自身）
```

`aistudio/` 复用 `scripts/make-release-packages.mjs:44-49` 的整体包机制（`git archive` 全仓 HEAD），天然排除 gitignore 产物与本地隐私文件；唯一差异是 full 档之外再叠 `hermes-agent-src/`、`env/`、`install/` 三目录。

### install-windows.ps1 安装链（幂等可重入，每步先探测已完成则 SKIP）

- **S0 doctor 体检**：node（≥23 过，报 zcode 建议 24）、python（`py -0p` 枚举取 3.14，无则 FAIL）、pip、npm、git、pnpm（缺则 `npm i -g pnpm`）；registry 连通性探测（`npm ping`、`pip download --no-deps --dest %TEMP% pip` 试连）——全部继承目标机已配好的 registry 环境变量，脚本不写不覆盖。任一 FAIL 输出结构化报告并停。
- **S1 布源**：`hermes-agent-src/` → `%USERPROFILE%\.hermes\hermes-agent`（已存在则整树备份 `.bak-<ts>` 后替换）；`aistudio/` 就地使用。
- **S2 agent**：在 `.hermes\hermes-agent` 内 `python -m venv venv.py314` → `venv\Scripts\pip install uv`（uv 自 PyPI wheel，仍只走 pip 源；版本对齐上游 `pm/lock.json` 钉版，实现时取）→ `venv\Scripts\uv pip install -e .[all]`（**必须 uv 而非裸 pip**：本机树 pyproject:614 `[tool.uv] override-dependencies` 以 cryptography/pynacl 上下界覆盖压平依赖冲突，裸 pip 会 ResolutionImpossible——builder-check Q1＋本机实测 2026-11-02）→ 验证 `venv\Scripts\hermes.exe` 存在 → `hermes setup --skip-model`（幂等，`.hermes` 已初始化则跳过）。
- **S2b Teams（默认全装，`-SkipTeams` 可跳过；用户裁决 2026-11-02）**：复用 `aistudio\team\` 脱敏正本——`hermes profile install` 逐 profile（跳过 `_*`；用 S2 venv 的 hermes.exe）、44 个 skills 拷贝到 `~\.hermes\skills`、`_shared` 六层协议＋顶层文件、orchestrator plugins、patches(.ps1) 拷贝、workspace git 仓初始化＋基础补丁——对齐 `team/install-windows.ps1:86-241` 但装源改为本包。第三方工具：**钉版区 4 件默认装**（`aiohttp/cryptography/httpx/requests`，`requirements-tools.txt` 钉版区）；参考区 ~60 个裸名包**默认不装**（该文件自身治理口径=按需自装，torch/vllm 类离线镜像代价大），README 给自装命令。可选 TUI：`ui-tui` 的 `npm install`（镜像可达）列为可选步骤不自动跑。
- **S3 模板落位**：`dot-env.example`→`~\.hermes\.env`、`config.example.yaml`→`~\.hermes\config.yaml`（均只在该文件不存在时落，存在则提示人工合并——防覆盖目标机已有配置；注意 `hermes setup` 在 S2 已生成缺省 config，此步落团队口径需人工确认覆盖，脚本给出 diff 提示）；`zcode\AGENTS.md`→`%USERPROFILE%\.zcode\AGENTS.md`（同样只在不存在的落）。
- **S4 studio**：`aistudio/` 内 `npm run inject`（junction 建链＋补丁重放＋自动 deploy-agent-runtime，`inject.mjs:794`）→ `vendor\hermes-studio` 内 `npm install --ignore-scripts`＋`mkdir dist`（README 四步口径）→ 回根 `npm run serve` 冒烟（后台起 8647，TCP/HTTP 探活后停）。
- **S5 zcode**：不裸跑 pnpm（裸装会触发 electron postinstall 挂死外网，`zcode-engine.mjs:10-11` R1 实证）；走仓内既有幂等通道：`npm run zcode:ensure`（node_modules 缺失才 pnpm install，内置 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`；缺 dist 才构建 `@zcode/server`）→ `node scripts/zcode-engine.mjs install-cli`（turbo 依赖闭包构建＋部署 `~/.hermes/ycode/zcode.cjs`，ACP 桥以 `ZCODE_BIN` 消费）。两步全离线安全（构建走本地源码，无外网下载；`scripts/zcode-engine.mjs` 全文核查 2026-11-02）。
- **S6 对账汇总**：runtime overlay 部署文件数对账＋各步 OK/SKIP/FAIL 报告＋访问地址（`http://localhost:8647`）＋下一步（填 API key、`npm run dev` 可选起 8649）。注：`deploy-agent-runtime` 默认保留与模板不同的目标文件（仓规 §10），包内快照较 runtime/ 模板新的文件（如 `gateway/kanban_watchers_dispatcher.py`，2026-11-02 打包实测存在 1 处）不会被覆盖。

### make-offline-package.mjs 打包链

1. `git archive HEAD` → staging `aistudio/`。
2. 采集 `~/.hermes/hermes-agent` 工作树（Node `fs.cpSync` filter 实现排除，不依赖 rsync）。排除清单（2026-11-02 两轮实测口径）：**venv 族**（`venv*`/`.venv*`，含 `.venv.bak-*`/`.venv.dangling-*` 残留）、`.hermes-runtime`（内嵌 Python 运行时）、`.worktrees`（遗留 worktree 拷贝）、`.git`、`node_modules`、`dist`/`release`/`build`/`.cache`（构建产物，目标机重建）、`__pycache__`、点前缀缓存目录族（`.[a-z]+[-_]cache`——`.ruff_cache`/`.pytest_cache`/`.pytest-cache` 等，2026-11-02 zip 实测泄漏后补）、`*.egg-info`、`logs`、`MagicMock/`（测试残留）。**敏感名文件剔除并报告**：`.env`/`.env.*`（`.env.example`/`.envrc` 白名单放行——前者上游模板、后者 direnv watch 配置无值）。排除后净树约 790M。
3. `local-mods.patch` 生成（覆盖全部改动形态）：本机实测 154 改动＝68 已修改（unstaged）＋86 untracked 新增文件（如 `agent/runaway_guard.py` 一族），裸 `git diff` 会漏 86 个——打包脚本先 `git status --porcelain` 对账（须无 staged 项），再 `git add -A --intent-to-add` → `git diff > local-mods.patch` → `git reset` 还原本机索引，前后 porcelain 快照一致才放行。SNAPSHOT.md 记基线 commit、68＋86 拆分、采集时间。
4. 渲染 `env/`（模板正本＋`~/.hermes/.env` 键名对账）、拷贝 `install/`。
5. **脱敏扫描（fail-closed，三层判据 2026-11-02 两轮实测校准）**：对 `hermes-agent-src/`、`env/`、`install/`、`zcode/` 文本文件全量扫内容模式（`AKIA`/`sk-`/`ghp_`/`xox`/`glpat-`/私钥块/JWT）。命中处置：①与本机 `~/.hermes/.env` 真实值**哈希对撞→无条件 fatal**（假值形态也拦，防真实密钥巧合成 fixture 形态）；②测试/文档面路径（`tests/`/`tests-js/`/`evals/`/`website/`/`docs/`/`manual/`）或明显假值标记（字母表序列、数字序列、`example/placeholder/here/do-not/fake` 等，实测采样校准）→降级为报告项计数（上游公开仓库的测试夹具，如 `sk-abc123…`/`xoxb-test-token`/假 PEM）；③其余命中一律 fatal，打包失败不产包并逐条列出待人工核判。生产面（非测试文档路径）的 key 形态串没有任何合法存在理由，fail-closed 不放松。
6. `zip`＋`SHA256SUMS.txt`＋包体量与文件数报告（含脱敏扫描结论、env 键名对账差异）。

### 环境变量与配置模板口径

- 变量清单正本＝`scripts/offline-template/env/dot-env.example`；`~/.hermes/.env` 实测 23 键（API_SERVER_KEY、HERMES_GATEWAY_TOKEN、BAILIAN/DASHSCOPE/CHERRY_*_API_KEY、QWEN_PORTAL_API_KEY 等）全部收录**只键名**，值一律空。
- `config.example.yaml` 只给结构与键名（gateway/api_server/messaging/terminal 等），值清空或写 `<按目标机填写>`；config.yaml 的完整键结构在打包时从本机文件提取键名复核。
- `env-vars.md` 给每个变量的消费点锚点（如 `API_SERVER_KEY`→`custom/server/runtimecaps/runtime-caps-controller.ts:120` 一族）。

### 隐私红线（不可违反）

不入包：`~/.hermes/.env` 的值、`config.yaml` 的值、state.db/kanban/会话/审批等一切状态库、profiles 内凭据、`models/`、`logs/`、任何 `.git` 目录；由脱敏扫描在打包口执法（fail-closed）。模板与文档只允许出现键名/结构。

## 决策记录

| # | 决策 | 理由/来源 |
|---|---|---|
| D1 | 运行形态=web 模式（serve 8647＋dev 8649），Electron 桌面线不入本轮 | 用户裁决 2026-11-02；桌面线离线需捆 electron 二进制＋~543MB 运行时且须 Windows 主机构建，代价大；与「交付一律 web 版」既有立法（2026-10-22）一致 |
| D2 | 安装脚本只校验不引导运行时（Node≥23/Python 3.14 预装假设） | 用户裁决：目标机齐备 |
| D3 | registry 完全继承目标机环境变量，脚本不写不覆盖；lock 的 npmjs.org resolved 依赖 npm `replace-registry-host` 默认行为（npmjs→已配 registry）接管 | 用户裁决「镜像已配好不用管」；Node≥23 自带 npm≥10 该行为默认开 |
| D4 | zcode 进离线范围（pnpm install） | 用户裁决；zcode 根包无 electron，web 线干净；node≥24 engine 以 doctor 警告放行 |
| D5 | hermes-agent 以**本机工作树快照**入包＋`local-mods.patch` 留证，不用 vendor 基线＋补丁拼装 | 用户明示要「改过官方的全量源码」；本机树=上游 bf0203a794＋154 文件改动，是真实运行态 |
| D6 | agent 安装=venv＋pip 装 uv＋`uv pip install -e .[all]`（本地源码 editable） | 上游 setup.py guard 只认可 editable；裸 pip 撞 `[tool.uv] override-dependencies` 的 cryptography/pynacl 冲突不可解（本机 pyproject:614 实证）；uv 走 pip 源安装，不破坏「仅 pip/npm 源」约束 |
| D10 | zcode 走 `zcode:ensure`＋`install-cli` 仓内幂等通道，不裸跑 pnpm install | 裸装触发 electron postinstall 外网挂死（R1 实证）；ensure 内置 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`；产物 `~/.hermes/ycode/zcode.cjs` 是 ACP 桥的引擎正身 |
| D11 | 离线 zip 不入 `RELEASE-MANIFEST.json` 4+1 版本对账 | 离线包=按需快照通道（版本=full 档版本＋构建日期），非版本化发布物；治理口径由本 spec 声明，避免改已合入 release spec 触发 SPEC_REBIND |
| D12 | SwarmTeam profiles/skills/_shared/plugins/patches **默认全装**（`-SkipTeams` 逃生） | 用户裁决 2026-11-02；装源=仓内 `team/` 脱敏正本（不入包的隐私面为零）；第三方工具按 requirements-tools.txt 自身治理口径只默认装钉版区 4 件 |
| D13 | `~/.zcode/AGENTS.md` 以**手工脱敏正本**入包（`scripts/offline-template/zcode/AGENTS.md`），落位 `%USERPROFILE%\.zcode\AGENTS.md` | 用户指令 2026-11-02；脱敏=去本机绝对路径（/Users、/Volumes）、去 modelscope 术语条目（含凭证位置描述）、去项目实名（agentpay）、swarm-yuan 渲染块路径泛化；机械 scrub 对散文有破义风险，正本人工维护＋打包时与实况文件 diff 告警（仅提示漂移，不自动覆盖） |
| D7 | 脱敏扫描 fail-closed 于打包口；env/config 模板只键名 | 用户「不含环境隐私数据」＋仓规「审计不落敏感原值、密钥只存 env 名」 |
| D8 | 复用 git archive 通道与 README 四步口径（inject→install --ignore-scripts→serve） | 单一事实源；2026-10-27 干净环境轮已实测非 git 树可装通（`git apply` 仓外可用，inject.mjs:107） |
| D9 | 安装脚本 PowerShell＋.bat shim | 沿 `team/install-windows.ps1` 先例（纯 PowerShell，无 bash/WSL 依赖） |

## 验证

- **单测（vitest）**：脱敏扫描器命中/放行样例（伪 `.env`、伪 key 内容、伪 `.db` 必拦；正常源码、键名模板必放行）；排除清单生效；包结构函数断言；windows-compat guard 增补断言（registry 不写死、无 bash 依赖）。
- **本机（macOS）打包实测**：跑通 `node scripts/make-offline-package.mjs`，对产物 zip 抽验——无 `.git`/`venv`/`.env` 值/状态库；含 `local-mods.patch`、`HERMES-AGENT-SNAPSHOT.md`、install/env 三件；`SHA256SUMS.txt` 自校验通过。
- **安装链**：无 Windows 实机（本机 darwin），**如实标注未实机验证**；补偿=doctor 结构化体检＋README 排障段＋每步失败回执。若用户提供目标机，验收以目标机双击 `install-windows.bat` 一次装通为准。
- **合并前**：`npm test` 全量＋新增目标测试绿；附录 A.1 登记（本 spec＋466 计数）过 `docs-ssot-guard`。

## 风险与未验证项

1. **安装链未在真实 Windows 实机验证**（最大未验证项，交付说明显式声明）。
2. `node-pty@^1.1.0` win32-x64 预编译形态待打包前实测（下载 lock 钉版 tarball 查 `prebuilds/`）：若为捆绑 prebuilds 则 `--ignore-scripts` 无碍；若需 GitHub 下载则离线机终端功能降级，写入 README 已知限制。
3. 内网镜像缺包风险（如 `sherpa-onnx-node` win32 包）：doctor 的 `npm ping` 只探元数据层，逐包 404 在 install 时才暴露——README 排障段给逐包核对命令。
4. `[all]` extras 个别包 win32 无 wheel 需源码构建（需 MSVC）：pyproject markers 预期已规避；若 doctor/安装实测暴露，降级为核心＋精选 extras 子集（README 给命令）。
5. zcode `pnpm install` 的 postinstall 链若有隐藏下载（桌面子包不装，根包已核查无 electron）：README 排障段给 `--ignore-scripts` 降级命令。
6. 本机 hermes-agent 树与仓内 `vendor/hermes-agent`（0.22.5 钉版）版本不同源（本机基线 bf0203a794 更新）：SNAPSHOT.md 明示两者关系，避免目标机侧混用误解；studio 对 agent 的耦合面（8650 网关代理＋CLI 子进程）按运行态接口工作，不依赖版本一致。
7. **挂账（节点⑦审查 P1-7，产品侧 B 类，另立批）**：`custom/server/runtimecaps/runtime-caps-controller.ts:33` 的安装树 venv 探测是 POSIX 路径（`hermes-agent/venv/bin/hermes`），与 Windows 产物布局（`venv.py314\Scripts\hermes.exe`）不匹配，Windows 上恒 miss→409；本批以安装脚本提示 `setx HERMES_BIN` 缓解（env-vars.md 同步），根治需补丁改探测路径分叉。

## 设计文档影响

DESIGN_SYNC: touched——`README.md`（安装段加离线包指引一行）、`docs/windows-x64-setup.md`（补「离线安装」小节指向 `install/README-windows.md`）。整合正本与数字总账不涉及（本任务为分发通道新增，不改产品行为面）；附录 A.1 随本批登记（466 份）。
