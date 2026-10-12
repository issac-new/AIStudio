## 具体操作命令手册

> 以下命令均为可直接复制运行的 bash 命令，将 `dump.dmp` / `disk.img` / `capture.pcap` 替换为实际证据文件路径。长耗时分析用 `terminal(background=true, notify_on_complete=true)`。

### 1. Volatility3 内存取证分析

```bash
# 安装 Volatility3
pip install volatility3

# 安装符号表（必需！没有符号表，windows.* 插件将无法运行）
# 方法1: 使用 vol3 内置符号表下载器
vol.py --symbol-dirs ~/volatility3/symbols windows.info  # 首次运行会提示下载
# 下载 Windows 符号表（ISO 对应版本）:
#   访问 https://downloads.volatilityfoundation.org/volatility3/symbols/windows/
#   下载对应 Windows 版本的 zip 文件（如 Win10x64_19041.zip）
#   放入 ~/volatility3/symbols/ 目录
mkdir -p ~/volatility3/symbols
# 示例: 下载 Windows 10 19041 符号表
curl -L -o ~/volatility3/symbols/Win10x64_19041.zip https://downloads.volatilityfoundation.org/volatility3/symbols/windows/Win10x64_19041.zip
# 验证符号表安装
vol.py -f memory.dmp windows.info  # 应输出 OS 版本信息而非报错

# 列出所有可用插件
vol.py -f memory.dmp windows.info

# 进程列表 — 查看运行中的进程
vol.py -f memory.dmp windows.pslist

# 进程树 — 查看父子进程关系（发现异常进程树）
vol.py -f memory.dmp windows.pstree

# 网络连接 — 查看 TCP/UDP 连接（C2 通信检测）
vol.py -f memory.dmp windows.netscan

# 恶意代码检测 — 检测注入/恶意代码（malfind）
vol.py -f memory.dmp windows.malfind

# DLL 列表 — 查看进程加载的 DLL
vol.py -f memory.dmp windows.dlllist --pid <PID>

# 句柄列表 — 查看进程的句柄（文件/注册表/互斥体）
vol.py -f memory.dmp windows.handles --pid <PID>

# 注册表 — 提取 SAM 注册表（凭据提取）
vol.py -f memory.dmp windows.registry.hivescan
vol.py -f memory.dmp windows.registry.hivelist

# 提取特定进程的内存（dump 进程）
vol.py -f memory.dmp windows.pslist --pid <PID> --dump

# 检测隐藏进程（rootkit 检测）
vol.py -f memory.dmp windows.pslist --pid <PID>
vol.py -f memory.dmp windows.psscan  # 扫描池标签，发现隐藏进程

# 服务列表 — 查看 Windows 服务
vol.py -f memory.dmp windows.svcscan

# 计划任务 — 查看 schtasks
vol.py -f memory.dmp windows.schtasks

# 提取凭据 — 需要 Mimikatz 模块（需额外安装）
vol.py -f memory.dmp windows.hashdump
vol.py -f memory.dmp windows.lsadump

# 命令历史 — 提取 cmd/powershell 历史
vol.py -f memory.dmp windows.cmdscan
vol.py -f memory.dmp windows.consoles
```

### 2. dc3dd 磁盘镜像获取（含哈希校验）

```bash
# 安装 dc3dd
# macOS:
brew install dc3dd
# Linux:
# sudo apt install dc3dd

# 基础镜像获取 + SHA-256 哈希计算
sudo dc3dd if=/dev/sda of=/evidence/disk.img conv=noerror,sync hash=sha256 hashlog=/evidence/disk_hash.txt

# 同时计算 MD5 和 SHA-256
sudo dc3dd if=/dev/sda of=/evidence/disk.img conv=noerror,sync hash=md5,sha256 hashlog=/evidence/disk_hash.txt

# 压缩镜像 + 哈希
sudo dc3dd if=/dev/sda conv=noerror,sync hash=sha256 hashlog=/evidence/disk_hash.txt | gzip -c > /evidence/disk.img.gz

# 分割大镜像（2GB 分块）
sudo dc3dd if=/dev/sda of=/evidence/disk_part.img conv=noerror,sync hash=sha256 hashlog=/evidence/disk_hash.txt split=2G

# 从设备文件直接镜像到远程（通过 netcat，远程端校验哈希）
sudo dc3dd if=/dev/sda conv=noerror,sync hash=sha256 hashlog=/evidence/disk_hash.txt | nc 192.168.1.100 9000

# 验证镜像哈希完整性
sha256sum /evidence/disk.img
cat /evidence/disk_hash.txt  # 与上面比对
```

### 3. tshark PCAP 分析（常用过滤器）

```bash
# 安装 tshark
# macOS:
brew install tshark
# 或安装完整 Wireshark GUI:
# brew install --cask wireshark
# Linux:
# sudo apt install tshark

# 基本读取 — 查看所有包
tshark -r capture.pcap

# 按 IP 过滤
tshark -r capture.pcap -Y "ip.addr == 1.2.3.4"

# 按源/目的 IP 过滤
tshark -r capture.pcap -Y "ip.src == 1.2.3.4"
tshark -r capture.pcap -Y "ip.dst == 1.2.3.4"

# 按端口过滤（C2 通信检测）
tshark -r capture.pcap -Y "tcp.port == 4444"

# HTTP 流量分析
tshark -r capture.pcap -Y "http" -T fields -e http.request.uri -e http.host -e http.user_agent

# HTTP POST 请求（数据外泄检测）
tshark -r capture.pcap -Y "http.request.method == POST" -T fields -e http.request.uri -e http.file_data

# DNS 查询（DNS 隧道/C2 检测）
tshark -r capture.pcap -Y "dns.qry.name" -T fields -e dns.qry.name

# TLS/HTTPS SNI（检测恶意域名通信）
tshark -r capture.pcap -Y "tls.handshake.type == 1" -T fields -e tls.handshake.extensions_server_name

# 提取文件（HTTP 下载的文件）
tshark -r capture.pcap --export-objects http,/evidence/extracted_http/

# 提取文件（SMB 传输的文件）
tshark -r capture.pcap --export-objects smb,/evidence/extracted_smb/

# 统计 — 协议分布
tshark -r capture.pcap -z io,phs

# 统计 — IP 会话统计（发现异常通信频率）
tshark -r capture.pcap -z conv,tcp

# 跟踪 TCP 流（重建会话内容）
tshark -r capture.pcap -z "follow,tcp,ascii,0"

# 导出为文本（用于报告）
tshark -r capture.pcap -V > pcap_verbose.txt
```

### 4. Autopsy CLI（命令行界面）

```bash
# 安装 Autopsy + Sleuth Kit
# macOS:
brew install sleuthkit
# Autopsy GUI 需 Java，macOS 上建议使用 Docker:
# docker run -p 5800:5800 -v /evidence:/evidence prasanna1889/autopsy-docker
# Linux:
# sudo apt install autopsy sleuthkit

# 从镜像创建文件系统时间线 (mactime)
fls -r -m / /evidence/disk.img > bodyfile
mactime -b bodyfile -d > timeline.csv

# 列出镜像中的文件
fls -r /evidence/disk.img

# 列出已删除文件
fls -rd /evidence/disk.img

# 提取特定 inode 对应的文件
icat /evidence/disk.img <inode> > extracted_file

# 查看镜像分区信息
mmls /evidence/disk.img

# 查看文件系统类型
fsstat /evidence/disk.img

# 查看特定文件的元数据
istat /evidence/disk.img <inode>

# Autopsy CLI — 创建新案件（自动化方式）
autopsy -c /evidence/case_data /evidence/disk.img

# 搜索镜像中的关键词
sigfind -l /evidence/disk.img  # 搜索文件签名
```

### 5. Binwalk 固件提取

```bash
# 安装 binwalk
# macOS:
brew install binwalk
# 或 pip:
# pip install binwalk
# Linux:
# sudo apt install binwalk

# 扫描固件/二进制文件中的嵌入文件和签名
binwalk firmware.bin

# 提取所有嵌入文件
binwalk -e firmware.bin

# 递归提取（提取后继续扫描提取出的文件）
binwalk -eM firmware.bin

# 指定提取目录
binwalk -e -C /evidence/extracted_firmware firmware.bin

# 手动提取特定偏移量的数据
binwalk -dd 'gzip:gz' firmware.bin

# 查看 entropy（熵分析，发现加密/压缩区域）
binwalk -E firmware.bin

# 使用特定签名数据库扫描
binwalk -B custom_signatures.bin firmware.bin

# 提取后查看文件类型
file /evidence/extracted_firmware/_firmware.bin.extracted/*
```

### 6. YARA 规则扫描

```bash
# 安装 YARA
# macOS:
brew install yara
# Linux:
# sudo apt install yara

# 基本扫描 — 使用规则文件扫描目录
yara -r rules.yar /evidence/suspicious_files/

# 递归扫描 + 显示文件路径
yara -r -w rules.yar /evidence/suspicious_files/ > yara_results.txt

# 下载社区规则库
git clone https://github.com/Yara-Rules/rules.git /opt/yara-rules

# 使用社区规则扫描
yara -r /opt/yara-rules/index.yar /evidence/suspicious_files/

# 扫描单个文件 + 显示匹配的规则详情
yara -s rules.yar malware_sample.exe

# 扫描进程内存（需 root）
sudo yara rules.yar <PID>

# 扫描并输出为 JSON 格式
yara -r -m rules.yar /evidence/suspicious_files/ | jq .

# 编译规则（提高扫描速度）
yarac rules.yar rules.yarc
yara -C rules.yarc /evidence/suspicious_files/

# 自定义规则示例 — 检测 webshell 特征
cat > webshell.yar << 'EOF'
rule webshell_php_eval {
    strings:
        $eval = "eval(" nocase
        $base64 = "base64_decode(" nocase
        $system = "system(" nocase
        $shell = "shell_exec(" nocase
    condition:
        any of them and filesize < 100KB
}
EOF
yara -r webshell.yar /var/www/html/
```

### 7. Pspy 进程监听（无需 root）

```bash
# 下载 pspy 预编译二进制
wget https://github.com/dominicbreuker/pspy/releases/latest/download/pspy64
chmod +x pspy64

# 基础监听 — 监控所有进程执行事件
./pspy64

# 监听 + 显示命令行参数
./pspy64 -c

# 设置事件数量限制
./pspy64 -n 1000

# 监听特定目录的文件系统事件（cron/定时任务）
./pspy64 --dir /var/spool/cron/ --dir /etc/cron.d/

# 输出到文件（后台运行）
./pspy64 -c > /evidence/pspy_log.txt 2>&1 &

# 监听 30 分钟后停止
timeout 1800 ./pspy64 -c > /evidence/pspy_30min.txt

# 捕获 cron 执行（常见提权路径）
./pspy64 -c 2>&1 | grep -E "cron|root|UID=0"
```

### 8. BulkExtractor 批量特征提取

```bash
# 安装 bulk_extractor
# macOS:
brew install bulk_extractor
# Linux:
# sudo apt install bulk-extractor

# 基础扫描 — 从磁盘镜像提取特征
bulk_extractor -o /evidence/bulk_output/ /evidence/disk.img

# 指定特征文件输出目录 + 启用所有扫描器
bulk_extractor -o /evidence/bulk_output/ -S max_partition_size=0 /evidence/disk.img

# 从 PCAP 文件提取特征
bulk_extractor -o /evidence/bulk_pcap/ -e network /evidence/capture.pcap

# 仅提取邮箱
bulk_extractor -o /evidence/bulk_email/ -e email /evidence/disk.img

# 仅提取 URL
bulk_extractor -o /evidence/bulk_url/ -e url /evidence/disk.img

# 仅提取信用卡号
bulk_extractor -o /evidence/bulk_cc/ -e find /evidence/disk.img

# 并行处理（利用多核）
bulk_extractor -o /evidence/bulk_output/ -j 4 /evidence/disk.img

# 生成直方图报告
bulk_extractor -o /evidence/bulk_output/ -H /evidence/bulk_histograms/ /evidence/disk.img

# 查看提取结果
ls /evidence/bulk_output/
# 关键文件：email.txt, url.txt, rcf.txt, ccn.txt, jpeg.txt, exif.txt, histogram*.txt
```
