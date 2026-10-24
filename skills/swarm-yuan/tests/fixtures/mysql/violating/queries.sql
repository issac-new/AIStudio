-- violating: SELECT * + 前置通配 LIKE + 隐式逗号 JOIN + ORDER BY RAND() + 深分页 offset 10 万
SELECT * FROM users WHERE name LIKE '%张%' ORDER BY RAND() LIMIT 100000, 10;
SELECT * FROM users, orders WHERE users.id = orders.user_id LIMIT 100000, 20;
