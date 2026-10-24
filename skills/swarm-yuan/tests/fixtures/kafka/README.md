# kafka fixture 说明

- violating 主触发 2 个 fail 意图：
  - fw_kafka_offset_semantics —— 检出 enable-auto-commit/enable.auto.commit=true（yml/properties/Java Config）→ fa...。
  - fw_kafka_acks —— 检出 acks=0/acks: 0 → fail；acks=1 → warn 确认可丢失。
- 断言登记：**2/2 主触发已断言**（2026-08-26 实跑登记，见 violating/expected-fail-ids）。
- 反模式：violating 侧复现上述 2 条 fail 门禁命中场景；compliant 侧以对应修复（配置/代码修正）消除命中。
- 门禁无沉睡：声明的 fail 门禁全部命中，无需唤醒修复。

## violating vs compliant 差异
- violating：2 条 fail 门禁命中（详见 violating/ 下文件与 expected-fail-ids）。
- compliant：消除上述 fail 命中（对照 compliant/ 下等价文件）。
- 验收：`bash swarm-yuan/tests/run-framework-fixture.sh kafka` 双态绿（violating 检出 / compliant PASS）。
