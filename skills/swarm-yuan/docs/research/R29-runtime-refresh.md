# R29：运行时补核调研（ruflo v3.42.0 安全批次 / gstack v1.87.0.0 CSO 可验证审计 / dsh 0.1.6 预发布线恢复切割 / claude-code v2.1.271 实质轮，2026-09-16）

- 调研角色：R29 运行时升级分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-09-16
- 触发：用户 /goal 目标 2「自动更新 research 目录下运行时到最新稳定版本，比较和上一版功能差异，整合吸收优化 skill 能力」显式指令
- 上轮基线：2026-09-14 R28 补核（claude-code v2.1.270 / codex rust-v0.154.0 / dsh dsh-v0.1.5-rc.2 / ocr v1.12.0 / comet 0.4.0 / graphify v0.9.61 / ruflo v3.41.2 / gsd-core v1.14.0 / GitNexus v1.6.12 / 16 行全景）
- 数据来源：16 个本地克隆 git fetch + tag 全量比对（15/16 首轮成功，ECC 重试 1 轮补拉）+ npm dist-tag 复核（claude-code latest 2.1.272 / ruflo 3.42.0 / openspec 1.13.0）+ claude-code 官方 CHANGELOG 原文（raw.githubusercontent）
- 执行纪律（沿 R26/R27/R28 轻量补核先例）：本轮移动行以 patch 级为主，实质内容为 ruflo 安全批次、gstack CSO 审计两族、claude-code 271 权限/策略面——全部为方法论注记级吸收，**不升门禁、不改 SKILL.md、不发版**
- 同日注记：本轮与 SwarmStudio 2.23（hermes-agent v0.21.3）升级轮并行执行；research 侧 ruflo/open-code-review/comet 三克隆已 checkout 至新稳定 tag

---

## 第一部分：16 行扫描全景

| 运行时 | 上轮基线（R28） | 最新稳定（2026-09-16 核） | 判定 |
|---|---|---|---|
| ruflo | v3.41.2 | **v3.42.0**（tag + npm latest 双核，"dream-cycle backlog batch (14 PRs)"） | 移动——**安全批次为主**：MCP 治理 opt-in + 调用者身份绑定 + 滑动窗口配额 |
| gstack | 1.84.1.0（71f6048，R28 记录值） | **v1.87.0.0**（main HEAD 4a3c6a8；经 v1.86.0.0 两步，无 tag 仓按 commit subject 版本递增） | 移动——**治理面丰收**：按 harness 路由外部评审 + CSO 可验证审计与可重放修复包 |
| claude-code | v2.1.270 | **v2.1.272**（npm latest；271 为实质轮、272 为笼统修复轮） | 移动——**权限通道完备性族第七波 + 企业策略 fail-closed + 网络出口按命令白名单** |
| ocr | v1.12.0 | **v1.12.2**（tag 2026-09-16 核；v1.12.1/2 两步） | 移动——薄轮：suggestdiff 大小写/缩进保留 + preview 总量圈定 tracked 变更集 + Python stub 路由 + opencode backgroundFile |
| comet | 0.4.0 | **0.4.1**（tag 2026-09-16 核） | 移动——personal memory learning 可靠化 + **dsh 注册为受支持 hook 平台**（#406，生态汇聚信号） |
| harnesseval-w | afa6c5f | ed4ccc6（1 commit："update model adapters and public set"） | 移动——微增量，模型适配器例行更新 |
| dsh | dsh-v0.1.5-rc.2 | dsh-v0.1.5-rc.2（**新出现 dsh-v0.1.6-alpha.1**：rc.2 以来 **800 commits** 切入首个 0.1.6 预发布；仍无 rc.3/stable） | 零 stable 增量——**R28 预警兑现中**：0.1.6 已开切，运行时解析/asar 重构为主，下轮优先盯 rc |
| codex | rust-v0.154.0 | 0.155.0 仍全 alpha（alpha.7，无 stable） | 零 stable 增量 |
| gsd-core | v1.14.0 | v1.14.0（origin/next +33 无新 tag） | 零稳定增量（下轮若切 v1.15 优先深读） |
| better-harness | 0.6.6 | 0.6.6（0.7.0-alpha2 仍为最高预发布；main +174 预发布线高活跃） | 零稳定增量 |
| GitNexus | v1.6.12 | v1.6.12（main +12 无新 tag；license-risk 维持不追） | 零增量 |
| claude-mem | v13.24.23 | v13.24.23（main +10 无新 tag） | 零增量 |
| openspec | 1.13.0 | 1.13.0（npm latest 复核同值；main 零漂移） | 零增量 |
| graphify | v0.9.61 | v0.9.61（origin/v8 零漂移） | 零增量 |
| superpowers | v6.3.0 | v6.3.0（main 零漂移） | 零增量 |
| ECC | v2.2.1 | v2.2.1（main +33 无新 tag） | 零增量 |

---

## 第二部分：移动行深读

### 一、ruflo v3.41.2 → v3.42.0（14 PR 批次）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **opt-in MCP 治理策略执行**（#3138） | MCP 工具调用可挂治理策略，显式 opt-in 生效 | **落地（注记级）→ `references/mcp-governance.md`**：治理必须 opt-in 而非默认开启——与零信任默认收紧的方向相反但同源：治理面越强，误伤面越大，开关归用户（同意面族：与 ruflo 3.41.2 autoStart:false 被尊重同谱系） |
| **ADR-377 调用者身份验证绑定**（#3102） | 工具调用携带调用者身份并验证，防匿名代理调用 | **落地（注记级）→ `references/mcp-governance.md`**：跨边界调用须携带可验证身份——与 gstack v1.87「verified audits」同族：审计结论的可信度取决于证据链身份绑定 |
| **maxToolCallsPerTurn 滑动窗口重置**（#3151） | 每回合工具调用上限从固定计数改为滑动窗口 | **落地（注记级）→ `references/memory-persistence.md` ruflo 段**：有界性族精化第三波——界从计数上限（3.40 前）到预算分配（3.41.2 Seraphina）再到时间窗速率（3.42）：三种有界形态对应三种失效模式 |
| hive-mind 共识 Sybil 假票修复（#3290） | 共识投票的身份唯一性校验 | 注记——身份唯一性是共识的前提（与 ADR-377 同根：无身份绑定的票数可伪造） |
| findSimilar 置信度按可靠性分级门控（#3301） | 相似检索结果的置信度不得高于其来源可靠性 | **落地（注记级）——证据可信度传播族**：结论置信度 ≤ 证据可靠性上限（不信任单点聚合放大） |
| LearningBridge.consolidate() reward-blind（#3159） | 记忆固化不感知奖励信号 | 注记——固化判据与激励解耦（防 reward hacking 进长期记忆） |
| 其余（MMR 去重复 tokenize、diskann 死代码移除、TopologyManager 单向修复、近重复 embedding 检测接线等） | 性能与实现面 | 不吸收——纯实现面 |

### 二、gstack v1.84.1.0（71f6048）→ v1.87.0.0（4a3c6a8，两步）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **v1.86.0.0 按 harness 路由外部评审**（#2850） | 外部评审意见按来源 harness 的能力/语义路由到对应处理通道 | **落地（注记级）→ `references/review-methodology.md`**：评审输入不是同质文本流——不同 harness 产出的意见结构不同，按来源路由是结构化消费的前提（「模型生成文本不是协议面」的评审侧镜像） |
| **v1.87.0.0 CSO 可验证审计 + 可重放修复包**（#2852） | verified audits：审计结论附可验证证据链；replayable repair bundles：修复动作打包为可从快照重放的 bundle（含运行时组装安全金丝雀 + release proof 边界 + 完整评估报告前置） | **落地（注记级）→ `references/review-methodology.md`**：审计「verified」= 证据链可独立复核（身份绑定 + 完整性）；修复「replayable」= 动作从声明变为可重放产物——两者共同把「审过了/修好了」从断言变为可验证对象（诚实口径族的治理面极端形态） |
| 资格鉴定与 setup 边界硬化、过期快照须从供给源重放 | 同 PR 子题 | 注记——过期证据不可直接消费，须重放刷新（证据时效性显式化） |

### 三、claude-code v2.1.270 → v2.1.272（271 实质轮 + 272 笼统轮）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **Bash/PowerShell/Monitor 每命令 `allowed_domains`**（auto 模式 + 沙箱） | 命令审查时逐命令核定所需主机并仅为该命令开放，其余主机拒绝 | **落地（注记级）→ 基线行**：网络出口最小特权从会话级下沉到命令级——「权限随审查对象走」的出口侧样本（权限通道完备性族网络维） |
| **`omitClaudeMd` 子代理 frontmatter** | 自定义/插件子代理可脱离用户/项目/本地 CLAUDE.md 运行（受管策略仍加载） | **落地（注记级）→ 基线行**：上下文卫生原语——子代理的指令面可显式收窄，受管面不随之放宽（收窄可选、底线不退） |
| **`--accept-command <sha256>`**（plugin install/update） | 接受动作钉定为先前 `--json` 展示的精确命令哈希，替代 `-y` 一揽子同意 | **落地（注记级）→ 基线行**：同意从「点过头」变为「对过哈希」——所见即所核准（展示=核准口径一致族，与 ocr 预览对齐同谱系） |
| **managed-mcp.json 不可读/不可解析 → 保留独占 MCP 控制 + 启动告警** | 企业受管配置损坏时不再被静默忽略（原行为：用户/项目/插件 server 全部加载） | **落地（注记级）→ 基线行**：受管配置 fail-closed 第四/五实证族——治理配置失效必须向「更严」侧落，绝不向「更松」侧静默退化 |
| Bash 权限检查四连修（fmt/column 读文件、通配符在选项值内展开、shell 变量声明旗标伪装、cd+git 链跳过 blockReadsOutsideWorkingDirectories） | 权限检查通道完备性 | 注记——**第七波实证**：旁路修复与新旁路发现持续赛跑，权限检查须覆盖参数语义展开后的真实效果（本仓 scope 门字面前缀匹配已知边界再次同谱系） |
| 组织策略缓存/刷新/代理通道修复群 + fast mode 云会话面 + `/config` 鼠标支持 + pricing multiplier 内部计费 | 策略面与产品面 | 不吸收——产品功能面 |

### 四、dsh：0.1.6 预发布线恢复切割（R28 预警兑现）

- **dsh-v0.1.6-alpha.1** = rc.2 以来 **800 commits** 的首个 0.1.6 切割，主题为 **pkg/运行时解析重构**：runtime host 迁入 asar、内置 loader 升 0.1.6、addon 管理原生缓存、ESM default resolver 对齐、boot 解析边界连环加固（null exports/显式路径错误保留/profile 解析边界）+ web compaction 摘要横幅钉底 + desktop 非对称匹配器测试卫生。
- 判定：**alpha 不取，维持 rc.2 基线**（R17 先例：rc 才可作基线）。运行时打包/解析属上游分发工程面，无方法论新原语。**下轮预警改写**：不再是「无新 rc 预警」，改为「0.1.6 已入 alpha，800 commits 大切割，rc.3/0.1.6 stable 出线即深读」。

### 五、薄轮三行（ocr / comet / harnesseval-w）

- **ocr v1.12.2**：suggestdiff 保留大小写与缩进变更（diff 保真）、preview 总量只圈定 tracked 变更集（展示=执行口径族延续）、Python stub 文件路由 Python 评审规则、opencode backgroundFile 输入 + 终止信号上报。注记级，无新原语。
- **comet 0.4.1**：personal memory learning 可靠化；**#406 把 dsh 注册为受支持 hook 平台**——第三方编排器主动适配 dsh，生态汇聚信号（harness 互操作面在扩张）；ISO 日期不再误拒 + 非 ASCII git status 路径原样显示（i18n/编码卫生）。
- **harnesseval-w ed4ccc6**：模型适配器与公开集例行更新，微增量。

---

## 第三部分：落地载体清单

| # | 文件 | 变更 |
|---|---|---|
| 1 | `docs/research/R29-runtime-refresh.md` | 本档 |
| 2 | `docs/upstream-baseline.md` | R29 口径注 + ruflo/gstack/claude-code/ocr/comet 五行升基线 + dsh 预警改写 |
| 3 | `references/mcp-governance.md` | 新增「ruflo v3.42.0」段（MCP 治理 opt-in + ADR-377 调用者身份绑定） |
| 4 | `references/memory-persistence.md` | ruflo 段补 3.42.0（滑动窗口有界第三形态 + 置信度≤证据可靠性 + reward-blind 固化） |
| 5 | `references/review-methodology.md` | 新增「gstack v1.86–1.87」段（harness 路由外部评审 + CSO 可验证审计与可重放修复包） |
| 6 | `references/dsh-engineering-methodology.md` | §预警更新（0.1.6-alpha.1 切割事实与下轮口径） |
| 7 | research/ 三克隆 | ruflo→v3.42.0、open-code-review→v1.12.2、comet→0.4.1（checkout 落位） |

## 第四部分：吸收对账（克制结论）

1. **不升门禁、不改 SKILL.md、不发版**：本轮全部吸收为注记级；R18/R24/R26/R27/R28 先例沿用。
2. **本轮会师主题一——「可验证性」三面收敛**：gstack 审计可验证（证据链身份绑定+完整性）+ ruflo 调用者身份绑定（ADR-377）+ claude-code 同意哈希钉定（--accept-command）——「断言 → 可验证对象」在审计、调用、同意三面同时落地；身份绑定是共同前件（无身份的验证与票数一样可伪造，ruflo Sybil 修复同证）。
3. **本轮会师主题二——fail-closed 侧持续加固**：claude-code managed-mcp 不可读保留独占控制（治理配置失效向严侧落）+ ruflo 滑动窗口（有界第三形态：计数→预算→时间窗速率）。权限通道完备性族第七波（claude-code Bash 四连修）延续「旁路与正路成对验证」教训。
4. **生态信号**：comet 0.4.1 主动适配 dsh hook 平台——harness 互操作面扩张，与 AIShips 统一底座（codex 直驱 + 多 harness 吸收）方向互证；dsh 0.1.6 大切割在即，保持盯守。
