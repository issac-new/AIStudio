# R6 · 上游组件与同类范式网络调研（2026-07 视角）

> 调研切片：swarm-yuan 整合的其余 9 个第三方运行时 + 同类研发范式产品前沿动态。
> 调研人：R6-上游组件调研员。调研日期：2026-07-20。
> 数据来源约定：所有 stars/forks/license/最近 push 数据均为 **GitHub REST API（api.github.com）2026-07-20 实测**；版本号为 npm/PyPI registry 2026-07-20 实测；其余结论给出 URL + 访问日期 2026-07-20；本地吸收现状给出 swarm-yuan 仓库内文件路径+行号。
> 同名项目消歧：「comet」取 AI 研发工作流语境的 rpamis/comet（非 comet-ml）；「open-code-review」swarm-yuan 引用的是 alibaba/open-code-review（见 `swarm-yuan/references/review-methodology.md:3`），另有同名 spencermarx/open-code-review 一并调研；「ECC」取 affaan-m/ECC（Everything Claude Code 演进而来的跨 harness 代理系统）。

---

## 0. 总览：社区状态实测表（GitHub API，2026-07-20）

| 项目 | 仓库 | Stars | Forks | License | 最近 push | 最新版本 | swarm-yuan 调研基线 |
|---|---|---|---|---|---|---|---|
| OpenSpec | Fission-AI/OpenSpec | 61,637 | 4,273 | MIT | 2026-07-18 | npm 1.6.0 | v1.6.0（`references/review-methodology.md:130`）✅ 同步 |
| comet | rpamis/comet | 2,370 | 234 | MIT | 2026-07-20 | npm 0.4.0-beta.5 | v0.3.9（`references/subagent-orchestration.md:118`）⚠️ 落后一个大版本 |
| GitNexus | abhigyanpatwari/GitNexus | 44,379 | 4,928 | **PolyForm Noncommercial 1.0.0**（API 返回 NOASSERTION） | 2026-07-20 | npm 1.6.9 | 引用 `context/trace`（`swarm-yuan/SKILL.md:78`） |
| graphify | **Graphify-Labs/graphify**（原 safishamsi/graphify，已迁移） | 91,724 | 8,934 | MIT | 2026-07-18 | npm graphifyy 0.10.0 / PyPI 0.9.20 | v0.9.8–v0.9.19（`references/code-graph-tools.md:73-134`）⚠️ 落后 0.10 |
| gsd-core | open-gsd/gsd-core | 6,855 | 462 | MIT | 2026-07-20 | npm 1.7.0 | v1.7.0（`references/review-methodology.md:311`）✅ 同步 |
| claude-mem | thedotmack/claude-mem | 87,898 | 7,631 | Apache-2.0 | 2026-07-19 | npm 13.11.0 | 三路写回（`swarm-yuan/SKILL.md:85`） |
| open-code-review (OCR) | alibaba/open-code-review | 10,707 | 731 | Apache-2.0 | 2026-07-17 | v1.7.x（Go） | v1.3.13→v1.7.12（`references/review-methodology.md:178,313`）✅ 基本同步 |
| open-code-review（同名） | spencermarx/open-code-review | 301 | 24 | Apache-2.0 | 2026-06-28 | @open-code-review/cli v2.1+ | 未引用 |
| Ruflo | ruvnet/ruflo（原 Claude Flow） | 65,222 | 7,748 | MIT | 2026-07-19 | npm 3.32.8 | v3.21.1 / v3.24–v3.25 方法论（`references/subagent-orchestration.md:277`、`references/review-methodology.md:208-209`）⚠️ 落后 ~11 个小版本 |
| ECC | affaan-m/ECC | 231,304 | 35,296 | MIT | 2026-07-20 | v2.0.0（2026-06 稳定版） | v2.0.0（`references/subagent-orchestration.md:149`）✅ 同步 |
| 参考：superpowers | obra/superpowers | 257,690 | 22,957 | MIT | 2026-07-19 | v6.x | v6.1.1（`references/subagent-orchestration.md:118`） |
| 参考：GSD v1（已归档） | gsd-build/get-shit-done | 64,777 | 5,481 | MIT | **2026-06-26 归档只读** | v1.41.x | — |
| 参考：spec-kit | github/spec-kit | 122,437 | 10,913 | MIT | 2026-07-17 | v0.5.0（2026-04） | 未整合 |
| 参考：BMAD-METHOD | bmad-code-org/BMAD-METHOD | 50,829 | 5,840 | NOASSERTION（第三方资料称 MIT） | 2026-07-19 | v6 beta | 未整合 |
| 参考：SuperClaude | SuperClaude-Org/SuperClaude_Framework | 23,577 | 1,989 | MIT | 2026-06-13 | v4.3.0（PyPI superclaude） | 未整合 |
| 参考：Kiro CLI | kirodotdev/Kiro | 4,044 | 281 | 未标注 | 2026-06-22 | — | 未整合 |

---

## 1. 九个上游组件逐一调研

### 1.1 OpenSpec（spec-driven development）

- **理念**：AI 编码助手的需求若只活在聊天记录里就不可预测；OpenSpec 在写代码前加一层轻量 spec，让人与 AI "先对齐再动工"（Agree before you build）。设计哲学四句：`fluid not rigid / iterative not waterfall / easy not complex / built for brownfield`。
  来源：https://github.com/Fission-AI/OpenSpec ，https://www.npmjs.com/package/@fission-ai/openspec （访问 2026-07-20）。
- **核心功能**：`openspec init/propose/apply/validate/show/list/archive`；change 目录含 proposal.md + tasks.md + design.md + spec delta（ADDED/MODIFIED/REMOVED + SHALL/MUST + Scenario WHEN/THEN）；brownfield 双区设计——`openspec/specs/`（当前事实源）与 `openspec/changes/`（提案），归档时把批准的 delta 合回 specs；`/opsx:*` 扩展工作流（new/continue/ff/verify/sync/bulk-archive/onboard）；CLI dashboard；支持 25+ AI 工具，无 API key、无 MCP 依赖。
  来源：https://github.com/Fission-AI/OpenSpec/tree/main （访问 2026-07-20）。
- **设计原理**：把"变更"建模为可审查、可归档的一等工件；spec 是 source of truth，code 是衍生品；delta 显式化使跨 spec 的修改可管理。官方自我定位：比 Spec Kit 轻（无刚性阶段门），比 Kiro 开放（不锁 IDE/模型）。
- **社区状态**：61.6k stars、MIT、TypeScript、活跃（2026-07-18 有提交）；npm 最新 1.6.0；官方称 "The most loved spec framework"（GitHub API 2026-07-20 实测；README badge 自述）。
- **与 swarm-yuan 的关系**：
  - **已吸收**：proposal→spec(delta)→design→tasks 四件套进入生成技能的 spec/plan 模板与 workflow 节点②③（`swarm-yuan/references/template-spec.md:179-188,355,583`）；`/opsx:update` 原地修订与预批准 CLI（`references/review-methodology.md:130-153`）。
  - **未吸收**：`openspec validate` 结构化校验（RFC 2119 关键字、Scenario 格式）；`opsx:verify`/`opsx:sync` 的"实现↔spec 同步"闭环；CLI dashboard 的可视化 change 管理；25+ 平台安装适配层。
  - **值得吸收**：把 `openspec validate --strict` 作为 swarm-yuan precheck 的一条 spec 门禁（当前 swarm-yuan 的 27 门禁主要面向代码与文档，spec 结构校验可补齐"spec 即合同"的最后一环）；opsx:verify 与 swarm-yuan verifier/v1 的对接点（verify 不阻塞 archive 是 OpenSpec 的已知弱点，swarm-yuan 的门禁恰好能补——见 §3 对比）。

### 1.2 comet（脚本背书状态机）

- **消歧**：此处为 rpamis/comet——"agent skill harness: phase-guarded automation from idea to archive"，把 OpenSpec（WHAT）与 Superpowers（HOW）串成 5 阶段流水线（open→design→build→verify→archive）。非 comet-ml（ML 实验跟踪）。来源：https://github.com/rpamis/comet （访问 2026-07-20）。
- **理念**：Skill 市场的"偏好问题"——用户只想各取所长（OpenSpec 的 spec 管理 + Superpowers 的 TDD），comet 示范如何可靠地**嵌套触发** Skill、让组合 Skill 跨阶段自动流转、把 spec 生命周期变成**可断点恢复**的工作流。
- **核心功能**：`.comet.yaml` 状态文件（phase/build_mode/isolation/verify_result/verification_report/branch_status/handoff_hash 等字段，与 `.openspec.yaml` 解耦）；7 个 shell 脚本：`comet-guard.sh`（阶段迁移守卫，`--apply` 自动写状态）、`comet-state.sh`（agent 唯一 YAML 接口）、`comet-yaml-validate.sh`（schema 校验）、`comet-handoff.sh`（design→build 上下文包 + SHA256 追踪，context compression 省 25–30% token）、`comet-hook-guard.sh`（PreToolUse 写保护，open/design/archive 阶段禁止写代码文件）、`comet-archive.sh`（一键归档）；`comet status/dashboard/doctor`；支持 29 个 AI 平台安装。
- **设计原理**：**不相信 agent 自述"完成了"**——阶段出口必须由脚本检查证据：`verify-pass` 要求 verification_report 指向存在的报告文件且 branch_status=handled；build 离开前必须选定 isolation（branch|worktree）与 build_mode；状态只经脚本写，消除"写了没验证"的错误。README 原文："Compared to storing complex state rules only in Skill text, this script-backed state machine gives Comet more reliable phase transitions"。
  来源：https://github.com/rpamis/comet （访问 2026-07-20）。
- **社区状态**：2,370 stars、MIT、JavaScript、非常活跃（2026-07-20 有提交）；npm 最新 0.4.0-beta.5（GitHub API + npm registry 2026-07-20 实测）。
- **与 swarm-yuan 的关系**：
  - **已吸收**：脚本背书状态机理念——`swarm-yuan/assets/state-machine.sh:2-3` 明示"comet 风格…survive context compaction"，5 阶段模式可裁剪（`assets/state-machine.sh:20`）；comet v0.3.9 全量能力已调研入册（`references/subagent-orchestration.md:116-118`）。
  - **未吸收**：guard 的**证据前置硬校验**（报告文件存在 + 分支已处理才放行 verify）；hook-guard 的**写保护**（非 build 阶段禁写）；handoff 的 **SHA256 上下文包**与 context compression；yaml schema 校验器；doctor/dashboard。
  - **值得吸收**（与 swarm-yuan 沉睡门禁、fail-open 问题直接相关）：①comet-guard 的"无证据不流转"正是治 fail-open 的范式——swarm-yuan 27 门禁可引入同样的"证据文件存在性"硬前置；②hook-guard 写保护可补 precheck 只管提交不管过程的盲区；③handoff SHA256 可用于 swarm-yuan 各阶段产物（特征卡→references→门禁注入）的溯源链。注意版本基线 0.3.9→0.4.0-beta.5 已漂移，需重核能力清单。

### 1.3 GitNexus（代码图谱）

- **理念**："Zero-Server Code Intelligence Engine"——客户端/零服务器代码智能引擎，知识图谱可在浏览器端运行，drop 一个 git 仓库即建图。来源：https://github.com/abhigyanpatwari/GitNexus （访问 2026-07-20）。
- **核心功能**：`gitnexus setup` 自动检测编辑器写 MCP 配置；Claude Code 深度整合 = MCP tools + agent skills + **PreToolUse hooks（用图上下文增强搜索）+ PostToolUse hooks（commit/merge/rebase 后检测索引过期并提示重建）**；Cursor/Antigravity/Codex/OpenCode/Windsurf 适配；`context`/`trace` 等查询。
- **社区状态**：44,379 stars、TypeScript、非常活跃（2026-07-20）；npm 1.6.9。**License = PolyForm Noncommercial 1.0.0**（GitHub API 返回 NOASSERTION；LICENSE 文件原文头两行实测为 "PolyForm Noncommercial License 1.0.0 / https://polyformproject.org/licenses/noncommercial/1.0.0"，2026-07-20 拉取 raw 文件核实）。
- **与 swarm-yuan 的关系**：
  - **已吸收**：`gitnexus context/trace` 是组件盘点与调用链提取的首选工具（`swarm-yuan/SKILL.md:78`、`README.md:61,134`），并列入"工具引用铁律"五命令之首（`swarm-yuan/SKILL.md:108`）。
  - **重大合规风险（关键发现）**：PolyForm Noncommercial 1.0.0 **禁止商业使用**。swarm-yuan 目标是"满足行业及国家质量/安全标准的研发范式 skill"，若生成物面向企业/商用场景，把 gitnexus 列为**默认首选**工具链存在许可证冲突。graphify（MIT）功能重叠度高且许可证干净。
  - **值得吸收**：PreToolUse/PostToolUse hooks 机制（搜索增强 + 过期索引检测）与 swarm-yuan 的门禁/hook 体系天然兼容；但**建议把 gitnexus 降级为"可选增强、非商用场景"，把 graphify 提为默认**，并在 self-check/安装文档中明示许可证差异（当前 `swarm-yuan/references/code-graph-tools.md:3` 未提示许可证风险）。

### 1.4 graphify（代码图谱）

- **理念**：AI 助手逐文件读代码、会话间失忆、看不到组件间关系——graphify 把"读文件"翻转为"建图再查询"（stop guessing, start traversing），给项目加一层**长期存活、可查询的知识图谱记忆层**。来源：https://graphify.net/ 、https://github.com/Graphify-Labs/graphify （访问 2026-07-20）。
- **核心功能**：Tree-sitter 本地 AST 解析（代码提取**零 LLM 调用**、零外发），40+ 语言；多模态摄入（代码/SQL schema/Markdown/PDF/图片/视频——非代码文件经用户自配模型提取语义）；NetworkX 建图 + Leiden 社区检测（无向量嵌入）；**God Nodes & Surprises**（最高度数"枢纽节点"识别 + 意外跨域连接标记）；产物 `graph.html`（交互）/`graph.json`/`GRAPH_REPORT.md`（审计报告）；`/graphify query|path|explain`；17–20+ 助手适配，always-on hook 注入 GRAPH_REPORT；`graphify hook-guard` 跨平台 hook 子命令；官方宣称 71.5× token 缩减。
- **设计原理**：代码是天然结构化域（AST/call graph/dependency tree），图比向量 RAG 更匹配；静态分析做确定性的"是什么"，LLM 只做语义的"为什么"；local-first、secure by design（输入校验、防 SSRF/注入/XSS）。
- **社区状态**：91,724 stars、MIT、Python 3.10+、活跃（2026-07-18）；npm graphifyy 0.10.0 / PyPI 0.9.20；Y Combinator S26 背书，企业版 early access；仓库已从 safishamsi/graphify 迁移至 **Graphify-Labs/graphify**（GitHub API 2026-07-20 实测；第三方报道 https://www.alphamatch.ai/blog/graphify-knowledge-graph-ai-coding-2026 ，访问 2026-07-20）。
- **与 swarm-yuan 的关系**：
  - **已吸收**：`graphify path/explain/query` 系统性提取签名与依赖链（`swarm-yuan/SKILL.md:78`、`README.md:134`）；hook-guard 子命令（`references/code-graph-tools.md:73-79`）；v0.9.13–v0.9.19 新能力已入册（`references/code-graph-tools.md:134`）。
  - **未吸收**：v0.10.0 新能力（基线停在 0.9.x）；**God Nodes & Surprises**（枢纽节点识别 → 可直接喂给 swarm-yuan 的"变更影响范围"左移门禁与框架深化阶段）；**GRAPH_REPORT.md 审计报告**（可作为 16 项特征卡生成的证据工件与 verifier/v1 验收输入）；多模态摄入（对含 PDF/图纸/文档的 brownfield 项目）。
  - **值得吸收**：①god-node 检测 → precheck.conf 增加"枢纽组件变更需额外评审"的可配置门禁；②GRAPH_REPORT 作为生成技能时的标准化"项目结构事实源"，减少 AI 自由发挥；③更新 `references/code-graph-tools.md:3` 的旧 org URL（safishamsi/graphify → Graphify-Labs/graphify）。

### 1.5 gsd-core（phase-loop / goal-backward）

- **理念**：GSD（Get Shit Done）——解决 **Context Rot**（上下文填满后代码质量渐降）是结构性问题而非提示词问题；用"每个执行单元 fresh 200K 上下文 + 原子提交 + goal-backward 验证"根治。来源：https://ccforeveryone.com/gsd 、https://somniosoftware.com/blog/spec-driven-development-in-practice-github-spec-kit-openspec-and-gsd-compared （访问 2026-07-20）。
- **核心功能**：`.planning/{PROJECT,REQUIREMENTS,ROADMAP,STATE}.md`；`/gsd:new-project`→`/gsd-execute-phase N`→`/gsd-verify`→`/gsd-quick`；wave 并行 subagent 执行（编排器只做协调不下场，主上下文保持 30–40%）；原子 git 提交（一任务一提交，git bisect 友好）；**goal-backward 验证**（不问"做了什么任务"，问"必须为真的是什么"，测可观测行为）；**plan-checker "Nyquist auditor"**——执行前校验每个任务都带自动化反馈命令（curl/测试调用），没有就打回 planner，最多三次；`gsd-tools` CLI 提供 workflow-context 加载。
- **设计原理**：编排器 lean、executor fresh；状态外置到 `.planning/`；验证对抗化（verifier 与实现者分离）。
- **社区状态（重大变迁）**：原仓 gsd-build/get-shit-done（TÂCHES / Lex Christopherson）64.8k stars，**2026-06-26 被 owner 归档只读**（仓库页面归档横幅 + GitHub API `archived=true`，2026-07-20 实测）；生态由 **open-gsd/gsd-core** 接续（6.9k stars、MIT、npm `@opengsd/gsd-core` 1.7.0，2026-07-20 活跃），定位为"可安装的 AI-runtime 工件 + 运行时引擎"（安装器而非 scaffolder）。另有 gsd-opencode、gsd-tdd（用测试替代 AI 验证器）、get-shit-done-trae 等分叉，方法论扩散中。来源：https://github.com/gsd-build/get-shit-done 、https://github.com/open-gsd/gsd-core 、https://github.com/SeMmyT/gsd-tdd （访问 2026-07-20）。
- **与 swarm-yuan 的关系**：
  - **已吸收**：phase-loop/goal-backward 入 `references/gsd-patterns.md`（`/gsd-verify` 对抗验证、wave 并行、`.planning/` 结构）；v1.7.0 的 Honest Verifier Abstain、Assumption-Delta Advisory Checkpoint 已入审查方法论（`references/review-methodology.md:339-361`）；安装/命令引用方式与"不复制源码"铁律一致（`references/gsd-patterns.md:3-5`）。
  - **未吸收**：Nyquist auditor 的"**无自动化反馈命令不执行**"硬门禁；fresh-context 配额（主上下文 30–40% 红线）的显式预算化；goal-backward 的"must-be-true 清单"工件格式。
  - **值得吸收**：①Nyquist 门禁与 swarm-yuan verifier/v1 天然同构——建议把"每个验收项绑定可执行检查命令，缺失即打回"写入 verifier/v1 的硬性规则；②GSD 上游已归档的事实说明**单作者范式项目存续风险高**，swarm-yuan 引用 gsd-core（有组织化 open-gsd 接班）是对的，但应在 self-check 中检测 gsd-tools 版本兼容性并记录基线。

### 1.6 claude-mem（跨会话记忆）

- **理念**：会话结束即失忆是 agent 的结构性缺陷；claude-mem 自动捕获工具使用观察、生成语义摘要、注入未来会话，实现"知识连续性"。来源：https://github.com/thedotmack/claude-mem （访问 2026-07-20）。
- **核心功能**：`npx claude-mem install`（Claude Code / Gemini CLI / OpenCode / OpenClaw）；**Progressive Disclosure**（分层记忆检索 + token 成本可见）；mem-search skill；Web Viewer（localhost:37777 实时记忆流）；**Citations**（观察带 ID，可引用 `observation/{id}`）；**`<private>` 标签**（敏感内容不入库）；Context Configuration（注入细粒度控制）；Beta Endless Mode；衍生 skills（learn-codebase/smart-explore/pathfinder/knowledge-agent/make-plan 等，见 claudeskill.me 中文市集，访问 2026-07-20）。
- **社区状态**：87,898 stars、**Apache-2.0**（README 明示选 Apache-2.0 是为便于嵌入企业系统）、JavaScript、活跃（2026-07-19）；npm 13.11.0（README 版本徽章 13.4.0 为 6 月快照，registry 已 13.11.0——迭代极快）（GitHub API + npm registry 2026-07-20 实测）。
- **与 swarm-yuan 的关系**：
  - **已吸收**：三路写回闭环（claude-mem/.zcode/memories/.project-knowledge.md），`claude-mem search → 文件检测`降级链（`swarm-yuan/SKILL.md:85`、`README.md:136`、`references/memory-persistence.md`）。
  - **未吸收**：progressive disclosure 的分层检索协议与 token 成本可见性；citation ID 的**可追溯引用**（swarm-yuan 记忆回写目前无 ID 溯源）；`<private>` 隐私标记；web viewer 的可观测性。
  - **值得吸收**：①citation ID 机制 → 让"记忆→生成→开发→记忆"闭环中每条回写可溯源，直接支撑质量标准的可追溯性要求；②`<private>` 标签 → 与 swarm-yuan security-spec 联动的最小成本隐私控制；③progressive disclosure → 缓解生成技能 references 体积膨胀的读取成本。版本迭代快（13.4→13.11 一个月内），引用方式宜保持"命令调用"而非锁定内部格式。

### 1.7 open-code-review / OCR（AI 代码审查）

- **消歧**：swarm-yuan 引用的是 **alibaba/open-code-review**（`references/review-methodology.md:3,87,91`）。另有同名 spencermarx/open-code-review（多代理审查团队），一并调研。
- **alibaba/open-code-review**：理念——"确定性流水线 + LLM Agent"混合架构，解决通用 AI 审查的覆盖不全、位置漂移、结果不稳三大病；经阿里巴巴规模实战。核心功能：`ocr review`（workspace/branch/commit）/`ocr scan`（全文件扫描）/`ocr llm test`；行级精确评论；内置精调规则集（NPE、线程安全、XSS、SQL 注入）；OpenAI & Anthropic 兼容；skill/plugin 形式接入 Claude Code/Codex/Cursor；GitHub Actions/GitLab CI；Go 实现。社区：10,707 stars、Apache-2.0、活跃（2026-07-17）。来源：https://github.com/alibaba/open-code-review （访问 2026-07-20）。
- **spencermarx/open-code-review**：理念——单次 AI 审查只有单一视角；OCR 模拟**可定制的工程师评审团队**（Principal/Quality 等多 persona 并行 + **Reviewer Discourse** 多轮讨论 + Final Synthesis 聚合）。核心功能：`ocr init/dashboard/progress`；`/ocr:review`（可带 `--team`、`--reviewer` 临时评审员、`Review against openspec/spec.md` 需求上下文）；`/ocr-map`（大变更集审查地图）；`/ocr-post`（发 PR 评论）；v2.1 用 Node 内置 SQLite 做会话持久化。社区：301 stars、Apache-2.0、TypeScript。来源：https://github.com/spencermarx/open-code-review （访问 2026-07-20）。
- **与 swarm-yuan 的关系**：
  - **已吸收**（alibaba 版）：5 维度/规则链/严重度分级（`references/review-methodology.md:3`）；gstack v1.58.5 + ocr v1.3.13 全量能力（同文件 :176-178）；v1.7.8→v1.7.12 扩展（Delegate 模式、W3C Traceparent、LiteLLM 网关、可恢复 session、路径遍历拒绝、结构化 category、Python 内置规则、composite PR-review Action 等，同文件 :311-385）；降级链 `ocr review → ocr scan → AI 5 维度`（`README.md:135`）。
  - **未吸收**：spencermarx 版的**多评审员并行 + discourse 聚合**机制（与 swarm-yuan 的 5 维度审查正交，可作 `--review` 的高配模式）；alibaba 版 v1.7.6+ 的 composite GitHub Action 尚未接入 swarm-yuan 生成项目的 CI 模板。
  - **值得吸收**：①reviewer discourse/聚合 → swarm-yuan `--review` 可增加"多 persona 对抗审查"档位；②composite action → 生成技能的项目 CI 模板一行接入 OCR，门禁从本地左移到 PR；③`Review against spec.md` 模式 → 与 swarm-yuan spec 门禁联动（审查锚定 spec 而非仅 diff）。

### 1.8 Ruflo（agent meta-harness）

- **理念**："Agent = Model + Harness"；Ruflo 是给 Claude Code/Codex 装"神经系统"的执行层——`npx ruflo init` 后 agent 自组织为 swarm、从每个任务学习、跨会话记忆、跨机器联邦通信。原名 Claude Flow（"Claude Flow is now Ruflo"），底层 Cognitum.One 架构 + Rust 引擎。来源：https://github.com/ruvnet/ruflo （访问 2026-07-20）。
- **核心功能**：314+ MCP 工具、26+ CLI 命令、35 插件（ruflo-swarm/autopilot/agentdb/rag-memory/ruvector/knowledge-graph/intelligence/goals/federation 等）；Queen-led 层级（Raft/Byzantine/Gossip 共识）；AgentDB + HNSW 向量记忆；SONA 自学习；27 hooks 自动路由；witness 验证（SHA-256 指纹 + Ed25519 签名 + 三层回归）；AIDefence 安全加固；Web UI（beta，flo.ruv.io）。
- **设计原理**：hooks 系统让"用户照常用 Claude Code，协调在后台发生"；学习闭环 Router→Swarm→Agents→Memory→Learning Loop。发布文化值得注意：release notes 含 "**Honest dimensions**"（公开承认 benchmark 缺陷，如 HNSW recall@10 实测 0.89 vs 文档 0.99、"150x-12,500x" 性能宣称被替换为实测数字）。来源：https://github.com/ruvnet/ruflo/releases （访问 2026-07-20）。
- **社区状态**：65,222 stars、MIT、TypeScript、活跃（2026-07-19）；npm 3.32.8；ruFlo Summit（2026-06 布达佩斯）显示社区运营活跃（GitHub API + npm registry 2026-07-20 实测）。
- **与 swarm-yuan 的关系**：
  - **已吸收**：v3.21.1 全量能力清单 + "须知道但可选引用"定位（`references/subagent-orchestration.md:275-322`，含与 superpowers/comet/claude-mem/gsd-core 的增强对照表）；v3.24/v3.25 方法论（shadow/canary 部署、anti-overfitting eval 纪律，`references/review-methodology.md:208-209`）；witness 思路对 `--stable-diff` 的增强建议已记录。
  - **未吸收**：3.21.1→3.32.8 之间约 11 个小版本的新能力未评估；GOAP A* 目标规划；federation 跨机协作；Web UI；35 插件体系中除已调研者外的部分。
  - **值得吸收**：①"Honest dimensions"发布文化 → swarm-yuan 的 verifier/v1 报告可制度化"已知缺陷公开"栏目，这是质量可信度的低成本高收益实践；②witness 三层回归（smoke + witness + temporal history）→ 加固 `--stable-diff` 从"改了没"到"字节匹配证明"；③版本漂移大，建议将 Ruflo 基线重核列入下一轮审计。

### 1.9 ECC（跨 harness 代理系统）

- **消歧**：此处为 affaan-m/ECC——从 "Everything Claude Code" 配置包演进为**跨 harness 代理操作系统**（cross-harness operating system for agentic work）。来源：https://github.com/affaan-m/ECC 、https://newreleases.io/project/github/affaan-m/ECC/release/v2.0.0 、https://www.augmentcode.com/learn/ecc-v2-cross-harness-agent-system （访问 2026-07-20）。
- **理念**：多 harness 配置漂移（两个 CLAUDE.md、两套规则渐行渐远）应收敛为单一安装、单一维护源；orchestrator 是**组合引擎而非重实现**（`orch-*` 命令是薄壳，执行委托给 `orch-pipeline`）。
- **核心功能**：v2.0.0（2026-06 稳定版）= 261 public skills + 64 agents + 84 commands；**control-pane 基板**（本地只读 observability：session 指标、work-items 看板 ready/running/blocked/done）；**ecc.session.v1**（跨 harness session 适配器，统一"哪个 agent 在哪做什么"）；**ecc.mcp.v1 MCP inventory**（跨 harness 的 MCP 配置归一化视图 + 碎片化/漂移检测 + **secret redaction**，开发期即抓到真实 key 泄漏）；**worktree-lifecycle 服务**（确定性 merge-conflict 预测 + 并行 agent worktree 安全 GC）；**single-connector MCP 默认政策**（2026-06 审计后默认仅保留 chrome-devtools 一个 connector，其余六个转为 opt-in，见 docs/MCP-CONNECTOR-POLICY.md）；continuous-learning-v2（hook 捕捉 session → Haiku 提炼 atomic instinct）、eval-harness（pass@k）、autonomous-loops 等 skills。
- **社区状态**：231,304 stars、35,296 forks、MIT、JavaScript、极度活跃（2026-07-20）；268 贡献者含 @claude 与 @Copilot 两个 AI 账号（GitHub API 2026-07-20 实测；augmentcode 报道，访问 2026-07-20）。
- **与 swarm-yuan 的关系**：
  - **已吸收**：v2.0 编排方法论（orch-* 组合模式、worktree 8 状态生命周期、上下文经济学、状态回报契约扩展、control pane 只读观测，`references/subagent-orchestration.md:149-273`）；hook runtime governance（`references/code-graph-tools.md:81-83`）；审查方法论扩展（`references/review-methodology.md:211-213`）。
  - **未吸收**：**ecc.mcp.v1 inventory + secret redaction**；**single-connector MCP 默认政策**；worktree merge-conflict 预测；control pane 的 work-items 看板工件格式。
  - **值得吸收**（与"行业及国家安全标准"目标强相关）：①MCP 最小化默认政策——swarm-yuan 生成技能注册 MCP（`README.md:215` 自动注册 gitnexus/claude-mem/graphify 三个）应采用同样的"默认最小 + opt-in + 每 connector 书面理由"政策；②MCP inventory 的漂移检测 + secret redaction → 可成为 precheck 的一条安全门禁；③worktree 冲突预测 → 多代理并行生成时的确定性保护。

---

## 2. 同类研发范式产品调研

### 2.1 GitHub spec-kit

- **理念/功能**：GitHub 官方 SDD 工具包（2025-09-02 发布，作者 Den Delimarsky）；"规格即 source of truth、权力倒转到 spec"；Python CLI `specify`，`constitution → /speckit.specify → clarify → plan → analyze → tasks → implement` 七命令流水线；`.specify/` + `specs/` 结构；30+ agent 适配、vendor-neutral；v0.5.0（2026-04）演进为"可扩展平台"，Claude Code 成为原生 skill。
- **设计原理**：artifact scaffold——产出入库的 spec/plan/tasks 文件，只管"输入与检查点"，不管 agent 怎么写代码；与 Superpowers 是互补的两半（planning artifacts vs execution habits），可叠加不冲突。
- **社区状态**：122,437 stars、MIT、Python、活跃（GitHub API 2026-07-20 实测）；但官方自述 experimental。已知批评：刚性阶段门、"markdown 海洋"、对 brownfield/遗留改造弱（Scott Logic 评测与 HN 讨论，见 https://codemyspec.com/blog/openspec-vs-spec-kit 引述，访问 2026-07-20）。
- **关键事实**：第三方对比明确指出 spec-kit 的 clarify/analyze 仅为 advisory、**无内置验证（Verification: None）、质量门禁仅靠约定**（https://codemyspec.com/blog/openspec-vs-spec-kit ，访问 2026-07-20）。
- **对 swarm-yuan 的启示**：spec-kit 的 constitution.md 与 swarm-yuan 16 项特征卡同构（项目"宪法"），但 spec-kit 无执行强制——swarm-yuan 的 27 脚本门禁正是行业空白点（见 §3）；spec-kit 的 30+ agent 适配矩阵值得 swarm-yuan 输出端借鉴。

### 2.2 BMAD-METHOD

- **理念/功能**：Breakthrough Method for Agile AI-Driven Development——把 AI 组织成**专职 agent 团队**（Analyst/PM/Architect/Scrum Master/Dev/QA-TEA/UX），两大创新：Agentic Planning（前置产出 Product Brief/PRD/架构文档作为 source of truth）+ Context-Engineered Development（SM 把计划转成超详细 story 文件，Dev agent 开箱即有全上下文）。v6 beta：34+ workflows、scale-domain-adaptive（按项目复杂度/域自动调节规划深度）、`/bmad-help` 上下文引导、Quick Flow（`/quick-spec→/dev-story→/code-review`）与 Full Planning 双路径；模块化：BMM 核心 + **TEA（Test Architect：风险驱动测试策略、quality gates、release gates、NFR 评估，8 workflows/34 测试模式）** + BMGD 游戏 + CIS 创意 + BMB 构建器。
- **社区状态**：50,829 stars、License 为 NOASSERTION（第三方资料称 MIT，需人工核实 LICENSE 文件）、JavaScript、活跃（2026-07-19）；Discord 5k+；已有 Elixir 等语言移植（GitHub API 2026-07-20 实测；https://www.charterglobal.com/bmad-method-ai-driven-software-development/ ，访问 2026-07-20）。
- **对 swarm-yuan 的启示**：BMAD 的 TEA 模块与 swarm-yuan 的 shift-left 门禁（测试设计/变更影响/可观测性左移）方向一致，且 TEA 把"release gate/NFR"显式化——swarm-yuan 的 verifier/v1 可借鉴其风险分级与 NFR 评估清单；scale-domain-adaptive 与 swarm-yuan 框架深化（58 框架三件套）异曲同工，但 BMAD 靠 persona 引导、swarm-yuan 靠规则+门禁，后者更接近"标准合规"叙事。

### 2.3 SuperClaude Framework

- **理念/功能**：Claude Code 的**元编程配置框架**——"behavioral instruction injection + component orchestration"；v4.3.0 = 30 slash commands + 20 specialized agents + 7 behavioral modes + 8 可选 MCP 集成；PyPI `superclaude`（pipx 安装）+ npm wrapper；dotfiles 式工作流层，无自有模型、无状态机、无门禁；TypeScript 插件系统延至 v5.0。
- **社区状态**：23,577 stars、MIT、Python；最近 push 2026-06-13，相对平缓（GitHub API 2026-07-20 实测；https://vibecodinghub.org/blog/superclaude-review ，访问 2026-07-20）。
- **对 swarm-yuan 的启示**：SuperClaude 证明纯 prompt 层的角色/模式注入天花板明显（无验证、无持久状态）；swarm-yuan 的"特征卡立法 + 门禁执法 + 状态机司法"三层结构是相对 SuperClaude 类框架的核心差异化，应在对外叙事中显性化。

### 2.4 AWS 阵营：Kiro 及 AI 研发工具链

- **Kiro**：AWS 的 spec-driven IDE/CLI（Code-OSS 基座；kirodotdev/Kiro 仓 4,044 stars，2026-06-22，CLI 部分开源；GitHub API 2026-07-20 实测）。核心机制：`.kiro/specs/`（**EARS 记法**需求：Easy Approach to Requirements Syntax——WHEN/IF/WHILE/WHERE + SHALL）、design.md、tasks.md 三件套；**steering files**（`.kiro/steering/*.md`，inclusion: always/fileMatch/manual 三种注入策略）；**Agent Hooks**（事件驱动自动化：保存文件→跑测试/更新文档等）；模型经 Bedrock、计量 credits 收费（$0/$20/$40/$200 档）；定位为 Amazon Q Developer 的继任者。来源：https://codemyspec.com/blog/spec-kit-vs-kiro 、https://productbuilder.net/learn/spec-driven-development （访问 2026-07-20）。
- **对 swarm-yuan 的启示**：①EARS 记法是需求表述的成熟行业惯例，swarm-yuan spec 模板（已用 OpenSpec 的 SHALL/MUST + WHEN/THEN）与 EARS 基本兼容，可在 template-spec 中显式声明对齐 EARS 以增强标准叙事；②steering 的三档注入策略（always/fileMatch/manual）可细化 swarm-yuan 生成 skill 的 rules 加载；③Agent Hooks（事件→自动动作）与 swarm-yuan precheck/状态机可互补——hooks 管"过程"，门禁管"出口"。

### 2.5 Cursor / Aider 规则系统（及跨工具规则标准化）

- **Cursor Rules**：`.cursor/rules/*.mdc`（MDC = Multi-Document Context），frontmatter 支持 `description/globs/alwaysApply`；规则即"持久的系统提示"，团队契约应入库共享；旧式 `.cursorrules` 已淘汰。来源：https://github.com/ryosuke-horie/cursor_rules_research/blob/main/mdc_file_conventions.md 、https://www.frenxt.com/cables/cursor/cursor-team-rules （访问 2026-07-20）。
- **Aider**：`CONVENTIONS.md`（`--conventions-file` 可自定义），最工具无关；社区正推动 **AGENTS.md 统一标准**（agent-rules.org，一份根目录 Markdown 供所有 agent 读取，Aider issue #4363 讨论，访问 2026-07-20）。
- **Claude Code**：`CLAUDE.md` + `.claude/rules/`（按文件 pattern 加载，250 词以内规则 + skill 指针的三层体系，https://www.groff.dev/blog/claude-rules-vs-claude-md ，访问 2026-07-20）。
- **跨工具生成器**：ai-rulez——`.ai-rulez/` 写一次，`generate` 产出 19 个平台的原生配置（https://github.com/Goldziher/ai-rulez ，访问 2026-07-20）。
- **对 swarm-yuan 的启示**：swarm-yuan 生成的 skill 目前以 Claude 生态为主，可借鉴 ai-rulez 的"write-once-generate-many"，把 16 项特征卡同时渲染为 CLAUDE.md / .cursor/rules/*.mdc / AGENTS.md / CONVENTIONS.md——这是低成本扩大适用范围、也是"行业标准兼容"叙事的一部分。

---

## 3. 同类范式对比矩阵

| 维度 | **swarm-yuan** | **GitHub spec-kit** | **BMAD-METHOD** | **SuperClaude** |
|---|---|---|---|---|
| **定位** | 研发范式**元技能生成器**：对任意 repo 生成项目专属 skill（立法+执法+司法三层） | SDD 脚手架 CLI：spec/plan/tasks 工件 + 阶段流水线 | 敏捷 AI 团队框架：专职 persona + 规划文档栈 + story 驱动 | Claude Code 配置框架：命令/角色/模式注入 |
| **特征卡机制** | **16 项特征卡（认知 DNA）**，机械枚举+签名提取+计数验证（`swarm-yuan/SKILL.md:3`） | constitution.md（项目宪法，单项、自由文本） | 无特征卡；有 21 agent personas + scale-domain-adaptive 规划深度 | 无；7 behavioral modes + 20 agents |
| **门禁机制** | **27 个脚本质量门禁**（precheck.sh，2,667 行，含 shift-left 左移）+ 58 框架门禁三件套注入 | **无强制**（clarify/analyze 仅 advisory；第三方实测 Verification: None） | TEA 模块：风险驱动 quality/release gates + NFR 评估（流程约定 + git hooks） | **无** |
| **多代理编排** | superpowers subagent + ECC orch-* 组合 + Ruflo 可选增强 + Dynamic Workflow 扇出 | 无（单 agent 按 tasks 执行） | persona 顺序交接 + Party Mode 多角色同席 | 角色注入式（单会话内切换） |
| **状态机/断点恢复** | comet 风格脚本背书状态机（state-machine.sh） | 无 | STATE/roadmap 文件态，弱恢复 | 无 |
| **跨会话记忆** | claude-mem 三路写回闭环 | 无 | 文件态文档链 | 无 |
| **代码图谱支撑** | gitnexus/graphify 系统性盘点+三层调用链 | 无 | 无 | 无 |
| **标准合规支持** | security-spec（OWASP/STRIDE/CWE）+ verifier/v1 验收 + 目标对齐行业/国标（本轮升级方向） | 无 | TEA 的 NFR/风险评估（部分） | 无 |
| **实施方式** | bash 生成器 + 引用调用 11 运行时（不重实现铁律） | Python CLI + Markdown 模板 | npm 安装器 + Markdown 工作流 | PyPI 配置包 |
| **社区状态** | 项目内部（未开源或早期） | 122.4k stars，MIT，experimental 自述 | 50.8k stars，license 待核实 | 23.6k stars，MIT |
| **主要短板** | 沉睡门禁/fail-open/文档漂移（已知审计问题）；版本基线漂移；GitNexus 许可证风险 | 刚性、重文档、brownfield 弱、无验证闭环 | 重流程、token 开销大、门禁靠自觉 | 纯 prompt 层、无验证无状态 |

矩阵证据：spec-kit/BMAD/SuperClaude 行数据来源见 §2 各节 URL（均访问 2026-07-20）；swarm-yuan 行数据来源：`swarm-yuan/SKILL.md:3,71-108`、`README.md:100,134-136,203,215`、`docs/2026-07-20-audit-optimization-decisions.md`。
补充三方共识证据：2026-02 的四 harness 交叉分析（Superpowers/ECC/Agent-Orchestrator/Maestro）指出——worktree 是通用隔离原语；**"质量门禁的规模化强制在该四 harness 样本中未见强制闭环"（"instructed to verify" vs "proven to have verified" 的鸿沟在该样本中普遍存在）**；成本治理普遍欠发达。来源：https://gist.github.com/jeffscottward/de77a769d9e25a8ccdc92b65291b1c34 （访问 2026-07-20）。"全行业未解"是修辞化表述，严谨说法是"本轮调研样本（4 同行 + 4 harness）中未见"——样本规模有限，不排除存在未调研的同类实现。swarm-yuan 的脚本门禁恰好落在该样本空白带上，这是其标准化故事的可讲述支点之一，但非"行业唯一解"。

---

## 4. 横向发现与对 swarm-yuan 的总启示

### 4.1 必须处理的风险项

1. **GitNexus 许可证冲突（最高优先）**：PolyForm Noncommercial 1.0.0 禁止商用（LICENSE 原文实测，2026-07-20）。swarm-yuan 把 gitnexus 列为工具铁律之首（`swarm-yuan/SKILL.md:108`）、组件盘点首选（`README.md:61`）。若目标场景含企业/商用，违反许可证即违反合规底线。建议：graphify（MIT，91.7k stars）提为默认，gitnexus 降级为"非商用可选增强"，并在 `references/code-graph-tools.md` 与 self-check 中明示。
2. **版本基线漂移（中优先）**：comet 0.3.9→0.4.0-beta.5；Ruflo 3.21.1→3.32.8；graphify 0.9.x→0.10.0；claude-mem 13.4→13.11。建议在 self-check 或 precheck 中加入"上游基线版本"登记与偏差告警（与已知"文档漂移"问题同源）。
3. **GSD 上游归档（已应对但需制度化）**：gsd-build/get-shit-done 2026-06-26 归档。swarm-yuan 引用 open-gsd/gsd-core 是正确选择，但应把"上游存续监测"纳入审计例程——11 个运行时中个人项目占比高（comet/GitNexus/claude-mem/gsd-core 均为个人或小团队项目）。
4. **BMAD-METHOD 许可证 NOASSERTION**：GitHub 无法识别其许可证，第三方称 MIT——若未来考虑借鉴/兼容，先人工核实 LICENSE 文件。

### 4.2 值得吸收的机制清单（按优先级）

| 优先级 | 机制 | 来源 | 落在 swarm-yuan 的位置 |
|---|---|---|---|
| P0 | "无证据不流转"硬前置（verification_report 存在 + branch 已处理才放行） | comet-guard.sh | 27 门禁/状态机出口（治 fail-open 与沉睡门禁） |
| P0 | Nyquist auditor：每个任务必须绑定自动化反馈命令，缺失打回（≤3 次） | gsd-core plan-checker | verifier/v1 验收体系 |
| P0 | MCP 默认最小化 + 逐 connector 书面理由 + inventory 漂移检测/secret redaction | ECC v2.0（2026-06 审计产物） | 生成技能的 MCP 注册政策 + precheck 安全门禁 |
| P1 | PreToolUse 写保护（非 build 阶段禁写代码） | comet-hook-guard.sh | 状态机过程管控 |
| P1 | God Nodes & Surprises（枢纽节点识别 → 变更影响门禁） | graphify v0.10.0 | shift-left 变更影响门禁 + 框架深化 |
| P1 | handoff SHA256 上下文包 + 阶段产物溯源链 | comet-handoff.sh | 特征卡→references→门禁注入的可追溯性 |
| P1 | citation ID + `<private>` 标签 | claude-mem 13.x | 记忆三路写回的溯源与隐私 |
| P2 | "Honest dimensions"（发布即公开已知缺陷/benchmark 实测） | Ruflo release 文化 | verifier/v1 报告模板 |
| P2 | witness 三层回归（smoke+witness+temporal） | Ruflo | `--stable-diff` 增强 |
| P2 | 多评审员 discourse 聚合审查 | spencermarx/open-code-review | `--review` 高配档 |
| P2 | composite PR-review GitHub Action | alibaba OCR v1.7.6+ | 生成项目 CI 模板 |
| P2 | EARS 记法对齐声明 + steering 三档注入（always/fileMatch/manual） | AWS Kiro | spec 模板标准叙事 + rules 加载策略 |
| P3 | write-once-generate-many（19 平台规则渲染） | ai-rulez 思想 | 生成 skill 的输出端多平台化 |
| P3 | GRAPH_REPORT.md 作为项目结构事实源 | graphify | 特征卡生成证据工件 |

### 4.3 范式层面的判断

1. **SDD 正在"溶解进默认循环"**：Cursor/Devin/Kiro/Antigravity 都内置 plan-before-code；spec 的价值正从"生成代码"扩展到"运行时诊断与多 agent 合同"（https://productbuilder.net/learn/spec-driven-development ，访问 2026-07-20）。swarm-yuan 的差异化不在"也有 spec"，而在**spec→特征卡→脚本门禁→验收**的强制闭环。
2. **"约定 vs 强制"是分水岭**：spec-kit 与 OpenSpec 都停留在 convention（官方与第三方均确认无验证强制，https://codemyspec.com/blog/openspec-vs-spec-kit ，访问 2026-07-20）；在本轮调研样本（4 同行 + 4 harness）中未见门禁强制闭环（§3 gist 证据）。swarm-yuan 的 27 门禁 + 状态机 + verifier/v1 组合在本轮调研样本中，是唯一以"立法-执法-司法"隐喻自述且提供独立验证器的范式——对标行业/国家质量标准时（如 ISO/IEC 25010:2023 产品质量模型、ISO/IEC 42001:2023 AI 管理体系、GB/T 25000.51-2016 就绪软件质量要求，标准号+年号供立项参考，条款级映射需另行专项），这一闭环是最可讲述的资产，但"唯一"限于本轮样本与该隐喻定义，不排除存在未调研的同类实现。前提是先治好自身的 fail-open 与沉睡门禁。
3. **生态位互补而非替代**：OpenSpec（轻 SDD）/ comet（流程强制）/ gsd-core（执行验证）/ superpowers（行为习惯）可叠加（spec-kit×superpowers 叠加已被社区验证不冲突，https://vibecoding.app/blog/spec-kit-review ，访问 2026-07-20）。swarm-yuan 的"引用调用不重实现"铁律（`swarm-yuan/SKILL.md:108`）与该趋势同向，应保持；代价是必须制度化版本基线跟踪与许可证审查。

---

*（本报告全部网络数据访问于 2026-07-20；stars 等动态数据以 GitHub API 当日实测为准，后续引用请注明该日期。）*
