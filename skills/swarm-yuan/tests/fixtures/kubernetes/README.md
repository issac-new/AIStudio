# kubernetes fixture 说明

- violating 主触发 4 个 fail 意图：
  - fw_kubernetes_latest_image —— image: 命中 `:latest` → fail。
  - fw_kubernetes_privileged —— securityContext.privileged: true 命中 → fail。
  - fw_kubernetes_run_as_root —— 含 containers 的清单无 runAsNonRoot: true → fail。
  - fw_kubernetes_hardcoded_secret —— Secret 资源内含 stringData: → fail（data: base64 走人工审计）。
- 断言登记：**4/4 主触发已断言**（2026-08-26 实跑登记，见 violating/expected-fail-ids）。
- 反模式：violating 侧复现上述 4 条 fail 门禁命中场景；compliant 侧以对应修复（配置/代码修正）消除命中。
- 门禁无沉睡：声明的 fail 门禁全部命中，无需唤醒修复。

## violating vs compliant 差异
- violating：4 条 fail 门禁命中（详见 violating/ 下文件与 expected-fail-ids）。
- compliant：消除上述 fail 命中（对照 compliant/ 下等价文件）。
- 验收：`bash swarm-yuan/tests/run-framework-fixture.sh kubernetes` 双态绿（violating 检出 / compliant PASS）。
