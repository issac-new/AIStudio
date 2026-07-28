## 具体操作命令手册

### pandoc（报告格式转换）

```bash
# Install
brew install pandoc

# 摘要/报告导出
pandoc exec_summary.md -o exec_summary.pdf     # Markdown → PDF
pandoc exec_summary.md -o exec_summary.html    # Markdown → HTML
pandoc exec_summary.md -o exec_summary.docx    # Markdown → Word
```

### jq（JSON 指标数据处理）

```bash
# Install
brew install jq

# 指标聚合
cat metrics.json | jq '[.metrics[] | {name, value, p99, p95}] | sort_by(.p99) | reverse'
cat status_pages.json | jq '[.pages[] | select(.status != "operational")] | length'

# 时间序列
cat uptime.json | jq '[.data[] | {date: .date, uptime: (.uptime * 100)}]'
```

### yq（YAML/TOML 数据处理）

```bash
# Install
brew install yq        # mikefarah/yq (Go 版)

# YAML 处理
yq '.services | keys' docker-compose.yml
yq '.metrics.availability' slo.yaml
yq eval '.services[] | select(.status == "degraded") | .name' status.yaml

# TOML 处理
yq -p toml '.deployment' config.toml
```

### graphviz（架构/流程图表生成）

```bash
# Install
brew install graphviz

# 系统架构图
python3 << 'EOF'
with open('architecture.dot', 'w') as f:
    f.write('''
digraph Architecture {
    rankdir=TB;
    node [shape=box, style=filled, fillcolor="#E8F4F8"];
    "用户" -> "API网关" -> "微服务A" -> "数据库";
    "微服务A" -> "微服务B" [style=dashed, label="消息队列"];
}
''')
import subprocess
subprocess.run(['dot', '-Tpng', 'architecture.dot', '-o', 'architecture.png'])
print('architecture.png generated')
EOF
```

### glow（Markdown 预览）

```bash
# Install
brew install glow

# 渲染 Markdown
glow exec_summary.md                        # 终端内渲染
glow -p exec_summary.md                     # 分页模式
glow -s dark exec_summary.md                # 暗色主题
```

### wttr.in（天气 - CLI 数据检索示例）

```bash
# 命令行天气查询（示例：CLI 数据检索模式）
curl -s "wttr.in/London?format=3"           # 简洁天气
curl -s "wttr.in/Beijing?lang=zh"           # 中文天气
curl -s "wttr.in/Moon"                      # 月相
```

### matplotlib / plotly（数据可视化）

```bash
# Install
pip install matplotlib plotly

# KPI 趋势图
python3 << 'EOF'
import matplotlib.pyplot as plt
months = ['Jan', 'Feb', 'Mar', 'Apr', 'May']
kpi = [98.5, 99.1, 98.7, 99.3, 99.0]
plt.plot(months, kpi, marker='o', linewidth=2, color='#2E86AB')
plt.axhline(y=99.0, color='red', linestyle='--', label='Target 99.0%')
plt.title('系统可用性趋势'); plt.ylabel('Availability (%)')
plt.ylim(98, 100); plt.legend(); plt.grid(True, alpha=0.3)
plt.savefig('availability_trend.png', dpi=150, bbox_inches='tight')
print('availability_trend.png saved')
EOF
```

### Python 数据 One-liners

```bash
# 指标汇总统计
python3 -c "
import json; d=json.load(open('metrics.json'))
vals = [m['value'] for m in d['metrics']]
print(f'Mean: {sum(vals)/len(vals):.2f}, Max: {max(vals)}, Min: {min(vals)}')
"

# 环比计算
python3 -c "
current = 98.7; previous = 99.1
print(f'MoM change: {current - previous:+.2f}pp ({(current/previous - 1)*100:+.2f}%)')
"

# 文本统计
python3 -c "
text = open('report.md').read()
words = text.split()
print(f'Words: {len(words)}, Chars: {len(text)}, Lines: {text.count(chr(10))}')
"
```

### 文本处理管道

```bash
# 字数统计
wc -w exec_summary.md                           # 字数
wc -l exec_summary.md                           # 行数

# 关键词提取
grep -oP '\b[A-Z][a-z]{3,}\b' exec_summary.md | sort | uniq -c | sort -rn | head -20

# 指标提取
grep -E '[0-9]+\.[0-9]+%' exec_summary.md       # 提取百分比
```
---


---
