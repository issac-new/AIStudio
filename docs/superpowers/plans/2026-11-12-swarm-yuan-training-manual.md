# swarm-yuan 培训手册实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 swarm-yuan 研发指南重构为一份面向新手、包含产品介绍、技术设计、操作使用、贯穿案例和验收考核的完整中文培训手册。

**Architecture:** 保留 `docs/manuals/aistudio-swarm-yuan-developer-guide.md` 作为唯一手册正文，以当前脚本和设计 README 为事实源，以 spec 约束内容与证据边界。文档登记、正文重写、机械验证和独立审读分步完成，不修改交互课件或产品代码。

**Tech Stack:** Markdown、Mermaid、Bash、Node.js 文档索引脚本、Vitest。

**Spec:** `docs/superpowers/specs/2026-11-12-swarm-yuan-training-manual-design.md`

## Global Constraints

- 当前 swarm-yuan 版本写为 v2.100.3，依据 `RELEASE-MANIFEST.json` 与 `skills/swarm-yuan/CHANGELOG.md`。
- 默认安装与生成落点采用当前 `~/.agents/skills` 规则；项目内既有技能目录仍优先复用。
- 所有易变数字引用 `skills/swarm-yuan/assets/facts.conf`，历史案例数字必须标明版本与证明范围。
- 每个实操步骤包含“做什么、怎样解释、完成标志、失败处置、留存证据”。
- 不修改 `docs/manuals/aistudio-interactive-training.html`、其他交互课件、`vendor/**` 或产品代码。
- 不新增截图、PDF、离线包或其他二进制资产。
- 未实际执行的安装、生成、真实项目和模型操作不得写成本轮实测。

## Review Focus

- **旧口径混入正文**：默认目录、precheck 是否遇错即停、everything 是否完全断网自足最容易写错；Task 2 的内容断言和 Task 3 的源码抽核负责拦截。
- **技术正确但新手不会做**：若只有概念表而没有操作前后状态，读者无法执行；Task 2 的五字段检查和 Task 4 的新手审读负责拦截。
- **历史证据冒充当前实测**：R143/R118 数据只能按历史案例引用；Task 2 的版本标注检查与 Task 4 的证据审查负责拦截。
- **为通俗而删掉限制条件**：strict、返回码、降级、fail-open、外部有效性等边界必须保留；Task 3 的必备主题检查负责拦截。
- **文档链接和计数漂移**：新 spec 未登记或行号失效会破坏追溯；Task 1 的索引生成与 Task 3 的链接检查负责拦截。

---

### Task 1: 登记设计 spec 与实施计划

**Files:**
- Create: `docs/superpowers/specs/2026-11-12-swarm-yuan-training-manual-design.md`
- Create: `docs/superpowers/plans/2026-11-12-swarm-yuan-training-manual.md`
- Modify: `.qgate/scope.yaml`
- Modify: `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`
- Modify: `docs/manuals/aistudio-design-document-index.md`

**Interfaces:**
- Consumes: 用户已批准的方案 A 与设计 spec。
- Produces: 可被文档索引、范围门和后续实施共同引用的 spec 路径。

- [ ] **Step 1: 将本批文件加入范围清单**

在 `.qgate/scope.yaml` 登记两个新文档、现有手册、附录 A 与机械索引；不移除其他任务已有条目。

- [ ] **Step 2: 在附录 A 添加一条人工摘要**

摘要写明“单文件培训手册＝产品定位＋六层设计＋安装/生成/激活/研发/更新操作＋trade-forge 案例＋五步教学与证据边界”，并同步该文件标题或计数行，具体值按文件系统实际数量计算。

- [ ] **Step 3: 重建机械索引并检查**

Run: `node scripts/maintenance/gen-doc-indexes.mjs --write && node scripts/maintenance/gen-doc-indexes.mjs --check`
Expected: 新 spec 出现在 2026-11 索引，输出 `0 problem(s)`。

- [ ] **Step 4: 提交设计与登记**

```bash
git add .qgate/scope.yaml docs/superpowers/specs/2026-11-12-swarm-yuan-training-manual-design.md docs/superpowers/plans/2026-11-12-swarm-yuan-training-manual.md docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md docs/manuals/aistudio-design-document-index.md
git commit -m "docs(swarm-yuan): 登记培训手册设计与实施计划"
```

### Task 2: 重写完整培训手册

**Files:**
- Modify: `docs/manuals/aistudio-swarm-yuan-developer-guide.md`
- Modify: `docs/superpowers/specs/2026-11-12-swarm-yuan-training-manual-design.md`（用户补充的五项核心逻辑）
- Modify: `docs/superpowers/plans/2026-11-12-swarm-yuan-training-manual.md`（同步实施与验收要求）

**Interfaces:**
- Consumes: Task 1 的 spec；当前 `skills/swarm-yuan/README.md`、`SKILL.md`、脚本、facts 与有效历史案例。
- Produces: 单一培训正文，供现有 `docs/README.md` 入口和后续审读使用。

- [ ] **Step 0: 以研发人员能力的 SOP 化为总主线**

把用户补充的五项核心逻辑贯穿全文：标准研发能力、个性化研发能力、本体化组织资产、最小单元质量与拼装流水线、独立全面检查。产品开篇给出能力形成链和图，技术设计给出五项到机制、实物、检查与证据的映射，操作、案例和考核均可回指，不只写一句口号。

- [ ] **Step 1: 建立新手导读与产品结构**

写明读者、学习目标、建议授课路径和验证范围。用“生成器→目标技能→日常研发→反馈更新”的生命周期图解释产品，列出适用、不适用和能力边界。

- [ ] **Step 2: 编写技术设计章**

按认知、规范、装配、使用、验证、成长六层展开；每层给出输入、处理、输出、实物文件和检查。补六段目录、Step 1–13、strict 激活、九节点、四阶段、precheck、状态机、L1–L4、测试与独立验证、ACP 证据链。

- [ ] **Step 3: 编写操作使用章**

依次覆盖环境准备、安装、生成与填充、激活、每个需求的操作、门禁判读、常见失败、反馈更新和离线安装。每一步包含五字段，命令代码块可复制，写操作与只读检查分开标识。

- [ ] **Step 4: 编写贯穿实训、考核和附录**

使用 trade-forge 订单编辑与双故障注入串起生成、研发、验证和更新；另给 `tests/e2e/run-fieldchange-e2e.sh` 作为合成练习入口。增加学员实操作品、讲师验收表、命令速查、术语表、事实源索引和未验证项。

- [ ] **Step 5: 做内容自检**

确认正文含 v2.100.3、`~/.agents/skills`、Step 1–13、九节点、四阶段、六层、L1–L4、strict、gate-runs、SCHEMA_EPOCH、trade-forge、R134、外部有效性边界；不得出现“默认生成到项目 `.agents/skills`”“precheck 首个 FAIL 即停”“everything 完全断网装齐”等错误表述。

- [ ] **Step 6: 提交手册正文**

```bash
git add docs/manuals/aistudio-swarm-yuan-developer-guide.md
git commit -m "docs(swarm-yuan): 重写产品技术与操作培训手册"
```

### Task 3: 执行文档与技能验证

**Files:**
- Modify: `docs/superpowers/specs/2026-11-12-swarm-yuan-training-manual-design.md`（只回填真实验证结果）

**Interfaces:**
- Consumes: Task 2 的完整手册。
- Produces: 可复核的命令结果、失败说明和未验证项。

- [ ] **Step 1: 检查格式、空白和文档索引**

Run: `git diff --check && node scripts/maintenance/gen-doc-indexes.mjs --check`
Expected: 两条命令退出 0；若暴露既有问题，区分本批引入与既有缺陷并如实记录。

- [ ] **Step 2: 检查 Markdown 本地链接和文件行号锚点**

用隔离的 Node 或 Python 脚本只读扫描手册：相对链接解析到工作树内真实文件；`path:line` 或 `path:start-end` 不超过目标文件行数；Mermaid 代码块成对闭合。检查五项 SOP 核心逻辑均有定义、机制映射和至少一个操作或实训锚点。不得把未检查写成通过。

- [ ] **Step 3: 运行相关 Vitest 守门**

Run: `npx vitest run custom/__tests__/docs-ssot-guard.test.ts custom/__tests__/interactive-training-manual.test.ts scripts/__tests__/sync-training-docs.test.ts`
Expected: 退出 0。若工作树缺依赖，按仓库 N-4 配方建立最小链接后重跑，不执行大规模依赖安装。

- [ ] **Step 4: 运行 swarm-yuan 自检**

Run: `bash skills/swarm-yuan/scripts/self-check.sh --check-only`
Expected: 退出 0；如失败，记录完整失败摘要，不通过修改产品源码消红。

- [ ] **Step 5: 回填验证记录**

在 spec 的验证节追加实际命令、结果和未验证项；不得补写未运行命令的成功记录。

### Task 4: 独立审读与收口

**Files:**
- Modify: `docs/manuals/aistudio-swarm-yuan-developer-guide.md`
- Modify: `docs/superpowers/specs/2026-11-12-swarm-yuan-training-manual-design.md`

**Interfaces:**
- Consumes: Task 2 正文和 Task 3 验证证据。
- Produces: 经独立审读的最终手册与交付说明。

- [ ] **Step 1: 独立审读**

安排未撰写正文的审查者按四类检查：技术事实与源码一致性、章节衔接、新手可执行性、证据与未验证边界。要求每个发现引用手册行号和权威来源。

- [ ] **Step 2: 主会话复核并修正**

只接受有证据的发现；修复后重跑 Task 3 Step 1–4。未采纳项记录理由，不为了“零意见”做无依据改写。

- [ ] **Step 3: 最终差异审查**

Run: `git diff --stat origin/main...HEAD && git diff --check && git status --short`
Expected: 差异仅含本批文档与台账；没有 `IN-FLIGHT`、`vendor/**`、运行态、缓存或二进制文件进入提交。

- [ ] **Step 4: 提交审读修正并交付**

```bash
git add docs/manuals/aistudio-swarm-yuan-developer-guide.md docs/superpowers/specs/2026-11-12-swarm-yuan-training-manual-design.md
git commit -m "docs(swarm-yuan): 完善培训手册审读与验证记录"
```

交付说明按“结论→改动文件→验证命令与结果→未做/未验证项”输出。未经用户另行授权，不推送远端、不合并 main、不删除工作树。
