/** # §4 Harness Playbook（Can Bölük / omp²）——原文深读笔记 */

> 原文：The Harness Playbook，Can Bölük，2026-09-02，stencil.so/blog/harness-playbook（9 章 + 2 附录，全文深读 2026-09-11）。
> 触发文章：公众号「小马」《Harness 不是 while 循环》解读版。本笔记为原文级（2718 行全读），含转引未展开的机制细节。
> 上游数字机械复现说明：78 示例/15-of-17 状态 bug 为原文附录 A 数据，本机未独立复现，标注为转引。

## 一、设计包络（CH1）

四种运行模式是**架构测试**而非市场定位：Multiplexed workspace（本地多 agent 共目录）/ Remote driver（手机驱动云端）/ Spectator（网页旁观）/ Factorio（SDK 软件工厂对抗不可信输入）。四维变化轴：本地或远程、交互或自治、信任边界、并发度。只按第一种场景设计会犯四个错：控制器塞进 TUI、状态关在闭包、扩展在引擎进程内执行、假设人类收拾无界调用。

**五推论**（全书连接组织）：单一权威会话 / 可信控制面 / 有界工作 / 显式兼容 / 视图是投影。

## 二、状态（CH2）

**状态三选一定理**：要 durable/rewindable/crash-tolerant/forkable 只有三条路——①保留产生状态的历史 ②只保留关心属性的变化 ③保留整台机器。Source Engine 用变体②（entity delta），omp² 用变体①。

**三层全局态分类**（比「两个权威」更精确）：
| 层 | 例子 | replay 行为 |
|---|---|---|
| A: journaled as tree entries | model_change / thinking_level_change / session_info / label | ✓ 正确回放 |
| B: journalable via custom entries | 各扩展自造的 derive 逻辑 | ≈15 个 lifecycle bug |
| C: 不在历史里 | AGENTS.md · 扩展集 · 工具花名册 · settings · provider config · MCP servers | 编辑 AGENTS.md 后 replay 用的是今天的副本 |

**omp² 答案=单一物化会话**：整会话物化为一棵 DOM（`<meta>` todo/jobs + `<body>` 消息链 + `<queues>` steering/prompts），事件是属性变更流（patch stream）。树是权威，journal 存增量，运行时对象只缓存不成为第二真相点。

**单一权威买到什么**（四个难题归一）：
- **rewind = DOM diff**：当前物化 vs 目标态做 diff；`<subagent>` 元素消失→terminate，出现→spawn，delta 即完整生命周期工作清单。**新增有状态 feature 永不加 rewind/fork/resume 调用点**
- prompts 变投影：系统提示直接查同一棵树（`count(select("todo item[status!=completed]"))`）
- 复制变订阅：远程客户端消费 patch 流而非 tail 文件
- 渲染变投影：组件注册表从同一元素状态渲染
- **controller/actor 分离**：controller 独占会话状态；actor 只渲染快照+patch 流；TUI/远程/子代理检查器成为对等体

**附录 A 九案例全录**（78 官方示例：60 无状态；17 有状态仅 2 正确）：
1. git-checkpoint.ts：checkpoint Map 在 agent_settled 被 clear，/fork 拿到空引用
2. plan-mode：rewind 后 plan 限制残留；resume 复活死分支快照
3. status-line：turnCount 闭包计数，rewind 3→1 后下轮说 4；resume 归零
4. dynamic-tools：动态注册工具 rewind 后还在（registry 不重派生），--continue 后消失
5. snake.ts：restore 扫全文件，死分支的存档复活
6. bookmark.ts：「最后一条」=文件序最后，rewind 后 bookmark 到不可见分支
7. kimi-deferred-tools：工具发现点前 rewind，Calculator 仍激活（roster 不随分支重derive）
8. auto-commit-on-exit：/new /resume /fork 都触发 session_shutdown → 误 commit worktree
9. tic-tac-toe：live 写与 restore 读用不同 entry 类型，崩溃后用户落子消失

**原文结论**：文档修不了这种 bug 分布——引擎需要「状态只能存在于一处」的约束。Source 的正确性不是靠细心的 reconciler，是**让不可回放的状态不可表示**。

## 三、运行时（CH3）

**沙箱只执行不决定**：把执行器放进 VM 的两条路都死路（工具拆两侧→程序化工具调用冲突；driver 进 VM→源码/prompt 泄露+边界挪动痛苦没走）。答案：**一个顺从的迷你 stub 留在 VM（python+rg+只读 git 镜像=minimum viable prisoner），其余全部留宿主**（会话状态/推理/策略/工具路由/审批/限额/日志）。跨边界每条流在不可信端耗光宿主内存前被截断。

**job 原语**：Claude 给自己的后台 shell/Task/BashOutput/SendMessage/KillShell 画的工具图全部收敛于进程接口（signal+stdin+stdout+exit status）——后台 shell、子代理、dev-server 守护、远程函数、超预算调用是**同一个 job 对象**。阻塞预算在一处强制，输出溢出到一个 artifact 路径，检视/消息/kill 一个入口。

**kill boundary**：AbortSignal/context.Context 是协议不是强制（忘传信号/同步死循环=超时只是让 agent 继续，工作还在烧资源）。安全宿主需要**真正可终止的执行单元**（进程/worker/子解释器），其死亡不能带走会话权威。取消属于运行时契约，不属工具作者自觉。

**子代理同一边界落在文件系统**：worktree 只隔离 tracked 文件；pi-iso 用 COW（APFS/btrfs/ZFS/overlayfs/ProjFS）给每个子代理整工作区视图。子代理得视图、返变更、不共享父级可变权威。

**工具契约**：旧契约 renderCall/execute/renderResult 三阶段拆散同一操作（文件开两次、diff 算 N 次、serde 临时格式）。omp² 定义：**工具执行=有界可取消的状态流**——`<Edit status="running">` 元素流变，模型/用户/journal/远程/测试观察同一状态的不同投影，settle 冻结最终 diff。截断在会话渲染层统一做（而非各工具内），否则 Eval 里 N+1 层截断叠加且模型无法区分数据与 harness 注释。

## 四、控制面（CH4）

**Values=ConVar 模式**（Source Engine）：类型化变量+flags（REPLICATED/NOTIFY/ARCHIVE/CHEAT/USERINFO/PROTECTED）在定义点声明一切——作用域/持久化/继承/复制/回放诚实性都是**变量的属性**而非 setter 调用点的事。无 god object、无手工 dirty tracking。会话作用域 convar=权威树里又一个 journaled 节点。

**继承不需要第二设置**：子代理默认 seed 父级全部 live 值；要钉住就一行 cfg（subagent.cfg 自动执行 + `<agent>.cfg` 叠加）。bind/toggle/alias 也是 console 命令——keybinding 留在带内，不再自造 schema。

**Behaviors=Director 原语**（loop-shaped hole）：hook=观察/编辑单次推理；**Director=跨轮持有控制权+拦截 yield**；可堆叠嵌套（Base→TodoReminder→Plan→ForceTool）。Pi 的 Plan+Goal 互斥靠插件作者私造 WorkflowMutex——缺失的抽象在独立编写的行为相遇时显形。Plan mode=完整组合（Plan 拥有 yield、临时 push ForceTool、收回候选 yield 决定继续或交用户），而非特殊模式标志位。

## 五、推理（CH5）

**模型怪癖=结构化知识**：v1 的 isCerebras/isKimi 布尔扩散到 compat(880 行)+model-thinking(977)+variant-collapse(1776)+三个 provider builder。omp² 三件套：taxonomy（字符串是什么模型）/classes（谱系有什么性质）/providers（宿主改变什么），KDL 规则表达。**编译器是关键**：未知指令报错、同优先级规则冲突报错（文件顺序不偷偷赢）、无匹配答 Unknown 而非 false。赢面=每个事实单一持有者+显式优先级+未知状态。

**provider 不只是 stream**：token 计数/WebRTC 语音/web-search/embeddings/图像视频生成/tokenization/用量查询/模型发现+bleeding-edge 控制（constrained sampling/verbosity/context filter/forced tool call/developer role/会话中系统提示）都是共享基础设施——留给扩展=同一协议 N 份不完整实现+OAuth refresh 重试各写各的。

**forced tool call 四错误姿势**：报错（排除大半模型名册）/静默丢弃（调用方自造执法循环）/盲目透传（Anthropic 会变 cache miss）/不暴露（调用方绕库重造前三种错误）。**正确=三步升级**：①无条件注入软提示（OpenAI 托管 API 悄悄帮你前置，vLLM 不会——不提示则模型在思考模式里打转）②provider 无副作用才设原生 flag ③不服从则有界重试，最后即使有代价也设 flag——correctness 赢过 cache。

**工具 schema=模型面向协议**：RL 训练的 agent 会用别家 harness 的 schema 调熟悉工具；Codex 看 paths:string[] 会按心情发分号/逗号分隔单串。**语义契约严格、模型方言宽容**：无歧义就修复（"a,b"→list），歧义就结构化可重试错误。

**strict sampling 两系统级约束**：strict-schema 名额是 provider 共享预算（独立扩展能把 provider 搞到全拒）；grammar 方言 per-provider（LARK 直传可能非法）。因此 capability/预算/方言归一/fallback/repair 全归推理层，扩展只声明意图。

**修复式推理（corrective inference）**：repair 畸形 JSON/检测 Gemini 与 DeepSeek 重复循环/从文本泄露中合成 canonical tool_call 与 think 块。**provider 适配器能开流不算完整——要保证 harness 其余部分拿到 canonical turn**（尽管畸形 JSON/重复/泄露推理/方言）。

**compaction 是调度的不是触发的**：限制前 ~10% 投机启动，会话分支双版本并发（主线继续+后台压缩），完成后 splice——用户最投入时不等最大请求。备选：Remote compaction（OpenAI 不透明状态 blob，能看解密 thinking）/Handoff（交接而非摘要）/Shake（本地裁掉重工具结果）。prompt 历史每条目建为 fold（fn(this,req)->req），UI 渲染与请求渲染分离（用户看全量、模型看压缩后）。

**小模型内嵌**：LiquidAI 类 tiny model 做分类/标题/翻译/用户情绪判断/TTS-STT——不是第二 agent，是不付 frontier 延迟成本的内部能力。

## 六、工具面（CH6）

**每个 schema 都有税**（omp 实测）：23 定义 86.2s/25.1k tok → todo-batching 修 59.5s → 15 定义 45.4s → **5 核心工具 36.6s**（快过 Codex 42.2s/Pi 37.0s，前缀 token 15.1k）。原因=工具语法参与 token 生成，驱动模型持续输出合法 JSON。**「以防万一加个工具」是免费午餐幻觉**；动态发现换 roster 即缓存失效。目标=稳定小语法+长尾走普通组合。

**dyn CLI**：经 Bash 暴露的稳定发现协议（`dyn --q github` 搜 → `--help` 看详情[从 JSON schema 合成] → `literal|@file|stdin` 三形态调用）；图片工具复用 Sixel/Kitty 协议经 Bash 回显（ssh 远程图也能看）。

**code surface**：有界操作集→schema；开放操作集→code surface（Browser open/run/close、Computer desktop/wait/assert 在持久会话内组合）。

**契约卫生**：每工具带 intent 参数（参数流式期间即渲染「模型以为自己在干嘛」+journal 可读摘要）；**工具写版本号**——trace 里解析高变更工具的 I/O 评估成功率，不用猜哪个契约产的调用。name/version/intent/input/output/diagnostics/usage 都是协议数据。

**Deep builtins（Read=物化资源）**：一个 Read 顶二十个工具——目录（免 Ls）/.ipynb 结构化/pdf·docx·pptx·xlsx·epub 提 markdown/sqlite 列表查 schema 查行/图片返元数据（`:img` 预览 SVG）/ZIP·JAR·wheel·ASAR 不解包寻址/http 资源按 range/代码返结构摘要（找 class X 不用拉全文件）。本质同一操作：**把资源物化成我最能推理的形式**。`:raw` 旁路投影、`:conflicts` 逐条冲突块、range 开放/长度/不连续多形态。**非 web URL 子系统**：artifact:// agent:// history:// issue:// pr:// skill:// rule:// memory:// local:// vault:// security:// omp:// xd:// ssh:// mcp:// 全走同一内部 URL 机制。还有不可见恢复：从唯一工作区后缀解析错误绝对路径、Windows 展开 ~。反例对照：`Bun.file(path).text()` 一行 vs 复杂度被复制进 shell 命令/prompt/扩展/失败调用，无人持有、各实现 30%。**Read 复杂所以阅读不复杂**。

**Bash=策略感知命令语言**：omp 内嵌完整 bash parser+interpreter+coreutils。收益：①保留模型肌肉记忆（grep 自动路由 ripgrep 引擎，不用 AGENTS.md 求模型）②平台中立（Windows 进程内跑）③控制台跨调用有状态 ④**审批从 TSA 查字符串变为 capability 审批**——解释命令本身，执行到 ln 那一刻才问，之前全只读；用户已授权目录则连问都不问。审批发生在能力边界（git push/越界写/网络请求）而非不可读 shell 串边界。

**AutoQA**：给 agent 的 bug 报告通道（早于 Anthropic 等价物一个月）。自主收集工具好用/困惑/出错信号；报告质量不高（Codex 爱甩锅 Read 工具）但易过滤，过滤后是「哪个操作困惑模型/哪个投影藏数据/哪个修复属于 harness」的巨大信号源——**闭合工具设计与部署行为的回路**。

## 七、界面（CH7）

**字符串复合（strings compound）**：已渲染字符串兼任布局树/样式树/内容/传输格式/终端程序五合一。实测：renderer 独占 80% CPU；单个 `.includes`（查是否图片行）占 20%；wrapAnsi 98.7s；渲染 267s（该会话 0 图片）。扩展无共享设计语言：99% 灰色矩形、1% 用力过猛；社区渲染器不消毒外部输入→ANSI 注入（鸭子图占屏）。

**omp² 解法**：RichText (Style,String) 单遍流进抽象管道——267s→90ms（render once, replay forever）；类型化组件模型（元素嵌套错误在编辑期 lint 而非运行期花屏）；**呈现策略归渲染器**：语义色（`border=round bc="info"` 解析主题色）/语义图标 `<ico:new/>`/截断/流节奏（Claude 词块 vs Codex 字符节奏的平滑）各有唯一所有者，扩展不再穿 theme 对象。

**验证是界面的一部分**：不定义「怎么验证」，agent 会侧通道造 look-alike 假测试。预定义验证形状（自定义工具/Py 包/API），必须**非破坏、离屏、多实例**——防 agent 重新（降级）定义成功。debug protocol=UI 的机器可读定义，不只是测试助手。

**transcript 是协议**：block 生命周期 active→finalized→committed；Mutable 块（spinner，投机快照永不入史）/Append-only 块（前缀稳定即可逐行提交）。三层解耦：viewport 表现（可变）/逻辑账本 L（宽度无关、exactly-once：L=F1·F2…Fc·Wj[1..ej]）/native scrollback（不可逆物理行）。resize 三策略 Preserve/Append/Rebuild=显式策略而非民间传说。

**TLA+ 工作流**：上一版靠 fuzzer 调稳；这版 TLA+ 建模（ElasticSlots.tla 全文在附录 B）迭代修改至不变量全满足；要改行为（yolo commit partials/禁 block 截断）先改参考模型，失败自动出反例。**把不可能的部分形式化规定出来**。

## 八、技术栈（CH8）

**语言即架构**：默认值/标准库/项目形态/编译器反馈/生态惯例=生成代码的先验。允许 20 种同等正常本地风格的语言=让模型先做 20 个决定再碰产品问题。TS 的罪：变成「你的语言」（camelCase vs snake_case/Zod vs Typebox/ESM vs CJS/…15 个等价选择）。选型：**Rust 核心**（系统软件语言+编译器安全网）+**Python 扩展**（agent 输出不错的 Py→不错的扩展；Py 自省 AST 使 @remote 边界可能——SDK 检查函数/打包源码/沙箱执行，无需扩展作者手写 RPC；内嵌 Py runtime 让 Eval 开箱即用）。预言：WASM GC 定稿后 Go 是最终赢家。

## 九、五问评估地图（结语）

1. 它只有一个权威吗？——状态活在 journal 外（todo/计数器/注册表在闭包）→ rewind/fork/resume 撒谎
2. 沙箱只执行不决定吗？——控制器塞进 TUI/客户端；审批策略跟沙箱走
3. 限额是有界原语吗？——无界调用靠人收拾；后台任务不可取消无观测
4. 模型怪癖有唯一持有者吗？——同一怪癖多处编码、靠 if(isXxx) 散落
5. 界面是单遍流不是字符串糊墙吗？——渲染字符串五合一

## 十、Hermes 集群自照（2026-09-11 实测）

| # | 五问 | 集群对应 | 判定 |
|---|---|---|---|
| 1 | 单一权威 | kanban task_events 16 kind 全生命周期+git 部署源+soul_integrity 基线 711 文件 | ✓ |
| 2 | 可信控制面 | approvals 三模式+action_gate+tirith+Guardian 二审；ACP 沙箱收有界请求 | ✓ |
| 3 | 有界工作 | max_turns/goal_max_turns 硬限+delegation-brief 1.2.0 预算字段；后台子代理无中心 token cap | ◐ |
| 4 | 显式兼容 | provider 怪癖散在 config——用户已裁决模型路由不入设计 | 不追 |
| 5 | 视图投影 | 图 2-4 驾驶舱=投影非权威；SwarmStudio 五接口 | ✓ |

**已落地融合**（2026-09-11）：F1 token-meter --tools 工具税度量 / F2 devops SKILL version 178/178 / F3 delegation-brief 1.2.0 预算字段 / F5 设计文档 §3.4 工具税佐证。

**已落地（AutoQA，2026-09-11 二轮）**：`token-meter.py --errors`——AutoQA 式机械采集：terminal 按 exit_code 非零、JSON 协议工具按 status/ok/error 字段解析、文本工具只认硬错误标记（Traceback/SyntaxError/File not found）。首周实测：terminal 8.3%（771/9255）、execute_code 5.3%（127/2378）、skill_manage 72.6%（跨 profile not found 是真信号）、memory 44.8%（full 拒绝）——供 ops-eval 周报消费，JSON 归档 research/metrics/tool-errors-*.json。判定精度经三轮抽样校准（关键词法→JSON 解析→ok:true 一票成功）。

**待吸收候选**（需裁决）：
- **ConVar flags 思想**→profile config 字段加「作用域/持久化/继承」声明式标注（fleet 传播可校验）——涉及 config schema，需用户裁决
- **capability 审批**→action_gate 已按可逆性分级，但 terminal 命令仍是字符串扫描（tirith）而非解释后按能力边界审批——hermes 本体代码层，登记不落地
