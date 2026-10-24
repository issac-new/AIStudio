# R118 全量回归轮——NestJS 缺口栈首测（nest-forge 样例）

> 2026-10-18。用户指令：完整回归（生成典型场景技能 → 基于其做典型研发工作 → 识别修复缺陷 → 验证 → 发版）。
> 载体：nest-forge（回归矩阵缺口族 NestJS 首测）——NestJS 10 + TypeORM + better-sqlite3 + JWT 后端 / Vue3 + Vite + Element Plus + Pinia 前端，54 文件单仓双项目。细节见本文；发版 v2.83.0。

## 一、回归执行面

### 1.1 样例工具链（真实工具链先行）

后端 `nest build` exit 0 + Jest 单测 18/18 + supertest e2e 7/7（内存 SQLite）；前端 `vue-tsc --noEmit && vite build` exit 0 + Vitest 7/7。样例本身在生成流程前先跑绿（造样例过程中修掉 3 处 TS/校验问题：assigneeId null 类型、RegisterDto 缺 @IsOptional、e2e 缺全局拦截器）。

### 1.2 生成流程 Step 1-13 完整闭环

self-check 全绿 → mine-habits 初稿 → 三路并行探查子代理（结构/规范/代码组织，各出锚点报告）→ detect-frameworks 探测 8 框架（vue/element/vite/express/nestjs/typeorm/validation/jest-vitest）→ relations-extract 67 条 import 边 → framework-evidence 台账 → create 骨架（standard 档显式指定，覆盖完整回归面）→ ACTIVE_FRAMEWORKS 落盘 arch.conf:92（R94 修复路径复验通）→ --inject-frameworks（8 框架 sha=1643397259）→ AI 填充全量文件（codebase/reference-manual/dev-guide/release/recipes/framework-knowledge 85 条规律全带项目证据/rules.d project.rules/conf 8 语义变量 + 14 框架 glob）→ 门禁三连修复后 --all fail 0 → 独立审查 review-record 落盘 → memory-writeback 三后端 → --verify-completeness --strict 零占位 → inventory-verify 10 维度全 PASS → --mark-active 激活 → --all-full fail 0。

### 1.3 典型研发工作（九节点 × 2）

- **Task A（feature）dueDate**：数据模型变更配方实战（四查传播：import 边反查/契约面定位/无 job/对外契约核）。TDD 双端红→绿（后端单测 12→14、e2e 3→6；前端 7 用例含真实 Element Plus 渲染断言）。门禁执法实录：check_reuse 逮出 spec §5.5 复用声明未勾选（0/4）→ 补齐四勾后过。
- **Task B（fix）RolesGuard 接线**：探查报告发现的真实缺陷（@Roles('admin') 元数据挂了但守卫全仓零注册——member 可枚举全部用户）。诊断回路红→绿：e2e 红锚（member 200）→ 一行装配修复 → member 403/admin 200。**回路中暴露第二个真实潜伏缺陷**：findByUsername 用了 FindOneOptions 不存在的 addSelects 键（被 TypeORM 静默忽略），passwordHash 恒 undefined → 注册后登录恒 401（此前 e2e 从未覆盖 login 链路）——修为 QueryBuilder addSelect + register→login 往返回归锚。状态机全周期（init→design→build→verify→archive，evidence 挂 gate-run 引用）。
- 反馈回路：reference-manual 四条目就地更新（RolesGuard 已接线/findByUsername 修复注记/测试锚补齐）+ project-fingerprint --write 落新基线。

## 二、发现并修复的生成器缺陷（6 项，全部带样例实证锚点）

| # | 缺陷 | 实证 | 修复 |
|---|------|------|------|
| D1 | @types/* 类型包被当框架信号——@nestjs/platform-fastify 项目也常带 @types/express（生态传递依赖），express 规则集经类型包误激活 | nest-forge 无任何直接 express 代码，detect 输出含 express；verbose 明细命中源=@types/express | pkgjson 桶统一剔除 @types/*（python3 主路径 + 无 python 降级路径双修）+ 补 @nestjs/platform-express / @nestjs/platform-fastify 真实平台适配器信号（scripts/detect-frameworks.sh） |
| D2 | framework-evidence 自动探测路径 sed 's/.*"\([^"]*\)".*/\1/p' 贪婪匹配，多框架 ACTIVE_FRAMEWORKS 只捕获最后一个——证据台账静默缩水为单框架 | nest-forge 8 框架只出 jest-vitest（13 行）；显式 --frameworks 后 101 行全出 | 逐 token 提取（剥前缀/括号/引号→tr 切列→逗号重组）（scripts/framework-evidence.sh:31-42） |
| D3 | SENSITIVE_EXCLUDE_GLOBS 项目级豁免只被 gitleaks 子路径消费，内置正则族路径零消费且其 test 排除词只按行内容过滤不看路径——测试夹具密码在内置路径必然 fail 且 conf 无法豁免 | auth.service.spec.ts 夹具密码（super-secret-1）：登记豁免后 gitleaks 路径不报、内置路径照 fail | 内置路径对齐 gitleaks 两层排除（测试文件路径正则 + SENSITIVE_EXCLUDE_GLOBS 精确豁免）（assets/gates-warn.sh check_sensitive） |
| D4 | ENUM_ZERO_DIM 噪音：§8/§9 共享锚点行计数，非 Java 项目"MyBatis mapper XML/ORM schema"枚举 0 但清单行来自他维度溢出——每次核验都产出"枚举器可能漏报"复核噪音 | nest-forge 两条 ENUM_ZERO_DIM（清单 12/22 行全为溢出，维度真为空——TypeORM synchronize 无迁移资产） | 注册表新增 ZERO_HINT 维度形态特征（数据驱动）；清单行无一命中 hint → 报"维度真空确认"信息行，命中才保留原警讯（scripts/inventory-verify.sh + assets/inventory-dimensions.conf） |
| D5 | check_domain 客观规律检测的 _scan_src 排除词表不含 .spec./.test. 路径形态（grep -v 作用于含路径整行但词表只认 test/mock 词）——*.spec.ts 夹具密码命中"明文存储"硬 fail，与 D3 同族双报 | 同一批夹具密码：sensitive 门禁修后 domain 门禁接着 fail（--all-full 首跑） | 3a 密码/3b SQL 两处排除词表补 \.spec\./\.test\./\.e2e-spec\. 路径形态（assets/gates-warn.sh check_domain） |
| D6 | extract-feature-cards 前端组件计数只数顶层 export 语句——Vue3 `<script setup>` SFC 无顶层 export，纯 script-setup 项目 frontend_components 恒 0，特征卡 #11 统计失真 | nest-forge 4 个 .vue 组件报 0 | .vue 按文件计（SFC 即组件）+ .jsx/.tsx 保持 export 计（scripts/extract-feature-cards.sh） |

未修登记（改进候选）：check_domain 的 spec 存在性子项 skip_if_unconfigured 使"整体执行且通过"的门禁在汇总计入"跳过（未配置）"——部分跳过语义需设计决策，本轮如实记档不改。

## 三、三门禁（全绿）

- run-sweep：66 项 65 通过 + 1 项竞态后复验通过——test-r75 L10（发版三面 badge 同步锁）在后台 sweep 与前台升版操作并发时读到徽章旧值（2.82.0）与 CHANGELOG 新头（2.83.0）的混合态；升版完成后单跑 test-r75 全绿（16/0，L10 三面 2.83.0 一致）。其余 65 项首跑全绿（含 e2e/gen-e2e/fieldchange-e2e/verifier-all/self-check）。
- self-check --check-only：exit 0（复杂度预算 56 门禁/185 变量/185702B 上下文全内；UNIVERSAL_FILES 576370B ≤ 577536B 预算内，无需登记）。
- test-r68-jargon-free：17/0 首跑即绿（本轮新增文本零违例）。

## 四、回归矩阵登记

nest-forge（NestJS 全栈）入矩阵：NestJS 缺口族首测。剩余缺口族：Flutter、NestJS 复测（本轮已首测）之外的移动端族。
