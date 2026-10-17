# Spec：incident 报告 data_sources 证据锚空值热修（合并致 TS18047 阻断 server 启动）

- 分支：`fix/incident-trace-null-anchor`
- 日期：2026-10-17
- 上游：用户「批准继续」激活补丁 642（zcode Global 模式接纳个人 provider 层模型）——重启 8647 后端时暴露
- 前序：47187c86 合并 origin/main（8 提交）入本地 main；本地 main 侧 878ef812（SIM 真实源回退接线）与 origin 侧 incident 改动文本自动合并无冲突

## 问题定义（现场实证）
1. **main HEAD 不可编译**：`custom/server/incident/incident-report.ts:254` 在分支条件已放宽为
   `sourceTools.length > 0 && (bundle.trace || bundle.messages)` 的前提下，证据锚仍无守卫取
   `bundle.trace.file`。ts-node（serve-server 设 `TS_NODE_FILES=1` 开类型检查）报
   `TS18047: 'bundle.trace' is possibly 'null'`，8647 后端进程启动即死（/tmp/dev-8647.log 实录）。
2. **为何此前未暴露**：老进程 01:59 启动，编译的是合并前的 main；合并只改了工作树文件，进程内
   模块缓存不变。首次重启（为激活 642）才撞上——这是「两条并行流各自绿、合并后语义不兼容」的
   典型形态，git 文本合并无法发现，只有编译/测试能发现。
3. **影响面**：8647 停服期间并行会话的 vite dev（8649）无后端；桌面 app 不受影响（独立构建物）。

## 修复
- 254 行证据锚改为 `bundle.trace ? \`${bundle.trace.file}#tool_span.args\` : \`${dbLabel}#messages.tool_name\``，
  与同函数 239 行 reasoning_tokens 锚（trace 在引 trace，否则引消息库）同构；messages 回退语义
  （878ef812 的 absent 10→0 目标）保留，trace 缺席时锚指向真正供数的 messages.tool_name。
- 不改分支条件、不回退 878ef812、不碰 upstream。

## 验收
- 共享 upstream 树 `tsc --noEmit -p packages/server/tsconfig.json` 零错（custom 经符号链接纳入）。
- 8647 后端以原 cwd/env（overlay 根，`HERMES_WEB_UI_DEV_BOOTSTRAP=1 PORT=8647`）重启成功、端口监听。
- 补丁 642 随之生效：zcode 模型发现接口列出个人层模型（活体验证）。

## 决策记录

| # | 决策 | 理由 | 替代（否） | 可逆 |
|---|---|---|---|---|
| D1 | 证据锚按 trace 存在性回退 messages 锚，而非收窄分支条件回 `bundle.trace` | 878ef812 放宽条件是为让 messages 单源也能产出 data_sources（absent 清零）；收窄条件=回退该目标 | 收窄条件（丢 messages 回退） / `bundle.trace!.file`（掩盖空值，运行时炸） | 可逆 |
| D2 | 走 worktree 分支 + spec 随提交，不用 `git commit --no-verify` | 逃生门绕过 L2 门禁会让「合并致编译断裂」这类跨会话风险无档可查；一行热修多花两分钟换留痕 | `--no-verify`（快但无痕） | — |
| D3 | 8647 重启用 `start_new_session` 托孤、沿用 /tmp/dev-8647.log | 原进程 ppid=1 独立会话；随我会话进程组起的进程会被会话清理连坐（session-cleanup 先例） | nohup &（同组仍连坐） | 可逆 |
| D4 | 激活 642 用 ensure-injected 差量补套而非 clean→inject | 共享树含并行会话约 12 个文件未入库改动：clean 可能成功而 inject precheck 拒绝，留下无补丁树（线上立坏） | clean→inject 全量 | 可逆（git apply -R） |

## 复发防线（建议，本次未落）
- 合并 origin/main 后、重启服务前，先跑一次 server `tsc --noEmit`：把「并行流合并后语义冲突」从
  线上重启时暴露提前到合并时暴露。可作为 worktree-flow 收口步骤的固定检查项。
