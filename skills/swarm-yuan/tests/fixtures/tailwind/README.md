# tailwind fixture 说明

- violating 主触发 1 个 fail 意图：tailwind.config.js 无 content 扫描路径（JIT 漏扫致样式丢失）。
- 断言登记：**1/1 主触发已断言**（`violating/expected-fail-ids`：`fw_tailwind_content_scan`）。
- 2026-07-20 P1 唤醒记录：无沉睡门禁（唯一 fail 门禁原 fixture 已触发）。
- 无法实例化项登记：无。
- compliant 侧 config 配 content 通配扫描 + prefix 隔离，期望全 pass。
