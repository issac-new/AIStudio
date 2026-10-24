-- compliant: utf8mb4 + 精简索引 + INPLACE DDL
CREATE TABLE users (
  id bigint NOT NULL AUTO_INCREMENT,
  name varchar(64) NOT NULL,
  status tinyint NOT NULL DEFAULT 0,
  created_at datetime NOT NULL,
  PRIMARY KEY (id),
  KEY idx_name (name),
  KEY idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE users ADD COLUMN nickname varchar(64) DEFAULT NULL, ALGORITHM=INPLACE, LOCK=NONE;
