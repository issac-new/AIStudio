# R34 运行时刷新（2026-09-17，用户 /goal 显式触发）

> 触发：用户 /goal 三目标指令之「自动更新 research 目录下运行时至最新稳定版本」——同 R31/R32 先例（用户显式触发豁免「同日复核废止」节奏限制；本轮为 09-17 当日首轮运行时刷新）。
> 扫描面：`swarm-yuan/research/` 全部 16 克隆 `git fetch --tags` 全量比对 + npm 通道（@anthropic-ai/claude-code / @opengsd/gsd-core / @rpamis/comet / ruflo / openspec npm 包）。
> 结论：**4 行升基线**（openspec 1.13.1 / graphify 0.9.63 / ruflo 3.42.3 / claude-code 2.1.274），12 行零稳定增量。薄轮：注记级吸收，无门禁增量，不改 SKILL.md，不发版。

## 一、升级 4 行

### 1. openspec v1.13.0 → v1.13.1（2026-09-17 发布当日，15 commits 修复批）

- **schema validate apply block against declared artifacts（#1868）**：apply 块按声明的 artifacts 校验——apply 面消费的产物必须落在 spec 声明集合内。与 R22 登记的「validate 拒绝的状态 apply 却放行」构成**第二条实证线**：R22 修的是 delta 段语义（写了不存在的变更），本条修的是产物集合口径（apply 引用未声明的产物）——validate/apply 口径统一从「段级」推进到「产物级」。
- **validate 报告 delta 段外的 requirements（#1804）**：写在 delta 段之外的 requirements 不再静默无视，显式报告——「不可分类 ≠ 静默跳过」诚实族（graphify R27 未分类文件浮出双出口同谱系）。
- **不可解析的全局 config 不触碰（#1876）**：unparseable global config 原样保留不动——**坏输入不动原物**（破坏性操作守卫族：读失败时写路径必须止步，与 ruflo 3.41.2「写操作须辨我的产物 vs 用户资产」同向）。
- **update-change 草稿-提交两阶段（fede536）**：step 4 先 draft 请求的编辑、只在最终步写入——**草稿态与提交态分离**，中间态不落盘（与 gsd staging 目录一次性 rename 发布同族：半成品不可见）。
- 其余：bulk-archive 先查目标再移 changeRoot（e67ac47，移动前先验证目的地）、未识别 checkbox 标记计为未完成（#1773，**未知状态按未完成计**——保守计数诚实族）、skills 自然语言动词短语与工作流对齐（5f5914e）、propose 流程各交接点命名（#1788）、模板产物顶层标题（#1785 nix completions 邻批）。
- **吸收判定**：注记级入 `references/review-methodology.md` R34 段。validate/apply 口径统一第二条实证线与坏输入不动原物为本轮两条主线。

### 2. graphify v0.9.62 → v0.9.63（2026-09-16，origin/v8 线，checkout 前过台账裁决列确认）

- **god node guard（同名 ≠ 同物）**：拒绝跨两个无关同名类型并池方法（8c7b667）+ 重复索引键映射的方法全部保留而非只留最后一个（58c498d）——同名碰撞曾是 god node（伪超级节点）成因，判别性修复。「同名 ≠ 同物」是图谱侧的实体判别原语，与权限路径「规范化空间比对」（268 谱系）同为**消歧必须显式**族。
- **elixir 跨文件 alias/import 解析**（4696a55 注册 resolver + e3535e9 嵌套模块捕获守卫）+ rust selective extraction（发布行）——跨语言边扩展，图谱完整性族延续。
- **code-span mention 边跨重建保持**（b117a6e）+ **markdown 点式限定词与显式相对引用**（8cfebfd）——增量重建不丢语义边（与 0.9.57「增量重建不擦除跨文件节点」同族）+ 引用解析口径收紧。
- 外部模块引用/god node 重复名/同文件负对照回归测试四批（7dbc668 等）——**回归测试先于修复入库**的卫生样本。
- **吸收判定**：注记级入 `references/code-graph-tools.md` 版本注记。

### 3. ruflo v3.42.1 → v3.42.3（2026-09-16；3.42.2 无 git tag，tag 与 npm 3.42.3 同步收敛）

- Windows 维护批：npm.cmd 以 shell:true spawn（#3346 及 prepare-root 变体，Windows 上 .cmd 不是可直接 exec 的二进制）+ **RUFLO_HOOK_CLI_OVERRIDE 引号感知分割**（#3344——环境变量承载命令行时的 tokenization 必须引号感知，否则带空格路径参数被撕碎）+ #3322 argv 修复推广至另外三处（同类缺陷一次修全）+ NeuralLearningSystem 裸 mode 串修复 + 测试 UUID 替代 Date.now()。
- **吸收判定**：薄维护批，无新方法论原语。台账行升基线即可，不另开 references 段。「同类 argv 缺陷一次修全」登记为跨面修复纪律样本（与本仓「修复回归面＝修复点+相邻路径」同构）。

### 4. claude-code v2.1.273 → v2.1.274（npm latest 前移；stable 通道 2.1.267 不动，分裂持续）

修复主导批，与 swarm-yuan 相关的吸收点：

- **损坏 transcript 自愈替代无界重试**：会话卡死在 "unexpected tool_use_id" 400 无限重试——现在能自愈则自愈，否则给出明确错误 + `/rewind` 指引**终止循环**。「无界重试 → 有界 + 明确错误」族宿主侧新样本（与 DeadlineBudget 同向的动态面兄弟：重试是等待的另一种形态，等待必须有界）。
- **MCP 启动等待有界化**：`CLAUDE_CODE_MCP_STARTUP_WAIT_MS`（0 = 不等）——首个非交互 turn 对 MCP 连接的等待成为显式预算，等待不再是隐式无界。
- **MCP Streamable HTTP 按 server timeout 生效**：原 ~5 分钟硬顶无视更长 per-server timeout——死线语义以配置为准的修复。
- **/goal 稳定性两修**：compact 后 resume（--continue/--resume）不再丢活动 goal + hook-driven goal 会话上下文再溢出时改 compact 而非报 "Prompt is too long"——R14 goal_id/closure 闭环谱系的宿主侧补强。
- **403 insufficient_scope ≠ 过期登录**：错误按真实语义命名并指向 /mcp 重认证——错误语义诚实化（不把权限不足谎报为登录过期）。
- **中断 tool batch 半恢复修复**：resume 的后台代理不再保留被中断批的一半——恢复原子性（半态不是可运行态）。
- **plugin 版本归属**：无自身 git 仓的 plugin/marketplace 目录不再误取外层 git 仓版本——版本归属（供应链可审计性细节）。
- **Stop hook 重复 block 以 500 字符条件标签替代全量 prompt 重发**——输出经济学（重复内容短标签化）。
- 其余：内存临界可见警告（自检可观测）、AskUserQuestion preview 归属两修、file:// URI 链接、有序列表重编号保留原样等交互修复面。
- **吸收判定**：注记级入 `references/claude-code-capabilities.md` 版本注记 v2.1.274 段。无门禁增量（全部为宿主侧修复；本仓状态机无无界重试点位，已核对 gates-strict/precheck 无 until/无限循环重试面）。

## 二、零增量 12 行（ adjudications ）

| 行 | 现状 | 裁决 |
|----|------|------|
| codex | rust-v0.154.0；0.155 线仍全 alpha（alpha.16，2026-09-17） | alpha 不取，stable 出线即深读 |
| dsh | dsh-v0.1.5-rc.2；0.1.6-alpha.1 已知 | **R28 预警持续**：rc.2 以来 800+ commits 无新 rc；alpha 不取 |
| GitNexus | v1.6.12；v1.6.13-rc.10（2026-09-17） | rc 线 + **license-risk（PolyForm 禁商用）不追**，决策 18 |
| gsd-core | v1.14.0（npm 同步 1.14.0） | main 领先无新 tag，不取 |
| claude-mem | v13.24.23（最新 tag 仍 2026-09-11） | watch 维持 |
| comet | 0.4.1（npm 一致） | 零增量 |
| ocr | v1.12.4 | 零增量 |
| superpowers | v6.3.0 | 零增量 |
| gstack | v1.87.4.0（a6b3a57）；main 零新提交 | 零增量 |
| ECC | v2.2.1 | 零增量 |
| codex-security | npm-v0.1.28 | 零增量 |
| better-harness | 0.6.6；0.7.0-alpha2（2026-09-12） | 预发布不取（R27 先例） |

- impeccable：候选级未克隆，引用基线不升（R16 裁决沿用）；skill-v4.3.1 已在案。
- graphify **v1.0.0 异源 tag 裁决维持**（2026-04-05 旧线不在 v8 线）——本轮 fetch 后 tag 排序未见诱取，裁决无需重演。
- harnesseval-w：ed4ccc6（2026-09-02）零漂移。

## 三、克隆物化动作

- `research/openspec` checkout v1.13.1；`research/graphify` checkout v0.9.63（origin/v8 contains 验证）；`research/ruflo` checkout v3.42.3。
- claude-code 非 clone（专有），npm latest 为 oracle：2.1.274（本机 native live 自升级通道自会跟进，登记滞后属合法 I2）。

## 四、吸收对账

- `references/review-methodology.md` 追加 R34 段（openspec 1.13.1：validate/apply 口径统一第二条实证线 + 坏输入不动原物 + 草稿-提交两阶段）。
- `references/code-graph-tools.md` 追加 v0.9.63 版本注记（god node guard 同名消歧 + elixir/rust 扩展）。
- `references/claude-code-capabilities.md` 追加 v2.1.274 版本注记段 + 头部「版本核至」行更新。
- ruflo 3.42.3：薄维护批，台账行升基线，不另开 references 段。
- 台账 `docs/upstream-baseline.md`：4 行升基线 + R34 口径注。
- 本机生效池（~/.cc-switch/skills/swarm-yuan）：references 文件级轻刷 + marker 更新（docs-only 轻刷法，不跑 install.sh）。
