# SkillProposal: provider-meltdown-classification-guard [create]

> **产出**： platform-skill-miner · 2026-08-31 · 半月全量窗口扫描（2026-08-17~2026-08-31，125 张 done 卡）
> **状态**： ⏳ 待图爸最终裁决（本 job 只提议不落地，未调 skill_manage）
> markings: [TLP:GREEN, EYES-ONLY:platform]

## 评审意见（2026-09-07，platform-skill-miner 同 job 评审通道）

**判定：✅ 批准（建议合并为 `cc-switch-provider-troubleshooting` 的 patch 而非独立 create，二选一交图爸）**

- **证据链复核**：6 条 task_id 均可在 swarm/platform 板回溯（本窗口 2026-09-01 前完成，跨窗口复发模式成立）。频率 6/125 达标。
- **去重核查**：与 `cc-switch-provider-troubleshooting`（代理侧诊断）、`orchestrator-worker-failure-triage`（spawn 即死三分类，含 provider 熔断复位命令）存在职责交叠。特别是 orchestrator-worker-failure-triage 的「分类 3」已覆盖「provider 层熔断风暴：复位熔断 + 切 provider」——本提案的增量点收窄为 **① rc=0 误判 protocol_violation 的分类纪律（overloaded→tempfail）② 自愈层双通道投递**。
- **裁决建议**：方案 A（推荐）＝将 ①② 作为 patch 并入 `orchestrator-worker-failure-triage`（同为编排侧，读者同一人），引用 cc-switch-provider-troubleshooting 做诊断层；方案 B＝独立 create 并在 When to Use 与上述两 skill 写明三向边界。
- **时效注记**：t_a987a4f9 已落地 error_classifier tempfail 分类，根治侧已生效；本提案价值在固化**编排纪律侧**（reset 前先探活、双通道投递）。若图爸裁决合并，删除与 orchestrator-worker-failure-triage 重复的熔断复位步骤。

## 触发条件

当 worker 任务首次 API 调用即失败、干净退出（rc=0）却被 dispatcher 记为 `protocol_violation` / 误判协议违规、顶到 `consecutive_failures` 上限被 block 时——**在 reset 计数器重派或改 worker 退出分类前**，加载本 skill。典型信号：`HTTP 503 所有供应商已熔断` / `HTTP 502 上游 Connect error`（Endpoint 127.0.0.1:15721，cc-switch 本地代理）+ `重试3次全挂 → rc=0 → 误判协议违规`。

## 证据链

| # | task_id | board | assignee | snippet（可回溯 comment） |
|---|---------|-------|----------|---------------------------|
| 1 | t_37053748 | swarm | worker-coder | 「三个任务 spawn 失败**非任务本身问题**，是模型供应商瞬时熔断：worker 日志统一报 HTTP 503: 所有供应商已熔断...首次 API 调用即 503，重试3次全挂 → rc=0 干净退出 → 误判协议违规...consecutive_failures 顶到 2=failure_limit 被 block。处置：重置 consecutive_failures=0 + kanban_unblock 重派」 |
| 2 | t_436a8478 | swarm | worker-researcher | 「同 t_37053748：模型供应商瞬时熔断（HTTP 503 所有供应商已熔断，Endpoint 127.0.0.1:15721），首次 API 调用即失败，rc=0 干净退出被误判协议违规。熔断窗口 11:35，16:58 探测已恢复。非任务本身问题。重置计数器 + unblock 重派」 |
| 3 | t_66d1140b | platform | platform-ontology-curator | 「失败根因诊断（orchestrator）模型供应商瞬时熔断（HTTP 503 所有供应商已熔断）...重置计数器 + unblock 重派。属 transient 故障」 |
| 4 | t_7c07c663 | swarm | worker-coder | 「P1-2b spawn 失败**非任务本身问题**，是模型供应商瞬时熔断...HTTP 503 所有供应商已熔断 → HTTP 502 请求转发失败: 上游请求失败 client error (Connect)...首次 API 调用即失败，rc=0 干净退出被误判协议违规...consecutive_failures=2=failure_limit 被 block。处置：重置 consecutive_failures=0 + unblock 重派」 |
| 5 | t_a257ada7 | swarm | worker-researcher | 解剖②根因：「run60/61/62 不是模型行为问题，是**供应商熔断被误分类为 clean_exit**，触发了不可能的即时重试。证据：正要 kanban_complete 时 turn 内 3 次重试全部撞 HTTP 502（127.0.0.1:15721 本地代理 cc-switch 上游 Connect error）」 |
| 6 | t_a987a4f9 / t_6f7dd0d6 | swarm | worker-coder | 根治落地：「worker 退出分类扩类（overloaded→tempfail）+ protocol_violation 重试退避」——`agent/error_classifier.py` 新增 `_LOCAL_PROXY_MELTDOWN_PATTERNS`（cc-switch 类本地代理全熔信号），tempfail 走重试退避而非记 protocol_violation（模型违规） |

**频率**: 6 / 125（含 4 例 explicit 熔断误判 block + 1 例根因取证 + 1 例根治落地；占窗口内有 spawn/代码交付任务的高比例复发）

## 四段式内容

### 1. 触发条件 → 具体信号
- 任务 log 首行即 `HTTP 503 所有供应商已熔断` / `HTTP 502 ... Connect error (127.0.0.1:15721)`
- 干净退出 `rc=0` 却带 `protocol_violation` 标记
- `consecutive_failures` 顶到 `failure_limit`（默认 2）被 block
- worker 报告「首次 API 调用就失败」（区别于「做到一半才挂」）

### 2. 标准步骤
1. **识熔断**：见以上信号即判定为 provider meltdown（环境级暂态故障），**非任务/模型问题**——不归咎 worker。
2. **探活**：到上游恢复窗口后实测代理存活 `curl -sS http://127.0.0.1:15721/health`（或根路径 404 属正常无路由，但需 LLM 调用实测成功返回）。
3. **重置+重派**：`consecutive_failures=0` + `kanban_unblock`（transient 故障，按既有处置）。
4. **改分类（根治侧）**：在 `error_classifier.py` 加 `_LOCAL_PROXY_MELTDOWN_PATTERNS`，将 `overloaded→tempfail`，使熔断走重试退避而非记 protocol_violation（已落地于 t_a987a4f9，引用为范例）。
5. **自愈层联动**：cron 失败双通道投递（local 失败改投 operator）+ drift alert 重告警，避免失败通知进虚空（参考 t_a257ada7 解剖③）。

### 3. 陷阱
- **「rc=0 干净退出」≠「worker 违规」**：熔断窗口内首次调用即 502/503，worker 没机会干活，误记 protocol_violation 会冤杀无辜 worker（t_37053748 前次 4 连冤案 t_cc655ecb）。
- **重复 reset 不解决问题**：只 reset 不探活，下一 tick 仍熔断 → 应等窗口恢复。
- **分类缺失放大伤害**：无 `tempfail` 类别时，熔断被记 protocol_violation，触发「不可能即时重试」（t_a257ada7 解剖②）。
- **自愈层零通知**：cron deliver=local + failure_streak=135 仍无人知（t_a257ada7 解剖③）——熔断期任务静默消失。

### 4. 验证（如何机械验证 skill 生效）
- 窗口内「首次调用即 503 → block」类卡，100% 在 comment 中标注 `transient/provider-meltdown` 而非 `protocol_violation`。
- `error_classifier.py` 含 `_LOCAL_PROXY_MELTDOWN_PATTERNS` 且单测覆盖（已在 t_a987a4f9 落地，本 skill 固化该纪律）。
- 熔断恢复后任务重派成功率可机械统计（block→done 计数）。

## 与既有 skill 关系

- **补充 `cc-switch-provider-troubleshooting`**（devops，已存在，覆盖「503 所有供应商已熔断」的**代理侧诊断**）：该 skill 教你怎么查 cc-switch 代理本身；本 skill 聚焦**worker 退出分类（overloaded→tempfail）+ orchestrator 熔断窗口 unblock 纪律 + 自愈层双通道投递**，代理侧诊断之外的 worker/runtime 侧闭环。
- 需 curator 裁决：独立建 `provider-meltdown-classification-guard` 还是并入 `cc-switch-provider-troubleshooting` 加一节。建议**独立**（职责边界：诊断 vs 分类/编排纪律），但引用前者避免重复诊断步骤。
- 相邻不重叠：`adversarial-review-lens`（评审立场）、`worker-completion-independence-verification`（验收纪律）。

## 预期收益

- 消除熔断误判 protocol_violation 导致的无辜 worker 连环冤杀（t_cc655ecb 4 连案类不再发生）。
- 固化 `tempfail` 重试退避分类，消除「不可能即时重试」烧 token 竞态。
- 自愈层双通道投递纪律补上「失败通知进虚空」盲区。
