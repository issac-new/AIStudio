---
description: 查看当前项目的质量门计划（适用门/变更集）
---

查看当前项目的质量门计划（影响分析）。执行：

```bash
node "<CLI_PATH>" plan
```

`<CLI_PATH>` 是 qgate CLI 的绝对路径（优先 `$ZCODE_PLUGIN_ROOT/../dist/cli.js`，回退 `$ZCODE_PLUGIN_ROOT/dist/cli.js`）。

输出：当前 Profile（含 tier）与已变更文件；每个适用门列出触发点与关联 Claim。改 README 不触发 build 门，改 src 触发——用这个命令确认你的改动会命中哪些门。
