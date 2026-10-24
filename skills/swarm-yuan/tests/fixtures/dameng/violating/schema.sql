-- violating: 引号小写标识符 + 保留字裸列 + BOOLEAN 类型 + AUTO_INCREMENT + ENGINE= 残留
CREATE TABLE "users" (
  "id" BIGINT AUTO_INCREMENT PRIMARY KEY,
  "name" varchar(64) NOT NULL,
  domain varchar(128),
  status BOOLEAN DEFAULT 0,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- violating: IDENTITY 表（供 queries.sql 显式赋值触发）
CREATE TABLE ORDERS (
  ID INT IDENTITY(1,1) PRIMARY KEY,
  NAME varchar(190) NOT NULL,
  AMOUNT decimal(18,2) DEFAULT 0
);
