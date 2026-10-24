# R13 根本性复盘：范式作为条件，而非内容——去抽象化改进方案（v3，Codex 消化融合版）

> 调研日期：2026-08-21（档案日期，自 git 首次提交补录）

> 触发：2026-08-21 用户三轮指令——①"已趋于抽象化和形式机械化，必须深刻反省"；②"不够深入彻底，不成体系，都是零散的堆砌"；③"深入调研 openai/codex 的理念、设计、功能、实现，消化吸收融合后完善方案"。
> 版本：v3。v2 建立了推导式骨架（条件 vs 内容判别式 + 厚生成器/薄生成物架构）；v3 用 openai/codex 源码级证据（见伴生文档 `R13-codex-deep-dive.md`，全部锚定 file:line）把架构从方向变成**规格**——每个目标都有数字、格式、失败方向。
> 证据基础：zcode 会话库 32 主会话全量提取（五轮过重诊断史）+ 仓库病理量化 + codex 三路源码深挖 + 本 session 十轮迭代自省。

---

## §0 一句话病理与一句话解法

**病理**：这个系统把"研发范式"编码成了要 AI 阅读、记忆、自觉执行的**内容**，而不是约束 AI 行为的**条件**——范式越完备，留给项目认知的空间越小。

**解法（Codex 是存在证明）**：同一个问题（怎么让 AI 不胡来又高效），Codex 的编码方向完全相反——把规范压缩成**三类可机器求值的事实**（当前沙箱形状、当前审批策略、已放行规则表），模型看到的安全内容只有 4-5KB 且一半是运行时生成的清单；全部强制逻辑在机器里，全部可变内容在数据文件里。**强不来自更多规则；少不来自删知识。**

## §1 第一性原理：系统本质与三层需求

本质是一个映射：任意代码仓库 → 项目专属开发技能。AI 开发时真正需要的只有三样（其余一切——54 门禁分类学、176 conf、17 特征卡、spec 23 节、40+ 概念——都是这三层的实现方式，病理 = 实现方式膨胀为目的）：

1. **认知**：项目真实结构。Codex 对应物：AGENTS.md——32KiB 硬顶，dogfood 样本 322 行里 **0% 架构综述、≈100% 可仲裁约束 + 按需委托指针**。
2. **约束**：被强制执行的底线。Codex 对应物：审批×沙箱二维矩阵 + 三值规则引擎 + hooks——**零认知占用，做错即被拦**。
3. **演化**：项目变了技能跟着变。Codex 对应物：审批沉淀（批准写回 rules 文件热生效）。swarm-yuan 对应物（fingerprint/局部重探查/last-good）**已是全仓最健康的器官，保留**。

## §2 统一判别式：条件 vs 内容

| | 条件（condition） | 内容（content） |
|---|---|---|
| 作用 | 运行时约束：做错被拦 | 认知期待：先读先记再自觉 |
| 认知占用 | 零 | 每会话重复支付 |
| 糊弄 | 结构上不可能 | 结构上必然（散文过检） |
| 本仓健康实例 | path-check / 计数核验 / last-good / 状态门 / fail-gate / integrity-guard | spec 仪式段 / 认知打分 / 方法论文档 / 概念体系群 |
| Codex 佐证 | 三值决策引擎、规则数据文件、hooks、沙箱 | 安全内容仅 4-5KB 机器状态投影；主指令模板 80 行 |

五轮过重诊断撞到的所有现象（fail()=2、70/70 勾选演戏、check_cognition 装饰性）都是把本该做成条件的东西做成了内容。**保护清单全部在条件侧，病灶清单全部在内容侧——无一例外。**

**判别式的第二半（失败方向教义，来自 Codex）**：条件还要问"失败时倒向哪边"。权限边界一律 fail-closed（默认全拒、白名单放行）；**fail-open 只允许发生在还有下层强制兜底的地方**（Codex 的 hooks 失败不阻断，因为命令还要过沙箱+规则；execpolicy 解析失败退空策略，因为还有兜底矩阵）。本仓散落的 fail-open/fail-closed 决策从此有统一仲裁标准。

## §3 根本错误的四个次生形态（Codex 证据加固）

1. **防糊弄被表达为"要求自证"**（填表冒充理解）。Codex 反例：skill-creator validator 只查"脚手架未完成"（TODO/命名/键白名单），明言 "does not prove that the skill makes good decisions"——创作期严格、运行期宽容，从不给"理解"打分。
2. **吸收被翻译为文档而非改造为条件**。Codex 的同类机制（审批沉淀/失败方向/自指防护）没有一个是靠文档内化给模型的。历史上活下来的吸收（谱系传播/上下文预算）全带机器载体；死掉的全是纯文档。
3. **治理对象错位**：防"数字漂移"替代防"工程缺陷"（防漂移账本自身漂移 38 行）。Codex 反例：它的元治理（dogfood AGENTS.md:91-100）管的是**模型可见上下文的预算**（无界禁令/10k 上限/1k 预警）——治理的是税，不是叙事。
4. **未区分生成器复杂度（一次性消费，可厚）与生成物复杂度（每会话重复付税，必须薄）**。Codex 的税制：常驻 = catalog 一行（2% 上下文预算，硬顶 10k token）；正文选中才注入（≤8KB）；引用完全按需。膨胀经 UNIVERSAL_FILES 拷贝链传染，是因为生成物没有纳税人代表。

## §4 目标架构：厚生成器 + 薄生成物（v3 规格化）

生成物 = **一行目录 + 一张约束地图 + 一组条件 + 一条演化链**。四层的精确规格（数字全部锚定 Codex 实现，见伴生文档）：

### 4.1 常驻面（每会话固定税）

- 常驻内容 = frontmatter 的 name + description 一行（**description ≤1024 字符**，写"做什么+何时用"）——对齐 Codex catalog 纪律（`render.rs:127-153`）。
- 生成物 SKILL.md 正文 **≤ 8KB**（Codex `MAX_SKILL_PROMPT_BYTES=8000`），仅在技能被触发时消费一次；当前生成物 SKILL.md 5.3KB 已达标，**问题在 40 references 无路由与仪式模板，不在 SKILL.md 本身**。
- 每会话固定税总额（SKILL.md + hooks.json + settings + precheck.conf）**≤ 8KB**（当前 15KB，主砍 precheck.conf 的 176 变量面与 hooks 剧场输出）。

### 4.2 项目地图（认知层）

- 形态 = AGENTS.md 式：**可仲裁约束 + 委托指针**，非架构叙事。reference-manual 表 `| 路径 | 说明与约束 |` 两列（路径供 path-check 执法）；每条约束应能直接仲裁一个 diff（如"模块 >N 行禁扩""该接口禁止改签名"），长知识用"See references/xxx.md"指针外链（Codex dogfood：0% 架构综述）。
- **地图总预算 32KiB 硬顶**（Codex `AGENTS_MD_MAX_BYTES`），超限由生成器截断+告警——预算是生成器侧条件，不指望 AI 自觉。
- 地图自带**上下文元规则段**（Codex AGENTS.md:91-100 同款）：无界内容禁令、单条引用 >1k token 须显式说明、按需读取纪律。

### 4.3 运行时条件（约束层）

- **门禁输出三值化**：`allow / prompt / forbid`，多规则取最严（Codex `Decision` 枚举 + `.max()`）。现有 strict/warn/advisory 三档映射到三值（strict=forbid、warn=prompt、advisory 归并），enforce 分层降为实现细节不再对外暴露。
- **规则即数据**：门禁的放行/禁止规则从脚本硬编码抽到 `rules.d/*.rules` 行格式（`pattern → allow|prompt|forbid # justification`），生成器产出规则文件而非文档；脚本只是求值器（Codex：仓库零内置规则，`execpolicy/README.md`）。
- **拒绝消息 = 给模型的 API**：每条 forbid 固定格式 `FORBID <门禁id>: <原因>；替代：<命令/路径>`——拒绝要携带替代方案让 AI 能自动改道（Codex justification 语义 + hook stderr 透传）。
- **自指防护**：规则文件、审批记录、hook 脚本不得位于 AI 会话可写路径而不设防——integrity-guard 的 deny 清单扩为"执行前校验自身与规则文件哈希"（Codex P8：`.git/.codex/.agents` 强制只读的对应物）。
- **审批沉淀**：GATE_ENFORCE_DENY 的临时放行升级为可持久化规则（写回 rules.d + justification + 日期），对应 Codex `append_amendment_and_update`。
- **宿主下沉**：Codex 目标生成 hooks 注册（PreToolUse deny/`updatedInput`/`additionalContext` 三能力，exit 2=deny）；Claude Code 目标用沙箱通配符 deny（v2.1.236 防重命名绕过）。hooks 失败 fail-open 的合法性依赖下层门禁兜底——按失败方向教义逐处复核。

### 4.4 演化层（已有，保留）

fingerprint + scope 局部重探查 + last-good 红线 + decisions.jsonl。Codex 佐证：append-only JSONL 即它的会话真相模型（rollout），方向一致。

### 4.5 配置纪律

- **行为参数留在包内**：Codex 的 skills 配置全局只有 4 键（位置/预算/开关），每个技能的参数内化在技能包里。本仓 176 conf 变量 → 大多数属于模板/脚本内部参数，user 可配面收缩到"开关+位置+预算"量级（≈20 个以内）；precheck.conf 随附体积随之塌缩。

## §5 迁移路径：三组动作（判别式直接分组，v3 附落地规格）

**组 A——删除**（内容类且无法条件化）：spec 仪式段 §14-17 转按需；workflow 80 槽→32；96 核对项→12（只留可机器验证项）；check_cognition 计分退役（保留一句 AI 自查提示——对齐 Codex "validator 不证明 skill 做出好决策"的边界自觉）；advisory-only 10 僵尸门禁接线或删；5 份装饰 references 退场；7 份 industry-profile 由 conf-render.sh 真实加载或删除（二选一）。

**组 B——改造为条件**：五维表→两维表（§4.2）；特征卡 17 项从"AI 填表"改为"探查期生成器产出 + path-check/计数抽验"；左移三节从必填文档段改为 `--shift-left` 产物存在性检查；GATE_AI_JUDGMENT 成为唯一模式；门禁输出三值化 + rules.d 抽取 + 拒绝消息带替代方案（§4.3 全套）。

**组 C——下沉宿主**：Codex hooks 注册（deny/改写/观察三能力，替代 prompt 约定）；Claude Code 沙箱通配符 deny 模板；failure-detector 行为剧场退役与新增 hooks 等量替换。

**每组 diff 铁律不变：新增行数 ≤ 删除行数**（收口时 `git diff --stat` 机器验证）。R4 本轮六份 references 吸收段按吸收三问复核，未过问的回退。

## §6 验收（六个月复审，只看 AI 侧三个数 + 两条规格）

1. 每会话固定税 **≤ 8KB**（当前 15KB）——机器执法（FACT 键瘦身后的预算断言）。
2. 生成物常驻概念体系 **≤ 5**（探查/约束/演化/留痕/生成）——人工评审生成物。
3. 冷启动到第一次读项目代码 **≤ 3 步**（当前约 8 步/5 万 token）。
4. 地图预算 32KiB、description ≤1024 字符、正文 ≤8KB——三条 Codex 锚定规格进 self-check 断言。

## §7 防复胖（三条制度化，全部是生成器侧条件）

1. **概念等额退役**：新概念进 SKILL.md/生成物须同时退役一个旧概念；self-check 加概念计数断言（Codex 佐证：它的概念面 30+ 年不变的是那三类机器事实）。
2. **吸收三问**：①能否落到运行时条件？②替换还是叠加？③六个月后谁引用？——三问不过只留调研报告（本伴生文档即此形态：R13-codex-deep-dive.md 是证据，不是新 references）。
3. **生成物税制**：进 UNIVERSAL_FILES 的审核问题 = "目标 AI 每会话为它付多少税"；行为参数留在包内不进全局配置。

## §8 吸收边界（诚实排除，防过度热情）

- **OS 沙箱**（Seatbelt/bwrap/seccomp）：宿主职责，不复制实现——吸收决策架构不吸收实现。
- **Guardian LLM 分类器**：需要模型调用基础设施，bash 层不建；只留形态约定（小枚举+fail-closed+反规避+熔断）给未来。
- **Starlark**：bash 用行格式规则即可，不嵌解释器。
- **会话 fork 边界寻址**：nice-to-have，trace.jsonl 已够用，不建 SQLite 投影。

## §9 自省声明

v1 是清单堆砌；v2 给了判别式但规格空缺；v3 的规格全部来自对一个真实存在系统的源码测量，而非演绎——**这是防止"用想象治想象"的唯一办法**。执行本方案的仍是我这类 AI（五轮膨胀的执行者），故 §5 的 diff 铁律与 §7 的三条制度化是方案成立的前提而非修辞。Codex 教的最后一课：它的 AGENTS.md 里写着约束 agent 自己的元规则——**任何想治理 AI 的系统，先把治理自身膨胀的规则写成机器可查的条件。**

---

## 附：保护清单（最终确认，一个不动）

path-check / 计数核验 ≥0.95 / last-good 红线 / scope 局部重探查 / draft→active 状态门 + 断点续传 / 版本锁定 / security/sensitive/stable-diff/test/build/branch 真实 fail 族 / 合规 fail-closed 族 / fail-gate-hook / integrity-guard deny / trace-log / decisions.jsonl / 六段式产物结构 / 三层接线降级链 / facts.conf 单源原则（瘦身保留）/ 三层诚实化主线。
