# MCP 工具接入说明 (MCP Tools Integration)

> 对应材料 scripts §2。生成目标技能时，按项目实际有的外部资源填充。无外部资源的写"本项目无外部 MCP 资源，本节不适用"。

## 数据库访问工具

> 探查项目数据库类型与连接方式，填入访问工具。

### 连接信息
- 类型：（MySQL / PostgreSQL / SQLite / MongoDB / ...）
- 连接串格式：`<scheme>://<user>:<pass>@<host>:<port>/<db>`
- 环境变量：`DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME`

### CLI 查询
```bash
# （填入项目实际的 DB CLI 查询命令，如 psql/mysql/mongosh）
```

### MCP 工具（如有）
- 工具名：
- 接入方式：
- 查询样例：

## ELK / Elasticsearch

> 项目有 ELK/ES 时填充。

### 连接信息
- ES 地址：`<host>:<port>`
- 索引：（列表）

### 查询样例
```bash
# curl 查询样例
curl -s "<es_url>/_search?q=<query>" | jq .
```

### MCP 工具（如有）
- 工具名：
- 接入方式：

## Redis

> 项目有 Redis 时填充。

### 连接信息
- 地址：`<host>:<port>`
- 环境变量：`REDIS_HOST` `REDIS_PORT` `REDIS_PASSWORD`

### CLI 查询
```bash
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping
```

## 消息队列（MQ）

> 项目有 Kafka/RabbitMQ/RocketMQ 时填充。

### 连接信息
- 类型：（Kafka / RabbitMQ / RocketMQ）
- broker 地址：
- topic/queue 列表：

### 查询样例
```bash
# （填入 MQ 管理查询命令）
```

## dubbo / union

> 项目有 dubbo/union 微服务时填充。

### 注册中心
- 地址：
- 查询方式：

## CMDB

> 项目有 CMDB 资产管理时填充。

### 查询接口
- API：
- 认证：

## 无外部资源

> 若项目无任何外部 MCP 资源，保留本段：
本项目无外部 MCP 资源（数据库/ELK/Redis/MQ/dubbo/union/CMDB），本节不适用。
