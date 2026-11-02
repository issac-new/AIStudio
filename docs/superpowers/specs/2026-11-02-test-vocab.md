# 测试词汇规范（受控动词表＋步骤动词可溯源）

> 来源：MTSC2026《AI Native 测试工程实践》吸收轮批 3-F。文章坑 3：「同一个操作十种说法」——「获取/找到/读取货位」同义散用导致无法定位方法、无法跨用例比对。本仓现状：simharness glossary.txt 94 条治理推演叙事词汇，测试用例动词无受控表；spec §19.2 用例名与步骤动词自由发挥。

## 变更

1. **`simharness/mux/glossary.txt` 追加测试动词段**（沿用五字段协议：term:verb-* 条目）六个标准动词，别名列登记禁用同义词：
   - `term:verb-query 查询`（别名：获取,找到,读取,检索 → 一律用「查询」）
   - `term:verb-verify 验证`（别名：检查,确认,校验,断言一下 → 用「验证」）
   - `term:verb-construct 构造`（别名：创建,准备,生成,造数 → 用「构造」）
   - `term:verb-wait 等待`（别名：轮询,等到,休眠 → 用「等待」）
   - `term:verb-clean 清理`（别名：回收,还原,重置,teardown → 用「清理」）
   - `term:verb-assert 断言`（别名：期望,应当,应该等于 → 用「断言」）
   归属=测试（与推演叙事词区分）；「断言」与「验证」分工：断言=写进测试代码的期望值检查，验证=执行后的状态确认。
2. **`skills/swarm-yuan/assets/spec-template.md` §19.2 表前注记**：用例名与 Given/When/Then 步骤动词用受控动词表（glossary term:verb-* 六词），步骤动词应可溯源到被测方法/DSL 件（查询↔读接口、等待↔waitFor、清理↔Teardown——与批 A DSL 件名对齐）。
3. **守门**：`skills/swarm-yuan/tests/test-spec-template-maet.sh` 扩态 7——断言 glossary 六动词条目存在（term:verb-query…verb-assert）且模板注记在位（防两处漂移）。
4. `skills/swarm-yuan/CHANGELOG.md` v2.98.5 记一行。

## 决策记录

1. **动词表落 glossary.txt 而非新文件**：单一事实源——glossary 已是「标准名+别名+定义」协议载体且被推演链消费（mx-report-gen/审计器），测试动词并表加 `term:verb-` 前缀域隔离，不造第二张表。
2. **六个词不多不少**：覆盖测试步骤的全部动作语义（读/判/建/等/清/期），再多=记忆负担大于收益；遇第七类动作语义再增补（词条协议支持）。
3. **「断言/验证」显式分工入定义**：两者最易混（都像「检查」），不分工则同义治理空转。
4. **模板注记而非门禁拦截**：动词规范是写作纪律，机械拦截会误伤自然语言上下文（如引用原文含「获取」）；守门锁「表存在+注记在位」的结构面。
5. **DESIGN_SYNC: none**——词汇治理面，不触正本数字。

## 验证

- `bash skills/swarm-yuan/tests/test-spec-template-maet.sh`（扩态 7 绿+存量六态无回归）
- glossary 五字段格式合法性：字段数断言（扩态内含）

## 设计文档影响

DESIGN_SYNC: none——glossary 词条追加（协议不变）；技能 CHANGELOG v2.98.5 随批。
