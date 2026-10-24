-- tdengine fixture compliant: 超级表建模 + 首列 TIMESTAMP + USING 带 TAGS + 标签<=8 + KEEP + firstEp/secondEp + DAYS/ROWS + TAOS-WS + 批量 INSERT
firstEp    node1:6030
secondEp   node2:6030
fqdn       node1

CREATE STABLE metrics (
  ts TIMESTAMP,
  v FLOAT
) TAGS (
  loc BINARY(16),
  dev BINARY(16)
) KEEP 365 DAYS 10;

CREATE TABLE d1001 USING metrics TAGS ('bj', 'dev1') (
  ts TIMESTAMP,
  v FLOAT
);

CREATE TABLE d1002 USING metrics TAGS ('sh', 'dev2') (
  ts TIMESTAMP,
  v FLOAT
);

INSERT INTO d1001 VALUES ('2026-08-26 00:00:00', 1.0), ('2026-08-26 00:00:01', 2.0);

-- 连接串（Java 侧）
-- jdbc:TAOS-WS://host:6041/db
