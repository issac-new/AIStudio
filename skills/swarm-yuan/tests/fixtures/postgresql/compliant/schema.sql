-- compliant: IDENTITY 主键 + jsonb + GIN + 命名约束 + 分区表 + 序列 CACHE
CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY,
  name varchar(64) NOT NULL,
  payload jsonb,
  CONSTRAINT pk_users PRIMARY KEY (id)
);

CREATE INDEX idx_users_payload ON users USING gin (payload);

CREATE TABLE orders (
  id bigint GENERATED ALWAYS AS IDENTITY,
  user_id bigint NOT NULL,
  amount numeric(12,2) NOT NULL,
  CONSTRAINT pk_orders PRIMARY KEY (id),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE access_log (
  id bigint GENERATED ALWAYS AS IDENTITY,
  path varchar(256),
  created_at timestamptz NOT NULL,
  CONSTRAINT pk_access_log PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE SEQUENCE order_no_seq CACHE 100;
