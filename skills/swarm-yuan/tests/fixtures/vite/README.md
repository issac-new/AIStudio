# vite fixture 说明

- violating 主触发 3 个 fail 意图：alias 对象形式 / @/custom 在 @ 之后 / inject.mjs 无回滚分支。
- 断言登记：**3/3 主触发已断言**（`violating/expected-fail-ids`：
  `fw_vite_alias_array_form`、`fw_vite_alias_order`、`fw_vite_inject_clean`）。
- 2026-07-20 沉睡唤醒：`fw_vite_inject_clean` 原 conf `VITE_INJECT_SCRIPT=""` 静默跳过，
    conf 指向新增 `violating/inject.mjs`（无回滚分支）后命中；门禁脚本未动。
  注意：inject.mjs 内容/注释不得含 `--clean` 字面量，否则 grep 假 pass（首版 fixture 曾踩中）。
- compliant 侧 `VITE_INJECT_SCRIPT=""` 保持「无 inject 脚本，跳过」pass，双态语义不变。
