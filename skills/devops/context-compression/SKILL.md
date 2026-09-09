---
name: context-compression
description: 会话 token 占用≥90% 触发自动摘要旧片段，保留最近 8 条原文。
version: 0.1.0
author: OpenHuman tinyagents contributors, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [context-compression, token-optimization, auto-summarize, session-summary]
    related_skills: [context-engineering-audit, token-optimization, harness-entropy-management]
---

# 会话级 Context Compression（auto-summarize）Skill

长会话上下文逼近模型 `context_length` 上限时，由 LLM 把最旧的片段压成滚动摘要块，保留最近 K 轮原文。这是**会话级显式 summarize 策略层**——零代码方案（prompt/行为策略，不改 tool schema），与 Hermes built-in token 压缩互补而非替代。

来源机制：OpenHuman `tinyagents/summarize.rs:42-48`（0.90 阈值 / 保 8 条）。

## When to Use

- 会话轮次很多、工具输出或长文档累积，导致上下文占用逼近 `context_length` 上限。
- 需要保留「决策 / 工具调用 / 待办」等不可丢失信息，但想砍掉冗余叙述与重复中间结果。
- built-in 压缩已开启，但仍想叠加一层可解释、可回溯的会话级摘要。

**Don't use for**：
- 替代 built-in 压缩配置——本 skill 是补充层，不碰 `compression.*`。
- 短会话（上下文 < 90%）：强制摘要只引入噪声、浪费轮次。
- 需逐字保留旧片段的法律/审计场景：摘要会丢失原文，应改用 `session_search` 回溯。

## Prerequisites

- 已知当前模型的 `context_length`（见下方「按模型 ctx 常量表」，本会话 = 1,048,576 tokens）。
- Hermes built-in 压缩配置（参考，不修改）：`compression.enabled=true, threshold=0.5, target_ratio=0.2`。
- 仅在上下文占用 ≥ 90% 时触发（见触发判定）。

## 按模型 ctx 常量表（Model ctx 常量）

`estimate_tokens` / 触发判定依赖当前模型的上下文窗口上限。下表是常用模型的常量；未列出的 `aim` / `custom` 模型通过 config 读取或运行时标 `CTX_OVERRIDE`。

| 模型标识 | context_length (tokens) | 备注 |
|----------|------------------------|------|
| glm-5.3 | 1,048,576 | 本集群默认 GLM 系 |
| glm-5.2 / 5.1 | 1,048,576 | 同系窗口一致 |
| aim (custom provider) | 读 `config.model.context_length` | 缺失时回退 128,000 |
| openai gpt-4o | 128,000 | 外部参考 |
| anthropic claude-3.5 | 200,000 | 外部参考 |
| **自定义/未知** | `CTX_OVERRIDE` env 或默认 128,000 | 必须显式声明，禁止估猜 |

**当前模型识别顺序**：① env `CTX_OVERRIDE` > ② `config.model.context_length` > ③ 上表已知模型 > ④ 默认 128,000（并打 `[WARN ctx=default]` 标记）。

## estimate_tokens 近似算法（Token Estimation）

本 skill 不依赖外部 tokenizer，提供两种零依赖近似：

```python
def estimate_tokens(text: str) -> int:
    """零依赖 token 估算：优先 tiktoken，缺失时回落 字符数/4。"""
    try:
        import tiktoken
        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except Exception:
        # 中文≈1字/token、英文≈4字/token 的折中：按字符数/4 近似
        return max(1, len(text) // 4)

def session_usage_ratio(messages: list, ctx: int) -> float:
    """返回 已用tokens / ctx 占用比。"""
    used = sum(estimate_tokens(m["content"]) for m in messages)
    return used / ctx
```

- `tiktoken` 路径精确（仅英文系模型准）；缺失时用 `len(text)//4` 折中（中文偏保守，触发更早、更安全）。
- 触发判定只看**估算值**，不要求精确 count——误差方向偏向「早触发」，无损。

## 触发判定（Trigger Judgment）

按当前模型 ctx 估算占用比 `r = session_usage_ratio(messages, ctx)`。

- **触发**：`r ≥ 0.90`（即剩余空间 < ~10% ctx）。
- **幂等（已摘要标记）**：每次摘要块顶部写入哨兵标记 `<!-- AUTO-SUMMARY: turns a-b, do-not-resummarize -->`。下一轮折叠**只扫描未带该标记**的旧片段——已摘要块本身永不再被二次摘要，避免「摘要的摘要」递归膨胀。
- **保活**：保留最近 K 轮（默认 K=8）原文不动——K 是「保真窗口」，越大越占空间，按会话敏感度调（敏感决策会话 K=12，纯检索会话 K=4）。
- **压缩**：未带标记的 K 轮之前片段压成单个 `## Session Summary (auto)` 块（带哨兵标记），替换原片段位置、插入会话开头（或上一摘要块之后，形成滚动链）。

## 摘要模板（copy-paste summarize 指令）

当触发时，向模型发出以下指令（把 `<OLD_TURNS>` 替换为 K 轮之前的旧片段）：

```
你正在压缩一段过长的对话上下文。请把下面 <OLD_TURNS> 压缩为紧凑摘要，
替换原文以释放上下文窗口。严格要求：

1. 保留：所有已做的决策与结论、工具调用及其关键入参/出参、未完成的待办、
   用户明确约束、任何后续步骤依赖的事实（URL/路径/ID/数字）。
2. 丢弃：寒暄、重复的确认、冗余的中间推理过程、可被结论替代的推导。
3. 输出格式：Markdown，分三段——## 决策、## 工具调用、## 待办/事实。
4. 在摘要块顶部标注：时间窗（YYYY-MM-DD HH:MM ~ HH:MM）+
   被压缩的原始 turn id 区间（如 turns 1-37），以便回溯。
5. 在 `## Session Summary (auto)` 标题**之前**先写一行哨兵标记：
   `<!-- AUTO-SUMMARY: turns a-b, do-not-resummarize -->`，
   下一轮折叠凭此标记识别「已摘要段」、不再二次折叠（幂等）。
6. 不要编造任何原文没有的信息；不确定是否保留时，保留。

<OLD_TURNS>
...旧片段...
</OLD_TURNS>
```

压缩产物形如：

```
<!-- AUTO-SUMMARY: turns 1-37, do-not-resummarize -->
## Session Summary (auto)  [窗口 2026-08-26 14:00~15:20 | turns 1-37]
### 决策
- 选定方案 X（放弃 Y，因成本）
### 工具调用
- `kanban_show(t_84be1875)` → 返回 C2 任务体
- `read_file(.../summarize.rs)` → 0.90 阈值逻辑
### 待办/事实
- C2 落地路径 ~/.hermes/skills/devops/context-compression/SKILL.md
- context_length=1,048,576, 触发阈值 90%, K=8
```

## 与 built-in 压缩的关系

- **层级不同**：built-in 压缩是传输/运行时层（`compression.*` config，按 threshold 自动裁剪历史），无会话语义；本 skill 是**会话策略层**，在逼近上限时由 LLM 生成带结构的、可解释摘要。
- **互补不替代**：本 skill 不修改任何 `compression.*` 配置，也不假设 built-in 关闭。两者可同时生效——built-in 做粗裁，本 skill 做语义保真摘要。
- **何时只用 built-in**：上下文增长平缓、无不可丢失的决策信息时，无需本 skill，避免额外摘要轮次。

## 防信息丢失（Pitfalls / Anti-info-loss）

1. **摘要块必带时间窗 + 原 turn id**：没有回溯锚点的摘要块等于信息黑洞。每次摘要必须标注 `[窗口 ... | turns a-b]`。
2. **保真窗口 K 不是越大越好**：K 过大压缩收益归零；K 过小丢决策。默认 8，敏感会话上调。
3. **不摘要「当前进行中」的轮次**：只压 K 轮之前的；当前正在处理的工具调用结果不得进摘要。
4. **回溯优先于重做**：需要旧片段细节时，先用摘要块里的 turn id 调 `session_search(session_id=..., around_message_id=...)` 回溯原文，不要靠摘要猜。
5. **摘要不进持久记忆误用**：auto-summary 块是会话内滚动压缩，不是 memory/hindsight 沉淀；需要长期记住的结论走 `memory` 工具。
6. **阈值误判**：用 `context_length` 真实值估算占用比，别凭「感觉长」就压——短会话强压只增噪声。
7. **幂等断裂（递归膨胀）**：每次摘要必须带 `<!-- AUTO-SUMMARY: ... -->` 哨兵标记，且下一轮折叠**只扫描未带标记**的旧片段。漏标会让已摘要块被二次折叠，摘要套摘要、信息逐级失真。

## 验证（Verification）

- [ ] `hermes skills list | grep context-compression` 可见本 skill。
- [ ] 子会话 `skill_view('context-compression')` 返回 0 报错（frontmatter 合法、body 非空）。
- [ ] frontmatter `description` ≤ 60 字，且首 57 字内自包含「触发条件（≥90%）+ 动作（摘要旧片段）+ 保条数（K=8）」三要素。
- [ ] 「按模型 ctx 常量表」+ `estimate_tokens` 近似算法四要素齐备（阈值 0.90 / 保条数 K=8 / 幂等标记 / 估算算法）。
- [ ] 触发演练：构造 ≥ 90% 上下文会话，发出摘要模板指令，确认产出含 `## Session Summary (auto)` 且带 `[窗口 | turns]` 锚点、最近 K 轮原文保留。
- [ ] 幂等演练：二次折叠时，已带 `<!-- AUTO-SUMMARY: ... -->` 标记的旧摘要块**不**被再次压缩（锚点 turn id 区间不会变窄）。
- [ ] 确认 `compression.*` 配置未被本 skill 修改（diff `config.yaml` 无变化）。
