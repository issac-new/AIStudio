## hackingtool 工具速查

hack-recon 负责的 hackingtool 分类工具清单（安装方式：brew / pip / go / git）。

### Information Gathering（27 工具）

| 工具 | 用途 | 安装方式 |
|------|------|----------|
| NMAP | 端口/服务/版本扫描，脚本引擎 | brew |
| Dracnmap | NMAP 界面封装，简化扫描 | git |
| PortScan | 端口扫描器 | git |
| Host2IP | 域名转 IP | git |
| XeroSploit | MITM/网络攻击套件 | git |
| RedHawk | 综合侦察（CMS/端口/IP/WHOIS） | git |
| ReconSpider | 高级侦察框架 | git |
| IsItDown | 网站可达性检查 | git |
| Infoga | 邮箱信息收集（IP/泄露） | git |
| ReconDog | 侦察工具集 | git |
| Striker | 攻击面自动发现 | git |
| SecretFinder | JS 中敏感信息发现 | git |
| Shodan | 互联网设备搜索引擎 | pip |
| PortScannerRanger | 多线程端口扫描 | git |
| Breacher | 目录/文件爆破 | git |
| TheHarvester | 邮箱/子域/人员情报 | pip |
| Amass | 深度子域/攻击面测绘 | brew |
| Masscan | 超高速端口扫描 | brew |
| RustScan | 现代 Rust 端口扫描器 | brew |
| Holehe | 检查邮箱注册的网站 | pip |
| Maigret | 人物 OSINT（几百个站点） | pip |
| Httpx | HTTP 探测+指纹 | go |
| SpiderFoot | 自动化 OSINT 编排平台 | pip |
| Subfinder | 子域枚举 | go |
| TruffleHog | Git 密钥泄露扫描 | brew |
| Gitleaks | Git 密钥泄露检测 | brew |
| DNSenum | 子域/DNS 枚举 | pip |

### Anonsurf（3 工具）

| 工具 | 用途 | 安装方式 |
|------|------|----------|
| AnonymouslySurf | 匿名浏览/代理 | git |
| Multitor | 多 Tor 代理实例 | git |
| Anonsurf | Tor 匿名网络路由 | git |

### Mobile Security（3 工具 — App 侦察）

| 工具 | 用途 | 安装方式 |
|------|------|----------|
| MobSF | 移动应用综合安全分析框架 | pip |
| Frida | 动态插桩/运行时 hook | brew |
| Objection | Frida 封装，移动 App 运行时探索 | pip |

### Reverse Engineering（5 工具 — 二进制侦察）

| 工具 | 用途 | 安装方式 |
|------|------|----------|
| AndroGuard | Android APK 静态分析 | pip |
| Apk2Gold | APK 反编译为 Java | git |
| Jadx | Dex→Java 反编译 | brew |
| Ghidra | NSA 反汇编/反编译框架 | brew |
| Radare2 | 逆向分析框架 | brew |
