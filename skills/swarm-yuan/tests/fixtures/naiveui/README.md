# naiveui fixture 说明

- violating 主触发 3 个 fail 意图：app.use(naive) 全局注册（main.ts）/ 混用第二套 UI 库 element-plus（main.ts）/
  n-upload 未配 before-upload 大小校验（Form.vue）。
- 断言登记：**3/3 主触发已断言**（`violating/expected-fail-ids`：`fw_naiveui_no_global_register`、
  `fw_naiveui_no_dual_ui`、`fw_naiveui_upload_size_limit`）。
- 2026-07-20 P1 唤醒记录：`fw_naiveui_no_dual_ui` 原 fixture 无触发样本而沉睡（仅 naive-ui 单库）。
  本批 main.ts 追加 `import { ElButton } from 'element-plus'` 实例化唤醒；门禁判定逻辑未动。
- 无法实例化项登记：无（3 个 fail 门禁全部实例化）。
- compliant 侧具名导入按需引入 + n-upload 配大小校验，期望全 pass。
