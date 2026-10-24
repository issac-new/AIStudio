# 数据所有权表（System of Record）

| 实体 | 权威源 | 允许读 | 允许写 |
| ---- | ------ | ------ | ------ |
| 订单 | order-db | 全上下文 | order-context |
| 支付 | payment-db | 全上下文 | payment-context |
