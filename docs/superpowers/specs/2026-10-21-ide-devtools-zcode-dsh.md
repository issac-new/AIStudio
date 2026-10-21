# IDE 工作区工具面板：可打开 zcode 与 DeepSeek Harness（bug 修复）

日期：2026-10-21
分支：`fix/ide-devtools-zcode-dsh`
来源：用户报障——「IDE工作台」的工具要可打开 zcode、deepseek-harness（本机均已安装）。

## 变更

**服务端**（`custom/server/controllers/ide/devtools.ts`）

- `TOOL_DEFS` 新增 `deepseek-harness`（app=`DeepSeek Harness`，darwin）：网格按钮直接
  `open -a "DeepSeek Harness"`，可用性按 `/Applications/DeepSeek Harness.app` 探测。
- `terminal-zcode` 启动命令改走**受管 fork 源码树 CLI**
  （`upstream/zcode/apps/zcode-cli/packages/cli/dist/zcode.cjs`，`npm run zcode:ensure` 的构建产物），
  缺席时回落 PATH 的 `zcode`。新增 `ZCODE_CLI_DIST` 常量与 `resolveZcodeCli(exists)`（可注入）。

**客户端**（`custom/client/ide/components/IdeDevTools.vue`）

- 面板标题/注释纳入 DeepSeek Harness；面板宽 300→320、按钮 line-height 1.25（容纳长标签换行）。

**测试**

- `devtools.test.ts`：terminal-zcode 双分支（fork CLI 优先 / PATH 回落）+ deepseek 可用性探测。
- `devtools-ui.test.ts`：面板含 deepseek-harness 按钮、点击 `launch('deepseek-harness', undefined)`。

## 决策记录

1. **zcode 终端入口不依赖 PATH**：本机 `which zcode` 无果（全局只有 `zcode-acp-server`），旧实现
   `cd <cwd> && zcode` 必然 command not found——这就是「打不开 zcode」的 bug 本体。
2. **不用 ZCode.app 内置 `Resources/glm/zcode.cjs`**：实测 standalone 运行报
   `Cannot find package '@zcode/tui'`——该 bundle 只能在 ZCode.app 自己的 Electron Helper 里跑
   （本机在跑的 `zcode-cli` 进程全是 app 子进程）。留档防后人再踩。
3. **用受管 fork 构建产物**：IDE 引擎本就建立在 `upstream/zcode` 受管 fork 上
   （`npm run zcode:serve` 同源），终端入口与引擎同源一致；`resolveZcodeCli` 按文件存在探测，
   缺席回落 PATH `zcode`（其他机器装了全局 CLI 仍可用）。
4. **DeepSeek Harness 走 app 按钮、不加终端 CLI 入口**：本机装的是 `DeepSeek Harness.app`
   （`/opt/homebrew/bin/dsh` CLI 为 0.1.1-rc.2，落后于桌面 app）；用户诉求是「打开」，
   app 按钮是直给动线。dsh TUI 入口等产品层点名再做。
5. **deepseek-harness 仅 darwin**：Windows 侧应用名/安装形态未实核，不造恒可用的假按钮
   （win32 现有可用性逻辑本就乐观，不扩大）。
6. **安全边界不变**：仍白名单 key+可选 cwd、命令服务端拼装、cwd 必须存在目录；
   fork CLI 路径是常量非用户输入。

## 验证

- 单测：`devtools.test.ts` 9 例 + `devtools-ui.test.ts` 10 例全过（19/19）。
- 浏览器（8649 热更 + 8647 新后端）：面板出现「DeepSeek Harness」按钮且可用；
  点击后 `/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness` 进程拉起（实测）。
- terminal-zcode 端到端：以与服务端 `execFile` 完全相同的 osascript 在 Terminal 执行
  `cd <工作区> && node '<fork CLI>'` → 新 `zcode-cli` 进程（CLI 会改进程标题，按
  `pgrep -x zcode-cli` 前后差集确认）在 Terminal 标签内运行 TUI。
- 旁路核验：`node <fork CLI> --version` → 0.17.0；`node <app 内置 bundle>` → 复现
  `@zcode/tui` 解析失败（决策 2 依据）。

## 环境旁注（并行会话干扰，非本修复内容）

- 验证途中 `upstream/hermes-studio/packages/server/src/custom` 符号链接被并行会话指到
  `serve-main` 旧 worktree（inject.mjs 注释里的已知坑），导致 8647 一度加载无本修复的旧代码；
  已按 CLAUDE.md 口径恢复为 `overlay/custom/server` 并重启后端。后续会话若复现「改动不生效」
  先查该链接。
