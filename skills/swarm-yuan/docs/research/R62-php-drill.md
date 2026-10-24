# R62 PHP 换栈演练轮（第九棒）：PHP 生态五面全盲与补齐

> 2026-09-26，"直至全部完成"清单④：第九棒新栈。工具链补装（brew composer 2.10.3）→ 真实项目 **vlucas/phpdotenv**（PHPUnit 280/280 实测，R46 硬前置满足）。
> 结论：PHP 生态**五面全盲**（规则集/探测/提取/命令嗅探/枚举器）——"连在册都没有"的早期形态；全补齐 + 工具链四修 + 机制修。v2.30.0。

## 一、演练实录

1. brew install composer 2.10.3；克隆真实 phpdotenv + composer install + **280 tests/580 assertions OK**。
2. 流A 生成 kb62-phpdotenv：探测信号 0 命中（php/composer 全无）→ ACTIVE_FRAMEWORKS 空 → 门禁注入跳过——五面全盲第一锤。
3. **php 规则集三件套**由子代理按框架三件套模式建成：php.md（12 条五要素规律，5 机械+7 人工）/ php.sh（5 门禁：硬编码密钥 fail + composer.lock 漂移/env 键双源/路由 name 双源/视图变量双源 warn）/ 双态夹具（violating 5/5 检出、compliant 5/5 放行）/ 探测四信号 + 索引重生成 + FACT_FRAMEWORKS 79→80 + golden-vector 重建（81 行零漂移）。
4. 工具链四修（我侧）：PHP 提取分支（use PSR-4 唯一命中 + require/include 相对/__DIR__）+ vendor 排除、composer 命令族嗅探（非改写纪律）、DIM PHP 形态、机制修（一致性测试读 FACT_FRAMEWORKS）。
5. 真实项目行为实测：**phpdotenv 提取出 87 条 PHP import 边**（Dotenv.php→Loader.php 等 PSR-4 解析正确）、conf-render 出 `composer install`/`vendor/bin/phpunit`。

## 二、缺陷与处置

| # | 缺陷 | 处置 | 锁 |
|---|------|------|-----|
| 五面全盲 | php 规则集/探测/提取/嗅探/枚举器全无 | 三件套 + 四修 | 夹具双态 + L1-L6 |
| D2 | PHP use/require 提取缺位；vendor 不排 | PSR-4 唯一命中 + __DIR__ 语义 + vendor 排除 | L1/L2 行为 |
| D3 | composer 命令族无嗅探 | BUILD=composer install / TEST=vendor/bin/phpunit（lock 才 confirmed） | L3 行为 |
| D4 | DIM 无 PHP 形态 | Route::/->get( / *Test.php / *.php | L4 |
| 机制#1 | 一致性测试期望值手抄（新增规则集必改测试） | 读 FACT_FRAMEWORKS 单一事实源 | L5 |
| G20×2 | 自踩两处全角括号紧跟变量 | ${var} 修复（G20 扫描面已含 tests/） | self-check G20 |

**锁战实录**：L2/L5 首跑各抓一真问题（`__DIR__ . '/x.php'` 引号不紧邻 require 的 grep 形态缺口、注释示例字面量触发自家锁）——变异锁灵敏度三度实证；引号地狱三踩（python -c 嵌套转义）改 Write 块文件+行号拼接法。

## 三、留档边界（已知未修）

- SIGNALS 七通道无 composer 依赖字符串匹配（laravel/symfony 子规则集细分需新通道，同 WP-R Bug#3 pom 桶先例）；
- golden-vector（verifier 基线）新增夹具后须手动 rebuild-golden（流程已文档化，自动化留待后续）。

## 四、验证清单

- [x] 280/280 真实基线；php 双态夹具 5/5+5/5；run-framework-fixture.sh php PASS
- [x] test-r62-php-drill-locks 6/6；全量 sweep 零失败；self-check 全绿（80/80 规则集核验、G20 清零、版本三面 v2.30.0）
- [x] phpdotenv 87 边行为实测 + composer 嗅探实测
