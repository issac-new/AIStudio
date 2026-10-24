## 验收
- [ ] <验收项>
EOF
)"

# 审查 PR
gh pr review <PR-NUMBER> --approve --body "LGTM"
gh pr review <PR-NUMBER> --request-changes --body "请修复：<具体问题>"

# 合并 PR
gh pr merge <PR-NUMBER> --squash --delete-branch

# 查看 PR 状态 / CI
gh pr view <PR-NUMBER>
gh pr checks <PR-NUMBER>
```

### 2. Python 构建/测试

```bash
# 安装项目（可编辑模式）
pip install -e .

# 全量测试 + 覆盖率
python -m pytest -v --cov

# 并行快速回归（失败即停）
python -m pytest -n 4 -x

# 单文件/单用例
python -m pytest tests/test_x.py::test_case_a -v

# Lint / 格式化 / 类型检查
ruff check .
ruff format .
mypy .

# 语法快速校验
python -m py_compile src/module.py
```

### 3. Node.js 构建/测试

```bash
# npm
npm install
npm test
npm run build

# 类型检查 + lint + 格式
npx tsc --noEmit
npx eslint .
npx prettier --check .

# pnpm
pnpm install
pnpm test
pnpm build
```

### 4. Rust 构建/测试

```bash
cargo build
cargo test
cargo clippy -- -D warnings
cargo fmt -- --check
```

### 5. Go 构建/测试

```bash
go build ./...
go test ./...
go vet ./...
golangci-lint run
```

### 6. ACP 委托编码

```bash
# 委托给 Claude Code
hermes acp send --agent claude-code --prompt '在 src/api/user.py 实现 create_user()，签名见 doc/api.md，写完后跑 pytest tests/test_user.py'

# 委托给 Codex
hermes acp send --agent codex --prompt '修复 src/auth/token.py 中 refresh_token 过期未续期的 bug，附测试'
```

> Python 调用等价：`acp_send(agent="claude-code", prompt="...", cwd="$HERMES_KANBAN_WORKSPACE")`。

### 7. 代码质量检查

```bash
# Shell 脚本静态检查
shellcheck script.sh
shellcheck scripts/*.sh

# GitHub Actions workflow 校验
actionlint .github/workflows/
```

### 8. 调试

```bash
# Python pdb
python -m pdb src/main.py

# Python 远程调试（DAP/VSCode 连 localhost:5678）
python -m debugpy --listen 5678 -m pytest tests/test_x.py

# Node.js 调试（Chrome DevTools 连 localhost:9229）
node --inspect server.js
node --inspect-brk server.js   # 首行断住
```

> 命令必须真实执行并贴出输出，禁止凭记忆编造结果。不确认参数时查 `--help` 或本手册。

### 9. Pre-commit 钩子管理

```bash
# 安装 pre-commit
pip install pre-commit

# 初始化 .pre-commit-config.yaml
pre-commit sample-config > .pre-commit-config.yaml

# 安装 Git 钩子
pre-commit install

# 对所有文件运行钩子（首次设置用）
pre-commit run --all-files

# 只对暂存文件运行
pre-commit run

# 更新钩子到最新版本
pre-commit autoupdate

# 常用钩子：ruff, mypy, check-yaml, end-of-file-fixer, trailing-whitespace
```

### 10. Commitizen — 约定式提交

```bash
# 安装 commitizen（Python）
pip install commitizen

# 交互式创建提交
cz commit

# 检查提交信息是否符合约定式提交规范
cz check --commit-msg-file <file>

# 检查最近一次提交
cz check --rev-range HEAD~1..HEAD

# 生成 changelog
cz changelog

# 自动 bump 版本号（基于提交类型）
cz bump
```

### 11. Monorepo 管理工具

**Nx（现代 Monorepo 编排）**

```bash
# 安装 Nx CLI
npm install -g nx

# 创建 Nx 工作空间
npx create-nx-workspace@latest my-workspace

# 运行受影响项目的测试
nx affected:test

# 构建指定项目
nx build <project-name>

# 依赖图可视化
nx graph

# 缓存构建产物
nx run-many --target=build --all
```

**Turborepo**

```bash
# 安装 Turborepo
npm install -g turbo

# 运行所有项目的构建（并行 + 缓存）
turbo run build

# 运行 lint + test + build
turbo run lint test build

# 清除缓存
turbo prune --scope=<project> --docker
```

**Lerna**

```bash
# 安装 Lerna
npm install -g lerna

# 初始化 Lerna 仓库
lerna init

# 为所有包安装依赖
lerna bootstrap

# 列出已变更的包
lerna changed

# 发布所有变更的包
lerna publish
```

### 12. Git-cliff — 自动生成 Changelog

```bash
# 安装 git-cliff（macOS）
brew install git-cliff

# 从 Conventional Commits 生成 changelog
git-cliff -o CHANGELOG.md

# 自定义模板
git-cliff -o CHANGELOG.md -c cliff.toml

# 只生成未发布的变更
git-cliff --unreleased -o CHANGELOG.md

# 生成 JSON 格式（供后续处理）
git-cliff -o changelog.json -j
```

### 13. Cookiecutter — 项目脚手架

```bash
# 安装 cookiecutter
pip install cookiecutter

# 从模板创建项目
cookiecutter gh:audreyr/cookiecutter-pypackage

# 从本地模板创建
cookiecutter ~/templates/python-project/

# 指定输出目录
cookiecutter gh:template-repo -o ./output-dir
```

### 14. Copier — 现代项目模板

```bash
# 安装 copier
pip install copier

# 从模板创建项目
copier copy gh:copier-org/autopretty ./my-project

# 更新已有项目到模板最新版本
copier update ./my-project

# 使用 vcs 标记（自动管理 .copier-answers.yml）
copier copy --vcs-ref v1.0 gh:org/template ./dest
```

### 15. Just — 命令运行器

```bash
# 安装 just（macOS）
brew install just

# 创建 Justfile
cat > Justfile << 'EOF'
test:
    pytest -v

lint:
    ruff check .

build:
    docker build -t app .

deploy: build
    docker push app
EOF

# 列出所有可用命令
just --list

# 运行命令
just test

# 带参数运行
just deploy

# 在子目录中查找 Justfile
just --justfile subdir/Justfile test
```

---

---
