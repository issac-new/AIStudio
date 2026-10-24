// domain 层：纯业务，不 import 任何框架/ORM/IO，也不依赖其他层
export function createOrder(id: number): string {
  return `order-${id}`;
}
