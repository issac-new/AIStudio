// 纯转发函数堆叠：每个函数体只有 return 下一跳调用，无任何业务逻辑（链路膨胀信号）
// 单行书写以命中兜底统计的正则（function\s+\w+\([^)]*\)\s*\{\s*return\s+\w+\(...\)\s*;?\s*\}）
export function step1() { return step2(); }
export function step2() { return step3(); }
export function step3() { return step4(); }
export function step4() { return step5(); }
export function step5() { return step6(); }
export function step6() { return step7(); }
export function step7() { return step8(); }
export function step8(): number {
  return 0;
}
