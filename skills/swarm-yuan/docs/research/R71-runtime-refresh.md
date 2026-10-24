# R71 运行时刷新档（2026-09-28，用户 /goal 三目标②触发）

## 结论

**1 minor + 1 patch 移动 + 17 零移动/记档**（19 行台账全覆盖，口径同 R57/R70：只认稳定 tag，main tip 漂移单列不计为版本移动）。

实质 minor 一件：**codex rust-v0.157.0 → rust-v0.158.0**（R70 时 0.158 全线 alpha，本轮稳定 tag 已出，207 提交；主线是治理证据完整性三连、exec-server WebSocket 令牌鉴权、子进程启动器归一、审批重试语义、TUI 交互面、沙箱修复族）。patch 一件：**ruflo v3.47.0 → v3.47.1**（hive-mind 任务派发修复：提交任务派发到 worker 并记录结果 + 任务退役保住当前 agent 归属 + helper manifest 重签）。

**dsh 跟随 tip（记档不物化）**：rc.2+155 → master tip `4878cdab`（0.2.0-rc.1 发布提交，rc.2 起再进 106 提交）；0.1.7 线未出 stable 直跳 0.2.0-rc.1。方法论注记见 `references/dsh-engineering-methodology.md` §十二。

**claude-code npm 2.1.283 零变化**（R70 后 npm 侧无新稳定；本机 claude CLI 2.0.44 为用户工具面，不入 research 口径，观察记档）。

**台账陷阱直防**：graphify v1.0.0 异源 tag 第六轮次未诱取（tag 提交 `0a31c08` 不在 main 上，creatordate 过滤 + merge-base 双验）；hermes-studio v1.0.x 异源线继续无效。

## 台账（19 行）

| 仓库 | R70 基线 | R71 物化 | 移动 | 主线漂移（tag 后提交数） |
|------|---------|---------|------|------------------------|
| codex | rust-v0.157.0 | **rust-v0.158.0** | 1 minor（207 提交） | 稳定 tag 即近 tip |
| ruflo | v3.47.0 | **v3.47.1** | 1 patch | 0（tag 即 tip 线） |
| dsh | main tip（rc.2+155） | main tip（`4878cdab`，0.2.0-rc.1 在 tip） | 0（无 stable，记档） | 无稳定 tag |
| claude-code | 2.1.283(npm) | 2.1.283(npm) | 0 | 闭源无克隆 |
| codex-security | npm-v0.1.31 | npm-v0.1.31 | 0 | +20（无新 tag，记档） |
| graphify | v0.9.71 | v0.9.71 | 0 | v1.0.0 异源第六轮拒 |
| superpowers | v6.4.2 | v6.4.2 | 0 | 0 |
| better-harness | v0.6.6 | v0.6.6 | 0 | tip 在 0.7.0-alpha2 线（不物化） |
| openspec | 1.13.2 | 1.13.2 | 0 | 与 R70 同 |
| comet | 0.4.3 | 0.4.3 | 0 | 与 R70 同 |
| ECC | v2.2.1 | v2.2.1 | 0 | 与 R70 同（+152 已记档） |
| gsd-core | v1.15.0 | v1.15.0 | 0 | 与 R70 同（+45 已记档） |
| open-code-review | v1.12.10 | v1.12.10 | 0 | 与 R70 同 |
| semantica | v0.7.0 | v0.7.0 | 0 | 与 R70 同（+46 已记档） |
| claude-mem | v13.28.0 | v13.28.0 | 0 | 与 R70 同 |
| gstack | main tip | main tip | 0 | 0（与 origin/main 齐平） |
| harnesseval-w | main tip | main tip | 0 | 0（与 origin/main 齐平） |
| gitnexus | main tip（v1.6.12+1） | v1.6.12+1 | 0 | v1.6.13 全 rc 线（不物化） |
| pua | v3.5.1 | v3.5.1 | 0 | 0 |

## 移动明细

### codex rust-v0.157.0 → rust-v0.158.0（1 minor，207 提交）

方法论文档 `references/codex-methodology.md` 已落八条版本注记，此处记档要点：

- **治理证据完整性三连**（`#47582/#47584/#47585/#47630/#47624`）：Guardian 评审保留助手上下文与消息序、评审绑定动作目标环境、`user_message` 工具进授权上下文。
- **凭据面显式化**（`#47601/#47648/#47891`）：exec-server WebSocket 承载令牌（独立 crate `codex-websocket-auth`）+ MCP OAuth client secret 预注册。
- **子进程启动器归一**（`#47603/#47605/#47610/#47611/#47617`）：共享 child launcher 统一 shell 快照/管道/PTY/钩子 + reap-only 回收策略。
- **审批重试语义**（`#47819`）：新用户输入到来时在途审批重试而非自动中止；提权命令终端输入审批默认开、runtime-only 授权降噪（`#47799/#48073`）。
- **限流协作**（`#47641`）：尊重 `Retry-After` 并保留服务端重试期限。
- **TUI 交互面**（`#47911/#47929/#47639/#47896/#48118`）：prompt_suggestions+Tab 改写、copy-on-select 保 Markdown、turn tips、欢迎屏刷新。
- **沙箱修复族**（`#47672/#47695/#47919/#47623/#47974/#47879`）：Windows 路径/凭据/大策略、嵌套可写根挂载序、Git 元数据保护、macOS 系统路径别名。
- **镜像面**：语音 RTP 时间戳对齐 20ms 包（`#48824`）、日志卫生（WebSocket 头与工具载荷退出 info 日志，`#48686`）、TUI 移除 follow-up 建议默认值（`#48621`，改 opt-in 配置）。

### ruflo v3.47.0 → v3.47.1（1 patch，4 提交）

- **hive-mind 任务派发修复**（`05c2a3e5c`）：提交任务实际派发到 worker 并记录结果——派发链路的「提交≠投递」缺口闭合。
- **任务退役保归属**（`c06588936`）：退役过程保住当前 agent 所有权。
- **helper manifest 重签**（`bbbd7241e`）：R70「供应链见证重锚定」的例行重签。

## 部署副本同步

`~/.cc-switch/skills/swarm-yuan`（`~/.zcode/skills/swarm-yuan` 软链目标）为普通拷贝，R70 后未同步。本轮除 research 三克隆原位 fetch+checkout 对齐外，文本面（references/SKILL.md 等）经 rsync 对齐（排除 research/ 与部署本地 .claude）。

## 零移动记档说明

claude-code npm 侧 R70 后无新稳定版；codex-security 主线 +20 无新 tag（npm-v0.1.31 后无物化）；graphify v1.0.0 异源第六轮直防（merge-base 实证 tag 提交不在 main）；gitnexus v1.6.13 全 rc；better-harness 0.7.0 全 alpha；ECC/gsd-core/semantica 主线漂移 R70 已记档且无新稳定 tag。
