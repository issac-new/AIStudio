# antd fixture 说明

- violating 主触发 2 个 fail 意图：message 静态调用（Form.tsx）/ Upload 未配 beforeUpload 大小校验（Form.tsx）。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：`fw_antd_app_useapp`、`fw_antd_upload_size_limit`）。
- 2026-07-20 P1 唤醒记录：无沉睡门禁（2 个 fail 门禁原 fixture 均已触发）。
- 无法实例化项登记：无。
- compliant 侧 App.useApp 注入式 + Upload 配 beforeUpload，期望全 pass。
