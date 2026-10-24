# R44 运行时刷新档（2026-09-23，用户 /goal 三目标②触发）

## 结论

**3 移动 + 14 零移动**。实质 minor 一件：**codex 0.155.1 → rust-v0.156.1**（0.156 稳定线于 2026-09-22 11:39 -0700 落地，527 commits，R42/R43 两轮预告的 alpha 线收口）；patch 两件：claude-code 2.1.278 → 2.1.279/280（npm latest 实测 2.1.280）、graphify 0.9.65 → 0.9.66（v8 线 tag 直查）。物化 checkout：codex `rust-v0.156.1`、graphify `v0.9.66`、claude-mem `v13.25.3`（对齐 R42 基线）、ruflo `v3.42.5`（对齐 R42 基线）、dsh `origin/master`（阅读副本对齐 0.1.7-alpha.2，基线仍 rc.2 不取）。吸收三段：codex-methodology R44（**实质 minor**）、claude-code-capabilities R44 增量段、code-graph-tools R44 行。台账三行同步 + dsh alpha 注记一行。

**本轮自纠错（台账执法实录）**：graphify v1.0.0 tag 在物化 checkout 时被再次诱取（fetch 后 tag 排序列表置顶），复核 R32/R41「旧异源、不在 v8 线、不取」裁决后**已回退**并改 checkout v0.9.66。这是该陷阱第三次被实录（R32 首次、R41 复核、R44 再触）——「轻量轮 checkout 动作必须先过台账裁决列」纪律的持续有效性证明。

## 移动明细

### codex rust-v0.155.1 → rust-v0.156.1（实质 minor，527 commits；0.156.0 tag 2026-09-22 11:39 -0700，0.156.1 hotfix 同日 17:45）

官方 release notes（tag 直查，A 级）+ 中间提交面（git log feat 面）：

- **`/tui` 全屏交互界面**（#46732 等）：transcript 搜索、鼠标选择、右键复制；fullscreen transcript 控制进 TUI 配置（#46849）、交互式 transcript 集成进 alternate-screen TUI（#46692 前移）——**会话证据资产化**：transcript 从滚动缓冲区升为可检索、可交互的一等产物。
- **worktree 支持默认启用**（#46839/#45276/#44870）：agent command center 按状态过滤任务 + 从中心创建 worktree 会话——R22 登记的「会话与工作区隔离原语」从实验转默认。
- **`/daemon` 后台服务管理**（#45854/#46088）：`--no-daemon` 显式旁路；worktree 会话可复用既有本地 daemon（#46498）——**单例守护资源复用**。
- **语音会话默认启用**（#44921 等，F8 切换）+ `/usage` 分析面板（token 总量/插件与技能活动，#45764）——可观测面进入宿主原生。
- **Agent message boards 接线进持久化多代理运行时**（#47042/#47029/#46959）：共享消息板扩展接口 + 根线程删除时连带删除持久化消息板 + **删除中损坏的 board 存储可恢复**——多代理消息持久化原语落地，破坏性删除带事务性与损坏自愈。
- **失败/中断/子代理完成事件时保留流式答案与计划**（#45549/#46867）——「partial 语义」宿主侧再实证：中途产物不因轮次失败而丢弃。
- **opt-in compaction after final responses**（#46541）：压缩时点显式化（应答完成后才压，而非轮中）。
- **reasoning effort 更新以模型显式支持为闸**（#46530）+ 新线程默认关 reasoning summary（#46533→0.156.1 回滚该默认，见下）——能力未声明不启用（诚实口径族）；**0.156.1 hotfix 回滚「默认关」**：默认值变更与行为变更同权入回归面（R40 同族第四例）。
- **Guardian 策略解析集中化**（#45957）+ app-server Unix socket 与文件系统受限命令隔离（#49305 前移系列）——策略单一事实源 + 沙箱隔离面。
- **系统代理回落**（登录与启动请求，#46562）+ OAuth discovery 503 时刷新 MCP 凭据——网络通道降级链。
- 沙箱缺口三连修：Windows 入站连接、Linux/macOS 特权 socket、macOS 只读文件句柄写入（#44639/#45984/#46500）。
- 0.156.1：GPT-6 Sol/Luna 入模型目录（模型目录随版本演进，install.sh 检测无关）。

### claude-code v2.1.278 → v2.1.279/280（patch 两版；npm latest=2.1.280 / stable=2.1.267 分裂持续）

- **Claude Opus 5.5 成为默认 Opus**（1M 上下文，$4/$20 per Mtok + $0.20 缓存读）——adaptive-gating 分档事实更新：顶档模型上下文与价格坐标前移。
- **符号链接写路径按落点判权限**：经 symlinked path 的写入按真实落点判读，prompt 中明示落点；`acceptEdits`/allow 规则/auto mode 不再批准落在树外的写入——**权限路径语义第七实证**（R24 268「规范化空间比对」谱系直系延续：从读路径到写路径）。
- **auto mode 重试治理两连**：安全检查拒绝评审的动作改为**一次拒绝并明示重试无用**；安全检查无应答时重试**退避**，连拒十次终止本轮——「无界重试→有界+明确错误」族宿主侧新样本。
- Write 工具参数宽容化：`path`/`file_text`/`file_content`/杂散 `description` 映射到规范参数——输入宽容化（与 codex-security R32「产出收敛」构成双向口径的输入侧）。
- `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`（MCP 工具描述 2048 字符上限可调）+ hook 输出尺寸入 OpenTelemetry 事件——配置面与可观测面。
- 大批 TUI 对话框交互修复（双 Ctrl+C 退出、焦点点击误触、对话框丢键）——可用性面，不吸收。
- 技能目录 `.trash` 保护（manifest 列名不再误移技能）+ 插件 commit 追踪修复——生态稳定性面。

### graphify v0.9.65 → v0.9.66（v8 线 tag 2026-09-22 直查）

- **五个新语言提取器**：COBOL/VB.NET/R/Solidity/Erlang——语言面单版最大扩展（图谱完整性族：覆盖面即完整性）。
- **PYTHONHASHSEED 确定性**：同输入同输出入构建门禁——**可复现构建族**图谱侧首证（与「评估可复现」同根：产物生成过程的不确定性是可审计性的反面）。
- 共享 GRAPHIFY_OUT 绝对路径时 root marker 解析修复（配回归测试）——共享输出根判别。

## 零移动核对记录

codex-security npm 0.1.29 / openspec GitHub v1.13.1 / superpowers v6.4.1 / gstack v1.87.5.0（main 无新 tag）/ ECC v2.2.1（main 推进无 tag）/ gsd-core v1.14.0（next 分支推进无 tag）/ GitNexus GitHub v1.6.12（rc 线推进，license-risk 双不取）/ comet 0.4.3 / ocr v1.12.9 / claude-mem GitHub v13.25.3 / ruflo npm 3.42.5 / impeccable skill-v4.3.1（候选级 R16 裁决）/ harnesseval-w / better-harness（alpha 线）/ codegraph（watch，接线前提=本机跑通 A 级，未动）。dsh alpha 线 0.1.7-alpha.1 → **0.1.7-alpha.2**（tag 2026-09-22，release merge #4978；内容=vendor 四件套 release + 依赖范围精确化 + chat 滚动/分组修复批），alpha 不取，触发点仍=0.1.6 稳定 tag——**注意：0.1.6 稳定线尚未出，alpha 已跳到 0.1.7，触发点语义顺延为「下一条稳定 tag」**。

## 纪律执行

用户 /goal 显式触发为 R44（R43 同日复核废止条款不适用——隔日新触发）。codex 为实质 minor → 调研轮 + 吸收段；claude-code/graphify patch 级 → 表行 + 增量注记段；dsh alpha 注记一行。本轮不改 SKILL.md、不发版、不升门禁、不动 facts.conf 计数（13 运行时接线面零变化）。

## 吸收映射（本轮方法论增量）

| 上游机制 | 方法论家族 | 落点 |
|---|---|---|
| codex 删除消息板时损坏存储可恢复 | 破坏性操作守卫族（删除=事务，失败回原状） | codex-methodology R44 |
| codex 失败/中断保留流式答案与计划 | partial 语义族（中途产物 ≠ 废弃物） | codex-methodology R44 |
| codex `/tui` transcript 检索 | 证据资产化族（trace 可检索一等） | codex-methodology R44 |
| codex Guardian 策略集中解析 | 规则单一事实源族 | codex-methodology R44 |
| claude 写路径按真实落点判权限 | 权限路径语义族第七实证 | claude-code-capabilities R44 |
| claude auto mode 拒绝一次明示+退避 | 无界重试→有界族 | claude-code-capabilities R44 |
| graphify PYTHONHASHSEED 确定性 | 可复现构建族（图谱侧首证） | code-graph-tools R44 |
