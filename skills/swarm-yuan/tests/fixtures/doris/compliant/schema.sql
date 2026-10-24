-- doris fixture compliant: 分桶 + replication_num=1 单节点 + ROLLUP + COLOCATE + MV REFRESH + 合理 VARCHAR + BITMAP + 动态分区 + resource group
CREATE TABLE events (
  ts DATETIME,
  uid BIGINT,
  name VARCHAR(64),
  amount DOUBLE
)
DISTRIBUTED BY HASH(uid) BUCKETS 8
PROPERTIES (
  "replication_num" = "1",
  "dynamic_partition.enable" = "true",
  "dynamic_partition.time_unit" = "DAY",
  "dynamic_partition.start" = "-30",
  "dynamic_partition.end" = "3"
);

CREATE MATERIALIZED VIEW mv_pv
REFRESH ASYNC EVERY (INTERVAL 1 HOUR)
AS SELECT dt, COUNT(*) FROM events GROUP BY dt;

SELECT uid, COUNT(*) FROM events GROUP BY uid;

CREATE TABLE dim_user (
  uid BIGINT,
  name VARCHAR(32)
)
DISTRIBUTED BY HASH(uid) BUCKETS 8
PROPERTIES ("replication_num" = "1", "colocate_with" = "events_group");

SELECT e.uid, e.amount FROM events e JOIN dim_user d ON e.uid = d.uid WHERE e.uid = 1;

SET query_timeout = 300;
