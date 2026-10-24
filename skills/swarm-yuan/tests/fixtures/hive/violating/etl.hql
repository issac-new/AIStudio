-- hive fixture violating: 事务表无 DbTxnManager + 动态分区无 nonstrict + mr 引擎 + 非 ORC + 未向量化 + 分区表无谓词 + external 无 LOCATION + 分桶 join
SET hive.execution.engine=mr;

CREATE TABLE events (
  id BIGINT,
  payload STRING
)
PARTITIONED BY (dt STRING)
STORED AS TEXTFILE;

CREATE EXTERNAL TABLE ext_events (
  id BIGINT,
  payload STRING
);

CREATE TABLE orders_txn (
  id BIGINT,
  amount DOUBLE
)
CLUSTERED BY (id) INTO 16 BUCKETS
TBLPROPERTIES('transactional'='true');

CREATE TABLE orders_buck (
  id BIGINT,
  amount DOUBLE
)
CLUSTERED BY (id) INTO 16 BUCKETS;

INSERT OVERWRITE TABLE events PARTITION (dt)
SELECT id, payload, dt FROM src;

SELECT * FROM events;

SELECT a.id, b.amount
FROM orders_buck a JOIN orders_buck b ON a.id = b.id;

SET hive.vectorized.execution.enabled=false;
