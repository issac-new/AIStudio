# OpenExecutive 源码级调研报告（v2，file:line 可追溯）

> 调研方法：tarball 直下 clone → 分层映射 → 定向深读关键模块（`open-source-skill-fusion-v2` 流程）
> 源码规模：508 个 .py 文件 / 10MB；core 模块 28 个目录，最大为 workflows(15.9k 行) / orchestrator(11.1k 行) / api(9.5k 行)
> 已对照上次网页碎片分析：修正 3 处遗漏、2 处误读
> 调研日期：2026-09-03

---

## 一、上轮报告的遗漏与修正

| # | 上轮遗漏/误读 | 源码实据 | 重要性 |
|---|--------------|---------|--------|
| 1 | **完全漏掉 Committee 对抗评审机制** | `orchestrator/committee.py:1-95`——draft → 3 reviewers 并行 → 1 revision 单轮评审；reviewer 由"1 质量评委 + 2 本轮实际咨询过的专家"组成（fallback cso/cfo） | **核心机制，Hermes 可直接对照 kanban review 生命周期增强** |
| 2 | **完全漏掉 outbound_guard 出站防骚扰门** | `orchestrator/outbound_guard.py:1-80`——所有主动外发 DM 经唯一 chokepoint，三控制：内容去重（160 字符前缀+空白折叠+casefold 对称归一化）/ 每人每窗限频 / 安静时段；fail-open 设计（内部错误放行） | **Hermes cron/Gateway 主动推送可直接借鉴** |
| 3 | **完全漏掉动态工作流引擎** | `workflows/dynamic.py:1-60`——`DynamicWorkflow` 无每工作流代码，**解释执行**用户定义步骤：specialist → approval_gate → synthesis；`_FlatFormatter` 拒绝属性访问/索引/位置字段防模板注入 | **比"18 个预制工作流"更有融合价值** |
| 4 | **完全漏掉 failures/ 失败案例知识库** | `knowledge/builtin/failures/strategy/aol-time-warner.md` 等——frontmatter 元数据（domain/topic/company/year/failure_type）+ 结构化段落（Situation/What Happened/Root Cause/Key Decision Failures/Lessons）；8 域全覆盖 | **Hermes failure-mode-playbook 的成熟样板** |
| 5 | **完全漏掉 monitoring 外部信号监控管线** | `monitoring/pipeline.py:1-50`——watchlist 驱动，7 类 source adapter（edgar/rss/stock/page_watch/vendor_status/query）；信号经 triage 提升为 alert；per-source try/except 隔离 + UNIQUE(dedup_key) 幂等 | **Hermes platform-skill-miner 之外的第二种"主动感知"模式** |
| 6 | **误读：eval 只有 29 场景** | 实为 `evals/_scenarios/` 42 个 YAML（chat/triage/workflow/mcp/identity/cross_domain 等 10 类），用户可经 API 增删持久化（`evals/scenarios.py:11-20`） | |
| 7 | **误读：权限门只在文档层** | `departments/authority.py:gate_action()` 是真实可执行代码，三级 AuthorityLevel（auto_execute/propose_only/escalate）+ AuthorityScope 细分（spend_lt_2k/hiring_signoff 等）+ 审批人可用窗口路由（`departments/authority.py:74-128`） | **Hermes HumanGate HIGH/MEDIUM/LOW 可直接对照升级** |

---

## 二、按"可融合度"重排的机制清单（源码实据）

### Tier 1：Hermes 缺且高价值——建议立即吸收

| 机制 | 源码锚点 | Hermes 现状 | 融合点 |
|------|---------|------------|--------|
| **Committee 对抗评审（draft→3评审→1修订单轮）** | `orchestrator/committee.py:11-95`、`committee_reviewers.py:1-100` | Hermes 有 kanban review 列但无"生成后强制对抗评审"环节 | orchestrator 产出合并报告/重型交付物时，自动触发 3-reviewer 并行评审再交付 |
| **outbound_guard 出站防骚扰** | `orchestrator/outbound_guard.py:1-194` | Hermes cron/Gateway 主动推送无去重/限频/安静时段控制 | 加进 Gateway 推送层，防 bot 风暴（与 Matrix 七层防线第 7 层互补） |
| **DynamicWorkflow 解释执行引擎** | `workflows/dynamic.py:1-60`、`dynamic_models.py` | Hermes 只有 kanban 任务链，无"用户定义多步工作流"原语 | platform-tool-builder 可封装：YAML 定义 steps → Hermes kanban 任务序列 |
| **failures/ 结构化失败案例库** | `knowledge/builtin/failures/*` | Hermes failure-mode-playbook 是抽象模式，无具体案例 frontmatter 化 | payteam/Hermes 集群可建 `failures/` 目录同构（domain/failure_type/Lessons frontmatter） |
| **权威门 AuthorityLevel×AuthorityScope** | `departments/authority.py:gate_action()`、`departments/models.py:AuthorityLevel`、`people/models.py:AuthorityScope` | Hermes 只有高/中/低三级 HumanGate | 升级：per-profile authority_level + per-action required_scope 双维判定 |
| **WaitForHuman 暂停/恢复原语** | `workflows/wait_for_human.py:1-50` | Hermes kanban_block 是终态，无"暂停等人类回复后自动续跑" | 长工作流审批门：yield WaitForHuman → checkpoint → inbound 回复 → resume |
| **Provider 抽象层 + 特性门** | `providers/provider.py:LLMProvider Protocol`、`providers/feature_gate.py:strip_cache_control/strip_web_search_tools`、`providers/translator.py` Anthropic→OpenAI 消息翻译 | Hermes 已多 provider 但无"Claude 特性自动降级"机制 | cc-switch/Hermes provider 路由层：按 provider capability 自动剥 cache_control/web_search |

### Tier 2：Hermes 有雏形——值得升级

| 机制 | 源码锚点 | Hermes 现状 | 升级点 |
|------|---------|------------|--------|
| **情景记忆 LLM 后台提取** | `memory/episodic.py` + `schedule_extraction`（haiku tool_choice:auto 跳过闲聊轮） | Hermes hindsight 是向量检索，无"决策/倡议/建议"结构化账本 | kanban_complete 后触发轻量模型提取 decisions/initiatives/advice 入 SQLite |
| **Prompt 缓存分块** | `prompts/cache_manager.py:build_system_blocks`（persona 1h / profile 5m / RAG 不缓存） | Hermes 无缓存策略 | worker SOUL+知识索引分块缓存，预期降本 |
| **定时任务 UPDATE…RETURNING 原子 Claim + 崩溃恢复** | `memory/episodic.py:claim_due_actions` + `requeue_orphaned_running` | Hermes cronjob 无多实例安全 | kanban scheduler 借鉴 |
| **告警分级管线 + TriageAgent 提示词** | `alerts/pipeline.py:evaluate_and_dispatch`（60/min 限流→dedup→triage→dispatch）+ `prompts/triage_prompt.py`（urgent/high/medium/low 四级 + "存疑取低档"原则 + 隐私不变量：board/comp/legal 禁广播） | Hermes 无告警系统 | 可直接翻译 triage 提示词为 Hermes 告警分级规则 |
| **知识双层检索 + 域过滤** | `knowledge/retriever.py` + `DOMAIN_ALIASES`（per-specialist 域过滤） | payteam 有知识库但无检索分层/域过滤 | 给 4 个 pay worker 配 DOMAIN_ALIASES |
| **evals 场景库 + LLM-as-judge** | `evals/_scenarios/*.yaml`（42 个）+ `evals/judges.py`（5 维度 1-5 分结构化 JSON） | ops-eval 周报无场景化/无回归门禁 | 建 payteam eval 场景库，接入 CI |

### Tier 3：参考性机制（特定场景才需要）

| 机制 | 源码锚点 | 说明 |
|------|---------|------|
| 18 预制工作流 | `workflows/*.py` | 业务专属（board_prep/fundraising），Hermes 只需引擎不需内容 |
| monitoring 外部信号 watchlist | `monitoring/`（7 source adapters） | 企业情报场景，个人集群暂不需要 |
| Honcho 部门记忆同步 | `memory/honcho_client.py` | 第三方依赖，Hindsight 已覆盖 |
| inbound resolver（回复匹配） | `workflows/inbound_resolver.py` | 依赖 IM 平台 webhook，Hermes Gateway 已覆盖 |

---

## 三、上次报告中**应下调优先级**的判断

| 上轮判断 | 修正 | 理由 |
|---------|------|------|
| "单一入口 + 并行专家路由 P0" | **降 P2** | Hermes 已有 orchestrator 路由 + kanban 分派，OpenExecutive 的 `consult_specialist` 工具模式对 Hermes 增益有限——Hermes 是任务级路由而非 turn 级路由，架构不同 |
| "Prompt 缓存 P0" | **维持 P1** | 有价值但 Hermes worker 每次是独立 session，缓存收益场景比 OpenExecutive（长对话单 session）少 |
| "告警管线 P2" | **升 P1** | 源码看完 triage 提示词质量很高（含隐私不变量），对 Hermes Gateway 降噪有直接价值 |

---

## 四、融合落地建议（按改动量从小到大）

1. **零代码**：翻译 `triage_prompt.py` 四级分级 + 隐私不变量为 Hermes `_shared/` 规则文档，给 Gateway 告警/推送用
2. **小 patch**：`failure-mode-playbook` 增加 failures/ 目录约定（frontmatter 同构），orchestrator 的 `kanban_request_changes` 时引用具体案例
3. **中 patch**：outbound_guard 三控制（去重/限频/安静时段）落进 Gateway 推送层配置
4. **较大**：HumanGate 升级 AuthorityLevel×AuthorityScope 双维；kanban 加 WaitForHuman 暂停恢复原语
5. **大工程**：DynamicWorkflow 引擎封装为 Hermes skill（platform-tool-builder 负责）

---

## 五、关键源码片段（可复制参考）

### 5.1 Committee 评审（orchestrator/committee.py:69-95）

```python
async def review(self, user_message, draft, consulted, specialist_outputs=None) -> list[Critique]:
    reviewers = self.select_reviewers(consulted)  # 1 quality + 2 domain(fallback cso/cfo)
    return list(await asyncio.gather(*(
        r.critique(user_message=user_message, draft=draft, specialist_outputs=specialist_outputs)
        for r in reviewers
    )))
```

### 5.2 outbound_guard 归一化（outbound_guard.py:64-80）

```python
_DEDUP_PREFIX_CHARS = 160
_WS_RE = re.compile(r"\s+")

def _normalize(text: str) -> str:
    # Clip BEFORE normalizing（与存储端 text[:160] 对称）
    return _WS_RE.sub(" ", text[:_DEDUP_PREFIX_CHARS]).strip().casefold()
```

### 5.3 WaitForHuman 事件（workflows/wait_for_human.py:31-50）

```python
class WaitForHumanEvent(BaseModel):
    person_id: int
    question: str
    timeout_hours: int = 48
    on_timeout: Literal["escalate", "auto_proceed", "fail"] = "escalate"
    expected_reply_shape: Literal["approve_reject", "free_text", "numeric", "document"] = "approve_reject"
```

### 5.4 TriageAgent 隐私不变量（prompts/triage_prompt.py）

```
anything in topic_tags that mentions board/comp/legal/financial detail
MUST NOT include department_channel or company_broadcast. Use slack_dm only.
This is non-negotiable.
```

---

*报告完。源码 clone 在 /tmp/openexec（重启后丢失，核心内容已全部入本文档）。*
