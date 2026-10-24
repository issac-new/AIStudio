# swarm-yuan 调研吸收台账与全量功能特性（现状视图 · 2026-10-20）

> **定位**：本稿是"一页看清现状"的派生视图，回答两个问题：swarm-yuan 吸收了哪些外部来源、各在什么版本；它最新版有哪些能力、数字口径是多少。历史沿革与逐轮证据不在本稿（见各权威源）。
> **口径头**：整理日 2026-10-20。版本基线 = 已发版 v2.88.1（2026-10-20）。main 另含三批未发版增量：R126 可靠性收口轮（874324d）、R126 深度复盘重构轮（2b11e5c）、R127 运行时蒸馏与设计总览汇编（9888956）；本轮台账整理随 docs/absorption-ledger-inventory 分支合入。详见 §3.10 与 §四。
> **真值指向**：数字以 `swarm-yuan/assets/facts.conf` 为准；运行时基线以 `docs/upstream-baseline.md` 为准；吸收整合以 `swarm-yuan/references/capability-map.md` 为准。本稿与三者冲突时，以三者为准并请回改本稿。
> **证据分级**：A = 本机实测（命令输出）；B = 官方一手直查；C = 二手转述（不进基线）。

## 一、结论

swarm-yuan 是一个项目开发技能生成器：对任意代码仓库跑一次 13 步生成流程，产出一个项目专属开发技能（目标技能），此后该项目的 AI 编码全程受目标技能约束。它的能力不是自研闭环，而是"吸收 + 接线"：外部来源调研进来，按三层深度接线，未装可降级。

吸收面现状（2026-10-20 重核态）：

- 登记上游运行时 22 项：19 项 synced、2 项 watch（claude-mem、codegraph）、1 项 license-risk（GitNexus）。许可证构成：MIT 14、Apache-2.0 6、专有 1、PolyForm Noncommercial 1。
- 接线 15 个运行时（深度 4 + CLI 6 + 方法论 5），其中 2 个为仓内物化整镜像（27 个技能 + 45 种图表类型）。
- 蒸馏方法论档 51 份（五族）+ 框架规则 81 份（与门禁片段 1:1 配对）。
- 非运行时来源：国内外标准族、论文、公众号文章、官方培训、行业法规 8 档。
- 调研过程留档 97 份（docs/research/）：运行时刷新 44、吸收与纳入 18、真实项目回归 15、设计与审计 20。

功能面现状（数字口径见 facts.conf）：

- 质量门禁 56（执行分层：核心 11 + 架构 18 + 合规 19 + advisory-only 6 + FULL 尾部 2；强制分层 strict 20 / warn 18 / advisory 18）。
- 配置变量 185（上限 200）、框架识别 81、特征卡 17（P0 六项 + P1 十一项）、领域知识 32、spec 模板 25 节、随发文件 92（lite 核心档 46）。
- 宿主 8（Claude Code 深度 + 7 个 CLI 宿主）、配置三档（lite/standard/compliance + auto 自适应）、spec-first 四层拦截（L1 写时 3 宿主活体实证 + 5 宿主已渲染未实证）。
- 测试资产：回归脚本 80、框架双态夹具 81 组、门禁夹具 48 组、独立验证器 golden 基线、三平台 CI。

本次核对修正 3 处（登记表三行回写、汇编导读预算数字、测试提示文案旧值），另登记 4 项待批事项，见 §四。

## 二、调研吸收台账清单

### 2.1 台账载体与分工

| 载体 | 职责 | 机器执法 |
|------|------|----------|
| `docs/upstream-baseline.md` | 22 项上游运行时的许可证、版本基线、漂移状态登记（供应链登记） | 行尾 baseline_status= 机器锚；self-check 轻量基线忠告 |
| `swarm-yuan/references/capability-map.md` | 吸收层整合总清单：51 档逐档登记来源、证据分级、消费节点、触发 | self-check G25 双向对账（实存必入账、入账必实存、路由可达） |
| `swarm-yuan/assets/facts.conf` | 全部计数口径单一事实源（门禁、变量、运行时、档数、预算） | self-check 文档一致性断言 + test-doc-numbers 124 断言 |
| docs/design-compendium.md + design-compendium-full.md | 六大正本全文 + 97 份轮档索引 + 用户指令编年的汇编快照（正本更新后需重新生成） | 无（快照不承载真值） |
| 本稿 | 三者的现状派生视图（查阅用，不承载真值） | 无（冲突回改本稿） |

### 2.2 上游运行时登记（22 项）

登记基线列取自 upstream-baseline 表行（含本轮回写的三行）。"本次实测"列 = 2026-10-20 22 时 GitHub API 直查，仅对 R126 宣称移动的三项做了独立复核（A 级），其余标"未复核"。状态列为表行机器锚原值。

**深度层（4 项）：门禁内真实子进程调用，未装走降级载体**

| 运行时 | 上游 | 许可证 | 登记基线 | 本次实测 | 状态 |
|--------|------|--------|----------|----------|------|
| graphify | Graphify-Labs/graphify | Apache-2.0 | v0.9.92 | 未复核（R124 后零移动） | synced |
| GitNexus | abhigyanpatwari/GitNexus | PolyForm Noncommercial | npm 1.6.9（引用 context/trace）；GitHub tag v1.6.12 | 未复核 | license-risk（非默认、不追） |
| claude-mem | thedotmack/claude-mem | Apache-2.0 | v14.0.1 | 未复核 | watch（GitHub 与 npm 发版节奏分离） |
| ocr | alibaba/open-code-review | Apache-2.0 | v1.13.2 | 未复核（R127 复核一致） | synced |

**CLI 层（6 项）：按需调用 CLI，降级自带载体**

| 运行时 | 上游 | 许可证 | 登记基线 | 本次实测 | 状态 |
|--------|------|--------|----------|----------|------|
| openspec | Fission-AI/OpenSpec | MIT | v1.14.3 | 未复核 | synced |
| comet | rpamis/comet | MIT | 0.4.5 | 未复核 | synced |
| gsd-core | open-gsd/gsd-core | MIT | v1.18.0 | 未复核 | synced |
| codex-security | openai/codex-security | Apache-2.0 | npm-v0.5.0 | 未复核 | synced |
| mattpocock-skills | mattpocock/skills | MIT | v1.3.1 + main 5beb35b04 | 未复核 | synced |
| diagram-design | cathrynlavery/diagram-design | MIT | v2.6.115（main f2f4d49ea） | 未复核 | synced |

**方法论层（5 项）：AI 按工作流节点引用模式，无运行时依赖**

| 运行时 | 上游 | 许可证 | 登记基线 | 本次实测 | 状态 |
|--------|------|--------|----------|----------|------|
| superpowers | obra/superpowers | MIT | v7.0.0 | 未复核 | synced |
| gstack | garrytan/gstack | MIT | v1.87.5.0（tag）+ main c580561e8（本轮回写） | main tip c580561e8（v1.91.164.0，06:40Z，merge train 全量开启） | synced |
| ruflo | ruvnet/ruflo（原 Claude Flow） | MIT | v3.58.1（本轮回写） | latest release v3.58.1（08:29Z，resolveTargets 路径逃逸 CWE-22 修复） | synced |
| ECC | affaan-m/ECC | MIT | v2.2.3 | 未复核 | synced |
| impeccable | pbakaus/impeccable | Apache-2.0 | cli-v4.7.0 | 未复核 | synced |

**机制源（4 项）：机制已蒸馏为 references 档，不进 15 个运行时分层计数**

| 运行时 | 上游 | 许可证 | 登记基线 | 本次实测 | 状态 |
|--------|------|--------|----------|----------|------|
| dsh | deepseek-ai/deepseek-harness | MIT | dsh-v0.2.1-rc.2 | 未复核 | synced |
| pua | tanweai/pua | MIT | v3.5.1 | 未复核 | synced |
| semantica | semantica-agi/semantica | MIT | tag v0.7.0 + main 0934ae800（本轮回写） | main tip 0934ae800（11:59Z，#2051 per-call model 入 provenance） | synced |
| pi | earendil-works/pi（原 badlogic/pi-mono） | MIT | v1.3.0 | 未复核 | synced |

**备选与宿主（3 项）**

| 运行时 | 上游 | 许可证 | 登记基线 | 状态 |
|--------|------|--------|----------|------|
| codegraph | colbymchenry/codegraph | MIT | 未定（登记未接线，本机未跑通） | watch |
| claude-code | anthropics/claude-code | 专有（Anthropic Commercial Terms） | v2.1.304（live CLI 同版，漂移为零） | synced |
| codex-cli | openai/codex | Apache-2.0 | rust-v0.163.0（live CLI 同版） | synced |

重核节奏：破坏性变更驱动 + 季度例行；patch 级移动只回写表行版本号与日期，不开调研档；一轮收口即封盘，同日复核废止（可被用户显式指令覆盖，2026-10-20 当日 R126/R127 两轮均属指令触发）。

供应链发现（R126，npm 通道陷阱五连）：裸名 `ocr`、`comet`、`openspec`、`gsd-tools` 均为撞名或占位包（真包分别为 @alibaba-group/open-code-review、@rpamis/comet、@fission-ai/openspec、@opengsd/gsd-core）；`codex-security` registry latest 与 git tag 不一致。离线安装清单已修正，自动安装列暂撤待复核。

### 2.3 物化运行时（仓内整镜像，随 install.sh 装 8 宿主恒可达）

| 物化层 | 内容 | 物化基线（MANIFEST） | 消费方式 | 目标技能侧 |
|--------|------|---------------------|----------|------------|
| runtime/mattpocock-skills/ | 27 个技能整镜像（engineering 20 + productivity 7） | main 49dd158（2026-10-09，v1.3 未出 tag 线上态） | 生成器侧读技能原文执行：探查访谈、领域建模、调研、原型、用户显式发起的 retro/handoff 等 | 不随技能分发，走 mattpocock-skills-methodology 机制改写 |
| runtime/diagram-design/ | 45 种图表类型整镜像 | main f2f4d49ea（2026-10-20，plugin 2.6.115） | 生成器侧读原文产出架构/流程/时序/状态/ER/依赖/部署图 | scripts/diagram-check.sh 结构自检随技能分发 |

### 2.4 方法论吸收 51 档（references，五族）

每档一行：档名 ← 来源（证据级）。消费节点与触发详见 capability-map；frameworks/ 子目录的 81 份框架规则另计（§3.3）。

**族① 生成主干（12 档，生成流程 Step 1-13 消费）**

| 档 | 来源（证据级） |
|----|----------------|
| exploration-guide | 内生 + semantica/graphify（A） |
| generation-flow | 内生（A） |
| template-spec | 内生 + agent-skills 联动（A） |
| agent-skills-methodology | addyosmani/agent-skills（B） |
| context-engineering-layering | Vibe 编码文章 + Anthropic 文档（B/C） |
| task-methodology-router | tanweai/pua 改写（A） |
| cost-estimation-methodology | 人行科技司培训 + NESMA GB/T 42588-2023（B） |
| domain-knowledge | 内生速查（A） |
| code-graph-tools | GitNexus/graphify/codegraph 三选型调研（A） |
| togaf-metamodel-methodology | TOGAF BDAT（B） |
| frontend-design-methodology | pbakaus/impeccable（B） |
| diagram-production-methodology | cathrynlavery/diagram-design v2.6.115（A） |

**族② 拼装与知识消费（10 档，开发工作流 ②⑤ 消费）**

| 档 | 来源（证据级） |
|----|----------------|
| lazy-generation-methodology | DietrichGebert/ponytail 蒸馏 + 行者明灵文章（B） |
| mattpocock-skills-methodology | mattpocock/skills（A） |
| cordis-composability-methodology | DeepSeek Harness 框架层（B） |
| knowledge-lifecycle-methodology | 京东海博 AI 知识库文章 + OKF 核验（B） |
| memory-persistence | claude-mem/ruflo/ECC 工具族（A） |
| cognition-framework | 内生五层认知（A） |
| cognitive-bias | 内生 + Kahneman 框架（B） |
| logic-razor | 内生（A） |
| four-theories-methodology | 工程控制论等四源（B） |
| mea-loop-methodology | AMAP LongHorizon-Harness（B） |

**族③ 编排与治理（10 档，开发全程消费）**

| 档 | 来源（证据级） |
|----|----------------|
| governance-agents | pua 四权分离 + §Z 五协议 + §AA 跨运行时协作（kimi-code/multica/dsh-TUI 三仓）（A） |
| subagent-orchestration | superpowers/comet + ruflo（A/B） |
| gsd-patterns | gsd-core（A） |
| decision-governance | gsd-core + gstack（A/B） |
| dsh-engineering-methodology | DeepSeek Harness 产品层（B） |
| codex-methodology | openai/codex（B） |
| claude-code-capabilities | claude-code releases 全量调研（B） |
| mcp-governance | 内生（A） |
| codex-security-methodology | openai/codex-security（A） |
| controlled-language-methodology | ASD-STE100 规范思想 + 公文笔法调研（A） |

**族④ 验证与过程资产（5 档，开发工作流 ⑥⑦⑧ 消费）**

| 档 | 来源（证据级） |
|----|----------------|
| review-methodology | gstack review + cso + ocr（A） |
| canary-monitoring | check_canary 降档保留（A） |
| ai-process-records | GB/T 8566 扩展（B） |
| quality-management-standards | ISO 9001 / CMMI 映射（B） |
| rsi-evidence-methodology | 清华 RSI 综述 + D2I-ai + 字节三论文（B） |

**族⑤ 安全合规与行业立法（13 档，门禁执法消费）**

| 档 | 来源（证据级） |
|----|----------------|
| security-spec | OWASP / STRIDE / CWE 综合（B） |
| crypto-spec | GB/T 39786 等国标（B） |
| cwe-database | CWE 视图 799（B） |
| security-certification-profiles | 等保 / PCI-DSS / ISO 27001 等（B） |
| standards-compliance | GB/T 25000 系列映射（B） |
| industry-profile ×8（finance/gov/medical/telecom/automotive/energy/industrial/payment） | 各行业法规调研 + hermes pay-team（payment，B/A） |

另：capability-map 自身计入 51 档（吸收整合总清单，不属五族）。

### 2.5 非运行时来源

- 标准族：OWASP Top 10、STRIDE、CWE、GB/T 39786（密码）、GB/T 25000 系列（质量）、GB/T 8566（过程）、GB/T 42588-2023（NESMA 功能点）、ISO/IEC 42001（决策治理）、ISO 29148 + EARS（需求句式）、ISO 9001 / CMMI、TOGAF BDAT、ASD-STE100（受控语言）、等保四级 / BCP / GB 22240 / PCI-DSS（认证 profile）、ISO/IEC 5230 OpenChain（供应链登记方向）。
- 论文与研究：清华 RSI 综述、D2I-ai、字节三论文（RSI 证据学）；AMAP LongHorizon-Harness（长任务编排）；Cordis 论文草稿（可组合性）；Kahneman 认知偏差框架。
- 文章与培训：京东海博知识库实践、行者明灵与 Vibe 编码公众号文章、《Harness 实践》上下篇、人民银行科技司 2025-07 培训、公文笔法 skill 调研档案。
- 项目机制源（未入 22 行登记）：addyosmani/agent-skills、DietrichGebert/ponytail、Palantir 本体论工程（决策 28 标记传播）、autoresearch Oracle Isolation（loop Oracle Gate）、kimi-code + multica + dsh-TUI（governance §AA）、hermes pay-team（支付 profile 人格内核）。
- 行业法规 8 档：assets/industry-profiles/ 与 references/industry-profile-*.md 配对，--industry 真实加载。

### 2.6 吸收纪律（吸不吸、吸到哪层，怎么定）

1. 证据分级硬门槛：媒体报道的仓库指针、版本、数字默认 C 级，未经 API 或源码核实不进基线。
2. 吸收前两问：哪个环节缺这个、谁在什么场景消费它；答不上只记轮台账，不入库（决策 46）。吸收物处置三态：改写吸收 / 记档观察 / 不吸收（决策 36）。
3. 三层接线：深度（子进程）/ CLI（按需调用）/ 方法论（节点引用）；机制源不进 FACT_RUNTIMES 分层计数；"方法论引用不 vendor，运行时调用不重实现"。
4. 吸收优先于新增门禁（决策 27）：优先把外部机制改写进既有档，门禁预算 56 冻结。
5. 双物化例外：上游以技能/图表库形态供给的（mattpocock、diagram-design），仓内整镜像物化保"读原文执行不悬空"，目标技能侧只拿机制改写或结构自检脚本。
6. 对账机器执法：G25 双向（51 档实存与登记互指）；upstream-baseline 行尾机器锚；facts.conf 闭合方程（56 = 50 + 6 等）由 self-check 断言。
7. 终态文档不带历史包袱：README / SKILL / references 禁轮次标记与变迁叙事，jargon 门禁（test-r68）机器把关。

### 2.7 调研轮档台账（docs/research/，97 份）

调研过程本身也有台账。按文件名机械分类为四类（A 级）：

| 类别 | 份数 | 代表轮档 |
|------|------|----------|
| 运行时例行刷新 | 44 | R16 至 R124 各轮 runtime-refresh，多由 /goal 三目标指令触发 |
| 吸收与纳入 | 18 | R45 双运行时纳入（pua + semantica）、R86 mattpocock 纳入、R88 RSI 证据学、R114 mattpocock 物化、R37 Harness 实践、R49 海博知识库、R76 流程编排、R77 吸收判据 |
| 真实项目回归 | 15 | R9 范式实测、R44 / R72 / R75 / R80 / R82 / R83 / R87 全量回归、R58 / R60 / R62 / R64 换栈演练、R118 nestjs、R121 与 R124 JVM |
| 设计与审计 | 20 | R1 自设计、R2 门禁引擎、R50 吸收清单、R54 全审计、R101 spec-first、R103 宿主 hooks、R104 离线包、R119 审计加固、R126 审计发现 |

另有 docs/reviews/ 复审档案。97 份逐份标题与触发行见 docs/design-compendium-full.md 卷七；用户指令编年见卷八。

## 三、最新版全量功能特性

版本基线：v2.88.1（2026-10-20 发版）+ 未发版增量（§四）。以下按"生成器六层机制 + 分发治理"组织，与 README §3 同构。

### 3.1 定位与生命周期

一句话：让 AI 先懂你的项目，再写代码。生命周期为环：生成目标技能（13 步）→ 目标技能日常使用（九节点工作流）→ 项目演进 → 指纹感知 → 技能局部更新 → 继续使用。适用边界：AI 驱动、有一定规模、值得立法的项目；个人脚本、typo 级小改、纯人工开发不适用（轻量替代为单文件门禁脚本与传统工具链）。

### 3.2 认知层（先认识再行动）

- 探查：三路并行子代理（结构 / 规范 / 代码组织），方法论在 exploration-guide；产物为组件库清单（计数核验 ≥ 枚举 × 0.95）、调用链、关系边集（relations-extract.sh 提取 XML↔接口等声明式映射边，relations-query.sh 支持反查"谁依赖 X"）、任务配方（recipes 五要素）。
- 特征卡 17 项（P0 六项强制 / P1 十一项可增量）：项目的认知 DNA，由 extract-feature-cards.sh 承载。
- 领域知识 32 个领域速查 + 本体论类型目录（实体 17 / 关系 10 / 动作 11）+ 五层认知框架 + TOGAF BDAT 四层视角。
- 框架识别 81 个（detect-frameworks.sh，含 pom 坐标成对匹配 pomga 桶）；框架规律须项目代码证据（framework-evidence.sh 台账），无证据剔除并记反例。
- 代码图谱优先：GitNexus / graphify 可用时走图谱探查，codegraph 为第三备选（watch）。
- 行为统计：mine-habits.sh 从 git 历史产出开发习惯初稿，AI 审读三去向（铁律引用 / 开发偏好 / 注意事项）。

### 3.3 规范层（规矩从哪来）

- spec 模板 25 节（含 §24 架构映射 TOGAF BDAT、§25 NESMA 功能点估算选填）；spec 句式遵循 ISO 29148 + EARS。
- rules.d 三值规则引擎（allow / prompt / forbid 取最严，forbid 必带替代方案），每次 Bash/Edit 实时匹配；复合命令按命令段递归求值。
- 框架规则 81 份（references/frameworks/）与门禁片段（assets/framework-gates/）1:1 配对，按 ACTIVE_FRAMEWORKS 注入 precheck 标记区块，可快照回滚。
- 配置三件套 185 变量（precheck.conf 20 + arch 117 + compliance 48），user 面必配约 20 项；conf-render.sh 三档 profile 渲染（lite / standard / compliance）。
- 标准映射：standards-map.conf 将 OWASP / STRIDE / CWE / GB/T / ISO 条款机器可读化；行业法规 8 档真实加载。

### 3.4 装配层（生成与激活）

- 生成流程 13 步（SKILL.md 总览 + generation-flow.md 详解）：自检 → 读项目知识 → 探查 → 形态判定与框架注入 → 特征卡 → 骨架 → AI 填充 → 配置 → 宿主集成 → 编码验证 → 独立审查 → 记忆写回 → 终检激活。
- 产物六段式骨架：SKILL.md + workflow + references + assets + 门禁配置 + scripts；随发文件 92 个（三档 profile 均拷的核心档 46 个）。
- 四档配置：auto（合规信号 → compliance，<80 文件 → lite，其余 standard）/ lite / standard / compliance；lite 无 hooks、compliance 含行业注入。
- CLI 面（generate-skill.sh）：create、--upgrade（保留项目特定文件）、--verify-completeness --strict（占位符清零机器执法）、--mark-active（三道关：占位符清零 / 路径零幻觉 / 计数达标）、--inject-frameworks / --rollback-frameworks、--render-tools（8 宿主原生规则文件派生，幂等）、--refresh（指纹 diff）、--check-framework-globs（空转防线）；SKILLS_PATH_REWRITE 环境变量支持 skills 目录重定向。
- 状态机六阶段（state-machine.sh）：design 需 proposal、build 需批准 spec、verify 需 tasks 全勾、archive 需 verify pass 与证据；draft 骨架不可交付。
- 分发净化：distill-references.sh 在随技能分发前剥离仓内维护注记，预算不随刷新轮上涨（R125 起的预算棘轮根治）。

### 3.5 使用层（上）：门禁管"不懂规矩"

- 门禁 56 个，执行分层：核心 11（--all）/ 架构 18 / 合规 19（--compliance-suite）/ full 50（--all-full）/ advisory-only 6（单 flag 显式调用）+ FULL 尾部治理 2；闭合方程由 self-check 断言。
- 强制分层（enforce_level）三档：strict 20（fail 阻断）/ warn 18 / advisory 18（有效分层，静态分层 20/21/15 + override）；既有门禁输出刻意增强清单（--reuse / --review / --diagram / --skill-supply-chain）走 A/B 逐字节对比豁免。
- spec-first 四层拦截"无 spec 写源码"，判据单一事实源 spec-first-lib.sh：L1 写时（宿主 hooks deny；Claude Code / Codex / ZCode 三宿主活体实证，Cursor / Gemini / Windsurf(Devin) / OpenCode / Kimi-Code 五宿主已渲染未实证）、L2 提交时（git pre-commit 经 core.hooksPath 装配，读 Git index 中 spec 正文）、L3 门禁时（check_spec_first 入核心序列）、L4 流程准入（状态机 build 阶段）。
- fail-gate-hook：门禁 fail 未修复前拦截文件改动，flag 生命周期收归 precheck 单一管理。
- hooks 族 8 个：fail-gate-hook（L1 拦截）、spec-first-bridge（五宿主 L1 统一判据桥）、spec-first-pre-commit（L2）、failure-detector（SPINNING / EXPLORING / MIXED 三态 + L1-L4 压力升级）、integrity-guard（受保护资产防作弊门）、loop-hook（Oracle Gate：verify_command 独立验证 promise）、setup-loop（发布后 canary）、codex-gate-wrapper。
- 安全族门禁：security / crypto / privacy / authz / sbom / dengbao（等保）/ pia / sast-deep / oss-eval / cwe-audit / cert-audit；SARIF 导出（to-sarif.sh）。
- 运营面：gate-report（单次报告）、gate-trends（趋势）、adaptive-gating（自适应轻重、只升不降）、gate-plan（任务类型门禁路由）、gate-runs.jsonl 逐次证据落盘、gate-deny.jsonl 拦截可复盘。

### 3.6 使用层（下）：验证管"想错逻辑"

- 独立验证器 verifier/v1（run-verifier.sh）：expected-fail-ids / expected-pass-ids 断言门禁既抓违规又放过合规；golden 基线防回归。
- 独立审查：--review 门禁核验留痕 + review-record 落盘；ocr 可用时五维审查点，否则 AI 清单诚实降级。
- 全链路留痕：trace.jsonl 每步公告落盘；decisions.jsonl 决策三级分类（Mechanical 直接做 / Taste 给方案加推荐 / UserChallenge 必停问用户）+ 哈希链（seq + previous_checksum + checksum，trace-log.sh --verify-chain 可验三类破坏）。
- compaction 状态续传：PreCompact dump-journal + SessionStart restore-journal，压力不因上下文压缩重置；journal 只读最后完整快照，恢复前先归档原状态（R126 收口）。
- 成本与规模：cost-report.sh（token 与成本台账）、task-scale.sh / detect-spec-scale.sh（规模评估）、Mutation Check 审查口径（门禁函数变异后仍检出才证明断言有效）。

### 3.7 成长层（技能随项目生长）

- 指纹感知：project-fingerprint.sh --diff 报结构变化范围，按 exploration-guide §D 局部重探查、清单单条更新；条目骤降超 50% 拒写保留旧版；内容演化走 git diff / --stable-diff（指纹只看结构）。
- 升级：generate-skill.sh --upgrade 用最新模板覆盖通用文件、保留项目特定文件；detect-profile-drift.sh 监控档位漂移。
- 知识生命周期：过期条目三态处置（knowledge-lifecycle-methodology §五）。
- 记忆写回：memory-writeback.sh 经 memory-backends.sh 适配层派发，注册后端 3 个（local 落盘 .swarm-yuan/、zcode、claude_mem），后端可替换。

### 3.8 分发、宿主与离线

- 宿主 8 个：Claude Code（hooks / commands / MCP 深度集成）+ Cursor / Windsurf / Codex / OpenCode / Gemini / Kimi / ZCode（目录复制 + 规则派生，tool-adapters 8 个适配器渲染各宿主原生规则文件）；本机实测装了 5 个（Claude Code / Codex / OpenCode / Kimi / ZCode，install.sh --list 实测）。
- 运行时自动检测 11 项，全部可降级（深度层降级为静态扫描、记忆降级为本地落盘、审查降级为四维）。
- 离线安装包：make-offline-bundle.sh 产全量包与 --no-vendor 精简包（除 npm / pip 可安装插件，-novendor 后缀）同版双件；SHA256SUMS 校验；install-offline.sh --with-npm / --with-pip 对 skipped 行逐条打印镜像源安装命令。发版次序：先打 tag 再构建（git describe 推版本）。
- 三平台兼容：bash 3.2 + BSD 工具链硬前置（Windows 走 Git Bash / WSL），脚本禁关联数组，Windows 侧 .bat 入口（precheck / self-check / generate-skill / state-machine / trace-log / cost-report / detect-frameworks）。

### 3.9 治理、自检与测试资产

- 数字单源：facts.conf 承载全部口径，self-check 文档一致性断言 + test-doc-numbers 127 断言机器锁手抄面；test-r68 jargon 门禁锁终态文档用语。
- 预算棘轮（负向预算，超限须等额删除或逐例登记）：门禁 56 / 56、conf 变量 185 / 200、随发体积 614400B、目标 SKILL.md 正文 11264B、组件库清单 32768B、生成期必读三件套 194560B；例外登记台账 docs/budget-exception-ledger.md。
- self-check G 系列断言：G25 吸收双向对账、G18 孤儿资产、G19 反向引用、G10 版本 oracle 单源规则、G16 标记沿调用链传播、G23 enforce 分层重放等；--check-only 免装依赖档。
- 测试资产：回归脚本 80 个（含 R126 新增 5 个行为级回归锁：generator-reliability 39 / hook-contracts 34 / verifier-reliability 41 / state-recovery 9 / trace-reliability 14 断言）、框架双态夹具 81 组、门禁夹具 48 组、cross-stack 与 e2e、SARIF 夹具；run-sweep.sh 单命令全量回归（最近一轮 81 通过 / 0 失败）；CI 三平台矩阵（macOS / Linux / Windows）。
- 发布形态：源码包 tag（vYYYYMMDD-src，release-src-packages.sh）+ CHANGELOG 按 Added / Fixed / Verified 分组。

### 3.10 近五版增量速览（v2.85.0 → v2.88.1 + 未发版）

| 版本 | 日期 | 轮次主旨 | 主要增量 |
|------|------|----------|----------|
| v2.85.0 | 2026-10-18 | R121 JVM 项目级回归样例重建（order-forge） | 持久回归样例库第二件 |
| v2.86.0 | 2026-10-19 | R122 图表生产能力 | diagram-design 物化为第 15 运行时；--diagram 两层门禁（机械契约 + AI 检查单） |
| v2.87.0 | 2026-10-20 | R123 运行时例行刷新（双会话接力） | 6 项移动吸收；governance §AA 跨运行时协作治理；codex 0.163 / dsh rc.2 深读增量 |
| v2.88.0 | 2026-10-20 | R124 JVM 全家桶全栈回归（trade-forge，10 框架） | 9 项生成器缺陷根治（druid pomga 桶 / dubbo 三误报 / method_size 目录排除 / element 双误报 / jest hoisted / sharding 谓词判据）；离线包 --no-vendor |
| v2.88.1 | 2026-10-20 | R124 运行时刷新互补支 | 8 项移动吸收；commerce-forge 第二全栈样例；locale 门禁修正 |
| 未发版（main 874324d） | 2026-10-20 | R126 可靠性收口 | 输入保真 / 失败传播 / 证据恢复三交界加固；新增 5 个行为级回归锁 |
| 未发版（main 2b11e5c） | 2026-10-20 | R126 深度复盘重构 | 五域并行审计 96 项发现，修复 33 项（门禁引擎 15 / 生成器管线 / 测试设施 / 分发自检）；余 63 项登记待批（docs/research/R126-audit-findings.md） |
| 未发版（main 9888956） | 2026-10-20 | R127 运行时蒸馏与设计总览汇编 | R126 三移动的方法论落笔（subagent-orchestration / review-methodology / exploration-guide）；design-compendium.md 导读 + design-compendium-full.md 全量汇编；shellcheck mock 配套 |
| 未发版（本分支） | 2026-10-20 | 台账整理 | 登记表三行回写（ruflo v3.58.1 / gstack c580561e8 / semantica 0934ae800）；汇编导读预算数字 584KiB→600KiB；test-doc-numbers 提示文案旧值修正；本稿 |

## 四、本次核对结果与待批事项

本轮已处置三处，随本分支合入：

1. **登记表三行回写**。R126 重核只写了头注，没有回写 ruflo / gstack / semantica 三行，不符合"每轮刷新必回写表行"纪律。本轮把引用基线、最新版、状态三列前置为 R126 记档值（ruflo v3.58.1、gstack c580561e8、semantica 0934ae800）。三值经 GitHub API 独立复核属实。
2. **汇编导读预算数字**。design-compendium.md 与 design-compendium-full.md 卷首写"上下文预算 ≤584KiB"，这是 v2.87.0 旧值。已改为 ≤600KiB（614400B），与 facts.conf 一致。全量汇编是程序化快照，正本再变更时需重新生成。
3. **test-doc-numbers 提示文案**。断言本身已是 614400，只有成功提示行仍印旧值 598016，已改。

待批四项：

4. **references 两处档头历史口径**（低）。mattpocock-skills-methodology 档头写"第 14 个外部运行时"（现为 15），dsh 档头写"门禁总数保持 55"（现为 56）。两句是吸收时点的真实陈述。改为现状口径会触及分发面与 test-r68 / test-doc-numbers，请裁决。
5. **npm 撞名计数口径不一**（低）。upstream-baseline R126 注记写"五连"，汇编导读写"六连"，两处列出的都是同样五个包名。复核 codex-security registry 与 git tag 一致性时一并统一。
6. **部署版滞后一个未发版批次**（预期）。~/.zcode/skills/swarm-yuan 与仓库差 169 处，集中在 R125 / R126 改动文件。未发版不安装属预期，发版后跑 install.sh 同步。
7. **三项常设异常**（信息）。GitNexus license-risk（PolyForm 禁商用，不追新）、claude-mem watch（GitHub 与 npm 发版节奏分离）、codegraph watch（登记未接线）。

## 附：本稿数字的核对命令（A 级锚）

```text
bash swarm-yuan/assets/precheck.sh --list-gates        # 56 门禁名单 + strict 20 / warn 18 / advisory 18
ls swarm-yuan/references/*.md | wc -l                  # 51（不含 frameworks/）
ls swarm-yuan/references/frameworks/*.md | grep -vc _template   # 81
ls swarm-yuan/assets/framework-gates/*.sh | wc -l      # 81
find swarm-yuan/runtime/mattpocock-skills -name SKILL.md | wc -l  # 27
find swarm-yuan/runtime/diagram-design -name 'type-*.md' | wc -l  # 45
ls swarm-yuan/tests/*.sh | wc -l                       # 80
ls -d swarm-yuan/tests/fixtures/*/ | wc -l             # 81
ls -d swarm-yuan/tests/gate-fixtures/*/ | wc -l        # 48
bash swarm-yuan/install.sh --list                      # 本机宿主检测
```

上游三项移动复核（2026-10-20 22 时，GitHub API）：ruvnet/ruflo latest release v3.58.1（08:29Z）；garrytan/gstack main c580561e8（v1.91.164.0，06:40Z）；semantica-agi/semantica main 0934ae800（#2051，11:59Z）。

本轮回写后验证（worktree docs/absorption-ledger-inventory）：baseline_status= 机器锚 22 行不变；`bash swarm-yuan/scripts/self-check.sh --check-only` 通过；`bash swarm-yuan/tests/test-doc-numbers.sh` 127 项断言 0 失败。
