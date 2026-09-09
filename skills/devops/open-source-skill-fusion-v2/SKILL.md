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
- 执行前：cognition-self-check, cognition-lattice(239偏差/712思维模型)
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

读取结果：完整报告在
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

### 16. SOUL.md 受保护文件 guard 在无人值守会话会 approval 超时（2026-09-08 ARL-Next 实测）
patch 任何 profile 的 SOUL.md 时 protected-file guard 会弹审批，headless/TUI 无人响应即 BLOCKED（"Silence is not consent"），且明令禁止换路径重试。**纪律**：SOUL 接线类变更放任务末尾单独做，被拦后立即 kanban_comment 挂起项详情（变更位置+内容+已落盘清单）+ kanban_create 留痕卡记录待批状态，绝不绕行（terminal/execute_code 改 SOUL 同属违规）。内容备好等用户批准后一次性补齐。

### 15b. 「框架定义字段」≠「插件实际填充」（README 富元数据宣传陷阱）
ARL-Next xing 框架 BasePlugin 定义 severity/description/remediation 字段，README 据此宣传富元数据 PoC 库，但 grep 实测仅 2/219 插件填充。**纪律**：评估「可移植的元数据体系」前必须统计实际填充率（grep -rl 计数/总数），定义存在（Present）与被使用（Wired）分开计分——移植时按实态描述，不按 README。

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
