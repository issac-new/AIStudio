# IDE Code Mode 吸收评估与集成方案（C1）

日期：2026-09-29。状态：评估完成（实证），引擎接线立项待批。评估人：本 IDE 升级轮。

## 一、结论

@opencode/codemode（MIT）可直接吸收：解释器、预算强制、语法白名单在实测中全部工作。两个硬约束决定集成路径：**effect 版本钉死 4.0.0-rc.112（RC 版）**；**工具值回传在 bun 宿主下正常、在 Node+tsx 转译下断裂**。因此引擎侧接线必须以 bun 子进程宿主（或先修 Node 路径），不适合直接嵌进 studio server 进程。

## 二、实证记录（探针可复跑）

探针环境：/tmp/codemode-probe（npm effect@4.0.0-rc.112 + acorn@8.15.0 + v2 分支 packages/codemode/src 全量 45 文件 vendored）。

| 用例 | 结果 |
|---|---|
| 官方范式工具（Effect Schema input/output + Effect.succeed）+ `return await tools.echo({...})` | bun：`value:"echo:hi"` ✅；node+tsx：`value:null` ❌（工具已调用、值未回传） |
| 预算强制 maxToolCalls=1、程序调两次 | bun/node 均抛 `ToolCallLimitExceeded` ✅ |
| 语法白名单 `class A {}` | `UnsupportedSyntax: ClassDeclaration not supported` ✅ |
| toolCalls 审计 | 结果携带每次调用名 ✅ |

## 三、三个 API 陷阱（照抄官方测试也会踩）

1. **limits 在 `CodeMode.make({ limits })` 绑定**，`runtime.execute(code)` 单参。第二参传 limits 会被静默忽略（预算形同虚设）——探针实证两次。
2. **工具只能经 `tools` 树访问**（`tools.echo(...)`），裸标识符报 Unknown identifier。
3. **execute 返回 Effect**，须 `Effect.runPromise` 驱动；工具 execute 也须返回 Effect（plain Promise 报 `Not a valid effect`）。

## 四、集成方案（下一轮）

**路径 A（推荐）：zcode 引擎工具面。** 给 upstream/zcode 加 zcode-patch，注册 `code_mode` 工具：入参 `{ program: string, timeoutMs?, maxToolCalls?, maxOutputBytes? }`，出参 `{ ok, value?, error?, toolCalls[] }`。工具实现侧 spawn bun 子进程跑 vendored 解释器（脚本+依赖随 extraResources 分发），工具面只暴露 workspace 内安全工具（fs 读/ls、git query——写操作不进 v1）。优点：代理可直接调用、审计随引擎走。代价：zcode patch 链 +1，构建分发多一份 bun 脚本。

**路径 B：studio 侧 MCP server。** overlay 提供 stdio MCP server 暴露 code_mode。优点：不动引擎。代价：zcode 引擎 MCP 注入面未验证，且工具无法拿到引擎会话上下文。

**Non-goals（v1）**：OpenAPI.fromSpec 工具生成、extension globals（fetch 等）、插件 hooks 面。

## 五、依赖与许可

- 依赖：effect@4.0.0-rc.112（RC 钉版，升级须回归探针三用例）、acorn@8.15.0。
- 许可：MIT（opencode (2025)），vendoring 保留原始版权头。
- 源体积：src 45 文件约 250KB（interpreter.ts 92KB 为主）。

## 附：复跑探针

```bash
mkdir probe && cd probe && npm init -y && npm i effect@4.0.0-rc.112 acorn@8.15.0
# 下载 v2 分支 packages/codemode/src/** → ./src
cat > probe3.mts <<'EOF'
import { Effect, Schema } from 'effect'
import { CodeMode, Tool } from './src/index.ts'
const echo = Tool.make({ description: 'echo', input: Schema.Struct({ text: Schema.String }), output: Schema.String, execute: (i) => Effect.succeed(`echo:${i.text}`) })
const rt = CodeMode.make({ tools: { echo }, limits: { timeoutMs: 5000, maxToolCalls: 10, maxOutputBytes: 65536 } })
console.log(JSON.stringify(await Effect.runPromise(rt.execute('return await tools.echo({ text: "hi" })'))))
EOF
bun run probe3.mts   # 期望 value:"echo:hi"
```
