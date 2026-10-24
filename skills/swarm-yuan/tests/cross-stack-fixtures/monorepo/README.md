# monorepo 跨栈 fixtures（R48 跨栈同仓回归）

> 位于 tests/cross-stack-fixtures/（非 tests/fixtures/）——后者是「每规则集一个 fixture 目录」的 S12 配对扫描路径，跨栈形态 fixtures 是另一类资产，不参与配对数数。

五栈前后端同仓（子目录工程根）最小形态：goweb / rsfull / pyfull / nodeweb / javaweb。
锚定三类同仓缺陷的回归锁（test-cross-stack-monorepo.sh 消费）：

- 解析基准类：Go go.mod 子目录（G2）、Rust crate 根（G3）、Java 源根（R47-D2）
- 探测类：javaweb/goweb 的 element-ui 包名（R47-D1）
- 命令合成类：conf-render poly 复合命令（G4）

边集期望（relations-extract）：每 fixture 前后端两侧边均非零；javaweb 另含
mapper-binding ≥1、data-mapping ≥1、field-mapping ≥1。
