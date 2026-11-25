# 2026-11-25 预装文档工具宿主注入（P1 实施）

> 状态：in-progress（2026-11-25；分支 feat/preinstalled-tools，基线 0cfdbf678＝本地 main）
> 承接：`2026-11-25-zcode-400-capability-absorption.md`（立项规格，任务卡第 1 条）；用户 2026-11-25 令「开工」
> 推送口径：用户指示「先不用发版」——本批合并进本地 main 后不推送、不发版，推送时机待用户明示

## 变更

把上游「预装文档工具」接到本仓引擎进程：拉起引擎时若检测到桌面版预装入口目录，注入 PATH 前缀与 `ZCODE_PREINSTALLED_TOOLS_AVAILABLE=1`；未检测到则不注入、不报错（插件走上游回退规则）。本机实测：桌面版已把 8 个入口下载就绪（`~/.zcode/preinstalled-tools/production/bin/`：pandoc、pdfimages、pdfinfo、pdftoppm、pdftotext、qpdf、zcode-python、zcode-soffice），注入后派单会话立即可用。

### 改法（实现中修订）

初始设计是「宿主把 PATH 前缀与 `ZCODE_PREINSTALLED_TOOLS_AVAILABLE=1` 直接塞进引擎进程 env，靠子进程继承」。隔离引擎实测把这个假设推翻了：Agent 的 Bash 工具命令跑在**登录 shell**里，macOS 的 `path_helper` 会重建 PATH（系统路径前置、注入前缀消失），变量也不到达——引擎在 spawn Agent 时会用运行时解析结果重写这两个值。

逐层溯源后找到上游正门：注入链在上游是 `createLocalServices` 的 `resolveSpawnEnv`（`packages/services/src/node.ts`），它读 `options.preinstalledToolsBinDir`，条件 `!isDesktopAttachedRemote` 成立时下发 `ZCODE_PREINSTALLED_TOOLS_AVAILABLE=1` 与 `PATH` 前缀（后者经 Bash 快照覆盖 rc 文件的 PATH 修改）。独立服务端形态恰好满足该条件，缺的只有两处接线：

1. `packages/server/src/entry-http.ts` 从未传这个选项（上游只在桌面入口传）；
2. `createServerHostServices` 转调 `createLocalServices` 时逐字段列举，把 `preinstalledToolsBinDir` 漏掉。

所以改为**补丁 015**（`zcode-patches/015-entry-http-preinstalled-tools-bin-dir.patch`，两文件）：entry-http 新增环境变量入口 `ZCODE_PREINSTALLED_TOOLS_BIN_DIR` → 传给 `createServerHostServices`；后者原样转发给 `createLocalServices`。变量缺省时两处行为逐字不变。

宿主侧相应简化：

- `scripts/zcode-engine.mjs` 新增导出纯函数 `preinstalledToolsEnv(homeDir)`：按身份序 `production → preview → development` 找第一个存在且非空的 `<home>/.zcode/preinstalled-tools/<身份>/bin`；命中返回 `{ binDir }`；未就绪（目录缺失、bin 为空目录、不可读）返回 `null`。
- `serve()` 拉起引擎时命中则设 `ZCODE_PREINSTALLED_TOOLS_BIN_DIR=<binDir>`（**只传位置**，PATH 与变量由引擎下发），未命中不设、不报错；两态各留一行日志。
- 不新增脚本文件（逻辑内联既有 `zcode-engine.mjs`，`sourceFingerprint` 已有导出先例）；守门用例加进既有 `scripts/__tests__/zcode-engine-ensure.test.ts`，不新增测试面。
- 机制预算：`config/mechanism-budget.json` 登记一条 changes（+0 脚本，sunset 与 pairedRemovals 写明「上游既有能力的接线，非新造机制」）。
- 离线说明能力边界句（用户裁决＝说明写明不可用）：`docs/windows-x64-setup.md` 与 `scripts/offline-template/install/README-windows.md` 各加一句。

### 范围边界

- 只注入引擎进程环境；`install-cli`（ACP 桥的 CLI 身份）不在本批范围——桥的 PATH 注入留待有实际需要时另批。
- 不自建下载链、不镜像预装资源（立项规格 D2/D3）；离线包口径不动。

### 任务卡

#### 完成条件

1. 纯函数三态守门：production 命中返回 env（PATH 前缀＋变量）；目录缺失返回 null；bin 存在但空返回 null；preview/development 回退序一例。
2. `serve()` 接线：注入与未注入两条日志路径有代码与守门（接线形态审查＋纯函数单测覆盖）。
3. 隔离端到端实证：隔离 HOME 造夹具 bin（拷贝真实入口脚本）→ 以注入 env 拉起隔离引擎 → 模拟模型带一轮 bash 工具调用 → 会话内 `command -v pdftotext` 命中夹具入口（`ZCODE_PREINSTALLED_TOOLS_AVAILABLE` 经进程环境可见）。
4. 真实 HOME 断言：`preinstalledToolsEnv(真实HOME)` 命中 `production` 真 bin（本机桌面版已就绪，只读断言）。
5. 预算登记＋两处离线说明句落盘；回归矩阵合并档通过；立项规格任务卡第 1 条回填。

#### 输入与来源

上游契约 `apps/zcode-cli/docs/design/v2/preinstalled-document-tools.md`（PATH 前置＋env 注入两条）；上游回退规则 `docs/preinstalled-tools/README.md` 三条；本机预装目录实测（production/bin 8 入口）。

#### 工作流边界

只改 `scripts/zcode-engine.mjs`、既有守门测试、`config/mechanism-budget.json`、两份离线说明；不改 `vendor/` 受跟踪文件；不触宿主运行时；隔离引擎只连本机回环、用完即停。

#### 工具与副作用

每次 `serve` 多一次目录存在性检测（微秒级）；注入只影响装有桌面版预装目录的机器；离线机与无桌面版机器行为逐字不变（不注入、不报错）。

#### 结果与证据

见「验证」。

#### 异常与恢复

注入的 env 只作用于引擎进程及其子进程，`unset PATH` 级污染不可能（PATH 是前缀拼接、原 PATH 保留在尾部）；入口目录被桌面版删除后，下次 serve 检测为 null 自动回落不注入。实现可通过反向提交整体恢复。

#### 验收反例

- 预装目录不存在时 serve 报错或注入半成品环境＝不合格。
- 空 bin 目录被当作就绪注入＝不合格。
- 把「桌面版维护的下载链」复制进本仓＝不合格（越出 D2 边界）。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | 逻辑内联 `zcode-engine.mjs`（导出纯函数），不新建脚本文件 | `sourceFingerprint` 已有导出先例；零预算增量免机制预算抬位 | 新建 `scripts/lib/zcode-preinstalled-tools.mjs`（否决：+1 脚本须抬上限并配对删除，20 行逻辑不值得） |
| D2 | 身份序 production→preview→development，取第一个非空 bin | 本机实测只有 production；序与上游「身份由 runtime 与 flavor 决定」兼容，留扩展位不写死 | 只认 production（否决：preview/development 身份的桌面版用户会静默落空） |
| D3 | 空 bin 目录视为未就绪返回 null | 上游安装记录 `installation.json` 才是版本事实源，宿主只做存在性检测；空目录＝半初始化，注入会让 `command -v` 命中不存在入口 | 目录存在即注入（否决：半成品环境比不注入更糟，上游规则 1 要求「预装版本已就绪」） |
| D4 | `install-cli`（ACP 桥 CLI）不注入 | 桥的引擎身份是 CLI 形态，上游明文「独立 CLI 不注入」；当前无文档工具类需求经桥到达 | 一并注入（否决：越出上游契约，且无消费者） |
| D5 | 改为补丁 015 接上游 `resolveSpawnEnv`，不靠宿主塞 env 继承 | 隔离实测：宿主注入到引擎进程的 PATH/变量到不了命令层——Bash 命令在登录 shell 里跑，macOS path_helper 重建 PATH、变量经运行时解析重写；上游正门（`options.preinstalledToolsBinDir` → `ZCODE_PREINSTALLED_TOOLS_AVAILABLE`＋PATH 前缀→Bash 快照）本就对独立服务端形态成立，缺的只是两处接线 | 宿主塞 env（否决：实测无效）；改 CLI `apps/zcode-cli` 侧 env（否决：改动面大且偏离上游设计意图） |
| D6 | 补丁只补接线、不改语义：变量缺省时两处行为逐字不变 | 上游把选项注释为桌面专属，但机械行为对独立服务端同样成立；补丁最小化＝只加一条 env 读取＋一行转发 | 在 entry-http 里重写 spawn 逻辑（否决：侵入上游语义，升级易冲突） |

## 验证

立项时的只读核实（2026-11-25）已确认：本机 `production/bin` 8 入口在位、Agent 侧契约原文（`apps/zcode-cli/docs/design/v2/preinstalled-document-tools.md:20`「Web 服务端和独立 CLI 不注入」）。

实现期实测（2026-11-25，隔离引擎＋模拟供应商＋夹具 bin）：

- **反证宿主直接塞 env 无效**：引擎进程带 `PATH` 前缀与 `ZCODE_PREINSTALLED_TOOLS_AVAILABLE=1` 启动后，会话内诊断显示命令 shell 的 PATH 是登录 shell 形态（`/usr/local/bin:/System/Cryptexes/...`），变量为空，`command -v pdftotext` 命中 `/opt/homebrew/bin`（系统版）——登录 shell 重建环境，宿主注入被冲掉。
- **补丁 015 落地后**：同为隔离引擎，`SHELL_VAR=[1]`、`command -v pdftotext` 命中夹具入口 `<隔离HOME>/.zcode/preinstalled-tools/production/bin/pdftotext`（端到端用例通过：派单→建会话→模拟模型 Bash 工具轮次→工具结果回传断言）。
- **纯函数守门**：`preinstalledToolsEnv` 五态用例（production 命中、目录缺失、空 bin、preview 回退、production 优先）全绿；`scripts/__tests__/zcode-engine-ensure.test.ts` 13 例通过。
- **真实 HOME 只读断言**：`preinstalledToolsEnv($HOME)` → `/Users/cuishi/.zcode/preinstalled-tools/production/bin`。
- **注入重放**：`npm run clean && npm run inject` 全量通过，014 在两 file 上落位（`[inject] applied patch: 015-entry-http-preinstalled-tools-bin-dir.patch (to zcode)`）；引擎产物重建后含两处补丁效果。

## 设计文档影响

DESIGN_SYNC: none（本批是既有能力的接线，不改变设计承诺的形态与数值）。立项规格登记的权限治理约束（不走 zcode 配置权限列表）随下一批触及 `docs/DESIGN.md` 的真实修订时一并落地。
