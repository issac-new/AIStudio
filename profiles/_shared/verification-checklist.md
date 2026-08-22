# 验证清单（Verification Checklist — 共享参考）

> ACP 委托编码后必须逐项过完才能 `kanban_complete`。不信任 agent 输出，要亲自查证。

## 核心检查项（不可省略）

1. **文件存在**：`ls <文件路径>` 确认 changed_files 每条都真实存在（不是空字符串、不是路径幻觉）
2. **语法检查**：Python → `python -m py_compile <file>` / TS → `tsc --noEmit` / Shell → `bash -n`
3. **类型检查**：mypy / pyright（如果项目有 type hints）
4. **单元测试**：`pytest -v` 或对应框架，全绿才能算完
5. **linter**：`ruff check` / `eslint` / 项目规定的 linter
6. **构建**：`npm run build` / `make build` / 项目规定的 build 命令
7. **ACP session_id 验证**：如果用了 acp_send，session_id 必须真实（从 acp_sessions 输出取）


## 代码审查纪律项（不可省略）

8. **没有越界改动** — `git status` / `git diff`，确认只动了任务范围内文件，无顺手重构
9. **无密钥泄漏** — diff 里没有硬编码 secret、没有把 `.env` 加进去
10. **符合验收标准** — 逐条对照 body 里的验收项打勾

## 领域特定检查项

- **代码类 worker**：必须跑完整 test suite，不接受"我改了 X 但没跑测试"
- **[已移除] 类**：必须跑 [已移除] 脚本 + 核验 S 参数曲线/眼图/PDN 阻抗在物理上合理
- **Hack 类**：必须交叉校验 3 源（ASN+DNS+证书），至少 3 个独立来源确认
- **研究类**：必须三角验证 + 标注时效 + 列取舍依据
- **[已移除] 类**：必须验证教案是否符合年龄段（参考 child-profile.md）

## 反模式

- ❌ "我看了 agent 输出，觉得没问题" → 没跑就是没跑
- ❌ "测试在另一个 PR 跑了" → 不在本任务就是没跑
- ❌ "看起来对" → 没有 `ls` / `python -m py_compile` / 测试输出 = 没验证
- ❌ 跳过 linter / build step 节省时间 → 历史教训：省 1 分钟炸 1 小时

---

## 扩展：证据强度评分上限表（Better Harness 融合 P1-5）

> 来源：QoderAI Better Harness `models/agent-work-loop.md:110-124`
> 原则：**配置存在 ≠ 被使用 ≠ 改善结果**

kanban_complete 前，对当前任务的验证证据强度自评：

| 最高证据 | 绝对分数上限 | 判定标准 | 自检问题 |
|---|---|---|---|
| Missing / Unobserved / N/A | 59 | 机制不存在或未观测 | 我是否真的跑了验证，还是"假设它会工作"？ |
| Present | 74 | 机制存在但未接线 | 工具/脚本存在，但我真的用了吗？ |
| Wired | 84 | 机制已接线可用 | 验证步骤是否已集成到工作流？ |
| Exercised | 94 | 机制被使用且留有结果 | 本次任务是否实际执行了验证？ |
| Outcome-supported | 100 | 可比后续结果支持效果 | 之前的验证是否带来了可量化的改进？ |

**自评 ≤74 分 → 不应 kanban_complete，先补齐证据。**

## 扩展：可观测性六门（Better Harness 融合 P1-5）

> 来源：QoderAI Better Harness `models/agent-work-loop.md:394-408`
> 适用：变更验证维度的深度检查

验证一个变更是否"可观测"，需过六门：

| 门 | 判定 | 检查项 |
|---|---|---|
| **Discoverable** | 可发现 | 变更是否能被找到？（git log / kanban 记录 / 文件路径） |
| **Runnable** | 可运行 | 验证命令是否可执行？（pytest / linter / build 能跑） |
| **Readable** | 可读 | 验证结果是否人类可读？（非二进制乱码/非空输出） |
| **Correlatable** | 可关联 | 验证结果能否关联到具体变更？（哪个 commit 触发了哪个测试） |
| **Verifiable** | 可验证 | 验证结果是否有预期标准？（全绿 = pass，有失败 = fail） |
| **Safe-reversible** | 安全可逆 | 变更是否可回滚？（git revert / 配置回退 / 无破坏性副作用） |

**判级**：
- **Ready**：六门全过
- **Partial**：缺 1-2 门（标注缺哪门）
- **Blocked**：缺 3+ 门（需补齐后才能 complete）
- **N/A**：纯查询/问答任务（无变更）

## 扩展：修复链完整性（Better Harness 融合 P1-5）

> 来源：QoderAI Better Harness `models/agent-work-loop.md:360-369`
> 铁律：**"A retry pass without diagnosis is not repair evidence"**

发现 bug/测试失败时，修复必须走完整链：

```
failure → reproduction → diagnosis → bounded repair → validate-again
```

- **failure**：记录失败现象（测试输出/错误日志）
- **reproduction**：确认可复现（非偶发/非环境问题）
- **diagnosis**：定位根因（不是"试试改这里"而是"因为 X 导致 Y"）
- **bounded repair**：最小修复（只改必要部分，不顺手重构）
- **validate-again**：修复后复验（重跑测试确认通过）

**跳过任何一步 → 修复证据无效。**

## SOUL 内单行引用

```
验证清单（详见 _shared/verification-checklist.md）：ACP 产出后必须过 7 项（文件存在/语法/类型/测试/linter/构建/session_id）+ 证据强度自评（≤74 分不 complete）+ 可观测性六门 + 修复链完整性。
```