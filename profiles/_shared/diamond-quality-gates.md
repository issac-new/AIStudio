# Diamond 模式 6 道质量门（Quality Gates）

> 来源：QoderAI Better Harness `skills/better-harness/references/findings-review.md:18-60`，Hermes 本地化适配
> 适用：Diamond 编排模式的 Checker、delegate_task 蓝军审查、多 worker 并行后的合并审查
> 版本：v1.0（2026-08-21，Hermes × Better Harness 融合 P1-1）

---

## 使用场景

当 orchestrator / worker 以 Diamond 模式 fan-out 多个子代理（delegate_task batch / kanban 多 worker 并行）后，Checker 合并结果前**必须**逐道过以下 6 门。任何一门不通过 → finding 不进入合并报告。

## 6 道质量门

### 门 1：Eligibility（资格）— finding 是否够格？

- [ ] 有明确证据（file:line / 命令输出 / sqlite 查询结果）
- [ ] 有明确 owner（哪个 profile / 哪个模块负责修复）
- [ ] 有明确边界（影响范围是什么，不超出证据支持的范围）

**打回信号**：仅基于"看起来""应该是""可能是"的推测；证据是另一个 agent 的自述而非原始数据。

### 门 2：Consistency（一致性）— 多源是否真的一致？

- [ ] 多 worker 报告同一 finding 时，验证它们指向**同一根因**（不只是表面相似）
- [ ] 数据点之间无相互矛盾（如 A 说覆盖率 100%，B 说 50%）
- [ ] 时间窗口一致（不能用 7 天前的数据反驳今天的扫描）

**打回信号**：两个 worker 都报告"skill 引用率低"，但一个指 [已移除] 团队，另一个指 hack 团队——这是两个 finding，不是一个。

### 门 3：Privacy（隐私）— 是否泄漏敏感信息？

- [ ] 不含完整 prompt 原文（只引用必要片段）
- [ ] 不含 session_id / 绝对路径 / 用户 home 目录细节
- [ ] 不含 secrets / tokens / API keys（即使是 mask 后的也避免）
- [ ] [已移除] 域额外检查：不含孩子真实姓名/学校/地址等 PII

**打回信号**：finding 里贴了 `~/.hermes/profiles/xxx/config.yaml` 的完整路径 + 内容；包含对话原文大段引用。

### 门 4：Asset（资产真实性）— 引用的资产是否真实存在？

- [ ] 文件路径用 `ls` 验证存在
- [ ] 函数/符号用 `grep` / `search_files` 验证存在
- [ ] 命令用 `--help` 或 dry-run 验证可执行
- [ ] 外部 URL 用 `curl -sI` 或 `web_extract` 验证可达

**打回信号**：finding 引用 `_shared/foo.md` 但该文件不存在；引用 `scripts/bar.mjs:123` 但该行是空行。

### 门 5：Candidate-promotion（候选升级）— 候选是否够格升为 finding？

- [ ] 候选有**可操作的修复路径**（不是"应该改进"而是"改为 X"）
- [ ] 候选的 severity 有依据（critical = 数据丢失/安全漏洞；major = 功能缺陷；minor = 体验问题）
- [ ] 候选不是 pure style / preference（如"建议把 tabs 改成 spaces"不算 finding）

**打回信号**：候选项是"代码可以更优雅"但没有具体改进点；severity 标为 critical 但实际是 minor 体验问题。

### 门 6：Repair-prompt（修复提示可执行性）— 修复提示是否真的可执行？

- [ ] 修复提示包含具体步骤（不是"请优化"而是"将 X 改为 Y"）
- [ ] 修复提示引用了正确的文件/行号
- [ ] 修复提示不引入新的依赖（除非明确说明）
- [ ] 修复提示可被另一个 agent 直接执行，无需额外上下文

**打回信号**：修复提示是"建议重构这部分代码"但没有说怎么重构；提示引用的行号已经因为之前的修复而偏移。

### 门 7：Blind Analysis（盲分析）— 先盲推期望再对照证据（HarnessEval 融合 P1-7）

> 来源：MirroS HarnessEval `skills/skill_intentional_change_vlm.py:209-313`（analyze→verify 双 agent 模式）

- [ ] Checker 先**不看 worker 输出**，只根据任务 body 推导出"期望结果"
- [ ] 将 worker 输出与期望结果对比，标记差异
- [ ] 记录对比过程（类似 case_audit 的 token 重叠对齐）
- [ ] 差异点必须解释：是 worker 偏离预期，还是预期本身有误？

**打回信号**：Checker 直接阅读 worker 输出后写"看起来没问题"——未经过盲分析步骤。

**为什么重要**：防止 Checker 被 worker 输出的"自信语气"锚定，确保独立判断。

---

## 通过标准

| 结果 | 条件 | 动作 |
|---|---|---|
| **通过** | 7 门全部 ✓ | finding 进入合并报告 |
| **条件通过** | 门 1/3/4/7 ✓，其余有 minor 问题 | finding 进入报告但标注"待补充" |
| **打回** | 门 1/3/4/7 任一 ✗ | finding 不进入报告，退回 worker 补充 |

> 门 1（资格）、门 3（隐私）、门 4（资产真实性）、门 7（盲分析）是**硬门**——任何一门不通过直接打回。门 2/5/6 是**软门**——可标注"待补充"后放行。

## 与现有机制的关系

- **verification-checklist.md**：关注"产出物是否合格"（文件存在/语法/测试）；本文件关注"finding 是否合格"（证据/一致性/隐私）。
- **anti-patterns.md**：列出常见反模式；本文件是审查时的检查清单。
- **adversarial-review-lens skill**：5 lens 评审框架；本文件的 6 门可作为各 lens 内部的细化检查项。

## SOUL 内单行引用

```
Diamond 7 道质量门（详见 _shared/diamond-quality-gates.md）：Eligibility/Consistency/Privacy/Asset/Candidate-promotion/Repair-prompt/Blind-analysis，门 1/3/4/7 为硬门。
```
