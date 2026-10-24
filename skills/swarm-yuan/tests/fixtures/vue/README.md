# vue fixture 说明

- violating 主触发 3 个 fail 意图：v-html 未配套 sanitize（Comment.vue）/ 普通 script 块拉低 setup 比例（Legacy.vue）/ Options API 选项式写法（Legacy.vue）。
- 断言登记：**3/3 主触发已断言**（`violating/expected-fail-ids`：
  `fw_vue_vhtml_sanitize`、`fw_vue_script_setup`、`fw_vue_no_options_api`）。
- 2026-07-20 P1 唤醒记录：`fw_vue_script_setup` 与 `fw_vue_no_options_api` 原 fixture 无触发样本而沉睡
  （唯一 SFC 为合规 setup 写法）。本批新增 violating/Legacy.vue（普通 script + 单行 Options API）实例化唤醒；
  注意该文件注释不得出现 `<script setup` 字面量（script_setup 为文件级 grep 计数，注释含字面量会误计为 setup 文件）。
  门禁判定逻辑未动。
- 无法实例化项登记：无（本框架 3 个 fail 门禁均可由静态 SFC fixture 实例化）。
- compliant 侧 Comment.vue 为合规 setup + 无 v-html，期望全 pass。
