# SkillGuard 回环 fixtures（G-A2：SG-013/014/015）

恶意样本 ×3 + 良性样本 ×3，全部为**合成特征样本**（特征词拼接即可触发规则，不含任何真实攻击 payload）。
文件名前缀 `malicious-*`（应被检出）/ `benign-*`（零误报），后缀注明对应规则。

## 样本清单

| 文件 | 规则 | 期望 |
|---|---|---|
| malicious-sg013-embedded-instruction.md | SG-013 | HTML 注释内嵌指令 → CRITICAL |
| malicious-sg013-skilldir/（含 SKILL.md + helper.py） | SG-014 | 只读声明 vs 脚本网络外发 → HIGH |
| malicious-sg015-rugpull.sh | SG-015 | `--yes` 条件分支后网络外发/删除 → HIGH |
| benign-sg013s14-clean-doc.md | SG-013/014 | 注释仅说明性文本、无声明词 → SAFE |
| benign-sg013-code-comments.py | SG-013 | 代码注释为普通实现说明 → 零 SG-013 |
| benign-sg015-interactive.sh | SG-015 | 交互式确认（真人输入）后执行 → 零 SG-015 |

## 验收命令

```bash
PYTHONPATH=~/.hermes/skills/hack-team/skillguard/scripts \
  python3 ~/.hermes/skills/hack-team/skillguard/scripts/skillguard/cli.py \
  scan ~/.hermes/skills/hack-team/skillguard/scripts/skillguard/tests/fixtures/ --format json
```

预期：`malicious-*` 全部含 SG-013/014/015 至少一条 finding；`benign-*` 三条新规则零命中
（良性脚本可能命中 SG-001..012 既有规则，不计入新规则误报口径）。
