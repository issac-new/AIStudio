# R105 运行时例行刷新轮（2026-10-10）

> 触发：用户 /goal 三目标（本轮为其中「research 目录运行时更新到最新稳定版+差异比较+吸收+优化+回归+发版」目标）。口径同 R99 例行轮：research/ 克隆升级到最新稳定 tag、差异过决策 46 两问后吸收、表行回写。R100-R104 号位已被本仓并行轮占用（R100 补账/R101 待查/R102 legacy-items/R103 host-hooks/R104 offline-bundle），本轮顺延 R105。

## 一、移动面（5 移动，14 行零移动）

| 运行时 | 旧基线 | 新基线 | 跨度 | 实质判定 |
|---|---|---|---|---|
| claude-code | 2.1.294 | 2.1.295 | 1 版 patch | 中等（钩子失败即阻断 fail-closed + 终端程序状态协议 + MCP 重连退避族） |
| claude-mem | v13.34.2 | v13.35.0 | minor（5 提交） | 实质（渐进式记忆检索 + 原生记忆笔记桥） |
| graphify | v0.9.80 | v0.9.82 | 2 patch（20 提交） | 实质（跨文件类型解析族 + 图快照不变性钉测） |
| ruflo | v3.55.0 | v3.56.2 | 2 minor+2 patch（214 提交） | 中等（行为变更批：未知 id 报错/全仓 session 快照/配置面修复族） |
| dsh | dsh-v0.2.1-alpha.1 | dsh-v0.2.1-alpha.2 | 1 alpha（669 提交） | 记档深读（保留式 Git worktree + 插件官方 bundle 按需装 + 翻译持久化） |

零移动：codex（rust-v0.161.0=最新稳定，0.162/0.163 全为 alpha 不取）、codex-security（npm-v0.2.0=最新）、ECC/superpowers/GitNexus/mattpocock-skills/pua（无新 stable）、gsd-core（v1.16.0=最新）、openspec（1.14.1=最新）、ocr（v1.12.13=最新）、better-harness（v0.6.6=最新 stable；远端 v0.7.0-alpha 不取）、comet（0.4.4=最新）、gstack/harnesseval-w/semantica（无 tag 通道，main tip 前移留待批量轮）。

**诱取拦截实录（第六例）**：graphify 远端存在 `v1.0.0` tag（0a31c08，2026-04-05），`git merge-base --is-ancestor v0.9.80 v1.0.0` 实测**不在 v8 线**——与 R81 误取/R89 纠错为同一异源 tag，本轮按世系核验惯例拦截，取 v8 线真最新 v0.9.82。

## 二、核验锚点

- claude-code 2.1.295：npm 通道 2.1.295（`npm view` 实测）；**live CLI 本机 2.1.295=漂移归零**（`claude --version` 实测）。
- claude-mem v13.35.0：tag 5 提交（#4596 渐进检索主轴 + #4577 opencode V2 契约 + #4593/#4595 pydantic 下限）。
- graphify v0.9.82：v8 世系核验通过（`merge-base --is-ancestor v0.9.80 v0.9.82`）；20 提交。
- ruflo v3.56.2：CHANGELOG 三段（3.56.2 单修 / 3.56.1 五修 / 3.56.0 行为变更批）逐条核对。
- dsh dsh-v0.2.1-alpha.2：alpha 通道（R29「alpha 不作基线」先例在本仓已由 dsh 自身 alpha.1 基线演化覆盖——dsh 无 stable 线，快照随 alpha 走、基线行注明 alpha 通道）。
- live CLI：codex 0.160.0（滞后 0.161.0 基线记档，升级窗口待用户）/ claude 2.1.295（归零）。

## 三、吸收（过决策 46 两问，四档实质 + 一档记档）

1. `references/claude-code-capabilities.md` 新增 v2.1.295 段 + 版本基线 2.1.294→2.1.295：
   - **钩子失败即阻断（onFailure:"block"）**：command/HTTP 钩子起不来、超时、意外退出码时**阻断动作**而非放行——安全默认从 fail-open 翻转为 fail-closed。方法层：**钩子是门禁的一部分时，钩子失联必须等价于门禁关闭**。
   - **终端程序状态协议（OSC 7501）**：宿主把「工作中/等你/完成」写进终端状态行——CLI 与终端间的**结构化状态面**，不再靠用户盯输出流猜。
   - **MCP 重连退避族**：远程 MCP 断连>15s 不再永久失联、被服务端反复断连改为指数退避（至 30s）、重复分页游标不再每次连接重拉 20 页、错误回复含网络错误名不再误判断连——**通道韧性=区分「断」与「慢」与「环」三态**。
   - 其余：`-p` 多轮输出逐轮保全、plugin marketplace 装不进的 marketplace 拒绝添加（先验校验）、gateway 上游 TTFB 超时+models 白名单+failover、`$.ui.notify` mods 原生通知、mod Button 复合子元素、retry watchdog 上限可配。
2. `references/memory-persistence.md` 新增 R105 行（claude-mem 13.35.0）：
   - **渐进式记忆检索（progressive memory search）**：检索从一次性全量召回改为分档渐进——先窄后宽、按反馈逐级放开，长记忆库的检索成本与噪声同步下降。
   - **原生记忆笔记桥（native memory note bridge）**：外部笔记（Obsidian 类）与记忆库双向桥接——记忆面从「会话副产物」升为「可被外部系统读写的一等资产」。
3. `references/code-graph-tools.md` 新增 R105 段（graphify 0.9.81-82）：
   - **跨文件类型解析族收口**：python `self/cls/super()` 调用解析到**他文件的基类方法**、嵌套类身份按外围类保全、TS 同名接收者按**调用方 import** 绑定（绝不误绑 #private）、`this.field` 接收者从类字段声明定型、C# 命名空间内类型、Elixir keyword-form/别名远程调用——代码图的「调用边」从名字级升到**类型解析级**。
   - **图快照不变性钉测**：`graph.json` 在 checkout 目录不同/rebuild/行尾三态下逐字节一致写成钉测——**确定性是代码图的可测试属性，不是祈祷**（与 R97 克隆同一性确定性同轴，本条把口径扩到产物文件级）。
   - AMBIGUOUS 边从 top-N/modularity 隔离（歧义边不参与度量）。
4. ruflo 3.56.0-3.56.2（中等吸收，记 baseline 行）：行为变更批——**未知 id 从静默空输出改为报错 exit 1**、无值选项报错不静默转 true、`session_save` 默认快照 task/agent/memory 三仓+import 拒畸形、**policy trust mirror 尊重 HOME/XDG**（一次性 HOME 不再致信任锚丢失）、`ensureSchemaColumns` 只在真加列时重写库（读操作不再触发写放大）、`task_update` 五态词表收紧（complete 不再显示为 pending/重派）。方法层：**词表边界+报错优先于容错静默——「看起来成功」是最贵的失败**。
5. dsh alpha.2（记档深读，`references/dsh-engineering-methodology.md` 增 R105 注记）：**保留式 Git worktree**（experimental：进保留 worktree 而非一次性）、**插件官方 bundle 按需安装+生命周期校验+agent preset 组合**（插件面从单装升为可声明组合）、**DeepSeek Flash 翻译 opt-in+译文持久化**（翻译成为会话资产而非一次性显示）、session header 迁移状态前置可见、本地打包免配置 DMG。

## 四、同构观察（跨运行时主题）

- **fail-closed 扩散到工具面**：claude-code 钩子 onFailure:block（安全面）与 ruflo 未知 id 报错（数据面）同周落地——「失败必须可见，静默容错=隐形债务」从安全语义泛化为交互语义。
- **快照不变性成为一等测试面**：graphify 图快照钉测与 ruflo task 状态词表收紧同向——跨运行时都在把「同样的输入必须产生同样的可枚举输出」从约定升为守门。

## 五、验证

- self-check.sh / tests/run-sweep.sh / tests/test-r68-jargon-free.sh：见本轮发版记录（v2.69.0）。
- 回归：典型前后端项目验证（本轮 = note-forge 全栈样例再证，Django+Vue3 双端真实工具链），见 CHANGELOG。
