-- violating: 拼接动态 SQL + NOLOCK 无声明 + ROW_NUMBER 分页 + 单事务大批量无分批 + 无隔离级别声明
DECLARE @name nvarchar(50);
DECLARE @sql nvarchar(max);
SET @name = '张三';
SET @sql = 'SELECT * FROM dbo.Users WHERE name = ''' + @name + '''';
EXEC(@sql);
SELECT * FROM dbo.Orders WITH (NOLOCK) WHERE status = 1;
SELECT * FROM (SELECT ROW_NUMBER() OVER (ORDER BY id) AS rn, id FROM dbo.Users) t WHERE rn BETWEEN 100001 AND 100020;
BEGIN TRAN;
INSERT INTO dbo.AccessLog (path, created_at) VALUES ('/a1', GETDATE());
INSERT INTO dbo.AccessLog (path, created_at) VALUES ('/a2', GETDATE());
INSERT INTO dbo.AccessLog (path, created_at) VALUES ('/a3', GETDATE());
INSERT INTO dbo.AccessLog (path, created_at) VALUES ('/a4', GETDATE());
INSERT INTO dbo.AccessLog (path, created_at) VALUES ('/a5', GETDATE());
INSERT INTO dbo.AccessLog (path, created_at) VALUES ('/a6', GETDATE());
INSERT INTO dbo.AccessLog (path, created_at) VALUES ('/a7', GETDATE());
INSERT INTO dbo.AccessLog (path, created_at) VALUES ('/a8', GETDATE());
INSERT INTO dbo.AccessLog (path, created_at) VALUES ('/a9', GETDATE());
INSERT INTO dbo.AccessLog (path, created_at) VALUES ('/a10', GETDATE());
COMMIT;
-- P1 扩充：GRANT EXECUTE TO public 越权 → fw_mssql_sp_grant_public(fail)
GRANT EXECUTE ON dbo.usp_ExportData TO public;
-- P1 扩充：无 WHERE/TOP 全表 DELETE → fw_mssql_dml_nowhere(fail)
DELETE FROM dbo.AuditLog;
