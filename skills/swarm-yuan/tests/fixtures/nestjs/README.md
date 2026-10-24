# nestjs fixture 说明

- violating 主触发 3 个 fail 意图：ValidationPipe 无 whitelist / users↔orders 循环依赖 /
  TypeORM synchronize: true。
- 断言登记：**3/3 主触发已断言**（`violating/expected-fail-ids`：
  `fw_nest_validation_whitelist`、`fw_nest_circular_deps`、`fw_nest_typeorm_sync`）。
- 2026-07-20 沉睡唤醒：`fw_nest_typeorm_sync` 门禁逻辑健全但 fixture 缺触发内容（原 2/3 命中），
  在 `violating/src/app.module.ts` 补 `TypeOrmModule.forRoot({ synchronize: true })` 后命中；
  门禁脚本未动。
