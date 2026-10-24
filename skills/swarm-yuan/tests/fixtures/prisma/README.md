# prisma fixture 说明

- violating 主触发 2 个 fail 意图：生产 migrate dev（Dockerfile 启动命令）/ $queryRawUnsafe 拼接。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：
  `fw_prisma_migrate_deploy`、`fw_prisma_queryraw_injection`）。
- 2026-07-20 实跑核验：两个 fail id 均在 violating 输出 ✗ 行命中；无沉睡 fail 门禁。
