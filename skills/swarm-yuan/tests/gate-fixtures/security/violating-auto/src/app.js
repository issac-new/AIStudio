// 违例样本（auto 档回归锁，六轮复盘）：与同级 violating/ 的区别是**避开教科书写法**。
// violating/ 用裸 eval(code) + 裸字符串拼接 SQL——semgrep 的语义规则能匹配，
// 所以即使 auto 档只跑 semgrep 也能抓到，掩盖了"内置规则被短路"的缺陷。
//
// 本样本改用**自定义对象方法**（db.exec / engine.eval）：semgrep 依赖已知类型/框架签名，
// 对未知类型的方法调用匹配不到（实测 --config auto 与 p/java 均 0 命中），
// 而内置模式族（SQL 关键字 + 字符串拼接特征 / eval 词法）能抓到。
//
// 因此本 fixture 锁的是：auto 档下 semgrep 通过后**必须继续跑内置规则**（叠加而非二选一）。
// 修复前本 fixture 会失败（auto 档漏抓 → 退出 0，不符 violating 期望）。
function findUser(req, db) {
  const userInput = req.query.name;
  // 自定义 db 对象方法 + 字符串拼接 → semgrep 匹配不到，内置模式族可抓
  return db.exec("SELECT * FROM users WHERE name = '" + userInput + "'");
}

function runSnippet(req, engine) {
  const code = req.query.code;
  // 自定义 engine 对象的 eval 方法 → semgrep 匹配不到，内置词法可抓
  return engine.eval(code);
}

module.exports = { findUser, runSnippet };
