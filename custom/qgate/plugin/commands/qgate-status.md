---
description: 查看 QGate 质量门状态（适用门/判定/缺失证据/风险）
---

查看当前项目的质量门状态。执行：

```bash
node "<CLI_PATH>" status --fresh
```

其中 `<CLI_PATH>` 是 qgate CLI 的绝对路径（优先 `$ZCODE_PLUGIN_ROOT/../dist/cli.js`，回退 `$ZCODE_PLUGIN_ROOT/dist/cli.js`）。

向用户汇报：每个门的判定（PASS/FAIL/CONDITIONAL/INCONCLUSIVE/WAIVED/NOT_APPLICABLE）与新鲜度（fresh/stale/never）。对非 PASS 的门，接着执行 `explain <gateId>` 并转述：缺什么证据、为什么重要、怎么补。
