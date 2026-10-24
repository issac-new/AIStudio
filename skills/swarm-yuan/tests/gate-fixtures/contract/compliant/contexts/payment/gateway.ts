// payment 上下文内部实现：只被 ACL 适配器引用（ACL 不属于 CONTEXT_DIRS，其 import 不受限）
export function pay(id: number): string {
  return `paid-${id}`;
}
