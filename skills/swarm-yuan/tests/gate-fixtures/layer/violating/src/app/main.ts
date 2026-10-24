// app 层（最上层）：合规地向下依赖 domain 层
import { createOrder } from '../domain/order';

export function bootstrap(): string {
  return createOrder(1);
}
