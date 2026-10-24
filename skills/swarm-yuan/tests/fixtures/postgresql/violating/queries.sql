-- violating: max(id)+1 应用层取号 + 双侧通配 LIKE 无 pg_trgm
SELECT max(id)+1 FROM users;
SELECT id, name FROM users WHERE name LIKE '%张%';
-- P1 扩充：无 WHERE 全表 DELETE → fw_pgsql_dml_where(fail)
DELETE FROM access_log;
