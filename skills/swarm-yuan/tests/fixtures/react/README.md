# react fixture 说明

- violating 主触发 3 个 fail 意图：useEffect 未配依赖数组（List.tsx）/ 直接 mutate state（List.tsx）/ 条件分支内调用 Hook（Conditional.tsx）。
- 断言登记：**3/3 主触发已断言**（`violating/expected-fail-ids`：
  `fw_react_effect_deps`、`fw_react_immutable_state`、`fw_react_hooks_top_level`）。
- 2026-07-20 P1 唤醒记录：`fw_react_hooks_top_level` 原 fixture 无触发样本而沉睡（List.tsx 全部 Hook 顶层调用）。
  本批新增 violating/Conditional.tsx（`if (flag) { useEffect(...) }` 单行条件 Hook，命中门禁行内控制结构+Hook 模式）
  实例化唤醒；门禁判定逻辑未动。
- 无法实例化项登记：无（本框架 3 个 fail 门禁均可由静态源码 fixture 实例化）。
- compliant 侧 List.tsx 为依赖数组完整 + 不可变更新写法，期望全 pass。
