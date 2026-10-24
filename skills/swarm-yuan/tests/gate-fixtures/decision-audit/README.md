# decision-audit fixture（advisory 门禁，warn 级不 fail）

- `compliant/`：UserChallenge 五要素齐备 → expect 输出「决策审计轨迹完整」，rc=0
- `compliant-incomplete/`：UserChallenge 缺 missing_context/cost_if_wrong → expect 检出缺口，rc=0（advisory 不阻断）
