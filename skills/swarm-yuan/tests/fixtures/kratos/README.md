# kratos fixture 说明

- violating 主触发 5 个 fail 意图：NewServer 中间件栈无 recovery.Recovery /
  NewOrderService 未收录 ProviderSet / pb.go 生成头被抹除（手改生成代码）/
  config.yaml 明文密码+DSN 内嵌凭据 / biz 倒挂 import internal/data。
- 断言登记：**5/5 主触发已断言**（`violating/expected-fail-ids`：
  `fw_kratos_recovery_middleware`、`fw_kratos_wire_provider`、
  `fw_kratos_generated_code_edit`、`fw_kratos_plaintext_secret`、`fw_kratos_layer_dependency`）。
- violating 另覆盖 8 个 warn 意图（error_wrap / context_propagation /
  unimplemented_embed / http_register_missing / server_timeout /
  validate_middleware / app_metadata / wire_gen_missing），warn 不影响退出码。
- compliant 对照修正全部违规点（Recovery 置首、ProviderSet 完整、生成头完整、
  ${ENV} 占位、biz 依赖倒置、双协议注册、Timeout/validate/元数据齐备）→ exit 0。
