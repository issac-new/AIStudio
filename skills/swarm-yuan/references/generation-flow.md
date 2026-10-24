> **何时读我**：执行生成流程 Step 1-13 需要每步详解时。

# 生成流程 Step 详解（Step 1-13）

> 本文件是 Step 1-13 的逐节点详解，**按需读取**——AI 执行到对应 Step 时再读，不全量常驻上下文。Step 总览表常驻 SKILL.md 正文。

---

## H-C：自动 vs AI 审 边界

**核心原则**：脚本只做"自动出初稿"（模板/嗅探/枚举），AI 做"审 + 判断"。自动脚本不要假装能判断质量，AI 不要重复跑自动流程。

**各环节分工（Step 编号与各节详解一致）：**

| Step | 自动（脚本做） | AI 审（AI 做） |
|------|----------------|-----------------|
| 1 自检 | self-check.sh 运行时工具检测（15 为含方法论引用的整合口径） | — |
| 2 读项目知识 | trace-log 调用记录 + **mine-habits.sh 行为统计初稿**（提交前缀/分支/规模/共变对/热点/测试占比六维 → notes/habits.md） | AI 读 AGENTS.md/CLAUDE.md/记忆，**自行提取规则**（extract-feature-cards.sh 只输出模板）；**审读 habits.md 三去向**（铁律引用/开发偏好节/注意事项+配方佐证） |
| 3 探查仓库 | 三路并行扇出 + 图谱工具调用 | AI 读探查结果，**自行判断结构/规范/代码组织** |
| 4 形态判定+组件库+调用链 | inventory-verify 计数核验 | AI 判断维度适用性（§D.0 形态判定是 AI 判断，不是脚本） |
| 4 框架深化与门禁注入 | framework-evidence.sh 自动 grep 证据；generate-skill.sh --inject-frameworks 挂入 precheck 标记区块 | AI 判断"该框架规律是否适用于本项目"，证据由 AI 写 |
| 5 特征卡 | extract-feature-cards.sh 输出 17 项骨架 | AI **逐特征填具体值**，不靠脚本猜 |
| 6 create 骨架 | generate-skill.sh 拷 UNIVERSAL_FILES | — |
| 7 AI 填充全部文件 | — | AI **用真实探查内容替换占位符** |
| 8 AI 配置 precheck.conf | conf-render.sh 嗅探+渲染初稿 | AI 审 + 补 `# TODO:model` 清单（语义型变量） |
| 9 hooks/commands/MCP | generate-skill.sh 生成 hooks.json/commands/ 模板 | AI **审 hooks 是否适用**（不适用就删对应 hook） |
| 10 编码验证（测试） | precheck.sh 自动跑 check_test 门禁 | AI 看 fail/warn 输出，**判断是否要修**（不是所有 warn 都要修）；独立跑单元/集成测试 |
| 11 独立审查（review） | check_review 门禁自动核验 review-record 留痕 | AI 做**独立** code review（非自检），填 references/review-record.md 产物 |
| 12 写回项目记忆 | memory-writeback.sh 落盘 | AI 判断哪些经验值得沉淀 |
| 13 最终检查 | verify_completeness / inventory-verify | AI 终审：清单是否覆盖项目真实形态 |

**红线**：自动脚本只在"信号可信误报少"的领域跑（骨架创建 / conf-render / verify_completeness / mark-active / enforce_level 加载）；其余环节（特征卡填值 / 框架规律实例化 / hooks 适用性 / 门禁警告采纳）必须 AI 判断。

**对应 H-A/B**：advisory 档 4 个门禁（cognition/pr_quality/consistency/link_depth）+ warn 档 5 个门禁（stable_diff/framework/knowledge/metrics/crypto）已转 AI 自觉判断 / advisory——自动脚本不再跑这些，AI 自行判断是否参考。diagram 例外：客观契约（可访问 SVG/单文件安全/远程资源/脚本策略/viewBox）由 `diagram-check.sh` 机械查，主观质量仍由 AI 检查单判断。

---

## Step 1. 自检

`bash scripts/self-check.sh`（11 个运行时工具检测+自动安装；15 为含方法论引用的整合口径）

## Step 2. 读取项目知识

AGENTS.md/CLAUDE.md/记忆/agent 运行时（若有） → 提取规则写入特征卡（不读=重复造轮子）。
**★行为观察**：`bash scripts/mine-habits.sh <PROJECT_DIR>` 出六维统计初稿 → AI 审读三去向（提交/分支习惯→SKILL.md 铁律段引用；工作偏好→dev-guide「开发偏好」节；共变对/热点→reference-manual 注意事项 + recipes 配方提取 §D.7 源②）。统计事实 ≠ 规范，书面规则优先。

## Step 3. 探查仓库

三路并行子代理（结构/规范/代码组织），优先用 gitnexus/graphify/claude-mem/LSP，大型项目用 Dynamic Workflow 并行扇出。工具矩阵+降级策略见 `references/exploration-guide.md`。**★per-phase profile 探查分级**：按 `auto_detect_profile` 的判定结果分级——lite（文件数 <80 且无合规信号）单路探查不用图谱；standard（其余默认档）三路并行图谱可选；compliance（合规关键词命中）三路并行 + 强制图谱工具。规模边界不确定按更重档处理（质量优先）。**★全链路追踪（设计理念 2）**：每路子代理启动前 AI 调 `bash assets/trace-log.sh --node "探查" --actor "结构子代理" --tool "gitnexus context" --status started`（规范/代码组织子代理同理；trace-log/state-machine/memory-writeback 在生成器侧位于 assets/，在目标技能侧映射为 scripts/），完成后 `--status done`——用户可见每步调用何种工具，无需确认（trace 输出 stderr + 落盘 trace.jsonl，不阻塞主流程）

## Step 4. ★项目形态判定 + 详尽组件库清单 + 调用链路分析（探查的深化，不可跳过）

- **项目形态判定（§D.0）**：探查文件类型/框架特征 → 判定含哪些维度（前端UI/后端API/异步消费/桌面IPC/移动端/库导出）→ 后续只枚举存在的维度
- **全量穷举（§D.1 按维度动态）**：按判定结果选择的维度（D.1-F前端/D.1-B后端/D.1-A异步/D.1-D桌面移动/D.1-L库/D.1-T通用）做 `find`+`grep` 自动枚举 → 提取导出签名 → 每维度独立计数核验
- **调用链路分析（§D.2 按形态选模型）**：前端(注册装配+模块矩阵+挂载树+store依赖) / 后端(请求处理管道+分层矩阵+数据流+外部依赖) / 异步(消息流转) / 微服务(跨服务调用链) / 桌面(IPC链路) / 库(导出依赖图)
- **编排约束推导（§D.3 按形态选约束类别）**：前端约束 / 后端约束 / 异步约束 / 微服务约束 / 通用约束，每条标注代码证据
- **关系边集（§D.2.5）**：`bash scripts/relations-extract.sh <项目根> --skill-dir <目标技能目录>` 自动出 import 边初稿 → AI 补语义边（call/route/message/ipc/export）→ references/relations.jsonl（--stable-diff 传播与开发工作流 探查消费）
- **接口全量枚举（§D.4 按接口形态适配）**：REST(逐端点) / GraphQL(逐resolver) / gRPC(逐method) / MQ(逐queue+handler) / 库(逐导出)，无通配符占位
- 优先用 `gitnexus context/trace` 或 `graphify path/explain` 系统性提取签名与依赖链，而非随机 grep

### 框架深化与门禁注入（Step 4 子阶段）

对 ACTIVE_FRAMEWORKS 每个框架：`scripts/framework-evidence.sh` 自动取证 → AI 判断"该框架规律是否适用于本项目"（每条规律须有项目代码证据，无证据剔除并记录反例）→ 规律实例化随 Step 7 填充落 `framework-knowledge.md` → `bash scripts/generate-skill.sh --inject-frameworks <skill-dir>` 把门禁片段挂入 precheck 标记区块，随 Step 8 配置完成。骨架构建与实例化规范见 `references/template-spec.md` 框架段。

## Step 5. 特征卡

17 项（项目类型→…→可复用稳定单元→…→编排约束→详尽组件库清单），P0 六项（1/4/5/11/15/16）每项落到具体值不用占位符；P1 十一项 draft 期可「（P1 待补）」，`--mark-active` 前清零。映射表见 `references/template-spec.md` §3

## Step 6. 创建骨架

`bash scripts/generate-skill.sh <name> <project-dir>`（含 hooks/ + commands/ + precheck.conf）。`--profile auto|lite|standard|compliance` 四档，**默认 auto 项目级自适应**（合规关键词 → compliance；文件数 <80 → lite；其余 standard；**偏置修正：信号明确才升档，模糊走默认 standard**，auto 会打印判定依据供用户评估）：**lite**（认知档）= 特征卡 + reference-manual + 核心门禁脚本最小集（无 hooks/commands/settings/.mcp.json）；**standard** = 全量骨架；**compliance** = standard + 标准合规矩阵参考（references/standards-compliance.md）。**无占位符铁律适用范围 = 当前 profile 的文件集**（profile 是显式声明不启用，与"未配置静默跳过"本质不同）。默认生成到 `<project-dir>/.claude/skills/`（"为目标项目生成"名副其实）；可用第 3 参数 `target-dir` 显式指定其他目录，如 `--upgrade <name> <project-dir> <target-dir>`。全局安装到 `~/.claude/skills/` 等运行时目录走 `install.sh`。

## Step 7. AI 填充全部文件

SKILL.md/codebase/dev-guide/release/reference-manual/workflow/recipes/snippets/mcp-tools——**每个文件必须用探查到的真实内容替换占位符**。填充指引见 `references/template-spec.md`。**reference-manual.md §4 构件表/§6 接口表/§9 store+类型表按形态动态填充（维度错配=未完成），§5 链路按形态选模型 + §5.1 约束注释，dev-guide.md §8 按形态选约束类别；recipes.md（standard/compliance 档）§A 业务功能清单从 §D.1+§D.2 归纳、§B 任务配方三源提取（§D.6/§D.7）**

### 多文件并行填充：gsd Wave + Worktree 分批

> 注：本小节接入 **gsd Wave（分批）+ Worktree 隔离**（下面统一用 gsd）。

当本 Step 涉及多文件/多模块并行填充时，按 **gsd Wave（分批）** 切分工作量：每 Wave 是一组可独立验收的变更（如「先在 3 个 service 层文件落地约束段」），Wave 之间显式交接（前 Wave 全绿再进下一 Wave），避免一次性铺开导致 fail 互相掩盖。**Worktree 隔离**：每个 Wave（或独立功能切片）在独立 git worktree 中推进（`git worktree add .claude/worktrees/<wave-id>`），main 始终保持可发布态；Wave 内频繁提交，收口时 rebase origin/main 后再合回 main（`--no-ff` 保留 Wave 边界），合入成功才删 worktree。并行 Wave 上限 ≤3，超出的先收口一个。该模式与 Step 13 的 Oracle Gate 循环互补：Wave 管「分批推进不污染主线」，Loop 管「单点 fail 无限迭代直到绿」。

## Step 8. AI 配置 precheck.conf

**★脚本化初稿**——`generate-skill.sh create` 已调 `scripts/conf-render.sh` 渲染生成期必读文件初稿（每变量带 `# AUTO:detected`（嗅探所得）/ `# AUTO:default`（默认值）/ `# TODO:model`（语义型须人工）溯源注释）。模型只处理 `# TODO:model` 清单（LAYER_DEFS/WRITABLE_DIRS/READONLY_DIRS 等语义型变量，须从特征卡推导；标注 deprecated 的变量不填，恢复须手工解锁 arch.conf 注释行）+ 审 diff 是否符合特征卡意图——从「手写全部 conf 变量」变成「审 + 补少数」。**★测试容量必配**：`TEST_CMD` 须产出可解析覆盖率报告（或配 `COVERAGE_REPORT`）；`COVERAGE_MIN` 按项目现有基线填写（推荐 70-85，确无报告填 0 并留痕）；`TEST_MIN_ASSERTIONS_PER_CASE`/`TEST_MIN_NEGATIVE_RATIO`/`TEST_QUALITY_STRICT` 按团队成熟度定；有 API 时填 `API_TEST_MIN_RATIO`（推荐 70-90）与 `API_TEST_REQUIRE_STATUS`。审完后所有 `<占位符>`/`TODO:model` 必须替换为真实值

**★项目 rules.d 探查期生成**：本 Step 从编排约束（§D.3）与只读判定（特征卡 2 可改范围）推导项目特有三值规则初稿，写入产物 `rules.d/project.rules`。**行语义 = 命令拦截**：`gate-rules.sh` 对命令首 token 做 glob 匹配（消费方是 fail-gate-hook/integrity-guard 的 PreToolUse(Bash)），**不是文件路径规则**——路径保护落 `READONLY_DIRS`（check_scope 执法），本文件写"哪些命令推进态要拦"（路径 pattern 无效：消费方只匹配命令首 token，照写路径即死规则）。正确示例：`npm publish * → forbid # 发布不经门禁；替代：走 release 流程（门禁全绿 + tag）` / `git push * → prompt # 推进态；先跑 precheck --all` / `npm test * → allow`。FORBID 行必须带替代方案（rules.d 行格式铁律）。

### 审查口径校验：Mutation Check

配置/写回 `references/review-methodology.md` 的审查口径时，须纳入 **Mutation Check（变异测试有效性验证）**：对 `framework-gates/<fw>.sh` 的 `_fw_<id>_check` 函数，施加少量变异（如把 `fail` 改成 `pass`、把某正则 `=true` 改成 `=false`）后重跑对应 fixture（`bash swarm-yuan/tests/run-framework-fixture.sh <id>`）——**若变异后 violating 侧仍 PASS（未被检出），说明该门禁的测试/断言无效，须回 Step 7 补强断言**；变异后仍检出（fail 不变）= 测试有效。Mutation Check 是「测试有效性」而非「覆盖率」的硬证据：绿 ≠ 有效，只有「变异后被抓」才证明绿有意义。与 Step 10 门禁运行、Step 13 零残留核验形成三层把关（门禁绿 / 变异绿 / 零残留）。

## Step 9. AI 集成 Claude Code

定制 generate-skill.sh 已生成的 hooks/hooks.json + commands/ + settings.local.json + .mcp.json 模板（脚本骨架已建，AI 补项目特定配置）+ workflow.md 节点标注。hooks 含 PostToolUse(Bash) failure-detector（失败模式自动检测：SPINNING/EXPLORING/MIXED 三态 + L1-L4 压力升级）+ PreToolUse 防作弊门（integrity-guard：受保护治理资产 deny/advisory 两档，保护 swarm-yuan 资产清单）。详见 `references/claude-code-capabilities.md`

## Step 10. AI 编码验证（测试）

`precheck.sh --all`（核心 11）→ fail 自动修复重跑 → `--mark-active` 激活后 `--all-full`（标准 29：核心 11+架构 18）；强监管交付按需追加 `--compliance-suite`（合规 19）。**★测试门禁（check_test 两层）**：第一层跑项目测试套件并检出 0 用例空跑；第二层在配置阈值后核验——覆盖率（`COVERAGE_MIN`/`COVERAGE_REPORT`，低于阈值 fail）、零断言/断言密度（`TEST_MIN_ASSERTIONS_PER_CASE`）、负向与边界用例占比（`TEST_MIN_NEGATIVE_RATIO`）、聚焦测试（`.only` 等直接 fail）；配 `MUTATION_CMD`/`MUTATION_MIN_SCORE` 时追加变异分数（opt-in，成本高）。**接口测试**由 `--api` 按 HTTP 方法 × 路径模板核验端点映射（`API_TEST_MIN_RATIO`），并要求每个已覆盖端点的测试调用附近有自身状态码/错误路径断言；路径参数按真实值匹配，集合路径不能代答。Step 8 的 **Mutation Check** 是生成器侧对 `framework-gates/<fw>.sh` 夹具有效性的自检，不替代项目侧 `MUTATION_CMD`——两者都遵循“绿 ≠ 有效，变异后被抓才证明有效”。**★compliance 档 / 改治理资产 / 发布链路：强制走四权分离 agent 拓扑**（policy-guardian → action-executor → self-reviewer → verifier，立法/执法/司法三权隐喻，详见 `references/governance-agents.md`）——action-executor 只给 candidate_pass，最终 verifier_status 由 external harness/hook/human 定，防「自己改自己验收」。**★compaction 状态续传**：PreCompact hook 自动 `bash scripts/state-machine.sh dump-journal` 把 phase/failure_count/peak_level dump 到 `.swarm-yuan/builder-journal.md`；SessionStart 自动 `restore-journal` 检测 <2h 的 journal 并恢复压力状态——压力不因 compaction 重置

## Step 11. AI 独立审查（review）

**独立 code review（非自检）**：AI 以"第三方 reviewer"视角重新审视生成产物（SKILL.md / workflow / references / precheck.conf / scripts），不重复 Step 7 的填充自检，而是找 Step 7 之后仍残留的逻辑错误、占位符遗漏、门禁误配、组件库清单错漏等**低级错误**（用户原始痛点："swarm-yuan 没有测试和审查这个关键环节，错误太低级了"）。**★review 门禁（check_review）**：`check_review` 自动核验**审查留痕**——生成物目录存在 `references/review-record.md` 且非空（含 5 维审查点 + findings 表）即 pass；默认档（REVIEW_RECORD_REQUIRED 未启用）只 warn 不 fail（诚实分层：CI 自举/工具仓库无生成物是常态），compliance 套配置 `REVIEW_RECORD_REQUIRED=1` 后缺留痕即 fail。审查完须 `cp swarm-yuan/assets/review-record-template.md <skill>/references/review-record.md` 并填充 5 维审查点 + findings 表，作为独立审查证据产物落盘（review-record-template.md 路径：生成器侧与目标技能侧均为 `assets/`；填充产物落目标技能 `references/review-record.md`）。**目标技能 active 态建议在 conf 启用 REVIEW_RECORD_REQUIRED=1，让审查留痕成为硬门。**

## Step 12. AI 写回记忆

`bash assets/memory-writeback.sh`（脚本兜底；生成器侧在 assets/，目标技能侧映射为 scripts/）三路写回 .swarm-yuan/project-knowledge.md / .zcode/memories/ / claude-mem，形成"记忆→生成→开发→记忆"闭环（best-effort，不阻塞主流程）

## Step 13. AI 最终检查

运行 `bash scripts/generate-skill.sh --verify-completeness <skill_dir>` 做无占位符 + workflow 调用追踪要素机器执法（active 态或 --strict：命中即列 file:line 并 exit 1；draft 态默许残留仅列清单 return 0——断点续传设计；零命中打印「✓ 无占位符确认」），确认零"待填充"/零"填充指引"/零"<占位符>"残留；**维度计数核验**：跑 `bash scripts/inventory-verify.sh <项目根> --skill-dir <skill目录> --form <§D.0形态>`，全 PASS → 直接引用报告结论；FAIL（清单计数 < 枚举计数 × 0.95）→ 只针对失败维度回 Step 4 补漏；DIM_MISMATCH（声明形态与枚举结果矛盾）→ 回 §D.0 重判形态。维度注册表见 `assets/inventory-dimensions.conf`（数据驱动，新增维度改注册表不改脚本）；**框架适配四要素核验**：对 ACTIVE_FRAMEWORKS 每个框架——① 构件枚举计数 ≥ 实际 × 0.95（依 `references/frameworks/<fw>.md` §2 的计数基准）② `framework-knowledge.md` 规律数 ≥ 规则文件声明的深度门槛且 100% 含"证据:"字段 ③ `precheck.sh` 含 `_fw_<id>_check` 动态分发器且 `--framework <id>` 实跑 exit 0（门禁片段位于 `assets/framework-gates/<fw>.sh`，已注入到 `# >>> swarm-yuan:framework-gates >>>` ... `# <<< swarm-yuan:framework-gates <<<` 标记区块）④ `dev-guide.md` §10 含该框架约束段 ≥ 3 条。任一不过 → 回 Step 4 框架深化与门禁注入。**★Oracle Gate 循环（可选）**：self-check/precheck 持续 fail 时，用户可 `bash assets/hooks/setup-loop.sh "修复任务" --verify 'bash scripts/self-check.sh --check-only'` 启动无限迭代模式——AI 输出 `<promise>SWARM_YUAN_DONE</promise>` 后，Stop hook 独立跑 verify_command，拒绝则 loop 继续 + 错误输出喂回，Stall Detection（5+ 次拒绝强制退回需求本身）。详见 `assets/hooks/setup-loop.sh --help`。**如有残留，回到 Step 7 继续填充，直到零残留。**
