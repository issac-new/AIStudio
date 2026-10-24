-- tdengine fixture violating: 多设备表无超级表 + 首列非 TIMESTAMP + USING 无 TAGS + 标签>8 + 无 KEEP + 无分离 + 无 DAYS/ROWS + 原生 JDBC + 单条 INSERT + WHERE 过滤
CREATE TABLE d1001 (
  ts BIGINT,
  v1 FLOAT,
  v2 INT
);

CREATE TABLE d1002 (
  ts BIGINT,
  v1 FLOAT,
  v2 INT
);

CREATE TABLE t1 USING metrics
(
  ts TIMESTAMP,
  v FLOAT
);

CREATE STABLE metrics (
  ts TIMESTAMP,
  v FLOAT
) TAGS (
  loc BINARY(32),
  dev BINARY(32),
  city BINARY(32),
  prov BINARY(32),
  country BINARY(32),
  line BINARY(32),
  shift BINARY(32),
  grp BINARY(32),
  tag9 BINARY(32),
  tag10 BINARY(32)
);

CREATE TABLE orders (
  ts TIMESTAMP,
  amount DOUBLE
);

INSERT INTO d1001 VALUES (now, 1.0, 2);
INSERT INTO d1002 VALUES (now, 1.0, 2);

SELECT * FROM d1001 WHERE v1 = 1.0;

-- 连接串（Java 侧）
-- jdbc:TAOS://host:6030/db
