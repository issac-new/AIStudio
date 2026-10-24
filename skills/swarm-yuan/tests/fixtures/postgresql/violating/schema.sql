-- violating: json 类型（非 jsonb）+ 无 GIN + log 表无分区 + 匿名外键 + 序列 CACHE 1
CREATE TABLE users (
  id bigint NOT NULL,
  name varchar(64) NOT NULL,
  payload json,
  PRIMARY KEY (id)
);

CREATE TABLE orders (
  id bigint NOT NULL,
  user_id bigint REFERENCES users (id),
  amount numeric(12,2) NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE access_log (
  id bigint NOT NULL,
  path varchar(256),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (id)
);

CREATE SEQUENCE order_no_seq CACHE 1;
