# R88 调研吸收轮：RSI 证据学 + DSH 0.2.1-alpha.1 深读 + Claude Code Mods 机制面

> 2026-10-04，用户指令触发：「深入调研分析 8 篇公众号文章 + DeepSeek Harness v0.2.1-alpha.1（Claude Code Mods 兼容层），完善本机 swarm yuan skill」。
> 编号顺延：R87 已被并行会话 worktree（fix/r87-deps-normver）占用，本轮取 R88（撞号顺延第六次先例）。
> 证据分级：DSH/Mods/Pi 三对象为 **B+/A**（官方 release notes、源码树 diff、官方文档直查——两个调研子代理产出）；RSI 三源与 Harness 三层为 **B**（公众号文章转述，框架完整，未逐篇核对 arXiv 原文）。
> 结论：upstream-baseline 20→21 行（+pi；dsh 行刷新 0.2.1-alpha.1 深读注记，基线维持 0.1.5-rc.2 沿 R29「alpha 不作基线」先例）；新档 1（rsi-evidence-methodology，FACT_REFERENCES 48→49）+ 四档增节；FACT_RUNTIMES=13 不变。

## 一、九源清单与处置总表

| # | 源 | 主题 | 证据级 | 处置 |
|---|----|------|--------|------|
| 1 | 《Harness、Loop Engineering、Graph Engineering：如何选择，如何评估》 | 编排三层嵌套+四层评估+副作用三态+checkpoint | B | **吸收**：mea-loop §五（长程编排拓扑） |
| 2 | 《Agent Harness 工程：从 Agent Loop 到完整运行时》 | 十层演进叙事（工具→上下文→记忆→任务→沙箱→子代理→恢复→评估→治理） | B | **同构不吸收**：机制散见既有 48 档（subagent-orchestration/memory-persistence/state-machine/canary-monitoring/governance-agents 逐层有专档） |
| 3 | 《Pi 1.0：极简 Harness，开始管理复杂性》 | Pi 运行时机制 | B 文章 + B+ 官方直查 | **登记 +pi 行**（20→21）；codemode 记档 subagent-orchestration；转述失真三处修正（daemon/A2A/No MCP） |
| 4 | 《Claude Code Mods：界面与行为，由你定义》 | Mods 机制 | B 文章 + **B+ 官方文档** | **吸收**：claude-code-capabilities §八 Mods 机制节（修正 R84「产品面卷不吸收」归类） |
| 5 | 《LLM 自进化的系统性困境：字节跳动最新论文》 | Aspire/S³Gym/HarnessDev 五短板 | B | **吸收**：rsi-evidence §五（短板×既有防线映射表） |
| 6 | 《聊聊 EqualAI 的 Agentic AI 治理实战》 | 9P/三层防线/HPA/RAI | B | **同构不吸收**：三层防线=门禁（事前）+hook（事中）+审计（事后）既有拓扑；9P 抽查=compliance 套件；HPA=--industry 立法面 |
| 7 | 《清华大学提出 RSI 全景综述（404 篇）》 | S/I 分离/三类证据/四态保留/密封评测 | B | **吸收**：rsi-evidence §一/§二/§四 |
| 8 | 《Self-Improvement、Self-Evolving、RSI 终于讲清楚了》 | L1-L5 分级/五元组/DPEI | B | **吸收**：rsi-evidence §三 |
| 9 | DeepSeek Harness v0.2.1-alpha.1 | Mods 兼容桥/hooks 桥包/workspace RFC | **A-**（release notes+源码树 diff） | **吸收**：dsh-engineering-methodology §十三 + 基线行刷新 |

## 二、DSH v0.2.1-alpha.1 深读（R85 前移注记兑现）

**版本事实**：tag `dsh-v0.2.1-alpha.1`（2026-10-03）；v0.2.0 仅 rc.1/rc.2 无正式版；0.1.4 被跳过。alpha 不作基线（R29 先例），基线维持 dsh-v0.1.5-rc.2，触发点顺延「dsh-v0.2.x stable/rc tag」。

**Mods 兼容桥四机制**（`packages/experimental/claude-code-mods/`，0.1.2-rc.1 树不存在、真增量）：

1. **register 直包装**：`defineMod({name, version, root, register})` 直接包装 mod 的 `register(on)` 转为 Cordis 插件——不解析任何清单文件。
2. **生命周期映射**：`session.start`←`agent/created`（首轮前等待）/`prompt.submit`←`agent/pre-step`/`tool.call` 包裹 `tools/execute` 瀑布/`session.end`←`agent/disposed`。
3. **不可触发事件点名警告**：`tool.check`/`ui.*`/`telemetry.*` 可注册但永不触发，加载时告知（不静默）。
4. **权限时序差异**：DSH 的 `tool.call` 在权限判定**后**运行（Claude Code 在前）——改参/换工具钩子被跳过。「同名事件跨运行时语义不同」的桥接陷阱正例。

**hooks 桥包修正（R88 核）**：`dsh-hooks-claude-code`（CC 30 事件支持 7 个 + deny>ask>allow 折叠 + Stop 经 steer() 续轮）/`dsh-hooks-codex`（10 事件支持 5 个，payload 保持 Codex 方言）——两包在 **0.1.2-rc.1 树已存在**（git tree diff 证实），非 0.2.x 增量；此前 R12 吸收未记档，本轮补记。**二手信息（awesome 目录称「0.2 新增 hooks 子系统」）与源码树矛盾，以源码为准**。

**其余记档**：0.1.3→0.2.1 演进回填（SessionHandle 会话锁/动态提示词不破 KV Cache/插件热启停/0.2.1 移除 invariant 与 runtime-diagnostics=「删优于养」第三实证）；workspace RFC（discussion #941，社区未落地、早于 0.1.2 基线）不吸收；「Agent 创建插件」入口产品面不吸收。

## 三、Claude Code Mods 机制面（修正 R84 归类）

R84 记「Claude Mods 深层行为修改插件族——产品面卷不吸收」仅据 CHANGELOG 一句。R88 官方文档直查证实为**机制面**：

- mod=注册事件处理器的插件子集（进程内 JS/TS），**无独立 mods.json**（转述失真；实为 plugin.json + hooks.json `modules` 字段 + `register.js` 导出 `register(on)`）。
- 事件面是 settings hooks 的进程内超集：`tool.call`（拒/改参）/`tool.check`（allow/ask/deny）/`prompt.submit`/`turn.step`（换模型或就地代答）/`ui.render`/`classic.*`（桥接旧 hooks）；`$` 命名空间 12 组（`$.prompt.submit` 可冒充用户提交）。
- **"Mods aren't sandboxed"**：用户全权限，Sandbox 只隔 Bash 不隔 mod 自启进程——`claude plugin validate` 查 `hooks:`/`calls:`、组织 `allowManagedModsOnly`、内置 sec-default 防篡改。
- 版本 v2.1.287+；`--plugin-dir` 开发态热重载、已安装无热重载；官方示例在 anthropics/claude-code-playground（replay-theater/blast-radius/token-weather），4 内置 mod 源码公开。
- 落地：claude-code-capabilities §八 Mods 节（表格五面+与 hooks 关系+跨运行时信号指向 dsh §十三）。目标技能 fail-gate-hook 的 mod 形态选型=⑤.5 决策面。

## 四、Pi 1.0（earendil-works/pi，原 badlogic/pi-mono）

**形态**：7 公开包（chord/pi-telemetry/pi-ai/pi-durable/pi-agent-core/pi-coding-agent/pi-tui）；npm `@earendil-works/*`。

**吸收机制**（入基线行注记）：

1. **严格顺序 agent loop**：无并行子代理/无 plan mode（刻意裁剪）；steering 当前 turn 后进、follow-up pending 完成后进。
2. **包管理器式扩展发现**：`pi install npm:@scope/pkg` + package.json `pi` 键 manifest + 约定目录免清单 + `peerDependencies:"*"` 引 host。
3. **JSONL 消息树会话**：entry ID+parent 引用、分支不删史、compaction 插 summary 但原始留存。
4. **project trust 门**：.pi/ 需信任才加载（可撤销许可族 R57 同构）。
5. **codemode**（QuickJS/WASM 沙箱内模型写 JS 编排工具，嵌套 tool call 不进主上下文只回流脚本输出）——subagent-orchestration 记档不吸收（宿主无等价面；对照警示：DSH code-runtime 同类面已移除）。

**转述失真三处修正**（文章口径不得登记）：daemon 不存在（最近等价 `--mode rpc`）；A2A 无对应物（pi-ai=直连多 provider 统一 API）；「No MCP」不实（自研轻量 MCP client）。

## 五、新档 rsi-evidence-methodology（决策 46 两问）

- **哪个环节缺**：swarm-yuan 自身是自改进系统（吸收轮=改进器、references=被改状态、自成长链=记忆保留通道），但收口验收无证据学分层——"修了 N 个缺陷"（任务增益）/"变异锁全绿"（能力保留）/"本轮沉淀了什么纪律"（改进器增益）从未分列主张；自成长链的 L2-L3 定位无刻度。
- **谁消费**：①router「验收/交付类」行【按·改进型变更】+「升级已有技能」生成侧行；②目标技能自成长链（问题沉淀=记忆保留层的证据纪律）；③review-methodology 回归面判定的理论根基。
- **内容**：三类证据分离（§一）/四态保留方式+载体映射（§二）/L1-L5+五元组+DPEI+自身定位（§三）/密封评测协议三件+修复双查+机制覆盖≠能力证据（§四）/字节五短板×既有防线映射（§五，全部已有对应——同构定名不新增）/已登记未实施两条（§六）。

## 六、顺手对账（计数残留，R86 ef54b6b 先例）

- SKILL.md:163 "frameworks 规则库 79 集"→81（R63 php/R64 ruby 后漏改）。
- README.md:224 "48 篇/R50：47 档 + 20 运行时"→49 篇/48 档 + 21 运行时（R86 与本轮两次滞后累计）。
- capability-map/router 头部 46 份→48 份（R86 后漏改）。

## 七、验证

- self-check --check-only 全绿（含 G25 新档双向对账、G20 计数一致）。
- FACT_ARTIFACT_BYTES_BUDGET 第 20 次登记（rsi-evidence 随发 + 四档增节，实测后登记）。
- run-sweep.sh 全套测试零新缺陷（RSI 三类证据自证：任务增益=本轮功能增量落位；能力保留=回归全绿；改进器增益=本报告 §六 对账纪律 + 转述失真七处修正清单）。
