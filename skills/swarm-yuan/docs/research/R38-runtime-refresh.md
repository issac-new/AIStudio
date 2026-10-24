# R38 运行时刷新（2026-09-18，用户 /goal 显式触发）

> 触发：用户 /goal 三目标指令之「自动更新 research 目录下运行时（claude code、codex、deepseek harness 等）到最新稳定版本，比较功能差异并吸收」——R31/R32/R34/R35 同款先例（用户显式触发豁免「同日复核废止」节奏限制；上轮运行时刷新为 R35，R36 全量回归轮与 R37 Harness 吸收轮均不含刷新面）。
> 扫描面：research 克隆区 17 仓 `git fetch --tags` 全量比对 + npm registry 四线（claude-code/openspec/ruflo/codex-security）实测。
> 结论：**4 行升基线**（codex 0.154.0→0.155.0 / claude-code 2.1.274→2.1.276 / ocr 1.12.5→1.12.6 / ruflo 3.42.3→3.42.4），13 行零稳定增量。中厚轮：四载体注记级吸收，无门禁增量，不改 SKILL.md，不发版。三克隆物化（codex/ocr/ruflo checkout 新 tag，均同线稳定 tag，过台账裁决列无异议）。
> **预算门**：R37 第七次登记预算 317440B，本轮增量 +2998B → **316357B ≤ 317440B**（裕量 1083B），未超标无需登记。

## 一、升级 4 行

### codex-cli rust-v0.154.0 → rust-v0.155.0（stable，219 commits）

上游 git log 全量比对（rust-v0.154.0...rust-v0.155.0）主题归纳：

- **Guardian 授权治理深化批**（约 8 commits）：网络审批评审绑定发起执行（#44575）+ 评审消费捕获时的 action settings（#44574）+ 授权证据保全至请求预算化 + 完整动作保全于审批评审（#44569）+ Guardian 报告与拒绝核算移入 extension + 重试与评审失败报告改进。
- **遥测最小化两例**：skill invocation analytics 移除 repo_url（#44586）+ Guardian 评审分析移除路径字段（#44352）。
- **认证属主绑定两例**：认证属主变更重置 WebSocket 缓存态（#44489）+ 远程控制会话绑定认证属主（#44341）。
- **错误语义分化**：HTTP 配额错误与限流分开（#44492）+ MCP status 快照披露 OAuth 失败（#44359）。
- **有界/容错批**：pre-turn compaction 失败保全 incoming prompts（#44487）+ MCP 描述与 Guardian action JSON 分别限界（#44493）+ app-server stdio 有界关闭与 SIGTERM 优雅退出。
- **其余登记不吸收**：符号化 `:root` 文件系统策略（#44580）、MCP per-server 协议模式（#44571）、会话隔离与子代理归属解耦（#44521）、fork 会话 hook 区分（#44349）、agents overview UI 批、Windows 沙箱修复、macOS provisioned 包 opt-in、voice alpha 排练（alpha 面）。

**吸收判定**：Guardian 三轴（完整性/归属/时效）与遥测最小化为主线，注记级入 `references/codex-methodology.md` R38 段。

### claude-code v2.1.274 → v2.1.276（npm latest；275 实质批 + 276 单回归）

- **275 实质批**：claude.ai 技能/插件同步进终端会话（`syncClaudeAiSkills/Plugins: false` 可关）+ 排队消息 send-now（ctrl+enter 打断当前轮并冲刷全部排队）+ otelHeadersHelper 失败启动告警（静默零导出被看见）+ memory 文件 age 注记漂移致 prompt cache miss 修复（缓存稳定性第五波）+ `--forward-subagent-text` fork 消息丢失修复 + plugin/marketplace URL 密码 token 脱敏（机密不落展示面第三波）+ 损坏 transcript 容错批（resume/选择器/后台代理）+ Read 解码失败报错而非挂死 + Grep/Glob 20MB 输出上限 + Linux 沙箱 zsh 退出码修复 + `/plugin install --marketplace` 先加源再装。
- **276 单回归**：自定义网关每请求 400（275 引入，input tag 校验误伤代理场景）——修复轮自身即回归源再添一例。

**吸收判定**：注记级入 `references/claude-code-capabilities.md` R38 段（技能跨端同源 + 排队消息语义为两条主线）。

### ocr v1.12.5 → v1.12.6（12 commits，IDEA 插件 + viewer 批）

- **TestMain 隔离会话写入与真实 HOME**（#1416）：测试卫生族（测试进程不得写用户真实环境）。
- **license/english-only 门禁扩展 kt/py/css**（#1407）：门禁覆盖面随语言面同步扩展。
- IDEA plugin（#1031）平台适配器家族加宽；viewer restyle 六项 + Windows updater console 修复——查看器面不吸收（先例）。

**吸收判定**：注记级入 `references/review-methodology.md` R38 条目。

### ruflo v3.42.3 → v3.42.4（单修复版）

- **smart search 结果保检索相关性**（#3340/#3327）：其他排序键不得覆盖相关性评分——「结果按相关性排序」是检索接口的语义承诺，次级排序只能同分内生效（排序语义显式化族）。

**吸收判定**：注记级入 `references/subagent-orchestration.md` ruflo 年表 R38 行。

## 二、零增量 13 行对账

| 运行时 | 基线 | 本轮实测 | 判定 |
|---|---|---|---|
| openspec | v1.13.1（R34） | tag + npm 均 1.13.1 | 零增量 |
| comet | 0.4.1（R29） | GitHub Latest 0.4.1 | 零增量 |
| GitNexus | npm 1.6.9 | tags 新增 v1.6.13-rc.16/17 | rc 线不取 + license-risk 维持（R28 裁决） |
| gsd-core | v1.14.0（R28） | GitHub Latest v1.14.0 | 零增量 |
| claude-mem | v13.24.23（R26） | GitHub Latest v13.24.23 | 零增量（watch，oracle 以 GitHub tag 为准） |
| graphify | v0.9.63（R34） | GitHub Latest v0.9.63 | 零增量 |
| codegraph | watch（R37 增行） | GitHub main 仍活跃 | watch 维持（接线前提=本机跑通 A 级） |
| superpowers | v6.3.0 | GitHub Latest v6.3.0 | 零增量 |
| gstack | v1.87.4.0（R31） | main commit subject 仍 v1.87.4.0（09-15） | 零增量 |
| ECC | v2.2.1（R20） | GitHub Latest v2.2.1 | 零增量 |
| impeccable | v4.1.1（引用基线） | skill-v4.3.1 已在案 | 候选级引用不升（R16 裁决沿用） |
| codex-security | npm-v0.1.28（R32） | tag + npm 均 0.1.28 | 零增量 |
| dsh | dsh-v0.1.5-rc.2（R24） | tags 新增 dsh-v0.1.6-alpha.2 | alpha 线不取（0.1.6 alpha.2；rc/stable 出线即深读） |

（另：better-harness v0.7.0-alpha1/2 出现——未入台账的非登记克隆，alpha 不取；harness-practice/harnesseval-w 为文章源物化克隆，无版本基线面。）

## 三、live 漂移对账

| CLI | live 实测 | R38 基线 | 判定 |
|---|---|---|---|
| claude（`~/.local/bin/claude`） | 2.1.273 | 2.1.276 | native 自升级通道滞后合法 I2（downloads.claude.ai 通道口径沿用 R28）；`/usr/local/bin/claude` 影子装处置仍待用户裁决 |
| codex | 0.154.0 | 0.155.0 | live 滞后 1 版；基线升级不强制本机即时升级（方法论引用层，无版本断言门禁） |

## 四、消费方

[[aiships-zcodeproject-state]]（AIShips 第十六轮同步收编本轮 runtime 束与技能版本）。
