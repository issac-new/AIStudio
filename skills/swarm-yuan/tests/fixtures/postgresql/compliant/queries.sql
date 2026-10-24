-- compliant: 参数占位由应用绑定；游标分页；DML 带 WHERE
SELECT id, name FROM users WHERE name LIKE '张%' AND id > 100000 ORDER BY id LIMIT 20;
UPDATE users SET name = '李四' WHERE id = 42;
DELETE FROM access_log WHERE created_at < now() - interval '90 days';
