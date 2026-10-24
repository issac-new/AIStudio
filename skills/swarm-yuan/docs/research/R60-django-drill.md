# R60 Django 换栈演练轮：Python/Django 生态首执勤

> 2026-09-25，"需要 继续"接续三向后的第四向：新栈执勤。栈=Python 3.14 + Django（从未执勤生态；R28 仅 flask 轻栈）。
> 项目：**真实开源 django-todo**（shacker/django-todo，可复用 app：models/views/forms/templates/admin/migrations/factories，pytest 43/43 实测全绿，Django 6.1.1 venv 全链真实可跑——R46 硬前置满足）。
> 结论：流A 生成 + mark-active 全流程通过；审计产出 **16 类字符串耦合机械全盲面 + 11 条生成器缺陷（A1-A11）**；A1-A7/A10 七修 + 十六类清单产品化 + 9 断言变异锁。v2.28.0。

## 一、演练实录

1. 克隆真实开源项目 + venv + 依赖实装（factory-boy/titlecase/bleach/django-autocomplete-light/html2text）→ **43 passed** 真实测试基线。
2. 流A：generate-skill kb60-django-todo + relations-extract + conf-render + --inject-frameworks（django 规则集在册探测命中）；填充由子代理完成（47 构件/20 接口/8 页面三角/21 行字段映射台账/悬置清单 6 项）；**verify-completeness --strict exit 0 + mark-active → status: active**。
3. 审计双线：**16 类字符串耦合机械全盲**（relations.jsonl 只有 Python import 边——模板字段/URL 名/POST 参数/admin 注册/CSV 列头/工厂字段/settings 键/邮件线程 ID/迁移双源等全在机械面外，与 Java/MyBatis 的 mapper XML 防线形成鲜明对照）+ **11 条生成器缺陷**。

## 二、缺陷与处置

| # | 缺陷 | 处置 |
|---|------|------|
| A1 | relations-extract 排除链同族漏修（Java 链有 .venv、Python 链没有；实测 96% 边是 _pytest 噪声） | 全链清剿 .venv/venv/__pycache__/.tox + 行为锁 |
| A2 | uv 嗅探 `uv run build` 双缺陷（脚本未必存在 + 按锁改写 venv 降版本——实测 Django 6.1.1→6.1） | 非改写口径（compileall + `uv run --no-sync`） |
| A3 | check_layer/领域污染 import 提取只认引号形态 → Python 分层门禁空转 | 引号可选 |
| A4 | django secret_key 查无测试夹具豁免 | 对齐 debug 查豁免口径 |
| A5 | DEBUG 查漏元组形态 `DEBUG = (True,)` | 正则补可选括号 |
| A6 | DIM 枚举器 Django 盲区（models.Model/path()/函数视图/commands） | 留档（清单层已由十六类清单覆盖） |
| A7 | DIM 排除链漏 .venv + controller 正则无词边界（router.allow 假阳性 45/47） | 排除链 + 词尾边界 |
| A8 | 模型↔迁移双源仅 warn、makemigrations --check 未接线 | 留档待办 |
| A9/A11 | README 死键/双型模板上下文 | 项目级语义，悬置清单承载 |
| A10 | 同名测试匹配不适配 Python 惯例命名 → 8 假告警 | test_ 前缀/测试目录/<base>_test 族 |

## 三、十六类产品化（跨栈清剿范式）

frameworks/django.md 新增 §字符串耦合面清单（十六类表格化，带典型锚点）+ exploration-guide Python 节指针 + spec-template 四查①"该栈等价耦合面清单"指针——**按栈建立等价清单自此有范式**（其他生态照此补）。

## 四、验证清单

- [x] 43/43 真实测试基线；mark-active → status: active
- [x] test-r60-django-drill-locks 9/9（L1 行为锁 + L2-L8 源码/文本锁）
- [x] 全量 sweep 零失败；self-check 全绿（三件套 189924B≤190464B、artifact 483421B≤487424B 均在登记限内）
- [x] A8/A9/A11 留档（悬置清单/待办清单如实标注）
