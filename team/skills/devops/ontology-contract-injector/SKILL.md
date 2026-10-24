---
name: ontology-contract-injector
description: 新 profile 入网或契约回归时批量注入/验证 SOUL Ontology 三段契约。
version: 1.1.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [ontology, governance, soul, contract, regression-prevention]
    related_skills: [hermes-rules-effectiveness-audit, cluster-rules-audit]
---

# Ontology Contract Injector

把 Hermes 共享 Ontology 三段强制契约（CompletionHandoff / Staged Action / Markings 传播义务）幂等注入 profile SOUL.md，并机械验证接线率。2026-08-24 本体论四部曲 gap 分析（G1/G2）落地时沉淀。

## When to Use

- 新建 profile 入网，需要接线共享 Ontology 契约
- 规则审计（rules-effectiveness-audit）发现某 profile SOUL 缺三段契约之一
- hermes update 或批量工具冲掉自定义段后的回归恢复

## 三段契约（权威文本）

注入位置：SOUL.md 中 `_shared/ontology.md` 引用段之后（与既有契约段同区）。

1. **CompletionHandoff 完成交接（强制）**：kanban_complete 的 summary+metadata 遵循 ontology.md §3.2；metadata 至少含 artifacts_produced（list[{path,type,markings}]）与 changed_files；有结论补 findings/decisions。
2. **Staged Action 协议（强制）**：执行 ontology.md §二 reversible=false 动作前，kanban_comment 提交 staged-action-proposal（动作/意图/影响范围/回滚命令/预计后果），按 forward-deployed-protocol.md §三 等确认。
3. **Markings 传播义务（强制）**：产出引用 marked 上游时继承全部 markings（合取 AND），规则见 marking-rules.md；产出物 markings 超出本 profile clearances → kanban_block(kind="capability")。

## 注入步骤

1. 机械扫描当前缺口：

```bash
for f in ~/.hermes/profiles/*/SOUL.md; do
  p=$(basename $(dirname $f))
  flags=""
  grep -q "CompletionHandoff" "$f" || flags="$flags no-CompletionHandoff"
  grep -qi "staged-action" "$f" || flags="$flags no-staged-action"
  grep -q "marking-rules.md" "$f" || flags="$flags no-marking-rules"
  [ -n "$flags" ] && echo "$p:$flags"
done
```

2. 幂等注入（脚本 `inject_contracts.py`，已随本 skill 提供）：
   - 全量：`python inject_contracts.py` —— 遍历所有 profile，逐一对缺块的注入两段强制契约。
   - **增量（v1.1.0 新增）**：`python inject_contracts.py --profile <FOO>` —— 仅处理指定 profile 的 SOUL.md，其余 profile 零改动。解锁后续「单 profile 红线规则批量注入（P1-3）」。
   - anchor：注入到 `_shared/ontology.md` / `output-contract.md` / `CompletionHandoff` 段最后一行之后；找不到 anchor 则追加到文末 `## Ontology 契约（强制）` 新小节。
   - 幂等：已含 `staged-action` / `marking-rules.md` 关键词的 profile 自动跳过（`already-wired`），重复运行不堆积契约段。
   - 可选 `--base <dir>`：指定 profiles 根目录（默认 `~/.hermes/profiles`），用于测试隔离。

3. 注入后全量复验（步骤 1 脚本应仅剩已接线的 profile，输出为空说明 27/27 接线）。

4. **增量隔离自测**：运行 `python inject_contracts.py --profile <FOO>` 前后对所有 27 个 SOUL.md 做 sha256 对比，确认仅 `<FOO>`（且确实缺块时）变化，其余 26 个字节级不变。可加 `--base /tmp/隔离副本` 在副本上先验证。

5. [已移除] profile 额外检查 config.yaml clearances 含 PII（儿童信息域）。

## Pitfalls

- **幂等是硬要求**：重复注入会造成契约段堆积；关键词判定用 `staged-action`（小写带连字符）与 `marking-rules.md`，不用自然语言变体。
- **不要注入到 _shared/**：契约段属于各 profile SOUL；_shared 文档是单一事实源，SOUL 只做引用+义务声明。
- **hermes update/批量工具会冲掉自定义段**（历史上 ctx_length+clearances 两次回归）：update 后跑一遍步骤 1 扫描。
- 注入文本必须与 _shared 文档现行版本对齐；若 _shared 契约改了，先改注入文本再批量重注。

## Verification

- 步骤 1 扫描输出为空 = 27/27 接线
- `grep -c "staged-action" ~/.hermes/profiles/*/SOUL.md | grep -c ":0"` 应为 0
