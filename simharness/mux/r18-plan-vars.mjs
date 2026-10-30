// r18-plan-vars.mjs — capture-plan.env 规划行 URL 的按轮参数展开（run23 收官批）。
// 单一事实源：r18-frames.mjs 与 tests/r18-plan-var-expand.test.sh 共用本实现，
// 禁在射手内联第二份正则（测试测副本=没测）。
//
// 形态：${VAR}（env 在位且非空→替换）与 ${VAR:-default}（未设/空→default；
// 无 default 且未设→保留字面量，操作者可从 capture-plan.log 看出未注入）。
// 背景：run23 实录 IDE 拍摄位任务号跨轮写死（DEV-PAYCORE-S→t_af224933 手改），
// 换轮忘改即拍出「还没有任务工作区」空态帧冒充血载——参数化后开跑导出
// IDE_TASK=<本轮任务号/卡号> 即免手改 capture-plan.env。
export function expandPlanVars(url, env = process.env) {
  return url.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,
    (m, name, dflt) => (env[name] !== undefined && env[name] !== '' ? env[name]
      : (dflt !== undefined ? dflt : m)))
}
