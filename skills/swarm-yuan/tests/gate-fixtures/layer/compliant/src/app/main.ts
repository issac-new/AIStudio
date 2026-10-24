// app 层（最上层）：单向依赖下方 domain 与 infra 层
import { createOrder } from '../domain/order';
import { connect } from '../infra/db';

export function bootstrap(): string {
  connect();
  return createOrder(1);
}
