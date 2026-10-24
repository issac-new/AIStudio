> # R85 运行时刷新轮（2026-10-03，用户 /goal 三目标②触发）
>
> **口径**：例行轮 + R82-R84 表行欠账回填。19 克隆 `git fetch --tags --force` 全量比对 + npm/PyPI registry 实测 + live CLI 版本核。
>
> ## 移动面（5 移动 + gstack tip 快进）
>
> | 运行时 | 旧 → 新 | 判定 |
> |---|---|---|
> | claude-code | 2.1.287 → **2.1.288**（npm latest 实测） | 实质轮：**中断恢复续跑**（mid-response API 超时不再判整轮失败——非交互会话与子代理从部分响应续跑，仅思考响应重试）；**零用量自动压缩**（长会话最后回复报 0 token 用量时不再抛 "Prompt is too long" 而是触发自动压缩）；**结构化输出可关**（`CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS`——Mantle/网关拒结构化输出时标题/记忆召回/提示钩子回退，fail-open 兼容族）；`$.ui.selection()` 选中回传；Ctrl+C 清空后 Up 恢复草稿；MCP OAuth 增权重认证提示；--max-findings；auto mode 拒绝误指 Bash 规则修复 |
> | claude-mem | 13.28.0 → **13.29.0**（15 commits） | **work-state 持久工作态**（#4340：agent 自持待办与工作状态进 claude-mem——任务态出进程持久化的又一实证，与 ruflo 3.50 durable storage 同族）；**sync 楔死修复**（#4346：一个永不可适用的 op 不再永远卡死 pull）；失败工具调用仍是观察（#4339）；Bun 10s idle 超时不打断慢同步（#4344）；有界同步探测+延迟后台重试（#4330） |
> | ruflo | 3.51.0 → **3.51.1**（修复轮） | 3.51.0（R84 已核未回写，欠账本轮补：ADR-406 任务契约+durable storage+headless 观测+/ruflo console）；.1：MCP 服务目的地钉定服务端配置（#3623/#3624 族——宣称目的地以配置为准不漂移）+ pre-bash 拒绝用阻塞退出码（denial 语义可被调用方感知）+ witness manifest 重签 |
> | comet | 0.4.3 → **0.4.4** | 薄轮：release workflow 修复 + dashboard 长项目记忆列表滚动。无新原语，零吸收 |
> | ECC | 2.2.2 → **2.2.3**（R84 欠账并补） | 纯命名退休（"Everything Claude Code" 全称退役），零方法论增量，零吸收（R84 轮已判） |
> | gstack | tip 96764e8 → **74512c2**（+4） | 提交自述 v1.91.15.0（Opus 5.5 prompt 清理+行为级技能测试）。tip 快进记档 |
>
> ## 零移动面（13 行 + 注记）
>
> codex rust 线零 stable：0.160/0.161 全 alpha（R74 起持续），0.162 至 alpha.10——**基线维持 rust-v0.159.3**；dsh **dsh-v0.2.1-alpha.1** 前移注记（0.2.0-rc.2 后线，alpha 不取，rc/stable 出线即深读）；codex-security npm registry 仍断流（latest=0.0.2 占位，git tag npm-v0.1.32 口径维持，第六轮记档）；better-harness 0.7.0-alpha2 不取；openspec 1.14.0 / ocr 1.12.11 / graphify v1.0.0 / gsd-core 1.15.0 / superpowers 6.4.2 / GitNexus rc 线（license-risk 不追）/ pua 3.5.1 / semantica v0.7.0 / harnesseval-w tip 零漂移。
>
> ## live CLI
>
> claude 2.1.286（真身 ~/.local/bin/claude；npm latest 2.1.288，滞后 2 版=I2 观察窗）；codex 0.156.1（基线 0.159.3，滞后 3 个 stable——升级窗口待用户裁决）。
>
> ## 吸收（过决策 46 两问）
>
> 1. **review-methodology.md R85 段**：claude-mem「永不可适用的操作不得楔死同步」+ ruflo「pre-bash 拒绝用阻塞退出码（拒绝须可被调用方感知）」——拒绝/不可适用语义的工程完整性两条。
> 2. **claude-code-capabilities.md 2.1.288 注记**：中断恢复续跑（部分响应是资产不是废轮）+ 零用量自动压缩触发口径 + 结构化输出可关（网关兼容 fail-open）三条。
>
> ## 物化
>
> comet checkout 0.4.4 / claude-mem checkout v13.29.0 / ruflo checkout v3.51.1 / gstack ff-only origin/main——四克隆对齐 R85 基线。
