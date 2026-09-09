---
name: fusion-field-to-skill-flywheel
description: "FDE 融合与 Field-to-Skill 飞轮运转。触发：FDE/能力复利融合、挖掘提案裁决落地。"
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [skill-fusion, fde, field-to-skill, kanban, capability-compounding]
    related_skills: [open-source-skill-fusion, kanban-triage-stall-recovery, skill-library-maintenance, harness-entropy-management]
---

# FDE 融合与 Field-to-Skill 飞轮

> 2026-08-25 FDE-native 架构融合实战提炼（research/fde-native-architecture-fusion.md）。
> 与 `open-source-skill-fusion` 互补：后者是通用融合流程，本 skill 是「能力复利」这一类融合的领域知识 + 飞轮运转协议 + 三个实测陷阱。

## When to Use

- 融合 FDE/平台化/能力复利类外部理念（Time-to-Validated-Value、Use Case Pull、Field to Product）
- 运转或维护 Field-to-Skill 飞轮（skill-miner 挖掘 → 提案 → 裁决 → 落地 → 归档）
- 评审 skill-miner 产出的 SkillProposal（判断 create / 合并 / 拒绝）
- 融合落地涉及 kanban sqlite 数据或用 patch 改 markdown 表格时

## 一、FDE 可移植机制速查（六机制 + 不吸收清单）

| 机制 | 一句话 | Hermes 落点（2026-08-25 已落地） |
|---|---|---|
| TTVV 北极星 | 平台只优化"发现问题→验证价值"的时间；只观测不设 KPI | `bin/ttvv-report.py` + `ttvv-monthly-report` cron（基线 swarm heavy median 6.7m） |
| Use Case Pull | 能力从真实项目"长出来"，frequency≥3 才抽象，禁闭门规划通用技能 | Field-to-Skill 飞轮（见下节） |
| Asset Review 三分法 | 项目结束盘点：专属留项目 / 可复用进领域层 / 通用进平台核心 | `_shared/dod-checklist.md` §5（重型任务强制，`reusable_pattern` 标注供挖掘） |
| 失败回流 | 生产失败→失败样本→修复→回归 | dod-checklist §6 四类标签 `[context-gap]/[tool-failure]/[routing-error]/[capability-gap]` + `failure-pattern-monthly` cron |
| 六层上下文 | 数据/语义/知识/运行/用户/任务，缺层先补不硬执行 | `forward-deployed-protocol.md` §2.4 映射侦察四件套 |
| 三层边界 | Generate（应用层多生成）/ Reuse（能力层多复用）/ Govern（治理层多沉淀） | 融合候选排序公式：价值 ≈ 重复×稳定×业务价值×重建成本×治理需求（各 1-5） |

**明确不吸收**：低代码搭建器、多租户资源治理、企业 SSO、重型检索平台、预先规划大批量通用技能。

## 二、飞轮运转协议（首圈闭环实证：53 卡 → 17 聚类 → 3 提案全落地）

1. **挖掘**：platform-skill-miner 扫 done 卡（sqlite 只读 `immutable=1`），frequency≥3 硬门槛；1-2 次只标"观察项"
2. **提案**：四段式（触发→步骤→陷阱→验证）+ task_id 证据链 ≥3 + **去重对照表**（每个"不提议"也要给证据理由——最高频模式可能是已被充分覆盖的，不为凑数硬提）
3. **裁决**：图爸逐案（批准 / 合并 / 拒绝）。**合并优先于新建**——与既有 skill 重叠的提案 patch 进既有 skill，防 skill 膨胀
4. **落地**：skill_manage create 或 patch；新 skill 落盘后立即按 open-source-skill-fusion pitfall#6 验证可见性（索引收录 + 子会话加载）
5. **归档**：提案文件头加落地状态行 → 移入 `_shared/skill-proposals/archived/`，目录清空等下轮
6. **cron**：`skill-mining-weekly`（周一 10:00）= 周度挖掘 + 每月 1 日所在周 14 天全量窗口 + 存量提案评审通道（评审意见写提案头，移 `archived/pending-decision/` 等裁决）+ evals 摘要落 `~/.hermes/evals/skill-mining-<date>.md`

**提案质量判据（蓝军视角）**：协议执行率类发现（如侦察摘要 ~13%、staged-action ~10%）的正确落地形态是「模板 + 机械校验 + 审计探针」patch 进现有协议 skill，**不是**再立一个新协议——「有协议无模板=低执行率」是跨协议共性，加协议只会加剧。

## 二·五、内环夜链（evo-nightly，2026-09-05 上线）

飞轮内环：每晚 02:10 cron（no_agent）跑 `~/.hermes/evo/evo_nightly.py` 七步幂等链（S1 采集→S2 探针→S3 聚合→S4 合成卡→S5 提案→S6 晨报邮件→S7 ledger），设计文档 §5.13。P1 零自动落地，全部 staged 提案晨报人审。外环（本 skill 上文周度协议）不变。

**三个实测新坑**（P1 落地踩中）：

1. **`hermes kanban create` 的 `--board` 在父命令级**：正确语法 `hermes kanban --board swarm create ...`；子命令无 `--board` 旗标。不带板名落旧库 `~/.hermes/kanban.db` 且 dispatcher 不扫（老坑再现）。`--json` 输出是 **pretty 多行 JSON**，必须整段 `json.loads(stdout)`，按行找 `{` 解析必炸。
2. **编排器崩溃可能发生在建卡成功之后**：S4 先 `subprocess.run(create)` 后解析输出，解析崩→重跑→重复建卡（实测同 prompt 两张 synth 卡竞争写同一提案文件）。修法：create 与解析之间用 `--idempotency-key`（如 `evo-synth-<date>`），幂等键天然去重；或状态文件先记「卡已建」再解析。
3. **shell 变量拼 `file:`/`dir:` 前缀时 tilde 不展开**：`sqlite3 file:~/path` 和 `--workspace "dir:~/path"` 在引号内/词中位置 `~` 保持字面量→路径不存在静默失败。一律 `$HOME`。
4. **orchestrator profile 的 cron 脚本解析路径是 `~/.hermes/profiles/orchestrator/scripts/`**，不是 `~/.hermes/scripts/`（09-05 evo 三 job 全部 "Script not found" 实锤；与 ontology-metadata-watchdog 同款）。形态：py 脚本两处放真实副本，sh 放 profile 侧真 shim（`exec bash <真实路径> "$@"`）→ 手动跑用 `~/.hermes/scripts/` 版本，cron 跑 profile 侧。改完 `hermes cron run <job_id>` 立即验证，别等下一次定时。
5. **cc-switch（GUI 应用）DB 无代理级并发限流旋钮**，429 防护只有熔断切板凳。Hermes 侧限流路径：dispatcher 每 tick 热重读 config.yaml（`kanban_db_dispatch.py:2336-2340` 实锚），改 `max_in_progress` ≤60s 生效无需重启——`evo_concurrency_watchdog.py` 依此做三档动态降档（L0 12/4 → L1 6/2 → L2 2/1；信号源=cc-switch `proxy_request_logs` 按 bigmodel 账户聚合 429/503 + `provider_health` 熔断位；降档即时；升档=试探-回退：近 5min 0 错误+≥5 条请求即立即恢复，升后 10min 内复发则指数退避 10/20/40min——固定迟滞已否决：worker 本身是活跃探针，「没流量」≠「没事」必须看请求量；绝不 yaml round-trip 重写 config，只正则行内替换两个数字）。

## 三、三个实测陷阱（2026-08-25 踩中并修复）

### 1. kanban sqlite 时间戳双格式（ttvv-report 实测）

kanban DB 各 board 的 `created_at`/`completed_at` **格式不一致**：新记录是 epoch INTEGER，旧记录（如 hack board 2026-08-24 的 3 条）是 TEXT `'YYYY-MM-DD HH:MM:SS'`。直接 SQL 算 `completed_at - created_at` 对 TEXT 行得出巨大负数。

**纪律**：写 kanban 统计脚本时**不要假设时间戳是 epoch**。用 Python 统一解析（`isinstance int → 直接用；str → isdigit 或 strptime('%Y-%m-%d %H:%M:%S')`），解析失败的行跳过并计数报告（不静默吞）。参考实现：`~/.hermes/bin/ttvv-report.py` 的 `to_epoch()`。

### 2. patch 改 markdown 表格的 `||` 缺陷

用 `patch` 工具（V4A 模式）在 markdown 表格中**同时删一行旧行、加多行新行**时，diff 输出会给新行产生**双管道前缀 `|| col | col |`**——patch 工具按原样写入，表格当场破格式。本轮连续踩中两次（核心数字表、债务表）。

**纪律**：patch 表格后**必读回目标区域复验**；或一次性 grep 兜底：
```bash
grep -n '^||' <file>   # 有任何输出 = 表格破了，逐行修掉多余 |
```
大改表格（>3 行变动）时优先 `write_file` 重写整个表格段，不用 patch。

### 3. 跨 profile skill patch 的归属判断

融合落地常需 patch 的 skill（如 `kanban-triage-stall-recovery`、`soul-protocol-block-insertion`）实体在 `~/.hermes/skills/`（default profile master），orchestrator 侧只是 symlink。直接 `patch` 触发 cross-profile soft guard。当前会话是图爸**前台在场并明确裁决**（"1批准，2合并，3加"）后，用 `cross_profile=True` 落地——**后台/无人值守会话不要这样做**：按 open-source-skill-fusion pitfall#19，审批超时会 hard-block，替代路径是做成独立 skill 并在 Related Skills 交叉引用。

## 四、落地顺序纪律（多 Harness/多机制融合时）

按「已落地→零代码→shadow→代码」排序，每阶段后停等验收（图爸裁决词如"全部"/"1批准，2合并"再继续），不连续推进。零代码形态优先级：cron + 文档 patch > 新脚本 > 改源码。TTVV 用 shadow（只观测）先行，失败标签用文档级四类下拉（不增加 worker 写作量）。
