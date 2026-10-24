-- compliant: 参数化 + NOLOCK 带声明 + OFFSET FETCH + 分批 + 显式隔离级别
DECLARE @name nvarchar(50);
SET @name = '张三';
EXEC sp_executesql N'SELECT id, name FROM dbo.Users WHERE name = @p', N'@p nvarchar(50)', @p = @name;
SELECT id, name FROM dbo.Orders WITH (NOLOCK) WHERE status = 1; -- 脏读风险已评估：运营报表容忍近似值，不回写
SELECT id, order_no FROM dbo.Orders ORDER BY id OFFSET 100000 ROWS FETCH NEXT 20 ROWS ONLY;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
BEGIN TRAN;
WHILE 1=1
BEGIN
  DELETE TOP (5000) FROM dbo.AccessLog WHERE created_at < '2025-01-01';
  IF @@ROWCOUNT = 0 BREAK;
END;
COMMIT;
