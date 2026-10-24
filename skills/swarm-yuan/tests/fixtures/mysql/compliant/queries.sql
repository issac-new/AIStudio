-- compliant: 列名枚举 + 游标分页（WHERE id > ?）+ 前缀 LIKE 走索引 + 显式 INNER JOIN
SELECT id, name, status FROM users WHERE name LIKE '张%' AND id > 100000 ORDER BY id LIMIT 20;
SELECT u.id, u.name, o.order_no FROM users u INNER JOIN orders o ON o.user_id = u.id WHERE u.id > 100000 ORDER BY u.id LIMIT 20;
