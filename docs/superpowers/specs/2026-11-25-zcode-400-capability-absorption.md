# 2026-11-25 ZCode 4.0 能力吸收立项：预装文档工具、设计插件试用、信任通道与微压缩观察登记

> 状态：部分收口（2026-11-26 回填；立项批已合 main b97a12c3c；P1 预装工具已合入 a39679cb3；P2 设计插件试用待开工；P3/P4 触发制登记维持）
> 承接：`2026-11-24-zcode-400-pending-batch.md` N34-3（四项可吸收能力，用户 2026-11-25 令「立项完成吧」）；对照报告 `/Volumes/nvme2230/lab/research/zcode-4000-delta-assessment-20261125/report.md`

## 变更

N34-3 对照报告确认契约面稳定后，四项可吸收能力按「吸收实施／试用验证／观察登记」三档立项。本规格只做立项与分级决策，实施按档排批；每档的开工须回到本规格核对验收判据。

### 1. 预装文档工具（吸收实施级，P1）

上游在本机后台准备 Python、qpdf、Pandoc、Poppler、LibreOffice，文档类插件（documents/pdf/presentations/spreadsheets）直接可用。规则三条：预装就绪且开关开→用预装；否则用系统已有；都没有→插件提示并回退（`docs/preinstalled-tools/README.md`）。

**吸收设计（宿主侧复用，不自建下载链）**：预装链路的下载与协调在上游桌面主进程（`packages/desktop/src/preinstalled-tools/`），独立服务端形态不注入环境（上游明文：`Web 服务端和独立 CLI 不注入这个变量，也不在 PATH 前加 <bin>`，`apps/zcode-cli/docs/design/v2/preinstalled-document-tools.md`）。Agent 侧契约只是两个可继承的环境事实：PATH 最前加 `<数据根>/.zcode/preinstalled-tools/<发布身份>/bin`，注入 `ZCODE_PREINSTALLED_TOOLS_AVAILABLE=1`（引擎进程的环境被子进程 Agent 继承）。所以宿主吸收＝`scripts/zcode-engine.mjs`（ensure/serve）在拉起引擎进程时检测该 bin 目录存在则注入两者；目录不存在则不注入，插件自然走上游规则 2/3 的回退。**不自建下载链**（下载、协调、安装记录共 17 个文件的桌面链路整体移植成本高，且本机已有桌面版预装目录可直接复用）。

**离线适配口径（用户裁决 2026-11-25）**：取「说明写明不可用」——离线机无桌面版预装目录时派单会话无预装工具，插件按上游规则 3 回退；离线安装说明加一句能力边界。离线包不增体积，口径与 R134（可源装的不内嵌）一致。

### 2. 设计插件（试用验证级，P2）

上游 4.0 新增 `design-plugin`（73 文件，默认启用、可禁用不可卸载）：`design` 技能把请求变成 HTML 设计稿／交互原型／HTML 幻灯片，带 74 个设计骨架、23 个设计系统，交付前 `design-lint.mjs` 校验非 token 的颜色字体。服务端形态的插件发现走 `~/.zcode/cli/plugins/cache/zcode-plugins-official/`，本机已有 `design` 目录——**很可能已在派单会话可用，但版本未必是 4.0 的新实现**。本档立项＝验证与试用，不写产品代码：①核缓存内 design 插件版本与 4.0 源码 `design-plugin` 的功能差距（74 骨架是否在内），需要则随 zcode:ensure 刷新；②隔离引擎实证一个 `design` 技能会话（产出 HTML 原型＋lint 报告）；③与本仓既有设计技能划界（上游 README 的分工表：design 管 HTML 稿，visualize 管对话内交互视图，pptx 交给 presentations）——培训手册补一节使用场景与分工。

### 3. 工作区插件信任通道（观察登记级，P3 触发制）

4.0 新增 `setWorkspacePluginTrust`（`zcodeAgentService.ts:6080`，经 plugin-management 的 `pluginsWorkspaceTrust` 协议方法）：项目 `plugins.dirs` 声明的目录插件默认不信任，信任记录写用户域 `security/workspace-plugin-trust-v1.json`，绑定插件根相对路径与声明摘要。本仓没有项目级插件声明，**现在没有可承载的功能**。登记触发条件：出现「随仓分发 zcode 插件」需求时立项实施——桥接补 `setWorkspacePluginTrust` 代理＋宿主 API（ACP 形态无设置页，须宿主代为写入信任＋治理留痕）。本批不动代码。

### 4. 上下文微压缩（观察登记级，P4 自动生效）

上游 compact 设计 §1.5：局部上下文压力或长时间空闲时先清理旧 tool result（保留占位符、大小、tool id、artifact 引用），推迟有损整段摘要；成功写 `microcompact_boundary` 等价事件（trigger、strategy、pre/post token、cleared/kept tool call ids、traceId），事件只服务观测与 UI。引擎自动生效，宿主无需适配。登记观测口径：本仓用量观测面板未来如出现上下文压缩类指标，须能把 microcompact 与 full compact 分开计数（事件类型即区分键）；本批不动代码。

### 附带：一条设计约束入册

对照报告 §二.2 的上游存量缺陷（配置分层合并时高优先级层整体替换嵌套字段，`permission`/`network` 等受影响；触发条件恰是「建会话带 mode」——本仓派单正是带 mode）：本仓与本机当前无 zcode 权限列表配置，无实际影响，但**权限治理只能走宿主执行层（现有三级链与工具管线），不能靠 zcode 配置的权限列表**。此约束在实施批写入 `docs/DESIGN.md`。

### 任务卡

#### 完成条件

1. P1 预装文档工具：引擎拉起时检测到预装 bin 目录即注入 PATH 前缀与 `ZCODE_PREINSTALLED_TOOLS_AVAILABLE=1`，未检测到则不注入（无报错、无假设）；注入与否各留一行日志；隔离引擎实证：注入后会话内 `command -v pdftotext` 命中预装入口；离线说明补能力边界句。新机制登记 `config/mechanism-budget.json`（带 sunset）。
2. P2 设计插件：缓存版本核实报告；隔离引擎 `design` 技能实证一例（HTML 原型产出＋lint）；培训手册补使用场景与分工节；与本仓设计技能重复面说清。
3. P3/P4：触发条件与观测口径登记在案（本规格即登记载体），未触发不动代码。
4. 设计约束（权限治理不走 zcode 配置权限列表）随 P1 或 P2 实施批写入 `docs/DESIGN.md`。
5. 回归矩阵合并档通过；N34-3 台账状态回填「已立项」。

#### 输入与来源

N34-3 对照报告（四项能力的上游证据与建议）；上游规格 `docs/preinstalled-tools/README.md`、`apps/zcode-cli/docs/design/v2/preinstalled-document-tools.md`、`docs/plugins/workspace-plugin-dir-trust.md`、compact README §1.5；本机插件缓存目录实测。

#### 工作流边界

只改本仓 `scripts/`、`docs/`、培训手册与观测口径；不改 `vendor/` 受跟踪文件；预装工具只复用桌面版已装目录，不下载、不镜像；离线包口径不动（用户裁决＝说明写明不可用）。

#### 工具与副作用

引擎拉起多一次目录存在性检测（微秒级）；P1 注入只影响装有桌面版的机器；P2 刷新插件缓存只动 `~/.zcode/cli/plugins/cache`，不触宿主运行时模板。

#### 结果与证据

见各实施批的「验证」段；本立项批的证据＝对照报告＋本节源码核实记录。

#### 异常与恢复

P1 注入失败（目录在但入口残缺）按上游规则 2/3 自然回退，不阻断引擎拉起；P2 实证失败（会话不认 design 技能）降级为「刷新缓存后复测，仍失败则升级 P2 为实施级」。

#### 验收反例

- P1：预装目录不存在时引擎启动报错或注入半成品环境＝不合格。
- P2：把「缓存里有 design 目录」直接当「4.0 新设计能力可用」＝不合格（必须版本核实＋实证）。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | 四项分级：预装文档工具＝吸收实施（P1）、设计插件＝试用验证（P2）、信任通道＝观察登记（P3 触发制）、微压缩＝观察登记（P4） | 对照报告建议＋源码核实（预装链路桌面独占、服务端契约仅 env/PATH 两个可继承事实；design 已在插件缓存 likely 可用；另两项无承载功能/自动生效） | 四项全做实施（否决：P3 无需求、P4 零工作量，立项实施＝空转）；四项全观察（否决：P1 对本仓派单会话是真实能力增益，用户已批准立项） |
| D2 | 预装工具宿主侧复用桌面目录，不自建下载链 | 上游下载/协调/安装记录 17 文件是桌面主进程链路；Agent 侧契约仅 env＋PATH，引擎进程环境被子进程继承；本机桌面版已装目录可直接复用 | 移植下载链（否决：成本高、离线机仍拿不到资源，与 D3 口径冲突）；只做说明不做注入（否决：在线机明明有资源却用不上，能力吸收落空） |
| D3 | 离线适配＝说明写明不可用（用户裁决 2026-11-25） | R134 口径（可源装的不内嵌）＋预装二进制体积数百 MB；离线机回退路径上游已有（规则 3） | 离线包内置（否决：体积与 R134 冲突，需先修订口径）；不做此项（否决：用户已批准立项） |
| D4 | 信任通道与微压缩只登记触发条件，不动代码 | 本仓无项目级插件声明；微压缩引擎自动生效且观测面本仓尚无压缩类指标 | 提前桥接 setWorkspacePluginTrust（否决：无消费者的新桥接面＝机制通胀，违反机制预算纪律） |

## 验证

立项批只读核实（2026-11-25，主工作区，不产生提交）：

- 预装链路实现面＝`packages/desktop/src/preinstalled-tools/`（17 文件，下载/协调/安装记录），CLI 侧仅测试与适配器消费 env 契约，无安装命令。
- Agent 侧契约原文：`Web 服务端和独立 CLI 不注入这个变量，也不在 PATH 前加 <bin>`（`apps/zcode-cli/docs/design/v2/preinstalled-document-tools.md:20`）。
- `setWorkspacePluginTrust` 签名核实：`zcodeAgentService.ts:6080`，走 plugin-management 的 `pluginsWorkspaceTrust` 协议方法，参数 workspace/pluginRoot/declarationDigest/trusted。
- 插件缓存目录 `~/.zcode/cli/plugins/cache/zcode-plugins-official/` 已含 `design`、`documents`、`pdf` 等（版本未核实，P2 事项）。
- 微压缩 §1.5：`microcompact_boundary` 事件带 trigger/strategy/pre-post token/cleared-kept tool call ids，只服务观测与 UI。

## 设计文档影响

DESIGN_SYNC: none（立项批）。权限治理约束（不走 zcode 配置权限列表）已决策入册，随 P1/P2 实施批对 `docs/DESIGN.md` 做真实修订时落地——单独改设计正本会被提交钩子拦，故不在本批。
