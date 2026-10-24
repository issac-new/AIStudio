# R31：运行时补核调研（ruflo v3.42.1 可观测修正 / ocr v1.12.3 安全批次 / graphify v0.9.62 语言面扩展 / gstack v1.87.4.0 证据树绑定 / claude-code v2.1.273 撤销 268 竞态立场，2026-09-16）

- 调研角色：R31 运行时升级分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-09-16（R29 同日第二轮——用户 /goal 目标 2 显式指令再次触发，覆盖 R29 收口后的上游增量；非自主复核）
- 触发：用户 /goal 目标 2「自动更新 research 目录下运行时到最新稳定版本，比较和上一版功能差异，整合吸收优化 skill 能力」显式指令
- 上轮基线：2026-09-16 R29 补核（claude-code v2.1.272 / codex rust-v0.154.0 / dsh dsh-v0.1.5-rc.2 / ocr v1.12.2 / comet 0.4.1 / graphify v0.9.61 / ruflo v3.42.0 / gsd-core v1.14.0 / gstack v1.87.0.0 / GitNexus v1.6.12 / 16 行全景）
- 数据来源：15 个本地克隆 git fetch + tag 全量比对（15/15 首轮全部成功，无网络重试）+ npm dist-tag 复核（claude-code latest 2.1.273 / stable 通道 2.1.267——分裂持续且 stable 通道自身已从 2.1.236 前移）+ claude-code 官方 releases 原文（gh api）
- 执行纪律（沿 R26-R29 轻量补核先例）：本轮五行移动全为 patch/小版本级，可吸收内容全部为方法论注记级——**不升门禁、不改 SKILL.md、不发版**；唯一实质动作 = claude-code capabilities 文档补 268 谱系回退修正（上游自身撤销了 R24 吸收时引用的「不可分析即 deny」立场，登记面必须跟随事实）

---

## 第一部分：16 行扫描全景

| 运行时 | 上轮基线（R29） | 最新稳定（2026-09-16 二核） | 判定 |
|---|---|---|---|
| ruflo | v3.42.0 | **v3.42.1**（tag + npm 同步；13 commits / 30 文件 +2407/−164） | 移动——**可观测性与口径修正批**：swarm id 真实上报 + `swarm stop` 可用、memory_stats 从 store 而非裸文件作答、token savings 基线对齐调用方 |
| ocr | v1.12.2 | **v1.12.3**（tag；7 commits / 62 文件 +1697/−183） | 移动——**安全批**：code_execute 路径穿越修复 + 每环境 .env 保护 + 评审排除机密路径 |
| graphify | v0.9.61 | **v0.9.62**（tag；12 commits / 38 文件 +3793/−81） | 移动——**语言面扩展 + 证明加固**：terraform 本地 module 源解析、Ruby 常量查找边界五连加固、markdown code-span 引用边 |
| gstack | v1.87.0.0（4a3c6a8） | **v1.87.4.0**（a6b3a57，经 1.87.1-1.87.4 四步） | 移动——**证据与资源治理**：评审证据绑定被评审树、健康检查失败保留 + 覆盖面披露、headless 清理不误杀 headed 浏览器、sharp/adm-zip 漏洞 override |
| claude-code | v2.1.272 | **v2.1.273**（npm latest；**stable 通道 2.1.267**，分裂持续且 stable 自身前移） | 移动——**实质 patch**：网关提示头族、MCP 断连放弃通知、remote-control 会话分叉、权限检查器修复、**撤销 268「不可分析即 deny」**、上下文计量双倍计数修复 |
| codex | rust-v0.154.0 | 0.155.0 仍全 alpha（alpha.10，无 stable） | 零 stable 增量 |
| gsd-core | v1.14.0 | v1.14.0（origin/next +39；`&` 实体转义解码修复进 next 未出 tag） | 零稳定增量（下轮若切 v1.15 优先深读） |
| dsh | dsh-v0.1.5-rc.2 | dsh-v0.1.5-rc.2（main 805 commits 无新 rc/stable；0.1.6-alpha.1 维持） | 零 stable 增量——R28 预警仍在兑现中，rc 出线即深读 |
| GitNexus | v1.6.12 | v1.6.12（v1.6.13-rc.5 出线，rc 不取） | 零 stable 增量——license-risk 维持不追 |
| comet | 0.4.1 | 0.4.1（main +1 无新 tag） | 零增量 |
| claude-mem | v13.24.23 | v13.24.23（main +12 无新 tag） | 零增量 |
| ECC | v2.2.1 | v2.2.1（main +33 无新 tag） | 零增量 |
| codex-security | npm-v0.1.27 | npm-v0.1.27（main +42 无新 tag） | 零增量 |
| superpowers | v6.3.0 | v6.3.0 | 零增量 |
| openspec | 1.13.0 | 1.13.0 | 零增量 |
| harnesseval-w | ed4ccc6 | ed4ccc6 | 零增量 |

（better-harness：v0.6.6 → 0.7.0-alpha2，alpha 不取，维持 v0.6.6。）

## 第二部分：五行移动的差异分析

### ruflo v3.42.0 → v3.42.1（可观测性与口径修正批）

- **swarm id 真实上报 + `swarm stop` 可用**：`fix(swarm)` 修正 swarm 编号上报虚构值、stop 命令无法作用于真实 id——**可观测性口径族**：控制面命令与执行面状态必须共享同一标识符（与「no-op 报真实条件」「memory_stats 从 store 作答」同谱系，本项目门禁「报告须锚定实测输出」同向）。
- **memory_stats 从 store 而非裸文件作答 / doctor 不再从表计数推断 memory 驱动历史**：两处诊断信息源统一到权威存储——**单一事实源族**在诊断面的实例。
- **token savings 需要调用方持有的基线**：节省量计算的分母基线从隐式改为调用方传入——**度量口径必须显式契约化**（与本项目「全文数字口径一致」文档纪律同向）。
- **graph db 拒绝 volatile 打开选项缺失**（`fix(cli)`）：易失模式误用前置拒绝——fail-closed 族的存储面实例。
- 其余（PeerHello 去重 O(1) 序号、WITNESS_ED98519 根密钥解析、agent-browser 0.27→0.37 依赖批、federation 网关信封、sql.js 句柄关闭、RUFLO_INTELLIGENCE_MODE 学习模式默认）为协议噪声治理/依赖卫生/环境事实级，登记不展开。

### ocr v1.12.2 → v1.12.3（安全批）

- **code_execute 路径穿越修复 + 路径规范化**：工具执行面的经典穿越封堵——与 claude-code 268 符号链接规范化空间比对同族（**路径检查必须在规范化空间进行**）。
- **每环境 .env 进入保护名单 + 评审排除机密路径**（#1279/#1262）：allowlist 面把机密文件类目显式纳入保护——**机密不落展示面**族的评审侧实例（claude-code 268 同谱系）。
- **工具调用 JSON 尾随内容恢复 + 重复调用退避**：LLM 输出的畸形工具调用先恢复再退避——协议鲁棒性（与 R29 吸收的 ACP stdout 容错同向：**外协方输出不可信，解析层先恢复后限界**）。
- 文档批（subtask 术语、Trendshift badge）无方法论增量。

### graphify v0.9.61 → v0.9.62（语言面扩展 + 证明加固）

- **terraform 本地 module 源解析 + 目录拓扑**（+257 行测试）：依赖图语言的 module 边从仅 registry 扩到本地路径——**拓扑完整性族**：引用边的解析器不能只覆盖一种源形态（与 R30-D4「inventory 只认一种形态」教训同向：Prisma/大写 Router 漏报的同构问题在上游同样复发）。
- **Ruby 常量查找边界五连加固**（继承查找证明、命名空间重绑定守卫、歧义常量变更拒绝、常量重绑定守卫、继承调用置信度提升）：语言语义边界的证明级加固——**语言陷阱 checklist 族的图谱侧镜像**（本项目 AI 协作规范 §5.3 语言陷阱清单同向）。
- **markdown code-span 提及解析为引用边**：文档内代码引用进关系图——引用面完整性扩展。

### gstack v1.87.0.0 → v1.87.4.0（证据与资源治理四连）

- **评审证据绑定被评审树**（v1.87.3.0，#2875）：评审证据（diff/快照）与被评审的具体树绑定，防止证据与对象错位——**审计可复现族**：证据必须锚定不可变对象（与本项目「断言带锚点 file:line/实测输出」、CSO 可重放修复包同向加深）。
- **健康检查失败保留 + 覆盖面披露**（v1.87.4.0，#2882）：失败不被聚合吞噬 + 明示哪些覆盖了哪些没覆盖——**覆盖面诚实族**：绿≠全绿，须披露未覆盖域（与本项目 R30-D4「枚举器漏报静默 + ENUM_ZERO_DIM advisory」同构：**缺失自身必须可见**）。
- **headless 清理不误杀 headed 浏览器**（v1.87.2.0）：资源回收的作用域精确到属主——清理例程的误伤面。
- **sharp/adm-zip 漏洞 override**（v1.87.1.0）：依赖卫生批。

### claude-code v2.1.272 → v2.1.273（实质 patch：撤销 268 竞态立场 + 网关提示头）

- **⚠ 撤销 2.1.268「不可分析即 deny」**（273 revert）：268 把 `eval`/`env -C` 等检查器无法分析的 Bash 行按最坏情况 deny；273 因误伤 `time -p make build` 等合法形态回退为 prompt。**谱系修正（登记面必改）**：R24 吸收注记引用的「不可分析即最坏情况 fail-closed 第五实证」被上游自身撤销——修正后的立场是「**不可分析 → ask（提示人工），而非 deny**」；fail-closed 语义保留给「managed 配置不可读→deny-all」这类无交互可兜底的场景。已在 `references/claude-code-capabilities.md` 268 节补回退注记 + 新增 273 节。
- **网关提示头族**（`x-claude-code-request-class`/`agent-type`/`prev-tool-durations`/`compaction`/`context-compacted`，opt-in env）：上下文经济状态向 LLM 网关显式化——环境事实登记。
- **MCP 断连放弃通知指向 /mcp**：自动重连放弃后显式告知——**降级可见性族**（与本项目 MCP 降级信号、DegradationLadder 三态同向：放弃也必须是可观测事件）。
- **remote-control 会话分叉为后台会话**：宿主编排面扩展，环境事实。
- **权限修复对**：`blockReadsOutsideWorkingDirectories` 下不可分析 Bash 行跳过提示的修复 + 子壳藏 `rm` 的旁路修复——再次印证「**权限通道变更须带回归面**」（R27/270 谱系）。
- **上下文计量与自动压缩双倍计数修复**：advisor 工具轮按约两倍真实上下文计重，自动压缩在约半窗口误触发——**度量精度即行为触发器**：计量偏差直接改变压缩行为（与 ruflo token savings 基线修正同向，度量口径族跨宿主双样本）。
- 其余（记忆目录隔离、子代理结果投递、定时任务会话绑定、SDK 后台化消息完整性、spinner 文案等）为修复族，登记不展开。

## 第三部分：吸收结论与登记面动作

1. **登记面（本轮唯一实质动作）**：`references/claude-code-capabilities.md` —— 268 节补「273 回退」修正注记；新增 v2.1.271–273 版本注记节（271/272 为 R29 表行级吸收的补档展开，273 为本轮）。
2. **`docs/upstream-baseline.md`**：五行升基线（ruflo v3.42.1 / ocr v1.12.3 / graphify v0.9.62 / gstack v1.87.4.0 / claude-code v2.1.273 + stable 通道 2.1.267 前移注记）+ 重核口径注补 R31 一行。
3. **方法论注记级吸收（不入执法面）**：
   - 「不可分析 → ask 而非 deny」的权限语义修正（fail-closed 的适用边界：有交互兜底走 ask，无兜底才 deny-all）。
   - 「度量口径显式契约化 + 计量精度即行为触发器」（ruflo savings 基线 × claude-code 双倍计数，跨宿主双样本）。
   - 「覆盖面诚实：缺失自身必须可见」（gstack #2882 × 本项目 R30-D4 同构互证）。
   - 「证据绑定不可变对象」（gstack #2875 评审证据 × 被评审树）。
4. **不升门禁、不改 SKILL.md、不发版**（五行全为 patch 级，无可执法化的新原语；沿 R26-R29 先例）。
5. **research 克隆已 checkout**：ruflo@v3.42.1 / open-code-review@v1.12.3 / graphify@v0.9.62 / gstack@a6b3a57（v1.87.4.0）。

## 第四部分：下轮观察点

- **dsh 0.1.6**：main 已 805 commits（asar/运行时解析重构），rc 出线即深读——R28 预警持续。
- **codex 0.155 stable**：alpha.10 仍在切，stable 出线即深读。
- **gsd-core v1.15**：next +39（含 `&` 实体转义解码），minor 出线优先深读。
- **claude-code stable 通道**：2.1.236 → 2.1.267 前移，分裂收口信号观察。
