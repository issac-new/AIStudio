# swarm-yuan 去抽象化终态方案（R13-Final v6）

> 调研日期：2026-08-21（档案日期，自 git 首次提交补录）

> **文档性质**：供维护者审核的最终完整方案。自包含：复盘结论、理论、终态架构（文件级规格）、迁移路径、验收标准、风险兼容、实施批次、决策点。审核通过后本文档即为实施依据。
> **取代关系**：取代 R13 方案 v1-v3 草稿（`R13-de-abstraction-retrospective.md`）；吸收并内联 `R13-codex-deep-dive.md` 的关键证据（该文保留为 file:line 级证据备查）。v4 增补：Codex as a Platform 官方博客（2026-08-19）消化——平台分工教义（§2.3）、token 纪律即能力的官方实测、吸收边界补 harness 内部。
> **v5 纠偏（维护者三问）**：①概念体系不删除、完善落地——病根在机械打分的落地形式，不在概念本身（D1 改为落地化：机械计分退役，概念落地为 AI 判断引导+留痕）；②门禁不下调——10 个 advisory-only 全部接线真实触发路径，FACT_GATES_TOTAL 保持 54；③industry-profile 孤立无加载不对——conf-render.sh --industry 必须落实加载（D3 成为硬性要求）。references 同步改为全保留+路由化。总原则确立：**落地优先于删除**。
> **v6 增补（五维保障）**：所有思路贯彻落实的保障面——§4.5 五维体系（结构性/连接性/有效性/适配性/成长性），每维一个问题 + 机器可查载体；§6 验收扩为 12 指标（新增 8-12 为五维度量）；修复 §2.3 重复编号与组 A 标题残留。
> **证据基础**：zcode 会话库 32 个主会话全量提取（五轮"过重"诊断史）｜仓库病理量化诊断｜openai/codex master f20b63e 三路源码深挖（全部锚定 file:line）｜本 session 十轮迭代执行者自省。
> **方案总承诺**：每个迁移单元的 diff 必须为净减法或等量替换（新增行数 ≤ 删除行数，收口时 `git diff --stat` 机器验证）。全案不新增任何概念体系。

---

## 0. 审核指引

### 0.1 一页摘要

**诊断**：swarm-yuan 把"研发范式"编码成了要 AI 阅读、记忆、自觉执行的**内容**（40+ 概念体系、23 节 spec 模板、96 项核对清单、54 门禁分类学、176 conf 变量），而不是约束行为的**条件**。范式越完备，留给项目认知的空间越小——目标 AI 读项目代码前先消费约 5 万 token 规范、持有 150+ 记忆槽位。此病已五轮诊断（07-21×3、07-30、08-21），前四轮修复全是"加检测器"，净效果为持续增重。

**解法**：重构为**厚生成器 + 薄生成物**两体系统。**总原则：落地优先于删除**；五维保障（§4.5）：**结构性**（层依赖显式单向）/ **连接性**（每类资产有生产者→消费者闭环，孤儿=0）/ **有效性**（机制有拦截/引导/税制三观测位的证据）/ **适配性**（项目档×任务档双维显式，砍文件不再发生）/ **成长性**（双通道：生成物自成长 + 生成器吸收通道，均受预算约束）——概念体系/门禁/industry-profile/references 一概不删，病根是"没有正确落地"（机械打分/僵尸孤立/无路由），全部转为真实消费路径。Codex 是同题反解的存在证明——它把规范压缩成三类可机器求值的事实（沙箱形状/审批策略/已放行规则表），模型可见安全内容仅 4-5KB，主指令模板 80 行，而强制逻辑在数万行代码里。**强不来自更多规则，少不来自删知识。** 平台官方定位（developers.openai.com/blog/codex-as-a-platform，2026-08-19）进一步确认分工：harness 管 agent loop 与沙箱审批，**应用管上下文、业务规则与操作边界**——生成物正是"应用侧资产"，薄是它的本义；官方实测 harness 上下文纪律把 ARC-AGI-3 分数 13.3%→38.3%（token 减 6 倍）——**token 纪律即能力，不是成本**。

**预期终态**（六个月复审口径）：生成物每会话固定税 15KB→**≤8KB**；生成物概念体系 40+→**≤5**；冷启动到读项目代码 8 步/5 万 token→**≤3 步**；门禁可达率（默认流程可触发的门禁占比）44/54→**100%（54/54 全接线）**。

### 0.2 待决策点（审核时逐项确认）

| # | 决策 | 推荐 |
|---|------|------|
| D1 | **概念体系落地化（不删除、不归档）**：认知六阶链/六维动力学/三元演化/七推理/7 对辩证范畴/五维偏差/思维模型 8 类等概念，**病根在落地形式**（check_cognition 用 awk 数表行数机械打分、0 fail），不在概念本身。修正：机械计分全部退役，概念**落地为 AI 判断引导**——check_cognition 等以 AI 按框架逐维自查并输出判断到 `.swarm-yuan/notes/`（留痕）的形式真实消费概念（GATE_AI_JUDGMENT 成为唯一模式）。SKILL.md 中概念从"要背的名词堆砌"改写为"工作时按此思考"的指引式表述 | 批准（落地优先于删除——判别式第三条路：不占机械执法，但被真实消费） |
| D2 | **advisory-only 10 门禁全部接线（不下调、不删除）**：operate/decision-audit/loop-oracle/cwe-audit/cert-audit/learnings/pr-quality/skill-supply-chain/state-phase/upstream-baseline——默认流程不可触达是病，处置 = **逐个接入真实触发路径**（逐门禁接线表见 §5 组 A），FACT_GATES_TOTAL **保持 54**，可达率 100% 由全接线实现 | 批准（门禁不下调——每个门禁当初都是为真实场景设计的，缺的是触发路径不是存在价值） |
| D3 | **industry-profile 7 份必须落实加载**：conf-render.sh 加 `--industry finance|gov|...` 选项真实加载 profile conf 并把门禁参数注入 precheck.conf（替代"手工 cat >>"的现状） | **批准且必须**（用户明确指令——孤立无加载是不对的） |
| D4 | **版本策略**：重构跨 4 批次，建议批次 1-2 收口发 v1.12、批次 3 发 v1.13、批次 4（宿主下沉）完成后发 **v2.0**（产物形态变化属于重大版本） | 按此执行 |
| D5 | **批次划分与节奏**（§5.4）：4 批各独立 worktree 收口；是否需要在批次间插入你的中期审核 | 批次 2 完成后插入一次中期审核 |

### 0.3 前置事项

R4-3 worktree（upstream-baseline 16 运行时 + CLI 两行 + references 吸收段）已改完未收口——在本方案批次 1 之前先收口（其中六份 references 吸收段按 §5 组 A 的复核规则处理：未过"吸收三问"的段落回退，避免带着新增病灶进入重构）。

---

## 1. 为什么必须动：复盘结论

### 1.1 五轮循环（zcode 会话库还原）

| 轮次 | 时间 | 诊断核心 | 修复手段 | 净效果 |
|------|------|----------|----------|--------|
| 1 | 07-21 | "架构不重型，默认形态重型" | 13 WP：拆分/降级/三档 profile | 门禁 36→27+9，conf 179 变量 |
| 2 | 07-21 深夜 | "机制超载"（fail() 全仓 2 次、trace 空文件、70/70 勾选但核心未动） | 门禁分层 strict/warn/advisory | 54 门禁叙事成立 |
| 3 | 07-21~25 | "结构/冗余/叙事三层重量"（14 套并行词汇） | facts.conf 单源 + 自适应 6 机制 | 179→141 变量 |
| 4 | 07-30 | "产物实际可用性"（34 份 reference 无路由、lite 砍文件不砍节、12vs13 漂移实锤） | self-check 扩扫 + gen-e2e | 修扫描，spec 23 节照旧 |
| 5 | 08-21（本次） | "抽象化和形式机械化" | **本方案（以退役为主）** | 待定 |

演化模式定型为**吸收→膨胀→诊断→减重→再膨胀**；本 session（8 月，v1.5→v1.11）140 提交中 36 加法 vs 5 减法——AI 执行者系统性偏好加法（加法有完成感可测试，减法需要判断"什么不重要"）。

### 1.2 量化病理（当前）

| 维度 | 数值 |
|------|------|
| 自举系统总规模 | ~68,000 行（.sh 34,874 + .md 32,917，不含 research/） |
| 生成器 SKILL.md | 142 行 / 22.4KB，**40+ 套独立编号概念**（平均 3.5 行一个新概念） |
| 生成物（standard 档） | ~50 文件；每会话固定税 15KB；随附 references 263KB；前置记忆槽位 150+；冷启动约 8 步 / 5 万 token 才读到项目代码 |
| 机器执法 | 431 处 grep；self-check `check_doc_consistency` 434 行防"文档数字漂移"——与目标项目开发质量零关系 |
| 防漂移账本自身漂移 | `facts.conf` FACT_SCRIPT_LOC 声明 6355 vs 真值 6393；FACT_CONTEXT_SURFACE 注释 154,088B vs 实测 160,920B |
| 僵尸资产 | 10/54 门禁默认不可触达不可 fail；7 份 industry-profile 无脚本加载；5 份 methodology 文档（508 行）仅被索引表引用 |
| 认知框架落地形式错位 | check_cognition 用 awk 给"理解"机械计分（六阶满分 14 + 五层总分 22），永不 fail——**概念框架本身有价值（项目的理念内核），病在用机械计分落地它**：诱导填表冒充理解；正解是落地为 AI 判断引导（§5 组 A） |

**健康器官（保护清单，§附录 B）全部是"防 AI 说谎"的条件类机制**：path-check（杀幻觉路径）/ 计数核验 ≥0.95 / last-good 红线 / draft→active 状态门 / 版本锁定 / 真实 fail 门禁族 / integrity-guard deny / trace+decisions 落盘。

## 2. 理论基础：条件 vs 内容 + 失败方向

### 2.1 统一判别式

| | **条件（condition）** | **内容（content）** |
|---|---|---|
| 作用方式 | 运行时约束：做错被拦 | 认知期待：先读先记再自觉 |
| 认知占用 | 零 | 每会话重复支付 |
| 糊弄可能性 | 结构上不可能（路径不存在即 fail） | 结构上必然（散文过检） |
| 五轮诊断存活率 | 100%（全部有效） | 0%（全部被点名为病灶） |

Codex 佐证（同题反解的存在证明）：审批×沙箱二维矩阵 + 三值规则引擎 + hooks 全在机器里；模型可见的安全内容 ≈ 4-5KB 且一半是运行时生成的清单（可写根列表/已放行规则表）；主指令模板 80 行/7.3KB，其中安全约束**零内容**（一句指针指向动态注入段）。

### 2.2 失败方向教义（判别式第二半，来自 Codex）

- **权限边界一律 fail-closed**：默认全拒、白名单放行（Codex Seatbelt 第一行 `(deny default)`；网络无 allow 即无网；沙箱不可用→问人/never 下直接拒）。
- **fail-open 只允许发生在还有下层强制兜底的地方**：Codex hooks 失败/超时不阻断（命令还要过沙箱+规则）；规则文件解析失败退空策略（还有兜底矩阵）。
- 本仓散落的每个 fail-open/fail-closed 决策（hooks/precheck SKIP/conf 缺省）从此用此教义逐处复核，不再逐个争论。

### 2.3 平台分工教义（Codex as a Platform，2026-08-19 官方博客）

OpenAI 官方定位："**The reusable part is the agent loop**"——Codex harness 管"理解任务/维持上下文/调用工具/沙箱与审批策略执行/跨 turn 推进"，**应用（host）管产品上下文、业务规则、工具与操作边界**（"The host application can decide where an agent runs, which files or tools it can access, which actions require approval, how work is observed"）。Relay 示例：应用提供 MCP 工具与审批步，harness 提供 agent loop 与沙箱执行。

对本方案的三点验证与修正：

1. **厚生成器/薄生成物与平台分工同构**：swarm-yuan 生成器 = 生产"应用侧资产"（地图/规则/hooks）的工厂；生成物 = host 侧上下文与边界；宿主 CLI（Codex/Claude Code）= harness 提供 agent loop。**生成物不该再造 harness 已有的东西**（会话管理/审批通道/沙箱）——这从平台视角再次确认"薄"的正确性。
2. **harness 设计对结果有物质影响**：官方实测 ARC-AGI-3 上"保留推理 + 上下文压缩"把 GPT-5.6 Sol 从 13.3% 提到 38.3% 且输出 token 减 6 倍——**token 纪律不是成本优化，是能力本身**。生成物的每字节税不仅费 token，还降能力（稀释有效上下文占比）。§4 的全部规格由此获得第二重理由。
3. **集成层级**：codex exec（非交互任务）/ SDK（程序化）/ app-server（持久会话+事件流+审批处理）三层。swarm-yuan 的宿主下沉（§4.3.6）属于"host 决定操作边界"层——hooks 是应用侧资产，与平台分工一致；不需要也不应该碰 harness 内部。

### 2.4 四个次生形态（根因展开）

① 防糊弄被表达为"要求自证"（填表冒充理解）→ 正解是让糊弄不可能（path-check）或无意义（只查行为后果）。② 吸收被翻译为文档而非改造为条件（dsh 配对审计/gstack guard 可证伪触发在外部全是机制，翻译成 markdown 即死）。③ 治理对象错位（防数字漂移替代防工程缺陷，且自身腐烂）。④ 未区分生成器复杂度（一次性消费，可厚）与生成物复杂度（每会话重复付税，必须薄）——膨胀经 UNIVERSAL_FILES 拷贝链传染。

## 3. 设计原则

**稳定内核（8 条，五轮从未动摇，全部保留）**：①元技能生成器定位 + 六段式产物结构；②"AI 短板在项目认知不在代码生成"；③零占位符铁律 + draft/active 状态门；④单文件 precheck 可移植；⑤三层接线 + 降级链 + 调用不重实现；⑥自适应轻重（质量优先于效率）；⑦facts.conf 单一事实源（瘦身保留）；⑧"账面与实质一致"三层诚实化（数字/修辞/证据）。

**新总纲（唯一新增原则）**：**证据优先于形式（条件优先于内容）**。机器执法只保留"防 AI 说谎"的；"给理解打分"与"防文档数字漂移"的退役。AI 的理解深度由行为证据兜底（测试过没过/门禁红不红/决策留没留痕），不由表格验证。

**吸收边界（明确不做）**：OS 沙箱（宿主职责，吸收决策架构不复制实现）；Guardian LLM 分类器（bash 层不建，只留形态约定）；Starlark 解释器（行格式规则即可）；会话 SQLite 投影（trace.jsonl 够用）；迁移工具（手工升级一次）；**harness 内部**（codex exec/SDK/app-server 是宿主集成层——生成物只做"应用侧资产"，不碰 agent loop/会话管理/审批通道的实现；平台博客确认的分工边界）。

## 4. 终态架构：厚生成器 + 薄生成物

### 4.1 生成物终态（文件级规格）

```
<skill-name>/
├── SKILL.md                  # ≤8KB（正文，选中时消费一次）。结构见 §4.1.1
├── references/               # 全部带"何时读我"路由头；生成器侧 40 份知识库全保留，生成物侧按需拷贝
│   ├── map.md                # 项目地图（原 reference-manual）：两列表 |路径|说明与约束|；32KiB 硬顶
│   ├── spec-template.md      # 9 节版（仪式节转 "--task-type full" 按需展开）
│   ├── workflow.md           # 八节点 × 4 要素（入口/参与方/门禁/产出物）
│   ├── security-spec.md      # 保留（真实 fail 门禁的规则依据）
│   └── （+ 激活框架的 frameworks/<fw>.md，按 detect-frameworks 结果拷贝）
├── scripts/
│   ├── precheck.sh           # 主入口 + 三档求值器（读 rules.d）
│   ├── gates-{strict,warn}.sh + rules.d/*.rules   # 规则即数据（§4.3）
│   ├── inventory-verify.sh / inventory-update.sh  # 保护清单机制
│   ├── project-fingerprint.sh / trace-log.sh / state-machine.sh
│   └── precheck.conf         # user 可配变量 ≤20 个（开关/位置/预算）
├── hooks/hooks.json          # fail-gate + integrity-guard（宿主双侧，§4.3.5）
└── settings.local.json       # 沙箱通配符 deny 模板（**/.env 等）
```

**关键变化**：~50 文件 → **~25 文件**；生成物侧 references 按需拷贝（detect-frameworks 命中的框架文档 + 带"何时读我"路由头的核心文档，生成器侧 40 份知识库全保留）；gates-advisory 全部接线（僵尸门禁转活，不下调）；地图从"11 节五维表"变"两列约束表"。

#### 4.1.1 生成物 SKILL.md 目标骨架（≤8KB）

```markdown
---
name: <skill>
description: "<做什么+何时用，≤1024 字符，任务触发式>"   # 唯一常驻字段
---
# <项目> 开发技能
## 何时用 / 何时不用（3-5 行）
## 项目约束摘要（地图 top-N 条可仲裁约束，5-10 行）
## 三个入口命令（precheck / inventory-update / fingerprint --diff 各一行）
## 按需读取路由表（任务类型 → 读哪个 reference，≤8 行）
## 上下文元规则（5 行：无界内容禁令 / 单条引用 >1k token 须显式说明 / 按需读取纪律）
## 自成长链（感知→判断→更新→落基线，4 行）
```

概念体系的组织原则：**探查 / 约束 / 演化 / 留痕 / 生成** 五个层次名词为主轴；认知框架类概念（六阶链/六维动力学等）**不删除、不堆砌**——以"工作时按此思考"的指引式表述融入对应层次（如"探查时按六阶链逐维自查"），从"要背的名词"变为"思考的检查单"（D1 落地化）。

### 4.2 生成器终态（瘦身指标）

| 指标 | 现值 | 终态 |
|------|------|------|
| 生成器 SKILL.md 概念体系 | 40+ | ≤12（决策号/WP 号/调研号全部退出正文） |
| 生成期必读三件套 | 157KB | <60KB（exploration-guide 1,054→~500 行） |
| 顶层 references | 40 | **全保留**（不删不合一）——全部补"何时读我"路由头；调研存档类诚实标注 |
| facts.conf FACT 键 | 71 | ~30（退役 catchphrase 记账键；新增 4 条预算断言） |
| check_doc_consistency | 434 行 | <100 行（文档数字手抄退役→发布时渲染，无手抄即无漂移） |
| user 可配 conf 变量 | 176 | ~20（行为参数留在模板/脚本内——Codex skills 全局配置仅 4 键） |

### 4.3 门禁条件化规格（Codex 决策架构的 bash 落地）

**作用域澄清（v4 修订）**：三值化作用于 **rules.d 规则求值层**（Bash 命令放行判定，即 fail-gate-hook 的白名单求值），**不是给 47 门禁家族重新分类**——门禁家族本身保持 strict/warn 两档（advisory 处置完后），`--list-gates` 对外单轴。无人值守的 AI 开发流程里，warn 档就是"打印警告由 AI 自决"，与 Codex 的 prompt（要人批）语义不同，不强行映射；三值 `allow/prompt/forbid` 只在"命令该不该跑"的判定里使用，那里 prompt 有真实的宿主审批通道（Codex/Claude Code 权限弹窗）。

1. **三值输出**：`allow / prompt / forbid`，多规则取最严（Codex `Decision` + `.max()`）。
2. **规则即数据**：命令放行/禁止从脚本硬编码抽到 `rules.d/<domain>.rules` 行格式：
   ```
   # pattern → decision # justification（拒绝时须含替代方案）
   git push *        → prompt  # 推进态命令；先跑 bash scripts/precheck.sh --all
   rm -rf *          → forbid  # 不可逆；替代：git clean -n 预览后逐项删
   ```
   生成器产出规则文件而非文档；脚本只是求值器；仓库零内置规则（项目规则由探查期生成）。**conf 收缩的关键载体**：原 conf 中的门禁阈值/白名单类参数（占 176 的大头）应迁入 rules.d（规则数据），user 配置面只留"跑哪些门禁族/项目路径/预算"——176→~20 的映射由此成立（详见 §5.2）。
3. **拒绝消息 = 给模型的 API**：`FORBID <门禁id>: <原因>；替代：<命令/路径>`——拒绝携带替代方案，AI 能自动改道（Codex hook deny 的 stderr 透传语义）。
4. **自指防护**：integrity-guard deny 清单扩为"执行前校验自身与 rules.d 哈希"（Codex `.git/.codex` 强制只读 + 规则文件置于 agent 不可写路径的对应物；bash 层用哈希自校验实现）。
5. **审批沉淀**：GATE_ENFORCE_DENY 的临时放行可持久化为规则（写回 rules.d + justification + 日期 + decisions.jsonl 落痕），对应 Codex 审批沉淀闭环。
6. **宿主下沉**：Codex 目标生成 hooks 注册（PreToolUse：exit 2=deny + stderr 原因 / JSON updatedInput=改写 / additionalContext=观察——v0.148 已支持）；Claude Code 目标用沙箱通配符 read-deny（v2.1.236 防重命名绕过）。**终态目录树中的 hooks/hooks.json 为双宿主各自渲染产物**（render-tools 按目标派生，非单一文件）。hooks fail-open 的合法性按 §2.2 教义复核（须有下层门禁兜底）。
7. **失败方向复核**：全部 SKIP/降级路径按教义重标：权限与安全边界 fail-closed；仅"有下层兜底"处允许 fail-open。

### 4.4 演化层与留痕层（已有，原样保留）

fingerprint + scope 局部重探查 + last-good 红线 + decisions.jsonl + trace.jsonl——全仓最健康器官，一个不动。Codex 佐证：append-only JSONL 即其会话真相模型。

### 4.5 五维保障体系（结构性·连接性·有效性·适配性·成长性）

> 终态架构的五维验收面：每一维回答一个独立问题，且都给出**机器可查的保障载体**——防止"架构图好看、落实无据"（本仓五轮的历史病）。

#### 4.5.1 结构性——层与层之间的依赖是否显式、单向、可追溯

**问题**：当前 40+ 概念互相嵌套引用（三导向=四导向子集、enforce 三档×序列三档正交），层间依赖靠散文描述，无显式拓扑。

**终态结构（一棵树 + 单向边）**：

```
生成（generator）
 ├── 探查（exploration）──产出──▶ 地图（map.md，32KiB 硬顶）
 ├── 约束（gates）─────────────▶ rules.d/*.rules + precheck + hooks（宿主双侧）
 ├── 演化（growth）────────────▶ fingerprint + last-good + inventory-update
 └── 留痕（trace）─────────────▶ trace.jsonl + decisions.jsonl + key-nodes.jsonl
消费方向：AI（会话）──读──▶ 地图 ──被拦于──▶ 约束 ──回馈──▶ 演化/留痕
```

**保障载体**：
- 依赖单向性由目录物理隔离承载：地图（references/）不 import 约束（scripts/），约束不写死地图内容（运行时读 rules.d）——生成器 self-check 加"无反向引用"断言（grep references/ 中对 scripts/ 路径的硬编码引用数 = 0，路由头除外）。
- 每层有唯一入口命令（探查=inventory-verify/约束=precheck/演化=fingerprint/留痕=trace-log）——AI 与人都不需要"懂全部结构"才能用其中一层。
- 分层失败隔离：地图损坏不影响约束执行；rules.d 缺失时 precheck 降级到内置最小规则集（fail 方向按 §2.2：约束边界 fail-closed，其余 fail-open 有兜底）。

#### 4.5.2 连接性——产物之间是否被真实消费链串起（消灭"存在但无消费者"）

**问题**：五轮病理的共同形态——资产存在但无人加载（7 份 industry-profile、10 个 advisory-only 门禁、5 份装饰文档、R4 吸收段）。

**终态连接清单（每类资产必须有"生产者→消费者"闭环）**：

| 资产 | 生产者 | 消费者（触发点） | 机器验证 |
|------|--------|------------------|----------|
| 地图条目 | 探查期 AI + inventory-update | path-check（mark-active/每次 refresh 核验） | inventory-verify 退出码 |
| rules.d 规则 | 生成器 + 审批沉淀 | precheck 求值 + 宿主 hooks deny | fail-gate 触发审计行 |
| 认知框架概念 | SKILL.md 指引式表述 | AI 判断引导 → notes/ 留痕 | notes/ 文件存在性（Stop hook 检查） |
| industry-profile | conf-render --industry | precheck.conf 注入 → 合规门禁参数 | conf 渲染后变量计数 |
| 40 references | 生成器侧知识库 | 任务路由表命中才拷贝/读取 | 路由表行 → 文件存在 |
| decisions.jsonl | trace-log --decision | decision-audit 门禁（Stop hook） | 审计退出码 |
| trace.jsonl | trace-log | cost-report + failure-detector | 文件非空 |

**保障载体**：self-check 新增"**孤儿资产扫描**"——扫描 rules.d/references/profile/notes 各目录，任何文件若在生产者清单与路由表中都不可达，报 warn（advisory，与"概念落地问责"同构：不接受"存在但无消费者"）。

#### 4.5.3 有效性——每个机制是否有可观测的效果证据（不是"跑过"而是"拦过/帮过"）

**问题**：账面与运行时落差是五轮诊断的共同靶心（fail()=2、trace 空文件、勾选演戏）。

**终态有效性度量（三个观测位）**：

1. **拦截有效性**：gate-audit.jsonl 已有全量决策审计（R12-A）——新增季度消费：`--report` 的拦截率按门禁聚合，**拦截率恒为 0 的门禁**（从未 deny 过任何决策点）在季度复盘时质疑其存在（与 D2 全接线呼应：接线后仍无触发的才考虑退役，证据驱动而非预设删除）。
2. **引导有效性**：AI 判断引导（认知自查/notes 留痕）的效果 = decision-audit 抽样 notes 与 decisions.jsonl 的一致性（advisory 报告，不执法）。
3. **税制有效性**：§6 指标 1/6/7 的三个 self-check 断言（固定税 ≤8KB / 正文 ≤8KB / 拷贝体积 ≤256KB）——超标即 fail（这是约束边界，fail-closed）。

**保障载体**：`gate-trends.sh`（已有）扩展为季度有效性报告入口；不新增门禁（守预算 54）。

#### 4.5.4 适配性——一个形态适应不了所有项目，适配必须显式且双向

**问题**：lite 档曾"砍文件不砍模板节"；三档 profile 偏置摇摆过三次；任务级自适应曾零执法。

**终态适配矩阵（两个显式维度）**：

| 维度 | 取值 | 载体 | 变更时机 |
|------|------|------|----------|
| 项目档 | lite / standard / compliance | 生成时 `--profile auto` 判定（阈值 conf-render 落盘，可 `--industry` 提升） | detect-profile-drift：项目演进升档（只升不降，质量优先） |
| 任务档 | simple / standard / full | `--task-type`（7 类任务映射，已有 task-type-gates.conf） | 每次任务启动时判定，映射到 spec 必填节与门禁子集 |

- **档位效果显式化**：lite = 地图 + 约束 + 演化（无 hooks 生命周期，§5 R3-1 已修文案）；standard = +宿主 hooks + 留痕全开；compliance = +行业 profile 注入 + 合规门禁族。任务档只影响 spec 展开与门禁子集，不影响文件集（砍文件不再发生）。
- **形态判定**（§C+.0）保留为探查第一步——backend/frontend/async/lib 的维度适配由 inventory-dimensions.conf 承载（已有），不新增维度。
- **宿主适配**：render-tools 按 7 安装目标派生原生规则（已有），hooks 双宿主渲染（§4.3.6）。
- **保障载体**：gen-e2e 断言三档各生成一次，检查档位差异化输出（lite 无 hooks.json、compliance 含 profile 注入）。

#### 4.5.5 成长性——生成器自身与生成物都要有演进通道（且演进被预算约束）

**问题**：自成长链只覆盖"项目变了→生成物更新"；生成器自身的知识（框架规则 74 份/上游调研）没有入账通道；R4 起上游重核是手工全量。

**终态双通道**：

1. **生成物演化**（已有，强化）：fingerprint 感知 → scope 局部重探查 → inventory-update 单条更新 → last-good 保护 → `--commit-fp` 落基线。新增闭环：局部重探查产出的**新组件条目自动进地图**（探查即入账，不再依赖人工搬运）。
2. **生成器演化**（新增定义）：吸收一律走"**调研报告（docs/research/）→ 三问评审 → 落地为条件/路由/引导之一**"通道（§7 制度 2 的执行形态）；上游版本重核从"每轮全量 16 个"改为"**破坏性变更驱动**（GitHub release 标 breaking/major 触发 + 季度例行一次）"——重核是维护不是成长，砍掉它的全量形态就是给成长腾带宽。
3. **成长的预算约束**（防成长变膨胀）：§7 三制度不变——概念落地问责/吸收三问/生成物税制（含 §6#7 体积断言）。成长的定义收窄为：**在预算内替换**（新知识进来必须有旧知识出去或税不增），否则只是膨胀。

**保障载体**：upstream-baseline 的 baseline_status 标记（已有 WP-Y 门禁消费）；吸收落地记录进 decisions.jsonl（phase=absorption，已有先例）。

## 5. 迁移方案

### 5.1 组 A——落地化与接线（原"删除"组，v5 改为落地优先）

| 动作 | 对象 | 说明 |
|------|------|------|
| spec 仪式段转按需 | spec-template §14 交付衰减/§15 蓝图/§16 偏差扫描/§17 辩证映射 + §5 认知映射表 + 谬误图谱 | 23 节→9 节（保留：需求/方案/测试设计/变更影响/可观测性/回滚/合规/决策记录/AI 生成声明）；`--task-type full` 才展开仪式节 |
| workflow 减槽 | 八节点 × 10 要素 → × 4 要素 | 80 槽→32 槽；砍掉的 6 要素并入产出物说明 |
| 核对清单砍 | template-spec 96 项 → 12 项 | 只留可机器验证项入口（跑 path-check/计数/mark-active） |
| 认知框架落地化（D1） | check_cognition 的 awk 计分 | **机械计分退役，概念落地为 AI 判断引导**：AI 按认知六阶链/五层框架/六维动力学逐维对 reference-manual 做语义自查，输出判断到 `.swarm-yuan/notes/cognition.md`（留痕，GATE_AI_JUDGMENT 成为唯一模式）——概念从"要背的名词"变为"AI 判断的检查单"，被真实消费而非归档 |
| 僵尸门禁全接线（D2，不下调） | advisory-only 10 门禁 | **全部接入真实触发路径，FACT_GATES_TOTAL 保持 54**：
  - upstream-baseline → precheck 启动时（advisory warn）
  - decision-audit → Stop hook（审计 decisions.jsonl 完整性）
  - state-phase → SessionStart hook（报告当前阶段）
  - operate → release/deploy 后 PostToolUse（灰度观察提示）
  - learnings → Stop hook（经验回写提示，与 memory-writeback 串）
  - pr-quality → PreToolUse git push/PR 命令时（规模/重复模式提示）
  - cert-audit → compliance 档 `--compliance-suite` 序列
  - cwe-audit → compliance 档 `--compliance-suite` 序列
  - skill-supply-chain → `--deps` 扩展 + 依赖变更 PostToolUse
  - loop-oracle → loop-hook 检查链接入 |
| 装饰文档路由化（不删） | 5 份（agent-skills/ai-process-records/mcp-governance/quality-management-standards/generation-flow，508 行） | 每份补"何时读我"路由头 + 挂进按需读取路由表（任务类型→文档映射）；仅作调研存档的诚实标注。references 按需读取不计入固定税，无需删除——缺的是消费路径不是内容 |
| methodology 落地化（不合一） | 7 份 *-methodology.md（1,121 行） | 不合并不删除——每份补"何时读我"路由头；**带执法载体的条目提取为条件**（完成判据→plan-template 字段、错误信封分类→trace-log 纪律、guard 可观测→fail-gate 设计原则已在、幂等写入→fingerprint 已有），提取后文档作为该条件的依据存档保留 |
| R4 吸收段复核 | R4 六份 references 吸收段 | 按吸收三问：未过问的段落回退 |
| 五维表→两维表 | reference-manual `|维度|路径|稳定性|来源|接口|` → `|路径|说明与约束|` | path-check/计数核验不受影响（只用路径列与行数）；**stability-audit 兼容论证**：它 grep 的是行内"稳定/禁止改/不稳定"字面词（inventory-verify.sh:177-179 `index(line,...)`），与列位置无关——标注词移进"说明与约束"列自由文本（如"导出 add（禁止改）"）仍可被同一机制识别；R3-4 表头骨架同步简化 |

### 5.2 组 B——改造为条件

| 动作 | 现状 | 终态 |
|------|------|------|
| 特征卡 | 17 项 AI 填表自证 | 探查期生成器产出地图 + path-check/计数抽验（理解不自证，产物受检）。**诚实边界**：探查仍是 AI 做的（生成器引导），改造消除的是"使用期 AI 被要求填表"的税，不是生成期 AI 的探查工作量——特征卡不会"自动化"，只是从自证改为受检 |
| 左移三节 | spec 必填文档段 | `--shift-left` 产物存在性检查（测试设计文件/影响清单/可观测性配置存在且非空） |
| GATE_AI_JUDGMENT | 可选开关（默认 0） | 成为唯一模式，机械打分逻辑删除 |
| 门禁三值化 + rules.d + 拒绝消息格式 | 硬编码 + echo 红字 | §4.3.1-4.3.4 全套（作用域见 §4.3 头部澄清） |
| conf 面收缩 | 176 变量 user 可配 | **~20 个（开关/位置/预算）**。映射论证：阈值/白名单类参数（占大头）迁入 rules.d 规则数据（§4.3.2）；门禁族开关（core/arch/compliance 三族）+ 项目路径（PROJECT_DIR/WRITABLE/READONLY/SCAN/CONSISTENCY）+ 预算（MAX_LINK_DEPTH 等少量真阈值）+ 执法开关（GATE_ENFORCE_DENY*）保留为 conf；模板/脚本内部参数不再以 conf 形式暴露 |

### 5.3 组 C——下沉宿主（唯一允许的加法，严格等量替换文档层）

| 动作 | 替代的文档层 |
|------|--------------|
| Codex hooks 注册（PreToolUse deny/改写/观察） | prompt 约定段落 + 文档告诫 |
| Claude Code 沙箱通配符 deny 模板进 settings.local.json | 敏感信息文档告诫段 |
| failure-detector 行为剧场退役（保留 SPINNING fail 提示） | 与新增 Codex hooks 等量替换 |

### 5.4 批次路线图（每批独立 worktree 收口）

| 批次 | 内容 | 风险 | 完成判据 |
|------|------|------|----------|
| **0（前置）** | 收口 R4-3：**upstream-baseline 16 运行时表 + CLI 两行正常合入**（R4 收尾，属好内容）；**仅六份 references 的 R4 吸收段按三问复核，未过问的段落回退** | 低 | main 干净 |
| **1a（落地化接线，零断言风险）** | 认知框架落地化（机械计分退役→AI 判断引导+notes 留痕）/装饰文档 5 份路由化/methodology 7 份落地化（执法载体提取+依据存档）/R4 吸收段回退收尾/僵尸门禁 10 个全接线（D2）/industry-profile conf-render 加载（D3） | 低（不动模板/断言结构） | 16 测试全绿 + gen-e2e + diff ≤0 |
| **1b（模板改造）** | spec 仪式段转按需（23→9 节）/workflow 减槽（80→32）/核对清单砍（96→12）/两维表 + stability 标注兼容 | 低-中（动模板，需同步 gen-e2e 断言与 inventory-verify 表解析） | 同上 + 生成目检 |
| **2（组 B 条件化）** | 三值输出（rules.d 层）/拒绝消息/特征卡改造/左移条件化/GATE_AI_JUDGMENT 唯一化/**§4.5.2 连接清单落地**（孤儿资产扫描 + 各资产消费链）/ **§4.5.1 层间反向引用断言** | 中（动 precheck 主链路） | 同上 + 真实项目生成目检 |
| **3（生成器侧）** | SKILL.md 重写（概念从名词堆砌改为工作指引式表述）/references 全保留+路由化/facts 减半/check_doc_consistency 切除/数字渲染/conf 面收缩/税制断言（§6#7）/**三档 gen-e2e 差异化断言（§4.5.4）**/**上游重核改破坏性变更驱动（§4.5.5）** | 中高（影响面最大，放最后且前置全绿） | 同上 + §6 全部 12 项断言过 |
| **4（组 C 宿主）** | Codex hooks/沙箱 deny/hooks 剧场退役 | 中（跨宿主测试） | 同上 + 双宿主生成验证 |

每批收口四件套：16 测试脚本 + gen-e2e + self-check `--check-only` + 真实项目生成目检；diff 铁律由 `git diff --stat` 机器验证（批次 2/4 允许"新增 ≤ 删除"的等量替换）。

## 6. 验收标准（六个月复审）

**只看目标技能的 AI 侧 + 两条规格断言**（生成器侧内部指标不作验收口径）：

| # | 指标 | 现值 | 终态 | 度量方式（精确定义） |
|---|------|------|------|---------------------|
| 1 | 每会话固定税（SKILL.md+hooks+settings+conf） | 15KB | **≤8KB** | self-check 断言（新 FACT 键） |
| 2 | 生成物概念体系 | 40+ | **≤5** | 人工评审生成物 SKILL.md |
| 3 | 冷启动到读项目代码的前置动作数 | ~8 步/5 万 token | **≤3 步** | **定义**：目标 skill 已生成并 mark-active 后，AI 新会话从读 SKILL.md 到第一个 Read/Grep **项目源码**文件之间的动作数。生成器已完成的探查/填充不计入（那是生成期，非冷启动）；跑 fingerprint --diff 感知算 1 步、读地图按需段算 1 步 |
| 4 | 门禁可达率 | 44/54（81%） | **100%（54/54 全接线）** | **定义**：默认执行序列（`--all` / 宿主 hooks 触发路径）可触达的门禁数 / FACT_GATES_TOTAL。10 个 advisory-only 逐个接入真实触发路径（逐门禁接线表见 §5 组 A） |
| 5 | 地图预算 | 无预算 | **32KiB 硬顶**（生成器截断+告警） | self-check 断言 |
| 6 | description ≤1024 字符 / SKILL.md 正文 ≤8KB | 无约束 | 达标 | self-check 断言 |
| 7 | 生成物拷贝体积（UNIVERSAL_FILES 渲染后总字节） | ~1MB（50 文件） | **≤256KB** | self-check 断言——**生成物税制的机器载体**：没有它，"税制"只是口号（Codex catalog 2%/10k-token 预算的对应物） |
| 8 | 结构性：层间反向引用数 | 未度量 | **0** | self-check 断言（§4.5.1：references/ 不硬编码 scripts/ 路径，路由头除外） |
| 9 | 连接性：孤儿资产数 | 未度量（现存 ≥22：10 门禁+7 profile+5 文档） | **0** | self-check"孤儿资产扫描"（§4.5.2：任何文件在生产者清单与路由表中不可达即 warn） |
| 10 | 有效性：恒零拦截门禁 | 未度量 | 季度复盘质疑清单（不预设删除，证据驱动） | gate-trends 季度报告（§4.5.3） |
| 11 | 适配性：三档差异化 | lite 曾"砍文件不砍节" | 三档 gen-e2e 断言（lite 无 hooks.json/compliance 含 profile 注入） | gen-e2e（§4.5.4） |
| 12 | 成长性：吸收落地率 | 未度量（R4 六段 0 过三问） | **100%**（每次吸收落地为条件/路由/引导之一，decisions.jsonl phase=absorption 可查） | decision-audit 抽样（§4.5.5） |

## 7. 防复胖（三制度，全部是生成器侧条件）

1. **概念落地问责**：新概念体系进 SKILL.md 或生成物，必须同时给出**落地路径**（接线/AI 判断引导/路由——三选一，不接受"先放着"）；self-check 加"概念有消费路径"断言（决策 26 只防门禁新增不防概念闲置——闲置才是棘轮失效的根因，不是存量）。
2. **吸收三问**：①能否落到运行时条件（门禁/hook/脚本）？②替换既有机制还是叠加？③六个月后谁会引用？——三问不过只留调研报告，不进 references。
3. **生成物税制**：进 UNIVERSAL_FILES 的审核问题 = "目标 AI 每会话为它付多少税"；行为参数留在包内不进全局配置。**机器载体 = §6#7 体积断言**（≤256KB），无载体的税制只是口号。
4. **五维复审**：季度复审跑 §6 指标 8-12（结构/连接/有效/适配/成长五维度量）——与 gate-trends 季度报告合并为一个动作，不新增例程。

**治理节奏注记（v4 增补）**：五轮诊断的元问题之一是节奏本身——每轮都是"全量复盘→全量实施→发版"的冲刺（07-21 一天 32 commit 曾被第二轮点名为"减重密度可疑"）。本方案的节奏约定：**批次之间至少间隔一个真实使用周期**（用当前形态生成一个真实项目技能并用过一次再进下一批），不复盘不连批——批次 1a/1b 可在同一周期内，批次 2 之后必须经真实使用验证再进 3/4。慢本身就是防复胖。

## 8. 风险与兼容

- **减法误伤**：保护清单（附录 B）逐项列为不可触碰；每批 gen-e2e + 真实生成目检兜底；path-check/计数/last-good/状态门四件套有独立测试守护。
- **既有生成物升级**：spec-template 是通用文件（--upgrade 覆盖安全）；已填 spec 实例在目标项目侧不受模板变化影响；reference-manual 是项目特定文件（--upgrade 保留），五维表旧数据**无需迁移**——path-check 读反引号路径与列数无关，新骨架只影响新生成。不做迁移工具。
- **第六次循环**：§7 三制度 + diff 铁律机器验证。方案自身受其约束：五方向中组 C 的加法严格等量替换，全案零新概念。
- **Windows/bash 3.2**：全部改动维持 bash 3.2 兼容（无 declare -A / sed -i.bak / ${var} 防多字节粘连——本 session 已三次踩坑的教训）。

## 9. 附录

### 附录 A：Codex 证据速查（file:line 见 R13-codex-deep-dive.md）

| 机制 | 数值/事实 | 采信为 |
|------|-----------|--------|
| 主指令模板 | 80 行 / 7.3KB | 生成物 SKILL.md ≤8KB 的锚 |
| 安全内容 | 4-5KB（一半为运行时清单） | "条件投影"形态 |
| 三值决策 | allow/prompt/forbidden 取最严 | 门禁输出三值化 |
| 规则 | rules/*.rules 数据文件，仓库零内置 | rules.d 行格式 |
| 拒绝消息 | justification 带替代方案，stderr 透传给模型 | FORBID 格式 |
| 失败方向 | 权限边界 fail-closed；fail-open 须有下层兜底 | §2.2 教义 |
| 自指防护 | .git/.codex 强制只读 | integrity-guard 哈希自校验 |
| skill 形态 | 最少 1 文件；唯一必填 description ≤1024；正文选中注入 ≤8KB；catalog 预算 2%/硬顶 10k token | §4.1 常驻面规格 |
| AGENTS.md | 32KiB 硬顶；dogfood 322 行 0% 架构综述、100% 可仲裁约束+委托指针；:91-100 token 元规则 | §4.1.1 骨架 |
| 配置纪律 | skills 全局配置仅 4 键 | conf 收缩 |
| 审批沉淀 | 批准持久化写回 rules 热生效 | §4.3.5 |
| 验证分层 | 加载宽容 fail-soft / 创作严格 fail-fast（TODO 拒绝） | 状态门 + mark-active 现状印证 |
| 平台分工 | harness 管 agent loop/沙箱/审批；应用管上下文/业务规则/操作边界（Codex as a Platform 官方定位） | §2.3 教义——生成物 = 应用侧资产 |
| 上下文纪律实效 | ARC-AGI-3：保留推理+压缩 13.3%→38.3%，输出 token 减 6 倍 | token 纪律即能力（§4 全部规格的第二重理由） |
| 集成层级 | codex exec / SDK / app-server 三层 | 吸收边界——生成物不碰 harness 内部 |

### 附录 B：保护清单（不可动）

path-check / 计数核验 ≥0.95 / last-good 红线 / scope 局部重探查 / draft→active 状态门 + 断点续传 / 版本锁定 / security/sensitive/stable-diff/test/build/branch 真实 fail 族 / 合规 fail-closed 族 / fail-gate-hook / integrity-guard deny / trace-log / decisions.jsonl / 六段式产物结构 / 三层接线降级链 / facts.conf 单源原则（瘦身保留）/ 三层诚实化主线。

### 附录 C：吸收三问（历史规律成文）

R11"语义/动能二分"（纯命名叠加）被标记为教训；R4 六份吸收段中"纪律描述"类未过问。三问制度化后，调研报告（如 R13-codex-deep-dive.md）是证据的合法归宿，references 只接收过三问的改造。

---

**审核通过后**：按 §5.4 批次 0 启动。本文档与两份 R13 草稿/伴生证据一并随批次 1 进入 git（docs/research/）。
