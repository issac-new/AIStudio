---
name: design-doc-archaeology
description: "终态设计文档工程：会话考古+按域重组+5-lens评审+脱敏发布。触发：整理设计文档/文档丢失既有设计。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, documentation, archaeology, review, publication]
    related_skills: [adversarial-review-lens, harness-fusion-patterns, github-profile-distribution]
---

# Design Doc Archaeology（终态设计文档工程）

> 来源：2026-08-22 Hermes 终态设计文档三次返工实战（用户两次指出"丢掉了之前的设计"→ 会话考古 → 5-lens 评审 → GitHub 发布）。
> 核心教训：**写"系统设计文档"时，透镜会成为过滤器**——按单一视角（如本体论）重组会无声丢弃大量真实工程史。

## When to Use

- 用户要求整理/重构/终态化系统设计文档
- 用户说"文档丢掉了之前的很多设计"（返工信号——立即进入会话考古，不要在现有文档上打补丁）
- 需要从会话历史（sessions 库）挖掘散落的决策
- 设计文档定稿前的多 lens 评审
- 设计文档对外发布（GitHub/公开仓）前的脱敏

## 工作流（5 步）

### 1. 全史盘点（先盘点后动笔）

```bash
# 产出物三层盘点：落盘文档 / 规则文件 / 脚本+cron
ls -t workspace/research/*.md | head -50
ls ~/.hermes/profiles/_shared/*.md
ls ~/.hermes/bin/*.sh; cat ~/.hermes/cron/jobs.json
# git 时间线（有仓库时）
git log --oneline --since="..." -- research/
```

**铁律**：文档声称的"演进波次"必须对照文件 mtime + git log 验证——真实工作可能比已落盘文档多出数倍（本例：落盘文档只见 5 波，会话考古挖出 78 项决策分 5 个时代）。

### 2. 会话考古（用户说"从会话中搜集"时）

```bash
# 会话库分布：标题=设计入口，无标题=子代理 fan-out
sqlite3 ~/.hermes/profiles/<p>/state.db "SELECT id,title FROM sessions WHERE id LIKE '2026MM%' AND title!='' ORDER BY id;"
# 深挖：每个关键会话提取首条 user 消息（需求）+ 末条长 assistant 消息（结果）
sqlite3 <db> "SELECT substr(content,1,2000) FROM messages WHERE session_id='<id>' AND role='assistant' AND length(content)>1500 ORDER BY id DESC LIMIT 1;"
```

- **并行派子代理分窗口挖掘**（按月/时代切窗，每窗产出一份"决策清单"报告，带 session id 锚点）
- 早于集群创建的会话在**主库** `~/.hermes/state.db`（default profile）——别只看 profile 库
- sqlite 只读 WAL 库用 `file:$db?immutable=1`（-readonly 会报错 14）
- 锚点粒度要诚实：有的窗口只能拿到"日期+主题"拿不到 session id，附录如实声明

### 3. 按域重组为终态结构

自上而下的认知顺序（非版本叠加）：

```
系统定义（一句话+核心数字表）→ 设计哲学（从决策提炼，每条带跨时代证据链）
→ 演化史（时代叙事）→ 架构终态（分层）→ 决策台账（按域重组，非时间平铺）
→ 运行机制 → 债务与展望（诚实清单）→ 附录（数据源+局限声明）
```

- 证据链锚点格式必须与源报告**实际编号体系一致**（报告用 D1-D22 时写 B10→B18 就是死引用）
- 集群级计数声明分母口径（"11 个 cron"是单 profile 口径还是集群口径）
- 旧版本工件（v2/v3）**不是历史存档而是泄漏面**——移 ignored 目录，不留 research/ 直下

### 4. 定稿前 5-lens 评审（并行 delegate_task）

设计文档专属四个缺陷类（代码评审没有的）：

| 缺陷类 | 机械核查 |
|---|---|
| 幽灵机制 | 声称的 cron/服务/脚本逐一对照 jobs.json + launchctl list + 进程 |
| 契约漂移 | 文档 schema/枚举对照实现真值源（源码常量/DB schema）——"实机复验"只验数字不验契约是盲区 |
| 锚点诚实性 | 引用的编号/ID 在源文档 grep 可解析 |
| 泄漏面 | 密钥+端口+内网IP+绝对路径+旧版本工件（untracked≠安全） |

（评审发现分类：契约漂移→patch 文档对齐实现；幽灵机制→intent_gap。）

### 5. 发布（GitHub）三道闸

1. **公开变体**：另出 `-PUBLIC.md`——端口→`<placeholder>`、`/Users/<name>`→`$HOME`、grep 验证零残留 + 头部公开版声明
2. **提交前终扫**：`git diff --cached | grep -cE "sk-…|ghp_…|AKIA…|PRIVATE KEY"` = 0
3. **最小提交面**：混载工作区禁 `git add .`，显式 stage 任务文件，review `git diff --cached --stat`

## 交付物交付

终版 PDF 用 MEDIA: 行交付（TUI 渲染为可点击 file:// 链接，白名单三根：HERMES_KANBAN_WORKSPACE / ~/hermes-docker-sandbox/workspace / $HERMES_FILE_LINK_ROOTS）。

## Pitfalls

1. **单一透镜重组=无声丢史**（用户两次返工的根因）——先全史盘点再选结构
2. **"全部带锚点"式过度声明**——粒度混合就写粒度混合
3. **考古窗口有洞**（如某两日无标题会话密集）——附录诚实声明，不装穷尽
4. **subagent final summary 在 live transcript 中被截断**（…+N chars）——需要全文时读 `cache/delegation/subagent-summary-*.txt` 或从 task log 的完整行提取
5. **评审修正要两轮**——第一批报告送达后可能还有被截断隐藏的发现，完整 JSON 到达后复对一遍

## References

- 实战范本：`workspace/research/hermes-complete-design-doc.md`（Final v1.1）+ `review-5lens-disposition.md`（两轮 17 项处置台账）
- 考古报告四份：`design-history-0801-0810.md` / `design-mining-0813-0820-maturity.md` / `cluster-history/july-foundation-design-mining.md` / `soul_audit/early-design-mining/`

## Related Skills

- **adversarial-review-lens** — 评审纪律母本（default profile，本 skill 的 §4 是其在文档域的特化）
- **harness-fusion-patterns** — 融合工作流（本 skill 处理其"落地后"的文档化阶段）
- **github-profile-distribution** — 发布红线与 PII 清洗母本（default profile）