## 具体操作命令手册

测试执行时按语言/场景选用命令，**每条命令必须真实可执行**——禁止编造测试框架名或参数。

### 1. Python 测试

```bash
# 全量测试 + 覆盖率（终端 + HTML 报告）
pytest -v --cov=src --cov-report=term-missing --cov-report=html

# 只跑名称匹配 test_login 的用例，遇首个失败即停
pytest -x -k 'test_login'

# 并行加速（pytest-xdist，按 CPU 核数自动分配）
pytest -n auto

# 运行时同时执行类型检查（pytest-mypy 插件）
pytest --mypy

# 重复跑同一套件验证稳定性/flaky（pytest-repeat 插件）
pytest --repeat 3
```

### 2. Node.js 测试

```bash
# npm scripts 约定的测试入口 + 覆盖率
npm test -- --coverage

# Vitest（现代 JS/TS 测试框架）带覆盖率
npx vitest run --coverage

# Jest 经典测试框架 + 覆盖率
npx jest --coverage

# Playwright 浏览器端到端测试
npx playwright test

# Cypress 端到端测试
npx cypress run
```

### 3. Go 测试

```bash
# 全量测试 + 竞态检测 + 覆盖率
go test -v -race -cover ./...

# 指定单个测试函数运行
go test -run TestName -v

# 基准测试 + 内存分配统计
go test -bench . -benchmem
```

### 4. Rust 测试

```bash
# 测试输出不打断（--nocapture 显示 println!）
cargo test -- --nocapture

# 单线程运行（排查并发/状态依赖问题）
cargo test -- --test-threads=1

# 基准测试（criterion）
cargo bench

# 覆盖率报告（cargo-tarpaulin，生成 HTML）
cargo tarpaulin --out Html
```

### 5. 集成 / E2E 测试

```bash
# 启动依赖服务并等待就绪
docker compose up -d --wait

# 健康检查
curl -sf http://localhost:8080/health

# Postman Collection 集成测试
newman run collection.json

# k6 负载测试
k6 run load-test.js
```

### 6. 性能测试

```bash
# Apache Bench：固定并发压测
ab -n 1000 -c 100 http://localhost:8080/

# wrk：多线程压测，30 秒持续
wrk -t4 -c100 -d30s http://localhost:8080/

# hey：高并发压测
hey -n 10000 -c 100 https://example.com
```

### 7. 变异测试（Mutation Testing）

```bash
# Python：运行变异测试
mutmut run

# Python：查看变异测试结果摘要
mutmut results

# Rust：自动生成变异体并检测测试覆盖强度
cargo-mutants
```

> **使用原则**：先按项目语言选对应的测试命令跑通基线，再针对 diff 范围做聚焦回归，
> 性能/集成测试仅在验收标准有相关要求时执行，变异测试用于核心逻辑的测试质量抽查。
> 每条命令的真实输出贴进测试报告作为证据，禁止编造结果。

### 8. E2E 浏览器测试

**Playwright CLI**

```bash
# 安装 Playwright
npm init playwright@latest

# 安装浏览器（Chromium, Firefox, WebKit）
npx playwright install

# 运行所有测试
npx playwright test

# 有头模式（查看浏览器操作过程）
npx playwright test --headed

# 指定浏览器
npx playwright test --browser=firefox

# 生成 HTML 报告
npx playwright test --reporter=html

# UI 模式（交互式调试）
npx playwright test --ui
```

**Puppeteer（浏览器自动化）**

```bash
# 安装 Puppeteer
npm install puppeteer

# 运行端到端测试脚本
node e2e-test.js

# 无头模式（默认）
const browser = await puppeteer.launch()

# 有头模式（调试用）
const browser = await puppeteer.launch({ headless: false })

# 生成页面截图
node -e "
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await page.screenshot({ path: 'screenshot.png' });
  await browser.close();
})();
"
```

### 9. 现代负载测试

**Artillery（YAML 配置负载测试）**

```bash
# 安装 Artillery
npm install -g artillery

# 运行 YAML 格式的负载测试
artillery run load-test.yml

# 快速 HTTP 压测（一行命令）
artillery quick --count 100 -n 20 http://localhost:8080/api

# 输出 JSON 报告
artillery run load-test.yml --output report.json

# 查看 HTML 报告
artillery report report.json
```

示例 load-test.yml：
```yaml
config:
  target: "http://localhost:8080"
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - flow:
      - get:
          url: "/api/health"
```

**Locust（Python 负载测试）**

```bash
# 安装 Locust
pip install locust

# 启动 Web UI（默认 http://localhost:8089）
locust -f locustfile.py

# 无头模式（命令行执行）
locust -f locustfile.py --headless -u 100 -r 10 --run-time 5m

# 指定主机
locust -f locustfile.py --host=http://localhost:8080
```

示例 locustfile.py：
```python
from locust import HttpUser, task, between
class WebsiteUser(HttpUser):
    wait_time = between(1, 5)
    @task
    def index(self):
        self.client.get("/")
```

**Gatling（高性能负载测试）**

```bash
# 安装 Gatling（macOS）
brew install gatling

# 列出可用仿真脚本
gatling --list-simulations

# 运行指定仿真
gatling --simulation my.LoadTest

# 生成 HTML 报告
gatling --simulation my.LoadTest --results-folder results/
```

### 10. API 测试

**Postman / Newman（API 测试集合）**

```bash
# 安装 Newman CLI
npm install -g newman

# 运行 Postman Collection
newman run collection.json

# 带环境变量运行
newman run collection.json -e environment.json

# 生成 HTML 报告
newman run collection.json -r htmlextra --reporter-htmlextra-export report.html

# 与数据文件配合（参数化测试）
newman run collection.json -d data.csv

# 在 CI 中运行（安静模式，只输出摘要）
newman run collection.json --reporters cli
```

**restish（CLI API 测试工具）**

```bash
# 安装 restish
brew install restish

# GET 请求
restish https://api.example.com /users

# POST 请求
restish https://api.example.com /users name=John email=john@example.com

# 输出为 JSON（默认）
restish https://api.example.com /users -o json

# 自定义 Headers
restish https://api.example.com /users -H "Authorization: Bearer <token>"
```

**Bruno（现代 API 测试客户端）**

```bash
# 安装 Bruno CLI
npm install -g @usebruno/cli

# 运行 API 集合
bru run --env prod

# 运行单个请求
bru run --env prod --request "Get Users"

# 输出结果
bru run --env prod --output results.json

# 在 CI 中运行
bru run --env ci --reporter-html report.html
```

### 11. 代码覆盖率补充

```bash
# Python coverage（coverage.py）
pip install coverage

# 运行测试并收集覆盖率
coverage run -m pytest

# 生成终端报告
coverage report -m

# 生成 HTML 报告（含行级标注）
coverage html

# XML 报告（CI 集成用）
coverage xml

# 指定源文件范围
coverage run --source=src -m pytest

# 合并多个覆盖率数据（多进程测试用）
coverage combine
```

### 12. Testcontainers（集成测试容器）

```bash
# Python：安装 testcontainers
pip install testcontainers

# 运行测试（自动管理容器生命周期）
python -m pytest tests/integration/

# Node.js：安装 testcontainers
npm install -g @testcontainers/postgresql

# 示例：PostgreSQL 容器化集成测试
python3 -c "
from testcontainers.postgres import PostgresContainer
with PostgresContainer('postgres:16-alpine') as postgres:
    print(f'DB URL: {postgres.get_connection_url()}')
    # 在这里运行需要数据库的测试
"

# Docker Compose 模块（测试用的 Compose 环境）
python3 -c "
from testcontainers.compose import DockerCompose
with DockerCompose('./docker-compose-test.yml') as compose:
    print('Test environment ready')
    # 运行集成测试
"
```
---

---
