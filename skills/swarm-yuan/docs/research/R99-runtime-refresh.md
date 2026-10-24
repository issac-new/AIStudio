# R99 运行时例行刷新轮（2026-10-09）

> 触发：用户 /goal 三目标（本轮为其中「research 目录运行时更新到最新稳定版+差异比较+吸收+回归+发版」目标）。口径同 R97 例行轮：research/ 克隆升级到最新稳定 tag、无 release 通道的快进 main tip、差异过决策 46 两问后吸收、表行回写。R98 号位被并行会话 mem-adapter 轮占用（worktree `.claude/worktrees/r98-mem-adapter`），本轮顺延 R99——两轮若同日合流，版本号以先落 main 者为准顺延。

## 一、移动面（3 移动，18 行零移动）

| 运行时 | 旧基线 | 新基线 | 跨度 | 实质判定 |
|---|---|---|---|---|
| claude-code | 2.1.292 | 2.1.294 | 2 版 | 实质（294 指令式钩子执行力 + 293 大修复批） |
| ocr | v1.12.12 | v1.12.13 | patch | 薄（扫描根路径 "." 归一 + 超时口径文档化） |
| ruflo | v3.54.1 | v3.55.0 | minor | 中等（共享 toast 系统成体系 + 见证清单重签） |

零移动：codex（rust-v0.161.0=最新，R97 已升）、codex-security（npm-v0.2.0=最新）、claude-mem（v13.34.2=最新）、graphify（v0.9.80=最新）、gsd-core（v1.16.0=最新）、ECC（v2.2.3=最新）、superpowers（v6.4.2=最新）、GitNexus（v1.6.12=最新）、mattpocock-skills（v1.3.1=最新）、openspec（1.14.1=最新）、pua（v3.5.1=最新）、comet（0.4.4=最新）、dsh（0.2.1-alpha.1 后无新 tag）、better-harness（v0.6.6=最新 stable；远端 v0.7.0-alpha2 为 alpha 不取）、gstack/harnesseval-w/semantica（无 tag 通道，本轮未快进——main tip 前移留待下轮批量）。

## 二、核验锚点

- claude-code 2.1.294：GitHub releases/latest 实测 2026-10-08T05:03Z；npm 通道同版；**live CLI 本机 2.1.294=漂移归零**（`claude --version` 实测）。
- ocr v1.12.13：release 2026-10-08T12:05Z（#1673/#1159 两个修复 + 超时口径文档）。
- ruflo v3.55.0：release 2026-10-07T18:03Z；tag+registry 同步；181 文件 +10457（含 verification/ 见证清单三平台重签）。

## 三、吸收（过决策 46 两问，一档实质 + 两档薄）

1. `references/claude-code-capabilities.md` 新增 v2.1.293-294 段 + 版本基线 2.1.292→2.1.294：
   - **指令式钩子的执行力**（294）：`prompt`/`agent` hooks 以自然语言指令写就时（如「拦截××命令」），宿主现在真正**判定并执行**其阻断意图——指令式守门从「写给模型看」升为「宿主裁决」；Stop/SubagentStop 指令钩子的判定同步收紧（模型更不会提前停）。方法层：**指令即门禁需要裁决路径，不依赖模型自觉**。
   - **工具 schema 可见性经济学**（293）：`$.tool.register` 的 `isDeferred`——工具 schema 可不进首轮 prompt（deferred definitions），需要时再展开；`subagentStatusLine` 载荷带 `agentType`（状态行脚本可辨自定义子代理类型）。
   - **压缩边界不动已完成态**（293）：修 Claude 把自己压缩前最后动作当未做完而回撤重做——**compaction 是上下文手术，不是任务状态重置**。
   - **资源核算**（293）：HTTP MCP 连接此前保留其发过的每个请求直到关闭（内存泄漏）——长连通道必须对历史请求有回收策略。
   - 其余：排队消息在 `←` 后台化时的保全、被移除工具不再写进指令（诚实指令面）、`claude plugin test` 的 `mock.session`（插件测试可回读 append 行——测试面补齐）、Docker Desktop 凭据链接拒绝时点名来源。
2. ruflo 3.55.0（薄吸收，记 baseline 行）：共享 toast 系统（等级/去重/持久化 + ADR-477 策略位；**toast 绑定 session.start 而非 engine.create**——生命周期锚定在会话而非引擎；held errors 定时释放）——通知面「等级+去重+持久化+生命周期锚定」四要素完整样本。
3. ocr 1.12.13（薄，表行回写）：扫描根 "." 归一 + 分隔符转换（Windows 路径）；LLM 独立超时与 deadline 诊断进文档。

## 四、同构观察（跨运行时主题）

- **指令的裁决权上移**：claude-code 294 把「写给人的指令」变成「宿主执行的判定」，与 codex 0.161 提权保留拒绝面同向——守门逻辑从 prompt 层沉淀到宿主层是两宿主同期主轴。
- **生命周期锚点**：ruflo toast 绑 session.start（非 engine.create）与 claude-code 排队消息绑会话不走引擎，同周把「归属谁」从引擎级细化到会话级。

## 五、验证

- self-check.sh / run-sweep / test-r68-jargon-free：见本轮发版记录（v2.61.0）。
- 回归：典型前后端项目验证（本轮 = order-forge 全栈模板再证），见 CHANGELOG。
