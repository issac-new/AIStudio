# R89 运行时刷新轮（2026-10-04，用户 /goal 三目标②触发）

> **口径**：例行轮 + **R81 误取纠错**。20 克隆 `git fetch --tags --force` 全量比对 + npm registry 实测 + live CLI 版本核。

## 移动面（5 移动 + gstack tip 快进 + 1 纠错）

| 运行时 | 旧 → 新 | 判定 |
|---|---|---|
| codex | rust-v0.159.3 → **rust-v0.160.0**（56 提交，0.160 线 alpha.6.2 后收口 stable） | 实质轮：**Guardian 评审上下文完整性五连**（加密 agent 消息保留 #49038 + handoff-aware 根上下文 #49057 + opt-in 会话历史检索 #49036 + 原生 agent 消息快照 #49060/#49065 + diff 路径跳过远程 Git 发现 #49082）+ **技能预算先去重再计量**（#49127——cloud 与 executor 双源技能清单并集后才可算预算）+ **子代理派发保留 pending 环境**（#49075）+ **技能分析不采集未用 Git 元数据**（#49076，遥测最小化字段级续）+ **显式 provider 模型目录权威**（#49135）+ **断线重连恢复未发送输入**（#49105）+ 生命周期贡献者可见原始错误详情（#49138）+ content-filter 重试恢复指引（#49119/#49087）+ Windows 沙箱 ACL 长路径修复族 |
| graphify | **纠错：v1.0.0（异源，R81 误取）→ v0.9.75**（v8 线真基线 v0.9.72 → v0.9.75，76 提交） | **R81 误取第五次诱取实录**：v1.0.0（0a31c08，2026-04-05，作者展示名 `Safi`）`merge-base --is-ancestor v0.9.72 v1.0.0` 实测不成立——不在 v8 线，R32 首裁/R41 复核/R44 第三次诱取的同一异源 tag，R81 升级时未过世系门误取且克隆 HEAD 落异源树。R84 又将 v8 线新出的 v0.9.73 误判「0.9 维护线非升级」。本轮双纠错：基线回 v8 线并升 **v0.9.75**（= origin/v8 tip 48d7c0e，2026-10-04）。**许可态重核**：v8 线 v0.9.75 树内 LICENSE + LICENSE-MIT 双文件在位、pyproject `license = "Apache-2.0"` + license-files 三项齐——R81 记的「树丢失 LICENSE」属异源树，v8 线许可三处一致。v8 线 76 提交要点：**干净解析零符号须警告**（f81c4e5——解析成功≠有产出）+ **去重收缩须用户同意且计量不入 graph.json**（daee93f/e8b5d27——破坏性操作守卫+数据面/计量面分离）+ **聚类/标签写回保留全部原始边**（7527e73——写回保真）+ **按 node id 恢复既有社区**（9ec7df0——恢复按身份不按名字）+ hook-guard 输出路径用解析不用子串匹配（8e5649f）+ 五语言 self/super 调用绑定调用者类链 + Rust prelude 类型不再成 god node + workspace 源条目优先于构建产物（81b0391） |
| mattpocock-skills | v1.2.3 → **v1.3.1** | R86 已按 main 线 d81f3a1（= v1.3.0 前夜）评估三新技能（implement-spec/pr/retro 毕业进 engineering）并吸收四协议；本轮 tag 正式化 v1.3.0+v1.3.1，v1.3.1 增量 = ask-matt 把 bug 后复盘路由到 /retro + 丢弃过期 hand-off（c5b9869）——路由卫生注记级，无新协议 |
| claude-code | npm 2.1.288 → **2.1.289** | **权限通道完备性三连修复**：①复合命令嵌套段上的 deny/ask 不得被用户装 mod 的批准压过（受管机器）②Read deny 规则须经符号链接作用于 IDE @提及/变更/选中通道③Bash deny/ask 在沙箱 auto-allow 下不再漏检环境变量前缀展开值与裸赋值后的命令；+ 插件元数据越权（用户装插件改写组织管理 MCP 登录工具描述）+ `agent.spawn` teammates/$.agent.list() idle·waiting 态 + mods 渲染失败隔离（ui.fault 单区失败不带崩全局）。其余为 TUI/插件健壮性修复 |
| claude-mem | 13.29.0 零 tag 移动 | main 前移 a1951f2a..bfc50259 记档（watch 口径不变） |
| gstack | tip 74512c2 → **4015c28**（+3） | 提交自述 v1.91.16.0（safe installs and upgrades）/ v1.91.17.0（mvanhorn wave checkpoint）/ v1.91.18.0（Opus 5.5 cleanup follow-up）。tip 快进记档 |

## 零移动面（13 行 + 注记）

openspec 1.14.0 / comet 0.4.4 / ocr 1.12.11 / ECC v2.2.3 / superpowers 6.4.2 / gsd-core 1.15.0（next 线前移无 tag）/ codex-security npm-v0.1.32（**npm 断流第六轮**：registry latest 仍 0.1.31，git tag 口径维持）/ dsh（触发点「dsh-v0.2.x stable/rc tag」未至，tag 面维持 rc.2/alpha.1）/ semantica v0.7.0 / pua v3.5.1 / impeccable 候选级 4.1.1 / GitNexus license-risk 零接触 / codegraph watch / better-harness 不取。ruflo git tag 3.51.1 = npm 零漂移（npm 包名非 @ruvnet/ruflo，404 为查询名错误非断流）。

## live CLI

claude 2.1.289（真身 ~/.local/bin/claude = npm latest，**漂移归零**）；codex 0.160.0（= 新基线 rust-v0.160.0，**零滞后**）。

## 吸收（过决策 46 两问）

1. **codex-methodology.md R89 版本注记**：技能预算先去重再计量（#49127——计量诚实族：双源清单并集是预算前提，消费点=门禁/预算注入环节的计量口径）+ 子代理派发保留 pending 环境（#49075）+ 遥测只采已用字段（#49076）+ 显式目录权威（#49135）+ 未发送输入恢复（#49105——用户输入不丢族）+ Guardian 评审上下文完整性五连（治理证据链族续）。
2. **claude-code-capabilities.md 2.1.289 注记**：权限通道完备性三连 + 插件元数据越权修复（消费点=claude 宿主生成任务的权限面知识）。
3. **code-graph-tools.md R89 段**：graphify v8 线五条（零符号警告/去重收缩同意+计量分离/写回保全边/按 id 恢复/路径解析规范化）+ R81 误取纠错实录（世系门须在「升级」动作上执法，不止在「拒绝」动作上）。

## 物化

codex checkout rust-v0.160.0 / graphify checkout v0.9.75（异源 v1.0.0 checkout 纠出）/ mattpocock-skills checkout v1.3.1——三克隆对齐 R89 基线；gstack ff-only origin/main。

## 纠错说明（R81 graphify 误取）

R81 表行「v1.0.0（2026-10-01 R81 升级，major 34 提交）」与本行内既有「异源不取」注记自相矛盾——升级动作未过世系门。证据四条：①`merge-base --is-ancestor v0.9.72 v1.0.0` 不成立（v0.9.72 → v0.9.75 成立）②v1.0.0 提交日 2026-04-05 早于 v0.9.72（2026-09-30）约半年 ③作者展示名 `Safi` ≠ 主线 `safishamsi` ④R81 描述的「--watch 确定性/--wiki/git hook」实为异源线内容，v8 线同期演进为 0.9.73-75。R81 同轮记的许可态异常（树丢失 LICENSE）随基线纠正失效：v8 线 v0.9.75 许可三处一致。表行已重写，防复发=「升级前 merge-base 世系核验」为 0.x 运行时升级的强制步骤（本档即执法记录）。
