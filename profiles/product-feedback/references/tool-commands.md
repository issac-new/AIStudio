## 具体操作命令手册

### app-store-scraper（应用商店评论抓取）

```bash
# Install
pip install app-store-scraper

# 抓取 App Store 评论
python3 << 'EOF'
from app_store_scraper import AppStore
app = AppStore(country="cn", app_name="wechat", app_id=414478124)
app.review(how_many=50)
for r in app.reviews:
    print(f"[{r['rating']}★] {r['title']}")
EOF

# Google Play 评论
python3 << 'EOF'
from google_play_scraper import reviews_all
result = reviews_all('com.example.app', count=100)
for r in result[:5]:
    print(f"[{r['score']}★] {r['content'][:80]}")
EOF
```

### vaderSentiment（情感分析）

```bash
# Install
pip install vaderSentiment

# 批量情感分析
python3 << 'EOF'
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
analyzer = SentimentIntensityAnalyzer()
feedbacks = ["产品很好用，推荐！", "经常崩溃，体验很差", "功能一般，但够用"]
for fb in feedbacks:
    scores = analyzer.polarity_scores(fb)
    label = "正" if scores['compound'] > 0.05 else ("负" if scores['compound'] < -0.05 else "中")
    print(f"[{label}] {fb} (compound={scores['compound']:.2f})")
EOF
```

### pandas + nltk（反馈文本分析）

```bash
# Install
pip install pandas nltk
python3 -c "import nltk; nltk.download('punkt_tab'); nltk.download('stopwords')"

# 关键词提取
python3 << 'EOF'
import pandas as pd
from collections import Counter
fb = [{"text": "加载太慢了，崩溃频繁", "source": "app_store"},
      {"text": "新功能很好用，点赞", "source": "community"},
      {"text": "登录闪退，急死人了", "source": "ticket"}]
df = pd.DataFrame(fb)
words = ' '.join(df['text']).split()
for w, c in Counter(words).most_common(10):
    print(f"  {w}: {c}")
EOF
```

### csvkit（CSV 反馈数据处理）

```bash
# Install
brew install csvkit

# Key commands
csvcut -c rating,date,content feedbacks.csv       # 选取列
csvgrep -c rating -m 1 feedbacks.csv              # 过滤低分
csvstat feedbacks.csv                              # 列统计
csvlook feedbacks.csv                              # 表格化查看
csvsort -c rating feedbacks.csv | head -20         # 按评分排序
```

### jq（JSON 反馈数据）

```bash
# Install
brew install jq

# 处理反馈 JSON
cat feedbacks.json | jq '[.reviews[] | {rating, text}] | group_by(.rating) | .[] | {rating: .[0].rating, count: length}'

# NPS 贬损者计数
cat nps_results.json | jq '[.responses[] | select(.score <= 6)] | length'
```

### xlsxwriter（反馈报告）

```bash
# Install
pip install xlsxwriter

# NPS 趋势表
python3 << 'EOF'
import xlsxwriter
wb = xlsxwriter.Workbook('nps_trend.xlsx')
ws = wb.add_worksheet('NPS Trend')
bold = wb.add_format({'bold': True, 'bg_color': '#2E86AB', 'font_color': 'white'})
ws.write('A1', 'Month', bold); ws.write('B1', 'NPS', bold); ws.write('C1', 'Sample', bold)
data = [('2025-01', 42, 320), ('2025-02', 38, 295), ('2025-03', 31, 410)]
for i, (m, n, s) in enumerate(data, 2):
    ws.write(i-1, 0, m); ws.write(i-1, 1, n); ws.write(i-1, 2, s)
wb.close()
print('nps_trend.xlsx generated')
EOF
```

### TextBlob（NLP 分析）

```bash
# Install
pip install textblob

# 情感极性分析
python3 -c "
from textblob import TextBlob; tb = TextBlob('The new feature is amazing')
print(f'polarity={tb.sentiment.polarity:.2f}, subjectivity={tb.sentiment.subjectivity:.2f}')
"
```

### NPS 快速计算

```bash
# NPS = 推荐者(9-10)% - 贬损者(0-6)%
python3 -c "
scores = [9,8,10,6,7,9,8,4,10,5,9,7,8,3,9]
p = sum(1 for s in scores if s >= 9)
d = sum(1 for s in scores if s <= 6)
print(f'NPS = {round((p-d)/len(scores)*100)} (N={len(scores)})')
"
```
---


---
