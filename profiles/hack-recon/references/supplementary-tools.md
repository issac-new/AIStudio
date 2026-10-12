## 补充工具与命令

> 以下工具填补了侦察能力的关键空白：URL 归档收集、DNS 解析、Web 爬虫、端口扫描、参数发现、多引擎暴露主机发现、自动化侦察管线。所有 Go 工具需先 `export GOPATH=$HOME/go && export PATH=$PATH:$GOPATH/bin`。

### naabu — 快速端口扫描器 (ProjectDiscovery)

```bash
# 安装
go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest

# 全端口扫描单个主机
naabu -host example.com -p 1-65535 -o naabu_results.txt

# 扫描 IP 列表，Top 1000 端口
naabu -list hosts.txt -top-ports 1000 -o naabu_top.txt

# 扫描指定端口并管道到 httpx 进行 Web 探测
naabu -host example.com -p 80,443,8080 -silent | httpx

# SYN 扫描（需 root，类似 nmap -sS）
sudo naabu -host 10.0.0.0/24 -p 1-1000 -silent -o naabu_subnet.txt

# 输出 JSON 格式
naabu -host example.com -p - -json -o naabu_json.txt
```

### dnsx — DNS 解析工具包 (ProjectDiscovery)

```bash
# 安装
go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest

# A 记录解析
echo example.com | dnsx -a -resp

# 批量解析子域列表到 IP
cat subdomains.txt | dnsx -silent -a -resp-only > resolved_ips.txt

# DNS 暴力枚举（使用字典）
dnsx -d example.com -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt -a -o dnsx_brute.txt

# 查询多种记录类型（A, AAAA, CNAME, MX, NS, TXT, SOA）
dnsx -d example.com -a -aaaa -cname -mx -ns -txt -resp -o dnsx_all_records.txt

# 反向 DNS 查询（IP → 主机名）
cat ips.txt | dnsx -reverse -resp-only -o reverse_dns.txt

# 使用自定义解析器
dnsx -d example.com -a -r 8.8.8.8,1.1.1.1 -resp -o dnsx_custom_resolvers.txt
```

### katana — 下一代爬虫框架 (ProjectDiscovery)

```bash
# 安装
go install github.com/projectdiscovery/katana/cmd/katana@latest

# 爬取单个 URL，深度 3
katana -u https://example.com -d 3 -o katana_urls.txt

# 批量爬取存活主机列表，提取 JS 文件
katana -list alive_hosts.txt -d 2 -jc -o katana_crawl.txt

# 截图模式
katana -u https://example.com -sc -o katana_screenshots.txt

# 仅爬取特定域名范围（防止越界）
katana -u https://example.com -d 3 -dn example.com -o katana_scoped.txt

# 爬取 + 表单自动填充
katana -u https://example.com -d 2 -aff -o katana_forms.txt

# 无头浏览器模式（动态渲染 JS）
katana -u https://example.com -headless -d 3 -o katana_headless.txt
```

### gau — URL 归档收集 (AlienVault OTX + Wayback + Common Crawl)

```bash
# 安装
go install github.com/lc/gau/v2/cmd/gau@latest

# 获取目标域名的所有已知 URL
gau example.com > gau_urls.txt

# 多线程获取
gau --threads 10 example.com | tee gau_urls.txt

# 包含子域
echo example.com | gau --subs > gau_subs.txt

# 指定数据源（wayback, commoncrawl, otx）
gau --providers wayback,otx example.com > gau_wayback.txt

# 过滤特定扩展名的 URL
gau example.com | grep -E "\.(js|php|asp|aspx)$" > gau_scripts.txt

# 过滤含参数的 URL（用于参数发现）
gau example.com | grep "=" > gau_params.txt
```

### waybackurls — Wayback Machine URL 收集

```bash
# 安装
go install github.com/tomnomnom/waybackurls@latest

# 获取域名在 Wayback Machine 上的所有归档 URL
waybackurls example.com > wayback_urls.txt

# 批量获取
cat domains.txt | waybackurls > all_wayback.txt

# 查找归档中的 JS 文件
waybackurls example.com | grep -E "\.js$"

# 查找归档中的 API 端点
waybackurls example.com | grep -E "/api/" | sort -u > api_endpoints.txt

# 查找已删除但仍可访问的旧端点
waybackurls example.com | grep -E "\.(php|asp|aspx|jsp)$" | sort -u
```

### uncover — 多引擎暴露主机发现 (ProjectDiscovery)

```bash
# 安装
go install github.com/projectdiscovery/uncover/cmd/uncover@latest

# Shodan 搜索（需在 ~/.config/uncover/provider-config.yaml 配置 API key）
uncover -q "ssl.cert.subject.CN:example.com" -e shodan -o uncover_results.txt

# 多引擎搜索（Shodan + Censys + Fofa）
uncover -q "org:ExampleCorp" -e shodan,censys,fofa -o uncover_multi.txt

# 搜索暴露的 RDP 服务
uncover -q "port:3389 country:US" -e shodan -o uncover_rdp.txt

# 搜索暴露的 Elasticsearch
uncover -q "port:9200 product:elastic" -e shodan -o uncover_es.txt

# 配置文件示例 (~/.config/uncover/provider-config.yaml):
# shodan: [YOUR_SHODAN_API_KEY]
# censys: [YOUR_CENSYS_API_ID]:[YOUR_CENSYS_API_SECRET]
# fofa: [YOUR_FOFA_EMAIL]:[YOUR_FOFA_KEY]
```

### hakrawler — 快速 Web 爬虫

```bash
# 安装
go install github.com/hakluke/hakrawler@latest

# 爬取单个站点，深度 3
echo https://example.com | hakrawler -depth 3

# 批量爬取，跳过 TLS 验证
cat hosts.txt | hakrawler -depth 2 -insecure

# 保存结果到文件
echo https://example.com | hakrawler -depth 3 -outfile hakrawler_out.txt

# 使用子域包含模式
echo https://example.com | hakrawler -depth 3 -s

# 限制并发和延迟（避免触发 WAF）
echo https://example.com | hakrawler -depth 3 -t 5 -delay 2
```

### Osmedeus — 全自动侦察管线

```bash
# 安装
go install github.com/j3ssie/osmedeus/cmd/osmedeus@latest
osmedeus config init  # 初始化配置

# 完整侦察扫描单个目标
osmedeus scan -t example.com

# 批量扫描多个目标
osmedeus scan -T targets.txt

# 运行特定模块（仅子域枚举）
osmedeus scan -m subdomain -t example.com

# 运行特定模块（仅漏洞扫描）
osmedeus scan -m vuln -t example.com

# 查看所有可用模块
osmedeus module list

# 恢复中断的扫描
osmedeus scan --resume /path/to/workspace/scan-workspace
```

### reconftw — 自动化侦察框架

```bash
# 安装
git clone https://github.com/six2dez/reconftw.git
cd reconftw && chmod +x install.sh && ./install.sh

# 完整侦察（含子域枚举、端口扫描、漏洞检测）
./reconftw.sh -d example.com -r

# 仅子域扫描
./reconftw.sh -d example.com -s

# 多目标批量侦察
./reconftw.sh -l targets.txt -r

# 仅被动模式（不主动扫描目标）
./reconftw.sh -d example.com -p

# 配置文件 (~/.config/reconftw/config.yaml):
# 修改 API keys、字典路径、并发参数等
```

### Arjun — HTTP 参数发现套件

```bash
# 安装
pip install arjun
# 或从源码安装:
# git clone https://github.com/s0md3v/Arjun && cd Arjun && python3 setup.py install

# 发现 GET 隐藏参数
arjun -u https://example.com/page

# 发现 POST 隐藏参数
arjun -u https://example.com/api --post

# 批量扫描，多方法（GET/POST/JSON）
arjun -i hosts.txt -m GET,POST,JSON -o arjun_results.txt

# 使用稳定模式（降低误报，降低速度）
arjun -u https://example.com/page --stable

# 包含请求头
arjun -u https://example.com/api -m GET --include "Authorization: Bearer xxx"

# 超时和重试设置
arjun -u https://example.com/page -T 5 -t 10 -o arjun_custom.txt

---
