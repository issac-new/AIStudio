-- hive fixture compliant: Tez 引擎 + ORC + DbTxnManager + nonstrict + 向量化 + 分区谓词 + external LOCATION + 分桶 join 已对齐
SET hive.execution.engine=tez;
SET hive.txn.manager=org.apache.hadoop.hive.ql.lockmgr.DbTxnManager;
SET hive.exec.dynamic.partition.mode=nonstrict;
SET hive.vectorized.execution.enabled=true;

CREATE TABLE events (
  id BIGINT,
  payload STRING
)
PARTITIONED BY (dt STRING)
STORED AS ORC;

CREATE EXTERNAL TABLE ext_events (
  id BIGINT,
  payload STRING
)
LOCATION '/warehouse/ext_events';

CREATE TABLE orders_buck (
  id BIGINT,
  amount DOUBLE
)
CLUSTERED BY (id) INTO 16 BUCKETS
STORED AS ORC;

INSERT OVERWRITE TABLE events PARTITION (dt='2026-08-26')
SELECT id, payload, dt FROM src WHERE dt = '2026-08-26';

SELECT * FROM events WHERE dt = '2026-08-26';
