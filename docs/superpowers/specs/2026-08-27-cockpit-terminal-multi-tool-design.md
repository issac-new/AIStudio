# Cockpit 终端多工具支持（Claude Code / Codex / DeepSeek Harness）设计

日期：2026-08-27
分支：`feat/cockpit-terminal-multi-tool`
状态：已实施

## 背景与需求

AI协作中心（client，cockpit）的"终端"（CockpitTerminalPane，PTY via `/api/hermes/terminal`）
此前在 session 创建后硬编码启动 Claude Code（agent teams 实验 flag + 免审批）。

需求：终端支持三类编码工具，**优先顺序 claude code > codex > deepseek harness**。

## 方案

### 1. 工具注册表（client）

`custom/client/cockpit/terminal/terminal-tools.ts`：

- `TERMINAL_TOOLS` 数组顺序即优先顺序：
  1. `claude-code`（bin `claude`）
  2. `codex`（bin `codex`）
  3. `deepseek-harness`（bin `dsh`，DeepSeek 官方 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)）
- `buildToolInitCommand(id, workspacePath, isWindows)`：按 Unix/PowerShell 两种语法生成
  `cd + env + 工具命令`，经 PTY 注入执行（沿用既有机制）：
  - claude-code：保持原命令不变（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude agents --dangerously-skip-permissions --effort max`）
  - codex：`codex --dangerously-bypass-approvals-and-sandbox`（与 claude 免审批对齐）
  - dsh：`dsh --profile tui`（dsh 以调用目录为 workspace root；tui profile 需本机 `dsh plugin` 安装）
- `pickDefaultTool(installedIds, saved)`：已保存且仍安装 → 保存值；否则按优先顺序取第一个已安装；
  全部未装/探测失败 → 回退 `claude-code`（即原行为）。
- 手动选择持久化于 `localStorage['hermes_cockpit_terminal_tool']`。

### 2. 服务端可用性探测

`custom/server/controllers/hermes/terminal-tools.ts` + patch `189-server-routes-terminal-tools.patch`：

- `GET /api/hermes/terminal-tools` → `{ tools: [{ id, installed, path }] }`（优先顺序）
- 实现：fs 扫描 `process.env.PATH`（Windows 走 PATHEXT 扩展名），与 node-pty 子进程
  实际继承的 PATH 完全一致，无子进程开销；注册于 auth 保护段（同 traceRoutes）。

### 3. 终端面板 UI（CockpitTerminalPane）

- 头部新增工具下拉：选项按优先顺序排列；探测到未安装的工具禁用并标注
  （`cockpit.termToolNotInstalled`）；探测失败（旧服务端）不禁用任何选项。
- `onMounted` 先探测再开终端，保证首个 session 就启动正确工具。
- 切换工具 = 持久化选择 + 重启终端会话（旧会话中前一个工具可能在前台运行，直接注入新命令不可预期）。

### 4. i18n

patch `190/191-client-i18n-terminal-tools-en/zh.patch`：cockpit 块新增
`termTool`、`termToolNotInstalled`（以独立行插入，沿用 patch 167 惯例）。

## 明确不做

- 不改 upstream 终端 WS 协议（create 不加参数，仍走"shell 注入命令"路径）。
- 不做 per-tool 参数自定义 UI；启动 preset 硬编码于注册表，调整成本 = 改一个文件。
- 不接入 standalone TerminalView（侧栏终端是通用 shell，无工具启动语义）。

## 验证

- `npm run clean && npm run inject`：189/190/191 从 pristine 全量应用 ✓
- `npm test`：68 文件 / **511 通过 / 6 跳过 / 0 失败**（基线 484 + 新增 27）
- `npm run build`（vite）✓；`tsc --noEmit -p packages/server/tsconfig.json` ✓
- 新增测试：`terminal-tools.test.ts`（14）、`cockpit-terminal-pane.test.ts`（3→11）、
  server `terminal-tools.test.ts`（5）；测试曾抓出 `toolOptions` map 参数遮蔽 i18n `t` 的真实 bug。
