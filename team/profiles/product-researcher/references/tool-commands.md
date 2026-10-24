## 具体操作命令手册

### httpx（API 数据获取）

```bash
# Install
pip install httpx

# 获取市场数据
python3 << 'EOF'
import httpx, json
r = httpx.get("https://api.example.com/market-data", params={"region": "APAC"}, timeout=15)
data = r.json()
print(f"获取 {len(data)} 条记录, status={r.status_code}")
EOF

# GitHub API 请求
python3 -c "
import httpx
r = httpx.get('https://api.github.com/repos/org/repo', timeout=15)
print(r.json().get('description', 'N/A'))
"
```

### pandas（数据分析与市场规模估算）

```bash
# Install
pip install pandas

# TAM/SAM/SOM 计算
python3 << 'EOF'
import pandas as pd
tam = pd.DataFrame({
    'Region': ['North America', 'Europe', 'APAC'],
    'TAM_users': [50e6, 35e6, 80e6],
    'ASP': [99, 89, 49]
})
tam['TAM_revenue'] = tam['TAM_users'] * tam['ASP']
print(f"Global TAM: ${tam['TAM_revenue'].sum():.2f}")
tam.to_csv('tam_estimate.csv', index=False)
EOF

# CSV 数据加载
python3 -c "
import pandas as pd
df = pd.read_csv('market_data.csv')
print(df.describe())
print(df.groupby('region')['revenue'].sum())
"
```

### jq（JSON 数据处理）

```bash
# Install
brew install jq

# 竞品数据分析
curl -s "https://api.example.com/competitors" | jq '.data[] | {name, market_share, revenue}'
curl -s "https://api.example.com/trends" | jq 'sort_by(.growth) | reverse | .[:5]'

# JSON 文件处理
cat market_report.json | jq '[.competitors[] | {name, score: (.rating * .reviews)}] | sort_by(.score)'
```

### matplotlib / plotly（数据可视化）

```bash
# Install
pip install matplotlib plotly

# 柱状图：TAM by Region
python3 << 'EOF'
import matplotlib.pyplot as plt
segments = ['North America', 'Europe', 'APAC']
values = [4950, 3115, 3920]
plt.bar(segments, values, color=['#2E86AB', '#A23B72', '#F18F01'])
plt.title('TAM by Region ($M)')
plt.ylabel('Revenue ($M)')
plt.savefig('tam_by_region.png', dpi=150, bbox_inches='tight')
print('tam_by_region.png saved')
EOF
```

### xlsxwriter（调研报告表格）

```bash
# Install
pip install xlsxwriter

# 竞品对比矩阵
python3 << 'EOF'
import xlsxwriter
wb = xlsxwriter.Workbook('competitor_matrix.xlsx')
ws = wb.add_worksheet('Competitors')
bold = wb.add_format({'bold': True, 'bg_color': '#1F4E79', 'font_color': 'white'})
ws.write('A1', 'Product', bold); ws.write('B1', 'Positioning', bold)
ws.write('C1', 'Pricing', bold); ws.write('D1', 'Market Share', bold)
data = [['Product A', 'Premium', '$99/mo', '32%'], ['Product B', 'Mid-range', '$49/mo', '28%']]
for i, row in enumerate(data, 2):
    for j, val in enumerate(row):
        ws.write(i-1, j, val)
wb.close()
print('competitor_matrix.xlsx generated')
EOF
```

### curl（公开 API 数据）

```bash
# 竞品分析 API
curl -s "https://newsapi.org/v2/everything?q=market+trend&pageSize=5" | jq '.articles[].title'

# GitHub 竞品仓库信息
gh api repos/competitor-org/competitor-repo --jq '.stargazers_count, .forks_count'
```

### pandoc（调研报告格式转换）

```bash
# Install
brew install pandoc

# 报告导出
pandoc research_report.md -o research_report.pdf
pandoc research_report.md -o research_report.docx
pandoc research_report.md -o research_report.html
```
---


---
