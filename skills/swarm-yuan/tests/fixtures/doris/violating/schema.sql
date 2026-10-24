-- doris fixture violating: 无分桶 + replication_num=3 单节点 + GROUP BY 无 ROLLUP + JOIN 无 COLOCATE + 物化视图无 REFRESH + 超宽 VARCHAR + WHERE 无索引 + 无动态分区 + StreamLoad + 无 resource group
CREATE TABLE events (
  ts DATETIME,
  uid BIGINT,
  name VARCHAR(65533),
  amount DOUBLE
)
PROPERTIES (
  "replication_num" = "3"
);

CREATE MATERIALIZED VIEW mv_pv AS
SELECT dt, COUNT(*) FROM events GROUP BY dt;

INSERT INTO events VALUES ('2026-08-26 00:00:00', 1, 'a', 1.0);
INSERT INTO events VALUES ('2026-08-26 00:00:01', 2, 'b', 2.0);

SELECT uid, COUNT(*) FROM events GROUP BY uid;
SELECT e.uid, e.amount FROM events e JOIN events e2 ON e.uid = e2.uid WHERE uid = 1;

-- Stream Load 逐行导入（见 fw_doris_stream_load）
