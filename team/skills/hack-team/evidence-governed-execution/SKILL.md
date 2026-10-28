---
name: evidence-governed-execution
description: "证据门控执行——三源融合（CyberStrikeAI 证据门+Jev 治理+C2 危险分类、Sonic 长程执行纪律、VulnHouse 验收四策略）。hack 卡验收防虚报与长程不塌的核心防线。Use when 渗透/审计卡收尾验收、危险动作门控、长程卡防塌。"
version: 1.0.0
author: worker-coder
license: MIT
metadata:
  hermes:
    tags: [hack-team, evidence-gate, governance, long-horizon, anti-hallucination, fusion]
    related_skills: [pentest-methodology-fusion, scope-gate, clef-jev, longhorizon-harness-research, worker-completion-independence-verification]
---

# 证据门控执行 (Evidence-Governed Execution)

> 融合来源（2026-10-28，卡 t_58855791）：
> - **CyberStrikeAI**（源码级，AIPentest/CyberStrikeAI main tarball 2026-10-27）——证据门/Jev 治理/C2 危险分类/回放卫生
> - **Sonic Harness**（**转述源降权**：闭源商业产品蛙池 AI Desktop，源=公众号技术报告拆解+前置战报，无 file:line，引用不得升格为源码证据）——长程执行纪律
> - **VulnHouse 验证引擎**（前置战报转述）——验收器四策略
> 裁决矩阵全文：`~/.hermes/shared/research/hexstrike-cyberstrike-20261022/fusion/FUSION-REPORT.md`

## When to Use

- hack team 任何卡**收尾验收**时（防虚报：完成声明必须钉在真实执行证据上——toolEvidence 证据门）
- 执行**危险动作**前（进程杀死/文件上传/持久化/端口转发/C2 类操作——危险七类强制审批）
- **长程渗透卡**（多轮/夜间无人值守/靶场）派工与执行纪律——无 ask、forge_attempts 防伪造
- **会话恢复/续跑**时（注入卫生，防旧系统指令复述攻击）
- 设计**靶场/漏洞验证**验收方案时（四策略选型）

---

## §1 证据门（验收防虚报）

> 核心判据：**toolEvidence 证据门**——引用不存在的执行=虚报，整条丢弃。以下 1.1-1.6 六个机制共同构成「声明→证据→裁决」链。

### 1.1 toolEvidence 三判定规则（源码级，CyberStrikeAI）

来自 `internal/attackchain/node_evidence.go`（60 行纯逻辑，零平台依赖）——把「LLM 生成结果」降级为「LLM 起草、宿主裁决」：攻击链/汇报中的每个"执行过 X"节点必须钉在宿主签发的真实执行 ID 上。

对每个非 target 节点执行 `keep(citedID)`（node_evidence.go:51）：

| 判定 | 规则 | 处置 |
|------|------|------|
| 引用不存在 | cited ID 不在轨迹真实 tool_call_id 集合（real）内 = 编造 | **直接丢弃节点**（builder.go:981 "丢弃缺少真实工具调用支撑的攻击链节点"） |
| 缺引用+全可见 | 节点没填 ID，但所有真实 ID 都在模型可见范围内（shown=real）——本可照抄却没抄 = 仍视为编造 | **丢弃** |
| 缺引用+确有截断 | 没填 ID，且确有真实 ID 被 token 预算截断出模型视野 | 放过（ID 可能只是被截掉） |
| 证据不可枚举 | 证据集合无法构建（newToolEvidence 返回 nil，node_evidence.go:20） | **判定整体关闭，不做任何节点裁决**（宁不判不误判） |

**防空转前置**（builder.go:148-156）：无任何真实工具执行记录 → 直接返回空链，不给 LLM 编造机会。

**hack 卡落地**：收尾验收时，metadata.findings / 回报中每条「已执行/已验证」声明必须对应可查的执行留痕（命令输出、grep -c 实数、文件 mtime）；引用不存在的执行=虚报，整条丢弃并 comment 记录。与 worker-completion-independence-verification 联用，本门**更严**：缺引用也拦（不止是复核，是没有引用本身就是问题）。

### 1.2 Auditor 两阶段撤离（转述级，Sonic S2）

- **阶段一（复核）**：Auditor 挂只读工具逐条独立复现/反驳（自跑 cat+sha256sum 验 flag，不信 Executor 转述）。
- **阶段二（裁决）**：harness **收回全部工具后**才填 verified/unverified/refuted 裁决——防「裁决时补做复核」把两个角色混成一个。

**落地**：复核结论与最终裁决分两步输出；裁决文本中不得出现新执行的工具调用（那说明裁决未与复核分离）。

### 1.3 Executor narrative 不入证据（转述级，Sonic S3）

Auditor 仅采信**环境直读 + 只读工具观察**；Executor 的过程描述再详尽也不据此下判断（与 §1.1 互补：C1 管执行 ID 引用，S3 管叙述性自述）。

**落地**：验收 reviewer 独立读盘上产物/重跑命令，worker 的叙述只用于定位不看作为证据。

### 1.4 完成态双准入 + forge_attempts 计数（转述级，Sonic S4）

翻 completed 必须同时满足：①最新审计裁决 verified ②工作区 clean（无审计后未声明的改动）。任一不满足 → harness 强制降级 untrusted **并记一次 forge_attempts（伪造尝试计数）**——让伪造行为可统计可追溯，不是一拦了之。

### 1.5 边渗透边记录 + 待落库条目（源码级，CyberStrikeAI）

来自 pentest-blackboard 节奏（agents/vulnerability-triage.md:60-62 引用）：
- 每确认新认知**立即**落库（不等任务收尾）——防上下文压缩丢细节
- 每验证可复现漏洞立即记漏洞条目
- 子代理无落库工具时，在交付物末尾给**「待落库」结构化条目**（fact_key 建议+summary+POC 要点）供协调者写入

**落地**：hack 长程卡=阶段成果即时 kanban_comment/文件落盘；hindsight_retain 在确认时点调用而非收尾时批量补。

### 1.6 快照大文件近似校验（转述级，Sonic S5）

审计快照：小文件 sha256 全量；超阈值大文件退 size+mtime 近似——防审计快照本身拖垮长程任务。（本机 workspace_audit.py 落地待办，见 FUSION-REPORT §8.1）

---

## §2 治理门（执行前拦截）

> 三道闸：①结构化审批（Jev 四问→clef-jev）②**危险七类**任务强制 HITL ③确定性 scope 门（引 scope-gate）。

### 2.1 Jev 审计问答 → clef-jev 映射（源码级，CyberStrikeAI jev.go）

审批/裁决不靠自由文本判断，用**结构化问答集**（jev.go:29）：

| Jev 问项（jev.go:29） | 类型 | clef-jev 对应 |
|---|---|---|
| destroys_availability（破坏业务可用性） | Noul 判断 | `noul` |
| irreversible_data_loss（不可逆数据丢失） | Noul 判断 | `noul` |
| credential_or_acl_change（凭据/ACL 变更） | Noul 判断 | `noul` |
| config_tamper（配置篡改） | Noul 判断 | `noul` |
| authorized_pentest_payload（授权渗透 payload） | Noul 判断 | `noul` |
| approve/reject 终裁（各带判据） | Choice | `choice` |

**裁决纪律**（jev.go:137，代码持裁决权非提示词）：
- 任一破坏性 Noul ≥ 0.55（jev.go:12）→ reject
- Choice reject 且置信 ≥0.85 且（有组织策略 或 最高破坏分<0.35 且渗透分<0.5）→ reject
- **其余默认 approve**（显式取舍：渗透场景 fail-open，注释原文 jev.go:136-137）
- 裁决理由**带分数回填**（如"命中拒绝规则：破坏业务可用性=0.78"）

**防 context rot**（jev.go:83）：state 只保留关键字段，大字段截断 8000 runes；组织策略作为 state 注入而非 system prompt（"被当作状态评估，不是聊天"）。

**落地**：hack 卡高危裁决走 `clef-jev` skill 的 choice/noul/score 三原语；阈值与裁决映射写进调用脚本而非提示词。

### 2.2 C2 危险七类 + OPSEC 三件套（源码级，CyberStrikeAI）

**危险任务七类**（c2/types.go:114 IsDangerousTaskType 硬编码，强制 HITL 审批）：

```
KillProc / Upload / SelfDelete / PortFwd / SocksStart / LoadAssembly / Persist
```

**OPSEC 三件套**（c2/manager.go EnqueueTask 管线）：
1. **命令拒绝正则**（manager.go:507）：exec/shell 任务逐条匹配 CommandDenyRegex，命中 403 command_denied（含匹配模式回显）
2. **并发上限**（manager.go:527）：MaxConcurrentTasks 超限 429 concurrent_limit
3. **危险任务 HITL 桥**（manager.go:565）：与工具层审批同一判定源；审批 pending 期间任务不入派发队列，拒绝即 failed

**落地**：hack team 派工红线清单——凡涉及上述七类动作的卡，body 必须显式声明授权与审批路径；BypassHITL 仅白名单机制可用（manager.go:489）。

### 2.3 目标域门禁（keep，引 scope-gate）

确定性 scope 门主体已由 `scope-gate` skill 覆盖（scope.txt 契约+word-boundary 正则+PreToolUse 硬阻断）。CyberStrikeAI toolguard 的**增量**（toolguard.go）：百分号解码防编码绕过（decodePercentEscapes, toolguard.go:259）+ 默认 .gov 拦截合规底线（toolguard.go:62）——scope 校验前先做 URL/百分号解码展开。

---

## §3 长程执行纪律（Sonic 层，全部转述级标注）

### 3.1 工具面积单调链（S1）

角色工具集构造上锁死单调链：Manager tools=∅ < Auditor 只读工具 < Executor 通用工具，harness 可静态验证。hack team 对应：**hack-auditor 零工具纯推理分诊（见 §5.2）+ 4-profile 物理隔离**；工具面积按角色单调，谁持有状态谁工具最少。

### 3.2 无 ask 动作（S6，分歧裁决）

hack team 长程渗透/靶场卡：Manager 型 worker **决策仅 execute/done/blocked 三项，禁 ask**（禁 clarify 拖延、禁「等待确认」式挂起）。遇阻必须 `kanban_block(reason=blocked_reason 说清缺什么)` 明确退出——重派带 worker_context 比挂起等答案省预算。例外不矛盾：授权边界类问题必须立即 block 而非猜测（block ≠ ask 拖延）。有人值守短卡保留 needs_input 语义。完整论证：FUSION-REPORT §2。

### 3.3 每轮三落盘点（S8）

Manager 决策后 / Executor 报告后 / Auditor 裁决后**各一次**原子落盘（.tmp + os.replace）——崩溃损失限当前轮。hack 长程卡=每个阶段交接点落盘（comment/文件），不等大里程碑。

### 3.4 resume 只恢复持状态角色（S9）

仅 Manager（持跨轮状态的角色）需要从磁盘反序列化重建记忆；Executor/Auditor 每轮新建无需恢复。对应 Hermes：工作区状态外置（长会话卫生），恢复时只重建状态文件，不回放全历史。

### 3.5 设计依据：消融数据引用（S7，downgrade——转述未验证）

VulnHouse ~30 题：完整版 68%；去掉完成态拦截 41%（幻觉自证累积）；还原单 Agent（Manager 挂全套工具）33% + 平均每任务 2.1 次完整性违规。→ **MEA 物理隔离是必要条件而非优化**。作为「为什么用多 profile 物理隔离而非单 Agent」的实证引用（外部转述数据，不得作为本机验收标准）。

---

## §4 会话卫生（源码级，CyberStrikeAI）

### 4.1 只回放人类账本（runner.go:728/691）

会话恢复/续跑时：**只回放人类原文账本，绝不重注入旧系统指令**（防攻击链摘要等生成内容被当作指令复述执行）；回放内容同样过 reduction——原始工具输出不能借回放通道重新进入上下文。降级路径（reasoning_trace.go:12）：完整轨迹缺失时用 reasoning trace 近似，并标注非严格回放。

### 4.2 索引随压缩刷新（eino_summarize.go:484 + blackboard_refresh.go:16）

上下文压缩（summarization）后**重建记忆索引块并替换**系统提示里的旧索引——防索引随压缩腐烂指向已截断内容。hack 长程卡：每次上下文压缩后，重读关键台账文件重建「当前事实索引」，不沿用压缩前记忆里的行号/状态。

### 4.3 节点级审计回放 + 挂起可恢复（workflow_run.go:46 + checkpoint_store.go:13 + hitl_wait.go:89/51）

- 长任务每个节点留 input/output/耗时/错误的**结构化审计记录**（ReplayRun 逐步回传）
- 审批挂起状态**双通道持久化**（channel + DB）：重启后从 DB 读决策恢复执行，不丢挂起现场
- 落地：hack 长任务在审批等待/长 subprocess 前后落盘状态，恢复时从盘上状态续跑而非凭记忆

---

## §5 验收器选型与角色模式

### 5.1 VulnHouse 验证引擎四策略（S10，转述级）

| 策略 | 适用题型 | 判定机制 | hack team 借鉴点 |
|------|---------|---------|-----------------|
| **flag_capture** | Web 渗透/信息读取 | 容器指定路径写随机 Token，Agent 读到并提交；精确/包含/正则三匹配；**回传信息脱敏** | 靶场类验收黄金标准；脱敏防验证接口变泄露通道 |
| **effect_proof** | 需环境可观测变化 | 出题者定义检查命令+预期输出，逐项比对 | 对应「验收命令 frozen」；可补**操作前后双阶段**比对 |
| **poc_crash** | 源码审计/内存安全 | 构造输入使目标崩溃（ASan）；支持**双容器差分**（vul 崩、fix 不崩） | 双容器差分是白盒审计卡强判据，比单点崩溃可信 |
| **oracle** | 业务逻辑/复杂攻击链 | 自定义脚本输出 JSON 判定，支持前后双阶段 | 复杂链路任务的自定义验收器 |

四步流水线：证据采集→比对→裁决→**证据链哈希封装防篡改**。

### 5.2 零工具纯推理分诊角色（C14，源码级）

来自 agents/vulnerability-triage.md 的角色设计模式（补 hack-auditor SOUL 概念引用的源码级增量）：
- **零工具**（front-matter tools:[]）纯 LLM 推理，无任何执行面
- **授权判断显式剥离**（:9-24 反质询条款）：授权由平台治理层垄断，子代理不质疑不核实不等待批准
- **输入前置硬约束**（:26-31）：不拥有父代理上下文，仅以 task.description 为准；缺目标/范围/证据源/成功标准时返回缺失字段清单，**不得自行猜测补造前提**
- **不武器化**（:32-36）：不输出可直接执行的利用链/payload/持久化参数；优先只读最小影响验证；禁递归派单
- **四段结构化分诊单**（:47-58）：Candidate Findings（类型/影响面/证据线索/置信度 low-med-high/最小证据集）→ Verification Paths（假设/访问控制点/正负响应特征/接手阶段）→ Prioritized Backlog（Top-5 带理由）→ Uncertainties & Missing Evidence
- 每轮收到**项目黑板/事实索引**注入（task 上下文 enrichment）

**落地**：hack-auditor 分诊输出按四段格式；派分诊类子代理时 tools 置空+授权剥离条款写进卡 body。

---

## 与本机资产映射（防双事实源）

| 本报告机制 | 本机等价/联动物 | 关系 |
|---|---|---|
| toolEvidence 证据门 | worker-completion-independence-verification / claim-check | 同源更严（缺引用也拦），联用 |
| Jev 四问 | clef-jev（choice/noul/score） | 实现载体 |
| scope 门 | scope-gate | 主体在彼，本文仅增量（防编码绕过） |
| 攻击链方法论/工具编排 | pentest-methodology-fusion v2.0.0 | 姊妹篇（本 skill 管证据治理，彼管方法论） |
| MEA 三角色/任务契约 | longhorizon-harness-research | Sonic 与 LHH 同构部分以 LHH 为准，本文只载增量 S1-S10 |
| 长会话状态外置 | long-session-hygiene | S8/S9 与之互补 |

## 来源粒度声明

- CyberStrikeAI 条目=file:line 源码级（tarball 2026-10-27，锚点经 T2 卡 70 条 grep 核验+蓝军 21/21 PASS）
- HexStrike 条目=file:line 源码级（tarball 2026-08-03，T1 卡 38 锚点+蓝军 10/10 PASS；其增量落 pentest-methodology-fusion v2.0.0，本文不重复）
- Sonic/VulnHouse 条目=**转述级**（闭源，无源码）：机制细节以文章转述为上限，引用时必须标注转述，禁升格为源码证据
