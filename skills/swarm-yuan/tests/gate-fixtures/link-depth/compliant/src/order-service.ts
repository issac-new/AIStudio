// 真实业务逻辑（非纯转发）：有拼装行为，调用链到此为止
export function loadOrder(id: number): string {
  const prefix = 'order';
  return `${prefix}-${id}`;
}
