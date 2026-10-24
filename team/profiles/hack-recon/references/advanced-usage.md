## 高级用法与实战技巧

### nmap 高级技术

#### NSE 脚本引擎 (Nmap Scripting Engine)

```bash
# 漏洞检测类脚本
nmap --script vuln 192.168.1.100
# 输出示例:
# | vuln:
# |   CVE-2017-0144 (MS17-010 EternalBlue): VULNERABLE
# |   State: VULNERABLE
# |   IDs:  CVE:CVE-2017-0144
# |_  Check: https://msrc.microsoft.com/...

# SMB 枚举脚本集
nmap --script smb-enum-shares,smb-enum-users,smb-enum-groups,smb-os-discovery 192.168.1.100
# 输出示例:
# | smb-enum-shares:
# |   IPC$:
# |     Type: IPC
# |     Anonymous access: READ/WRITE
# |   C$:
# |     Type: STYPE_DISKTREE
# |_    Anonymous access: <nobody>
# | smb-os-discovery:
# |   OS: Windows Server 2019 Standard 17763 (Windows Server 2019 Standard 6.3)
# |_  Computer name: DC01

# SSH 认证方法探测
nmap --script ssh-auth-methods 192.168.1.100 -p 22
# 输出示例:
# | ssh-auth-methods:
# |   Supported authentication methods:
# |     publickey
# |_    password

# SSH 主机密钥枚举
nmap --script ssh-host-key 192.168.1.100 -p 22
# 输出示例:
# | ssh-host-key:
# |   2048 aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99 (RSA)
# |_  256 aabbccddee... (ECDSA)
```

#### 时序模板 -T0 到 -T5 的权衡

```bash
# -T0 (Paranoid) — 串行发送，每包间隔5分钟，IDS 完全规避但极慢
nmap -T0 -sS 192.168.1.0/24          # 适合严格 IDS 规避场景，扫描一个 /24 可能需要数小时

# -T1 (Sneaky)    — 每包间隔15秒，非常隐蔽
nmap -T1 -sS 192.168.1.100

# -T2 (Polite)    — 每包间隔约400ms，对目标资源友好
nmap -T2 -sS 192.168.1.0/24

# -T3 (Normal)    — 默认值，平衡速度与隐蔽性
nmap -T3 -sS 192.168.1.0/24

# -T4 (Aggressive)— 并行发送，超时短，速度快，适合 CTF/内部网络
nmap -T4 -sS -sV 192.168.1.0/24

# -T5 (Insane)    — 极速扫描，超时极短，高速网络下可能丢包导致漏报
nmap -T5 -sS 192.168.1.0/24          # 不推荐用于生产环境或广域网
```

| 模板 | 速度 | 隐蔽性 | 适用场景 |
|------|------|--------|----------|
| T0   | 极慢 | 极高   | IDS 规避，串行端口扫描 |
| T1   | 慢   | 高     | 隐蔽扫描，避开简单告警 |
| T2   | 中慢 | 中高   | 对脆弱目标友好，减少负载 |
| T3   | 中   | 中     | 默认，通用场景 |
| T4   | 快   | 中低   | CTF、内部网络、授权渗透测试 |
| T5   | 极快 | 低     | 高速局域网、CTF 速攻 |

#### 版本探测强度 -sV

```bash
# 默认强度 (level 2)，探测约 100 个常见服务的 probe
nmap -sV 192.168.1.100

# 强度 0 — 仅用最常见 probe，快速但可能漏报非标准版本
nmap -sV --version-intensity 0 192.168.1.100

# 强度 9 — 使用全部 probe（含罕见服务），最全面但最慢
nmap -sV --version-intensity 9 192.168.1.100

# 轻量探测 — 只做端口开放确认，不做深度版本探测
nmap -sV --version-light 192.168.1.100

# 全部探测 — 返回所有匹配结果，不筛选
nmap -sV --version-all 192.168.1.100
```

#### OS 检测与优化

```bash
# 基本 OS 检测
nmap -O 192.168.1.100
# 输出示例:
# | OS details: Linux 3.2 - 4.9
# | OS CPE: cpe:/o:linux:linux_kernel:3
# | OS guess: Linux 3.16

# 限制 OS 扫描仅对已知开放端口进行，节省时间
nmap -O --osscan-limit 192.168.1.0/24

# 猜测更多 OS 结果（即使不确定也给出猜测）
nmap -O --osscan-guess 192.168.1.100
# 输出示例:
# | OS details: Linux 2.6.32 - 3.13 (98%)
# | OS CPE: cpe:/o:linux:linux_kernel:2.6 cpe:/o:linux:linux_kernel:3

# OS 检测 + 版本探测 + 脚本 + traceroute 一步到位
nmap -A 192.168.1.100
```

#### 防火墙规避技术

```bash
# 分片发送探测包（8字节分片），绕过简单包过滤防火墙
nmap -f -sS 192.168.1.100

# 自定义分片大小（16字节 / 24字节的倍数）
nmap -f --data-length 24 -sS 192.168.1.100

# 伪造源端口（如 53/DNS 或 80/HTTP），利用防火墙对知名端口的信任
nmap -g 53 -sS 192.168.1.100         # 源端口设为 DNS
nmap --source-port 80 -sS 192.168.1.100  # 源端口设为 HTTP

# 诱饵扫描 — 混淆真实扫描源
nmap -D RND:10 192.168.1.100         # 随机生成10个诱饵 IP
nmap -D 10.0.0.1,10.0.0.2,ME,10.0.0.3 192.168.1.100  # ME 是真实 IP

# 伪造 MAC 地址
nmap --spoof-mac 00:11:22:33:44:55 192.168.1.100
nmap --spoof-mac Cisco 192.168.1.100     # 使用 Cisco 的 OUI 前缀

# 扫描延迟 — 每包间隔指定毫秒，降低速率避免触发告警
nmap --scan-delay 1s -sS 192.168.1.100  # 每包延迟 1 秒
nmap --max-scan-delay 500ms -sS 192.168.1.100

# 使用空闲扫描 (Idle Scan) — 借用僵尸主机端口扫描
nmap -sI zombie.host.com 192.168.1.100
```

#### 输出格式管理

```bash
# -oA 输出全部三种格式（grepable/XML/normal），文件名前缀一致
nmap -sS -sV -oA scan_results 192.168.1.0/24
# 生成: scan_results.nmap (可读), scan_results.xml (机器解析), scan_results.gnmap (grep可搜索)

# -oN 标准可读输出
nmap -sS -oN scan.txt 192.168.1.100

# -oX XML 格式（适合导入其他工具如 Metasploit/Dradis）
nmap -sS -oX scan.xml 192.168.1.100

# -oG grepable 格式（适合管道处理）
nmap -sS -oG scan.gnmap 192.168.1.0/24

# 从 grepable 格式中提取开放端口的主机
grep "Host: " scan.gnmap | grep "Ports:" | awk '{print $2}'

# 从 grepable 格式中提取特定端口开放的主机
grep "22/open" scan.gnmap | awk '{print $2}'

# 使用 xsltproc 将 XML 转为 HTML 报告
xsltproc scan.xml -o scan.html
```

---

### subfinder 高级用法

#### 多数据源配置

```bash
# 首次使用配置 API 密钥
subfinder -cp

# 或手动编辑配置文件 ~/.config/subfinder/provider-config.yaml
# 示例配置:
# shodan:
#   - SHODAN_API_KEY_1
#   - SHODAN_API_KEY_2
# securitytrails:
#   - SECURITYTRAILS_API_KEY
# censys:
#   - CENSYS_API_ID:CENSYS_API_SECRET
# virustotal:
#   - VT_API_KEY
# github:
#   - GITHUB_TOKEN_1
#   - GITHUB_TOKEN_2

# 指定使用特定数据源
subfinder -d example.com -s shodan,censys,virustotal

# 排除某些数据源
subfinder -d example.com -es waybackarchive,commoncrawl
```

#### 深度枚举

```bash
# -all 启用所有数据源（默认只用免费源），最全面但最慢
subfinder -d example.com -all
# 输出示例:
# api.example.com
# dev.api.example.com
# staging.example.com
# vpn.example.com
# internal-dev.example.com

# -recursive 递归枚举子域的子域
subfinder -d example.com -recursive
# 输出示例:
# dev.example.com
# api.dev.example.com
# v2.api.dev.example.com

# -recursive 配合 -all 获得最大覆盖
subfinder -d example.com -all -recursive -o all_subdomains.txt

# 限制递归深度（需要配合其他工具）
subfinder -d example.com -recursive | while read sub; do subfinder -d "$sub"; done
```

#### JSON 输出与管道链式调用

```bash
# JSON 输出包含数据来源、时间戳等元数据
subfinder -d example.com -all -json -o subs.json
# 输出示例 (subs.json):
# {"host":"api.example.com","source":"shodan"}
# {"host":"dev.example.com","source":"virustotal"}
# {"host":"staging.example.com","source":"censys"}

# 用 jq 提取主机名
cat subs.json | jq -r '.host'

# ★ 经典链式调用: subfinder → httpx (存活探测)
subfinder -d example.com -silent | httpx -silent -status-code -title
# 输出示例:
# https://api.example.com [200] [API Gateway]
# http://dev.example.com [301] [Redirect]
# https://staging.example.com [403] [Forbidden]

# subfinder → dnsx (DNS 解析)
subfinder -d example.com -silent | dnsx -silent -a -resp
# 输出示例:
# api.example.com [A] 93.184.216.34
# dev.example.com [A] 93.184.216.35

# subfinder → dnsx → httpx (解析后存活探测)
subfinder -d example.com -silent | dnsx -silent -a | httpx -silent -title -tech-detect

# subfinder → httpx → nuclei (发现后自动漏洞扫描)
subfinder -d example.com -silent | httpx -silent | nuclei -severity critical,high

# 实战: 全链路自动化子域枚举 → 存活 → 端口 → 漏洞扫描
subfinder -d example.com -all -silent \
  | dnsx -silent -a \
  | httpx -silent -status-code -title -tech-detect \
  | nuclei -severity critical,high -o vuln_results.txt
```

---

### httpx 高级用法

#### 深度探测与指纹识别

```bash
# 基础存活探测 + 状态码 + 标题
httpx -l hosts.txt -status-code -title
# 输出示例:
# http://192.168.1.10:80 [200] [Welcome]
# https://192.168.1.20:443 [301] [Redirect]
# http://192.168.1.30:8080 [403] [Forbidden]

# 技术栈指纹识别
httpx -l hosts.txt -status-code -title -tech-detect
# 输出示例:
# https://example.com [200] [Example] [Nginx 1.18.0, PHP 7.4, WordPress 5.8]
# http://dev.example.com [200] [Dev Portal] [Apache 2.4.41, Express, React]

# 跟随重定向（默认不跟随）
httpx -l hosts.txt -follow-redirects -status-code -title
# 输出示例:
# http://example.com [200] [Final Destination]    # 跟随了 301→302→200

# 限制重定向次数
httpx -l hosts.txt -follow-redirects -max-redirects 3
```

#### 速率控制与批量扫描

```bash
# 速率限制（每秒请求数），避免触发 WAF/IDS
httpx -l hosts.txt -rate-limit 50      # 每秒 50 请求
httpx -l hosts.txt -rate-limit 10      # 每秒 10 请求（更隐蔽）

# 并发控制
httpx -l hosts.txt -threads 50          # 50 并发线程

# 超时设置
httpx -l hosts.txt -timeout 10          # 10秒超时

# 输入/输出
httpx -l hosts.txt -status-code -title -tech-detect -o results.txt
```

#### 截图功能

```bash
# 对所有目标截图（需要 headless Chrome）
httpx -l hosts.txt -screenshot -o screenshots_dir/
# 生成: screenshots_dir/192.168.1.10:80.png 等截图文件

# 截图 + 指纹识别，适合快速资产盘点
httpx -l hosts.txt -screenshot -tech-detect -title -status-code -o results.txt
```

#### 自定义请求探测

```bash
# 自定义 User-Agent
httpx -l hosts.txt -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) Custom-Audit/1.0"

# 自定义 Host 头（虚拟主机探测）
httpx -u https://10.0.0.1 -H "Host: internal.secret.com" -status-code -title

# 自定义认证头
httpx -l hosts.txt -H "Authorization: Bearer eyJhbGciOi..." -status-code

# 自定义方法
httpx -l hosts.txt -x HEAD,OPTIONS,GET -status-code
# 输出示例:
# http://example.com [HEAD] [200]
# http://example.com [OPTIONS] [200]
# http://example.com [GET] [200]

# 探测特定路径
httpx -l hosts.txt -path /admin,/wp-login.php,/api/v1 -status-code -title
# 输出示例:
# http://192.168.1.10/admin [200] [Admin Panel]
# http://192.168.1.10/wp-login.php [404] [Not Found]
# http://192.168.1.10/api/v1 [401] [Unauthorized]

# Content-Length 匹配（发现隐藏页面）
httpx -l hosts.txt -path /backup,/test,/dev -match-response-length 1234
```

---

### ffuf 高级用法

#### 状态码过滤与匹配

```bash
# -mc 只匹配特定状态码
ffuf -u https://example.com/FUZZ -w wordlist.txt -mc 200,204,301
# 仅显示 200/204/301 响应
# 输出示例:
# /admin                  [Status: 200, Size: 1234, Words: 56]
# /backup                 [Status: 301, Size: 178, Words: 6]
# /api                    [Status: 204, Size: 0, Words: 0]

# -fc 过滤掉特定状态码（隐藏 404）
ffuf -u https://example.com/FUZZ -w wordlist.txt -fc 404,403,302
# 过滤掉 404/403/302，只看其他响应

# 按响应大小过滤
ffuf -u https://example.com/FUZZ -w wordlist.txt -fs 0        # 过滤空响应
ffuf -u https://example.com/FUZZ -w wordlist.txt -fs 1234     # 过滤指定大小（常用于过滤通用 404 页面）

# 按字数过滤
ffuf -u https://example.com/FUZZ -w wordlist.txt -fw 7        # 过滤 7 个词的响应（如通用错误页）
```

#### 自动校准与速率控制

```bash
# -ac 自动校准 — 自动请求随机路径确定基准响应并过滤
ffuf -u https://example.com/FUZZ -w wordlist.txt -ac
# -ac 会自动发送 30+ 个随机请求来确定 404 页面的特征并过滤

# -rate 限制每秒请求数
ffuf -u https://example.com/FUZZ -w wordlist.txt -rate 100    # 每秒 100 请求
ffuf -u https://example.com/FUZZ -w wordlist.txt -rate 10     # 每秒 10 请求（隐蔽模式）

# 并发线程控制
ffuf -u https://example.com/FUZZ -w wordlist.txt -t 100       # 100 并发线程

# 延迟（每个请求间延迟）
ffuf -u https://example.com/FUZZ -w wordlist.txt -delay 0.5s
```

#### 递归扫描

```bash
# 递归发现子目录
ffuf -u https://example.com/FUZZ -w wordlist.txt -recursion -recursion-depth 2
# 扫描行为:
# 第一层: /admin/ /api/ /dev/ ...
# 第二层: /admin/config/ /admin/users/ /api/v1/ /api/v2/ ...

# 递归 + 状态码过滤
ffuf -u https://example.com/FUZZ -w wordlist.txt \
  -recursion -recursion-depth 3 -mc 200,301 -recursion-depth 2
```

#### POST 数据模糊测试

```bash
# POST 请求体参数模糊
ffuf -u https://example.com/api/login -X POST \
  -d 'username=admin&password=FUZZ' -w passwords.txt -mc 200,302 -fs 0
# 输出示例:
# password123              [Status: 302, Size: 0]    # 302 = 登录成功跳转
# admin123                 [Status: 200, Size: 1234]  # 200 = 登录失败

# JSON API 模糊测试
ffuf -u https://example.com/api/v1/user -X POST \
  -H "Content-Type: application/json" \
  -d '{"id":FUZZ,"name":"test"}' -w ids.txt -mc 200

# 多参数模糊 — 不同位置同时 FUZZ
ffuf -u https://example.com/api/FUZZ1 -X POST \
  -d '{"action":"FUZZ2"}' \
  -w api_endpoints.txt:FUZZ1 \
  -w actions.txt:FUZZ2 -mc 200
```

#### Header 模糊测试

```bash
# 模糊 Host 头（虚拟主机发现）
ffuf -u https://10.0.0.1 -H "Host: FUZZ" -w subdomains.txt -fs 0
# 输出示例:
# admin                   [Status: 200, Size: 3456]   # 发现隐藏虚拟主机
# dev                     [Status: 200, Size: 2341]

# 模糊自定义 Header
ffuf -u https://example.com -H "X-Custom-Header: FUZZ" -w headers.txt -mc 200

# 模糊 Cookie 值
ffuf -u https://example.com/admin -H "Cookie: session=FUZZ" -w sessions.txt -mc 200 -fs 0
```

#### 多字典与多位置模糊

```bash
# 同时使用多个字典文件
ffuf -u https://example.com/FUZZ -w /usr/share/wordlists/dirb/big.txt \
  -w /usr/share/wordlists/dirb/extensions_common.txt \
  -mc 200,301
# 注意: 这会做笛卡尔积，注意组合爆炸

# 更实用: 目录 + 扩展名组合
ffuf -u https://example.com/FUZZ -w dirs.txt \
  -mode clusterbomb \
  -u "https://example.com/FUZZ"
```

---

### nuclei 高级用法

#### 标签与严重性过滤

```bash
# 按标签过滤模板
nuclei -u https://example.com -tag cve
# 只运行带 "cve" 标签的模板，检测已知漏洞

nuclei -u https://example.com -tag exposure
# 检测敏感信息泄露（如 .git/, .env, backup files）

nuclei -u https://example.com -tag misconfig
# 检测配置错误（如目录列表、默认凭据）

# 多标签组合
nuclei -u https://example.com -tag cve,exposure,misconfig
# 运行所有带 cve / exposure / misconfig 任一标签的模板

# 按严重性过滤
nuclei -u https://example.com -severity critical
# 只报告严重级别漏洞

nuclei -u https://example.com -severity critical,high
# 报告严重+高危漏洞

nuclei -u https://example.com -severity medium,high,critical -tag cve
# 组合过滤: CVE 相关的中高危漏洞
```

#### 速率与并发控制

```bash
# 速率限制（每秒请求数）
nuclei -u https://example.com -rate-limit 30      # 每秒 30 请求

# 并发模板数
nuclei -u https://example.com -concurrency 25     # 同时运行 25 个模板

# 并发主机数（批量扫描时）
nuclei -l hosts.txt -concurrency 10 -rate-limit 50

# 超时设置
nuclei -u https://example.com -timeout 10         # 单个请求 10 秒超时

# 重试次数
nuclei -u https://example.com -retries 1
```

#### JSON 输出与请求/响应记录

```bash
# 标准 JSON 输出
nuclei -u https://example.com -json -o results.json
# 输出示例 (results.json):
# {
#   "template-id": "CVE-2021-44228",
#   "info": {"name": "Log4Shell", "severity": "critical"},
#   "host": "https://example.com",
#   "matched-at": "https://example.com/?test=${jndi:ldap://...}"
# }

# -irr 包含完整的请求和响应（用于复现和报告）
nuclei -u https://example.com -json -irr -o results_with_req_resp.json
# 输出示例 (附加字段):
# "curl-command": "curl -X GET 'https://example.com/?test=...'",
# "request": "GET /?test=${jndi:ldap://...} HTTP/1.1\r\nHost: example.com\r\n",
# "response": "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n..."

# 格式化查看 JSON 结果
cat results.json | jq '.'
cat results.json | jq -r '.["template-id"] + " -> " + .host'

# 提取所有漏洞的 URL
cat results.json | jq -r '."matched-at"'
```

#### 条件工作流

```bash
# 内置条件工作流 — 满足条件 A 才执行 B
# nuclei 支持通过 workflow 文件定义检测逻辑链
cat > custom_workflow.yaml << 'EOF'
id: workflow-example

info:
  name: Conditional Workflow
  author: custom
  severity: info

workflows:
  # 先检测 WordPress，如果存在再执行 WP 专用模板
  - template: technologies/tech-detect.yaml
    subtemplates:
      - tags: wordpress
        # 仅当 tech-detect 检测到 WordPress 时才运行

  # 先检测暴露的 .git 目录，如果存在再尝试提取
  - template: exposures/files/git-config.yaml
    subtemplates:
      - template: exposures/files/git-source-code.yaml
EOF

nuclei -u https://example.com -t custom_workflow.yaml
```

#### 自定义模板基础

```bash
# 最简单的 nuclei 模板 — HTTP 匹配型
cat > custom_template.yaml << 'EOF'
id: custom-sensitive-file

info:
  name: Sensitive File Detection
  author: custom
  severity: high
  description: Detects exposed sensitive configuration files

http:
  - method: GET
    path:
      - "{{BaseURL}}/.env"
      - "{{BaseURL}}/config/database.yml"
      - "{{BaseURL}}/backup.sql"

    matchers-condition: or
    matchers:
      - type: word
        part: body
        words:
          - "DB_PASSWORD"
          - "database"
          - "password"
        condition: or

      - type: status
        status:
          - 200
EOF

nuclei -u https://example.com -t custom_template.yaml
# 输出示例:
# [custom-sensitive-file] [http] [high] https://example.com/.env
```

#### 网络范围扫描

```bash
# 扫描 CIDR 网络范围
nuclei -cidr 192.168.1.0/24 -tag exposure,misconfig -severity high,critical

# 扫描多个 CIDR
echo "10.0.0.0/24\n10.0.1.0/24" > cidr_list.txt
nuclei -l cidr_list.txt -cidr -tag exposure -severity high

# 管道输入 CIDR 范围
echo "192.168.1.0/24" | nuclei -cidr -severity critical,high -rate-limit 50

# 管道: nmap 发现开放端口 → nuclei 扫描
nmap -sS -oG - 192.168.1.0/24 | grep "80/open\|443/open" | awk '{print $2}' \
  | nuclei -severity critical,high
```

#### 实战链式调用

```bash
# 子域发现 → 存活探测 → 漏洞扫描 → JSON 报告
subfinder -d example.com -all -silent \
  | httpx -silent -status-code -title \
  | nuclei -severity critical,high -json -irr -o final_report.json

# 端口扫描 → 提取 HTTP 服务 → nuclei 扫描
nmap -sS -p 80,443,8080,8443 -oG - 192.168.1.0/24 \
  | grep "/open/" | awk '{print $2":"$NF}' | cut -d/ -f1 \
  | nuclei -tag cve,exposure -severity high,critical
```

---
