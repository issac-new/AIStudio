// payment 上下文内部实现：不应被其他上下文直接引用
export function pay(id: number): string {
  return `paid-${id}`;
}
