# pytest fixture 说明

- violating 主触发 2 个 fail 意图：session fixture 含可变 append/写文件 / 仅 assert x 无比较。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：
  `fw_pytest_assert_truthy_only`、`fw_pytest_session_scope_mutable`）。
- 2026-07-20 P1-B6 沉睡门禁唤醒：`fw_pytest_assert_truthy_only` 原正则
  `^\s*assert\s+[a-zA-Z_][a-zA-Z0-9_]*\s*$` 要求标识符后行尾即终，
  带行内注释的 truthy 断言（`assert val  # ...`，真实代码常见形态）永不命中（门禁沉睡）。
  修复：`\s*$` → `\s*(#.*)?$`（容忍行尾注释；比较断言/注释掉的代码仍不匹配，判定语义仅消除漏检）。
- 对照证据（合成样本 `    assert val` / `    assert val  # truthy-only 断言` /
  `    assert val == expected_value` / `    # assert commented`）：
  修复前 BSD 与 GNU grep 均仅命中无注释行、漏带注释行；
  修复后两平台均命中两种 truthy 形态、结果逐字节一致；
  `assert val == y` 与被注释的 `# assert` 行两平台均不命中。
