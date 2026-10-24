# 指标字典 (metric-dictionary)

> 数据分析域 SOP #4 的执行载体。**无字典不入代码**——新指标先登记,再开发。

## 格式

| 字段 | 说明 |
|------|------|
| metric_id | 唯一标识 `metric_<域>_<名称拼音或英文>` |
| 名称 | 中文业务名(如 支付转化率) |
| 口径 | 精确计算定义(分子/分母/时间窗口/去重规则) |
| 来源 | 源层表(DWD/DWS 表名) + 字段 |
| 层级 | DWD 原子指标 / DWS 派生指标 / ADS 应用指标 |
| 责任人 | data-arch(登记) / 业务方(口径确认) |
| 状态 | draft / active / deprecated |

## 登记示例

```yaml
- metric_id: metric_pay_conv_rate
  name: 支付转化率
  caliber: "COUNT(DISTINCT pay_order_id) / COUNT(DISTINCT created_order_id), 窗口=自然日, 时区=Asia/Shanghai"
  source:
    table: dws_pay_order_di
    fields: [order_id, order_status, created_at, paid_at]
  layer: DWS
  owner: data-arch
  business_owner: "<业务确认人>"
  status: active
  since: 2026-09-04
```

## 管理规则

1. **口径唯一**: 同一业务含义只允许一个 active 指标;发现口径冲突 → arch 裁决,旧指标置 deprecated 并注明替代
2. **变更即通知**: 口径变更走「表变更通知单」同样流程(影响下游报表/看板)
3. **存放位置**: 本文件即字典(团队初期单文件);表数量 >50 后迁移 DataHub/OpenMetadata 的 metric 实体
4. **对账**: flink 开发的 ADS 层作业,字段必须能与字典口径逐条对上,对不上 = 拒绝交付

## 语义层迁移路线(选型备忘)

- 现阶段(团队 0→1): 单文件 YAML,人工治理
- 中期(多消费方): 语义层工具(Cube / dbt Semantic Layer)托管,API 供 BI 取数
- 判断条件: 指标数 >100 或出现 ≥2 个独立消费端(BI 看板 + 应用后端)时启动选型
