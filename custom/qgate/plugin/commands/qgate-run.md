---
description: 显式运行 QGate 质量门并落证据
---

显式运行质量门（推荐在声称任务完成前执行）。执行：

```bash
node "<CLI_PATH>" run --all
```

`<CLI_PATH>` 同 /qgate-status 的解析方式。

退出码 0 = 全部通过；1 = 存在阻断门（FAIL/INCONCLUSIVE）。对每个非 PASS 门：

1. 读输出中的失败摘要（如 `lint-result:fail`）；
2. 执行 `node "<CLI_PATH>" explain <gateId>` 获取证据细节与修复方向；
3. 修复代码后重跑，直到全绿再结束任务。

禁止：把 skipped/inconclusive 当作通过；为绕过门禁修改 .qgate/ 配置（那属于人的决策）。
