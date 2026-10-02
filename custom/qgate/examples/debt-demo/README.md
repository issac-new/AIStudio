# debt-demo

技术债登记演示（release 档，L5.technical-debt policy failure=block）：

```bash
node ../../dist/cli.js run L5.technical-debt          # PASS：low/open/未逾期不阻断
# 反例：把 severity 改 high 或 dueDate 改 2020-01-01 → FAIL 阻断
```
