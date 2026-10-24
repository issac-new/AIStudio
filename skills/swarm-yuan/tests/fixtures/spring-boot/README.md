# spring-boot fixture 说明

- violating 主触发 3 个 fail 意图：@Transactional 同类自调用 / Actuator exposure.include=* / javax import。
- 断言登记：**3/3 主触发已断言**（`violating/expected-fail-ids`：
  `fw_sboot_transactional_selfinvoke`、`fw_sboot_jakarta_migration`、`fw_sboot_actuator_expose`）。
- 2026-07-20（P0）修复：`spring-boot.sh` 方法名提取字符类 `[A-Za-z0-9_<>,.\[\] ]` → `[][A-Za-z0-9_<>,. ]`
  （POSIX 安全写法，`]` 置首为字面），修复前 BSD grep 下提取为空、selfinvoke 门禁沉睡。
- 2026-07-20（P1-1）修复：`fw_sboot_actuator_expose` 增补嵌套 YAML 判定——将
  `management:\n  endpoints:\n    web:\n      exposure:\n        include: '*'` 还原为点号键后与
  点平铺键同口径判定（独立 management 端口嵌套写法同样识别为已隔离）。修复前 violating 的
  嵌套 YAML 被误判「已收敛」（漏报），修复后该 fail id 实中并登记断言。
