-- violating: utf8（3 字节残缺字符集）+ COPY 算法 DDL + 单表 6 个二级索引
CREATE TABLE users (
  id bigint NOT NULL AUTO_INCREMENT,
  name varchar(64) NOT NULL,
  phone varchar(32) DEFAULT NULL,
  email varchar(128) DEFAULT NULL,
  status tinyint NOT NULL DEFAULT 0,
  created_at datetime NOT NULL,
  PRIMARY KEY (id),
  KEY idx_name (name),
  KEY idx_phone (phone),
  KEY idx_email (email),
  KEY idx_status (status),
  KEY idx_created (created_at),
  KEY idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE users ADD COLUMN nickname varchar(64) DEFAULT NULL, ALGORITHM=COPY;
