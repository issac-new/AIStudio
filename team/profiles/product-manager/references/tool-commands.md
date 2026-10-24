## 具体操作命令手册

### Linear（项目管理）

```bash
# Install
brew install linear

# Key commands
linear issue list --team "Engineering"           # 列出团队所有 Issue
linear issue create --team "Engineering" --title "..." --description "..." --priority high
linear issue update --id <issue-id> --state "In Progress"
linear issue search --query "feature"            # 按关键词搜索 Issue
linear team list                                 # 列出所有团队
linear project list                              # 列出所有项目
```

### Notion（知识库管理）

```bash
# Install (ntn CLI)
pip install notion-cli

# 或者 Python SDK
pip install notion-client

# Key commands (ntn)
ntn list databases                              # 列出所有数据库
ntn query <database-id>                         # 查询数据库
ntn create page --parent <parent-id> --title "PRD: ..."

# Python SDK
python3 -c "
from notion_client import Client
notion = Client(auth='<token>')
db = notion.databases.query('<database-id>')
print(len(db['results']), 'pages found')
"
```

### Google Workspace（表格与文档）

```bash
# Install
pip install gws

# Google Sheets
gws sheets list                                 # 列出所有表格
gws sheets read <spreadsheet-id> --range "A1:D10"
gws sheets write <spreadsheet-id> --range "A1" --values "Title,Priority,Status"

# Google Docs
gws docs list                                   # 列出所有文档
gws docs create --title "PRD: ..." --text "..."
```

### Pandoc（文档格式转换）

```bash
# Install
brew install pandoc

# Markdown → PDF / HTML / DOCX
pandoc prd.md -o prd.pdf
pandoc prd.md -o prd.html
pandoc prd.md -o prd.docx
pandoc report.md -o report.epub                 # EPUB 电子书
```

### date / gdate（日期计算）

```bash
# macOS 用 gdate (brew install coreutils)
gdate -d "+2 weeks" "+%Y-%m-%d"                # N 周后的日期
gdate -d "2025-07-15 - 3 days" "+%Y-%m-%d"    # 日期加减
python3 -c "
from datetime import date
d1 = date(2025, 7, 1); d2 = date(2025, 8, 15)
print(f'里程碑间隔: {(d2 - d1).days} 天')
"
```

### xlsxwriter（Excel 报告）

```bash
# Install
pip install xlsxwriter

# 生成带格式的 Roadmap 表格
python3 << 'EOF'
import xlsxwriter
wb = xlsxwriter.Workbook('roadmap.xlsx')
ws = wb.add_worksheet('需求清单')
bold = wb.add_format({'bold': True, 'bg_color': '#4472C4', 'font_color': 'white'})
ws.write('A1', 'ID', bold); ws.write('B1', '需求', bold)
ws.write('C1', '优先级', bold); ws.write('D1', '状态', bold)
rows = [['R1','用户登录优化','P0','开发中'],['R2','搜索增强','P1','评审中']]
for i, r in enumerate(rows, 2):
    for j, v in enumerate(r):
        ws.write(i-1, j, v)
wb.close()
print('roadmap.xlsx generated')
EOF
```

### GitHub CLI（Issue/PR 管理）

```bash
# Install
brew install gh && gh auth login

# Issues
gh issue list --label "product"                 # 产品相关 Issue
gh issue create --title "..." --body "..." --label "feature"

# Pull Requests
gh pr list --state open                         # 打开的 PR
gh pr review <pr-number> --approve              # 审批
```

### markdownlint（PRD 质量检查）

```bash
# Install
npm install -g markdownlint-cli

# Usage
markdownlint prd.md                             # 检查格式
markdownlint prd.md --fix                       # 自动修复
```
---


---
