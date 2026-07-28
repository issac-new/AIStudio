## 具体操作命令手册

### 1. 架构图绘制工具

**Mermaid（嵌入式 Markdown 图）**

```mermaid
sequenceDiagram
    participant U as 用户
    participant API as API网关
    participant S as 业务服务
    participant DB as 数据库
    U->>API: POST /api/orders
    API->>S: 转发请求
    S->>DB: 写入订单
    DB-->>S: 返回ID
    S-->>API: 201 Created
    API-->>U: 返回订单详情
```

```mermaid
classDiagram
    class User {
        +String name
        +String email
        +login()
        +logout()
    }
    class Order {
        +Int id
        +Decimal amount
        +createOrder()
    }
    User "1" --> "*" Order : 下单
```

```mermaid
flowchart LR
    A[需求接入] --> B{是否需要认证?}
    B -->|是| C[登录认证]
    B -->|否| D[直接处理]
    C --> D
    D --> E[业务逻辑]
    E --> F[(持久化)]
    F --> G[返回结果]
```

**PlantUML（复杂 UML 图）**

```plantuml
@startuml
title 订单系统时序图
actor User
participant "API 网关" as GW
participant "订单服务" as OS
database "PostgreSQL" as DB

User -> GW : POST /api/orders
GW -> OS : forward(orderDTO)
OS -> DB : INSERT
DB --> OS : order_id
OS --> GW : 201 Created
GW --> User : 返回订单
@enduml
```

```plantuml
@startuml
left to right direction
package "核心域" {
  [订单服务] as O
  [支付服务] as P
}
package "支撑域" {
  [认证服务] as A
}
A --> O : 鉴权
O --> P : 发起支付
@enduml
```

**Ditaa（文本转图）**

```
+----------+        +----------+
|  Client  |------->|  Nginx   |
+----------+        +----------+
                         |
                    +----------+
                    |  App     |
                    |  Server  |
                    +----------+
                         |
                    +----------+
                    |PostgreSQL|
                    +----------+
```

文件内嵌即可用 ditaa 渲染为 PNG（VS Code PlantUML/Ditaa 插件 或 `ditaa input.txt output.png`）。

### 2. 代码库分析

```bash
# 按语言统计代码行数（JSON 输出）
pygount --format=json --output counts.json . && jq . counts.json

# 多语言代码计数（排除依赖目录）
cloc --exclude-dir=node_modules,vendor,dist,target,__pycache__ .

# 快速行数统计
wc -l $(find . -name '*.py' -not -path '*/node_modules/*')

# 项目目录树（过滤构建产物）
tree -L 3 -I 'node_modules|target|dist|__pycache__|vendor|.git' .
```

### 3. 依赖分析

```bash
# Python 依赖树
pip install pipdeptree && pipdeptree --warn fail

# Node.js 依赖树（两层深度）
npm ls --depth=2 2>&1 | head -100

# Go 依赖图
go mod graph | head -50

# Rust 依赖树
cargo tree --depth 2
```

### 4. API 设计与校验

```bash
# 从 OpenAPI 规范生成客户端 SDK
openapi-generator-cli generate -i spec.yaml -g typescript-axios -o ./generated-client

# OpenAPI 规范校验与风格检查
redocly lint openapi.yaml

# Swagger Codegen 规范校验
swagger-codegen validate -i spec.yaml
```

### 5. ADR（架构决策记录）模板

```bash
# 初始化 ADR 目录和模板
mkdir -p docs/adr && adr init docs/adr

# 创建新的架构决策记录
adr new "Use PostgreSQL as primary database"

# 查看已记录的 ADR
ls docs/adr/*.md | xargs -I{} basename {}
```

ADR 单条结构参考：

```markdown
# ADR-001: Use PostgreSQL as primary database

- **状态**: Accepted
- **日期**: 2026-07-23
