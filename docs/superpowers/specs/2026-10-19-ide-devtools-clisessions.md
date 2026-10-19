# IDE 工作区：编程工具启动 + zcode CLI 会话兼容展示（spec）

日期：2026-10-19
分支：`feat/ide-devtools-clisessions`
来源：用户需求——「IDE 工作区」会话与 zcode 工作区会话兼容展示；在该页面可打开 zcode、VS Code、iTerm/Warp、PowerShell、cmd、IDEA 等常用编程工具。

## 变更

**服务端**（`custom/server/controllers/ide/devtools.ts`，挂 `native-routes.ts` 原生中间件，同 patch 489 模式避开 ts-node 路由注册失效面）

- `GET /api/ide/devtools`：白名单工具 + 平台可用性探测（darwin 按 `/Applications/<app>.app`，Terminal 走系统目录；win32 含 PowerShell/cmd）。
- `POST /api/ide/devtools/launch`：启动白名单工具；可选 `cwd`（VS Code 打开该目录；`terminal-zcode` 在终端 `cd <cwd> && zcode`，darwin 走 osascript、win32 走 `cmd /k`）。
- `GET /api/ide/zcode-cli/sessions?limit=`：只读 `~/.zcode/cli/db/db.sqlite`（`ZCODE_CLI_DB` 可覆盖），过滤归档与 subagent 会话，按 `time_updated` 倒序。

**客户端**

- `IdeDevTools.vue`：状态栏常驻「🖥 工具」入口，弹出白名单工具（未安装置灰）；主按钮「在工作区终端运行 zcode」带当前工作区。
- `IdeCliSessions.vue`：zcode CLI 会话列表（标题/工作区短名/相对时间 + `终端继续`/`复制 ID`），boxed/compact 两态。
- 挂载两处：左栏 `IdeTaskSidebar` 新增可折叠「zcode CLI 会话」分组（compact，默认展开，与既有分组同款交互）；落地 `IdeLandingHero`（boxed）。

## 决策记录

1. **白名单是唯一入口**：客户端只传工具 key 与可选 cwd，命令全部服务端拼装；`rm -rf` 之类直接 400。工具集固定（zcode/VS Code/iTerm/Warp/终端/IDEA/PowerShell/cmd + 伪工具 terminal-zcode），加新工具改代码不走配置。
2. **CLI 会话只读展示，不进 chatStore**：zcode CLI 会话在 sqlite，IDE 会话在网关；把 CLI 会话混进 chatStore.sessions 会让点击打开链路拿到打不开的伪 ID。兼容展示=同栏可见 + 源徽区分 + 终端继续动线，不伪造同构。
3. **「终端继续」而不是假的 web 内打开**：zcode CLI 会话无法在 Web 端原生续跑（引擎桥接是另一个会话域）；在会话工作区开终端运行 zcode 是真实可用的动线，`复制 ID` 供 `--resume` 等场景。
4. **侧栏为主挂载点**：落地 hero 实际很少出现（有活跃会话即隐藏，实测新上下文也自动进会话）；会话该出现在会话列表旁——左栏分组常驻可达。
5. **可用性如实探测**：未安装置灰不隐藏（用户点名了这些工具，装了之后刷新即亮）；win32 的 PATH 型（code/idea）启动失败如实报错。
6. **deps 全注入**：devtools.ts 的 sqlite/spawn/exists 均可注入，HTTP 面与纯函数分层，单测不起服务。

## 验证

- 单测：`devtools.test.ts` 8 例（白名单/平台分支/osascript 转义/cwd 校验/整形）+ `devtools-ui.test.ts` 3 例（面板渲染置灰/launch 带 cwd/CLI 行动作）全过；IDE 全套 129 文件 / 785 用例过。
- 构建：`vite build` 通过。
- 真实环境（8648 后端 + 8652 前端）：
  - `GET devtools` 与本机一致（ZCode/VS Code/iTerm/终端=可用，Warp/IDEA=未装）；
  - `POST launch {vscode, cwd=ncwk}` 真实拉起 VS Code（`System Events` 确认 Code 进程）；非法工具 400；
  - `GET zcode-cli/sessions` 返回本机真实会话（含当前会话「肤浅」，subagent 已滤）；
  - 浏览器：左栏「zcode CLI 会话」分组 12 行 + 终端继续/复制 ID；状态栏工具面板可用。
