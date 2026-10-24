# R1：swarm-yuan 自身设计理念与生成器机制深度分析

> 角色：R1-自身设计理念分析员 ｜ 调研日期：2026-07-20 ｜ 范围：生成器自身的理念体系、生成机制、模板结构、多工具兼容层、理念-实现差距
> 证据基线：本仓库工作区（commit 工作树，2026-07-20），所有行号以当前文件为准。

---

## 一、设计理念体系：内涵、实现落点、相互关系

swarm-yuan 自我定位为"研发范式元技能生成器"（meta-skill generator），核心论断是"AI 的代码生成能力已经很强，但「项目认知」还停留在零"（swarm-yuan/README.md:23）。围绕此论断形成 7 个理念。

### 1. 先认识，再行动（认知递进）

- **内涵**：AI 写代码前必须先认识项目——"概念→结构→空间→映射→规律→处理"六阶认知链；"不认识就写 = 盲动"（swarm-yuan/docs/USAGE.md:11-13）。
- **实现落点**：16 项特征卡完成"认知"（swarm-yuan/README.md:38-59），27 个门禁守护"行动"（assets/precheck.sh 实际存在 27 个 `check_*()` 函数，assets/precheck.sh:290-2491）；探查方法论在 references/exploration-guide.md（三路并行子代理 + §C+ 全量穷举方法论）；认知链还物化为 `--cognition` 门禁（assets/precheck.sh:1862 `check_cognition`）。
- **生成流程中的位置**：SKILL.md 生成流程把探查放在骨架创建之前——"①探查仓库 → ②提取16项特征卡 → ③create骨架"（swarm-yuan/SKILL.md:66）。

### 2. 拼装式开发（复用优先）

- **内涵**："新功能 = 既有稳定单元拼装 + 最小新增胶水代码"，三禁：重复造轮子/侵入式重构/破坏性改造（swarm-yuan/README.md:32）。
- **实现落点**：特征卡第 11 项"可复用稳定单元"是"核心中的核心"（swarm-yuan/README.md:61），每个单元用五维字段描述（签名/路径/用途/复用方式/稳定性标注，swarm-yuan/docs/FIVE_DIMENSIONS.md:5-14）；spec 模板 §5.5 复用约束为所有级别必填（assets/spec-template.md:85；:12）；执法门禁为 `--reuse`（assets/precheck.sh:829 `check_reuse`）、`--stable-diff`（:672）、`--state`（:1691）、`--frontend`（:1740）。

### 3. 特征卡是立法，门禁是执法

- **内涵**：16 项特征卡定义"项目应该是什么样的"，27 个门禁验证"代码是否符合"（swarm-yuan/README.md:34,80）。
- **实现落点**：立法→执法映射表（swarm-yuan/README.md:82-90，如第 2 项→`--scope`、第 5 项→`--build`、第 11 项→`--reuse`）；precheck.conf 146 个变量"从特征卡推导"（实测 assets/precheck.conf 确为 146 个 `^[A-Z_]+=` 变量）；`--framework` 门禁对已激活但无实现的框架 fail-closed（assets/precheck.sh:2509 "已激活但无门禁实现……须运行 generate-skill.sh --inject-frameworks"）。
- **制度化的边界**：门禁注册表硬编码核心 10 + 架构 17（assets/precheck.sh:252-254），单门禁 flag 27 个（:257），与文档宣称 27 一致（docs/2026-07-20-audit-optimization-decisions.md:8 复核确认）。

### 4. 呈现递进的关系，而非仅关注计算

- **内涵**："门禁不是'数 import 数'——每个计数背后指向一条关系规律"（swarm-yuan/docs/USAGE.md:19-21）；这是五层认知基底的"核心理念"（swarm-yuan/SKILL.md:33）。
- **实现落点**：五层认知基底表（认知递进/思维语言/认知辩证/偏差防范/辩证认知，swarm-yuan/SKILL.md:35-42）分别落到 `--cognition`、spec §14/§15、4-Phase SOP、spec §16、spec §17；spec 模板确有 §14 交付衰减、§15 蓝图任务、§16 认知偏差自检、§17 辩证映射、§18 领域知识段（assets/spec-template.md:212-303）。
- **相互关系**：这是前三个理念的"哲学根基"层（swarm-yuan/docs/PROMO.md:162-172），理念 1-3 是工程机制，本理念为机制赋予"计数→规律"的解释框架。

### 5. 零占位符

- **内涵**："AI 必须执行完整流程（Step 0-10）后才算生成完成。不允许中途停止在骨架阶段"（swarm-yuan/SKILL.md:59）；完成标准是目标 skill 中"零'待填充'/零'填充指引'/零'<占位符>'残留"（SKILL.md:86）。
- **实现落点**：骨架本身刻意含占位符——create 模式写入 `（待填充）$f` + 填充指引（scripts/generate-skill.sh:471-476），SKILL.md 骨架含 6 个 checkbox 占位（:518-523）；零残留依赖 Step 8/12 的 grep 终检（SKILL.md:66,86），并有配套否决机制："断点续传违背零占位符铁律"而明确不做状态机断点续传（docs/paradigm-decisions.md:96）。

### 6. 自举（bootstrap）

- **内涵**："swarm-yuan 能用自身的门禁检查自身（CI `generator-self-gate` job 三档 RC=0）。自举只证明内部自洽，不证明外部有效。"（原修辞版"一个连自己都检查不了的工具，凭什么检查你的项目？"已于 WP-rhetoric-honesty 去修辞化，详见根 README.md 自举段边界声明）。
- **实现落点**：部分物化——`check_doc_consistency` 用代码真值反向校验散文文档数字（scripts/self-check.sh:471-554），verifier/v1 有 golden-vector 验收（verifier/v1/golden-vector.txt）；CI 4 个 Job（CLAUDE.md:93）。但"27 门禁检查自身"未完整落地（见第五节差距 G4）。

### 7. AI 主导 + 用户决策

- **内涵**：特征卡提取、门禁配置、spec 填充、编码、排障"均优先以 AI 为主导生成建议项"，用户角色是"评估决策或修订后批准执行"（swarm-yuan/SKILL.md:46-53）。
- **实现落点**：生成流程标注"AI 自动执行（零手动配置，不可中途停止）"（SKILL.md:65）；门禁误报由"AI 自动调 conf 后重跑"（SKILL.md:88）；hooks.json 骨架让 AI 在 SessionStart/PreToolUse 获得门禁上下文（scripts/generate-skill.sh:478-485）。
- **相互关系**：理念 7 是理念 1-6 的"动力源"——特征卡（立法）、填充（执法配置）、终检（零占位符）全部没有人工接口，靠 AI 自觉执行；这也是全部薄弱环节的共同根源（见第五节）。

### 理念间结构关系总结

```
理念4（呈现递进关系，哲学层）
   ↓ 赋予意义
理念1（先认识再行动）→ 理念3（特征卡立法/门禁执法）→ 理念2（拼装式开发，立法的核心内容）
   ↓ 质量闭环                     ↓ 制度闭环
理念5（零占位符，生成质量）← 理念6（自举，范式自信）← 理念7（AI主导，全程驱动力）
```

---

## 二、生成器 11 步流程与三种模式的机制实现

### 2.1 宣称的 11 步 vs 脚本的实际分工

SKILL.md 列出的流程为 ⓪自检→⓪.5读知识→①探查→①.5形态判定→②特征卡→③create骨架→④填充→④.5框架深化→⑤conf→⑤.5hooks→⑥门禁→⑦.5注入→⑦写回记忆→⑧终检（swarm-yuan/SKILL.md:66），README 归并为 11 步（swarm-yuan/README.md:162）。**关键事实：Step 0/0.5/1/1.5/2/4/4.5/5/5.5/7/8 全部是 AI 的 Prompt 层行为，无脚本强制**；脚本只物化了 Step 3（create 骨架）、Step 7.5（inject）与升级路径。

### 2.2 create 模式（scripts/generate-skill.sh:455-537）

实际行为链：
1. 拒绝已存在目录（:455）；
2. 检测运行环境确定目标目录：`detect_skill_dir` 按项目 `.claude/skills`→`~/.claude`→codex→cursor→windsurf→opencode→gemini→kimi 顺序首个命中（:304-315）；
3. 复制 22 项通用文件（`UNIVERSAL_FILES`，:40-64：11 项 assets + 11 项 references + self-check.sh；**注意 exploration-guide.md 与 template-spec.md 不复制**——它们是生成器侧指南，不进目标 skill）；
4. 可选 `SKILLS_PATH_REWRITE` sed 逐文件重写路径（:374-377）；
5. 复制 7 个 .bat 包装器（可用 `SKIP_BAT=1` 跳过，:382-394）；
6. 写 5 个"（待填充）"reference 骨架（:471-476）、hooks.json（SessionStart 状态机 + PreToolUse `--scope`，:478-485）、3 个 slash commands（spec/precheck/explore，:487-507）、SKILL.md 骨架（:509-524）、`.swarm-yuan-version` 版本戳（:526-530）。

### 2.3 upgrade 模式（scripts/generate-skill.sh:400-449）

实际行为链：备份通用文件到 `.upgrade-backup-<ts>`（:404-411）→ 覆盖通用模板但**跳过 precheck.conf**（:365）→ `merge_precheck_conf` 只对激活框架缺失的 requires_conf 变量补占位（:100-151）→ 保留 6 个项目特定文件（`PROJECT_SPECIFIC_FILES`，:67）→ 重写 `.swarm-yuan-version`（:421-425）→ 若 ACTIVE_FRAMEWORKS 非空则**自动重注入**门禁片段（:433-448）。设计取舍："覆盖通用模板 / 保留项目特定文件 / 自动备份"（swarm-yuan/README.md:185）。

### 2.4 --inject-frameworks 模式（scripts/generate-skill.sh:153-301）

独立的幂等注入器，实际行为：
1. **冲突裁决**：比对 `.swarm-yuan-version` 记录的 `framework_gates_sha` 与当前区块 cksum，不符即中止返回 2（:163-173）；
2. **迁移合并**：`MERGED_FRAMEWORK_MAP` 把 pinia→vue、socketio→koa、vitest→jest-vitest 旧 id 迁移并写回 conf（:28-96,188-207）；
3. **构建区块**：按 ACTIVE_FRAMEWORKS 顺序拼接 `assets/framework-gates/<fw>.sh`，解析片段头 `requires_conf` 核对 conf 变量（:209-227）；
4. **fail-closed 替换**：缺闭标记即中止不改动文件（:235-241，修复自审计发现的"静默删除区块后 150 行"事故，docs/2026-07-20-audit-optimization-decisions.md:20）；无标记区块时插入 main case 之前（:247-259）；
5. 缺变量补占位 + warn、未覆盖框架 warn 列出（:271-280）；
6. 记录新区块哈希（:283-294）。

运行时的动态分发：`check_framework` 遍历 ACTIVE_FRAMEWORKS，`tr '-' '_'` 后用 `declare -f` 探测 `_fw_<id>_check`，缺失即 fail（assets/precheck.sh:2500-2511）——"探查到但没实现 = 范式缺陷，必须暴露"（docs/2026-07-17-framework-rules-engine-design.md:143）。

---

## 三、六段式目标 skill 模板结构

SKILL.md 定义六段（swarm-yuan/SKILL.md:92-102），references/template-spec.md:1-3 规定"目标技能必须包含六段"：

| 段 | 文件 | 内容 | 生成机制 |
|----|------|------|---------|
| meta | `SKILL.md` | 元信息/铁律/流程总览/命令速查 | 骨架含填充指引 checkbox（generate-skill.sh:509-524），AI 全填 |
| workflow | `references/workflow.md` | 八节点、9 要素/节点、4-Phase SOP | 占位骨架（:463），AI 全填 |
| reference | `references/codebase/dev-guide/release/reference-manual.md` + `framework-knowledge.md` | 参考手册 + 框架规律 | 4 个占位骨架 + framework-knowledge 由 AI 在 Step 4.5 实例化（设计文档 §5.1） |
| assets | `assets/*` | spec/plan/分支/环境/库表/状态机模板 | 通用文件原样复制 |
| check | `scripts/precheck.sh` + `precheck.conf` | 27 门禁 + 146 变量 | precheck.sh 原样复制 + 标记区块注入框架片段；conf 模板复制后 AI 填值 |
| scripts | `scripts/*`（含 hooks/commands） | 门禁+状态机+snippets+MCP | self-check.sh 复制；hooks.json/commands 骨架生成 |

配套制度：填充规范与核对清单在 template-spec.md（"生成后用本文件逐项核对"）；spec 模板 21 个主段（§1-§21，含 §5.5 复用/§5.6 版本/§5.7 安全约束与 §14-§21 认知/左移段，assets/spec-template.md:17-355）；升级时 6 个项目特定文件受 `PROJECT_SPECIFIC_FILES` 保护（generate-skill.sh:67）。

---

## 四、7 个 AI 工具兼容层的实现方式

宣称"兼容 7 个 AI 工具"（swarm-yuan/README.md:151）。实现实际是**三层同心圆**：

1. **目录检测层（真正跨 7 工具）**：`install.sh` 的 `detect_runtimes()` 探测 7 个 home 目录（swarm-yuan/install.sh:31-46），`install_to()` 逐环境复制 skill 并备份旧版（:60-101）；`generate-skill.sh` 的 `detect_skill_dir` 同样按 7 目录首个命中（:304-315）。此为"兼容"的主体。
2. **Claude Code 专属层（深度集成仅 1 工具）**：slash command 只注册到 `~/.claude/commands`（install.sh:52-56,96-100）；生成的 hooks.json 使用 Claude 的 SessionStart/PreToolUse 与 `${CLAUDE_PLUGIN_ROOT}`（generate-skill.sh:478-485）；commands/*.md 是 Claude slash 格式；MCP/settings.local.json 指引在 references/claude-code-capabilities.md:173,382。`install_to` 对非 Claude 环境 `cmd_dir` 传空串，即不注册任何命令（install.sh:136-152）。
3. **三平台层（OS 兼容，非 AI 工具）**：bash 3.2 兼容语法约束（无 `declare -A`、`sed -i.bak+rm` 等，SKILL.md:29；CLAUDE.md:82）+ Windows `.bat` 包装器查找 Git Bash/WSL/MSYS2（generate-skill.sh:380-394）。

即：对 Codex/Cursor/Windsurf/OpenCode/Gemini/Kimi，"兼容"= 把同一套 markdown+bash 复制到对应目录，依赖各工具自身对 skills 目录的加载约定；hooks/commands/MCP 等深度能力不随skill迁移。

---

## 五、设计理念与实际实现的差距 / 矛盾 / 薄弱环节

### G1【理念 7 的内在矛盾】AI 主导 vs ECC Must-Never

template-spec.md §1.1 引用 ECC 的 Must-Never 铁律："绝不替用户做决定（须用户确认）"（references/template-spec.md:70），而 SKILL.md 要求"AI 主导 + 用户决策"且流程"不可中途停止"（SKILL.md:46,65）。两者在"多方案选择/依赖升级"等场景直接冲突——SKILL.md:44 的"疑虑必确认"是唯一的调和条款，但无机制保证 AI 在长跑流程中真的停下来。

### G2【理念 5/7 的机制缺口】零占位符无机器门禁

"零占位符"是铁律，但终检只是 SKILL.md:86 的散文指令（让 AI 自己 grep）；generate-skill.sh 不在 create 后做任何占位符扫描，verifier 也不校验生成物完整性。完成质量完全取决于执行 AI 的自觉性——与理念 3"立法-执法"的制度化程度形成鲜明反差：**范式对目标项目的执法是脚本化的，对自身生成质量的执法是口头化的**。

### G3【理念 4 的最薄弱落点】`--cognition` 是装饰性门禁

五层认知基底被宣称为门禁的"哲学根基"，但 `check_cognition`（274 行，precheck.sh:1862-2135）**含 0 个 `fail()` 调用**——永不 fail，仅对范式自带 spec-template 做关键词打分，且分数上限标注错配（/11 实为 14、/19 实为 22）（docs/2026-07-20-audit-optimization-decisions.md:33）。"呈现递进的关系"这条核心理念在最该落地的门禁上没有执法力。

### G4【理念 6 未完全兑现】自举是单向的

自举宣称"27 个门禁检查自身"，但审计确认"CI 从未对生成器仓库跑 27 门禁；26/27 非框架门禁无 fixture"（docs/2026-07-20-audit-optimization-decisions.md:47）。实际自举仅限：57 框架 fixture 双态（tests/run-framework-fixture.sh）、verifier 金向量（verifier/v1/）、文档数字一致性（self-check.sh:471-554）、shellcheck。**生成器自身不受 `--scope/--reuse/--shift-left` 等自家旗舰门禁约束**。

### G5【立法-执法链条的已知断点】

- **沉睡/静默**：`--all-full` 下约 15 个未配置门禁 SILENT 静默消失，汇总仍输出"✓ 门禁检查通过"（precheck.sh:237-248；审计档:36）；4 处 `\|` 字面 bug 刻意保留沉睡（docs/paradigm-decisions.md:31-36）；`check_link_depth` 兜底 GNU-only（审计档:37）。
- **fail-open 残留**：存在性门禁（`--shift-left/--domain/--cognition/--impact`）无项目 spec 时回退到范式自带模板自证 pass（审计档:35）。
- **绿≠合规**：修复策略明确"不贸然唤醒沉睡门禁"（审计档:29-31），短期稳定与长期可信之间存在结构性张力。

### G6【文档漂移仍在扫描盲区】

check_doc_consistency 只扫 README.md/USAGE.md/PROMO.md（self-check.sh:516），**不扫**：
- `.claude/commands/swarm-yuan.md`——仍写"14 项特征卡""45 个配置变量"（.claude/commands/swarm-yuan.md:45-46,65,81），与真值 16/146 漂移；
- 生成器骨架——create 模式写入目标 SKILL.md 的 checklist 仍写"precheck.sh 25 门禁"（generate-skill.sh:522），即**每个新生成的 skill 自带一条文档漂移**；
- 根 README.md、references/cognition-framework.md（"9 运行时"，审计档:39）。
spec 模板"22 段"宣称 vs 实际 21 主段（README.md:257 vs assets/spec-template.md:17-355）亦无校验。

### G7【兼容层宣称 vs 深度】

"7 个 AI 工具兼容"实为目录复制（第四节）；CLAUDE Code 以外 6 工具无 hooks/commands/MCP 适配，README 的"Claude Code 深度集成"表（README.md:211-218）不适用于其余 6 者。跨工具一致性与"AI 主导"理念的兑现度随平台递减。

### G8【设计与实现的算术一致性良好（正面证据）】

独立复核确认：27 flag ↔ 27 `check_*` 函数；核心 10+架构 17；conf 146 变量；57 框架三件套 1:1:1；57/57 fixture 双态绿（docs/2026-07-20-audit-optimization-decisions.md:8；本次实测：57 md/57 sh/57 fixtures、146 变量）。审计后已修复 CRITICAL/HIGH 问题 5 批（set -e 中断、空数组崩溃、注入 fail-open、ROLLBACK_KEYWORDS 误报等，审计档:14-25）。**骨架层算术真实，问题集中在因果链（配置→执法→汇总）与叙事层（文档/宣称）。**

---

## 六、对 swarm-yuan 升级的启示（面向行业/国家质量与安全标准）

1. **把"理念"改写成"可验证需求"**：借鉴 ISO/IEC 25010:2023 的质量模型思路与需求工程惯例（如 ISO/IEC/IEEE 29148:2018 对需求可验证性的要求），给 7 个理念各配机器可执行的验收条款——例如"零占位符"应成为 verifier 的一条断言（grep 生成物模板占位符计数=0），而非 Prompt 层嘱咐；消除 G2。
2. **理念-执法映射需要登记制**：G3 表明"哲学层理念"最容易无执法。建议建立"理念→门禁→fail 条件"的注册表（类似特征卡→门禁映射表，README.md:82-90），CI 断言每个宣称的理念至少有一个非空 fail 路径；`--cognition` 应重新设计判定语义或明确降级为度量报告（metric，非 gate）。
3. **fail-closed 默认化与跳过透明化**：SILENT 跳过（G5）违反"结果不可歧义"原则；建议汇总行强制披露"执行 N/27，跳过 M，跳过清单"，与 fail-closed 注入（generate-skill.sh:235-241）同思路。安全相关门禁应对照 GB/T 22239-2019（等保 2.0）与 OWASP ASVS 思路分级，禁止静默跳过。
4. **文档数字单一事实源**：G6 的反复漂移说明"从代码算真值扫散文"（self-check.sh:505-537）方向正确但覆盖不全；应把 `.claude/commands/*.md`、骨架模板内嵌数字、cognition-framework.md 全部纳入扫描，或让骨架从 `GATE_FLAGS`/`grep -c` 动态生成数字。
5. **自举闭环是合规叙事的根基**：G4 下"自举"宣称不可持续。建议 CI 增加"生成器对自身仓库跑 --all"的 job，并为 26/27 非框架门禁补 fixture 双态（审计档:47 已列为遗留），使自举从 slogan 变为证据。
6. **兼容层分级声明**：按第四节的三层同心圆现状，文档应区分"可运行（目录复制）/可集成（hooks/commands）/深度集成（MCP+LSP）"三档宣称，避免对 6 个非 Claude 工具过度承诺（G7）；长期可为各工具生成对应原生命令格式。
7. **AI 主导的决策留痕**：G1 矛盾的工程解是把"疑虑必确认"（SKILL.md:44）物化为确认日志（谁、何时、批准了什么），对齐 ISO/IEC 42001:2023（AI 管理体系）对人工监督留痕的要求，同时保留"AI 主导生成建议"的效率。

---

## 附：主要证据索引

- 理念表：swarm-yuan/README.md:29-34；swarm-yuan/docs/USAGE.md:9-21；swarm-yuan/docs/PROMO.md:29-43
- 特征卡：swarm-yuan/README.md:38-74；swarm-yuan/docs/FIVE_DIMENSIONS.md:1-276
- 门禁：swarm-yuan/README.md:78-137；assets/precheck.sh:250-257（注册表）、:1862（check_cognition）、:2491-2515（check_framework+标记区块）
- 生成流程：swarm-yuan/SKILL.md:57-88；swarm-yuan/docs/USAGE.md:193-212；.claude/commands/swarm-yuan.md:17-82
- 生成器实现：scripts/generate-skill.sh:40-67（清单）、:100-151（conf 合并）、:153-301（注入）、:304-343（环境检测）、:400-449（upgrade）、:455-537（create）
- 安装/兼容：swarm-yuan/install.sh:31-46（7 环境）、:60-101（安装）、swarm-yuan/SKILL.md:29（三平台铁律）
- 自检/文档一致性：scripts/self-check.sh:249-261（11 运行时表）、:435-554（时效+文档一致性）
- 框架引擎设计：docs/2026-07-17-framework-rules-engine-design.md:8-18（5 断层）、:76-148（契约）、:162-173（四要素）
- 已知问题决策：docs/paradigm-decisions.md:20-96；docs/2026-07-20-audit-optimization-decisions.md:8-47
- 实测数据（2026-07-20 本机执行）：57 框架 md/sh/fixtures 三件套；precheck.conf 146 变量；precheck.sh 27 个 `check_*()`；`check_cognition` 0 个 fail 调用；spec-template.md 21 主段。
