# 独立审查协议与活文档漂移（EGM 吸收批）

> 日期: 2026-11-19
> 状态: 草案
> 关联: google/elephant-goldfish-model 调研（Apache-2.0，commit 见附录）；swarm-yuan 现有 doubt 协议、subagent 编排、review-methodology

## 变更

### 问题

swarm-yuan 已有独立审查的原料，但没有接成一条强制链，存在四个可复现的假通过面：

1. **独立性未接线**：`subagent-orchestration.md:47-53` 规定子代理新上下文，`agent-skills-methodology.md:190-196` 有 doubt 协议（只给 ARTIFACT+CONTRACT、不给 CLAIM），但节点⑦/Step 11 的审查门不引用它们；`gates-strict.sh:3304-3316` 只查评审人/日期/结论，不查评审人是否独立。
2. **无理解度审查**：现有五维只查对错/安全/性能/维护/测试，没有"新人能否读懂"这一独立判据。
3. **无反谄媚约束**：全仓无禁用词表、无"先讲问题"、无反方论据要求；`agent-skills-methodology.md:194` 仅一句 "Do NOT validate"。
4. **降级冒充**：无子代理时降级为同上下文自我审问并标 degraded（`agent-skills-methodology.md:196`），与"独立审查"语义冲突，且门禁无法区分。

另有两个过程资产缺口：大段草稿仍可进聊天窗口（`context-engineering-layering.md:189-191` 只说持久产物不压缩，没有聊天禁令）；文档内容漂移无检测手段（`project-fingerprint.sh` 只做结构指纹，且 `:247` 把目录 cksum 变化标成"内容变化"）。

### 范围（B 档＋分层停机）

吸收 google/elephant-goldfish-model 的四条主线：冷读隔离、失败不降级、产物落盘、文档漂移闭环。不做 C 档三项（技能场景夹具与覆盖度门、多宿主安装副本一致性、8 评审角色映射），挂账后续批。

### 文件清单

新增：

- `skills/swarm-yuan/references/independent-review-protocol.md`：三角色契约、冷读输入白/黑名单、四阶段审查、反谄媚词表、收敛语义、分层停机阶梯、留痕字段。
- `skills/swarm-yuan/references/living-docs-drift-methodology.md`：文档断言 vs 源码事实的四类漂移、比对程序、报告格式、触发点、与指纹/知识生命周期的分工。
- `skills/swarm-yuan/assets/drift-report-template.md`：漂移报告模板。
- `skills/swarm-yuan/tests/test-review-protocol.sh`：协议守门测试（模板字段、禁词、not-run 与 clean 矛盾、缺字段拦截）。

修改：

- `skills/swarm-yuan/assets/review-record-template.md`：新增评审上下文、冷读输入清单、阶段完成表、理解度结论、收敛声明、禁词自检、未运行项。
- `skills/swarm-yuan/assets/gates-strict.sh`：`check_review` 第二段扩展机检（`REVIEW_RECORD_REQUIRED=1` 时核验新字段；禁词命中 fail；not-run 与 clean 矛盾 fail；默认仍 warn）。
- `skills/swarm-yuan/references/review-methodology.md`：文件头路由到新协议；五维清单降为 S3 内容检查表；补反谄媚与 not-run；修悬空引用 `references/review-record.md`。
- `skills/swarm-yuan/references/subagent-orchestration.md`：审查类活动必须冷读；无子代理停机阶梯；not-run 记账与连续两轮 clean；连续执行与 spec 分节停顿时例外。
- `skills/swarm-yuan/references/generation-flow.md`：Step 11 按新协议执行并留痕。
- `skills/swarm-yuan/references/template-spec.md`：节点⑦审查口径；节点③ spec 起草的分节停顿与产物落盘。
- `skills/swarm-yuan/references/context-engineering-layering.md`：Artifact-First 总则（聊天只回路径＋决策＋请审阅）。
- `skills/swarm-yuan/references/knowledge-lifecycle-methodology.md`：内容漂移路由到新方法论。
- `skills/swarm-yuan/SKILL.md`：工作原则增 Artifact-First；九节点⑦审查口径；反馈回路增漂移报告；参考文档路由表登记两档。
- `skills/swarm-yuan/scripts/project-fingerprint.sh`：`--diff` 措辞改为"路径集/结构变化"，并指向内容漂移方法论。
- 登记与计数：`assets/facts.conf`（FACT_REFERENCES 61→63）、`assets/registry/references.tsv`（+2 行）、`assets/registry/dist.tsv`（+3 行）、`references/capability-map.md`（+2 行）、`tests/test-doc-numbers.sh`（61→63）、`tests/index.tsv`（+1 测试）。
- `skills/swarm-yuan/README.md`：§3.5 审查小节、§3.6 漂移小节、附录 B 来源登记。
- `skills/swarm-yuan/CHANGELOG.md`：v2.101.0 条目。

### 验收判据

1. `bash skills/swarm-yuan/tests/test-review-protocol.sh` 全绿：合规记录通过；缺评审上下文、缺阶段完成表、禁词命中、not-run 却声明 clean 四类反例逐个被拦。
2. `bash skills/swarm-yuan/scripts/self-check.sh --check-only` 无 G25/计数红。
3. `bash skills/swarm-yuan/tests/test-doc-numbers.sh` 绿（FACT_REFERENCES=63 与实际计数一致）。
4. `bash skills/swarm-yuan/tests/run-sweep.sh` 中新增测试计入并通过；其余测试无新增失败。
5. `npx vitest run custom/__tests__/l2-kit-parity.test.ts` 绿（未改 L2 判定库与钩子）。
6. 打样一次：用一个含"not run"与禁词的假审查记录跑 `precheck.sh --review`，确认默认 warn、`REVIEW_RECORD_REQUIRED=1` 时 fail 且报错可读。

## 决策记录

### D1 吸收范围取 B 档

- 依据：A 档只补审查链，漂移闭环是"技能随项目生长"承诺的兑现；C 档两项属工程加固，不改变机制有效性，且会新增脚本/门须登记机制预算 sunset。
- 代价：本轮不改场景夹具与安装一致性，留作后续批。

### D2 无子代理时分层次停机

- 审查类（节点⑦、Step 11、spec/plan 评审）无子代理 → 停机，记 `not run`，门禁不得通过；用户显式豁免须落 `decisions.jsonl` 的 UserChallenge。
- 非审查类并行（探查三路、互不依赖的多文件实施）可内联执行，但必须标 `degraded` 并在交付说明披露。
- 依据：EGM `skills/egm-review/SKILL.md:28` 与 `egm-bootstrap/SKILL.md:35` 的边界——bootstrap 允许内联 scout，review 必须停。

### D3 三角色分离：作者 / 冷读审阅者 / 裁决人

- 冷读审阅者只拿文档路径、被引用源码路径、审查标准；禁止会话历史、作者推理、先前结论。
- 审阅者不参与起草；裁决人不由 AI 代替。

### D4 四阶段而非照搬五阶段

- S1 全局审视、S2 理解度审查、S3 设计批判（含五维清单）、S4 实现就绪；EGM 的第二次全局审视并入 S3 复审模式（只审增量，不重开 settled 决策）。
- 依据：swarm-yuan 已有五维清单与五轮修复环，增加两个阶段而不是再建一套并行体系。

### D5 反谄媚词表可机检

- 中英双语禁用词：brilliant/great/smart/correct/perfect/excellent/spot-on/seamless/robust/blazingly fast/seamlessly/effortlessly/literally/drastically/obviously；完美/优秀/很棒/非常正确/天衣无缝/无缝/健壮/极快/显然/毫无疑问。
- 结构规则：findings 在前；零发现写"未发现（已检查范围）"；每个方案至少一条最强反方论据；禁止复述用户措辞再认可；禁止道歉开场。
- 依据：EGM `skills/egm-review/SKILL.md:38-64` 的词表可 regex 校验，比"请客观一点"可执行。

### D6 收敛语义

- `not run` ≠ 零发现；有 not run 的轮次不 clean。
- clean = 必需阶段 completed + 零 must-fix + 零 should-fix（或已处置）+ 零 not-run。
- converged = 连续两轮 clean；上限 5 轮；超限升级用户。
- settled/fixed/churn 三态：已接受取舍不重开；已修复项再现重开；新发现可回退修复环。

### D7 Artifact-First 与三处停顿

- 大段 proposal/design/spec/review 报告一律落盘，聊天只回文件路径、2-3 个关键决策、请审阅。
- spec 起草按三处停顿：目标与边界 → 方案与取舍 → 验证设计。执行类任务仍按"任务之间不 check-in"（`subagent-orchestration.md:155-162` 保留），两者不冲突。

### D8 漂移报告与结构指纹分工

- 指纹回答"结构变没变"；漂移回答"内容还对不对"。同路径文件内容修改只有漂移能发现。
- 漂移只报差异，不自动改文档；改文档是决策，须落 `decisions.jsonl`。

### D9 不新增门禁与计数量

- 机检扩展现有 `check_review` 子检查，不新增 gate id；测试脚本在 `skills/swarm-yuan/tests/`，不计入 `config/mechanism-budget.json` 的 gates/scripts 计数量。
- 默认 `REVIEW_RECORD_REQUIRED=0` 保持 warn，避免存量生成物批量转红；active 项目建议置 1。

### D10 向后兼容

- 旧审查记录缺新字段时，默认档只 warn；置 1 后 fail，并给出补字段的具体指引。
- 新模板字段全部有默认写法，不要求项目改既有流程。

## 验证

- 新增测试 `tests/test-review-protocol.sh`：五类断言（模板必填字段、禁词扫描、not-run/clean 矛盾、缺字段拦截、合规样本通过）。
- 既有守门：`scripts/self-check.sh --check-only`（G25 双向对账 + FACT_REFERENCES）、`tests/test-doc-numbers.sh`、`tests/run-sweep.sh` 定向。
- 打样走查：在临时目录构造合规与违规两份 review-record，分别跑 `precheck.sh --review` 的默认档与 `REVIEW_RECORD_REQUIRED=1`，记录实际输出。
- 全量：合并前 `npm test`（仓库最小门），失败项按既有故障处置，不隐瞒。

## 设计文档影响

DESIGN_SYNC: none

理由：不触及 `DESIGN_DOCS` 四份正本（`docs/DESIGN.md` 与三份 workbench/ledger spec）。本批是 `skills/swarm-yuan/` 技能域的内部演进，其自身设计文档 `skills/swarm-yuan/README.md`、数字总账 `skills/swarm-yuan/assets/facts.conf`、吸收登记 `references/capability-map.md` 与 `assets/registry/*.tsv` 均在同批修订，满足技能域单一事实源。
