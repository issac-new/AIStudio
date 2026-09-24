---
description: 查看某个门的证据记录（证据类型/结果/执行级/制品路径）
---

查看证据明细。执行：

```bash
node "<CLI_PATH>" evidence <gateId|runId>
```

`<CLI_PATH>` 是 qgate CLI 的绝对路径（优先 `$ZCODE_PLUGIN_ROOT/../dist/cli.js`，回退 `$ZCODE_PLUGIN_ROOT/dist/cli.js`）。

向用户转述：每条证据的类型、result（pass/fail/conditional/error）、execution（exercised/cached/present/wired）、producer 与摘要；证据制品在 `.qgate/evidence/<runId>/`（JSON，字段级 diff 可直接读）。execution 不是 exercised 的证据只是占位（present=文件在 / wired=接进链 / cached=复用上轮），不能支撑 PASS。
