-- compliant: 多租户表启用 RLS（ENABLE ROW LEVEL SECURITY + CREATE POLICY）
CREATE TABLE users (
  id BIGINT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name varchar(64) NOT NULL
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.tenant_id')::bigint);
