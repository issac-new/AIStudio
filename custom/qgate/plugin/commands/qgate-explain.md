---
description: 解释某个质量门为什么非 PASS
---

解释指定质量门的非 PASS 原因。执行：

```bash
node "<CLI_PATH>" explain <gateId>
node "<CLI_PATH>" evidence <gateId>
```

`<CLI_PATH>` 同 /qgate-status 的解析方式。

向用户转述六问（v0.1 §70）：什么失败、对应哪个 Claim、证据是什么、为什么重要、如何复现、可能的修复。证据制品在 `.qgate/evidence/<runId>/`（JSON，可直接读字段对比）。
