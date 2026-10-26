# 编码 Agent UI 功能全景调研（claude code / codex / kimi code / minimax code）

日期：2026-09-19 ｜ 用途：/ide IDE 工作台功能吸收提案的依据（兼供 vela fork 参照）
调研方式：四路一手源——codex 与 kimi/minimax 为本地浅克隆源码盘点（/tmp/codex-recon、/tmp/kimi-code-recon、/tmp/minimax-code-recon、/tmp/minimax-cli-recon），claude code 为官方 CHANGELOG 2.1.267–2.1.278 条目。

## 1. 四产品定位速览

| 产品 | 形态 | 源码 | 关键词 |
|---|---|---|---|
| claude code 2.1.27x | 终端 + VSCode 面板 + Web | 闭源（changelog 调研） | agent map、memory/hooks/permission 对话框、per-change diff 接受/拒绝、后台任务面板 |
| codex rust-v0.155.1 | Rust TUI + app-server 协议 | Apache-2.0 | 45+ 斜杠命令、审批选项全集、vim、statusline 35 项、agents 总览、/plan、语音 |
| kimi-code | TS monorepo：TUI+VSCode 扩展+web+ACP | MIT | goal 自治、steer、/btw 侧聊、swarm/tower、remote control、会话基线 diff |
| minimax mcode | TS monorepo：TUI+headless+ACP（桌面闭源） | MIT | goal+预算、会话三态编辑（fork/rewind/edit）、结构化 diff 状态、ACP 私有扩展（queue/steer/goal） |

## 2. 对 /ide 最有价值的吸收点（按价值排序，GUI 适配后）

### A. 会话与消息流
1. **steer 运行中转向**（kimi Ctrl-S / mcode Enter / cc send-now）：流式期间输入即时注入运行中 turn 或排队，排队消息可视化可撤回。/ide 已有排队编辑（patch 313），缺 steer 即时注入与排队面板。
2. **会话历史三态编辑**（mcode fork/rewind/edit + cc /rewind）：从此消息分叉（零副作用）、回滚（可选连工作区文件）、改写历史 prompt 重生成。/ide 任务菜单现有 fork 缺失。
3. **/btw 侧聊**（kimi/mmode）：任务运行中开只读分支提问，不打断主 turn。
4. **全局会话搜索**（kimi web）：跨会话全文搜索；/ide 命令面板目前仅任务标题过滤。
5. **归档体验**（cc Unarchive all / mcode /archive）：/ide 已有归档区，补批量恢复。

### B. 任务与代理可视化
6. **agent map 子代理地图**（cc 2.1.269/277 + kimi swarm 网格）：N agents pill → 地图面板，含状态色、Stop agent、只读转录、计数徽标。/ide 现有 subagents 页签可升级。
7. **后台任务中心 /tasks**（cc/kimi/mcode 三家都有）：后台 Bash/Agent/Question 统一面板 + 完成通知。/ide 缺失。
8. **Goal 目标模式**（kimi/mcode + codex 已有 [features].goals）：任务级目标 + 预算 + 暂停/恢复 + 进度 banner，长任务自动续跑。
9. **todo 面板**（mcode Ctrl-T / kimi Ctrl-T）：/ide 上游 MessageList 已渲染 todo 卡，缺常驻面板。

### C. 审查与 diff
10. **会话基线 diff**（kimi kimi-baseline:// + VSCode 原生 diff）：变更审查以"会话起点快照"为基线而非 git HEAD，track/revert/keep 单文件或全部。比 git diff 更贴 agent 会话语义。
11. **per-change 接受/拒绝**（cc 2.1.277）：diff 标签页每个变更下直接 accept/reject。
12. **结构化 diff 状态**（mcode）：applied/proposed/not-applied 状态色 + 折叠计数。

### D. 上下文与用量
13. **状态栏升级**（mcode 15 项 / codex 35 项 / kimi 双行 footer）：上下文剩余、token 用量与配额、缓存命中率、模型+effort、git 徽章。/ide IdeStatusBar 现仅 workspace+运行态。
14. **上下文容量条 + compact 引导**（mcode capacity-meter + kimi 缓存过期提示）：水位可视化 + 一键 compact。
15. **模型/effort 快速切换**（codex /model + Alt+,/.、mcode thinking 变体/effort、kimi models.dev 目录）：含 context-window 显示。

### E. 配置与生态（GUI 对话框化）
16. **memory 对话框**（cc 2.1.274/277：查看/编辑/删除记忆 + 开关）：/ide memory 页签现只读。
17. **hooks / permission rules 对话框**（cc 2.1.269/271）：规则可视化管理。
18. **对话式 MCP 配置**（kimi /mcp-config）：自然语言增删改 MCP + OAuth 引导。
19. **provider 三格式管理**（mcode provider add --api-format：openai-completions/openai-responses/anthropic-messages + --use 连通测试；kimi /provider manager）：与 vela M1 三格式完全同构，UI 可先行。

### F. 输入与媒体
20. **图片/视频粘贴 + 预览缩略图**（kimi 视频输入独有；三家图片粘贴）：>20MB 淘汰最旧告警。
21. **外部编辑器长 prompt**（三家 Ctrl-G）。
22. **Mermaid/LaTeX 渲染**（kimi 终端内 mermaid 图 + LaTeX Unicode；GUI 侧更易）。

### G. 其他
23. **审批选项分级**（codex 前缀放行/会话放行/主机放行全集 + mcode 单次/总是/拒绝 + 云端分类器）：GUI 审批卡选项对齐全集。
24. **cron 定时**（kimi 会话内 CronCreate / mcode cron active-hours + 报告投递）：/ide 已有 JobsView 入口，补会话内定时。
25. **statusline 自定义命令契约**（kimi 兼容 Claude Code statusLine 协议：stdin JSON 快照 → stdout 首行）。

## 3. /ide 现状对照（要点）

现行态（2026-09-19）：三栏壳 + 任务侧栏（organize 三模式/置顶/归档）+ 中列会话（messages|subagents 页签 + RunTrace）+ 右 8 页签（review/browser/wiki/assistant/storage/memory/board/terminal）+ 终端多开分屏 + 命令面板。已有：排队编辑、模型失效提示、灯箱、PTY 泄漏防护。缺：上述 1-25 的大部分（详细对照见 overlay/custom/client/ide/ 盘点，2026-09-19）。

## 4. vela 参照价值（M1 三格式）

- minimax mcode `packages/tui/src/provider/contract.ts:1-6` 恰好定义同样的三格式（openai-completions/openai-responses/anthropic-messages），MIT 许可，其 provider add --use 连通测试交互可参考。
- kimi kosong LLM 抽象层含 anthropic 实现，适配器翻译模式可参考。
- codex 0.155.1 仅剩 wire_api=responses（chat 已删），三格式中两种需自写，与 vela spec §4 一致。

## 5. 详细调研原始清单

四份完整清单（含锚点）存于本次会话调研记录：codex TUI/app-server 全集、kimi-code 全集+10 亮点、mcode 全集+10 亮点、mmx 媒体 CLI。如需固化，按需另存。
