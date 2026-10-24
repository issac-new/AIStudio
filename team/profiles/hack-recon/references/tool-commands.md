## 具体操作命令手册

> 以下命令均为可直接复制运行的 bash 命令，将 `TARGET` / `example.com` / `1.2.3.4` 替换为实际授权目标。长耗时扫描用 `terminal(background=true, notify_on_complete=true)`。

### 1. 子域名枚举 (subfinder / amass / crt.sh)

```bash
# subfinder — 被动子域枚举，多数据源
subfinder -d example.com -silent -o subdomains.txt

# subfinder — 激活所有数据源并显示详细输出
subfinder -d example.com -all -recursive -o subdomains_all.txt

# amass — 深度子域枚举（被动模式）
amass enum -passive -d example.com -o amass_results.txt

# amass — 主动模式（含解析验证）
amass enum -active -d example.com -brute -o amass_active.txt

# crt.sh — 证书透明度日志查询（无需安装工具）
curl -s "https://crt.sh/?q=%25.example.com&output=json" | jq -r '.[].name_value' | sort -u > crtsh_subdomains.txt

# 合并去重所有子域结果
cat subdomains.txt amass_results.txt crtsh_subdomains.txt | sort -u | grep -v '\*' > all_subdomains.txt
```

### 2. 端口/服务扫描 (nmap / masscan / rustscan)

```bash
# nmap — 全端口 SYN 扫描 + 版本探测 + 默认脚本，输出所有格式
nmap -p- -sV -sC -T4 -oA nmap_full example.com

# nmap — Top 1000 端口快速扫描 + 版本探测
nmap -sV -sC -T4 -oA nmap_top1000 example.com

# nmap — UDP 扫描（Top 200 端口，较慢）
nmap -sU -F -T4 -oA nmap_udp example.com

# nmap — 扫描特定端口段
nmap -p 1-1000,3306,6379,8080,8443 -sV -sC -T4 example.com

# nmap — 目标子网段，输出可 grep 的 grep 格式
nmap -sV -p 80,443,8080,8443 -oG nmap_grep.txt 192.168.1.0/24

# masscan — 超高速全端口扫描（需 root，--rate 控制速率）
sudo masscan -p1-65535 1.2.3.4 --rate=10000 -oJ masscan_results.json

# masscan — 扫描网段的 Web 端口
sudo masscan -p80,443,8080,8443 10.0.0.0/24 --rate=5000 -oJ masscan_web.json

# rustscan — 现代端口扫描器，自动将结果传给 nmap
rustscan -a example.com -- -sV -sC -oA rustscan_results

# rustscan — 扫描 IP 列表，ULIMIT 调高
rustscan -a targets.txt -g -p 1-65535 --ulimit 5000 -- -sV -sC
```

### 3. HTTP 存活探测 (httpx)

```bash
# httpx — 从子域列表探测存活 HTTP 服务，输出标题+状态码+技术栈
cat all_subdomains.txt | httpx -title -tech-detect -status-code -o httpx_alive.txt

# httpx — 全格式输出，含 CDN、WAF、IP、CNAME
cat all_subdomains.txt | httpx -ip -cdn -cname -title -tech-detect -status-code -web-server -o httpx_full.txt

# httpx — 指定端口探测
echo example.com | httpx -p 80,443,8000,8080,8443 -title -status-code -o httpx_ports.txt

# httpx — 截图（配合 gowitness）
cat httpx_alive.txt | gowitness file -f - --screenshot-path ./screenshots/
```

### 4. 目录/路径模糊 (ffuf / gobuster)

```bash
# ffuf — 目录模糊，使用 SecLists 常用字典
ffuf -u "https://example.com/FUZZ" -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt -o ffuf_dirs.json -mc 200,204,301,302,401,403

# ffuf — 文件扩展名模糊
ffuf -u "https://example.com/FUZZ" -w /usr/share/seclists/Discovery/Web-Content/raft-medium-files.txt -e .php,.asp,.aspx,.jsp,.html,.txt -o ffuf_files.json -mc 200,301,302,401,403

# ffuf — 参数模糊（发现隐藏参数）
ffuf -u "https://example.com/api?FUZZ=1" -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt -mc 200,500 -o ffuf_params.json

# ffuf — 虚拟主机模糊
ffuf -u "https://example.com/" -H "Host: FUZZ.example.com" -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt -fs 1234 -o ffuf_vhosts.json

# ffuf — 递归模糊（深度2）
ffuf -u "https://example.com/FUZZ" -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt -recursion -recursion-depth 2 -o ffuf_recursive.json -mc 200,301,401,403

# gobuster — 目录模糊（备选）
gobuster dir -u https://example.com -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt -o gobuster_dirs.txt -t 50

# gobuster — 子域模糊
gobuster vhost -u https://example.com -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt -o gobuster_vhosts.txt -t 50
```

### 5. 漏洞模板扫描 (nuclei)

```bash
# nuclei — 全模板扫描，按严重级别排序
nuclei -l httpx_alive.txt -t ~/nuclei-templates/ -severity critical,high,medium -o nuclei_results.txt

# nuclei — 指定模板分类（CVE/ exposures/ takeovers）
nuclei -u https://example.com -t ~/nuclei-templates/cves/ -o nuclei_cve.txt
nuclei -u https://example.com -t ~/nuclei-templates/exposures/ -o nuclei_exposures.txt
nuclei -u https://example.com -t ~/nuclei-templates/takeovers/ -o nuclei_takeovers.txt

# nuclei — 批量 URL，多线程
nuclei -list all_targets.txt -t ~/nuclei-templates/ -c 50 -rl 30 -o nuclei_batch.txt

# nuclei — 自定义模板运行
nuclei -u https://example.com -t custom-nuclei-templates/ -j -o nuclei_custom.json

# nuclei — 使用 rate-limit 避免触发 WAF
nuclei -u https://example.com -t ~/nuclei-templates/ -rl 10 -c 25 -o nuclei_ratelimited.txt
```

### 6. OSINT 情报收集 (theHarvester)

```bash
# theHarvester — 基础邮箱/子域/主机枚举
theHarvester -d example.com -b all -f harvester_results.html

# theHarvester — 指定数据源
theHarvester -d example.com -b google,bing,linkedin,shodan -f harvester_specific.html

# theHarvester — 指定限制结果数
theHarvester -d example.com -l 500 -b all -f harvester_500.html

# theHarvester — 仅搜索邮箱
theHarvester -d example.com -b email -f emails_only.html
```

### 7. Shodan / Censys 设备搜索

```bash
# Shodan CLI — 初始化 API key
shodan init YOUR_API_KEY

# Shodan — 搜索特定 IP 的所有信息
shodan host 1.2.3.4

# Shodan — 搜索特定端口和服务
shodan search "apache country:US port:80"

# Shodan — 搜索特定产品版本漏洞
shodan search "product:nginx version:1.21"

# Shodan — 搜索开放 RDP 的主机
shodan search "port:3389 country:CN"

# Shodan — 搜索特定组织的 IP 段
shodan search "org:ExampleCorp"

# Shodan — 导出搜索结果到 JSON
shodan search "port:80 country:US" --fields ip_str,port,hostnames --save shodan_results.json

# Censys CLI — 搜索（需先设置 API）
censys search "services.port:443 and location.country:United States" --pages 5

# Censys — 查看特定主机报告
censys view 1.2.3.4
```

### 8. 密钥/凭据泄露扫描 (TruffleHog / Gitleaks)

```bash
# gitleaks — 扫描整个 Git 仓库的历史
gitleaks git -v --repo-path=/path/to/repo --report-path=gitleaks_report.json --report-format=json

# gitleaks — 扫描远程仓库
gitleaks git -v --repo-url=https://github.com/example/repo --report-path=gitleaks_remote.json

# gitleaks — 扫描最近提交
gitleaks git -v --repo-path=. --commit-since="2024-01-01" --report-path=gitleaks_recent.json

# gitleaks — 扫描目录/文件（非 Git）
gitleaks filesystem -v --path=/path/to/scan --report-path=gitleaks_fs.json

# gitleaks — 使用自定义规则配置
gitleaks git -v --repo-path=. --config=custom_gitleaks_rules.toml --report-path=gitleaks_custom.json

# trufflehog — 扫描 Git 仓库（含历史）
trufflehog git file:///path/to/repo --json --results=verified > trufflehog_results.json

# trufflehog — 扫描远程 Git 仓库
trufflehog git https://github.com/example/repo.git --json --results=verified > trufflehog_remote.json

# trufflehog — 扫描目录文件
trufflehog filesystem /path/to/scan --json --results=verified > trufflehog_fs.json

# trufflehog — 仅输出已验证的密钥（减少误报）
trufflehog git file:///path/to/repo --results=verified --json | jq .
```

### 常用字典路径 (SecLists)

```bash
# 常用字典路径（brew install seclists 安装后）
# 目录发现
/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt
/usr/share/seclists/Discovery/Web-Content/raft-large-directories.txt
# 文件发现
/usr/share/seclists/Discovery/Web-Content/raft-medium-files.txt
# 参数发现
/usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt
# 子域名发现
/usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt
/usr/share/seclists/Discovery/DNS/subdomains-top1million-20000.txt
# 密码字典
/usr/share/seclists/Passwords/Common-Credentials/10-million-password-list-top-1000.txt
```
