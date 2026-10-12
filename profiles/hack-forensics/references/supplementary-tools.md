## 补充工具与命令

> 以下工具填补了取证能力的关键空白：Windows EVTX 日志分析、网络 IDS/IPS、恶意软件能力检测、文件类型/壳识别。macOS 是当前主机平台，所有安装命令优先使用 `brew`。

### chainsaw — Windows EVTX 日志快速搜索 (WithSecure Labs)

```bash
# 安装（Rust 编译或下载预编译二进制）
cargo install chainsaw
# 或下载预编译二进制:
# 从 https://github.com/WithSecureLabs/chainsaw/releases 下载 macOS 版本
# 解压后将 chainsaw 和 chainsaw_parser 放入 PATH

# 使用 Sigma 规则搜索 EVTX 日志
chainsaw hunt evtx_logs/ -m sigma_rules/

# 搜索特定事件 ID（如 4624 登录成功）
chainsaw search 'event_id: 4624' evtx_logs/

# 使用完整 Sigma 映射
chainsaw hunt evtx_logs/ -s sigma/ --mapping mappings/sigma-event-mappings.yml

# 输出 CSV 格式
chainsaw hunt evtx_logs/ -m sigma_rules/ --csv --output chainsaw_results.csv

# 搜索多个关键字（凭证窃取、横向移动）
chainsaw search -t 'event_id: 4624 || event_id: 4672 || event_id: 4688' evtx_logs/

# 递归搜索目录
chainsaw hunt /evidence/windows_evtx/ -r -m sigma_rules/
```

### hayabusa — Sigma 规则威胁狩猎 + 时间线生成 (Yamato Security)

```bash
# 安装（下载预编译二进制，Rust 编译，无运行时依赖）
# 从 https://github.com/Yamato-Security/hayabusa/releases 下载 macOS 版本
# 解压后 chmod +x hayabusa && 移入 PATH
# 或使用 Homebrew:
brew install hayabusa

# 生成 CSV 时间线（所有检测到的事件）
./hayabusa csv-timeline -d evtx_logs/ -o timeline.csv

# 生成 Sigma 匹配事件时间线
./hayabusa sigma-timeline -d evtx_logs/ -o sigma_timeline.csv

# 提取所有登录事件
./hayabusa list-logon -d evtx_logs/

# 更新 Sigma 规则库
./hayabusa update-rules

# 设置详细级别（-v verbose, -d debug）
./hayabusa csv-timeline -d evtx_logs/ -o timeline.csv -v

# 忽略信息级别事件，仅输出 medium+ 
./hayabusa csv-timeline -d evtx_logs/ -o timeline.csv -m medium -l high -c critical

# 输出 JSON 格式（用于自动化处理）
./hayabusa json-timeline -d evtx_logs/ -o timeline.json
```

### capa — 恶意软件能力检测 (Mandiant FLARE)

```bash
# 安装
pip install flare-capa
# 或下载独立二进制:
# 从 https://github.com/mandiant/capa/releases 下载 macOS 版本

# 检测可执行文件的能力（MITRE ATT&CK 技术、API 调用等）
capa malware_sample.exe

# JSON 输出（用于自动化处理）
capa -j malware_sample.exe

# 使用自定义规则目录
capa -r capa_rules/ malware_sample.exe

# 分析 ELF 二进制文件
capa -r capa_rules/ linux_sample.elf

# 分析 shellcode
capa shellcode.bin

# 仅输出特定严重级别的规则
capa malware_sample.exe --severity=high

# 查看规则统计
capa --rules=counts malware_sample.exe

# 自动更新规则库
capa --update-rules
```

### Detect It Easy (DIE) — 文件类型/壳/编译器检测

```bash
# 安装（下载预编译二进制，包含 CLI + GUI）
# 从 https://github.com/horsicq/Detect-It-Easy/releases 下载 macOS 版本
# 解压后将 diec (CLI) 和 die (GUI) 移入 PATH

# 检测文件类型、壳、编译器
diec malware_sample.exe

# 深度分析模式
diec -d malware_sample.exe

# JSON 输出（用于自动化）
diec -j malware_sample.exe

# 分析 ELF 文件
diec linux_sample.elf

# 分析文档文件（Office/PDF）
diec suspicious_document.docx

# 分析打包后的 .NET 程序集
diec packed_sample.exe

# 递归扫描目录中的所有文件
for f in /evidence/samples/*; do echo "=== $f ==="; diec "$f"; done
```

### Zeek — 网络流量分析框架 (IDS/NSM)

```bash
# 安装
# macOS:
brew install zeek
# Linux: 从源码编译或使用官方仓库

# 分析 PCAP 文件（生成 conn.log, dns.log, http.log 等）
zeek -r capture.pcap

# 使用本地策略脚本分析
zeek -r capture.pcap local

# 使用 zeek-cut 解析 Zeek 日志（提取指定字段）
cat conn.log | zeek-cut id.orig_h id.resp_h id.orig_p

# 仅加载特定脚本
zeek -r capture.pcap frameworks/intel/seen

# 实时监听网络接口（需要 root）
sudo zeek -i eth0

# 输出 HTTP 请求的 host 和 URI
cat http.log | zeek-cut host uri

# 输出 DNS 查询
cat dns.log | zeek-cut query

# 提取文件（从 HTTP/SMB 传输中）
zeek -r capture.pcap frameworks/files/hash-all-files

# 使用 ICAP 服务器进行恶意软件检测
zeek -r capture.pcap -e 'load file_analysis'
```

### Suricata — 网络 IDS/IPS 引擎

```bash
# 安装
# macOS:
brew install suricata
# Linux:
# sudo apt install suricata

# 分析 PCAP 文件（使用规则检测威胁）
suricata -r capture.pcap -c /etc/suricata/suricata.yaml

# 实时 IDS 监听网络接口
sudo suricata -i eth0 -c /etc/suricata/suricata.yaml

# 离线分析 PCAP 到指定日志目录
suricata -r capture.pcap -l /var/log/suricata/ --runmode single

# 更新规则库
suricata-update

# 使用自定义规则文件
suricata -r capture.pcap -S custom.rules -l /var/log/suricata/

# 指定输出级别（-v verbose）
suricata -r capture.pcap -c /etc/suricata/suricata.yaml -v

# 测试配置文件语法
suricata -T -c /etc/suricata/suricata.yaml

# 多线程分析模式
suricata -r capture.pcap --runmode autofp -c /etc/suricata/suricata.yaml

# 查看 fast.log 中的告警
cat /var/log/suricata/fast.log

# 查看 JSON 格式的详细事件日志
cat /var/log/suricata/eve.json | jq .

---
