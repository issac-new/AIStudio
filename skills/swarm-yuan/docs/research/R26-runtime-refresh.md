# R26：运行时补核调研（claude-code 269 评估面 + ocr 预览=执行第三实例 + claude-mem 13.24.23 有界化修复族，2026-09-12）

- 调研角色：R26 运行时升级分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-09-12
- 触发：sess_26dcc34a G2「R26 运行时补核轮」指令——升级有更新的 3 仓（claude-code / open-code-review / claude-mem）、做新旧功能差异分析、按 R24 配方吸收（patch 级不发版、认知面预算走决策 38 先例）
- 上轮基线：2026-09-11 R24 补核（claude-code v2.1.268 / codex rust-v0.154.0 / dsh rc.2 / 16 行全景）；其余 13 行今晨扫描零增量（26dcc34a 轮），对账通过
- 数据来源：npm dist-tag + anthropics/claude-code CHANGELOG raw 抓取 + 本地克隆 git fetch/checkout（git describe 验证：ocr @v1.11.9、claude-mem @v13.24.23）
- 执行纪律（沿 R24 第三轮增补）：本轮为**轻量补核轮**——三行均为 patch 级移动（claude-code +1 patch、ocr +3 commits、claude-mem 13 个 patch 号但修复主导无 minor 面），不开全量调研；距 R24 收口为次日非同日，触发为用户显式指令非自动复核

---

## 第一部分：三行移动深读

### 版本全景

| 运行时 | 上轮基线（R24） | 最新稳定（2026-09-12） | 跨度 | 备注 |
|---|---|---|---|---|
| claude-code | v2.1.268 | **v2.1.269**（CHANGELOG latest） | +1 patch | 评估面（plugin eval）+ 权限通道修复 + 终端键修复大族；stable 通道分裂持续 |
| open-code-review | v1.11.8 | **v1.11.9**（3 commits / 55 文件 +1774/−380） | +1 patch | 预览=执行第三实例 + viewer 会话对比页 |
| claude-mem | v13.24.10 | **v13.24.23**（68 commits / 150 文件 +8544/−1214） | +13 patch 号 | 修复主导：有界化 + 降级纪律 + 记忆卫生；迭代极快 watch 维持 |

### 一、claude-code v2.1.268 → v2.1.269 深读（CHANGELOG 全量）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **`claude plugin eval`** | 跑插件评估套件，评分 + 可复现 JSON/HTML 报告 | **落地（注记级）——评估可复现族**：与本项目判别器断言（旧实现必挂）同向：能力声明须有可复现评估载体。宿主面事实，登记不升门禁 |
| **`Bash(tee:*)` 绕过写路径检查修复** | `tee` 这类无害外观工具被用作写通道时，写路径检查被绕过 | **落地（注记级）——权限检查通道完备性族**（与 268 符号链接两连同谱系）：检查挂在「命令外观」而非「效果语义」即可被中间工具旁路；`!` 前缀规则过应用修复同族（规则作用域收窄）。本仓 scope 门字面前缀为已登记边界，维持 |
| **`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`（1-256）** | 工作流并发代理数上限进宿主 env | 注记——**并发有界**进宿主配置面（与死线族同向的资源主权） |
| **attribution 规则覆写 CLAUDE.md 修复** | 归因规则不得凌驾项目指令（优先级守护） | 注记——配置优先级契约：项目显式指令 > 宿主注入 |
| **CJK 无空格语言建议丢失修复**（中/日/泰） | 分词假设空格分隔，CJK 建议被丢弃 | 注记——CJK 处理面持续补齐（与 claude-mem CJK substring 检索同向） |
| 其余 | kitty/st/rxvt/WezTerm 终端键大族、prompt-cache 部分失效、后台代理误报等待输入、`/btw` 捏造工具调用（诚实面）、gateway model discovery 超时 env（死线族又一员）、synced skills 改名 `anthropic-skills:<name>`（命名空间隔离） | 环境事实级，不进执法面 |

### 二、open-code-review v1.11.8 → v1.11.9 深读（3 commits）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **`--preview` 应用与评审相同的选择集**（#801） | 预览此前与实际评审的文件选择不一致 | **落地（注记级）——预览=执行口径族第三实例**（R24 已登 Rego + 预览=执行两样本，本条把「所见即所扫」在 CLI 参数层坐实）：预览路径必须消费与执行路径同一选择函数，不允许平行实现 |
| viewer session compare 页（#1175） | 会话对比 UI | 不吸收——纯查看器面 |
| deepseek-flash 模型（#1210） | LLM 通道新增 | 环境事实级注记 |

### 三、claude-mem v13.24.10 → v13.24.23 深读（68 commits，修复主导）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **健康探测按调用方剩余死线封顶**（#3575） | 每个探测与重试睡眠都吃调用方剩余预算，`waitForHealth(short)` 不再坐满 5s | **落地（注记级）——死线传播族**：子操作预算 = 调用方剩余死线（与 claude-code WebFetch 300s 宿主死线、ocr `timeout_sec` 同族）：超时不是各层自定，而是从入口一次性分配向下传播 |
| **worker 不可用 fail-loud 一次后 fail-open**（#4033） | 同一场故障只阻塞第一个提示，后续 hook 放行 | **落地（注记级）——降级三态**：可见性（fail-loud 一次）→ 不重复打扰 → 降级运行（fail-open）。比「一直 fail-closed」与「静默 fail-open」都优：故障可见且不瘫痪主流程 |
| **三处有界化**：sync_outbox 增长（云同步未配置时）、会话摘要输入按载荷尺寸、定时投影修复工作量 | 无界队列/输入/后台工作全部加界 | 注记——有界性族（与死线族同根：资源占用须有上限，未配置的外部依赖不得无限堆积本地状态） |
| **SDK 子进程 cwd 监禁**（#4054） | supervisor 把 SDK 子进程工作目录钉死 | 注记——进程纪律（子进程继承的自由度即攻击面） |
| **记忆卫生**：plugin cache 会话跳过（#4042）、空标题观测不采集（#3176） | 非真实会话与空标题观测不进记忆库 | 注记——**采集选择性**：不是所有会话都值得记忆（与本仓「缺失证据不显示为零」同根的诚实口径，作用在采集侧） |
| **幂等注册**：memory_session_id 注册一次不重注册（#4027） | 重复注册消除 | 注记——幂等族常规样本 |
| 其余 | 项目名锚定 Claude 项目目录（#4055）、localhost 归一化 127.0.0.1（#3436）、chroma JSON 解析崩溃不中止同步管线（#3542）、Bun 运行时路径 ENOENT fail-loud（#4039）、冷启动误报「too old」修复（#4036）、macOS 桌面捆绑 codex CLI 探测（#3445） | 修复族对账通过，不单列 |

---

## 第二部分：落地载体清单

| # | 文件 | 变更 |
|---|---|---|
| 1 | `docs/research/R26-runtime-refresh.md` | 本档 |
| 2 | `docs/upstream-baseline.md` | R26 口径 + 三行升级（claude-code v2.1.269 / claude-mem v13.24.23 / ocr v1.11.9），R24 及更早注记维持 |
| 3 | `swarm-yuan/references/claude-code-capabilities.md` | 新增「版本注记：v2.1.269」段（plugin eval 可复现 + tee 写路径旁路 + 并发上限 env + CJK） |
| 4 | `swarm-yuan/references/memory-persistence.md` | R26 行（剩余死线封顶 + fail-loud-once-then-fail-open + 三处有界化 + 记忆卫生） |
| 5 | `swarm-yuan/references/review-methodology.md` | R26 行（ocr #801 预览=执行第三实例） |

## 第三部分：吸收对账（克制结论）

1. **不升门禁、不改 SKILL.md**：三行均 patch 级、无新治理原语进执法面。R18/R24 先例沿用，**不发版**。
2. **本轮会师主题——「有界性与降级纪律」跨宿主第三次成族**：死线传播（claude-code WebFetch 300s → claude-mem #3575 剩余死线封顶）、队列/输入有界（claude-mem 三处）、降级三态（fail-loud 一次 → fail-open）。全部登记 references 版本注记，不进执法面。
3. **权限通道完备性**（tee 旁路 / `!` 规则过应用）与**预览=执行第三实例**（ocr #801）并入各自既有家族注记。
4. **采集选择性**（记忆卫生）登记 memory-persistence：诚实口径从展示侧延伸到采集侧。
