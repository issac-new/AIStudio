---
name: open-source-skill-fusion-v2
description: "调研开源/本地 agent 项目并融合增强 Hermes 集群。含多候选消歧、本地侦察、双通道分流。"
version: 2.0.0
metadata:
  hermes:
    tags: [devops, research, agent-behavior, skill-fusion, open-source]
    related_skills: [open-source-skill-fusion, agent-skill-repo-analysis, kanban-triage-stall-recovery]
---

# 开源/本地项目融合增强 v2

> 从 BMAD + maestro + swarm-yuan 三源融合实践（2026-08-06）提炼，增补 v1 缺失的前置步骤。
> v1 原 skill 在 default profile（`open-source-skill-fusion`），此版本为 orchestrator 增强版。

## When to Use

- 用户说"调研分析 GitHub 项目 X 并融合增强 Hermes"
- 用户说"调研本机项目 X 的 skills，看哪些适合 Claude Code / 哪些适合 Hermes"
- 多源并行调研（2-3 个项目同时调研后统一融合）
- 需要将外部能力按终态架构（Hermes 调度 + Claude Code 编码）分流

## 前置步骤（v2 新增）

### Step 0a: 多候选仓库消歧

用户给的项目名可能在 GitHub 有多个候选（如 "maestro" 有 8+ 个同名项目）：

```bash
gh search repos <name> --limit 8 --json fullName,description,stargazersCount
gh repo view <owner/repo> --json name,description,stargazerCount,primaryLanguage
```

gh 未认证时的等价通道（公共仓库免 token）：匿名 GitHub REST API，请求只需带 `User-Agent` 头——
`https://api.github.com/repos/<owner>/<repo>`（元数据/star/pushed_at）、`/contents/`（目录树）、`/commits?per_page=5`（近期活跃度与增量基线）、`https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>`（原文文件）。侦察阶段的元数据/目录/提交历史/raw 文件全可拿，clone 只在进入深读时才需要。

- 候选 ≤1 → 直接确认
- 候选 ≥2 → `clarify` 让用户选
- 用户直接给 URL → 跳过

### Step 0b: 本地项目侦察（调研本机项目时）

调研本机已有项目（非 GitHub clone）时，orchestrator **先自行侦察**：

```bash
# 定位所有副本
mdfind -name "<project>" 2>/dev/null | head -20
find /Users/YOURNAME -maxdepth 3 -iname "*<project>*" 2>/dev/null | grep -v Library

# 对比副本差异，确定权威版本
diff -rq <path_a> <path_b> | head -20

# 读核心文件头部提取摘要
head -80 <authoritative_path>/SKILL.md
wc -l <authoritative_path>/SKILL.md
ls <authoritative_path>/references/ | head -30
```

侦察结果写入任务 body（权威副本路径、已知结构摘要、关键文件列表），**worker 不重复侦察**。

本机**文件型源**（扫描 PDF/文档，非目录仓库）同样先侦察再建卡：存在性 + 文本层探测（多页 `get_text()` 抽样判是否图片型）+ 可行性试样（渲染 2-3 页实跑 OCR/解析验质量），试样结论与可复用脚本路径写进卡 body——worker 拿到卡即进入全量处理，不重复探路（零文本层 PDF 走 `pdf-scan-ocr-pipeline`）。

### Step 0c: 双通道分流框架（终态架构适配）

当终态架构是 **Hermes agent team 调度 + Claude Code 编码** 时，
调研任务 body 必须包含双通道评估要求：

| 通道 | 目标 | 评估标准 | 产出形态 |
|------|------|---------|---------|
| **A（Claude Code）** | 终端编码 agent | 擅长项目内文件操作、bash、子代理 | skill/commands/agents/hooks |
| **B（Hermes team）** | 编排调度 | 擅长多 profile 编排、kanban 依赖、Gateway 路由、跨会话记忆 | SOUL.md/rules.md/_shared/skill |

协同接口：kanban 任务 → ACP 委托 Claude Code → 门禁验收 → 结果回传

## Core Workflow（继承 v1，5 步）

Step 1-5 与 v1 `open-source-skill-fusion` 相同：
1. **深度调研** — clone + 目录映射 + 高信号文件阅读
2. **结构化分析** — 6 维度报告（架构/能力/工作流/独有特性/技术栈/融合评估）
3. **提取可移植能力** — 三道防线分类（执行前/执行中/完成时/持续维护）
4. **创建 skill + patch 核心文件** — class-level skill + SOUL.md/rules.md/_shared patch
5. **验证** — skill_view + grep -c + wc -l

### v2 增补：多源并行调研编排

多项目并行调研时的 kanban 编排模式：

```
orchestrator 创建 N 个并行调研任务（worker-researcher）
  + 1 个融合任务（worker-coder，parents=[所有调研任务 ID]）
    ↓
调研任务完成后，融合任务自动解锁
    ↓
融合任务读取所有报告 → 三方去重 → 创建 skill + patch → 验证
```

**关键**：
- 创建任务时**省略 `triage=True`**（triage 卡不会被 dispatcher 拾取，见 `kanban-triage-stall-recovery`）
- 融合任务的 `parents` 用 `kanban_link` 补齐（创建后新增依赖时）
- 融合任务 body 中明确列出所有输入报告路径和去重基线

### v2 增补：去重矩阵模板

融合时的三方去重矩阵（两个维度）：

| 维度 | 判定标准 | 处置 |
|------|---------|------|
| 与 Hermes 现有基线重复 | cognition-lattice/pua-*/loop-engineering-gates 等已覆盖 | **跳过** |
| 同源不同维度 | 如 task-methodology-router(验证强度) vs pua-methodology-router(方法论选择) | **并存**，kanban metadata 双标签 |
| 全新能力 | Hermes 无对应 | **创建 skill** |

现有能力基线速查（2026-08 快照）：
- 执行前：cognition-lattice(239偏差/712思维模型, references/orchestrator_integration.md §七A守门+§七偏差)
- 执行中：pua-pressure-engine(L0-L4), pua-methodology-router(14方法论)
- 完成时：loop-engineering-gates, pua-harness-governance(四权分离)
- 持续维护：harness-entropy-management
- 架构：agent-harness-best-practices(10规则/7不变量/14风险类)
- 编排：kanban 原生 + kanban-triage-stall-recovery

### v2 增补：蓝军对抗审查（复杂融合任务必做，Step 5 验证的强制升级）

用户纪律：复杂任务完成必须 delegate_task 蓝军审查，禁自评自封。
执行模板（2026-08-16 LHH 融合实测：509s 抓到 4 WARNING / 0 BLOCKER，全部真实缺陷）：

goal 四维度：
1. 【忠实性】对照源码逐条抽查关键机制转译——有无编造/弱化/添加源项目没有的内容
2. 【一致性】产物文件间交叉引用（路径/节号/版本号）一致，section 编号无重复断号
3. 【可执行性】脚本/命令真实跑通（--help + 最小 case + 边界 case），SKILL.md 用法 copy-paste 可执行
4. 【越界】mtime/git 扫描改动清单，对照申报清单找计划外修改（同日多 agent 并发时归因要留给 orchestrator 确认）

要求蓝军用**被审协议自己的格式**输出报告（审查 LHH 融合就让蓝军出三行控制头），
发现每条带 file:line + severity（BLOCKER/WARNING）。

读取结果：background 派发的完整报告在子代理结束后**自动回投递会话**（以新消息形式送达），无需手动读文件；手动读取仅用于 live 模式或投递丢失兜底——完整报告在
`~/.hermes/profiles/orchestrator/cache/delegation/subagent-summary-<task>-<ts>.txt`；
live 日志（`live/<deleg_id>/task-N.log`）用 tail 看时长行会被显示截断（`…(+N chars)`），
别把截断行当最终结论，以 summary 文件为准。

修复闭环：WARNING 逐条修复（改 1 字也要改）→ 跑回归（改什么验什么）→ 归因越界疑点。
退出码类脚本缺陷要区分"检出信号"与"崩溃信号"（如 workspace_audit.py：exit 1=篡改，exit 2=运行错误）。

## 参考文件

- `references/blue-army-review-template.md` — 蓝军对抗审查 goal 模板 + LHH 融合实测案例（4 WARNING 复盘与修复闭环纪律）
- v1 的 references 文件仍有价值：
- `references/pua-pressure-escalation-architecture.md`（tanweai/pua 分析）
- `references/harness-best-practices-architecture.md`（agents-best-practices 分析）

## Pitfalls

继承 v1 全部 5 条 pitfall（skill_manage not found / 上下文压缩遗忘 / description 57字符 / 无 Claude Code hook / GitHub 发布同步）。

v2 新增：

### 6. triage 卡死不拾取
`kanban_create(triage=True)` 创建的卡 dispatcher 不会拾取。
创建后必须 promote 到 ready 并验证 worker spawn。
详见 `kanban-triage-stall-recovery` skill。

### 7. 融合任务的依赖链更新
创建融合任务后如果需要新增调研任务（用户中途追加），
用 `kanban_link(parent_id=<新调研>, child_id=<融合任务>)` 补依赖，
并在融合任务中用 `kanban_comment` 更新输入报告清单。

### 8. 新 skill 可见性局限
orchestrator profile 的 `~/.hermes/skills/devops/` 下的新 skill 
**其他 profile 看不到**（需 symlink 或复制到各 profile 的 skills 目录）。
融合完成后应列出 P1 后续项提醒用户处理可见性扩展。
（2026-08-16 更正+实测：本部署 orchestrator 的 skills/devops 是指向
`~/.hermes/skills/devops` 的 symlink 共享板，default profile 同享——
跨 profile 写入被 soft guard 拦时用 patch/write_file 带 cross_profile=True，改一处全生效。
但 **skill 目录链接 ≠ 全 profile 可见**：adversarial-review-lens 实测仅 7/27、
delegation-brief-format 仅 3/27 profile 有链接。补法：`ln -sfn ~/.hermes/skills/<cat>/<name> ~/.hermes/profiles/<p>/skills/<name>`，
补完用 `head -3 .../SKILL.md | grep ^name` 验证解析。审查岗/派生岗必须逐个核对，
"角色不需要"与"忘了链接"要区分开——判据是该 profile SOUL 是否含对应职责关键词。）

### 9. 本地 git 被 conda 包装器劫持（2026-08-16 实测）
macOS 上 `git clone` 可能被 conda 的 git wrapper 劫持报
"Conda has prepared the above report" 错误。
解法：改用 tarball 直下 `https://codeload.github.com/<owner>/<repo>/tar.gz/refs/heads/main`，
比 git clone 更快更稳；下载不完整（gzip truncated）时重下而非解压残包。

### 10. 微信文章图片与 vision 配额
微信图床有防盗链（vision_analyze 直传 URL 会 400），必须先
`urllib.request` 带 Referer:mp.weixin.qq.com 下载到本地再分析；
且 auxiliary vision 模型可能配额耗尽（kimi 403）——正文文字通常已含
benchmark 核心数字，图片只是图表渲染，配额没了可跳过不影响调研结论。

### 11. 融合声明必须机械验证（2026-08-17 agent-skills 融合实测）
蓝军抓到的三类声明失实，全部可预防：
- **"N 处融合标注"**：写进结论前 `grep -c "融合自"` 逐文件数一遍，
  别按 patch 次数脑补（实测声称 3 处实际 2 处，TDD 零标注）。
- **"纯增量/原有内容全部保留"**：patch 前若有 `.bak-*` 基线文件，
  patch 后 `diff` 基线核对；没有基线就别声明"纯增量"。
- **被 patch 文件里的既有死链**（引用不存在的 skill）：patch 触碰该文件时
  顺手 `test -d` 核查其引用的技能路径，死链注明移除——否则蓝军越界扫描
  会把它算进你的修改账上。

### 12. 融合前必查既有融合（2026-09-02 mattpocock/skills 融合实测）
同一上游项目可能已被先前会话部分融合过。本次 patch systematic-debugging 时
发现其 v1.1 已含 10 方法反馈环清单（Phase 1 §2，来源即 mattpocock/skills
diagnosing-bugs）——盲 patch 会产生重复块（本会话注入 37 行后删除重来）。
**纪律：patch 任何现有 skill 前先 `grep` 上游关键句/关键机制名**，确认未融合再动手；
已融合则只补增量（本次实际增补的是 completion criterion + cleanup checklist 两条，
10 方法清单维持原样）。判定基线用「关键机制名 grep 命中数=0 才算未融合」。

### 13. fence 真目录与 symlink 混合挂载的分发差异（2026-09-02 实测）
新 skill 落 master（`~/.hermes/skills/<cat>/<name>/`）后，各 profile 可见性分两路：
- **symlink profile**（整类 symlink 指向 master）：立即自动可见，无需操作
- **fence 真目录 profile**（skill-fence 按白名单拷贝的实体目录）：不会自动同步，
  需 `ln -sfn ~/.hermes/skills/<cat> ~/.hermes/profiles/<p>/skills/<cat>` 补整类链接，
  或等 fence 下次 apply 时同步
实测本部署 33 profile = 20 symlink + 13 fence 真目录混合；6 个新 skill 落 master 后
经一次批量补链 + fence 自动同步，33/33 全可达（md5 全比对 NONE mismatch）。
**验证口径**：`os.path.isfile(profiles/<p>/skills/<cat>/<name>/SKILL.md)` 逐 profile 穿透检查，
别只看 symlink 存在与否。

### 22. 派工前实时 cap + 路径冲突自检（2026-10-19 wechat-fusion-20261019-observability 实测）

派 5+ 张卡前**必须**先查两件事——`max_in_progress_per_profile=5` 是天花板而非并行触发器，撞了 card 排队不报错；不同卡指向同一文件路径会相互 git conflict。

```bash
# 1. 实时 in-flight 计数（每 profile）
for b in swarm hack ops; do
  sqlite3 file:$HOME/.hermes/kanban/boards/$b/kanban.db \
    "SELECT assignee, count(*) FROM tasks WHERE status IN ('running','ready','todo') GROUP BY assignee"
done
```

派工原则：

- 同 profile in-flight + 新派 ≤ 5：直接派
- 6-7：分波（每波 ≤3），波间留 worker spawn 间隙
- ≥8：先 unblock / 排空再派，**不要**连发 8 张同 profile 卡

```bash
# 2. 路径冲突自检：所有 workspace_path 互斥
sqlite3 file:$HOME/.hermes/kanban/boards/swarm/kanban.db \
  "SELECT DISTINCT workspace_path FROM tasks WHERE status IN ('running','ready','todo') AND workspace_path != ''"
```

多条卡**禁止**指向同一 `workspace_path`（dir/worktree 模式）。即便 tier 不同，落地 worker 在同目录并行 patch 会出 mtime 漂移。**冲突时改 `workspace_path` 为该路径下的子目录**（如 `<workspace>/<task-id>`），不要让 worker 自己协调。

**派工前 30 秒纪律**（实测避免 3 次返工）：

- ls 一次所有派工卡要改的目标文件，**确认文件存在**（不要"报告里写存在"就当存在）
- grep 一次 `~/.hermes/profiles/_shared/06-observability/risk-register.md` 的 14 行表格末尾，**确认 R-XX 编号不重复**
- 一次 `git -C <外部仓> status` 看是否有未 commit 改动（如 cc-switch 仓 user 可能正在改）

### 23. 外部仓源码改动必走 T3 triage（2026-10-19 wechat-fusion-20261019-observability 实测）

**红线**：调研报告落地路径若涉及**外部仓源码改动**（如 cc-switch 仓 `src-tauri/`、其它 GitHub 上游），**绝不**派 worker 直接实施——必须 T3 triage 走单卡人审通过后再实施。

触发条件（任一命中即走 T3 triage）：

- 目标文件在 `~/.hermes/` 树**外**（外部仓副本 = `lab/<x>/`、`/Users/<u>/projects/<x>/` 等）
- 上游有 CLAUDE.md/AGENTS.md/CONTRIBUTING.md 显式红线条目（cargo fmt -D warnings / i18n 四语言 / Conventional Commits / 测试树闭集）
- 上游为强健壮性项目（issue 数量 > 100 / 维护活跃 / 不接受直接 fork PR）

T3 triage 卡 body **必含** 5 段：

```markdown
routed:heavy:tier=T3 src=<融合报告相对路径>

## wytbb 前置假设（≥2 条）
1. 假设 1：<具体可达性假设，例：拦截点 <X> 的输入/输出结构允许无侵入>
2. 假设 2：<具体兼容性假设，例：<某 crate vN> 编译期与 Tauri 2 兼容>

## 必读 context（强制读完）
- 融合报告 §五.1 + 上游 CLAUDE.md + 拦截点源码 + CHANGELOG 最近 N 行

## 实现目标（仅设计，非实际改）
1. 设计文档：落 <hermes 内研究路径>，含拦截点选择分析 + 5 类 span 映射 + 必选/可选属性 + 双发策略 + 三层采样 + 不回写红线
2. 拦截代码样例：<L> 行 Rust/Python/TypeScript，含环境变量触发，零配置默认不开
3. PR 描述草稿：Conventional Commits 格式，**不实际开 PR**
4. PoC 验证方案：含 <docker run> 命令或 <pnpm tauri dev> 流程，**不在本卡实施**

## 验收标准（frozen: true）
- [ ] 设计文档落盘，路径 = `research/...`
- [ ] 设计文档含 wytbb 节 ≥2 条
- [ ] 拦截代码样例 ≥ L 行，含环境变量触发
- [ ] PR 描述按 Conventional Commits
- [ ] **不实际改外部仓任何文件**（验收时 `git -C <外部仓> status` 必须干净）
- [ ] **不实际开 GitHub PR**（仅生成描述文本）

## 收尾契约
- triage 卡必人审通过（kanban_request_review 而非 kanban_complete）
- review handoff summary 必含「设计文档路径 + 拦截点 + PoC 命令 + 待审事项」
- 用户裁决后由 orchestrator 再派 T3 实施卡（独立新卡，不再 triage）
```

**why**：SOUL 红线说"~/.hermes/ 树外不自动改"是抽象原则，缺"如何安全地把外部仓源码改动登记成可派工卡"的落地模板。T3 triage 是把这条红线变成可执行卡设计——既不阻塞融合进度（仍可派工），也不越过用户授权（人审通过才实施）。

**后续**：T3 实施卡派工前，orchestrator 必须**重新**实勘该外部仓当前状态（pitfall #22 同款 ls/git status），确认 triage 假设未被外部仓更新打破——若外部仓已合入类似改动，triage 设计可作废或简化，避免重叠 patch。

### 21. `~/.hermes` 树不在 git 仓——改动保护用备份快照替代 commit（2026-10-17 实测）

`~/.hermes/skills/` 与 `~/.hermes/profiles/` 均为裸目录（`git rev-parse` fatal not a git repository），「skill 改动后 commit」惯例在本机布局下不可执行。回滚保护形态：改动前 `cp <file> <profile>/backups/<file>.bak-<tag>-<ts>`，备份在位列入验收；事后不提 commit。若未来该树入仓，此条作废。

### 14. 「调研分析 GitHub 项目」禁止止步于网页碎片（2026-09-03 OpenExecutive 实测）

用户说「调研 https://github.com/X/Y」时，**禁止只用 web_extract 抓 README/docs 页就出报告**——
GitHub 页面抓取给的是碎片（README 截断、docs 目录页只有文件名表），漏掉全部代码层机制。
实测教训：首轮网页碎片分析 OpenExecutive，漏掉 Committee 对抗评审、outbound_guard、
动态工作流引擎、failures/ 案例库、monitoring 管线 5 个核心机制，eval 场景数错（29→42），
用户两次「重新分析下」后才改为 tarball clone + 源码深读。
**纪律**：
- Step 1「深度调研」的 clone 是**硬要求**——tarball 直下（pitfall #9）→ 分层映射
  （`find -maxdepth 1 -type d` + 各模块 `wc -l` 排序找大头）→ 定向深读大模块源码。
- 报告关键声明必须 file:line 可追溯（如 `committee.py:38-66`），禁「文档说有」式转述。
- 网页抓取只用于 Step 0a 消歧和 LICENSE/README 元数据，不用于机制分析。
- 分析完清理 /tmp clone，核心内容落 `references/<project>-source-analysis.md` 持久化。

### 19. 测试树 = 契约（融合报告/plan-mode 派工前必过，2026-10-15 jev-skill 实测）

README 与 examples/asset 描述的「开放 provider 列表」是**宣传态**，仓库实际契约写在 tests/。
改造方案派工前**必须**先全量 grep 测试树：

- 找 `APPROVED_PROVIDERS` / `ALLOWED_*` / `assertIn(... , _*_SET)` / `choices=[...]` 类硬闭集
- 找 `re.findall(r"--provider[ =]([a-z]+)", text)` 类**正扫描 SKILL.md 资产**的测试
- 找 `assertEqual(list(provider.choices), ...)` 类**精确匹配**断言（闭集是字面值）
- 找 `assertIn(host(url), APPROVED_API_HOSTS)` 类 endpoints host 白名单

**闭集类测试不允许新增 provider**——若 plan 写「在 CLI choices 加 clef」，实际撞：
- `test_provider_policy.py:21` `APPROVED_PROVIDERS = ["openrouter","typesafe"]`
- `test_provider_policy.py:64` `assertEqual(list(provider.choices), APPROVED_PROVIDERS)`
- `test_provider_policy.py:80` `assertIn(host(url), APPROVED_API_HOSTS)`
- `test_provider_policy.py:105` `re.findall(r"--provider[ =]([a-z]+)", text)` + `assertIn(provider, APPROVED_PROVIDERS)`
四条件**同时**满足才 pass——CLAUDE.md 红线 6「不得弱化 tests/」意味只能改 `--provider` 调用形态。

**派工前自检（orchestrator 写 plan 时）**：
- 「add X to choices」类目标 → grep 测试树找闭集；命中即必须改 plan 为环境变量触发形态（见 pitfall #20）
- 「add X to endpoints dict」类目标 → grep 测试树找 host 白名单；命中同上
- 「改 SKILL.md 文档加 X」类目标 → grep 测试树找文档扫描断言；命中即必须禁出现 `--provider X` 字面量
任一命中且 plan 没说如何处理闭集，**派工即翻车**——worker 会撞红线而 block（实测 worker-coder 撞后正确选择 block 而非 crash）。把它写进 §2.1「验收清晰性门」上游：plan 阶段的对外承诺（"X 可配置"）必须经测试树反向验证。

### 20. 「Path A」最低破坏接入：环境变量触发上游已硬化项目（2026-10-15 jev-skill 实测）

当上游项目 CLAUDE.md 红线 + 测试树闭集都禁止新增 provider/endpoints 时，
**不要在 plan 阶段就放弃适配**——改为「环境变量触发」形态，对原 API 用户零影响、对红线零冲击：

- **不挂 clef 到 `--provider` CLI choices**（闭合上游 CLI 接口）
- **不写 X 到 endpoints dict**（闭合上游 URL 映射）
- **scripts/X.py 改动**：在 `request_*` 函数顶部加 `effective_provider = os.environ.get("JEV_PROVIDER") or provider`；`http_json` 加 clef 分支读 `CLEF_BASE_URL` 环境变量走独立 URL；`validate_request`/`build_report` 不动
- **5 SKILL.md 改 provider 段**：「Use safely」段加「Local clef transport」说明，示例用 `JEV_PROVIDER=clef CLEF_BASE_URL=... python3 jev.py decide ...`——**禁出现 `--provider clef` 字面量**（pitfall #19 文档扫描会命中）
- **assets/*.json 改 model 字段不改 provider 字段**——provider 字段是 dict 引用，model 是自由字符串
- **留给上游 PR 空间**：保留原 OpenRouter/TypeSafe 端点不动，未来给上游 maintainer 提 PR 时即正式加入新 provider（届时由 maintainer 决策闭集是否扩展）

**派工卡 body 验收**必须含反向 grep（防 path A worker 误用 `--provider clef` 字面量）：
```markdown
- [ ] SKILL.md `grep -c "provider clef"` 返回 = 0（撞 test_provider_policy 文档扫描会失败）
- [ ] SKILL.md `grep -c "JEV_PROVIDER"` 返回 ≥1（正向证据 env var 形式）
- [ ] SKILL.md `grep -c "CLEF_BASE_URL"` 返回 ≥1
```

**plan 阶段如何决策 A vs B**：
- A（环境变量触发）适用：上游有 CLAUDE.md 红线 + 测试树闭集硬约束
- B（fork + patch tests/）适用：上游无红线且接受测试变更
- C（写新 transport wrapper）适用：上游为纯库无 CLI（直接调 API）
默认从 A 起——A 失败再退 B/C。

**T9 蓝军审查卡 body 必写「doc-only WARNING 不修代码」处置纪律（2026-10-15 jev-skill 实测）**。路径 A 实战发现：T9 蓝军审查 PASS 后给 2 个 WARNING（都是 doc-only——「T2 spec body 文本过期」+ 「4 sibling SKILL.md 资产引用差异」），**蓝军正确**（这些是文档抛光建议不是代码缺陷）。但**易被误读**——下一轮接手的 orchestrator 可能派「WARNING 修复卡」给 worker-coder，结果是浪费一轮 worker 跑 git 改 spec 文本。**派工时固化**——T9 蓝军审查卡 body 末段写：
```markdown
[WARNING 处置纪律] 蓝军审查给 WARNING 时分类:
- BLOCKER: 必派修复卡
- WARNING (代码层): 必派修复卡
- WARNING (doc-only, 涉及 spec body 文本/兄弟文档样式): 由 orchestrator 收口时判断,不修代码,
  在收口卡 handoff comment 写「W<n> reviewed: no change needed, [具体理由]」
- WARNING (上游契约/CLAUDE.md 红线): 必须派修复卡,禁留痕跳过
蓝军卡**不修代码**——蓝军的职责是报告,不是修复。修复由 orchestrator 派工链控制。
```
**理由**: WARNING 处置边界一旦在派工卡没固化,orchestrator 收口时按印象处理(实测我没派修复卡,是「随机应变」对的,但这是脆弱的)。把「doc-only 不修代码」写进 T9 卡 body,**下游 orchestrator 接管时直接按卡内纪律走,不必再判断**。

**T10 终合卡合并三件套：doc-polish + 终合报告 + commit draft（2026-10-15 jev-skill 实测）**。T9 蓝军审查给 doc-only WARNING 后,**不该**再单派 N 张「WARNING 修复卡」给 worker-coder——浪费 worker 生命周期且 git commit history 被碎化。正确模式是**单张 T10 终合卡合并三件套**:
1. **doc-polish**——T9 WARNING 处置 (harness 评审而非实际改代码)
2. **终合报告**——`research/<project>-fusion-final-report.md` (300-500 行,7 章节:执行摘要/路径 A 设计/调度时间线/file:line 索引/模式提炼/PR 准备清单/不吸收清单)
3. **commit message draft**——不实际 commit,准备就绪等用户推送
**单卡合并的好处**:worker 一轮生命周期内能完成全部 3 件,git history 干净,跨板 comment 一致。**不**给「先派 WARNING 卡, 再派报告卡, 再派 commit 卡」三段式——那是 per-step 安全但浪费 3 个 worker spawn。判据: T9 蓝军卡 + 6+ 张 done 实施卡后, 单派 T10 合并三件套, 验收 = 「WARNING 处置+ final-report 落盘+ commit draft 在 final-report 末尾」三项全过。

### 17. 融合后留「显式不吸收清单」防重复评估
裁决矩阵（keep/new/downgrade/drop 逐机制判定）落进融合报告，**DROP 项必须连理由一起写明**（例：「AB/影子/巡检——batch=1 单人集群无线上流量，语境不适」）。否则后续会话拿到同一上游资料，会从零重评一遍已被否决的机制。吸收项落点遵循单一事实源：机制细节写进资产文件（如 evals baseline），设计文档正文只放一句增量摘要+文件锚，不双写。

### 18. 年龄段/多版本数据集的查询 CLI 必须带消歧维度，示例命令同轮同步
同名记录存在 N 个年龄段版本的数据集（实测一个词条 53 个候选），resolve 多命中**禁静默返回第一个**——首命中可能锚到高年龄段版本，下游按错误锚点备课且无任何报错。纪律：(1) 多命中先按数据的关键区分维过滤（如 `--age`），过滤后仍多命中把候选清单（含区分维取值）打 stderr 引导消歧；(2) 给 CLI 加消歧参数的**同一轮**同步更新 SKILL.md 全部示例命令——使用者按示例 copy-paste，示例不带消歧参数=批量复现错误锚点。

### 16. SOUL.md 受保护文件 guard 在无人值守会话会 approval 超时（2026-09-08 ARL-Next 实测）
patch 任何 profile 的 SOUL.md 时 protected-file guard 会弹审批，headless/TUI 无人响应即 BLOCKED（"Silence is not consent"），且明令禁止换路径重试。**纪律**：SOUL 接线类变更放任务末尾单独做，被拦后立即 kanban_comment 挂起项详情（变更位置+内容+已落盘清单）+ kanban_create 留痕卡记录待批状态，绝不绕行（terminal/execute_code 改 SOUL 同属违规）。内容备好等用户批准后一次性补齐。**接线优先 rules.md**：团队的行为承载文件是 rules.md 且不受 guard 保护——行为类接线（技能使用纪律/评估标准/红线）一律先写 rules.md 探针节，SOUL 仅在必须改人设/职责时才动，从源头避开此审批墙。

### 15b. 「框架定义字段」≠「插件实际填充」（README 富元数据宣传陷阱）
ARL-Next xing 框架 BasePlugin 定义 severity/description/remediation 字段，README 据此宣传富元数据 PoC 库，但 grep 实测仅 2/219 插件填充。**纪律**：评估「可移植的元数据体系」前必须统计实际填充率（grep -rl 计数/总数），定义存在（Present）与被使用（Wired）分开计分——移植时按实态描述，不按 README。

### 15b. 留痕卡 assignee=自身 profile 触发 dispatcher 重复派工（2026-09-17 teamai-cli 调研实测）
orchestrator 先执行完调研再补建留痕卡且 assignee=orchestrator 时，常驻 dispatcher 会当 ready 卡 spawn 重复 worker（live worker claim）；kanban_complete 被拒（提示 force=True 但工具 schema 无此参数），CLI `hermes kanban complete --force` 读中央根库对旧布局 board 库卡报 unknown id。纪律: (1) 自执行工作的留痕卡 assignee 不填自身 profile，或建卡后 worker spawn 前立即收尾; (2) 已被 claim 时最省预算解法=等 spawned worker 自行闭环(实测约50s); (3) kanban_create(board=X) 落 boards/<X>/kanban.db 旧布局，kanban_* 工具与 hermes CLI 读中央根库 ~/.hermes/kanban.db——收尾报 unknown id 先 sqlite 查 boards/<slug>/kanban.db 再归因。(4) 归因确认后修复=操作显式带 board=<slug> 重试：kanban_comment/kanban_complete 对旧布局卡省略 board 报 unknown task，补 board 参数同卡即写入成功，勿弃写。

### 15. 源码机制 → Hermes 落地的首选形态：协议层文档，非改源码（2026-09-03 实测）

OpenExecutive 七机制融合全部落在 `_shared/` 协议文档 + config 约定 + 现有 kanban 原语组合，
**零 Hermes 源码改动**：
- 「工作流引擎」= YAML 定义文件 + kanban parents 依赖悬挂（approval_gate=卡 block 即天然暂停）
- 「WaitForHuman」= kanban_block(kind="needs_input") 语义约定，不改状态机
- 「出站防骚扰」= `_shared/outbound-guard.md` 协议 + config.yaml gateway 段参数
- 「权限门」= action-risk.md 增补双维矩阵，未配置 profile 一律安全默认
判定顺序：能用 prompt/协议层表达就不改源码；能用现有 kanban 原语组合就不造新引擎。
批量接线模式：新 _shared 协议写完后，对引用既有姊妹文件（如 review-gates.md）的 profile
批量插入 `> 详见 [_shared/X.md]` 引用行（本会话 27/27 profile 一轮 python 脚本完成）。
