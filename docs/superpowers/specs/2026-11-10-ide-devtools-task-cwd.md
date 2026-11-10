# IDE 工具启动带入任务工作区（2026-11-10）

> 用户指令：在「IDE 工作区-工具」点击打开 Zcode 或 DeepSeek Harness APP 后，选中 kanban 任务的 workspace 作为打开后编程工具的工作区根目录。

## 变更

1. **客户端**（`custom/client/ide/components/IdeDevTools.vue`）：zcode／DeepSeek Harness APP 按钮启动时携带 `root`（`useIdeWorkspace` 单一事实源）。其最高优先级即**已物化的任务根**（`ide.taskWorkspace`，patch 658）——选中看板任务（侧栏/看板卡→`setActiveTask`→工作区解析物化）后 `root` 即任务工作区，天然满足需求；无任务时按既有回退链（会话/偏好），与面板主按钮「在工作区终端运行 zcode」语义一致。title/hint 同步展示。
2. **服务端**（`custom/server/controllers/ide/devtools.ts`）：
   - darwin APP 键：`open -a <App> <dir>`（macOS 标准目录契约；无 cwd 时行为不变）。
   - win32 zcode：`start "" /d "<dir>" zcode`——工作目录确定性生效；无 cwd 时维持现状。
   - `validateCwd` 既有校验（必须已存在目录）不变；白名单/无命令字符串红线不变。
3. 测试：服务端 `devtools.test.ts` 增 launch-plan 断言（darwin 双 APP 带目录/不带、win32 /d）；客户端 `devtools-ui.test.ts` 增 APP 按钮带 cwd 断言。

## 决策记录

| # | 决策 | 依据 | 备选（否决理由） |
|---|---|---|---|
| D1 | cwd 取 `useIdeWorkspace().root` 而非专门取任务字段 | root 优先级 task>session>preference，选中任务即任务工作区；与 terminal-zcode 主按钮同源不分裂 | 只在 source==='task' 时传（否决：无任务时与会话/偏好根分裂，两按钮语义漂移） |
| D2 | darwin GUI 传目录用 `open -a <App> <dir>`，不深改 ZCode.app | macOS 标准契约；ZCode.app 当前无 `open-file` 处理（实测 rg 零命中）——目录被忽略时 APP 照常打开，无副作用；接入 ZCode 桌面内部会话面属 zcode-patches 深改，另批立项 | 本批即加 zcode-patches open-file→workspace（否决：desktop 会话面深水区，回归面远超本批） |
| D3 | win32 用 `start "" /d` | 进程工作目录确定性生效，无需 app 配合 | 只做 darwin（否决：win32 一行可得） |

## 验证

- 服务端：`npx vitest run custom/server/controllers/ide/__tests__/devtools.test.ts`——新增：darwin zcode/DSH 带 cwd → `['open','-a',App,resolve(dir)]`；不带 cwd → 原 `['open','-a',App]`；win32 zcode 带 cwd → `start "" /d <dir> zcode`；terminal-zcode 既有断言不回归。
- 客户端：`npx vitest run custom/client/ide/__tests__/devtools-ui.test.ts`——zcode/DSH 按钮 launch 携带 cwd=root；root 空时不带。
- `npm run typecheck:harness`（devtools.ts 已在点名清单）。

## 设计文档影响

DESIGN_SYNC: none

纯交互补齐：工具启动的工作区取值沿用既有 `useIdeWorkspace` 单一事实源，不新增设计边界；D2 的 ZCode.app open-file 缺口作为披露项记入本 spec（后续 zcode-patches 批的候选输入），不改 DESIGN.md 既有章节。
