# 2026-11-12 运行态台账退出 git

> 决策事实源。来源：2026-11-12 全仓设计复盘 P0-2「运行态台账退出 git」。
> 现场病：钩子与脚本每次运行都往四个 jsonl 追加，入库后「一次工具调用」变成一次提交；
> 近 4 周 `spec-receipts` 被 336 个提交改动、`merge-invariants` 38 个、`gate-audit` 33 个，
> 「台账随批」类提交 40 条；并行会话还因此产生追加型合并冲突。

## 变更

### 1. 四个运行态台账退出索引（文件保留在本地）

`git rm --cached` 且 `.gitignore` 忽略：

- `.swarm-yuan/gate-audit.jsonl`（PreToolUse 判定审计，67 行）
- `.swarm-yuan/gate-deny.jsonl`（拦截明细，94 行）
- `.swarm-yuan/trace.jsonl`（工具调用留痕，1536 行）
- `.swarm-yuan/merge-invariants.jsonl`（合并门检查记录，68 行）

本地文件不删除：审计仍可现场读全文，只是不再随提交传播。

### 2. 语义台账不动

`.swarm-yuan/decisions.jsonl`（决策）与 `.swarm-yuan/spec-receipts.jsonl`（spec 内容收据）
继续入库：它们是决策事实与防改写绑定，不是运行日志。`recurrence.jsonl`（派生分析）也保留。

### 3. 消费者核对（全部容忍缺席）

- `scripts/governance-lint.mjs`：`readJsonlFile` 缺失返回 null，跳过校验；`LEDGERS` 计数
  上限 6，缺席只减少分母。
- `scripts/recurrence-report.mjs`：`readJsonl` 缺失返回 `[]`。
- `scripts/merge-invariants.mjs`：只追加写，目录不存在时自建。
- `custom/server/harness/ai-native-scorecard.ts`：`existsSync` 判存在性，缺=如实报空。
- `scripts/maintenance/merge-to-main.mjs`：状态过滤里提到 gate-deny，缺席不影响。
- 测试面无依赖：`grep gate-deny|gate-audit|merge-invariants.jsonl|trace.jsonl` 在
  `custom/**/__tests__`、`scripts/__tests__`、`simharness/tests` 零命中。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 退出索引但保留本地文件 | 直接删文件会丢当前审计窗口；退出索引已足够消除提交噪声与合并冲突 |
| D2 | decisions/收据不退出 | 两者是「决策事实」与「内容防改写」，不是运行日志；退出去会让治理失去可审计的语义面 |
| D3 | 本批不做「每周摘要入库」 | 摘要需要新生成器与调度（机制预算顶格）；本地全文已满足现场审计，摘要留到 P1 与 `recurrence-report` 合并实现 |
| D4 | 用 .gitignore 而非 assume-unchanged | ignore 对新克隆与并行会话一致生效；skip-worktree/assume-unchanged 是本地态，换机即失效 |

## 验证

- `git status --porcelain`：四个文件不再出现（删除只进索引，磁盘文件仍在）。
- `node scripts/governance-lint.mjs --budget`：0 problem（ledgers 分母下降但未超限）。
- `node scripts/merge-invariants.mjs --check`：pass（写本地台账，不要求入库）。
- `node scripts/recurrence-report.mjs`（只读汇总）：正常输出，不再因账本缺席报错。
- 钩子冒烟：故意触发一次 design-sync 拦截后 `gate-deny.jsonl` 行数 +1 且 `git status` 干净。

## 设计文档影响

DESIGN_SYNC: none

理由：四正本未改。本批只调整运行态账本的存储位置（索引→本地），治理判定逻辑、判据与
证据链语义不变；「证据先于声明」的原则不受影响（证据仍在本地全文与 decisions/收据）。
