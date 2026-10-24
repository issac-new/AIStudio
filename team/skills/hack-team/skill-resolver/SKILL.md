---
name: skill-resolver
description: 确定性 Skill Resolver——无 LLM 参与的纯函数 skill 选型器。触发：410+ skill 库需要自动/可审计地为渗透任务选择 1 主 + ≤2 辅 skill；或需要为 skill 选择提供 provenance 记录。
---

# Skill Resolver：确定性 Skill 选型器

> 设计参照 VulnClaw `resolver.py`（445 行）。核心信条：**"no LLM in the loop"** —— skill 选择是一个纯函数，给定相同输入永远产生相同输出，可单元测试、可审计、可回放。LLM 只在 resolver 给出空结果或低置信结果时作为兜底顾问，绝不直接拍板。

## 1. 设计原则（继承自 VulnClaw）

| 原则 | 说明 |
|---|---|
| 纯函数选型 | `resolve(task, index) -> Resolution`，无副作用，无网络，无 LLM 调用 |
| 优先级分层 | 显式调用 > typed routing metadata（weight 3.0）> keyword alias（1.0）> 目录/格式加成（1.5） |
| 1 主 + 最多 2 辅 | support skill 得分必须 ≥ primary 得分的 **35%**，否则裁掉 |
| 精确胜宽泛 | 宽知识库 skill（`is_broad_knowledge=True`）在平局时**永远**输给精确 skill |
|  abstain 合法 | 非渗透输入 → 返回空 Resolution，不强行选任何 skill |
| provenance 全程 | 每次选型记录：选中 id / 实际加载的 references / reason / confidence |

## 2. 五维 Routing Metadata

每个 skill 在其 frontmatter 中声明（缺失维度记为空集，不参与加分也不扣分）：

```yaml
routing:
  phase: [recon, enum, exploit, privesc, post, report]      # 渗透阶段
  target_type: [web, ad, cloud, network, binary, mobile]    # 目标类型
  technologies: [wordpress, mssql, aws, kubernetes, ...]    # 具体技术栈（小写）
  vuln_hints: [sqli, xss, idor, kerberoast, lfi, ...]       # 漏洞提示词
  task_types: [scan, brute, ctf, audit, pivot, ...]         # 任务形态
is_broad_knowledge: false   # true = 宽知识库（如 methodology 全集），平局降级
```

与 VulnClaw 的差异：VulnClaw 用三维（service / vuln / phase），本设计扩到五维，因为 Hermes skill 库跨域更大（410+），单靠 keyword 歧义率高。

## 3. 选型算法（纯函数实现）

### 3.1 输入归一化

```python
def normalize(task: dict) -> dict:
    """从 task 描述抽取五维信号 + keyword 集合。全部为确定性规则：
    正则 / 词典命中 / 枚举映射，无 LLM。"""
    return {
        "phase":        detect_phase(task),        # 如 "提权" → privesc
        "target_type":  detect_target(task),       # 如 URL → web
        "technologies": detect_techs(task),        # 词典命中：wordpress、mssql…
        "vuln_hints":   detect_vulns(task),        # 词典命中：sqli、idor…
        "task_types":   detect_task_types(task),   # 如 "CTF" → ctf
        "keywords":     tokenize(task["text"]),    # 小写 token 集
        "explicit":     extract_explicit(task),    # "@skill:xxx" / "用 xxx skill"
    }
```

### 3.2 打分（weight 与 VulnClaw 对齐）

```python
W_TYPED, W_ALIAS, W_FORMAT = 3.0, 1.0, 1.5
SUPPORT_THRESHOLD = 0.35
MAX_SUPPORTS = 2

def score(skill, sig):
    # 显式调用：直接返回无穷大，短路一切
    if skill.id in sig["explicit"]:
        return float("inf"), "explicit-invocation"

    s, reasons = 0.0, []

    # 1) typed routing metadata：每命中一个维度的一个值 +3.0
    for dim in ("phase", "target_type", "technologies", "vuln_hints", "task_types"):
        hits = set(skill.routing.get(dim, ())) & sig[dim]
        if hits:
            s += W_TYPED * len(hits)
            reasons.append(f"{dim}:{sorted(hits)}+{W_TYPED*len(hits):.1f}")

    # 2) keyword alias：alias 词表命中 +1.0/词
    alias_hits = set(skill.aliases) & sig["keywords"]
    if alias_hits:
        s += W_ALIAS * len(alias_hits)
        reasons.append(f"alias:{sorted(alias_hits)}+{W_ALIAS*len(alias_hits):.1f}")

    # 3) 目录/格式加成：task 引用 .git / URL / IP 等形态与 skill 声明的
    #    expected_input_format 匹配 +1.5（一次性，不叠加）
    if skill.input_format and skill.input_format in sig["formats"]:
        s += W_FORMAT
        reasons.append(f"format:{skill.input_format}+{W_FORMAT}")

    return s, "; ".join(reasons)
```

### 3.3 排序、平局与 abstain

```python
def resolve(task, index):
    sig = normalize(task)

    # 渗透性门禁：五维全空 且 无 alias 命中 → 非渗透输入，弃权
    if not any(sig[d] for d in
               ("phase","target_type","technologies","vuln_hints","task_types")) \
       and not sig["explicit"]:
        return Resolution(primary=None, supports=[], confidence=0.0,
                          reason="non-pentest input, abstain")

    scored = [(score(sk, sig), sk) for sk in index.skills]
    scored = [(s, r, sk) for (s, r), sk in scored if s > 0]
    if not scored:
        return Resolution(primary=None, supports=[], confidence=0.0,
                          reason="no skill scored above zero")

    # 平局裁决链（严格按序）：
    #   1) 显式调用优先（inf 已保证）
    #   2) 精确 skill > 宽知识库（is_broad_knowledge=True 降一级）
    #   3) typed metadata 命中维度数多者胜（命中面更全 = 更贴合）
    #   4) skill id 字典序（保证确定性，消除任何随机性）
    scored.sort(key=lambda t: (
        -t[0],
        t[2].is_broad_knowledge,
        -len(t[2].routing.keys() & sig.keys()),
        t[2].id,
    ))

    p_score, p_reason, primary = scored[0]
    supports = [sk for s, r, sk in scored[1:]
                if s >= SUPPORT_THRESHOLD * p_score][:MAX_SUPPORTS]

    return Resolution(
        primary=primary, supports=supports,
        confidence=min(p_score / 15.0, 1.0),   # 归一化；阈值 15 为经验值，可配置
        reason=p_reason,
    )
```

## 4. 与 Hermes FTS5 索引互补

resolver 不替代 FTS5，二者分工：

| 层 | 职责 | 特性 |
|---|---|---|
| **FTS5**（已有） | 全文召回：从 410+ skill 的正文/描述中召回候选集（top ~20） | 模糊、召回率高、有噪声 |
| **Resolver**（本设计） | 精排：对候选集跑确定性打分，产出 1 主 + ≤2 辅 | 精确、可解释、确定性 |

流水线：`task → normalize → FTS5 召回候选 → resolver.score 精排 → Resolution`。
FTS5 不可用时 resolver 直接对全量索引打分（410 条打分是毫秒级，无性能问题）。

## 5. Provenance 记录

每次 `resolve()` 产出一条 provenance 记录，追加写入
`~/.hermes/profiles/hack-team/resolver-provenance.jsonl`：

```json
{
  "ts": "2026-08-24T10:00:00+08:00",
  "task_hash": "sha256:…",
  "selected": {
    "primary": "ad-kerberoast",
    "supports": ["ad-enum-bloodhound"]
  },
  "loaded_references": [
    "ad-kerberoast/references/ roasting-cheatsheet.md"
  ],
  "reason": "phase:['privesc']+3.0; vuln_hints:['kerberoast']+3.0; alias:['roast']+1.0",
  "confidence": 0.47,
  "abstained": false
}
```

用途：
- **审计**：事后回答"为什么当时选了这个 skill"
- **评测**：与人工标注对比，回归测试 resolver 规则改动
- **反馈环**：统计高频低置信任务 → 补充 routing metadata 或 alias 词典（改数据，不改算法）

## 6. 落地与测试

- **实现位置**：`scripts/resolver.py`（单文件，stdlib-only，目标 ≤300 行）
- **skill 索引构建**：扫描 skill 目录 frontmatter → 内存 `Index`；构建是一次性 IO，打分零 IO
- **测试**：每个路由规则至少一个 case；黄金集（task → 期望 primary/supports）回归；平局确定性测试（同一输入跑 100 次结果一致）
- **接入点**：orchestrator 派单前调用；`confidence < 0.3` 时才允许 LLM 顾问介入，且 LLM 的选择必须走同一 provenance 通道（`reason` 标注 `llm-override`）

## 7. 反模式（明确不做）

- ❌ resolver 内嵌任何 LLM / embedding 调用
- ❌ 用"最近常用 skill"打破平局（引入状态，破坏纯函数性）
- ❌ support 不设 35% 门槛（会导致 skill 堆叠、context 膨胀）
- ❌ 宽知识库凭 alias 数量多压过精确 skill（平局裁决链第 2 条专防此）
