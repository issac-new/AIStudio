# IDE 工作区工具面板收窄：只保留 zcode 与 DeepSeek Harness

日期：2026-11-10
分支：`fix/ide-devtools-trim`
来源：用户令——「IDE工作区」工具打开去掉 iterm，只保留 Zcode 和 deepseek harness。

## 变更

**服务端**（`custom/server/controllers/ide/devtools.ts`）

- `TOOL_DEFS` 从 9 项收窄为 2 项：`zcode` + `deepseek-harness`；退役
  `vscode` / `iterm` / `warp` / `terminal` / `idea`（darwin）与 `powershell` / `cmd`（win32）。
- `ToolKey` 联合类型同步收窄为 `'zcode' | 'deepseek-harness' | 'terminal-zcode'`
  （`terminal-zcode` 仍是仅启动型伪工具，不在可用性列表）。
- `buildLaunchPlan` 清理死分支：darwin 删 `vscode` 特例；win32 删 `powershell`/`cmd`/
  `vscode`/`idea`/`terminal` 五 case，只留 `zcode` 与 `terminal-zcode`。
  白名单校验不变——退役 key 走到 `buildLaunchPlan`/launch 端点一律拒绝（400/null）。

**客户端**（`custom/client/ide/components/IdeDevTools.vue`）

- 面板注释/按钮 title/底部提示同步收窄；删 `vscode` 带 cwd 打开工作区的特例
  （`launch(t.key, t.key === 'vscode' ? ... : undefined)` → `launch(t.key)`，剩余
  两工具均为 app 直启不带 cwd）。
- 工具网格 3 列 → 2 列（两项不再留空位）。

**测试**

- `custom/server/controllers/ide/__tests__/devtools.test.ts`：退役 key（iterm/vscode/
  powershell/cmd）在两侧平台均拒绝；新增 zcode/deepseek-harness darwin `open -a` 断言
  与 win32 zcode/terminal-zcode 保留断言；可用性探测改按剩余两项。
- `custom/client/ide/__tests__/devtools-ui.test.ts`：mock 契约改为两项；置灰断言改挂
  deepseek-harness（per-test override 可用态），点击动线删 vscode 段。

## 决策记录

1. **「只保留」按全量收窄执行**：用户原话「去掉iterm，只保留 Zcode和deepseek harness」，
   终态白名单=这两项；vscode/终端/IDEA 等一并退役，不是只删 iterm 一项。
2. **`terminal-zcode` 保留**：它是「在工作区终端运行 zcode」主按钮与 CLI 会话「终端继续」
   动线的载体（IdeCliSessions 同走此 key），属 zcode 入口族而非泛终端工具，不在收窄面。
3. **退役 key 不留兼容层**：白名单是安全边界（客户端只传 key），保留死 key 的透传分支
   等于扩 attack surface；旧客户端残页传退役 key 收 400「未知工具（仅白名单）」，符合
   fail-fast。无持久化消费者（列表每次实时探测）。
4. **win32 侧同步收窄**：powershell/cmd/idea 原本就是 Windows 泛终端入口，与本机
   （darwin）诉求同族，一并退役；zcode 在 win32 保留（`cmd /c start zcode` 原路径）。
5. **历史 spec 不回写**：2026-10-19/10-21 两份 spec 是当时的决策事实源，本 spec 为
   收窄后正本；工具面板清单不在设计四正本内（已核 grep 零提及），无 DESIGN_SYNC 面。

## 验证

- `npx vitest run custom/server/controllers/ide/__tests__/devtools.test.ts` —— 11 例全绿
  （含收窄守门：退役 key 双平台拒绝、TOOL_DEFS 恰 2 项）。
- `npx vitest run custom/client/ide/__tests__/devtools-ui.test.ts` —— 15 例全绿
  （面板恰两项、退役 key 无按钮、zcode/deepseek/terminal-zcode 动线）。
- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts` —— 7 例全绿
  （附录 A 标题计数 607→608 随新行同步）。
- 残余引用扫描：custom/ 内退役 key 仅剩无关面（tuicopy 终端形态探测、IdeSidePane
  assistant 选项），无启动动线残留。

## 设计文档影响

DESIGN_SYNC: none —— 四正本（docs/DESIGN.md、swarmstudio-design-ledger、
harness2-improvement-workbench、rrsi-regularized-workbench）经 grep 均不枚举工具面板
清单（iTerm/Warp/devtools/工具面板 0 命中），本批无可同步的设计正本面；spec 索引登记
（附录 A + design index）随批完成。
