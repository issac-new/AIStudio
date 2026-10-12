## hackingtool 工具速查

### Forensics (9)

| 工具 | 用途 | 安装方式 |
|------|------|----------|
| Autopsy | 磁盘取证与文件系统分析（GUI，基于 Sleuth Kit） | `brew install sleuthkit` / `sudo apt install autopsy` |
| Wireshark | 网络流量抓取与分析（PCAP 解码、过滤、C2 检测） | `brew install --cask wireshark` / `sudo apt install wireshark` |
| BulkExtractor | 从磁盘镜像批量提取特征（邮箱、URL、信用卡号等） | `brew install bulk_extractor` / `sudo apt install bulk-extractor` |
| Guymager | 鉴识级磁盘镜像获取（支持 dc3dd/ewf，计算哈希） | `sudo apt install guymager`（仅 Linux） |
| Toolsley | 多功能文件分析工具箱（文件识别、哈希、元数据提取） | 访问 https://toolsley.com 在线使用 |
| Volatility3 | 内存取证框架（进程/网络/注册表/rootkit 检测） | `pip install volatility3` |
| Binwalk | 固件与二进制文件分析（提取嵌入文件、扫描签名） | `brew install binwalk` / `sudo apt install binwalk` |
| Pspy | 无需 root 的进程监听工具（捕捉 cron/系统定时任务执行） | 从 https://github.com/dominicbreuker/pspy 下载二进制 |

### Steganography (5)

| 工具 | 用途 | 安装方式 |
|------|------|----------|
| SteganoHide | 在图像/音频中隐藏数据（LSB 隐写嵌入） | `pip install stegano` |
| StegnoCracker | 隐写分析与破解（检测并提取隐藏数据） | `pip install stegocracker` |
| StegoCracker | 隐写提取与破解（多格式支持、字典暴力提取） | `pip install stegcracker` |
| Whitespace | 空白字符隐写（用空格/Tab 编码隐藏信息） | `pip install whitespace` |
| Stegexpose | 图像隐写分析（LSB 检测、批量扫描可疑图像） | `pip install stegexpose` |
