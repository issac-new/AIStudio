# R72 全量回归轮台账（FastAPI+SQLAlchemy 典型场景执勤）

> 2026-09-29。场景：swarm-yuan 生成器为典型场景项目（r72-drill-library-api：FastAPI 0.141 + SQLAlchemy 2.1 + Alembic + pytest，22 tests 真实可跑）生成目标技能并执勤三项典型研发工作（新增功能/修 bug/结构变更反馈回路），识别并修复生成器缺陷。
> 演练产物：`/Volumes/nvme2230/lab/r72-drill-library-api`（v0.3.0→v0.5.0，tag 三枚）+ `/Volumes/nvme2230/lab/r72-drill-skills/library-api`（目标技能，mark-active）。

## 一、生成流程执行（⓪-⑨ 全步）

- ⓪ self-check 通过；③骨架 51 文件；框架探测 `fastapi sqlalchemy pytest` 三路信号全中。
- ①.5 relations-extract 18 条 import 边全对（该脚本排除链正确，与特征卡形成对照）。
- ⑤ conf TODO:model 五数组填充 + ⑦.5 框架 glob 填充；mark-active 六道关（占位符/决策留痕/框架空转/路径核验/维度 FAIL 基线）全过。
- ⑥⑦⑧⑨ 全走真：precheck --all（门禁分支保护把 git init 默认 master 正确拦截，改名 main 后临时分支跑绿）；mark-active 后 --all-full 解锁。

## 二、执勤三项研发工作（九节点全流程）

1. **借出/归还生命周期**（feat/borrow-return，v0.4.0）：spec（docs/specs/）→ TDD 红 8 例 → 实现绿 → check_reuse 首次真实执法（§5.5 须 4 checkbox 勾选态，初版表格形态被抓，按模板规范补齐后过）→ 门禁 10/10 → 合入。
2. **copies 重置缺陷修复**（fix/copies-reset，v0.4.1）：spec-first hook 实测三态（无 spec 写源码 deny + 落 gate-audit.jsonl / 有 spec 放行 / 可写区外放行）；勾稽平移 + 409 拒绝。
3. **指纹反馈回路**（feat/overview-report，v0.5.0）：新模块 reports.py+reports 路由 → `--diff` 实证 36→39 文件、scope 精确点名 app/tests → 局部更新清单 → 边集重建 18→24 条 → 维度核验 → 落新基线。

## 三、缺陷清单与修复（全部生成器侧，worktree fix/r72-full-regression）

| # | 级 | 现象（实测锚点） | 根因 | 修复 |
|---|----|------------------|------|------|
| D1 | P3 | `--help` 无分支，落到 `${2:?}` 吐 bash 原生 `line 1320: 2: Usage:` 报错 | 无 help 拦截 | generate-skill.sh 加 `-h/--help` 分支（sed 头注+exit 0） |
| D2a | P1 | extract-feature-cards：backend_files 1510 vs 真实 17、rest 47 vs 10、units 3326——`.venv` 1493 个 .py 全计入 | 六个计数器只排 node_modules（R23-D5 排除链的 Python 形态缺口） | FIND_PRUNE/GREP_EXCLUDES 数组统一排除链，六计数器全接 |
| D2b-1 | P1 | inventory-verify STABILITY_WARN：database.py fan-in 896 | fan-in 两处 grep 无 `.venv` 排除（R56-D4"同族漏修"注释自证先例，本轮第三现） | 两处 grep 补 `--exclude-dir=.venv/venv/site-packages/__pycache__/.tox`；实测 896→8 真实信号 |
| D2b-2 | P1 | DIM_TESTFILES 枚举 42 vs 真实 3 | find 命令无 venv 剪枝 | inventory-dimensions.conf 四条 find 族命令（TESTFILES/FRONTEND_UI/MAPPER_XML/ORM_SCHEMA）补 venv 剪枝；6/6 PASS |
| D2c | P2 | precheck._scan_src 无目录参数时扫 CWD=PROJECT_DIR，.venv 进扫描面；gates _sec_scan/敏感扫描同病 | 排除链纪律只落维度枚举面，未落门禁扫描函数 | _scan_src/_sec_scan/gates-warn 敏感循环三处补 --exclude-dir 全套 |
| D2d | P2 | detect-profile-drift/profile-threshold-survey 文件计数含 .venv（profile 升档偏置） | 同族 | 三处 find 补剪枝 |
| D3 | P2 | conf-render TEST_CMD=`python3 -m pytest`：本轮碰巧系统 user site 装了 fastapi 才假绿；无全局包机器 check_test 必炸且测错环境 | Python else 分支硬编码系统解释器 | 嗅探 `.venv/bin/python`→`venv/bin/python`→`python3` 三级；门禁侧 cd PROJECT_DIR 后 eval，相对路径成立 |
| D6 | P2 | dev-guide 模板/exploration-guide §Step-1/template-spec §8 三处引用 `scripts/mine-habits.sh`，目标技能无此文件（生成器侧独有） | v2.14.2 执勤自包含清单漏了它 | UNIVERSAL_FILES 加 `"scripts/mine-habits.sh|gen|lite"`；--upgrade 实证到位 |

防复发锁：`tests/test-r72-full-regression.sh`（19 断言=4 行为锁 + 1 conf 渲染行为锁 + --help 行为锁 + 9 源码锚 + 4 DIM 剪枝锁 + 分发清单锁）。

## 四、执勤侧过程缺陷（非生成器，纪律沉淀）

1. **管道吞退出码带病收口**：`pytest | tail` 复合命令里 pipefail 缺失，2 例红的提交被 merge+tag（v0.4.1 曾指向带病 merge）。清账：tag 删除、直提撤下、正经分支重合。教训：验证命令必须 `set -o pipefail`；收口五件套前先看退出码本体。
2. **引号地狱三踩**：heredoc/复合引号剥 `{book['id']}` 单引号、bash -c 内嵌 python heredoc 两次炸引号。教训（第三次实证）：一切多行/嵌套引号操作一律 Write 落块文件执行。
3. **C locale 多字节变量名**：`$bf（` 全角括号在 C locale 被并入变量名 → unbound。教训：中文文案里的变量一律 `${bf}` 花括号形态。

## 五、修复后回防（--upgrade 实证）

- worktree 生成器 `--upgrade` 演练技能：mine-habits.sh 到位；fan-in 896→8；特征卡 47→14 端点/3326→28 单元；TESTFILES 6/6 PASS；conf TEST_CMD 对齐 `.venv/bin/python -m pytest`；维度核验全 PASS；门禁 fail 0（规范分支名下 10/10）。
- 清单滞后自抓：研发工作 1/3 新增测试文件未同步 §测试案例（6 vs 4 FAIL）——维度核验按设计抓到，补齐后 6/6。

## 六、验证面

- tests/test-r72-full-regression.sh 19/19 绿。
- run-sweep（测试全量+三 e2e+verifier+self-check）见 CHANGELOG v2.38.0 发布记录。
