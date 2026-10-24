# element fixture 说明

- violating 主触发 1 个 fail 意图：el-upload 未配 before-upload 大小校验（Form.vue）。
- 断言登记：**1/1 主触发已断言**（`violating/expected-fail-ids`：`fw_element_upload_size_limit`）。
- 2026-07-20 P1 唤醒记录：无沉睡门禁（唯一 fail 门禁原 fixture 已触发）。
- 无法实例化项登记：无。
- compliant 侧 el-upload 配 before-upload 大小校验 + 按需引入，期望全 pass。
