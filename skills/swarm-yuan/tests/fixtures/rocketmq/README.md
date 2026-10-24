# rocketmq fixture 说明

- violating 主触发 3 个 fail 意图：
  - fw_rocketmq_idempotent_consumer —— @RocketMQMessageListener 文件无幂等痕迹（setIfAbsent/去重/idempot 等）→ fail 重复消费风险。
  - fw_rocketmq_orderly_listener —— 检出 sendOrderly/MessageQueueSelector 但消费端无 ORDERLY/MessageListenerOrderly → fa...。
  - fw_rocketmq_tx_checkback —— 检出 TransactionListener/sendMessageInTransaction 但无 checkLocalTransaction → fa...。
- 断言登记：**3/3 主触发已断言**（2026-08-26 实跑登记，见 violating/expected-fail-ids）。
- 反模式：violating 侧复现上述 3 条 fail 门禁命中场景；compliant 侧以对应修复（配置/代码修正）消除命中。
- 门禁无沉睡：声明的 fail 门禁全部命中，无需唤醒修复。

## violating vs compliant 差异
- violating：3 条 fail 门禁命中（详见 violating/ 下文件与 expected-fail-ids）。
- compliant：消除上述 fail 命中（对照 compliant/ 下等价文件）。
- 验收：`bash swarm-yuan/tests/run-framework-fixture.sh rocketmq` 双态绿（violating 检出 / compliant PASS）。
