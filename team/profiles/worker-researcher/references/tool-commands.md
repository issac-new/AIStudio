## 具体操作命令手册

### httpx（HTTP 请求与 API 调研）

```bash
# Install
pip install httpx

# API 请求
python3 -c "
import httpx
r = httpx.get('https://api.github.com/repos/org/repo', timeout=15)
print(r.status_code, r.json().get('description', 'N/A'))
"

# 带参数的请求
python3 << 'EOF'
import httpx, json
r = httpx.get("https://jsonplaceholder.typicode.com/posts", params={"_limit": 3})
for post in r.json():
    print(f"#{post['id']}: {post['title']}")
EOF
```

### curl（命令行数据获取）

```bash
# 下载文件
curl -L -o research_material.pdf "https://example.com/report.pdf"

# API 测试
curl -s "https://api.github.com/repos/org/repo/readme" | jq '.content' | base64 -D

# 带 Header 的请求
curl -s -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/org/repo"
```

### jq（JSON 结果处理）

```bash
# Install
brew install jq

# API 结果解析
curl -s "https://api.example.com/data" | jq '.items[] | {id, name, score}'
cat research_results.json | jq '[.results[] | select(.confidence > 0.8)] | sort_by(.score) | reverse'
```

### pandas（数据分析）

```bash
# Install
pip install pandas

# CSV 数据分析
python3 << 'EOF'
import pandas as pd
df = pd.read_csv('research_data.csv')
print(f"Rows: {len(df)}, Columns: {list(df.columns)}")
print(df.describe())
print(f"Top results:\n{df.sort_values('score', ascending=False).head(5)}")
df.to_json('filtered_results.json', orient='records')
EOF
```

### pandoc（文档格式转换）

```bash
# Install
brew install pandoc

# 文档格式互转
pandoc research.md -o research.pdf        # Markdown → PDF
pandoc research.md -o research.html       # Markdown → HTML
pandoc research.md -o research.docx       # Markdown → Word
pandoc api_docs.html -o api_docs.md       # HTML → Markdown
```

### htmlq（HTML 内容提取）

```bash
# Install
cargo install htmlq        # 或 brew install htmlq

# HTML 内容提取
curl -s "https://example.com/docs" | htmlq "article p" --text
curl -s "https://example.com/page" | htmlq "h1, h2" | head -20
```

### csvkit（CSV 数据分析）

```bash
# Install
brew install csvkit

# CSV 工具
csvstat data.csv                           # 列统计
csvcut -c name,score data.csv              # 选取列
csvgrep -c score -m 90 data.csv            # 过滤高分
csvsort -c score -r data.csv | head -10    # 排序取 top
csvlook data.csv                           # 表格化预览
```

### matplotlib（数据可视化）

```bash
# Install
pip install matplotlib

# 快速图表
python3 << 'EOF'
import matplotlib.pyplot as plt
categories = ['方案A', '方案B', '方案C']
scores = [92, 78, 65]
plt.bar(categories, scores, color=['#2E86AB', '#F18F01', '#A23B72'])
plt.title('方案对比评分')
plt.ylabel('Score')
for i, v in enumerate(scores):
    plt.text(i, v + 1, str(v), ha='center')
plt.savefig('comparison.png', dpi=150, bbox_inches='tight')
print('comparison.png saved')
EOF
```

### Python 数据处理 One-liners

```bash
# 数据过滤
python3 -c "import json; data=json.load(open('data.json')); print(json.dumps([d for d in data if d.get('score',0) > 80], indent=2))"

# 分组统计
python3 -c "
import json; data=json.load(open('results.json'))
from collections import Counter
cats = Counter(d['category'] for d in data)
for cat, count in cats.most_common(): print(f'{cat}: {count}')
"
```
---


---
