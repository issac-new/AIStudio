---
description: 查看已登记的 Risk 清单（含 Stop 降级放行时登记的 risk-degraded）
---

查看风险登记。执行：

```bash
node "<CLI_PATH>" risk
```

`<CLI_PATH>` 同 /qgate-status 的解析方式。

向用户汇报每条 Risk 的严重度、描述与来源。特别注意 `risk-degraded-*` 条目——它们是 Stop 预算耗尽后被降级放行的任务留下的（`.qgate/risks/`），表示"agent 在证据不全的情况下结束了任务"：这是需要人复核的欠债，清偿后删除对应 risk 文件。
